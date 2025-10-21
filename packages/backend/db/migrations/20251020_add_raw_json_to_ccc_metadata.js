export async function up(knex){
  const has = await knex.schema.hasColumn('ccc_metadata','raw_json');
  if(!has){ await knex.schema.alterTable('ccc_metadata', t=> t.jsonb('raw_json')); }
}
export async function down(knex){
  const has = await knex.schema.hasColumn('ccc_metadata','raw_json');
  if(has){ await knex.schema.alterTable('ccc_metadata', t=> t.dropColumn('raw_json')); }
}
