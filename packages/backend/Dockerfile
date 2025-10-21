FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
RUN node -e "try{require.resolve("fast-xml-parser")}catch(e){process.exit(1)}" || npm i fast-xml-parser@^4 --omit=dev
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
