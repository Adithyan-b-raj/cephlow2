# Specification: Remove Creator Credits and Make Marketplace Frames Free

## Overview
This track aims to simplify the frame marketplace system of Cephlow by completely removing "Creator Credits", redemption vouchers, and paid custom templates. In this new model, all custom frames published to the marketplace will be shared free of charge. Users will still be able to create, publish, browse, and acquire custom frames, but there will be no wallet debit, credit earnings, or admin voucher redemptions.

## Proposed Changes

### Database Migrations
- Drop the `redemption_requests` table.
- Remove columns `creator_credits` and `creator_name` from the `user_profiles` table.

### Backend Router (`apps/api-worker`)
- **Delete Route File:** [creatorCredits.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/creatorCredits.ts) (handles `/api/creator/*` and `/api/admin/redemptions`).
- **Update Router Entry ([index.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/index.ts)):** Remove the `/api/creator` router registration.
- **Update Marketplace Routes ([frameMarketplace.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/frameMarketplace.ts)):**
  - **Publishing:** Set the frame price permanently to `0` and remove `price` from the publish request schema/validation.
  - **Purchasing:** Simplify the purchase/acquisition flow: remove workspace balance checks, debits, ledger deduction logging, and creator credit incrementing. The purchase is now a simple "Get Free" action that records the ownership relationship in `frame_purchases` with `amount_paid = 0`.

### Frontend Application (`apps/cert-app`)
- **Frame Inventory ([FrameInventory.tsx](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/cert-app/src/pages/FrameInventory.tsx)):**
  - Remove the **Credits** tab entirely.
  - Remove the Creator Name configuration input and all associated states/actions.
  - Remove references to `totalEarned` or listing prices in "My Listings" and "Browse" pages.
  - Update the "Browse" tab so that all frames are listed as "FREE" with a single "Get Free" action.
- **Publish Dialog ([PublishFrameDialog.tsx](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/cert-app/src/pages/batches/components/PublishFrameDialog.tsx)):**
  - Remove the price input field. All published frames default to free.
- **Wallet Page ([Wallet.tsx](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/cert-app/src/pages/Wallet.tsx)):**
  - Remove the "Creator Credits" banner/card at the bottom of the prepaid wallet screen.

## Acceptance Criteria
- No "Credits" tab or creator profile naming exists in the Frame Inventory.
- No "Creator Credits" card or link exists in the Prepaid Wallet page.
- Frames can be published to the marketplace without setting a price, and they default to free.
- Acquiring a frame from the marketplace succeeds instantly for any user/workspace without verifying or debiting workspace credits, and records the purchase with a price of `0`.
- All backend routes under `/api/creator/*` and `/api/admin/redemptions` return 404 (removed).
- The `redemption_requests` table is deleted, and `user_profiles` no longer has creator credit columns.

## Out of Scope
- Modifying workspace prepaid credit transactions or standard wallet payment gateway (`/api/payments/*` and Cashfree integration).
- Restructuring the core custom frame rendering or template editing systems.
