-- catpi corner's notice board (src/board.js)

-- every note anyone has sent. it waits until a mod pins it to the board or bins it
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL,                       -- the note as json, already checked (js/catpi-corner/notes.js)
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'pinned', 'binned')),
  who TEXT NOT NULL,                        -- a fingerprint of where it came from, for the daily limit
  made INTEGER NOT NULL,                    -- when it was sent, ms
  by_mod TEXT                               -- the mod who pinned or binned it
);
CREATE INDEX notes_status ON notes (status, id);
CREATE INDEX notes_who ON notes (who, made);

-- the people who can pin notes. only a fingerprint of each key is kept, never the key
CREATE TABLE mods (
  name TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  made INTEGER NOT NULL
);
