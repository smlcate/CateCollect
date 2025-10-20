// packages/backend/src/routes/ingest.dashboard.js
// Minimal ingest dashboard (CSP-safe): HTML + separate JS at /ingest/dashboard.js

import express from 'express';
const router = express.Router();

export default function ingestDashboard(knex, options = {}) {
  router.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CateCollect — Ingest Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { --fg:#111; --muted:#666; --border:#e5e7eb; --bg:#fff; --chip:#f3f4f6; }
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:2rem;color:var(--fg);background:var(--bg)}
    .wrap{max-width:1100px;margin:0 auto}
    h1{font-size:1.25rem;margin:0 0 1rem}
    .bar{display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap}
    input[type=search]{flex:1;min-width:260px;padding:.55rem .7rem;border:1px solid var(--border);border-radius:.6rem}
    button{padding:.55rem .8rem;border:1px solid #111;border-radius:.6rem;background:#111;color:#fff;cursor:pointer}
    .muted{color:var(--muted)}
    table{width:100%;border-collapse:collapse}
    th,td{border-bottom:1px solid var(--border);padding:.6rem .5rem;text-align:left;vertical-align:top}
    th{font-size:.9rem}
    td small{color:var(--muted)}
    .chip{background:var(--chip);border:1px solid var(--border);border-radius:.6rem;padding:.15rem .4rem;font-size:.8rem}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
    .right{text-align:right}
    .actions a{margin-right:.4rem}
    .empty{padding:1rem;border:1px dashed var(--border);border-radius:.8rem;text-align:center;color:var(--muted)}
    .sticky{position:sticky;top:0;background:var(--bg)}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>CateCollect — Ingest Files</h1>
    <div class="bar">
      <input id="q" type="search" placeholder="Search by name, claim #, VIN…" />
      <button id="refresh" type="button">Refresh</button>
      <span id="count" class="muted"></span>
    </div>
    <div id="mount"></div>
  </div>
  <script src="/ingest/dashboard.js" defer></script>
</body>
</html>`);
  });

  // Serve the dashboard JS separately (CSP: script-src 'self')
  router.get('/dashboard.js', (_req, res) => {
    res.type('application/javascript').send(`(function(){
  'use strict';

  const $ = sel => document.querySelector(sel);
  const mount = $('#mount');
  const q = $('#q');
  const count = $('#count');

  function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function fmtBytes(n){ n = Number(n||0); if(!n) return '0 B'; const u=['B','KB','MB','GB','TB']; const i=Math.floor(Math.log(n)/Math.log(1024)); return (n/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i]; }
  function fmtDate(x){ try{ const d=new Date(x); if(isNaN(d)) return ''; return d.toISOString().replace('T',' ').replace(/\..+$/,' UTC'); }catch{ return ''; } }
  function cutHash(h){ h = String(h||''); return h ? (h.slice(0,10)+'…'+h.slice(-6)) : ''; }

  function rowHTML(f){
    const processed = f.processed_at || f.created_at || '';
    const name = esc(f.original_name || f.filename || '(unnamed)');
    const size = fmtBytes(f.size_bytes);
    const sha = esc(f.sha256 || '');
    const short = cutHash(sha);
    const claim = esc(f.claim_number || '');
    const vin = esc(f.vin || '');
    const ro = esc(f.ro_number || '');
    const cust = esc(f.customer_name || '');
    const amt = (f.total_amount!=null) ? Number(f.total_amount).toFixed(2) : '';
    // Optional endpoints if you added them; harmless if 404 (we don't auto-call)
    const viewURL = '/api/ingest/files/'+f.id+'/raw';
    const dlURL = '/api/ingest/files/'+f.id+'/download';

    return '<tr>'+
      '<td class="mono">'+f.id+'</td>'+
      '<td><div>'+name+'</div><small class="muted">'+esc(f.archived_path || f.stored_path || '')+'</small></td>'+
      '<td class="right">'+size+'</td>'+
      '<td><span class="chip mono" title="'+sha+'">'+esc(short)+'</span></td>'+
      '<td>'+esc(claim)+'</td>'+
      '<td class="mono">'+esc(vin)+'</td>'+
      '<td>'+esc(ro)+'</td>'+
      '<td>'+esc(cust)+'</td>'+
      '<td class="right">'+esc(amt)+'</td>'+
      '<td>'+fmtDate(processed)+'</td>'+
      '<td class="actions"><a class="mono" href="'+viewURL+'" target="_blank" rel="noopener">View</a><a class="mono" href="'+dlURL+'">Download</a></td>'+
    '</tr>';
  }

  function tableHTML(rows){
    if(!rows || !rows.length){
      return '<div class="empty">No files yet. Upload one at <a href="/ingest/upload">/ingest/upload</a>.</div>';
    }
    return '<div class="table-wrap"><table><thead class="sticky"><tr>'+
      '<th>ID</th><th>Name</th><th class="right">Size</th><th>SHA256</th>'+
      '<th>Claim #</th><th>VIN</th><th>RO #</th><th>Customer</th>'+
      '<th class="right">Amount</th><th>Processed</th><th>Actions</th>'+
      '</tr></thead><tbody>'+rows.map(rowHTML).join('')+'</tbody></table></div>';
  }

  function filterRows(rows, query){
    if(!query) return rows;
    const t = query.toLowerCase();
    const key = f => [
      f.id, f.original_name, f.archived_path, f.stored_path,
      f.sha256, f.claim_number, f.vin, f.ro_number, f.customer_name
    ].map(x=>String(x||'').toLowerCase()).join(' ');
    return rows.filter(f => key(f).includes(t));
  }

  async function fetchData(){
    const res = await fetch('/api/ingest/files', { headers: { 'Accept': 'application/json' } });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  }

  async function render(){
    try{
      const data = await fetchData();
      const qv = q.value.trim();
      const filtered = filterRows(data, qv);
      mount.innerHTML = tableHTML(filtered);
      count.textContent = filtered.length + ' of ' + data.length + ' files';
    } catch(err){
      mount.innerHTML = '<div class="empty">Failed to load files: '+esc(err.message)+'</div>';
      count.textContent = '';
      console.error(err);
    }
  }

  $('#refresh').addEventListener('click', render);
  q.addEventListener('input', () => { render(); });

  // initial paint
  render();
})();`);
  });

  return router;
}
