import fs from 'fs/promises';
import path from 'path';
import knexFactory from 'knex';
import { extractFromXml } from './lib/claimParser.js';

const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(process.cwd(), 'data', 'archive');

const knex = knexFactory({
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || process.env.PGHOST     || 'db',
    port:    (process.env.DB_PORT     || process.env.PGPORT     || 5432),
    user:     process.env.DB_USER     || process.env.PGUSER     || 'workflow_user',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'workflow_pass',
    database: process.env.DB_NAME     || process.env.PGDATABASE || 'insurance_workflow',
    ssl: !!(process.env.DB_SSL)
  },
  pool: { min: 0, max: 4 }
});

let lastSeen = new Set();

async function once() {
  try {
    // list archive dir
    const entries = await fs.readdir(ARCHIVE_DIR, { withFileTypes: true }).catch(() => []);
    const files = entries.filter(e => e.isFile() && /\.xml$/i.test(e.name)).map(e => e.name);

    // new since last poll
    const newcomers = files.filter(f => !lastSeen.has(f));
    newcomers.forEach(f => lastSeen.add(f));

    // try newest first
    newcomers.sort((a,b) => b.localeCompare(a));

    for (const archivedName of newcomers) {
      try {
        // find file row
        const fileRow =
          await knex('ccc_files').where({ archived_path: archivedName }).first() ||
          await knex('ccc_files').where({ stored_path: archivedName }).first();

        if (!fileRow) continue;

        // read and parse
        const full = path.join(ARCHIVE_DIR, archivedName);
        const text = await fs.readFile(full, 'utf8');
        const meta = extractFromXml(text);

        // only upsert if we actually found something useful
        if (meta.claim_number || meta.vin || meta.customer_name || meta.total_amount != null) {
          await knex('ccc_metadata')
            .insert({ file_id: fileRow.id, ...meta })
            .onConflict('file_id')
            .merge(meta);
          // eslint-disable-next-line no-console
          console.log('[ccc-autoparse] upserted metadata for', archivedName, '-> file_id', fileRow.id);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[ccc-autoparse] error on', archivedName, e.message);
      }
    }
  } catch (e) {
    console.error('[ccc-autoparse] scan error:', e.message);
  }
}

export function startAutoParse() {
  if (String(process.env.DISABLE_INGEST || '0') === '1') {
    console.log('[ccc-autoparse] disabled (DISABLE_INGEST=1)');
    return;
  }
  console.log(`[ccc-autoparse] watching ${ARCHIVE_DIR} every ${POLL_MS}ms`);
  // prime seen set so we don’t spam on first run
  fs.readdir(ARCHIVE_DIR, { withFileTypes: true }).then(entries => {
    for (const e of entries || []) if (e.isFile() && /\.xml$/i.test(e.name)) lastSeen.add(e.name);
  }).catch(() => {});

  setInterval(once, POLL_MS).unref();
  // also do one pass after a short delay
  setTimeout(once, 1500).unref();
}

// auto-start if this module is imported directly
startAutoParse();
