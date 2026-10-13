# Plugy — Production Deployment Guide

Plugy ships with a production Docker setup that has been verified end to end (fresh database migration, REST API, WebSocket chat through the proxy, rate limiting, graceful restarts). This guide covers deploying it.

---

## 1. Architecture

```
[Browser]
    │  HTTPS / WSS
    ▼
[TLS proxy]  Caddy, Cloudflare, a cloud load balancer, or host nginx + certbot
    │  HTTP
    ▼
[web]  nginx (frontend image, production target)
    ├── /            → built React SPA (static files)
    ├── /api/*       → backend:5000
    └── /socket.io/* → backend:5000 (WebSocket upgrade)
                │
                ▼
         [backend]  Node.js: compiled Express + Socket.IO (backend image, production target)
                │  migrations run automatically on start
                ▼
         [postgres]  bundled PostgreSQL 16 container, or a managed database
```

The SPA must be served from the **same origin** as the API: it calls relative `/api` URLs, and the session cookie is `SameSite=Strict`. The `web` container takes care of this.

| File | Purpose |
| :--- | :--- |
| `docker-compose.prod.yml` | Production stack: `postgres`, `backend`, `web` |
| `.env.production.example` | Template for production settings and secrets |
| `backend/Dockerfile` (target `production`) | Compiled TypeScript, runtime deps only, non-root, healthcheck, runs migrations then `node dist/index.js` |
| `frontend/Dockerfile` (target `production`) | Vite build served by nginx with API/WebSocket proxying, asset caching, gzip and security headers |
| `frontend/nginx/default.conf.template` | nginx config (the backend address comes from `BACKEND_UPSTREAM`) |

`docker-compose.yml` is the **development** stack (hot reload, dev servers). Don't use it in production.

---

## 2. Deploy on a single host (Docker Compose)

Requirements: a Linux server with Docker Engine and the Compose plugin, a domain pointing at the server, and Twilio credentials (see §4).

```bash
git clone <your-repo-url> plugy && cd plugy

cp .env.production.example .env.production
# Edit .env.production: set PUBLIC_URL, JWT_SECRET, POSTGRES_PASSWORD, TWILIO_*
# Generate a JWT secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Check it:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps    # all services "healthy"
curl -s http://localhost/api/health                                         # {"status":"ok",...}
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```

Compose refuses to start if `PUBLIC_URL`, `JWT_SECRET` or `POSTGRES_PASSWORD` is missing, and the backend refuses to start with a weak or default `JWT_SECRET`.

### Updating to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

New migrations apply automatically when the backend starts. The backend shuts down gracefully (in about 1s) on `SIGTERM`. Connected browsers reconnect their WebSocket and rejoin open chats automatically. nginx resolves the backend at request time, so recreating the backend container never requires restarting `web`.

### Backups (bundled database)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U plugy -d plugy --format=custom > plugy-$(date +%F).dump
```

The data lives in the Docker volume `plugy_prod_pgdata`. Schedule the dump (cron) and copy it off the host.

Photos and ID documents live in the volume `plugy_prod_uploads`; back it up alongside the database:

```bash
docker run --rm -v plugy_prod_uploads:/data -v "$PWD":/backup alpine tar czf /backup/plugy-uploads-$(date +%F).tgz -C /data .
```

---

## 3. HTTPS

The `web` container serves plain HTTP. Terminate TLS in front of it. The session cookie is `Secure`, so **login only works over HTTPS** (or on `http://localhost`).

**Option A: Caddy on the same host (automatic Let's Encrypt).** In `.env.production`, set `HTTP_BIND=127.0.0.1`, `HTTP_PORT=8080` and `TRUST_PROXY=2`, then use this `/etc/caddy/Caddyfile`:

```
plugy.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy proxies WebSockets automatically.

**Option B: host nginx + certbot.** Same `.env.production` settings as Option A:

```nginx
server {
    listen 443 ssl http2;
    server_name plugy.example.com;
    ssl_certificate     /etc/letsencrypt/live/plugy.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/plugy.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
server {
    listen 80;
    server_name plugy.example.com;
    return 301 https://$host$request_uri;
}
```

**Option C: Cloudflare or a cloud load balancer** in front of port 80. Enable WebSockets and set `TRUST_PROXY=2`.

### `TRUST_PROXY`, the proxy hop count

Rate limits are per client IP. `TRUST_PROXY` tells the API how many proxies sit in front of it, so it reads the real client IP from `X-Forwarded-For`:

- `1`: the bundled nginx only (clients connect straight to the `web` container).
- `2`: one more proxy in front (Caddy, host nginx, Cloudflare, a load balancer).

If it's set too low, every user shares the proxy's IP and its rate-limit bucket. If it's set too high, clients can spoof their IP.

---

## 4. SMS for phone verification (required)

Registration requires a verified phone number. In production the code is delivered **only** by SMS: it isn't shown on screen or written to logs. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_PHONE_NUMBER`. Without them:

- the backend logs a startup warning,
- `POST /api/auth/send-otp` returns `503 Unable to send the verification SMS`,
- **new users cannot sign up** (existing users can still log in).

---

## 4b. Maps, location and address search

- **HTTPS is required for location.** Browsers only allow GPS access ("Use my location", live worker tracking) on HTTPS pages (or `localhost`). On plain HTTP the app falls back to address search.
- **Map tiles** come from the OpenStreetMap tile servers and **address search** from OpenStreetMap Nominatim. Both are free but meant for light use: the app follows their rules (attribution, at most one search per second, no search-as-you-type). See the [tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) usage policies. Once you have real traffic, switch to a commercial or self-hosted provider: change the tile URL in `frontend/src/components/MapView.tsx` and the `NOMINATIM` base URL in `frontend/src/utils/geo.ts`.
- **Live location** is relayed from the hired worker's phone to the customer only while the worker has the job screen open (browsers can't share location from the background). Positions are never stored.
- **Privacy:** the public feed shows only an approximate location (about 1 km). The exact pin and phone numbers are revealed only to the customer and the hired worker.

---

## 4c. Push notifications and the installable app

Plugy is an installable web app ("Add to Home Screen"). With push enabled, users get alerts for new offers, being hired, "worker on the way / arrived", completed jobs and chat messages, and workers who are **online** get new matching jobs near them, even when Plugy is closed.

1. Generate a key pair **once** and keep it forever. Changing keys makes every device re-subscribe the next time it opens Plugy.
   ```bash
   docker run --rm node:22-alpine npx -y web-push generate-vapid-keys
   ```
2. Put them in `.env.production` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, with a contact address in `VAPID_SUBJECT` (`mailto:you@yourdomain`).
3. Users turn alerts on from **My profile → Notifications on this device** (they're also asked after posting a job or sending an offer).

Notes:
- Push requires HTTPS. **iPhone users must add Plugy to the Home Screen first** (iOS 16.4+ only delivers web push to installed apps); the profile page tells them how.
- Without VAPID keys the backend logs a warning and push stays off; live in-app alerts still work while Plugy is open.
- Signing out removes that device's subscription, so a shared phone doesn't keep receiving the previous user's alerts.

## 4d. Operations: moderation, safety number, request expiry

- **Moderation:** list admin emails in `ADMIN_EMAILS` (comma-separated). Those accounts see **Reports** in the menu, where they can dismiss reports or suspend an account. Suspending blocks sign-in, ends the person's live sessions, cancels their open jobs and withdraws their pending offers. Admins can reinstate accounts from the resolved list.
- **Safety screen:** shows a call button for `EMERGENCY_NUMBER` (default `112`, which works from most mobile networks). Set your country's number if different.
- **Request expiry:** open requests close automatically when nobody is hired: "as soon as possible" requests after `JOB_OPEN_HOURS` (default 72), scheduled ones two hours after their requested time. The customer is notified and can repost.
- **Password reset** uses an SMS code to the verified phone number (Twilio, see §4) and signs out every other device.
- **ID verification:** workers submit a photo of their ID and a selfie from **My profile**. Admins review them under **Reports → ID checks** and approve or reject (with a reason the worker sees). Approved workers show an **ID verified** badge. Jobs in `ID_REQUIRED_CATEGORIES` (default babysitting and care taking) accept offers, and send alerts, only to verified workers. ID files are stored in the private part of the uploads volume and are only served to admins; they are kept for audit, so include them in your data-retention policy.
- **Photos:** every upload (profile photos, up to 4 job photos, ID documents) is decoded and re-encoded server-side, which drops embedded metadata such as phone GPS coordinates, and is capped at 10 MB.

---

## 5. Environment variables

Set these in `.env.production` (git-ignored). Never commit real values.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PUBLIC_URL` | *(required)* | Public origin, e.g. `https://plugy.example.com`. Allowed CORS/WebSocket origin; comma-separate several (apex + www) |
| `JWT_SECRET` | *(required)* | Session signing secret, at least 32 chars (use 64+ random chars) |
| `POSTGRES_PASSWORD` | *(required)* | Password for the bundled database (letters/digits, or URL-encode it) |
| `POSTGRES_USER` / `POSTGRES_DB` | `plugy` | Bundled database user and name |
| `DATABASE_URL` | bundled postgres | Point at a managed database instead (see §6) |
| `JWT_EXPIRES_IN` | `7d` | Session lifetime |
| `HTTP_BIND` / `HTTP_PORT` | `0.0.0.0` / `80` | Where the `web` container listens on the host |
| `COOKIE_SECURE` | `true` | HTTPS-only session cookie. Set `false` only for a temporary plain-HTTP test |
| `TRUST_PROXY` | `1` | Proxy hop count (see §3) |
| `RATE_LIMIT_AUTH_MAX` | `15` | Auth/OTP requests per IP per 15 minutes |
| `RATE_LIMIT_JOBS_MAX` | `30` | Job posts per IP per 15 minutes |
| `RATE_LIMIT_OFFERS_MAX` | `60` | Offers sent per IP per 15 minutes |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *(empty: push off)* | Web Push keys (see §4c) |
| `VAPID_SUBJECT` | `mailto:support@plugy.app` | Contact for push services; use your own address |
| `ADMIN_EMAILS` | *(empty)* | Accounts that can review reports and suspend users |
| `EMERGENCY_NUMBER` | `112` | Number on the in-app Safety screen |
| `JOB_OPEN_HOURS` | `72` | Hours before an unanswered "as soon as possible" request expires |
| `ID_REQUIRED_CATEGORIES` | `babysitting,care_taking` | Kinds of work that need an approved ID to offer (empty to disable) |
| `RATE_LIMIT_UPLOADS_MAX` | `40` | Photo uploads per IP per 15 minutes |
| `UPLOAD_DIR` | `/data/uploads` (production image) | Where photos and ID documents are stored; mounted as the `uploads` volume |
| `RUN_MIGRATIONS` | `true` | Run migrations on backend start. Set `false` if a release step runs `npm run migrate:up` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | *(empty)* | SMS delivery (see §4) |

---

## 6. Managed PostgreSQL (optional)

To use AWS RDS, Neon, Supabase, DigitalOcean, etc., set:

```bash
DATABASE_URL=postgres://user:password@db.example.com:5432/plugy?sslmode=require
```

The backend enables TLS automatically for non-local hosts in production, and migrations run against this URL on start. The bundled `postgres` service then sits idle: remove it and the backend's `depends_on` from `docker-compose.prod.yml` if you don't want it. For many concurrent users, use the provider's connection pooler (PgBouncer).

---

## 7. Running on a platform instead of Compose

Both images are standalone:

- **Backend**: `docker build --target production ./backend`. Needs the env vars above (`CORS_ORIGIN` takes the place of `PUBLIC_URL`, plus `DATABASE_URL`). Health check: `GET /api/health` on port 5000.
- **Web**: `docker build --target production ./frontend`. Set `BACKEND_UPSTREAM` to the backend's `host:port`. Health check: `GET /healthz` on port 80.

Both must be reachable under one public origin. The web image provides that by proxying `/api` and `/socket.io`.

---

## 8. Scaling beyond one backend instance

Socket.IO rooms live in process memory. Before running more than one backend replica:

1. Add `@socket.io/redis-adapter` with Redis/Valkey so events reach clients on every node.
2. Enable sticky sessions on the load balancer, for the long-polling handshake.

Migrations are safe to run from several replicas at once (node-pg-migrate takes an advisory lock).
