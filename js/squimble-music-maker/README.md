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
| `tests/music-check.js` | `node js/squimble-music-maker/tests/music-check.js`. No output means it all passed. It takes about 20 seconds. |

## How a song is made

`generateSong(mood, style, seed)` (music.js) runs five picks, each with its own seeded random numbers:

1. **pickTonality:** key, scale, tempo, time signature, swing, how rich the chords are, how long each chord lasts.
2. **pickChords:** a progression for parts A, B and C, as roman numerals.
3. **pickLayers:** which roles play (melody, pad, bass...). Each one is dressed with an instrument, a pattern, a tone and a mix (`dressLayer`), then `fitBand` applies the rules below.
4. **pickArrangement:** the sections, and who plays in each.
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
- **Textures are scenery.** A texture sits at no more than 55% of the melody's volume (0.42 with no melody). Wind gusts and ocean swells move about 6 dB, not 15.
- **Plucked strings start soft and ring on.** `soft` mixes a finger's smooth pull into the string's starting noise, high strings ring for less time than low ones, and tunes don't cut a pluck's release short.

**Listening** (`listen` and `COMPOSERS.drums` in music.js)
- **Everyone writes their part, then the band listens.** It's a pass over all the parts before `feel`. Notes added by hand are left alone. A note it moves keeps the pitch it was written at (`written`), which the note editor uses to remove it.
- **The tune stays on top.** Keys, an arp or a counter melody that would start above the melody note that's playing drop an octave, if that keeps them in their range. Pads (a wash) and bells (meant to ring above) stay put.
- **Nothing rubs against the tune.** A minor second or ninth against a melody note half a beat or longer is the harshest clash there is. Pads and keys drop the chord's added note (seventh, ninth) when that's what rubs. Arps, bells and counter melodies move to the nearest chord note that doesn't rub and doesn't climb over the tune.
- **Everything with a pitch is in the key.** Kicks, toms, ticks, rims and the snare's body are tuned to the song's home note or fifth (`tuneDrum`). The hum hums the home note, and the crickets sing it and the note above.
- **The drummer plays to the room.** With fewer than half the others playing (an intro, a break), the drums play softer and leave out ghost notes.
- **A kit only plays patterns it suits** (`suits` in synth.js). `fitBand` changes the pattern, from the mood's list where it can.

**Parts**
- **An arp or a counter melody, never both.** With an arp, keys hold their chords and pads don't pulse, because two layers doing the same job tangle.
- **Melodies have no rests inside a bar.** They breathe at the ends of phrases. "Calls" holds its last note through half the next bar before its gap.
- **Counter melodies answer in whole bars** where the melody rests, or else harmonise in thirds or sixths.
- **Bells are predictable.** Drifting loops are whole beats long (2 to 4 bars, give or take a beat or two). Chimes are one short figure, rung as the chords change.
- **A layer that's in stays in.** It only drops out for a real change of gear, like a break or the outro.

**Moods**
- **Each mood says how likely drums are** (`drums: [ambient, tune]`) and which kits and patterns suit it. Dreamy and Heavenly have none. Cozy and Wistful use brushes on a jazz ride. Calm and Sad only get rare soft pulses.
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

## Adding things

- **An instrument:** a line in `INSTRUMENTS` (synth.js) with a family, an `edge` judged by ear, and an engine. It can then appear in mood palettes. A drum kit needs `suits` instead: the patterns it sounds right playing.
- **A mood:** an entry in `MOODS` (music.js). The comment above `MOODS` lists every field. Set `drums`, and keep its palettes within its edge cap.
- **A groove:** a line in `GROOVES`. Every line must be a bar long; the check tests that.

## Known issues

- The drum, texture and harp changes above were worked out from the levels and the maths, not heard yet. If drums are now too quiet in energetic moods, raise the 0.24 in `volumes.drums` (dressLayer) before touching the 70% in synth.js.
- Listening only looks at the melody. Two backing parts can still rub against each other, and a texture doesn't duck when the band gets busy within a section.
- Instrument volumes and `edge` ratings were set by working out the levels, not by listening to every pairing. If a pairing sounds wrong, adjust that instrument's `edge` or `gain` rather than adding a special case.
- Notes you add by hand aren't held to these rules. That's on purpose: it's your song.
- Saved songs from before a change to the composer open fine, but may not play quite the same, because the random picks changed.
