// packages/backend/db/knexClient.js  (ESM; db lives OUTSIDE src)
// After the Dockerfile copy order, /app/db/knexfile.cjs is the repo-root version
// that targets the Compose service 'db' (correct host for containers).
import knex from 'knex';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let knexfile;
const tried = [];
for (const p of [
  './knexfile.cjs',       // container: /app/db/knexfile.cjs (root version after COPY)
  '../knexfile.cjs',      // fallback (packages/backend/knexfile.cjs)
  '../../db/knexfile.cjs' // local monorepo fallback
]) {
  try { knexfile = require(p); break; } catch (e) { tried.push(p); }
}
if (!knexfile) throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried.join(', ')}`);

const env = process.env.NODE_ENV || 'production';
let config = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override connection cleanly if provided
if (process.env.DATABASE_URL) config = { ...config, connection: process.env.DATABASE_URL };

export default knex(config);
