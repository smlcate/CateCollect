/**
 * Adds multiple claims with different document completion states.
 * Safe to re-run: it checks for existing claim_numbers.
 */
export async function seed(knex) {
  // helper to get carrier id by name
  async function carrierId(name) {
    const row = await knex('carriers').whereRaw('lower(name)=lower(?)', [name]).first();
    if (!row) throw new Error(`Carrier not found: ${name}`);
    return row.id;
  }

  const carriers = {
    Progressive: await carrierId('Progressive'),
    USAA: await carrierId('USAA'),
    'State Farm': await carrierId('State Farm'),
    Allstate: await carrierId('Allstate').catch(() => null),
  };

  const claims = [
    // Complete(ish)
    { claim_number: 'CLM3001', customer_name: 'Riley Motorist', carrier_name: 'USAA', status: 'In Progress' },
    // Partial
    { claim_number: 'CLM3002', customer_name: 'Alex Driver', carrier_name: 'Progressive', status: 'Intake' },
    // Nearly complete (missing scans)
    { claim_number: 'CLM3003', customer_name: 'Jesse Wheeler', carrier_name: 'State Farm', status: 'Estimating' },
    // Empty (no docs yet)
    { claim_number: 'CLM3004', customer_name: 'Casey Parker', carrier_name: 'USAA', status: 'Intake' },
    // Few docs
    { claim_number: 'CLM3005', customer_name: 'Morgan Lane', carrier_name: 'Progressive', status: 'Repair' },
  ];

  // upsert-ish: insert if not exists
  const inserted = [];
  for (const c of claims) {
    const carrier_id = carriers[c.carrier_name];
    if (!carrier_id) continue;
    let row = await knex('claims').where({ claim_number: c.claim_number }).first();
    if (!row) {
      const [id] = await knex('claims')
        .insert({ claim_number: c.claim_number, customer_name: c.customer_name, carrier_id, status: c.status })
        .returning('id');
      row = { id: typeof id === 'object' ? id.id : id };
    }
    inserted.push({ id: row.id, claim_number: c.claim_number, carrier_name: c.carrier_name });
  }

  // documents per claim to create varied states
  function doc(claim_number, type, filename) {
    return knex('documents').insert({
      claim_id: knex('claims').select('id').where({ claim_number }).first(),
      type,
      filename: filename || `${claim_number}_${type}.pdf`,
      filepath: `/Claims/${claim_number}/${type}/${filename || (claim_number + '_' + type + '.pdf')}`,
      status: 'uploaded',
      uploaded_at: knex.fn.now(),
    }).onConflict(['claim_id','type']).ignore();
  }

  // CLM3001 (USAA): estimate + supplement + invoices + oem_docs + pre + post
  await doc('CLM3001','estimate');
  await doc('CLM3001','supplement');
  await doc('CLM3001','invoices');
  await doc('CLM3001','oem_docs');
  await doc('CLM3001','pre_scan');
  await doc('CLM3001','post_scan');

  // CLM3002 (Progressive): estimate only
  await doc('CLM3002','estimate');

  // CLM3003 (State Farm): everything except scans
  await doc('CLM3003','estimate');
  await doc('CLM3003','photos');
  await doc('CLM3003','invoices');
  await doc('CLM3003','supplement');

  // CLM3004 (USAA): none

  // CLM3005 (Progressive): estimate + photos
  await doc('CLM3005','estimate');
  await doc('CLM3005','photos');

  console.log('[seed:02_more_claims] inserted/ensured claims:', inserted.map(c => c.claim_number).join(', '));
}
