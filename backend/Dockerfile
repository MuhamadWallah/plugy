FROM node:22-alpine AS base
WORKDIR /app

# ------------------------------------------------------------------
# development: hot-reloading dev server (used by docker-compose.yml)
# ------------------------------------------------------------------
FROM base AS development

# Install dependencies needed for node-gyp or postgres tools if needed
RUN apk add --no-cache netcat-openbsd

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npx node-pg-migrate up && npm run dev"]

# ------------------------------------------------------------------
# build: compile TypeScript to dist/
# ------------------------------------------------------------------
FROM base AS build

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ------------------------------------------------------------------
# production: compiled app + runtime dependencies only (default target)
# ------------------------------------------------------------------
FROM base AS production

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

USER node

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

# Apply pending migrations (node-pg-migrate takes an advisory lock, so this is safe with
# several replicas), then exec node so it receives SIGTERM directly for graceful shutdown.
# Set RUN_MIGRATIONS=false if migrations run as a separate release step instead.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" != \"false\" ]; then ./node_modules/.bin/node-pg-migrate up; fi && exec node dist/index.js"]
