// packages/backend/src/ingest/worker.js
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import knex from '../../db/knexClient.js';

// Parser import: support either `export function parseEMS` or `export default`
import * as EMS from './emsParser.js';
const parseEMS = EMS.parseEMS || EMS.default;

// Optional event logger (safe if file exists; no-op fallback if not)
let logEvent = async () => {};
try {
  const { logEvent: realLog } = await import('./logEvent.js').catch(() => ({}));
  if (typeof realLog === 'function') logEvent = realLog;
} catch { /* ignore */ }

// ----------- Configuration -----------
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
const POLL_MS      = Number(process.env.POLL_INTERVAL_MS || 5000);

// Toggle to auto-create claims from parsed data (1=on, 0=off)
const CLAIM_AUTOCREATE = process.env.CLAIM_AUTOCREATE !== '0';

// Allowed ingestable file extensions (case-insensitive)
const INGEST_EXTS = new Set(['.ems', '.xml']);

// ----------- Helpers -----------
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
      .filter(e => e.isFile())
      .map(e => e.name);
  } catch {
    return [];
  }
}

function extOf(filename) {
  return path.extname(filename || '').toLowerCase();
}

async function moveToArchive(srcFullPath, storedName) {
  const destDir  = ARCHIVE_DIR;
  const destPath = path.join(destDir, storedName);
  await ensureDir(destDir);
  await fs.rename(srcFullPath, destPath).catch(async () => {
    // cross-device or other failure: copy then unlink
    await fs.copyFile(srcFullPath, destPath);
    await fs.unlink(srcFullPath);
  });
  return destPath;
}

async function upsertDocument({ originalName, storedName, size, hash, mime, src = 'ingest' }) {
  // Try insert, ignore duplicates on (hash,size) if unique index exists
  let docId = null;
  try {
    const inserted = await knex('documents')
      .insert({ original_name: originalName, stored_name: storedName, size, hash, mime, src })
      .returning('id');
    docId = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted;
  } catch (err) {
    // Likely duplicate (unique index). Fetch existing row id.
    const row = await knex('documents').select('id').where({ hash, size }).first();
    if (row?.id) docId = row.id;
    else throw err;
  }
  return docId;
}

async function linkOrCreateClaimFromCore(core) {
  // core may include: claimNumber, vin, year, make, model, lossDate, workfileNumber, etc.
  let claim = null;

  if (core?.claimNumber) {
    claim = await knex('claims').where({ claim_number: core.claimNumber }).first();
    if (claim) return claim.id;
  }
  if (!claim && core?.vin) {
    claim = await knex('claims').where({ vin: core.vin }).first();
    if (claim) return claim.id;
  }

  if (!CLAIM_AUTOCREATE) return null;

  // Create minimal claim
  const payload = {
    claim_number: core?.claimNumber || null,
    vin: core?.vin || null,
    year: core?.year ? Number(core.year) : null,
    make: core?.make || null,
    model: core?.model || null,
    loss_date: core?.lossDate || null,
  };

  const inserted = await knex('claims').insert(payload).returning('id');
  const newId = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted;
  return newId || null;
}

async function setDocumentClaim(documentId, claimId) {
  if (!documentId || !claimId) return;
  await knex('documents').where({ id: documentId }).update({ claim_id: claimId });
}

// Return a reasonably unique archived name (hash + ext)
function archivedNameFrom(hash, ext, originalName) {
  // keep original base as hint (sanitized), but ensure uniqueness by hash
  const safeBase = (originalName || '').replace(/[^\w\.-]+/g, '_').slice(0, 40) || 'file';
  return `${safeBase}.${hash.slice(0, 12)}${ext}`;
}

// ----------- Core processing -----------
async function processOneFile(fileName) {
  const ext = extOf(fileName);
  const fullPath = path.join(INCOMING_DIR, fileName);
  const originalName = fileName;

  // Skip zero-byte temp/partial files (best-effort)
  const st = await fs.stat(fullPath).catch(() => null);
  if (!st || st.size === 0) return;

  const buf = await fs.readFile(fullPath);
  const hash = sha256(buf);
  const size = buf.length;
  const mime = ext === '.xml' ? 'application/xml'
            : ext === '.ems' ? 'text/plain'
            : 'application/octet-stream';

  await logEvent('received', `Picked up ${originalName}`, { originalName, size });

  let docId = null;
  try {
    // 1) Insert (or get) document record
    docId = await upsertDocument({
      originalName,
      storedName: originalName, // temp until archived
      size,
      hash,
      mime,
      src: 'ingest',
    });
    await logEvent('stored', 'Document row created/found', { originalName, hash, size }, docId);

    // 2) Parse only EMS/XML. Other types are stored and archived but not parsed.
    let core = null;
    if (INGEST_EXTS.has(ext)) {
      try {
        const parsed = await parseEMS(buf, { ext, fileName: originalName });
        // normalize common fields we care about
        core = {
          claimNumber: parsed?.claimNumber || parsed?.claim || null,
          workfileNumber: parsed?.workfileNumber || parsed?.workfile || null,
          vin: parsed?.vin || null,
          year: parsed?.year || null,
          make: parsed?.make || null,
          model: parsed?.model || null,
          lossDate: parsed?.lossDate || null,
        };
        await logEvent('parsed', `Parsed ${ext.toUpperCase()}`, { core }, docId);
      } catch (err) {
        await logEvent('error', `Parse failed: ${err?.message || err}`, null, docId);
      }
    }

    // 3) Link or create claim when we have enough info
    if (core && (core.claimNumber || core.vin)) {
      try {
        const claimId = await linkOrCreateClaimFromCore(core);
        if (claimId) {
          await setDocumentClaim(docId, claimId);
          await logEvent('linked', `Linked to claim ${claimId}`, { claimId }, docId);
        }
      } catch (err) {
        await logEvent('error', `Claim link/create failed: ${err?.message || err}`, null, docId);
      }
    }

    // 4) Archive (always)
    const storedName = archivedNameFrom(hash, ext, originalName);
    const archivedPath = await moveToArchive(fullPath, storedName);
    await knex('documents').where({ id: docId }).update({ stored_name: storedName });
    await logEvent('archived', 'Moved to archive', { archivedPath }, docId);

  } catch (err) {
    await logEvent('error', `Ingest error: ${err?.message || err}`, null, docId || null);
    // best effort: try to move problematic file to archive with an error suffix
    try {
      const storedName = archivedNameFrom(hash, ext, `ERR_${originalName}`);
      await moveToArchive(fullPath, storedName);
    } catch { /* swallow */ }
  }
}

let timer = null;
let running = false;

async function tick() {
  if (running) return; // prevent re-entrancy
  running = true;
  try {
    await ensureDir(INCOMING_DIR);
    await ensureDir(ARCHIVE_DIR);

    const files = await listInbox();
    // Process oldest-first to keep ordering predictable
    files.sort();

    for (const f of files) {
      // Only handle known claim-export types here; other docs/images are handled by upload route and archived by worker as well.
      if (!INGEST_EXTS.has(extOf(f))) {
        // Non-EMS/XML: still archive to keep inbox clean
        try {
          const src = path.join(INCOMING_DIR, f);
          const st = await fs.stat(src).catch(() => null);
          if (st?.isFile()) {
            const buf = await fs.readFile(src);
            const hash = sha256(buf);
            const archived = archivedNameFrom(hash, extOf(f), f);
            await moveToArchive(src, archived);
            await logEvent('archived', `Non-EMS/XML archived: ${f}`, { archived }, null);
          }
        } catch { /* ignore */ }
        continue;
      }

      await processOneFile(f);
    }
  } finally {
    running = false;
  }
}

// ----------- Public API -----------
export function startCccIngestWorker(opts = {}) {
  // Allow server.js to override dirs/interval
  const incomingDir = opts.incomingDir || INCOMING_DIR;
  const archiveDir  = opts.archiveDir  || ARCHIVE_DIR;
  const intervalMs  = Number(opts.intervalMs || POLL_MS);

  // If server passed different dirs, update globals for helpers that refer to them
  if (incomingDir !== INCOMING_DIR) {
    Object.defineProperty(global, '__INGEST_INCOMING_DIR__', { value: incomingDir, configurable: true });
  }
  if (archiveDir !== ARCHIVE_DIR) {
    Object.defineProperty(global, '__INGEST_ARCHIVE_DIR__', { value: archiveDir, configurable: true });
  }

  // first immediate pass, then interval
  tick().catch(err => {
    console.error('[ingest] initial tick error:', err?.message || err);
  });

  timer = setInterval(() => {
    tick().catch(err => console.error('[ingest] tick error:', err?.message || err));
  }, intervalMs);

  return function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
