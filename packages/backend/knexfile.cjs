require('dotenv').config();
module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || '127.0.0.1',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE || 'insurance_workflow',
    user: process.env.PGUSER || 'workflow_user',
    password: process.env.PGPASSWORD || 'devpass'
  },
  migrations: { directory: './db/migrations' },
  seeds: { directory: './db/seeds' }
};
