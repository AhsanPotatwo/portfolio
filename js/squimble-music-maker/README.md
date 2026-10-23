# Squimble Music Maker

Procedural music for Squimble Quest, on its own page (`squimble-music-maker.html`) until it moves into the game. Songs come from a seed and the rules of music theory, not AI. The band is synthesisers built on Web Audio plus recordings of real instruments from free sample libraries; every recorded instrument keeps a synthesised version, and the page's Recordings key swaps between them.

When you change something: update the comment beside it and this README where it describes it. A fix for something that sounded wrong goes in [What sounded wrong](#what-sounded-wrong-and-the-fix) and, if it can, becomes a check in `tests/music-check.js`. A problem you haven't fixed goes in [Known issues](#known-issues).

## Files

| File | What it is |
| --- | --- |
| `music.js` | The composer: settings to notes. Plain maths, no page or audio, so node and the game can run it. Its header explains songs, the theory and times. |
| `synth.js` | The band: `INSTRUMENTS`, the engines that play them, drums, textures, recordings, guitar rigs, the mixing desk and the player (`MusicPlayer` live, `renderSong()` to WAV). Load it before `music.js`, which picks from `INSTRUMENTS`. It doesn't touch Web Audio until a note plays, so node can load it. |
| `maker.js` | The page: controls, the score, the note editor, the learn tab, the library, exports and links. The game won't need it. |
| `library.js` | Saved songs: settings and the notes they played (packed, fingerprinted), history, bin, backups and song files, in IndexedDB with a local storage copy. No page. |
| `learn.js` | A part as a player reads it, for the learn tab: what's played together, strings and frets, fingers, key signatures and spellings, sheet music values. No page. |
| `kept/composer-1.js`, `kept/composer-1.5.js` | Earlier composers (`music.js` at the live site's 4ac2b1b, and at e104ffd on the morning of 22 October), wrapped so their names don't clash, for songs saved with them. Never edit them. |
| `tests/music-check.js` | `node js/squimble-music-maker/tests/music-check.js`. No output means it passed. About half an hour (every mood, flavour and style, and long songs), so run it in the background. It runs the saved songs check first. |
| `tests/saved-songs-check.js` | About a minute. About two hundred songs from each composer (`tests/saved-songs/composer-n.json.gz`) must still play the notes they were saved with. `--add` keeps a new composer's songs, once. |
| `tests/learn-check.js` | About twenty seconds. The usual chord shapes fingered as players do, every part fretted within reach, signatures and spellings, bars that add up. |
| `tests/library-check.js` | A few seconds. Notes pack and come back, saving over keeps history, names never clash, the bin, backups and song files only ever add, old saves move over once. |
| `tests/levels.html` | How loud every instrument and texture is, weighted as ears hear. Open it and wait about a minute. Guitars are measured through their rig, everything through its body. Plucked sounds start from random noise, so run it twice before moving one. |
| `tests/headless.js` | Runs a page in headless Chrome and prints a JavaScript expression's value: levels without a browser window, or the maker page checked for errors. Its header has examples. |
| `tools/build-samples.js` | Builds `assets/squimble-music-maker/samples/` from the free libraries: downloads only the files it needs, checks each note's pitch (YIN), trims and levels them, and writes small mono mp3s with an `index.json` per folder. Its header explains how to run it. Needs git and ffmpeg. |

## Where the sounds come from

The page never names what a mood or flavour is based on: its `about`, names and tips describe the feeling and what it's for. The inspirations are here and in code comments. Some flavours have a different page name from their id (ids are what saved songs use): nostalgic's alpha is First days, warmth Embers, creative Tinkering, dreiton Slow build, rolling Rolling keys and moogcity Circuits; tragic's cruel is Lament and sulphur Poisoned sea; eerie's otherworld is Rust and promise Regret; desolate's vault is Bunker, aztec's azteca Sun temple, shop's hip Laid back, showtime's glamour Spotlight, spirited's home Keepsake and ruins Old caverns, grunge's seattle Garage, underwater's reef Reef party and ironcity's palace Tyrant's palace.

- **Nostalgic:** C418's Minecraft (Volume Alpha and Beta): a felt piano or Rhodes with room round it, the sustain pedal down (`pedal`), a warm pad, a Moog bass, major keys leaning on ii, iii and a borrowed iv. Flavours: the Nether (`prelude` of embers), the creative tracks, Dreiton's long builds, Subwoofer Lullaby, Wet Hands, Moog City 2.
- **Tragic:** Calamity's The Tale of a Cruel World: a lone piano, then strings, a choir and timpani, harmonic minor, a long way between quiet and loud (`drama`).
- **Eerie's Fog, Otherworld and Promise:** Silent Hill: radio static, a siren, footsteps, clanging metal, and the sad trip hop side.
- **Iron city:** Daxter (PSP) and Haven City: brooding low strings, a bass hook, a dark riff, brass stabs and a half orchestral, half machine beat.
- **Ambient moods:** Aphex Twin's Selected Ambient Works, Fallout 1 and 2 (Desolate), Dying Light, Minecraft. **Spirited:** Undertale and Deltarune. **Happy, Playful:** Stardew Valley, Terraria. **Bleak:** Have a Nice Life. **Neon:** Crystal Castles.
- **Loud and hazy:** Doom, Metallica, Pantera and Slayer (Metal; Sabbath and Sleep's sludge is Metal, slow and dark); Nirvana, Hole and Alice in Chains (Grunge); Title Fight, Citizen and Tigers Jaw (Hardcore); My Bloody Valentine and Slowdive (Shoegaze); Beach House (Dream pop); the Cocteau Twins (Ethereal: Soaring, Dancing, Mellow).
- **World, Easy, Roots, Ancient, Pop and Places:** the desert, islands, Celtic folk, winter, synthwave, drum and bass, bebop, bossa nova, soul, Mettaton's Death by Glamour (Showtime), the blues and bluegrass, Japan and China, India, reggae, the Aztecs, drums round a fire, Egypt, Greece and Rome, castles and taverns, the Mongolian steppe, gamelan, flamenco, four chord pop, beat tapes (J Dilla, Nujabes), trap, Fallout: New Vegas and Morricone, under the sea, sea shanties, space.
- **Magic:** Wizard101's world themes: a small orchestra handing the tune round (`pickOrchestra`). Wizard City (waltz, celesta, harp), Marleybone (Gaslamp), Dragonspyre (Dragon), Azteca.
- **Shop and Loop:** Toby Fox's Hip Shop, a 39 second loop where the bass is the hook (`bassHook`). His battles (Spear of Justice, Megalovania) and the two melodies at once all his music has (counterpoint).
- **Boss fights:** Terraria and the Calamity mod, whose boss themes are mostly a genre and a place, which is why a fight is a style any mood can take.
- **Flavours:** about a hundred kinds of moods, from The Little Mermaid's Under the Sea, Pirates of the Caribbean, Snowdin and Christmas to Joe Hisaishi, Animal Crossing, Morricone, Blade Runner, Nightwish, Deafheaven, American Football, King Tubby, Massive Attack, Martin Denny and city pop.

## How a song is made

`generateSong(mood, style, seed, mods, flavour)` works out the mood it's really writing in (`songMood`: the mood's flavour, then its modifiers, then the style) and runs its picks, each on its own seeded random numbers, so remixing one pick (`rerollSong`) leaves the rest alone and a modifier gives the same song, changed:

1. `pickTonality`: key, scale, tempo, meter, swing, chord colour, chord length.
2. `pickChords`: roman numeral progressions for parts A, B and C.
3. `pickLayers`: which roles play, each dressed with an instrument, pattern, tone and mix (`dressLayer`), then `fitBand`.
4. `pickArrangement`: the sections and who plays in each, sometimes a solo (`addSolo`) or a key change (`LIFTED`).
5. `pickOrchestra`: whether the tune's handed round and doubled (only moods with `orchestra`).
6. `pickScenery`: a lone tune or scenery for a thin ambient song.
7. `pickDoubles` and `pickRecordings`: who doubles the melody, and which recording each layer plays.
8. `pickSpace`: reverb, echo, warmth, wobble and drive.

`composeSong(song)` writes the notes: one composer per role (`COMPOSERS`), the drums, a syncopated bass and stabs all reading one groove (`GROOVES`). Then the band listens (`listen`), players ornament (`ornament`), pianos pedal (`pedal`), key changes lift (`liftKey`), and swing, humanising and dynamics go on (`feel`).

- **Styles.** Explore (`ambient`), Theme (`tune`), Town (`loop`: no intro or outro, its end leads into its start), Cutscene (always builds, a finale a key higher), Skirmish (`mini`), Boss fight (`boss`) and Final boss (`final`: two phases, the second a key higher). Fights drive whatever the mood and loop with no outro.
- **Modifiers** (`MODIFIERS`, up to four): words in front of a mood (calm, angry, fast, jazzy, lo-fi, epic, dramatic, rising...) that change how its own band plays. They replaced blends, which mixed a second mood's band in and sounded like neither.
- **Flavours** (`FLAVOURS`): the kinds of music a mood holds (Underwater's deep and its reef party). The first kind is the plain mood and is never saved. Each other kind has its own `phrasing` (motif shapes, rhythm family, hooks, pickups), so the same seed in another flavour is a new tune written that kind of music's way.
- **Melodies** grow from one motif (a rhythm and a shape from `CONTOURS`), in question and answer phrases with a second idea, an a a b a middle in long sections, and small changes on later times round. Solos are built four bars at a time from new ideas and climb to a peak.
- **Orchestration.** A counter melody can take the tune (`tune` pattern) and bells can double it an octave up (`double`); `passTune` hands it round section by section and has everyone on it the last time. `c.line()` gives any composer the melody's line for a section.
- **Doubling** (`layer.with`, `DOUBLES`). A choir singing the tune gets two more voices on every note; anything else gets a partner now and then in its loud sections. Only recordings double.
- **Builds** (`builds`, `BUILDS`). One player, then everyone a section at a time to a climax, then usually a breath and a finale a key higher. A mood's `build` chance, Rising (always), Cutscene (always).
- **Key changes.** A section marked `LIFTED` and everything after it play a whole step up (a half step a third of the time), moved after the band's written, listened and ornamented so everything still fits.
- **Drama and preludes.** A mood's `drama` stretches section energies apart; a `prelude` opens on scenery alone.
- **Ambient songs** with no tune usually get a lone line drifting over the pads, and one with no scenery gets some (`pickScenery`).
- **The bass hook** plays the groove's kick and comping hits, a chord note from a lick each, leading into each chord and running up into every fourth bar.

## Saving and sharing

- **Saved songs keep their composer.** Notes are written from settings every time a song plays, so a song remembers the composer that made it (`song.composer`, none being 1) and `composeSong` hands an older one to it (`KEPT_COMPOSERS`). Unstamped songs play as 1; the page marks ones saved after composer 1.5 was committed as 1.5 (`markMorningSongs`), and the Song tab's Composer (only shown for older songs) picks one by hand.
- **The library** (`library.js`) keeps each save's settings and the notes it played. Opening a save whose notes the composer no longer writes plays the saved notes (`frozen` in maker.js). Save over a song and the one before goes in its history (forty back); Save copy makes a new song; a clashing name gets a number. Bin before delete. Old local storage saves move over once.
- **Backups** are every song, history and bin as one file. **Song files** are one song and the notes it plays (`songFile`: `{ squimble: 'music song', id, name, saved, song, notes, print }`), from Download song file or a library song's Download. Restore and Add song files only ever add: a song already there gets the saves it's missing, and a single song file opens. Old song files (just the settings) still open. The game reads a song file's `song`.
- **Links** are `#seed/mood/style/modifiers/flavour/changes`: what the seed makes, plus only what's changed (`songChanges`), deflated, in url safe base64. A track made by hand is `#/changes` from a blank track. Old `#song=` links still open.

## The band

- **Synthesised instruments** copy what makes the real one sound real: struck things ring at their real overtones (`modal`, `modalBuffer`), plucked strings are Karplus-Strong (`ksBuffer`, tuned back by `buffer.cents`), bodies boost fixed resonances (`body`), held notes drift (`drift`, `ensemble`), flutes chiff, strings twang, and leads use waves built from real spectra (`WAVES`).
- **Recordings** (`samples`, `sampled`, `more`): a few notes per folder, the nearest retuned; held ones loop their steady middle (`loopNote`). A layer picks one of an instrument's recordings (`pickRecording`), never one the song's already playing. They load only when a song uses them, the synthesised version playing until then. Recorded scenery is events cut from one take (`recordedScenery`) or a bed of crossfaded slices (`recordedBed`).
- **Sung lines** (`sung`): one recording glides through a phrase (`singLine`) rather than restarting each note. A singer's part sits near their own note (`home`), a voice's inside what it sang (`range`).
- **Guitar rigs** (`amp`, `ampChain`): a cut before the clipping, a mid push, a compressor for sustain, the clipping, tone, a steep speaker roll off, then double tracking, chorus or reverse reverb, in the layer's channel so a chord clips as one.
- **The mixing desk** (`PLACES`, `buildGraph`, `makeChannel`): one shared short room for everyone, presence and air for the tune taken from the backing (scaled down by `edge`), reverb and echo returns without their lows, a glue compressor (2:1, 30 ms), a little 300 Hz out, tape saturation with a gentle top cut, and a limiter. Soft recorded notes are darker (`recordedHardness`), slurred recordings start past their attack (legato), and keys spread by pitch (`KEY_SPREAD`).
- **Slides, bends, vibrato and swells.** Any note can carry `bend` pins (`[beats, semitones, shape]`, shapes in `CURVES`), `shake` (cents) and `swell` (1 or -1), written by ornaments or the note editor and saved in edits as `[beat, midi, length, to, glide, shake, curve, swell, vel, mute]` with defaults left off (`packEdit`).
- **Playing smoothly.** The reverb tail stops 45 dB down (its length was the biggest cost) and is cached; the clock starts after the band is ready; strings and struck notes are worked out ahead (`warmNote`); the audio buffer is bigger; phones (`LIGHT`) send notes further ahead; an iPhone's silent switch is handled (`unmute`).

## Making your own and learning a part

- **Making your own.** New track is `blankSong()`: an empty melody, bass and drums. A layer marked `hand` plays only its edits; a song marked `own` is made by hand, so moods, styles and modifiers only change how written parts play. Make it mine and Keep notes turn written parts into hand ones (`takeNotes`), keeping each note's `vel` and `mute`. The keyboard plays the open layer, Record writes it in on the grid, Click is a metronome (never in a WAV), and the Chords tool puts down the chord there (`voiceChord`).
- **Learning a part.** The Learn tab shows one layer as falling piano notes (right hand green, left blue), a guitar or bass neck with fingers over a scrolling tab, or sheet music. `learn.js` finds every way to hold each chord within four frets and picks the cheapest path through the part (Viterbi), fingers a fret a finger with barres when short of fingers, spells notes in the key signature that shares most of the scale, and cuts notes at bar lines into tied values. Practice speed gives the player a slower copy of the song (`load()` in maker.js).

## Rules for a band that fits

Each is here because the song sounded wrong without it, and most have a check in `tests/music-check.js`.

**Rhythm**
- One groove per part for drums, syncopated bass, block keys and stabs (`GROOVES`). The same bar every bar apart from fills; B is lifted and C dropped only for the pop grooves (`LIFTS`).
- Pulse and sparse beats never fill or crash. The newer beats fill too (`FILLS`).
- Humanising moves the band together (`pocket`); drums and bass add almost nothing of their own (`LOOSE`).
- No swing in 6/8, and none unless the mood asks.
- Drums and bass stay dry: no echo, little reverb, the bass hardly in the shared room.
- The heartbeat's second thump lands a whole number of groove steps later. A gamelan's gong closes every cycle.

**Sound**
- Every tonal instrument has an `edge`; moods cap it (`maxEdge`) and backing gets 75% of the cap. Nothing is a hair over (`+ 1e-9`: 0.6 × 0.75 is 0.4499...).
- Brightness stays near the mood's, never above 1x for a fully harsh instrument; backing is a touch darker.
- Struck and plucked instruments get no vibrato and little detune. Gentle bells use harmonic overtone ratios.
- No two layers share an instrument; chip and acoustic sounds never share a song (`world`); surprises come only from moods about as dark (`kindred`), never from or into moods with `surprise: 0`, and never `own` instruments.
- Backing sits at least 0.1 under the melody (less for a buried tune, `bury`). Textures sit at 55% of the melody (0.42 with none), 85% of that with two.
- Drums sit under the band: volume follows energy, they play at 0.7 in the synth, brightness is capped by energy, and a big room doesn't lengthen them.
- Textures are scenery: mostly events with quiet between (`moments`, `swells`), each from its own spot (`spot`), gains near the vinyl's. An ambient song can have a second texture, never the same one or two beds.
- Recorded scenery was levelled against its synthesised self (beds by average, events by loudest second, new scenery by the sparse textures').
- Notes ring on like real ones; chords in tunes let go at 0.8 of their release. Harder is brighter (`hardness`). Blown and bowed notes scoop. Pads are wide.
- Every part but bass, drums and drones has its lows cut (`CUTS`). The tune sits in the middle and fill-in parts stand on opposite sides (`spread`).
- One shared room, clean returns, the tune in front by tone not volume, and a master that glues rather than squashes.
- Recordings are picked five to one (`preferRecorded`), each layer its own recording (`pickRecording`), and only recordings double. A choir sings in sections.
- One rig per layer; loud patterns play power chords (root, fifth, octave); rhythm guitars are double tracked, near the middle and not turned down for their edge; distorted chords sustain (`amp.sustain`, long `decay`, bright `ring`).
- Plucked strings start soft (`soft`), high strings ring less, and tunes don't cut a pluck's release.
- Instruments drift; chip leads and tonewheel organs don't. Pianos, mallets and acoustic bells are modal; synth bells stay FM.

**Listening** (`listen`, `COMPOSERS.drums`)
- Everyone writes, then the band listens before `feel`. Hand added notes are left alone; a moved note keeps its `written` pitch for the editor.
- The tune stays on top: keys, arps and counter melodies drop an octave if they'd start above it. Pads and bells stay put.
- Nothing rubs against the tune (a minor second or ninth against a melody note of half a beat or more): pads and keys drop the added note, lines (arps, bells, counter melodies, a riff's line and the bass doubling it) move to a chord note that doesn't rub or climb over the tune.
- Everything with a pitch is in key: tuned drums (`tuneDrum`), the hum, the crickets.
- The drummer plays softer and without ghosts when fewer than half the others play. A kit only plays patterns it `suits`. Rock drummers fill down the toms, crash every four bars in a chorus, keep hats to eighths and ride the chorus (`ROCK`, `RIDES`).

**Parts**
- An arp or a counter melody, never both; with an arp keys strum and pads hold. Two moving middle parts at most (`MIDDLE`). Six layers in ambient songs, seven otherwise (one more in a build).
- No running notes faster than six a second (`MAX_RATE`); tremolo picking isn't running notes. No walking bass unless the mood asks.
- Melodies: one motif per layer, two lengths of note at least, strong beats snapping the way the shape was heading, no rests inside a bar (they breathe at phrase ends), "calls" holding through half the next bar, "fragments" ringing into their gaps but not past the section.
- Solos never repeat, climb to a peak, land on the root, and the band treats the soloist as the tune. Counter melodies answer in whole bars or harmonise; as a second melody (`counterpoint()`) they follow the rules of counterpoint (`CONSONANCE`).
- Bells: drifting loops are whole beats long; chimes are one figure on the chord changes. A glockenspiel doubling the tune above 130 bpm plays only notes of half a beat or more.
- A layer that's in stays in until a real change of gear. Each mood says what opens its songs (`opens`); no section is ever only the texture, apart from a `prelude`.
- Guitars move in shapes (`guitarShape`). Loud, quiet, loud: with two guitars one plays each section (`LOUD`). Riffs repeat, follow the chords, turn round every fourth bar, and suit the tempo; the bass doubles them an octave down. Eighths chug in the verse and ring in the chorus.
- Players ornament (`ornament`, per instrument `ornaments`, per mood `ornate`) by bending written notes, so every rule above stays true; dice come from the note's place, so a motif comes back ornamented the same. Blown, bowed and sung lines slur. The pedal rings to the chord change (a bar or two seconds at most) and stops at a semitone rub.
- A song that ends comes home (`cadence`); loops and fights lead back to their start. Sections have dynamics (`loudness`).
- Jazz comping is rootless; comping, bossa and skanks stay with an arp. A plucked drone is plucked round and round (`cycle`). A throat singer holds one note near their own.
- The tune is handed round, never given away (`passTune`), and everyone plays it the last time the theme comes round, never in a part C break. A layer carrying the tune is the tune: never moved by listening, never turned down as backing, never mutated.
- A bass hook is the drums' rhythm, starts each chord on its root, and its leading notes pass.

**Moods, fights and modifiers**
- Each mood says how likely drums are (`drums`) and which kits and patterns suit it. Remixes and mutate only pick from the mood's patterns.
- Progressions with notes outside the scale are less likely; a shaded scale takes its chords with it (`reharmonise`).
- A flavour belongs to its mood, keeps the mood's caps (or says its own `edge`), and the plain flavour changes nothing.
- A build only grows on the way up, has everyone at the top, rolls into the climax, and nobody solos. A key change stays up (a loop goes back down where it starts again), and a loud one is the peak: a roll, a crash, crashes every other bar, played a little harder.
- A mood a modifier already makes isn't a mood (`RETIRED`).
- The loud and hazy moods have their own `layers`, `forms`, `solo` and `soloOver`, `breakdown` and ambient-only patterns, and keep to themselves. In a band with a guitar, the melody and guitars choose first (`dressOrder`).
- New moods, roles and picks never move old seeds: no roll for a guitar in a mood without one, new picks on their own random numbers, new world moods with `surprise: 0` and `own` instruments, kits and scenery.
- A fight drives whatever the mood (`FIGHT_ENERGY`, quicker, no swing, drier, drums on a kit that suits a fight, `FIGHT_KITS`), keeps the mood's driving patterns (and `ALSO_DRIVING`), always has its tune, bass and beat, and loops. It applies after the modifiers.
- A modifier changes how the band plays, not who's in it (only lo-fi, retro, acoustic, epic, jazzy and spooky swap sounds). Opposites can't both be on, at most four, in `MODIFIERS` order. No modifiers, no `mods` key.

## What sounded wrong, and the fix

Kept so nobody undoes a fix by accident.

| What it sounded like | Why | Fix |
| --- | --- | --- |
| Drums out of time | Dice every step, and kick, bass and stabs each with their own rhythm | One groove per part (`GROOVES`) |
| Parts smearing apart | Each layer's own timing nudge | The shared `pocket` |
| 6/8 lopsided | Swing bent its triplets | No swing in 6/8 |
| Ghost drum hits off the beat | Drums through the dotted echo | No echo on drums or bass |
| Chords arriving late | Slow pad attacks | Shorter attacks for chords in tunes, capped at half the note |
| Harsh leads over soft backing | Brightness swung 0.4x to 2.2x, and surprises could be saw leads | `edge`, `maxEdge`, brightness caps |
| Seasick pianos and bells | Vibrato and detune on everything | None on struck or plucked instruments |
| Bells clashing with chords | Inharmonic FM ratios | Harmonic ratios for gentle bells |
| Melody cutting out | Random rests repeated every bar; calls emptied bars | No rests in bars; calls hold over |
| A stray blip on the melody | A one note motif's ending spilled into the next bar | Endings keep only notes that finish by half way |
| Counter melody fragments | Notes dropped wherever the melody played | Whole bar answers, or harmony |
| Bells at random times | Half beat loop lengths, random sparkle | Whole beat loops, chimes on chord changes |
| Layers blinking in and out | Random wobble on section energy | Once in, stays in |
| Cozy songs with a hip hop beat | The lo-fi kit on pop grooves | Brushes on a jazz ride |
| The band pumping on every kick | Drums at full level drove the compressor | Drums at 0.7, volume by energy |
| Drums out of key | Fixed pitch kicks, toms and ticks | `tuneDrum` |
| Drums too much in calm songs | Same level and ring in every mood and section | Energy sets level and brightness; softer in thin sections |
| Heartbeat out of time, or on the wrong pattern | A fixed 0.24 s gap; kit and pattern picked apart | Groove steps; `suits` |
| Wind or rain burying the tune | Textures as loud as the melody, a steady roar of wind | Capped under the melody, events with quiet between, gains near the vinyl's |
| A hum or crickets out of key | Fixed pitches | The home note; crickets chopped by a triangle |
| Harp hitting hard and metallic | Pure noise strings, no filter, cut releases | `soft`, a filter, shorter high strings, longer release |
| Arp over the tune, sevenths grinding against it | Nobody knew what the melody played | `listen`: the tune on top, nothing rubbing |
| Organ, tuba, growl bass, fiddle never chosen | No `edge`, no mood, or exactly at the cap | Edges set, palettes fixed, `+ 1e-9` |
| Two melody notes at once in fast 6/8 | Notes stretched past their cell | Never longer than the cell |
| Forgettable melodies, one idea looping all song | A random walk, then one four bar plan | Motifs, a second idea, question and answer, a a b a, passing notes, solos |
| Slow tunes flat, hooks of one note | Snapping to the last note; shapes flat on two notes | Snapping follows the shape; shapes that work at any length |
| Happy songs a pile of noises | Four middle parts, fast arps, chip drums under a harp, a haunted pad surprise | Two middle parts, `MAX_RATE`, `world`, `kindred` |
| Sounding like midi | Dead notes: no release, one colour, mono pads, a reverb with no walls, no bodies, no ornaments | Releases, `hardness`, `scoop`, wide pads, early reflections, modal, bodies, drift, ornaments, slurs, curved slides, delayed vibrato, swells |
| Ambient songs with no sense of place, or empty | One texture, every event from one spot; half with no tune | More textures, `spot`, a second texture, `pickScenery`, recorded scenery |
| Songs starting ambient, then becoming another song | Layers came in by energy alone | `opens` |
| Panned textures measuring 3 dB quiet | `levels.html` rendered mono | Stereo through a centred panner |
| Metal on the wrong guitar, old seeds changing, an overdrive in dream pop | 1.2 × 0.75 rounding, a guitar roll at 0%, the tune taking the clean guitars | Metal's edge 1.25, no roll without a guitar, `dressOrder` |
| A riff note missing, rock hats a hiss, guitars buried, a shoegaze voice sticking out | Listening dropped a riff note, sixteenth hats at punk tempos, guitars turned down for edge | Riff lines move, eighths in rock, guitars not turned down, `bury` |
| A solo ending off the chord; an arp over a low tune | A chromatic chord no scale step reaches; dodging upward | The last note goes to the root; a note above the tune only moves down |
| Distorted chords dying like acoustic ones | Nothing held the string before the clipping | `amp.sustain`, longer `decay`, brighter `ring` |
| Folk with angry mashing two bands | Blends | Modifiers |
| A quiet intro as hard as the last chorus | Strengths didn't know their section | Section energy and `loudness()` |
| The rasping voice never rasped; high plucks out of tune; random guitar bends | Wiring past the clipper; whole sample loops; a coin toss in the synth | Rewired; `buffer.cents`; the composer writes bends |
| Chip tunes made jazzy getting brushes; a country arp turning into a flute | Only acoustic kits allowed; empty palettes | Borrow a kit that belongs; fuller palettes, and checks |
| Synthesised next to recorded sounding plastic | Recordings and synths picked equally | Recordings for most, picked five to one |
| A crowded, boomy band; the outro stopping mid thought | Low ends piling up, random pans; the last chord was the turnaround | `CUTS`, `spread`; `cadence` |
| Songs crackling and stopping at the same spot | A fast pad's strikes each rang out their whole release | Restrikes fade the last one (`findRestrikes`) |
| Songs flat however good the notes | One instrument per part all song | Orchestration (`passTune`) |
| Bass lines that only marked the chords | Every pattern held, pulsed or walked | The bass hook |
| Game music winding down | Tunes had intros, outros and a home chord | The Loop style |
| Everyone on the tune in a quiet break | The tutti went to the last section with the tune | The last theme that isn't a part C |
| Too many moods, several the same | Moods a modifier already made | `RETIRED` |
| No way to start on sound effects; never dramatic enough | No texture-only section; energies all 0.3 to 1 | `prelude`; `drama`, Tragic, Dramatic |
| Flat and midi, parts not blending; hits squashed | No shared room or places; a 5 ms compressor | The mixing desk, glue |
| A sampled keyboard sound; recorded lines restarting each note; a piano from one point | Soft notes as bright as hard; slurs from the attack; mono | `recordedHardness`, legato, `KEY_SPREAD` |
| A choir thin and fake; the same guitar in every song; harsh edges | One recording; always the first recording; presence on saw leads | Doubling; `pickRecording`; presence by `edge`, a tape top cut, recordings five to one |
| Close to C418 but not quite | Pianos stopped as notes ended, a bright felt piano, no Moog | The pedal, a soft upright, Moog bass and lead, more flavours |
| Links too long to share | The whole song as base64 | Seed plus changes, deflated |
| Songs the same all the way through; flavours barely changing a song | Every form went round; flavours only swapped instruments | Builds and Rising; each flavour's `phrasing` |
| Fights and dramatic songs too short; builds peaking low | A minute and a quarter round; climbs that stopped at the top | Longer fights, Final boss, Cutscene, a breath and a finale a key higher |
| Stutters, and silence on iPhones | The reverb's tail, the clock starting early, notes worked out late; the silent switch | A shorter tail, the clock after setup, `warmNote`, a bigger buffer; `unmute` |

## Adding things

- **A change that makes saved songs sound different** (anything in how `composeSong` writes notes, or a mood or flavour setting it reads; `tests/saved-songs-check.js` fails when one does): first keep the composer, the way `kept/composer-1.js` was made (music.js before the change, wrapped in a closure that adds `KEPT_COMPOSERS[n]` and returns `{ composeSong, generateSong, MOODS, FLAVOURS, STYLES }`), as `kept/composer-n.js` with n the `COMPOSER` it was. Add its script before music.js on the page, put the next number on `COMPOSER_VERSIONS` (and the Song tab's Composer keys), make the change, and run `tests/saved-songs-check.js --add`. Never edit a kept file or a kept song set. A change only to how new songs are picked (`generateSong`) doesn't need it, since a saved song keeps its picks.
- **An instrument:** a line in `INSTRUMENTS` (synth.js) with a family, an `edge` judged by ear, a `world` if chip or acoustic, `own` if only where a mood names it, and an engine. A voice gets `sung` and a `range`, something lower or higher an `octave`, a piano `pedal`, a guitar sound an `amp` (its loudness is the rig's `level`). A real instrument usually wants a `body`, a little `drift` if blown, bowed or sung, and `ornaments`. Something struck is `modal`. Set its `gain` with `tests/levels.html`. Check the id isn't taken: a duplicate key silently replaces the first. A kit needs `suits`.
- **Recordings for an instrument:** a folder in `FOLDERS` (or `KITS`) in `tools/build-samples.js`, run with `--probe` first (libraries disagree on octaves; bells fool the pitch check), then `samples: 'folder'` and a `sampled.gain` measured against the synthesised version. A second recording goes in `more` with a `name`. Runs of notes (Iowa) use `runs`; `rr` keeps several takes, `retune` tunes an instrument tuned its own way, `font: 'musyng'` uses Musyng Kite. Only libraries whose licence allows a game, with a credit on the page if asked.
- **A recording from Freesound:** a source with the uploader and licence (CC0 or CC BY, credited on the page), and `files` of previews `[preview, note, loudness, second to start, cents out]` (or `measure` for something tuned its own way). Scenery is one take cut where it goes quiet (`split`), or sliced (`chop`), with `pitched` to measure each piece and `even` for takes at very different levels. A steady one is a `bed`.
- **A doubling partner:** a line in `DOUBLES` (music.js). Only recorded ones are used.
- **A modifier:** an entry in `MODIFIERS` with `name`, `tip`, `against` if it has an opposite, and `apply(mood, style)` changing a copy of the mood. Change how the band plays before adding sounds.
- **A texture:** a line in `INSTRUMENTS` and a function in `TEXTURES`, something that happens now and then (`moments`, `swells`, `spot`), its gain near the vinyl's. A steady one is a `bed`.
- **A mood:** an entry in `MOODS` with a `group` (the comment above `MOODS` lists every field) and its `FLAVOURS` entry (an `about` and kinds, the first the plain mood). Set `drums`, keep its palettes under its edge cap, give it `surprise: 0` unless it should share surprises (or older moods' songs change), and a `build` chance if its music builds.
- **A flavour:** a kind in its mood's `FLAVOURS` entry: a `name`, a `tip` starting with the name (describing the feeling and place, naming no game, film, band or song; the inspiration goes in a comment), a `style` if it's made for another, only the settings it changes, and a `phrasing`. Never change the first kind.
- **A style:** a name in `STYLES` and entries in `LAYER_CHANCE`, `MOST_LAYERS`, `OPENING`, `FORMS`, `SOLO_CHANCE`, `DOUBLE_CHANCE` and `STYLE_PATTERNS` (or share one), a button on the page, and the check's `STYLES`. A fight goes in `FIGHTS` and `FIGHT_ENERGY`, anything that loops in `LOOPS`.
- **Orchestration for a mood:** `orchestra: { pass, double }`, and leads in its counter palette.
- **Retiring a mood:** move it to `RETIRED` with its replacement and modifiers, make sure none of its instruments, kits or textures were only there, and check the other moods' seeds still make the same songs.
- **A groove:** a line in `GROOVES`, a bar long, in every time signature.

## Known issues

- Much of the sound was set from measured levels, printed notes and the checks rather than by ear: the recordings and their gains, the mixing desk, doubling, the pedal, the voices, recorded scenery, the seventh round's key changes and longer songs, and the iPhone fixes (WebKit on Windows has no Web Audio). If something sits wrong, adjust its `gain`, `sampled.gain`, slot `level`, rig settings, `edge` or ornament chances before adding a special case. If a key change sounds too much, make the half step rarer (0.65 in `pickArrangement`); if a finale's crashes are too much, `every` in `COMPOSERS.drums`; if doubling is too loud or often, `DOUBLE_LEVEL` or `DOUBLE_CHANCE`; if a build is too thin or crowded, `BUILDS` or `BUILD_BAND`.
- A save keeps its notes, not its sounds: changing an instrument changes how saved songs sound, never their notes. Only a song's latest save keeps notes; history keeps settings (the kept composers play them exactly). Without IndexedDB the library works from local storage alone, with no notes and ten saves of history. Backing up is a button, not automatic.
- A link carries the seed and its changes, so it opens with the picks of the code on the page when it's opened, and rounds numbers to four places. A song file keeps every setting and the notes.
- Listening only looks at the melody: two backing parts can still rub, a counter melody can rub against a pad's added note, and a texture doesn't duck. Only the tune is handed round; the accompaniment stays on one instrument. A layer taking the tune plays the melody's line, so hand edits to the melody move it too.
- Notes added by hand aren't held to the rules, on purpose. A solo isn't editable note by note.
- About one solo in seven ends on a chord note other than the root (roots outside a pentatonic scale can't be sung home to).
- Only 4/4, 3/4, 6/8 and 5/4: a bar must be a whole number of beats.
- Not every modifier suits every mood (retro heavenly). That's on purpose.
- Some recordings stand in for instruments no free library has (a recorder for the tin whistle, a shehnai for the shawm, a strumstick for the oud, the erhu for the morin khuur, the koto for the yatga and guzheng, and more). The voices have few notes each (humming three, the soprano five), the 808 bass is one note stretched, and a few Iowa guitar and bonang notes were left out, so neighbours stretch to cover them. A note more than a fifth past its recordings plays synthesised. The chip kit, tabla and brushes stay synthesised. The jRhodes and TR-909 sets were left out for their licences; the Musyng Kite recordings are CC BY-SA.
- Recorded scenery isn't in key apart from the owl and the singing bowl (the siren's out of key on purpose). Beds are mono in the middle. A throat singing take's overtone tune comes round every ten seconds or so, and the synthesised throat singers sound nothing like the real thing.
- `levels.html` measures one held note, which undersells plucked sounds played often: check them in a song too.
- The reverb tail stops 45 dB down: in silence at the very end of a song in a big hall it might stop audibly sooner.
- The learn tab's sheet music is one voice, rounded to sixteenths, with flags not beams, and keeps the home key signature after a key change. Piano parts aren't fingered. A few of the composer's guitar chords can't be held whole and lose a note (the tab says so). Only standard and drop D tunings.
- The note editor's drum rows are named alike for every kit (a rock kit's ride is "Perc").
- Old seeds make different songs after most rounds of changes; saved songs keep their sound through their composer and notes.
