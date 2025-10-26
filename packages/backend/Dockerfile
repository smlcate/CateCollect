# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine

# wait-for-db tools
RUN apk add --no-cache postgresql-client tini bash

WORKDIR /app

# 1) Install production deps for backend (build context MUST be repo root)
COPY packages/backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 2) Copy backend source
COPY packages/backend/. .

# 3) Bring in repo-root db (knexfile + migrations) to /app/db
COPY db ./db

# 4) Ensure critical runtime deps exist (ESM-safe) and verify now
RUN npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']) console.log(m,'=>',require.resolve(m))"

# 5) Startup: wait for PG, run migrations, then launch server
RUN printf '%s\n' '#!/bin/sh' \
  'set -euo pipefail' \
  'echo "[entry] waiting for postgres at ${PGHOST:-db}:${PGPORT:-5432}..."' \
  'for i in $(seq 1 90); do pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-workflow_user}" >/dev/null 2>&1 && break; sleep 1; done' \
  'echo "[entry] running migrations (knex migrate:latest)..."' \
  'node ./node_modules/.bin/knex --knexfile ./db/knexfile.cjs migrate:latest' \
  'echo "[entry] starting API..."' \
  'exec node src/server.js' \
  > /usr/local/bin/start-backend && chmod +x /usr/local/bin/start-backend

EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["/usr/local/bin/start-backend"]
