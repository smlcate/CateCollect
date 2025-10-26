// ESM
import knex from 'knex';
import knexfile from '../../../db/knexfile.cjs';

const env = process.env.NODE_ENV || 'production';
const selected = (knexfile && knexfile[env]) ? knexfile[env] : knexfile;

// If DATABASE_URL is provided, prefer it (so we can point at iw-postgres cleanly)
const connOverride = process.env.DATABASE_URL ? { connection: process.env.DATABASE_URL } : {};
const config = { ...selected, ...connOverride };

const db = knex(config);
export default db;
