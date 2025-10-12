import express from 'express';

/**
 * Mount under /api/ingest
 * GET /files         -> latest 100 files + metadata
 * GET /files/:id     -> single file + metadata
 */
export default function ingestApi(knex) {
  const router = express.Router();

  router.get('/files', async (req, res) => {
    const rows = await knex('ccc_files as f')
      .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
      .select(
        'f.id',
        'f.original_name',
        'f.size_bytes',
        'f.ext',
        'f.processed_at',
        'f.error',
        'm.claim_number',
        'm.customer_name',
        'm.vehicle_vin',
        'm.total_amount'
      )
      .orderBy('f.id', 'desc')
      .limit(100);
    res.json({ files: rows });
  });

  router.get('/files/:id', async (req, res) => {
    const id = Number(req.params.id);
    const file = await knex('ccc_files').where({ id }).first();
    if (!file) return res.status(404).json({ error: 'Not found' });
    const meta = await knex('ccc_metadata').where({ file_id: id }).first();
    res.json({ file, metadata: meta });
  });

  return router;
}
