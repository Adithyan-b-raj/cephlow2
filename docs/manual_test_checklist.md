# Cephlow Manual Test Checklist

This checklist provides step-by-step manual verification scenarios for Cephlow's end-user features. It covers critical user flows, expected outcomes, and edge cases to test during manual QA.

---

## 1. Authentication & Onboarding

### Scenario 1.1: New User Sign Up
1. Navigate to the login page.
2. Click **Sign Up**.
3. Enter a valid email address and password.
4. Verify that the system prompts you to confirm your email.
5. Check your email for the confirmation link and click it.
6. Return to the app and verify you can now log in.

### Scenario 1.2: Google Drive Integration (Optional Backup & Sharing)
1. Go to **Settings** / **Connections**.
2. Click **Connect Google Account**.
3. Select Google scopes to authorize (Google Drive: `drive.file` scope only).
4. Complete the Google OAuth popup flow.
5. Verify that:
   - You are redirected back to the Settings page with a success query parameter.
   - The connection status card displays "Connected" for Google Drive backup/sharing.
   - The D1 database stores the encrypted refresh token under `user_google_tokens`.

### Scenario 1.3: Hostname-based BETA Badge Validation
1. Navigate to the app on a test/staging domain (e.g., `localhost`, `test.cephlow.in`, or `*.pages.dev`).
2. Verify that a `BETA` badge is rendered next to the Cephlow logo (in sidebar, landing page, and login screen).
3. Navigate to the app on a production domain (e.g., `cephlow.in` or `cephlow.online`).
4. Verify that the `BETA` badge is completely hidden.

---

## 2. Workspace Management

### Scenario 2.1: Workspace Creation & Renaming
1. Click the Workspace dropdown in the sidebar and select **Create Workspace**.
2. Enter a workspace name (e.g., "ACM Student Chapter") and submit.
3. Verify that:
   - The workspace is created with you as the `owner`.
   - Your balance is initialized to `0` credits.
4. Go to **Workspace Settings** -> **General**.
5. Change the workspace name and click **Save**.
6. Verify the sidebar switcher reflects the new name.

### Scenario 2.2: Team Invitations & Acceptance
1. Navigate to **Workspace Settings** -> **Members**.
2. Click **Invite Member**.
3. Enter an email address and select a role (`admin` or `member`). Click **Send Invite**.
4. Log out and register a new user under the *invited* email address.
5. Check the email inbox of the invited user and click the invite link:
   - Accept the invite in the UI.
   - Verify you are now switched into the new workspace and can access its sheets/batches.
6. **Edge Case (Link Theft)**: Attempt to accept the invite token while logged in as a *different* email address.
   - Verify that the API rejects the request with a `403 Invite email mismatch` error.
7. **Edge Case (Expired Token)**: Wait 7 days (or manually set `expires_at` in the database to a past timestamp) and try to accept.
   - Verify the app displays `Invite expired` and blocks access.

---

## 3. Template Creation & Management

### Scenario 3.1: Create Template via Built-in HTML Canvas Editor
1. Go to **Templates** / **Frame Inventory**.
2. Click **Create Template**.
3. In the canvas editor workspace:
   - Drag and place static labels (e.g. "Certificate of Achievement").
   - Inject dynamic text placeholders mapped to spreadsheet columns (e.g. `{{Name}}`, `{{Email}}`).
   - Configure text properties (font family, size, line-height, color alignment).
4. Click **Save Template**.
5. Verify it appears under your workspace templates and can be selected for certificate generation batches.

### Scenario 3.2: Manage Design Frames in Frame Inventory
1. Navigate to **Frame Inventory**.
2. Click **Upload Frame**.
3. Drag and drop a valid design background file (`.png` or `.jpg`).
4. Verify the background uploads successfully to Cloudflare R2 and displays in the inventory.
5. Create a template using this frame background.
6. **Edge Case (Invalid File Types)**: Try uploading a `.pdf` or `.docx` as a background frame.
   - Verify the browser alerts you and blocks the upload.

### Scenario 3.3: QR Element Aspect Ratio Constraints
1. Open a template in the built-in canvas editor.
2. Click **Add QR Code** element.
3. Drag the corners of the QR box to resize it on the canvas.
4. Verify that the resizing is constrained to a **locked 1:1 aspect ratio** to prevent QR code distortion.
5. Select the QR element and manually edit the **Width** or **Height** property in the Properties Panel.
6. Verify that changing one dimension automatically updates the other dimension to match (maintaining 1:1 ratio).

---

## 4. Built-in Spreadsheet Editor

### Scenario 4.1: Create & Edit Spreadsheet
1. Navigate to **Spreadsheets** in the dashboard.
2. Click **Create Spreadsheet**.
3. Enter a sheet name and define columns (e.g. `Recipient Name`, `Recipient Email`, `Grade`).
4. In the spreadsheet grid editor:
   - Add new rows.
   - Edit cells (e.g., enter names, emails, grades).
   - Add/Remove columns.
5. Click **Save Changes**.
6. Refresh the page and verify that all cells retain their updated values.

### Scenario 4.2: Import Spreadsheet into Batch
1. Go to **Batches** -> **New Batch**.
2. Select **Data Source: Built-in Spreadsheet**.
3. Select the spreadsheet you created.
4. Verify that the column mapper retrieves your custom columns (e.g., `Recipient Name` mapping to `Name` placeholder).

---

## 5. Batch Creation & Generation Pipeline

### Scenario 5.1: Category Mapping Setup (Advanced)
1. Create a new batch.
2. Enable **Category-based templates**.
3. Choose a category column from your spreadsheet (e.g., `Course Name`).
4. In the mapper:
   - For category `Python Core`, map it to template `Python Certificate`.
   - For category `React Intermediate`, map it to template `React Certificate`.
5. Proceed to the mapping review step and verify that the UI shows correct templates mapped to respective students.

### Scenario 5.2: Generation Balance Deduction & Run
1. Open a batch that is in `draft` status with 10 recipients.
2. Make sure your workspace balance is sufficient (at least `10 * generation_cost` credits).
3. Click **Generate Certificates**.
4. Verify that:
   - The browser starts looping through rows, rendering them on an HTML canvas, and compiling PDFs locally using PDF-Lib (client-side).
   - The PDFs are uploaded directly to Cloudflare R2 (`*.r2.cloudflarestorage.com`) via presigned URLs.
   - The progress bar updates in real-time.
   - Your wallet balance is atomically deducted for the cost of generation.
5. Navigate to **Wallet** -> **Ledger** and verify that a transaction of type `generation` is recorded.
6. **Edge Case (Insufficient Balance)**: Attempt to generate a batch of 100 certificates when your wallet has 5 credits.
   - Verify the generation blocks immediately with an "Insufficient balance" alert.

### Scenario 5.3: Visual Regeneration (Free Re-generation)
1. Select a certificate that has already been successfully generated (`status = 'generated'`).
2. Update the recipient's name in the spreadsheet and click **Re-generate**.
3. Verify that:
   - The regeneration is completely free (0 credit cost) and no wallet balance is deducted.
   - The old PDF is replaced in Cloudflare R2.
   - The new PDF contains the corrected name.

### Scenario 5.4: Advanced Workflow Graph Persistence
1. Navigate to the **Advanced Workflow Builder** (`/advanced`).
2. Construct a workflow with React Flow: drag Spreadsheet and Template nodes and connect them.
3. Click **Launch Batch**.
4. Verify that:
   - The batch is successfully initialized.
   - The React Flow nodes and edges array are saved in D1 as `workflow_json` on the batch.
5. Go to the Batch Detail page and click the **Edit Workflow** button in the header.
6. Verify it returns you to the advanced designer and restores the exact graph.
7. **Edge Case (Malformed workflow JSON)**: Inject a malformed string or script payload into the graph state.
   - Verify the designer handles rendering errors gracefully and Zod rejects malicious payloads on saving.

### Scenario 5.5: Google Drive Folder Sharing
1. In the Batch Detail header, click the **More** dropdown and select **Share PDFs**.
2. If Google is not connected, verify a dialog prompts you to connect your account.
3. If connected, click **Share Folder** and verify that:
   - The backend creates a dedicated, publicly accessible folder named after the batch.
   - A background thread automatically moves any existing certificate files from the Drive root into this new folder.
   - A success toast is displayed with a direct link to the shared Google Drive folder.

---

## 6. Payments & Prepaid Wallet

### Scenario 6.1: Wallet Recharge via Cashfree
1. Navigate to the **Wallet** page.
2. Click **Recharge Wallet**.
3. Enter an amount (e.g., ₹100).
4. Verify that the Cashfree SDK modal opens with payment options.
5. Complete a checkout in Sandbox mode.
6. Verify that:
   - The modal closes, and a success banner is displayed.
   - The wallet balance increases by the correct credit count (`INR * CREDITS_PER_RUPEE`).
   - A new ledger entry of type `topup` appears in the transaction history.

### Scenario 6.2: Minimum Recharge Validation
1. Click **Recharge Wallet**.
2. Enter an amount less than `MIN_RECHARGE_AMOUNT` (e.g., ₹50).
3. Click **Proceed**.
4. Verify that the UI displays a validation warning and blocks the order creation.

---

## 7. Certificate Delivery Channels

### Scenario 7.1: Delivery via Email (ZeptoMail)
1. Go to the batch details page.
2. Ensure recipient records have valid email addresses.
3. Click **Send Emails**.
4. Verify that:
   - The browser triggers the send endpoint for each recipient.
   - The status column changes from `generated` to `sent`.
   - Your wallet balance is deducted by `email_cost` credits per sent email.
   - The recipient receives the email (delivered via ZeptoMail) containing the certificate PDF as an attachment.

### Scenario 7.2: Delivery via WhatsApp
1. Ensure the recipient records have valid phone numbers normalized (E.164 format).
2. Click **Send WhatsApp Messages**.
3. Verify that:
   - The backend triggers the Meta Cloud API with the document template.
   - The certificate PDF from Cloudflare R2 is sent as the document attachment.
   - Your wallet balance is deducted by `whatsapp_cost` credits per sent message.
   - The recipient receives the WhatsApp message containing the certificate.
4. **Webhook Status Tracking**:
   - Check the certificate status on the dashboard:
     - When the student receives it, the status should update to `delivered`.
     - When the student views it, the status should update to `read`.

---

## 8. Public Verification & Student Profiles

### Scenario 8.1: Public Verification Page
1. Scan the QR code on a generated certificate, or click the verify link on the verification portal:
   - URL: `/verify/:batchId/:certId`
2. Verify that:
   - The page displays: Recipient Name, Batch Name, Status, and Date Issued.
   - Click the **Download Certificate** button and verify the PDF loads correctly.
   - The page **does not** leak the student's email, phone number, or spreadsheet row data.

### Scenario 8.2: Student Profile Page & Editing
1. Navigate to `/p/:username` (where username is the slug of the email prefix).
2. Verify that:
   - The page displays the student's name and lists all certificates issued to them.
   - The full email address is not exposed.
3. **Edit Profile Name**:
   - Log in as the issuer (the workspace owner who issued the certificate).
   - Go to the student profile page and click **Edit Name**.
   - Change the spelling and click **Save**.
   - Verify that the profile name updates.
4. **Edge Case (Unauthorized Edit)**: Try to edit a student's profile name when logged in as a user who has *not* issued any certificates to this student.
   - Verify that the edit is blocked with a `403 Forbidden` error.

---

## 9. WhatsApp Bot & Developer Chat Bridge

### Scenario 9.1: Bot Greet & Menu Navigation
1. Send "hi" or "hello" to the WhatsApp Business number.
2. Verify that:
   - The bot replies with an interactive menu: "What do you want to do?".
   - The menu choices are:
     - `📄 Send all certs`
     - `🔍 Search a cert`
     - `⚠️ Report Issue`
     - `🚀 Vote to Scale`
     - `💬 Talk to Developer`

### Scenario 9.2: Certificate Search & Download via Bot
1. Select `🔍 Search a cert` or send "search" to the bot.
2. Verify that:
   - The bot lists the certificates generated for your phone number.
   - Tapping on a certificate from the interactive list sends the PDF document directly to your WhatsApp chat.

### Scenario 9.3: Issue Reporting
1. Select `⚠️ Report Issue` from the WhatsApp menu.
2. Select the certificate that has an issue.
3. When prompted, type a description of the issue (e.g. "Wrong spelling").
4. Verify that:
   - The bot replies: "Thanks! Your issue has been reported."
   - The issue is saved in the D1 `reports` database table.
5. Log into the Cephlow Dashboard as the workspace owner and navigate to the **Reports** page.
6. Verify that:
   - The reported issue is displayed correctly under the workspace's reports list.
   - The private WhatsApp analytics token is **not** leaked to the client browser (the browser fetches securely from `/api/reports` passing the `x-workspace-id` header, with zero direct cross-origin calls to the bot worker).

### Scenario 9.4: Developer Live Chat Bridge (Telegram)
1. Select `💬 Talk to Developer` or send "talk to developer" to the bot.
2. Verify that:
   - The bot replies: "Connecting you with a developer...".
   - A new topic thread is automatically created in the Telegram Developer Supergroup.
3. Send a text or image from WhatsApp:
   - Verify it appears in the Telegram thread.
4. Reply to the message from Telegram:
   - Verify the reply is delivered back to the WhatsApp user.
5. Send "/exit" on WhatsApp:
   - Verify that the chat bridge is disconnected, and the bot menu becomes active again.

---

## 10. Destructive / Bad Scenarios (Trying to Break the App)

These scenarios test the resilience, error-handling, validation, and security boundaries of Cephlow. Perform these steps deliberately to ensure the application fails gracefully, blocks malicious inputs, and prevents unauthorized actions.

### Scenario 10.1: Authentication & JWT Bypass
1. **Tamper with JWT Token**: Intercept an API request using browser developer tools (Network tab) and modify the `Authorization: Bearer <token>` header (e.g. change a few letters in the signature portion).
   - *Expected Outcome*: The API must reject the request immediately with `401 Invalid or expired token` (handled by `authMiddleware`).
2. **Expire the Session**: Keep the React app open for more than 1 hour without any user activity, then try to perform a database-modifying action (e.g., creating a batch).
   - *Expected Outcome*: The app should catch the expired session, prompt you to log in again, and block the action.
3. **Invalid Audience**: Inject a JWT token generated for a different application client.
   - *Expected Outcome*: The API worker must reject the token due to audience mismatch (`aud !== "authenticated"`).

### Scenario 10.2: Workspace Scope Cross-Over (IDOR / Privilege Escalation)
1. **Access Other Workspaces**: Log in as User A (Workspace A) and capture an API request. Manually change the `X-Workspace-Id` header to Workspace B's ID (which User A does not belong to).
   - *Expected Outcome*: The server must return a `403 Not a member of this workspace` error.
2. **IDOR Batch Access**: Attempt to perform a GET or DELETE request on a batch belonging to Workspace B using a URL like `/api/batches/Workspace-B-Batch-ID` while logged in and scoped to Workspace A.
   - *Expected Outcome*: The server must return a `403 Access denied` (blocked by `canAccessBatch`).
3. **Privilege Escalation**: Log in as a workspace user with the role `member`. Try to send a request to rename the workspace (`PATCH /workspaces/:id`) or invite a new member (`POST /workspaces/:id/invites`).
   - *Expected Outcome*: The server must reject the request with `403 Forbidden` because `member` does not pass the `isAdminOrOwner` check.
4. **Bypass Platform Admin**: Send a direct HTTP request to a platform admin endpoint (e.g. `/api/admin/workspaces`).
   - *Expected Outcome*: The server must return `403 Forbidden (PLATFORM_ADMIN_REQUIRED)` (blocked by `requirePlatformAdmin` middleware).

### Scenario 10.3: Malicious Inputs & Injection (XSS & SQLi)
1. **XSS Script Injection**: In the **Create Batch** input field, type a script tag:
   ```html
   <script>alert('hack')</script>
   ```
   - *Expected Outcome*: The input must be rejected by Zod validation with an error message: "Batch name contains invalid or malicious characters" (blocked by `hasXssPayload`).
2. **SQL Injection Attempt**: Try to input classic SQL injection sequences into the Workspace Name or Spreadsheet tab name fields:
   ```sql
   ' OR 1=1 --
   ```
   - *Expected Outcome*: The application must process the string as literal text (creating a workspace actually named `' OR 1=1 --`) and must **not** execute it as SQL commands, since D1 uses native parameterized bindings.
3. **Oversized Input Payload**: Send a JSON payload containing an extremely large batch name (e.g. 5,000 characters).
   - *Expected Outcome*: The Zod schema must reject the input due to the `.max(100)` constraint on the string name.
4. **Corrupted Frame Background Upload**: Attempt to upload a non-image file (e.g., a `.txt` file renamed to `.png`) to the template background upload route.
   - *Expected Outcome*: The endpoint must validate the file content/mime-type and return a `400 Invalid content type` or fail gracefully without saving the file to R2.

### Scenario 10.4: Spreadsheet Editor Abuse & Bad Data
1. **Malformed Emails**: In the spreadsheet editor, enter invalid email strings (e.g., `not_an_email`, `john@`, `@domain.com`) in the mapped email column.
   - *Expected Outcome*: During certificate generation or email delivery, the application should flag these rows as failed and record a validation error rather than attempting to send mail to invalid addresses.
2. **Malformed Phone Numbers**: Enter non-numeric phone values (e.g., `99-88-77-66`, `+91-abcdefghij`) in the WhatsApp column.
   - *Expected Outcome*: The phone normalization function (`normalizePhoneNumber` in [security.ts](file:///c:/Users/AKSHAY/Desktop/code/projects/fork-cephlow/adi-cephlow/cephlow2/apps/api-worker/src/lib/security.ts)) must throw an error, preventing the row from saving or flagging it as failed before dispatch.
3. **Missing Crucial Mapped Columns**: Attempt to generate a batch when the spreadsheet column mapped to the certificate's `Name` placeholder is entirely blank or contains missing cells.
   - *Expected Outcome*: The client-side generation loop must handle the empty cell safely (either falling back to a default value or marking that specific certificate row status as `failed` with an explicit error message).

### Scenario 10.5: Wallet & Webhook Tampering
1. **Negative Recharge Amount**: Send a POST request to `/api/payments/create-order` with a negative amount (e.g., `amount: -100` or `amount: 0.50`).
   - *Expected Outcome*: The order creation must fail and return a validation error because it does not meet the `MIN_RECHARGE_AMOUNT` check.
2. **Fake Payment Callback (Double-Topup)**: Attempt to call `/api/webhooks/cashfree` directly with a captured transaction payload, hoping to double the credit balance.
   - *Expected Outcome*: The backend must detect that the order has already been processed (`processed = 1`) and ignore the duplicate request, and it must verify the payload signature before taking action.
3. **Forged Webhook Signature**: Post a valid-looking JSON payload to `/api/webhooks/cashfree` or `/api/webhooks/whatsapp` but modify or omit the signature headers (`x-webhook-signature` or `X-Hub-Signature-256`).
   - *Expected Outcome*: The API worker must reject the webhook request with `401 Invalid signature` or `401 Missing header` because of cryptographic HMAC mismatch.

### Scenario 10.6: Integration & API Disconnection
1. **Google Account Disconnected Mid-Share**: Revoke Cephlow permissions from your Google Account settings (`myaccount.google.com/permissions`) while a Google Drive folder sharing operation is in progress in the background.
   - *Expected Outcome*: The background worker task (`waitUntil`) must catch the API authorization failure, stop copying PDFs, mark the folder sharing status as `failed` in the database, and display an expired credentials alert.
2. **Delete Active Template in Database**: Access the database directly (or open a parallel tab) and delete the canvas template while a batch is configuring it.
   - *Expected Outcome*: Clicking generate must fail immediately, returning `404 Template not found`, and halt the generation process safely.
3. **Simulate Network Drop**: Disconnect your internet connection during client-side generation.
   - *Expected Outcome*: The browser loop must pause or fail gracefully, updating the batch status in D1 to `partial` (if some certificates were already reported) and logging the failure.

### Scenario 10.7: Account Deletion (Danger Zone Validation)
1. Go to **Settings**.
2. Scroll to the **Danger Zone** section.
3. Verify that the warning message changes based on whether your workspace is approved (paid tier) or unapproved (free tier):
   - *Free User*: "Permanently deletes your account, workspaces, and all certificates. This action is irreversible."
   - *Paid User*: "Wipes your admin access, draft batches, and wallets. Issued certificates remain active and verifiable by recipients."
4. Click **Delete Account** to open the confirmation dialog.
5. Try to click **Permanently Delete My Account** with the text field empty or with a mismatching email.
   - *Expected Outcome*: The delete button is disabled.
6. Type your exact email address and click **Permanently Delete My Account**.
   - *Expected Outcome*:
     - The request is sent to `POST /api/me/delete-account`.
     - The database purges all records for free users, or migrates active certificates to the system dummy owner (`orphaned-system-user` and `orphaned-system-workspace`) for approved users.
     - Your user credentials are deleted from Supabase.
     - You are automatically logged out and redirected to `/login`.

### Scenario 10.8: Terms of Service & Privacy Policy Consent Lock
1. **Google Sign-In on Sign-In page**:
   - Clear your cookies or delete your account to simulate a new user.
   - Go to `/login` (defaulting to the **Sign In** tab where no checkbox is present).
   - Click **Continue with Google** to register a new account.
   - *Expected Outcome*: Upon redirect back to the app, you must be blocked by the full-screen `TermsAgreementScreen` overlay and unable to access the dashboard.
2. **Cancel Agreement**:
   - On the `TermsAgreementScreen` overlay, click **Cancel**.
   - *Expected Outcome*: You are immediately logged out and returned to the Landing / Login page.
3. **Accept Agreement**:
   - Sign back in. When blocked by the `TermsAgreementScreen`, check the box and click **I Agree**.
   - *Expected Outcome*: Consent is saved (`agreed_to_terms: true`) in your user metadata. You are redirected to the dashboard.
4. **Subsequent Logins**:
   - Log out and log back in (using email/password or Google).
   - *Expected Outcome*: You bypass the terms screen and go straight to the dashboard.

### Scenario 10.9: Marketplace Browsing (Unapproved Workspace / No Wallet)
1. Log in as an **unapproved** (free-tier) workspace owner.
2. Go to **Batches** -> **New Batch** (or open an existing draft batch) and click **Design Frame**.
3. Under the Frame selection options, click **Browse Marketplace**.
4. Verify that:
    - The marketplace listings load successfully (rather than spinning indefinitely or remaining empty).
    - You can browse the available templates.
    - No wallet balance is shown or retrieved.
    - Clicking on a template successfully installs/acquires the template and lets you use it in the batch.
