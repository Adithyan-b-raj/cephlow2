# Specification: Full-Stack Security Audit & Hardening

## Overview
Conduct a comprehensive security audit of the entire Cephlow platform (frontend, backend API, authentication, payments, external integrations, infrastructure) and implement fixes for discovered vulnerabilities. The track produces both an automated security regression test suite (Vitest) and a structured manual penetration testing checklist.

## Functional Requirements

### FR-1: Authentication & Authorization Security
- **FR-1.1**: Audit JWT validation in `authMiddleware` — verify token expiry, signature algorithm enforcement (RS256 only, no `alg: none`), issuer/audience claims.
- **FR-1.2**: Audit workspace membership middleware — verify users cannot access resources outside their workspace (IDOR prevention).
- **FR-1.3**: Audit Google OAuth refresh token storage — verify tokens are encrypted at rest in D1, never exposed in API responses or client bundles.
- **FR-1.4**: Verify `approval.ts` middleware correctly restricts wallet actions to whitelisted orgs.
- **FR-1.5**: Write Vitest tests for each auth bypass vector (missing token, expired token, wrong workspace, tampered claims).

### FR-2: API Endpoint Security
- **FR-2.1**: Audit all API routes for proper auth middleware attachment (no unprotected endpoints).
- **FR-2.2**: Validate input sanitization on all user-supplied parameters (batch names, sheet IDs, phone numbers) to prevent injection.
- **FR-2.3**: Verify presigned R2 URL generation is scoped — users can only upload to their own batch paths, URLs expire appropriately, and GET URLs don't leak cross-workspace PDFs.
- **FR-2.4**: Add rate limiting middleware to sensitive endpoints (auth, batch generation, payment creation) using a CF Workers-compatible approach (e.g., D1-backed sliding window or CF Rate Limiting binding).

### FR-3: Wallet & Payment Security
- **FR-3.1**: Audit credit deduction logic for race conditions — verify atomic balance checks (e.g., `UPDATE ... WHERE current_balance >= cost` pattern in D1).
- **FR-3.2**: Verify Cashfree webhook signature validation — ensure `POST /payments/verify` validates the webhook payload signature before crediting the wallet.
- **FR-3.3**: Verify idempotency in `payment_orders` — duplicate payment callbacks must not double-credit.
- **FR-3.4**: Audit that deduction amounts match expected costs (no client-controlled cost overrides).
- **FR-3.5**: Write Vitest tests for double-spend, insufficient balance, and replay attack scenarios.

### FR-4: Webhook Security
- **FR-4.1**: Audit Meta WhatsApp webhook endpoint — verify signature validation (`X-Hub-Signature-256`), input validation, and rejection of malformed payloads.
- **FR-4.2**: Audit Cashfree payment webhook — verify order ID cross-referencing and signature verification.
- **FR-4.3**: Write tests simulating invalid/tampered webhook payloads.

### FR-5: Frontend Security
- **FR-5.1**: Audit for secrets exposure — ensure no API keys, tokens, or sensitive config leak into the client bundle (only `VITE_`-prefixed public vars).
- **FR-5.2**: Audit XSS vectors — verify user-supplied data (batch names, participant names from Sheets) is properly escaped in React rendering.
- **FR-5.3**: Verify Supabase JWT tokens are stored securely (httpOnly cookies or secure in-memory, not localStorage if avoidable).

### FR-6: HTTP Security Headers
- **FR-6.1**: Add `Content-Security-Policy` header restricting script/style sources.
- **FR-6.2**: Add `Strict-Transport-Security` (HSTS) header.
- **FR-6.3**: Add `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers.
- **FR-6.4**: Configure headers via Hono middleware (API) and `_headers` file (CF Pages frontend).

### FR-7: Manual Penetration Testing Checklist
- **FR-7.1**: Produce a structured markdown checklist covering OWASP Top 10 categories mapped to Cephlow's specific endpoints and flows.
- **FR-7.2**: Include specific test scenarios for each vulnerability class with expected pass/fail criteria.

## Non-Functional Requirements
- All automated security tests must run in CI via `pnpm test` without external credentials.
- Security tests must use Vitest mocks — no live API calls.
- Rate limiting must not degrade p99 latency by more than 10ms for legitimate requests.

## Acceptance Criteria
- [ ] All identified auth bypass, IDOR, and injection vectors have corresponding Vitest tests.
- [ ] Wallet deduction is verified atomic (no race condition in test).
- [ ] Webhook endpoints reject unsigned/tampered payloads (test verified).
- [ ] Presigned URLs are scoped to the requesting user's workspace (test verified).
- [ ] Rate limiting middleware is active on auth and payment endpoints.
- [ ] Security headers are present on both API and frontend responses.
- [ ] No secrets are present in the frontend production bundle.
- [ ] Manual pen-test checklist document is produced.
- [ ] All existing tests continue to pass (`pnpm test`).

## Out of Scope
- Infrastructure-level security (Cloudflare WAF rules, DNS, DDoS protection).
- SOC 2 / ISO 27001 compliance documentation.
- Third-party dependency vulnerability scanning (e.g., `npm audit`) — can be a separate track.
- Penetration testing of Google/Meta/Cashfree APIs themselves.
