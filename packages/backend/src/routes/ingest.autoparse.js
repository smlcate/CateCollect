// packages/backend/src/routes/ingest.autoparse.js
// Watches INCOMING_DIR ⇒ ARCHIVE_DIR, registers files in ccc_files,
// parses metadata (XML/EMS) into ccc_metadata. AWF = archive only.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import knex from '../../db/knexClient.js';

const DISABLED = String(process.env.DISABLE_INGEST || '0') === '1';
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
const POLL_MS      = Number(process.env.POLL_INTERVAL_MS || 5000);

const EMS_RE = /\.ems$/i;
const XML_RE = /\.xml$/i;
const AWF_RE = /\.awf$/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ensureDirs() {
  await fs.mkdir(INCOMING_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR,  { recursive: true });
}

async function sha256OfFile(absPath) {
  const h = crypto.createHash('sha256');
  const fh = await fs.open(absPath, 'r');
  try {
    for await (const chunk of fh.createReadStream()) h.update(chunk);
  } finally {
    await fh.close();
  }
  return h.digest('hex');
}

function buildArchiveName(baseName, sha, acceptedExt) {
  // Keep a predictable, unique name; prefix ERR_ for non-accepted types
  const ts = Date.now();
  const ext = path.extname(baseName).slice(1).toLowerCase();
  const head = acceptedExt ? '' : 'ERR_';
  return `${head}${ts}_${sha.slice(0,12)}_${baseName}.${sha.slice(0,12)}.${ext}`;
}

async function moveToArchive(absPath) {
  const stat = await fs.stat(absPath);
  if (!stat.isFile()) return null;

  const base = path.basename(absPath);
  const ext = path.extname(base).toLowerCase();
  const accepted = EMS_RE.test(ext) || XML_RE.test(ext) || AWF_RE.test(ext);

  const sha = await sha256OfFile(absPath);
  const destName = buildArchiveName(base, sha, accepted);
  const dest = path.join(ARCHIVE_DIR, destName);
  await fs.rename(absPath, dest);
  return { base, destName, dest, size: stat.size, sha, ext };
}

async function registerFile(originalName, archivedName, size, sha) {
  // Idempotent on archived_path
  const existing = await knex('ccc_files')
    .select('id')
    .where({ archived_path: archivedName })
    .first();
  if (existing?.id) return existing.id;

  const inserted = await knex('ccc_files')
    .insert({
      original_name: originalName,
      stored_path: null,
      archived_path: archivedName,
      size_bytes: String(size),
      sha256: sha,
      processed_at: knex.fn.now(),
    })
    .returning('id');

  // knex/pg can return [{id: 123}] or ["123"]
  const idVal = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted?.id;
  return Number(idVal) || null;
}

// ---------- Parsers ----------

function parseEms(text) {
  // Super-loose key=value lines
  const bag = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m) bag[m[1]] = m[2];
  }
  const claim_number = bag.ClaimNumber || bag.CLAIM_NUMBER || null;
  const vin          = bag.VIN || bag.VehicleVIN || bag.VEHICLE_VIN || null;
  const ro_number    = bag.RO || bag.RONumber || bag.REPAIR_ORDER || null;
  const customer     = bag.Customer || bag.CustomerName || null;
  const amtRaw       = bag.Total || bag.TotalAmount || null;
  const total_amount = amtRaw != null ? Number(String(amtRaw).replace(/[^0-9.]/g,'')) : null;

  return {
    claim_number,
    vin,
    ro_number,
    customer_name: customer,
    total_amount: Number.isFinite(total_amount) ? total_amount : null,
    raw_json: JSON.stringify(bag),
  };
}

function pick(obj, ...paths) {
  for (const p of paths) {
    let v = obj;
    for (const k of p.split('.')) v = v?.[k];
    if (v != null && v !== '') return String(v);
  }
  return null;
}
function parseXml(text) {
  const parser = new XMLParser({
// packages/backend/src/ingest.autoparse.js
// Watches INCOMING_DIR for .xml/.ems/.awf, archives to ARCHIVE_DIR,
// parses XML/EMS for metadata, writes ccc_files + ccc_metadata.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const PICK = /\.(xml|ems|awf)$/i;
const isVin = (s) => /^[A-HJ-NPR-Z0-9]{17}$/.test((s || '').toUpperCase());
const toAmount = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

let __started = false;

async function sha256Of(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const rs = fss.createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', resolve);
  });
  return hash.digest('hex');
}

// ---------- XML parser (best-effort) ----------
function extractFromXml(text) {
  const p = new XMLParser({
    ignoreDeclaration: true,
    trimValues: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    allowBooleanAttributes: true,
    parseTagValue: true,
  });
  let raw = null;
  try { raw = parser.parse(text); } catch { raw = null; }

  const claim_number = raw && pick(raw, 'claim.claim_number','Claim.ClaimNumber','root.claimNumber','estimate.claimID');
  const vin          = raw && pick(raw, 'claim.vin','Claim.Vehicle.VIN','root.VIN','estimate.vehicle.VIN');
  const ro_number    = raw && pick(raw, 'claim.ro_number','Claim.RepairOrderNumber','root.roNumber');
  const customer     = raw && pick(raw, 'claim.customer_name','Claim.Customer.Name','root.customer','estimate.customer.name');
  const amtRaw       = raw && pick(raw, 'claim.total_amount','Claim.TotalAmount','estimate.totals.grandTotal');
  const total_amount = amtRaw!=null ? Number(String(amtRaw).replace(/[^0-9.]/g,'')) : null;

  return {
    claim_number: claim_number || null,
    vin: vin || null,
    ro_number: ro_number || null,
    customer_name: customer || null,
    total_amount: Number.isFinite(total_amount) ? total_amount : null,
  try { raw = p.parse(text); } catch { /* ignore */ }

  const pick = (...paths) => {
    for (const pth of paths) {
      let v = raw;
      for (const k of pth.split('.')) v = v?.[k];
      if (v != null && v !== '') return String(v);
    }
    return null;
  };

  const claim_number = pick('claim.claim_number','Claim.ClaimNumber','root.claimNumber','estimate.claimID');
  const vin          = pick('claim.vin','Claim.Vehicle.VIN','root.VIN','estimate.vehicle.VIN');
  const ro_number    = pick('claim.ro_number','Claim.RepairOrderNumber','root.roNumber');
  const customer     = pick('claim.customer_name','Claim.Customer.Name','root.customer','estimate.customer.name');
  const amtRaw       = pick('claim.total_amount','Claim.TotalAmount','estimate.totals.grandTotal');

  return {
    claim_number: claim_number || null,
    vin: isVin(vin) ? vin : null,
    ro_number: ro_number || null,
    customer_name: customer || null,
    total_amount: toAmount(amtRaw),
    raw_json: raw ? JSON.stringify(raw) : null,
  };
}

async function upsertMetadata(fileId, meta) {
  await knex.raw(`
    INSERT INTO ccc_metadata (file_id, claim_number, vin, ro_number, customer_name, total_amount, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (file_id) DO UPDATE SET
      claim_number = EXCLUDED.claim_number,
      vin          = EXCLUDED.vin,
      ro_number    = EXCLUDED.ro_number,
      customer_name= EXCLUDED.customer_name,
      total_amount = EXCLUDED.total_amount,
      raw_json     = EXCLUDED.raw_json
  `, [
    fileId,
    meta.claim_number,
    meta.vin,
    meta.ro_number,
    meta.customer_name,
    meta.total_amount,
    meta.raw_json,
  ]);
}

// ---------- Sweepers ----------

async function sweepIncoming() {
  try {
    const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .filter(n => /\.(ems|xml|awf)$/i.test(n));

    for (const name of files) {
      const abs = path.join(INCOMING_DIR, name);
      try {
        const moved = await moveToArchive(abs);
        if (!moved) continue;
        const id = await registerFile(moved.base, moved.destName, moved.size, moved.sha);
        console.log(`[ccc-ingest] archived ${name} → ${moved.destName} (id=${id})`);
      } catch (e) {
        console.error(`[ccc-ingest] error ${name}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[ccc-ingest] loop error:', e.message);
  } finally {
    setTimeout(sweepIncoming, POLL_MS);
  }
}

async function sweepArchive() {
  try {
    const entries = await fs.readdir(ARCHIVE_DIR, { withFileTypes: true });
    const xmlOrEms = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .filter(n => /\.(ems|xml)$/i.test(n)); // AWF = skip parsing

    for (const name of xmlOrEms) {
      const abs = path.join(ARCHIVE_DIR, name);
      let meta = null;
      try {
        const text = await fs.readFile(abs, 'utf8');
        if (XML_RE.test(name)) meta = parseXml(text);
        else if (EMS_RE.test(name)) meta = parseEms(text);
      } catch (e) {
        console.error(`[ccc-autoparse] read ${name}:`, e.message);
      }
      if (!meta) continue;

      try {
        const row = await knex('ccc_files').select('id').where({ archived_path: name }).first();
        if (!row?.id) continue;
        await upsertMetadata(row.id, meta);
        console.log(`[ccc-autoparse] parsed ${name} →`, {
          claim_number: meta.claim_number, vin: meta.vin,
          ro_number: meta.ro_number, customer: meta.customer_name,
          total: meta.total_amount
        });
      } catch (e) {
        console.error(`[ccc-autoparse] upsert ${name}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[ccc-autoparse] loop error:', e.message);
  } finally {
    setTimeout(sweepArchive, POLL_MS);
  }
}

// ---------- boot ----------
(async function boot() {
  if (DISABLED) {
    console.log('[ccc-ingest] disabled via DISABLE_INGEST=1');
    return;
  }
  await ensureDirs();
  console.log(`[ccc-ingest] watching ${INCOMING_DIR} → ${ARCHIVE_DIR} (every ${POLL_MS}ms)`);
  console.log(`[ccc-autoparse] watching ${ARCHIVE_DIR} (every ${POLL_MS}ms)`);
  // kick both loops
  setTimeout(sweepIncoming, 200);
  setTimeout(sweepArchive, 800);
})();
// ---------- EMS parser (heuristic) ----------
function extractFromEms(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  let vin = null, claim_number = null, ro_number = null, customer_name = null, total_amount = null;

  // VIN from VEH segment or first 17-char VIN
  for (const line of lines) {
    const parts = line.split('|');
    if (parts[0] === 'VEH') {
      const cand = parts.find(isVin);
      if (cand) { vin = cand; break; }
    }
  }
  if (!vin) {
    const m = text.match(/[A-HJ-NPR-Z0-9]{17}/);
    if (m) vin = m[0];
  }

  // Claim number from CLM
  for (const line of lines) {
    if (line.startsWith('CLM|')) {
      const parts = line.split('|');
      claim_number = parts[1] || null;
      break;
    }
  }

  // RO number (very loose)
  for (const line of lines) {
    const m = line.match(/(\bRO[-\s]?\d+)/i);
    if (m) { ro_number = m[1]; break; }
  }

  // Customer name from CST
  for (const line of lines) {
    if (line.startsWith('CST|')) {
      const parts = line.split('|').slice(1).filter(Boolean);
      if (parts.length >= 2) {
        customer_name = `${parts[0]} ${parts[1]}`.trim();
        break;
      }
    }
  }

  // Total (scan EST/TOT/GTL lines; fallback to largest $ number)
  const dollarRe = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g;
  const candidates = [];
  for (const line of lines) {
    if (/^(EST|TOT|GTL)\|/i.test(line)) {
      let m; while ((m = dollarRe.exec(line)) !== null) candidates.push(toAmount(m[1]));
    }
  }
  if (!candidates.length) {
    let m; while ((m = dollarRe.exec(text)) !== null) candidates.push(toAmount(m[1]));
  }
  total_amount = candidates.filter(n => n != null).sort((a,b)=>b-a)[0] ?? null;

  return {
    claim_number: claim_number || null,
    vin: isVin(vin) ? vin : null,
    ro_number: ro_number || null,
    customer_name: customer_name || null,
    total_amount,
    raw_json: null,
  };
}

// ---------- main worker ----------
export function startIngestWorker(knex) {

  if (__started) {
    console.log('[ccc-ingest] worker already started (ignoring second start)');
    return;
  }

  const incomingDir = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
  const archiveDir  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
  const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);

  console.log(`[ccc-ingest] watching ${incomingDir} -> archiving to ${archiveDir} (every ${pollMs}ms)`);

  let busy = false;

  __started = true;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      await fs.mkdir(incomingDir, { recursive: true });
      await fs.mkdir(archiveDir,  { recursive: true });

      const entries = await fs.readdir(incomingDir, { withFileTypes: true });
      const files = entries.filter(e => e.isFile() && PICK.test(e.name)).map(e => e.name);

      for (const name of files) {
        const full = path.join(incomingDir, name);

        let stat;
        try { stat = await fs.stat(full); } catch { continue; }
        const size = stat.size;
        const sha = await sha256Of(full);
        const ext = (name.split('.').pop() || '').toLowerCase();

        let meta = { claim_number:null, vin:null, ro_number:null, customer_name:null, total_amount:null, raw_json:null };
        try {
          const text = await fs.readFile(full, 'utf8');
          if (ext === 'xml') meta = extractFromXml(text);
          else if (ext === 'ems') meta = extractFromEms(text);
          // awf: no parse
        } catch { /* binary / non-utf8 (awf) */ }

        const ts = Date.now();
        const short = sha.slice(0,12);
        const archivedBase = `${ts}_${short}_${name}`;
        const archivedFull = path.join(archiveDir, archivedBase);

        // move
        await fs.rename(full, archivedFull);

        await knex.transaction(async (trx) => {
          const [fileRow] = await trx('ccc_files')
            .insert({
              original_name: name,
              stored_path: null,
              archived_path: archivedBase,
              size_bytes: String(size),
              sha256: sha,
              processed_at: trx.fn.now(),
            })
            .returning(['id']);

          const file_id = fileRow.id;
          const md = {
            file_id,
            claim_number: meta.claim_number,
            vin: meta.vin,
            ro_number: meta.ro_number,
            customer_name: meta.customer_name,
            total_amount: meta.total_amount,
            raw_json: meta.raw_json,
          };

          // safe upsert if unique(file_id) exists; otherwise plain insert
          try {
            await trx('ccc_metadata')
              .insert(md)
              .onConflict('file_id')
              .merge(md);
          } catch {
            // If DB doesn’t support onConflict, fall back to update-or-insert
            const existing = await trx('ccc_metadata').where({ file_id }).first();
            if (existing) await trx('ccc_metadata').update(md).where({ file_id });
            else await trx('ccc_metadata').insert(md);
          }
        });
      }
    } catch (e) {
      console.error('[ccc-ingest] error:', e?.message || e);
    } finally {
      busy = false;
    }
  }

  setInterval(tick, pollMs);
  tick().catch(()=>{});
}
