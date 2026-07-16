# Implementation Plan: Full-Stack Security Audit & Hardening

## Phase 1: Security Audit & Discovery

- [ ] Task: Audit authentication middleware (`auth.ts`) for JWT validation gaps (algorithm enforcement, expiry, claims)
    - [ ] Read and analyze `apps/api-worker/src/middleware/auth.ts`
    - [ ] Document findings: accepted algorithms, claim validation, error handling
- [ ] Task: Audit workspace middleware (`workspace.ts`) for IDOR vectors
    - [ ] Read and analyze `apps/api-worker/src/middleware/workspace.ts`
    - [ ] Test if workspace ID from header can be spoofed to access other workspaces
    - [ ] Document all IDOR vectors found
- [ ] Task: Audit approval middleware (`approval.ts`) for whitelist bypass
    - [ ] Read and analyze `apps/api-worker/src/middleware/approval.ts`
    - [ ] Document bypass vectors
- [ ] Task: Audit all API route files for missing auth middleware
    - [ ] List all route handlers and verify middleware chain
    - [ ] Document any unprotected endpoints
- [ ] Task: Audit presigned URL generation for scope and expiry
    - [ ] Analyze R2 presigned URL creation logic
    - [ ] Verify URL paths are scoped to the requesting workspace/batch
    - [ ] Document cross-workspace access vectors
- [ ] Task: Audit wallet/payment logic for race conditions and integrity
    - [ ] Analyze credit deduction SQL queries for atomicity
    - [ ] Analyze `payment_orders` idempotency logic
    - [ ] Analyze Cashfree webhook verification flow
    - [ ] Document double-spend and replay vectors
- [ ] Task: Audit Meta WhatsApp webhook for signature validation
    - [ ] Analyze webhook handler for `X-Hub-Signature-256` verification
    - [ ] Document missing validation
- [ ] Task: Audit frontend for secrets exposure and XSS
    - [ ] Search client codebase for non-`VITE_` env references
    - [ ] Audit how user-supplied data (participant names, batch names) is rendered
    - [ ] Check Supabase token storage mechanism
    - [ ] Document all findings
- [ ] Task: Produce consolidated Security Audit Report artifact
    - [ ] Compile all findings into a prioritized report (Critical / High / Medium / Low)
- [ ] Task: Conductor - User Manual Verification 'Security Audit & Discovery' (Protocol in workflow.md)

## Phase 2: Authentication & Authorization Hardening

- [ ] Task: Write security tests for JWT validation in auth middleware
    - [ ] Test: reject missing Authorization header
    - [ ] Test: reject expired JWT
    - [ ] Test: reject JWT with `alg: none`
    - [ ] Test: reject JWT with wrong issuer/audience
    - [ ] Test: accept valid JWT and attach user context
- [ ] Task: Implement auth middleware fixes based on audit findings
    - [ ] Enforce RS256 algorithm only
    - [ ] Validate issuer and audience claims
    - [ ] Ensure proper error responses (401 vs 403)
- [ ] Task: Write security tests for workspace IDOR prevention
    - [ ] Test: user A cannot access workspace B's batches
    - [ ] Test: user A cannot access workspace B's certificates
    - [ ] Test: workspace ID header mismatch with membership is rejected
- [ ] Task: Implement workspace middleware fixes for IDOR vectors
    - [ ] Fix any discovered bypass paths
- [ ] Task: Write tests for Google OAuth token security
    - [ ] Test: API responses never include raw refresh tokens
    - [ ] Test: token encryption/decryption round-trip
- [ ] Task: Fix any token exposure issues found in audit
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
    - [ ] Test: presigned URL path contains requesting workspace ID
    - [ ] Test: user cannot request presigned URL for another workspace's batch
    - [ ] Test: presigned URLs expire within expected timeframe
- [ ] Task: Fix presigned URL generation scoping issues
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
    - [ ] Test: concurrent deduction requests don't overdraw balance
    - [ ] Test: insufficient balance is rejected before deduction
    - [ ] Test: deduction amounts match server-side cost config (not client-supplied)
- [ ] Task: Fix credit deduction atomicity issues
    - [ ] Ensure `UPDATE ... WHERE current_balance >= cost` pattern or equivalent
    - [ ] Verify regeneration uses 20% rate server-side
- [ ] Task: Write tests for Cashfree webhook security
    - [ ] Test: unsigned webhook payload is rejected
    - [ ] Test: tampered signature is rejected
    - [ ] Test: duplicate order callback doesn't double-credit (idempotency)
    - [ ] Test: valid signed payload credits wallet correctly
- [ ] Task: Implement Cashfree webhook signature verification fixes
- [ ] Task: Write tests for Meta WhatsApp webhook security
    - [ ] Test: missing `X-Hub-Signature-256` header is rejected
    - [ ] Test: invalid signature is rejected
    - [ ] Test: malformed payload body is rejected gracefully
- [ ] Task: Implement WhatsApp webhook signature verification fixes
- [ ] Task: Conductor - User Manual Verification 'Wallet, Payment & Webhook Security' (Protocol in workflow.md)

## Phase 5: Frontend Security & HTTP Headers

- [ ] Task: Write tests verifying no secrets in client bundle
    - [ ] Test: Vite build output does not contain non-`VITE_` env values
    - [ ] Test: no hardcoded API keys, tokens, or secrets in source files
- [ ] Task: Fix any secrets exposure found in frontend audit
- [ ] Task: Audit and fix XSS rendering of user-supplied data
    - [ ] Verify React's default escaping covers all dynamic rendering
    - [ ] Fix any `dangerouslySetInnerHTML` or unescaped injection points
- [ ] Task: Write tests for HTTP security headers (API)
    - [ ] Test: API responses include `Content-Security-Policy`
    - [ ] Test: API responses include `Strict-Transport-Security`
    - [ ] Test: API responses include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
- [ ] Task: Implement security headers Hono middleware
    - [ ] Create `securityHeaders.ts` middleware
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
