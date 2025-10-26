// packages/backend/src/db/knexClient.js  (ESM, path-agnostic for container + local dev)
import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// Try multiple candidate locations so this works both:
// - in the container:   /app/src/db  -> /app/db/knexfile.cjs   (../../db/…)
// - in local monorepo:  packages/backend/src/db -> repo/db/…   (../../../../db/…)
// - in case someone placed one under packages/backend/db       (../../../db/…)
// - explicit absolute in container                            (/app/db/…)
const candidates = [
  '../../db/knexfile.cjs',      // container happy path
  '../../../../db/knexfile.cjs',// local monorepo (repo-root/db)
  '../../../db/knexfile.cjs',   // fallback if someone kept a packages/backend/db
  '/app/db/knexfile.cjs',       // absolute container path
];

let knexfile;
let usedPath = null;

for (const rel of candidates) {
  try {
    const resolved =
      rel.startsWith('/')
        ? rel
        : fileURLToPath(new URL(rel, import.meta.url));
    knexfile = require(resolved);
    usedPath = resolved;
    break;
  } catch (_) {
    // keep trying
  }
}

if (!knexfile) {
  const tried = candidates
    .map(rel => (rel.startsWith('/') ? rel : fileURLToPath(new URL(rel, import.meta.url))))
    .join(', ');
  throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried}`);
}

const env = process.env.NODE_ENV || 'production';
// knexfile.cjs typically exports { development: {...}, production: {...} }
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override connection
const connOverride = process.env.DATABASE_URL ? { connection: process.env.DATABASE_URL } : {};

const config = { ...selected, ...connOverride };

const db = knex(config);
export default db;
