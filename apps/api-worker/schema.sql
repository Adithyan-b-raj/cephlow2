-- schema.sql

-- 1. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL, -- Matches Supabase Auth UID
  current_balance REAL NOT NULL DEFAULT 0,
  transfer_code TEXT UNIQUE,
  generation_cost REAL NOT NULL DEFAULT 1.0,
  email_cost REAL NOT NULL DEFAULT 0.2,
  whatsapp_cost REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON workspaces(owner_id);

-- 2. Membership
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);

-- 3. Pending invites
CREATE TABLE IF NOT EXISTS workspace_invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  token TEXT NOT NULL UNIQUE,
  invited_by TEXT,
  expires_at INTEGER NOT NULL, -- UNIX timestamp
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON workspace_invites(email);

-- 4. Brand kit (1:1 with workspace)
CREATE TABLE IF NOT EXISTS workspace_brands (
  workspace_id TEXT PRIMARY KEY,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  font_family TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Batches
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
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
  column_map TEXT,               -- Stored as JSON string
  email_column TEXT,
  name_column TEXT,
  email_subject TEXT,
  email_body TEXT,
  category_column TEXT,
  category_template_map TEXT,    -- Stored as JSON string
  category_slide_map TEXT,        -- Stored as JSON string
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
  paid_frames TEXT DEFAULT '[]', -- Stored as JSON array string
  template_config TEXT,
  banner_overlay_opacity REAL,
  banner_text_color TEXT,
  banner_crop_zoom REAL,
  banner_crop_x REAL,
  banner_crop_y REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS batches_workspace_idx ON batches(workspace_id);

-- 6. Certificates
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  row_data TEXT,                 -- Stored as JSON string
  slide_file_id TEXT,
  slide_url TEXT,
  pdf_file_id TEXT,
  pdf_url TEXT,
  r2_pdf_url TEXT,
  sent_at TEXT,
  error_message TEXT,
  is_paid INTEGER NOT NULL DEFAULT 0, -- 0/1 for booleans
  requires_visual_regen INTEGER NOT NULL DEFAULT 0,
  whatsapp_message_id TEXT,
  whatsapp_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS certs_batch_idx ON certificates(batch_id);

-- 7. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,           -- Matches Supabase Auth UID
  email TEXT,
  is_approved INTEGER NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  approval_requested_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Ledgers
CREATE TABLE IF NOT EXISTS ledgers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,                 -- Stored as JSON string
  transfer_id TEXT,
  action_type TEXT CHECK (action_type IN ('generation', 'email', 'whatsapp')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ledgers_workspace_idx ON ledgers(workspace_id);

-- 9. Google OAuth token storage
CREATE TABLE IF NOT EXISTS pending_google_auth (
  nonce TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  origin_url TEXT
);

CREATE TABLE IF NOT EXISTS user_google_tokens (
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scope_type)
);

-- 10. Frame templates & listings
CREATE TABLE IF NOT EXISTS custom_frames (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by TEXT,
  name TEXT NOT NULL,
  config TEXT NOT NULL, -- JSON string
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frame_listings (
  id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL,
  published_by TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS frame_listings_active_idx ON frame_listings(is_active);


CREATE TABLE IF NOT EXISTS frame_purchases (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  purchased_by TEXT NOT NULL,
  batch_id TEXT,
  amount_paid REAL NOT NULL,
  creator_uid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS frame_purchases_listing_ws_idx ON frame_purchases(listing_id, workspace_id);

CREATE TABLE IF NOT EXISTS frame_likes (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS frame_likes_listing_user_idx ON frame_likes(listing_id, user_id);

-- 11. Payment tracking (Cashfree orders mapping)
CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Workspace transfers
CREATE TABLE IF NOT EXISTS workspace_transfers (
  id TEXT PRIMARY KEY,
  from_workspace_id TEXT NOT NULL,
  to_workspace_id TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  initiated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);



-- 14. WhatsApp messages tracking (link Meta message ID with certificates)
CREATE TABLE IF NOT EXISTS wa_messages (
  wamid TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  cert_id TEXT NOT NULL
);

-- 15. Student public profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  slug TEXT PRIMARY KEY, -- Slugified recipient name/email
  name TEXT NOT NULL,
  email TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_profile_index (
  email_key TEXT PRIMARY KEY, -- Normalised email address
  slug TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profile_certs (
  id TEXT PRIMARY KEY, -- UUID
  profile_slug TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  cert_id TEXT NOT NULL,
  batch_name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  r2_pdf_url TEXT,
  pdf_url TEXT,
  slide_url TEXT,
  issued_at TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS student_profile_certs_cert_idx ON student_profile_certs(cert_id);

-- 16. Inbuilt spreadsheets
CREATE TABLE IF NOT EXISTS spreadsheets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Spreadsheet',
  columns TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  rows TEXT NOT NULL DEFAULT '[]', -- JSON array of objects
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS spreadsheets_workspace_idx ON spreadsheets(workspace_id);

-- 17. Builtin Templates designed inside Cephloe
CREATE TABLE IF NOT EXISTS builtin_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  canvas TEXT NOT NULL, -- JSON representation of canvas
  placeholders TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  thumbnail_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS builtin_templates_workspace_idx ON builtin_templates(workspace_id);
CREATE INDEX IF NOT EXISTS builtin_templates_user_idx ON builtin_templates(user_id);


