import type { Env } from "../types.js";

async function googleFetch(
  url: string,
  options: RequestInit,
  accessToken: string
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  
  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Google API error ${res.status}: ${res.statusText}`;
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.error?.message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return res;
}

// Fetch row values from a spreadsheet range
export async function getSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
  
  const res = await googleFetch(url, { method: "GET" }, accessToken);
  const data = (await res.json()) as any;
  return data.values || [];
}

// Create a new spreadsheet file and write the initial header row
export async function createSpreadsheetWithHeaders(
  accessToken: string,
  name: string,
  headers: string[]
): Promise<{ id: string; name: string; url: string }> {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  const body = {
    properties: { title: name },
    sheets: [
      {
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: headers.map((h) => ({
                  userEnteredValue: { stringValue: h },
                })),
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, accessToken);

  const data = (await res.json()) as any;
  const id = data.spreadsheetId!;
  const title = data.properties?.title || name;
  
  return {
    id,
    name: title,
    url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}
