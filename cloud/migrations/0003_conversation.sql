-- Reactions, follow-up messages while a satellite works, hand-offs between
-- satellites, proactive ideas, and pinned results for the library.

-- My reaction on a satellite's answer (👍 👎 ❤️ …) and the satellite's on my message (👀 while working, ✅ when done).
ALTER TABLE messages ADD COLUMN my_reaction TEXT;
ALTER TABLE messages ADD COLUMN my_reaction_at TEXT;
ALTER TABLE messages ADD COLUMN bot_reaction TEXT;
-- What a message is beyond a plain chat line. bot + 'idea': a proactive suggestion.
-- me + 'mention': I sent it on to another satellite (@Tempo …). handoff + 'in' | 'mention': work passed
-- here by another satellite or by my @mention; handoff + 'out': this satellite passed work on.
-- peer names the other satellite in a mention or hand-off.
ALTER TABLE messages ADD COLUMN kind TEXT;
ALTER TABLE messages ADD COLUMN peer TEXT;
-- Kept in the library's 고정 list.
ALTER TABLE messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX messages_pinned ON messages (pinned, id) WHERE pinned = 1;

-- A follow-up I send while the satellite is still working waits (job_id NULL) and goes out with the
-- next job. depth 1 marks a job a satellite handed off; such a job cannot hand off again.
ALTER TABLE jobs ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
