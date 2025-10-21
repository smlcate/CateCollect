// packages/backend/src/routes/ingest.dashboard.js
import express from 'express';

export default function ingestDashboard() {
  const router = express.Router();

  // ---------------------------
  // GET /ingest/  (dashboard HTML)
  // ---------------------------
  router.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CateCollect — Ingest Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { --fg:#111; --muted:#666; --line:#e5e5e5; --bg:#fff; --ok:#0b6; --err:#c00; }
    html,body { margin:0; padding:0; background:var(--bg); color:var(--fg); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .wrap { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }
    .card { border:1px solid var(--line); border-radius:12px; padding:1rem 1.25rem; background:#fff; box-shadow: 0 1px 0 rgba(0,0,0,.03); }
    h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
    p.hint { color: var(--muted); margin:.25rem 0 1rem; }
    .row { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin:.5rem 0 1rem; }
    input[type="search"] { flex:1 1 240px; padding:.55rem .7rem; border:1px solid var(--line); border-radius:10px; font-size:14px; }
    button { padding:.55rem .9rem; border:0; border-radius:10px; background:#111; color:#fff; cursor:pointer; }
    button.secondary { background:#f5f5f5; color:#111; border:1px solid var(--line); }
    .counts { font-size:.95rem; color: var(--muted); }
    table { width:100%; border-collapse:collapse; margin-top:.75rem; }
    th, td { text-align:left; padding:.55rem .5rem; border-bottom:1px solid var(--line); vertical-align:top; font-size:14px; }
    th { font-weight:600; background:#fafafa; position:sticky; top:0; }
    td small { color:var(--muted); }
    .right { text-align:right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #empty { color:var(--muted); text-align:center; padding:2rem 0; }
    .ok { color: var(--ok); }
    .err { color: var(--err); }
    @media (max-width:900px){
      .hide-md { display:none; }
    }
  </style>
  <script src="/ingest/dashboard.js" defer></script>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>CateCollect — Ingest Dashboard</h1>
      <p class="hint">Search by <strong>claim #</strong>, <strong>VIN</strong>, <strong>RO #</strong>, <strong>customer</strong>, or <strong>file name</strong>. Rows auto-refresh every 20s.</p>

      <div class="row">
        <input id="q" type="search" placeholder="Search (claim, VIN, RO, customer, file)…" />
        <button id="refresh">Refresh</button>
        <button id="clear" class="secondary">Clear</button>
        <div class="counts">Showing <span id="count">0</span> file(s)</div>
      </div>

      <div id="empty">No files yet.</div>

      <div class="table-wrap">
        <table id="files" cellspacing="0" cellpadding="0">
          <thead>
            <tr>
              <th>ID</th>
              <th>File</th>
              <th>Claim #</th>
              <th>VIN</th>
              <th class="hide-md">RO #</th>
              <th>Customer</th>
              <th class="right">Total</th>
              <th class="hide-md">Processed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

    </div>
  </div>
</body>
</html>`);
  });

  // ---------------------------
  // GET /ingest/dashboard.js  (UI logic; no-cache)
  // ---------------------------
  router.get('/dashboard.js', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(`(function(){
'use strict';

const $ = (sel, el=document) => el.querySelector(sel);

// ---------- utils ----------
function fmtMoney(v){
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  try { return n.toLocaleString(undefined, { style:'currency', currency:'USD' }); }
  catch { return String(n); }
}

function fmtDate(v){
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString();
}

// Normalize API response to a flat array
function normalizeFiles(data){
  if (Array.isArray(data)) return data;                 // flat=1 path
  if (data && Array.isArray(data.items)) return data.items; // object shape
  return [];
}

// If first fetch hits 401 (Basic Auth), reload once to satisfy the browser prompt
async function fetchWithAuth(url){
  const res = await fetch(url, { cache:'no-store' });
  if (res.status === 401) { location.reload(); throw new Error('401'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Render rows
function renderRows(rows){
  const tbody = $('#files tbody');
  const empty = $('#empty');
  const count = $('#count');

  tbody.innerHTML = '';
  count.textContent = String(rows.length);

  if (!rows.length){
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = [
      \`<td class="mono">\${r.id ?? ''}</td>\`,
      \`<td title="\${r.original_name ?? ''}">\${(r.original_name||'').slice(0,80)}</td>\`,
      \`<td class="mono">\${r.claim_number ?? ''}</td>\`,
      \`<td class="mono">\${r.vin ?? ''}</td>\`,
      \`<td class="mono hide-md">\${r.ro_number ?? ''}</td>\`,
      \`<td>\${r.customer_name ?? ''}</td>\`,
      \`<td class="right">\${fmtMoney(r.total_amount)}</td>\`,
      \`<td class="hide-md">\${fmtDate(r.processed_at)}</td>\`,
      r.id
        ? \`<td><a href="/api/ingest/files/\${r.id}/download">download</a> · <a href="/api/ingest/files/\${r.id}/raw" target="_blank" rel="noopener">raw</a></td>\`
        : '<td></td>'
    ].join('');
    tbody.appendChild(tr);
  }
}

// Load rows (supports search)
async function loadRows(){
  const qEl = $('#q');
  const q = (qEl?.value || '').trim();
  const params = new URLSearchParams({ limit: '100', offset: '0' });
  if (q) params.set('q', q);

  // Prefer flat array, but tolerate object shape
  const data = await fetchWithAuth('/api/ingest/files?flat=1&' + params.toString());
  const rows = normalizeFiles(data);
  renderRows(rows);
}

// Wire UI + poll
window.addEventListener('DOMContentLoaded', ()=>{
  const q = $('#q');
  $('#refresh')?.addEventListener('click', loadRows);
  $('#clear')?.addEventListener('click', ()=>{ q.value=''; loadRows(); });
  q?.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') loadRows(); });

  loadRows();
  setInterval(loadRows, 20000); // 20s poll
});

})();`);
  });

  return router;
}
