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

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bash tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in backend code and repo-root db/ (knexfile + migrations)
COPY packages/backend/. /app/
COPY db/ /app/db/

# Sanity check
RUN test -f /app/package.json || (echo "ERROR: /app/package.json missing" && ls -al /app && exit 1)

# Install production deps *in /app*, then FORCE-INSTALL critical runtime deps INTO /app/node_modules,
# and verify with require.resolve (CJS) so build fails early if anything is missing.
RUN --mount=type=cache,target=/root/.npm \
    ( [ -f package-lock.json ] && npm ci --omit=dev || npm install --omit=dev ) \
 && npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']){console.log(m,'=>',require.resolve(m))}"

# Ensure data dirs and map dev path to the volume via symlink
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
