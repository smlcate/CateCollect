// packages/backend/src/routes/ingest.uploadpage.js
import express from 'express';

export default function ingestUploadPage() {
  const r = express.Router();

  r.get('/upload', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>CCC Test Upload</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    :root{--t:#111827}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;padding:24px;max-width:760px;margin:auto;color:var(--t)}
    .card{border:1px solid #e5e7eb;border-radius:12px;padding:20px}
    input[type=file]{margin:12px 0}
    pre{background:#fafafa;border:1px solid #eee;padding:12px;border-radius:8px;max-height:280px;overflow:auto}
    .hint{color:#666;font-size:13px}
    button{background:#111827;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}
    h1{margin-top:0}
    .ok{color:#15803d}.err{color:#b91c1c}
  </style>
</head>
<body>
  <h1>Upload CCC Export (EMS / XML)</h1>
  <div class="card">
    <form id="f" method="post" action="/api/uploads" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <button type="submit">Upload</button>
    </form>
    <p class="hint">Allowed: .ems, .xml, .pdf, .jpg, .jpeg, .png, .heic, .doc, .docx, .xls, .xlsx, .txt (max ~25MB)</p>
    <div id="out"></div>
  </div>

  <script src="/ingest/upload.js" defer></script>
</body>
</html>`);
  });

  // External JS so CSP (script-src 'self') is satisfied
  r.get('/upload.js', (_req, res) => {
    res.type('application/javascript').send(`
(function(){
  const f = document.getElementById('f');
  const out = document.getElementById('out');
  function esc(s){ return String(s).replace(/[<>&]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m])) }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.innerHTML = 'Uploading...';
    const fd = new FormData(f);
    try {
      const resp = await fetch(f.action, { method: 'POST', body: fd, credentials: 'same-origin' });
      const txt  = await resp.text();
      out.innerHTML = '<pre>'+esc(txt)+'</pre>';
    } catch (err) {
      out.innerHTML = '<p class="err">'+esc(err && err.message || err)+'</p>';
    }
  });
})();
    `);
  });

  return r;
}
