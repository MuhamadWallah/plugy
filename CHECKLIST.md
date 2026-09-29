# Plugy — Implementation & User Readiness Checklist

This checklist documents everything that has been built, what is intentionally stubbed/simplified for the MVP, and the manual test procedures to run before onboarding real users.

---

## 1. Summary of Completed Features (Steps 1–8)

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

### Step 4: Live Feed & Race-Condition Safe Acceptance
- [x] Endpoint `GET /api/jobs?status=open` with category filtering and pagination.
- [x] Atomic conditional acceptance query:
  ```sql
  UPDATE jobs 
  SET worker_id = $1, status = 'accepted', accepted_at = NOW() 
  WHERE id = $2 AND status = 'open' AND poster_id <> $1
  RETURNING *;
  ```
- [x] Concurrency protection: simultaneous accept requests result in 1 winner (`200 OK`) and 1 runner-up (`409 Conflict`).
- [x] Self-acceptance prevention: posters cannot accept their own jobs (`400 Bad Request`).
- [x] Realtime Socket.IO broadcasts: `job:created` and `job:accepted` live remove accepted jobs across all clients without a page refresh.
- [x] Live Browse Jobs board with instant Category filtering and one-click "Accept" action.

### Step 5: Status Transitions & Personal Job Management
- [x] Worker start action: `POST /api/jobs/:id/start` (marks status `"in_progress"`).
- [x] Either party complete action: `POST /api/jobs/:id/complete` (marks status `"completed"`).
- [x] Poster cancel action: `POST /api/jobs/:id/cancel` (only allowed when `"open"` or `"accepted"`).
- [x] Strict state machine enforcing terminal status (completed/cancelled jobs can never change again).
- [x] Endpoint `GET /api/jobs/mine` returning all user jobs as poster or worker with `is_poster`, `is_worker`, `has_rated`.
- [x] "My Jobs" frontend tab with status badges, role filters (`All`, `Posted by Me`, `Accepted by Me`), and confirmation modals.

### Step 6: Direct Job Chat (Poster & Worker)
- [x] Messages table with foreign keys, cascading deletes, and chronological indexing `(job_id, created_at ASC)`.
- [x] Endpoints: `POST /api/jobs/:id/messages`, `GET /api/jobs/:id/messages`.
- [x] Strict authorization: third-party bystanders receive **`403 Forbidden`** on both reading and sending messages.
- [x] Realtime message delivery over Socket.IO scoped to room `job:${jobId}`.
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

---

## 2. What Is Stubbed / Simplified for the MVP

Before scaling to public commercial users, the following items are simplified or stubbed and should be replaced with commercial cloud services:

| Component | MVP Implementation | Commercial Production Upgrade |
| :--- | :--- | :--- |
| **Location & Maps** | Freeform text entry (e.g. "Berlin Mitte") with optional manual lat/long | Integrate Google Places Autocomplete API or Mapbox Geocoding with interactive map pin |
| **Payments & Escrow** | In-app budget agreement with direct cash/offline settlement | Integrate Stripe Connect or Escrow.com (hold payment upon job acceptance, release on completion) |
| **Image & Avatar Uploads** | Dynamic user initials with gradient avatar cards | AWS S3, Cloudflare R2, or Uploadthing with image compression & CDN URLs |
| **Out-of-band Notifications** | Realtime WebSockets while browser tab is active | Push notifications (Web Push API / Firebase Cloud Messaging) + SMS (Twilio) when offline |
| **Password Reset** | Manual database / support reset | Transactional email provider (Resend / SendGrid / Postmark) with timed reset tokens |
| **Horizontal WebSocket Scaling** | Single-node in-memory Socket.IO rooms | Add `@socket.io/redis-adapter` with Redis/Valkey for multi-node Kubernetes/container scaling |

---

## 3. Manual Testing Checklist (Before Showing to Real Users)

To run a complete manual walk-through with real user behavior, open two separate browser windows (Window 1: Normal, Window 2: Incognito):

### Test 1: User Registration & Login
1. In Window 1, navigate to `http://localhost:5174/`.
2. Click **Register**, create **User A** (e.g., `alice@plugy.dev`, name `Alice Poster`).
3. Verify Alice is redirected to the Live Jobs Feed with an active session.
4. In Window 2 (Incognito), create **User B** (e.g., `bob@plugy.dev`, name `Bob Worker`).

### Test 2: Job Posting & Live Feed Broadcast
1. In Window 1 (Alice), click **Post a Job**.
2. Select the **Gardening** category card.
3. Enter title: `"Backyard Hedge Trimming & Leaf Cleanup"`.
4. Enter budget: `$65.00` and location: `"Downtown Park St"`.
5. Submit the form.
6. Verify Window 1 shows the success screen and clears the form.
7. Switch to Window 2 (Bob) on the **Browse Jobs** feed:
   - **Verify:** Without refreshing the page, Alice's new job card appears live in Bob's feed!

### Test 3: Concurrency-Safe Job Acceptance
1. In Window 2 (Bob), click the **Accept** button on Alice's job card.
2. Verify the button updates, and the job card is moved to Bob's **My Jobs** tab under "Accepted by Me".
3. Switch back to Window 1 (Alice) on the **Browse Jobs** feed:
   - **Verify:** The accepted job instantly disappears from the public open feed in real time!

### Test 4: Realtime Direct Chat
1. In Window 2 (Bob), go to **My Jobs** and click **Chat** on the accepted job.
2. In Window 1 (Alice), go to **My Jobs** and click **Chat** on the same job.
3. In Bob's window, type: `"Hi Alice! I have all hedge tools ready. Can I come over at 2 PM?"` and click Send.
4. **Verify:** The message appears immediately in Alice's chat panel with Bob's name and avatar.
5. In Alice's window, reply: `"Hi Bob, 2 PM is perfect. See you then!"` and click Send.
6. **Verify:** The reply appears live in Bob's chat panel.

### Test 5: Job Lifecycle Transitions
1. In Window 2 (Bob), click **Start Job**.
2. Verify status badge updates to **"In Progress"** for both Bob and Alice.
3. In Window 2 (Bob), click **Mark Completed** and confirm.
4. Verify status badge updates to **"Completed"** for both users.
5. Verify action buttons update to terminal finished state (cannot start or cancel again).

### Test 6: Post-Completion Ratings & Averages
1. In Window 1 (Alice), view the completed job modal.
2. Notice the prominent **Rate Experience** prompt for Bob.
3. Select **5 Stars** and add comment: `"Bob was punctual, friendly, and did an exceptional job!"`. Click **Submit Rating**.
4. Verify the rating is saved and displays under "Completion Ratings & Feedback".
5. In Window 2 (Bob), refresh or view the job modal.
6. Notice Alice's 5-star review is visible.
7. In Bob's window, rate Alice: **5 Stars** with comment: `"Great client, clear instructions."`. Click **Submit Rating**.
8. Go to the **Browse Jobs** feed and **Dashboard**:
   - Verify Bob's profile rating reflects `★ 5.0 (1 review)`.
   - Verify Alice's profile rating reflects `★ 5.0 (1 review)`.
