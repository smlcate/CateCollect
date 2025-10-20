// Adds nullable FK from ccc_files -> claims so ingest can auto-link/create claims
export async function up(knex) {
  const has = await knex.schema.hasColumn('ccc_files', 'claim_id');
  if (!has) {
    await knex.schema.alterTable('ccc_files', (t) => {
      t.integer('claim_id').references('id').inTable('claims').onDelete('SET NULL');
    });
    await knex.raw('CREATE INDEX IF NOT EXISTS ccc_files_claim_id_idx ON ccc_files (claim_id)');
  }
}

export async function down(knex) {
  const has = await knex.schema.hasColumn('ccc_files', 'claim_id');
  if (has) {
    await knex.schema.alterTable('ccc_files', (t) => {
      t.dropColumn('claim_id');
    });
  }
}
