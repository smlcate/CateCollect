// packages/backend/src/routes/uploads.routes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import knex from '../services/knex.js'; // re-export of ../../db/knexClient.js (or your existing knex service)
import { fileURLToPath } from 'url';

const router = express.Router();

// ---------- Config ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base folder for on-disk storage (relative to project root by default)
const DOCS_ROOT = process.env.DOCS_ROOT || path.join(process.cwd(), 'Claims');

// Allowed extensions (lowercase, no dots)
const ALLOWED_EXTS = (process.env.UPLOAD_ALLOW_EXTS || 'pdf,jpg,jpeg,png,heic,doc,docx,xls,xlsx,txt')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Max file size (in MB)
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 25);
const MAX_BYTES = MAX_MB * 1024 * 1024;

// Multer (memory storage so we can hash before writing to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(file.originalname);
    if (!ext || !ALLOWED_EXTS.includes(ext)) {
      return cb(new Error(`Unsupported extension ".${ext}". Allowed: ${ALLOWED_EXTS.join(', ')}`));
    }
    cb(null, true);
  },
});

// ---------- Helpers ----------
const safe = (s) => String(s || '')
  .normalize('NFKC')
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')   // strip illegal FS chars
  .replace(/\s+/g, ' ')
  .trim();

const extOf = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function findClaimId({ claim_id, claim_number }) {
  if (claim_id) return Number(claim_id);

  if (claim_number) {
    const c = await knex('claims').select('id').where({ claim_number }).first();
    if (c?.id) return c.id;
  }
  return null;
}

// ---------- Route: POST /api/uploads ----------
/**
 * Body fields:
 *  - claim_id (preferred) OR claim_number
 *  - type (string; e.g., 'photos', 'estimate', 'invoice')
 *  - file (multipart)
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    // Validate inputs
    const claimId = await findClaimId({
      claim_id: req.body.claim_id,
      claim_number: req.body.claim_number,
    });
    if (!claimId) return res.status(400).json({ error: 'Missing or invalid claim_id/claim_number' });

    const docType = safe(req.body.type || '');
    if (!docType) return res.status(400).json({ error: 'Missing document type' });

    const file = req.file;
    if (!file?.buffer?.length) return res.status(400).json({ error: 'No file uploaded' });

    const ext = extOf(file.originalname);
    if (!ext || !ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({ error: `Unsupported extension ".${ext}". Allowed: ${ALLOWED_EXTS.join(', ')}` });
    }

    // Compute hash & size for de-dupe
    const fileSha = sha256(file.buffer);
    const sizeBytes = file.size ?? file.buffer.length;

    // De-dupe per-claim based on exact content
    const existing = await knex('documents')
      .select('id', 'filename', 'path')
      .where({ claim_id: claimId, sha256: fileSha })
      .first();

    if (existing) {
      // Log an event (optional) that a duplicate was attempted
      await knex('workflow_events').insert({
        claim_id: claimId,
        type: 'doc_upload_duplicate',
        detail: JSON.stringify({
          type: docType,
          filename: file.originalname,
          sha256: fileSha,
          path: existing.path,
        }),
      });

      return res.status(200).json({
        ok: true,
        dedup: true,
        id: existing.id,
        path: existing.path,
        filename: existing.filename,
        sha256: fileSha,
        size_bytes: sizeBytes,
      });
    }

    // Build target path: Claims/<claim_number or claim_id>/<type>/<timestamp>_<sanitizedName>
    // Prefer claim_number for nicer folders if available
    const claim = await knex('claims').select('claim_number').where({ id: claimId }).first();
    const claimKey = safe(claim?.claim_number || claimId);
    const targetDir = path.join(DOCS_ROOT, claimKey, docType);
    await ensureDir(targetDir);

    const baseName = safe(file.originalname.replace(/\.[^.]+$/, '')) || 'upload';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').replace('Z', '');
    const finalName = `${baseName}_${timestamp}.${ext}`;
    const finalPath = path.join(targetDir, finalName);

    // Write to disk
    await fs.writeFile(finalPath, file.buffer, { flag: 'wx' }).catch(async (e) => {
      // If filename collision somehow happens, try a unique suffix
      if (e?.code === 'EEXIST') {
        const altName = `${baseName}_${timestamp}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        return fs.writeFile(path.join(targetDir, altName), file.buffer, { flag: 'wx' });
      }
      throw e;
    });

    // Store relative path for portability
    const relPath = path.relative(process.cwd(), finalPath);

    // Insert document row
    const inserted = await knex('documents')
      .insert({
        claim_id: claimId,
        type: docType,
        filename: finalName,
        path: relPath,
        sha256: fileSha,
        size_bytes: sizeBytes,
      })
      .returning(['id']);

    const newId = Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted?.id;

    // Log workflow event
    await knex('workflow_events').insert({
      claim_id: claimId,
      type: 'doc_uploaded',
      detail: JSON.stringify({
        type: docType,
        filename: finalName,
        path: relPath,
        sha256: fileSha,
        size_bytes: sizeBytes,
      }),
    });

    return res.status(201).json({
      ok: true,
      id: newId,
      filename: finalName,
      path: relPath,
      sha256: fileSha,
      size_bytes: sizeBytes,
    });
  } catch (err) {
    // Map common PG errors to friendlier HTTP statuses (light version — keep your full errorMw too)
    if (err?.code === '23505') return res.status(409).json({ error: 'Duplicate document' });
    if (err?.code === '23503') return res.status(400).json({ error: 'Invalid reference' });
    return next(err);
  }
});

// Optional: simple ping to confirm limits/allowlist from the UI
router.get('/_config', (_req, res) => {
  res.json({
    ok: true,
    DOCS_ROOT,
    ALLOWED_EXTS,
    MAX_MB,
  });
});

export default router;
