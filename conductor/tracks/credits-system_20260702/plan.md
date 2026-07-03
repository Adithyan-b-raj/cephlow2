# Implementation Plan: Credits System Instead of Direct Mapping

## Phase 1: Backend - Credits Configuration & Schema [checkpoint: bd07461]
- [x] Task: Create credits configuration module (34e7088)
    - [x] Write tests for credits configuration loading
    - [x] Implement credits config module that reads env variables (CREDITS_PER_RUPEE, CREDIT_COST_GENERATION, CREDIT_COST_EMAIL, CREDIT_COST_WHATSAPP, MIN_RECHARGE_AMOUNT)
    - [x] Add validation for required env variables
- [x] Task: Update database schema for credits (b51112a)
    - [x] Write tests for credits schema validation
    - [x] Add credits_cost columns to workspaces table (generation_cost, email_cost, whatsapp_cost)
    - [x] Update ledgers table to include action_type field (generation, email, whatsapp)
- [x] Task: Conductor - User Manual Verification 'Backend - Credits Configuration & Schema' (Protocol in workflow.md) (bd07461)

## Phase 2: Backend - Credit Consumption Logic [checkpoint: af73f3c]
- [x] Task: Create credit calculation service (6014f9e)
    - [x] Write tests for credit calculation (amount * credits_per_rupee)
    - [x] Implement credit calculation service with env-based config
- [x] Task: Update wallet deduction logic (44a799f)
    - [x] Write tests for per-action credit deduction
    - [x] Modify start_batch_generation RPC to deduct configurable generation cost
    - [x] Create deduct_delivery_credits function for email/WhatsApp
- [x] Task: Update payment order processing (393f494)
    - [x] Write tests for credit conversion during top-up
    - [x] Modify process_payment to calculate credits using CREDITS_PER_RUPEE
    - [x] Enforce MIN_RECHARGE_AMOUNT validation
- [x] Task: Conductor - User Manual Verification 'Backend - Credit Consumption Logic' (Protocol in workflow.md) (af73f3c)

## Phase 3: Backend - API Updates [checkpoint: 66c58bf]
- [x] Task: Update wallet API endpoints (f96f356)
    - [x] Write tests for credits balance response
    - [x] Modify GET /api/wallet to return credits instead of Rs.
    - [x] Add credits cost breakdown to response
- [x] Task: Update payment API endpoints (60b9c62)
    - [x] Write tests for minimum recharge validation
    - [x] Modify POST /api/payments/create-order to validate MIN_RECHARGE_AMOUNT
    - [x] Update POST /api/payments/verify to calculate credits
- [x] Task: Update batch generation API (a039ac6)
    - [x] Write tests for credit check before generation
    - [x] Modify POST /batches/:batchId/client-generate to check credits
    - [x] Return detailed credit cost breakdown in response
- [x] Task: Conductor - User Manual Verification 'Backend - API Updates' (Protocol in workflow.md) (66c58bf)

## Phase 4: Frontend - Wallet UI Updates [checkpoint: 92e3cd3]
- [x] Task: Update wallet page to display credits (4c32f8a)
    - [x] Write tests for credits display
    - [x] Modify Wallet.tsx to show credits balance
    - [x] Add credits cost information display
- [x] Task: Update top-up dialog (37ae3d9)
    - [x] Write tests for minimum recharge validation
    - [x] Add minimum recharge amount validation to top-up form
    - [x] Display credit conversion rate
- [x] Task: Update batch generation UI (469b479)
    - [x] Write tests for credit cost display
    - [x] Show per-action credit costs in batch generation page
    - [x] Add insufficient credits warning
- [x] Task: Conductor - User Manual Verification 'Frontend - Wallet UI Updates' (Protocol in workflow.md) (92e3cd3)

## Phase 5: Integration Testing & Documentation
- [x] Task: Write integration tests (6497159)
    - [x] Test complete recharge flow with credits
    - [x] Test certificate generation with credit deduction
    - [x] Test email/WhatsApp delivery with credit deduction
- [x] Task: Update documentation (6a3be45)
    - [x] Document new credit system in README
    - [x] Add env variable configuration guide
    - [x] Update API documentation
- [~] Task: Conductor - User Manual Verification 'Integration Testing & Documentation' (Protocol in workflow.md)