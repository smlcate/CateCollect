// One-shot backfill: scan /app/data/archive for .awf, parse, and update ingest_files.
//
// Safe to re-run. Only updates fields when we have values.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import knex from '../db/knexClient.js';
import { parseAwfBuffer } from '../parsers/awf.js';

const ARCHIVE_DIR = '/app/data/archive';

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

async function updateRowFor(filename, sha, inferred) {
  const update = {};
  if (inferred.vin) update.vin = inferred.vin;
  if (inferred.ro_number) update.ro_number = inferred.ro_number;
  if (inferred.claim_number) update.claim_number = inferred.claim_number;
  if (inferred.customer_name) update.customer_name = inferred.customer_name;
  if (inferred.total_amount) update.total_amount = String(inferred.total_amount);
  if (Object.keys(update).length === 0) return false;

  update.processed_at = knex.fn.now();

  // Prefer sha256 match; fallback to archived_path basename match
  let n = await knex('ingest_files').where({ sha256: sha }).update(update);
  if (n === 0) {
    n = await knex('ingest_files')
      .whereRaw('archived_path LIKE ?', [`%${filename}%`])
      .update(update);
  }
  return n > 0;
}

async function main() {
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => /\.awf$/i.test(f));
  for (const f of files) {
    const p = path.join(ARCHIVE_DIR, f);
    const buf = fs.readFileSync(p);
    const sum = sha256(buf);

    const parsed = parseAwfBuffer(buf);
    const ok = await updateRowFor(f, sum, parsed.inferred);
    console.log(`[awf-backfill] ${f} -> ${ok ? 'updated' : 'no-op'}`, parsed.inferred);
  }
  await knex.destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
