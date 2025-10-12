export const TYPE_RULES = [
  { type: 'estimate',   match: /est(imate)?/i },
  { type: 'photos',     match: /photo|img|pics?/i },
  { type: 'invoices',   match: /inv(oice)?|receipt/i },
  { type: 'supplement', match: /supp(lement)?/i },
  { type: 'oem_docs',   match: /oem|procedure|repair[-_ ]?proc/i },
  { type: 'pre_scan',   match: /pre[-_ ]?scan|pre[-_ ]?cal/i },
  { type: 'post_scan',  match: /post[-_ ]?scan|post[-_ ]?cal/i }
];

// Fallback if none matched:
export const DEFAULT_TYPE = 'misc';
