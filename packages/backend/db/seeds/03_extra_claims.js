// More claims for testing
export async function seed(knex) {
  const carriers = await knex('carriers').select('id', 'name');
  if (!carriers.length) {
    console.warn('No carriers found. Run 01_carriers.js seed first.');
    return;
  }

  const carrierByName = {};
  carriers.forEach(c => { carrierByName[c.name] = c.id; });

  const claims = [
    { claim_number: 'CLM4001', customer_name: 'Chris Alpha', carrier_id: carrierByName['Progressive'], status: 'Intake' },
    { claim_number: 'CLM4002', customer_name: 'Morgan Beta', carrier_id: carrierByName['USAA'], status: 'Estimate Submitted' },
    { claim_number: 'CLM4003', customer_name: 'Jamie Gamma', carrier_id: carrierByName['State Farm'], status: 'Repair In Progress' },
    { claim_number: 'CLM4004', customer_name: 'Taylor Delta', carrier_id: carrierByName['Progressive'], status: 'Awaiting Supplements' },
    { claim_number: 'CLM4005', customer_name: 'Jordan Epsilon', carrier_id: carrierByName['USAA'], status: 'Complete' },
  ];

  for (const c of claims) {
    const [row] = await knex('claims')
      .insert(c)
      .onConflict(['claim_number']).ignore()
      .returning('*');

    if (row) {
      console.log(`Inserted claim ${row.claim_number}`);
    }
  }
}
