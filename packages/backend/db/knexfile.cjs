module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'iw-postgres',
    user: process.env.PGUSER || 'workflow_user',
    password: process.env.PGPASSWORD || 'workflow_pass',
    database: process.env.PGDATABASE || 'insurance_workflow',
    port: Number(process.env.PGPORT || 5432),
  },
  migrations: {
    directory: __dirname + '/migrations',
    tableName: 'knex_migrations',
  },
};
