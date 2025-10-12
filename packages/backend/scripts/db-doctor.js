// packages/backend/scripts/db-doctor.js
import knex from 'knex';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Works whether knexfile exports env blocks or a plain config object
const cfg = require('../knexfile.cjs');

const env = process.env.NODE_ENV || 'development';
const knexConfig = cfg[env] || cfg;  // support both shapes
const db = knex(knexConfig);

(async () => {
  try {
    const ver = await db.raw('SELECT version()');
    const who = await db.raw('SELECT current_database() AS db, current_user AS user');
    const tables = await db.raw(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
      ORDER BY 1
    `);

    console.log('Postgres :', ver.rows?.[0]?.version);
    console.log('DB/User  :', who.rows?.[0]);
    console.log('Tables   :', tables.rows?.map(r => r.table_name));
  } catch (e) {
    console.error('DB error :', e.message || e);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
