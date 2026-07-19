# Cephlow Certificate Generation Platform

A powerful, automated platform for organizations to generate, manage, and deliver personalized certificates at scale. 

The platform integrates a built-in spreadsheet editor for participant data and an HTML canvas template designer for certificate templates. It handles the full lifecycle: generating personalized PDFs client-side using PDF-Lib, uploading them to Cloudflare R2, delivering them via Email or WhatsApp, and providing a public verification page via QR codes.

---

## 🌟 Key Features

- **Built-in Spreadsheet & Canvas Designer:** Create highly customizable templates and manage participant list tables natively in the application.
- **Smart Generation & Font Scaling:** Automatically replaces dynamic `{{placeholders}}` in templates and intelligently scales down font sizes to ensure long names always fit perfectly on a single line.
- **Multi-Channel Delivery:** Send generated certificates to participants via:
  - **Email:** Uses ZeptoMail API to send personalized emails with the certificate attached as a PDF.
  - **WhatsApp:** Uses the Meta Graph API to send the certificate document directly to the participant's WhatsApp.
- **Public Verification & QR Codes:** Dynamically injects a unique QR code onto every certificate that links to a public verification page.
- **Prepaid Wallet System:** Integrated with Cashfree Payment Gateway to manage generation quotas and prepaid wallet balances.
- **High-Performance Architecture:** Exports PDFs directly to Cloudflare R2 for lightning-fast, highly-available public access required by the WhatsApp API.
- **Interactive WhatsApp Bot & Telegram Bridge:** Recipients can message the WhatsApp number to retrieve their certificates. Conversations can be bridged to Telegram topics for support.

---

## 🏗️ Architecture & Tech Stack

This project is structured as a **pnpm monorepo** with shared workspaces.

### Frontend (`apps/cert-app`)
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **State & Data Fetching:** TanStack React Query (with auto-generated API hooks via Orval)
- **Routing:** React Router v6

### Backend (`apps/api-worker`)
- **Framework:** Hono (TypeScript)
- **Runtime:** Cloudflare Workers (Edge Functions)
- **Database:** Cloudflare D1 (SQLite)
- **Storage:** Cloudflare R2 (S3-compatible object storage) for public PDFs

### Shared Packages (`packages/`)
- `@workspace/api-client-react`: Auto-generated API client and React Query hooks.
- `@workspace/api-zod`: Auto-generated Zod schemas and TypeScript types.

### Infrastructure & External Services
- **Database:** Cloudflare D1 (SQLite)
- **Authentication:** Supabase Auth (Identity) + Google OAuth 2.0 (Optional Permissions)
- **Storage:** Cloudflare R2 (Public Edge Storage) + Google Drive (Optional backup folder sharing)
- **Messaging:** ZeptoMail API + Meta WhatsApp Business API
- **Payments:** Cashfree API

---

## 📚 Documentation

The following guides are available in the [docs/](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/docs/) folder:
- **[System Architecture](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/docs/architecture.html)**: Interactive visual mapping of database, services, and communication flows.
- **[Full Project Docs](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/docs/PROJECT_DOCS.md)**: Deep dive into modules, folder layout, data structures, and auth/sending pipelines.
- **[Scaling & Edge Evolution](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/docs/SCALING.md)**: Performance milestones, edge migration history, cost breakdowns, and interview talking points.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- `pnpm` (installed via `npm install -g pnpm`)
- A Supabase Project (for Authentication)
- A Cloudflare Account (for Workers, D1 Database, and R2 Storage)
- Google Cloud Console Project (with Drive API enabled for optional folder sharing)
- ZeptoMail Account (for email sending)
- Meta Developer Account (for WhatsApp Cloud API)

### 1. Installation

```bash
git clone <repository-url>
cd cephlow2
pnpm install
```

### 2. Environment Variables

Create a single `.env` file in the **root** of the repository. See `docs/PROJECT_DOCS.md` for the complete list of required environment variables for Supabase, Google OAuth, Cloudflare R2, WhatsApp, and Cashfree.

### 3. Running Locally

You can run the frontend and API worker locally with the following commands:

**Start Frontend (`cert-app`):**
```bash
pnpm --filter @workspace/cert-app run dev
```

**Start Backend Worker (`api-worker`):**
```bash
pnpm --filter @workspace/api-worker run dev
```

- Frontend will be available at `http://localhost:5173`
- Backend API will run locally via wrangler on `http://localhost:8787`

### 4. Code Generation

If you modify the backend API routes or OpenAPI specification, update the Zod schemas and React Query hooks by running the generate command in `packages/api-spec` or through the workspace.

---

## 🔐 Security & Authentication

This platform uses a robust **Two-Layer Authentication System**:
1. **Supabase Auth:** Handles user identity ("Who are you?"). The frontend gets a Supabase JWT (RS256) and sends it as a Bearer token in the `Authorization` header of API requests.
2. **Google OAuth 2.0:** Handles API permissions ("Can we read your Sheets?"). The backend securely requests and stores refresh tokens in D1 to execute offline actions (like background certificate generation) on behalf of the user.

---

## 📝 License

MIT
