// Minimal AWF parser: treat .awf as a ZIP, look for any XML inside,
// pull a few common fields (VIN / RO / Claim / Customer / Total).
// Falls back to scraping a VIN from *.veh/*.ven/*.txt when no XML.
//
// Runtime deps used here already exist in the image: adm-zip, fast-xml-parser

import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export function parseAwfBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const result = {
    files: entries.map(e => e.entryName),
    xmlDetected: false,
    xmlParseError: null,
    inferred: {
      vin: undefined,
      ro_number: undefined,
      claim_number: undefined,
      customer_name: undefined,
      total_amount: undefined
    }
  };

  // Try the first XML inside the AWF (common in many CCC AWFs)
  const xmlEntry = entries.find(e => /\.xml$/i.test(e.entryName));
  if (xmlEntry) {
    result.xmlDetected = true;
    const xml = xmlEntry.getData().toString('utf8');
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      const doc = parser.parse(xml);

      // Heuristic roots found in CIECA/BMS-ish or vendor-ish payloads
      const root = doc.CIECA || doc.IEBMS || doc.Estimate || doc.RepairOrder || doc;

      // Vehicles
      const veh =
        root?.Vehicle ||
        root?.RepairOrder?.Vehicle ||
        root?.AdminInfo?.Vehicle ||
        (root?.VIN ? { VIN: root.VIN } : undefined);

      // Claim
      const claim =
        root?.ClaimInfo ||
        root?.RepairOrder?.ClaimInfo ||
        root?.AdminInfo?.ClaimInfo;

      // Party / customer
      const parties = root?.Parties || root?.RepairOrder?.Parties || root?.Customer;
      const name =
        parties?.Owner?.PersonInfo
          ? `${parties.Owner.PersonInfo.FirstName || ''} ${parties.Owner.PersonInfo.LastName || ''}`.trim()
          : (root?.CustomerName || undefined);

      // Totals
      const total =
        root?.Totals?.GrandTotal ??
        root?.Summary?.GrandTotal ??
        root?.EstimateTotals?.GrandTotal ??
        undefined;

      result.inferred = {
        vin: veh?.VIN || veh?.VINNum || veh?.VINNumber || undefined,
        ro_number: root?.RONumber || root?.RepairOrder?.RONumber || root?.RO || undefined,
        claim_number: claim?.ClaimNum || claim?.ClaimNumber || root?.ClaimNumber || undefined,
        customer_name: name || undefined,
        total_amount: typeof total === 'string' || typeof total === 'number' ? String(total) : undefined
      };
    } catch (e) {
      result.xmlParseError = e.message;
    }
  }

  // Fallback VIN scrape from simple texty sidecars
  if (!result.inferred.vin) {
    const txtEntry = entries.find(e => /\.(veh|ven|txt)$/i.test(e.entryName));
    if (txtEntry) {
      const txt = txtEntry.getData().toString('utf8');
      const m = txt.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
      if (m) result.inferred.vin = m[1];
    }
  }

  return result;
}
