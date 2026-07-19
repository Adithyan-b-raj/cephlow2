-- WhatsApp Bot Analytics Schema

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  certs_count INTEGER,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_states (
  phone      TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  cert_key   TEXT,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  phone      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_created_at ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_action ON interactions(action);
