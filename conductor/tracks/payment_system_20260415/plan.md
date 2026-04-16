# Implementation Plan: Implement Prepaid Wallet System

## Phase 1: Gateway Setup & Core Backend
Goal: Configure Cashfree sandbox environments and build the backend endpoint to generate secure payment sessions.

- [x] Task: Cashfree Infrastructure Setup
    - [x] Register a Cashfree Merchant account, apply for KYC using the MSME Udyam certificate, and switch to the Sandbox environment.
    - [x] Generate Sandbox API Keys and add `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` to the `.env` file.
    - [x] Update the project's Tech Stack documentation to reflect Cashfree and the Prepaid Wallet model.
- [ ] Task: Implement Order Creation Endpoint
    - [ ] Install `cashfree-pg-sdk-nodejs`.
    - [ ] Write Zod schemas to validate the wallet top-up request payload (e.g., amount, userId).
    - [ ] Implement `POST /api/payments/create-order` to interface with Cashfree and return a `payment_session_id`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Gateway Setup & Core Backend'

## Phase 2: Frontend Wallet UI & Checkout
Goal: Build the user interface for tracking balances and executing the Cashfree checkout flow.

- [x] Task: Build the Wallet Dashboard
    - [x] Create a `WalletOverview` component that fetches and displays the `currentBalance` from the `userProfiles` collection.
    - [x] Create a `LedgerTable` component to display the financial history from the `ledgers` collection.
- [x] Task: Integrate Cashfree JS SDK
    - [x] Install `@cashfreepayments/cashfree-js`.
    - [x] Build a `TopUpModal` component allowing users to select or input a credit amount.
    - [x] Implement the Cashfree checkout trigger using the `payment_session_id` retrieved from the Phase 1 backend endpoint.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Frontend Wallet UI & Checkout'

## Phase 3: The Top-Up Webhook & Ledger Architecture
Goal: Safely catch successful payments asynchronously and update the user's balance in Firestore.

- [ ] Task: Implement Cashfree Webhook Handler
    - [ ] Create a `POST /api/webhooks/cashfree` route.
    - [ ] Implement standard SHA-256 signature verification to ensure the webhook legitimately originated from Cashfree.
    - [ ] Write the atomic Firestore `runTransaction` to handle the `SUCCESS` payload.
    - [ ] Database Logic: Increment the balance in `userProfiles` AND insert a corresponding document into `ledgers` (type: `wallet_topup`).
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Top-Up Webhook & Ledger Architecture'

## Phase 4: Upfront Billing & Generation Gating
Goal: Act as the financial tollbooth, charging the user for the entire batch before the server begins generating certificates.

- [ ] Task: Implement Upfront Deduction Logic
    - [ ] Update the existing `POST /api/batches/:batchId/generate` endpoint.
    - [ ] Logic: Calculate the total batch cost (`row_count * rate`).
    - [ ] Logic: Execute a `runTransaction` to check if `currentBalance >= cost`.
    - [ ] Execution: If valid, deduct the balance, write to `ledgers` (type: `batch_deduction`), and initiate generation. If invalid, throw an HTTP 402 Payment Required error.
- [ ] Task: Frontend Generation Gating
    - [ ] Update the `NewBatch` wizard to display the calculated upfront cost to the user before they confirm.
    - [ ] Implement a blocking "Insufficient Funds" UI state that disables the generate button and prompts the `TopUpModal` if the balance is too low.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Upfront Billing & Generation Gating'

## Phase 5: Automated Refund Pipeline (Deferred / Later Add-on)
Goal: Catch failed WhatsApp deliveries via Meta webhooks and safely credit the exact amount back to the user's wallet. (Note: To be executed only after Phases 1-4 are stable in production).

- [ ] Task: Upgrade Message Tracking for Idempotency
    - [ ] Ensure the `dispatches` (or `certificates`) tracking table includes `meta_message_id` and a `refundStatus` flag (default: `'none'`).
- [ ] Task: Implement Meta Webhook Receiver & Ledger Credit
    - [ ] Create `POST /api/webhooks/meta-status` to listen for delivery failures.
    - [ ] Write an idempotent Firestore `runTransaction` that checks if `refundStatus === 'refunded'` before incrementing the `userProfiles` balance and writing to `ledgers` (type: `meta_refund`).
