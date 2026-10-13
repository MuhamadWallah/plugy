# Plugy ⚡

**Plugy** is a local small-jobs marketplace that works like InDrive's "you set the price" model, applied to home services:

1. A customer posts a job with a location (GPS, address search or map pin) and the price they want to pay, or asks workers to propose one.
2. Nearby workers see it live with its distance, then **accept the price or counter-offer** with their own price, arrival time and note.
3. The customer compares offers (price, rating, reviews, jobs done), can **raise the price**, and **hires** the worker they choose.
4. The worker navigates there, taps **On my way** (the customer follows them live on the map), **Arrived**, **Start** and **Done**. The two can call and chat once matched.
5. Both rate each other. Cancellations and back-outs carry a reason, a back-out reopens the job, and anyone can report a user.

It also covers what a real service needs: requested time and payment method, automatic expiry of unanswered requests, an installable app with push notifications, a worker "go online" mode that pushes nearby matching jobs, profile and job photos, worker ID verification (required for childcare and care work), a safety screen (emergency call, share job details), password reset by SMS, and an admin queue for reports and suspensions.

---

## Architecture Overview

* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Leaflet + OpenStreetMap
* **Backend**: Node.js, TypeScript, Express, Socket.IO, `pg` (node-postgres connection pool)
* **Database**: PostgreSQL 16 with custom schema migrations (`node-pg-migrate`)
* **Containerization**: Docker Compose

---

## Directory Structure

```text
Plugy/
├── docker-compose.yml              # Multi-container orchestration (Postgres, Backend, Frontend)
├── .env.example                    # Sample environment variables
├── .env                            # Active environment configuration
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── migrations/
│   │   ├── 1710000000001_initial-schema.js   # Users, tokens, categories, jobs, messages, ratings
│   │   └── 1710000000002_seed-categories.js  # Seeds the 6 initial categories
│   └── src/
│       ├── config/                 # DB connection pool (db.ts)
│       ├── routes/                 # Express API routes (health.ts)
│       ├── app.ts                  # Express application setup
│       └── index.ts                # Server entrypoint
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── App.tsx                 # System diagnostics & category preview
│       ├── main.tsx                # React root mount
│       └── index.css               # Tailwind CSS entrypoint
└── README.md
```

---

## Quickstart with Docker Compose

1. **Clone and enter repository**:
   ```bash
   cd Plugy
   ```

2. **Verify `.env` configuration**:
   ```bash
   cp .env.example .env
   ```
   *By default:*
   * PostgreSQL host port: `5434` (mapped to internal `5432`)
   * Backend host port: `5001` (mapped to internal `5000`)
   * Frontend host port: `5174` (mapped to internal `5173`)

3. **Start all services**:
   ```bash
   docker compose up --build -d
   ```

4. **Access the application**:
   * **Frontend UI**: [http://localhost:5174](http://localhost:5174)
   * **Backend Health Check**: [http://localhost:5001/api/health](http://localhost:5001/api/health)
   * **PostgreSQL (host)**: `localhost:5434` (`user: plugy`, `db: plugy`, `pass: plugy_secret`)

5. **Stop services**:
   ```bash
   docker compose down
   ```

> **After changing dependencies** (`package.json`), rebuild with `docker compose up -d --build -V`. The `-V` flag recreates the containers' `node_modules` volumes, which would otherwise keep the old packages.

---

## Database Migrations

Migrations run automatically when the backend container initializes (`npx node-pg-migrate up`).

To run migrations manually:

```bash
# Inside the backend container:
docker compose exec backend npm run migrate:up

# To roll back migrations:
docker compose exec backend npm run migrate:down
```

### Seeded Categories
The database comes pre-seeded with 6 core categories:
1. `cleaning` (Cleaning)
2. `ironing` (Ironing)
3. `gardening` (Gardening)
4. `car_wash` (Car Washing)
5. `care_taking` (Care Taking)
6. `babysitting` (Babysitting)

---

## Automated Test Suite

Run the full integration test suite:

```bash
docker compose exec backend npm test
```

Test suites cover:
- Authentication & Sessions (`auth.test.ts`)
- Feed, Nearby Search, Offers/Counter-Offers & Race-Condition Safe Hiring (`jobs.test.ts`)
- Arrival Flow, Contact & Location Privacy, Back-Outs, Profiles & Reports (`marketplace.test.ts`)
- Scheduling, Expiry, Web Push, Password Reset & Moderation (`operations.test.ts`)
- Worker Online Mode & Nearby Job Alerts (`dispatch.test.ts`)
- Photos, Metadata Stripping & ID Verification (`media.test.ts`)
- Lifecycle Status Transitions & Personal List (`transitions.test.ts`)
- Direct Scoped Chat & Realtime WebSocket Delivery (`messages.test.ts`)
- Post-Completion Ratings & Averages (`ratings.test.ts`)
- Rate Limiting, Request Logging & Error Protection (`hardening.test.ts`)

---

## Production Deployment & User Checklist

`docker-compose.yml` is for local development only. For production, use the compiled, nginx-fronted stack:

```bash
cp .env.production.example .env.production   # set PUBLIC_URL, JWT_SECRET, POSTGRES_PASSWORD, TWILIO_*
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

- **Production Deployment Guide**: see [DEPLOYMENT.md](DEPLOYMENT.md) for HTTPS, required SMS setup, environment variables, managed Postgres, backups, and scaling.
- **User Readiness & Verification Checklist**: see [CHECKLIST.md](CHECKLIST.md) for feature inventory, MVP stubs, and end-to-end manual testing instructions.

