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

## Phase 2: Backend - Credit Consumption Logic
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
- [~] Task: Conductor - User Manual Verification 'Backend - Credit Consumption Logic' (Protocol in workflow.md)

## Phase 3: Backend - API Updates
- [ ] Task: Update wallet API endpoints
    - [ ] Write tests for credits balance response
    - [ ] Modify GET /api/wallet to return credits instead of Rs.
    - [ ] Add credits cost breakdown to response
- [ ] Task: Update payment API endpoints
    - [ ] Write tests for minimum recharge validation
    - [ ] Modify POST /api/payments/create-order to validate MIN_RECHARGE_AMOUNT
    - [ ] Update POST /api/payments/verify to calculate credits
- [ ] Task: Update batch generation API
    - [ ] Write tests for credit check before generation
    - [ ] Modify POST /batches/:batchId/client-generate to check credits
    - [ ] Return detailed credit cost breakdown in response
- [ ] Task: Conductor - User Manual Verification 'Backend - API Updates' (Protocol in workflow.md)

## Phase 4: Frontend - Wallet UI Updates
- [ ] Task: Update wallet page to display credits
    - [ ] Write tests for credits display
    - [ ] Modify Wallet.tsx to show credits balance
    - [ ] Add credits cost information display
- [ ] Task: Update top-up dialog
    - [ ] Write tests for minimum recharge validation
    - [ ] Add minimum recharge amount validation to top-up form
    - [ ] Display credit conversion rate
- [ ] Task: Update batch generation UI
    - [ ] Write tests for credit cost display
    - [ ] Show per-action credit costs in batch generation page
    - [ ] Add insufficient credits warning
- [ ] Task: Conductor - User Manual Verification 'Frontend - Wallet UI Updates' (Protocol in workflow.md)

## Phase 5: Integration Testing & Documentation
- [ ] Task: Write integration tests
    - [ ] Test complete recharge flow with credits
    - [ ] Test certificate generation with credit deduction
    - [ ] Test email/WhatsApp delivery with credit deduction
- [ ] Task: Update documentation
    - [ ] Document new credit system in README
    - [ ] Add env variable configuration guide
    - [ ] Update API documentation
- [ ] Task: Conductor - User Manual Verification 'Integration Testing & Documentation' (Protocol in workflow.md)