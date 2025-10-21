const path = require('path');

module.exports = {
  client: 'pg',
  connection: {
    host:     process.env.DB_HOST     || process.env.PGHOST     || 'db',
    port:    (process.env.DB_PORT     || process.env.PGPORT     || 5432),
    user:     process.env.DB_USER     || process.env.PGUSER     || 'workflow_user',
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'workflow_pass',
    database: process.env.DB_NAME     || process.env.PGDATABASE || 'insurance_workflow',
    ssl: !!process.env.DB_SSL
  },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds')
  }
};
