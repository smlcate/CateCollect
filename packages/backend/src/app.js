// packages/backend/src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import carriersRoutes from './routes/carriers.routes.js';
import claimsRoutes from './routes/claims.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import errorMw from './middleware/error.js';
import uploadsRoutes from './routes/uploads.routes.js';
import claimChecklistRoutes from './routes/claims.checklist.routes.js';
import ingestUploadPage from './routes/ingest.uploadpage.js';

// --- CCC Ingest (routes/dashboard) ---
import ingestApi from './routes/ingest.routes.js';
import ingestDashboard from './routes/ingest.dashboard.js';
import knex from '../db/knexClient.js';

const app = express();

/** behind Caddy/HTTPS we trust the proxy so req.protocol etc. are correct */
app.set('trust proxy', 1);

/** Helmet under proxy/HTTPS: keep strict CSP; disable COOP/OAC only when not HTTPS */
const isHttps = process.env.TRUST_HTTPS === '1';
// Build CSP by hand. IMPORTANT: no `upgrade-insecure-requests` on HTTP.
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],                 // upload page loads /ingest/upload.js (external file)
  "style-src": ["'self'", "'unsafe-inline'"], // tiny inline <style> in the page
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "form-action": ["'self'"],                // allow POST to same-origin http
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "font-src": ["'self'", "data:"],
  "object-src": ["'none'"],
  "script-src-attr": ["'none'"],
};

// Only add upgrade-insecure-requests when truly behind TLS (via reverse proxy)
if (isHttps) cspDirectives["upgrade-insecure-requests"] = [];

// Use Helmet with NO CSP defaults so our directives are the only ones applied
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: cspDirectives,
  },
  // Don’t send HSTS on plain HTTP
  hsts: isHttps ? undefined : false,

  // COOP & origin agent cluster only on HTTPS; disable on HTTP to silence console noise
  crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
  originAgentCluster: isHttps ? true : false,
}));

// After the helmet() call
if (!isHttps) {
  app.use((req, res, next) => {
    // Replace any prior CSP with our exact one (no upgrade-insecure-requests)
    const csp = Object.entries(cspDirectives)
      .map(([k, v]) => Array.isArray(v) ? `${k} ${v.join(' ')}` : k)
      .join(';');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', csp);
    res.removeHeader('Strict-Transport-Security');
    next();
  });
}


// Optional: avoid 404 noise for favicon
app.get('/favicon.ico', (_req, res) => res.status(204).end());
// core middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ---------- API routes ----------
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/uploads', uploadsRoutes);
app.use('/api/carriers', carriersRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/claimsChecklist', claimChecklistRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/ingest', ingestUploadPage());

// ---------- CCC Ingest routes ----------
const INCOMING_DIR = process.env.INCOMING_DIR || path.join(process.cwd(), 'data', 'incoming');
const ARCHIVE_DIR  = process.env.ARCHIVE_DIR  || path.join(process.cwd(), 'data', 'archive');
app.use('/api/ingest', ingestApi(knex));
app.use('/ingest', ingestDashboard(knex, { incomingDir: INCOMING_DIR, archiveDir: ARCHIVE_DIR }));

// ---------- Frontend resolution ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasIndex(dir) {
  try { fs.accessSync(path.join(dir, 'index.html'), fs.constants.R_OK); return true; }
  catch { return false; }
}

function resolveFrontendDir() {
  if (process.env.FRONTEND_DIR && hasIndex(process.env.FRONTEND_DIR)) return process.env.FRONTEND_DIR;
  const candidates = [
    path.resolve(__dirname, '../../web'),        // monorepo default
    path.resolve(__dirname, '../../../web'),     // sibling of repo root
    path.resolve(process.cwd(), 'web'),
    path.resolve(process.cwd(), 'CateCollect/web'),
  ];
  for (const c of candidates) if (hasIndex(c)) return c;
  return null;
}

const FRONTEND_DIR = resolveFrontendDir();

// ---------- Static serving ----------
if (FRONTEND_DIR) {
  console.log('[frontend] Serving from:', FRONTEND_DIR);

  // Serve app assets
  app.use('/', express.static(FRONTEND_DIR, { fallthrough: true, maxAge: '1d' }));

  // Serve node_modules only in development
  if (process.env.NODE_ENV !== 'production') {
    const NODE_MODULES_DIR = path.resolve(FRONTEND_DIR, 'node_modules');
    if (fs.existsSync(NODE_MODULES_DIR)) {
      console.log('[frontend] Exposing node_modules at /node_modules ->', NODE_MODULES_DIR);
      app.use('/node_modules', express.static(NODE_MODULES_DIR, { fallthrough: true, maxAge: '7d' }));
    } else {
      console.warn('[frontend] node_modules not found at:', NODE_MODULES_DIR);
    }
  }

  // SPA fallback: serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
} else {
  console.warn('[frontend] No index.html found. Set FRONTEND_DIR or place web/index.html');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.status(404).send('Frontend not found: set FRONTEND_DIR or add web/index.html');
  });
}

// ---------- Error handler ----------
app.use(errorMw);

export default app;
