# WhatsApp Certificate Bot — Cloudflare Worker

## What This Is

A Cloudflare Worker that acts as the backend for a WhatsApp bot. When a student messages the bot, they can:

- **Send All** — receive all their certificates as PDF documents
- **Search** — browse a paginated list of their certificates and pick one
- **Send Single** — receive a specific certificate they selected from the list

Certificates are stored in **Cloudflare R2** (object storage), organized by the student's phone number as the folder name. The worker looks up the folder, lists the PDFs, and sends them via the WhatsApp Cloud API.

It also includes a **built-in analytics dashboard** (password-protected) so founders can monitor bot usage.

---

## Why Cloudflare Worker (not a traditional server)

The WhatsApp webhook needs a publicly accessible HTTPS endpoint that Meta can call instantly. A Cloudflare Worker:

- Is globally distributed — low latency for users across India
- Runs at the edge, close to where R2 buckets are served
- Has zero cold-start overhead compared to a Node.js server
- Costs nothing at low traffic (generous free tier)
- Handles R2 and D1 natively via bindings — no SDK setup, no credentials in code

---

## Analytics Dashboard

### What It Shows

Visit `https://whatsapp-cert-bot.cephlow.workers.dev/analytics?token=YOUR_PASSWORD`:

| Section | What It Shows |
|---|---|
| Summary cards | Total users, total downloads, total interactions, today's users, today's downloads |
| Bar chart | Active users per day (last 30 days) |
| Bar chart | Downloads per day (last 30 days) |
| Monthly table | Active users + downloads per month |
| Yearly table | Active users + downloads per year |
| Recent activity | Last 50 interactions (phones masked to `****XXXX`) |

"Downloads" = any `Send All` or `Send Single` action (i.e., a certificate was actually delivered).  
"Active users" = unique phone numbers in the given time period.

### How to Change the Password

```bash
cd cloudflare-worker
wrangler secret put ANALYTICS_TOKEN
wrangler deploy
```

---

## Why Cloudflare D1 (not Firebase)

The analytics feature needed time-series aggregations: active users per day, per month, per year, and download counts. We evaluated two options:

### Option A: Firebase Firestore
- Would require changes to the API server (`apps/api-server`) to receive and store logs
- Would require changes to the cert-app frontend to display the dashboard
- Firestore doesn't support `GROUP BY` or `COUNT(DISTINCT)` — aggregations would have to be computed in application code by fetching all documents
- Adds coupling between the WhatsApp bot (Cloudflare) and the main application stack
- Overkill for a founders-only internal dashboard

### Option B: Cloudflare D1 ✅ (chosen)
- D1 is SQLite running natively inside Cloudflare — zero network hops from the Worker
- Supports full SQL: `GROUP BY DATE()`, `COUNT(DISTINCT phone)`, `SUM(CASE WHEN ...)` — all aggregations run in the database, not in code
- Completely self-contained: the bot + analytics live entirely in `cloudflare-worker/`, no other service touched
- Free tier: 5M row reads/day, 100K row writes/day — more than enough for this use case
- The dashboard is rendered as HTML directly from the Worker — no separate frontend needed

---

## Setup (one-time)

```bash
# 1. Create the D1 database
wrangler d1 create wa-bot-analytics
# Copy the database_id from the output into wrangler.toml

# 2. Set the dashboard password
cd cloudflare-worker
wrangler secret put ANALYTICS_TOKEN

# 3. Deploy
wrangler deploy
```

The database schema (table + indexes) is created automatically on the first incoming message. No manual migration needed.

---

## Environment Bindings

| Binding | Type | Purpose |
|---|---|---|
| `CERTIFICATES` | R2 Bucket | Stores student certificate PDFs |
| `DB` | D1 Database | Stores bot interaction logs for analytics |
| `WA_TOKEN` | Secret | WhatsApp Cloud API bearer token |
| `VERIFY_TOKEN` | Secret | Meta webhook verification token |
| `PHONE_NUMBER_ID` | Secret | WhatsApp phone number ID |
| `ANALYTICS_TOKEN` | Secret | Password for the analytics dashboard |
| `R2_PUBLIC_URL` | Var | Public base URL of the R2 bucket |
| `API_URL` | Var | API server URL (for forwarding delivery status updates) |

Secrets are set via `wrangler secret put <NAME>` and never stored in code or `wrangler.toml`.

---

## How the Bot Works (flow)

```
Student sends "hi" on WhatsApp
        ↓
Meta sends POST to the Worker webhook URL
        ↓
Worker normalizes the message → routes to a handler
        ↓
Handler sends a WhatsApp reply (buttons / document list / PDF)
        ↓  fire-and-forget (doesn't delay the reply)
Worker logs the interaction to D1
        ↓
Founder visits /analytics?token=... → Worker queries D1 → renders HTML dashboard
```

Delivery status updates (sent → delivered → read) from Meta are forwarded to the main API server, which updates the certificate status in Firebase.
