# Technology Stack: Cephlow

## 1. Frontend
*   **Framework:** React 19 + Vite (TypeScript)
*   **Styling & UI:** Tailwind CSS v4 + shadcn/ui
*   **State & Querying:** TanStack React Query + auto-generated API hooks (via Orval)
*   **Routing:** React Router v6

## 2. Backend
*   **Framework:** Hono (TypeScript)
*   **Runtime:** Cloudflare Workers

## 3. Database & Storage
*   **Primary Database:** Cloudflare D1 (SQLite) for relation records (workspaces, members, batches, certificates, ledgers, profiles).
*   **Public Storage:** Cloudflare R2 (S3-compatible object storage) for fast, public PDF delivery.
*   **Google Workspace Drive:** For storing and managing Google Slides/Sheets files.

## 4. Authentication
*   **Identity Provider:** Supabase Auth (JWT bearer token validation in Hono middleware).
*   **API Auth:** Google OAuth 2.0 (offline refresh tokens stored in D1 to call Google APIs).

## 5. Integrations & Pipelines
*   **Google APIs:** Google Drive, Google Sheets, Google Slides, Gmail API
*   **Email:** Zeptomail (transactional email fallback alongside Gmail API)
*   **WhatsApp API:** Meta WhatsApp Business Cloud API
*   **Telegram Bot:** WhatsApp↔Telegram support bridge via Telegram Bot webhooks
*   **Payments:** Cashfree API (prepaid wallets & order checkout)

## 6. Testing
*   **Framework:** Vitest (80% coverage threshold for statements, branches, functions, and lines)
*   **Strategy:** Mock-first for external integrations; Hono `.request()` for route testing

## 7. Project & Package Management
*   **Monorepo:** pnpm workspaces
*   **Local Packages:** `@workspace/api-client-react`, `@workspace/api-zod`, `@workspace/api-spec`
