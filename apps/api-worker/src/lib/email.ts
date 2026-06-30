import type { Env } from "../types.js";

const ZEPTO_API = "https://api.zeptomail.in/v1.1/email";
const FROM_NAME = "Cephlow Certificates";

export async function sendEmail(
  env: Env,
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
    pdfBuffer?: ArrayBuffer | Uint8Array | string;
    pdfFilename?: string;
  }
) {
  const fromEmail = env.ZEPTOMAIL_FROM_EMAIL || "certificate@cephlow.in";
  const payload: Record<string, any> = {
    from: { address: fromEmail, name: FROM_NAME },
    to: [{ email_address: { address: to } }],
    subject,
    textbody: body,
  };

  if (pdfBuffer) {
    let base64Content = "";
    if (typeof pdfBuffer === "string") {
      base64Content = pdfBuffer;
    } else {
      // Decode ArrayBuffer/Uint8Array to binary string, then encode to base64
      const bytes = new Uint8Array(pdfBuffer);
      let binary = "";
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64Content = btoa(binary);
    }

    payload.attachments = [
      {
        content: base64Content,
        mime_type: "application/pdf",
        name: pdfFilename || "certificate.pdf",
      },
    ];
  }

  const res = await fetch(ZEPTO_API, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": env.ZEPTOMAIL_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ZeptoMail error ${res.status}: ${JSON.stringify(err)}`);
  }
}
