FROM node:20-alpine

WORKDIR /app

# Install prod deps for backend package
COPY packages/backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy backend source
COPY packages/backend/. .

# Copy repo-root db (knexfile + migrations) into image
COPY db ./db

# Ensure fast-xml-parser is available (idempotent)
RUN node -e "try{require.resolve('fast-xml-parser')}catch(e){process.exit(1)}" \
  || npm i fast-xml-parser@^4 --omit=dev

EXPOSE 4000
CMD ["node", "src/server.js"]
