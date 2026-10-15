-- Additive, rerunnable: original tokens, accounts, passwords and content are untouched.
CREATE TABLE IF NOT EXISTS member_agent_keys (
  id TEXT PRIMARY KEY,
  owner_member_id TEXT NOT NULL REFERENCES member_accounts(member_id),
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS member_agent_keys_owner ON member_agent_keys(owner_member_id,revoked_at);
