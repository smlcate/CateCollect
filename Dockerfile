FROM node:20-alpine

RUN apk add --no-cache postgresql-client tini bash

WORKDIR /app

# Install deps at the repo root (works with npm workspaces)
COPY package*.json ./
RUN npm ci

# Copy the whole repo
COPY . .

ENTRYPOINT ["/sbin/tini","-g","--"]
CMD ["bash","/app/scripts/entry.sh"]
