# Cephlow Certificate Generation Platform

A powerful, automated platform for organizations to generate, manage, and deliver personalized certificates at scale. 

The platform integrates directly with **Google Sheets** for participant data and **Google Slides** for certificate templates. It handles the full lifecycle: generating personalized PDFs, uploading them to cloud storage, delivering them via Email or WhatsApp, and providing a public verification page via QR codes.

---

## 🌟 Key Features

- **Google Workspace Integration:** Connects seamlessly to your Google Drive to read participant data from Sheets and use Slides as highly-customizable certificate templates.
- **Smart Generation & Font Scaling:** Automatically replaces `<<placeholders>>` in templates and intelligently scales down font sizes to ensure long names always fit perfectly on a single line.
- **Multi-Channel Delivery:** Send generated certificates to participants via:
  - **Email:** Uses the Gmail API to send personalized emails with the certificate attached as a PDF.
  - **WhatsApp:** Uses the Meta Graph API to send the certificate document directly to the participant's WhatsApp.
- **Public Verification & QR Codes:** Dynamically injects a unique QR code onto every certificate that links to a public verification page.
- **Prepaid Wallet System:** Integrated with Cashfree Payment Gateway to manage generation quotas and prepaid wallet balances.
- **High-Performance Architecture:** Exports PDFs to Cloudflare R2 for lightning-fast, highly-available public access required by the WhatsApp API.

## 🏗️ Architecture & Tech Stack

This project is structured as a **pnpm monorepo** with shared packages.

### Frontend (`apps/cert-app`)
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **State & Data Fetching:** TanStack React Query (with auto-generated API hooks via Orval)
- **Routing:** React Router v6

### Backend (`apps/api-server`)
- **Framework:** Express.js (deployed via Render.com or Firebase Cloud Functions)
- **Language:** TypeScript
- **Google APIs:** Drive, Sheets, Slides, Gmail
- **Storage:** Cloudflare R2 (AWS S3 SDK) for public PDFs

### Shared Packages (`packages/`)
- `@workspace/firebase`: Shared Firebase Admin SDK initialization and Firestore helpers.
- `@workspace/api-client-react`: Auto-generated API client and React Query hooks.
- `@workspace/api-zod`: Auto-generated Zod schemas and TypeScript types.

### Infrastructure & External Services
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth (Identity) + Google OAuth 2.0 (Permissions)
- **Storage:** Google Drive (Archival) + Cloudflare R2 (Public Edge Storage)
- **Messaging:** Gmail API + Meta WhatsApp Business API
- **Payments:** Cashfree API

## 📚 Documentation

For a comprehensive deep-dive into how every component works, how the authentication flow operates, and how to add new features, please read the **[Full Project Documentation (PROJECT_DOCS.md)](./PROJECT_DOCS.md)**. 

> **Important:** If you are a developer looking to contribute or understand the architecture, `PROJECT_DOCS.md` is your primary resource.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- `pnpm` (installed via `npm install -g pnpm`)
- A Firebase Project
- Google Cloud Console Project (with Drive, Sheets, Slides, and Gmail APIs enabled)
- Cloudflare Account (for R2 Storage)
- Meta Developer Account (for WhatsApp API)

### 1. Installation

```bash
git clone <repository-url>
cd cephlow2
pnpm install
```

### 2. Environment Variables

Create a single `.env` file in the **root** of the repository. See [Section 4 of PROJECT_DOCS.md](./PROJECT_DOCS.md#4-environment-variables--complete-reference) for the complete list of required environment variables for Firebase, Google OAuth, Cloudflare R2, WhatsApp, and Cashfree.

Make sure to place your `firebase-service-account.json` file in the root directory for backend authentication.

### 3. Running Locally

Start the entire monorepo (frontend, backend, and auto-generation watchers) with a single command:

```bash
pnpm run dev
```

- Frontend will be available at `http://localhost:5173`
- Backend API will run on `http://localhost:3000`

### 4. Code Generation

If you modify the backend API routes, update the TypeScript types and React Query hooks by running:

```bash
pnpm --filter @workspace/api-server run generate
```

## 🔐 Security & Authentication

This platform uses a robust **Two-Layer Authentication System**:
1. **Firebase Auth:** Handles user identity ("Who are you?"). The frontend gets a Firebase ID Token and sends it as a Bearer token to the backend.
2. **Google OAuth 2.0:** Handles API permissions ("Can we read your Sheets?"). The backend securely requests and stores refresh tokens to execute offline actions (like background certificate generation) on behalf of the user.

## 📝 License

MIT
