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

# 1) Copy ONLY backend manifests so npm install can cache
COPY packages/backend/package*.json /app/

# 2) Install prod deps (lockfile-aware). If lock mismatched, fall back.
#    Then FORCE-INSTALL the critical runtime deps you listed, and VERIFY them
#    immediately during the build so the image fails early if anything is missing.
RUN --mount=type=cache,target=/root/.npm \
    (npm ci --omit=dev || npm install --omit=dev) \
 && npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']){console.log(m,'=>',require.resolve(m))}"

# 3) Bring in backend source and the repo-root db/ (knexfile + migrations)
COPY packages/backend/. /app/
COPY db/ /app/db/

# 4) Compatibility shim so any legacy '/app/db/knexClient.js' import keeps working
RUN printf "export { default as default } from '../src/db/knexClient.js';\n" > /app/db/knexClient.js

# 5) Ensure container data dirs exist and map dev path to the volume:
#    many dev references point to packages/backend/data; symlink it to /app/data
RUN mkdir -p /app/data/incoming /app/data/archive \
 && mkdir -p /app/packages/backend \
 && rm -rf /app/packages/backend/data \
 && ln -s /app/data /app/packages/backend/data

EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","src/server.js"]
