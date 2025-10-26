// db/migrations/20251020_add_archived_path_and_backfill.js
/** @param {import('knex').Knex} knex */
export async function up(knex) {
  const hasCol = await knex.schema.hasColumn('ccc_files', 'archived_path');
  if (!hasCol) {
    await knex.schema.alterTable('ccc_files', (t) => {
      t.text('archived_path'); // where we store the final archived filename
    });
  }
  // backfill from stored_path if available
  await knex('ccc_files')
    .whereNull('archived_path')
    .update({ archived_path: knex.ref('stored_path') })
    .catch(() => {}); // ignore if table empty
}

export async function down(knex) {
  const hasCol = await knex.schema.hasColumn('ccc_files', 'archived_path');
  if (hasCol) {
    await knex.schema.alterTable('ccc_files', (t) => {
      t.dropColumn('archived_path');
    });
  }
}
