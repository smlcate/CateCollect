// packages/backend/src/routes/ingest.routes.js
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { XMLParser } from 'fast-xml-parser';

// NOTE: ESM-safe __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Factory: pass in your knex instance
 *   app.use('/api/ingest', ingestApi(knex))
 */
export default function ingestApi(knex) {
  const router = express.Router();

  // Where archived files live (relative paths are resolved against this)
  const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(process.cwd(), 'data', 'archive');

  // Safely resolve an archived file path for a DB row
  function resolveArchivedPath(row) {
    // Prefer archived_path; fall back to stored_path for legacy rows
    const p = (row?.archived_path || row?.stored_path || '').toString().trim();
    if (!p) return null;

    // If p is absolute, use it; otherwise resolve within ARCHIVE_DIR
    const candidate = path.resolve(path.isAbsolute(p) ? p : path.join(ARCHIVE_DIR, p));
    const base = path.resolve(ARCHIVE_DIR);
    // Prevent path traversal: ensure the resolved path is under ARCHIVE_DIR when p is relative
    if (!candidate.startsWith(base) && !path.isAbsolute(p)) return null;
    return candidate;
  }

  async function resolveFileFullPath(row) {
    const p = (row?.archived_path || row?.stored_path || '').toString().trim();
    if (!p) return null;
    const isAbs = path.isAbsolute(p);
    const full = isAbs ? p : path.join(ARCHIVE_DIR, p);
    try { await fs.access(full); } catch { return null; }
    return full;
  }
  // ---------------------------
  // GET /health
  // ---------------------------
  router.get('/health', async (_req, res, next) => {
    try {
      const incomingDir = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
      const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);

      // last processed file
      const last = await knex('ccc_files')
        .select(['id', 'original_name', 'stored_path', 'archived_path', 'processed_at', 'sha256'])
        .orderBy([{ column: 'processed_at', order: 'desc' }, { column: 'id', order: 'desc' }])
        .first();

      // inbox count
      let inboxCount = 0;
      try {
        const entries = await fs.readdir(incomingDir, { withFileTypes: true });
        inboxCount = entries.filter(e => e.isFile() && /\.(ems|xml|txt|pdf)$/i.test(e.name)).length;
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
          archived_path: last.archived_path,
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
  //   ?flat=1  -> return a plain array instead of {ok,total,items}
  // ---------------------------
  router.get('/files', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const q = (req.query.q || '').toString().trim();
      const flat = ['1', 'true', 'yes'].includes(String(req.query.flat || '').toLowerCase());

      const baseQuery = knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id',
          'f.original_name',
          'f.stored_path',
          'f.archived_path',
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

      if (flat) {
        return res.json(rows);
      }

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
          'f.archived_path',
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
        raw = file.raw_json; // return as-is if invalid JSON
      }

      res.json({
        ok: true,
        file: {
          id: file.id,
          original_name: file.original_name,
          stored_path: file.stored_path,
          archived_path: file.archived_path,
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
  // GET /files/:id/raw  (stream file inline)
  // ---------------------------
  router.get('/files/:id/raw', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'invalid_id' });

      const row = await knex('ccc_files').where({ id }).first();
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });

      const full = resolveArchivedPath(row);
      if (!full) return res.status(404).json({ ok: false, error: 'file_missing' });

      // Confirm existence
      try { await fs.access(full); } catch { return res.status(404).json({ ok: false, error: 'file_missing' }); }

      res.sendFile(full);
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------
  // GET /files/:id/download  (force download)
  // ---------------------------
  router.get('/files/:id/download', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'invalid_id' });

      const row = await knex('ccc_files').where({ id }).first();
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });

      const full = resolveArchivedPath(row);
      if (!full) return res.status(404).json({ ok: false, error: 'file_missing' });

      try { await fs.access(full); } catch { return res.status(404).json({ ok: false, error: 'file_missing' }); }

      res.download(full, row.original_name || path.basename(full));
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------
  // POST /files/:id/reprocess  (placeholder)
  // ---------------------------
  router.post('/files/:id/reprocess', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'invalid_id' });

      // fetch file row
      const f = await knex('ccc_files').where({ id }).first();
      if (!f) return res.status(404).json({ ok:false, error:'not_found' });

      const full = await resolveFileFullPath(f);
      if (!full) return res.status(404).json({ ok:false, error:'file_missing' });

      // read + parse (XML/EMS text)
      const buf = await fs.readFile(full);
      const text = buf.toString('utf8');

      // Fast-XML-Parser config: tolerate slightly messy XML
      const parser = new XMLParser({
        ignoreDeclaration: true,
        trimValues: true,
        ignoreAttributes: false,
        attributeNamePrefix: '@',
        allowBooleanAttributes: true,
        parseTagValue: true,
      });

      let raw = null;
      try { raw = parser.parse(text); }
      catch { /* keep raw = null; */ }

      // very lightweight extraction with multiple possible tag names
      const pick = (...paths) => {
        for (const p of paths) {
          const parts = p.split('.');
          let v = raw;
          for (const k of parts) v = v?.[k];
          if (v != null && v !== '') return String(v);
        }
        return null;
      };

      // attempt common tag names (tweak later for your exact CCC schema)
      const claim_number = pick('claim.claim_number', 'Claim.ClaimNumber', 'root.claimNumber', 'estimate.claimID');
      const vin          = pick('claim.vin', 'Claim.Vehicle.VIN', 'root.VIN', 'estimate.vehicle.VIN');
      const ro_number    = pick('claim.ro_number', 'Claim.RepairOrderNumber', 'root.roNumber');
      const customer     = pick('claim.customer_name', 'Claim.Customer.Name', 'root.customer', 'estimate.customer.name');
      const amtRaw       = pick('claim.total_amount', 'Claim.TotalAmount', 'estimate.totals.grandTotal');
      const total_amount = amtRaw != null ? Number(String(amtRaw).replace(/[^0-9.]/g, '')) : null;

      // upsert into ccc_metadata (jsonb raw for later debugging)
      const payload = {
        file_id: id,
        claim_number,
        vin,
        ro_number,
        customer_name: customer,
        total_amount: isFinite(total_amount) ? total_amount : null,
        raw_json: raw ? JSON.stringify(raw) : null,
      };

      await knex('ccc_metadata')
        .insert(payload)
        .onConflict('file_id')
        .merge(payload);

      // return the merged view like your GET /files/:id
      const out = await knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id','f.original_name','f.archived_path','f.stored_path','f.size_bytes','f.sha256','f.processed_at',
          'm.claim_number','m.vin','m.ro_number','m.customer_name','m.total_amount'
        )
        .where('f.id', id)
        .first();

      res.json({ ok:true, file: out });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
