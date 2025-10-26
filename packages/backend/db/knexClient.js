// packages/backend/db/knexClient.js   <-- NOTE: outside src
// ESM, works in-container and in local monorepo dev.
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// This file lives at /app/db/knexClient.js in the container (same dir as knexfile.cjs),
// and at repo/packages/backend/db/knexClient.js in local dev.
// Try sibling first, then repo-root fallback, then absolute in-container.
const candidates = [
  './knexfile.cjs',          // container happy path (sibling to this file)
  '../../db/knexfile.cjs',   // local monorepo: packages/backend/db -> repo/db
  '/app/db/knexfile.cjs',    // absolute container path, just in case
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
  const tried = candidates
    .map(rel => (rel.startsWith('/') ? rel : fileURLToPath(new URL(rel, import.meta.url))))
    .join(', ');
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
