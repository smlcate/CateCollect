// packages/backend/db/knexClient.js
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// This file sits at /app/db/knexClient.js in the container (sibling to knexfile.cjs).
// Try sibling first; then fall back to repo-root /db for local monorepo runs.
const candidates = [
  './knexfile.cjs',        // container happy path (sibling)
  '../../db/knexfile.cjs', // local monorepo fallback: packages/backend/db -> repo/db
  '/app/db/knexfile.cjs',  // absolute container path, belt & suspenders
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

const connOverride = process.env.DATABASE_URL
  ? { connection: process.env.DATABASE_URL }
  : {};

const config = { ...selected, ...connOverride };

const db = knex(config);
export default db;
