// packages/backend/src/db/knexClient.js
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// Try multiple candidate paths so this works in both environments.
const candidates = [
  '../../db/knexfile.cjs',       // container: /app/src/db -> /app/db
  '../../../../db/knexfile.cjs', // local: packages/backend/src/db -> repo/db
  '../../../db/knexfile.cjs',    // fallback if someone put packages/backend/db
  '/app/db/knexfile.cjs',        // absolute container path
];

let knexfile;
for (const rel of candidates) {
  try {
    const resolved = rel.startsWith('/')
      ? rel
      : fileURLToPath(new URL(rel, import.meta.url));
    knexfile = require(resolved);
    break;
  } catch { /* keep trying */ }
}
if (!knexfile) {
  const tried = candidates
    .map(rel => (rel.startsWith('/') ? rel : fileURLToPath(new URL(rel, import.meta.url))))
    .join(', ');
  throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried}`);
}

const env = process.env.NODE_ENV || 'production';
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override the connection (compose-friendly)
const connOverride = process.env.DATABASE_URL ? { connection: process.env.DATABASE_URL } : {};

const config = { ...selected, ...connOverride };
const db = knex(config);
export default db;
