CREATE TABLE IF NOT EXISTS management_sessions (session_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,role TEXT NOT NULL CHECK(role IN ('super_admin','operator')));
INSERT OR IGNORE INTO management_sessions(session_hash,expires_at,role) SELECT session_hash,expires_at,'super_admin' FROM sessions;
