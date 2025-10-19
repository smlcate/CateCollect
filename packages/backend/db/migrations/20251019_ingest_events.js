export async function up(knex) {
  await knex.schema.createTable('ingest_events', (t) => {
    t.increments('id').primary();
    t.integer('document_id').references('id').inTable('documents').onDelete('CASCADE').index();
    t.string('stage', 64).notNullable();         // received|hashed|parsed|linked|archived|error
    t.text('message').notNullable();             // short message or error
    t.jsonb('meta').nullable();                  // optional aux data
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ingest_events');
}
