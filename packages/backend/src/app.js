// packages/backend/src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Routes
import carriersRoutes from './routes/carriers.routes.js';
import claimsRoutes from './routes/claims.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import claimChecklistRoutes from './routes/claims.checklist.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import errorMw from './middleware/error.js';

// CCC ingest pieces
import ingestApi from './routes/ingest.routes.js';
import ingestDashboard from './routes/ingest.dashboard.js';
import ingestUploadPage from './routes/ingest.uploadpage.js';

// DB
import knex from '../db/knexClient.js';

const app = express();

// ----------------- ENV & paths (MUST be before using them) -----------------
const TRUST_HTTPS = process.env.TRUST_HTTPS === '1';
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');

// ----------------- Security headers -----------------
const cspDirectives = {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "script-src-attr": ["'none'"],
};
// Only add upgrade-insecure-requests when we’re actually on HTTPS behind a proxy
if (TRUST_HTTPS) cspDirectives["upgrade-insecure-requests"] = [];

app.use(helmet({
  contentSecurityPolicy: { directives: cspDirectives },
  crossOriginOpenerPolicy: TRUST_HTTPS ? { policy: 'same-origin' } : false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: TRUST_HTTPS, // off for HTTP testing
}));

// ----------------- Core middleware -----------------
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ----------------- API routes -----------------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/uploads', uploadsRoutes);
app.use('/api/carriers', carriersRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/claimsChecklist', claimChecklistRoutes);
app.use('/api/documents', documentsRoutes);

// ----------------- CCC ingest routes (MOUNT BEFORE STATIC) -----------------
app.use('/api/ingest', ingestApi(knex));
app.use('/ingest', ingestDashboard(knex, { incomingDir: INCOMING_DIR, archiveDir: ARCHIVE_DIR }));
app.use('/ingest', ingestUploadPage());

// ----------------- Frontend resolution -----------------
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
    path.resolve(__dirname, '../../web'),
    path.resolve(__dirname, '../../../web'),
    path.resolve(process.cwd(), 'web'),
    path.resolve(process.cwd(), 'CateCollect/web'),
  ];
  for (const c of candidates) if (hasIndex(c)) return c;
  return null;
}

const FRONTEND_DIR = resolveFrontendDir();

// ----------------- Static / SPA fallback (LAST) -----------------
if (FRONTEND_DIR) {
  console.log('[frontend] Serving from:', FRONTEND_DIR);

  app.use('/', express.static(FRONTEND_DIR, { fallthrough: true, maxAge: '1d' }));

  if (process.env.NODE_ENV !== 'production') {
    const NODE_MODULES_DIR = path.resolve(FRONTEND_DIR, 'node_modules');
    if (fs.existsSync(NODE_MODULES_DIR)) {
      console.log('[frontend] Exposing node_modules at /node_modules ->', NODE_MODULES_DIR);
      app.use('/node_modules', express.static(NODE_MODULES_DIR, { fallthrough: true, maxAge: '7d' }));
    }
  }

  // Important: let /api/* and /ingest/* pass through; fallback only for SPA paths
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

// ----------------- Error handler -----------------
app.use(errorMw);

export default app;
