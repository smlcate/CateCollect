# packages/backend/Dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine

WORKDIR /app

# Install prod deps for backend package (expects context = repo root)
COPY packages/backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy backend source
COPY packages/backend/. .

# Copy repo-root db (knexfile + migrations) into image (adds migrations; does NOT remove your backend/db client)
COPY db ./db

# Verify a critical runtime dep (idempotent guard)
RUN node -e "require.resolve('fast-xml-parser')" || npm i fast-xml-parser@^4 --omit=dev

EXPOSE 4000
CMD ["node", "src/server.js"]
