// packages/backend/db/knexClient.js  (ESM; db is OUTSIDE src)
// Resolves knexfile both in the container and in local monorepo.
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

/*
Container layout with this Dockerfile:
  /app/db/knexClient.js         (this file)
  /app/knex/knexfile.cjs        (repo-root db/ copied here)

Local monorepo layout:
  packages/backend/db/knexClient.js
  repo-root/db/knexfile.cjs
*/
const candidates = [
  '../knex/knexfile.cjs',   // container: /app/db -> /app/knex/knexfile.cjs
  '../../db/knexfile.cjs',  // local monorepo: backend/db -> repo-root/db
  '/app/knex/knexfile.cjs', // absolute container path (belt & suspenders)
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

// Allow DATABASE_URL to override if you prefer env-driven config
const connOverride = process.env.DATABASE_URL ? { connection: process.env.DATABASE_URL } : {};

const config = { ...selected, ...connOverride };
const db = knex(config);
export default db;
