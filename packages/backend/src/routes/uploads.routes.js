// packages/backend/src/routes/uploads.routes.js (ESM)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multer in-memory; we’ll write the file ourselves
const upload = multer({ storage: multer.memoryStorage() });

export default function uploadsRoutes() {
  const router = express.Router();

  // Resolve dirs
  const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
  const DOCS_ROOT    = process.env.DOCS_ROOT    || path.join(process.cwd(), 'Claims');
  const UNASSIGNED   = path.join(DOCS_ROOT, 'Unassigned');

  async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
  }

  function stampName(orig) {
    const ts = Date.now();
    const rnd = crypto.randomBytes(6).toString('hex');
    const safe = String(orig || 'upload.bin').replace(/[^\w.\-+@ ]/g, '_');
    return `${ts}_${rnd}_${safe}`;
  }

  // POST /api/uploads
  // Use ?scope=ingest to force ingest inbox, or ?scope=docs to go to Claims/Unassigned
  // If the Referer points to /ingest/upload, we default to ingest.
  router.post('/', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' });

      const scopeParam = String(req.query.scope || '').toLowerCase();
      const referer = String(req.get('referer') || '');
      const fromIngestUI = referer.includes('/ingest/upload');

      // Decide destination
      let destKind = 'ingest-incoming';
      let destDir = INCOMING_DIR;
      if (scopeParam === 'docs') {
        destKind = 'docs-unassigned';
        destDir = UNASSIGNED;
      } else if (scopeParam === 'ingest') {
        destKind = 'ingest-incoming';
        destDir = INCOMING_DIR;
      } else if (!fromIngestUI) {
        // default to docs only if NOT coming from the ingest upload UI
        destKind = 'docs-unassigned';
        destDir = UNASSIGNED;
      }

      await ensureDir(destDir);

      const fname = stampName(req.file.originalname);
      const full = path.join(destDir, fname);
      await fs.writeFile(full, req.file.buffer);

      return res.json({
        ok: true,
        saved: full.replace(process.cwd(), '/app'), // present container path
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
