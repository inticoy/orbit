-- How far I have read each satellite's conversation, by message id. The list's blue dot and the
-- app badge count answers after this point, so they no longer depend on which answers sent a push.
CREATE TABLE satellite_reads (
  email TEXT NOT NULL,
  satellite TEXT NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, satellite)
);

-- Everything already in the conversations counts as read for everyone who has signed in.
INSERT INTO satellite_reads (email, satellite, last_read_id)
  SELECT s.email, m.satellite, MAX(m.id) FROM messages m, (SELECT DISTINCT email FROM sessions) s GROUP BY s.email, m.satellite;
