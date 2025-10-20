export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'carriers_name_lower_uniq'
      ) THEN
        CREATE UNIQUE INDEX carriers_name_lower_uniq ON carriers (LOWER(name));
      END IF;
    END$$;
  `);
}
export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS carriers_name_lower_uniq;`);
}
