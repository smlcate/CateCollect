// packages/backend/src/routes/uploads.routes.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import multer from 'multer';

const router = Router();

// --- Config ---
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 25);
const MAX_BYTES = MAX_MB * 1024 * 1024;

// Where EMS/XML get dropped for the ingest worker
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
// Optional “documents” root for non-EMS files
const DOCS_ROOT   = process.env.DOCS_ROOT   || path.join(process.cwd(), 'Claims');

const ALLOWED_EXTS = new Set(['ems','xml','awf','pdf','jpg','jpeg','png','heic','doc','docx','xls','xlsx','txt']);

// --- Helpers ---
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function cleanName(name) {
  // keep ascii-ish, spaces->_, no path separators
  return name.replace(/[^\w.\-+ ]+/g, '_').replace(/\s+/g, '_');
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage() });

export default function uploadsRoutes() {
  const router = express.Router();

  const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
  const DOCS_ROOT    = process.env.DOCS_ROOT    || path.join(process.cwd(), 'Claims');
  const UNASSIGNED   = path.join(DOCS_ROOT, 'Unassigned');
  const DEFAULT_SCOPE = (process.env.UPLOAD_DEFAULT_SCOPE || 'ingest').toLowerCase();

  const ensureDir = (d) => fs.mkdir(d, { recursive: true });
  const stamp = (orig) => {
    const ts = Date.now();
    const rnd = crypto.randomBytes(6).toString('hex');
    const safe = String(orig || 'upload.bin').replace(/[^\w.\-+@ ]/g, '_');
    return `${ts}_${rnd}_${safe}`;
  };

  router.post('/', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' });

      const scopeParam = String(req.query.scope || '').toLowerCase();
      const referer = String(req.get('referer') || '');

      // Decide destination
      let destKind = 'ingest-incoming';
      let destDir  = INCOMING_DIR;

      if (scopeParam === 'docs') {
        destKind = 'docs-unassigned'; destDir = UNASSIGNED;
      } else if (scopeParam === 'ingest') {
        destKind = 'ingest-incoming'; destDir = INCOMING_DIR;
      } else if (referer.includes('/ingest/upload')) {
        destKind = 'ingest-incoming'; destDir = INCOMING_DIR;
      } else if (DEFAULT_SCOPE === 'docs') {
        destKind = 'docs-unassigned'; destDir = UNASSIGNED;
      }

      await ensureDir(destDir);
      const fname = stamp(req.file.originalname);
      const full = path.join(destDir, fname);
      await fs.writeFile(full, req.file.buffer);

      res.json({
        ok: true,
        saved: full.replace(process.cwd(), '/app'), // clearer in responses
        kind: destKind,
        bytes: req.file.size,
        name: req.file.originalname || 'upload',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
