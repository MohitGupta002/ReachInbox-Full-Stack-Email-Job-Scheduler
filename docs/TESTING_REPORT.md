# 🧪 TESTING REPORT — Gmail Scheduler

> **Project:** Gmail Scheduler (ReachInbox Full-Stack Email Job Scheduler)  
> **QA Pass Date:** 2026-11-25  
> **Environment Verified On:** Windows Host — Node.js v24.13.1, SQLite fallback (PostgreSQL 5432, Redis 6379, Elasticsearch 9200 unreachable / Docker not installed on host)  
> **Overall Status:** ✅ Automated Backend + Live Ethereal SMTP + CSV Parser Verified | ⏳ Interactive Browser & Live Real-Gmail Test Pending User Input

---

## Executive Summary of Bugs Caught & Fixed During QA

Before final verification, full source inspection and runtime testing uncovered and fixed the following real defects:
1. **`config/db.js` startup crash:** `server.js` previously crashed with `SequelizeConnectionRefusedError` (`ECONNREFUSED`) when PostgreSQL was unreachable despite `.env` pointing to localhost:5432. Fixed with fast synchronous TCP reachability detection + automatic SQLite fallback (`WAL` mode + `busy_timeout`).
2. **SQLite restart crash (`SequelizeForeignKeyConstraintError`):** `sequelize.sync({ alter: true })` attempted `DROP TABLE users` on existing databases with FK rows, breaking server restarts. Fixed in `models/index.js` via safe `PRAGMA table_info` additive column checks.
3. **`recoveryService.js` parameter mismatch & missing limit:** Re-enqueued jobs previously passed `sender_id` instead of `senderId` (resulting in `ratelimit:undefined:...`) and dropped `hourlyLimit`. Fixed and persisted `hourly_limit` on `email_jobs`.
4. **Concurrency `SQLITE_BUSY` / nested transaction errors:** Added `withSqliteWriteLock` in `config/db.js` and `kvStoreService.js` so concurrent worker jobs serialize safely on SQLite while keeping parallel execution on PostgreSQL.
5. **Elasticsearch offline stalls:** Added fast TCP availability probe in `config/elastic.js` (`maxRetries: 0`), dropping batch scheduling API time from multi-second stalls to **11ms**.
6. **Zero-Redis / Offline Worker Execution:** Added `kvStoreService.js` + standalone persistent dispatcher in `worker.js` + fallback Queue Inspector HTML at `/admin/queues` so scheduling, hourly rate limits, Slack dedupe, and restart survival work cleanly even without Docker, while preserving pure BullMQ + Redis when Redis is live.
7. **Google OAuth Strategy Crash & Real Gmail SMTP Support:** Guarded `/api/auth/google` when OAuth credentials are unset (clean redirect instead of `Unknown authentication strategy "google"` 500 error) and added verified real Gmail SMTP support (`POST /api/senders/smtp`, `DELETE /api/senders/:id`).
8. **Frontend Fixes:** Fixed `Sidebar.jsx` permanently active Insights tab bug, added Status Filter & Pagination in `EmailTable.jsx`, reset `ComposeModal.jsx` form after submit, and wired real Views (`Overview`, `AI Assistant`, `Notifications`, `Settings` Gmail Connector).

---

## Test Run Summary

| Category | Executed Method | Passed | Failed | Skipped / Blocked | Status |
|----------|-----------------|--------|--------|-------------------|--------|
| 1. Auth, OAuth Guard, JWT & Logout | `backend/test_suite.js` (Suite 1) | 5 | 0 | 0 | ✅ Passed |
| 2. Multi-Sender & Gmail SMTP Validation | `backend/test_suite.js` (Suite 2) | 4 | 0 | 0 | ✅ Passed |
| 3. Live Ethereal SMTP & Idempotency | `backend/test_suite.js` (Suite 3) | 4 | 0 | 0 | ✅ Passed |
| 4. Burst Rate Limiting & Slack Dedupe | `backend/test_suite.js` (Suite 4) | 6 | 0 | 0 | ✅ Passed |
| 5. Restart Persistence & Schema Survival | `backend/test_suite.js` (Suite 5) | 3 | 0 | 0 | ✅ Passed |
| 6. Search Fallback, Filters & Pagination | `backend/test_suite.js` (Suite 6) | 7 | 0 | 0 | ✅ Passed |
| 7. Queue Inspector & Static / Proxy Health | `backend/test_suite.js` (Suite 7) + HTTP check | 4 | 0 | 0 | ✅ Passed |
| 8. PapaParse CSV/TXT Extraction & Build | Node PapaParse test + `vite build` | 5 | 0 | 0 | ✅ Passed |
| 9. Real Browser Chrome DevTools E2E | `browser` subagent | 0 | 0 | 5 | ⏳ Blocked (`chrome://inspect/#remote-debugging` not enabled) |
| 10. Real User Gmail Live Send & OAuth | Awaiting user Gmail / App Password | 0 | 0 | 2 | ⏳ Pending User Credentials |
| 11. Docker PG 16 + Redis 7 + ES 8 Mode | Docker Compose | 0 | 0 | 3 | ⚠️ Skipped (Docker/WSL distro not installed on host) |

---

## Detailed Observed Test Results

### Suite 1: Authentication, Google OAuth Guard, JWT Cookie & Logout
- `GET /api/health` → `200 OK`, `databaseDialect: "sqlite"`, `redisMode: "standalone_fallback"`, `googleOAuthConfigured: false`.
- Unauthenticated `GET /api/emails/scheduled` → `401 Unauthorized`.
- `GET /api/auth/google` (without `.env` OAuth credentials) → `302 Redirect` to `/?error=google_not_configured` (no 500 crash).
- `POST /api/auth/dev-login` → `200 OK`, issued `HttpOnly`, `SameSite=Lax` JWT cookie; `GET /api/auth/me` returned user profile.
- `POST /api/auth/logout` → `200 OK`, explicitly cleared `token=;`.

### Suite 2: Multi-Sender Provisioning & Gmail SMTP API
- `GET /api/senders` provisioned Ethereal test account (`xrghsjm276urpcxb@ethereal.email`) and stripped `smtp_pass` from JSON response.
- `POST /api/senders/smtp` rejected empty password with `400 Bad Request`; persisted `smtp.gmail.com:465` (`provider: "gmail"`) when validated; `DELETE /api/senders/:id` cleanly removed record.
- `POST /api/senders/ethereal` created a second sender record cleanly.

### Suite 3: Live Ethereal Email Delivery & Dual Idempotency
- Scheduled 2 recipients (`live.alpha@example.com`, `live.beta@example.com`) with `delayMs: 200`, `hourlyLimit: 10`.
- Verified `bull_job_id` formatted as `email-<uuid>` with zero colons.
- Worker completed live Nodemailer delivery via `smtp.ethereal.email`, capturing live `https://ethereal.email/message/...` preview URLs and updating both rows to `SENT`.
- Calling `processEmailJob()` again on a `SENT` job returned `{ skipped: true, reason: "already_sent_or_missing" }` with **0 duplicate sends**.

### Suite 4: Burst Load Rate Limiting & Slack Alert Deduplication
- Connected local mock HTTP Slack webhook server via `POST /api/slack/manual`.
- Scheduled burst of 6 emails (`b1@rate.test` .. `b6@rate.test`) with `hourlyLimit: 2`, `delayMs: 0`.
- Observed **exact enforcement**: **2** emails marked `SENT`; **4** overflow emails deferred cleanly to `DELAYED_RATE_LIMIT` with staggered next-hour timestamps (`+0ms`, `+1500ms`, `+3000ms`, `+4500ms`, zero dropped/failed).
- Verified mock Slack webhook received **exactly 1 alert payload** for all overflow events in that UTC hour (`SET NX EX 3600` dedupe lock).
- `DELETE /api/slack/disconnect` followed by another overflow email deferred cleanly (`5` total `DELAYED_RATE_LIMIT`) with **0 crashes** and **0 additional webhook requests**.

### Suite 5: Server Restart Persistence & Idempotent Schema Re-sync
- Scheduled 2 delayed future emails (`+1200ms`).
- Simulated restart: re-executed `syncDatabase()` against the populated SQLite DB with existing foreign-key rows (0 constraint errors) and executed `reconcilePendingJobs()` (detected 7 uncompleted jobs cleanly).
- After waiting past scheduled timestamps, dispatched due jobs → both transitioned to `SENT` with live Ethereal preview URLs and zero duplicates.

### Suite 6 & 7: Search Fallback, Pagination, Stats & Queue Inspector
- `GET /api/emails/search?q=RateLimitBurst` returned `total: 6`.
- `GET /api/emails/search?q=restart.one@example.com` returned `total: 1`.
- `GET /api/emails/search?q=Nodemailer&status=SENT` returned `total: 2`.
- `GET /api/emails/search?status=DELAYED_RATE_LIMIT` returned `total: 5`.
- `GET /api/emails/search?q=ZZZNonExistentToken999` returned `total: 0`.
- `GET /api/emails/sent?page=1&limit=2` returned 2 items with `totalPages: 3`.
- `GET /api/emails/stats` returned `sent: 6`, `rateLimited: 5`.
- `GET /admin/queues` returned `200 OK` Queue Inspector HTML displaying live queued/delayed/sent counts.

### Suite 8: Frontend Build, PapaParse CSV/TXT Extraction & Live Proxy
- `npm run build` (Vite v6.4.6): built cleanly in `3.07s` (`dist/assets/index-Bmaok8Z0.js` 313.46 kB, `index-DKeuUIKk.css` 29.88 kB).
- Verified `TS_FILE_COUNT=0` across project source directories.
- Verified PapaParse extraction logic across:
  - 50 valid emails CSV → `50` extracted
  - 20 rows with 10 unique duplicates → `10` deduplicated
  - Mixed valid/invalid/case-duplicate rows → malformed entries filtered
  - Plain TXT newline list → `3` extracted
- Verified live running daemons (`http://localhost:5000/api/health`, `http://localhost:5173/`, `http://localhost:5173/api/health`, `http://localhost:5173/admin/queues`) all return HTTP `200 OK`.

---

## Directly Measured Benchmarks (Observed in `test_suite.js` Run)

| Metric | Measured Value | Notes |
|--------|----------------|-------|
| `POST /api/emails/schedule` (API latency) | `11 ms` | Batch schedule + SQLite write + ES skip check |
| `GET /api/emails/search` (keyword query) | `10 ms` | Relational DB fallback search |
| Ethereal SMTP delivery (2 concurrent real emails) | `36,694 ms` | Includes live TLS handshake to `smtp.ethereal.email` |
| Full 7-Suite End-to-End Test Run | `50,312 ms` | Complete auth + SMTP + burst + restart + search run |

---

## Pending / Environment Limitations Noted Truthfully

1. **Docker Stack (`PostgreSQL 16`, `Redis 7`, `Elasticsearch 8`):** Not verified live on this host because Docker Desktop and WSL Linux distros are not installed here. Native Redis BullMQ (`moveToDelayed`, `DelayedError`, Bull Board) paths were inspected in code and bypassed cleanly via the standalone persistent fallback verified above.
2. **Chrome Browser E2E Test:** Blocked because Chrome remote debugging (`chrome://inspect/#remote-debugging`) is not currently enabled on the host.
3. **Real User Gmail Live Delivery / Google OAuth:** Live send to/from user's Gmail awaits user providing target Gmail address (and optional Gmail App Password / Google OAuth Client ID & Secret in UI or `.env`).
