# Scaling Fixes & Edge Evolution

Cephlow's architecture has evolved from a monolithic Express.js backend to a globally distributed, edge-native architecture running on Cloudflare Workers and Cloudflare D1. This document details the history of scaling bottlenecks we solved and how the edge migration resolved them permanently.

---

## 1. Monolithic Bottlenecks (Legacy Express & Supabase PostgreSQL)

Historically, Cephlow ran on a monolithic Express.js server hosted on a $18/mo DigitalOcean Droplet, with Supabase PostgreSQL as the primary database. Under high concurrent load, we hit several critical bottlenecks:

### N+1 Database Sync Queries
- **Problem:** Syncing a participant sheet of 1,000 rows caused 1,000+ sequential queries and O(n²) matching.
- **Fix:** Implemented Map lookups (O(1)) and bulk `INSERT` / parallel chunked `UPDATE` operations. This reduced a 1,000-cert sync from 60s to ~800ms.

### Long-Running HTTP Connections
- **Problem:** In-line certificate generation held HTTP connections open for up to 30 minutes, leading to server timeouts, socket exhaustion, and OOM crashes.
- **Fix:** Moved certificate generation **client-side** (browser generates PDFs using the organizer's Google API quota and uploads directly to Cloudflare R2 via presigned URLs).

### Monolithic Database & Queue Overhead
- **Problem:** Running BullMQ/Redis or poll-based Postgres queues added latency, infrastructure cost, and complexity.
- **Fix:** Migrated the backend API completely to Cloudflare Workers (Hono) and Cloudflare D1 (SQLite at the edge). Bulk tasks (like email or WhatsApp delivery) are driven via client-side iteration loops, eliminating the need for server-side queues entirely.

---

## 2. The Edge Architecture (Cloudflare Workers + D1 + R2)

Cephlow now runs entirely serverless at the Cloudflare edge:

| Feature / Component | Legacy Monolith (Express) | Edge Architecture (Hono + Workers) |
|---|---|---|
| **API Runtime** | DigitalOcean Droplet ($18/mo) | Cloudflare Workers (Edge Functions) |
| **Primary Database** | Supabase PostgreSQL / Firestore | Cloudflare D1 (SQLite at the edge) |
| **Object Storage** | Cloudflare R2 (Server proxy) | Cloudflare R2 (Direct browser upload via presigned URLs) |
| **Delivery Queue** | Postgres tasks table (poll-based) | Client-side loops (non-blocking Hono worker requests) |
| **Support Bot** | Separate worker script | Embedded Cloudflare Worker bot + Telegram Supergroup Topic |

---

## 3. Core Scalability Wins

### Direct Browser Upload to R2
- Frontend obtains S3-compatible presigned PUT URLs via `POST /api/batches/:id/client-generate`.
- Browser uploads the PDF directly to R2. The Hono API Worker never loads PDF buffers into memory, avoiding RAM spikes.

### Client-Driven Sending Loops
- The React frontend handles the iteration loop and calls `POST /batches/:batchId/certificates/:certId/send` (or `send-whatsapp`) asynchronously.
- Cloudflare Workers handle these short, non-blocking requests concurrently without connection pool exhaustion.

### SQLite at the Edge (D1)
- D1 scales read/write queries with minimal network overhead because database queries run in the same datacenters as the Worker execution context.
