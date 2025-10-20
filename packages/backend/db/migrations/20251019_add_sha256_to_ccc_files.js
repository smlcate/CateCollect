export async function up(knex) {
  const has = await knex.schema.hasColumn('ccc_files', 'sha256');
  if (!has) {
    await knex.schema.alterTable('ccc_files', t => t.string('sha256', 64));
  }
}
export async function down(knex) {
  const has = await knex.schema.hasColumn('ccc_files', 'sha256');
  if (has) {
    await knex.schema.alterTable('ccc_files', t => t.dropColumn('sha256'));
  }
}
