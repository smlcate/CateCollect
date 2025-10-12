import express from 'express';

export default function ingestDashboard(knex, { incomingDir, archiveDir }) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    const rows = await knex('ccc_files as f')
      .leftJoin('ccc_metadata as m', 'm.file_id', 'f.id')
      .select(
        'f.id','f.original_name','f.size_bytes','f.ext','f.processed_at','f.error',
        'm.claim_number','m.customer_name','m.vehicle_vin','m.total_amount'
      )
      .orderBy('f.id','desc')
      .limit(50);

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>CCC Ingest</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:18px}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #eee;text-align:left;padding:8px;font-size:14px}
th{background:#fafafa;position:sticky;top:0}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#eee}
.ok{color:#070}
.err{color:#900}
</style></head>
<body>
  <h1>CCC Ingest</h1>
  <p><strong>Incoming:</strong> ${incomingDir}<br/><strong>Archive:</strong> ${archiveDir}</p>
  <p><a href="/api/ingest/files">/api/ingest/files</a></p>
  <table><thead><tr>
    <th>ID</th><th>File</th><th>Size</th><th>Type</th><th>Processed</th>
    <th>Claim</th><th>Customer</th><th>VIN</th><th>Total</th><th>Status</th>
  </tr></thead><tbody>
    ${rows.map(r=>`
      <tr>
        <td><a href="/api/ingest/files/${r.id}">${r.id}</a></td>
        <td>${r.original_name}</td>
        <td>${(Number(r.size_bytes||0)/1024).toFixed(1)} KB</td>
        <td><span class="badge">${r.ext||''}</span></td>
        <td>${r.processed_at||''}</td>
        <td>${r.claim_number||''}</td>
        <td>${r.customer_name||''}</td>
        <td>${r.vehicle_vin||''}</td>
        <td>${r.total_amount||''}</td>
        <td>${r.error ? '<span class="err">error</span>' : '<span class="ok">ok</span>'}</td>
      </tr>`).join('')}
  </tbody></table>
</body></html>`;
    res.type('html').send(html);
  });

  return router;
}
