# Implementation Plan: Implement Payment System

## Phase 1: Research and Infrastructure Setup
Goal: Select the payment provider, configure environment variables, and prepare the project for integration.

- [ ] Task: Select Payment Provider (Stripe) and Configure Environment Variables
    - [ ] Research and confirm Stripe as the primary provider.
    - [ ] Define and add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` to the `.env` file.
    - [ ] Update the Tech Stack document to include Stripe.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Research and Infrastructure Setup' (Protocol in workflow.md)

## Phase 2: Backend Integration
Goal: Implement the core payment logic and webhook handling on the server.

- [ ] Task: Define Payment Data Model and API Schemas
    - [ ] Write Zod schemas for payment intent requests and responses in `@workspace/api-zod`.
    - [ ] Update the `Batch` interface in `@workspace/firebase` to include payment status fields.
- [ ] Task: Implement Payment Intent Endpoint
    - [ ] Write unit tests for the `/api/payments/create-intent` endpoint.
    - [ ] Implement the endpoint in `api-server` using the Stripe SDK.
    - [ ] Verify that the endpoint returns a valid client secret.
- [ ] Task: Implement Stripe Webhook Handler
    - [ ] Write unit tests for the Stripe webhook handler.
    - [ ] Implement a webhook route to listen for `payment_intent.succeeded` and `payment_intent.payment_failed` events.
    - [ ] Update the Firestore `batches` status based on the webhook events.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Backend Integration' (Protocol in workflow.md)

## Phase 3: Frontend Integration
Goal: Create the user interface for payments and integrate the API client.

- [ ] Task: Update API Client and Hooks
    - [ ] Regenerate the API client and React Query hooks using `orval`.
- [ ] Task: Implement Payment Form Component
    - [ ] Write tests for the Stripe payment form component.
    - [ ] Create a reusable `PaymentForm` component using shadcn/ui and Stripe Elements.
- [ ] Task: Integrate Payment Flow in New Batch Wizard
    - [ ] Write tests for the payment step in the `NewBatch` wizard.
    - [ ] Add a payment step to the `NewBatch.tsx` wizard that triggers intent creation and handles payment completion.
- [ ] Task: Display Payment Status in Batch Detail
    - [ ] Write tests for the batch detail payment status display.
    - [ ] Update `BatchDetail.tsx` to show the current payment status and allow for retry if failed.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Frontend Integration' (Protocol in workflow.md)

## Phase 4: Payment Gating and Final Polish
Goal: Ensure that generation and sending are gated by payment and perform final testing.

- [ ] Task: Implement Generation Gating
    - [ ] Write unit tests for the generation gating logic.
    - [ ] Update the backend `POST /api/batches/:batchId/generate` route to check for successful payment status.
- [ ] Task: Implement Sending Gating
    - [ ] Write unit tests for the sending gating logic.
    - [ ] Update the backend `POST /api/batches/:batchId/send` routes to check for successful payment status.
- [ ] Task: Final System Verification
    - [ ] Perform a full end-to-end test of the payment and generation flow.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Payment Gating and Final Polish' (Protocol in workflow.md)