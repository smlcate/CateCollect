// packages/backend/src/routes/ingest.autoparse.js
// Watches INCOMING_DIR ⇒ ARCHIVE_DIR, registers files in ccc_files,
// parses metadata (XML/EMS) into ccc_metadata. AWF = archive only.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import knex from '../db/knexClient.js';

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
