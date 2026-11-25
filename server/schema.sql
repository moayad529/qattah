-- Qatta rooms: no users table on purpose. A room is identified by a random id;
-- access is granted by one of four random secrets (owner / editor / entry / viewer),
-- stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'SAR',
  owner_hash    TEXT NOT NULL,
  editor_hash   TEXT NOT NULL,
  entry_hash    TEXT NOT NULL,
  viewer_hash   TEXT NOT NULL,
  rev           BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_participants (
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL,
  share_ratio REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id, id)
);

-- Added in 1.5: the owner can ask that a member pays a specific other member first.
ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS pay_to TEXT;
-- 1.6: several preferred payees, in priority order (a JSON array of member ids).
ALTER TABLE room_participants ADD COLUMN IF NOT EXISTS pay_to_ids JSONB NOT NULL DEFAULT '[]';
-- one-time carry-over of the single-payee value from 1.5 (idempotent)
UPDATE room_participants SET pay_to_ids = jsonb_build_array(pay_to), pay_to = NULL WHERE pay_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS room_expenses (
  room_id        TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  id             TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  amount         NUMERIC(14,2) NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'other',
  split_among    JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, id)
);

CREATE INDEX IF NOT EXISTS rooms_last_activity_idx ON rooms (last_activity);
