// packages/backend/db/knexClient.js
import knex from 'knex';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Resolve knexfile.cjs from common spots (adjust if needed)
let knexfile;
const tried = [];
for (const candidate of [
  '../knexfile.cjs',        // packages/backend/knexfile.cjs  ✅ most likely for you
  '../../knexfile.cjs',     // monorepo packages/knexfile.cjs
  '../../../knexfile.cjs',  // repo root
]) {
  try {
    knexfile = require(candidate);
    break;
  } catch {
    tried.push(candidate);
  }
}
if (!knexfile) {
  throw new Error(`knexfile.cjs not found. Tried: ${tried.join(', ')}`);
}

// Your knexfile is a single plain config (client/connection/migrations/seeds).
// But support env-keyed configs too, just in case this changes later.
const env = process.env.KNEX_ENV || process.env.NODE_ENV || 'development';

let config;

// Case A: plain object (your current file)
if (knexfile && knexfile.client && knexfile.connection) {
  config = knexfile;
// Case B: env-keyed (e.g., { development: {...}, production: {...} })
} else if (knexfile && typeof knexfile === 'object') {
  config =
    knexfile[env] ||
    knexfile.development ||
    knexfile.production ||
    knexfile.test ||
    null;
}

// Optional fallback: DATABASE_URL (pg)
if (!config && process.env.DATABASE_URL) {
  config = {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 0, max: 10 },
    migrations: { tableName: 'knex_migrations' },
  };
}

if (!config) {
  throw new Error(
    `No usable Knex config found. Env="${env}". ` +
    `Your knexfile.cjs appears to be ${JSON.stringify(Object.keys(knexfile))}.`
  );
}

const db = knex(config);
export default db;
