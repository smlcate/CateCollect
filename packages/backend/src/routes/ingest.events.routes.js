import express from 'express';
import knex from '../../db/knexClient.js';

export default function ingestEventsRoutes() {
  const r = express.Router();

  // GET /api/ingest/events?limit=100
  r.get('/events', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
      const rows = await knex('ingest_events').select('*').orderBy('id', 'desc').limit(limit);
      res.json(rows);
    } catch (err) { next(err); }
  });

  // GET /api/ingest/events/:documentId
  r.get('/events/:documentId', async (req, res, next) => {
    try {
      const { documentId } = req.params;
      const rows = await knex('ingest_events').select('*').where({ document_id: documentId }).orderBy('id', 'asc');
      res.json(rows);
    } catch (err) { next(err); }
  });

  return r;
}
