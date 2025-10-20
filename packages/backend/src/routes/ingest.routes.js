// ingest.routes.js (ESM, safe dynamic-import parser)
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function ingestApi(knex) {
  const router = express.Router();
  const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(process.cwd(), 'data', 'archive');
  const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');

  const resolveArchivedPath = (row) => {
    const p = (row?.archived_path || row?.stored_path || '').toString().trim();
    if (!p) return null;
    return path.isAbsolute(p) ? p : path.join(ARCHIVE_DIR, p);
  };

  // Health
  router.get('/health', async (_req, res, next) => {
    try {
      const pollMs = Number(process.env.POLL_INTERVAL_MS || 5000);
      const last = await knex('ccc_files')
        .select(['id','original_name','stored_path','archived_path','processed_at','sha256'])
        .orderBy([{ column:'processed_at', order:'desc' }, { column:'id', order:'desc' }])
        .first();
      let inboxCount = 0;
      try {
        const entries = await fs.readdir(INCOMING_DIR, { withFileTypes: true });
        inboxCount = entries.filter(e => e.isFile()).length;
      } catch {}
      res.json({ ok:true, interval_ms: pollMs, incoming_dir: INCOMING_DIR, inbox_count: inboxCount, last_processed: last || null });
    } catch (err) { next(err); }
  });

  // List (?flat=1 for array)
  router.get('/files', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const q = (req.query.q || '').toString().trim();
      const flat = ['1','true','yes'].includes(String(req.query.flat||'').toLowerCase());

      const base = knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id','f.original_name','f.stored_path','f.archived_path','f.size_bytes',
          'f.sha256','f.processed_at',
          'm.claim_number','m.vin','m.ro_number','m.customer_name','m.total_amount'
        )
        .orderBy([{ column:'f.processed_at', order:'desc' }, { column:'f.id', order:'desc' }])
        .limit(limit).offset(offset);

      if (q) {
        base.where(qb=>{
          qb.whereILike('f.original_name', `%${q}%`)
            .orWhereILike('m.claim_number', `%${q}%`)
            .orWhereILike('m.vin', `%${q}%`)
            .orWhereILike('m.ro_number', `%${q}%`)
            .orWhereILike('m.customer_name', `%${q}%`);
        });
      }

      const rows = await base;
      if (flat) return res.json(rows);

      const countQ = knex('ccc_files as f').leftJoin('ccc_metadata as m','m.file_id','f.id')
        .countDistinct({ total: 'f.id' }).first();
      if (q) {
        countQ.where(qb=>{
          qb.whereILike('f.original_name', `%${q}%`)
            .orWhereILike('m.claim_number', `%${q}%`)
            .orWhereILike('m.vin', `%${q}%`)
            .orWhereILike('m.ro_number', `%${q}%`)
            .orWhereILike('m.customer_name', `%${q}%`);
        });
      }
      const total = Number((await countQ)?.total || 0);
      res.json({ ok:true, total, limit, offset, items: rows });
    } catch (err) { next(err); }
  });

  // Detail
  router.get('/files/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

      const row = await knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id','f.original_name','f.stored_path','f.archived_path','f.size_bytes',
          'f.sha256','f.processed_at',
          'm.claim_number','m.vin','m.ro_number','m.customer_name','m.total_amount','m.raw_json'
        ).where('f.id', id).first();

      if (!row) return res.status(404).json({ error: 'Not found' });

      let raw = null; try { raw = row.raw_json ? JSON.parse(row.raw_json) : null; } catch { raw = row.raw_json; }

      res.json({ ok:true,
        file: { id: row.id, original_name: row.original_name, stored_path: row.stored_path,
                archived_path: row.archived_path, size_bytes: row.size_bytes,
                sha256: row.sha256, processed_at: row.processed_at },
        metadata: { claim_number: row.claim_number, vin: row.vin, ro_number: row.ro_number,
                    customer_name: row.customer_name, total_amount: row.total_amount, raw_json: raw }
      });
    } catch (err) { next(err); }
  });

  // Raw
  router.get('/files/:id/raw', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'invalid_id' });
      const row = await knex('ccc_files').where({ id }).first();
      if (!row) return res.status(404).json({ ok:false, error:'not_found' });
      const full = resolveArchivedPath(row);
      if (!full) return res.status(404).json({ ok:false, error:'file_missing' });
      try { await fs.access(full); } catch { return res.status(404).json({ ok:false, error:'file_missing' }); }
      res.sendFile(full);
    } catch (err) { next(err); }
  });

  // Download
  router.get('/files/:id/download', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'invalid_id' });
      const row = await knex('ccc_files').where({ id }).first();
      if (!row) return res.status(404).json({ ok:false, error:'not_found' });
      const full = resolveArchivedPath(row);
      if (!full) return res.status(404).json({ ok:false, error:'file_missing' });
      try { await fs.access(full); } catch { return res.status(404).json({ ok:false, error:'file_missing' }); }
      res.download(full, row.original_name || path.basename(full));
    } catch (err) { next(err); }
  });

  // Reprocess: parse XML/EMS → upsert ccc_metadata
  router.post('/files/:id/reprocess', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'invalid_id' });

      const f = await knex('ccc_files').where({ id }).first();
      if (!f) return res.status(404).json({ ok:false, error:'not_found' });

      const full = resolveArchivedPath(f);
      if (!full) return res.status(404).json({ ok:false, error:'file_missing' });

      const text = (await fs.readFile(full)).toString('utf8');

      // <-- dynamic import so server doesn't crash if missing at boot
      let XMLParser;
      try { ({ XMLParser } = await import('fast-xml-parser')); }
      catch (e) {
        return res.status(501).json({ ok:false, error:'parser_not_installed', detail:String(e && e.message || e) });
      }

      const parser = new XMLParser({
        ignoreDeclaration: true, trimValues: true,
        ignoreAttributes: false, attributeNamePrefix: '@',
        allowBooleanAttributes: true, parseTagValue: true,
      });

      let raw = null; try { raw = parser.parse(text); } catch { raw = null; }

      const pick = (...paths) => {
        for (const p of paths) {
          const parts = p.split('.');
          let v = raw;
          for (const k of parts) v = v?.[k];
          if (v != null && v !== '') return String(v);
        }
        return null;
      };

      const claim_number = pick('claim.claim_number','Claim.ClaimNumber','root.claimNumber','estimate.claimID');
      const vin          = pick('claim.vin','Claim.Vehicle.VIN','root.VIN','estimate.vehicle.VIN');
      const ro_number    = pick('claim.ro_number','Claim.RepairOrderNumber','root.roNumber');
      const customer     = pick('claim.customer_name','Claim.Customer.Name','root.customer','estimate.customer.name');
      const amtRaw       = pick('claim.total_amount','Claim.TotalAmount','estimate.totals.grandTotal');
      const total_amount = amtRaw != null ? Number(String(amtRaw).replace(/[^0-9.]/g, '')) : null;

      const payload = {
        file_id: id,
        claim_number,
        vin,
        ro_number,
        customer_name: customer,
        total_amount: Number.isFinite(total_amount) ? total_amount : null,
        raw_json: raw ? JSON.stringify(raw) : null,
      };

      await knex('ccc_metadata')
        .insert(payload)
        .onConflict('file_id')
        .merge(payload);

      const out = await knex('ccc_files as f')
        .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
        .select(
          'f.id','f.original_name','f.archived_path','f.stored_path','f.size_bytes','f.sha256','f.processed_at',
          'm.claim_number','m.vin','m.ro_number','m.customer_name','m.total_amount'
        )
        .where('f.id', id).first();

      res.json({ ok:true, file: out });
    } catch (err) { next(err); }
  });

  return router;
}
