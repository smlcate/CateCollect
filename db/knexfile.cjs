/** Knex config (Postgres) — uses env vars */
module.exports = {
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || process.env.PGHOST     || 'db',
    port:    (process.env.DB_PORT     || process.env.PGPORT     || 5432),
    user:     process.env.DB_USER     || process.env.PGUSER     || 'workflow_user',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'workflow_pass',
    database: process.env.DB_NAME     || process.env.PGDATABASE || 'insurance_workflow',
    ssl: Boolean(process.env.DB_SSL || false)
  },
  migrations: { directory: './db/migrations' },
};
