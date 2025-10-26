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
