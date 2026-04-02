import { google } from "googleapis";
import { getAuthClientForUser } from "./googleAuth.js";

async function getGmailClient(uid: string) {
  const auth = await getAuthClientForUser(uid);
  return google.gmail({ version: "v1", auth });
}

export async function sendEmail(
  uid: string,
  {
    to,
    subject,
    body,
    pdfBuffer,
    pdfFilename,
  }: {
    to: string;
    subject: string;
    body: string;
    pdfBuffer?: Buffer;
    pdfFilename?: string;
  }
) {
  const gmail = await getGmailClient(uid);

  const boundary = "cert_boundary_" + Date.now();
  let message: string;

  if (pdfBuffer) {
    const pdfBase64 = pdfBuffer.toString("base64");
    const filename = pdfFilename || "certificate.pdf";
    message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      body,
      "",
      `--${boundary}`,
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      pdfBase64,
      "",
      `--${boundary}--`,
    ].join("\n");
  } else {
    message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\n");
  }

  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
