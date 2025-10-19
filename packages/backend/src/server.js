// packages/backend/src/server.js
import 'dotenv/config';
import app from './app.js';
import startCccIngestWorker from './ingest/worker.js';

const port = Number(process.env.PORT || 4000);

// --- start HTTP server ---
const server = app.listen(port, () => {
  console.log(`API listening on :${port}`);
});

// --- start ingest worker (never crash the API if worker import/start fails) ---
let stopWorker = null;
try {
  stopWorker = startCccIngestWorker?.();
} catch (err) {
  console.error('[ccc-ingest] failed to start worker:', err?.message || err);
}

// --- graceful shutdown ---
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received`);
  try {
    if (typeof stopWorker === 'function') {
      stopWorker();
    }
  } catch (e) {
    console.warn('[shutdown] worker stop error:', e?.message || e);
  }
  server.close(() => {
    console.log('[shutdown] server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// --- crash guards (log + exit; rely on process manager / docker to restart) ---
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled Rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught Exception:', err);
  process.exit(1);
});
