/**
 * Ensure a unique index on ccc_metadata(file_id) so
 *   .insert(...).onConflict('file_id').merge(...)
 * works without error.
 */
export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM   pg_indexes
        WHERE  schemaname = 'public'
        AND    indexname = 'ccc_metadata_file_id_key'
      ) THEN
        CREATE UNIQUE INDEX ccc_metadata_file_id_key ON ccc_metadata(file_id);
      END IF;
    END$$;
  `);
}

export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ccc_metadata_file_id_key;`);
}
