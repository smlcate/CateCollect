import { XMLParser } from 'fast-xml-parser';

export function extractFromXml(text){
  const p = new XMLParser({
    ignoreDeclaration: true,
    trimValues: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    allowBooleanAttributes: true,
    parseTagValue: true,
  });

  let raw = null;
  try { raw = p.parse(text); } catch {}

  const pick = (...paths) => {
    for (const path of paths) {
      let v = raw;
      for (const k of path.split('.')) v = v?.[k];
      if (v != null && v !== '') return String(v);
    }
    return null;
  };

  const claim_number = pick('claim.claim_number','Claim.ClaimNumber','root.claimNumber','estimate.claimID');
  const vin          = pick('claim.vin','Claim.Vehicle.VIN','root.VIN','estimate.vehicle.VIN');
  const ro_number    = pick('claim.ro_number','Claim.RepairOrderNumber','root.roNumber');
  const customer     = pick('claim.customer_name','Claim.Customer.Name','root.customer','estimate.customer.name');
  const amtRaw       = pick('claim.total_amount','Claim.TotalAmount','estimate.totals.grandTotal');
  const total_amount = amtRaw != null ? Number(String(amtRaw).replace(/[^0-9.]/g,'')) : null;

  return {
    claim_number,
    vin,
    ro_number,
    customer_name: customer,
    total_amount: Number.isFinite(total_amount) ? total_amount : null,
    raw_json: raw ? JSON.stringify(raw) : null,
  };
}
