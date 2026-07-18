# Plan: Remove Google Slides & Sheets APIs & Enhance Builtin Editor

## Phase 1: Dependency Setup and Backend Cleanup
- [x] Task: Install `xlsx` (SheetJS) and `pdfjs-dist` (PDF.js) dependencies in `apps/cert-app/package.json`.
- [x] Task: Remove Google Sheets routes by deleting `apps/api-worker/src/routes/sheets.ts`.
- [x] Task: Remove Google Slides routes by deleting `apps/api-worker/src/routes/slides.ts`.
- [x] Task: Update `apps/api-worker/src/index.ts` to unregister Sheets and Slides routes and remove the `/api/slides/thumbnail/:fileId` route.
- [x] Task: Update `apps/api-worker/src/routes/batches.ts` to remove Google Sheet fields (`sheetId`, `sheetName`, `tabName`) from batch creation validation.
- [x] Task: Update `apps/api-worker/src/routes/clientGenerate.ts` to bypass Google Slides template data loading and drive folder caching.
- [x] Task: Run backend tests to ensure the Hono API starts and tests pass.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Setup and Backend Cleanup' (Protocol in workflow.md)

## Phase 2: Frontend Wizard & Settings Clean Up
- [ ] Task: Modify `StepDataSource.tsx` to remove the Google Sheets selection tab.
- [ ] Task: Modify `StepTemplate.tsx` to remove Google Slides options, category slide mappings, and multi-template modes.
- [ ] Task: Modify `NewBatch.tsx` to remove Google Picker handles and force `dataSourceKind` and `templateKind` to default to `"inbuilt"` and `"builtin"`.
- [ ] Task: Delete `apps/cert-app/src/hooks/use-google-picker.ts` and `apps/cert-app/src/hooks/use-import-google-sheet.ts`.
- [ ] Task: Update `use-auth.tsx` to remove Google authentication scopes and connection status hooks.
- [ ] Task: Update `Settings.tsx` to remove the "Google Account" connection management UI.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Frontend Wizard & Settings Clean Up' (Protocol in workflow.md)

## Phase 3: Built-in Template Editor Enhancements
- [ ] Task: Add a file upload button and handler to `PropertiesPanel.tsx` in the built-in editor that calls `uploadAssetToR2` to set the template's background image.
- [ ] Task: Integrate dynamic import of `pdfjs-dist` in `PropertiesPanel.tsx` to allow PDF upload, convert page 1 to an image canvas, and upload it as a background.
- [ ] Task: Modify `apps/cert-app/src/lib/clientGenerate.ts` to remove Google Slides batch PDF generation (`generateChunk`, `getGoogleAccessToken`) and keep only the Builtin Template renderer.
- [ ] Task: Run typecheck and verify frontend builds successfully.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Built-in Template Editor Enhancements' (Protocol in workflow.md)
