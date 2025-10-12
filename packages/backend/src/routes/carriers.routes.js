import { Router } from 'express';
import db from '../services/knex.js';

const r = Router();

/**
 * GET /api/carriers
 */
r.get('/', async (_req, res, next) => {
  try {
    const rows = await db('carriers').select('*').orderBy('id', 'asc');
    res.json(rows);
  } catch (e) { next(e); }
});

/**
 * GET /api/carriers/:id
 */
r.get('/:id', async (req, res, next) => {
  try {
    const row = await db('carriers').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

/**
 * GET /api/carriers/by-name/:name
 * Case-insensitive lookup
 */
r.get('/by-name/:name', async (req, res, next) => {
  try {
    const c = await db('carriers')
      .whereRaw('LOWER(name) = LOWER(?)', [req.params.name])
      .first();
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (e) { next(e); }
});

export default r;
