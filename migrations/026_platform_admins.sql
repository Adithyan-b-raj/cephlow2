-- Platform admin identity: users who can manage all workspaces (feature access,
-- credit grants, suspension, approvals) via the /admin panel.
-- Seed the first row by hand (wrangler d1 execute) once a real Supabase uid is known:
--   INSERT INTO platform_admins (id, user_id, email) VALUES (lower(hex(randomblob(16))), '<uid>', 'adithyanbraj@gmail.com');

CREATE TABLE IF NOT EXISTS platform_admins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS platform_admins_email_idx ON platform_admins(email);
