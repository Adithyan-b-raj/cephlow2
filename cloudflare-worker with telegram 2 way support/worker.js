/**
 * WhatsApp Certificate Bot + Customer Support Bridge — Cloudflare Worker
 *
 * Env bindings (set in wrangler.toml or Cloudflare dashboard):
 *   CERTIFICATES      — R2 bucket binding
 *   WA_TOKEN          — WhatsApp Cloud API bearer token        (secret)
 *   VERIFY_TOKEN      — Any string you choose for WA webhook   (secret)
 *   PHONE_NUMBER_ID   — Your WhatsApp phone number ID          (secret)
 *   R2_PUBLIC_URL     — e.g. https://pub-xxxx.r2.dev           (no trailing slash)
 *   TG_BOT_TOKEN      — Telegram bot token                     (secret)
 *   TG_SUPERGROUP_ID  — Telegram supergroup ID (negative int)  (secret)
 *   SUPABASE_URL      — e.g. https://xxxx.supabase.co          (secret)
 *   SUPABASE_KEY      — Supabase service-role key              (secret)
 *
 * Routes:
 *   GET  /           → WhatsApp webhook verification
 *   POST /           → WhatsApp messages (cert bot + support bridge)
 *   POST /telegram   → Telegram webhook (bridge replies → WhatsApp)
 */

const PAGE_SIZE = 8; // max 8 certs per list page (2 slots reserved for Prev/Next)

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ── Telegram webhook endpoint ────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/telegram') {
      let body;
      try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }
      ctx.waitUntil(handleTelegramWebhook(body, env).catch(console.error));
      return new Response('OK');
    }

    // ── WhatsApp webhook verification — Meta sends GET with hub.challenge ──
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

    // ── Parse incoming WhatsApp webhook payload ──────────────────────
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

    const phone        = value?.contacts?.[0]?.wa_id || msg.from;
    const customerName = value?.contacts?.[0]?.profile?.name || phone;

    const listId = msg?.interactive?.list_reply?.id;
    const btnId  = msg?.interactive?.button_reply?.id;
    const text   = msg?.text?.body?.trim();

    const isInteractive = !!(listId || btnId);
    const isCertCommand = text?.toLowerCase() === '/cert';

    // ── Route: cert bot ──────────────────────────────────────────────
    if (isInteractive || isCertCommand) {
      let action = listId || btnId || 'greet';
      const folder = phone.replace(/^91/, '') + '/';
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
          await handleSendSingle(phone, action, env);
        } else {
          await handleGreet(phone, env);
        }
      } catch (err) {
        console.error('Cert handler error:', err);
      }
      return new Response('OK');
    }

    // ── Route: support bridge — forward text + media to Telegram ─────
    const mediaTypes = ['image', 'document', 'audio', 'voice', 'video', 'sticker'];
    const isMedia    = mediaTypes.includes(msg.type);

    if ((text || isMedia) && env.TG_BOT_TOKEN && env.SUPABASE_URL) {
      ctx.waitUntil(
        handleWhatsAppToTelegram(phone, customerName, msg, env).catch(console.error)
      );
    }

    return new Response('OK');
  }
};

// ════════════════════════════════════════════════════════════════════════
// Support Bridge — WhatsApp → Telegram
// ════════════════════════════════════════════════════════════════════════

async function handleWhatsAppToTelegram(phone, customerName, msg, env) {
  const supergroupId = env.TG_SUPERGROUP_ID;

  // Look up existing thread mapping
  let existing = await sbGet(env, phone);
  let threadId;

  if (existing) {
    threadId = existing.telegram_topic_id;
    // Try forwarding — if the topic was deleted, recreate it
    try {
      await forwardToTelegram(env, supergroupId, threadId, msg);
      return;
    } catch (err) {
      // Telegram errors like "thread not found" or "message thread not found"
      const isDeadThread = /thread|not found|invalid/i.test(err.message);
      if (!isDeadThread) throw err;
      // Delete the stale mapping and fall through to create a new topic
      await sbDelete(env, phone);
    }
  }

  // Create a new Telegram forum topic
  const topicName = `${customerName} | +${phone}`.slice(0, 128);
  const topicRes  = await tgPost(env, 'createForumTopic', {
    chat_id: supergroupId,
    name:    topicName,
  });
  threadId = topicRes.result.message_thread_id;
  await sbInsert(env, { phone_e164: phone, telegram_topic_id: threadId, supergroup_id: supergroupId });

  // Forward the message (text or media)
  await forwardToTelegram(env, supergroupId, threadId, msg);
}

/**
 * Forward a WhatsApp message (text or media) into a Telegram topic.
 * Media is downloaded from WhatsApp then re-uploaded to Telegram.
 */
async function forwardToTelegram(env, chatId, threadId, msg) {
  const base = { chat_id: chatId, message_thread_id: threadId };

  // ── Plain text ──────────────────────────────────────────────────────
  if (msg.type === 'text') {
    await tgPost(env, 'sendMessage', { ...base, text: msg.text.body });
    return;
  }

  // ── Media types ─────────────────────────────────────────────────────
  const mediaMap = {
    image:    { tgMethod: 'sendPhoto',    field: 'photo',    ext: 'jpg'  },
    document: { tgMethod: 'sendDocument', field: 'document', ext: 'bin'  },
    audio:    { tgMethod: 'sendAudio',    field: 'audio',    ext: 'mp3'  },
    voice:    { tgMethod: 'sendVoice',    field: 'voice',    ext: 'ogg'  },
    video:    { tgMethod: 'sendVideo',    field: 'video',    ext: 'mp4'  },
    sticker:  { tgMethod: 'sendSticker',  field: 'sticker',  ext: 'webp' },
  };

  const meta = mediaMap[msg.type];
  if (!meta) return; // unsupported type — skip

  const waMedia  = msg[msg.type];                   // e.g. msg.image, msg.document
  const mediaId  = waMedia.id;
  const caption  = waMedia.caption || msg.text?.body || undefined;
  const filename = waMedia.filename || `file.${meta.ext}`;

  // Step 1 — resolve download URL from WhatsApp
  const infoRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WA_TOKEN}` },
  });
  if (!infoRes.ok) throw new Error(`WA media info ${infoRes.status}`);
  const { url: downloadUrl, mime_type: mimeType } = await infoRes.json();

  // Step 2 — download the binary
  const fileRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${env.WA_TOKEN}` },
  });
  if (!fileRes.ok) throw new Error(`WA media download ${fileRes.status}`);
  const buffer = await fileRes.arrayBuffer();

  // Step 3 — upload to Telegram via multipart/form-data
  const form = new FormData();
  form.append('chat_id',           String(chatId));
  form.append('message_thread_id', String(threadId));
  form.append(meta.field, new Blob([buffer], { type: mimeType }), filename);
  if (caption) form.append('caption', caption);

  const tgRes = await fetch(
    `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${meta.tgMethod}`,
    { method: 'POST', body: form }
  );
  if (!tgRes.ok) {
    const err = await tgRes.text();
    throw new Error(`Telegram ${meta.tgMethod} ${tgRes.status}: ${err}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Support Bridge — Telegram → WhatsApp
// ════════════════════════════════════════════════════════════════════════

async function handleTelegramWebhook(body, env) {
  const msg = body?.message;
  if (!msg) return;

  const chatId   = String(msg.chat?.id);
  const threadId = msg.message_thread_id;

  // Only handle replies inside topics of our supergroup
  if (!threadId || chatId !== String(env.TG_SUPERGROUP_ID)) return;

  // Reverse-lookup: thread id → phone number
  const row = await sbGetByThread(env, threadId);
  if (!row) return;

  const phone = row.phone_e164;

  // ── Plain text ──────────────────────────────────────────────────────
  if (msg.text) {
    await waPost({ to: phone, type: 'text', text: { body: msg.text } }, env);
    return;
  }

  // ── Media ───────────────────────────────────────────────────────────
  // Identify what kind of media this is
  let fileId, mimeType, filename, waType, caption;

  caption = msg.caption || undefined;

  if (msg.photo) {
    // Telegram sends array of sizes — take the largest
    const photo = msg.photo[msg.photo.length - 1];
    fileId   = photo.file_id;
    mimeType = 'image/jpeg';
    filename = 'photo.jpg';
    waType   = 'image';
  } else if (msg.document) {
    fileId   = msg.document.file_id;
    mimeType = msg.document.mime_type || 'application/octet-stream';
    filename = msg.document.file_name || 'file';
    waType   = 'document';
  } else if (msg.audio) {
    fileId   = msg.audio.file_id;
    mimeType = msg.audio.mime_type || 'audio/mpeg';
    filename = msg.audio.file_name || 'audio.mp3';
    waType   = 'audio';
  } else if (msg.voice) {
    fileId   = msg.voice.file_id;
    mimeType = msg.voice.mime_type || 'audio/ogg';
    filename = 'voice.ogg';
    waType   = 'audio'; // WhatsApp has no separate "voice" type — send as audio
  } else if (msg.video) {
    fileId   = msg.video.file_id;
    mimeType = msg.video.mime_type || 'video/mp4';
    filename = msg.video.file_name || 'video.mp4';
    waType   = 'video';
  } else if (msg.sticker) {
    fileId   = msg.sticker.file_id;
    mimeType = msg.sticker.is_animated || msg.sticker.is_video
      ? 'video/webm'
      : 'image/webp';
    filename = 'sticker.webp';
    waType   = 'image'; // WhatsApp doesn't support .webp stickers natively — send as image
  } else {
    return; // unsupported type
  }

  // Step 1 — get Telegram file path
  const fileInfo = await tgPost(env, 'getFile', { file_id: fileId });
  const filePath = fileInfo.result.file_path;

  // Step 2 — download from Telegram
  const dlRes = await fetch(
    `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${filePath}`
  );
  if (!dlRes.ok) throw new Error(`TG download ${dlRes.status}`);
  const buffer = await dlRes.arrayBuffer();

  // Step 3 — upload to WhatsApp Media API to get a media_id
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const uploadRes = await fetch(
    `https://graph.facebook.com/v19.0/${env.PHONE_NUMBER_ID}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${env.WA_TOKEN}` }, body: form }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`WA media upload ${uploadRes.status}: ${err}`);
  }
  const { id: mediaId } = await uploadRes.json();

  // Step 4 — send to customer
  const mediaPayload = { id: mediaId };
  if (caption)           mediaPayload.caption  = caption;
  if (waType === 'document' && filename) mediaPayload.filename = filename;

  await waPost({ to: phone, type: waType, [waType]: mediaPayload }, env);
}

// ════════════════════════════════════════════════════════════════════════
// Supabase helpers  (REST API — no npm required)
// ════════════════════════════════════════════════════════════════════════

/** Fetch the thread row by phone number (returns first match or null) */
async function sbGet(env, phone) {
  const url = `${env.SUPABASE_URL}/rest/v1/wa_tg_threads`
    + `?phone_e164=eq.${encodeURIComponent(phone)}`
    + `&supergroup_id=eq.${encodeURIComponent(env.TG_SUPERGROUP_ID)}`
    + `&limit=1`;
  const res  = await sbFetch(env, url);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** Fetch the thread row by telegram_topic_id (returns first match or null) */
async function sbGetByThread(env, threadId) {
  const url = `${env.SUPABASE_URL}/rest/v1/wa_tg_threads`
    + `?telegram_topic_id=eq.${encodeURIComponent(threadId)}`
    + `&limit=1`;
  const res  = await sbFetch(env, url);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** Delete mapping row(s) for a phone number */
async function sbDelete(env, phone) {
  const url = `${env.SUPABASE_URL}/rest/v1/wa_tg_threads`
    + `?phone_e164=eq.${encodeURIComponent(phone)}`
    + `&supergroup_id=eq.${encodeURIComponent(env.TG_SUPERGROUP_ID)}`;
  await sbFetch(env, url, { method: 'DELETE' });
}

/** Insert a new mapping row */
async function sbInsert(env, row) {
  const url = `${env.SUPABASE_URL}/rest/v1/wa_tg_threads`;
  await sbFetch(env, url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body:    JSON.stringify(row),
  });
}

function sbFetch(env, url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      apikey:        env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      ...opts.headers,
    },
  });
}

// ════════════════════════════════════════════════════════════════════════
// Telegram helper
// ════════════════════════════════════════════════════════════════════════

async function tgPost(env, method, payload) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram ${method} ${res.status}: ${err}`);
  }
  return res.json();
}

// ════════════════════════════════════════════════════════════════════════
// Certificate Bot handlers
// ════════════════════════════════════════════════════════════════════════

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

async function handleSendAll(phone, folder, env) {
  const keys = await listFiles(folder, env);

  if (keys.length === 0) {
    await waPost({
      to: phone, type: 'text',
      text: { body: '⚠️ No certificates found for your number.' }
    }, env);
    return;
  }

  await waPost({
    to: phone, type: 'text',
    text: { body: `📄 Sending ${keys.length} certificate(s)... Please wait 🙂` }
  }, env);

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

  let rows = slice.map(key => {
    const filename    = key.split('/').pop();
    const title       = filename.length > 24 ? filename.slice(0, 21) + '...' : filename;
    const description = filename.length > 72 ? filename.slice(0, 69) + '...' : filename;
    return { id: key, title, description };
  });

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

// ════════════════════════════════════════════════════════════════════════
// Shared utilities
// ════════════════════════════════════════════════════════════════════════

async function listFiles(folder, env) {
  const result = await env.CERTIFICATES.list({ prefix: folder });
  return result.objects
    .map(o => o.key)
    .filter(k => k !== folder && !k.endsWith('/'));
}

function publicUrl(key, env) {
  return `${env.R2_PUBLIC_URL}/${encodeURI(key)}`;
}

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
