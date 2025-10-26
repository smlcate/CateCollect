// packages/backend/src/routes/ingest.uploadpage.js
import express from 'express';

export default function ingestUploadPage() {
  const router = express.Router();

  router.get('/upload', (_req, res) => {
    res.type('html').send(`<!doctype html>
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
    <h1>Upload a CCC file</h1>
    <p class="hint">Accepted: <strong>.xml</strong>, <strong>.ems</strong>, <strong>.awf</strong></p>
    <form id="up" enctype="multipart/form-data" method="post" action="/api/uploads?scope=ingest">
      <input type="file" id="file" name="file" accept=".xml,.ems,.awf" required />
      <div class="row">
        <button type="submit">Upload</button>
        <a href="/ingest/" style="margin-left:auto">Dashboard</a>
      </div>
    </form>
    <pre id="out"></pre>
  </div>
<script>
const out = document.getElementById('out');
document.getElementById('up').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = document.getElementById('file').files[0];
  if (!f) return;
  if (!/\\.(xml|ems|awf)$/i.test(f.name)) {
    out.textContent = 'Please choose a .xml, .ems, or .awf file.';
    return;
  }
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await fetch('/api/uploads?scope=ingest', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    out.innerHTML = r.ok ? '<span class="ok">'+JSON.stringify(j,null,2)+'</span>' : '<span class="err">'+JSON.stringify(j,null,2)+'</span>';
  } catch (err) {
    out.innerHTML = '<span class="err">'+(err&&err.message||String(err))+'</span>';
  }
});
</script>
</body>
</html>`);
  });

  // serve the tiny client JS separately if you already had /upload.js route (optional)
  router.get('/upload.js', (_req, res) => {
    res.type('application/javascript').send(`/* no-op; inlined script used */`);
  });

  return router;
}
