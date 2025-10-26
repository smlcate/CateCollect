import knex from 'knex';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const requireCJS = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const candidates = [
  path.resolve(__dirname, './knexfile.cjs'),
  path.resolve(__dirname, '../knexfile.cjs'),
  path.resolve(__dirname, '../../../db/knexfile.cjs')
];
let knexfile; const tried = [];
for (const abs of candidates) { try { knexfile = requireCJS(abs); break; } catch (e) { tried.push(`${abs} (${e.code || e.message})`); } }
if (!knexfile) { throw new Error(`knexClient: could not load CJS knexfile.cjs. Tried: ${tried.join(' | ')}`); }
const env = process.env.NODE_ENV || 'development';
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;
const connection = process.env.DATABASE_URL || selected.connection;
export default knex({ ...selected, connection });
