# Squimble Music Maker

Procedural music for Squimble Quest, on its own page (`squimble-music-maker.html`) until it moves into the game. Songs come from a seed and music theory rules, no AI. The band is Web Audio synths plus recordings from free sample libraries; every recorded instrument keeps a synth version (the Recordings key swaps them).

When you change something, update the comment beside it. A fix for something that sounded wrong goes in the table below and, if it can, becomes a check in `tests/music-check.js`.

## Files

| File | What it is |
| --- | --- |
| `instruments.js` | `INSTRUMENTS` and `FAMILIES`, plain data. Load first. |
| `moods.js` | `MOODS`, `FLAVOURS`, `RETIRED`, `MOOD_GROUPS`, plain data. Load before music.js. |
| `music.js` | The composer: settings to notes. No page or audio, so node and the game can run it. Header explains how songs work. |
| `synth.js` | The band: instrument engines, mixing desk, `MusicPlayer`, WAV/zip/MIDI export. Doesn't touch Web Audio until a note plays. |
| `maker.js` | The page. |
| `library.js` | Saved songs in IndexedDB with a local storage copy: history, bin, backups. |
| `learn.js` | A part as a player reads it (frets, fingers, sheet music) for the Learn tab. |
| `kept/composer-*.js` | Older composers for songs saved with them, fetched on demand (`fetchComposer`). **Never edit.** |
| `vendor/lame.min.js` | lamejs 1.2.1 MP3 encoder (LGPL), fetched on first MP3 download. |
| `tests/music-check.js` | Main check, about five minutes on half the cores. `music-check.js <words>` runs just matching blocks. |
| `tests/saved-songs-check.js` | Saved songs from every composer still play the same notes. `--add` keeps a new composer's songs. |
| `tests/learn-check.js`, `library-check.js` | The learn tab's fingering, and the library. |
| `tests/tuning.html`, `levels.html` | Recording tuning and instrument loudness (open and wait, or via `headless.js`). |
| `tests/headless.js` | Runs a page in headless Chrome and prints an expression. |
| `tools/keep-composer.js` | Keeps today's composer before a change that alters saved songs (see Adding things). |
| `tools/build-samples.js` | Builds `assets/squimble-music-maker/samples/` from the free libraries. Needs git and ffmpeg. |

Load order everywhere: instruments.js, synth.js, [kept], moods.js, music.js.

## Inspirations

The page never names what a mood is based on, only the feeling. For reference: Nostalgic is C418's Minecraft, Tragic is Calamity, Eerie is Silent Hill, Iron city is Daxter, Spirited is Undertale, Shop is Toby Fox's Hip Shop, Magic is Wizard101's world themes, Shoegaze is My Bloody Valentine, Slowdive, Whirr and others (read from about 150 Songsterr tabs), plus Aphex Twin, Fallout, Stardew Valley, Have a Nice Life, Doom, Nirvana and the Cocteau Twins. Some flavours show a different name on the page from their id (ids are what saved songs use); the mapping is in `moods.js`.

## How a song is made

`generateSong(mood, style, seed, mods, flavour)` works out the real mood (`songMood`: flavour, then modifiers, then style) and runs its picks, each on its own seeded random numbers, so remixing one (`rerollSong`) leaves the rest alone:

1. `pickTonality`: key, scale, tempo, meter, swing, chord colour.
2. `pickChords`: progressions for parts A, B and C. B and C are placed against A (`placeProgression`).
3. `pickLayers` then `fitBand`: who plays, on what.
4. `pickArrangement`: sections, solos, key changes (`LIFTED`).
5. `pickWeave` / `pickOrchestra`, `pickScenery`, `pickDoubles`, `pickRecordings`, `pickSpace`.

`composeSong(song)` plans the song whole (`planSong`: which sections lead on, where the lift is, where it ends), then each role writes its notes (`COMPOSERS`) on one shared groove (`GROOVES`). Then the band listens (`listen`), ornaments (`ornament`), pedals, lifts key changes (`liftKey`) and gets its feel (`feel`). `composeSong(song, round)` is a loop's later time round.

Styles: Explore, Theme, Town (loops), Cutscene (builds), Skirmish, Boss fight, Final boss. Modifiers (calm, fast, jazzy, lo-fi...) change how a mood's band plays. Flavours are kinds within a mood, each with its own `phrasing`.

## Saved songs

- A song remembers the composer that made it (`song.composer`), and `composeSong` hands older ones to the kept composer (`KEPT_COMPOSERS`). The Composer key on the song card picks which one writes.
- The library keeps settings and the notes they played, so a save whose notes today's composer no longer writes plays its saved notes.
- Links are `#seed/mood/style/composer/modifiers/flavour/changes`, only storing what changed from the seed, deflated.
- Exports: WAV, MP3, MIDI (`midiFile`), stems, song files (`songFile`, which the game reads).

## In a game

None of this changes a song's notes. `player.setIntensity(0 to 1)` brings layers in and out on bar lines (`intensityLadder`). `player.stinger(kind)` plays a short cue in the current chord (`STINGERS`). `player.queue(song, comp, 'bar')` moves to another song on a beat, bar or section. `player.vary` plays each loop round as a slightly different take.

## Rules for a band that fits

Each is here because the song sounded wrong without it. Most have a check in `music-check.js`.

### Rhythm and sound

- One groove per part for drums, bass, keys and stabs (`GROOVES`). Humanising moves the band together (`pocket`). No swing in 6/8.
- Drums and bass stay dry. Drums sit under the band (0.7 in the synth, volume by energy).
- Every tonal instrument has an `edge`; moods cap it (`maxEdge`), backing gets 75% of the cap (`+ 1e-9` for rounding).
- No vibrato or detune on struck or plucked instruments. Gentle bells use harmonic ratios.
- No two layers share an instrument. Chip and acoustic never mix (`world`). Surprises only from moods about as dark (`kindred`).
- Backing sits at least 0.1 under the melody. Textures are scenery: events with quiet between, capped under the tune.
- Every part but bass, drums and drones has its lows cut (`CUTS`); fill-in parts on opposite sides (`spread`).
- Recordings are picked five to one over synths, each layer its own recording, and only recordings double.
- Sung lines sing each note on its nearest recording, never bent more than two semitones, moving like a singer (`singerMove`).

### Listening

- Everyone writes, then the band listens before `feel`. Hand-added notes are left alone.
- The tune stays on top: keys, arps and counter melodies drop an octave if they'd start above it.
- Nothing rubs a semitone against the tune. Everything with a pitch is in key (`tuneDrum`).
- The drummer plays softer when fewer than half the others play.

### Parts

- An arp or a counter melody, never both. Two moving middle parts at most (`MIDDLE`). Six layers in ambient songs, seven otherwise.
- No running notes faster than six a second (`MAX_RATE`).
- Melodies: one motif per layer, no rests inside a bar, phrases breathe at the ends.
- Solos never repeat, climb to a peak and land on the root.
- A layer that's in stays in. Each mood says what opens its songs (`opens`).
- Every guitar chord is one a hand can hold (`forGuitar`, `stillHeld`). Open strings never rub a semitone.
- Ornaments bend written notes, so every rule above stays true.
- A song that ends comes home (`cadence`, `comeHome`); loops lead back to their start.
- The tune is handed round, never given away (`passTune`). A layer carrying the tune is never moved by listening.

### Moods

- New moods, roles and picks never move old seeds (new picks on their own random numbers, new moods with `surprise: 0`).
- A flavour keeps its mood's caps; the plain flavour changes nothing.
- A fight drives whatever the mood (`FIGHT_ENERGY`) and loops.
- A modifier changes how the band plays, not who's in it (apart from lo-fi, retro, acoustic, epic, jazzy, spooky).

## What sounded wrong, and the fix

Kept so nobody undoes a fix by accident.

| What it sounded like | Why | Fix |
| --- | --- | --- |
| Drums out of time | Kick, bass and stabs each had their own rhythm | One groove per part (`GROOVES`) |
| Parts smearing apart | Each layer's own timing nudge | The shared `pocket` |
| 6/8 lopsided | Swing bent its triplets | No swing in 6/8 |
| Ghost drum hits | Drums through the dotted echo | No echo on drums or bass |
| Harsh leads over soft backing | Brightness swung 0.4x to 2.2x | `edge`, `maxEdge`, brightness caps |
| Seasick pianos and bells | Vibrato and detune on everything | None on struck or plucked |
| Melody cutting out | Random rests repeated every bar | No rests inside bars |
| Layers blinking in and out | Random wobble on section energy | Once in, stays in |
| The band pumping on every kick | Drums drove the compressor | Drums at 0.7, volume by energy |
| Drums out of key | Fixed pitch kicks and toms | `tuneDrum` |
| Wind or rain burying the tune | Textures as loud as the melody | Capped under it, events with quiet between |
| Arp over the tune, sevenths grinding | Nobody knew what the melody played | `listen` |
| Forgettable melodies | A random walk | Motifs, question and answer, a a b a |
| Sounding like MIDI | No release, mono pads, no bodies or ornaments | Releases, `hardness`, wide pads, modal, bodies, drift, ornaments |
| A crowded, boomy band | Low ends piling up, random pans | `CUTS`, `spread` |
| Songs crackling and stopping | A fast pad's strikes rang out their whole release | `findRestrikes` |
| Songs flat however good the notes | One instrument per part all song | `passTune` |
| Game music winding down | Intros, outros and a home chord | The Loop style |
| Links too long to share | The whole song as base64 | Seed plus changes, deflated |
| Voices robotic on moving tunes | One recording bent through a phrase | `singLine`, `singerMove` |
| Voices out of tune | Tuned by their first moments | Tuned where they loop, `tests/tuning.html` |
| Guitar chords no hand could play | Notes stacked like a piano's | `holds`, `fingering`, `forGuitar` |
| Songs sounding put together, not written | Sections picked one at a time, all starting home | Composer 6: `planSong`, turnarounds, the lift |
| Last chord hanging | Bass ended wherever its pattern was | `comeHome` |
| Stutters, silence on iPhones | Long reverb tail, late notes, silent switch | Shorter tail, `warmNote`, `unmute` |
| Big songs stuttering on Windows | 10 ms buffer, amp curves never resting | 40 ms buffer, odd-length curves |

## Adding things

- **A change that makes saved songs sound different** (`saved-songs-check.js` fails): first run `node js/squimble-music-maker/tools/keep-composer.js` (`--from HEAD` if already changed). It copies moods.js and music.js into `kept/composer-n.js`, bumps `COMPOSER_VERSIONS` and adds a `COMPOSER_KEYS` line in maker.js (describe it by hand). Once the new one's finished, `saved-songs-check.js --add`. Changes only to `generateSong`'s picks don't need it.
- **An instrument:** an `INSTRUMENTS` line with a family, an `edge`, an engine, and `gain` set with `levels.html`. Check the id isn't taken.
- **Recordings:** a folder in `tools/build-samples.js` (run `--probe` first), then `samples` and `sampled.gain`. Only libraries whose licence allows a game, credited on the page.
- **A mood:** a `MOODS` entry (the comment above it lists every field) and its `FLAVOURS` entry. Use `surprise: 0` or older songs change.
- **A flavour:** a kind in its mood's `FLAVOURS` with a `name`, a `tip` (the feeling, never the source) and a `phrasing`. Never change the first kind.
- **A modifier:** `MODIFIERS` entry with `name`, `tip`, `against`, `apply(mood, style)`.
- **A style:** `STYLES` plus its lines in `LAYER_CHANCE`, `FORMS` and the other style tables, and the check's `STYLES`.
- **A stinger:** `STINGERS` entry and its notes in `stingerNotes`.

## Known issues

- Composer 6's plan was tuned from measurements, not listened to properly yet. Knobs: `leadingChord`, `LEAD_DROP`, the lift's raise in `tune()`, `PLACING`.
- Much of the mix was set by measuring rather than by ear. If something sits wrong, adjust `gain`, `sampled.gain`, `edge` or rig settings before adding a special case.
- Listening only checks against the melody, so two backing parts can still rub.
- A save keeps its notes, not its sounds: changing an instrument changes how saved songs sound.
- Some recordings stand in for instruments no free library has. Voices have few notes each.
- Only 4/4, 3/4, 6/8 and 5/4.
- The learn tab's sheet music is one voice, rounded to sixteenths. Only standard, drop D and drop B tunings.
