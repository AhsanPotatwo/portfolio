# Squimble Music Maker

Procedural music for Squimble Quest, on its own page (`squimble-music-maker.html`) until it moves into the game. Music comes from a seed and the rules of music theory. There's no AI and there are no samples.

## Keep the notes true

This README and the code comments are the only notes. When you change something:

- **Changed how something works?** Update the comment beside it, and this README where it describes it.
- **Fixed something that sounded wrong?** Add it to [What sounded wrong, and the fix](#what-sounded-wrong-and-the-fix), and make the rule a check in `tests/music-check.js` if it can be one.
- **Found a problem you haven't fixed?** Add it to [Known issues](#known-issues).

## Files

| File | What it is |
| --- | --- |
| `music.js` | The composer: settings to notes. Plain maths with no page or audio, so node can run it and the game can load it as it is. Its header explains songs, the theory and times. |
| `synth.js` | The band: `INSTRUMENTS`, drums, textures, the room (reverb, echo, tape) and the player (`MusicPlayer` live, `renderSong()` to WAV), all on Web Audio. Load it before `music.js`, because the composer picks from `INSTRUMENTS`. |
| `maker.js` | The page: controls, the score, the note editor, the library and exports. The game won't need it. |
| `tests/music-check.js` | `node js/squimble-music-maker/tests/music-check.js`. No output means it all passed. It takes about 25 seconds. |
| `tests/levels.html` | How loud every instrument and texture is, weighted the way ears hear. Open it in a browser and wait about a minute. Set a new sound's `gain` so it sits with its neighbours. |

## Where the sounds come from

The moods and sounds are aimed at particular game and ambient music:

- **Ambient:** Aphex Twin's Selected Ambient Works (analog pad, sine bell, tape loop, drum machine), the Fallout 1 and 2 scores (Desolate: bowed metal, metal pings, Geiger counter, creaking metal), Dying Light (analog pad, Reese bass, synth brass, the slower side of Neon) and Minecraft (felt piano and nylon guitar playing Fragments, cave drips).
- **Melodic and upbeat:** Undertale and Deltarune (Spirited: pulse lead, triangle bass, chip kit, riffs, the "royal road" IV V iii vi), Terraria (pan flute, nylon guitar, birdsong), Minecraft, and Stardew Valley (Happy and Playful: flute, clarinet or accordion over a fingerpicked or strummed steel guitar, soft strings, a root and fifth bass, a light kit, and sixteen bar themes).
- **Mellow and serious:** Have a Nice Life (Bleak: fuzz wall, chanted choir, chorus bass, a drum machine in a huge room).
- **Dark electronic:** Crystal Castles (Neon: bit lead, pumping pads, four to the floor, club kit).

## How a song is made

`generateSong(mood, style, seed)` (music.js) runs five picks, each with its own seeded random numbers:

1. **pickTonality:** key, scale, tempo, time signature, swing, how rich the chords are, how long each chord lasts.
2. **pickChords:** a progression for parts A, B and C, as roman numerals.
3. **pickLayers:** which roles play (melody, pad, bass...). Each one is dressed with an instrument, a pattern, a tone and a mix (`dressLayer`), then `fitBand` applies the rules below.
4. **pickArrangement:** the sections, and who plays in each. Often a solo section too (`addSolo`).
5. **pickSpace:** reverb, echo, warmth, wobble and drive.

`composeSong(song)` turns those settings into notes, one composer per role (`COMPOSERS`). The drums, a syncopated bass and the chord stabs all read the same groove (`GROOVES`, `grooveFor`). Once every part is written, the band listens to each other (`listen`, see below) before the notes get their swing and humanising (`feel`). The remix buttons re-run one pick with a fresh seed (`rerollSong`).

## Rules for a band that fits

Every one of these is here because the song sounded wrong without it. The code comments beside each say the same.

**Rhythm**
- **One groove for the band.** Drums, syncopated bass, block keys and pad stabs all play from one hand-written groove per part. A busy bass also plays the comping hits.
- **Grooves repeat.** The same bar plays every bar, apart from fills. Part B gets a lifted version and part C a dropped one, but only for the pop grooves (`LIFTS`).
- **Quiet beats stay quiet.** Pulse and sparse patterns never fill or crash.
- **Humanising moves the band together.** Every note on the same spot gets the same nudge (`pocket`). Drums and bass add almost none of their own (`LOOSE`).
- **No swing in 6/8.** No swing at all unless the mood asks for it.
- **Drums and bass stay dry.** They get no echo and little reverb.
- **Heartbeat's second thump is on the grid.** It lands a whole number of groove steps after the first.

**Sound**
- **Every tonal instrument has an `edge`** (how harsh it is, 0 to 1, in `synth.js`). Each mood caps it (`maxEdge`), and backing layers get 75% of the cap. The melody is allowed to be the brightest thing; nothing under it buzzes.
- **Brightness stays near the mood's.** It never goes above 1x for a fully harsh instrument, and backing is a touch darker.
- **Struck and plucked instruments (keys, bells, basses) get no vibrato** and hardly any detune. They sound out of tune against a steady pad otherwise.
- **No two layers share an instrument.**
- **Gentle bells use harmonic overtone ratios** (glass bell 2, wind chime 7). The old ones (1.4 and 7.1) clashed with every chord.
- **Backing sits at least 0.1 under the melody's volume.**
- **Drums sit under the band.** Their volume follows the mood's energy, they play at 70% inside the synth, their brightness is capped by energy, and a big room doesn't make them ring longer.
- **Textures are scenery, and mostly sparse.** Wind, ocean, rumble, drips, birds, the Geiger counter and creaks happen now and then with quiet between (`moments()` and `swells()` in synth.js), the way the vinyl crackle does. Every texture's `gain` puts it near the vinyl's loudness (`tests/levels.html`). A texture also sits at no more than 55% of the melody's volume (0.42 with no melody), and 85% of that when there are two.
- **Textures are a place.** Each bird call, drip, croak, hoot or creak comes from its own spot left or right (`spot`). An ambient song can have a second texture (half the time, in moods with something that happens now and then), but never the same one twice or two steady beds (`bed`) together.
- **One band, not two.** Chip sounds and acoustic ones (`world` in synth.js) never share a song. Whichever is picked first, usually the melody, sets it. Sounds with no `world` go with anything.
- **Surprises come from nearby moods.** The odd instrument from outside the mood's palette must be in the palette of a mood about as dark (`kindred`), so a playful song can't draw the haunted pad.
- **Notes ring on like real ones.** Leads, keys and plucks have releases long enough to ring into the room, and chords in tunes let go at 0.8 of their release, not 0.55.
- **Harder is brighter.** A note's strength opens its filter (or its FM brightness, or its pluck) as well as making it louder (`hardness`).
- **Blown and bowed notes scoop.** Flute, clarinet, violin, horn and the like start a few cents flat and slide onto the note (`scoop`), on notes longer than a fifth of a second.
- **Pads are wide.** Pads and drones spread their oscillators left and right, and the reverb has early reflections before its wash.
- **Plucked strings start soft and ring on.** `soft` mixes a finger's smooth pull into the string's starting noise, high strings ring for less time than low ones, and tunes don't cut a pluck's release short.

**Listening** (`listen` and `COMPOSERS.drums` in music.js)
- **Everyone writes their part, then the band listens.** It's a pass over all the parts before `feel`. Notes added by hand are left alone. A note it moves keeps the pitch it was written at (`written`), which the note editor uses to remove it.
- **The tune stays on top.** Keys, an arp or a counter melody that would start above the melody note that's playing drop an octave, if that keeps them in their range. Pads (a wash) and bells (meant to ring above) stay put.
- **Nothing rubs against the tune.** A minor second or ninth against a melody note half a beat or longer is the harshest clash there is. Pads and keys drop the chord's added note (seventh, ninth) when that's what rubs. Arps, bells and counter melodies move to the nearest chord note that doesn't rub and doesn't climb over the tune.
- **Everything with a pitch is in the key.** Kicks, toms, ticks, rims and the snare's body are tuned to the song's home note or fifth (`tuneDrum`). The hum hums the home note, and the crickets sing it and the note above.
- **The drummer plays to the room.** With fewer than half the others playing (an intro, a break), the drums play softer and leave out ghost notes.
- **A kit only plays patterns it suits** (`suits` in synth.js). `fitBand` changes the pattern, from the mood's list where it can.

**Parts**
- **An arp or a counter melody, never both.** With an arp, keys strum (a chord a bar) and pads hold, because two layers doing the same job tangle. With broken or oom-pah keys, pads hold too.
- **Two moving middle parts at most.** Of bells, a counter melody, an arp and keys, a song keeps two, losing them in that order (`MIDDLE`). Ambient songs have six layers at most, tunes seven.
- **No running notes faster than six a second** (`MAX_RATE`). Arps, pulses and broken chords slow down a step until they fit.
- **No walking bass unless the mood asks for it** (Cozy, Playful, Spirited).
- **A melody grows from one motif** (`tune()`, "melodies" in music.js). The motif is a rhythm and a shape from `CONTOURS` (leap and fill, arch, turn, repeat...), made from the layer's seed so every part hears it. Part B sings it higher or has its own; part C slows it down or has its own. Short motifs are played twice in a bar as a hook, and phrases can start with a pickup.
- **A theme is longer than its motif.** It has a second idea with its own rhythm (slower if the motif's busy, busier if it's slow). Four bar phrases pair up as question and answer (`QUESTION_PLANS`, `ANSWER_PLANS`): both start with the motif, and the first ends open (the chord's third or fifth) while the second comes home (the root). A sixteen bar section is a whole a a b a tune, its third phrase starting somewhere new (`MIDDLE_PLANS`). Two bar phrases take turns: motif, new notes, motif, second idea.
- **Later times round, the tune is a little changed.** Its last phrase can go another way, and some bars get a passing note, never a phrase's first bar, so the motif always comes back as you know it.
- **A melody breathes like a player.** A little louder towards the middle of a phrase and on higher notes, softer as it comes to rest (`SWELL`, `sing()`).
- **Solos never repeat.** A solo section (`section.lead`, `solo()`) is built four bars at a time from new ideas: an idea, the idea again a step away or with new notes, a new idea (often a run), then a long note to breathe on. It climbs and gets busier to a peak two thirds in, then comes down to land on the chord's root, and half the time quotes the theme once. It's added just before the theme's last return, and the counter melody takes it 40% of the time while the melody rests. Bells and the counter melody sit a melody's solo out. In a solo, the band listens to the soloist as the tune.
- **Strong beats snap the way the shape was heading.** A step up goes to the next chord note up, not back to the last one.
- **A motif has at least two lengths of note** (or one long note in a slow tune). The tresillo (3 + 3 + 2) is one of the rhythm cells.
- **Melodies have no rests inside a bar.** They breathe at the ends of phrases. "Calls" holds its last note through half the next bar before its gap. "Fragments" leaves every other two bar phrase empty, its last note ringing into the space, but never past the section's end.
- **Riffs** repeat the hook bar after bar (`RIFF_PLANS`), busy enough (75%) to have a rhythm, and only end on the section's last bar.
- **Counter melodies answer in whole bars** where the melody rests, or else harmonise in thirds or sixths.
- **Bells are predictable.** Drifting loops are whole beats long (2 to 4 bars, give or take a beat or two). Chimes are one short figure, rung as the chords change.
- **A layer that's in stays in.** It only drops out for a real change of gear, like a break or the outro.

**Moods**
- **Each mood says how likely drums are** (`drums: [ambient, tune]`) and which kits and patterns suit it. Dreamy and Heavenly have none. Cozy and Wistful use brushes on a jazz ride. Calm and Sad only get rare soft pulses. Neon is four to the floor on the club kit, with pumping pads. Bleak's drum machine plays half time. Desolate only gets sparse pulses.
- **Each mood says what opens its songs** (`opens`): the guitar then the bass in Happy (Stardew Valley), the beat and bass in Upbeat and Angry, a march under strings in Heroic, chip arps and bass in Spirited, a pad or drone in the ambient moods. A tune opens on two of them and an ambient song on one, and they play the whole song through, so the intro already sounds like the song. With none of the mood's openers in the band, any of pad, keys, arp, drone, bass or drums will do (`OPENERS`). No section is ever only the texture.
- **Mutate and remixes only pick patterns from the mood's list,** so a cozy song can't mutate into a tribal beat.
- **Progressions are picked to suit the scale.** Ones with notes outside it are less likely.

## What sounded wrong, and the fix

Kept so nobody (me included) undoes a fix by accident.

| What it sounded like | Why | Fix |
| --- | --- | --- |
| Drums out of time with everything | Drums rolled dice every step of every bar, and kick, bass and stabs each made up their own rhythm | `GROOVES`, one per part, shared by the band |
| Parts smearing apart | Each layer got its own random timing nudge | The shared `pocket` |
| 6/8 sounding lopsided | Swing bent its triplets | No swing in 6/8 |
| Ghost drum hits off the beat | Drums went through the dotted echo | No echo on drums or bass |
| Chords arriving late in tunes | Slow pad attacks | Shorter attack and release for chord layers in tunes, and attack capped at half the note |
| Harsh leads over soft backing | Brightness swung 0.4x to 2.2x on anything, and wildcards could be saw leads in calm moods | `edge`, `maxEdge`, brightness caps |
| Seasick pianos and bells | Random vibrato and detune on every instrument | None on struck or plucked instruments |
| Bells clashing with chords | Inharmonic FM ratios | Harmonic ratios for the gentle bells |
| Melody cutting out and back in | Random rests in the motif, repeated every bar; "calls" emptied whole bars | No rests in bars; calls hold over |
| Stray blip on top of the melody | A one-note motif's ending bar spilled into the next bar | The ending keeps only notes that finish by half way |
| Counter melody fragments | Notes dropped one by one wherever the melody played | Whole-bar answers, or harmony |
| Bells at random times | Half-beat loop lengths, and "sparkle" was pure chance | Whole-beat loops, and chimes on chord changes |
| Layers blinking in and out | Random wobble on each section's energy | Once in, stays in |
| Cozy songs with a hip hop beat | The lo-fi kit on pop grooves | Brushes on a jazz ride |
| The whole band pumping on every kick | Drums at full level drove the master compressor down on every hit | Drums at 70% in the synth, and drum volume follows the mood's energy |
| Drums not fitting the song | Kicks, toms, ticks and rims sat at fixed pitches, out of key with the bass and chords | `tuneDrum`: the home note or fifth |
| Drums too much in calm songs | Same level, brightness and ring in every mood, and as hard under one layer as under seven | Energy sets their level and brightness, and they play softer in thin sections |
| Heartbeat thumps out of time | The second thump was 0.24 seconds later at any tempo | A whole number of groove steps later |
| Heartbeat on a busy beat, clockwork ticks on tribal toms | The kit and the pattern were picked separately | `suits` on each kit |
| Wind or rain burying the tune | Textures as loud as the melody, and wind gusts swinging 15 dB | Textures capped under the melody, and gentler gusts and swells |
| A hum droning out of key | The hum was always an A | It hums the song's home note |
| Crickets like a piercing beep | A fixed high pitch, chopped on and off by a square wave | In the key, quieter, and chopped by a triangle |
| Harp hitting hard and metallic, and notes ending harshly | Pure noise to start the string, no filter, every string ringing as long, and tunes cutting its release short | `soft`, a filter, shorter high strings, a longer release, and no tune cut for plucks |
| Harp chords slightly out of tune in dark moods | Dark moods detuned struck instruments up to about 4 cents a note | Much less detune for struck and plucked instruments |
| Arp running over the tune | Its second octave sat above most melodies | The tune stays on top |
| A chord's seventh grinding against the tune | Added notes didn't know what the melody was playing | Nothing rubs against the tune |
| Organ never chosen | It had no `edge`, so it never fitted under any cap | `edge: 0.35`, and a check that every tonal instrument has one |
| Two melody notes at once in fast 6/8 | Sixth of a beat notes were stretched to a third of a beat | Notes never longer than their cell |
| Wind deafening, and adding little | A steady roar of noise about 24 dB louder than the vinyl (weighted), and the campfire, ocean, hum and rain 15 to 20 dB louder | Wind, ocean and rumble come and go with quiet between, and every texture's gain sits near the vinyl's |
| Melodies forgettable | A random walk of steps, new in every part, so nothing came back | One motif per layer, phrases built from it, question and answer phrases, a leitmotif across parts |
| Slow tunes flattening into one note | Long notes snapped to the nearest chord note, often the one just played | Snapping follows the shape's direction |
| Hooks of one repeated note | The arch and repeat shapes went flat on two note motifs, and two equal notes passed the "two lengths" rule | Shapes that work at any length, and a stricter rule |
| A fragment's last note ringing over the next section | It rang on into the next bar even at a section's end | It rings only inside its section |
| Melodies looping one short idea all song | Every phrase was one four bar plan built from a one bar motif, so a whole song had one to six bar rhythms (1.7 per eight bars) | A second idea, question and answer phrases, an a a b a middle, passing notes on later takes (2.6 per eight bars), and solos |
| Happy and playful songs a pile of noises | Up to four parts moving round the middle at once (an arp, oom-pah keys, chimes and a walking bass), sixteenths at 130 bpm, chip drums under a harp and music box, and a haunted pad drawn as a playful song's surprise | Two middle parts at most, six notes a second at most, chip and acoustic never together, surprises only from nearby moods, no walking bass unless asked for |
| Instruments sounding like midi | Notes stopped dead, every note the same colour whatever its strength, pads one mono point, and a reverb with no walls | Longer releases, `hardness`, `scoop`, wide pads, early reflections |
| Ambient songs with little sense of place | One texture at most, every event from the same spot | New textures (brook, leaves, frogs, owl, chimes), each event placed left or right, and a second texture in ambient songs |
| Songs starting ambient, then a different song when the melody came in | Layers came in by energy alone, so an intro was often a lone pad (half of all tunes) or nothing but the texture (up to 15% of happy, playful and neon songs) | Each mood's `opens`: two parts in its style from the first bar in a tune, one in an ambient song |
| Panned textures measuring 3 dB quiet | `levels.html` rendered mono, without a channel's panner | It renders stereo through a centred panner, as a layer's channel does |

## Adding things

- **An instrument:** a line in `INSTRUMENTS` (synth.js) with a family, an `edge` judged by ear, a `world` if it's chip or acoustic, and an engine. Set its `gain` with `tests/levels.html` so it's about as loud as the others in its family. It can then appear in mood palettes. A drum kit needs `suits` instead: the patterns it sounds right playing.
- **A texture:** a line in `INSTRUMENTS` and a function in `TEXTURES`. Make it something that happens now and then (`moments()`, `swells()`, each event at its own `spot()`) rather than a steady wash, and bring its gain near the vinyl's with `tests/levels.html`. A steady one is a `bed`.
- **A mood:** an entry in `MOODS` (music.js). The comment above `MOODS` lists every field. Set `drums`, and keep its palettes within its edge cap.
- **A groove:** a line in `GROOVES`. Every line must be a bar long, and a new drum pattern needs a groove in every time signature; the check tests both.

## Known issues

- The new moods (Desolate, Neon, Bleak, Spirited), instruments, kits and textures, and the motif melodies, were set from measured levels and printed melodies, not heard yet. Judge them by ear, and adjust a sound's `gain` or `edge` if it sits wrong.
- Mood patterns apply to both styles, so an ambient Neon song can get four to the floor, just slower.
- The drum, texture and harp changes above were worked out from the levels and the maths, not heard yet. If drums are now too quiet in energetic moods, raise the 0.24 in `volumes.drums` (dressLayer) before touching the 70% in synth.js.
- Listening only looks at the melody. Two backing parts can still rub against each other, and a texture doesn't duck when the band gets busy within a section.
- Instrument volumes and `edge` ratings were set by working out the levels, not by listening to every pairing. If a pairing sounds wrong, adjust that instrument's `edge` or `gain` rather than adding a special case.
- The clarinet, accordion, steel guitar, the five new textures, solos, longer themes, scoop, `hardness`, wide pads and the reverb's early reflections were set from measured levels and printed notes, not heard yet. Judge them by ear. If something's off, adjust its `gain`, `scoop` or `edge`, or `hardness` in synth.js, before adding a special case.
- A solo isn't editable note by note: hand edits are per part, and belong to the part's usual tune.
- Chords whose root is outside a pentatonic scale can't be sung home to, so about one solo in seven ends on another chord note.
- Notes you add by hand aren't held to these rules. That's on purpose: it's your song.
- Saved songs from before a change to the composer open fine, but may not play quite the same, because the random picks changed.
