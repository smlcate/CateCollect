// packages/backend/src/app.js
// Express app with uniform Origin-Agent-Cluster and a dev-safe CSP
// (no auto HTTPS upgrade unless TRUST_HTTPS=1). Exports the app;
// server boot/listen happens elsewhere (e.g., server.js).

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// API routes
import carriersRoutes from './routes/carriers.routes.js';
import claimsRoutes from './routes/claims.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import claimChecklistRoutes from './routes/claims.checklist.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import errorMw from './middleware/error.js';

// CCC ingest
import ingestApi from './routes/ingest.routes.js';
import ingestDashboard from './routes/ingest.dashboard.js';
import ingestUploadPage from './routes/ingest.uploadpage.js';

// DB
import knex from '../db/knexClient.js';

const app = express();

// ---------- Uniform Agent Clusters across ALL responses ----------
app.use((req, res, next) => {
  res.setHeader('Origin-Agent-Cluster', '?1');
  next();
});

// ---------- ENV & directories ----------
const TRUST_HTTPS = process.env.TRUST_HTTPS === '1';
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');

// ---------- Security headers (Helmet) ----------
const defaultCsp = helmet.contentSecurityPolicy.getDefaultDirectives();

// Helmet’s defaults include "upgrade-insecure-requests"; remove it in HTTP dev to prevent auto-HTTPS.
if (!TRUST_HTTPS && 'upgrade-insecure-requests' in defaultCsp) {
  delete defaultCsp['upgrade-insecure-requests'];
}

const cspDirectives = {
  ...defaultCsp,
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "script-src-attr": ["'none'"],
  // Only enable upgrade-insecure-requests when truly behind TLS
  ...(TRUST_HTTPS ? { "upgrade-insecure-requests": [] } : {})
};

app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginOpenerPolicy: TRUST_HTTPS ? { policy: 'same-origin' } : false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: TRUST_HTTPS ? { maxAge: 15552000 } : false, // no HSTS in HTTP dev
}));

// ---------- Core middleware ----------
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Minimal favicon to avoid console 404s
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// ---------- Health ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- API routes ----------
app.use('/api/uploads', uploadsRoutes);
app.use('/api/carriers', carriersRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/claimsChecklist', claimChecklistRoutes);
app.use('/api/documents', documentsRoutes);

// ---------- CCC ingest (mount BEFORE static/frontend) ----------
app.use('/api/ingest', ingestApi(knex));
app.use('/ingest', ingestDashboard(knex, { incomingDir: INCOMING_DIR, archiveDir: ARCHIVE_DIR }));
app.use('/ingest', ingestUploadPage());

// ---------- Static frontend fallback ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasIndex(dir) {
  try {
    fs.accessSync(path.join(dir, 'index.html'), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveFrontendDir() {
  if (process.env.FRONTEND_DIR && hasIndex(process.env.FRONTEND_DIR)) return process.env.FRONTEND_DIR;
  const candidates = [
    path.join(process.cwd(), 'web'),
    path.join(__dirname, '..', 'web'),
  ];
  for (const c of candidates) if (hasIndex(c)) return c;
  return null;
}

const FRONTEND_DIR = resolveFrontendDir();
if (FRONTEND_DIR) {
  app.use(express.static(FRONTEND_DIR, { fallthrough: true }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/ingest/')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
} else {
  console.warn('[frontend] No index.html found. Set FRONTEND_DIR or place web/index.html');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/ingest/')) return next();
    res.status(404).send('Frontend not found: set FRONTEND_DIR or add web/index.html');
  });
}

// ---------- Error handler ----------
app.use(errorMw);

export default app;
