FROM node:22-alpine AS base
WORKDIR /app

# ------------------------------------------------------------------
# development: Vite dev server with HMR (used by docker-compose.yml)
# ------------------------------------------------------------------
FROM base AS development

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]

# ------------------------------------------------------------------
# build: type-check and bundle the SPA into dist/
# ------------------------------------------------------------------
FROM base AS build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ------------------------------------------------------------------
# production: nginx serves the SPA and proxies /api + /socket.io to the backend
# (default target). Same-origin serving is required: the app calls relative /api URLs
# and sets SameSite=Strict session cookies.
# ------------------------------------------------------------------
FROM nginx:1.28-alpine AS production

# host:port of the backend API, resolved at request time so backend restarts don't break routing
ENV BACKEND_UPSTREAM=backend:5000
# Let the nginx entrypoint expose the container's DNS resolver to the config template
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
