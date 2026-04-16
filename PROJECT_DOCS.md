# Certificate Generation Platform — Full Project Documentation

This document explains **everything** about this project: what it does, how every file works,
how all the pieces connect, what every environment variable means, and how to add new features.

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Environment Variables — Complete Reference](#4-environment-variables--complete-reference)
5. [Package: `@workspace/firebase` — Database & Auth (Shared)](#5-package-workspacefirebase--database--auth-shared)
6. [Package: `@workspace/api-client-react` — Frontend API Client (Shared)](#6-package-workspaceapi-client-react--frontend-api-client-shared)
7. [App: `api-server` — Backend (Express + Firebase Functions)](#7-app-api-server--backend-express--firebase-functions)
8. [App: `cert-app` — Frontend (React + Vite)](#8-app-cert-app--frontend-react--vite)
9. [Data Model (Firestore Collections)](#9-data-model-firestore-collections)
10. [Authentication Flow — Two-Layer System](#10-authentication-flow--two-layer-system)
11. [Certificate Generation Flow — Step by Step](#11-certificate-generation-flow--step-by-step)
12. [Email Sending Flow](#12-email-sending-flow)
13. [WhatsApp Sending Flow](#13-whatsapp-sending-flow)
14. [Certificate Verification (Public QR Scanning)](#14-certificate-verification-public-qr-scanning)
15. [Deployment](#15-deployment)
16. [Running Locally](#16-running-locally)
17. [How to Add New Features](#17-how-to-add-new-features)
18. [Cashfree Payment Gateway & Prepaid Wallet](#18-cashfree-payment-gateway--prepaid-wallet)

---

## 1. What This Project Does

This is a **certificate generation and delivery platform** for organizations that need to issue
personalized certificates (for courses, events, workshops, etc.).

The complete workflow:

```
Google Sheets (participant data)
         +
Google Slides (certificate template)
         ↓
  Backend generates a personalized certificate per row
         ↓
  PDFs exported → uploaded to Google Drive + Cloudflare R2
         ↓
  Sent to each participant via Gmail or WhatsApp
         ↓
  Each certificate gets a unique QR code → public verification page
```

**Who uses it:** An admin user logs in, connects their Google account, picks their spreadsheet
and slide template, hits Generate, then hits Send.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (cert-app)                                             │
│  React + Vite + Tailwind + shadcn/ui                           │
│  Port 5173 in dev                                               │
│                                                                 │
│  Firebase Auth (Google sign-in popup)                          │
│  → Gets Firebase ID Token                                      │
│  → Sends token in every API request header                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS   Authorization: Bearer <id_token>
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  api-server (Express.js)                                        │
│  Port 3000 in dev                                               │
│  Deployed as Firebase Cloud Function (or Render.com)           │
│                                                                 │
│  Verifies Firebase ID Token → gets uid                         │
│  Looks up user's Google refresh token from Firestore           │
│  Calls Google APIs (Drive, Sheets, Slides, Gmail)              │
│  Uploads PDFs to Cloudflare R2                                 │
│  Sends WhatsApp messages via Meta Graph API                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
    Firestore DB     Google APIs        Cloudflare R2
    (batches,        (Drive, Sheets,    (PDF storage,
     certificates)    Slides, Gmail)    public URLs)
```

---

## 3. Monorepo Structure

The project uses **pnpm workspaces** — one repository, multiple packages that reference each other.

```
cert/                           ← root (workspace)
├── .env                        ← ALL environment variables (single file for all apps)
├── firebase-service-account.json ← Firebase Admin credentials (never commit)
├── package.json                ← root scripts (build, typecheck)
├── pnpm-workspace.yaml         ← defines workspace members + shared dependency versions
├── tsconfig.json               ← root TypeScript project references
├── tsconfig.base.json          ← shared TS compiler options
├── firebase.json               ← Firebase Hosting + Functions deployment config
├── render.yaml                 ← Render.com deployment config (alternative)
│
├── apps/
│   ├── api-server/             ← Backend (Express + Firebase Cloud Functions)
│   └── cert-app/               ← Frontend (React + Vite)
│
└── packages/
    ├── firebase/               ← Firebase Admin SDK setup + Firestore helpers
    ├── api-client-react/       ← Auto-generated API client + React Query hooks
    └── api-zod/                ← Auto-generated Zod schemas + TypeScript types
```

**Key concept — workspace packages:**
When `api-server` writes `import { db } from "@workspace/firebase"`, it does NOT go to npm.
It imports the local `packages/firebase` folder. This is configured in each `package.json`'s
`dependencies` as `"@workspace/firebase": "workspace:*"`.

**`pnpm-workspace.yaml` also defines a shared catalog** — a central version registry so all apps
use the same version of React, Tailwind, etc. without repeating version numbers everywhere.

---

## 4. Environment Variables — Complete Reference

All env vars live in a **single `.env` file at the repo root**. Vite reads it for the frontend
(picks up `VITE_` prefixed vars only); the API server reads it via `process.env`.

### Firebase Client (Frontend)
These configure the browser-side Firebase SDK for sign-in.

| Variable | What it is | Where to get it |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project API key | Firebase Console → Project Settings → General |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (e.g. `yourapp.firebaseapp.com`) | Same place |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (e.g. `cephlow`) | Same place |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket URL | Same place |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender ID | Same place |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Same place |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics ID (optional) | Same place |

### Frontend URL
| Variable | What it is | Example |
|---|---|---|
| `VITE_API_URL` | URL of the backend API | `http://localhost:3000` in dev, deployed URL in prod |

### Firebase Admin (Backend)
The backend uses the service account JSON file directly.
Either set `FIREBASE_SERVICE_ACCOUNT_KEY` to the full JSON string, **or** place
`firebase-service-account.json` in the repo root (the code tries both).

### Google OAuth 2.0
Used by the backend to get long-lived tokens to call Google APIs on behalf of users.

| Variable | What it is | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID | Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app type) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Same place |
| `GOOGLE_REDIRECT_URI` | Where Google redirects after user grants permission | Must match exactly what you registered; dev: `http://localhost:3000/api/auth/google/callback` |
| `FRONTEND_URL` | After OAuth, redirect user back here | `http://localhost:5173` in dev |

**Important:** In the Google Cloud Console you must also enable these APIs:
- Google Drive API
- Google Sheets API
- Google Slides API
- Gmail API

### Cloudflare R2
R2 is an S3-compatible object storage where PDFs are uploaded for public access (needed for WhatsApp).

| Variable | What it is | Where to get it |
|---|---|---|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare Dashboard → right sidebar |
| `R2_ACCESS_KEY_ID` | R2 API token key ID | Cloudflare → R2 → Manage R2 API tokens |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret | Same place (shown once on creation) |
| `R2_BUCKET_NAME` | Name of your R2 bucket | Whatever you named it |
| `R2_PUBLIC_URL` | Public base URL for your bucket | Cloudflare → R2 → your bucket → Settings → Public access |
| `PUBLIC_BASE_URL` | Your deployed frontend URL | Used for QR code links, e.g. `https://yourapp.com` |
| `R2_PHONE_COLUMN` | (Optional) exact column header for phone numbers | If your sheet uses a non-standard column name |

### Cashfree API (Payment Gateway & Prepaid Wallet)
Required for the prepaid wallet system used for batch generation limits.

| Variable | What it is | Where to get it |
|---|---|---|
| `CASHFREE_APP_ID` | Cashfree API App ID | Cashfree Dashboard → Developers → API Keys |
| `CASHFREE_SECRET_KEY` | Cashfree API Secret Key | Same place |

### WhatsApp Business Cloud API
| Variable | What it is | Where to get it |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ID of your WhatsApp Business phone number | Meta Developer Console → WhatsApp → Phone Numbers |
| `WHATSAPP_ACCESS_TOKEN` | Access token (permanent or temporary) | Meta Developer Console → App → Access Tokens |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Language code for the template (default: `en`) | Set based on your approved template language |

The WhatsApp template used is named **`document_sender`**. It must exist and be approved in
your Meta Business Manager. Template format:
```
Header: [PDF document]
Body: Hi {{1}}, your certificate for {{2}} is attached below.
```
`{{1}}` = recipient name, `{{2}}` = batch/event name.

---

## 5. Package: `@workspace/firebase` — Database & Auth (Shared)

**File:** `packages/firebase/src/index.ts`

This package initializes Firebase Admin SDK **once** and exports reusable helpers.
Both the API server and (in some contexts) other packages import from here.

### What it exports

```typescript
export const db        // Firestore database instance
export const auth      // Firebase Admin Auth instance

export const batchesCollection              // db.collection("batches")
export function certificatesCollection(batchId)  // batches/{batchId}/certificates
export const certIndexCollection            // db.collection("certIndex") — fast lookup

// TypeScript type definitions:
export interface Batch { ... }
export interface Certificate { ... }
```

### How Firebase Admin credentials are loaded

1. First tries `process.env.FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string)
2. Falls back to `firebase-service-account.json` at the repo root
3. Throws a clear error if neither is found

This means in production (Firebase Functions), you set the env var; in local dev, you just have
the JSON file.

---

## 6. Package: `@workspace/api-client-react` — Frontend API Client (Shared)

**Folder:** `packages/api-client-react/src/`

This package gives the frontend a type-safe way to call the backend without writing raw `fetch` calls.

### Files

| File | Purpose |
|---|---|
| `custom-fetch.ts` | The actual fetch wrapper — injects auth token, handles errors |
| `generated/api.ts` | Auto-generated API functions (from OpenAPI spec via `orval`) |
| `generated/api.schemas.ts` | Auto-generated TypeScript types |
| `whatsapp.ts` | React Query hooks specifically for WhatsApp sending |
| `index.ts` | Re-exports everything |

### `custom-fetch.ts` — How API calls work

This is the core. Every API call in the frontend goes through `customFetch()`.

```
Frontend component calls useGetBatches()
  → calls customFetch("/api/batches", { method: "GET" })
    → calls authTokenProvider() to get the Firebase ID token
    → adds Authorization: Bearer <token> header
    → adds the base URL (VITE_API_URL)
    → makes the actual HTTP request
    → parses the response (JSON/text/blob)
    → throws ApiError if status >= 400
```

Two things can be configured once at startup (done in `use-auth.tsx`):
- `setBaseUrl(url)` — set to `VITE_API_URL`
- `setAuthTokenProvider(fn)` — set to a function that returns the current Firebase ID token

### React Query integration

The auto-generated hooks (like `useGetBatches`, `usePostBatchesBatchIdGenerate`) use
**TanStack React Query** under the hood. This means:
- Data is cached and automatically refetched
- Loading / error states are handled
- Mutations trigger cache invalidation

---

## 7. App: `api-server` — Backend (Express + Firebase Functions)

**Folder:** `apps/api-server/src/`

### Entry Points

| File | Purpose |
|---|---|
| `index.ts` | Starts a plain Node.js HTTP server on `PORT` (used in dev / Render.com) |
| `functions.ts` | Exports the Express app as a Firebase Cloud Function named `api` |
| `app.ts` | Creates the Express app, attaches all middleware and routes |

### `app.ts` — Route Mounting Order

The order matters because auth middleware is selectively applied:

```typescript
app.use("/api", healthRouter)      // GET /api/healthz — no auth
app.use("/api", verifyRouter)      // GET /api/verify/:batchId/:certId — no auth (public)
app.use("/api", authRouter)        // GET /api/auth/google/callback — no auth
                                   // GET /api/auth/google/status — auth applied inside
                                   // GET /api/auth/google/url — auth applied inside

app.use("/api", requireAuth, router) // ALL OTHER routes — auth required
```

### Middleware: `middlewares/auth.ts`

```
Request comes in with: Authorization: Bearer eyJhbGciOiJSUzI1...
                                           ↑ Firebase ID Token (short-lived JWT)

requireAuth:
  1. Extracts token from header
  2. Calls firebase.auth.verifyIdToken(token)
  3. On success: sets req.user = { uid, email }
  4. On failure: returns 401
```

### Routes

#### `routes/health.ts`
- `GET /api/healthz` → Returns `{ status: "ok" }`. Used by load balancers / uptime checks.

#### `routes/auth.ts`
Manages the Google OAuth 2.0 connection:
- `GET /api/auth/google/status` → Returns `{ connected: true/false }` — has the user granted Google API access?
- `GET /api/auth/google/url` → Returns the Google OAuth consent page URL to redirect the user to
- `GET /api/auth/google/callback` → Google redirects here after user grants access; stores the refresh token

#### `routes/sheets.ts`
- `POST /api/sheets` → Create a new blank Google Spreadsheet with given headers
- `GET /api/sheets` → List all Google Sheets files in user's Drive
- `GET /api/sheets/:sheetId/data` → Read rows from a sheet (optional `?tabName=SheetName`)

#### `routes/slides.ts`
- `GET /api/slides/templates` → List all Google Slides presentations in user's Drive
- `POST /api/slides/templates` → Create a new blank presentation
- `GET /api/slides/:templateId/placeholders` → Extract `<<placeholder>>` variable names from a slide
- `POST /api/slides/:templateId/qr-placeholder` → Add a QR code image placeholder to a slide

#### `routes/batches.ts` (the most important file)
See full details in [Certificate Generation Flow](#11-certificate-generation-flow--step-by-step).

- `GET /api/batches` → List all batches for the authenticated user
- `POST /api/batches` → Create batch + read sheet + create Drive folders + create certificate records
- `GET /api/batches/:batchId` → Get one batch with all its certificates
- `POST /api/batches/:batchId/share-folder` → Make Drive PDF folder publicly accessible
- `POST /api/batches/:batchId/generate` → **Generate all certificates** (background processing)
- `POST /api/batches/:batchId/send` → Send all generated certs via Gmail
- `POST /api/batches/:batchId/send-whatsapp` → Send all generated certs via WhatsApp
- `POST /api/batches/:batchId/certificates/:certId/send` → Send one cert via Gmail
- `POST /api/batches/:batchId/certificates/:certId/send-whatsapp` → Send one cert via WhatsApp
- `DELETE /api/batches/:batchId` → Delete batch, certificates, and R2 PDF files

#### `routes/verify.ts` (public — no auth)
- `GET /api/verify/:batchId/:certId` → Return certificate details for public verification
- `GET /api/verify/:batchId/:certId/qr` → Return QR code PNG image (300×300)

#### `routes/certificates.ts`
- `GET /api/certificates` → List certificates (with optional filters)
- `GET /api/` → Verify certificate by ID (uses `certIndex` for fast lookup)

### Library Files (`lib/`)

#### `lib/googleAuth.ts` — OAuth Token Management

This is the **bridge** between Firebase Auth (for login) and Google APIs (for Drive, Gmail, etc.).

**Problem it solves:** Firebase Auth lets users sign in with Google, but that only gives us a
Firebase ID token (for our own backend). To call Google APIs, we need a separate OAuth token with
specific scopes (Drive, Gmail, etc.). `googleAuth.ts` manages this second authorization.

**Flow:**
```
1. generateAuthUrl(uid)
   → Creates a random nonce, stores it in Firestore as pendingGoogleAuth/{nonce}
   → Returns Google OAuth URL with: offline access, consent prompt, specific scopes, nonce as state

2. User visits the URL, grants permissions

3. handleCallback(code, state)
   → Verifies the state nonce against Firestore (prevents CSRF)
   → Exchanges code for tokens
   → Stores refresh_token in Firestore as userGoogleTokens/{uid}

4. getAuthClientForUser(uid)
   → Reads refresh token from Firestore
   → Creates google.auth.OAuth2 client with it
   → Returns the client (Google APIs auto-refresh access token as needed)
```

**Scopes requested:**
```
gmail.send          — to send emails
spreadsheets        — to read/write Google Sheets
drive               — to create/manage files in Google Drive
presentations       — to copy/edit Google Slides
```

#### `lib/googleDrive.ts` — Drive + Certificate Generation

This is the **heart of certificate generation**. Key functions:

**`generateCertificate(uid, templateId, recipientName, replacements, driveFolderId, qrCodeUrl)`**
```
1. Copies the template slide (Drive.files.copy)
2. Gets all text elements from all slides
3. Finds <<placeholder>> patterns
4. Replaces each placeholder with the corresponding value from replacements map
5. If qrCodeUrl is provided:
   a. Generates QR code as PNG buffer (using qrcode library)
   b. Uploads QR PNG to Drive
   c. Finds the element named "qr_code" on the slide
   d. Replaces it with the actual QR code image
6. Returns { fileId, url } of the new slide
```

**`exportSlidesToPdf(uid, slideFileId)`**
```
Calls Drive export API with mimeType=application/pdf
Returns the PDF as a Buffer
```

**`uploadPdf(uid, name, pdfBuffer, folderId)`**
```
Uploads PDF buffer to a Drive folder
Returns { fileId, url }
```

**`makeFilePublic(uid, fileId)`**
```
Creates a Drive permission: role=reader, type=anyone
Makes the file accessible to anyone with the link
```

#### `lib/googleSheets.ts` — Sheets Client

Simple wrapper. Exports `getSheetsClient(uid)` which returns a Google Sheets API client
authenticated with the user's stored OAuth tokens.

#### `lib/gmail.ts` — Email Sending

`sendEmail(uid, { to, subject, body, pdfBuffer, pdfFilename })`:
- Builds a raw MIME email (multipart/mixed with PDF attachment if provided)
- Base64-url-encodes it
- Calls `gmail.users.messages.send`

#### `lib/cloudflareR2.ts` — PDF Object Storage

Uses the AWS S3-compatible SDK (`@aws-sdk/client-s3`) because R2 is S3-compatible.

Key functions:
- `uploadPdfToR2(folderName, fileName, buffer)` → Uploads and returns the S3 key
- `getR2PublicUrl(key)` → Builds the public URL: `R2_PUBLIC_URL/key`
- `deleteR2Object(key)` / `deleteR2Objects(keys)` → Delete files (called when batch is deleted)
- `isR2Configured()` → Returns false if any env var is missing (gracefully skips R2)

**Folder structure in R2:**
```
{phone_number}/{recipientName}_{batchName}.pdf
   e.g.: 919876543210/John_Doe_Workshop_2024.pdf
```
If no phone number is found, falls back to recipient name as folder.

#### `lib/whatsapp.ts` — WhatsApp Business API

`sendWhatsAppDocument(to, documentUrl, filename, var1, var2)`:
- Calls Meta Graph API: `POST /v18.0/{phoneNumberId}/messages`
- Uses the `document_sender` template
- Sends a document (PDF URL from R2) with the template body
- Appends a cache-buster `?_cb=timestamp` to the URL so WhatsApp re-fetches fresh PDFs

---

## 8. App: `cert-app` — Frontend (React + Vite)

**Folder:** `apps/cert-app/src/`

### Tech Stack
- **React 19** with TypeScript
- **Vite** for bundling and dev server
- **Tailwind CSS v4** for styling
- **shadcn/ui** for UI components (Button, Card, Dialog, Table, etc.)
- **TanStack React Query** for server state management
- **React Router v6** for client-side routing
- **Lucide React** for icons

### File Map

```
src/
├── main.tsx              ← React entry point, mounts <App />
├── App.tsx               ← Router, auth guard, providers
├── index.css             ← Global styles + Tailwind import
│
├── lib/
│   ├── firebase.ts       ← Firebase app init, sign-in, sign-out
│   └── utils.ts          ← cn() helper for Tailwind class merging
│
├── hooks/
│   ├── use-auth.tsx      ← Auth context provider + useAuth() hook
│   ├── use-mobile.tsx    ← Detects mobile screen size
│   └── use-toast.ts      ← Toast notification system
│
├── components/
│   ├── layout/
│   │   ├── Layout.tsx    ← App shell: sidebar + main content area
│   │   └── AppSidebar.tsx ← Navigation links
│   └── ui/               ← shadcn/ui components (50+ files)
│
└── pages/
    ├── Login.tsx          ← Sign-in page
    ├── Dashboard.tsx      ← Home page with stats + recent batches
    ├── History.tsx        ← Full batch + certificate history
    ├── VerifyCertificate.tsx ← Public verification page (no auth needed)
    ├── not-found.tsx      ← 404 page
    ├── batches/
    │   ├── NewBatch.tsx   ← Multi-step wizard to create a batch
    │   └── BatchDetail.tsx ← View, generate, send a batch
    └── templates/
        └── NewTemplate.tsx ← Create a new Google Slides template
```

### `App.tsx` — Routing & Auth Guard

```
<AuthProvider>          ← provides useAuth() to all children
  <QueryClientProvider> ← provides TanStack Query to all children
    <Toaster />         ← global toast notifications

    Routes:
      /                 → Dashboard (auth required)
      /batches/new      → NewBatch (auth required)
      /batches/:id      → BatchDetail (auth required)
      /history          → History (auth required)
      /templates/new    → NewTemplate (auth required)
      /verify/:bid/:cid → VerifyCertificate (PUBLIC — no auth)
      *                 → NotFound

    Auth logic:
      loading=true  → show loading spinner
      user=null     → show <Login /> page
      !hasGoogleAuth → show <ConnectGoogleScreen />
      else          → show the actual page
```

### `hooks/use-auth.tsx` — Authentication State

This is the **central auth hook** that everything uses.

```typescript
const { user, loading, hasGoogleAuth, login, logout, connectGoogle } = useAuth()
```

What each property means:
- `user` — Firebase User object (null if not logged in)
- `loading` — true while checking auth state on page load
- `hasGoogleAuth` — true if the user has connected their Google account for API access
- `login()` — opens Google sign-in popup (Firebase Auth only)
- `logout()` — signs out of Firebase
- `connectGoogle()` — redirects to Google OAuth to grant API permissions

**Important distinction:**
- `login()` = Firebase sign-in (identity — who are you?)
- `connectGoogle()` = Google OAuth (permissions — can we use your Drive, Gmail?)

These are two separate steps. A user can be logged in but not have connected Google yet.

### `lib/firebase.ts` — Firebase Client

Initializes Firebase using the `VITE_FIREBASE_*` env vars. Exports:
- `auth` — the Firebase Auth instance
- `signInWithGoogle()` — popup sign-in
- `signOut()` — sign out

---

## 9. Data Model (Firestore Collections)

### `batches` collection

Each document represents one certificate batch:

```typescript
{
  userId: string           // Firebase UID of the owner
  name: string             // e.g. "React Workshop Batch 1"
  sheetId: string          // Google Sheets file ID
  sheetName: string        // Display name of the sheet
  tabName: string | null   // Sheet tab (e.g. "Sheet1")
  templateId: string       // Google Slides template file ID
  templateName: string     // Display name of the template
  columnMap: {             // Maps placeholder → sheet column header
    "Name": "Full Name",
    "Course": "Workshop Name"
  }
  emailColumn: string      // Which column has email addresses
  nameColumn: string       // Which column has recipient names
  emailSubject: string     // Email subject (can have <<placeholders>>)
  emailBody: string        // Email body text (can have <<placeholders>>)
  categoryColumn: string   // (Optional) column for picking different templates
  categoryTemplateMap: {   // (Optional) per-category template overrides
    "Gold": { templateId: "...", templateName: "Gold Template" }
  }
  status: "draft" | "generating" | "generated" | "sending" | "sent" | "partial" | "failed"
  driveFolderId: string    // Google Drive folder for slides
  pdfFolderId: string      // Google Drive subfolder for PDFs
  totalCount: number       // Total rows from the sheet
  generatedCount: number   // How many certs have been generated
  sentCount: number        // How many certs have been sent
  createdAt: Timestamp
}
```

### `batches/{batchId}/certificates` subcollection

Each document is one certificate for one person:

```typescript
{
  batchId: string
  recipientName: string
  recipientEmail: string
  status: "pending" | "generated" | "sent" | "failed"
  rowData: Record<string, string>  // Full row from the sheet
  slideFileId: string | null       // Google Slides copy file ID
  slideUrl: string | null          // Google Slides edit URL
  pdfFileId: string | null         // Google Drive PDF file ID
  pdfUrl: string | null            // Google Drive PDF URL
  r2PdfUrl: string | null          // Cloudflare R2 public PDF URL
  sentAt: Timestamp | null
  errorMessage: string | null
  createdAt: Timestamp
}
```

### `userGoogleTokens` collection

Stores the Google OAuth refresh token per user:

```typescript
// Document ID = Firebase UID
{
  refreshToken: string
  updatedAt: number  // Unix timestamp
}
```

### `pendingGoogleAuth` collection

Temporary store for OAuth state nonces (auto-deleted after use):

```typescript
// Document ID = random nonce
{
  uid: string
  expiresAt: number  // Unix timestamp (10 min window)
}
```

### `certIndex` collection

Fast lookup index: given a certificate ID, find which batch it belongs to.

```typescript
// Document ID = certificate ID
{
  batchId: string
}
```

---

## 10. Authentication Flow — Two-Layer System

### Layer 1: Firebase Auth (Identity)

```
User clicks "Sign in with Google"
  → Firebase popup opens
  → User picks Google account
  → Firebase creates session
  → Frontend gets Firebase User object + ID Token
  → ID Token expires every ~1 hour (auto-refreshed by Firebase SDK)
```

Every API request sends this token:
```
Authorization: Bearer eyJhbGci...   ← Firebase ID Token
```

The backend verifies it with Firebase Admin SDK. No session cookies, no JWT secrets needed.

### Layer 2: Google OAuth (API Permissions)

```
User clicks "Connect Google Account"
  → Frontend calls GET /api/auth/google/url
  → Backend generates OAuth URL with required scopes
  → Browser redirects to Google consent page
  → User approves: "Allow this app to access Drive, Gmail, etc."
  → Google redirects to /api/auth/google/callback?code=xxx&state=nonce
  → Backend exchanges code for tokens
  → Stores refresh_token in Firestore userGoogleTokens/{uid}
  → Redirects browser back to frontend with ?google_auth=success
```

After this, every backend operation that touches Google APIs:
```typescript
const auth = await getAuthClientForUser(uid)
// → reads refresh token from Firestore
// → creates OAuth2 client
// → Google auto-refreshes access tokens as needed
const drive = google.drive({ version: "v3", auth })
```

---

## 11. Certificate Generation Flow — Step by Step

### Step 1: Create the Batch (`POST /api/batches`)

```
Frontend sends: { name, sheetId, templateId, columnMap, emailColumn, nameColumn, ... }

Backend does:
1. Reads the Google Sheet to get all rows
2. Creates a Drive folder: "{batchName}/"
3. Creates a Drive subfolder: "{batchName}/pdf/"
4. Saves batch document to Firestore
5. Creates one certificate document per sheet row (status: "pending")
6. Returns the created batch
```

### Step 2: Generate Certificates (`POST /api/batches/:batchId/generate`)

```
Backend:
1. Updates batch status → "generating"
2. Immediately returns 200 to frontend (so UI doesn't hang)
3. Continues processing in background async loop:

   For each certificate:
   a. Build replacements map: { "Name": "John Doe", "Course": "React" }
   b. Build QR code URL: https://yourapp.com/verify/{batchId}/{certId}
   c. Pick template (or category-specific template if configured)

   d. generateCertificate(uid, templateId, name, replacements, driveFolderId, qrUrl)
      → Copy slide template in Drive
      → Replace all <<placeholder>> text
      → Generate QR code PNG
      → Insert QR image into slide
      → Returns slideFileId + slideUrl

   e. exportSlidesToPdf(uid, slideFileId)
      → Download slide as PDF buffer

   f. uploadPdf(uid, pdfName, buffer, pdfFolderId)
      → Upload to Drive PDF folder
      → Returns pdfFileId + pdfUrl

   g. uploadPdfToR2(phoneOrName, pdfName, buffer)
      → Upload to Cloudflare R2
      → Returns r2PdfUrl (public URL)

   h. Update certificate in Firestore:
      status: "generated", slideFileId, slideUrl, pdfFileId, pdfUrl, r2PdfUrl

   i. Update batch.generatedCount (so frontend progress bar updates)

4. When all done: set batch status → "generated" (or "partial" if some failed)
```

**Frontend polling:** The UI polls `GET /api/batches/:batchId` every few seconds to show
the progress bar updating in real time.

### Step 3: Send via Email (`POST /api/batches/:batchId/send`)

```
For each generated certificate:
1. Export the slide to PDF again (fresh copy)
2. Personalize subject and body: replace <<Name>> with actual name, etc.
3. Send via Gmail API with PDF attachment
4. Update cert status → "sent"
5. Update batch sentCount
```

### Step 4: Send via WhatsApp (`POST /api/batches/:batchId/send-whatsapp`)

```
For each generated certificate:
1. Find phone number in rowData (checks common column names)
2. Normalize phone: remove non-digits, remove leading 0s
3. Resolve <<placeholders>> in var1 and var2 templates
4. Call Meta Graph API with:
   - document URL: cert.r2PdfUrl (the Cloudflare R2 URL)
   - filename: "John_Doe_Workshop.pdf"
   - var1: recipient name
   - var2: batch/event name
5. Update cert status → "sent"
```

---

## 12. Email Sending Flow

```
sendEmail(uid, { to, subject, body, pdfBuffer, pdfFilename })

1. Get Gmail client with user's OAuth token
2. Build MIME email:
   Content-Type: multipart/mixed

   Part 1: text/plain — the email body
   Part 2: application/pdf — the certificate PDF
            Content-Disposition: attachment; filename="..."

3. Base64-url-encode the entire message
4. Call gmail.users.messages.send({ userId: "me", raw: encoded })
```

The email is sent **from the user's own Gmail account** because the OAuth token belongs to them.

---

## 13. WhatsApp Sending Flow

```
sendWhatsAppDocument(to, documentUrl, filename, var1, var2)

POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}

Body:
{
  messaging_product: "whatsapp",
  to: "919876543210",
  type: "template",
  template: {
    name: "document_sender",
    language: { code: "en" },
    components: [
      {
        type: "header",
        parameters: [{ type: "document", document: { link: r2PdfUrl, filename: "..." } }]
      },
      {
        type: "body",
        parameters: [
          { type: "text", text: "John Doe" },      // {{1}}
          { type: "text", text: "React Workshop" }  // {{2}}
        ]
      }
    ]
  }
}
```

**Requirements:**
- The document URL must be publicly accessible (that's why we use R2, not Drive)
- The template `document_sender` must be approved by Meta
- Phone number must be in international format without `+` or leading zeros

---

## 14. Certificate Verification (Public QR Scanning)

Each certificate has a unique URL: `https://yourapp.com/verify/{batchId}/{certId}`

This URL is encoded in the QR code embedded in each certificate.

**Backend (`GET /api/verify/:batchId/:certId`):**
```
1. Fetch certificate from batches/{batchId}/certificates/{certId}
2. Fetch batch from batches/{batchId}
3. Return: { recipientName, status, batchName, issuedAt, r2PdfUrl }
```

**Frontend (`pages/VerifyCertificate.tsx`):**
- Shows certificate details (name, event, issue date)
- Shows verification status badge
- Link to download the PDF
- No login required

**QR code generation (`GET /api/verify/:batchId/:certId/qr`):**
```
Generates a 300×300 PNG QR code that encodes the verification URL
Used when embedding in the slide template
```

---

## 15. Deployment

### Option A: Firebase Hosting + Cloud Functions

**What gets deployed where:**
- Frontend → Firebase Hosting (static files from `apps/cert-app/dist/public/`)
- Backend → Firebase Cloud Functions (the Express app wrapped as a function)

**Deploy commands:**
```bash
firebase deploy              # deploys both hosting and functions
firebase deploy --only hosting
firebase deploy --only functions
```

**`firebase.json` routing:**
```
/api/** → Cloud Function "api"
/**     → index.html (React SPA)
```

**Build steps (automatic via predeploy hooks):**
```bash
# Frontend build
pnpm --filter @workspace/cert-app build

# Backend build (bundles to a single file with esbuild)
pnpm --filter @workspace/api-server build
```

### Option B: Render.com

**`render.yaml`** defines two services:
- Web Service (backend): runs `node dist/index.js`
- Static Site (frontend): builds and serves the React app

---

## 16. Running Locally

```bash
# Install all dependencies
pnpm install

# Start the backend (port 3000)
pnpm --filter @workspace/api-server run dev

# Start the frontend (port 5173)
pnpm --filter @workspace/cert-app run dev
```

The frontend Vite config proxies `/api` to `http://localhost:3000`, so you don't need CORS
configuration in dev.

**One-time setup for Google OAuth in dev:**
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI
4. Copy Client ID and Secret to `.env`
5. Enable: Drive API, Sheets API, Slides API, Gmail API

**Then in the app:**
1. Sign in with Google (Firebase Auth)
2. Go to Settings → Connect Google Account
3. Approve the permissions
4. Start using the app

---

## 17. How to Add New Features

### Add a new API endpoint

1. Create or open the appropriate file in `apps/api-server/src/routes/`
2. Add your route handler
3. Make sure the route file is imported in `apps/api-server/src/routes/index.ts`
4. Use `req.user.uid` to identify the logged-in user
5. Use `getAuthClientForUser(uid)` if you need to call Google APIs

Example:
```typescript
// In routes/myfeature.ts
import { Router } from "express";
import { getAuthClientForUser } from "../lib/googleAuth.js";

const router = Router();

router.get("/myfeature", async (req, res) => {
  const uid = req.user!.uid;
  const auth = await getAuthClientForUser(uid); // if Google API needed
  // ... your logic ...
  res.json({ result: "..." });
});

export default router;
```

### Add a new frontend page

1. Create a file in `apps/cert-app/src/pages/`
2. Add a route in `App.tsx`
3. Use `useAuth()` if you need the current user
4. Use generated hooks from `@workspace/api-client-react` for API calls

### Add a new Google Sheets column to certificates

The `columnMap` in a batch already maps any column to any placeholder. No code changes needed —
the admin configures this in the NewBatch wizard UI.

### Use a different WhatsApp template

1. Create and get approval for your template in Meta Business Manager
2. Change the `TEMPLATE_NAME` constant in `apps/api-server/src/lib/whatsapp.ts`
3. Update the `components` array in `sendWhatsAppDocument()` to match your template's structure

### Add a new delivery channel (e.g. Telegram)

1. Create `apps/api-server/src/lib/telegram.ts` with a `sendTelegramDocument()` function
2. Add a route in `routes/batches.ts`: `POST /batches/:batchId/send-telegram`
3. Add UI in `BatchDetail.tsx` for the send button
4. Add a hook in `packages/api-client-react/src/` if you want React Query integration

### Change the PDF storage structure in R2

The key structure is built in `lib/cloudflareR2.ts`:
```typescript
const key = `${safeFolderName}/${safeFileName}.pdf`
```
And the folder name comes from `batches.ts`:
```typescript
const r2Folder = phoneNumber || cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_");
```
Change these two spots to change how files are organized.

### Add a new Firestore collection

1. Add the collection reference to `packages/firebase/src/index.ts`
2. Add a TypeScript interface for the document shape
3. Import and use in your route handler

---

## Quick Reference: Key Files

| What you want to change | File to edit |
|---|---|
| Add/modify an API endpoint | `apps/api-server/src/routes/` |
| Change how certificates are generated | `apps/api-server/src/lib/googleDrive.ts` → `generateCertificate()` |
| Change email format | `apps/api-server/src/lib/gmail.ts` |
| Change WhatsApp message template | `apps/api-server/src/lib/whatsapp.ts` |
| Change R2 upload logic | `apps/api-server/src/lib/cloudflareR2.ts` |
| Add a new frontend page | `apps/cert-app/src/pages/` + route in `App.tsx` |
| Change navigation sidebar | `apps/cert-app/src/components/layout/AppSidebar.tsx` |
| Change app shell layout | `apps/cert-app/src/components/layout/Layout.tsx` |
| Change auth behavior | `apps/cert-app/src/hooks/use-auth.tsx` |
| Add a Firestore collection | `packages/firebase/src/index.ts` |
| Change how API calls are made | `packages/api-client-react/src/custom-fetch.ts` |
| Add env vars | `.env` at root + document in this file |

---

## 18. Cashfree Payment Gateway & Prepaid Wallet

The project uses **Cashfree** to implement a prepaid wallet architecture. This acts as a financial tollbooth, requiring users to top up their wallet and spend credits to generate certificates.

### Data Model Updates
- **`userProfiles` collection:** Tracks `currentBalance` for the user.
- **`ledgers` collection:** Records all financial transactions (`wallet_topup`, `batch_deduction`, `meta_refund`) for an immutable financial history.

### Wallet Workflow
1. **Top-Up:** A user clicks "Add Credits" and enters an amount.
2. **Order Creation:** The backend (`POST /api/payments/create-order`) registers the intent with Cashfree and returns a `payment_session_id`.
3. **Checkout:** The frontend utilizes the Cashfree JS SDK to show the payment modal using the session ID.
4. **Webhook Confirmation:** Cashfree asynchronously sends a webhook upon success (`POST /api/webhooks/cashfree`). The backend verifies the SHA-256 signature and securely credits the user's `currentBalance` in Firestore while logging a `wallet_topup` ledger entry.

### Upfront Batch Deductions
Before a batch can begin generation (`POST /api/batches/:batchId/generate`), the backend calculates the batch cost (`row_count * rate`). By using an atomic Firestore transaction (`runTransaction`), it checks if `currentBalance >= cost`. If valid, it deducts the amount, logs a `batch_deduction`, and begins generating the certificates. If invalid, it throws a `402 Payment Required` error, and the UI prompts the user to top up.
