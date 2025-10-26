// packages/backend/db/knexClient.js  (ESM, db is OUTSIDE src)
// With the Dockerfile above, /app/db contains BOTH this file and ./knexfile.cjs
import knex from 'knex';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Prefer sibling knexfile, then fallbacks for local dev
const tried = [];
let knexfile;
for (const p of [
  './knexfile.cjs',       // /app/db (container) or packages/backend/db (local)
  '../knexfile.cjs',      // /app (container) or packages/backend (local)
  '../../db/knexfile.cjs' // repo-root fallback (local dev)
]) {
  try { knexfile = require(p); break; } catch (e) { tried.push(p); }
}
if (!knexfile) throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried.join(', ')}`);

const env = process.env.NODE_ENV || 'production';
let config = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override connection (compose-friendly)
if (process.env.DATABASE_URL) config = { ...config, connection: process.env.DATABASE_URL };

export default knex(config);
