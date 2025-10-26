# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine

WORKDIR /app

# Install production deps for backend (context MUST be repo root)
COPY packages/backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy backend source
COPY packages/backend/. .

# Merge repo-root db/ (knexfile + migrations) into /app/db
# This ADDS knexfile/migrations without overwriting your backend/db/knexClient.js
COPY db ./db

# Ensure critical runtime deps exist (belt & suspenders for monorepo drift)
RUN npm i --no-save knex pg fast-xml-parser adm-zip \
 && node -e "for (const m of ['knex','pg','fast-xml-parser','adm-zip']) console.log(m,'=>',require.resolve(m))"

EXPOSE 4000
CMD ["node","src/server.js"]
