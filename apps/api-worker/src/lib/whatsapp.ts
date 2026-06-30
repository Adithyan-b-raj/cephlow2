import type { Env } from "../types.js";

const WA_API_VERSION = "v18.0";

export function isWhatsAppConfigured(env: Env): boolean {
  return !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);
}

export async function sendWhatsAppDocument(
  env: Env,
  to: string,
  documentUrl: string,
  filename: string,
  var1: string, // {{1}} = participant name
  var2: string, // {{2}} = event name
  var3: string, // {{3}} = email prefix (profile URL slug)
  certKey?: string, // R2 key
): Promise<string> {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  const templateLanguage = env.WHATSAPP_TEMPLATE_LANGUAGE || "en";
  const templateName = env.WHATSAPP_TEMPLATE_NAME || "document_senderv3";

  // Append a cache-buster to force WhatsApp to re-fetch the document
  const separator = documentUrl.includes("?") ? "&" : "?";
  const freshUrl = `${documentUrl}${separator}_cb=${Date.now()}`;

  const components: object[] = [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: freshUrl,
            filename,
          },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: var1 },
        { type: "text", text: var2 },
        { type: "text", text: var3 },
      ],
    },
    {
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [
        { type: "text", text: var3 },
      ],
    },
  ];

  if (certKey) {
    const payload = `report:${certKey}`.slice(0, 128);
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: 1,
      parameters: [{ type: "payload", payload }],
    });
  }

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components,
    },
  };

  console.log(`[WhatsApp] Sending to=${to} docUrl=${freshUrl} lang=${templateLanguage} var1=${var1} var2=${var2} var3=${var3}`);

  const res = await fetch(
    `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = (await res.json().catch(() => ({}))) as any;
  console.log(`[WhatsApp] API response status=${res.status}`, JSON.stringify(data));

  if (!res.ok) {
    const errMsg = data?.error?.message || `WhatsApp API error: ${res.status} ${res.statusText}`;
    const errDetails = data?.error?.error_data?.details || data?.error?.error_subcode || "";
    throw new Error(errDetails ? `${errMsg} — ${errDetails}` : errMsg);
  }

  const wamid: string = data?.messages?.[0]?.id ?? "";
  return wamid;
}
