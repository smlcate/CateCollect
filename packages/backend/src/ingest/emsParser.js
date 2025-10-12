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
      const xml = await parseStringPromise(raw, { explicitArray: false, ignoreAttrs: false });

      const claim   = xml?.Estimate?.Claim   || xml?.Claim   || {};
      const insured = xml?.Estimate?.Insured || xml?.Insured || {};
      const vehicle = xml?.Estimate?.Vehicle || xml?.Vehicle || {};
      const totals  = xml?.Estimate?.Totals  || xml?.Totals  || {};

      meta.claim_number = claim?.ClaimNumber || xml?.Estimate?.Header?.ClaimNumber || null;
      meta.customer_name =
        insured?.Name || [insured?.FirstName, insured?.LastName].filter(Boolean).join(' ') || null;
      meta.vehicle_vin = vehicle?.VIN || vehicle?.Vin || null;
      meta.total_amount = totals?.GrandTotal || totals?.TotalAmount || null;
    } catch (_) {
      // leave best-effort meta + raw_preview
    }
  } else {
    // EMS heuristics
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
