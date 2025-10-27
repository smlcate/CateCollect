/**
 * Tables:
 *  - ccc_files: one row per source file (deduped by checksum)
 *  - ccc_metadata: extracted fields from the file
 */
export async function up(knex) {
  const existsFiles = await knex.schema.hasTable('ccc_files');
  if (!existsFiles) {
    await knex.schema.createTable('ccc_files', (t) => {
      t.increments('id').primary();
      t.string('original_name');
      t.string('stored_path');
      t.string('checksum').unique().index();
      t.bigInteger('size_bytes');
      t.string('ext', 10);
      t.timestamp('processed_at');
      t.text('error');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  const existsMeta = await knex.schema.hasTable('ccc_metadata');
  if (!existsMeta) {
    await knex.schema.createTable('ccc_metadata', (t) => {
      t.increments('id').primary();
      t
        .integer('file_id')
        .unsigned()
        .references('id')
        .inTable('ccc_files')
        .onDelete('CASCADE');
      t.string('claim_number');
      t.string('customer_name');
      t.string('vehicle_vin');
      t.string('total_amount');
      t.text('raw_preview');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ccc_metadata');
  await knex.schema.dropTableIfExists('ccc_files');
}
