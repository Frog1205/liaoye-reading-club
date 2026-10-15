CREATE TABLE IF NOT EXISTS member_accounts (
  member_id TEXT PRIMARY KEY REFERENCES members(id),
  nickname TEXT NOT NULL,
  wechat_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_scheme TEXT NOT NULL,
  joined_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_sessions (
  session_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member_accounts(member_id),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_sessions_member ON member_sessions(member_id);
CREATE INDEX IF NOT EXISTS member_sessions_expiry ON member_sessions(expires_at);
