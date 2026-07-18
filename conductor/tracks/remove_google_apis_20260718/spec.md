# Specification: Remove Google Sheets & Slides APIs & Enhance Builtin Editor

## Overview
This track removes Google Slides and Google Sheets integrations from Cephlow's campaign creation wizard and API. Instead, it promotes the fully client-side **Inbuilt Spreadsheet** and **Builtin Canvas Template Editor**. To make these features frictionless alternatives to Google Slides/Sheets, we will add support for CSV/Excel/TSV/ODS file imports into the Inbuilt Spreadsheet, and local image/PDF background uploads to the Builtin Template Editor. Google Drive and general Google OAuth utilities are retained for now.

## Functional Requirements
1. **Spreadsheet Imports (Data Source):**
   - Remove Google Sheets from the wizard data source selection.
   - In the Inbuilt Spreadsheet view, add an "Import File" option.
   - Use `xlsx` (SheetJS) to parse `.csv`, `.xlsx`, `.xls`, `.tsv`, and `.ods` files client-side and populate the spreadsheet grid.
2. **Builtin Template Editor Backgrounds (Template Setup):**
   - Remove Google Slides from the wizard template selection.
   - In the Builtin Template Editor properties panel, add a "Background Image Upload" section.
   - Allow uploading PNG, JPG, or PDF files.
   - For PDF files, convert the first page to a high-resolution image client-side using `pdfjs-dist`.
   - Upload the resulting image file to Cloudflare R2 using the existing `uploadAssetToR2` function.
   - Save the public URL as the canvas's `backgroundImage`.
3. **API Route Deletions:**
   - Delete Google Sheets API endpoints (`/api/sheets/*`).
   - Delete Google Slides API endpoints (`/api/slides/*`).
   - Remove related route registration and slide thumbnail proxy in `apps/api-worker/src/index.ts`.
4. **UI Clean Up:**
   - Remove Google Sheets & Slides references from the Campaign Setup steps (`StepDataSource.tsx`, `StepTemplate.tsx`, `NewBatch.tsx`).
   - Remove Google Sheets & Slides connection status cards from the Settings page.

## Acceptance Criteria
1. The batch wizard only offers "Inbuilt Spreadsheet" (data source) and "Builtin Template Editor" (templates).
2. Users can upload CSV, Excel, TSV, and ODS files to the Inbuilt Spreadsheet successfully.
3. Users can upload PNG, JPEG, or PDF certificate templates, which are automatically hosted on R2 and set as the background image.
4. Google Sheets and Google Slides API routes are deleted and no longer exposed.
5. All backend tests pass successfully.
