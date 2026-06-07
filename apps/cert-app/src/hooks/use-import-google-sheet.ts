import { useCallback, useState } from "react";
import { createSpreadsheet } from "@workspace/api-client-react";
import { useGooglePicker } from "./use-google-picker";

const MIN_ROWS = 50;
const MIN_COLS = 14;
const EXTRA_COL_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function padToMinSize(columns: string[], rows: Record<string, string>[]): { columns: string[]; rows: Record<string, string>[] } {
  let cols = [...columns];

  // Add extra columns if fewer than MIN_COLS, using letters not already taken
  if (cols.length < MIN_COLS) {
    const taken = new Set(cols.map(c => c.toUpperCase()));
    for (const letter of EXTRA_COL_LABELS) {
      if (cols.length >= MIN_COLS) break;
      if (!taken.has(letter)) { cols.push(letter); taken.add(letter); }
    }
    // If still short (e.g. many single-letter cols exist), append Col_N
    let n = 1;
    while (cols.length < MIN_COLS) { cols.push(`Col_${n++}`); }
  }

  const emptyRow = () => Object.fromEntries(cols.map(c => [c, ""]));
  const paddedRows = rows.map(r => {
    const full = emptyRow();
    for (const k of Object.keys(r)) { if (k in full || columns.includes(k)) full[k] = r[k]; }
    return full;
  });
  while (paddedRows.length < MIN_ROWS) paddedRows.push(emptyRow());

  return { columns: cols, rows: paddedRows };
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { current.push(field); field = ""; }
      else if (ch === "\n") { current.push(field); records.push(current); current = []; field = ""; }
      else if (ch !== "\r") { field += ch; }
    }
  }
  if (field || current.length > 0) { current.push(field); records.push(current); }

  if (records.length === 0) return { columns: [], rows: [] };
  const columns = records[0].map(c => c.trim()).filter(Boolean);
  const rows = records.slice(1)
    .filter(r => r.some(c => c.trim()))
    .map(r => {
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => { obj[col] = r[i]?.trim() ?? ""; });
      return obj;
    });
  return { columns, rows };
}

export function useImportGoogleSheet() {
  const { openPicker } = useGooglePicker();
  const [importing, setImporting] = useState(false);

  const importSheet = useCallback(async (): Promise<{ id: string; name: string } | null> => {
    const picked = await openPicker("sheet");
    if (!picked) return null;

    setImporting(true);
    try {
      const authHeader = { Authorization: `Bearer ${picked.accessToken}` };

      // Use the Sheets API v4 values endpoint — works with spreadsheets scope,
      // no file-size cap, and returns structured row arrays directly.
      const sheetsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(picked.id)}/values/A:ZZZ`,
        { headers: authHeader }
      );

      if (!sheetsRes.ok) {
        const body = await sheetsRes.text().catch(() => "");
        throw new Error(`Failed to read sheet (${sheetsRes.status}): ${body || sheetsRes.statusText}`);
      }

      const sheetsData = await sheetsRes.json();
      const allValues: string[][] = sheetsData.values || [];
      if (allValues.length === 0) throw new Error("The spreadsheet appears to be empty.");

      const rawHeaders = allValues[0].map((h: string) => String(h).trim()).filter(Boolean);
      if (rawHeaders.length === 0) throw new Error("The first row has no column headers.");

      const parsed = {
        columns: rawHeaders,
        rows: allValues.slice(1)
          .filter((r: string[]) => r.some((c: string) => String(c).trim()))
          .map((r: string[]) => {
            const obj: Record<string, string> = {};
            rawHeaders.forEach((col: string, i: number) => { obj[col] = String(r[i] ?? "").trim(); });
            return obj;
          }),
      };

      const { columns, rows } = padToMinSize(parsed.columns, parsed.rows);

      const created = await createSpreadsheet({ name: picked.name, columns, rows });
      return { id: created.id, name: created.name };
    } finally {
      setImporting(false);
    }
  }, [openPicker]);

  return { importSheet, importing };
}
