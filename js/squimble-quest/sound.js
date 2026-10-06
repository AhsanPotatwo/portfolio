/// ================================== the sound system ==================================
//
// this file is the sound library, a little synthesiser that turns a sound's settings into audio, and
// playing sounds in the world (quieter the further away they are). anything that makes a noise goes
// through playSound(name, at), so swords, doors, voices or music can use it. read this before
// changing any of the sound code, it explains how all the pieces fit together.
//
// ---------- the pieces, and where they live ----------
//
//   SOUND_WAVES       here            the kinds of wave, most just a shape(p) function
//   SOUND_SETTINGS    here            every number setting, which is also its slider in the editor
//   SOUNDS, VOICES    here            the libraries: every sound and every voice by name, both
//                                     from sounds.json (see "sounds and voices")
//   renderSound()     here            the synthesiser: works out every sample of a sound
//   voiceMouth()      here            what turns the voice wave's buzz into vowels (see "voices")
//   renderSpeech()    here            a sound saying some words, a syllable at a time (npcs talking)
//   SOUND_DOPPLER     here            how the doppler effect feels (the speed of sound, and limits)
//   dopplerShift()    here            how much moving bends a sound's pitch
//   Sound             here            playing: the browser's audio, voices, distance, doppler, the
//                                     preview
//   playSound()       here            how everything else plays a sound
//   sounds.json       assets/squimble-quest/sounds/   one sound per line (user guide: README.md there)
//   files/            assets/squimble-quest/sounds/files/   audio files (mp3, wav, ogg) sounds use
//   SoundBlocks       soundblocks.js  tiles on maps that play a sound (step on it, press E, or loop),
//                                     which can move their sound around, and sounds that follow
//                                     characters (an enemy or npc's sound)
//   SoundEditor       soundeditor.js  the full screen synthesiser for making and changing sounds
//   Slider            formbox.js      the sliders the sound editor is made of
//   Dialogue          dialogue.js     an npc with a voice says its lines as they type out
//   Editor            editor.js       the Voices tab, and right clicking an npc to pick its voice
//   tests             tests/sound-check.js  node checks: loops join without clicks, files save the
//                     same, every wave and setting makes sound, talking
//
// ---------- how it works ----------
//
// a sound is just plain settings (SOUND_DEFAULTS), so it can be saved as json. it doesn't use the
// browser's oscillators at all. renderSound() works out every sample in javascript (the same idea as
// the old sfxr and bfxr sound effect makers, which a lot of the waves and settings come from), and the
// browser plays the result like a recording. I did it this way because:
//   - loops can repeat sample-perfectly. the first version restarted oscillators every time a loop
//     ended, checked once a frame, and that left gaps and clicks (the "choppy hum")
//   - an audio file is just another kind of recording, so files get every effect the waves get
//   - the visualiser draws the real samples, so what you see is exactly what you hear
//   - it's all plain maths, so tests/sound-check.js can check it in node with no browser
// the cost is that a sound has to be worked out before it can play (a few ms, see "speed" below).
//
// there's one synthesiser, not one for each kind of sound. birds, fire, engines and voices are all
// the same settings turned different ways (the sound editor's make one buttons show how), so a new
// kind of sound is usually a new SOUND_GENERATORS line, not new code.
//
// ---------- sounds and voices ----------
//
// there are two kinds of sound (SOUND_KINDS), made the same way in the same editor: sounds, for sound
// blocks and anything else that makes a noise, and voices, for npcs to talk with. each kind has its
// own library (SOUNDS, VOICES), so sound blocks only offer sounds and npcs only offer voices, and the
// map editor has a tab for each. they're saved together in sounds.json, voices last with
// "kind": "voice", so a name can only be used once across both (the sound editor checks).
// findSound() and playSound() look in both. a voice is any wave, not just the voice wave (a blip voice
// sounds like old games), it's the kind that makes it a voice.
//
// an npc talks with its own voice if one was picked for it on the map (right click it in the editor,
// saved in the map file as its "voice"), otherwise its kind's (voice in npcs.js). npcs keep the
// voice's name, not a copy, and dialogue looks it up every line, so changing a voice in the sound
// editor changes every npc that uses it straight away.
//
// ---------- what happens when something plays a sound ----------
//
//   1. playSound('coin', { x, y, map }) looks the name up in SOUNDS
//   2. Sound.play() asks Sound.render() for the samples. it keeps the last 30 it worked out, so a
//      sound that's played a lot is only worked out once
//   3. the samples get copied into a browser AudioBuffer (once, kept with the render) and played by
//      an AudioBufferSourceNode, through a gain (volume from distance) and a panner (left/right)
//   4. every frame Sound.update() (from sketch.js) moves each voice's volume, pan and pitch (the
//      doppler effect, below) as the player and the sound move, tidies up finished voices, and stops
//      loops that can't be heard any more
// with { say: 'some words' }, step 2 uses renderSpeech() instead, and the rest is the same.
//
// ---------- one sound, sample by sample (renderSound()) ----------
//
// a sound is one "beep" (fade in, hold, fade out), played `repeats` times with `gap` between. the
// repeats can each be a little different (soundRepeats()): Scatter moves them off the beat and makes
// some quieter, Repeat scatter and the Tune (soundMelody()) put them on other notes, and Last note
// holds the last one longer. for every sample:
//   - time into the current beep decides the pitch: the start pitch, moved by the drop (starts high
//     and falls fast), slide (notes a second), slide speed-up, vibrato (a sine wobble), wander (a
//     smooth random drift), the two jumps (steps partway through, which can go round and round), each
//     repeat's step and its note. all of those are in notes, so the piano can move the whole sound up
//     or down by changing just the start pitch
//   - the wave is read at its current point in the cycle (its phase), pushed back and forth by FM (a
//     hidden sine). waves with a shape come from a table (waveTable()), apart from square, which
//     works its shape out each time because its pulse width can change, and square and saw get the
//     sharp corners where they jump smoothed (polyBlep()) so they don't fizz. with Voices, the wave is
//     read once for each voice, each on its own note of the Chord and a little out of tune. the noises
//     get a new value 32 times a cycle (metal 93), from random numbers or a 1 bit shift register, and
//     soft noise filters that. the string is a loop of samples one wave long that each repeat plucks.
//     a file is read at a speed of pitch / 440
//   - growl turns every other wave down (a rough note an octave lower), hiss swaps some of it for
//     noise, then a voice goes through its mouth (voiceMouth()), which makes the vowel
//   - the volume shape (fade in, hold with punch, fade out) multiplies it, then tremolo (a volume
//     wobble) and crackle (random pops that die away). a beep with no fade in gets a tiny one anyway
//     (1.5 ms), so it doesn't start with a click
//   - then the effects, in this order: low-pass (with resonance), high-pass, flanger, echo, reverb
//     (makeReverb()), crunch. they keep running in the gaps between beeps, so a filter's tail or the
//     echoes fade out naturally instead of stopping dead (a one-shot with echo or reverb is made
//     longer to fit them)
//   - volume, then softClip() keeps it inside -1..1, rounding off anything loud rather than chopping
//     it. a one-shot's last 5 ms fade out, so one cut off while it's loud doesn't click
// the random parts (noise, wander, crackle, breath, growl) use seededRandom(), so a sound is exactly the
// same every time it plays
//
// ---------- voices ----------
//
// the voice wave is a buzz (glottalPulse(), like vocal folds snapping shut) through three filters
// that ring at the pitches a mouth rings at for each vowel (formants, VOWELS). mouth size moves those
// rings, separately from the pitch, and those two together are most of what makes a voice sound like
// a man, a woman, a child or a giant. breath adds air, and the rest (wander for a rough voice,
// vibrato for a shaky old one, crunch for a robot, FM for an alien) are the normal settings.
//
// talking (renderSpeech()) is babble, like old games: the words are split into rough syllables
// (speechSyllables()), and each one is the sound played once, starting on its letter at Talk speed
// letters a second, with its vowel from the letters and its own pitch. each syllable's pitch comes
// from its letters (so a word always sounds the same, like a little language), drifts down through a
// sentence, goes up on a ? and lifts on a !, all scaled by Expression. it works with any sound, not
// just voices. Dialogue types at the same speed, so the words and the voice match.
//
// ---------- loops ----------
//
// a loop is the whole pattern (all the repeats, and the gap after the last one too) played over and
// over. three things make the join smooth:
//   - the wave's phase carries on across the join instead of starting again at 0
//   - it works out a little bit past the end (SOUND_LOOP_FADE), which is really the start of the next
//     go round, and fades that into the start. so the last sample leads straight into the first
//   - a "steady" sound (nothing moving the pitch, one beep, a wave with a shape) gets a loop length
//     that's a whole number of waves, so the crossfade is between two copies of the same wave and is
//     perfect
// tests/sound-check.js checks every sound in sounds.json loops without a click. fades, slides and
// repeats happen every time round, which is what you want for a siren or a pulsing machine. for a
// constant hum (or wind, rain, fire) use 0 fade in and fade out.
//
// ---------- distance and stereo ----------
//
// Sound.listener is the player's feet (set every frame by sketch.js). a sound played with a place
// ({ x, y, map }) is full volume right on top of it and fades to nothing at `range` tiles away
// (squared, so it drops off quicker at first), and pans towards the side it's on. a sound on another
// map is silent. a sound played with null for its place is full volume with no pan (the editor's
// preview, npcs talking, and later things like menu clicks). the place is read again every frame, so
// it can be an object that moves: anything with x, y and map, like a moving sound block's
// (SoundBlocks.where()) or a character's (SoundBlocks.updateCharacters()). those use getters, like
// { get x() { return enemy.x; }, get y() { return enemy.y; }, map: worldMap }. how fast the place
// moves is what the doppler effect uses (see "the doppler effect" further down this file).
//
// ---------- adding things ----------
//
//   a sound      in game: map editor, Sounds tab, New (or right click one to change it), then Export
//   a voice      in game: map editor, Voices tab, New, then click an npc to give it the voice (or
//                right click an npc, New voice). voice: 'its-name' in npcs.js gives a whole kind one
//   a wave       a SOUND_WAVES line with its shape(p, width) and a tip. it gets a button in the sound
//                editor and its own wave table by itself. a wave without a shape needs its own
//                branch in renderSound()
//   a setting    a SOUND_SETTINGS line (that's its slider too), then make it do something in
//                renderSound(). if it moves the pitch, add it to `steady` in renderSound() too, and if
//                it only matters sometimes, add it to soundSettingMatters() (soundeditor.js). its
//                section has to be in a tab in SOUND_EDITOR.tabs (soundeditor.js)
//   a generator  a line in SOUND_GENERATORS in soundeditor.js (the "make one" buttons, and the
//                Character tab's knobs for each kind)
//   a moving sound      in game: right click a sound block, Moving tab. or give an enemy or npc a
//                sound (right click it, or sound: in enemies.js / npcs.js). from code, pass a place
//                that moves (see "distance and stereo") and the doppler effect just works. how strong
//                it is everywhere is SOUND_DOPPLER, and for one sound its Doppler setting
//   a sound from code   playSound('name', { x, y, map }) for something in the world, or
//                playSound('name') for full volume, or playSound('name', null, key, { say: 'Hi!' })
//                to have it talk. it gives back the voice, which Sound.stop() takes
//
// ---------- speed ----------
//
// working out a sound takes roughly 3-15 ms per second of sound once the browser has warmed up (the
// first few are slower, and voices and sweeping filters are the slowest). that's fine for playing,
// since each one is only worked out once and kept. it matters in the sound editor, where dragging a
// slider makes a new sound every frame: long sounds (several seconds, like the nature loops, or lots
// of repeats) can make the editor stutter while you drag. talking works out a whole line at once
// when it starts (a syllable at a time, reusing ones that are the same), a few tens of ms for a long
// line, so an npc's first line can make one frame late. sounds can't be longer than
// SOUND_MAX_SECONDS, so a typo can't freeze the game.
//
// ---------- known problems and things to watch out for ----------
//
//   - browsers don't let a page make sound until it's been clicked. if a loop block is in range when
//     the page loads, the audio gets made before the click, Chrome logs "The AudioContext was not
//     allowed to start", and it stays silent until you click the game (then it starts). harmless
//   - punch makes the volume jump up where fade in ends and hold starts. that's the snap it's meant to
//     have, but with a long fade in and lots of punch you can hear it as a click
//   - the noises stop getting any brighter above about 1400 Hz, since their values already change
//     about every sample there (32 changes a cycle x 1400 is 44800 a second)
//   - each repeat carries on the wave's phase from the last one instead of starting fresh, so repeats
//     of square and saw can sound very slightly different from each other. you'd only notice on
//     really low pitches
//   - a filter that sweeps fully open (low-pass 100) or shut (high-pass 0) stops running, and when it
//     sweeps back it starts from where it left off, which can pop. sweeping within the range is fine
//   - lots of resonance, flanger, echo, reverb or volume can go past full volume, and softClip()
//     rounds it off, which sounds warm at first and fuzzy if it's pushed hard (sometimes that's what
//     you want). a long held sound with lots of echo builds up the most
//   - turning the flanger on makes the sound 30% quieter at the very start (before the late copy
//     catches up), and a flanger + sweep that goes below 0 ms is held at 1 sample, which just makes it
//     a bit duller
//   - a loop with echo or reverb is worked out twice round so its echoes carry over the join, which
//     makes it take twice as long to work out. echoes longer than one go round still get cut off
//   - band-limiting (polyBlep()) is off while FM is on, since FM moves the wave too unevenly for it,
//     so a square or saw with FM is a little harsher on high notes
//   - the voices of an ensemble share one FM and one growl, and a sound with more than one voice can't
//     loop at a whole number of waves (they drift), so it relies on the crossfade at the join
//   - the string only keeps ringing while its beep does: the fade out is how long it rings, and the
//     next repeat plucks it fresh rather than letting the last note carry on under it
//   - the random parts are the same every time round a loop, so a short rain or fire loop can sound
//     like it repeats. a longer Hold makes that harder to hear
//   - soft noise is turned down at low pitches (it piles up rumble otherwise), from the pitch it
//     starts at, so a big slide on it gets louder or quieter as it goes
//   - talking guesses syllables from English spelling, so odd words ("rhythm", numbers) come out a
//     bit wrong. it's babble, so it doesn't matter much. a syllable is cut off when the next starts,
//     so a sound with a long fade out doesn't get to use it while talking
//   - render keys are the settings as json, so a sound from SOUNDS (which has its name) and the same
//     settings in the editor (which don't) are kept as two renders. harmless, just a little memory
//   - the render cache can hold 30 sounds of up to 20 seconds each, so in a weird case that's a few
//     hundred MB. normal sounds are under a few seconds, so it's small
//   - an audio file that fails to load is never tried again until the page reloads
//   - two loop blocks playing the same sound near each other play it twice, louder, and they can
//     drift in and out of step
//   - the doppler effect changes how fast a sound plays (like it really does), so a bent one-shot is
//     a bit shorter or longer too. it's worked out from how far things moved since the last frame, so
//     a stuttery frame or a character bumping into things can wobble the pitch a little (glide smooths
//     most of it)
//   - walking past a still loop bends it slightly (about a note at walking speed), which is right,
//     but if a hum shouldn't do that, set its Doppler to 0
//   - the doppler effect only bends a whole voice: echoes baked into a sound bend with it, rather than
//     each echo bending on its own like in real life
//
// ---------- ideas for later ----------
//
//   - sounds for things that happen: sword swings and hits (weapons.js), footsteps (a stepSound
//     setting on tiles, played from walk() in character.js), doors (a sound on warps), enemies
//     getting hurt or dying, ui clicks. all of them are just playSound() calls
//   - a little random pitch on each play so repeated sounds (footsteps) don't all sound the same.
//     it'd go through randomBetween() (utils.js) like all game randomness
//   - an npc's voice could come from where they stand (and bend as they walk), with a place like a
//     character sound's
//   - sounds take time to arrive: something far away could be heard a little after it happens
//     (distance / SOUND_DOPPLER.speedOfSound), like thunder after lightning
//   - walls muffling sounds: if clearLine() (tilemap.js) is blocked between the sound and the
//     listener, turn the volume down or add a low-pass to the voice
//   - music: long file sounds as loops, with a fade between maps. a separate music volume
//   - a volume setting or a mute key (a gain node between the voices and ctx.destination)
//   - more effects: distortion, a proper chorus. each is a setting plus a few lines in the effects
//     part of renderSound()
//   - rhythms for tunes (dotted, swung), not just even notes and a long last one
//   - talking: consonants (a little noise at the start of s, sh, t...), and a different voice for
//     emotions (a line starting with [angry] could raise the pitch and expression)
//   - drawing your own wave shape in the sound editor, saved as a list of points in sounds.json
//   - renaming and deleting sounds in the sound editor (now by hand in sounds.json). renaming would
//     have to update every sound block and npc voice on every map (and in npcs.js), like renaming a
//     warp would
//   - one file per sound instead of one sounds.json, if the list gets long
//
// ---------- checking changes ----------
//
//   - node js/squimble-quest/tests/sound-check.js (no output means it passed). add --fix to rewrite
//     sounds.json in the exported format after editing it by hand
//   - in the game: the sound editor with Loop on is the quickest way to hear a change, and the Say
//     box for talking
//
// =====================================================================================

// paths from the root of the site
const SOUND_FILE = 'assets/squimble-quest/sounds/sounds.json';
const SOUND_FILE_FOLDER = 'assets/squimble-quest/sounds/files/';

// goes at the top of sounds.json, same idea as tiles.json's (tiles.js)
const SOUNDS_FORMAT = 'squimble-quest-sounds';
const SOUNDS_VERSION = 1;

// how loud everything is overall (0 to 1). raw waves are really loud, so this keeps them comfortable.
// ponytail: one fixed number. a volume setting or mute key would change this (and the gain of every
// playing voice), or better, go through one gain node every voice connects to
const SOUND_MASTER_VOLUME = 0.35;

// samples a second that sounds are worked out at (the browser converts it if the speakers differ)
const SOUND_RATE = 44100;
// the longest a sound can be, so a typo can't make the game work out minutes of audio
const SOUND_MAX_SECONDS = 20;
// how long the crossfade is where a loop joins back to its start, in seconds
const SOUND_LOOP_FADE = 0.03;

// the kinds of wave. shape(p, width) is how high the wave is (-1 to 1) at point p (0 to 1) through one
// cycle, and width is the pulse width (0 to 1, only square uses it). the noises, metal and file don't
// have a shape, renderSound() deals with them itself. label is the text on its button in the sound
// editor.
// the key (like 'sawtooth') is what sounds.json saves, so renaming one turns every sound using it into
// a square. a shape only gets worked out once (into a wave table) so it can be as slow as you like.
// sharp jumps in a shape (like square and saw have) are what make a wave sound bright and buzzy, and
// smooth shapes (sine) sound soft, which is handy to know when making a new one
// tip shows along the bottom of the sound editor while you hover over its button. they're in the
// order of the buttons (rows of 8, SOUND_EDITOR.waveColumns)
const SOUND_WAVES = {
  sine:     { label: 'sine', tip: 'Smooth and pure, like a whistle. Good for bells, birds and soft beeps', shape: (p) => Math.sin(p * Math.PI * 2) },
  triangle: { label: 'triangle', tip: 'Soft and a bit hollow, like a flute', shape: (p) => 1 - 4 * Math.abs(p - 0.5) },
  square:   { label: 'square', tip: 'Buzzy, the classic old video game sound. Pulse width (Tone) makes it thinner and more nasal', shape: (p, width) => (p < width ? 1 : -1) },
  sawtooth: { label: 'saw', tip: 'Harsh and bright, good for lasers, engines and buzzing', shape: (p) => 2 * p - 1 },
  // from bfxr: a curved tooth, like a smoother, brighter triangle
  breaker:  { label: 'breaker', tip: 'A curved tooth, like a brighter triangle. Clear and a bit glassy', shape: (p) => (Math.abs(1 - 2 * p * p) - 0.6095) * 1.64 },
  organ:    { label: 'organ', tip: 'Warm and full, a sine with higher sines on top like an organ. Good for hums', shape: (p) => (Math.sin(p * Math.PI * 2) + 0.5 * Math.sin(p * Math.PI * 4) + 0.25 * Math.sin(p * Math.PI * 6)) / 1.4 },
  // from bfxr: a sine with a quiet one 20 times higher on top
  whistle:  { label: 'whistle', tip: 'A sine with a faint high buzz on top. Breathy and hollow, nice for birds and wind instruments', shape: (p) => 0.75 * Math.sin(p * Math.PI * 2) + 0.25 * Math.sin(p * Math.PI * 40) },
  // from bfxr: tan() goes off to infinity twice a cycle, so it's cut off at 3, which is what distorts
  tan:      { label: 'tan', tip: 'A wild, distorted wave. Harsh and crackly, for alarms and broken machines', shape: (p) => Math.max(-3, Math.min(3, Math.tan(Math.PI * p))) / 3 },
  // the buzz of a short repeating pattern of 1 bit noise, tuned so it plays at the pitch
  metal:    { label: 'metal', tip: 'A metallic, clangy buzz (old consoles\' short noise). It still plays notes, so it works on the piano' },
  // a throat buzz through a mouth shape (the Voice settings). see "voices" at the top
  voice:    { label: 'voice', tip: 'A voice saying a vowel. Shape it in the Voice tab, and type something there to hear it talk', shape: glottalPulse },
  // a plucked string: a burst of noise going round a loop as long as one wave, losing its highs each
  // time round, so it rings and mellows like a real string (Karplus-Strong). see renderSound()
  string:   { label: 'string', tip: 'A plucked string, like a harp, a guitar or a music box. Each repeat plucks it again, and a long Fade out lets it ring' },
  noise:    { label: 'noise', tip: 'Random hiss, for hits, explosions and footsteps. Pitch decides how high the hiss is' },
  // pink noise: white noise with the highs turned down, so it's softer, like wind or the sea
  pink:     { label: 'soft noise', tip: 'Softer, deeper hiss (pink noise), like wind, rain, rivers or the sea' },
  // the noise old consoles made: a pattern of 1s and 0s that repeats after a long while
  bitnoise: { label: 'bit noise', tip: 'Crunchy 1 bit noise like old consoles. Good for glitches, retro explosions and hits' },
  file:     { label: 'file', tip: 'An audio file (mp3, wav or ogg) instead of a wave. Pitch changes how fast it plays, 440 is normal' },
};

// the voice wave's throat buzz: how fast the air through the vocal folds is changing (the slope of a
// Rosenberg pulse). they open slowly then snap shut, and that snap is what makes a voice buzz. scaled
// so the snap is -1
function glottalPulse(p) {
  const open = 0.4;
  const close = 0.16;
  if (p < open) return ((Math.PI / (2 * open)) * Math.sin((Math.PI * p) / open)) / 9.82;
  if (p < open + close) return (-(Math.PI / (2 * close)) * Math.sin((Math.PI * (p - open)) / (2 * close))) / 9.82;
  return 0;
}

// every number setting a sound has. each one is a slider in the sound editor (Slider in formbox.js),
// so this is everything it needs: its section and name there, the smallest and biggest it can be, the
// step it moves in, how the slider spreads the values out (curve), its unit, its normal value, and a
// tip that shows along the bottom of the sound editor while you hover over it. off (if it has one)
// is the value that means the setting isn't doing anything, which the slider shows as "off".
//
// careful with these:
//   - key is what sounds.json saves. renaming a key loses that setting from every saved sound
//   - normal is the default, and sounds.json only saves settings that aren't the default. so
//     changing a normal value changes every sound that left that setting out (most of them)
//   - attack, sustain and decay are the old synth names for fade in, hold and fade out. the labels
//     are friendlier but the keys stayed, since they're in sounds.json
//   - curve 'log' needs a min above 0, and 'square' on a range either side of 0 needs min to be
//     exactly -max (see Slider in formbox.js)
///   - the section is the little heading it goes under, and it has to be in SOUND_EDITOR.tabs
//     (soundeditor.js) or it won't get a slider
//   - order matters: it's the order of the sliders, and of the settings in sounds.json. new ones can
//     go anywhere, but moving old ones changes how every line of sounds.json is written
const SOUND_SETTINGS = [
  { key: 'pitch', section: 'Pitch', label: 'Pitch', min: 20, max: 5000, step: 1, curve: 'log', unit: 'Hz', normal: 440, tip: 'How high it is. 440 is the A above middle C, and doubling it goes up an octave. For a file it\'s how fast it plays' },
  { key: 'slide', section: 'Pitch', label: 'Slide', min: -500, max: 500, step: 1, curve: 'square', unit: 'notes/s', normal: 0, tip: 'Makes the pitch rise (+) or fall (-) while it plays. Up for jumps and power-ups, down for lasers and falling' },
  { key: 'slideAccel', section: 'Pitch', label: 'Slide speed-up', min: -10000, max: 10000, step: 1, curve: 'square', unit: 'notes/s²', normal: 0, tip: 'Makes the slide get faster (+) or slower (-) as it goes, so it curves. Slide one way and speed up the other way for a chirp that turns round' },
  { key: 'drop', section: 'Pitch', label: 'Drop', min: 0, max: 48, step: 0.5, curve: 'square', unit: 'notes', normal: 0, off: 0, tip: 'Starts this many notes higher and falls fast to the pitch, then stays there. The thump of a kick drum, a punch, a zap. 0 is off' },
  { key: 'dropTime', section: 'Pitch', label: 'Drop time', min: 2, max: 500, step: 1, curve: 'log', unit: 'ms', normal: 40, tip: 'How quickly the drop falls. A few ms is a click or a kick drum, a few hundred a falling whistle' },
  { key: 'vibrato', section: 'Wobble', label: 'Vibrato', min: 0, max: 12, step: 0.1, curve: 'square', unit: 'notes', normal: 0, off: 0, tip: 'Wobbles the pitch up and down by this many notes. Big and slow for a siren, small and fast for a trill' },
  { key: 'vibratoSpeed', section: 'Wobble', label: 'Vibrato speed', min: 0, max: 40, step: 0.5, curve: 'linear', unit: '/s', normal: 6, tip: 'How many wobbles a second' },
  { key: 'wander', section: 'Wobble', label: 'Wander', min: 0, max: 24, step: 0.1, curve: 'square', unit: 'notes', normal: 0, off: 0, tip: 'Lets the pitch drift around at random by up to this many notes. Slow for wind gusts and engines, fast for rough, gravelly voices' },
  { key: 'wanderSpeed', section: 'Wobble', label: 'Wander speed', min: 0.1, max: 2000, step: 0.1, curve: 'log', unit: '/s', normal: 3, tip: 'How often it drifts somewhere new. Under 10 wanders, over 100 sounds rough and raspy (crows, growls, old voices)' },
  { key: 'growl', section: 'Wobble', label: 'Growl', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Makes every other wave quieter, which adds a rough note an octave lower (like vocal fry). A little for a gravelly voice, lots for growling beasts, dragons and snores. 0 is off' },
  { key: 'jump', section: 'Jumps', label: 'Jump', min: -24, max: 24, step: 1, curve: 'linear', unit: 'notes', normal: 0, off: 0, tip: 'Jumps the pitch up (+) or down (-) by this many notes partway through. Two notes like a coin pickup' },
  { key: 'jumpAt', section: 'Jumps', label: 'Jump at', min: 0, max: 1000, step: 5, curve: 'square', unit: 'ms', normal: 100, tip: 'How long after it starts the jump happens' },
  { key: 'jump2', section: 'Jumps', label: 'Second jump', min: -24, max: 24, step: 1, curve: 'linear', unit: 'notes', normal: 0, off: 0, tip: 'Another jump, on top of the first. 4 then 3 more plays a happy chord one note at a time, 3 then 4 a sad one' },
  { key: 'jump2At', section: 'Jumps', label: 'Second jump at', min: 0, max: 1000, step: 5, curve: 'square', unit: 'ms', normal: 200, tip: 'How long after it starts the second jump happens' },
  { key: 'jumpRepeat', section: 'Jumps', label: 'Jumps repeat', min: 0, max: 1000, step: 5, curve: 'square', unit: 'ms', normal: 0, off: 0, tip: 'Goes back to the start pitch every this many ms and does the jumps again, round and round (an arpeggio). Short for sparkly magic. 0 is off' },
  { key: 'repeatPitch', section: 'Jumps', label: 'Each repeat', min: -12, max: 12, step: 0.5, curve: 'linear', unit: 'notes', normal: 0, off: 0, tip: 'Moves the pitch up (+) or down (-) by this many notes on every repeat. Falling birdsong, a cuckoo\'s lower second note, a fanfare that climbs. Only does something with Repeats' },
  { key: 'pitchScatter', section: 'Jumps', label: 'Repeat scatter', min: 0, max: 12, step: 0.1, curve: 'square', unit: 'notes', normal: 0, off: 0, tip: 'Puts every repeat after the first on a random note, up to this far away. Coins clinking, bubbles, raindrops, shards of glass. Only does something with Repeats' },
  { key: 'melody', section: 'Tune', label: 'Tune', min: 0, max: 99, step: 1, curve: 'linear', unit: '', normal: 0, off: 0, tip: 'Turns the repeats into a little tune, one note each, that ends somewhere that sounds finished. Every number is a different tune. 0 is off. Only does something with Repeats' },
  { key: 'scale', section: 'Tune', label: 'Scale', min: 0, max: 5, step: 1, curve: 'linear', unit: '', normal: 0, names: ['major', 'minor', 'pentatonic', 'dreamy', 'spooky', 'whole tone'], tip: 'The notes the tune can use. Major is happy, minor sad, pentatonic easygoing, dreamy hopeful, spooky mysterious and whole tone floaty, like magic' },
  { key: 'contour', section: 'Tune', label: 'Shape', min: 0, max: 4, step: 1, curve: 'linear', unit: '', normal: 0, names: ['climbs', 'falls', 'arches', 'wanders', 'calls'], tip: 'Which way the tune goes: climbs to a high note (a win), falls to a low one (a loss), goes up and back down, wanders about, or calls back and forth (an alarm)' },
  { key: 'lastNote', section: 'Tune', label: 'Last note', min: 1, max: 6, step: 0.1, curve: 'linear', unit: '×', normal: 1, off: 1, tip: 'Holds the last repeat and lets it ring this many times longer, so a tune finishes on a long note. 1 is off' },

  { key: 'attack', section: 'Volume shape', label: 'Fade in', min: 0, max: 2000, step: 1, curve: 'square', unit: 'ms', normal: 5, tip: 'How long it takes to get loud. Long fades in sound soft, like a swell' },
  { key: 'sustain', section: 'Volume shape', label: 'Hold', min: 0, max: 5000, step: 1, curve: 'square', unit: 'ms', normal: 150, tip: 'How long it stays loud' },
  { key: 'punch', section: 'Volume shape', label: 'Punch', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Makes the start of the hold extra loud, then it settles. Gives hits and coins a snap' },
  { key: 'decay', section: 'Volume shape', label: 'Fade out', min: 0, max: 5000, step: 1, curve: 'square', unit: 'ms', normal: 100, tip: 'How long it takes to go quiet at the end. Long fades out ring like a bell' },
  { key: 'repeats', section: 'Volume shape', label: 'Repeats', min: 1, max: 16, step: 1, curve: 'linear', unit: 'x', normal: 1, tip: 'Plays the whole thing this many times in a row, for alarms, footsteps and birdsong' },
  { key: 'gap', section: 'Volume shape', label: 'Gap', min: 0, max: 2000, step: 1, curve: 'square', unit: 'ms', normal: 60, tip: 'The silence between repeats' },
  { key: 'scatter', section: 'Volume shape', label: 'Scatter', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Makes the repeats come at uneven times and loudnesses instead of like a clock: bubbles, rain on a roof, tapping fingers. Needs Repeats and a Gap' },
  { key: 'tremolo', section: 'Tremolo', label: 'Tremolo', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Wobbles the volume up and down. Fast for engines, helicopters, crickets and croaking frogs, slow for pulsing. 0 is off' },
  { key: 'tremoloSpeed', section: 'Tremolo', label: 'Tremolo speed', min: 0.1, max: 80, step: 0.1, curve: 'log', unit: '/s', normal: 8, tip: 'How many wobbles a second' },
  { key: 'hiss', section: 'Texture', label: 'Hiss', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Mixes noise in with the wave: a breathy flute, the rattle of a snare drum, steam, a hiss behind a growl. 0 is off' },
  { key: 'crackle', section: 'Texture', label: 'Crackle', min: 0, max: 500, step: 1, curve: 'square', unit: 'pops/s', normal: 0, off: 0, tip: 'Chops it into random pops. A few a second for firecrackers, lots for fire, rain, bubbling water and gravel. 0 is off' },
  { key: 'crackleLength', section: 'Texture', label: 'Pop length', min: 1, max: 300, step: 1, curve: 'log', unit: 'ms', normal: 20, tip: 'How long each pop takes to die away. Short is a click, long is a rumble' },
  { key: 'crackleDepth', section: 'Texture', label: 'Crackle depth', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 100, tip: 'How much it chops. 100 leaves only the pops (firecrackers), lower keeps the sound going underneath them (a fire\'s roar, steady rain)' },

  { key: 'pulseWidth', section: 'Square wave', label: 'Pulse width', min: 5, max: 95, step: 1, curve: 'linear', unit: '%', normal: 50, tip: 'Square wave only. 50 is a full square, lower or higher sounds thinner and more nasal' },
  { key: 'pulseSweep', section: 'Square wave', label: 'Pulse sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Square wave only. Changes the pulse width while it plays, which sounds like it\'s moving' },
  { key: 'voices', section: 'Ensemble', label: 'Voices', min: 1, max: 8, step: 1, curve: 'linear', unit: '', normal: 1, tip: 'Plays this many copies of the wave at once, each a little out of tune and drifting on its own, for a big, rich sound: choirs, strings, swarms, huge synths. Waves with a shape only' },
  { key: 'detune', section: 'Ensemble', label: 'Spread', min: 0, max: 100, step: 1, curve: 'square', unit: 'cents', normal: 12, tip: 'How out of tune the voices are with each other (100 cents is a note). A little is lush, a lot is wobbly and seasick' },
  { key: 'chord', section: 'Ensemble', label: 'Chord', min: 0, max: 7, step: 1, curve: 'linear', unit: '', normal: 0, names: ['unison', 'octaves', 'fifths', 'major', 'minor', 'sus', 'seventh', 'cluster'], tip: 'Which notes the voices share out between them: all the same note, or a chord. A chord needs at least as many voices as it has notes' },
  { key: 'fm', section: 'FM', label: 'FM', min: 0, max: 100, step: 1, curve: 'square', unit: '%', normal: 0, off: 0, tip: 'A hidden second wave bends this one (frequency modulation), for bells, metal, glass, robots and aliens. 0 is off' },
  { key: 'fmRatio', section: 'FM', label: 'FM ratio', min: 0.1, max: 16, step: 0.01, curve: 'log', unit: 'x', normal: 2, tip: 'How fast the hidden wave is compared with the pitch. Whole numbers (1, 2, 3) sound musical, in-between ones clang like metal' },
  { key: 'lowPass', section: 'Filters', label: 'Low-pass', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 100, off: 100, tip: 'Cuts out high sounds, making it duller and softer, like it\'s behind a wall. 100 is off' },
  { key: 'lowPassSweep', section: 'Filters', label: 'Low-pass sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Opens (+) or closes (-) the low-pass while it plays, like a wah' },
  { key: 'resonance', section: 'Filters', label: 'Resonance', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, tip: 'Makes the low-pass ring at its edge, for a squelchy synth sound or whistling wind. Only does something with the low-pass on' },
  { key: 'highPass', section: 'Filters', label: 'High-pass', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Cuts out low sounds, making it thinner, like it\'s coming out of a little radio. 0 is off' },
  { key: 'highPassSweep', section: 'Filters', label: 'High-pass sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Moves the high-pass up (+) or down (-) while it plays' },

  { key: 'vowel', section: 'Voice', label: 'Vowel', min: 0, max: 4, step: 0.1, curve: 'linear', unit: '', normal: 0, tip: 'Which vowel it says: ah, eh, ee, oh or oo, and in between blends them. Talking picks the vowels from the words instead, and uses this for words without any' },
  { key: 'vowelSlide', section: 'Voice', label: 'Vowel slide', min: -10, max: 10, step: 0.1, curve: 'square', unit: 'vowels/s', normal: 0, tip: 'Moves through the vowels while it plays, from ah towards oo (+) or back (-). Good for babies, cats and aliens' },
  { key: 'mouth', section: 'Voice', label: 'Mouth size', min: 40, max: 160, step: 1, curve: 'linear', unit: '%', normal: 100, tip: 'How big the mouth and throat are, separate from the pitch. 100 is a man, 85 a woman, 70 a child, 55 a baby, over 120 a giant' },
  { key: 'breath', section: 'Voice', label: 'Breath', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 10, tip: 'Air in the voice. A little sounds natural, more sounds old or shy, and lots is a whisper or a ghost' },
  { key: 'talkSpeed', section: 'Talking', label: 'Talk speed', min: 5, max: 100, step: 1, curve: 'linear', unit: 'letters/s', normal: 45, tip: 'How fast it talks. In dialogue the words type out at this speed too, so they match' },
  { key: 'expression', section: 'Talking', label: 'Expression', min: 0, max: 12, step: 0.1, curve: 'square', unit: 'notes', normal: 3, tip: 'How much the pitch goes up and down between syllables. 0 is a flat robot, high is excited or sing-song. Questions go up at the end' },

  { key: 'flanger', section: 'Flanger', label: 'Flanger', min: 0, max: 20, step: 0.1, curve: 'square', unit: 'ms', normal: 0, off: 0, tip: 'Mixes in a slightly late copy of the sound, for a hollow, whooshy, metallic feel. 0 is off' },
  { key: 'flangerSweep', section: 'Flanger', label: 'Flanger sweep', min: -20, max: 20, step: 0.1, curve: 'square', unit: 'ms/s', normal: 0, tip: 'Changes the flanger while it plays, which makes it swoosh' },
  { key: 'echo', section: 'Echo & reverb', label: 'Echo', min: 0, max: 1000, step: 5, curve: 'square', unit: 'ms', normal: 0, off: 0, tip: 'Plays it again this many ms later, over and over. Short for a small room or a metal pipe, long for a cave or a canyon. 0 is off' },
  { key: 'echoFeedback', section: 'Echo & reverb', label: 'Echo amount', min: 0, max: 85, step: 1, curve: 'linear', unit: '%', normal: 40, tip: 'How loud each echo is compared with the one before, so how long they go on' },
  { key: 'reverb', section: 'Echo & reverb', label: 'Reverb', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'The sound of a space around it, from a little warmth to a stone hall. The sound gets longer to fit it. 0 is off' },
  { key: 'reverbSize', section: 'Echo & reverb', label: 'Room size', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 50, tip: 'How big the space is, so how long the reverb rings. Small for a cupboard, big for a cathedral' },
  { key: 'crush', section: 'Crunch', label: 'Crunch', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Makes it lower quality on purpose (a bitcrusher), for crunchy retro sounds, robots and old radios' },
  { key: 'volume', section: 'Output', label: 'Volume', min: 0, max: 400, step: 1, curve: 'square', unit: '%', normal: 60, tip: 'How loud it is. Over 100 boosts quiet sounds like soft noise, and a lot over distorts' },
  { key: 'range', section: 'Output', label: 'Heard from', min: 1, max: 50, step: 1, curve: 'linear', unit: 'tiles', normal: 8, tip: 'How many tiles away you can still hear it in the game. It gets quieter the further away you are' },
  { key: 'doppler', section: 'Output', label: 'Doppler', min: 0, max: 300, step: 5, curve: 'linear', unit: '%', normal: 100, off: 0, tip: 'How much moving bends its pitch in the game (the doppler effect): higher while it and you get closer, lower while you get further apart. 0 is off (menu sounds, music), over 100 exaggerates it' },
];

// every sound starts with these, and they're the only settings a sound can have. wave first so it's
// first in each line of sounds.json
const SOUND_DEFAULTS = {
  // a SOUND_KINDS name: which library it's in
  kind: 'sound',
  // a SOUND_WAVES name
  wave: 'square',
  // the audio file's name in SOUND_FILE_FOLDER, for wave 'file'
  file: null,
  ...Object.fromEntries(SOUND_SETTINGS.map((setting) => [setting.key, setting.normal])),
};

// the kinds of sound, and the words for them. a sound is for sound blocks and anything else that
// plays a sound, a voice is for npcs to talk with (renderSpeech()). they're made the same way, in the
// same editor, and saved in the same sounds.json (with "kind": "voice"), but they're kept in their own
// libraries so sound blocks only offer sounds and npcs only offer voices. a name is only ever used
// once across both, since they share a file
const SOUND_KINDS = { sound: 'Sound', voice: 'Voice' };

// every sound and every voice by name, from sounds.json (loadSoundFile()) and the sound editor
// (setSound())
const SOUNDS = {};
const VOICES = {};

// the library a sound or voice is in (SOUNDS or VOICES), from its name or settings, or null for a
// name that's in neither
function soundLibrary(nameOrSound) {
  if (typeof nameOrSound !== 'string') return nameOrSound.kind === 'voice' ? VOICES : SOUNDS;
  if (SOUNDS[nameOrSound]) return SOUNDS;
  return VOICES[nameOrSound] ? VOICES : null;
}

// a sound or voice by name, or undefined
function findSound(name) {
  return soundLibrary(name)?.[name];
}

// decoded audio files by file name, { data (samples), rate (samples a second), seconds }. a file
// that's still loading (or failed) isn't in here yet, so its sounds are silent until it is
const SOUND_FILES = {};

// the settings that count something (repeats, voices) or pick one of a list (a chord, a scale, a
// shape, a tune), so they're always whole numbers
const WHOLE_SETTINGS = ['repeats', 'voices', 'chord', 'scale', 'contour', 'melody'];

// a full set of sound settings from some (from a file, a generator or the sound editor). anything
// that isn't a setting gets left out, numbers are kept inside their slider's range, and anything the
// wrong type gets its default, so a bad file can't break the audio. it doesn't round numbers to their
// slider's step though, so a hand typed 440.5 stays 440.5 until the sound editor opens it (its slider
// rounds it then), apart from the ones that count something or pick from a list (WHOLE_SETTINGS),
// which have to be whole numbers
function soundSettings(from) {
  const sound = {
    kind: SOUND_KINDS[from.kind] ? from.kind : SOUND_DEFAULTS.kind,
    wave: SOUND_WAVES[from.wave] ? from.wave : SOUND_DEFAULTS.wave,
    file: typeof from.file === 'string' ? from.file : null,
  };
  if (from.wave !== undefined && sound.wave !== from.wave) console.warn(`There's no sound wave called "${from.wave}", so it's a ${sound.wave} instead. They're in SOUND_WAVES (sound.js)`);
  for (const { key, min, max, normal } of SOUND_SETTINGS) {
    sound[key] = typeof from[key] === 'number' && !Number.isNaN(from[key]) ? Math.min(max, Math.max(min, from[key])) : normal;
    if (WHOLE_SETTINGS.includes(key)) sound[key] = Math.round(sound[key]);
  }
  return sound;
}

// adds a sound or voice to its library (by its kind) or changes one, and starts loading its audio
// file if it has one. anything already playing the old version carries on with it, and the next play
// uses the new one. a changed sound keeps its place in the list (and in sounds.json), and a new one
// goes on the end. one that's changed kind moves to the other library (and to the end)
function setSound(name, settings) {
  const sound = { ...soundSettings(settings), name };
  const library = soundLibrary(sound);
  delete (library === SOUNDS ? VOICES : SOUNDS)[name];
  library[name] = sound;
  if (sound.wave === 'file' && sound.file) loadAudioFile(sound.file);
}

// the times that make up a sound, in seconds: one beep (fade in + hold + fade out), the last beep
// (which holds and rings lastNote times longer), one beep plus its gap, all the repeats (pattern, no
// gap after the last one), how long the echoes and reverb carry on after that (tail), and the whole
// thing. the whole thing is cut at SOUND_MAX_SECONDS, which can chop the last repeats off a really
// long sound
function soundTimings(sound) {
  const beep = (sound.attack + sound.sustain + sound.decay) / 1000;
  const lastBeep = (sound.attack + (sound.sustain + sound.decay) * sound.lastNote) / 1000;
  const step = beep + sound.gap / 1000;
  const pattern = (sound.repeats - 1) * step + lastBeep;
  // echoes until they're 1% as loud (at least one echo), at most 4 s
  const echoes = sound.echoFeedback > 0 ? Math.max(1, Math.log(0.01) / Math.log(sound.echoFeedback / 100)) : 1;
  const echoTail = sound.echo > 0 ? Math.min(4, (sound.echo / 1000) * echoes) : 0;
  const reverbTail = sound.reverb > 0 ? Math.min(4, reverbSeconds(sound.reverbSize)) : 0;
  const tail = Math.max(echoTail, reverbTail);
  return { beep, lastBeep, step, pattern, tail, seconds: Math.min(SOUND_MAX_SECONDS, pattern + tail) };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// the closest musical note to a pitch, like 440 gives "A4"
function noteName(hz) {
  // how many notes up from C0. A4 (440) is 57
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;
  return NOTE_NAMES[((n % 12) + 12) % 12] + Math.floor(n / 12);
}

// the pitch (Hz) of a note number, where 57 is A4 (440), like noteName() uses
function noteFrequency(n) {
  return 440 * 2 ** ((n - 57) / 12);
}

// ---------- the synthesiser ----------

// the notes (up from the root) each Chord shares out between the voices, in the order of its names
// in SOUND_SETTINGS
const SOUND_CHORDS = [[0], [0, 12], [0, 7, 12], [0, 4, 7, 12], [0, 3, 7, 12], [0, 5, 7, 12], [0, 4, 7, 10], [0, 1, 5, 6]];
// the notes in an octave of each Scale (the Tune's), in the order of its names: major, minor,
// pentatonic, dreamy (dorian), spooky (harmonic minor) and whole tone
const SOUND_SCALES = [[0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 4, 7, 9], [0, 2, 3, 5, 7, 9, 10], [0, 2, 3, 5, 7, 8, 11], [0, 2, 4, 6, 8, 10]];

// a sound's tune: how many notes up from its pitch each repeat plays (all 0 when Tune is off). the
// same settings always make the same tune. it's steps along the scale picked by Shape (with a little
// randomness in the middle notes), and the last note lands on the root or its octave so it sounds
// finished, apart from calls, which are meant to sound unresolved
function soundMelody(sound) {
  const count = sound.repeats;
  if (sound.melody === 0 || count < 2) return new Array(count).fill(0);
  const random = seededRandom(sound.melody * 7919 + sound.contour * 104729);
  const scale = SOUND_SCALES[sound.scale];
  const octave = scale.length;
  // how many steps of the scale it covers, at most an octave
  const span = Math.min(octave, 3 + Math.floor(random() * 4));
  let wander = 0;
  const steps = [];
  for (let n = 0; n < count; n++) {
    const along = n / (count - 1);
    const nudge = n === 0 || n === count - 1 ? 0 : Math.floor(random() * 3) - 1;
    if (sound.contour === 1) steps.push(Math.round(span * (1 - along)) + nudge);
    else if (sound.contour === 2) steps.push(Math.round(span * Math.sin(Math.PI * along)) + nudge);
    // wanders a step or two up or down each note, never standing still, and not too far from home
    else if (sound.contour === 3) steps.push(wander = n === 0 ? 0 : Math.min(octave + 2, Math.max(-2, wander + [-2, -1, 1, 2][Math.floor(random() * 4)])));
    else if (sound.contour === 4) steps.push(n % 2 ? 2 + Math.floor(random() * 3) : 0);
    else steps.push(Math.round(span * along) + nudge);
  }
  if (sound.contour === 0) steps[count - 1] = octave;
  if (sound.contour === 1 || sound.contour === 2) steps[count - 1] = 0;
  if (sound.contour === 3) steps[count - 1] = Math.round(steps[count - 1] / octave) * octave;
  return steps.map((step) => scale[((step % octave) + octave) % octave] + 12 * Math.floor(step / octave));
}

// how each repeat is different from the last, from Scatter, Repeat scatter, Tune and Last note: when it
// starts (seconds), how much longer it holds and rings, how loud it is and how many notes up it is.
// the first repeat always starts on time at full volume. a repeat can only move by half its gap
// either way, so repeats never overlap
function soundRepeats(sound, timings) {
  const random = seededRandom(5);
  const melody = soundMelody(sound);
  const gap = sound.gap / 1000;
  return melody.map((tune, n) => {
    const late = random() - 0.5;
    const quieter = random();
    const off = random() * 2 - 1;
    const first = n === 0;
    return {
      start: n * timings.step + (first ? 0 : late * gap * (sound.scatter / 100)),
      longer: n === sound.repeats - 1 ? sound.lastNote : 1,
      loudness: first ? 1 : 1 - (sound.scatter / 100) * 0.55 * quieter,
      notes: tune + (first ? 0 : off * sound.pitchScatter),
    };
  });
}

// the little sharp corner where a square or saw wave jumps, smoothed out over one sample either side
// (polyBLEP). t is where in the cycle the wave is and dt how far it moves each sample. a jump that
// happens between samples makes tones far too high to play, which fold back down as harsh, out of
// tune whines (aliasing), especially on high notes. adding this to the wave around each jump takes
// most of that away, so square and saw sound clean instead of fizzy
function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

// rounds off anything past 0.8 instead of chopping it flat at 1, so a loud sound gets a little warmer
// rather than harsh and crackly. anything quieter is left exactly as it is
function softClip(x) {
  const size = Math.abs(x);
  return size <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((size - 0.8) / 0.2));
}

// ---------- reverb ----------
// a small room, the way the classic Schroeder and Freeverb reverbs do it: the sound goes round six
// echo loops (combs) a few hundredths of a second long, each a slightly different length so their
// echoes blur together instead of buzzing, and each a little duller every time round, like sound
// bouncing off soft walls. then three allpasses smear the echoes out more. Room size is how much of
// the sound survives each time round, so how long it rings
const REVERB_COMBS = [1116, 1188, 1277, 1356, 1422, 1491];
const REVERB_ALLPASSES = [556, 441, 341];

function reverbFeedback(size) {
  return 0.72 + (size / 100) * 0.24;
}

// about how long a reverb of this room size takes to die away to nothing you can hear (50 dB down)
function reverbSeconds(size) {
  return (-2.5 * 1300) / Math.log10(reverbFeedback(size)) / SOUND_RATE;
}

// a reverb for a sound: (x) => x with its room added. it remembers the sound so far, so it's made
// fresh for each render
function makeReverb(sound) {
  const feedback = reverbFeedback(sound.reverbSize);
  const wet = (sound.reverb / 100) * 0.9;
  const dry = 1 - (sound.reverb / 100) * 0.35;
  const combs = REVERB_COMBS.map((length) => ({ ring: new Float32Array(length), at: 0, dull: 0 }));
  const passes = REVERB_ALLPASSES.map((length) => ({ ring: new Float32Array(length), at: 0 }));
  return (x) => {
    let room = 0;
    for (const comb of combs) {
      const back = comb.ring[comb.at];
      comb.dull = back * 0.7 + comb.dull * 0.3;
      comb.ring[comb.at] = x * 0.1 + comb.dull * feedback;
      comb.at = comb.at + 1 === comb.ring.length ? 0 : comb.at + 1;
      room += back;
    }
    for (const pass of passes) {
      const back = pass.ring[pass.at];
      pass.ring[pass.at] = room + back * 0.5;
      pass.at = pass.at + 1 === pass.ring.length ? 0 : pass.at + 1;
      room = back - room;
    }
    return x * dry + room * wet;
  };
}

/// works out every sample of a sound: { samples (Float32Array, -1 to 1), seconds }. loop: made to
// repeat forever, so the end runs smoothly back into the start. pitch: play it at another pitch
// (everything else that's in notes moves with it), for the sound editor's piano and for talking.
//
// every sample: the repeat it's in and the time into that repeat's beep decide the pitch (drop,
// slide, vibrato, wander, jumps, the tune and scatter) and the volume (fade in, hold with punch, fade
// out, tremolo, crackle). the wave is read at the current point in its cycle (bent by FM), once for
// each of its voices, hiss is mixed in, a voice goes through its mouth shape, then it goes through
// the low-pass, high-pass, flanger, echo, reverb and crunch, which keep running in the gaps so their
// tails fade out naturally.
//
// loops are the fiddly part. a loop is the pattern (all the repeats and gaps) played over and over.
// the wave's cycle carries on across the join instead of starting again, and it works out a little
// bit past the end, which is really the start of the next go round. that bit gets faded into the
// start (SOUND_LOOP_FADE), so the last sample leads straight into the first with no click. and a
// steady sound (nothing changing the pitch) gets a loop length that's a whole number of waves, so the
// join lines up perfectly. a loop with echo or reverb is worked out twice round and only the second
// is kept, so the echoes from the end of one go round are already there at the start of the next
function renderSound(sound, loop = false, pitch = sound.pitch) {
  // a fresh copy: soundSettings() builds a sound up a key at a time, and the browser reads an object
  // made like that much more slowly than one made in one go. it reads s every sample, so this makes
  // working a sound out about twice as fast
  const s = { ...sound };
  const timings = soundTimings(s);
  const { beep, lastBeep, step, pattern, seconds } = timings;
  // how long one go round is. a looping sound with repeats includes the gap after its last beep too,
  // so the rhythm stays even across the join. loops leave the echo tail off, the next go round
  // starts instead
  let period = loop ? Math.min(SOUND_MAX_SECONDS, s.repeats > 1 ? pattern + s.gap / 1000 : pattern) : seconds;
  // steady: nothing changes the pitch, one beep, one voice, and a wave with a shape (not noise or a
  // file). FM only repeats every wave when its ratio is a whole number. only then can the loop be a
  // whole number of waves. a new setting that moves the pitch needs adding here
  const steady = s.slide === 0 && s.slideAccel === 0 && s.drop === 0 && s.jump === 0 && s.jump2 === 0 && s.vibrato === 0 && s.wander === 0 &&
    s.repeats === 1 && s.voices === 1 && (s.fm === 0 || Number.isInteger(s.fmRatio)) && SOUND_WAVES[s.wave].shape;
  // rounds the loop to the nearest whole number of waves (at least one), which changes its length by
  // at most half a wave, so you can't hear the difference. growl repeats every two waves, so it's
  // rounded to pairs of them
  const loopWaves = s.growl > 0 ? pitch / 2 : pitch;
  if (loop && steady) period = Math.max(1, Math.round(period * loopWaves)) / loopWaves;
  // a sound with everything at 0 would have no samples at all, which the browser can't play
  period = Math.max(period, 0.01);
  const length = Math.round(period * SOUND_RATE);
  // the crossfade at the join, never more than a quarter of the loop
  const fade = loop ? Math.min(Math.round(SOUND_LOOP_FADE * SOUND_RATE), Math.floor(length / 4)) : 0;
  // a looping echo or reverb is worked out one go round early, so it's already ringing at the start
  const before = loop && (s.echo > 0 || s.reverb > 0) ? length : 0;
  // the extra `fade` samples are the start of the next go round, faded in at the end of this function
  const out = new Float32Array(before + length + fade);

  const attack = s.attack / 1000;
  const sustain = s.sustain / 1000;
  const decay = s.decay / 1000;
  const jumpAt = s.jumpAt / 1000;
  const jump2At = s.jump2At / 1000;
  const jumpRepeat = s.jumpRepeat / 1000;
  const dropTime = s.dropTime / 1000;
  const repeats = soundRepeats(s, timings);
  const shape = SOUND_WAVES[s.wave].shape;
  // every wave but square (whose shape changes with its pulse width) is read from a table instead
  const table = shape && s.wave !== 'square' ? waveTable(s.wave) : null;
  const file = s.wave === 'file' ? SOUND_FILES[s.file] : null;
  // the same "random" numbers every time, so the sound (and its picture) doesn't change between
  // plays. random is the noise waves' and the string's, chance is everything else's (wander, crackle,
  // breath), and hiss and the voices have their own, kept apart so turning one on doesn't change the
  // others
  const random = seededRandom(1);
  const chance = seededRandom(2);
  const hissRandom = seededRandom(3);
  const voiceRandom = seededRandom(4);
  // noise, soft noise and bit noise change 32 times a cycle, metal 93 times (its pattern is 93 long,
  // so it buzzes at the pitch)
  const cells = s.wave === 'metal' ? 93 : 32;
  // crunch: hold each sample for crushEvery samples, and round it to steps of crushStep
  const crushEvery = 1 + Math.round((s.crush / 100) * 24);
  const crushStep = 2 / 2 ** (16 - (s.crush / 100) * 13);
  // the flanger's memory of recent samples, enough for its longest delay, and the echo's (about 1.5 s)
  const recent = new Float32Array(4096);
  const echoes = s.echo > 0 ? new Float32Array(65536) : null;
  const echoDelay = Math.round((s.echo / 1000) * SOUND_RATE);
  const reverb = s.reverb > 0 ? makeReverb(s) : null;
  // the filters' numbers for a position (0 to 100), worked out once here when they don't sweep, since
  // they're slow to do for every sample
  const lowPassF = (position) => 2 * Math.sin((Math.PI * 40 * 2 ** ((position / 100) * Math.log2(SOUND_RATE / 6 / 40))) / SOUND_RATE);
  const highPassA = (position) => 1 / (1 + (2 * Math.PI * 20 * 2 ** ((position / 100) * Math.log2(8000 / 20))) / SOUND_RATE);
  const fixedLowPass = s.lowPassSweep === 0 && s.lowPass < 100 ? lowPassF(s.lowPass) : null;
  const fixedHighPass = s.highPassSweep === 0 && s.highPass > 0 ? highPassA(s.highPass) : null;
  const damping = 1.5 - (s.resonance / 100) * 1.4;
  const notesToRatio = Math.LN2 / 12;
  // FM: how far the hidden wave pushes this one through its cycle, at most 1.3 cycles either way
  const fmDepth = (s.fm / 100) * 1.3;
  // band-limiting (polyBlep()) needs the wave to move through its cycle smoothly, which FM stops
  const smoothEdges = fmDepth === 0;
  // each pop fades to a third of its loudness every crackleLength
  const popFade = Math.exp(-1 / ((s.crackleLength / 1000) * SOUND_RATE));
  const mouth = s.wave === 'voice' ? voiceMouth(s) : null;
  // soft noise piles up rumble at low pitches, so it's turned down there to stay about as loud
  const pinkLoudness = 0.12 * Math.min(1, Math.cbrt(pitch / 800));
  // the voices: each plays a note of the chord, a little out of tune by its place in the spread, starts
  // somewhere random in its cycle, and drifts slowly in and out of tune on its own, like singers
  const chord = SOUND_CHORDS[s.chord];
  const ensemble = shape && s.voices > 1 ? Array.from({ length: s.voices }, (_, k) => ({
    ratio: 2 ** ((chord[k % chord.length] + (k / (s.voices - 1) - 0.5) * (s.detune / 100)) / 12),
    phase: voiceRandom(),
    drift: 2 * Math.PI * (3.5 + voiceRandom() * 2.5),
    driftAt: voiceRandom() * 2 * Math.PI,
    tuning: 1,
  })) : null;
  // how far each voice drifts (a quarter of the spread), as a ratio, and how loud they are together:
  // voices that aren't in step add up to about the square root of how many there are
  const drift = (s.detune / 100) * 0.25 * notesToRatio;
  const ensembleLoudness = ensemble ? 1 / Math.sqrt(s.voices) : 1;
  // the string: a loop of samples one wave long (see SOUND_WAVES), and where it's up to
  const string = s.wave === 'string' ? new Float32Array(2048) : null;
  let stringAt = 0;
  // de-click: a beep that starts at full volume (no fade in) jumps from silence, which you hear as a
  // click, so it gets a fade in too short to hear (1.5 ms) instead. not on a smooth looping hum
  // though, where it'd make a dip at the join
  // the wave with a shape at point p of its cycle, moving dt a sample. square is worked out here at
  // its pulse width (with its middle moved to 0, so a thin pulse doesn't push the whole sound to one
  // side), the rest are blended between two table entries. square and saw get their jumps smoothed
  const sawtooth = s.wave === 'sawtooth';
  const wave = (p, dt, width) => {
    if (!table) {
      let y = (p < width ? 1 : -1) - (2 * width - 1);
      if (smoothEdges) y += polyBlep(p, dt) - polyBlep((p - width + 1) % 1, dt);
      return y;
    }
    const position = p * WAVE_TABLE_SIZE;
    const k = Math.floor(position);
    const y = table[k] + (table[k + 1] - table[k]) * (position - k);
    return sawtooth && smoothEdges ? y - polyBlep(p, dt) : y;
  };
  const declick = attack < 0.0015 && !(loop && s.decay === 0 && (s.repeats === 1 || s.gap === 0));

  let phase = 0;
  // waves so far (for growl, which turns down every other one) and how loud this one is
  let waves = 0;
  let growlGain = 1;
  let fmPhase = 0;
  let white = 0;
  let cell = -1;
  let bits = 1;
  const pink = [0, 0, 0];
  let wanderAt = 1;
  let wanderFrom = 0;
  let wanderTo = 0;
  let pop = 0;
  let beepNumber = -1;
  let filePosition = 0;
  let low = 0;
  let band = 0;
  let high = 0;
  let lastInput = 0;
  let held = 0;
  // the DC blocker's memory (see the end of the loop)
  let dcIn = 0;
  let dcOut = 0;
  for (let i = 0; i < out.length; i++) {
    // t is seconds since the start of the render, u is seconds into the pattern (they only differ when
    // looping), n is which repeat this is (the last one carries on through the tail), and b is seconds
    // into that repeat's beep (it keeps going up through the gap after it, which is how sweeps carry
    // on in the gaps)
    const t = i / SOUND_RATE;
    const u = loop ? t % period : t;
    let n = Math.min(s.repeats - 1, Math.floor(u / step));
    if (n > 0 && u < repeats[n].start) n--;
    const repeat = repeats[n];
    const b = u - repeat.start;
    const hold = sustain * repeat.longer;
    const ring = decay * repeat.longer;
    let x = 0;
    if (b >= 0 && b < (n === s.repeats - 1 ? lastBeep : beep)) {
      // a new repeat starts a file from its beginning and plucks the string again. the wave's phase
      // doesn't reset though (see "known problems" at the top), which is also what keeps loops smooth
      const newRepeat = n !== beepNumber;
      if (newRepeat) {
        beepNumber = n;
        filePosition = 0;
      }
      // the pitch right now, in notes away from the start. jumps go round every jumpRepeat
      const j = jumpRepeat > 0 ? b % jumpRepeat : b;
      let notes = s.slide * b + 0.5 * s.slideAccel * b * b + (j >= jumpAt ? s.jump : 0) + (j >= jump2At ? s.jump2 : 0) + s.repeatPitch * n + repeat.notes;
      // drop: starts high and falls quickly (each dropTime takes away about two thirds of what's left)
      if (s.drop > 0) notes += s.drop * Math.exp(-b / dropTime);
      if (s.vibrato > 0) notes += s.vibrato * Math.sin(2 * Math.PI * s.vibratoSpeed * b);
      // wander: a new random spot every 1 / wanderSpeed seconds, gliding smoothly between them
      if (s.wander > 0) {
        wanderAt += s.wanderSpeed / SOUND_RATE;
        if (wanderAt >= 1) {
          wanderAt -= Math.floor(wanderAt);
          wanderFrom = wanderTo;
          wanderTo = chance() * 2 - 1;
        }
        notes += s.wander * (wanderFrom + (wanderTo - wanderFrom) * wanderAt * wanderAt * (3 - 2 * wanderAt));
      }
      const frequency = Math.min(20000, Math.max(1, notes === 0 ? pitch : pitch * Math.exp(notes * notesToRatio)));
      phase += frequency / SOUND_RATE;
      if (phase >= 1) {
        phase -= Math.floor(phase);
        // growl: every other wave is quieter (by a slightly random amount, so it's rough rather than
        // a clean octave). that's what vocal folds do when they growl or fry. a new wave starts where
        // most waves are near 0, so the change doesn't click
        if (s.growl > 0) growlGain = ++waves % 2 ? 1 - (s.growl / 100) * (0.6 + 0.4 * chance()) : 1;
      }
      // FM bends where in the cycle the wave is read, by a hidden sine fmRatio times the pitch
      let bend = 0;
      if (fmDepth > 0) {
        fmPhase += (frequency * s.fmRatio) / SOUND_RATE;
        fmPhase -= Math.floor(fmPhase);
        bend = fmDepth * Math.sin(2 * Math.PI * fmPhase);
      }
      const width = Math.min(95, Math.max(5, s.pulseWidth + s.pulseSweep * b)) / 100;
      if (file) {
        x = fileSample(file, filePosition);
        filePosition += (frequency / 440) * (file.rate / SOUND_RATE);
      } else if (ensemble) {
        // each voice's drift moves so slowly that it's only worked out every 64 samples (1.5 ms)
        const drifting = (i & 63) === 0;
        for (const voice of ensemble) {
          if (drifting) voice.tuning = voice.ratio * (1 + drift * Math.sin(voice.drift * b + voice.driftAt));
          const dt = (frequency * voice.tuning) / SOUND_RATE;
          voice.phase += dt;
          voice.phase -= Math.floor(voice.phase);
          x += wave(bend === 0 ? voice.phase : (voice.phase + bend + 2) % 1, dt, width);
        }
        x *= ensembleLoudness;
      } else if (shape) {
        x = wave((phase + bend + 2) % 1, frequency / SOUND_RATE, width);
      } else if (string) {
        // a pluck fills one wave's worth of the loop with noise, smoothed a little so it isn't
        // scratchy. then each sample is the average of the two from one wave ago, a tiny bit quieter,
        // which is what makes it ring at the pitch and slowly lose its brightness
        const delay = Math.min(2040, Math.max(2, SOUND_RATE / frequency - 0.5));
        if (newRepeat) {
          const size = Math.ceil(delay) + 2;
          let smooth = 0;
          let middle = 0;
          for (let k = size; k > 0; k--) {
            smooth += (random() * 2 - 1 - smooth) * 0.6;
            string[(stringAt - k) & 2047] = smooth;
            middle += smooth / size;
          }
          // the noise is moved so its middle is 0, or the string would ring off to one side
          for (let k = size; k > 0; k--) string[(stringAt - k) & 2047] -= middle;
        }
        const whole = Math.floor(delay);
        const part = delay - whole;
        const a = string[(stringAt - whole) & 2047];
        const c = string[(stringAt - whole - 1) & 2047];
        const e = string[(stringAt - whole - 2) & 2047];
        const near = a + (c - a) * part;
        const far = c + (e - c) * part;
        x = (near + far) * 0.4985;
        string[stringAt & 2047] = x;
        stringAt++;
        x *= 1.6;
      } else {
        // the noises: a new value `cells` times a cycle, so pitch decides how fast the hiss changes.
        // above about 1400 Hz that's every sample anyway, so higher pitches don't sound any brighter
        // (see "known problems" at the top)
        const c = Math.floor(phase * cells);
        if (c !== cell) {
          cell = c;
          // bit noise and metal are a "linear feedback shift register", like the NES: each step
          // shifts the bits along and feeds two of them back in. bit noise feeds back bits 0 and 1 (a
          // pattern 32767 long, so it sounds random), metal bits 0 and 6 (93 long, so it buzzes)
          const feed = (bits ^ (bits >> (s.wave === 'metal' ? 6 : 1))) & 1;
          bits = (bits >> 1) | (feed << 14);
          white = random() * 2 - 1;
        }
        x = s.wave === 'bitnoise' || s.wave === 'metal' ? (bits & 1 ? 1 : -1) : white;
        // soft noise: three quick filters that turn the highs down a bit more the higher they go
        // (Paul Kellet's pink noise)
        if (s.wave === 'pink') {
          pink[0] = 0.99765 * pink[0] + x * 0.099046;
          pink[1] = 0.963 * pink[1] + x * 0.2965164;
          pink[2] = 0.57 * pink[2] + x * 1.0526913;
          x = (pink[0] + pink[1] + pink[2] + x * 0.1848) * pinkLoudness;
        }
      }
      x *= growlGain;
      // hiss: some of the wave swapped for white noise
      if (s.hiss > 0) x = x * (1 - s.hiss / 200) + (hissRandom() * 2 - 1) * (s.hiss / 100) * 0.8;
      if (mouth) x = mouth(x, b, chance);
      // the volume shape. fade in goes 0 to 1, hold starts at 1 + punch and settles to 1 by its end,
      // and fade out goes 1 to 0 (the last repeat holds and fades for lastNote times longer). the
      // jump from 1 to 1 + punch is the punch's snap (it can click with a long fade in). the divisions
      // are safe: b can only be in a part that's longer than 0
      if (b < attack) x *= b / attack;
      else if (b < attack + hold) x *= 1 + (1 - (b - attack) / hold) * (s.punch / 100);
      else x *= 1 - (b - attack - hold) / ring;
      if (declick && b < 0.0015) x *= b / 0.0015;
      x *= repeat.loudness;
      // tremolo dips the volume and comes back up, starting loud
      if (s.tremolo > 0) x *= 1 - (s.tremolo / 100) * (0.5 - 0.5 * Math.cos(2 * Math.PI * s.tremoloSpeed * b));
      // crackle: on average `crackle` pops a second, each a random loudness that dies away. depth is
      // how much it chops: at 100% there's nothing between pops, lower keeps the sound underneath
      // (a fire's roar under its crackles)
      if (s.crackle > 0) {
        if (chance() < s.crackle / SOUND_RATE) pop = Math.max(pop, 0.3 + 0.7 * chance());
        x *= 1 - (s.crackleDepth / 100) * (1 - pop);
        pop *= popFade;
      }
    }

    // low-pass: a "state variable filter", which can ring at its edge (resonance). its cutoff goes
    // from 40 Hz up to a sixth of the sample rate, as high as it can go without going unstable.
    // low and band are its memory between samples. while it's fully open (100) it's skipped
    // completely, so if a sweep opens it and then closes it again its memory is stale and it can pop
    const lowPass = fixedLowPass ? 0 : Math.min(100, Math.max(0, s.lowPass + s.lowPassSweep * b));
    if (fixedLowPass || lowPass < 100) {
      const f = fixedLowPass ?? lowPassF(lowPass);
      low += f * band;
      band += f * (x - low - damping * band);
      x = low;
    }
    // high-pass: a simple one, from 20 Hz up to 8000 Hz. it takes away the slow changes and keeps the
    // fast ones (high is its memory). same stale memory thing as the low-pass if a sweep turns it off
    // (0) and on again
    const highPass = fixedHighPass ? 0 : Math.min(100, Math.max(0, s.highPass + s.highPassSweep * b));
    const input = x;
    if (fixedHighPass || highPass > 0) {
      high = (high + input - lastInput) * (fixedHighPass ?? highPassA(highPass));
      x = high;
    }
    lastInput = input;
    // flanger: mix in the sound from a few ms ago. recent is a ring: & 4095 wraps the index round, so
    // it always holds the last 4096 samples (about 93 ms). the delay is kept between 1 sample and 4000,
    // and the mix is scaled by 0.7 so the two copies together aren't too loud (which also means it's a
    // bit quieter before the late copy arrives)
    recent[i & 4095] = x;
    if (s.flanger > 0 || s.flangerSweep !== 0) {
      const delay = Math.min(4000, Math.max(1, Math.round(((s.flanger + s.flangerSweep * b) / 1000) * SOUND_RATE)));
      x = (x + recent[(i - delay) & 4095]) * 0.7;
    }
    // echo: add what came out echoDelay ago, a bit quieter. what comes out goes back in, so each echo
    // has its own echo. a ring like the flanger's, 65536 samples (about 1.5 s)
    if (echoes) {
      x += echoes[(i - echoDelay) & 65535] * (s.echoFeedback / 100);
      echoes[i & 65535] = x;
    }
    if (reverb) x = reverb(x);
    // crunch: a "bitcrusher". holding each value for a few samples sounds like a lower sample rate,
    // and rounding to big steps sounds like fewer bits, like old consoles
    if (s.crush > 0) {
      if (i % crushEvery === 0) held = Math.round(x / crushStep) * crushStep;
      x = held;
    }
    // a one-shot loses any DC, a push to one side that some sounds pick up (FM, a thin filtered
    // noise). you can't hear it, but it makes a thump where the sound starts and stops. this is a
    // high-pass at 10 Hz, well below anything you can hear. loops leave it, since they never start
    // or stop on their own
    if (!loop) {
      dcOut = x - dcIn + 0.99857 * dcOut;
      dcIn = x;
      x = dcOut;
    }
    // kept inside -1..1, since anything past that would distort in the browser anyway. resonance,
    // punch, the flanger, echo and reverb can all push it past. softClip() rounds it off gently
    out[i] = softClip(x * (s.volume / 100));
  }

  const samples = out.subarray(before, before + length + fade);
  // fade the bit past the end into the start, so the loop joins smoothly. sample 0 ends up being
  // exactly the sample that would come after the last one, and by `fade` samples in it's back to the
  // real start. it's a straight (linear) crossfade, so if the two bits are very different (like
  // noise) it dips a little in volume for those 30 ms, which you can't really hear
  for (let i = 0; i < fade; i++) samples[i] = samples[i] * (i / fade) + samples[length + i] * (1 - i / fade);
  // a one-shot that's cut off while it's still loud (a hum played once) would end on a click, so the
  // last 5 ms fade away
  if (!loop) {
    const end = Math.min(220, Math.floor(length / 2));
    for (let i = 0; i < end; i++) samples[length - 1 - i] *= i / end;
  }
  return { samples: samples.subarray(0, length), seconds: length / SOUND_RATE };
}

// ---------- voices ----------
//
// the voice wave is a little "formant synthesiser", the way old talking computers worked. the throat
// makes a buzz (glottalPulse(), the wave), and the mouth's shape makes some pitches ring louder than
// others. those ringing pitches (formants) are what make "ah" sound different from "ee", so three
// filters that each ring at one of them turn the buzz into a vowel. mouth size moves all three, and
// that's most of the difference between a man, a woman and a child (along with the pitch). breath
// mixes air (noise) into the buzz before the mouth, which sounds whispery
//
// talking (renderSpeech()) plays the sound once per syllable of some words, at the vowel each one has
// and a slightly different pitch each, like the babble in old games. it works with any sound, not
// just voices, so a blip can talk too

// where a grown man's mouth rings (Hz) for each vowel the Vowel slider goes through: ah, eh, ee, oh,
// oo (Peterson and Barney's measurements, rounded). each is [first, second, third]
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240]];
const VOWEL_NAMES = ['ah', 'eh', 'ee', 'oh', 'oo'];
// how loud each of the three rings is, and how wide (Hz, for a man's mouth)
const FORMANT_GAINS = [1, 0.6, 0.35];
const FORMANT_WIDTHS = [90, 110, 170];
// ee and oo ring low down, where the buzz is strongest, so they come out much louder than ah. this
// evens the vowels out (measured, so each one is about as loud as a sine at the same volume)
const VOWEL_LOUDNESS = [7.4, 5.9, 2.6, 5.9, 3.3];

// the mouth for a voice sound: a function (buzz, b, chance) => the vowel, for renderSound(). b is
// seconds into the beep (for vowel slide) and chance the random numbers for breath. it remembers its
// filters between samples, so it's made fresh for each render
function voiceMouth(sound) {
  const size = 100 / sound.mouth;
  const filters = [0, 1, 2].map(() => ({ low: 0, band: 0, f: 0, damping: 1 }));
  let vowelNow = null;
  let loudness = 1;
  return (buzz, b, chance) => {
    const vowel = Math.min(4, Math.max(0, sound.vowel + sound.vowelSlide * b));
    // the filters' numbers only change when the vowel does
    if (vowel !== vowelNow) {
      vowelNow = vowel;
      const k = Math.min(3, Math.floor(vowel));
      loudness = VOWEL_LOUDNESS[k] + (VOWEL_LOUDNESS[k + 1] - VOWEL_LOUDNESS[k]) * (vowel - k);
      filters.forEach((filter, f) => {
        const hz = Math.min(SOUND_RATE / 6, (VOWELS[k][f] + (VOWELS[k + 1][f] - VOWELS[k][f]) * (vowel - k)) * size);
        filter.f = 2 * Math.sin((Math.PI * hz) / SOUND_RATE);
        filter.damping = (FORMANT_WIDTHS[f] * size) / hz;
      });
    }
    const air = sound.breath / 100;
    // the top tenth of the slider goes to pure air (breathing, whispers): the buzz fades from about a
    // quarter to nothing, and the air gets 3 times louder, since air through a mouth is much quieter
    // than a buzz. below 90% it's how it always was
    const top = Math.max(0, air - 0.9);
    const source = buzz * (top > 0 ? (1 - air) * 2.8 : 1 - air * 0.8) + (chance() * 2 - 1) * air * (0.5 + top * 10);
    // three state variable filters (like the low-pass) side by side, using their band output, which
    // rings at f. times damping keeps each ring's peak at the same loudness however narrow it is
    let x = 0;
    filters.forEach((filter, f) => {
      filter.low += filter.f * filter.band;
      filter.band += filter.f * (source - filter.low - filter.damping * filter.band);
      x += filter.band * filter.damping * FORMANT_GAINS[f];
    });
    return x * loudness;
  };
}

// a word's syllables for talking: { at (which letter it starts on), letters, vowel (0 to 4 for ah, eh,
// ee, oh, oo, or null for a word without one, like "hmm"), notes (how far up or down it goes) }.
// ponytail: a rough English guess (each group of vowels is a syllable, starting from the consonants
// before it, and a silent e on the end doesn't count). it's for babble, not real speech, so "queue"
// or "rhythm" coming out a bit wrong doesn't matter
function speechSyllables(text, expression) {
  const syllables = [];
  const lower = text.toLowerCase();
  // the end of each sentence, for which way its pitch goes
  const ends = [...lower.matchAll(/[.!?]+|$/g)];
  let sentence = [];
  const endSentence = (mark) => {
    sentence.forEach((syllable, k) => {
      // pitch drifts down through a sentence like people's does, an ! lifts it all, and a ? makes the
      // last syllable go up
      syllable.notes -= expression * 0.5 * (k / Math.max(1, sentence.length - 1));
      if (mark.includes('!')) syllable.notes += expression * 0.4;
      if (mark.includes('?') && k === sentence.length - 1) syllable.notes += expression * 2;
    });
    sentence = [];
  };
  let end = 0;
  for (const word of lower.matchAll(/[a-z0-9']+/g)) {
    while (ends[end].index < word.index) endSentence(ends[end++][0]);
    const groups = [...word[0].matchAll(/[aeiouy]+/g)];
    if (groups.length > 1 && /[^aeiouy]e$/.test(word[0])) groups.pop();
    if (groups.length === 0) groups.push(null);
    let from = 0;
    for (const group of groups) {
      const to = group ? group.index + group[0].length : word[0].length;
      const letters = word[0].slice(from, to);
      // the first proper vowel in the group, and a y on its own sounds like ee
      const vowel = group ? 'aeiou'.indexOf(group[0].replace(/y/g, '')[0] ?? 'i') : null;
      // each syllable's own random pitch comes from its letters, so the same word always sounds the
      // same, like a little language
      const seed = [...letters].reduce((hash, letter) => Math.imul(hash ^ letter.charCodeAt(0), 16777619), 2166136261);
      const syllable = { at: word.index + from, letters, vowel, notes: expression * 0.6 * (seededRandom(seed)() * 2 - 1) };
      syllables.push(syllable);
      sentence.push(syllable);
      from = to;
    }
  }
  while (end < ends.length) endSentence(ends[end++][0]);
  return syllables;
}

// a sound saying some words: { samples, seconds }, like renderSound(). each syllable is the sound
// played once at its vowel and pitch, starting on its letter at talkSpeed letters a second (which is
// how fast dialogue types them, so they match). a syllable is cut off (with a quick fade) when the next
// one starts, so long sounds still talk at the right speed. echo and reverb go over the whole thing
function renderSpeech(sound, text, pitch = sound.pitch) {
  const lettersPerSecond = sound.talkSpeed;
  const syllables = speechSyllables(text, sound.expression);
  const { beep, tail } = soundTimings(sound);
  const length = Math.max(1, Math.round(Math.min(SOUND_MAX_SECONDS, text.length / lettersPerSecond + beep + tail) * SOUND_RATE));
  const out = new Float32Array(length);
  const fade = Math.round(0.012 * SOUND_RATE);
  // the same vowel at the same pitch is only worked out once
  const made = new Map();
  syllables.forEach((syllable, k) => {
    const settings = { ...sound, vowel: syllable.vowel ?? sound.vowel, repeats: 1, echo: 0, reverb: 0, lastNote: 1 };
    const at = pitch * 2 ** (syllable.notes / 12);
    const key = `${settings.vowel} ${at}`;
    if (!made.has(key)) made.set(key, renderSound(settings, false, at).samples);
    const samples = made.get(key);
    const start = Math.round((syllable.at / lettersPerSecond) * SOUND_RATE);
    const stop = k + 1 < syllables.length ? Math.round((syllables[k + 1].at / lettersPerSecond) * SOUND_RATE) - start + fade : Infinity;
    const end = Math.min(samples.length, stop, length - start);
    for (let i = 0; i < end; i++) out[start + i] += samples[i] * Math.min(1, (stop - i) / fade);
  });
  // the echo and reverb go over the whole thing (each syllable's own would get cut off by the next one)
  const delay = Math.round((sound.echo / 1000) * SOUND_RATE);
  const reverb = sound.reverb > 0 ? makeReverb(sound) : null;
  for (let i = 0; i < length; i++) {
    if (sound.echo > 0 && i >= delay) out[i] += out[i - delay] * (sound.echoFeedback / 100);
    out[i] = softClip(reverb ? reverb(out[i]) : out[i]);
  }
  return { samples: out, seconds: length / SOUND_RATE };
}

// how many points a wave table has for one cycle
const WAVE_TABLE_SIZE = 2048;
const waveTables = {};

// one cycle of a wave's shape worked out at WAVE_TABLE_SIZE points (plus the first again at the end,
// for blending), so renderSound() can look it up instead of working it out 44100 times a second
function waveTable(wave) {
  if (!waveTables[wave]) {
    const { shape } = SOUND_WAVES[wave];
    waveTables[wave] = Float32Array.from({ length: WAVE_TABLE_SIZE + 1 }, (_, i) => shape((i % WAVE_TABLE_SIZE) / WAVE_TABLE_SIZE, 0.5));
  }
  return waveTables[wave];
}

// an audio file's sample at a position between samples (blends the two either side), 0 past its end
function fileSample(file, position) {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= file.data.length) return 0;
  return file.data[i] + (file.data[i + 1] - file.data[i]) * (position - i);
}

// a random number maker that gives the same numbers every time for the same seed (mulberry32). only
// for working out sounds, so it's not the game's randomness (randomBetween() in utils.js)
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the doppler effect ----------
//
// a sound coming towards you is higher, and going away is lower (a car or a siren going past goes
// "neeeoww"). that's because the waves bunch up in front of something moving and spread out behind it,
// and the same happens when you're the one moving. Sound.update() works out how fast the listener and
// every sound in the world are moving each frame (from how far they moved since the last one), and
// dopplerShift() turns that into how much faster or slower to play the sound (its playbackRate), so
// the pitch bends smoothly as things go past. only the speed along the line between you and the sound
// counts: something going round you in a circle doesn't change pitch, and nor does one that's stopped
// right next to you. each sound's Doppler setting scales it (0 is off), and it only happens to sounds
// with a place in the world, so the sound editor's preview and talking npcs are never bent.

// tweak these to change how the doppler effect feels everywhere
const SOUND_DOPPLER = {
  // how fast sound travels in the game, in tiles a second. real sound is about 340 tiles a second
  // (with a tile as a metre), which makes walking past something change its pitch by a percent or
  // two, too little to notice. slower sound makes the effect bigger: at 75, walking (5 tiles a
  // second) bends things about one note, and something going 20 tiles a second about five
  speedOfSound: 75,
  // the most it can bend the pitch either way, as a playback speed (2 is an octave)
  maxShift: 2,
  // seconds the pitch takes to glide to its new bend, so frame to frame wobbles don't warble
  glide: 0.06,
};

// how much the doppler effect bends a sound (its playback speed, 1 is no change), from where the
// listener and the sound are ({ x, y }, px) and how fast each is moving ({ x, y }, px a second).
// amount is the sound's Doppler setting (100 is normal). it's the usual formula,
// (speed of sound + listener's speed towards the sound) / (speed of sound + sound's speed away), each
// speed taken along the line between them and kept under the speed of sound so it can't blow up
function dopplerShift(listener, listenerVelocity, source, sourceVelocity, amount) {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const distance = Math.hypot(dx, dy);
  if (amount <= 0 || distance < 1) return 1;
  const c = SOUND_DOPPLER.speedOfSound * TILE;
  const along = (velocity) => Math.max(-0.9 * c, Math.min(0.9 * c, ((velocity.x * dx + velocity.y * dy) / distance) * (amount / 100)));
  const shift = (c + along(listenerVelocity)) / (c + along(sourceVelocity));
  return Math.max(1 / SOUND_DOPPLER.maxShift, Math.min(SOUND_DOPPLER.maxShift, shift));
}

// how fast something moved since last frame ({ x, y }, px a second), from where it was and is. on
// another map, with no time gone by, or faster than sound (a warp, respawning, a moving sound block
// starting its path again) it counts as still, so a teleport doesn't make anything squeal
function soundVelocity(was, now, dt) {
  if (!was || was.map !== now.map || dt <= 0) return { x: 0, y: 0 };
  const velocity = { x: (now.x - was.x) / dt, y: (now.y - was.y) / dt };
  return Math.hypot(velocity.x, velocity.y) > SOUND_DOPPLER.speedOfSound * TILE ? { x: 0, y: 0 } : velocity;
}

// ---------- playing sounds ----------

// plays a sound or voice, by name (SOUNDS or VOICES) or as settings. at: where it is in the world, { x, y, map }, so it
// gets quieter with distance, or null for full volume everywhere (like the sound editor). key:
// anything that marks what's playing it, so Sound.isPlaying(key) can tell. options: { loop, pitch,
// say }, where say is some words for it to say (renderSpeech()), like an npc talking. gives back the
// voice (Sound.stop() takes it), or null if it couldn't play
function playSound(sound, at = null, key = null, options = {}) {
  const settings = typeof sound === 'string' ? findSound(sound) : sound;
  return settings ? Sound.play(settings, at, key, options) : null;
}

const Sound = {
  // the browser's audio, made the first time something plays (null if the browser can't do audio)
  ctx: null,
  // sounds that are playing, each { source, out, pan, at, range, doppler, key, loop, ended, was }.
  // out and pan are what distance changes, source's playbackRate is what the doppler effect changes,
  // ended is set once it's finished, and was is where it was last frame
  voices: [],
  // where sounds are heard from, { x, y, map }, set every frame by update(), and how fast that's
  // moving ({ x, y }, px a second, for the doppler effect)
  listener: null,
  listenerVelocity: { x: 0, y: 0 },
  // worked out sounds, newest last, so changing the same sound back and forth doesn't redo it. each
  // is renderSound()'s result plus its browser buffer once it's been played
  rendered: new Map(),
  // { started (millis()), seconds, loop } while the sound editor's preview plays, else null
  previewing: null,

  // the audio, or null if the browser doesn't have it. made on first use, since browsers don't let
  // pages make sound before you've clicked on them. if it gets made before a click anyway (a loop
  // block in range on page load), Chrome warns in the console and it stays "suspended". resume() is
  // tried on every play, and it works as soon as the page has been clicked
  context() {
    if (!this.ctx) {
      if (!window.AudioContext) return null;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // renderSound()'s result for these settings (or renderSpeech()'s when it's saying some words),
  // worked out once and kept for a while. a file that's finished loading since gets worked out again.
  // the key is the settings as json, so the same settings with or without a name (SOUNDS has names,
  // the editor's draft doesn't) are two renders
  render(sound, loop = false, pitch = sound.pitch, say = null) {
    const key = JSON.stringify([sound, loop, pitch, say, sound.wave === 'file' && Boolean(SOUND_FILES[sound.file])]);
    let result = this.rendered.get(key);
    if (result) {
      this.rendered.delete(key);
    } else {
      result = say === null ? renderSound(sound, loop, pitch) : renderSpeech(sound, say, pitch);
      // ponytail: keeps the last 30 (Map keeps insertion order, so the first key is the oldest).
      // plenty for one map and the editor. if lots of long sounds come along, keep fewer or count
      // the samples instead
      if (this.rendered.size >= 30) this.rendered.delete(this.rendered.keys().next().value);
    }
    this.rendered.set(key, result);
    return result;
  },

  // plays some settings (playSound() is the way in, it looks names up). every play makes its own
  // little set of browser nodes, which is cheap, and they're thrown away when it finishes. there's no
  // limit on how many play at once, so something that plays every frame would pile up. an idea if
  // that's ever a problem: stop the last voice with the same key first
  play(sound, at, key, { loop = false, pitch = sound.pitch, say = null } = {}) {
    const ctx = this.context();
    if (!ctx) return null;
    const result = this.render(sound, loop, pitch, say);
    if (!result.buffer) {
      result.buffer = ctx.createBuffer(1, result.samples.length, SOUND_RATE);
      result.buffer.copyToChannel(result.samples, 0);
    }
    const source = ctx.createBufferSource();
    source.buffer = result.buffer;
    source.loop = loop;
    // it goes through out (volume from distance) then pan (left or right) to the speakers
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    out.gain.value = SOUND_MASTER_VOLUME * this.volumeAt(at, sound.range);
    pan.pan.value = this.panAt(at, sound.range);
    source.connect(out).connect(pan).connect(ctx.destination);
    source.start();
    // was is where it was last frame, for the doppler effect (update())
    const voice = { source, out, pan, at, range: sound.range, doppler: sound.doppler, key, loop, ended: false, was: at && { x: at.x, y: at.y, map: at.map } };
    // the browser says when it's finished. the doppler effect changes how fast it plays, so it can't
    // be worked out from its length
    source.onended = () => { voice.ended = true; };
    this.voices.push(voice);
    return voice;
  },

  // stops a voice, with a very quick fade so it doesn't click. one that's already stopped or finished
  // (or null) is left alone, so it's safe to stop something whenever
  stop(voice) {
    if (!this.voices.includes(voice)) return;
    const now = this.ctx.currentTime;
    voice.out.gain.setTargetAtTime(0, now, 0.015);
    voice.source.stop(now + 0.1);
    this.voices = this.voices.filter((other) => other !== voice);
  },

  // stops everything that's playing (like when the editor opens)
  stopAll() {
    for (const voice of [...this.voices]) this.stop(voice);
    this.previewing = null;
  },

  // is something with this key still playing? (playSound()'s key)
  isPlaying(key) {
    return this.voices.some((voice) => voice.key === key);
  },

  // 0 to 1, how loud a sound at `at` is from where the listener is. full volume right on top of it,
  // fading to nothing at range tiles away. null (no place) is always full volume, and a sound on
  // another map is silent
  volumeAt(at, range) {
    if (!at) return 1;
    const you = this.listener;
    if (!you || you.map !== at.map) return 0;
    const away = Math.hypot(at.x - you.x, at.y - you.y) / (range * TILE);
    // squared so it drops off quicker at first, which sounds more natural
    return Math.max(0, 1 - away) ** 2;
  },

  // -1 (all left) to 1 (all right), from which side of the listener the sound is on. never fully to
  // one side, since that sounds odd in headphones
  panAt(at, range) {
    if (!at || !this.listener) return 0;
    return constrain((at.x - this.listener.x) / (range * TILE), -1, 1) * 0.7;
  },

  // every frame (sketch.js). listener is where you hear from, { x, y, map }, and dt the seconds since
  // the last frame. sounds that are playing change volume, side and pitch (the doppler effect) as you
  // and they move, finished ones get tidied up, and loops you can't hear any more stop (sound blocks
  // start them again when you come back)
  update(listener, dt = 0) {
    this.listenerVelocity = soundVelocity(this.listener, listener, dt);
    this.listener = listener;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of [...this.voices]) {
      // finished. the browser has already stopped it and throws its nodes away by itself, so it just
      // comes off the list
      if (voice.ended) {
        this.voices = this.voices.filter((other) => other !== voice);
        continue;
      }
      if (!voice.at) continue;
      const volume = this.volumeAt(voice.at, voice.range);
      if (voice.loop && volume === 0) {
        this.stop(voice);
        continue;
      }
      // setTargetAtTime glides there quickly instead of jumping, which would click
      voice.out.gain.setTargetAtTime(SOUND_MASTER_VOLUME * volume, now, 0.05);
      voice.pan.pan.setTargetAtTime(this.panAt(voice.at, voice.range), now, 0.05);
      // the place is read again every frame, so a moving one (a moving sound block, a character) has
      // a speed. playing faster is higher, slower is lower
      const at = { x: voice.at.x, y: voice.at.y, map: voice.at.map };
      if (voice.doppler > 0 && at.map === listener.map) {
        const shift = dopplerShift(listener, this.listenerVelocity, at, soundVelocity(voice.was, at, dt), voice.doppler);
        voice.source.playbackRate.setTargetAtTime(shift, now, SOUND_DOPPLER.glide);
      }
      voice.was = at;
    }
  },

  // the sound editor's preview: plays the settings at full volume (stopping the last preview), and
  // starts the visualiser's moving line. options are play()'s
  preview(sound, options = {}) {
    this.stopPreview();
    const voice = playSound(sound, null, 'preview', options);
    const say = options.say ?? null;
    if (voice) this.previewing = { started: millis(), seconds: this.render(sound, options.loop, options.pitch ?? sound.pitch, say).seconds, loop: Boolean(options.loop), say };
  },

  stopPreview() {
    for (const voice of this.voices.filter((other) => other.key === 'preview')) this.stop(voice);
    this.previewing = null;
  },
};

// ---------- sounds.json and audio files ----------

// loads every sound, once at the start, before the maps (mapfile.js) since sound blocks name their
// sound. the promise finishes when it's done or failed, and problems are just console warnings.
// audio files load after, in the background
function loadSoundFile() {
  return fetchJson(SOUND_FILE)
    .then((data) => {
      if (!Array.isArray(data?.sounds)) throw new Error("it doesn't look like a Squimble Quest sounds file");
      for (const { name, ...settings } of data.sounds) {
        if (typeof name === 'string' && name !== '') setSound(name, settings);
        else console.warn(`A sound in ${SOUND_FILE} has no name, so it's been left out`);
      }
    })
    .catch((err) => {
      console.warn(`Couldn't load the sounds file "${SOUND_FILE}": ${err.message}.`);
    });
}

// every sound then every voice as the text of sounds.json, one per line (typeToData() and jsonLine()
// in utils.js)
function soundsToText() {
  const lines = [...Object.values(SOUNDS), ...Object.values(VOICES)].map((sound) => jsonLine(typeToData(sound, SOUND_DEFAULTS)));
  return `{\n  "format": "${SOUNDS_FORMAT}",\n  "version": ${SOUNDS_VERSION},\n  "sounds": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

// file names already asked for, so each file only loads once
const audioFilesAsked = new Set();

// loads an audio file from SOUND_FILE_FOLDER into SOUND_FILES, in the background. a file that fails
// stays in audioFilesAsked, so it isn't tried again until the page reloads (the console says why it
// failed). keep file names simple: letters, numbers, - and _ are safest in a web address
function loadAudioFile(fileName) {
  if (audioFilesAsked.has(fileName)) return;
  audioFilesAsked.add(fileName);
  fetch(SOUND_FILE_FOLDER + fileName)
    .then((response) => {
      if (!response.ok) throw new Error(`the file wasn't found (${response.status})`);
      return response.arrayBuffer();
    })
    .then(decodeAudio)
    .then((decoded) => { SOUND_FILES[fileName] = decoded; })
    .catch((err) => console.warn(`Couldn't load the audio file "${SOUND_FILE_FOLDER + fileName}": ${err.message}`));
}

// turns an audio file's bytes (mp3, wav, ogg...) into { data, rate, seconds }, mixed down to one
// channel. an OfflineAudioContext can decode before the page has been clicked, unlike a normal one.
// decoding converts the file to the context's sample rate (SOUND_RATE), so rate always comes out as
// 44100 really, but renderSound() reads it anyway in case that changes. which formats work is up to
// the browser: mp3 and wav are the safest, ogg works in most but older Safari can't play it.
// ponytail: stereo files become mono here, and the stereo comes back from panning. a stereo music
// track would lose its width, so music might want its own path one day
function decodeAudio(bytes) {
  return new OfflineAudioContext(1, 1, SOUND_RATE).decodeAudioData(bytes).then((buffer) => {
    const data = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] += channel[i] / buffer.numberOfChannels;
    }
    return { data, rate: buffer.sampleRate, seconds: buffer.duration };
  });
}

// ---------- drawing sounds ----------
// these draw with whatever stroke is set, so set it first (and noFill())

// how many cycles the close-up of a wave shows for a pitch: one more for every octave up, the way your
// ear hears it (55 Hz is 1, 440 is 3, 3520 is 6)
function closeUpCycles(pitch) {
  return constrain(Math.log2(pitch / 55), 1, 6);
}

// made up pictures for the waves that have no shape: a little swell for a file, a pluck dying away
// for a string, and jagged lines for the noises and metal
const WAVE_PICTURES = {
  file: (p) => Math.sin(p * Math.PI * 6) * Math.sin(p * Math.PI),
  string: (p) => Math.sin(p * Math.PI * 8) * Math.exp(-p * 2.5),
  noise: (p) => Math.sin(p * 997) * Math.sin(p * 131),
};

// a few cycles of a wave's shape filling x, y, w, h, for little pictures of a wave (sound block
// markers). the waves with no shape get their WAVE_PICTURES one
function drawWaveShape(wave, x, y, w, h, cycles = 2) {
  const shape = SOUND_WAVES[wave].shape ?? WAVE_PICTURES[wave] ?? WAVE_PICTURES.noise;
  beginShape();
  for (let i = 0; i <= w; i++) vertex(x + i, y + h / 2 - shape(((i / w) * cycles) % 1, 0.5) * (h / 2) * 0.8);
  endShape();
}

// the loudest and quietest sample in each of `columns` slices of a worked out sound (saying some words,
// if say isn't null), for drawing the whole thing. kept, since the palette draws every sound every
// frame
const soundOverviews = new Map();
function soundOverview(sound, columns, say = null) {
  const key = `${JSON.stringify(sound)}|${columns}|${say}|${sound.wave === 'file' && Boolean(SOUND_FILES[sound.file])}`;
  if (!soundOverviews.has(key)) {
    const { samples } = Sound.render(sound, false, sound.pitch, say);
    const overview = new Float32Array(columns * 2);
    for (let c = 0; c < columns; c++) {
      let lowest = 0;
      let highest = 0;
      const end = Math.floor(((c + 1) / columns) * samples.length);
      for (let i = Math.floor((c / columns) * samples.length); i < end; i++) {
        lowest = Math.min(lowest, samples[i]);
        highest = Math.max(highest, samples[i]);
      }
      overview[c * 2] = lowest;
      overview[c * 2 + 1] = highest;
    }
    // ponytail: never shrinks past 500, about 1 MB, fine for an editor
    if (soundOverviews.size >= 500) soundOverviews.delete(soundOverviews.keys().next().value);
    soundOverviews.set(key, overview);
  }
  return soundOverviews.get(key);
}

// the whole sound from start to end inside x, y, w, h, like a music program shows it: a line from the
// loudest to the quietest point of each column, so you see its volume shape, repeats and gaps. say:
// some words, to draw it talking them
function drawSoundShape(sound, x, y, w, h, say = null) {
  const columns = Math.max(1, Math.floor(w));
  const overview = soundOverview(sound, columns, say);
  const middle = y + h / 2;
  for (let c = 0; c < columns; c++) {
    line(x + c, middle - overview[c * 2 + 1] * (h / 2), x + c, middle - overview[c * 2] * (h / 2) + 0.5);
  }
}
