# Cephlow Security Audit & Architecture Report

This report documents the security posture of the Cephlow platform, focusing on user data protection, credential safety, multi-tenant isolation, webhook integrity, and threat mitigations.

---

## 1. Authentication & Session Integrity

Cephlow uses Supabase Auth for user identity and enforces verification across protected routes using native Web Crypto APIs:

*   **JWT Verification Engine**: Located in [auth.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/middleware/auth.ts), token parsing supports both `ES256` (using Supabase JWKS endpoints) and `HS256` (using a shared environment secret). 
*   **Cryptographic Verification**: Signatures are checked using `crypto.subtle.verify` to prevent token forging.
*   **Claim Constraints**:
    *   **Audience**: Must match `authenticated`.
    *   **Issuer**: Must match the configured `SUPABASE_URL` (normalizing paths and endpoints).
    *   **Expiration**: Strictly checked against `exp` timestamps to prevent reuse of expired sessions.
*   **User Association**: Successfully decoded tokens bind the user's `sub` UUID directly to the request context (`c.set("user", user)`).

---

## 2. Multi-Tenant Isolation & Access Control

Isolation between distinct workspaces is enforced to prevent unauthorized data access:

*   **Workspace Membership Middleware**: [workspace.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/middleware/workspace.ts) validates that the user is registered in `workspace_members` for the target workspace ID.
*   **Granular Access Checks**: Batches and certificates routes verify:
    1.  The resource belongs to the current workspace.
    2.  The requesting user is either the creator (owner of the batch) or has `owner`/`admin` privileges within the workspace.
*   **Secure Collaborator Invites**: Link generation in [workspaces.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/workspaces.ts) uses a high-entropy URL-safe base64 token (192 bits of entropy via `crypto.getRandomValues`). The invitation accept endpoint `/invites/accept` checks that the accepting user's authenticated Supabase email matches the invited email address, preventing link theft.

---

## 3. Google API Credentials Protection

Cephlow interacts with Google Drive, Sheets, and Slides. Google OAuth refresh tokens are stored securely:

*   **Encryption at Rest**: Stored tokens in `user_google_tokens` are encrypted using AES-GCM (with unique 12-byte IVs) via `encryptToken` and `decryptToken` helpers in [google-auth.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/lib/google-auth.ts). This protects the tokens in case of D1 database snapshot exposures.
*   **CSRF Protection**: Nonce verification for OAuth callbacks uses a `pending_google_auth` table with a short 10-minute expiry. Nonces are destroyed upon successful consumption.
*   **Least Privilege & Expire**: Short-lived Google Access Tokens are retrieved on-demand and restricted to the authenticated token owner. 
*   **Revocation**: Disconnecting a Google account deletes local D1 records and issues a POST revoke request directly to Google's server.

---

## 4. Public Endpoints & PII Data Minimization

Publicly exposed views are restricted to minimize the exposure of Personally Identifiable Information (PII):

*   **Public Verification**: Verification routes in [verify.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/verify.ts) only output recipient name, batch name, status, and issuance timestamp. Recipient emails, phone numbers, and raw spreadsheet row data are withheld.
*   **Certificate Path Obfuscation**: PDFs stored in Cloudflare R2 are saved under non-enumerable directories using UUIDs (e.g. `workspace_id/batch_id/recipient`). Because Cloudflare R2 blocks directory listing on public subdomains, files cannot be scraped or enumerated.
*   **Obfuscated Slugs**: Public student profiles ([profiles.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/profiles.ts)) use slugs derived from the email prefix (`emailToSlug` in [cert-utils.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/lib/cert-utils.ts)) rather than disclosing the full email address.

---

## 5. Webhook Integrity & Replay Mitigation

*   **HMAC Signature Verification**:
    *   Cashfree payment notifications are signed and verified in [cashfree.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/lib/cashfree.ts) using Web Crypto API SHA-256 HMAC.
    *   WhatsApp webhook requests verify the `X-Hub-Signature-256` header in [webhooks.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/webhooks.ts).
*   **Timing Attack Protections**: Signatures are compared using a timing-safe equality check `timingSafeEqual` in [security.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/lib/security.ts).
*   **Double-Topup Protection**: Race conditions/duplicate webhooks are prevented via database-level transaction limits:
    ```sql
    UPDATE payment_orders SET processed = 1 WHERE order_id = ? AND processed = 0
    ```
    This ensures that multiple concurrent updates for the same order fail atomically on subsequent calls.

---

## 6. Code & Infrastructure Hardening

*   **No SQL Injection**: Database queries bind variables natively (`?` placeholders with `.bind()`) across all endpoints. String interpolation is not used for query assembly.
*   **Cross-Site Scripting (XSS)**: Inputs (e.g., batch names) are validated using the `hasXssPayload` check to block HTML/JS code or event handler injection.
*   **Secure Headers**: Secure header configurations are enforced on all routes:
    *   `strictTransportSecurity` forces secure HTTPS communication.
    *   `xFrameOptions` and `frameAncestors` are configured to block clickjacking.
*   **CORS Policies**: Restricted to verified frontend domains and designated development environments.

---

## 7. Recommendations for Improvement

1.  **Bot Worker Webhook Verification**:
    *   *Observation*: In [worker.js](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/cloudflare-worker/worker.js) (the WhatsApp Bot Worker), the `POST` webhook parser does not check for the `X-Hub-Signature-256` header from Meta.
    *   *Remediation*: Implement signature checking using the SHA-256 HMAC of the payload and WhatsApp App Secret before routing actions.
2.  **Internal API Notification Signature Verification**:
    *   *Observation*: In [internal.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/routes/internal.ts), the internal server-to-server token comparison `provided === expected` uses standard string comparison.
    *   *Remediation*: Switch to `timingSafeEqual(provided, expected)` to mitigate potential timing attacks.
