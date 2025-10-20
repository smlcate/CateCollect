export async function up(knex) {
  const add = async (tbl, col, def) => {
    const has = await knex.schema.hasColumn(tbl, col);
    if (!has) await knex.schema.alterTable(tbl, def);
  };

  // Columns (safe to re-run)
  await add('ccc_files','processed_at',
    t => t.timestamp('processed_at', { useTz: true }).defaultTo(knex.fn.now())
  );

  await add('ccc_metadata','claim_number',  t => t.string('claim_number'));
  await add('ccc_metadata','vin',           t => t.string('vin'));
  await add('ccc_metadata','ro_number',     t => t.string('ro_number'));
  await add('ccc_metadata','customer_name', t => t.string('customer_name'));
  await add('ccc_metadata','total_amount',  t => t.decimal('total_amount', 12, 2));

  // Idempotent indexes (Postgres)
  await knex.raw('CREATE INDEX IF NOT EXISTS ccc_metadata_claim_number_idx ON ccc_metadata (claim_number)');
  await knex.raw('CREATE INDEX IF NOT EXISTS ccc_metadata_vin_idx ON ccc_metadata (vin)');
}

export async function down(knex) {
  // Drop indexes only if present
  await knex.raw('DROP INDEX IF EXISTS ccc_metadata_claim_number_idx');
  await knex.raw('DROP INDEX IF EXISTS ccc_metadata_vin_idx');

  // Drop columns if present
  const drop = async (tbl, col) => {
    const has = await knex.schema.hasColumn(tbl, col);
    if (has) await knex.schema.alterTable(tbl, t => t.dropColumn(col));
  };

  await drop('ccc_metadata','total_amount');
  await drop('ccc_metadata','customer_name');
  await drop('ccc_metadata','ro_number');
  await drop('ccc_metadata','vin');
  await drop('ccc_metadata','claim_number');
  await drop('ccc_files','processed_at');
}
