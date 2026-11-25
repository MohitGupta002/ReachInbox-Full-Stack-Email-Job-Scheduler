# 🌐 INTERNET ACCESS LOG — Gmail Scheduler

> **Project:** Gmail Scheduler (ReachInbox Full-Stack Email Job Scheduler)  
> **Purpose:** Track all external resources, documentation, and APIs accessed during development  
> **Started:** 2026-11-25

---

## Log Format

```
| Timestamp | Crew Member | URL/Resource | Purpose | Result |
```

---

## Documentation Sources (Pre-Approved)

These are the official documentation sources approved for this project. Crew members may access these without additional approval:

| # | Resource | URL | Purpose |
|---|----------|-----|---------|
| 1 | BullMQ Quick Start | https://docs.bullmq.io/quick-start | Queue setup (vanilla JS + Redis 6.2+) |
| 2 | BullMQ Delayed Jobs | https://docs.bullmq.io/guide/jobs/delayed | Delayed job scheduling via Redis sorted sets |
| 3 | BullMQ Process Step Jobs | https://docs.bullmq.io/patterns/process-step-jobs | moveToDelayed & DelayedError patterns |
| 4 | BullMQ Concurrency | https://docs.bullmq.io/guide/workers/concurrency | Worker parallelism configuration |
| 5 | BullMQ Rate Limiting | https://docs.bullmq.io/guide/rate-limiting | Queue-level rate limiting |
| 6 | BullMQ Custom Job IDs | https://docs.bullmq.io/guide/jobs/job-ids | Custom jobId (no colons allowed) |
| 7 | BullMQ Idempotent Jobs | https://docs.bullmq.io/patterns/idempotent-jobs | Preventing duplicate job processing |
| 8 | Bull Board Express | https://www.npmjs.com/package/@bull-board/express | Queue monitoring dashboard |
| 9 | Bull Board GitHub | https://github.com/felixmosh/bull-board | Bull Board source & docs |
| 10 | Redis Persistence | https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ | AOF + RDB configuration |
| 11 | Redis Docker | https://redis.io/tutorials/operate/orchestration/docker/ | Docker Redis setup |
| 12 | Express.js Guide | https://expressjs.com/en/guide/database-integration/ | Express + database integration |
| 13 | Sequelize ORM | https://sequelize.org/ | PostgreSQL ORM |
| 14 | Nodemailer Ethereal | https://nodemailer.com/guides/testing-with-ethereal | Ethereal Email testing setup |
| 15 | Ethereal Email | https://ethereal.email/ | Fake SMTP service |
| 16 | Elasticsearch JS Client | https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/getting-started | ES client setup |
| 17 | Elasticsearch Search | https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/search_examples | Search query examples |
| 18 | Slack OAuth v2 | https://docs.slack.dev/authentication/installing-with-oauth | Slack OAuth flow |
| 19 | Slack oauth.v2.access | https://docs.slack.dev/reference/methods/oauth.v2.access | Token exchange API |
| 20 | Slack Incoming Webhooks | https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks | Webhook message posting |
| 21 | Google OAuth 2.0 | https://developers.google.com/identity/protocols/oauth2/web-server | Google OAuth web server flow |
| 22 | Passport Google | https://www.passportjs.org/packages/passport-google-oauth20/ | Passport OAuth strategy |
| 23 | PapaParse | https://www.papaparse.com/docs | CSV parser for JavaScript/React |
| 24 | Tailwind CSS | https://tailwindcss.com/docs | Utility-first CSS framework |
| 25 | Vite | https://vite.dev/guide/ | Frontend build tool |
| 26 | React Router | https://reactrouter.com/en/main | Client-side routing |

---

## NPM Packages to Install

### Backend Dependencies
```
express cors dotenv cookie-parser
bullmq ioredis
@bull-board/api @bull-board/express
sequelize pg pg-hstore
@elastic/elasticsearch
nodemailer
passport passport-google-oauth20 jsonwebtoken
uuid
```

### Frontend Dependencies
```
axios papaparse react-router-dom react-hot-toast
tailwindcss @tailwindcss/vite (dev)
```

---

## Docker Images Required

| Image | Version | Port | Purpose |
|-------|---------|------|---------|
| `postgres` | `16-alpine` | 5432 | PostgreSQL database |
| `redis` | `7-alpine` | 6379 | BullMQ queue + rate limiting store |
| `elasticsearch` | `8.15.0` | 9200 | Full-text email search |

---

## Access Log Entries

| Timestamp | Crew Member | Resource | Purpose | Result |
|-----------|-------------|----------|---------|--------|
| 2026-11-25 14:34 | COORDINATOR | Local PDF: ReachInboxEmailSchedulerBlueprintJS.pdf | Extract full project requirements | ✅ 13-page blueprint fully extracted |
| 2026-11-25 14:34 | COORDINATOR | Local Image: dashboard_reference.jpg | Analyze reference UI design | ✅ OtherSync-style dashboard analyzed |
| — | — | — | — | — |

---

## API Keys & Credentials Required

> [!CAUTION]
> **Never commit credentials to version control.** All secrets go in `.env` files only.

| Credential | Source | Required For | Env Variable |
|-----------|--------|-------------|--------------|
| Google OAuth Client ID | Google Cloud Console | User authentication | `GOOGLE_CLIENT_ID` |
| Google OAuth Client Secret | Google Cloud Console | User authentication | `GOOGLE_CLIENT_SECRET` |
| Slack Client ID | Slack API Dashboard | Slack OAuth | `SLACK_CLIENT_ID` |
| Slack Client Secret | Slack API Dashboard | Slack OAuth | `SLACK_CLIENT_SECRET` |
| JWT Secret | Generate random string | Session tokens | `JWT_SECRET` |

---

> **Crew members:** Log every new external resource accessed during development in the "Access Log Entries" table above.
