/**
 * WhatsApp Certificate Bot — Cloudflare Worker
 * Replaces the n8n workflow entirely.
 *
 * Env bindings (set in wrangler.toml or Cloudflare dashboard):
 *   CERTIFICATES    — R2 bucket binding
 *   DB              — D1 database binding (analytics)
 *   WA_TOKEN        — WhatsApp Cloud API bearer token  (secret)
 *   VERIFY_TOKEN    — Any string you choose for webhook verification  (secret)
 *   PHONE_NUMBER_ID — Your WhatsApp phone number ID  (secret)
 *   R2_PUBLIC_URL   — e.g. https://pub-xxxx.r2.dev  (no trailing slash)
 *   ANALYTICS_TOKEN — Password to access the /analytics dashboard  (secret)
 */

const PAGE_SIZE = 8; // max 8 certs per list page (2 slots reserved for Prev/Next)

// Schema is created once per Worker instance (cold start)
let schemaReady = false;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ── Reports list (founders only) ────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/reports') {
      const token = url.searchParams.get('token');
      if (!env.ANALYTICS_TOKEN || token !== env.ANALYTICS_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleReports(env);
    }

    // ── Analytics dashboard (founders only) ─────────────────────────────
    if (req.method === 'GET' && url.pathname === '/analytics') {
      const token = url.searchParams.get('token');
      if (!env.ANALYTICS_TOKEN || token !== env.ANALYTICS_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleAnalytics(env);
    }

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
      const userState = await getUserState(phone, env);
      const stateVal = userState?.state || '';

      // User is describing their issue — capture the text
      if (stateVal.startsWith('report_desc:') && msg.type === 'text' && text) {
        const certKey = stateVal.slice('report_desc:'.length);
        await handleReportText(phone, certKey, text, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'report_submitted', detail: certKey }));
        return new Response('OK');
      }

      // User is browsing certs to pick which one has an issue
      if (stateVal === 'report_selecting') {
        if (action.startsWith('rpage:')) {
          const page = parseInt(action.split(':')[1], 10) || 1;
          await handleReportCertList(phone, folder, page, env);
        } else if (action.includes('/')) {
          // Cert picked — now ask for description
          const certKey = action;
          const certName = certKey.split('/').pop();
          await setUserState(phone, `report_desc:${certKey}`, env);
          await waPost({
            to: phone, type: 'text',
            text: { body: `📝 Please describe your issue with *${certName}*:` }
          }, env);
        } else {
          // Unexpected input while selecting — re-show the list
          await handleReportCertList(phone, folder, 1, env);
        }
        return new Response('OK');
      }

      if (action === 'greet') {
        await handleGreet(phone, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'greet' }));

      } else if (action === 'report_issue') {
        await handleReportIssue(phone, folder, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'report_issue' }));

      } else if (action === 'send_all') {
        await handleSendAll(phone, folder, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'send_all' }));

      } else if (action === 'search_cert' || action.startsWith('page:')) {
        const page = action.startsWith('page:')
          ? parseInt(action.split(':')[1], 10) || 1
          : 1;
        await handlePagedList(phone, folder, page, env);
        ctx.waitUntil(logInteraction(env, {
          phone,
          action: action.startsWith('page:') ? 'page' : 'search_cert',
          detail: String(page),
        }));

      } else if (action.includes('/')) {
        // User picked a specific cert from the list — action is the R2 key
        await handleSendSingle(phone, action, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'send_single', detail: action }));

      } else {
        // Unknown input — show the menu
        await handleGreet(phone, env);
        ctx.waitUntil(logInteraction(env, { phone, action: 'greet' }));
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

/** Send the greeting menu with three buttons */
async function handleGreet(phone, env) {
  await waPost({
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Hi 👋\n\nWhat do you want to do?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'send_all',      title: 'Send all cert'   } },
          { type: 'reply', reply: { id: 'search_cert',   title: 'Search a cert'   } },
          { type: 'reply', reply: { id: 'report_issue',  title: '⚠️ Report Issue'  } },
        ]
      }
    }
  }, env);
}

/** Show the student's cert list so they can pick which one has an issue */
async function handleReportIssue(phone, folder, env) {
  await setUserState(phone, 'report_selecting', env);
  await handleReportCertList(phone, folder, 1, env);
}

/** Paginated cert list for report flow (uses rpage: prefix to avoid clash with search_cert) */
async function handleReportCertList(phone, folder, page, env) {
  const keys = await listFiles(folder, env);

  if (keys.length === 0) {
    await clearUserState(phone, env);
    await waPost({ to: phone, type: 'text', text: { body: '⚠️ No certificates found for your number.' } }, env);
    return;
  }

  if (keys.length === 1) {
    const certName = keys[0].split('/').pop();
    await setUserState(phone, `report_desc:${keys[0]}`, env);
    await waPost({ to: phone, type: 'text', text: { body: `📝 Please describe your issue with *${certName}*:` } }, env);
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

  if (safePage > 1)          rows.unshift({ id: `rpage:${safePage - 1}`, title: '⬅️ Prev', description: '' });
  if (safePage < totalPages) rows.push(   { id: `rpage:${safePage + 1}`, title: '➡️ Next', description: '' });

  await waPost({
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: 'Which certificate has an issue? Select it:' },
      action: {
        button: 'Choose',
        sections: [{ title: `Certs ${safePage}/${totalPages}`, rows }]
      }
    }
  }, env);
}

/** Capture the report text with cert key, save it, and confirm */
async function handleReportText(phone, certKey, text, env) {
  if (env.DB) {
    await ensureSchema(env);
    await env.DB.prepare(
      'INSERT INTO reports (phone, cert_key, message, created_at) VALUES (?, ?, ?, ?)'
    ).bind(phone, certKey, text, new Date().toISOString()).run();
  }
  await clearUserState(phone, env);
  const certName = certKey.split('/').pop();
  await waPost({
    to: phone, type: 'text',
    text: { body: `✅ Thanks! Your issue with *${certName}* has been reported. Our team will review it shortly.` }
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
// User state helpers (for multi-turn flows like issue reporting)
// ────────────────────────────────────────────────────────────────────

async function getUserState(phone, env) {
  if (!env.DB) return null;
  try {
    await ensureSchema(env);
    return await env.DB.prepare(
      'SELECT state FROM user_states WHERE phone = ?'
    ).bind(phone).first() || null;
  } catch { return null; }
}

async function setUserState(phone, state, env) {
  if (!env.DB) return;
  await ensureSchema(env);
  await env.DB.prepare(
    'INSERT OR REPLACE INTO user_states (phone, state, updated_at) VALUES (?, ?, ?)'
  ).bind(phone, state, new Date().toISOString()).run();
}

async function clearUserState(phone, env) {
  if (!env.DB) return;
  await env.DB.prepare('DELETE FROM user_states WHERE phone = ?').bind(phone).run();
}

// ────────────────────────────────────────────────────────────────────
// Analytics
// ────────────────────────────────────────────────────────────────────

async function ensureSchema(env) {
  if (schemaReady || !env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS interactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT NOT NULL,
      action      TEXT NOT NULL,
      detail      TEXT,
      certs_count INTEGER,
      created_at  TEXT NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_states (
      phone      TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS reports (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      phone      TEXT NOT NULL,
      cert_key   TEXT,
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
  // Add cert_key to existing tables that may not have it yet
  await env.DB.prepare(`ALTER TABLE reports ADD COLUMN cert_key TEXT`).run().catch(() => {});
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_created_at ON interactions(created_at)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_action ON interactions(action)`).run();
  schemaReady = true;
}

async function logInteraction(env, { phone, action, detail = null, certsCount = null }) {
  if (!env.DB) return;
  try {
    await ensureSchema(env);
    await env.DB.prepare(
      `INSERT INTO interactions (phone, action, detail, certs_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(phone, action, detail, certsCount, new Date().toISOString()).run();
  } catch (err) {
    console.error('[Analytics] logInteraction failed:', err);
  }
}

async function handleAnalytics(env) {
  if (!env.DB) {
    return new Response('D1 database not configured.', { status: 503 });
  }

  try {
    await ensureSchema(env);

    const [summary, today, thisWeek, daily, monthly, yearly, actions, recent] = await Promise.all([
      // All-time totals
      env.DB.prepare(`
        SELECT COUNT(*) as total_interactions,
               COUNT(DISTINCT phone) as total_users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as total_downloads
        FROM interactions
      `).first(),

      // Today
      env.DB.prepare(`
        SELECT COUNT(DISTINCT phone) as users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as downloads,
               COUNT(*) as interactions
        FROM interactions WHERE DATE(created_at) = DATE('now')
      `).first(),

      // This week
      env.DB.prepare(`
        SELECT COUNT(DISTINCT phone) as users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as downloads
        FROM interactions WHERE created_at >= DATE('now', '-7 days')
      `).first(),

      // Last 30 days by day
      env.DB.prepare(`
        SELECT DATE(created_at) as day,
               COUNT(DISTINCT phone) as users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as downloads
        FROM interactions
        WHERE created_at >= DATE('now', '-30 days')
        GROUP BY day ORDER BY day ASC
      `).all(),

      // Last 12 months by month
      env.DB.prepare(`
        SELECT strftime('%Y-%m', created_at) as month,
               COUNT(DISTINCT phone) as users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as downloads
        FROM interactions
        WHERE created_at >= DATE('now', '-365 days')
        GROUP BY month ORDER BY month ASC
      `).all(),

      // All years
      env.DB.prepare(`
        SELECT strftime('%Y', created_at) as year,
               COUNT(DISTINCT phone) as users,
               SUM(CASE WHEN action IN ('send_all','send_single') THEN 1 ELSE 0 END) as downloads
        FROM interactions GROUP BY year ORDER BY year DESC
      `).all(),

      // Action breakdown (all time)
      env.DB.prepare(`
        SELECT action, COUNT(*) as count
        FROM interactions GROUP BY action ORDER BY count DESC
      `).all(),

      // Recent 50
      env.DB.prepare(`
        SELECT phone, action, detail, created_at
        FROM interactions ORDER BY created_at DESC LIMIT 50
      `).all(),
    ]);

    const html = renderDashboard({ summary, today, thisWeek, daily: daily.results, monthly: monthly.results, yearly: yearly.results, actions: actions.results, recent: recent.results });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    console.error('[Analytics] handleAnalytics error:', err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

function maskPhone(phone) {
  if (!phone || phone.length <= 4) return '****';
  return `****${String(phone).slice(-4)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

const ACTION_LABELS = {
  greet:       'GREET',
  send_all:    'SEND ALL',
  search_cert: 'SEARCH',
  send_single: 'SEND SINGLE',
  page:        'PAGINATE',
};

function renderDashboard({ summary, today, thisWeek, daily, monthly, yearly, actions, recent }) {
  const s  = summary  || {};
  const t  = today    || {};
  const tw = thisWeek || {};

  const dailyLabels = JSON.stringify(daily.map(r => r.day.slice(5))); // show MM-DD only
  const dailyUsers  = JSON.stringify(daily.map(r => r.users));
  const dailyDLs    = JSON.stringify(daily.map(r => r.downloads));

  const totalActions = actions.reduce((sum, r) => sum + (r.count || 0), 0) || 1;

  const actionRows = actions.map(r => {
    const pct = Math.round((r.count / totalActions) * 100);
    return `
    <tr>
      <td>${ACTION_LABELS[r.action] || r.action.toUpperCase()}</td>
      <td style="width:100%;padding:0.5rem 0.75rem">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div style="flex:1;height:6px;background:#e0e0e0;border:1px solid #ccc">
            <div style="width:${pct}%;height:100%;background:#000"></div>
          </div>
          <span style="min-width:2.5rem;text-align:right">${(r.count||0).toLocaleString()}</span>
        </div>
      </td>
      <td style="text-align:right;white-space:nowrap">${pct}%</td>
    </tr>`;
  }).join('');

  const monthlyRows = [...monthly].reverse().map(r => `
    <tr>
      <td>${r.month}</td>
      <td>${(r.users || 0).toLocaleString()}</td>
      <td>${(r.downloads || 0).toLocaleString()}</td>
    </tr>`).join('');

  const yearlyRows = yearly.map(r => `
    <tr>
      <td>${r.year}</td>
      <td>${(r.users || 0).toLocaleString()}</td>
      <td>${(r.downloads || 0).toLocaleString()}</td>
    </tr>`).join('');

  const recentRows = recent.map(r => `
    <tr>
      <td style="font-family:monospace">${maskPhone(r.phone)}</td>
      <td>${ACTION_LABELS[r.action] || r.action.toUpperCase()}</td>
      <td class="recent-detail" style="opacity:0.4">${r.detail || '—'}</td>
      <td style="opacity:0.4;white-space:nowrap">${fmtDate(r.created_at)}</td>
    </tr>`).join('');

  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WA BOT / ANALYTICS</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --b: #fff; --w: #000; --g: #555; --border: 2px solid #000; }
  body { font-family: 'Courier New', Courier, monospace; background: var(--b); color: var(--w); min-height: 100vh; padding: 2rem; font-size: 0.875rem; }

  /* HEADER */
  .header { border-bottom: var(--border); padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 0.5rem; }
  .header h1 { font-size: 1.5rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
  .header .meta { font-size: 0.7rem; color: var(--g); text-align: right; line-height: 1.6; }

  /* STAT GRID */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin-bottom: 2rem; border: var(--border); }
  @media (max-width: 640px) { .stats { grid-template-columns: 1fr 1fr; } }
  .stat { border-right: var(--border); padding: 1.25rem 1.5rem; }
  .stat:last-child { border-right: none; }
  .stat-group { border-bottom: var(--border); display: contents; }
  .stat-label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--g); margin-bottom: 0.5rem; }
  .stat-val { font-size: 2.5rem; font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
  .stat-sub { font-size: 0.65rem; color: var(--g); margin-top: 0.35rem; }

  /* SECTION */
  .section { border: var(--border); margin-bottom: 1.5rem; }
  .section-header { border-bottom: var(--border); padding: 0.6rem 1rem; font-size: 0.7rem; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700; display: flex; justify-content: space-between; }
  .section-body { padding: 1.25rem; }

  /* CHARTS */
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  @media (max-width: 768px) { .charts { grid-template-columns: 1fr; } }
  .chart-box { border: var(--border); }
  .chart-box canvas { display: block; padding: 1rem; }

  /* TABLES */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  @media (max-width: 768px) { .two-col { grid-template-columns: 1fr; } }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th { text-align: left; padding: 0.5rem 0.75rem; font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--g); border-bottom: 1px solid #ccc; font-weight: 700; }
  td { padding: 0.55rem 0.75rem; border-bottom: 1px solid #e5e5e5; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f0f0f0; }
  .empty { padding: 1.5rem 0.75rem; color: var(--g); font-size: 0.75rem; }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #fff; }
  ::-webkit-scrollbar-thumb { background: #bbb; }

  /* ── RESPONSIVE ─────────────────────────────────────────── */
  @media (max-width: 640px) {
    body { padding: 1rem; }
    .header h1 { font-size: 1.1rem; }
    .header .meta { font-size: 0.65rem; }
    .section-header { flex-wrap: wrap; gap: 0.2rem; }
    .stat-val { font-size: 1.75rem !important; }
    /* 2-col stats: remove right border on even cells (hits outer border) */
    .stats .stat:nth-child(2n) { border-right: none; }
  }

  @media (max-width: 420px) {
    /* Stack stats to single column */
    .stats { grid-template-columns: 1fr !important; }
    .stats .stat { border-right: none !important; border-bottom: var(--border); }
    .stats .stat:last-child { border-bottom: none; }
    .stat-val { font-size: 1.5rem !important; }
    /* Tighten padding on small screens */
    .stat { padding: 1rem 1.25rem; }
    .section-body { padding: 0.75rem; }
    /* Recent table: hide detail column */
    .recent-detail { display: none; }
    /* Tighten chart canvas */
    .chart-box canvas { padding: 0.5rem; }
  }

  /* Prevent charts from overflowing on tiny screens */
  .chart-box { overflow: hidden; }
  .chart-box canvas { max-width: 100%; }
</style>
</head>
<body>

<div class="header">
  <h1>WA BOT / ANALYTICS</h1>
  <div class="meta">
    <div>CEPHLOW INTERNAL</div>
    <div>${now} IST</div>
  </div>
</div>

<!-- STAT CARDS: row 1 (all time) -->
<div class="stats" style="margin-bottom:0;border-bottom:none">
  <div class="stat">
    <div class="stat-label">Total Users</div>
    <div class="stat-val">${(s.total_users || 0).toLocaleString()}</div>
    <div class="stat-sub">UNIQUE PHONES</div>
  </div>
  <div class="stat">
    <div class="stat-label">Total Downloads</div>
    <div class="stat-val">${(s.total_downloads || 0).toLocaleString()}</div>
    <div class="stat-sub">CERTS DELIVERED</div>
  </div>
  <div class="stat" style="border-right:none">
    <div class="stat-label">Total Interactions</div>
    <div class="stat-val">${(s.total_interactions || 0).toLocaleString()}</div>
    <div class="stat-sub">ALL TIME</div>
  </div>
</div>

<!-- STAT CARDS: row 2 (today / this week) -->
<div class="stats" style="margin-bottom:2rem;border-top:none">
  <div class="stat">
    <div class="stat-label">Today — Users</div>
    <div class="stat-val" style="font-size:1.75rem">${(t.users || 0).toLocaleString()}</div>
    <div class="stat-sub">${(t.interactions || 0)} INTERACTIONS</div>
  </div>
  <div class="stat">
    <div class="stat-label">Today — Downloads</div>
    <div class="stat-val" style="font-size:1.75rem">${(t.downloads || 0).toLocaleString()}</div>
    <div class="stat-sub">CERTS SENT TODAY</div>
  </div>
  <div class="stat" style="border-right:none">
    <div class="stat-label">This Week</div>
    <div class="stat-val" style="font-size:1.75rem">${(tw.users || 0).toLocaleString()}</div>
    <div class="stat-sub">${(tw.downloads || 0)} DOWNLOADS</div>
  </div>
</div>

<!-- CHARTS -->
<div class="charts">
  <div class="chart-box">
    <div class="section-header"><span>ACTIVE USERS / DAY</span><span>LAST 30 DAYS</span></div>
    <canvas id="usersChart" height="140"></canvas>
  </div>
  <div class="chart-box">
    <div class="section-header"><span>DOWNLOADS / DAY</span><span>LAST 30 DAYS</span></div>
    <canvas id="dlChart" height="140"></canvas>
  </div>
</div>

<!-- ACTION BREAKDOWN -->
<div class="section" style="margin-bottom:1.5rem">
  <div class="section-header"><span>ACTION BREAKDOWN</span><span>ALL TIME</span></div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th style="white-space:nowrap">Action</th><th>Distribution</th><th>Share</th></tr></thead>
      <tbody>${actionRows || `<tr><td colspan="3" class="empty">NO DATA YET</td></tr>`}</tbody>
    </table>
  </div>
</div>

<!-- MONTHLY + YEARLY -->
<div class="two-col">
  <div class="section">
    <div class="section-header"><span>MONTHLY</span><span>LAST 12 MO</span></div>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Month</th><th>Users</th><th>Downloads</th></tr></thead>
        <tbody>${monthlyRows || `<tr><td colspan="3" class="empty">NO DATA YET</td></tr>`}</tbody>
      </table>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><span>YEARLY</span><span>ALL TIME</span></div>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Year</th><th>Users</th><th>Downloads</th></tr></thead>
        <tbody>${yearlyRows || `<tr><td colspan="3" class="empty">NO DATA YET</td></tr>`}</tbody>
      </table>
    </div>
  </div>
</div>

<!-- RECENT ACTIVITY -->
<div class="section">
  <div class="section-header"><span>RECENT ACTIVITY</span><span>LAST 50</span></div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr><th>Phone</th><th>Action</th><th class="recent-detail">Detail</th><th>Time (IST)</th></tr></thead>
      <tbody>${recentRows || `<tr><td colspan="4" class="empty">NO INTERACTIONS YET</td></tr>`}</tbody>
    </table>
  </div>
</div>

<script>
const chartOpts = {
  responsive: true,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#000', titleColor: '#fff', bodyColor: '#fff', borderColor: '#000', borderWidth: 1 } },
  scales: {
    x: { ticks: { color: '#888', font: { family: 'Courier New', size: 10 }, maxRotation: 45 }, grid: { color: '#eee' }, border: { color: '#ccc' } },
    y: { ticks: { color: '#888', font: { family: 'Courier New', size: 10 } }, grid: { color: '#eee' }, border: { color: '#ccc' }, beginAtZero: true }
  }
};

const labels   = ${dailyLabels};
const userData = ${dailyUsers};
const dlData   = ${dailyDLs};

new Chart(document.getElementById('usersChart'), {
  type: 'bar',
  data: { labels, datasets: [{ data: userData, backgroundColor: '#000', borderColor: '#000', borderWidth: 0, borderRadius: 0 }] },
  options: chartOpts
});

new Chart(document.getElementById('dlChart'), {
  type: 'bar',
  data: { labels, datasets: [{ data: dlData, backgroundColor: '#000', borderColor: '#000', borderWidth: 0, borderRadius: 0 }] },
  options: chartOpts
});
</script>
</body>
</html>`;
}

/** Return reports as JSON for the frontend */
async function handleReports(env) {
  if (!env.DB) {
    return new Response('[]', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  await ensureSchema(env);
  const result = await env.DB.prepare(
    'SELECT id, phone, cert_key, message, created_at FROM reports ORDER BY created_at DESC LIMIT 200'
  ).all();
  return new Response(JSON.stringify(result.results), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// ────────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────────

/** List all object keys inside a folder prefix in R2 */
async function listFiles(folder, env) {
  const result = await env.CERTIFICATES.list({ prefix: folder });
  return result.objects
    .filter(o => o.key !== folder && !o.key.endsWith('/'))
    .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
    .map(o => o.key);
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
