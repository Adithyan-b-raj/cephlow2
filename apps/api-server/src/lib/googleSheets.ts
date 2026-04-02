import { google } from "googleapis";
import { getAuthClientForUser } from "./googleAuth.js";

export async function getSheetsClient(uid: string) {
  const auth = await getAuthClientForUser(uid);
  return google.sheets({ version: "v4", auth });
}

export async function createSpreadsheetWithHeaders(
  uid: string,
  name: string,
  headers: string[]
): Promise<{ id: string; name: string; url: string }> {
  const sheets = await getSheetsClient(uid);
  const response = await sheets.spreadsheets.create({
    requestBody: {
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
    },
  });
  const id = response.data.spreadsheetId!;
  const title = response.data.properties?.title || name;
  return {
    id,
    name: title,
    url: `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}
