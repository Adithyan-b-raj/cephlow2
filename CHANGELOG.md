# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **Google OAuth redirect_uri**: Added missing `GOOGLE_REDIRECT_URI` to production and staging `wrangler.toml` vars — was causing "Error 400: invalid_request — Missing required parameter: redirect_uri" on reconnect. Added early validation in `generateAuthUrl()`.
- **Content-Security-Policy**: Whitelisted `https://fonts.googleapis.com` (styles), `https://fonts.gstatic.com` (fonts), and `https://static.cloudflareinsights.com` (scripts) in both frontend `_headers` and API worker `secureHeaders` middleware to prevent browser blocking.


### Added
- **Google Drive Batch Folders**: Added client-side Google Drive folder creation during generation for free-tier users, and on-demand folder creation and public sharing under `POST /batches/:batchId/share-folder`.
- **Automatic Certs Movement**: Configured `/share-folder` to automatically move existing cert PDFs from the user's Drive root into the new folder in the background.
- **Legal & Copy Updates**: Updated Landing Page, Terms of Service, and Privacy Policy pages to align with Google Sheets/Slides integrations removal and the updated `drive.file` OAuth scope constraint.

### Removed
- **Obsolete Code Cleanup**: Removed legacy `deleteFile` helper and `POST /batches/:batchId/client-cleanup` endpoint since slides generation was removed.

### Added (Legacy)
- **Frontend Dependencies**: Added `xlsx` (SheetJS) and `pdfjs-dist` (PDF.js) dependencies in `apps/cert-app/package.json` for client-side local spreadsheet imports and PDF template backgrounds.
- **Workflow Persistence**: The Advanced Workflow Builder now saves the full React Flow graph (nodes + edges) as `workflow_json` on the batch when launched. Batches with a saved workflow display an **Edit Workflow** button in the batch header that reopens `/advanced?batchId=<id>` and restores the exact graph. This persists server-side across devices and sessions.

- **Gating of Email and WhatsApp Delivery**: Restricted the backend email sending route (`POST /batches/:batchId/certificates/:certId/send`) to approved/paid organizations using `requireApproval` middleware, and registered `"email_delivery"` as a first-class feature key.
- **Unified Delivery Visual Hierarchy**: Realigned the desktop and mobile action header buttons. For unapproved (free) tier workspaces, the primary delivery option is now the free **Share PDFs** action, with locked **Send Emails** and **WhatsApp** options moved to the secondary dropdown/menu. For approved (paid) tier workspaces, the primary delivery option is **WhatsApp**, with **Send Emails** and **Share PDFs** moved to the secondary dropdown/menu.
- **Inline Action Visibility**: Hidden the inline recipient **Email** action button in the certificates table (`BatchCertificatesTable.tsx`) completely for free tier users, while keeping it visible for approved workspaces.
- **Gated Wallet Balance Fetching**: Configured `BatchDetail.tsx` to conditionally enable the `useGetWalletBalance` React Query hook only for approved (paid tier) workspaces. This prevents redundant `403 Forbidden` API requests and console errors when unapproved (free tier) users load a batch detail page.
- **Visual Hierarchy & Header Decluttering**: Redesigned the Batch Detail page's action buttons to improve visual hierarchy and usability. Set the primary action, **Generate All**, as the only solid filled button. Repositioned and demoted delivery buttons (**Send Emails** and **WhatsApp**) to outlined styles, and styled the WhatsApp icon with its brand-specific green color (`#25D366`).
- **More Action Dropdown**: Consolidated secondary actions (**Edit Sheet**, **Edit Workflow**, **Share PDFs**, **Share Page**, and **Add/Edit Banner**) into a unified **More** dropdown menu (`DropdownMenu`) to declutter the batch header interface.
- **Google OAuth Scope Streamlining**: Updated the Google authentication helper (`google-auth.ts`) to request only the minimal `drive.file` scope, completely removing `sheets` and `slides` permissions from Google OAuth scopes. Added a route bypass check in the authentication middleware (`auth.ts`) for `/api/auth/google/callback` to ensure direct browser redirects from Google OAuth flow succeed without verification tokens.
- **Contact Emails**: Updated default fallback support and approval contact emails across the Privacy Policy, Terms & Conditions, Locked Feature wrapper, App Sidebar, and Landing pages to transition from `cephlow.online` / `approvals@cephlow.online` to `cephlow.in` / `contact@cephlow.in` / `approvals@cephlow.in`.
- **Deployment Workflow**: Split the Cloudflare wrangler deployment step in the GitHub Actions workflow ([deploy.yml](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/.github/workflows/deploy.yml)) into separate conditional steps for production (on `main` branch) and staging (on `staging` branch) to prevent invalid empty environment flags.
- **Batch Creator & Sync**: Updated the batch endpoints in `apps/api-worker/src/routes/batches.ts` to remove Google Sheets validation fields and enforce inbuilt spreadsheets as the sole data source kind.
- **Client Generation Engine**: Updated `apps/api-worker/src/routes/clientGenerate.ts` to default campaign template kind to `"builtin"`.
- **Campaign Creation Wizard**: Simplified the campaign wizard pages (`StepDataSource.tsx`, `StepTemplate.tsx`, `NewBatch.tsx`) to remove Sheets/Slides options, forcing all campaigns to use built-in spreadsheets and built-in templates.
- **Google OAuth & Settings**: Streamlined `use-auth.tsx` to remove slides/sheets permissions status, and updated `Settings.tsx` to hide Sheets and Slides account connection options.
- **Spreadsheets List Page**: Removed the "Import from Google Sheets" options in `SpreadsheetsList.tsx`.
- **Built-in Editor File Uploads**: Integrated background image and PDF upload capabilities directly in `PropertiesPanel.tsx` using `uploadAssetToR2` client-side API.
- **Client-Side PDF Background Conversion**: Integrated dynamic import of `pdfjs-dist` to render the first page of PDF template uploads to a high-resolution canvas client-side, converting it to a PNG file before uploading to Cloudflare R2 storage.
- **Generation Engine Simplification**: Rewrote `clientGenerate.ts` to remove Google Slides batch PDF generation, alt-text placeholders, and PDF splitting, while retaining the client-side built-in template renderer and free-tier Google Drive upload pathways.
- **Spreadsheet Editor Importer**: Extended the built-in sheet editor (`SpreadsheetEditorUI.tsx`) to support importing `.csv`, `.tsv`, `.xlsx`, `.xls`, and `.ods` local spreadsheet files using SheetJS (`xlsx`).
- **Save as Copy in Template Editor**: Added a "Save as Copy" button and callback handler in the built-in template editor (`BuiltinTemplateEditor.tsx`, `TemplateEditor.tsx`, and `EditorToolbar.tsx`) to allow cloning an existing template and saving changes under a new name without overriding the original template.
- **Locked QR Aspect Ratio**: Configured the built-in template editor (`EditorCanvas.tsx` and `PropertiesPanel.tsx`) to lock the aspect ratio of QR elements to 1:1, preventing distortion during canvas transforming or manual size property updates.

### Removed
- **Legacy Slides PDF Export**: Removed the obsolete `exportSlidesToPdf` fallback chain and helper function from the backend, as all new certificate batches generate PDFs from built-in templates.
- **Google Sheets & Slides Routes**: Deleted backend API routes `sheets.ts` and `slides.ts`, unregistering them from the Hono API worker entrypoint in `apps/api-worker/src/index.ts`.
- **Slide Thumbnail Proxy**: Removed the `/api/slides/thumbnail/:fileId` proxy endpoint from the backend worker.
- **Legacy Template Wizard**: Deleted `NewTemplate.tsx` (the slide-based wizard) and redirected `/templates/new` to the builtin template editor page in `App.tsx`.
- **Google Slides templates button**: Removed the "From Google Slides" legacy template creation button in `BuiltinTemplatesList.tsx`.
- **Unused Hooks**: Removed unused frontend hooks `use-google-picker.ts` and `use-import-google-sheet.ts`.


## [2.2.0] - 2026-07-18

### Added
- **Staging Environment**: Setup and configured a complete staging environment with a preview frontend on Cloudflare Pages (associated with the `staging` branch at `test.cephlow.in` and `staging.cephlow2.pages.dev`) and a dedicated staging API worker (`cephlow-api-staging` at `api-test.cephlow.in`), sharing the production D1 database.
- **Conditional BETA Badge**: Implemented a dynamic, hostname-based `BETA` badge next to the Cephlow logo across the dashboard sidebar, landing nav, and auth pages. It automatically renders on test domains (`test.cephlow.in`, `pages.dev`, `localhost`) and resolves to hidden on production domains (`cephlow.in`, `cephlow.online`) without requiring code changes when merging branches.

### Changed
- **Staging Content-Security-Policy**: Updated `apps/cert-app/public/_headers` to whitelist the staging API endpoint `https://api-test.cephlow.in` in the `connect-src` CSP directive, resolving connection blocks on the staging environment.

## [2.1.0] - 2026-07-17

### Added
- **Manual Test Checklist**: Created a comprehensive manual verification checklist for end-user features covering authentication, workspaces, templates, spreadsheets, batches, payments, email/WhatsApp delivery, and the support bridge ([manual_test_checklist.md](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/docs/manual_test_checklist.md)).
- **Security Report**: Created a comprehensive security audit report detailing user data protection, token safety, webhook signatures, and threat mitigations at the repository root ([security_report.md](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/security_report.md)).
- **Security Hardening**: Enforced JWT algorithm, issuer, and audience checks in authentication middleware (H-1, C-4).
- **IDOR Protection**: Added order ownership validation in the payment verification endpoint (H-5).
- **Google OAuth Protection**: Encrypted Google OAuth refresh tokens at rest in D1 database using AES-GCM (H-2).
- **Testing & Coverage**: Added unit tests for authorization middleware, payments, and google-auth, achieving >90% overall statement coverage.
- **Input Sanitization & Validation**: Added Zod schema validation to draft batch creation, rejecting XSS/malicious payloads in batch names, and alphanumeric check for Google Sheet IDs.
- **Phone Normalization**: Normalized recipient phone numbers to E.164 format and validated lengths (10-15 digits) before saving.
- **Presigned URL Scoping**: Isolated direct PDF upload paths by prefixing them with `{workspace_id}/{batch_id}/` (H-3).
- **Rate Limiting**: Implemented a KV-backed sliding window rate limiter middleware with resilient memory fallback, applying specific limits on auth, payments, and batch creation.
- **Atomic Credit Deductions**: Converted all credit deduction logic (batches, email delivery, WhatsApp delivery, and workspace transfers) to use single atomic SQLite/D1 queries with `RETURNING current_balance` to prevent concurrent double-spend race conditions (C-2).
- **Regeneration Cost Control**: Implemented 20% visual regeneration charge rate for already paid certificates requiring rebuild.
- **Webhook Signature Enforcement**: Added timing-safe validation on Cashfree webhooks (H-4) and HMAC-SHA256 signature verification on WhatsApp status webhooks using `X-Hub-Signature-256` (C-1).
- **Webhook Idempotency**: Added atomic status transitions (`UPDATE payment_orders SET processed = 1 WHERE order_id = ? AND processed = 0`) to prevent concurrent top-up race conditions (C-3).
- **Security Headers Middleware**: Registered Hono's `secureHeaders` middleware globally on all routes to return security headers (HSTS, Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff) (M-2, M-3, M-4).
- **CORS Hardening**: Hardened CORS origin checks to restrict access to explicitly configured and trusted domains, avoiding wild origin reflection vulnerabilities (M-2).
- **Cloudflare Pages Headers**: Configured custom `_headers` configuration on Cloudflare Pages static site bundle to return robust security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) for served assets.

### Changed
- **Error Standardisation**: Standardised error responses in the auth middleware to prevent token detail leakage (M-5). All JWT rejection paths now return a uniform `"Invalid or expired token"` message.
- **Query Fallback Removal**: Disabled unsafe fallback to query-string auth tokens (M-1).
- **Conductor Docs**: Synced `conductor/product.md`, `conductor/product-guidelines.md`, and `conductor/tech-stack.md` with `docs/PROJECT_DOCS.md` — fixed stale references (Firebase→Supabase, Firestore→D1), corrected credit costs, added missing integrations (Zeptomail, Telegram Bot, Vitest), and removed non-existent `@workspace/supabase` package.

### Dependencies
- Upgraded `wrangler` from `4.107.0` to `4.112.0` in `apps/api-worker` to resolve Windows workerd binary crash.

## [2.0.3] - 2026-07-12

### Added
- **Testing Suite**: Integrated Vitest across the monorepo workspace for automated testing.
- **Testing Guidelines**: Appended strict automated test requirements for developers and AI agents to `CLAUDE.md` and `.agents/AGENTS.md`.
- **Code Coverage**: Configured `@vitest/coverage-v8` in `cert-app` and `api-worker` with an 80% coverage threshold.
- **Git Hook**: Configured a local `.git/hooks/pre-commit` script to block commits if the test suite fails.
- **CI/CD Integration**: Added GitHub Actions workflow (`.github/workflows/test.yml`) to automatically validate tests and coverage on every push/PR.
- **Tests & Fixes**: Added test cases for `cn` class merger and edge cases in `emailToSlug` (with minor refactor from `??` to `||` to cover the fallback branch).
- **Documentation**: Updated `docs/PROJECT_DOCS.md` and `docs/architecture.html` to document testing suite integration, execution pipelines, and coverage requirements.


## [2.0.2] - 2026-07-08

### Added
- **`apps/api-worker`**: Added batch synchronization endpoint (`POST /batches/:batchId/sync`) supporting both Google Sheets and built-in spreadsheets, and conversion endpoint (`POST /batches/:batchId/convert-to-inbuilt`) to migrate Google Sheet batches to built-in spreadsheets.
- **`apps/cert-app` & `apps/api-worker`**: Added automatic deletion of old generated certificate PDFs on Google Drive during regeneration on the free tier. This is achieved by returning the database `pdf_file_id` to the client and executing a `DELETE` call using the Google Drive API before uploading the newly rendered PDF.

### Changed
- **`apps/cert-app`**: Updated the "Edit Sheet" button in `BatchHeader.tsx` to automatically convert Google Sheet batches to built-in sheets on-the-fly and redirect to the built-in sheet editor (`/spreadsheets/:spreadsheetId`).
- **`apps/cert-app` & `apps/api-worker`**: Added a `returnTo` query parameter to the spreadsheet editor. When coming from a batch page, saving/exiting the built-in sheet editor now correctly redirects back to the batch detail page instead of defaulting to the general `/spreadsheets` dashboard list. Also fixed batch payload responses to return `spreadsheet_id` and `data_source_kind`.
- **`apps/cert-app`**: Fixed estimated generation cost rate to evaluate to 0 for unapproved/free tier users, and hid the estimated cost banner entirely for the free tier.

### Removed
- **`apps/cert-app`**: Removed the Generation Limit card from the Wallet page, and corresponding limit displays in the batch detail header.
- **`apps/cert-app` & `apps/api-worker`**: Removed certificate regeneration cost calculations, UI displays, and transaction balance deductions, making certificate regeneration free for all users.

## [2.0.1] - 2026-07-07

### Removed
- **`apps/api-server`**: Legacy Express.js backend using Supabase database has been removed.
- **`packages/supabase`**: Legacy database client configuration, Drizzle/Supabase models, and custom DB wrappers have been removed. Supabase is now used exclusively on the client-side for User Authentication.
- **`packages/firebase`**: Legacy Firestore database configuration and references have been removed.
- **Root dependencies**: Removed unused root dependencies `firebase-admin` and `@supabase/supabase-js`.

### Added
- **Local D1 Database Execution**: Added a `"db:init"` script to `apps/api-worker/package.json` to easily execute the database `schema.sql` file locally via Wrangler against the local emulated Cloudflare D1 instance.
- **Git Security**: Added `.dev.vars` to the root `.gitignore` file to ensure local secrets are not tracked by version control.
- **Google Authentication (Sign-In)**: Added a "Continue with Google" OAuth button to the authentication screen (`apps/cert-app/src/pages/Login.tsx`) and integrated `loginWithGoogle` helper flow in `useAuth` using client-side Supabase authentication.

### Changed
- **Security Fix**: Patched a critical payment vulnerability in `/api/payments/verify` that incorrectly credited workspaces for `ACTIVE` (unpaid) Cashfree orders.
- **Workspace Dev Configuration**: Updated the root `package.json` `"dev"` script to concurrently spin up both the Hono API Worker backend (`@workspace/api-worker`) and the React frontend (`@workspace/cert-app`) in parallel. Also added a `"dev:remote"` configuration to allow safe concurrent startup with the live remote Cloudflare database, and a `"dev:frontend"` script to run only the frontend.
- **TypeScript Project References**: Cleaned up the root `tsconfig.json` to remove legacy compiler references pointing to the deleted `firebase` and `supabase` packages.
- **D1 Schema Synchronization**: Corrected `apps/api-worker/schema.sql` to include missing schema migrations (`workspace_features`, `platform_admins`, `admin_audit_log` tables, and workspace `suspended` / `suspended_reason` columns).
- **pnpm workspaces (v10+ compatibility)**: Allowed native build scripts for `workerd` and `sharp` under `onlyBuiltDependencies` in `pnpm-workspace.yaml` to ensure wrangler links correctly.
- **Documentation Sync**: Updated `docs/PROJECT_DOCS.md` to remove legacy packages and added guide references for running local dev Modes (A, B, and C).
