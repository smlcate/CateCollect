import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseCCCFile } from './emsParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Start a background poller that:
 * - scans INCOMING_DIR for .ems/.xml
 * - dedupes by checksum
 * - stores file + metadata rows
 * - moves file to ARCHIVE_DIR
 */
export function startCccIngestWorker({
  knex,
  incomingDir = path.join(__dirname, '../../..', 'data', 'incoming'),
  archiveDir  = path.join(__dirname, '../../..', 'data', 'archive'),
  intervalMs = Number(process.env.POLL_INTERVAL_MS || 5000),
  logger = console,
}) {
  let running = false;
  let stop = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      await ensureDir(incomingDir);
      await ensureDir(archiveDir);

      const names = await fs.readdir(incomingDir);
      for (const name of names) {
        if (stop) break;

        const full = path.join(incomingDir, name);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat?.isFile()) continue;

        const ext = path.extname(name).toLowerCase();
        if (!['.ems', '.xml'].includes(ext)) continue;

        const checksum = await sha256(full);
        const exists = await knex('ccc_files').select('id').where({ checksum }).first();
        if (exists) {
          // already processed — archive to keep inbox tidy
          const dest = path.join(archiveDir, name);
          await fs.rename(full, dest).catch(async () => {
            await fs.rename(full, path.join(archiveDir, `${Date.now()}_${name}`)).catch(() => {});
          });
          continue;
        }

        // Insert file row
        const [fileId] = await knex('ccc_files')
          .insert({
            original_name: name,
            stored_path: full, // path pre-archive (for traceability)
            checksum,
            size_bytes: stat.size,
            ext: ext.slice(1),
            processed_at: knex.fn.now(),
          })
          .returning('id');

        // Parse metadata (best-effort)
        try {
          const meta = await parseCCCFile(full);
          await knex('ccc_metadata').insert({
            file_id: Array.isArray(fileId) ? fileId[0].id ?? fileId[0] : fileId.id ?? fileId,
            claim_number: meta.claim_number,
            customer_name: meta.customer_name,
            vehicle_vin: meta.vehicle_vin,
            total_amount: meta.total_amount,
            raw_preview: meta.raw_preview,
          });
        } catch (e) {
          await knex('ccc_files')
            .where({ id: Array.isArray(fileId) ? fileId[0].id ?? fileId[0] : fileId.id ?? fileId })
            .update({ error: e?.message || String(e) });
        }

        // Move to archive
        const dest = path.join(archiveDir, name);
        await fs.rename(full, dest).catch(async () => {
          await fs.rename(full, path.join(archiveDir, `${Date.now()}_${name}`)).catch(() => {});
        });

        logger.log(`[ccc-ingest] processed ${name} (id=${Array.isArray(fileId) ? fileId[0]?.id ?? fileId[0] : fileId?.id ?? fileId})`);
      }
    } catch (e) {
      logger.error('[ccc-ingest] worker error:', e);
    } finally {
      running = false;
    }
  }

  (async () => {
    while (!stop) {
      await tick();
      await sleep(intervalMs);
    }
  })();

  return () => { stop = true; };
}
