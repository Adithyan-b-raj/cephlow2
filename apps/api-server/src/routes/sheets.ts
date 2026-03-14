import { Router, type IRouter } from "express";
import { getSheetsClient, createSpreadsheetWithHeaders } from "../lib/googleSheets.js";
import { listSheetFiles } from "../lib/googleDrive.js";

const router: IRouter = Router();

// Create a new Google Sheet with given column headers
router.post("/sheets", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const { name, headers } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: "headers must be a non-empty array" });
    }
    const result = await createSpreadsheetWithHeaders(accessToken, name, headers);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all Google Sheets from Drive
router.get("/sheets", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const files = await listSheetFiles(accessToken);
    res.json({ sheets: files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get headers and rows from a specific sheet
router.get("/sheets/:sheetId/data", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const { sheetId } = req.params;
    const tabName = (req.query.tabName as string) || undefined;
    const sheets = getSheetsClient(accessToken);

    const range = tabName ? `${tabName}` : undefined;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range || "A:ZZ",
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return res.json({ headers: [], rows: [], totalRows: 0 });
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] as string) || "";
      });
      return obj;
    });

    res.json({ headers, rows: dataRows, totalRows: dataRows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
