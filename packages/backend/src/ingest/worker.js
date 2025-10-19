import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import knex from '../../db/knexClient.js';
import parseEMS from './emsParser.js';

const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
const POLL_MS      = Number(process.env.POLL_INTERVAL_MS || 5000);

// Optional toggle to disable auto-creating claims from ingest
const CLAIM_AUTOCREATE = process.env.CLAIM_AUTOCREATE !== '0';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function listInbox() {
  try {
    const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && /\.(ems|xml)$/i.test(e.name))
      .map(e => e.name);
  } catch {
    return [];
  }
}

async function moveToArchive(srcFullPath, storedName) {
  const destDir = ARCHIVE_DIR;
  await ensureDir(destDir);
  const dest = path.join(destDir, storedName);
  await fs.rename(srcFullPath, dest).catch(async (e) => {
    if (e?.code === 'EXDEV') {
      const buf = await fs.readFile(srcFullPath);
      await fs.writeFile(dest, buf, { flag: 'wx' });
      await fs.unlink(srcFullPath);
    } else {
      throw e;
    }
  });
  return dest;
}

async function upsertCccFile({ original_name, stored_path, size_bytes, sha256sum }) {
  // Insert if not present; if present, return existing row
  const existing = await knex('ccc_files').select('*').where({ sha256: sha256sum }).first();
  if (existing) return existing;

  const [row] = await knex('ccc_files')
    .insert({
      original_name,
      stored_path,
      size_bytes,
      sha256: sha256sum,
      processed_at: knex.fn.now(),
    })
    .returning(['id', 'original_name', 'stored_path', 'size_bytes', 'sha256', 'processed_at']);
  return row || { id: row };
}

async function saveCccMetadata(file_id, meta) {
  // Upsert by file_id
  const exists = await knex('ccc_metadata').select('file_id').where({ file_id }).first();
  const payload = {
    file_id,
    claim_number: meta?.claim_number || null,
    vin: meta?.vin || null,
    ro_number: meta?.ro_number || null,
    customer_name: meta?.customer_name || null,
    total_amount: meta?.total_amount ?? null,
    raw_json: meta ? JSON.stringify(meta) : null,
  };
  if (exists) {
    await knex('ccc_metadata').update(payload).where({ file_id });
  } else {
    await knex('ccc_metadata').insert(payload);
  }
}

async function linkOrCreateClaimFromMeta(meta, fileRow, originName) {
  if (!meta?.claim_number) return null;

  // Try to find claim by claim_number
  const existing = await knex('claims').select('id').where({ claim_number: meta.claim_number }).first();
  let claimId = existing?.id || null;

  if (!claimId && CLAIM_AUTOCREATE) {
    const [created] = await knex('claims')
      .insert({
        claim_number: meta.claim_number,
        status: 'new',
      })
      .returning(['id']);
    claimId = created?.id ?? created;

    await knex('workflow_events').insert({
      claim_id: claimId,
      type: 'claim_created_from_ingest',
      detail: JSON.stringify({ source_file_sha: fileRow.sha256, original_name: originName }),
    });
  }

  if (claimId) {
    await knex('ccc_files').update({ claim_id: claimId }).where({ id: fileRow.id });
    await knex('workflow_events').insert({
      claim_id: claimId,
      type: 'ccc_file_linked',
      detail: JSON.stringify({ ccc_file_id: fileRow.id, original_name: originName }),
    });
  }

  return claimId;
}

async function processOne(filename) {
  const full = path.join(INCOMING_DIR, filename);
  const buf = await fs.readFile(full);
  const size = buf.length;
  const sum = sha256(buf);

  // Store in archive with sha prefix to avoid collisions
  const storedName = `${sum.slice(0, 8)}_${filename}`;
  const archivedPath = await moveToArchive(full, storedName);

  // Persist ccc_files (idempotent by sha256)
  const fileRow = await upsertCccFile({
    original_name: filename,
    stored_path: archivedPath,
    size_bytes: size,
    sha256sum: sum,
  });

  // Parse metadata
  let meta = null;
  try {
    meta = await parseEMS(buf);
  } catch (e) {
    // still keep the file record; metadata can be null
    await knex('workflow_events').insert({
      claim_id: null,
      type: 'ccc_parse_error',
      detail: JSON.stringify({ error: String(e?.message || e), file_id: fileRow.id, original_name: filename }),
    });
  }

  // Save metadata (even if partial)
  await saveCccMetadata(fileRow.id, meta);

  // Try to link/create claim by claim_number
  await linkOrCreateClaimFromMeta(meta, fileRow, filename);
}

async function tick() {
  const list = await listInbox();
  for (const name of list) {
    try {
      await processOne(name);
    } catch (e) {
      // log and continue
      await knex('workflow_events').insert({
        claim_id: null,
        type: 'ccc_ingest_error',
        detail: JSON.stringify({ error: String(e?.message || e), original_name: name }),
      });
    }
  }
}

export default function startCccIngestWorker() {
  console.log(`[ccc-ingest] watching ${INCOMING_DIR} -> archiving to ${ARCHIVE_DIR} (every ${POLL_MS}ms)`);
  ensureDir(INCOMING_DIR).catch(() => {});
  ensureDir(ARCHIVE_DIR).catch(() => {});
  const timer = setInterval(tick, POLL_MS);

  return () => {
    clearInterval(timer);
  };
}
