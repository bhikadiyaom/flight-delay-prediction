# Node API image. Build context: ./server
#   docker build -t fdp-server ./server
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# production dependencies only (no test tooling, no mongodb-memory-server)
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 5000
# /api/v1/health is 200 when the DB is up (even if the ML service is degraded) and 503 when the DB is down
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5000}/api/v1/health" >/dev/null || exit 1
CMD ["node", "src/server.js"]
