export async function up(knex) {
  // adjust table/column names if yours differ
  const has = await knex.schema.hasTable('documents');
  if (!has) return;
  // Try to create a unique index on (hash, size)
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS documents_hash_size_uniq ON documents(hash, size)');
}

export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS documents_hash_size_uniq');
}
