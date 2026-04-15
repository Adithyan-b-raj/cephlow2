# Technology Stack: Cephlow2

## Core Languages & Runtimes
- **TypeScript:** Primary programming language used across the entire monorepo for type safety and developer productivity.
- **Node.js:** Runtime environment for the API server and scripts.

## Project Structure
- **Monorepo:** Managed with **pnpm workspaces**, allowing for shared packages (`packages/`) and multiple applications (`apps/`).
- **Shared Packages:**
  - `@workspace/firebase`: Shared Firebase Admin SDK setup and Firestore helpers.
  - `@workspace/api-client-react`: Auto-generated API client and React Query hooks.
  - `@workspace/api-zod`: Shared Zod schemas and TypeScript types.

## Frontend (cert-app)
- **React (v19):** UI library for building the web interface.
- **Vite:** Build tool and development server for high-performance frontend development.
- **Tailwind CSS (v4):** Utility-first CSS framework for modern styling.
- **shadcn/ui:** Reusable UI components for a consistent design system.
- **TanStack React Query:** Server state management and API data fetching.
- **Lucide React:** Icon library for consistent UI elements.

## Backend (api-server)
- **Express.js:** Web framework for handling API routes and middleware.
- **Firebase Cloud Functions:** Serves as the primary deployment target for the backend Express app.
- **Google OAuth 2.0:** Manages user permissions for accessing Drive, Sheets, Slides, and Gmail.

## Database & Storage
- **Firestore (Firebase):** NoSQL document database for storing batch, certificate, and user metadata.
- **Cloudflare R2:** S3-compatible object storage used for public-facing certificate PDFs.
- **Google Drive:** Used for storing intermediate Google Slides and PDF files within the user's account.

## External API Integrations
- **Google Sheets API:** Used for reading participant data from user-provided spreadsheets.
- **Google Slides API:** Used for generating personalized certificates from slide templates.
- **Gmail API:** Used for sending certificate delivery emails from the user's Gmail account.
- **WhatsApp Business Cloud API:** Used for sending certificates via WhatsApp document templates.

## Deployment & DevOps
- **Firebase Hosting:** Hosting for the React frontend.
- **Firebase CLI:** Used for deploying functions and hosting.
- **Render.com:** Alternative deployment platform for the backend and frontend.