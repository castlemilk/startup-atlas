CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
CREATE TABLE oauth_connections (
  user_id TEXT PRIMARY KEY,
  payload TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  lock_owner TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0
);
