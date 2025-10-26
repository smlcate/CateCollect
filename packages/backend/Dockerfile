# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    TRUST_HTTPS=0 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app

# tiny init + basics
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates bash \
 && rm -rf /var/lib/apt/lists/*

# Bring in the backend source and the repo-root db/ (knexfile + migrations)
COPY packages/backend/. /app/
COPY db/ /app/db/

# Sanity: ensure manifest exists
RUN test -f /app/package.json || (echo "ERROR: /app/package.json missing" && ls -al /app && exit 1)

# Install prod deps *after* full copy, then force + verify runtime deps.
RUN --mount=type=cache,target=/root/.npm \
    (npm ci --omit=dev || npm install --omit=dev) \
 && npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']){console.log(m,'=>',require.resolve(m))}"

# Legacy absolute-import shim for '/app/db/knexClient.js'
RUN printf "export { default as default } from '../src/db/knexClient.js';\n" > /app/db/knexClient.js

# Ensure container data dirs and map dev path to the volume via symlink
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
