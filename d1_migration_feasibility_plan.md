# Feasibility & Implementation Plan: Supabase PostgreSQL → Cloudflare D1

This document analyzes the feasibility of migrating Cephlow's database layer from **Supabase PostgreSQL** to **Cloudflare D1 (SQLite)**, while keeping **Supabase Auth** as the identity provider. 

---

## 1. Feasibility Study (Is it fine to migrate?)

Yes, it is highly feasible. SQLite (via D1) is more than capable of handling Cephlow's data structure. 

### Dialect Compatibility Assessment

| PostgreSQL Feature | D1 (SQLite) Alternative | Impact & Workaround |
|---|---|---|
| **UUID** | `TEXT` | D1 stores UUIDs as 36-character text strings. We can use Web Crypto `crypto.randomUUID()` in the Worker to generate them. |
| **TIMESTAMPTZ** | `TEXT` | D1 stores timestamps as ISO-8601 strings (e.g., `YYYY-MM-DDTHH:MM:SS.SSSZ`). SQLite date/time functions handle this natively. |
| **JSON / JSONB** | `TEXT` | D1 has no native JSON column type. We will store JSON data (like `column_map`, `row_data`) as strings. Hono/Worker will handle `JSON.parse` and `JSON.stringify` automatically. |
| **Row Level Security (RLS)** | **Application-Level Checks** | In Supabase, RLS policies prevent unauthorized database operations. In Workers, **our middleware checks workspace and user ownership before executing queries**, making RLS unnecessary. |
| **Foreign Keys to `auth.users`** | `TEXT` columns (no FK enforcement) | D1 cannot enforce foreign keys pointing to Supabase Auth tables. Our Worker will match the `owner_id` or `user_id` fields against the verified JWT payload (`req.user.uid`). |

### Database Transaction Assessment (Crucial)

D1 does not support nested `SELECT ... FOR UPDATE` locks. Instead, D1 uses **Batch Statements** (`db.batch([stmt1, stmt2, ...])`) which run sequentially in a single transaction on the database thread. This ensures atomic execution for money deductions, topups, and purchases.

---

## 2. Porting PostgreSQL RPCs to D1 Batch Transactions

Here is the exact translation of your Supabase PL/pgSQL stored procedures into Cloudflare Worker JS logic:

### RPC 1: `start_batch_generation` (Deducts money & starts generation)
* **PG Logic:** Locks `workspaces` table, checks balance, updates balance, updates `certificates` status, inserts into `ledgers`, updates `batches` status.
* **D1 JS Translation:**
```typescript
// 1. Fetch current balance & batch status (Read)
const batchAndWs = await db.prepare(`
  SELECT b.status as batch_status, w.current_balance, w.id as workspace_id
  FROM batches b
  JOIN workspaces w ON b.workspace_id = w.id
  WHERE b.id = ?
`).bind(batchId).first();

// 2. Perform validations in JS
if (batchAndWs.batch_status === 'generating') throw new Error('already_generating');
if (batchAndWs.current_balance < cost) throw new Error('insufficient_funds');

// 3. Execute atomic updates in a single batch
const newBalance = batchAndWs.current_balance - cost;
await db.batch([
  db.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newBalance, batchAndWs.workspace_id),
  db.prepare(`UPDATE certificates SET is_paid = 1 WHERE id IN (${unpaidCertIds.map(() => '?').join(',')})`).bind(...unpaidCertIds),
  db.prepare(`INSERT INTO ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), userId, batchAndWs.workspace_id, 'deduction', -cost, newBalance, 'Cert generation', JSON.stringify(metadata)
  ),
  db.prepare(`UPDATE batches SET status = 'generating' WHERE id = ?`).bind(batchId)
]);
```

### RPC 2: `process_payment` (Credits wallet on top-up)
* **PG Logic:** Checks payment idempotency in `payment_orders`, fetches workspace, increments balance, updates `payment_orders` status, inserts ledger.
* **D1 JS Translation:**
```typescript
// 1. Check idempotency
const order = await db.prepare(`SELECT processed, workspace_id, amount FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
if (order?.processed) return { status: 'already_processed' };

const workspaceId = order?.workspace_id;
const newBalance = (await db.prepare(`SELECT current_balance FROM workspaces WHERE id = ?`).bind(workspaceId).first()).current_balance + amount;

// 2. Run batch updates
await db.batch([
  db.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newBalance, workspaceId),
  db.prepare(`INSERT INTO ledgers (id, user_id, workspace_id, type, amount, balance_after, description, metadata) VALUES (?, ?, ?, 'topup', ?, ?, 'Top-up via Cashfree', ?)`).bind(
    crypto.randomUUID(), userId, workspaceId, amount, newBalance, JSON.stringify({ order_id: orderId })
  ),
  db.prepare(`UPDATE payment_orders SET processed = 1 WHERE order_id = ?`).bind(orderId)
]);
```

---

## 3. Schema DDL: Supabase → D1 (SQLite)

Here is the D1-compatible schema structure:

```sql
-- 1. Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL, -- matches Supabase Auth UID
  current_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX workspaces_owner_id_idx ON workspaces(owner_id);

-- 2. Membership
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

-- 3. Batches
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sheet_id TEXT DEFAULT '',
  sheet_name TEXT DEFAULT '',
  tab_name TEXT,
  spreadsheet_id TEXT,
  data_source_kind TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_kind TEXT NOT NULL,
  column_map TEXT, -- Stored as JSON string
  email_column TEXT,
  name_column TEXT,
  email_subject TEXT,
  email_body TEXT,
  category_column TEXT,
  category_template_map TEXT, -- Stored as JSON string
  category_slide_map TEXT,     -- Stored as JSON string
  category_slide_indexes TEXT,
  banner_url TEXT,
  frame_tier TEXT DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'draft',
  drive_folder_id TEXT,
  pdf_folder_id TEXT,
  total_count INTEGER DEFAULT 0,
  generated_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  whatsapp_sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  paid_frames TEXT DEFAULT '[]', -- Stored as JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Certificates
CREATE TABLE certificates (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  row_data TEXT, -- Stored as JSON string
  slide_file_id TEXT,
  slide_url TEXT,
  pdf_file_id TEXT,
  pdf_url TEXT,
  r2_pdf_url TEXT,
  sent_at TEXT,
  error_message TEXT,
  is_paid INTEGER NOT NULL DEFAULT 0, -- SQLite uses 0/1 for booleans
  requires_visual_regen INTEGER NOT NULL DEFAULT 0,
  whatsapp_message_id TEXT,
  whatsapp_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 4. Migration Plan

### Step 1: Create D1 Database
Create the D1 database instance via wrangler:
```bash
npx wrangler d1 create cephlow-db
```
Paste the generated `database_id` into your `wrangler.toml`.

### Step 2: Initialize D1 Schema
Execute the schema script:
```bash
npx wrangler d1 execute cephlow-db --file=./schema.sql
```

### Step 3: Write a Data Sync Script (Supabase → D1)
Create a quick Node.js script to fetch all data from Supabase and insert it into D1.

```javascript
// scripts/db-migrate.js
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3'; // or call wrangler D1 API

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const d1 = new Database('local-d1-export.db');

async function migrate() {
  // 1. Fetch workspaces from Supabase
  const { data: workspaces } = await supabase.from('workspaces').select('*');
  for (const ws of workspaces) {
    d1.prepare(`INSERT INTO workspaces (id, name, owner_id, current_balance, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      ws.id, ws.name, ws.owner_id, ws.current_balance, ws.created_at
    );
  }
  
  // 2. Fetch batches
  const { data: batches } = await supabase.from('batches').select('*');
  for (const b of batches) {
    d1.prepare(`INSERT INTO batches (id, workspace_id, user_id, name, template_id, template_name, column_map, ...) VALUES (...)`).run(...);
  }

  // 3. Fetch certificates
  // Repeat query in chunks (e.g., 500 rows) and insert into D1
}
```

### Step 4: Deploy & Verify
Deploy the new Workers API. Since your frontend keeps using Supabase Auth directly, it continues signing in users and generating JWT tokens. The backend Worker now verifies those tokens and writes metadata/records to D1 instead of Supabase.

---

## 5. Cost & Limits Comparison for Cephlow

* **Supabase Free Tier (DB Size Limit):** 500 MB (Approx. 200,000 certificate records before you must pay $25/mo).
* **Cloudflare D1 Free Tier (DB Size Limit):** **5 GB** (Approx. 2,000,000 certificate records).
* **Write limit on D1 Free:** 100,000 writes/day. If 1 cert send = 1 DB write, you can process up to **100,000 certificate sends per day** entirely for free.

## Recommendation

**Proceed with the D1 migration.** It is completely safe, highly feasible, and permanently resolves any database storage bottlenecks or sleep pauses. Since you are already refactoring the database wrapper to work in a Cloudflare Worker, switching the DB target from Supabase Client to D1 bindings adds only a few hours of work but gives you a database that is **10x larger** and **completely free**.
