-- Workspace suspend/enable kill switch + audit trail for all privileged
-- platform-admin actions (credit grants, feature toggles, suspend, approvals).

ALTER TABLE workspaces ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN suspended_reason TEXT;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_workspace_id TEXT,
  target_user_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS admin_audit_log_workspace_idx ON admin_audit_log(target_workspace_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at);
