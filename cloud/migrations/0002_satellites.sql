-- Phases 3–6: dashboards (snapshots), routines, approval cards, memory docs,
-- attachments, and job kinds beyond chat.

-- What a job is for: a chat message, a routine run, an approved action, or a memory edit.
ALTER TABLE jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';   -- chat | routine | action | memory
ALTER TABLE jobs ADD COLUMN payload TEXT;                        -- JSON for routine/action/memory jobs
ALTER TABLE jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;

-- Latest dashboard numbers each satellite shows, computed on the Mac (raw data never leaves it).
CREATE TABLE snapshots (
  satellite TEXT PRIMARY KEY,
  data TEXT NOT NULL,              -- JSON, shape per satellite (engine/snapshot contract)
  observed_at TEXT,                -- when the underlying data was last collected
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Scheduled work. times: "HH:MM" in the owner's time zone, comma-separated; weekdays: "0-6" list (0 = Sunday) or NULL for every day.
CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  satellite TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  times TEXT NOT NULL,
  weekdays TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  notify TEXT NOT NULL DEFAULT 'change', -- change: push only when there is news (answer is not NO_CHANGE) | always | never
  last_run_at TEXT,
  next_run_at TEXT
);

-- Actions a satellite proposed that wait for a tap on the phone. The engine runs only these vetted types.
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  satellite TEXT NOT NULL,
  type TEXT NOT NULL,              -- reminder.add | calendar.add
  payload TEXT NOT NULL,           -- JSON
  summary TEXT NOT NULL,           -- one line shown on the card
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | done | failed
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  decided_at TEXT
);
CREATE INDEX approvals_satellite ON approvals (satellite, created_at);

-- A satellite's memory.md / goals.md as last uploaded by the engine (the Mac file is the source).
CREATE TABLE memory_docs (
  satellite TEXT NOT NULL,
  name TEXT NOT NULL,              -- memory | goals
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (satellite, name)
);

-- Files on messages: photos and files I send (in), reports and images a satellite makes (out).
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id INTEGER,
  job_id TEXT,
  satellite TEXT NOT NULL,
  direction TEXT NOT NULL,         -- in | out
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,              -- base64 (kept under ~1.4 MB so a row stays well inside D1 limits)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX attachments_message ON attachments (message_id);
CREATE INDEX attachments_job ON attachments (job_id);

-- Approval cards and pending actions show up in the conversation as messages.
ALTER TABLE messages ADD COLUMN approval_id TEXT;

-- Routines come from orbit.config.json (built-ins and the owner's own); `./orbit deploy` syncs them.
