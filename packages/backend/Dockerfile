# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    TRUST_HTTPS=0

WORKDIR /app

# tiny init + basics
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates bash \
 && rm -rf /var/lib/apt/lists/*

# 1) Copy ONLY backend manifests first so npm install can cache properly
COPY packages/backend/package*.json /app/

# 2) Install prod deps (lockfile-aware). If lock missing/mismatched, fall back.
#    Then force-install critical runtime deps in case the manifest missed one.
RUN --mount=type=cache,target=/root/.npm \
    (npm ci --omit=dev || npm install --omit=dev) \
 && npm i --no-save knex pg fast-xml-parser adm-zip

# 3) Bring in backend source and the monorepo db/ (knexfile + migrations)
COPY packages/backend/. /app/
COPY db/ /app/db/

# 4) Compatibility shim for any legacy absolute import "/app/db/knexClient.js"
#    Re-exports the real client from src/db/knexClient.js (ESM default)
RUN printf "export { default as default } from '../src/db/knexClient.js';\n" > /app/db/knexClient.js

# 5) Ensure data dirs exist (compose will bind-mount /root/CateCollect/data -> /app/data)
RUN mkdir -p /app/data/incoming /app/data/archive

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
