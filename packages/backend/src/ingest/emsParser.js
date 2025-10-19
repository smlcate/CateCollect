// Minimal CCC EMS/XML parser (best-effort).
// - XML: tries common CCC-style nodes
// - EMS: regex-based extraction (VIN, claim, name, total)

import fs from 'fs/promises';
import { parseStringPromise } from 'xml2js';

const preview = (txt, n = 600) => (txt || '').slice(0, n);

export async function parseCCCFile(fullPath) {
  const raw = await fs.readFile(fullPath, 'utf8');
  const isXml = fullPath.toLowerCase().endsWith('.xml');

  const meta = {
    claim_number: null,
    customer_name: null,
    vehicle_vin: null,
    total_amount: null,
    raw_preview: preview(raw),
  };

  if (isXml) {
    try {
      const obj = await parseStringPromise(raw, { explicitArray: false });
      // These paths are common but may vary by CCC export version/vendor
      const claim =
        obj?.RepairOrder?.Claim?.ClaimNumber ||
        obj?.Estimate?.ClaimInfo?.ClaimNumber ||
        obj?.Workfile?.Claim?.Number;

      const name =
        obj?.RepairOrder?.Customer?.Name ||
        obj?.Estimate?.CustomerInfo?.CustomerName ||
        obj?.Workfile?.Customer?.Name;

      const vin =
        obj?.RepairOrder?.Vehicle?.VIN ||
        obj?.Estimate?.VehicleInfo?.VIN ||
        obj?.Workfile?.Vehicle?.VIN;

      const total =
        obj?.RepairOrder?.Totals?.GrandTotal ||
        obj?.Estimate?.Totals?.GrandTotal ||
        obj?.Workfile?.Totals?.GrandTotal;

      if (claim) meta.claim_number = String(claim).trim();
      if (name) meta.customer_name = String(name).trim();
      if (vin) meta.vehicle_vin = String(vin).trim();
      if (total) meta.total_amount = String(total).trim();
      return meta;
    } catch {
      // fall through to EMS-style parsing
    }
  }

  // EMS-style (line-oriented key|value pairs) heuristic extraction
  {
    const vin = raw.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vin) meta.vehicle_vin = vin[1];

    const claim = raw.match(/CL[MA]?\|[^\r\n]*?\|([^|\r\n]+)/i);
    if (claim) meta.claim_number = claim[1].trim();

    const name = raw.match(/NAM\|([^|\r\n]+)\|([^|\r\n]+)/i); // NAM|Last|First
    if (name) meta.customer_name = `${name[2]} ${name[1]}`.trim();

    const tot = raw.match(/TOT\|[^|\r\n]*\|([^|\r\n]+)/i);
    if (tot) meta.total_amount = tot[1].trim();
  }
  return meta;
}
