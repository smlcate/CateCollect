// packages/backend/src/routes/uploads.routes.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../services/knex.js';
import { logEvent } from '../services/events.js';

const r = Router();

// Default storage root: "<cwd>/Claims"
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'Claims');

// Multer in-memory; we write to disk ourselves
const upload = multer({ storage: multer.memoryStorage() });

async function resolveClaim({ claim_id, claim_number }) {
  if (claim_id) return db('claims').where({ id: claim_id }).first();
  if (claim_number) return db('claims').where({ claim_number }).first();
  return null;
}

function safeBaseName(name) {
  return path.basename(String(name || '').trim());
}

r.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { claim_id, claim_number } = req.body;
    let { type } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'file is required' });
    if (!type) return res.status(400).json({ error: 'type is required' });

    const claim = await resolveClaim({ claim_id, claim_number });
    if (!claim) return res.status(400).json({ error: 'Claim not found' });

    const safeType = String(type).trim().toLowerCase();
    const fileName = safeBaseName(file.originalname || `${safeType}-${Date.now()}`);

    // <STORAGE_ROOT>/<CLAIM_NUMBER>/<type>/<filename>
    const baseDir = path.join(STORAGE_ROOT, claim.claim_number, safeType);
    fs.mkdirSync(baseDir, { recursive: true });

    const target = path.join(baseDir, fileName);
    fs.writeFileSync(target, file.buffer);

    // UPSERT by named constraint (one-doc-per-type per claim)
    const upsertSql = `
      INSERT INTO documents (claim_id, type, filename, filepath, status, uploaded_at)
      VALUES (?, LOWER(?), ?, ?, 'uploaded', NOW())
      ON CONFLICT ON CONSTRAINT documents_claim_type_uniq
      DO UPDATE SET
        filename = EXCLUDED.filename,
        filepath = EXCLUDED.filepath,
        status   = 'uploaded',
        uploaded_at = NOW()
      RETURNING *;
    `;
    const { rows } = await db.raw(upsertSql, [claim.id, safeType, fileName, target]);
    const row = rows[0];

    // Log workflow event
    await logEvent({
      claim_id: claim.id,
      type: 'doc_uploaded',
      detail: {
        type: safeType,
        stored_as: target,
        original: file?.originalname || null,
        size: file?.size || null
      }
    });

    return res.status(201).json(row);
  } catch (e) {
    return next(e);
  }
});

export default r;
