# Plugy ⚡

**Plugy** is a small-jobs marketplace web application (inspired by InDrive's courier on-demand model, but tailored for local service requests and direct worker acceptance).

---

## Architecture Overview

* **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
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

Run the full end-to-end integration and unit test suite across all 8 steps:

```bash
docker compose exec backend npm test
```

Test suites cover:
- Authentication & Sessions (`auth.test.ts`)
- Concurrency & Race-Condition Safe Job Acceptance (`jobs.test.ts`)
- Lifecycle Status Transitions & Personal List (`transitions.test.ts`)
- Direct Scoped Chat & Realtime WebSocket Delivery (`messages.test.ts`)
- Post-Completion Ratings & Averages (`ratings.test.ts`)
- Rate Limiting, Request Logging & Error Protection (`hardening.test.ts`)

---

## Production Deployment & User Checklist

- **Production Deployment Guide**: see [DEPLOYMENT.md](file:///m:/PROJECTS/Plugy/DEPLOYMENT.md) for managed Postgres, HTTPS reverse proxy, WebSocket proxying, and horizontal scaling.
- **User Readiness & Verification Checklist**: see [CHECKLIST.md](file:///m:/PROJECTS/Plugy/CHECKLIST.md) for feature inventory, MVP stubs, and end-to-end manual testing instructions.

