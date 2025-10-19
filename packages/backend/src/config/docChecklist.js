// Comma-separated in env: REQUIRED_DOC_TYPES=estimate,photos,invoice
export const REQUIRED_DOC_TYPES = (process.env.REQUIRED_DOC_TYPES || 'estimate,photos,invoice')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
