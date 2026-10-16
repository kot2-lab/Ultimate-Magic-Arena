PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_bootstrap_claim (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  claimed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

INSERT OR IGNORE INTO admin_settings (key, value_json, updated_at, updated_by)
VALUES ('maintenance', '{"enabled":false,"message":""}', '1970-01-01T00:00:00.000Z', 'system');

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  season_number INTEGER NOT NULL UNIQUE CHECK (season_number >= 0),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK (status IN ('preseason', 'planned', 'active', 'closed')),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

INSERT OR IGNORE INTO seasons (id, season_number, label, status, starts_at, ends_at, created_at, updated_at, updated_by)
VALUES ('season-0', 0, 'シーズン0（プレシーズン）', 'preseason', NULL, NULL,
        '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', 'system');

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_status_updated ON announcements(status, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS admin_audit_no_update
BEFORE UPDATE ON admin_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'admin audit log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS admin_audit_no_delete
BEFORE DELETE ON admin_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'admin audit log is append-only');
END;
