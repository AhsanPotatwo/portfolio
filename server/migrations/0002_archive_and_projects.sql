-- notes can be archived: taken off the board but kept, so a mod can put them back up.
-- sqlite can't change a CHECK in place, so the table is made again with the new one and the notes copied over
CREATE TABLE notes_new (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL,                       -- the note as json, already checked (js/catpi-corner/notes.js)
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'pinned', 'archived', 'binned')),
  who TEXT NOT NULL,                        -- a fingerprint of where it came from, for the daily limit
  made INTEGER NOT NULL,                    -- when it was sent, ms
  by_mod TEXT                               -- the mod who last pinned, archived or binned it
);
INSERT INTO notes_new (id, note, status, who, made, by_mod) SELECT id, note, status, who, made, by_mod FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
CREATE INDEX notes_status ON notes (status, id);
CREATE INDEX notes_who ON notes (who, made);

-- mods look after the whole site now: each one has a list of the projects they can moderate (src/mods.js)
ALTER TABLE mods ADD COLUMN projects TEXT NOT NULL DEFAULT '[]';
