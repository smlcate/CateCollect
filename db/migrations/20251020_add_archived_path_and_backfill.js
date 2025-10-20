export async function up(knex) {
  const hasArchived = await knex.schema.hasColumn('ccc_files', 'archived_path');
  if (!hasArchived) {
    await knex.schema.alterTable('ccc_files', t => t.text('archived_path'));
  }
  const hasStored = await knex.schema.hasColumn('ccc_files', 'stored_path');

  // Backfill archived_path from stored_path when available and archived_path is null
  if (hasStored) {
    await knex('ccc_files')
      .whereNull('archived_path')
      .update({ archived_path: knex.ref('stored_path') });
  }
}

export async function down(knex) {
  const hasArchived = await knex.schema.hasColumn('ccc_files', 'archived_path');
  if (hasArchived) {
    await knex.schema.alterTable('ccc_files', t => t.dropColumn('archived_path'));
  }
}
