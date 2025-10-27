// packages/backend/db/migrations/20251019_ensure_ingest_columns.js

/**
 * Ensures ingest-related columns exist so /api/ingest/files can select them safely.
 * Adds to:
 *   - ccc_files: sha256, processed_at
 *   - ccc_metadata: claim_number, vin, ro_number, customer_name, total_amount
 *
 * Safe to run multiple times; uses hasColumn checks.
 */

export async function up(knex) {
  const addCol = async (table, column, cb) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (!exists) {
      await knex.schema.alterTable(table, cb);
    }
  };

  // ccc_files
  await addCol('ccc_files', 'sha256',     t => t.string('sha256', 64));
  await addCol('ccc_files', 'processed_at', t =>
    t.timestamp('processed_at', { useTz: true }).defaultTo(knex.fn.now())
  );

  // ccc_metadata
  await addCol('ccc_metadata', 'claim_number',  t => t.string('claim_number'));
  await addCol('ccc_metadata', 'vin',           t => t.string('vin'));
  await addCol('ccc_metadata', 'ro_number',     t => t.string('ro_number'));
  await addCol('ccc_metadata', 'customer_name', t => t.string('customer_name'));
  await addCol('ccc_metadata', 'total_amount',  t => t.decimal('total_amount', 12, 2));

  // Optional: simple indexes for lookup (safe if columns were just added)
  // If columns already existed, this will just create indexes now.
  await knex.schema.alterTable('ccc_metadata', t => {
    t.index(['claim_number'], 'ccc_metadata_claim_number_idx');
    t.index(['vin'],          'ccc_metadata_vin_idx');
  });
}

export async function down(knex) {
  const dropCol = async (table, column) => {
    const exists = await knex.schema.hasColumn(table, column);
    if (exists) {
      await knex.schema.alterTable(table, t => t.dropColumn(column));
    }
  };

  // Drop metadata columns (indexes drop automatically with columns)
  await dropCol('ccc_metadata', 'total_amount');
  await dropCol('ccc_metadata', 'customer_name');
  await dropCol('ccc_metadata', 'ro_number');
  await dropCol('ccc_metadata', 'vin');
  await dropCol('ccc_metadata', 'claim_number');

  // Drop files columns
  await dropCol('ccc_files', 'processed_at');
  await dropCol('ccc_files', 'sha256');
}
