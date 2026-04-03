/**
 * WhatsApp Certificate Bot — Cloudflare Worker
 * Replaces the n8n workflow entirely.
 *
 * Env bindings (set in wrangler.toml or Cloudflare dashboard):
 *   CERTIFICATES    — R2 bucket binding
 *   WA_TOKEN        — WhatsApp Cloud API bearer token  (secret)
 *   VERIFY_TOKEN    — Any string you choose for webhook verification  (secret)
 *   PHONE_NUMBER_ID — Your WhatsApp phone number ID  (secret)
 *   R2_PUBLIC_URL   — e.g. https://pub-xxxx.r2.dev  (no trailing slash)
 */

const PAGE_SIZE = 8; // max 8 certs per list page (2 slots reserved for Prev/Next)

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ── 1. Webhook verification — Meta sends GET with hub.challenge ──
    if (req.method === 'GET') {
      const challenge = url.searchParams.get('hub.challenge');
      const token     = url.searchParams.get('hub.verify_token');
      if (token === env.VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ── 2. Parse incoming WhatsApp webhook payload ───────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg   = value?.messages?.[0];

    // Forward status updates (delivered / read) to the API server
    if (!msg) {
      if (value?.statuses?.length && env.API_URL) {
        // waitUntil keeps the Worker alive until the fetch completes
        ctx.waitUntil(
          fetch(`${env.API_URL}/api/webhooks/whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }).catch(() => {})
        );
      }
      return new Response('OK');
    }

    const phone = value?.contacts?.[0]?.wa_id || msg.from;

    // Extract action from interactive reply or plain text
    const listId   = msg?.interactive?.list_reply?.id;
    const btnId    = msg?.interactive?.button_reply?.id;
    const text     = msg?.text?.body?.trim();
    let   action   = listId || btnId || text || 'greet';

    // Normalize common text inputs
    const t = String(action).toLowerCase();
    if (t === 'hi' || t === 'hello' || t === 'hey') action = 'greet';
    if (t.includes('send all'))                      action = 'send_all';
    if (t.includes('search'))                        action = 'search_cert';

    // R2 folder = phone number without leading "91"
    const folder = phone.replace(/^91/, '') + '/';

    // ── 3. Route to the right handler ───────────────────────────────
    try {
      if (action === 'greet') {
        await handleGreet(phone, env);

      } else if (action === 'send_all') {
        await handleSendAll(phone, folder, env);

      } else if (action === 'search_cert' || action.startsWith('page:')) {
        const page = action.startsWith('page:')
          ? parseInt(action.split(':')[1], 10) || 1
          : 1;
        await handlePagedList(phone, folder, page, env);

      } else if (action.includes('/')) {
        // User picked a specific cert from the list — action is the R2 key
        await handleSendSingle(phone, action, env);

      } else {
        // Unknown input — show the menu
        await handleGreet(phone, env);
      }
    } catch (err) {
      console.error('Handler error:', err);
    }

    return new Response('OK');
  }
};

// ────────────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────────────

/** Send the greeting menu with two buttons */
async function handleGreet(phone, env) {
  await waPost({
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Hi 👋\n\nWhat do you want to do?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'send_all',    title: 'Send all cert'  } },
          { type: 'reply', reply: { id: 'search_cert', title: 'Search a cert'  } }
        ]
      }
    }
  }, env);
}

/** List all files in the folder and send each as a document */
async function handleSendAll(phone, folder, env) {
  const keys = await listFiles(folder, env);

  if (keys.length === 0) {
    await waPost({
      to: phone, type: 'text',
      text: { body: '⚠️ No certificates found for your number.' }
    }, env);
    return;
  }

  // Send a "please wait" text first
  await waPost({
    to: phone, type: 'text',
    text: { body: `📄 Sending ${keys.length} certificate(s)... Please wait 🙂` }
  }, env);

  // Send each file one by one
  for (const key of keys) {
    await waPost({
      to: phone,
      type: 'document',
      document: {
        link: publicUrl(key, env),
        filename: key.split('/').pop()
      }
    }, env);
  }
}

/** Send a paginated interactive list of certificates */
async function handlePagedList(phone, folder, page, env) {
  const keys = await listFiles(folder, env);

  if (keys.length === 0) {
    await waPost({
      to: phone, type: 'text',
      text: { body: '⚠️ No certificates found for your number.' }
    }, env);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(page, 1), totalPages);
  const start      = (safePage - 1) * PAGE_SIZE;
  const slice      = keys.slice(start, start + PAGE_SIZE);

  // Build rows — WhatsApp limits: title ≤ 24 chars, description ≤ 72 chars
  let rows = slice.map(key => {
    const filename    = key.split('/').pop();
    const title       = filename.length > 24 ? filename.slice(0, 21) + '...' : filename;
    const description = filename.length > 72 ? filename.slice(0, 69) + '...' : filename;
    return { id: key, title, description };
  });

  // Navigation rows
  if (safePage > 1)          rows.unshift({ id: `page:${safePage - 1}`, title: '⬅️ Prev', description: '' });
  if (safePage < totalPages) rows.push(   { id: `page:${safePage + 1}`, title: '➡️ Next', description: '' });

  await waPost({
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: 'Select a certificate to receive:' },
      action: {
        button: 'Choose',
        sections: [{ title: `Certs ${safePage}/${totalPages}`, rows }]
      }
    }
  }, env);
}

/** Send a single specific certificate by its R2 key */
async function handleSendSingle(phone, fileKey, env) {
  await waPost({
    to: phone,
    type: 'document',
    document: {
      link: publicUrl(fileKey, env),
      filename: fileKey.split('/').pop()
    }
  }, env);
}

// ────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────

/** List all object keys inside a folder prefix in R2 */
async function listFiles(folder, env) {
  const result = await env.CERTIFICATES.list({ prefix: folder });
  return result.objects
    .map(o => o.key)
    .filter(k => k !== folder && !k.endsWith('/')); // exclude the folder entry itself
}

/** Build the public R2 URL for a key */
function publicUrl(key, env) {
  return `${env.R2_PUBLIC_URL}/${encodeURI(key)}`;
}

/** POST a message to the WhatsApp Cloud API */
async function waPost(payload, env) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${err}`);
  }
}
