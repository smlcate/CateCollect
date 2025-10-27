// Normalize document types, remove dupes, then add a unique constraint on (claim_id, type)
export async function up(knex) {
  await knex.transaction(async (trx) => {
    // 1) normalize casing so the unique constraint works predictably
    await trx.raw(`UPDATE documents SET type = LOWER(type)`);

    // 2) remove duplicates keeping the smallest id
    await trx.raw(`
      DELETE FROM documents a
      USING documents b
      WHERE a.id > b.id
        AND a.claim_id = b.claim_id
        AND a.type = b.type
    `);

    // 3) add the unique constraint
    await trx.schema.alterTable('documents', (t) => {
      t.unique(['claim_id', 'type'], 'documents_claim_id_type_key');
    });
  });
}

export async function down(knex) {
  await knex.schema.alterTable('documents', (t) => {
    t.dropUnique(['claim_id', 'type'], 'documents_claim_id_type_key');
  });
}
