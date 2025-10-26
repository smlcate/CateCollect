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

# Copy backend code first (so its own packages/backend/db stays intact)
COPY packages/backend/. /app/

# Copy the repo-root db/ (knexfile + migrations) to a NON-conflicting path
# (Do NOT overwrite /app/db — your backend uses that for knexClient.js)
COPY db/ /app/knex/

# Sanity check
RUN test -f /app/package.json || (echo "ERROR: /app/package.json missing" && ls -al /app && exit 1)

# Install production deps in /app, then force-runtime deps and verify them
RUN --mount=type=cache,target=/root/.npm \
    ( [ -f package-lock.json ] && npm ci --omit=dev || npm install --omit=dev ) \
 && npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']){console.log(m,'=>',require.resolve(m))}"

# Data dirs + link to keep dev-logged paths happy
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
