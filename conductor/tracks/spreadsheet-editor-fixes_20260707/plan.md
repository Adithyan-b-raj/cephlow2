# Implementation Plan: Spreadsheet Editor Bug Fixes

## Phase 1: Spreadsheet Editor Bug Fixes [checkpoint: ]
- [ ] Task: Column Naming Sequence
    - [ ] Write unit tests for `getColumnName` utility in `apps/cert-app/src/lib/utils.test.ts`
    - [ ] Implement `getColumnName` in `apps/cert-app/src/lib/utils.ts`
    - [ ] Refactor `SpreadsheetEditorUI.tsx` to use `getColumnName` when adding columns or pasting data
- [ ] Task: Unsaved Changes Flag & Save Synchronization
    - [ ] Synchronously commit active cell edits in `handleSaveClick` before calling `onSave`
    - [ ] Add `useEffect` in `SpreadsheetEditorUI.tsx` to sync `savedRef.current` and reset `isDirty` when `initialData` or `initialName` props change
- [ ] Task: Conductor - User Manual Verification 'Spreadsheet Editor Bug Fixes' (Protocol in workflow.md)
