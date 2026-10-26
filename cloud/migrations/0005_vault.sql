-- Site logins for satellites, kept in the Mac's Keychain. The phone encrypts each one with the engine's
-- public key; the Worker only holds the sealed box until the engine picks it up, then deletes it.
ALTER TABLE engine_state ADD COLUMN vault_key TEXT;

CREATE TABLE vault_inbox (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,           -- {e, iv, c}: the phone's one-time ECDH key and the AES-GCM sealed login
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- What the Mac reports it holds: site and username only, never the password.
CREATE TABLE vault_sites (
  site TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
