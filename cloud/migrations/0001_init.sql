-- Orbit cloud front: login, push, and the satellite
-- conversations and job queue that the Mac engine (../engine) works through.

-- Login: long rolling sessions, one-time invite codes, passkeys (Face ID).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,     -- SHA-256 of the cookie value; the value itself is never stored
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_email ON sessions (email);

CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,             -- credential ID (base64url)
  email TEXT NOT NULL,
  public_key TEXT NOT NULL,        -- base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                 -- JSON array
  aaguid TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX passkeys_email ON passkeys (email);

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  email TEXT,                      -- set for registration (the signed-in person), NULL for sign-in
  expires_at TEXT NOT NULL
);

-- Login tries per IP (hashed) per 10-minute window.
CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY,            -- SHA-256 of the IP; the IP itself is never stored
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);

-- Web Push.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX push_subscriptions_email ON push_subscriptions (email);

-- Every push is also kept here; the in-app banner shows the newest unread one.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  sender_email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  read_at TEXT
);
CREATE INDEX notifications_email ON notifications (email, id);

CREATE TABLE notification_preferences (
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (email, category)
);

CREATE TABLE quiet_hours (
  email TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  start_minute INTEGER NOT NULL DEFAULT 1380,
  end_minute INTEGER NOT NULL DEFAULT 480
);

-- One running conversation per satellite.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite TEXT NOT NULL,
  role TEXT NOT NULL,              -- 'me' | 'bot' | 'error'
  body TEXT NOT NULL,
  job_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX messages_satellite ON messages (satellite, id);

-- Work for the Mac engine. It claims a queued job, reports progress, then finishes it.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  satellite TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  progress TEXT,                   -- latest one-line progress from the engine
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  started_at TEXT,
  finished_at TEXT,
  lease_until TEXT                 -- a running job whose lease passes is marked failed by the cron
);
CREATE INDEX jobs_status ON jobs (status, created_at);
CREATE INDEX jobs_satellite ON jobs (satellite, created_at);

-- The engine's last check-in, for the "맥 연결됨" status and Houston.
CREATE TABLE engine_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at TEXT NOT NULL,
  version TEXT
);
