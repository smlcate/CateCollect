// db/knexfile.cjs
const path = require('path');

function connectionFromEnv() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return {
    host:     process.env.PGHOST     || 'db',
    port:     parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'insurance_workflow',
    user:     process.env.PGUSER     || 'workflow_user',
    password: process.env.PGPASSWORD || 'devpass',
    ssl:      false,
  };
}

const shared = {
  client: 'pg',
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
    loadExtensions: ['.cjs', '.js'],
  },
  pool: { min: 0, max: 10 },
};

module.exports = {
  development: { ...shared, connection: connectionFromEnv() },
  production:  { ...shared, connection: connectionFromEnv() },
  test:        { ...shared, connection: connectionFromEnv() },
};
