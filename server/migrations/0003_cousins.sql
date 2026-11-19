-- distant cousins (src/cousins.js). nobody signs in: each browser makes up a random id, and only a fingerprint
-- of it is kept, with a fingerprint of where it first came from for the daily limit on new players
CREATE TABLE dc_players (
  who TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  made INTEGER NOT NULL,                    -- ms
  fav INTEGER,                              -- the creature they've starred (its wikidata number), if any
  fav_home INTEGER                          -- the tree file it's in, so the page can draw it
);
CREATE INDEX dc_players_fav ON dc_players (fav);
CREATE INDEX dc_players_ip ON dc_players (ip, made);

-- how big each of their trees is and what's on it, to say how a tree compares with everyone's
CREATE TABLE dc_trees (
  who TEXT NOT NULL,
  tree TEXT NOT NULL,                       -- the page's id for the tree (page.js trees)
  creatures INTEGER NOT NULL,
  group_count INTEGER NOT NULL,
  extinct INTEGER NOT NULL,
  mix TEXT NOT NULL,                        -- how many creatures of each kind, as a json list (progress.js KINDS)
  made INTEGER NOT NULL,                    -- last sent, ms
  PRIMARY KEY (who, tree)
);
CREATE INDEX dc_trees_size ON dc_trees (creatures);

-- the daily mystery cousin: a row per player per day
CREATE TABLE dc_daily (
  day TEXT NOT NULL,                        -- yyyy-mm-dd, utc
  who TEXT NOT NULL,
  guesses INTEGER NOT NULL DEFAULT 0,
  hints INTEGER NOT NULL DEFAULT 0,
  deep INTEGER NOT NULL DEFAULT 0,          -- how far down the mystery one's family line they've got
  seen TEXT NOT NULL DEFAULT '[]',          -- the creatures guessed, so one guessed twice only counts once
  started INTEGER NOT NULL,                 -- ms
  done INTEGER,                             -- when they got it or gave up, ms
  won INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who)
);
CREATE INDEX dc_daily_board ON dc_daily (day, won, guesses, hints);
