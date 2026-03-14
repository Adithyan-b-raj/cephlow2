// Google Sheets integration using Google access token from Firebase Auth
import { google } from "googleapis";

function getAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

export function getSheetsClient(accessToken: string) {
  const auth = getAuthClient(accessToken);
  return google.sheets({ version: "v4", auth });
}

// Create a new Google Spreadsheet with given column headers in the first row
export async function createSpreadsheetWithHeaders(
  accessToken: string,
  name: string,
  headers: string[]
): Promise<{ id: string; name: string; url: string }> {
  const sheets = getSheetsClient(accessToken);
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
