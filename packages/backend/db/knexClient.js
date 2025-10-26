// packages/backend/db/knexClient.js
import knex from 'knex';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Resolve knexfile.cjs from common spots (container + local dev)
let knexfile;
const tried = [];
for (const candidate of [
  '../knexfile.cjs',        // /app/knexfile.cjs  (preferred; scripts also point here)
  '../../knexfile.cjs',     // monorepo fallback
  '../../../knexfile.cjs',  // repo root fallback
]) {
  try {
    knexfile = require(candidate);
    break;
  } catch (e) {
    tried.push(candidate);
  }
}
if (!knexfile) {
  throw new Error(`knexClient: could not load knexfile.cjs. Tried: ${tried.join(', ')}`);
}

const env = process.env.NODE_ENV || 'production';
let config = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override if provided
if (process.env.DATABASE_URL) {
  config = { ...config, connection: process.env.DATABASE_URL };
}

export default knex(config);
