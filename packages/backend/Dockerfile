# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    TRUST_HTTPS=0 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LOGLEVEL=warn

# -------- Stage: deps installed OUTSIDE /app to avoid bind-mount masking --------
FROM base AS deps
WORKDIR /opt/app           # neutral workdir for dependency install
# We only need a manifest to make npm happy; we'll pin runtime deps anyway.
RUN printf '{ "name":"catecollect-backend-runtime","private":true }' > package.json
# Install the runtime deps you listed so they ALWAYS exist at runtime
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev knex pg fast-xml-parser adm-zip
# Keep only node_modules to copy into final image
RUN test -d node_modules && find node_modules -maxdepth 1 -type d -name knex -o -name pg >/dev/null

# -------- Final image --------
FROM base AS runner
# 1) Put runtime deps in a location immune to /app bind-mounts
ENV NODE_PATH=/opt/node_modules
COPY --from=deps /opt/app/node_modules /opt/node_modules

# 2) App code lives in /app (your chosen layout)
WORKDIR /app
# Copy backend code and repo-root db/ (knexfile + migrations)
COPY packages/backend/. /app/
COPY db/ /app/db/

# 3) Sanity: we should have the backend manifest
RUN test -f /app/package.json || (echo "ERROR: /app/package.json missing" && ls -la /app && exit 1)

# 4) Legacy absolute-import shim for '/app/db/knexClient.js'
RUN printf "export { default as default } from '../src/db/knexClient.js';\n" > /app/db/knexClient.js

# 5) Ensure container data dirs and map dev path to the volume via symlink
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
CMD ["node","src/server.js"]
