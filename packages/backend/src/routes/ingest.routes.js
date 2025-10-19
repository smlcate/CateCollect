// packages/backend/src/routes/ingest.routes.js
import express from 'express';
import path from 'path';
import fs from 'fs/promises';

/**
 * Factory: pass in your knex instance
 *   app.use('/api/ingest', ingestApi(knex))
 */
export default function ingestApi(knex) {
  const router = express.Router();

  // ---------------------------
  // GET /health
  // ---------------------------
  router.get('/health', async (_req, res, next) => {
    try {
      const incomingDir = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
      const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);

      // last processed file
      const last = await knex('ccc_files')
        .select(['id', 'original_name', 'stored_path', 'processed_at', 'sha256'])
        .orderBy([{ column: 'processed_at', order: 'desc' }, { column: 'id', order: 'desc' }])
        .first();

      // inbox count
      let inboxCount = 0;
      try {
        const entries = await fs.readdir(incomingDir, { withFileTypes: true });
        inboxCount = entries.filter(e => e.isFile() && /\.(ems|xml)$/i.test(e.name)).length;
      } catch {
        // dir may not exist yet
      }

      res.json({
        ok: true,
        interval_ms: pollMs,
        incoming_dir: incomingDir,
        inbox_count: inboxCount,
        last_processed: last ? {
          id: last.id,
          original_name: last.original_name,
          stored_path: last.stored_path,
          processed_at: last.processed_at,
          sha256: last.sha256,
        } : null,
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------
  // GET /files  (list with pagination + search)
  //   ?limit=50&offset=0&q=vin or claim
  // ---------------------------
  router.get('/files', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const q = (req.query.q || '').toString().trim();

      const baseQuery = knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id',
          'f.original_name',
          'f.stored_path',
          'f.size_bytes',
          'f.sha256',
          'f.processed_at',
          'm.claim_number',
          'm.vin',
          'm.ro_number',
          'm.customer_name',
          'm.total_amount'
        )
        .orderBy([{ column: 'f.processed_at', order: 'desc' }, { column: 'f.id', order: 'desc' }])
        .limit(limit)
        .offset(offset);

      if (q) {
        baseQuery.where((qb) => {
          qb.whereILike('f.original_name', `%${q}%`)
            .orWhereILike('m.claim_number', `%${q}%`)
            .orWhereILike('m.vin', `%${q}%`)
            .orWhereILike('m.ro_number', `%${q}%`)
            .orWhereILike('m.customer_name', `%${q}%`);
        });
      }

      const rows = await baseQuery;

      // total for pagination
      const countQuery = knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .countDistinct({ total: 'f.id' })
        .first();
      if (q) {
        countQuery.where((qb) => {
          qb.whereILike('f.original_name', `%${q}%`)
            .orWhereILike('m.claim_number', `%${q}%`)
            .orWhereILike('m.vin', `%${q}%`)
            .orWhereILike('m.ro_number', `%${q}%`)
            .orWhereILike('m.customer_name', `%${q}%`);
        });
      }
      const total = Number((await countQuery)?.total || 0);

      res.json({ ok: true, total, limit, offset, items: rows });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------
  // GET /files/:id  (details + metadata)
  // ---------------------------
  router.get('/files/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

      const file = await knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id',
          'f.original_name',
          'f.stored_path',
          'f.size_bytes',
          'f.sha256',
          'f.processed_at',
          'm.claim_number',
          'm.vin',
          'm.ro_number',
          'm.customer_name',
          'm.total_amount',
          'm.raw_json'
        )
        .where('f.id', id)
        .first();

      if (!file) return res.status(404).json({ error: 'Not found' });

      // Parse raw_json if it exists
      let raw = null;
      try {
        raw = file.raw_json ? JSON.parse(file.raw_json) : null;
      } catch {
        raw = file.raw_json; // return as-is if it’s not valid JSON
      }

      res.json({
        ok: true,
        file: {
          id: file.id,
          original_name: file.original_name,
          stored_path: file.stored_path,
          size_bytes: file.size_bytes,
          sha256: file.sha256,
          processed_at: file.processed_at,
        },
        metadata: {
          claim_number: file.claim_number,
          vin: file.vin,
          ro_number: file.ro_number,
          customer_name: file.customer_name,
          total_amount: file.total_amount,
          raw_json: raw,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------
  // POST /files/:id/reprocess  (placeholder)
  //   - You can wire this to enqueue a re-parse if needed.
  // ---------------------------
  router.post('/files/:id/reprocess', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

      // TODO: enqueue a re-parse job; for now, just acknowledge
      res.json({ ok: true, message: 'Reprocess enqueued (placeholder)', id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
