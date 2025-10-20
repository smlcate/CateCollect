export async function up(knex) {
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'documents_claim_type_uniq') THEN
        CREATE UNIQUE INDEX documents_claim_type_uniq ON documents (claim_id, LOWER(type));
      END IF;
    END $$;
  `);
}
export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS documents_claim_type_uniq;`);
}
