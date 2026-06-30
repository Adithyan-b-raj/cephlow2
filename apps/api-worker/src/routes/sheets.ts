import { Hono } from "hono";
import { getAccessToken } from "../lib/google-auth.js";
import { createSpreadsheetWithHeaders, getSpreadsheetValues } from "../lib/google-sheets.js";
import { listSheetFiles } from "../lib/google-drive.js";

const router = new Hono<ContextEnv>();

// Create a new spreadsheet with headers
router.post("/sheets", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { name, headers } = await c.req.json().catch(() => ({}));
    if (!name) return c.json({ error: "name is required" }, 400);
    if (!Array.isArray(headers) || headers.length === 0) {
      return c.json({ error: "headers must be a non-empty array" }, 400);
    }

    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "sheets");
    const result = await createSpreadsheetWithHeaders(accessToken, name, headers);
    
    return c.json(result, 201);
  } catch (err: any) {
    console.error("Failed to create sheet:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// List spreadsheet files
router.get("/sheets", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "sheets");
    const files = await listSheetFiles(accessToken);
    return c.json({ sheets: files });
  } catch (err: any) {
    console.error("Failed to list sheets:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// Get data from a specific sheet range
router.get("/sheets/:sheetId/data", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { sheetId } = c.req.param();
    const tabName = c.req.query("tabName") || undefined;
    
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "sheets");

    const headerPrefix = tabName ? `${tabName}!` : "";
    
    // 1. Fetch header row (Row 1)
    const headerRows = await getSpreadsheetValues(accessToken, sheetId, `${headerPrefix}1:1`);
    const headerRow = headerRows[0] ?? [];
    
    const colCount = headerRow.length || 1;
    const colLetter = colCount <= 26
      ? String.fromCharCode(64 + colCount)
      : String.fromCharCode(64 + Math.floor((colCount - 1) / 26)) +
        String.fromCharCode(65 + ((colCount - 1) % 26));
        
    const range = `${headerPrefix}A:${colLetter}`;
    
    // 2. Fetch full spreadsheet data range
    const allRows = await getSpreadsheetValues(accessToken, sheetId, range);

    if (allRows.length === 0) {
      return c.json({ headers: [], rows: [], totalRows: 0 });
    }

    const headers = allRows[0] as string[];
    const dataRows = allRows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] as string) || "";
      });
      return obj;
    });

    return c.json({ headers, rows: dataRows, totalRows: dataRows.length });
  } catch (err: any) {
    console.error("Failed to fetch sheet data:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

export default router;
