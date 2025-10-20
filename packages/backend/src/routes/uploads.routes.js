// packages/backend/src/routes/uploads.routes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const router = Router();

// --- Config ---
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 25);
const MAX_BYTES = MAX_MB * 1024 * 1024;

// Where EMS/XML get dropped for the ingest worker
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
// Optional “documents” root for non-EMS files
const DOCS_ROOT   = process.env.DOCS_ROOT   || path.join(process.cwd(), 'Claims');

const ALLOWED_EXTS = new Set([
  'ems','xml',
  'pdf','jpg','jpeg','png','heic',
  'doc','docx','xls','xlsx','txt'
]);

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

// --- Multer (buffer to memory, we write to disk) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

// --- Diagnostics ---
router.get('/_config', async (_req, res) => {
  res.json({
    ok: true,
    DOCS_ROOT,
    INCOMING_DIR,
    MAX_MB,
    ALLOWED_EXTS: [...ALLOWED_EXTS]
  });
});

// --- Upload endpoint ---
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    // Multer errors -> friendly JSON
    if (err) {
      const code = err.code || 'UPLOAD_ERROR';
      if (code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ ok: false, error: 'File too large', limitMB: MAX_MB });
      }
      return res.status(400).json({ ok: false, error: String(err.message || err), code });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Missing file field "file"' });
      }

      const original = req.file.originalname || 'upload.bin';
      const ext = path.extname(original).slice(1).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        return res.status(415).json({ ok: false, error: `Extension ".${ext}" not allowed`, allowed: [...ALLOWED_EXTS] });
      }

      // Decide destination
      const isEms = ext === 'ems' || ext === 'xml';
      const destDir = isEms ? INCOMING_DIR : path.join(DOCS_ROOT, 'Unassigned');

      await ensureDir(destDir);

      // Stable-ish filename: timestamp + short hash + cleaned original
      const h = sha256(req.file.buffer).slice(0, 12);
      const base = cleanName(original);
      const filename = `${Date.now()}_${h}_${base}`.slice(0, 180); // keep it sane
      const destPath = path.join(destDir, filename);

      await fs.writeFile(destPath, req.file.buffer);

      // Response
      return res.json({
        ok: true,
        saved: destPath,
        kind: isEms ? 'ingest-incoming' : 'docs-unassigned',
        bytes: req.file.size,
        name: original
      });
    } catch (e) {
      console.error('[uploads] error:', e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
});

export default router;
