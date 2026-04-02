import { Router, type IRouter } from "express";
import { getSheetsClient, createSpreadsheetWithHeaders } from "../lib/googleSheets.js";
import { listSheetFiles } from "../lib/googleDrive.js";

const router: IRouter = Router();

router.post("/sheets", async (req, res) => {
  try {
    const { name, headers } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: "headers must be a non-empty array" });
    }
    const result = await createSpreadsheetWithHeaders(req.user!.uid, name, headers);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/sheets", async (req, res) => {
  try {
    const files = await listSheetFiles(req.user!.uid);
    res.json({ sheets: files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/sheets/:sheetId/data", async (req, res) => {
  try {
    const { sheetId } = req.params;
    const tabName = (req.query.tabName as string) || undefined;
    const sheets = await getSheetsClient(req.user!.uid);

    const headerPrefix = tabName ? `${tabName}!` : "";
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${headerPrefix}1:1`,
    });
    const headerRow = headerResponse.data.values?.[0] ?? [];
    const colCount = headerRow.length || 1;
    const colLetter = colCount <= 26
      ? String.fromCharCode(64 + colCount)
      : String.fromCharCode(64 + Math.floor((colCount - 1) / 26)) +
        String.fromCharCode(65 + ((colCount - 1) % 26));
    const range = `${headerPrefix}A:${colLetter}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return res.json({ headers: [], rows: [], totalRows: 0 });
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] as string) || ""; });
      return obj;
    });

    res.json({ headers, rows: dataRows, totalRows: dataRows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
