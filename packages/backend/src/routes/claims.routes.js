import { Router } from 'express';
import db from '../services/knex.js';
import { logEvent } from '../services/events.js';

const r = Router();

/** GET /api/claims  (optional ?id=, ?carrier_id=) */
r.get('/', async (req, res, next) => {
  try {
    const { id, carrier_id } = req.query;
    let q = db('claims as c')
      .leftJoin('carriers as ca', 'ca.id', 'c.carrier_id')
      .select('c.*', 'ca.name as carrier_name')
      .orderBy('c.created_at', 'desc');
    if (id) q = q.where('c.id', id);
    if (carrier_id) q = q.where('c.carrier_id', carrier_id);
    res.json(await q);
  } catch (e) { next(e); }
});

/** GET /api/claims/:id */
r.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await db('claims as c')
      .leftJoin('carriers as ca', 'ca.id', 'c.carrier_id')
      .select('c.*', 'ca.name as carrier_name')
      .where('c.id', id)
      .first();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

/** POST /api/claims  (accepts carrier_id or carrier_name) */
r.post('/', async (req, res, next) => {
  try {
    const { claim_number, customer_name, carrier_id, carrier_name, status } = req.body;
    if (!claim_number) return res.status(400).json({ error: 'claim_number is required' });

    let resolvedCarrierId = carrier_id;
    if (!resolvedCarrierId) {
      if (!carrier_name) return res.status(400).json({ error: 'Provide either carrier_id or carrier_name' });
      const carrier = await db('carriers')
        .whereRaw('LOWER(name) = LOWER(?)', [carrier_name])
        .first();
      if (!carrier) return res.status(400).json({ error: `Carrier not found: ${carrier_name}` });
      resolvedCarrierId = carrier.id;
    }

    const [row] = await db('claims')
      .insert({
        claim_number,
        customer_name,
        carrier_id: resolvedCarrierId,
        status: status || 'Intake',
      })
      .returning('*');

    await logEvent({
      claim_id: created.id,
      type: 'claim_created',
      detail: { claim_number: created.claim_number, carrier_id: created.carrier_id, status: created.status }
    });


    res.status(201).json(row);
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'claim_number already exists' });
    next(e);
  }
});

/** PUT /api/claims/:id */
r.put('/:id', async (req, res, next) => {
  try {
    const { customer_name, carrier_id, status } = req.body;
    const [row] = await db('claims')
      .where({ id: req.params.id })
      .update({ customer_name, carrier_id, status, updated_at: db.fn.now() })
      .returning('*');
      // after you insert and have newId:
    const year = new Date().getFullYear();
    const ref = `C-${year}-${String(newId).padStart(4, '0')}`;
    await db('claims').update({ reference_code: ref }).where({ id: newId });
    const created = await db('claims as c')
      .leftJoin('carriers as ca', 'ca.id', 'c.carrier_id')
      .select('c.*', 'ca.name as carrier_name')
      .where('c.id', newId)
      .first();
    return res.status(201).json(created);

    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

/** GET /api/claims/:id/checklist */
r.get('/:id/checklist', async (req, res, next) => {
  try {
    const claim = await db('claims').where({ id: req.params.id }).first();
    if (!claim) return res.status(404).json({ error: 'Not found' });

    const carrier = await db('carriers').where({ id: claim.carrier_id }).first();
    const required = (carrier?.config?.required_docs) || [];

    const docs = await db('documents').where({ claim_id: claim.id });
    const presentSet = new Set(docs.map(d => String(d.type || '').toLowerCase()));

    const present = required.filter(x => presentSet.has(String(x).toLowerCase()));
    const missing = required.filter(x => !presentSet.has(String(x).toLowerCase()));

    res.json({
      claim_id: claim.id,
      carrier: carrier?.name ?? null,
      required,
      present,
      missing,
    });
  } catch (e) { next(e); }
});

// --- Checklist summaries for all claims (batch) ---
// GET /api/claims/summaries  -> [{ id, done, total, missing:[] }]
r.get('/summaries', async (req, res, next) => {
  try {
    const claims = await db('claims').select('id', 'carrier_id');
    if (!claims.length) return res.json([]);

    // Build required docs per carrier
    const carriers = await db('carriers').select('id', 'config');
    const requiredByCarrier = new Map(
      carriers.map(c => {
        const req = Array.isArray(c.config?.required_docs) ? c.config.required_docs : [];
        return [c.id, req.map(x => String(x).toLowerCase())];
      })
    );

    // Present docs per claim (one scan)
    const present = await db('documents')
      .select('claim_id')
      .select(db.raw('array_agg(lower(type)) as types'))
      .groupBy('claim_id');

    const presentMap = new Map(present.map(p => [p.claim_id, new Set(p.types || [])]));

    // Summaries
    const out = claims.map(clm => {
      const req = requiredByCarrier.get(clm.carrier_id) || [];
      const have = presentMap.get(clm.id) || new Set();
      const done = req.filter(t => have.has(t)).length;
      const missing = req.filter(t => !have.has(t));
      return { id: clm.id, done, total: req.length, missing };
    });

    res.json(out);
  } catch (e) {
    next(e);
  }
});

// PUT /api/claims/:id(\\d+)/archive { archived: true|false }
r.put('/:id(\\d+)/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const archived = !!req.body.archived;
    await db('claims').update({ archived }).where({ id });
    const row = await db('claims').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'Not found' });
    await logEvent({
      claim_id: created.id,
      type: 'claim_created',
      detail: { claim_number: created.claim_number, carrier_id: created.carrier_id, status: created.status }
    });
    res.json({ id, archived });
  } catch (e) { next(e); }
});

// GET /api/claims/:id(\\d+)/notes
r.get('/:id(\\d+)/notes', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db('claim_notes').where({ claim_id: id }).orderBy('created_at', 'desc');
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/claims/:id(\\d+)/notes { note, author? }
r.post('/:id(\\d+)/notes', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { note, author } = req.body || {};
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'note required' });
    const [row] = await db('claim_notes')
      .insert({ claim_id: id, note: String(note).trim(), author: author || null })
      .returning(['id','claim_id','note','author','created_at']);
    await logEvent({
        claim_id: id,
        type: 'note_added',
        detail: { noteId: row.id, note: row.note, author: row.author || null }
      });
    res.status(201).json(row);

  } catch (e) { next(e); }
});

// GET /api/claims/search?q=string&archived={true|false|all}
r.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const archived = req.query.archived; // 'true' | 'false' | undefined
    let qry = db('claims as c')
      .leftJoin('carriers as ca', 'ca.id', 'c.carrier_id')
      .select('c.*', 'ca.name as carrier_name')
      .orderBy('c.updated_at', 'desc');

    if (archived === 'true') qry = qry.where('c.archived', true);
    else if (archived === 'false') qry = qry.where('c.archived', false);

    if (q) {
      const like = `%${q}%`.toLowerCase();
      qry = qry.where(function () {
        this.whereRaw('LOWER(c.claim_number) LIKE ?', [like])
          .orWhereRaw('LOWER(c.customer_name) LIKE ?', [like])
          .orWhereRaw('LOWER(c.reference_code) LIKE ?', [like])
          .orWhereRaw('LOWER(ca.name) LIKE ?', [like]);
      });
    }

    const rows = await qry;
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/claims/:id(\d+)/events
r.get('/:id(\\d+)/events', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db('workflow_events')
      .where({ claim_id: id })
      .orderBy('created_at', 'desc')
      .select('id', 'type', 'detail', 'created_at');
    // detail is JSON string → parse safely
    const out = rows.map(r => {
      let d = null;
      try { d = r.detail ? JSON.parse(r.detail) : null; } catch (_) {}
      return { id: r.id, type: r.type, detail: d, created_at: r.created_at };
    });
    res.json(out);
  } catch (e) { next(e); }
});


export default r;
