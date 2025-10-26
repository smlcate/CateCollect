// packages/backend/src/db/knexClient.js  (ESM, container+local safe)
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// Try multiple candidates so this resolves both in-container and locally
const candidates = [
  '../../db/knexfile.cjs',       // container happy path (/app/src/db -> /app/db)
  '../../../../db/knexfile.cjs', // local monorepo (packages/backend/src/db -> repo/db)
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
  } catch { /* try next */ }
}
if (!knexfile) {
  const tried = candidates.map(rel => (rel.startsWith('/') ? rel : fileURLToPath(new URL(rel, import.meta.url)))).join(', ');
  throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried}`);
}

const env = process.env.NODE_ENV || 'production';
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

const connOverride = process.env.DATABASE_URL
  ? { connection: process.env.DATABASE_URL }
  : {};

const config = { ...selected, ...connOverride };
const db = knex(config);
export default db;
