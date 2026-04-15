# Product Guidelines: Cephlow2

## Design System & Styling
- **Modern UI Components:** Strictly adhere to the **shadcn/ui** and **Tailwind CSS v4** design language already established in the project.
- **Responsive Architecture:** Maintain the existing **Layout.tsx** shell and sidebar system, ensuring all new pages work on desktop and mobile.
- **Consistent Icons:** Use **Lucide React** for all iconography to match the current interface.

## User Experience (UX) Patterns
- **Multi-Step Wizards:** For complex tasks (like creating batches), follow the multi-step pattern used in the current **NewBatch.tsx**.
- **Real-Time Progress:** Continue using **polling and progress bars** for long-running generation and delivery tasks, as seen in the batch management UI.
- **Optimistic UI:** Utilize **TanStack React Query** mutations for a responsive feel, with proper cache invalidation.

## Technical Standards
- **Monorepo Structure:** Respect the **pnpm workspace** architecture. New features should be organized into either `apps/` or shared `packages/` as appropriate.
- **Type Safety:** Maintain 100% **TypeScript** coverage. New API endpoints must be accompanied by updated **Zod schemas** and generated **API client hooks**.
- **Auth Protocol:** Follow the existing **two-layer auth system**: Firebase Auth for identity and Google OAuth for API permissions (Drive, Gmail, etc.).

## Delivery & Verification
- **Multi-Channel Consistency:** When adding new delivery channels, ensure they provide similar feedback to the existing **Gmail and WhatsApp** flows.
- **Public Verification:** The **public verification page** must remain accessible without login, as it serves as a trusted source for third-party verifiers.
- **R2 Storage Protocol:** All public-facing assets (like PDFs) should be stored in **Cloudflare R2** with the established folder and naming conventions.

## Reliability & Scalability
- **Error Handling:** Use the existing **toast notification** system to inform users of both success and failure during background operations.
- **Background Processing:** Keep generation and delivery logic in the **backend background tasks** to ensure the frontend remains responsive.
- **Verification Trust:** Ensure the **unique QR code link** system remains robust, as it is the core of the verification trust.