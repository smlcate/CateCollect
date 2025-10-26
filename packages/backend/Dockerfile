# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine

# Tools to wait for Postgres
RUN apk add --no-cache postgresql-client tini

WORKDIR /app

# 1) Install production deps for backend (context MUST be repo root)
COPY packages/backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 2) Copy backend source
COPY packages/backend/. .

# 3) Copy repo-root db (knexfile + migrations) into /app/db
#    This will overwrite backend/db/knexfile.cjs with the root one (correctly points to host 'db')
COPY db ./db

# 4) Ensure critical runtime deps exist (ESM-safe) and verify them now
RUN npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']) console.log(m,'=>',require.resolve(m))"

# 5) Tiny entrypoint that waits for Postgres before starting Node
#    Uses PG* envs provided by compose
RUN printf '#!/bin/sh\nset -e\nif [ -n "$PGHOST" ]; then echo "[entry] waiting for postgres at $PGHOST:$PGPORT..."; for i in $(seq 1 60); do pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-workflow_user}" >/dev/null 2>&1 && break; sleep 1; done; fi\nexec node src/server.js\n' > /usr/local/bin/start-backend && chmod +x /usr/local/bin/start-backend

EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["/usr/local/bin/start-backend"]
