export async function up(knex) {
  await knex.schema.alterTable('claims', (t) => {
    t.text('reference_code').unique().nullable();
    t.boolean('archived').notNullable().defaultTo(false);
  });

  // Simple notes model (can expand later)
  await knex.schema.createTable('claim_notes', (t) => {
    t.increments('id').primary();
    t.integer('claim_id').notNullable().references('claims.id').onDelete('CASCADE');
    t.text('note').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.text('author').nullable(); // optional: user name until auth exists
  });

  // Helpful indexes
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_claims_refcode ON claims (reference_code)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_claims_archived ON claims (archived)`);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('claim_notes');
  await knex.schema.alterTable('claims', (t) => {
    t.dropColumn('reference_code');
    t.dropColumn('archived');
  });
}
