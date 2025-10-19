import express from 'express';
import knex from '../services/knex.js';
import { REQUIRED_DOC_TYPES } from '../config/docChecklist.js';

const router = express.Router();

// GET /api/claims/:id/checklist
router.get('/:id/checklist', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid claim id' });

    const docs = await knex('documents')
      .select('type')
      .count({ count: '*' })
      .where({ claim_id: id })
      .groupBy('type');

    const have = Object.fromEntries(docs.map(d => [String(d.type).toLowerCase(), Number(d.count)]));
    const items = REQUIRED_DOC_TYPES.map(t => ({
      type: t,
      count: have[t] || 0,
      required: true,
      ok: (have[t] || 0) > 0,
    }));

    const totalRequired = items.length;
    const done = items.filter(x => x.ok).length;

    res.json({ ok: true, claim_id: id, done, totalRequired, items });
  } catch (e) {
    next(e);
  }
});

export default router;
