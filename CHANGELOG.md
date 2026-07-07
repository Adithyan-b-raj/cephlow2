# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - 2026-07-07

### Removed
- **`apps/api-server`**: Legacy Express.js backend using Supabase database has been removed.
- **`packages/supabase`**: Legacy database client configuration, Drizzle/Supabase models, and custom DB wrappers have been removed. Supabase is now used exclusively on the client-side for User Authentication.
- **`packages/firebase`**: Legacy Firestore database configuration and references have been removed.
- **Root dependencies**: Removed unused root dependencies `firebase-admin` and `@supabase/supabase-js`.

### Added
- **Local D1 Database Execution**: Added a `"db:init"` script to `apps/api-worker/package.json` to easily execute the database `schema.sql` file locally via Wrangler against the local emulated Cloudflare D1 instance.
- **Git Security**: Added `.dev.vars` to the root `.gitignore` file to ensure local secrets are not tracked by version control.

### Changed
- **Security Fix**: Patched a critical payment vulnerability in `/api/payments/verify` that incorrectly credited workspaces for `ACTIVE` (unpaid) Cashfree orders.
- **Workspace Dev Configuration**: Updated the root `package.json` `"dev"` script to concurrently spin up both the Hono API Worker backend (`@workspace/api-worker`) and the React frontend (`@workspace/cert-app`) in parallel. Also added a `"dev:remote"` configuration to allow safe concurrent startup with the live remote Cloudflare database, and a `"dev:frontend"` script to run only the frontend.
- **TypeScript Project References**: Cleaned up the root `tsconfig.json` to remove legacy compiler references pointing to the deleted `firebase` and `supabase` packages.
- **D1 Schema Synchronization**: Corrected `apps/api-worker/schema.sql` to include missing schema migrations (`workspace_features`, `platform_admins`, `admin_audit_log` tables, and workspace `suspended` / `suspended_reason` columns).
- **pnpm workspaces (v10+ compatibility)**: Allowed native build scripts for `workerd` and `sharp` under `onlyBuiltDependencies` in `pnpm-workspace.yaml` to ensure wrangler links correctly.
- **Documentation Sync**: Updated `docs/PROJECT_DOCS.md` to remove legacy packages and added guide references for running local dev Modes (A, B, and C).
