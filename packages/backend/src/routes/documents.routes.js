import { Router } from 'express';
import db from '../services/knex.js';
import { logEvent } from '../services/events.js';

const r = Router();

function normType(t) { return String(t || '').trim().toLowerCase(); }

async function resolveClaimId({ claim_id, claim_number }) {
  if (claim_id) return Number(claim_id);
  if (!claim_number) return null;
  const c = await db('claims').where({ claim_number }).first();
  return c?.id || null;
}

r.get('/', async (req, res, next) => {
  try {
    const { claim_id, claim_number } = req.query;
    let cid = await resolveClaimId({ claim_id, claim_number });
    let q = db('documents').select('*').orderBy('uploaded_at','desc');
    if (cid) q = q.where({ claim_id: cid });
    res.json(await q);
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    let { claim_id, claim_number, type, filename, filepath, status } = req.body;
    const cid = await resolveClaimId({ claim_id, claim_number });
    if (!cid) return res.status(400).json({ error: 'claim_id or claim_number is required' });

    const docType = normType(type);
    if (!docType || !filename || !filepath) {
      return res.status(400).json({ error: 'type, filename, filepath are required' });
    }

    const [row] = await db('documents')
      .insert({ claim_id: cid, type: docType, filename, filepath, status: status || 'uploaded' })
      .returning('*');

    await logEvent({
      claim_id: row.claim_id,
      type: 'doc_registered',
      detail: { id: row.id, type: row.type, filename: row.filename }
    });

    res.status(201).json(row);
  } catch (e) { next(e); }
});

r.post('/bulk', async (req, res, next) => {
  try {
    const { claim_id, claim_number, docs } = req.body;
    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ error: 'docs[] is required' });
    }
    const cid = await resolveClaimId({ claim_id, claim_number });
    if (!cid) return res.status(400).json({ error: 'claim_id or claim_number is required' });

    const rows = await db('documents')
      .insert(docs.map(d => ({
        claim_id: cid,
        type: normType(d.type),
        filename: d.filename,
        filepath: d.filepath,
        status: d.status || 'uploaded'
      })))
      .returning('*');

    await logEvent({
      claim_id: claim.id,
      type: 'doc_registered',
      detail: { bulk: true, count: docs.length, types: docs.map(d => d.type) }
    });


    res.status(201).json(rows);
  } catch (e) { next(e); }
});

export default r;
