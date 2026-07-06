# Specification: Spreadsheet Editor Bug Fixes

## Overview
Address critical bugs in the client-side spreadsheet editor:
1. **Column Naming Sequence**: When adding new columns manually or via paste/import, they should follow the standard Google Sheets/Excel alphabetical naming scheme (A, B, C... Z, AA, AB... etc.) instead of the generic `"Column X"` format.
2. **Unsaved Changes Banner Race Condition**: Fix the issue where saving a spreadsheet successfully still leaves the unsaved changes warning dialog active when trying to navigate away or click back.

## Functional Requirements

### 1. Alphabetical Column Naming
- When clicking the "+ Col" button, the newly added column must be named based on its index using the standard spreadsheet alphabetical system:
  - 0: `A`, 1: `B`, ..., 25: `Z`, 26: `AA`, 27: `AB`, etc.
- When pasting TSV data that exceeds the current columns length, the dynamically generated columns must also use the alphabetical sequence.

### 2. Unsaved Changes Flag & Save Synchronization
- Synchronously commit any active cell edits (the input currently focused and being edited) *before* executing the save.
- Once the save operation is triggered, the saved snapshot `savedRef.current` must match the actual committed state.
- Keep `savedRef.current` in sync with `initialData` and `initialName` props from the parent component, resetting the dirty flag (`isDirty`) to `false` when they update (indicating the parent has successfully updated and persisted the data).

## Acceptance Criteria
1. Adding columns sequentially generates names `A`, `B`, `C` ... `Z`, `AA`, `AB` etc.
2. Pasting TSV data that grows columns utilizes the alphabetical column generator.
3. Clicking Save with an active edit cursor commits the cell's changes to the backend.
4. Saving a spreadsheet (both new and existing) and then immediately navigating back does not prompt the "Discard unsaved changes?" dialog.

## Out of Scope
- Complete Excel/Sheets formula support.
- Cell formatting or style persistence (bold, colors, etc.).
