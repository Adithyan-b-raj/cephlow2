# Certificate Generation Platform — Full Project Documentation

This document explains **everything** about this project: what it does, how every file works, how all the pieces connect, what every environment variable means, and how to run and deploy the system.

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Environment Variables — Complete Reference](#4-environment-variables--complete-reference)
5. [Package: `@workspace/api-client-react` — Frontend API Client](#5-package-workspaceapi-client-react--frontend-api-client)
6. [App: `api-worker` — Hono Backend on Cloudflare Workers](#6-app-api-worker--hono-backend-on-cloudflare-workers)
7. [App: `cert-app` — React Frontend](#7-app-cert-app--react-frontend)
8. [Data Model — Cloudflare D1 Database Schema](#8-data-model--cloudflare-d1-database-schema)
9. [Authentication Flow — Two-Layer System](#9-authentication-flow--two-layer-system)
10. [Certificate Generation Flow — Client-Side Generation](#10-certificate-generation-flow--client-side-generation)
11. [Delivery Channels — Email & WhatsApp Sending](#11-delivery-channels--email--whatsapp-sending)
12. [WhatsApp Bot & Telegram Support Bridge](#12-whatsapp-bot--telegram-support-bridge)
13. [Cashfree Payments & Prepaid Wallet](#13-cashfree-payments--prepaid-wallet)
14. [Deployment](#14-deployment)
15. [Running Locally](#15-running-locally)
16. [Automated Testing & Coverage](#16-automated-testing--coverage)

---

## 1. What This Project Does

This is a **certificate generation and delivery platform** for organizations that need to issue personalized certificates (for courses, events, workshops, etc.).

The complete workflow:

```
Built-in Spreadsheet (participant data)
         +
Built-in Canvas Editor (certificate design template)
         ↓
  Browser generates personalized certificates (client-side canvas rendering)
         ↓
  PDFs exported → uploaded to Cloudflare R2
         ↓
  Sent to each participant via Email or WhatsApp
         ↓
  Each certificate gets a unique QR code → public verification page
```

**Who uses it:** An admin user logs in, designs their template using the built-in editor, loads recipient data into a built-in spreadsheet, maps placeholders, generates certificates, and delivers them via email or WhatsApp.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (cert-app)                                             │
│  React + Vite + Tailwind + shadcn/ui                           │
│  Port 5173 in dev                                               │
│                                                                 │
│  Supabase Auth (Google sign-in popup)                           │
│  → Gets RS256 JWT Token                                         │
│  → Sends token in every API request header                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS   Authorization: Bearer <jwt>
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  api-worker (Hono + Cloudflare Workers)                         │
│  Port 8787 in dev                                               │
│  Runs globally at edge datacenters                              │
│                                                                 │
│  Verifies JWT using JWKS public keys                            │
│  Reads/writes metadata to D1 (SQLite)                           │
│  Generates presigned PUT URLs for direct R2 uploads             │
│  Dispatches emails (Zeptomail) and WhatsApp messages            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
    Cloudflare D1      Google APIs        Cloudflare R2
   (SQLite relation  (Drive, Sheets,     (PDF storage,
    records & logs)   Slides, Gmail)      public URLs)
```

---

## 3. Monorepo Structure

The project uses **pnpm workspaces** — one repository, multiple packages that reference each other.

```
cephlow2/
├── .env                        ← ALL environment variables (single file for all apps)
├── package.json                ← root scripts
├── pnpm-workspace.yaml         ← defines workspace members + shared dependency catalog
├── tsconfig.json               ← root TypeScript project references
│
├── apps/
│   ├── api-worker/             ← Hono API backend running on Cloudflare Workers
│   └── cert-app/               ← Frontend (React + Vite)
│
└── packages/
    ├── api-client-react/       ← Auto-generated React Query hooks (via Orval + OpenAPI)
    └── api-zod/                ← Auto-generated Zod schemas + TypeScript types
```

---

## 4. Environment Variables — Complete Reference

All environment variables live in a **single `.env` file at the repo root**.

### Supabase (Auth / Client)
Configure user identification and sign-in.
- `VITE_SUPABASE_URL`: URL of the Supabase project instance.
- `VITE_SUPABASE_ANON_KEY`: Public client-side token for Supabase initialization.
- `SUPABASE_JWT_SECRET`: Secret token verification key (fallback to HMAC).

### Frontend URL & Development Configuration
- `VITE_API_URL`: URL of the backend API (e.g. `http://localhost:8787` in dev).

### Cloudflare Services
- `R2_ACCOUNT_ID`: Account identifier for Cloudflare R2 bucket.
- `R2_ACCESS_KEY_ID`: S3 credentials for generating presigned URLs.
- `R2_SECRET_ACCESS_KEY`: S3 secret credentials.
- `R2_BUCKET_NAME`: Bucket name for PDFs.
- `R2_PUBLIC_URL`: CDN base URL for public certificate access.

### Meta WhatsApp Business Cloud API
- `WHATSAPP_PHONE_NUMBER_ID`: ID of your WhatsApp phone number.
- `WHATSAPP_ACCESS_TOKEN`: Meta access token.
- `WHATSAPP_TEMPLATE_NAME`: Name of your approved document template (e.g. `document_senderv3`).

### Cashfree Payments (Payment Gateway)
- `CASHFREE_APP_ID`: App ID from Cashfree dashboard.
- `CASHFREE_SECRET_KEY`: Secret key from Cashfree dashboard.

### Prepaid Credits System
- `CREDITS_PER_RUPEE`: Conversion rate for wallet recharges (credits received per 1 INR, defaults to 10).
- `CREDIT_COST_GENERATION`: Global default credit cost per certificate generation (defaults to 1).
- `CREDIT_COST_EMAIL`: Global default credit cost per email delivery (defaults to 1).
- `CREDIT_COST_WHATSAPP`: Global default credit cost per WhatsApp message delivery (defaults to 3).
- `MIN_RECHARGE_AMOUNT`: Minimum wallet recharge limit in INR (defaults to 100).

---

## 5. Package: `@workspace/api-client-react` — Frontend API Client

**Folder:** `packages/api-client-react/`

Automatically generated from the OpenAPI specifications in `packages/api-spec`.
- Contains `useGetBatch`, `useListBatches`, `useDeleteBatch`, and all request wrappers with type safety.
- Exposes `customFetch` interceptor which adds `Authorization: Bearer <token>` and `X-Workspace-Id` headers.

---

## 6. App: `api-worker` — Hono Backend on Cloudflare Workers

**Folder:** `apps/api-worker/`

Deployed via `npx wrangler deploy` to Cloudflare Workers. It implements all API endpoints with zero-downtime startups.
- **Middleware**:
  - `auth.ts`: Verifies user Supabase JWTs.
  - `workspace.ts`: Validates workspace context and user membership roles.
  - `approval.ts`: Restricts wallet actions to whitelisted and approved organizations.
  - `rateLimiter.ts`: KV-backed rate limiter enforcing request thresholds for auth (`30/min`), payments (`10/min`), batch creation (`10/min`), certificate verification (`60/min`), QR lookup (`60/min`), spreadsheet sync (`20/min`), and a global API fallback (`120/min`).

---

## 7. App: `cert-app` — React Frontend

**Folder:** `apps/cert-app/`

Vite React application built using shadcn/ui and Tailwind v4. Deployed to Cloudflare Pages.
- **`FrameInventory.tsx`**: Manages design frames, marketplace listings, and unified owned certificate templates.
- **`Wallet.tsx`**: Displays workspace balances, transaction history, and top-up forms.

---

## 8. Data Model — Cloudflare D1 Database Schema

Cloudflare D1 hosts relation tables for the system:

- **`workspaces`**: Tenancy model containing primary workspace balances (`current_balance`).
- **`batches`**: Tracks generation jobs, templates, Sheets IDs, and counter fields (`generated_count`, `sent_count`).
- **`certificates`**: Rows for generated PDFs (`r2_pdf_url`, `whatsapp_status`, `whatsapp_message_id`).
- **`payment_orders`**: Unique order ID mappings to prevent double top-ups (idempotency).
- **`ledgers`**: Financial logs (`wallet_topup` / `batch_deduction`).

---

## 9. Authentication Flow — Two-Layer System

### Layer 1: Supabase Auth (Identity)
- The user authenticates in the browser with Google Sign-In or email via Supabase.
- The client-side Supabase SDK gets a JWT (RS256) and attaches it in request headers.
- The `authMiddleware` inside the Worker verifies it using Supabase JWKS.

### Layer 2: Google OAuth 2.0 (Permissions - Optional)
- To perform optional Google Drive backup/sharing tasks (making folders public), the user connects Google permissions.
- Google returns a refresh token, which is encrypted and stored in the database.
- The backend retrieves the token, gets an access token, and calls the Google API on behalf of the user.

---

## 10. Certificate Generation Flow — Client-Side Generation

To scale certificate generation without overloading servers, Cephlow does all generation client-side (in the browser):

```
1. Browser loads template data and built-in spreadsheet rows.
2. For each row:
   a. Browser renders the HTML canvas template.
   b. Fills placeholders dynamic-text on the canvas.
   c. Generates a PDF directly in the browser using PDF-Lib (client-side canvas export).
3. Browser requests a presigned PUT URL from api-worker (POST /api/batches/:id/client-generate).
4. Browser uploads the generated PDF directly to Cloudflare R2 using the presigned URL.
5. Browser notifies api-worker that upload is complete (POST /api/batches/:id/client-generate/complete).
```

---

## 11. Delivery Channels — Email & WhatsApp Sending

Delivery tasks are processed using client-driven loops inside the frontend to avoid connection timeouts:

- **Email Delivery**: The browser loops through the certs and calls `POST /batches/:batchId/certificates/:certId/send`. The worker fetches the PDF from R2 and delivers it via the organizer's Gmail API (or Zeptomail).
- **WhatsApp Delivery**: Calls `POST /batches/:batchId/certificates/:certId/send-whatsapp`. The worker triggers the Meta Cloud API with the approved `document_senderv3` template and the public R2 URL. Status updates (`sent` → `delivered` → `read`) are tracked via incoming Meta webhooks.

---

## 12. WhatsApp Bot & Telegram Support Bridge

- Incoming messages on the WhatsApp number trigger a webhook to `cephlow-api`.
- The bot parses the message, queries D1 for certificate indexes, and replies with interactive buttons.
- If a student requests support ("Talk to Developer"), the Worker creates a Telegram forum topic under a unified Supergroup.
- Messages are forwarded between WhatsApp (via Meta Cloud API) and Telegram (via Telegram Bot webhooks) based on mappings in `wa_tg_threads`.

---

## 13. Cashfree Payments & Prepaid Credits Wallet

Cephlow uses a prepaid credits system for usage billing. Wallet balances, transactions, and rates are tracked in credits:
1. **Recharge Flow**:
   - The user recharges in INR. `POST /payments/create-order` validates the minimum amount `MIN_RECHARGE_AMOUNT` (defaults to 100 INR).
   - The browser renders the Cashfree SDK modal for checkout.
   - Upon completion, `POST /payments/verify` fetches the order status from Cashfree and credits the workspace wallet by converting the INR amount to credits (`credits = INR * CREDITS_PER_RUPEE`).
   - Recharges are logged in the `ledgers` table.
2. **Deductions**:
   - **Certificate Generation**: Deduced atomically from workspace credit balance when batch generation starts. The cost is `generation_cost` credits per new certificate and `generation_cost * 0.2` (20% of standard rate) per visual regeneration.
   - **Delivery**: Deduced atomically when sending emails (`email_cost` credits) or WhatsApp messages (`whatsapp_cost` credits). Workspace-specific rates default to system env parameters (`CREDIT_COST_EMAIL` and `CREDIT_COST_WHATSAPP`).

---

## 14. Deployment

- **Frontend**: Automatically deployed via Cloudflare Pages on commit to the `main` branch.
- **Backend API**: Deployed to Cloudflare Workers with wrangler:
  ```bash
  pnpm --filter @workspace/api-worker run deploy
  ```

### Live Production Logging & Debugging
To inspect live production errors, request headers, API status codes, and server-side logs in real-time, you can stream Wrangler logs directly from your terminal:
```bash
pnpm --filter @workspace/api-worker exec wrangler tail
```
*(Requires wrangler to be authenticated with your Cloudflare account).*

---

## 15. Running Locally

1. **Install dependencies**:
   ```bash
   pnpm install
   ```
2. **Configure Environment Variables**:
   - Create a root `.env` containing your frontend configuration (e.g. `VITE_API_URL`).
   - Create `apps/api-worker/.dev.vars` (using `.dev.vars.example`) for backend secrets.
3. **Initialize local database** (required for Mode A):
   ```bash
   pnpm --filter @workspace/api-worker db:init
   ```
4. **Start Development Services**:
   - **Mode A (Fully Local)**: Concurrently runs local frontend and local simulated D1 backend:
     ```bash
     pnpm dev
     ```
   - **Mode B (Local Frontend + Remote D1 Backend)**: Runs both locally, but connects to the live remote Cloudflare D1 database:
     ```bash
     pnpm dev:remote
     ```
   - **Mode C (Local Frontend Only)**: Runs only the local frontend pointing directly to the deployed production/staging worker URL:
     ```bash
     pnpm dev:frontend
     ```

---

## 16. Automated Testing & Coverage

Cephlow uses **Vitest** for running automated tests across the monorepo. It enforces a strict **80% code coverage threshold** for statements, branches, functions, and lines.

### Key Testing Principles:
1. **Mock-First Strategy**: External integrations (D1 database, Gmail, Google Drive, WhatsApp APIs, Cashfree) are replaced with Vitest mock functions (`vi.fn()`) to ensure unit tests execute in milliseconds, are isolated, and run in any environment without credentials.
2. **Hono Route Testing**: Utilizes Hono's native `.request()` interface to feed simulated requests into endpoint routers without spinning up worker ports.
3. **Frontend Utility Testing**: Utilizes standard node environment configurations to test pure business and conversion logic (e.g. converting spreadsheet indexes).

### Commands:
* Run all tests recursively:
  ```bash
  pnpm test
  ```
* Run all tests with code coverage metrics:
  ```bash
  pnpm test --coverage
  ```
* Start a watch compiler to auto-run tests in a package during dev:
  ```bash
  pnpm --filter @workspace/api-worker exec vitest
  ```

### Git Commit Protection:
A local pre-commit hook (`.git/hooks/pre-commit`) triggers tests prior to any commit, blocking code integration if coverage drops or any test fails.
