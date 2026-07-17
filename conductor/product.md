# Product Definition: Cephlow

## 1. Executive Summary & Vision
Cephlow is a high-performance, automated platform designed for organizations to generate, manage, and deliver personalized certificates at scale. By integrating seamlessly with everyday office tools like Google Sheets (for participant data) and Google Slides (for certificate templates), and offering a Builtin Canvas Template Editor for client-side rendering, Cephlow empowers event organizers, educational institutions, and corporate training programs to automate their certificate workflows with minimal technical overhead.

---

## 2. Target Audience & Personas
*   **Educational Institutions & Academies:** Schools, universities, and online bootcamps issuing course completion credentials.
*   **Event & Conference Organizers:** Managers hosting webinars, hackathons, or physical conferences needing to send participation certificates.
*   **Corporate L&D (Learning & Development) Teams:** Human Resource professionals tracking employee training certifications.

---

## 3. Core Features & Functional Requirements

### 3.1 Template Design Options
*   **Google Slides Templates:** Design templates in Google Slides using `<<placeholder>>` notation. Cephlow automatically pulls slide presentations to use as layouts.
*   **Builtin Canvas Editor:** Design certificate templates directly in the application using the drag-and-drop template designer, allowing client-side rendering to bypass external API rate limits.

### 3.2 Automated Processing & Generation
*   **Client-Side Generation:** All certificate generation runs entirely in the browser — the client copies Slides templates, fills placeholders via Google APIs, exports PDFs, and uploads them directly to Cloudflare R2 via presigned URLs.
*   **Data Source Integration:** Authenticate with Google OAuth 2.0 to access files. Select Google Sheets to map recipient details (Name, Email, Phone, Certificate Type).
*   **Smart Font Scaling:** Dynamically scales down font sizes in text boxes if a recipient's name is too long, preventing layout overflow.
*   **QR Code Injection:** Injects a custom QR code onto each certificate linked to a unique verification URL.

### 3.3 Delivery Pipelines
*   **Email Engine:** Deliver personalized messages with certificates attached as PDFs via the Gmail API.
*   **WhatsApp Engine:** Send certificates directly to WhatsApp using the Meta Graph API.

### 3.4 Prepaid Wallet System & Monetization
*   **Credits Management:** Users top up a prepaid wallet via Cashfree Payment Gateway. Default costs: 5 credits per certificate generation (20% for visual regeneration), 1 credit per email delivery, 2 credits per WhatsApp delivery.
*   **Audit Trail:** Detailed history of transactions, credit consumption, and generation reports.

### 3.5 Public Verification Portal
*   **Validation Page:** A simple, high-performance public page where employers or readers scan the certificate's QR code to verify its authenticity against Cloudflare D1 records.

---

## 4. User Journey & Core Flow
1.  **Onboarding:** Register/Login via Supabase Auth -> Connect Google Account via OAuth.
2.  **Campaign Setup:** Choose template (Slides or Canvas) -> Select source data (Sheets).
3.  **Mapping & Preview:** Map spreadsheet columns to placeholders -> Preview sample certificate.
4.  **Wallet Check & Generation:** Ensure adequate wallet balance -> Start batch generation.
5.  **Delivery & Tracking:** Monitor generation and delivery status -> Recipients receive certs and scan QR to verify.
