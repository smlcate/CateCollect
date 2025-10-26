# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

# --- Base with sane defaults ---
FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    TRUST_HTTPS=0 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LOGLEVEL=warn
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bash tini && rm -rf /var/lib/apt/lists/*

# --- Stage that installs runtime deps OUTSIDE /app to beat bind-mount masking ---
FROM base AS deps
WORKDIR /opt/app
RUN printf '{ "name":"catecollect-backend-runtime","private":true }' > package.json
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev knex pg fast-xml-parser adm-zip

# --- Final image ---
FROM base AS runner
# Make sure Node can always resolve deps we installed in /opt/node_modules
ENV NODE_PATH=/opt/node_modules
COPY --from=deps /opt/app/node_modules /opt/node_modules

WORKDIR /app

# Bring in backend code and repo-root /db (knexfile + migrations)
# (Your layout: backend has its own /db folder with knexClient.js;
# repo root also has /db with knexfile.cjs + migrations. Both end up in /app/db.)
COPY packages/backend/. /app/
COPY db/ /app/db/

# Optional: install backend's own production deps (express, etc.)
# Even if this prunes hoisted deps, our /opt/node_modules remains available via NODE_PATH.
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --omit=dev || npm install --omit=dev; else npm install --omit=dev; fi

# Ensure data dirs + map dev path logs to the volume via symlink
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
