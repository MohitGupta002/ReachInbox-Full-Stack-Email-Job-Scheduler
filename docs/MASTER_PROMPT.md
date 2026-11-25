# 🎯 MASTER PROMPT — Gmail Scheduler Project

> **Project:** Gmail Scheduler (ReachInbox Full-Stack Email Job Scheduler)  
> **Supervisor:** Coordinator AI (Lead Architect & Project Manager)  
> **Date:** 2026-11-25  
> **Status:** 🟢 Active — Ready for Crew Deployment

---

## 📋 Master Prompt for All AI Crew Members

> [!IMPORTANT]
> **READ THIS ENTIRE DOCUMENT BEFORE STARTING ANY WORK.** This is the single source of truth for the Gmail Scheduler project. Every team member must follow these instructions exactly.

---

### 🔥 Project Mission Statement

You are building a **production-grade Full-Stack Email Job Scheduler** called **Gmail Scheduler**. This system accepts scheduled email campaigns via REST APIs, persists state across server restarts (no cron jobs), enforces distributed per-sender hourly rate limits with live Slack alerts, indexes all emails in Elasticsearch, and exposes a Google-authenticated React dashboard with a real-time BullMQ queue inspector.

**The entire codebase must be written in pure vanilla JavaScript** — Node.js + Express.js for the backend, React Vite JSX for the frontend. **Zero TypeScript. No exceptions.**

---

### 🏗️ What You Are Building

| Component | Description |
|-----------|-------------|
| **Express.js REST API** | Backend with OAuth, email scheduling, rate limiting, Slack webhooks |
| **BullMQ Worker System** | Standalone worker process with configurable concurrency and rate limiting |
| **PostgreSQL Database** | 4-table schema (users, senders, slack_integrations, email_jobs) |
| **Redis Persistence** | AOF + RDB for BullMQ delayed job survival across restarts |
| **Elasticsearch** | Full-text email search with status filtering |
| **React Dashboard** | Figma-aligned SPA with Google login, CSV upload, search, tables |
| **Google OAuth 2.0** | Real authentication with HTTP-only JWT cookie sessions |
| **Slack OAuth v2** | Per-user incoming webhook for live rate-limit notifications |
| **Ethereal Email** | Multi-sender fake SMTP with clickable preview URLs |
| **Bull Board** | Live queue monitoring dashboard at `/admin/queues` |
| **Docker Compose** | PostgreSQL 16 + Redis 7 + Elasticsearch 8 with named volumes |

---

### 🧭 Non-Negotiable Technical Requirements

1. **NO TYPESCRIPT** — All files must be `.js` or `.jsx`. No `.ts`, `.tsx`, `tsconfig.json`, or type annotations.
2. **NO CRON JOBS** — Use BullMQ's native delayed job mechanism only (Redis sorted sets).
3. **DUAL IDEMPOTENCY** — Every email send must be protected by both:
   - Custom BullMQ `jobId` (format: `email-<uuid>`, NO colons)
   - PostgreSQL `status === 'SENT'` check before Nodemailer call
4. **REDIS PERSISTENCE** — Docker Redis must run with `--appendonly yes --save 60 1`
5. **ATOMIC RATE LIMITING** — Use Redis `INCR` on key `ratelimit:<senderId>:<YYYYMMDDHH>` with TTL 3700s
6. **NO JOB DROPPING** — Rate-limited jobs must be rescheduled via `moveToDelayed()` + `DelayedError`, never failed
7. **SLACK DEDUP** — Use `SET slack:alerted:<senderId>:<hourKey> 1 NX EX 3600` for one alert per sender per hour
8. **HTTP-ONLY JWT** — Auth cookies must be HTTP-only, secure in production, SameSite=Lax
9. **STARTUP RECOVERY** — On Express boot, `reconcilePendingJobs()` must re-enqueue any PostgreSQL jobs missing from Redis
10. **ENVIRONMENT-DRIVEN CONFIG** — All limits, secrets, and URLs via `.env` (never hardcoded)

---

### 📁 Monorepo Structure (Follow Exactly)

```
gmail-scheduler/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── worker.js
│       ├── config/           → db.js, redis.js, elastic.js, passport.js
│       ├── models/           → User.js, Sender.js, SlackIntegration.js, EmailJob.js
│       ├── queues/           → emailQueue.js, bullBoard.js
│       ├── services/         → mailerService.js, rateLimitService.js, elasticService.js,
│       │                       slackService.js, recoveryService.js
│       ├── controllers/      → authController.js, emailController.js,
│       │                       senderController.js, slackController.js
│       ├── routes/           → authRoutes.js, emailRoutes.js, senderRoutes.js, slackRoutes.js
│       └── middleware/       → authMiddleware.js
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── services/api.js
        ├── pages/            → LoginPage.jsx, DashboardPage.jsx
        └── components/       → Header.jsx, ComposeModal.jsx, EmailTable.jsx,
                                SearchBar.jsx, SlackConnectButton.jsx, EmptyState.jsx
```

---

### 🗃️ Database Schema (4 Tables)

**Table: `users`**
- `id` (UUID PK), `google_id` (UNIQUE), `name`, `email` (UNIQUE), `avatar_url`, `created_at`

**Table: `senders`**
- `id` (UUID PK), `user_id` (FK→users), `email`, `display_name`, `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `hourly_limit` (INT)

**Table: `slack_integrations`**
- `id` (UUID PK), `user_id` (FK→users, UNIQUE), `team_id`, `team_name`, `channel_id`, `channel_name`, `webhook_url`, `access_token`, `is_active` (BOOL)

**Table: `email_jobs`**
- `id` (UUID PK), `user_id` (FK), `sender_id` (FK), `recipient_email`, `subject`, `body`, `scheduled_at` (TIMESTAMPTZ), `sent_at`, `status` (ENUM: SCHEDULED|DELAYED_RATE_LIMIT|SENT|FAILED), `bull_job_id` (UNIQUE), `idempotency_key` (UNIQUE), `ethereal_preview_url`, `error_message`

---

### 🔌 REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/auth/google` | Initiate Google OAuth |
| GET | `/api/auth/google/callback` | Handle OAuth callback |
| GET | `/api/auth/me` | Get current user (JWT cookie) |
| POST | `/api/auth/logout` | Clear auth cookie |
| GET | `/api/slack/connect` | Initiate Slack OAuth |
| GET | `/api/slack/callback` | Handle Slack OAuth callback |
| GET | `/api/slack/status` | Get Slack connection status |
| DELETE | `/api/slack/disconnect` | Deactivate Slack alerts |
| GET | `/api/senders` | List user's senders |
| POST | `/api/senders/ethereal` | Create new Ethereal sender |
| POST | `/api/emails/schedule` | Schedule email batch |
| GET | `/api/emails/scheduled` | Get scheduled/delayed emails |
| GET | `/api/emails/sent` | Get sent/failed emails |
| GET | `/api/emails/search?q=&status=` | Elasticsearch search |
| GET | `/admin/queues` | Bull Board live dashboard |

---

### 🎨 Dashboard UI Requirements

The dashboard must match the reference design style with these specific components:

1. **Login Page** — "Continue with Google" button, clean centered layout
2. **Header** — User avatar, name, email, Connect Slack button, Bull Board link, Logout
3. **Dashboard Page** — Debounced search bar (300ms), Scheduled/Sent tabs, Compose button
4. **Compose Modal** — Sender dropdown, Subject, Body, Start Time picker, Delay (seconds), Hourly Limit, CSV/TXT uploader with PapaParse (live "X emails detected" counter)
5. **Email Table** — Email, Subject, Timestamp, Status badge (color-coded), Ethereal Preview icon
6. **Empty States** — Illustrated empty states for no scheduled/sent emails
7. **Loading States** — Skeleton loading animations
8. **Toast Notifications** — Success/error feedback on actions
9. **Sidebar Navigation** — Overview, Insights, Notifications (with badge), Settings
10. **Status Indicators** — System status ring, efficiency chart, time saved counter, active workflows

---

### ⚡ Critical Code Patterns

**Rate Limit Worker Logic:**
```javascript
// When counter > limit:
await redis.decr(rateKey);  // Restore counter accuracy
await notifySlackRateLimit({ userId, senderId, limit, hourKey });
const nextHour = new Date();
nextHour.setUTCMinutes(0, 0, 0);
nextHour.setUTCHours(nextHour.getUTCHours() + 1);
const nextRunMs = nextHour.getTime() + (overflowIdx - 1) * minDelay;
await job.moveToDelayed(nextRunMs, token);
throw new DelayedError();
```

**BullMQ Job Creation (No Colons in jobId):**
```javascript
const bullJobId = `email-${jobRow.id}`;  // ✅ Correct: no colons
await emailQueue.add('send-email', data, {
  jobId: bullJobId,
  delay: Math.max(0, targetMs - Date.now()),
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 }
});
```

---

### 📏 Quality Standards

- [ ] All code linted and consistently formatted
- [ ] Every endpoint returns proper HTTP status codes
- [ ] Error boundaries in React components
- [ ] Proper error handling in all async functions
- [ ] Environment variables validated on startup
- [ ] Docker Compose brings up all services with one command
- [ ] README includes setup steps, architecture diagram, and trade-offs
- [ ] Email scheduling survives server restart with zero duplicates
- [ ] Rate limiting works correctly under burst load (1,000+ emails)
- [ ] Slack alerts fire exactly once per sender per hour during burst

---

### 🚀 Build Phases (Execute in Order)

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| **Phase 1** | Infrastructure & Boilerplate | Docker Compose, monorepo scaffold, Express + Vite init |
| **Phase 2** | Database, Auth & Senders | Sequelize models, Google OAuth, Ethereal sender generator |
| **Phase 3** | BullMQ Scheduler & Rate Limiter | emailQueue.js, worker.js, Bull Board, startup recovery |
| **Phase 4** | Elasticsearch & Slack | elasticService.js, search endpoint, Slack OAuth + webhooks |
| **Phase 5** | React Dashboard | All pages, components, search, CSV upload, tables |
| **Phase 6** | Testing & Submission | Restart tests, burst load tests, README, demo video |

---

### 📚 Official Documentation References

| Technology | URL |
|-----------|-----|
| BullMQ Quick Start | https://docs.bullmq.io/quick-start |
| BullMQ Delayed Jobs | https://docs.bullmq.io/guide/jobs/delayed |
| BullMQ moveToDelayed | https://docs.bullmq.io/patterns/process-step-jobs |
| BullMQ Concurrency | https://docs.bullmq.io/guide/workers/concurrency |
| BullMQ Rate Limiting | https://docs.bullmq.io/guide/rate-limiting |
| BullMQ Custom Job IDs | https://docs.bullmq.io/guide/jobs/job-ids |
| Bull Board | https://github.com/felixmosh/bull-board |
| Redis Persistence | https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ |
| Express.js | https://expressjs.com/ |
| Sequelize ORM | https://sequelize.org/ |
| Nodemailer + Ethereal | https://nodemailer.com/guides/testing-with-ethereal |
| Elasticsearch JS | https://www.elastic.co/docs/reference/elasticsearch/clients/javascript |
| Slack OAuth v2 | https://docs.slack.dev/authentication/installing-with-oauth |
| Google OAuth 2.0 | https://developers.google.com/identity/protocols/oauth2/web-server |
| Passport Google | https://www.passportjs.org/packages/passport-google-oauth20/ |
| PapaParse | https://www.papaparse.com/docs |

---

> [!CAUTION]
> **DO NOT deviate from this master prompt.** If you encounter ambiguity, check the [ARCHITECTURE.md](file:///e:/Antigravity%20project/Web%20Development/Gmail-Scheduler/docs/ARCHITECTURE.md) and [SYSTEM_DESIGN.md](file:///e:/Antigravity%20project/Web%20Development/Gmail-Scheduler/docs/SYSTEM_DESIGN.md) documents first. If still unclear, raise the question in the [WORK_LOG.md](file:///e:/Antigravity%20project/Web%20Development/Gmail-Scheduler/docs/WORK_LOG.md) for the supervisor to address.
