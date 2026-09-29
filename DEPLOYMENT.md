# Plugy — Production Deployment Guide

This guide details the exact steps and architecture required to transition Plugy from local `docker-compose` to a hardened, scalable production host.

---

## 1. Architecture Topology

```
[Browser / Mobile Client]
          │
          │ HTTPS (443) / WSS (WebSockets)
          ▼
[Reverse Proxy / CDN / Load Balancer] (Cloudflare / Nginx / Caddy / AWS ALB)
    ├── Static Assets (SPA) ──► CDN / Object Storage (Cloudflare Pages / S3 / Vercel)
    │
    └── API & WebSockets (/api/*, /socket.io/*)
          │
          ▼
   [Node.js Backend] (Express + Socket.IO Server instances)
          │
          │ Managed Connection Pool (PgBouncer) / SSL (TLSv1.3)
          ▼
   [Managed PostgreSQL] (AWS RDS / Neon / Supabase / DigitalOcean Managed DB)
```

---

## 2. Managed PostgreSQL Setup

In development, Postgres runs in a local container on port `5434`. In production, use a managed database instance:

1. **Provision Managed Database**:
   - Recommended providers: AWS RDS Aurora PostgreSQL 16, Supabase, Neon, or DigitalOcean Managed PostgreSQL.
2. **Enable Connection Pooling**:
   - Highly recommended to use **PgBouncer** (often built into Supabase and Neon) to maintain hundreds of concurrent worker/poster connections without exhausting database process limits.
3. **Enforce SSL**:
   - Cloud providers require SSL (`sslmode=require`).
   - Plugy's `db.ts` automatically activates SSL when `NODE_ENV=production` and connecting to non-local endpoints:
     ```bash
     DATABASE_URL=postgres://plugy_admin:YOUR_SECURE_PASSWORD@db.managed-host.com:5432/plugy?sslmode=require
     ```
4. **Run Migrations on Deploy**:
   - Run migrations as part of your CI/CD deployment pipeline before traffic reaches new container versions:
     ```bash
     npm run migrate:up
     ```

---

## 3. HTTPS & Reverse Proxy Configuration

Every production deployment must terminate TLS/HTTPS at the edge and forward to the internal application.

### Nginx Example Configuration

```nginx
# /etc/nginx/sites-available/plugy.conf

upstream plugy_backend {
    server 127.0.0.1:5000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name plugy.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name plugy.yourdomain.com;

    # SSL Certificates (Let's Encrypt / Certbot)
    ssl_certificate /etc/letsencrypt/live/plugy.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/plugy.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Frontend Static SPA Assets
    root /var/www/plugy/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://plugy_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Realtime WebSocket Proxy (Socket.IO)
    location /socket.io/ {
        proxy_pass http://plugy_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Prevent idle WebSocket connections from timing out
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 4. WebSocket Support & Horizontal Scaling

1. **Proxy Headers**:
   - Ensure the proxy forwards `Upgrade $http_upgrade` and `Connection "upgrade"`.
2. **Timeouts**:
   - Set proxy read/send timeouts to at least 24 hours (`86400s`) or configure regular Socket.IO ping/pong heartbeats.
3. **Horizontal Scaling Across Multiple Backend Nodes**:
   - If running more than 1 backend container instance, install and configure `@socket.io/redis-adapter` with a Redis/Valkey instance so events (job created, accepted, chat messages) broadcast across all nodes.
   - Configure **sticky sessions** (IP hash or cookie-based routing) on your load balancer for the initial HTTP long-polling handshake before upgrade.

---

## 5. Production Environment Variables Checklist

Set these in your host's secure environment manager (AWS Parameter Store, Doppler, Vault, or platform environment settings). **Never commit these to git:**

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimisations and disables stack trace leakage |
| `PORT` | `5000` | Internal listening port |
| `DATABASE_URL` | `postgres://user:pass@host:5432/plugy?sslmode=require` | Managed PostgreSQL connection string |
| `JWT_SECRET` | *(64-character random string)* | Secret for signing auth tokens (min 32 chars) |
| `JWT_EXPIRES_IN` | `7d` | Session expiration window |
| `CORS_ORIGIN` | `https://plugy.yourdomain.com` | Strict origin matching for cross-origin requests |
| `COOKIE_SECURE` | `true` | Restricts session cookie to HTTPS connections |
| `RATE_LIMIT_AUTH_MAX` | `10` | Max auth attempts per IP per 15-minute window |
| `RATE_LIMIT_JOBS_MAX` | `20` | Max job creation requests per IP per 15-minute window |

---

## 6. Production Build & Deployment Pipeline

### Backend Multi-Stage Production Dockerfile

```dockerfile
# Multi-stage production build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/
USER node
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

### Frontend Production Build
```bash
cd frontend
npm ci
npm run build
# Upload ./dist to Cloudflare Pages, S3+CloudFront, or Nginx root
```
