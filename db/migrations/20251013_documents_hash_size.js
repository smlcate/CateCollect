export async function up(knex) {
  const hasSha = await knex.schema.hasColumn('documents','sha256');
  if (!hasSha) await knex.schema.alterTable('documents', t => {
    t.string('sha256', 64);
    t.bigInteger('size_bytes');
  });
  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS documents_claim_sha_uniq ON documents (claim_id, sha256)`);
}
export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS documents_claim_sha_uniq`);
  await knex.schema.alterTable('documents', t => {
    t.dropColumn('sha256');
    t.dropColumn('size_bytes');
  });
}
