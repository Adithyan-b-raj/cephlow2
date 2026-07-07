-- Per-workspace feature flags, replacing the binary user_profiles.is_approved
-- gate with granular per-feature access control.

CREATE TABLE IF NOT EXISTS workspace_features (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  feature_key TEXT NOT NULL CHECK (feature_key IN (
    'whatsapp_delivery', 'custom_event_banners', 'google_slides_templates', 'qr_codes'
  )),
  enabled INTEGER NOT NULL DEFAULT 0,
  granted_by TEXT,
  granted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, feature_key)
);

CREATE INDEX IF NOT EXISTS workspace_features_workspace_idx ON workspace_features(workspace_id);

-- Backfill: workspaces whose owner is currently approved get all 4 features
-- enabled, so no existing org loses access when the binary gate is retired.
INSERT INTO workspace_features (id, workspace_id, feature_key, enabled, granted_at)
SELECT lower(hex(randomblob(16))), w.id, k.feature_key, 1, datetime('now')
FROM workspaces w
JOIN user_profiles up ON up.id = w.owner_id AND up.is_approved = 1
CROSS JOIN (
  SELECT 'whatsapp_delivery' AS feature_key
  UNION ALL SELECT 'custom_event_banners'
  UNION ALL SELECT 'google_slides_templates'
  UNION ALL SELECT 'qr_codes'
) k;
