#!/usr/bin/env bash
set -euo pipefail

log(){ echo "[entry] $*"; }

# --- wait for DB -----------------------------------------------------------
: "${PGHOST:=db}" "${PGPORT:=5432}"
until (exec 3<>/dev/tcp/$PGHOST/$PGPORT) 2>/dev/null; do
  log "waiting for postgres at ${PGHOST}:${PGPORT}..."
  sleep 1
done

# --- pick app root: prefer monorepo path -----------------------------------
if [ -d /app/packages/backend/src ]; then
  APP_ROOT=/app/packages/backend
  APP_SRC=/app/packages/backend/src
elif [ -d /app/src ]; then
  APP_ROOT=/app
  APP_SRC=/app/src
elif [ -f /app/packages/backend/package.json ]; then
  APP_ROOT=/app/packages/backend
  APP_SRC=/app/packages/backend/src
elif [ -f /app/package.json ]; then
  APP_ROOT=/app
  APP_SRC=/app/src
else
  log "FATAL: cannot find app at /app/packages/backend or /app"
  ls -la /app || true
  exit 1
fi
log "app root = ${APP_ROOT}"
log "app src  = ${APP_SRC}"

# --- data dirs & links -----------------------------------------------------
log "ensuring data dirs exist"
mkdir -p /app/data/archive /app/Claims/Unassigned
rm -rf /app/data/incoming && ln -s /app/Claims/Unassigned /app/data/incoming
if [ ! -L "${APP_ROOT}/data" ]; then
  rm -rf "${APP_ROOT}/data" 2>/dev/null || true
  ln -s /app/data "${APP_ROOT}/data"
fi

# --- migrations via a tiny runner (only use existing dirs) -----------------
log "bootstrapping knex & pg under /tmp/knex-runner"
rm -rf /tmp/knex-runner && mkdir -p /tmp/knex-runner
cat >/tmp/knex-runner/package.json <<PKG
{"name":"knex-runner","private":true,"dependencies":{"knex":"^3","pg":"^8"}}
PKG
npm --prefix /tmp/knex-runner --silent install

log "running migrations (CJS runner)…"
cat >/tmp/knex-runner/migrate.cjs <<'JS'
const fs = require('fs');
const path = require('path');
const knexLib = require('knex');

const candidates = [
  '/app/db/migrations',
  '/app/packages/backend/db/migrations',
  path.join(process.env.APP_ROOT || '/app', 'db', 'migrations'),
  path.join(process.env.APP_ROOT || '/app', 'migrations'),
];
const dirs = candidates.filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });

if (!dirs.length) {
  console.error('[migrate] no migrations dirs found among:', candidates);
  process.exit(1);
}

const knex = knexLib({
  client: process.env.PGCLIENT || 'pg',
  connection: {
    host: process.env.PGHOST || 'db',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'workflow_user',
    password: process.env.PGPASSWORD || 'devpass',
    database: process.env.PGDATABASE || 'insurance_workflow',
  },
  migrations: { directory: dirs }
});

(async () => {
  try {
    await knex.migrate.latest();
    console.log('[migrate] ok (dirs:', dirs.join(', '), ')');
  } catch (e) {
    console.error('[migrate] failed:', e);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
JS

APP_ROOT="$APP_ROOT" node /tmp/knex-runner/migrate.cjs

# --- ensure runtime deps where the app really lives ------------------------
if [ -f "${APP_ROOT}/package.json" ] && [ ! -d "${APP_ROOT}/node_modules" ]; then
  log "installing runtime deps in ${APP_ROOT}…"
  npm --prefix "${APP_ROOT}" --silent ci --omit=dev || npm --prefix "${APP_ROOT}" --silent install --omit=dev
fi

# --- start API -------------------------------------------------------------
export NODE_PATH="/app/node_modules:/app/packages/backend/node_modules:${APP_ROOT}/node_modules"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4000}"

START_FILE=""
for F in "${APP_SRC}/server.js" "${APP_SRC}/server.mjs"; do
  [ -f "$F" ] && START_FILE="$F" && break
done

if [ -n "$START_FILE" ]; then
  log "starting API via ${START_FILE}"
  exec node "$START_FILE"
else
  log "starting API by wrapping ${APP_SRC}/app.(js|mjs)"
  cat >/tmp/serve-app.mjs <<JS
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
let appMod;
try { appMod = await import('file://${APP_SRC}/app.mjs'); }
catch { appMod = await import('file://${APP_SRC}/app.js'); }
const app = appMod.default || appMod.app || appMod;
const server = app.listen(PORT, HOST, () => console.log(\`API listening on \${HOST}:\${PORT}\`));
JS
  exec node --experimental-specifier-resolution=node /tmp/serve-app.mjs
fi
