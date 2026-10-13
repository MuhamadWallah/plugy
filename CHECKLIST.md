# Plugy — Implementation & User Readiness Checklist

This checklist documents everything that has been built, what is intentionally stubbed/simplified for the MVP, and the manual test procedures to run before onboarding real users.

---

## 1. Summary of Completed Features (Steps 1–10)

### Step 1: Foundation, Database & Migrations
- [x] Docker Compose multi-container stack (`postgres:16-alpine`, `backend`, `frontend`).
- [x] PostgreSQL migration system using `node-pg-migrate`.
- [x] Seeded categories: `cleaning`, `ironing`, `gardening`, `car_wash`, `care_taking`, `babysitting`.
- [x] Database health check endpoint at `GET /api/health` checking connection latency and category counts.

### Step 2: Authentication & Unified Accounts
- [x] Secure password hashing using `bcryptjs` (salt rounds: 10).
- [x] Stateless JWT session management stored in `httpOnly` secure cookies (`plugy_token`).
- [x] Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- [x] Frontend Auth Context with real-time session verification, auto-redirects, and top-level user state.
- [x] Unified account model: a single user can both post jobs and accept open jobs.

### Step 3: Job Posting & Validation
- [x] Endpoint `POST /api/jobs` creating jobs with status `"open"`.
- [x] Zod schema validation: title required (3–120 chars), category validation, positive budget or null/negotiable, description under 1000 chars.
- [x] Endpoint `GET /api/jobs/:id` returning enriched job details (category, poster, worker, ratings).
- [x] Frontend Post a Job form with interactive 6-category visual card selector and immediate success state.

### Step 4: Live Feed, Offers & Race-Condition Safe Hiring (InDrive-style)
- [x] Endpoint `GET /api/jobs?status=open` with category filter, pagination, and **nearby search** (`lat`, `lng`, `radius_km`, `sort=distance`).
- [x] Workers **accept the posted price or counter-offer** with their own price, arrival estimate and note: `POST /api/jobs/:id/offers` (one offer per worker per job; re-sending updates it).
- [x] The **customer chooses**: `GET /api/jobs/:id/offers` lists offers with each worker's rating, review count, completed jobs and phone verification; `POST .../offers/:offerId/accept` hires, `.../decline` declines; workers can `POST .../offers/withdraw`.
- [x] Hiring runs in a locked transaction: concurrent accepts produce exactly 1 hire (`200`) and 1 `409 Conflict`; other offers become "not selected".
- [x] **Raise the price** on an open job (`PATCH /api/jobs/:id/budget`, must go up), updating every worker's feed live.
- [x] Live updates: new jobs, raised prices, hired/removed jobs, new offers, offer decisions, all pushed over Socket.IO to the right people only (per-user rooms).

### Step 5: Status Transitions & Personal Job Management
- [x] Arrival milestones for the hired worker: `POST /api/jobs/:id/en-route` ("On my way") and `POST /api/jobs/:id/arrived`.
- [x] Worker start action: `POST /api/jobs/:id/start` (marks status `"in_progress"`).
- [x] Either party complete action: `POST /api/jobs/:id/complete` (marks status `"completed"`).
- [x] Poster cancel action with optional reason: `POST /api/jobs/:id/cancel` (only allowed when `"open"` or `"accepted"`).
- [x] Worker back-out: `POST /api/jobs/:id/release` with reason (before starting). The job reopens and passed-over offers become pending again.
- [x] Strict state machine enforcing terminal status (completed/cancelled jobs can never change again).
- [x] Endpoint `GET /api/jobs/mine` returning all user jobs as poster or worker with `is_poster`, `is_worker`, `has_rated`.
- [x] "My Jobs" frontend tab with status badges, role filters (`All`, `Posted by Me`, `Accepted by Me`), and confirmation modals.

### Step 6: Direct Job Chat (Poster & Worker)
- [x] Messages table with foreign keys, cascading deletes, and chronological indexing `(job_id, created_at ASC)`.
- [x] Endpoints: `POST /api/jobs/:id/messages`, `GET /api/jobs/:id/messages`.
- [x] Strict authorization: third-party bystanders receive **`403 Forbidden`** on both reading and sending messages.
- [x] Realtime message delivery over Socket.IO scoped to room `job:${jobId}`.
- [x] Socket connections are identified by the session cookie; only the poster or assigned worker can join a job's chat room (bystanders and anonymous sockets are refused).
- [x] Responsive 2-column modal: Job Details on the left, live Chat Panel on the right (with mobile toggle tabs).
- [x] Chat panel is only visible once a job is accepted by a worker.

### Step 7: Post-Completion Ratings & Averages
- [x] Endpoint `POST /api/jobs/:id/rate`:
  - Score 1–5 required.
  - Optional comment up to 1000 characters.
  - Only allowed once the job status is `"completed"`.
  - Only allowed by poster or worker (rating the other party).
  - Enforces single rating per rater per job (cannot rate twice).
  - Prevents rating yourself.
- [x] Database trigger `trg_after_rating_insert` automatically recalculates ratee's `rating_avg` (rounded to 2 decimal places) and `rating_count`.
- [x] Frontend `RatingPrompt` component with interactive 5-star picker, hover previews, and comment box.
- [x] Job modal displays submitted reviews from both parties.
- [x] "My Jobs" tab shows "Rate Worker ★" / "Rate Poster ★" buttons on completed jobs until rated.
- [x] User cards across Feed, My Jobs, Details, and Dashboard display average rating `★ 4.8 (12 reviews)`.

### Step 8: Hardening & Deploy Readiness
- [x] Rate limiting:
  - Auth rate limiter (`POST /api/auth/register`, `POST /api/auth/login`) protecting against brute force.
  - Job posting rate limiter (`POST /api/jobs`) protecting against board spam.
- [x] Centralized error handling middleware preventing server stack traces or raw SQL from leaking to clients.
- [x] Consistent JSON error response shape across every endpoint: `{ error: string }`.
- [x] Structured request logging with unique `X-Request-Id`, route, status code, and latency (never logs passwords, tokens, or chat messages).
- [x] Centralized environment configuration module (`env.ts`) with production secrets validation.
- [x] Comprehensive root `.gitignore` protecting `.env`, `.env.*`, `cookies.txt`, and secrets.
- [x] Deployment guide (`DEPLOYMENT.md`) covering managed Postgres, HTTPS, WebSockets, and horizontal scaling.
- [x] Production Docker stack (`docker-compose.prod.yml`): compiled backend (non-root, healthcheck, auto-migrations, graceful SIGTERM shutdown) and nginx-served SPA proxying `/api` + `/socket.io`.
- [x] `trust proxy` support (`TRUST_PROXY`) so rate limits apply per real client IP behind reverse proxies.
- [x] Production OTP sends codes by SMS only (never in responses or logs) and returns `503` when SMS delivery fails. **Twilio credentials are required for sign-up in production.**

### Step 9: Real-World Location, Tracking, Contact & Safety
- [x] Real OpenStreetMap maps (Leaflet): job pins, your position, search radius.
- [x] Post a job with **GPS**, **address search** or **tap on the map**; the public area label is suburb/city level.
- [x] **Location privacy:** the public feed and distances use an approximate location (about 1 km); the exact pin is shown only to the customer and the hired worker.
- [x] Worker **Navigate** button (turn-by-turn directions in the phone's maps app).
- [x] **Live worker tracking:** while "On my way", the worker's GPS position is relayed (never stored) to the customer's map; only the hired worker can send it.
- [x] **Call:** phone numbers are revealed to the two matched parties after hiring.
- [x] **Public profiles** (`GET /api/users/:id`): rating, reviews, jobs completed, member since, phone verified (no contact details).
- [x] **Report a user** (`POST /api/users/:id/report`) with reasons such as no-show, unsafe behaviour or fraud, stored for moderation.
- [x] Notifications: in-app toasts plus system notifications when the tab is in the background (new offer, hired, declined, worker backed out, job cancelled).
- [x] Chat history belongs to the current hiring: a worker hired after someone backed out never sees the earlier conversation.

### Step 10: Running a Real Service
- [x] **When and how to pay:** customers choose "as soon as possible" or a date and time (up to 60 days ahead) and a payment method (cash, mobile money, bank transfer), shown to workers on every card and in the offer sheet.
- [x] **Request expiry:** unanswered requests close automatically (`JOB_OPEN_HOURS`, or 2 hours after a scheduled time); the customer is notified, waiting workers are told.
- [x] **Installable app + push notifications:** manifest, icons, service worker; Web Push (VAPID) for new offers, hired, on the way, arrived, completed, back-outs, cancellations, expiry and chat messages. Suppressed while Plugy is on screen; one subscription per device; removed on sign-out; dead endpoints pruned.
- [x] **Safety screen:** emergency call button (`EMERGENCY_NUMBER`), share job details (who, where, when, status) with someone you trust, report.
- [x] **Forgot password by SMS code** (no account enumeration); resetting signs out every other session.
- [x] **Worker online mode:** workers pick the work they do, how far they travel and for how long (auto-off), then go online. New matching jobs within their distance are pushed to them (closest 50 per job), also when a job reopens; their location refreshes from GPS while Plugy is open and is never exposed. Their kinds of work show on their public profile.
- [x] **Moderation:** admins (`ADMIN_EMAILS`) review reports, dismiss or suspend. Suspension blocks sign-in and live connections and takes the user's open jobs and offers off the market; reinstatement supported.

---

## 2. What Is Stubbed / Simplified for the MVP

Before scaling to public commercial users, the following items are simplified or stubbed and should be replaced with commercial cloud services:

| Component | MVP Implementation | Commercial Production Upgrade |
| :--- | :--- | :--- |
| **Map tiles & geocoding** | Free OpenStreetMap tile and Nominatim services (light-use policies) | Commercial or self-hosted tiles/geocoder (MapTiler, Stadia, Mapbox, Google) once traffic grows |
| **Background location** | Live tracking only while the worker keeps the job screen open | Native app or installable PWA with background location |
| **Payments & Escrow** | In-app budget agreement with direct cash/offline settlement | Integrate Stripe Connect or Escrow.com (hold payment upon job acceptance, release on completion) |
| **Image & Avatar Uploads** | Dynamic user initials with gradient avatar cards | AWS S3, Cloudflare R2, or Uploadthing with image compression & CDN URLs |
| **Notifications** | Live in-app alerts + Web Push to installed/opted-in devices, including new-job alerts for online workers | SMS fallback for critical events |
| **Moderation** | Admin report queue with dismiss/suspend | Audit log, appeals, ID verification for workers |
| **Password Reset** | SMS code to the verified phone | Add email-based reset for users without a phone |
| **Horizontal WebSocket Scaling** | Single-node in-memory Socket.IO rooms | Add `@socket.io/redis-adapter` with Redis/Valkey for multi-node Kubernetes/container scaling |

---

## 3. Manual Testing Checklist (Before Showing to Real Users)

The same flows are automated in real-browser tests (customer on desktop, worker on a phone-sized screen): 27/27 checks for the hiring flow, 18/18 for scheduling, safety, password reset, moderation and push, and 8/8 for worker online mode against the dev stack; the hiring flow and push subscription also pass against the production stack.

Open two browser windows (Window 1: normal, Window 2: incognito). Location features need `http://localhost` or HTTPS; allow location access when asked.

### Test 1: Register and find nearby jobs
1. In Window 1 register **Customer A**; in Window 2 register **Worker B** (each with a phone number and SMS code).
2. Worker B: on **Browse Jobs**, click **Use my location**. The bar shows "Jobs near <your area>" and the map centres on you.
3. Try the radius chips (2–50 km / Any distance) and **Nearest first** sorting.

### Test 2: Post a job with a price and location
1. Customer A: **Post a Job**, choose **Gardening**, title "Mow the front lawn", tap **Use my current location** (or search an address / tap the map).
2. Check the area field fills with a suburb and city (no house number), set price **$30**, then **Post job and get offers**.
3. The job workspace opens showing **Waiting for offers…**.
4. Worker B: the job appears live with **"x km away"**, without a refresh.

### Test 3: Accept the price or counter-offer
1. Worker B: on the card, tap **Your price**, enter **$35**, choose **In 30 min**, add a note, **Offer $35.00**. The card shows "Your offer $35.00".
2. Customer A: the offer appears instantly with Worker B's rating, jobs done, "Counter-offer", ETA and note.
3. Customer A: in **Not getting offers? Raise your price**, click a higher amount. Worker B's card updates live.
4. Customer A: **Hire** then **Confirm $35.00**. Worker B gets **"You're hired!"**.

### Test 4: Arrival, tracking and contact
1. Worker B: open the job. The exact pin, **Navigate to the job**, and **Call** (customer's number) are shown.
2. Worker B: **I'm on my way**. Customer A sees "is on the way" and Worker B moving on the map.
3. Worker B: **I've arrived**, then **Start the job**. Customer A sees each step on the progress bar.
4. Both: send chat messages; they appear instantly on the other side.

### Test 5: Finish and rate
1. Worker B: **Mark job as done**, then **Yes, it's done**.
2. Both rate each other. Open either profile (**View profile**) and check the review and "jobs done" count.

### Test 6: Scheduling, safety and alerts
1. Post a job choosing **Tomorrow, 09:00** and **Mobile money**; workers see both on the card and in the offer sheet.
2. On **My profile**, tap **Turn on notifications** (on iPhone, add Plugy to the Home Screen first). Close Plugy, have the other person send an offer or a chat message: a system notification arrives and opens the job.
3. During a hired job, open **Safety**: the emergency button dials your configured number, **Share job details** produces a message with who/where/when.
4. Sign out, use **Forgot password?** with your phone number, set a new password: you're signed in and other devices are signed out.
5. As an admin (`ADMIN_EMAILS`), open **Reports**, dismiss one report and suspend a test account; the suspended account can no longer sign in and its open jobs disappear.

### Test 7: Worker online mode
1. As a worker, on **Find jobs** tap **Go online**, choose your kinds of work, a distance and how long, and allow notifications.
2. Switch to another page (or close Plugy). Have a customer post a matching job nearby: a **New job near you** alert arrives with the price, distance and a link to make an offer.
3. A job in a kind of work you didn't choose, or outside your distance, sends no alert. **Go offline** stops all alerts.

### Test 8: Things going wrong
1. Hire Worker B on a new job, then in Worker B's window choose **I can't do this job** with a reason. Customer A is told why, the job is open again, and earlier offers are restored.
2. Cancel a job from the customer side with a reason; workers who made offers are notified.
3. Use **Report** on the other party and pick a reason; a second report within 24 hours is refused.
