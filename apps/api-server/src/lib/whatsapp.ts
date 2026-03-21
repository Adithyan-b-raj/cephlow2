const WA_API_VERSION = "v18.0";
const TEMPLATE_NAME = "document_sender";

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export async function sendWhatsAppDocument(
  to: string,
  documentUrl: string,
  filename: string,
  var1: string, // {{1}} = participant name
  var2: string, // {{2}} = event name
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en";

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: templateLanguage },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                link: documentUrl,
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
          ],
        },
      ],
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as any;
    throw new Error(
      data?.error?.message || `WhatsApp API error: ${res.status} ${res.statusText}`,
    );
  }
}
