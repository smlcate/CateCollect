import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import axios from 'axios';
import FormData from 'form-data';
import mime from 'mime-types';
import dotenv from 'dotenv';

dotenv.config();

const WATCH_DIR = path.resolve(process.cwd(), process.env.WATCH_DIR || './incoming');
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4000';
const CLAIM_REGEX = new RegExp(process.env.CLAIM_REGEX || '\\bCLM\\d+\\b', 'i');
const PROCESSED_DIR = process.env.PROCESSED_DIR || '_Processed';
const FAILED_DIR = process.env.FAILED_DIR || '_Failed';

console.log('[worker] Watching:', WATCH_DIR);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function claimFromName(name) {
  const m = String(name).match(CLAIM_REGEX);
  return m ? m[0].toUpperCase() : null;
}

// filename → doc type mapping (case-insensitive)
const TYPE_RULES = [
  { re: /(pre[_-]?scan|pre[_-]?diag)/i, type: 'pre_scan' },
  { re: /(post[_-]?scan|post[_-]?diag)/i, type: 'post_scan' },
  { re: /(oem[_-]?docs?|procedures?|oem)/i, type: 'oem_docs' },
  { re: /(supp(lement)?)/i, type: 'supplement' },
  { re: /(invoice|inv)/i, type: 'invoices' },
  { re: /(photo|img|pictures?|camera|gallery|photos)/i, type: 'photos' },
  { re: /(estimate|est)/i, type: 'estimate' },
];

// infer doc type from a filename
function typeFromName(name) {
  const base = path.basename(name);
  for (const rule of TYPE_RULES) {
    if (rule.re.test(base)) return rule.type;
  }
  // default: try file extension hint for photos zip/jpg
  const ext = path.extname(base).toLowerCase();
  if (ext === '.zip' || ext === '.jpg' || ext === '.jpeg' || ext === '.png') return 'photos';
  return null;
}

async function uploadFile({ claim_number, type, absPath }) {
  const stat = fs.statSync(absPath);
  const stream = fs.createReadStream(absPath);
  const form = new FormData();
  form.append('claim_number', claim_number);
  form.append('type', type);
  form.append('file', stream, {
    filename: path.basename(absPath),
    contentType: mime.lookup(absPath) || 'application/octet-stream'
  });

  const url = `${API_BASE}/api/uploads`;
  const resp = await axios.post(url, form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity });
  return resp.data;
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function moveFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
}

async function handleFile(absPath) {
  const name = path.basename(absPath);

  // wait for file to settle (avoid partial writes)
  await sleep(300);

  // skip temp/hidden files
  if (/^\./.test(name) || name.endsWith('.part') || name.endsWith('.tmp')) return;

  const claim_number = claimFromName(name);
  const type = typeFromName(name);

  if (!claim_number) throw new Error(`No claim number found in "${name}"`);
  if (!type) throw new Error(`Could not determine document type for "${name}"`);

  console.log(`[worker] → ${name} => claim:${claim_number} type:${type}`);

  const data = await uploadFile({ claim_number, type, absPath });
  console.log(`[worker] ✓ uploaded as ${type} for ${claim_number} (id:${data?.id})`);

  // Move to processed folder: incoming/_Processed/CLMXXXX/<type>/<file>
  const processedDest = path.join(WATCH_DIR, PROCESSED_DIR, claim_number, type, name);
  moveFile(absPath, processedDest);
}

function failFile(absPath, err) {
  const name = path.basename(absPath);
  const failedDest = path.join(WATCH_DIR, FAILED_DIR, name);
  ensureDir(path.dirname(failedDest));
  try {
    fs.renameSync(absPath, failedDest);
  } catch (_) {}
  console.error('[worker] ✗ failed', name, '-', err.message || err);
}

(async function main() {
  ensureDir(WATCH_DIR);
  console.log('[worker] Ready. Drop files named like "CLM4001-estimate.pdf", "CLM4002-photos.zip", etc.');

  const watcher = chokidar.watch(WATCH_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 0, // watch just the incoming root
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
  });

  watcher.on('add', async (filePath) => {
    try { await handleFile(filePath); }
    catch (e) { failFile(filePath, e); }
  });

  watcher.on('error', (err) => console.error('[worker] watcher error', err));
})();
