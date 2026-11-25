# ⚡ ReachInbox Email Job Scheduler (OtherSync)

> **Production-grade full-stack email job scheduler, BullMQ rate-limiting engine, OAuth 2.0 sessions, and Figma-aligned React dashboard — built strictly in pure JavaScript (Express.js & React JSX).**

---

## 🎯 Important Note on JavaScript vs. TypeScript

This entire system is implemented in **vanilla JavaScript (Node.js + Express.js backend and React Vite JSX frontend) with zero TypeScript**, as specified. 

### Assumptions, Shortcuts & Trade-offs
1. **JavaScript Ecosystem Consistency:** We chose pure JavaScript (ES2022 + CommonJS for backend, Vite ESM for frontend) to maximize developer ergonomics, remove compilation/transpilation overhead, and guarantee that native BullMQ Lua scripting and Redis buffers operate seamlessly without type-coercion impedance.
2. **Persistence Guarantee:** Dual persistence is configured via Redis (`--appendonly yes --save 60 1`) combined with PostgreSQL 16 (or local SQLite fallback when Docker is offline). All uncompleted jobs automatically recover on boot without duplicate sends.
3. **Two-Layer Idempotency:** Custom BullMQ `jobId`s (formatted as `email-<uuid>`, strictly containing zero colons as required by BullMQ) paired with PostgreSQL status checks guarantee zero duplicate emails across process crashes.

---

## 🏛️ System Architecture

```
                    ┌────────────────────────────────────────┐
                    │       React Dashboard (Vite JSX)       │
                    │  Google OAuth • CSV PapaParse • Search │
                    └───────────────────┬────────────────────┘
                                        │ REST API + JWT Cookie
                                        ▼
                    ┌────────────────────────────────────────┐
                    │           Express.js API (JS)          │
                    │   Bull Board UI mounted at /admin      │
                    │      Startup Job Reconciliation        │
                    └───────────┬──────────────┬─────────────┘
                                │              │
            ┌───────────────────┴──────┐       │ Enqueue Delayed Jobs
            ▼                          ▼       ▼
┌────────────────────────┐   ┌───────────────────────────────┐
│     PostgreSQL 16      │   │     Redis 7 (AOF + RDB)       │
│ Users • Senders • Jobs │   │  BullMQ Delayed Set & Counters│
└────────────────────────┘   └───────────────┬───────────────┘
                                             │
                                             ▼
                             ┌───────────────────────────────┐
                             │       BullMQ Worker Pool      │
                             │  Distributed Hourly Limiter   │
                             │  moveToDelayed + DelayedError │
                             └───────┬───────────────┬───────┘
                                     │               │
                                     ▼               ▼
                       ┌──────────────────┐ ┌────────────────┐
                       │Ethereal Fake SMTP│ │ Slack Webhook  │
                       │ Live Preview URL │ │ Hourly Alert   │
                       └──────────────────┘ └────────────────┘
```

---

## 🚀 Key Architectural Features

| Feature | Engineering Implementation |
|---------|----------------------------|
| **Zero Cron Jobs** | BullMQ schedules future jobs directly inside Redis sorted sets via the `delay` option. No crontab or interval pollers. |
| **Crash & Restart Survival** | Redis AOF + RDB preserves BullMQ delayed sets on disk. Express runs `reconcilePendingJobs()` on startup to re-enqueue any unqueued jobs. |
| **Atomic Distributed Rate Limiting** | Worker increments `ratelimit:<senderId>:<YYYYMMDDHH>` atomically in Redis. If the limit is hit, counter decrements and jobs cleanly reschedule to the next UTC hour with deterministic stagger offsets (`moveToDelayed()` + `DelayedError`). |
| **1-Alert Hourly Slack Deduplication** | Slack rate-limit webhook notifications acquire an atomic Redis lock (`SET slack:alerted:<senderId>:<hourKey> 1 NX EX 3600`) ensuring a 1,000-email burst sends exactly 1 notification per sender per hour. |
| **Multi-Sender Ethereal SMTP** | Generates disposable SMTP accounts with instant test credentials via `nodemailer.createTestAccount()`. Captures clickable `ethereal.email` preview URLs. |
| **Full-Text Email Search** | Elasticsearch 8 indexing on schedule/send with multi-match search and relational database fallback. |

---

## 💻 Tech Stack

- **Backend:** Node.js, Express.js, BullMQ, ioredis, Sequelize, PostgreSQL 16 / SQLite, Elasticsearch 8, Nodemailer, Passport.js, JWT.
- **Frontend:** React 18, Vite, Tailwind CSS, PapaParse, Lucide React, React Hot Toast.
- **Infrastructure:** Docker Compose (PostgreSQL, Redis AOF, Elasticsearch).

---

## 📦 Getting Started

### 1. Prerequisites
- Node.js v18+ (tested on Node v24)
- Docker & Docker Compose (optional, automatic resilient SQLite fallback included)

### 2. Infrastructure Setup (Docker)
```bash
docker-compose up -d
```
*Starts PostgreSQL 16 (port 5432), Redis 7 with AOF persistence (port 6379), and Elasticsearch 8 (port 9200).*

### 3. Backend Setup
```bash
cd backend
npm install
npm run dev
```
*API runs at `http://localhost:5000` with Bull Board at `http://localhost:5000/admin/queues`.*

To run the standalone worker in another terminal:
```bash
cd backend
npm run worker
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Dashboard opens at `http://localhost:5173`.*

### 5. One-Click Cloud Deployment (Render Blueprint)
This repository includes a complete [`render.yaml`](./render.yaml) targeting Render's Free tier (`email-job-scheduler-api` Web Service with embedded BullMQ worker, `email-job-scheduler-frontend` Static Site, `email-job-scheduler-db` PostgreSQL, and `email-job-scheduler-redis` Key Value).
1. Push this repository to GitHub (`email-job-scheduler`).
2. In Render Dashboard, choose **New → Blueprint** and select the repo.
3. Add your `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` (and whitelist `https://<your-api>.onrender.com/api/auth/google/callback` in Google Cloud Console) plus `FRONTEND_URL` matching your deployed Static Site URL.
4. **Important for Render Free Tier Email Sending:** Render Free Tier blocks outbound SMTP ports (`25`, `465`, `587`), so use **1-Click Gmail OAuth (HTTPS port 443)** or **Resend HTTPS API** in **Settings** when hosted on Render's Free plan (SMTP App Password / Ethereal works locally and on paid plans).

---

## 🧪 Automated Integration Tests

Run the built-in end-to-end integration test suite:
```bash
cd backend
npm test
```
**Test Coverage:**
- Unauthenticated 401 enforcement, Google OAuth fallback redirect, JWT HTTP-only cookies & Logout
- Multi-Sender Ethereal auto-provisioning & Real Gmail SMTP validation (`POST /api/senders/smtp`)
- Live Ethereal SMTP email delivery with preview URL capture & dual idempotency dedupe
- Burst load hourly rate limiting (`limit=2, batch=6`), next-hour stagger overflow, and 1/hour Slack webhook deduplication
- Server restart recovery & idempotent SQLite/PostgreSQL schema re-sync with zero duplicate sends
- Search fallback, status filtering, pagination, stats, and Queue Inspector (`/admin/queues`)

---

## 🎬 5-Minute Demo Video Script

| Timestamp | Action to Demonstrate |
|-----------|------------------------|
| **0:00 – 0:45** | **Authentication & Setup:** Sign in with Google (or 1-Click Engineer login). Show user profile in header, and click "Connect Slack" to connect webhook alerts. |
| **0:45 – 1:45** | **Batch Scheduling & CSV Upload:** Open "Compose New Email", drag-and-drop a CSV lead list. Show live PapaParse detection badge. Configure start time (+1 min), 2s delay, and 2/hr limit. Click "Schedule Campaign" and inspect the Delayed tab in Bull Board (`/admin/queues`). |
| **1:45 – 3:00** | **Server Restart Persistence Test:** Terminate the Express server and worker (`Ctrl+C`). Restart both processes. Show that scheduled emails resume and send on time with zero duplicate deliveries. |
| **3:00 – 4:15** | **Rate Limiting & Live Slack Alert:** Watch 2 emails move to "Sent" (click "Inspect Email" to open Ethereal live message preview). Observe remaining jobs automatically rescheduling to the next hour, while the live Slack notification arrives in the connected channel. |
| **4:15 – 5:00** | **Elasticsearch Search & Summary:** Use the search bar to query emails by recipient or subject. Disconnect Slack cleanly, and summarize architecture trade-offs. |

---

## 📡 REST API Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/auth/google` | Initiates Google OAuth 2.0 flow | Public |
| `GET` | `/api/auth/google/callback` | OAuth redirect callback | Public |
| `POST` | `/api/auth/dev-login` | 1-Click demo authentication | Public |
| `GET` | `/api/auth/me` | Current authenticated user profile | JWT |
| `POST` | `/api/auth/logout` | Clears authentication cookie | JWT |
| `GET` | `/api/senders` | List sender accounts (auto-creates default) | JWT |
| `POST` | `/api/senders/ethereal` | Spin up fresh Ethereal SMTP sender | JWT |
| `POST` | `/api/senders/smtp` | Verify & connect real Gmail / custom SMTP sender | JWT |
| `DELETE` | `/api/senders/:id` | Remove a configured sender account | JWT |
| `POST` | `/api/emails/schedule` | Schedule batch of email jobs | JWT |
| `GET` | `/api/emails/scheduled` | Get scheduled/delayed jobs | JWT |
| `GET` | `/api/emails/sent` | Get sent/failed jobs with preview URLs | JWT |
| `GET` | `/api/emails/search` | Full-text Elasticsearch search | JWT |
| `GET` | `/api/emails/stats` | Aggregated dashboard metrics | JWT |
| `GET` | `/api/slack/connect` | Start Slack OAuth v2 flow | JWT |
| `GET` | `/api/slack/status` | Current Slack integration status | JWT |
| `POST` | `/api/slack/manual` | Connect manual Slack webhook URL | JWT |
| `DELETE`| `/api/slack/disconnect` | Deactivate Slack notifications | JWT |
| `GET` | `/admin/queues` | Live Bull Board queue monitor | Public / Admin |
