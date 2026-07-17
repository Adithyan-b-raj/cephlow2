# Product Guidelines: Cephlow

## 1. User Experience (UX) & Design System
Cephlow utilizes a modern design system driven by Tailwind CSS v4 and shadcn/ui. The interface must feel clean, accessible, and highly responsive.
*   **Color Palette:** Dominated by a professional dark mode option, utilizing HSL colors for component design. Use smooth transitions for interactive states.
*   **Typography:** Modern sans-serif typography (e.g., Inter/Outfit) with clean hierarchies.
*   **Responsive Design:** Responsive design first. Layouts must function flawlessly on mobile screens (especially public verification pages and recipient certificate views) as well as desktop administration dashboards.
*   **State Indicators:** Provide explicit loading states (spinners or skeletons) for asynchronous API operations (e.g., fetching sheets, generating certificates).

---

## 2. Component Guidelines (shadcn/ui & Tailwind)
*   **Buttons:** Standardized `Button` states (default, secondary, destructive, ghost).
*   **Toasts:** Strategic use of `useToast` for successful operations (e.g., "Batch created successfully") and detailed error reports (e.g., "Meta WhatsApp API error: Invalid phone number").
*   **Dialogs:** Confirm destructive actions (e.g., deleting a batch) using `AlertDialog`.

---

## 3. Core Workflow Guidelines
*   **Google OAuth Consent Flow:** Keep the authentication flow intuitive. Check if Google is connected on the dashboard and display a prominent reconnect/connect prompt if the session is invalid.
*   **Real-time Progress Bars:** During client-side certificate generation, the interface must render a progress bar from local state (completed vs total). For delivery operations, poll the status API for progress updates.
*   **Validation Rules:**
    *   Validate phone numbers before attempting WhatsApp delivery (normalize to E.164 format: e.g., `+91XXXXXXXXXX`).
    *   Verify mapping placeholders against slide template placeholders before starting generation to catch configuration issues early.

---

## 4. Wallet & Payments UX
*   **Wallet Balance Visuals:** Always display current prepaid balance in the user's header or sidebar.
*   **Transaction Confirmation:** Prompt the user with the expected credit cost before executing any batch generation or delivery. Prevent the action if the balance is insufficient, guiding the user to the top-up wizard.
*   **Regeneration Pricing:** Clearly indicate that visual regeneration costs 20% of the standard generation rate so users understand the reduced cost before confirming.
*   **Delivery Cost Breakdown:** Show separate per-delivery costs (email vs WhatsApp) before starting a send operation.
