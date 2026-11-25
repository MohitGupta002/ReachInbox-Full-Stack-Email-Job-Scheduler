# 🏗️ ARCHITECTURE — Gmail Scheduler (ReachInbox Email Job Scheduler)

> **Project:** Gmail Scheduler — Full-Stack Email Job Scheduling System  
> **Version:** 1.0.0  
> **Date:** 2026-11-25  
> **Lead Architect:** Coordinator (Antigravity AI Supervisor)  
> **Stack:** Pure JavaScript (Express.js + React Vite JSX) — Zero TypeScript

---

## 1. Architecture Overview

This system implements a **production-grade email job scheduler** with persistent delayed job queuing (BullMQ), distributed rate limiting, Google OAuth 2.0 authentication, Slack real-time alerts, Elasticsearch full-text search, and a Figma-aligned React dashboard — all in vanilla JavaScript.

### Core Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Decoupled Processing** | Express.js HTTP server separated from BullMQ worker processes |
| **Persistence Across Restarts** | Redis AOF + RDB persistence; PostgreSQL as system of record |
| **No Cron Jobs** | BullMQ native delayed jobs via Redis sorted sets |
| **Distributed Rate Limiting** | Atomic Redis hourly counters per sender |
| **Zero Duplicate Sends** | Two-layer idempotency: BullMQ custom jobId + PostgreSQL status check |
| **Horizontal Scalability** | Workers scale independently of API servers |

---

## 2. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend["🖥️ React Dashboard (Vite + Tailwind CSS)"]
        LP["LoginPage.jsx<br/>Google OAuth Login"]
        DP["DashboardPage.jsx<br/>Search + Tables"]
        CM["ComposeModal.jsx<br/>CSV Upload + Schedule"]
        HE["Header.jsx<br/>User Info + Slack + Logout"]
    end

    subgraph API["⚙️ Express.js API Server (Pure JS)"]
        AR["Auth Routes<br/>/api/auth/*"]
        ER["Email Routes<br/>/api/emails/*"]
        SR["Sender Routes<br/>/api/senders/*"]
        SK["Slack Routes<br/>/api/slack/*"]
        BB["Bull Board<br/>/admin/queues"]
        REC["Startup Recovery<br/>reconcilePendingJobs()"]
    end

    subgraph Worker["🔄 BullMQ Worker Pool"]
        WK["worker.js<br/>Configurable Concurrency"]
        RL["Rate Limiter<br/>Atomic Redis Counters"]
        MD["moveToDelayed<br/>+ DelayedError"]
    end

    subgraph DataLayer["💾 Data & Infrastructure"]
        PG["PostgreSQL 16<br/>Users, Senders, Jobs, Slack"]
        RD["Redis 7 (AOF + RDB)<br/>BullMQ Delayed Set +<br/>Atomic Hourly Counters"]
        ES["Elasticsearch 8<br/>Full-Text Email Search"]
    end

    subgraph External["🌐 External Services"]
        GAUTH["Google OAuth 2.0"]
        SLACK["Slack OAuth v2<br/>Incoming Webhooks"]
        ETH["Ethereal Email SMTP<br/>Multi-Sender + Preview URL"]
    end

    Frontend -->|"REST API + JWT Cookie"| API
    API -->|"Read/Write"| PG
    API -->|"Enqueue Delayed Jobs"| RD
    API -->|"Index Documents"| ES
    API -->|"OAuth Flows"| GAUTH
    API -->|"OAuth + Webhooks"| SLACK
    REC -->|"Reconcile on Boot"| PG
    REC -->|"Re-enqueue Missing"| RD

    RD -->|"Process Jobs"| Worker
    Worker -->|"Idempotency Check"| PG
    Worker -->|"Check/Incr Counters"| RD
    Worker -->|"Send Email"| ETH
    Worker -->|"Rate Limit Alert"| SLACK
    Worker -->|"Update Status"| ES
    MD -->|"Reschedule to Next Hour"| RD
```

---

## 3. Technology Stack

### Backend Layer

| Layer | Packages/Tools | Responsibility |
|-------|----------------|----------------|
| **Backend API** | `express`, `cors`, `dotenv`, `cookie-parser` | REST endpoints, OAuth callbacks, middleware, Bull Board mounting |
| **Job Queue** | `bullmq`, `ioredis` | Persistent delayed jobs, worker concurrency, custom jobId dedup |
| **Queue UI** | `@bull-board/api`, `@bull-board/express` | Live BullMQ dashboard at `/admin/queues` |
| **Database** | PostgreSQL 16, `sequelize`, `pg` | System of record for users, senders, Slack tokens, email jobs |
| **Search Engine** | Elasticsearch 8, `@elastic/elasticsearch` | Full-text + status-filtered email search |
| **Fake SMTP** | `nodemailer` + Ethereal Email | Multi-sender SMTP with clickable preview URLs |
| **Google Auth** | `passport`, `passport-google-oauth20`, `jsonwebtoken` | Real OAuth 2.0 login, HTTP-only JWT cookie sessions |
| **Slack Alerts** | Slack OAuth v2 (`incoming-webhook`) | Per-user connection and live rate-limit notifications |

### Frontend Layer

| Layer | Packages/Tools | Responsibility |
|-------|----------------|----------------|
| **UI Framework** | React (Vite `.jsx`) | Component-based SPA |
| **Styling** | Tailwind CSS | Figma-aligned responsive dashboard |
| **CSV Parsing** | PapaParse | Client-side CSV/TXT lead extraction |
| **HTTP Client** | Axios (`withCredentials: true`) | Authenticated API communication |

### Infrastructure Layer

| Component | Image/Version | Persistence |
|-----------|---------------|-------------|
| **PostgreSQL** | `postgres:16-alpine` | Named volume `pg_data` |
| **Redis** | `redis:7-alpine` | AOF + RDB snapshots, volume `redis_data` |
| **Elasticsearch** | `elasticsearch:8.15.0` | Named volume `es_data` |

---

## 4. Database Schema

```mermaid
erDiagram
    USERS {
        UUID id PK
        STRING google_id UK
        STRING name
        STRING email UK
        STRING avatar_url
        TIMESTAMP created_at
    }

    SENDERS {
        UUID id PK
        UUID user_id FK
        STRING email
        STRING display_name
        STRING smtp_host
        INT smtp_port
        STRING smtp_user
        STRING smtp_pass
        INT hourly_limit
    }

    SLACK_INTEGRATIONS {
        UUID id PK
        UUID user_id FK "UNIQUE"
        STRING team_id
        STRING team_name
        STRING channel_id
        STRING channel_name
        STRING webhook_url
        STRING access_token
        BOOLEAN is_active
    }

    EMAIL_JOBS {
        UUID id PK
        UUID user_id FK
        UUID sender_id FK
        STRING recipient_email
        STRING subject
        TEXT body
        TIMESTAMPTZ scheduled_at
        TIMESTAMPTZ sent_at
        ENUM status "SCHEDULED | DELAYED_RATE_LIMIT | SENT | FAILED"
        STRING bull_job_id UK
        STRING idempotency_key UK
        STRING ethereal_preview_url
        TEXT error_message
    }

    USERS ||--o{ SENDERS : "has many"
    USERS ||--o| SLACK_INTEGRATIONS : "has one"
    USERS ||--o{ EMAIL_JOBS : "has many"
    SENDERS ||--o{ EMAIL_JOBS : "sends via"
```

---

## 5. Monorepo Folder Structure

```
gmail-scheduler/
├── docker-compose.yml               # PostgreSQL 16, Redis 7 (AOF+RDB), Elasticsearch 8
├── README.md                        # Setup, architecture, trade-offs, demo video link
├── backend/
│   ├── package.json                 # Pure JS ("type": "commonjs" or "module")
│   ├── .env.example
│   └── src/
│       ├── server.js                # Express app, routes, Bull Board, startup recovery
│       ├── worker.js                # Standalone BullMQ worker process
│       ├── config/                  # db.js, redis.js, elastic.js, passport.js
│       ├── models/                  # User.js, Sender.js, SlackIntegration.js, EmailJob.js
│       ├── queues/                  # emailQueue.js, bullBoard.js
│       ├── services/                # mailerService.js, rateLimitService.js, elasticService.js,
│       │                            # slackService.js, recoveryService.js
│       ├── controllers/             # authController.js, emailController.js,
│       │                            # senderController.js, slackController.js
│       ├── routes/                  # authRoutes.js, emailRoutes.js, senderRoutes.js, slackRoutes.js
│       └── middleware/              # authMiddleware.js (JWT cookie verification)
└── frontend/
    ├── package.json                 # React + Vite (pure JS/JSX) + Tailwind CSS
    ├── vite.config.js
    └── src/
        ├── main.jsx & App.jsx
        ├── context/AuthContext.jsx
        ├── services/api.js          # Axios instance with withCredentials: true
        ├── pages/                   # LoginPage.jsx, DashboardPage.jsx
        └── components/              # Header.jsx, ComposeModal.jsx, EmailTable.jsx,
                                     # SearchBar.jsx, SlackConnectButton.jsx, EmptyState.jsx
```

---

## 6. Data Flow & Lifecycle

### Email Scheduling Flow

```mermaid
sequenceDiagram
    actor User
    participant React as React Dashboard
    participant Express as Express.js API
    participant PG as PostgreSQL
    participant ES as Elasticsearch
    participant Redis as Redis (BullMQ)
    participant Worker as BullMQ Worker
    participant SMTP as Ethereal SMTP
    participant Slack as Slack Webhook

    User->>React: Upload CSV + Set Schedule
    React->>React: PapaParse extracts emails
    React->>Express: POST /api/emails/schedule
    
    loop For each recipient
        Express->>PG: Create EmailJob (SCHEDULED)
        Express->>ES: Index email document
        Express->>Redis: Add delayed BullMQ job (custom jobId)
    end
    Express-->>React: 201 Created (batch response)

    Note over Redis,Worker: Jobs fire at scheduled timestamps
    
    Redis->>Worker: Process delayed job
    Worker->>PG: Check status !== 'SENT' (idempotency)
    Worker->>Redis: INCR ratelimit:<senderId>:<hourKey>
    
    alt Under hourly limit
        Worker->>SMTP: Send via Ethereal
        SMTP-->>Worker: Preview URL
        Worker->>PG: Update → SENT + preview URL
        Worker->>ES: Update document status
    else Over hourly limit
        Worker->>Redis: DECR counter (restore accuracy)
        Worker->>Slack: POST rate-limit alert (deduplicated)
        Worker->>PG: Update → DELAYED_RATE_LIMIT
        Worker->>Redis: moveToDelayed(nextHour + stagger)
        Worker-->>Worker: throw DelayedError()
    end
```

### Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant React as React Dashboard
    participant Express as Express.js API
    participant Google as Google OAuth 2.0
    participant PG as PostgreSQL

    User->>React: Click "Continue with Google"
    React->>Express: GET /api/auth/google
    Express->>Google: Redirect to OAuth consent
    Google-->>Express: Authorization code callback
    Express->>Google: Exchange code for profile
    Express->>PG: Upsert user (google_id, name, email, avatar)
    Express->>Express: Sign JWT, set HTTP-only cookie
    Express-->>React: Redirect to dashboard
    React->>Express: GET /api/auth/me (cookie auto-sent)
    Express-->>React: User profile JSON
```

---

## 7. Rate Limiting Architecture

### Atomic Redis Counter Strategy

```
Key Pattern:  ratelimit:<senderId>:<YYYYMMDDHH>
TTL:          3700 seconds (1 hour + 100s buffer)
Operation:    INCR (atomic, multi-worker safe)

Overflow Key: overflow:<senderId>:<YYYYMMDDHH>
Purpose:      Deterministic stagger offset for rescheduled jobs
Formula:      nextRunMs = nextHourStart + (overflowIdx - 1) * minDelay
```

### Burst Load Behavior (1,000 emails, limit=200, delay=2s)

| Hour Window | Jobs Processed | Stagger | Duration |
|-------------|---------------|---------|----------|
| 10:00 AM | Jobs 1–200 | 2s apart | ~6.7 min |
| 11:00 AM | Jobs 201–400 | 2s apart | ~6.7 min |
| 12:00 PM | Jobs 401–600 | 2s apart | ~6.7 min |
| 1:00 PM | Jobs 601–800 | 2s apart | ~6.7 min |
| 2:00 PM | Jobs 801–1000 | 2s apart | ~6.7 min |

> Zero dropped or failed jobs. All overflow is handled via `moveToDelayed()` + `DelayedError`.

---

## 8. REST API Specification

| Method | Endpoint | Behavior | Auth |
|--------|----------|----------|------|
| GET | `/api/auth/google` & `/callback` | Google OAuth 2.0 login, sets JWT cookie | Public |
| GET/POST | `/api/auth/me` & `/logout` | Returns user profile or clears cookie | JWT |
| GET | `/api/slack/connect` & `/callback` | Slack OAuth v2, saves webhook URL | JWT/State |
| GET/DEL | `/api/slack/status` & `/disconnect` | Returns Slack status or deactivates | JWT |
| GET/POST | `/api/senders` & `/ethereal` | Lists senders or creates Ethereal account | JWT |
| POST | `/api/emails/schedule` | Persists, indexes in ES, enqueues BullMQ jobs | JWT |
| GET | `/api/emails/scheduled` & `/sent` | Paginated scheduled/sent email lists | JWT |
| GET | `/api/emails/search?q=&status=` | Elasticsearch full-text search | JWT |
| GET | `/admin/queues` | Live Bull Board queue monitor UI | Protected |

---

## 9. Docker Compose Infrastructure

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: reachinbox
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: email_scheduler
    ports: ["5432:5432"]
    volumes: ["pg_data:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes", "--save", "60", "1"]
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports: ["9200:9200"]
    volumes: ["es_data:/usr/share/elasticsearch/data"]

volumes:
  pg_data:
  redis_data:
  es_data:
```

---

## 10. Environment Configuration

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgres://reachinbox:secret@localhost:5432/email_scheduler
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
ELASTICSEARCH_URL=http://localhost:9200

# Throughput & Rate Limiting
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200

# OAuth & Auth Secrets
JWT_SECRET=replace_with_strong_random_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:5000/api/slack/callback
```

---

## 11. Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| BullMQ over node-cron | Native delayed jobs in Redis sorted sets; survives restarts without external scheduler |
| Redis AOF + RDB | Dual persistence ensures zero job loss across container/server restarts |
| Separated API & Worker | API responsiveness under load; workers scale horizontally |
| Custom BullMQ jobId | Prevents duplicate queueing; no colons allowed in IDs |
| Ethereal Email | Safe testing without real SMTP; clickable preview URLs for verification |
| Slack dedupe lock | `SET NX EX 3600` ensures one alert per sender per hour during burst loads |
| PapaParse client-side | Reduces backend load; instant email count feedback in Compose modal |

---

> **Next:** See [SYSTEM_DESIGN.md](file:///e:/Antigravity%20project/Web%20Development/Gmail-Scheduler/docs/SYSTEM_DESIGN.md) for detailed component specifications and [CREW_INSTRUCTIONS.md](file:///e:/Antigravity%20project/Web%20Development/Gmail-Scheduler/docs/CREW_INSTRUCTIONS.md) for build assignments.
