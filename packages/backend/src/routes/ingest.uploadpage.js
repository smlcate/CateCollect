// packages/backend/src/routes/ingest.uploadpage.js
import express from 'express';

const router = express.Router();

export default function ingestUploadPage() {
  // HTML shell
  router.get('/upload', (_req, res) => {
    res
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CateCollect — Upload</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; }
    .box { max-width: 560px; margin: 0 auto; padding: 1rem 1.25rem; border: 1px solid #ddd; border-radius: 12px; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem 0; }
    p { color: #444; }
    form { margin-top: 1rem; }
    input[type=file] { display:block; margin: 0.5rem 0 1rem 0; }
    button { padding: 0.6rem 1rem; border: 0; border-radius: 10px; background:#111; color:#fff; cursor:pointer; }
    pre { background: #f7f7f7; padding: 0.75rem; border-radius: 8px; overflow:auto; }
    .ok { color: #0b6; }
    .err { color: #c00; }
    .hint { font-size: 0.9rem; color:#666; }
    .row { display:flex; gap:0.5rem; align-items:center; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Upload to Ingest</h1>
    <p class="hint">Files here go straight to the ingest inbox. Use <code>/ingest/</code> to see processed files.</p>

    <form id="f">
      <input id="file" type="file" required />
      <div class="row">
        <button type="submit">Upload</button>
        <span id="status" class="hint"></span>
      </div>
    </form>

    <pre id="out"></pre>
  </div>

  <script src="/ingest/upload.js" defer></script>
</body>
</html>`);
  });

  // JS (no-store so browsers don't cache old code)
  router.get('/upload.js', (_req, res) => {
    res
      .type('application/javascript')
      .set('Cache-Control', 'no-store')
      .send(`(function(){
  'use strict';
  const f = document.getElementById('f');
  const fi = document.getElementById('file');
  const out = document.getElementById('out');
  const status = document.getElementById('status');

  function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fi.files || !fi.files[0]) { alert('Choose a file'); return; }
    status.textContent = 'Uploading…';
    out.textContent = '';

    const fd = new FormData();
    fd.append('file', fi.files[0]);

    try {
      // IMPORTANT: post to ingest scope so the worker picks it up
      const res = await fetch('/api/uploads?scope=ingest', { method: 'POST', body: fd });
      const json = await res.json();
      status.textContent = res.ok ? 'Uploaded ✓' : 'Upload failed';
      out.innerHTML = '<span class="'+(res.ok?'ok':'err')+'"></span>'+esc(JSON.stringify(json, null, 2));
    } catch (err) {
      status.textContent = 'Upload failed';
      out.textContent = esc(String(err));
    }
  });
})();`);
  });

  return router;
}
