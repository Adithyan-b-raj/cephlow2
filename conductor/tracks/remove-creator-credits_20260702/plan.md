# Implementation Plan: Remove Creator Credits and Make Marketplace Frames Free

## Phase 1: Database Migrations [checkpoint: 6553c68]
- [x] Task: Create D1 migration script to drop the `redemption_requests` table and clean up `user_profiles` schema 44165f0
    - [x] Create a migration SQL file in `migrations/` to drop `redemption_requests`
    - [x] Add SQL in migration to remove/ignore `creator_credits` and `creator_name` from `user_profiles`
    - [x] Apply the migration to D1 locally using `pnpm --filter @workspace/api-worker wrangler d1 migrations apply`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database Migrations' (Protocol in workflow.md)

## Phase 2: Backend Router Updates
- [x] Task: Remove creator credits router and registration e310179
    - [x] Delete `apps/api-worker/src/routes/creatorCredits.ts`
    - [x] Modify `apps/api-worker/src/index.ts` to remove import and `route("/api", creatorCreditsRouter)` registration
- [~] Task: Update marketplace acquisition flow to make frames free
    - [ ] Modify `apps/api-worker/src/routes/frameMarketplace.ts` to set price permanently to 0 and remove balance checks/debits
    - [ ] Run backend typecheck (`pnpm --filter @workspace/api-worker run typecheck`) to verify there are no compilation errors
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Backend Router Updates' (Protocol in workflow.md)

## Phase 3: Frontend UI Updates
- [ ] Task: Clean up Frame Inventory page UI
    - [ ] Modify `apps/cert-app/src/pages/FrameInventory.tsx` to remove the Credits tab and its state variables
    - [ ] Remove creator name configuration and stats references
    - [ ] Update Browse tab listings to only show "FREE" and simplify acquisition action
- [ ] Task: Clean up Publish Dialog and Wallet page
    - [ ] Remove price input in `apps/cert-app/src/pages/batches/components/PublishFrameDialog.tsx`
    - [ ] Remove the creator credits banner from `apps/cert-app/src/pages/Wallet.tsx`
    - [ ] Run global typecheck (`pnpm run typecheck`) to ensure frontend and backend build cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Frontend UI Updates' (Protocol in workflow.md)
