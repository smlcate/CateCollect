// Minimal, self-contained upload page + its JS, with correct MIME types.
// No frameworks, no CDNs, HTTP-friendly.

import { Router } from 'express';

export default function ingestUploadPage() {
  const r = Router();

  // HTML page
  r.get('/upload', (_req, res) => {
    res
      .type('html') // => Content-Type: text/html; charset=utf-8
      .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CateCollect — Upload</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- No COOP/HSTS needs here; Helmet handles headers -->
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
    <h1>Upload to CateCollect</h1>
    <p class="hint">Allowed: <code>.ems</code>, <code>.xml</code>, <code>.pdf</code>, <code>.jpg</code>, <code>.png</code>, <code>.docx</code>, <code>.xlsx</code> (max ~25MB, configurable)</p>
    <form id="uform">
      <div class="row">
        <input id="file" name="file" type="file" required />
        <button type="submit">Upload</button>
      </div>
    </form>
    <div id="out"></div>
  </div>
  <script src="/ingest/upload.js" async></script>
</body>
</html>`);
  });

  // The JS itself (served with the correct MIME type)
  r.get('/upload.js', (_req, res) => {
    res
      .type('application/javascript; charset=utf-8') // => Content-Type: application/javascript
      .send(`(function(){
  const $ = sel => document.querySelector(sel);
  const out = $('#out');
  const form = $('#uform');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = 'Uploading…';
    const fd = new FormData(form);
    try {
      const resp = await fetch('/api/uploads?scope=ingest', { method:'POST', body: fd });
      const text = await resp.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok:false, raw:text }; }
      if (resp.ok && data && data.ok) {
        out.innerHTML = '<p class="ok">Uploaded!</p><pre>'+JSON.stringify(data, null, 2)+'</pre>';
      } else {
        out.innerHTML = '<p class="err">Upload failed</p><pre>'+JSON.stringify(data || {status:resp.status, text}, null, 2)+'</pre>';
      }
    } catch (err) {
      out.innerHTML = '<p class="err">Network error</p><pre>'+String(err)+'</pre>';
    }
  });
})();`);
  });

  return r;
}
