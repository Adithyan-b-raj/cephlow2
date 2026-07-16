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

- [ ] Task: Write security tests for JWT validation in auth middleware
    - [ ] Test: reject missing Authorization header
    - [ ] Test: reject expired JWT
    - [ ] Test: reject JWT with `alg: none` or unexpected algorithms (e.g. RS256) (C-4)
    - [ ] Test: reject JWT with wrong issuer/audience (H-1)
    - [ ] Test: reject query string token if restricted (M-1)
    - [ ] Test: accept valid JWT and attach user context
- [ ] Task: Implement auth middleware fixes based on audit findings
    - [ ] Enforce ES256 and HS256 algorithms only (C-4)
    - [ ] Validate issuer and audience claims (H-1)
    - [ ] Remove or restrict query string token fallback (M-1)
    - [ ] Standardize verification errors to prevent detail leakage (M-5)
- [ ] Task: Write security tests for workspace IDOR prevention
    - [ ] Test: user A cannot access workspace B's batches
    - [ ] Test: user A cannot access workspace B's certificates
    - [ ] Test: workspace ID header mismatch with membership is rejected
    - [ ] Test: user B cannot trigger payment verification for user A's order (H-5)
- [ ] Task: Implement workspace middleware and route authorization fixes
    - [ ] Fix any discovered bypass paths
    - [ ] Add workspace/user ownership check in `POST /payments/verify` (H-5)
- [ ] Task: Write tests for Google OAuth token security
    - [ ] Test: API responses never include raw refresh tokens
    - [ ] Test: token encryption/decryption round-trip
- [ ] Task: Fix any token exposure issues and encrypt refresh tokens at rest (AES-GCM) (H-2)
- [ ] Task: Conductor - User Manual Verification 'Authentication & Authorization Hardening' (Protocol in workflow.md)

## Phase 3: API Endpoint & Input Security

- [ ] Task: Write tests for input validation on critical endpoints
    - [ ] Test: batch creation rejects malicious names (SQL injection, XSS payloads)
    - [ ] Test: sheet ID parameters reject non-alphanumeric input
    - [ ] Test: phone number normalization rejects invalid formats
- [ ] Task: Implement input sanitization on all user-supplied parameters
    - [ ] Add Zod validation schemas where missing
    - [ ] Sanitize string inputs against injection
- [ ] Task: Write tests for presigned URL scoping
    - [ ] Test: presigned URL path contains requesting workspace ID (H-3)
    - [ ] Test: user cannot request presigned URL for another workspace's batch
    - [ ] Test: presigned URLs expire within expected timeframe
- [ ] Task: Fix presigned URL generation scoping issues
    - [ ] Scope key prefix path to `{workspace_id}/{batch_id}/` (H-3)
- [ ] Task: Write tests for rate limiting middleware
    - [ ] Test: requests exceeding rate limit receive 429 response
    - [ ] Test: requests within limit succeed normally
- [ ] Task: Implement rate limiting middleware
    - [ ] Create rate limiter (D1-backed sliding window or in-memory for CF Workers)
    - [ ] Apply to auth endpoints
    - [ ] Apply to payment creation endpoints
    - [ ] Apply to batch generation endpoints
- [ ] Task: Conductor - User Manual Verification 'API Endpoint & Input Security' (Protocol in workflow.md)

## Phase 4: Wallet, Payment & Webhook Security

- [ ] Task: Write tests for atomic credit deduction
    - [ ] Test: concurrent deduction requests don't overdraw balance (C-2 TOCTOU)
    - [ ] Test: insufficient balance is rejected before deduction
    - [ ] Test: deduction amounts match server-side cost config (not client-supplied)
- [ ] Task: Fix credit deduction atomicity issues
    - [ ] Ensure atomic `UPDATE workspaces SET current_balance = current_balance - ? WHERE id = ? AND current_balance >= ?` query pattern (C-2)
    - [ ] Verify regeneration uses 20% rate server-side
- [ ] Task: Write tests for Cashfree webhook security
    - [ ] Test: unsigned webhook payload is rejected
    - [ ] Test: tampered signature is rejected (H-4)
    - [ ] Test: duplicate order callback doesn't double-credit (idempotency & concurrent TOCTOU) (C-3)
    - [ ] Test: valid signed payload credits wallet correctly
- [ ] Task: Implement Cashfree webhook signature verification and idempotency fixes
    - [ ] Enforce timing-safe signature comparison (`crypto.subtle.timingSafeEqual`) (H-4)
    - [ ] Use atomic state transition (`UPDATE payment_orders SET processed = 1 WHERE ... AND processed = 0`) to prevent concurrent top-up race condition (C-3)
- [ ] Task: Write tests for Meta WhatsApp webhook security
    - [ ] Test: missing `X-Hub-Signature-256` header is rejected (C-1)
    - [ ] Test: invalid signature is rejected
    - [ ] Test: malformed payload body is rejected gracefully
- [ ] Task: Implement WhatsApp webhook signature verification fixes
    - [ ] Verify signature using `X-Hub-Signature-256` and app secret (C-1)
- [ ] Task: Conductor - User Manual Verification 'Wallet, Payment & Webhook Security' (Protocol in workflow.md)

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
