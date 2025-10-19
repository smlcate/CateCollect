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
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;padding:24px;max-width:760px;margin:auto}
    .card{border:1px solid #ddd;border-radius:12px;padding:20px}
    input[type=file]{margin:12px 0}
    pre{background:#fafafa;border:1px solid #eee;padding:12px;border-radius:8px;max-height:280px;overflow:auto}
    .hint{color:#666;font-size:13px}
    .ok{color:green}.err{color:#b00}
  </style>
</head>
<body>
  <h1>Upload CCC Export (EMS / XML)</h1>
  <div class="card">
    <form id="f" method="post" action="/api/uploads" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <button type="submit">Upload</button>
    </form>
    <p class="hint">Allowed: .ems, .xml, .pdf, .jpg, .png, .heic, .doc/x, .xls/x, .txt (max ~25MB)</p>
    <div id="out"></div>
  </div>

  <script>
    const f = document.getElementById('f');
    const out = document.getElementById('out');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      out.innerHTML = 'Uploading...';
      const fd = new FormData(f);
      try {
        const resp = await fetch('/api/uploads', { method: 'POST', body: fd });
        const txt = await resp.text();
        out.innerHTML = '<pre>'+txt.replace(/[<>&]/g,m=>({\"<\":\"&lt;\",\">\":\"&gt;\",\"&\":\"&amp;\"}[m]))+'</pre>';
      } catch (err) {
        out.innerHTML = '<p class="err">'+(err?.message||err)+'</p>';
      }
    });
  </script>
</body>
</html>`);
  });

  return r;
}
