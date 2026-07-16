# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Conductor Docs**: Synced `conductor/product.md`, `conductor/product-guidelines.md`, and `conductor/tech-stack.md` with `docs/PROJECT_DOCS.md` — fixed stale references (Firebase→Supabase, Firestore→D1), corrected credit costs, added missing integrations (Zeptomail, Telegram Bot, Vitest), and removed non-existent `@workspace/supabase` package.

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
