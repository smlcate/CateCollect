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
  intervalMs  = Number(process.env.POLL_INTERVAL_MS || 5000),
  logger = console,
}) {
  let stop = false;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      await ensureDir(incomingDir);
      await ensureDir(archiveDir);

      const entries = await fs.readdir(incomingDir, { withFileTypes: true });
      const candidates = entries
        .filter(e => e.isFile() && /\.(ems|xml)$/i.test(e.name))
        .map(e => e.name);

      for (const name of candidates) {
        const full = path.join(incomingDir, name);

        // Hash for dedupe
        const sum = await sha256(full);
        const exists = await knex('ccc_files').select('id').where({ sha256: sum }).first();
        if (exists) {
          logger.log(`[ccc-ingest] skip duplicate ${name} (${sum.slice(0,8)})`);
          // archive anyway to keep inbox clean
          const archived = path.join(archiveDir, `${sum.slice(0,8)}_${name}`);
          await fs.rename(full, archived).catch(async (e) => {
            if (e?.code === 'EXDEV') {
              const data = await fs.readFile(full);
              await fs.writeFile(archived, data, { flag: 'wx' });
              await fs.unlink(full);
            } else { throw e; }
          });
          continue;
        }

        // Move to archive first (atomic-ish)
        const archived = path.join(archiveDir, `${sum.slice(0,8)}_${name}`);
        await fs.rename(full, archived).catch(async (e) => {
          if (e?.code === 'EXDEV') {
            const data = await fs.readFile(full);
            await fs.writeFile(archived, data, { flag: 'wx' });
            await fs.unlink(full);
          } else { throw e; }
        });

        const stats = await fs.stat(archived);
        const size = stats.size;

        // Insert ccc_files row
        const fileId = await knex('ccc_files')
          .insert({
            original_name: name,
            stored_path: archived,
            size_bytes: size,
            sha256: sum,
            processed_at: knex.fn.now(),
          })
          .returning(['id']);

        // Parse metadata (best-effort)
        try {
          const meta = await parseCCCFile(archived);
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
            .where({ id: Array.isArray(fileId) ? fileId[0]?.id ?? fileId[0] : fileId?.id ?? fileId })
            .update({ notes: '[parser-error] ' + (e?.message || String(e)) });

          await knex('workflow_events').insert({
            claim_id: null,
            type: 'ccc_parse_error',
            detail: JSON.stringify({ error: String(e?.message || e), original_name: name }),
          });
        }

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
