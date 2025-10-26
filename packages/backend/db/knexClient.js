// packages/backend/src/db/knexClient.js  (ESM)
import knex from 'knex';
import knexfile from '../../db/knexfile.cjs'; // resolves to /app/db/knexfile.cjs at runtime

const env = process.env.NODE_ENV || 'production';

// knexfile.cjs typically exports { development: {...}, production: {...} }
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// Allow DATABASE_URL to override the connection if provided
const connOverride = process.env.DATABASE_URL ? { connection: process.env.DATABASE_URL } : {};

const config = { ...selected, ...connOverride };

const db = knex(config);
export default db;
