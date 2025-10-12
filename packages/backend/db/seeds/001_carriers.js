export async function seed(knex) {
  await knex('carriers').del();
  await knex('carriers').insert([
    {
      name: 'Progressive',
      config: {
        required_docs: ['estimate','supplement','photos','invoices'],
        rules: { supplements: 'must_be_preapproved', invoices: 'required_for_all_oem' },
        submission: 'CCC Secure Share'
      }
    },
    {
      name: 'USAA',
      config: {
        required_docs: ['estimate','supplement','photos','invoices','oem_docs','pre_scan','post_scan'],
        rules: { supplements: 'attach_oem_docs', adas: 'calibration_docs_required' },
        submission: 'CCC Secure Share'
      }
    },
    {
      name: 'State Farm',
      config: {
        required_docs: ['estimate','supplement','photos','invoices'],
        rules: { aftermarket_parts: 'discouraged', oem_required_for: ['safety','structural'] },
        submission: 'Secure Share or Portal'
      }
    }
  ]);
}
