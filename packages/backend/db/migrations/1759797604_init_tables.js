export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username',50).unique();
    t.text('password_hash').notNullable();
    t.string('role',20).defaultTo('estimator');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('carriers', (t) => {
    t.increments('id').primary();
    t.string('name',100).notNullable();
    t.jsonb('config').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('claims', (t) => {
    t.increments('id').primary();
    t.string('claim_number',50).unique().notNullable();
    t.string('customer_name',100);
    t.integer('carrier_id').references('id').inTable('carriers').onDelete('CASCADE');
    t.string('status',50).defaultTo('Intake');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('documents', (t) => {
    t.increments('id').primary();
    t.integer('claim_id').references('id').inTable('claims').onDelete('CASCADE');
    t.string('type',50);
    t.text('filename').notNullable();
    t.text('filepath').notNullable();
    t.string('status',20).defaultTo('uploaded');
    t.timestamp('uploaded_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('workflow_events', (t) => {
    t.increments('id').primary();
    t.integer('claim_id').references('id').inTable('claims').onDelete('CASCADE');
    t.string('event_type',50);
    t.text('description');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('workflow_events');
  await knex.schema.dropTableIfExists('documents');
  await knex.schema.dropTableIfExists('claims');
  await knex.schema.dropTableIfExists('carriers');
  await knex.schema.dropTableIfExists('users');
}
