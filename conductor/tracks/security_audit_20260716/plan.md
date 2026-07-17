# Implementation Plan: Full-Stack Security Audit & Hardening

## Phase 1: Security Audit & Discovery [checkpoint: 65eb81d]

- [x] Task: Audit authentication middleware (`auth.ts`) for JWT validation gaps (algorithm enforcement, expiry, claims)
    - [x] Read and analyze `apps/api-worker/src/middleware/auth.ts`
    - [x] Document findings: accepted algorithms, claim validation, error handling
- [x] Task: Audit workspace middleware (`workspace.ts`) for IDOR vectors
    - [x] Read and analyze `apps/api-worker/src/middleware/workspace.ts`
    - [x] Test if workspace ID from header can be spoofed to access other workspaces
    - [x] Document all IDOR vectors found
- [x] Task: Audit approval middleware (`approval.ts`) for whitelist bypass
    - [x] Read and analyze `apps/api-worker/src/middleware/approval.ts`
    - [x] Document bypass vectors
- [x] Task: Audit all API route files for missing auth middleware
    - [x] List all route handlers and verify middleware chain
    - [x] Document any unprotected endpoints
- [x] Task: Audit presigned URL generation for scope and expiry
    - [x] Analyze R2 presigned URL creation logic
    - [x] Verify URL paths are scoped to the requesting workspace/batch
    - [x] Document cross-workspace access vectors
- [x] Task: Audit wallet/payment logic for race conditions and integrity
    - [x] Analyze credit deduction SQL queries for atomicity
    - [x] Analyze `payment_orders` idempotency logic
    - [x] Analyze Cashfree webhook verification flow
    - [x] Document double-spend and replay vectors
- [x] Task: Audit Meta WhatsApp webhook for signature validation
    - [x] Analyze webhook handler for `X-Hub-Signature-256` verification
    - [x] Document missing validation
- [x] Task: Audit frontend for secrets exposure and XSS
    - [x] Search client codebase for non-`VITE_` env references
    - [x] Audit how user-supplied data (participant names, batch names) is rendered
    - [x] Check Supabase token storage mechanism
    - [x] Document all findings
- [x] Task: Produce consolidated Security Audit Report artifact
    - [x] Compile all findings into a prioritized report (Critical / High / Medium / Low)
- [x] Task: Conductor - User Manual Verification 'Security Audit & Discovery' (Protocol in workflow.md)

## Phase 2: Authentication & Authorization Hardening

- [x] Task: Write security tests for JWT validation in auth middleware
    - [x] Test: reject missing Authorization header
    - [x] Test: reject expired JWT
    - [x] Test: reject JWT with `alg: none` or unexpected algorithms (e.g. RS256) (C-4)
    - [x] Test: reject JWT with wrong issuer/audience (H-1)
    - [x] Test: reject query string token if restricted (M-1)
    - [x] Test: accept valid JWT and attach user context
- [x] Task: Implement auth middleware fixes based on audit findings
    - [x] Enforce ES256 and HS256 algorithms only (C-4)
    - [x] Validate issuer and audience claims (H-1)
    - [x] Remove or restrict query string token fallback (M-1)
    - [x] Standardize verification errors to prevent detail leakage (M-5)
- [x] Task: Write security tests for workspace IDOR prevention
    - [x] Test: user A cannot access workspace B's batches
    - [x] Test: user A cannot access workspace B's certificates
    - [x] Test: workspace ID header mismatch with membership is rejected
    - [x] Test: user B cannot trigger payment verification for user A's order (H-5)
- [x] Task: Implement workspace middleware and route authorization fixes
    - [x] Fix any discovered bypass paths
    - [x] Add workspace/user ownership check in `POST /payments/verify` (H-5)
- [x] Task: Write tests for Google OAuth token security
    - [x] Test: API responses never include raw refresh tokens
    - [x] Test: token encryption/decryption round-trip
- [x] Task: Fix any token exposure issues and encrypt refresh tokens at rest (AES-GCM) (H-2)
    - [x] Implement Cloudflare Workers compatible AES-GCM encryption
    - [x] Fall back to raw values for backward compatibility and log appropriately
- [x] Task: Conductor - User Manual Verification 'Authentication & Authorization Hardening' (Protocol in workflow.md)

## Phase 3: API Endpoint & Input Security

- [x] Task: Write tests for input validation on critical endpoints
    - [x] Test: batch creation rejects malicious names (SQL injection, XSS payloads)
    - [x] Test: sheet ID parameters reject non-alphanumeric input
    - [x] Test: phone number normalization rejects invalid formats
- [x] Task: Implement input sanitization on all user-supplied parameters
    - [x] Add Zod validation schemas where missing
    - [x] Sanitize string inputs against injection
- [x] Task: Write tests for presigned URL scoping
    - [x] Test: presigned URL path contains requesting workspace ID (H-3)
    - [x] Test: user cannot request presigned URL for another workspace's batch
    - [x] Test: presigned URLs expire within expected timeframe
- [x] Task: Fix presigned URL generation scoping issues
    - [x] Scope key prefix path to `{workspace_id}/{batch_id}/` (H-3)
- [x] Task: Write tests for rate limiting middleware
    - [x] Test: requests exceeding rate limit receive 429 response
    - [x] Test: requests within limit succeed normally
- [x] Task: Implement rate limiting middleware
    - [x] Create rate limiter (D1-backed sliding window or in-memory for CF Workers)
    - [x] Apply to auth endpoints
    - [x] Apply to payment creation endpoints
    - [x] Apply to batch generation endpoints
- [x] Task: Conductor - User Manual Verification 'API Endpoint & Input Security' (Protocol in workflow.md)

## Phase 4: Wallet, Payment & Webhook Security

- [x] Task: Write tests for atomic credit deduction
    - [x] Test: concurrent deduction requests don't overdraw balance (C-2 TOCTOU)
    - [x] Test: insufficient balance is rejected before deduction
    - [x] Test: deduction amounts match server-side cost config (not client-supplied)
- [x] Task: Fix credit deduction atomicity issues
    - [x] Ensure atomic `UPDATE workspaces SET current_balance = current_balance - ? WHERE id = ? AND current_balance >= ?` query pattern (C-2)
    - [x] Verify regeneration uses 20% rate server-side
- [x] Task: Write tests for Cashfree webhook security
    - [x] Test: unsigned webhook payload is rejected
    - [x] Test: tampered signature is rejected (H-4)
    - [x] Test: duplicate order callback doesn't double-credit (idempotency & concurrent TOCTOU) (C-3)
    - [x] Test: valid signed payload credits wallet correctly
- [x] Task: Implement Cashfree webhook signature verification and idempotency fixes
    - [x] Enforce timing-safe signature comparison (`crypto.subtle.timingSafeEqual`) (H-4)
    - [x] Use atomic state transition (`UPDATE payment_orders SET processed = 1 WHERE ... AND processed = 0`) to prevent concurrent top-up race condition (C-3)
- [x] Task: Write tests for Meta WhatsApp webhook security
    - [x] Test: missing `X-Hub-Signature-256` header is rejected (C-1)
    - [x] Test: invalid signature is rejected
    - [x] Test: malformed payload body is rejected gracefully
- [x] Task: Implement WhatsApp webhook signature verification fixes
    - [x] Verify signature using `X-Hub-Signature-256` and app secret (C-1)
- [x] Task: Conductor - User Manual Verification 'Wallet, Payment & Webhook Security' (Protocol in workflow.md)

## Phase 5: Frontend Security & HTTP Headers

- [ ] Task: Write tests verifying no secrets in client bundle
    - [ ] Test: Vite build output does not contain non-`VITE_` env values
    - [ ] Test: no hardcoded API keys, tokens, or secrets in source files
- [ ] Task: Fix any secrets exposure found in frontend audit
- [ ] Task: Audit and fix XSS rendering of user-supplied data
    - [ ] Verify React's default escaping covers all dynamic rendering
    - [ ] Fix any `dangerouslySetInnerHTML` or unescaped injection points
- [ ] Task: Write tests for HTTP security headers and CORS (API)
    - [ ] Test: API responses include `Content-Security-Policy`
    - [ ] Test: API responses include `Strict-Transport-Security`
    - [ ] Test: API responses include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
    - [ ] Test: CORS restricts access to configured frontend origins (no origin reflection) (M-2)
- [ ] Task: Implement security headers and CORS Hono middleware
    - [ ] Create `securityHeaders.ts` middleware
    - [ ] Restrict CORS allowed origins to configured domains (M-2)
    - [ ] Register in middleware chain
- [ ] Task: Configure frontend security headers
    - [ ] Create/update `_headers` file for Cloudflare Pages
- [ ] Task: Conductor - User Manual Verification 'Frontend Security & HTTP Headers' (Protocol in workflow.md)

## Phase 6: Manual Pen-Test Checklist & Final Verification

- [ ] Task: Produce OWASP Top 10 penetration testing checklist
    - [ ] Map each OWASP category to specific Cephlow endpoints and flows
    - [ ] Include step-by-step test procedures with expected results
    - [ ] Include tool recommendations (Burp Suite, OWASP ZAP, curl)
- [ ] Task: Run full test suite and verify coverage
    - [ ] Execute `pnpm test --coverage`
    - [ ] Verify all security tests pass
    - [ ] Verify coverage threshold (>80%) is met
- [ ] Task: Conductor - User Manual Verification 'Manual Pen-Test Checklist & Final Verification' (Protocol in workflow.md)
