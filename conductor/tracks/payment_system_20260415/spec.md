# Track Specification: Implement Prepaid Wallet & Billing System

## Overview
This track involves integrating Cashfree Payments to build a robust prepaid wallet system for the Cephlow platform. Users will top up a central balance, which is then verified and deducted upfront before any certificate generation or WhatsApp distribution batch begins.

## User Stories
- As an event administrator, I want to add funds to my Cephlow wallet via UPI and Cards using Cashfree.
- As an event administrator, I want to view my current balance and a ledger of my transactions (top-ups and batch deductions).
- As the backend system, I must verify that a user has sufficient wallet balance before allowing a batch generation process to consume server resources.

## Functional Requirements
- Integrate Cashfree for payment order creation (backend) and checkout rendering (frontend).
- Build a Firestore data model utilizing `userProfiles` for the current balance and an immutable `ledgers` collection for transaction history.
- Implement secure webhooks to handle Cashfree payment success and automatically credit the user's wallet.
- Gate the certificate generation trigger based on the calculation: `(csv_row_count * flat_rate) <= currentBalance`.

## Technical Requirements
- Use `@cashfreepayments/cashfree-js` on the React frontend.
- Use `cashfree-pg-sdk-nodejs` on the Node.js backend.
- Execute all financial state changes using Firestore `runTransaction` to ensure atomicity and prevent race conditions.
- Securely verify all incoming Cashfree webhook signatures (SHA-256) before interacting with the database.

## Acceptance Criteria
- Administrators can successfully load funds into their wallet using the Cashfree Sandbox environment.
- The system correctly calculates the batch cost and writes a single deduction entry to the ledger upon the user clicking "Generate".
- Batch generation is strictly blocked and the user is prompted to top up if their wallet balance is insufficient.
