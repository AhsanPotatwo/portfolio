# Squimble Music Maker

Procedural music for Squimble Quest, on its own page (`squimble-music-maker.html`) until it moves into the game. Music comes from a seed and the rules of music theory, not AI. The band is a mix: synthesisers built on Web Audio, and recordings of real instruments from free sample libraries for the ones synthesis struggles with (bowed strings, brass, saxes, pianos, choirs, drum kits). Every recorded instrument still has its synthesised version, and the page's Recordings key swaps between them.

## Keep the notes true

This README and the code comments are the only notes. When you change something:

- **Changed how something works?** Update the comment beside it, and this README where it describes it.
- **Fixed something that sounded wrong?** Add it to [What sounded wrong, and the fix](#what-sounded-wrong-and-the-fix), and make the rule a check in `tests/music-check.js` if it can be one.
- **Found a problem you haven't fixed?** Add it to [Known issues](#known-issues).

## Files

| File | What it is |
| --- | --- |
| `music.js` | The composer: settings to notes. Plain maths with no page or audio, so node can run it and the game can load it as it is. Its header explains songs, the theory and times. |
| `synth.js` | The band: `INSTRUMENTS`, the engines that play them (oscillators, plucked strings, struck modes), drums, textures, each instrument's body and rig (`instrumentChain`, `ampChain`), slides and bends (`pitchMods`), the room (reverb, echo, tape) and the player (`MusicPlayer` live, `renderSong()` to WAV), all on Web Audio. Load it before `music.js`, because the composer picks from `INSTRUMENTS`. |
| `maker.js` | The page: controls, the modifiers, the score, the note editor (with its slide and vibrato tools), the library and exports. The game won't need it. |
| `tests/music-check.js` | `node js/squimble-music-maker/tests/music-check.js`. No output means it all passed. It takes about five minutes, so run it in the background. |
| `tests/levels.html` | How loud every instrument and texture is, weighted the way ears hear. Open it in a browser and wait about a minute. Set a new sound's `gain` (or its rig's `level`) so it sits with its neighbours. Guitars are measured through their rig playing a power chord, and everything through its body (`instrumentChain`). Plucked sounds start from random noise, so they measure a few dB differently each run: run it twice before you move one. |
| `tests/headless.js` | Runs a page in headless Chrome and prints a JavaScript expression's value once it's ready: `levels.html` without opening a browser, or the maker page checked for errors. Its header has examples and gotchas. |
| `tools/build-samples.js` | Builds the recordings in `assets/squimble-music-maker/samples/` from the free libraries (VSCO 2 CE, VCSL, Virtuosity Drums, Karoryfer's guitars and basses, MTG's saxes, Greg Sullivan's electric pianos, a real TR-808 and TR-707, FluidR3). It picks a note every few semitones, checks each one's pitch, trims and levels them, and writes small mono mp3s and an `index.json` per folder. Its header explains how to run it. Needs git and ffmpeg. |

## Where the sounds come from

The moods and sounds are aimed at particular game and ambient music:

- **Ambient:** Aphex Twin's Selected Ambient Works (analog pad, sine bell, tape loop, drum machine), the Fallout 1 and 2 scores (Desolate: bowed metal, metal pings, Geiger counter, creaking metal), Dying Light (analog pad, Reese bass, synth brass, the slower side of Neon) and Minecraft (felt piano and nylon guitar playing Fragments, cave drips).
- **Melodic and upbeat:** Undertale and Deltarune (Spirited: pulse lead, triangle bass, chip kit, riffs, the "royal road" IV V iii vi), Terraria (pan flute, nylon guitar, birdsong), Minecraft, and Stardew Valley (Happy and Playful: flute, clarinet or accordion over a fingerpicked or strummed steel guitar, soft strings, a root and fifth bass, a light kit, and sixteen bar themes).
- **Mellow and serious:** Have a Nice Life (Bleak: fuzz wall, chanted choir, chorus bass, a drum machine in a huge room).
- **Dark electronic:** Crystal Castles (Neon: bit lead, pumping pads, four to the floor, club kit).
- **Loud:** Doom (1993), Metallica, Pantera and Slayer (Metal: high gain chugging riffs, double kick, the bass doubling the riff, twin lead harmonies, solos), Black Sabbath, Sleep and Electric Wizard (Sludge: slow fuzz riffs, flat fifths, half time), Nirvana, Hole and Alice in Chains (Grunge: loud, quiet, loud, with a clean or chorused verse guitar and a distortion pedal for the chorus), Weezer, the Smashing Pumpkins and Dinosaur Jr (Alt rock: big muff fuzz eighths, major key tunes), and Title Fight, Citizen and Tigers Jaw (Hardcore: punk beats, driving eighths, twinkling clean guitar, breakdowns).
- **Hazy:** My Bloody Valentine, Slowdive and LSD and the Search for God (Shoegaze: glide guitar, reverse reverb, a buried voice, a cymbal wash), Whirr, Glare and Nothing (Nugaze: slower, darker, tuned down fuzz), and Cocteau Twins, Beach House and Slowdive's quieter side (Dream pop: chorused clean guitars, a breathy voice, a drum machine).
- **World:** the Arabian and Andalusian desert (Desert: phrygian dominant, an oud, a shawm, hand drums and a drone), island and jungle music (Tropical: steel drums and marimbas, a swung bounce), Celtic and village folk (Folk: fiddle, tin whistle, a bagpipe's chanter, a bodhran, jigs in 6/8) and winter (Wintry: celesta, glass bells, a waltz, wind and a fire).
- **Electronic and epic:** synthwave and outrun (Synthwave: saw leads and synth brass over arps and an octave bass), drum and bass (Breakbeat: breaks at 170 under a reese bass, liquid or half time) and trailer and film music (Epic: string ostinatos, horns, a choir, taiko and timpani).
- **Boss fights:** Terraria (Scott Lloyd Shelly) and the Calamity mod (DM DOKURO and others). Most of their boss themes are a genre plus a place: the Desert Scourge's "Guardian of the Former Seas" is heavy metal with tropical colour, Plantera is mid tempo metal singing the jungle's tunes, Cryogen is fast drum and bass with chimes and wind, Astrum Deus is techno, and the later bosses are symphonic metal. So a fight is a style any mood can take (Boss, Mini boss). The place used to be a second mood blended in; modifiers replaced blends (see How a song is made). They loop with no outro, and many have a calmer break before the climax ("moments of calm", Plaguebringer Goliath).
- **No words:** the loud and hazy moods' songs would have a singer, so the tune is a lead guitar (bends and vibrato) or a wordless voice (`dream-voice`, `rasp-voice`) standing in, and solos come often.
- **Easy:** bebop and cool jazz (Jazz: a sax or trumpet over rootless piano comping, a walking bass, a swinging ride), bossa nova and easy listening (Lounge: Jobim, a nylon guitar's bossa rhythm, flute and vibes), soul and neo soul (Soul: a Rhodes on ninth chords, a sliding bass, a wordless soul voice) and Mettaton's Death by Glamour (Showtime: a horn section stabbing, a sax tune with a second horn line against it, slap bass, funk guitar, four on the floor).
- **Roots:** the blues (twelve bars of sevenths, a shuffle, a boogie bass, a harmonica bending its blue notes) and country and bluegrass (boom chick guitar, a rolling banjo, a fiddle, a pedal steel sliding underneath, the train beat).
- **More world:** Japan and China (Far east: shakuhachi, erhu, koto, temple drums and a gong, pentatonic scales), India (Raga: a sitar or bansuri sliding over a tanpura and tabla, no chord changes) and Reggae (the one drop, the skank, a melodica).
- **Toby Fox:** Undertale and Deltarune's battles, Spear of Justice, Megalovania and Black Knife (Showdown: fast and minor, an octave bass, two leads at once). The thing all his music has, Snowdin and Death by Glamour included, is two melodies at once, which is the counter melody's "second melody" (counterpoint), now the default.

## How a song is made

`generateSong(mood, style, seed, mods)` (music.js) works out the mood it's really writing in (`songMood`: the mood with its modifiers worked in, made into a fight for the Boss and Mini boss styles, see below), then runs five picks, each with its own seeded random numbers:

1. **pickTonality:** key, scale, tempo, time signature, swing, how rich the chords are, how long each chord lasts.
2. **pickChords:** a progression for parts A, B and C, as roman numerals.
3. **pickLayers:** which roles play (melody, pad, bass...). Each one is dressed with an instrument, a pattern, a tone and a mix (`dressLayer`), then `fitBand` applies the rules below.
4. **pickArrangement:** the sections, and who plays in each. Often a solo section too (`addSolo`).
5. **pickSpace:** reverb, echo, warmth, wobble and drive.

`composeSong(song)` turns those settings into notes, one composer per role (`COMPOSERS`). The guitar's power chords, strums and riffs are in "guitars" (`guitarShape`, `riff`, `RIFFS`). The drums, a syncopated bass and the chord stabs all read the same groove (`GROOVES`, `grooveFor`). Once every part is written, the band listens to each other (`listen`, see below), then each player ornaments their notes (`ornament`: slides, bends, graces), and then the notes get their swing, humanising and dynamics (`feel`). The remix buttons re-run one pick with a fresh seed (`rerollSong`).

**Modifiers.** A mood is a kind of music and a modifier is a word in front of it: calm, angry, fast, slow, dark, bright, sparse, lush, jazzy, lo-fi, epic, spooky, retro, acoustic, groovy, dreamy (`MODIFIERS` in music.js, up to four at once). Each changes how the mood's own band plays: its tempo, energy, how dark its scale is (`shade`, with the mood's chord progressions moved into the new scale by `reharmonise`), how busy and how many parts, the drummer's beat. A few bring sounds in because the word means them (lo-fi's vinyl and dusty kit, retro's chips, acoustic's unplugged swaps, epic's choir and big drums). They replaced blends, which mixed a second mood's band in (see the table below). The random numbers don't depend on the modifiers, so adding "fast" gives you the same song, faster, as near as it can.

**How the instruments are made.** Each synthesised instrument copies the things that make the real one sound real, which turned out to be a short list:
- **Struck things ring at their real overtones** (`modal`, `modalBuffer`): a piano's nearly whole multiples a little sharp (stretch) on two strings beating slowly (unison), a marimba's two octaves and a bit over three, a bell's minor third. Each dies at its own rate, the top first, and a harder strike brings the top out. They're worked out sample by sample once per note and kept, like the plucked strings.
- **Bodies.** A violin's wooden box, a guitar's air, a trumpet's bell and a sax's tube boost the same frequencies whatever note's played (`body`, built once per layer in `instrumentChain`). A synth's tone moves with the note. This was most of why the old violin and horn sounded like synths.
- **Nothing held is steady.** Breath, bows and voices drift a few cents (`drift`), and in a section every player drifts on their own (`ensemble`). Flutes start with a puff of air (`chiff`), plucked strings start a little sharp and settle (`twang`).
- **Waves shaped like the real thing.** Sax (`reed`), brass, bowed, drawbar organ and free reed waves are built from the harmonic levels of the real instruments (`WAVES`).
- **Plucked strings are tuned and shaped.** A string's loop can only be a whole number of samples long, which put high notes up to 13 cents out; each string is tuned back now (`buffer.cents`). `ring` sets how fast its top end dies (a steel string less than nylon), and `buzz` is a sitar's buzzing bridge.

**Recordings.** 78 instruments and 18 kits can also play from recordings (`samples` on an instrument, `hit` on a kit's slot; the "recordings" section of synth.js). A folder holds a note every three or four semitones, sometimes soft and loud, and the nearest one is played, retuned. A held instrument (strings, brass, winds, organs, choirs) loops the steady middle of its note, found and crossfaded when it loads (`loopNote`), so it lasts as long as the note does. Everything after the note is the same as for a synthesised one, so recordings slide, bend and shake, go through the room, and the guitars go through their rigs: every electric guitar is the same clean recording through a different amp, the way a real guitarist plays one guitar through different pedals. A recording keeps the instrument's envelope and swaps the rest: an almost open filter that still darkens soft notes, and no added vibrato, drift or body, because the real player's and the real body are in the recording. Some instruments were recorded more than once (`more`: a Wurlitzer or a Pianet, a Rhodes, a DX style or a TX81Z FM piano, a grand or a CP80 electric grand, two electric guitars), and a layer can pick which it plays (`layer.recording`, the Recording menu in the Band tab). The composer prefers instruments that have recordings, three to one, when it picks from a mood's palette (`preferRecorded`): they sound more alive, and the synthesised ones are still there for variety and for the moods that want synths. What's left synthesised is the synths themselves (pads, leads, basses, drones, the chip kit), the three wordless voices, the sine bell, metal ping and wind chime, the tabla, and the brushes. Recordings load only when a song uses them (2 to 5 MB for most songs), and until they're in, or if they can't load (a page opened straight from a file can't fetch them), the synthesised version plays. A WAV render waits for them.

**Guitar rigs.** An instrument with an `amp` (the guitars, and the leads and basses built like them) plays through a rig of pedals, an amp and a speaker cabinet (`ampChain` in synth.js): a cut below before the clipping, a mid push, a compressor that holds the string up as it dies (`sustain`), the clipping itself (soft, hard or valve), the tone after it, a steep speaker roll off, then double tracking, a chorus or reverse reverb. The rig is in the layer's channel, so all its notes go through one amp together, the way a guitar's strings do, and it comes before the volume, so turning a guitar down doesn't clean it up. A palm muted note (`mute`) is a short, dark pluck, which through a high gain rig is the metal chug.

**Slides, bends, vibrato and swells.** Any note can carry `bend`: pins of `[beats from its start, semitones, shape]`, the way BeepBox draws a note's pitch. The shape is how it moves from the pin before (`CURVES` in synth.js): straight, smooth (eased in and out, a singer), settling (quick, then easing onto the note, a fretless) or speeding up (a fall). `[[0, 0], [0.5, 2]]` slides up a whole tone over half a beat and holds there. And `shake`: a vibrato of its own, in cents. And `swell`: 1 if the note grows over its length, -1 if it dies away. The synth plays all three on every engine (`pitchMods`, `voiceChain`), and vibrato grows in after a note starts rather than being there from its first moment. The composer writes them as ornaments, and the note editor's Slides, Vibrato and Swells tools write them by hand (saved as `[beat, midi, length, to, glide, shake, curve, swell]` in a layer's edits, with defaults left off the end: `packEdit`). Unlike BeepBox, a sliding note can sit alongside ordinary notes in the same layer.

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
- **Every part has its own room in the mix.** All but the bass, drums and drones have their low end cut (a high pass, `CUTS` in synth.js, lower with no bass in the song), so five parts' low notes don't add up to mud under the bass. The tune sits near the middle and the parts that fill in stand on opposite sides of it (`spread` in music.js), rather than anywhere at random and often on top of each other.
- **Recordings first.** A mood's instruments that have recordings are picked three times as often as the synthesised ones (`preferRecorded`).
- **One rig per layer.** A guitar's notes are distorted together, not one by one: a chord clipped as one sound growls, and notes clipped apart and added up sounded like several small guitars.
- **Power chords for the loud patterns.** A root, a fifth and its octave. A clipped third grinds against everything, so only the ringing, strummed and tremolo picked patterns play the whole chord.
- **Rhythm guitars are two takes.** Double tracked rigs spread a guitar left and right, so a guitar layer stays near the middle (its pan is small), and it isn't turned down for its edge as other backing is: its speaker has already taken the harshness off.
- **A buried tune is still the tune.** Shoegaze's `bury` sinks the melody into the guitars (a little quieter, and backing allowed closer under it), but backing never goes over it.
- **Plucked strings start soft and ring on.** `soft` mixes a finger's smooth pull into the string's starting noise, high strings ring for less time than low ones, and tunes don't cut a pluck's release short.
- **A distorted chord rings on.** Dirty guitars have long strings (`decay` 6 to 7.5 seconds) that keep their top (`ring`), every string lasting about as long as the low one, and a compressor before the clipping (`amp.sustain`) that turns the string back up as it dies, so a chord held for a bar stays loud and growling for the bar. Levels were matched on the loudest second, so they hit no harder than before, they just last.
- **Struck instruments are modal, synths stay synths.** Pianos, mallets and acoustic bells ring at their real overtones (`modal`). The synth bells (sine bell, metal ping) and the electronic sounds keep their FM and oscillators: a synth is meant to sound like one.
- **Instruments drift, synths don't.** Blown, bowed and sung notes wander a few cents; chip leads and tonewheel organs stay dead steady, as the real ones do.
- **Nothing is a hair over its cap.** `pickInstrument` lets an instrument a hair over the edge cap fit (`+ 1e-9`), since 0.6 × 0.75 is 0.4499... in floating point.

**Listening** (`listen` and `COMPOSERS.drums` in music.js)
- **Everyone writes their part, then the band listens.** It's a pass over all the parts before `feel`. Notes added by hand are left alone. A note it moves keeps the pitch it was written at (`written`), which the note editor uses to remove it.
- **The tune stays on top.** Keys, an arp or a counter melody that would start above the melody note that's playing drop an octave, if that keeps them in their range. Pads (a wash) and bells (meant to ring above) stay put.
- **Nothing rubs against the tune.** A minor second or ninth against a melody note half a beat or longer is the harshest clash there is. Pads and keys drop the chord's added note (seventh, ninth) when that's what rubs. Arps, bells and counter melodies move to the nearest chord note that doesn't rub and doesn't climb over the tune.
- **Everything with a pitch is in the key.** Kicks, toms, ticks, rims and the snare's body are tuned to the song's home note or fifth (`tuneDrum`). The hum hums the home note, and the crickets sing it and the note above.
- **A riff's line gives way like any line.** A riff note that rubs against the tune moves to the nearest chord note that doesn't, and a bass doubling the riff moves with it, so the guitar and bass never rub either. Dropping it left a hole in the riff.
- **The drummer plays to the room.** With fewer than half the others playing (an intro, a break), the drums play softer and leave out ghost notes.
- **A kit only plays patterns it suits** (`suits` in synth.js). `fitBand` changes the pattern, from the mood's list where it can, then (in a fight) from a fight's beats.
- **Rock drummers.** The rock grooves (`ROCK`) fill down the toms, crash at the top of every four bars in a chorus or solo, keep their hats to eighths, and (rock and punk) move from the hats to the ride for the chorus (`RIDES`). Rock kits have a seventh drum, a crash; other kits crash on their open hat.

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
- **Guitars move in shapes.** Chords are a guitar's shapes slid up and down the neck in parallel, low (from about D2), not voice led like a pianist's (`guitarShape`).
- **Loud, quiet, loud.** With two guitars, exactly one plays each section: the cleaner one in the quiet sections and the dirtier one in the loud ones (energy 0.85 or more, `LOUD`). A grunge verse is clean and its chorus stamps on the distortion.
- **A riff is the song's.** It's written out like a groove (`RIFFS`: chugs, open chords, the line), repeats every bar, follows the chords, and turns round in each fourth bar. Fast sixteenth riffs aren't used above 150 bpm, slow Sabbath ones only below 96. In a breakdown it chugs on the kick.
- **The bass doubles the riff** an octave under the guitar (`riff` pattern), from the same seed, so it plays exactly the guitar's rhythm.
- **Eighths chug in the verse and ring in the chorus.** Palm muted in part A, with the chord changes and the groove's comping hits left open as accents.
- **Tremolo picking isn't running notes.** It's one chord repeated as fast as a hand goes (ten a second at most), so `MAX_RATE` doesn't apply. It plays the shape's lowest four strings, so it doesn't pile up.
- **A counter melody is a second melody** (`counterpoint()`, now each style's usual counter pattern). It has its own motif's rhythm, so it comes back when the tune does, but it holds long notes where the tune's busy and moves where the tune holds. Each note is the cheapest by the old rules of counterpoint: thirds and sixths under the tune (`CONSONANCE`), never over it, steps rather than leaps, contrary motion, no parallel fifths or octaves, chord notes on strong beats. Ties are broken by pitch and place, not chance, so the same bar of tune gets the same second melody.
- **Players ornament** (`ornament()`). Each instrument says what a player of it does (`ornaments` in synth.js) and the mood how much (`ornate`, 0.6x in ambient songs): slides between joined notes, guitar and harmonica bends, a fiddler's grace notes, mordents, a horn's fall off the end of a phrase, a shake on long notes, the odd double stop. They're bends on the written notes, not new notes (apart from double stops, marked `stop`), so the tune, its rhythm and every rule above stay true. The dice come from the note's place (part, bar in the phrase, beat, length), so a motif that comes back is ornamented the same way. Struck instruments (pianos, mallets) get none: you can't bend a piano.
- **Blown, bowed and sung lines slur** (`slurs`, `note.slur`). Only a phrase's first note gets a fresh attack; joined notes after it change pitch without a new puff, scoop or fade in, as a flute or violin player's do. A repeated note is tongued again. Struck and plucked instruments never slur.
- **Long notes are shaped** (the `swell` ornament). A long note in the middle of a phrase can grow, and one at the end of a phrase die away, on the instruments whose players do that (violins, horns, saxes, voices).
- **Players' other habits.** A guitarist can pick a note already bent and let it down (`release`), and a jazz horn can flick up off the end of a phrase (`doit`).
- **A song that ends comes home** (`cadence`). The last chord of an ambient song or a tune is the home chord. A fight loops, so it's left leading back to its start.
- **Sections have dynamics** (`section.energy`, `loudness()` in feel). A quiet intro is played softer than the chorus and the last bar before a louder section swells into it. 0.75, and songs from before this, are played as written. The drums already play to the room, so they're left out. The Arrange tab has a Loudness slider per section.
- **Jazz comping is rootless** (`comp`): the third, seventh and ninth, leaving the root to the bass, in rhythms that change bar to bar and come round every four (`COMP_RHYTHMS`). Comping, a bossa rhythm and a reggae skank are a few chords a bar, so an arp doesn't turn them into strums.
- **A plucked drone is plucked round and round** (`cycle`). A tanpura's string can't hold for a whole section, so `fitBand` gives a plucked drone the cycle pattern: the fifth, the home note twice an octave up, the low home note, each ringing until it's plucked again.
- **The newer beats fill too** (`FILLS`): swing, tala, bossa, shuffle, train and one drop fill into a new part like the pop grooves, while pulse and sparse still never do.

**Moods**
- **Each mood says how likely drums are** (`drums: [ambient, tune]`) and which kits and patterns suit it. Dreamy and Heavenly have none. Cozy and Wistful use brushes on a jazz ride. Calm and Sad only get rare soft pulses. Neon is four to the floor on the club kit, with pumping pads. Bleak's drum machine plays half time. Desolate only gets sparse pulses.
- **Each mood says what opens its songs** (`opens`): the guitar then the bass in Happy (Stardew Valley), the beat and bass in Upbeat and Angry, a march under strings in Heroic, chip arps and bass in Spirited, a pad or drone in the ambient moods. A tune opens on two of them and an ambient song on one, and they play the whole song through, so the intro already sounds like the song. With none of the mood's openers in the band, any of pad, keys, arp, drone, bass or drums will do (`OPENERS`). No section is ever only the texture.
- **Mutate and remixes only pick patterns from the mood's list,** so a cozy song can't mutate into a tribal beat.
- **Progressions are picked to suit the scale.** Ones with notes outside it are less likely.
- **Moods are in rows** (`group`, `MOOD_GROUPS`): gentle, bright, easy, roots, dark, world, electronic, loud and hazy. The page shows one row at a time, opening on the song's, so the moods fit on a phone.
- **The world, electronic and epic moods keep to themselves** (`surprise: 0`), and their new instruments (oud, shawm, steel drum) are `own`. That kept every older mood's surprises, and so its songs, exactly as they were.
- **So do the easy, roots and new world moods** (`surprise: 0`). Their most local instruments (sitar, koto, erhu, shakuhachi, bansuri, santoor, shamisen, harmonium, tanpura, the soul voice) are `own`, and each new mood's palettes have enough in every role that a part never runs out and draws a surprise (tested).
- **The loud and hazy moods work differently.** They say which roles they have (`layers`: a guitar always, no keys), their song shapes (`forms`: verses and choruses), how often they solo and over which part (`solo`, `soloOver`: rock solos over the chorus before its last time round), whether part C is a half time breakdown (`breakdown`), and patterns for ambient songs only (`'ambient.guitar'`, `'ambient.drums'`: an ambient metal song is drone metal, chords ringing slowly, not a punk beat at 66 bpm).
- **The loud and hazy moods keep to themselves.** No surprise instruments (`surprise: 0`: a kalimba tune in a grunge song is a mistake, not a surprise), and their instruments aren't other moods' surprises. Instruments that are a mood's own (`own` in synth.js: the voices, lead guitars, rig basses and guitar pads) are never anyone's surprise.
- **In a band with a guitar, the melody and guitars choose their instruments first** (`dressOrder`), so a counter melody can't take the guitar the mood needs.
- **New moods don't change old songs.** A mood without a guitar never rolls for one, so every other mood's seeds still make exactly the songs they made before the guitars were added.

**Fights and modifiers** (`mixMood`, `songMood` and `MODIFIERS` in music.js)
- **A fight drives, whatever the mood.** Boss and Mini boss lift a mood's energy to at least 0.9 or 0.8, play it quicker (unless it's already 150 bpm or more), never swing (a swung battle theme sounds like a joke), use a drier room, and always have drums on a kit that can play a fight's beats (`FIGHT_KITS` when the mood's own can't). A calm boss is still a fight.
- **A fight keeps the mood's driving patterns and drops its gentle ones.** A role's patterns are the mood's that are also in the fight's list (`STYLE_PATTERNS.boss`), or the fight's list if none are: metal keeps its double kick, calm loses its brushes.
- **A fight always has its tune, a bass and a beat.** When there are too many layers, it loses the scenery and the pad before the bass.
- **A fight loops.** No outro: a short intro on the drums and bass (it opens on three parts), the theme, a higher second theme, a break, then the climax, which takes the solo. A mini boss is a loop of two or three parts with a smaller band.
- **A modifier changes how the band plays, not who's in it.** Angry folk is the folk band playing harder, faster and two shades darker; calm metal is the metal band gentler. Only lo-fi, retro, acoustic, epic, jazzy and spooky swap sounds in, because the words mean sounds.
- **A darker scale takes its chords with it.** When a modifier shades the scale, the mood's progressions are moved into the song's scale by degree (`reharmonise`: I V vi IV in minor is i v bVI iv). Chords off the major scale's degrees stay as they were.
- **Opposites can't both be on** (calm and angry, fast and slow, dark and bright, sparse and lush, retro and acoustic), at most four are on, and the order doesn't matter: they apply in `MODIFIERS` order (`cleanMods`).
- **A fight applies after the modifiers,** so a calm boss is still a fight, just a gentler one.
- **The newer driving beats stay in a fight when they're the mood's own** (`ALSO_DRIVING`: funk, tala, shuffle, one drop, train). They're kept out of the fights' own list, which the older moods pick from, so those fights were unchanged.
- **No modifiers, no change.** A song without modifiers has no `mods` key and gets its mood untouched.

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

These were caught by the checks and by measuring renders of the new loud and hazy moods, before anyone heard them:

| What it would have sounded like | Why | Fix |
| --- | --- | --- |
| Metal songs on a sludge or overdrive guitar, never the metal one | 1.2 × 0.75 is 0.8999… in floating point, so the metal guitar's 0.9 edge never fitted under the backing cap | Metal's edge is 1.25 |
| Every other mood's songs different once guitars were added | The guitar role rolled a random number even at 0% chance, moving every later pick, and the new moods' instruments joined everyone's surprises | No roll for a guitar in a mood without one, and the loud and hazy moods keep to themselves |
| An overdrive guitar in a dream pop song | Its tune and counter melody took both clean guitars before the guitar chose | The melody and guitars choose first in a band with a guitar |
| A riff note missing, its fifth left hanging | Listening dropped a riff note that rubbed against the tune, but not the fifth on top of it | Riff notes are single and move like a line's, the bass with them |
| Rock hats a hiss of sixteenths | Busy drummers filled in sixteenth hats, at punk tempos twelve a second | Not in the rock grooves |
| Guitars buried under the bass and drums | Guitars were turned down for their edge like other backing, and palm mutes lost their low end to the rig's tight cut | Guitars aren't, and the metal rig cuts less |
| A shoegaze voice standing out of the wall | The dreamy voice was set as loud as a flute | Quieter, and `bury` |

And these by the checks once fights made thousands of new songs:

| What it would have sounded like | Why | Fix |
| --- | --- | --- |
| A solo ending on a note outside the chord | A chromatic chord (eerie's Fm in A in sen) had none of its notes in a pentatonic scale, so stepping along the scale could never reach it | The solo's last note goes straight to the chord's root |
| An arp ringing over a low tune | With the melody an octave down, the arp couldn't drop under it, and dodging a rub it was allowed to move up, further over the tune | A note stuck above the tune only moves down when it dodges |

And these in the big rework (sounds, slides, modifiers, the new moods), from your notes and from the checks:

| What it sounded like | Why | Fix |
| --- | --- | --- |
| A held distorted chord dying away like an acoustic guitar's | Nothing held the string up before the clipping, the strings rang 3 seconds, and the top strings died faster still | `amp.sustain` (a compressor before the clipping), longer `decay`, brighter `ring`, and every string ringing about as long |
| Mixing folk with angry mashing two bands together | A blend brought in the second mood's scales, chords and tune instruments all at once | Modifiers: words that change how the mood's own band plays |
| Instruments sounding artificial, like midi | Every note dead on its pitch and steady, struck things made with fm, and no instrument bodies | Modal struck instruments, bodies, drift, chiff, twang, and players' ornaments (slides, bends, graces, falls, shakes) |
| Everything playing one line at a time | The counter melody copied the tune, filled its gaps or ignored it | A second melody written against the tune (counterpoint), and double stops |
| A quiet intro played as hard as the last chorus | Notes' strengths didn't know which section they were in | Section energy and `loudness()` |
| The rasping voice never rasped | Its singers were wired straight past the clipping meant to crack them | Wired through it, and turned down to match |
| High plucked notes slightly out of tune | A string's loop is a whole number of samples, up to 13 cents off by an E5 | Each string is tuned back (`buffer.cents`) |
| Lead guitar bends different every time it played, and never in the score | The synth tossed a coin on each long note | The composer writes bends (ornaments), the same every time and drawn in the score |
| A country fiddle or harmonica never chosen as a counter melody | 0.6 × 0.75 is 0.4499... in floating point, so an instrument rated exactly at the cap never fitted (the same thing metal's edge of 1.25 was set to dodge) | A hair of tolerance in `pickInstrument` |
| A chip tune made jazzy or epic getting brushes or orchestral drums under its pulse leads, and a retro song still drawing a flute | Every kit the modifier allowed was acoustic, so the kit pick fell back to one anyway, and retro still took other moods' surprises | A kit that belongs with the band is borrowed when none of the mood's do (one that plays its beats if it can), retro takes no surprises, and a check runs every modifier on every mood |
| A country arp turning into a flute, a Showdown bell out of nowhere | The banjo went to the tune and the steel guitar to the rhythm guitar, leaving the arp's palette empty | More in those palettes, and a check that no new mood ever runs out |

And these in the second round of recordings and playing (you'd heard the first recordings by then, and the drums were the big win):

| What it sounded like | Why | Fix |
| --- | --- | --- |
| Synthesised instruments next to recorded ones, sounding plastic beside them | 20 or so instruments had no recording, and the composer picked synthesised and recorded ones equally | Recordings for most of them (and real drum machines), more than one to choose from for some, and the composer prefers them |
| Every note of a flute or violin tune starting like a new phrase | Each note had its own attack, puff and scoop, where a player only starts the breath or the bow once | Slurs |
| Slides sounding mechanical | Every slide was a straight line at one speed | Curved slides: quick then settling, or smooth |
| Even short notes wobbling | An instrument's vibrato faded in from the very start of every note | Vibrato starts after its delay and grows in, a little slow at first |
| Long notes held flat, like a keyboard | Nothing shaped a note once it started | Swells: growing through a phrase, dying away at its end |
| A full band sounding crowded and boomy | Every part's low notes piled up under the bass, and parts were panned at random, sometimes all to one side | A high pass on every part but the bass and drums, and the parts that fill in placed either side of the tune |
| The outro stopping mid thought | A section ended on whatever chord its progression did, usually the IV or V that leads back round | The last chord of a song that ends is the home chord |
| A grunge counter melody played on a flute | With recordings preferred, the tune took the lead guitar more often and the counter melody's two guitars were both gone | Two more of grunge's own guitars for it, and a scan that no surprise-free mood ever borrows without a modifier |
| Some songs (metal glitchy-cactus, heavenly boss scurvy-marble) crackling, slowing down and stopping at the same spot every time | A pad's fast chord pattern struck the same notes every third of a beat, and each strike rang out its whole release, so dozens of copies of each note piled up until the browser couldn't keep up | A note struck again on the same layer fades out as the new one comes in (`findRestrikes`, `voiceChain`) |
| The tuba and the growl bass never playing | The tuba was in no mood, and the growl bass's edge (1) was over every mood's backing cap | The tuba in playful's and folk's bands, and the growl bass's edge 0.7 |

## Adding things

- **Recordings for an instrument:** a folder in `FOLDERS` (or `KITS`) in `tools/build-samples.js`, run it for that folder (`--probe` first, to check which octave the library's names mean; most of VCSL's names are an octave low, and bells fool the pitch check, so check their overtones), then `samples: 'folder'` on the instrument and a `sampled.gain` measured against its synthesised self. A second recording of an instrument goes in its `more`, with a `name` for the page (and the usual one gets a `sampled.name`). Only use libraries whose licence lets them go in a game, and add a credit to the page if it asks for one.
- **An instrument:** a line in `INSTRUMENTS` (synth.js) with a family, an `edge` judged by ear, a `world` if it's chip or acoustic, `own` if it should only appear where a mood names it, and an engine. A guitar-like sound gets an `amp` (the comment above `ampChain` lists its settings), and its loudness is the rig's `level`. A real instrument usually wants a `body` (look up where its resonances are), a little `drift` if it's blown, bowed or sung, and `ornaments` for what its players do. Something struck is `modal`: look up its overtones and how fast each dies. Set its `gain` with `tests/levels.html` so it's about as loud as the others in its family. It can then appear in mood palettes. A drum kit needs `suits` instead: the patterns it sounds right playing.
- **A modifier:** an entry in `MODIFIERS` (music.js) with a `name`, a `tip`, an `against` if it has an opposite, and `apply(mood, style)`, which changes a copy of the mood. Change how the band plays before reaching for new sounds. The check runs every modifier on every mood.
- **A texture:** a line in `INSTRUMENTS` and a function in `TEXTURES`. Make it something that happens now and then (`moments()`, `swells()`, each event at its own `spot()`) rather than a steady wash, and bring its gain near the vinyl's with `tests/levels.html`. A steady one is a `bed`.
- **A mood:** an entry in `MOODS` (music.js) with a `group`. The comment above `MOODS` lists every field. Set `drums`, and keep its palettes within its edge cap. A mood with a guitar needs `layers: { guitar: ... }`; the loud ones are a good place to copy from.
- **A style:** a name in `STYLES`, and its own entry in `LAYER_CHANCE`, `MOST_LAYERS`, `OPENING`, `FORMS` and `SOLO_CHANCE` (`STYLE_PATTERNS` too, or share another's, as Mini boss shares Boss's). A fight goes in `FIGHTS` and `FIGHT_ENERGY`. Check that the old styles' seeds still make the same songs.
- **A groove:** a line in `GROOVES`. Every line must be a bar long, and a new drum pattern needs a groove in every time signature; the check tests both.

## Known issues

- The recordings haven't been heard yet. Each one's `sampled.gain` (and each recorded drum's `level`) was set by measuring it against the synthesised version, a phrase across its range and a held note (the guitars before their amp, so the amp is driven the same). If one sits wrong, adjust that first. A held note's loop is found automatically (`loopNote`): if one wobbles or thumps as it goes round, that's where to look.
- Some recordings stand in for an instrument no free library has: a soprano recorder for the tin whistle, a shehnai for the shawm, a reed organ for the harmonium, a bandoneon for the melodica, a strumstick for the oud, a western flute for the bansuri, a sitar for the tanpura, an electric guitar for the pedal steel, and hand chimes for the glass bell. If one sounds too far off, take its `samples` away and it's synthesised again. The voices stay synthesised: no free library has wordless solo singing. VCSL's kalimba was swapped for FluidR3's because it's tuned its own way, about a quarter tone sharp of a piano.
- The second round of recordings (the gaps, the second recordings, the drum machines, the xylophone, harpsichord, Wurlitzer and 808 bass) was matched to the synthesised versions by measuring, like the first, and not heard yet.
- The 808 bass is one recorded note stretched up to 20 semitones (`reach`). High notes get short and clicky, as a tuned up 808 kick does.
- The jRhodes and TR-909 sets were left out on purpose: one is non commercial only, the other can't be passed on for profit.
- The chip kit and the tabla (and the brushes' brush and the soft kit's) stay synthesised. The club kit is a real TR-808 and the drum machine a real TR-707 now.
- A note more than a fifth past an instrument's recordings plays its synthesised version, so it doesn't sound stretched. If an instrument suddenly changes colour at the top or bottom of a tune, that's why.

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
- The loud and hazy moods, the guitar rigs, voices, rock kits, crash and ride, and the feedback texture were set from measured levels (`levels.html`, and renders of each mood measured layer by layer) and printed notes, not heard yet. If a guitar sounds wrong, adjust its rig (`gain`, `mids`, `cab`, `level`) before anything else.
- The drum editor's rows are named for every kit alike, so a rock kit's ride shows as "Perc" and its floor tom as "Low perc".
- Tremolo picking on a glide guitar is a lot of notes at once. If live playback stutters on a slow machine, it's the first place to look.
- The Boss and Mini boss styles, the seven world, electronic and epic moods, the oud, shawm and steel drum, and the hand drum and orchestral kits were set from measured levels and printed songs, not heard yet. The oud's and shawm's `gain` were set from `levels.html`, a little under the gap it showed, since plucks sit louder in songs.
- The big rework (modal struck instruments, bodies, drift, the sustaining guitar rigs, the thirty new instruments, the five new kits, the ten new moods, modifiers, counterpoint, ornaments and dynamics) was set from measured levels and printed notes, not heard yet. Every changed sound was matched to its old loudness with `levels.html`, and the guitars on their loudest second. Judge them by ear: if a sound's off, adjust its `gain`, `body` or `modes`, and an ornament's chance in its `ornaments`, before adding a special case.
- Songs saved before the rework open fine and keep their settings, but sound different: the instruments, ornaments, counter melodies and dynamics are new. A song saved with a blend loses the blend (it keeps everything the blend picked).
- A struck or plucked note is worked out the first time it's played (a few milliseconds each). A chord of new piano notes can take tens of milliseconds the first time; if live playback ever hiccups on the first bar of a piano song, that's why.
- The counterpoint and the ornaments listen to the tune but not to each other's backing: a second melody can still rub against a pad's added note.
- Not every modifier suits every mood (retro heavenly, epic lounge). That's on purpose: it's a tool, and the good pairings are worth the odd strange one.
- Calamity's place-flavoured bosses (the Desert Scourge's metal with a desert tune) were a blend. The nearest now is a world mood as a Boss (Desert, angry), or the genre with a modifier.
- Calamity's boss themes often use odd time (Cryogen in 13/8, the Perforators in 11/8). Only 4/4, 3/4, 6/8 and 5/4 are here: a bar must be a whole number of beats.
- `levels.html` measures one held note, which undersells plucked sounds that are played again and again: the picked bass measured quiet but sat loud in songs. Check a plucked sound in a song too.
