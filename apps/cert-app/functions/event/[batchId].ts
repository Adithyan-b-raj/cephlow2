// Cloudflare Pages Function — same Open Graph injection as
// functions/event/[slug]/[batchId].ts, for the legacy /event/:batchId URL form.

interface Env {
  VITE_API_URL: string;
}

const CRAWLER_UA = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|Googlebot|bingbot|redditbot|SkypeUriPreview|vkShare|Embedly/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params, env, next } = context;
  const userAgent = request.headers.get("user-agent") || "";

  if (!CRAWLER_UA.test(userAgent)) {
    return next();
  }

  const batchId = String(params.batchId);
  const apiBase = (env.VITE_API_URL || "").replace(/\/$/, "");

  try {
    const apiRes = await fetch(`${apiBase}/api/gallery/${batchId}`);
    if (!apiRes.ok) {
      return next();
    }

    const data = (await apiRes.json()) as {
      batchName?: string;
      bannerUrl?: string | null;
      certificates?: { id: string }[];
    };

    const title = escapeHtml(data.batchName || "Certificate Gallery");
    const recipientCount = data.certificates?.length ?? 0;
    const description = escapeHtml(
      `Find your name and view or download your certificate. ${recipientCount} ${recipientCount === 1 ? "recipient" : "recipients"}.`
    );
    const url = escapeHtml(request.url);
    const imageTag = data.bannerUrl
      ? `<meta property="og:image" content="${escapeHtml(data.bannerUrl)}" />\n    <meta name="twitter:image" content="${escapeHtml(data.bannerUrl)}" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title} — Cephlow Certificate Gallery</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${imageTag}
  </head>
  <body></body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return next();
  }
};
