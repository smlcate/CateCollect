// Scan /app/data/archive for .awf files, parse them, and upsert fields
// into ingest_files. Safe to re-run; only fills missing fields.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import knex from '../db/knexClient.js';
import { parseAwfBuffer } from '../parsers/awf.js';

const ARCHIVE_DIR = '/app/data/archive';

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

async function main() {
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => /\.awf$/i.test(f));
  for (const f of files) {
    const p = path.join(ARCHIVE_DIR, f);
    const buf = fs.readFileSync(p);
    const sum = sha256(buf);

    const parsed = parseAwfBuffer(buf);
    const fields = {
      vin: parsed.inferred.vin || null,
      ro_number: parsed.inferred.ro_number || null,
      claim_number: parsed.inferred.claim_number || null,
      customer_name: parsed.inferred.customer_name || null,
      total_amount: parsed.inferred.total_amount || null,
      processed_at: knex.fn.now()
    };

    // Only set fields that have values
    const update = Object.fromEntries(Object.entries(fields).filter(([,v]) => v !== null));

    try {
      const updated = await knex('ingest_files').where({ sha256: sum }).update(update);
      if (updated === 0) {
        // If sha not found (e.g., older ingest), try by archived_path basename
        await knex('ingest_files').whereRaw('archived_path LIKE ?', [`%${f}%`]).update(update);
      }
      console.log(`[awf-parse] ${f}`, parsed.inferred);
    } catch (e) {
      console.error(`[awf-parse] DB update failed for ${f}:`, e.message);
    }
  }
  await knex.destroy();
}

main().catch(e => { console.error(e); process.exit(1); });
