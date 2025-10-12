// packages/backend/src/server.js
import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import app from './app.js';

// --- CCC Ingest worker ---
import knex from '../db/knexClient.js'; // ✅ fixed: was ../db/knexClient.js
import { startCccIngestWorker } from './ingest/worker.js';

const port = process.env.PORT || 4000;

// Ensure data dirs exist (for ingest inbox/archive)
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
const POLL_MS      = Number(process.env.POLL_INTERVAL_MS || 5000);

await fs.mkdir(INCOMING_DIR, { recursive: true }).catch(() => {});
await fs.mkdir(ARCHIVE_DIR, { recursive: true }).catch(() => {});

// Start ingest worker
const stopIngest = startCccIngestWorker({
  knex,
  incomingDir: INCOMING_DIR,
  archiveDir:  ARCHIVE_DIR,
  intervalMs:  POLL_MS,
});

const server = app.listen(port, () => {
  console.log(`API listening on :${port}`);
  console.log(`[ccc-ingest] watching ${INCOMING_DIR} -> archiving to ${ARCHIVE_DIR} (every ${POLL_MS}ms)`);
});

// Graceful shutdown
function shutdown(signal = 'SIGTERM') {
  console.log(`[shutdown] ${signal} received`);
  try { stopIngest?.(); } catch {}
  server.close(() => {
    console.log('[shutdown] server closed');
    process.exit(0);
  });
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
