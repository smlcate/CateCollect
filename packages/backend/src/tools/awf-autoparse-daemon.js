// Lightweight poller: every 5s scan /app/data/archive for .awf modified recently,
// parse, and update ingest_files. Logs with [ccc-awf] prefix.
//
// Run it in the container alongside the server:
//   docker compose exec -d backend node src/tools/awf-autoparse-daemon.js

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import knex from '../db/knexClient.js';
import { parseAwfBuffer } from '../parsers/awf.js';

const ARCHIVE_DIR = '/app/data/archive';
const INTERVAL_MS = 5000;
const SEEN = new Map(); // key = filename, value = mtimeMs

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

  let n = await knex('ingest_files').where({ sha256: sha }).update(update);
  if (n === 0) {
    n = await knex('ingest_files')
      .whereRaw('archived_path LIKE ?', [`%${filename}%`])
      .update(update);
  }
  return n > 0;
}

async function tick() {
  try {
    const items = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => /\.awf$/i.test(f))
      .map(f => ({ name: f, stat: fs.statSync(path.join(ARCHIVE_DIR, f)) }));

    for (const { name, stat } of items) {
      const last = SEEN.get(name) || 0;
      if (stat.mtimeMs <= last) continue; // unchanged

      const p = path.join(ARCHIVE_DIR, name);
      const buf = fs.readFileSync(p);
      const sum = sha256(buf);
      const parsed = parseAwfBuffer(buf);
      const updated = await updateRowFor(name, sum, parsed.inferred);

      console.log(`[ccc-awf] ${updated ? 'upsert' : 'skip'} ${name} ::`, parsed.inferred);
      SEEN.set(name, stat.mtimeMs);
    }
  } catch (e) {
    console.error('[ccc-awf] tick error:', e.message);
  }
}

console.log('[ccc-awf] watching /app/data/archive for .awf (every 5000ms)');
setInterval(tick, INTERVAL_MS);
await tick(); // run once at start
