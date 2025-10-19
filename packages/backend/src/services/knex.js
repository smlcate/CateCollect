import knex from 'knex';
import dotenv from 'dotenv';
dotenv.config();
const db = knex({
  client: 'pg',
  connection: {
    host: process.env.PGHOST || '127.0.0.1',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE || 'insurance_workflow',
    user: process.env.PGUSER || 'workflow_user',
    password: process.env.PGPASSWORD || 'devpass'
  },
  pool: { min: 0, max: 10 }
});
export default db;
// Re-export the canonical knex client so all routes use the same instance
export { default } from '../../db/knexClient.js';
