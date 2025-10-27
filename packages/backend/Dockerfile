FROM node:20-alpine

RUN apk add --no-cache postgresql-client tini bash

# Build the backend under /app/packages/backend
WORKDIR /app/packages/backend

# Install only the backend's dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY . .

# Hand control to our entry script
WORKDIR /app
ENTRYPOINT ["/sbin/tini","-g","--"]
CMD ["bash","/app/scripts/entry.sh"]
