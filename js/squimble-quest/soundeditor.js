// the sound editor: a full screen synthesiser for making and changing the sounds and voices in the
// libraries (SOUNDS and VOICES, sound.js). open it from the map editor's Sounds or Voices tab (New,
// Edit, or right click one in the palette), from a sound block's settings (Edit sound), or from an
// npc's settings (Edit voice, New voice).
//   - top: the name, whether it's a Sound (for sound blocks) or a Voice (for npcs), Undo, Cancel and
//     Save. saving under a different name makes a copy
//   - left: the visualiser (a close-up of the wave and the whole sound, both from the real audio),
//     Play / Stop / Loop, a piano that plays the sound at other notes, and the "make one" buttons in
//     four kinds (Game, Nature, Things, Voices), each coming up with a random sound of that kind
//     (like sfxr and bfxr), plus Random and Mutate
//   - right: a button for each wave (file picks an mp3, wav or ogg), then tabs of sliders (Pitch,
//     Volume, Tone & effects, Voice), a slider for every SOUND_SETTINGS entry under its section's
//     heading. a tab with a dot has settings that aren't normal. the Voice tab has a Say box, which
//     plays the sound talking (how npcs with this as their voice sound)
// hover over anything for a tip along the bottom. right click a slider to put it back to normal, or
// scroll over it to nudge it. with Loop on, changing anything while it plays starts it again straight
// away, so you can hear what a slider does while you drag it. Save changes the sound in the game
// straight away, and Export (next to New in the inspector) downloads sounds.json and any audio files
// chosen since the page loaded. it's a ui group over the whole screen, like the warp graph
// (warpgraph.js), and the map editor hands it the updates while it's open (Editor.update())
//
// ---------- how it's put together ----------
//
// everything's made fresh in open() and thrown away in close() (UI.removeGroup('sound-editor')).
// the sound being edited is SoundEditor.draft, a plain settings object, and every part works off it:
//   - each slider's onChange writes its value into the draft
//   - the wave buttons, make one buttons, Random, Mutate and Choose file go through replace(), which
//     swaps in a whole new draft, moves every slider to match, and plays it
//   - update() saves the draft for Undo whenever it's changed and the mouse is let go (so a whole
//     slider drag is one Undo), greys out sliders that don't matter right now, and restarts the loop
//     preview when the draft changes
//   - SoundVisualiser reads the draft every frame (and Sound.render() keeps the samples, so a draft
//     that hasn't changed isn't worked out again)
//   - Save copies the draft into SOUNDS or VOICES, by its kind (setSound() in sound.js). nothing else
//     touches the libraries
// all the sliders are made at once, and the tabs just show and hide them (each has a .tab)
//
// ---------- known problems ----------
//
//   - the history is cleared every time the editor opens, and every nudge of the scroll wheel is its
//     own Undo
//   - the name box shows what you typed, but the sound is saved under the cleaned up name
//     (cleanMapName() in mapfile.js), so "My Sound" saves as "my-sound" (it says so next to the box).
//     names are 20 letters at most
//   - there's no renaming or deleting. saving under a new name makes a copy, and deleting is by hand
//     in sounds.json (see the sounds README)
//   - switching an existing sound to a voice (or back) moves it to the other library when it's saved,
//     so sound blocks using it go silent (and red), and so do npcs using a voice made a sound
//   - with Loop on, every change restarts the sound, and the old one fades out in about 15 ms, so you
//     can hear a tiny blip each restart while dragging. that's the restart, not the loop itself
//   - dragging a slider works the sound out again every frame (for the picture). long sounds (a few
//     seconds, or lots of repeats) can make it stutter while you drag
//   - two different files with the same file name: the second one replaces the first. sounds that
//     were already worked out with the first one (Sound.render() keeps them) can keep playing the old
//     audio until their settings change or the page reloads. giving files different names avoids it
//   - a file chosen and then cancelled stays loaded until the page reloads (it isn't exported unless
//     a saved sound uses it)
//   - the layout is fixed numbers (SOUND_EDITOR). each tab has room for about 13 sliders a column,
//     and each kind of make one button for 15
//   - while it's open Input.typing is on (for the text boxes), so dev mode keys don't work, apart from
//     Ctrl + D, which closes everything
//
// ---------- ideas for later ----------
//
//   - playing the piano with the keyboard (it'd need the text boxes to only take keys while clicked)
//   - a picture of the volume shape (fade in, hold, punch, fade out) as a line over the whole sound
//   - copy and paste a sound's settings, or a "compare" button that flips between two versions
//   - Delete and Rename buttons. rename would need to fix every sound block on every map
//   - "lock" a slider so Random and Mutate leave it alone (bfxr has this)

// layout, in screen px. the game is always 960 x 540, so these are just where things go
const SOUND_EDITOR = {
  headerHeight: 36,
  footerHeight: 30,
  // the left column, and where its parts go down it
  left: 16,
  leftWidth: 300,
  visualiserTop: 44,
  visualiserHeight: 152,
  playTop: 202,
  pianoTop: 232,
  pianoHeight: 50,
  makersTop: 290,
  // the right side: where it starts, each column of sliders' width, and the gap between columns
  right: 336,
  columnWidth: 296,
  columnGap: 16,
  // the wave buttons, in rows of waveColumns
  wavesTop: 56,
  waveColumns: 7,
  tabsTop: 116,
  // where the sliders start, each slider's height, and the room for a section's heading
  slidersTop: 150,
  rowHeight: 24,
  sectionHeight: 20,
  // the tabs of sliders: two columns of SOUND_SETTINGS sections each, and a line of help under them
  tabs: [
    { name: 'Pitch', columns: [['Pitch', 'Wobble'], ['Jumps']], hint: 'Everything here is in notes, so the piano moves it all together. Slides, wobbles and jumps start again on every repeat.' },
    { name: 'Volume', columns: [['Volume shape', 'Output'], ['Tremolo', 'Crackle']], hint: 'One beep is fade in, hold and fade out, and repeats play it again after the gap. Tremolo and crackle chop the volume up while it plays. For a smooth loop, use no fade in or out.' },
    { name: 'Tone & effects', columns: [['Filters', 'Square wave'], ['FM', 'Flanger', 'Echo', 'Crunch']], hint: 'Square wave and FM change the wave itself, then it goes through the filters and the effects in the order they\'re listed.' },
    { name: 'Voice', columns: [['Voice'], ['Talking']], hint: 'The Voice settings shape the voice wave. Talking works with any wave, so a blip can talk too, like in old games. Save it as a Voice, then right click an npc in the map editor to give it this voice.' },
  ],
  // the piano's lowest note (note numbers like noteFrequency() in sound.js, 48 is C4) and how many
  // white keys it has (15 is two octaves)
  pianoFrom: 48,
  whiteKeys: 15,
  // what the Say box starts with
  sayText: 'Hello there! Have you seen my squimble anywhere?',
};

// little helpers for the generators. they use randomBetween() (utils.js) like all the game's
// randomness. they're globals, so their names try not to clash with anything else
// a random number from a to b, rounded to one decimal place, for the generators
const randomNumber = (a, b) => Math.round(randomBetween(a, b) * 10) / 10;
// one thing from a list at random
const randomPick = (list) => list[Math.floor(randomBetween(0, list.length))];
// value half the time, otherwise undefined (which leaves that setting normal)
const sometimes = (value) => (randomBetween(0, 1) < 0.5 ? value : undefined);
// value up or down at random
const eitherWay = (value) => (randomBetween(0, 1) < 0.5 ? -value : value);
// a voice for the Voices buttons: a short syllable (it's played once per syllable when talking), on
// top of the voice's own settings
const voiceSettings = (settings) => ({ wave: 'voice', attack: randomNumber(8, 15), sustain: randomNumber(45, 75), decay: randomNumber(40, 70), vowel: randomNumber(0, 2), ...settings });

// the "make one" buttons, in kinds (the tabs above them). each comes up with a random sound of its
// kind, as settings on top of the normal ones (anything left out stays normal), and tip is shown while
// you hover over it. a new one is just a new line here, and its button appears by itself (3 a row, 15
// fit in a kind). heard from stays what it was unless it's given. the ranges are just what sounded
// right. a generator can give values outside a slider's range, it gets pulled back in
// (soundSettings()). the Voices buttons say the Say box's words instead of just playing
const SOUND_GENERATORS = {
  Game: {
    Coin: { tip: 'Two quick rising notes, for picking things up', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(700, 1400), jump: randomPick([3, 4, 5, 7, 12]), jumpAt: randomNumber(40, 100), attack: 0, sustain: randomNumber(30, 90), punch: randomNumber(30, 60), decay: randomNumber(100, 300), pulseWidth: randomNumber(20, 50) }) },
    Laser: { tip: 'A falling zap', make: () => ({ wave: randomPick(['square', 'sawtooth', 'sine']), pitch: randomNumber(500, 2000), slide: -randomNumber(40, 150), slideAccel: randomNumber(-50, 50), attack: 0, sustain: randomNumber(40, 150), decay: randomNumber(50, 200), pulseWidth: randomNumber(10, 50), pulseSweep: randomNumber(-50, 50), highPass: sometimes(randomNumber(5, 30)) }) },
    Explosion: { tip: 'A crunchy boom', make: () => ({ wave: randomPick(['noise', 'noise', 'bitnoise', 'pink']), pitch: randomNumber(80, 600), slide: -randomNumber(5, 30), attack: 0, sustain: randomNumber(80, 300), punch: randomNumber(20, 70), decay: randomNumber(300, 900), flanger: sometimes(randomNumber(1, 8)), flangerSweep: sometimes(randomNumber(-10, 10)), crush: sometimes(randomNumber(10, 50)), lowPass: randomNumber(60, 100), volume: 80 }) },
    'Power-up': { tip: 'A rising, wobbling tune', make: () => ({ wave: randomPick(['square', 'sawtooth', 'triangle']), pitch: randomNumber(200, 600), slide: randomNumber(15, 60), vibrato: sometimes(randomNumber(0.2, 1)), vibratoSpeed: randomNumber(8, 20), attack: 0, sustain: randomNumber(150, 350), decay: randomNumber(80, 300), repeats: randomPick([1, 1, 2, 3]), gap: randomNumber(20, 60) }) },
    Hit: { tip: 'A short thump or smack', make: () => ({ wave: randomPick(['noise', 'noise', 'sawtooth', 'square', 'bitnoise']), pitch: randomNumber(150, 900), slide: -randomNumber(30, 100), attack: 0, sustain: randomNumber(10, 60), decay: randomNumber(40, 160), punch: randomNumber(0, 50), highPass: sometimes(randomNumber(5, 30)), volume: 70 }) },
    Jump: { tip: 'A springy rising boing', make: () => ({ wave: 'square', pitch: randomNumber(200, 500), slide: randomNumber(25, 80), attack: 0, sustain: randomNumber(50, 150), decay: randomNumber(50, 150), pulseWidth: randomNumber(20, 50), lowPass: sometimes(randomNumber(50, 90)) }) },
    Blip: { tip: 'A tiny beep, for menus and clicks', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(300, 1500), attack: 0, sustain: randomNumber(20, 80), decay: randomNumber(10, 60), pulseWidth: randomNumber(20, 50), highPass: sometimes(randomNumber(5, 30)) }) },
    Bell: { tip: 'A ringing ding. FM makes it clang like real metal', make: () => ({ wave: randomPick(['sine', 'triangle', 'organ']), pitch: randomNumber(500, 2000), attack: randomNumber(0, 5), sustain: 0, decay: randomNumber(400, 1500), fm: sometimes(randomNumber(10, 40)), fmRatio: randomPick([1.4, 2.76, 3.5, 5.4]), vibrato: sometimes(randomNumber(0.05, 0.3)), vibratoSpeed: randomNumber(3, 8), repeats: randomPick([1, 1, 2]), gap: randomNumber(20, 80) }) },
    // made to loop smoothly (nothing moving the pitch), for loop sound blocks
    Hum: { tip: 'A steady machine hum that loops smoothly', make: () => ({ wave: randomPick(['organ', 'sine', 'triangle', 'sawtooth']), pitch: randomNumber(55, 180), attack: 0, sustain: randomNumber(1000, 2000), decay: 0, lowPass: randomNumber(40, 90), volume: 70, range: 5 }) },
    Magic: { tip: 'A sparkly arpeggio with an echo', make: () => {
      const at = randomNumber(30, 60);
      return { wave: randomPick(['sine', 'triangle', 'breaker', 'whistle']), pitch: randomNumber(600, 1400), slide: randomNumber(0, 15), jump: randomPick([4, 5, 7]), jumpAt: at, jump2: randomPick([3, 5, 7]), jump2At: at * 2, jumpRepeat: at * 3, attack: 0, sustain: randomNumber(250, 500), decay: randomNumber(250, 600), echo: randomNumber(90, 180), echoFeedback: randomNumber(30, 50), volume: 45 };
    } },
    Teleport: { tip: 'A rising warble, for warps and spells', make: () => ({ wave: randomPick(['square', 'sine', 'sawtooth']), pitch: randomNumber(200, 500), slide: randomNumber(60, 150), vibrato: randomNumber(2, 6), vibratoSpeed: randomNumber(20, 35), attack: randomNumber(0, 50), sustain: randomNumber(250, 450), decay: randomNumber(100, 250), flanger: sometimes(randomNumber(2, 6)), flangerSweep: sometimes(randomNumber(-8, 8)), volume: 45 }) },
    Jingle: { tip: 'Three notes of a chord, like finding treasure', make: () => {
      const [jump, jump2] = randomPick([[4, 3], [3, 4], [5, 4], [7, 5], [4, 5]]);
      const at = randomNumber(70, 110);
      return { wave: randomPick(['square', 'triangle', 'breaker']), pitch: noteFrequency(randomPick([60, 62, 64, 65, 67])), jump, jumpAt: at, jump2, jump2At: at * 2, attack: 0, sustain: at * 3 + randomNumber(50, 150), decay: randomNumber(150, 300), pulseWidth: randomNumber(25, 50), vibrato: sometimes(randomNumber(0.1, 0.3)), vibratoSpeed: 6, volume: 45 };
    } },
  },
  Nature: {
    Bird: { tip: 'Chirps and tweets. Each press is a new kind of bird', make: () => ({ wave: randomPick(['sine', 'whistle', 'sine']), pitch: randomNumber(1800, 4200), slide: eitherWay(randomNumber(40, 180)), slideAccel: randomNumber(-400, 400), vibrato: sometimes(randomNumber(1, 4)), vibratoSpeed: randomNumber(20, 40), wander: sometimes(randomNumber(0.5, 2)), wanderSpeed: randomNumber(10, 40), attack: randomNumber(0, 5), sustain: randomNumber(30, 110), decay: randomNumber(20, 70), repeats: randomPick([1, 2, 3, 4, 6]), gap: randomNumber(30, 130), volume: 45, range: 12 }) },
    Owl: { tip: 'A soft, hollow hoot', make: () => ({ wave: randomPick(['sine', 'triangle', 'whistle']), pitch: randomNumber(280, 420), slide: -randomNumber(1, 6), attack: randomNumber(30, 60), sustain: randomNumber(150, 300), decay: randomNumber(200, 350), vibrato: randomNumber(0.1, 0.3), vibratoSpeed: 5, repeats: randomPick([1, 2, 3]), gap: randomNumber(150, 350), lowPass: randomNumber(50, 70), range: 14 }) },
    Crow: { tip: 'A rough caw (a voice with a raspy wander)', make: () => ({ wave: 'voice', vowel: randomNumber(0, 0.6), mouth: randomNumber(50, 65), pitch: randomNumber(380, 650), slide: -randomNumber(3, 12), wander: randomNumber(1.2, 2.5), wanderSpeed: randomNumber(400, 900), breath: randomNumber(25, 45), attack: 10, sustain: randomNumber(150, 260), decay: randomNumber(80, 150), repeats: randomPick([1, 2, 3]), gap: randomNumber(120, 220), range: 14 }) },
    Cricket: { tip: 'A high pulsing chirp, lovely as a loop at night', make: () => ({ wave: 'sine', pitch: randomNumber(3800, 5200), tremolo: 100, tremoloSpeed: randomNumber(25, 60), attack: 5, sustain: randomNumber(120, 250), decay: 20, repeats: randomPick([2, 3]), gap: randomNumber(200, 400), volume: 50 }) },
    Frog: { tip: 'A croak, shaken by fast tremolo', make: () => ({ wave: randomPick(['square', 'sawtooth', 'voice']), vowel: 3, mouth: 120, pitch: randomNumber(90, 200), slide: randomNumber(-8, 8), tremolo: randomNumber(80, 100), tremoloSpeed: randomNumber(18, 35), attack: 5, sustain: randomNumber(150, 300), decay: randomNumber(50, 100), lowPass: randomNumber(40, 60), repeats: randomPick([1, 2]), gap: randomNumber(150, 300) }) },
    Bee: { tip: 'A buzzing insect that loops', make: () => ({ wave: 'sawtooth', pitch: randomNumber(170, 260), wander: randomNumber(1, 2.5), wanderSpeed: randomNumber(2, 5), vibrato: randomNumber(0.2, 0.5), vibratoSpeed: randomNumber(8, 12), tremolo: randomNumber(10, 20), tremoloSpeed: randomNumber(5, 9), lowPass: randomNumber(45, 65), resonance: randomNumber(20, 40), attack: 0, sustain: 2000, decay: 0, volume: 45, range: 4 }) },
    Wind: { tip: 'Gusting wind that loops. Resonance makes it whistle', make: () => ({ wave: 'pink', pitch: randomNumber(300, 900), wander: randomNumber(6, 12), wanderSpeed: randomNumber(0.3, 1), lowPass: randomNumber(45, 65), resonance: randomNumber(40, 75), tremolo: randomNumber(20, 45), tremoloSpeed: randomNumber(0.2, 0.5), attack: 0, sustain: randomNumber(3000, 4500), decay: 0, volume: 70, range: 20 }) },
    Rain: { tip: 'Pattering rain that loops', make: () => ({ wave: randomPick(['noise', 'pink']), pitch: randomNumber(1500, 3500), crackle: randomNumber(150, 400), crackleLength: randomNumber(3, 8), highPass: randomNumber(25, 45), lowPass: sometimes(randomNumber(70, 90)), attack: 0, sustain: 3000, decay: 0, volume: 75, range: 16 }) },
    Fire: { tip: 'A crackling fire that loops', make: () => ({ wave: 'pink', pitch: randomNumber(200, 600), crackle: randomNumber(30, 90), crackleLength: randomNumber(15, 45), lowPass: randomNumber(55, 80), attack: 0, sustain: 3000, decay: 0, volume: 90, range: 6 }) },
    Thunder: { tip: 'A rumbling crack of thunder', make: () => ({ wave: 'pink', pitch: randomNumber(60, 180), crackle: randomNumber(15, 40), crackleLength: randomNumber(80, 200), attack: randomNumber(0, 30), sustain: randomNumber(300, 800), punch: randomNumber(30, 60), decay: randomNumber(1500, 3000), lowPass: randomNumber(35, 55), echo: sometimes(randomNumber(150, 300)), echoFeedback: randomNumber(30, 50), volume: 90, range: 40 }) },
    Stream: { tip: 'Babbling water that loops', make: () => ({ wave: 'pink', pitch: randomNumber(700, 1600), crackle: randomNumber(80, 200), crackleLength: randomNumber(15, 40), wander: randomNumber(2, 5), wanderSpeed: randomNumber(2, 6), lowPass: randomNumber(55, 75), highPass: randomNumber(15, 30), attack: 0, sustain: 3000, decay: 0, volume: 95, range: 10 }) },
    Bubbles: { tip: 'Little rising bloops', make: () => ({ wave: 'sine', pitch: randomNumber(250, 600), slide: randomNumber(60, 140), attack: 0, sustain: randomNumber(20, 40), decay: randomNumber(20, 50), repeats: randomPick([3, 4, 6, 8]), gap: randomNumber(30, 160), wander: sometimes(randomNumber(2, 5)), wanderSpeed: randomNumber(3, 8), lowPass: sometimes(randomNumber(60, 85)), volume: 50 }) },
  },
  Things: {
    Engine: { tip: 'A rumbling engine that loops', make: () => ({ wave: randomPick(['sawtooth', 'square']), pitch: randomNumber(35, 70), tremolo: randomNumber(30, 60), tremoloSpeed: randomNumber(12, 30), wander: randomNumber(0.3, 1), wanderSpeed: randomNumber(3, 8), lowPass: randomNumber(35, 55), resonance: randomNumber(10, 30), crush: sometimes(randomNumber(10, 30)), attack: 0, sustain: 2000, decay: 0, volume: 75, range: 12 }) },
    Motor: { tip: 'A whirring electric motor that loops', make: () => ({ wave: randomPick(['sawtooth', 'square', 'metal']), pitch: randomNumber(120, 300), fm: sometimes(randomNumber(5, 20)), fmRatio: randomPick([0.5, 1, 2]), wander: randomNumber(0.2, 0.6), wanderSpeed: randomNumber(300, 600), tremolo: randomNumber(5, 15), tremoloSpeed: randomNumber(30, 60), highPass: randomNumber(10, 25), lowPass: randomNumber(60, 85), attack: 0, sustain: 2000, decay: 0, volume: 50 }) },
    Firecracker: { tip: 'A string of bangs and pops', make: () => ({ wave: randomPick(['noise', 'bitnoise']), pitch: randomNumber(900, 2500), crackle: randomNumber(6, 20), crackleLength: randomNumber(15, 40), punch: randomNumber(30, 60), attack: 0, sustain: randomNumber(600, 1500), decay: randomNumber(200, 400), echo: sometimes(randomNumber(60, 150)), echoFeedback: randomNumber(20, 40), volume: 85, range: 20 }) },
    Footsteps: { tip: 'A few steps. Crackle makes them crunch like gravel', make: () => ({ wave: randomPick(['noise', 'pink']), pitch: randomNumber(150, 500), attack: 0, sustain: randomNumber(5, 15), decay: randomNumber(60, 120), lowPass: randomNumber(35, 55), crackle: sometimes(randomNumber(150, 300)), crackleLength: randomNumber(4, 8), repeats: randomPick([2, 3, 4]), gap: randomNumber(250, 380), volume: 100, range: 6 }) },
    Clock: { tip: 'Tick, tock', make: () => ({ wave: randomPick(['metal', 'bitnoise', 'sine']), pitch: randomNumber(1500, 4000), attack: 0, sustain: randomNumber(0, 5), decay: randomNumber(15, 35), highPass: randomNumber(30, 60), repeats: 2, gap: randomNumber(450, 520), volume: 70, range: 5 }) },
    Creak: { tip: 'A creaky door or floorboard', make: () => ({ wave: randomPick(['sawtooth', 'metal']), pitch: randomNumber(40, 110), slide: randomNumber(-5, 5), wander: randomNumber(1, 4), wanderSpeed: randomNumber(2, 6), lowPass: randomNumber(40, 60), resonance: randomNumber(60, 85), highPass: randomNumber(10, 25), attack: randomNumber(50, 150), sustain: randomNumber(400, 900), decay: randomNumber(100, 200) }) },
    Siren: { tip: 'A wailing siren that loops', make: () => ({ wave: randomPick(['sine', 'square', 'triangle']), pitch: randomNumber(500, 800), vibrato: randomNumber(3, 6), vibratoSpeed: randomNumber(0.5, 2), pulseWidth: randomNumber(30, 50), attack: 0, sustain: 2000, decay: 0, volume: 50, range: 25 }) },
    Alarm: { tip: 'Beep beep beep', make: () => ({ wave: randomPick(['square', 'tan', 'sawtooth']), pitch: randomNumber(800, 1600), jump: sometimes(-randomPick([5, 7, 12])), jumpAt: randomNumber(50, 80), attack: 0, sustain: randomNumber(80, 150), decay: randomNumber(10, 30), repeats: randomPick([3, 4, 5]), gap: randomNumber(60, 120), volume: 45, range: 15 }) },
    Heartbeat: { tip: 'Lub-dub', make: () => ({ wave: 'sine', pitch: randomNumber(45, 65), slide: -randomNumber(5, 15), attack: 0, sustain: randomNumber(10, 20), punch: randomNumber(50, 80), decay: randomNumber(80, 140), repeats: 2, gap: randomNumber(90, 140), lowPass: randomNumber(30, 50), volume: 90, range: 4 }) },
    Whoosh: { tip: 'A swing or something flying past', make: () => ({ wave: 'pink', pitch: randomNumber(300, 900), slide: eitherWay(randomNumber(15, 40)), attack: randomNumber(100, 250), sustain: randomNumber(0, 50), decay: randomNumber(150, 300), lowPass: randomNumber(45, 65), resonance: randomNumber(30, 60), lowPassSweep: randomNumber(30, 80), volume: 90 }) },
    Computer: { tip: 'Busy computer bleeps', make: () => {
      const at = randomNumber(20, 50);
      return { wave: randomPick(['square', 'sine', 'triangle']), pitch: randomNumber(600, 1600), jump: eitherWay(randomPick([5, 7, 12])), jumpAt: at, jump2: eitherWay(randomPick([3, 5, 7])), jump2At: at * 2, jumpRepeat: at * 3, attack: 0, sustain: randomNumber(300, 700), decay: randomNumber(20, 60), repeats: randomPick([1, 2, 3]), gap: randomNumber(60, 150), volume: 40 };
    } },
    Splash: { tip: 'Something dropping into water', make: () => ({ wave: 'noise', pitch: randomNumber(1000, 2500), attack: 0, punch: randomNumber(40, 70), sustain: randomNumber(30, 80), decay: randomNumber(250, 500), crackle: randomNumber(150, 300), crackleLength: randomNumber(10, 25), lowPass: randomNumber(70, 90), lowPassSweep: -randomNumber(40, 80), volume: 90 }) },
  },
  // voices are for talking (an npc's voice in npcs.js), so they're one short syllable
  Voices: {
    Man: { tip: 'A grown man\'s voice', make: () => voiceSettings({ pitch: randomNumber(95, 135), mouth: randomNumber(98, 110), breath: randomNumber(5, 15), expression: randomNumber(2, 3.5), talkSpeed: randomNumber(38, 48) }) },
    Woman: { tip: 'A grown woman\'s voice', make: () => voiceSettings({ pitch: randomNumber(185, 240), mouth: randomNumber(82, 90), breath: randomNumber(12, 25), expression: randomNumber(3, 4.5), talkSpeed: randomNumber(42, 50) }) },
    'Old man': { tip: 'Slow, breathy and a bit shaky', make: () => voiceSettings({ pitch: randomNumber(95, 125), mouth: randomNumber(100, 112), breath: randomNumber(25, 40), vibrato: randomNumber(0.3, 0.6), vibratoSpeed: randomNumber(5, 7), wander: randomNumber(0.4, 0.9), wanderSpeed: randomNumber(200, 400), expression: randomNumber(2, 3), talkSpeed: randomNumber(26, 34) }) },
    'Old woman': { tip: 'Slow, breathy and wavering', make: () => voiceSettings({ pitch: randomNumber(165, 210), mouth: randomNumber(84, 90), breath: randomNumber(30, 45), vibrato: randomNumber(0.4, 0.8), vibratoSpeed: randomNumber(5.5, 7), wander: randomNumber(0.3, 0.7), wanderSpeed: randomNumber(200, 400), expression: randomNumber(3, 4), talkSpeed: randomNumber(28, 36) }) },
    Teen: { tip: 'A young, quick voice', make: () => voiceSettings({ pitch: randomNumber(140, 200), mouth: randomNumber(88, 96), breath: randomNumber(10, 20), expression: randomNumber(3.5, 5), talkSpeed: randomNumber(50, 60) }) },
    Child: { tip: 'A small, bright, lively voice', make: () => voiceSettings({ pitch: randomNumber(260, 340), mouth: randomNumber(66, 74), breath: randomNumber(8, 15), expression: randomNumber(4.5, 6.5), talkSpeed: randomNumber(48, 56) }) },
    Baby: { tip: 'Babbling goo-goo noises', make: () => voiceSettings({ pitch: randomNumber(360, 460), mouth: randomNumber(52, 60), breath: randomNumber(10, 20), vowelSlide: eitherWay(randomNumber(1, 3)), expression: randomNumber(6, 9), talkSpeed: randomNumber(26, 34), attack: randomNumber(20, 30) }) },
    Gruff: { tip: 'Deep and gravelly', make: () => voiceSettings({ pitch: randomNumber(70, 95), mouth: randomNumber(112, 125), breath: randomNumber(15, 25), wander: randomNumber(1, 2), wanderSpeed: randomNumber(350, 700), crush: sometimes(randomNumber(5, 15)), expression: randomNumber(1.5, 2.5), talkSpeed: randomNumber(34, 40) }) },
    Innocent: { tip: 'Soft, gentle and sweet', make: () => voiceSettings({ pitch: randomNumber(240, 300), mouth: randomNumber(76, 84), breath: randomNumber(25, 40), expression: randomNumber(4, 5.5), talkSpeed: randomNumber(38, 44), attack: randomNumber(15, 25) }) },
    Alien: { tip: 'Something not from around here. Every press is very different', make: () => voiceSettings({ pitch: randomNumber(150, 600), mouth: randomNumber(45, 150), fm: randomNumber(15, 45), fmRatio: randomNumber(0.5, 3.5), vibrato: randomNumber(0.5, 3), vibratoSpeed: randomNumber(6, 18), vowelSlide: eitherWay(randomNumber(2, 6)), expression: randomNumber(6, 10), talkSpeed: randomNumber(35, 60) }) },
    Robot: { tip: 'A flat, crunchy machine voice', make: () => voiceSettings({ pitch: randomNumber(90, 160), mouth: randomNumber(95, 110), breath: 0, crush: randomNumber(35, 60), flanger: sometimes(randomNumber(0.5, 2)), expression: randomNumber(0, 0.5), talkSpeed: randomNumber(36, 44) }) },
    Monster: { tip: 'A huge growling beast', make: () => voiceSettings({ pitch: randomNumber(45, 70), mouth: randomNumber(135, 160), breath: randomNumber(25, 40), wander: randomNumber(1.5, 3), wanderSpeed: randomNumber(150, 400), crush: sometimes(randomNumber(10, 25)), lowPass: randomNumber(55, 75), expression: randomNumber(2, 3), talkSpeed: randomNumber(26, 34), volume: 80 }) },
    Ghost: { tip: 'A whispery, echoing spirit', make: () => voiceSettings({ pitch: randomNumber(220, 380), mouth: randomNumber(80, 95), breath: randomNumber(75, 95), vibrato: randomNumber(0.5, 1.5), vibratoSpeed: randomNumber(4, 6), flanger: randomNumber(2, 5), echo: randomNumber(150, 250), echoFeedback: randomNumber(30, 45), expression: randomNumber(4, 6), talkSpeed: randomNumber(28, 36), attack: randomNumber(25, 40), decay: randomNumber(80, 120), volume: 85 }) },
  },
};

// what a New voice starts as: a plain man's voice, so there's something to hear straight away
const NEW_VOICE = { kind: 'voice', wave: 'voice', pitch: 120, attack: 10, sustain: 60, decay: 50 };

const SoundEditor = {
  active: false,
  // the sound being changed. a copy, so nothing changes in the game until Save
  draft: null,
  // its name when the editor opened, '' for a new sound
  original: '',
  // (name) => {} run after it's saved, or null. an npc's New voice uses it to take the new voice
  onSave: null,
  // the draft as text when it opened, for Cancel to tell if anything's changed
  openedAs: '',
  // ui elements kept to change later: the text boxes (and which has the typing), each setting's
  // slider by key, buttons, and the tab buttons by name
  nameField: null,
  sayField: null,
  typingInto: null,
  sliders: {},
  loopButton: null,
  saveButton: null,
  undoButton: null,
  chooseFileButton: null,
  tabButtons: {},
  // the open tab of sliders (a SOUND_EDITOR.tabs name) and kind of make one buttons. they stay the
  // same between openings
  tab: 'Pitch',
  makers: 'Game',
  // section headings to draw, { text, x, y, tab }, and where each tab's hint goes
  headings: [],
  hintTop: {},
  // earlier drafts for Undo, and the draft as text when it last went in (update())
  history: [],
  settled: '',
  // Cancel was pressed once with changes, so the next one closes
  cancelling: false,
  // audio Files chosen since the page loaded, by file name. Export downloads these too, since the game
  // only loads audio from its own folder
  newFiles: {},
  // the draft as text and the pitch the last time it started playing, so Loop knows to start it again
  // when something changes, and when that was (millis())
  playedAs: null,
  playedPitch: null,
  playedAt: 0,

  // opens it on a sound or voice by name, or a new one of a kind (SOUND_KINDS) with no name. a new
  // sound starts as the normal settings (a plain square beep), a new voice as a plain man's voice.
  // onSave(name) runs after it's saved. it stops every sound first, so nothing from the game plays
  // over it, and voices open on the Voice tab and Voices buttons
  open(name = null, kind = 'sound', onSave = null) {
    this.active = true;
    this.original = name ?? '';
    this.onSave = onSave;
    this.draft = soundSettings(name ? findSound(name) : kind === 'voice' ? NEW_VOICE : { kind });
    if (this.draft.kind === 'voice') {
      this.tab = 'Voice';
      this.makers = 'Voices';
    }
    this.openedAs = JSON.stringify(this.draft);
    this.settled = this.openedAs;
    this.history = [];
    this.cancelling = false;
    this.headings = [];
    this.sliders = {};
    this.tabButtons = {};
    // keys go into the text boxes (input.js)
    Input.typing = true;
    Sound.stopAll();

    const L = SOUND_EDITOR;
    const add = (element) => UI.add(Object.assign(element, { group: 'sound-editor' }));
    add(new SoundEditorPanel({ x: 0, y: 0, w: GAME_W, h: GAME_H }));

    // the top: name, Undo, Cancel and Save
    this.nameField = add(new TextField({ x: 170, y: 6, w: 160, h: 24, value: name ?? '' }));
    this.typeInto(this.nameField);
    this.undoButton = add(new Button({ x: GAME_W - 280, y: 6, w: 80, h: 24, label: 'Undo', style: 'editor', onClick: () => this.undo() }));
    add(new Button({ x: GAME_W - 194, y: 6, w: 80, h: 24, label: 'Cancel', style: 'editor', onClick: () => this.cancel() }));
    this.saveButton = add(new Button({ x: GAME_W - 108, y: 6, w: 92, h: 24, label: 'Save', style: 'editorPrimary', onClick: () => this.save() }));
    // Sound or Voice: which library it goes in when it's saved
    Object.entries(SOUND_KINDS).forEach(([kind, label], i) => add(Object.assign(new EditorButton({
      x: 340 + i * 64, y: 6, w: 60, h: 24, label,
      isOn: () => this.draft.kind === kind,
      onClick: () => this.changeKind(kind),
    }), { tip: kind === 'voice'
      ? 'Voice: for npcs to talk with. Voices are in the map editor\'s Voices tab, and only voices can be given to npcs'
      : 'Sound: for sound blocks and anything else that plays a sound. Sounds are in the map editor\'s Sounds tab' })));

    // the left: visualiser, Play / Stop / Loop, piano, make one buttons
    const x = L.left;
    add(new SoundVisualiser({ x, y: L.visualiserTop, w: L.leftWidth, h: L.visualiserHeight, sound: () => this.draft }));
    add(new Button({ x, y: L.playTop, w: 100, h: 24, label: '▶  Play', style: 'editorPrimary', onClick: () => this.play() }));
    add(new Button({
      x: x + 104, y: L.playTop, w: 92, h: 24, label: '■  Stop', style: 'editor',
      onClick: () => {
        this.loopButton.on = false;
        Sound.stopPreview();
      },
    }));
    // turning Loop on plays it looping (at the last piano note, if one was pressed), turning it off
    // stops it. while it's on, update() restarts it whenever the draft changes
    this.loopButton = add(new Button({
      x: x + 200, y: L.playTop, w: 100, h: 24, label: '↻  Loop', style: 'editor', toggle: true,
      onClick: (button) => (button.on ? this.play(this.playedPitch) : Sound.stopPreview()),
    }));
    add(new SoundPiano({ x, y: L.pianoTop, w: L.leftWidth, h: L.pianoHeight, onPlay: (note) => this.play(noteFrequency(note)) }));
    // a tab for each kind of make one button, then that kind's buttons in rows of 3 (they're all made
    // now and the tabs show one kind at a time), then Random and Mutate (not in SOUND_GENERATORS since
    // they work differently, see randomSettings() and mutate())
    const kinds = Object.keys(SOUND_GENERATORS);
    const kindW = (L.leftWidth - (kinds.length - 1) * 4) / kinds.length;
    kinds.forEach((kind, i) => add(Object.assign(new EditorButton({
      x: x + i * (kindW + 4), y: L.makersTop + 14, w: kindW, h: 22, label: kind,
      isOn: () => this.makers === kind,
      onClick: () => this.showMakers(kind),
    }), { tip: `${kind}: show the ${kind.toLowerCase()} buttons` })));
    const buttonsTop = L.makersTop + 42;
    for (const kind of kinds) {
      Object.entries(SOUND_GENERATORS[kind]).forEach(([label, generator], i) => add(Object.assign(new Button({
        x: x + (i % 3) * 102, y: buttonsTop + Math.floor(i / 3) * 26, w: 96, h: 22, label, style: 'editor',
        onClick: () => this.generate(kind, label),
      }), { makers: kind, tip: `${label}: ${generator.tip}. Press it again for another one` })));
    }
    const lastRow = GAME_H - L.footerHeight - 34;
    add(Object.assign(new Button({ x, y: lastRow, w: 148, h: 24, label: 'Random', style: 'editorPrimary', onClick: () => this.replace(this.randomSettings()) }),
      { tip: 'Random: anything at all, from any wave. A lot of it is noise, press it again' }));
    add(Object.assign(new Button({ x: x + 152, y: lastRow, w: 148, h: 24, label: 'Mutate', style: 'editorPrimary', onClick: () => this.mutate() }),
      { tip: 'Mutate: nudges the settings that are on a little bit, for a sound that\'s similar but different' }));

    // the right: a button for each wave (and Choose file, only shown for files), then the tabs, then
    // the sliders
    const waves = Object.keys(SOUND_WAVES);
    const waveW = (L.columnWidth * 2 + L.columnGap - (L.waveColumns - 1) * 4) / L.waveColumns;
    waves.forEach((wave, i) => add(Object.assign(new EditorButton({
      x: L.right + (i % L.waveColumns) * (waveW + 4), y: L.wavesTop + Math.floor(i / L.waveColumns) * 26, w: waveW, h: 22, label: SOUND_WAVES[wave].label,
      isOn: () => this.draft.wave === wave,
      // file asks for a file the first time, and goes back to the chosen one after that
      onClick: () => (wave === 'file' && !this.draft.file ? this.chooseFile() : this.change({ wave })),
    }), { tip: `${SOUND_WAVES[wave].label}: ${SOUND_WAVES[wave].tip}` })));
    this.chooseFileButton = add(new Button({ x: GAME_W - 16 - 110, y: L.wavesTop - 20, w: 110, h: 18, label: 'Choose file...', style: 'editor', onClick: () => this.chooseFile() }));
    const tabW = (L.columnWidth * 2 + L.columnGap - (L.tabs.length - 1) * 4) / L.tabs.length;
    L.tabs.forEach((tab, i) => {
      this.tabButtons[tab.name] = add(Object.assign(new EditorButton({
        x: L.right + i * (tabW + 4), y: L.tabsTop, w: tabW, h: 24, label: tab.name,
        isOn: () => this.tab === tab.name,
        onClick: () => this.showTab(tab.name),
      }), { tip: `${tab.name}: ${tab.hint}` }));
      // one slider for every setting in the tab's sections, under the section's heading, going down
      // each column. a setting whose section isn't in a tab doesn't get a slider at all
      let bottom = L.slidersTop;
      tab.columns.forEach((sections, c) => {
        const columnX = L.right + c * (L.columnWidth + L.columnGap);
        let y = L.slidersTop;
        for (const section of sections) {
          this.headings.push({ text: section, x: columnX, y, tab: tab.name });
          y += L.sectionHeight;
          for (const setting of SOUND_SETTINGS.filter((s) => s.section === section)) {
            // tip is shown by SoundEditorPanel while it's hovered
            this.sliders[setting.key] = add(Object.assign(new Slider({
              ...setting,
              x: columnX, y, w: L.columnWidth, h: L.rowHeight,
              value: this.draft[setting.key],
              format: (value) => this.formatSetting(setting, value),
              onChange: (value) => { this.draft[setting.key] = value; },
            }), { tip: `${setting.label}: ${setting.tip}`, tab: tab.name }));
            y += L.rowHeight;
          }
          y += 6;
        }
        bottom = Math.max(bottom, y);
      });
      this.hintTop[tab.name] = bottom + 4;
    });
    // the Voice tab's Say box, under its sliders: type something and press Say (or Enter) to hear it
    const sayTop = this.hintTop.Voice;
    this.sayField = add(Object.assign(new TextField({ x: L.right + 36, y: sayTop, w: L.columnWidth * 2 + L.columnGap - 36 - 96, h: 24, value: L.sayText, maxLength: 52, allowed: /^[^\x00-\x1f\x7f]$/ }),
      { tab: 'Voice', tip: 'Say: type something here, then press Say (or Enter) to hear this sound saying it' }));
    add(Object.assign(new Button({ x: GAME_W - 16 - 90, y: sayTop, w: 90, h: 24, label: '▶  Say', style: 'editorPrimary', onClick: () => this.speak() }),
      { tab: 'Voice', tip: 'Say: plays this sound saying the words in the box, the way an npc with it as their voice talks' }));
    this.hintTop.Voice = sayTop + 32;
    this.showTab(this.tab);
    this.showMakers(this.makers);
  },

  // shows one tab of sliders (a SOUND_EDITOR.tabs name), hiding the rest
  showTab(name) {
    this.tab = name;
    for (const element of UI.group('sound-editor')) if (element.tab) element.visible = element.tab === name;
  },

  // shows one kind of make one buttons (a SOUND_GENERATORS name)
  showMakers(kind) {
    this.makers = kind;
    for (const element of UI.group('sound-editor')) if (element.makers) element.visible = element.makers === kind;
  },

  // makes the draft a sound or a voice. a voice gets the Voice tab and Voices buttons out, since that's
  // what it'll want next
  changeKind(kind) {
    this.draft.kind = kind;
    if (kind === 'voice') {
      this.showTab('Voice');
      this.showMakers('Voices');
    }
  },

  // which text box the typing goes into
  typeInto(field) {
    this.nameField.blur();
    this.sayField?.blur();
    field.focus();
    this.typingInto = field;
  },

  // what a setting's slider shows on its right. pitch is special: a note name for waves, just Hz for
  // the noises (they don't have a note), and a speed for files (a file's pitch is how fast it plays,
  // 440 being normal speed). vowel shows the vowel
  formatSetting(setting, value) {
    if (setting.key === 'pitch') {
      if (this.draft.wave === 'file') return `${Math.round((value / 440) * 100)}% speed`;
      return SOUND_WAVES[this.draft.wave].shape || this.draft.wave === 'metal' ? `${value} Hz  ${noteName(value)}` : `${value} Hz`;
    }
    if (setting.key === 'vowel') return Number.isInteger(value) ? VOWEL_NAMES[value] : `${VOWEL_NAMES[Math.floor(value)]} to ${VOWEL_NAMES[Math.ceil(value)]}`;
    if (setting.off === value) return 'off';
    // log sliders go from tiny to huge, so big values lose their decimals (368.9 shows as 369)
    if (setting.curve === 'log') return `${Number(value.toPrecision(3))} ${setting.unit}`;
    return `${value} ${setting.unit}`;
  },

  // Cancel or Escape: closes without saving. with changes it asks first (along the bottom), and the
  // second press closes
  cancel() {
    if (JSON.stringify(this.draft) !== this.openedAs && !this.cancelling) {
      this.cancelling = true;
      return;
    }
    this.close();
  },

  // closes it (Save and Cancel call this). the draft is just dropped
  close() {
    this.active = false;
    Input.typing = false;
    Sound.stopPreview();
    UI.removeGroup('sound-editor');
  },

  // why it can't be saved (shown along the bottom, and Save is greyed out), or null
  problem() {
    const name = cleanMapName(this.nameField.value); // mapfile.js, sound names follow the same rules
    if (!name) return 'Type a name for it at the top';
    // sounds and voices share sounds.json, so a name can only be used once across both
    if (name !== this.original && findSound(name)) return `There's already a ${SOUND_KINDS[findSound(name).kind].toLowerCase()} called ${name}, pick another name`;
    if (this.draft.wave === 'file' && !this.draft.file) return 'Choose an audio file first';
    return null;
  },

  // puts the sound or voice in its library (straight into the game, so npcs using a voice talk with
  // the new version), picks it in the palette, and closes. it only lasts until the page reloads,
  // unless it's exported (exportSounds())
  save() {
    if (this.problem()) return;
    const name = cleanMapName(this.nameField.value);
    const onSave = this.onSave;
    setSound(name, this.draft);
    Editor.showTab(this.draft.kind);
    Editor.pick({ kind: this.draft.kind, name });
    showMessage(`Saved ${name}. Export in the inspector to keep it`);
    this.close();
    onSave?.(name);
  },

  // every frame while it's open, from Editor.update(). the ui elements (sliders, buttons, piano)
  // update themselves through UI, this only does the typing and the things that depend on the draft
  update() {
    // clicking a text box gives it the typing
    if (Input.buttonsPressed.has('left') && UI.hovered instanceof TextField) this.typeInto(UI.hovered);
    // Tab is ignored since there's nothing sensible to tab to
    for (const key of Input.typed) {
      if (key === 'Enter') return this.typingInto === this.sayField ? this.speak() : this.save();
      if (key === 'Escape') return this.cancel();
      if (key.paste !== undefined) this.typingInto.paste(key.paste);
      else if (key !== 'Tab') this.typingInto.type(key);
    }
    const d = this.draft;
    // a change goes in the history once the mouse is let go, so dragging a slider is one Undo
    const now = JSON.stringify(d);
    if (now !== this.settled && !Input.buttonsHeld.has('left')) {
      this.history.push(JSON.parse(this.settled));
      this.settled = now;
      this.cancelling = false;
    }
    // sliders that don't do anything with the other settings as they are get greyed out (they keep
    // their value, it just doesn't change the sound). a new setting that only matters sometimes needs
    // a line here
    const shaped = Boolean(SOUND_WAVES[d.wave].shape);
    const matters = {
      pulseWidth: d.wave === 'square',
      pulseSweep: d.wave === 'square',
      fm: shaped,
      fmRatio: shaped && d.fm > 0,
      resonance: d.lowPass < 100 || d.lowPassSweep !== 0,
      jumpAt: d.jump !== 0,
      jump2At: d.jump2 !== 0,
      jumpRepeat: d.jump !== 0 || d.jump2 !== 0,
      vibratoSpeed: d.vibrato > 0,
      wanderSpeed: d.wander > 0,
      gap: d.repeats > 1,
      tremoloSpeed: d.tremolo > 0,
      crackleLength: d.crackle > 0,
      echoFeedback: d.echo > 0,
      vowel: d.wave === 'voice',
      vowelSlide: d.wave === 'voice',
      mouth: d.wave === 'voice',
      breath: d.wave === 'voice',
    };
    for (const [key, slider] of Object.entries(this.sliders)) slider.enabled = matters[key] ?? true;
    // a dot on the tabs that have settings that aren't normal, so you can see where the sound is made
    for (const tab of SOUND_EDITOR.tabs) {
      const changed = SOUND_SETTINGS.some((s) => tab.columns.flat().includes(s.section) && d[s.key] !== s.normal);
      this.tabButtons[tab.name].label = changed ? `${tab.name}  •` : tab.name;
    }
    this.chooseFileButton.visible = d.wave === 'file';
    this.saveButton.enabled = this.problem() === null;
    this.undoButton.enabled = this.history.length > 0;
    // with Loop on, start it again when something changes (at most every 0.1s, since the sound has to
    // be worked out again each time)
    if (this.loopButton.on && now !== this.playedAs && millis() - this.playedAt > 100) this.play(this.playedPitch);
  },

  // plays the draft at full volume, at another pitch for the piano, looping if Loop is on. it
  // remembers what it played (playedAs, playedPitch) so update() can tell when to play it again
  play(pitch = null) {
    this.playedAs = JSON.stringify(this.draft);
    this.playedPitch = pitch;
    this.playedAt = millis();
    Sound.preview(this.draft, { loop: this.loopButton.on, pitch: pitch ?? this.draft.pitch });
  },

  // plays the draft saying the Say box's words (renderSpeech() in sound.js). it turns Loop off,
  // since talking doesn't loop
  speak() {
    this.loopButton.on = false;
    this.playedAs = JSON.stringify(this.draft);
    Sound.preview(this.draft, { say: this.sayField.value });
  },

  // swaps in new settings, moving every slider to match, and plays it (or says the Say box, for
  // talk). every big change goes through here, so this is the place to hook anything that should
  // happen on one. it plays at the draft's own pitch, so it forgets a piano note the loop was playing
  // at. picking the voice wave opens the Voice tab. it stays a sound or a voice (only the Sound and
  // Voice buttons change that)
  replace(settings, talk = false) {
    const wasVoice = this.draft.wave === 'voice';
    this.draft = soundSettings({ ...settings, kind: this.draft.kind });
    this.syncSliders();
    if (this.draft.wave === 'voice' && !wasVoice) this.showTab('Voice');
    if (talk) this.speak();
    else this.play();
  },

  // moves every slider to the draft's value. the sliders round to their step, so the draft gets their
  // rounded values back
  syncSliders() {
    for (const [key, slider] of Object.entries(this.sliders)) {
      slider.set(this.draft[key]);
      this.draft[key] = slider.value;
    }
  },

  // changes some settings, keeping the rest
  change(settings) {
    this.replace({ ...this.draft, ...settings });
  },

  // a random sound from a make one button. heard from stays the same unless the generator says,
  // since that's about where it goes rather than how it sounds. voices (the Voices buttons, or
  // anything while it's a voice) say the Say box
  generate(kind, name) {
    const settings = SOUND_GENERATORS[kind][name].make();
    this.replace({ range: this.draft.range, ...settings }, kind === 'Voices' || this.draft.kind === 'voice');
  },

  // Random: a completely random sound. a random wave, and about a third of the settings moved
  // somewhere random. the volume shape is kept short enough to hear what it is. it picks a random spot
  // along each slider (using the slider's curve, borrowed from Slider without making one), so it
  // spreads like the sliders do. it's meant to be wild, a lot of what it makes is noise, press it again
  randomSettings() {
    const settings = { wave: randomPick(Object.keys(SOUND_WAVES).filter((wave) => wave !== 'file')), range: this.draft.range };
    for (const setting of SOUND_SETTINGS) {
      if (['volume', 'range', 'repeats', 'gap', 'talkSpeed', 'expression'].includes(setting.key) || randomBetween(0, 1) < 0.65) continue;
      settings[setting.key] = Slider.prototype.valueAt.call(setting, randomBetween(0, 1));
    }
    settings.attack = Math.min(settings.attack ?? 5, 300);
    settings.sustain = randomNumber(30, 400);
    settings.decay = Math.min(settings.decay ?? 100, 800);
    return settings;
  },

  // Mutate: nudges about half the settings that are doing something a little bit along their sliders
  // (up to 6% either way), for a sound that's similar but different. ones that are off stay off, so it
  // doesn't suddenly get an echo. the wave and heard from never change
  mutate() {
    const settings = { ...this.draft };
    for (const setting of SOUND_SETTINGS) {
      if (setting.key === 'range' || settings[setting.key] === setting.off || randomBetween(0, 1) < 0.5) continue;
      const slider = this.sliders[setting.key];
      settings[setting.key] = slider.valueAt(Math.min(1, Math.max(0, slider.positionOf(settings[setting.key]) + randomBetween(-0.06, 0.06))));
    }
    this.replace(settings);
  },

  // goes back to the draft before the last change (update() keeps the history)
  undo() {
    if (this.history.length === 0) return;
    this.draft = this.history.pop();
    this.settled = JSON.stringify(this.draft);
    this.syncSliders();
    this.play();
  },

  // lets you pick an audio file (pickFile() in utils.js) and uses it as the wave, held for as long as
  // the file is. everything else goes back to normal so it starts off sounding just like the file.
  // it's decoded straight away and put in SOUND_FILES (marked as asked, so loadAudioFile() won't try
  // to fetch it from the folder, where it isn't yet). the File is kept in newFiles for Export.
  // files over 5 s are cut to the first 5 s, since that's the longest hold can be
  chooseFile() {
    pickFile('audio/*,.mp3,.wav,.ogg', (file) => {
      file.arrayBuffer()
        .then(decodeAudio) // sound.js
        .then((decoded) => {
          SOUND_FILES[file.name] = decoded;
          audioFilesAsked.add(file.name);
          this.newFiles[file.name] = file;
          this.replace({ wave: 'file', file: file.name, attack: 0, sustain: Math.round(decoded.seconds * 1000), decay: 0, volume: this.draft.volume, range: this.draft.range });
          if (decoded.seconds * 1000 > SOUND_SETTINGS.find((s) => s.key === 'sustain').max) showMessage(`${file.name} is long, only the start of it is used`);
        })
        .catch(() => showMessage(`Couldn't open ${file.name} as audio`));
    });
  },

  // downloads sounds.json (sound.js) and any audio file chosen since the page loaded that a sound
  // uses, then says where they go (the download helpers are in utils.js). the inspector's Export
  // button on the Sounds tab. the browser might ask whether the page can download several files at
  // once the first time. files that were already in sounds/files/ aren't downloaded again
  exportSounds() {
    downloadTextFile('sounds.json', soundsToText());
    const files = [...new Set([...Object.values(SOUNDS), ...Object.values(VOICES)].map((sound) => sound.file))].filter((name) => this.newFiles[name]);
    for (const name of files) downloadData(name, this.newFiles[name]);
    const also = files.length > 0 ? `, and ${files.join(', ')} in sounds/files/` : '';
    showMessage(`Exported! Put sounds.json in assets/squimble-quest/sounds/${also}`);
  },
};

// the background of the whole sound editor, its headings and labels, and the tip line along the
// bottom. covers the whole screen, so nothing behind it can be clicked
class SoundEditorPanel extends UIElement {
  draw() {
    const L = SOUND_EDITOR;
    const C = EDITOR_COLOURS;
    const editor = SoundEditor;
    noStroke();
    fill(C.bar);
    rect(0, 0, GAME_W, GAME_H);
    fill(C.header);
    rect(0, 0, GAME_W, L.headerHeight);
    rect(0, GAME_H - L.footerHeight, GAME_W, L.footerHeight);
    fill(C.edge);
    rect(0, L.headerHeight, GAME_W, 1);
    rect(0, GAME_H - L.footerHeight, GAME_W, 1);
    // a line between the left and the right
    rect(L.right - 10, L.headerHeight + 8, 1, GAME_H - L.headerHeight - L.footerHeight - 16);

    fill(C.text);
    setText(14, BOLD, LEFT, CENTER);
    text(`${SOUND_KINDS[editor.draft.kind]} editor`, 16, L.headerHeight / 2);
    fill(C.dimText);
    setText(12, BOLD, LEFT, CENTER);
    text('Name', 130, L.headerHeight / 2);
    // the name it'll really be saved as, if tidying it changes it
    const typed = editor.nameField.value;
    const name = cleanMapName(typed);
    if (name && name !== typed) {
      setText(11, BOLD, LEFT, CENTER);
      text(`saves as ${name}`, 474, L.headerHeight / 2);
    }

    // headings
    setText(11, BOLD, LEFT, TOP);
    fill(C.dimText);
    text('WAVE', L.right, L.wavesTop - 16);
    text('MAKE ONE  (a random sound of that kind)', L.left, L.makersTop);
    for (const heading of editor.headings) {
      if (heading.tab !== editor.tab) continue;
      const words = heading.text.toUpperCase();
      fill(C.dimText);
      text(words, heading.x, heading.y + 4);
      fill(C.edge);
      rect(heading.x + textWidth(words) + 8, heading.y + 10, L.columnWidth - textWidth(words) - 8, 1);
    }
    // which file a file sound uses
    const draft = editor.draft;
    if (draft.wave === 'file') {
      fill(SOUND_COLOURS.edge);
      setText(11, BOLD, RIGHT, TOP);
      text(draft.file ? `${draft.file}${SOUND_FILES[draft.file] ? '' : ' (not loaded)'}` : 'no file chosen', GAME_W - 16 - 118, L.wavesTop - 16);
    }
    // the open tab's help, and the Say box's label
    const tab = L.tabs.find((t) => t.name === editor.tab);
    setText(11, NORMAL, LEFT, TOP);
    fill(C.dimText);
    text(tab.hint, L.right, editor.hintTop[tab.name], L.columnWidth * 2 + L.columnGap, 60);
    if (tab.name === 'Voice') {
      setText(12, BOLD, LEFT, CENTER);
      text('Say', L.right, editor.sayField.y + editor.sayField.h / 2);
    }

    // along the bottom: Cancel asking, then the tip for whatever's under the mouse, then what's
    // stopping it saving in red, else how to use it
    const tip = UI.hovered?.visible && UI.hovered.tip;
    const problem = editor.problem();
    setText(11, BOLD, LEFT, CENTER);
    let line = 'Hover over anything to see what it does. Right click a slider to put it back to normal, or scroll over it to nudge it';
    fill(C.dimText);
    if (editor.cancelling) {
      fill(C.erase);
      line = 'This sound has changes. Press Cancel (or Escape) again to throw them away, or Save to keep them';
    } else if (tip) {
      line = tip;
    } else if (problem) {
      fill(C.erase);
      line = problem;
    }
    // in a box, so a long tip wraps onto a second line
    text(line, 16, GAME_H - L.footerHeight, GAME_W - 32, L.footerHeight);
  }
}

// the picture of the sound being edited, read every frame so it changes as you go, in two panels:
//   wave         a close-up of a few waves from just after it gets loud, from the real audio, so
//                filters and crunch show too. more waves for a higher pitch, taller when louder
//   whole sound  the whole thing from start to end (drawSoundShape() in sound.js), with a line moving
//                along it while it plays. while it's saying something (Say), it shows that instead
//                (only while it's saying it, since talking is slow to work out again on every change)
// and its note, pitch and length underneath.
//   sound  () => the settings to draw
class SoundVisualiser extends UIElement {
  constructor(options) {
    // just for show, clicks go through to what's behind
    super({ ...options, interactive: false });
    this.sound = options.sound;
  }

  draw() {
    const sound = this.sound();
    const preview = Sound.previewing;
    const say = preview && (millis() - preview.started) / 1000 < preview.seconds ? preview.say : null;
    const { samples } = Sound.render(sound);
    const { seconds } = Sound.render(sound, false, sound.pitch, say);
    const { x, w } = this;
    // two panels with a gap, and room for the words at the bottom
    const h = (this.h - 22 - 6) / 2;
    const closeUpY = this.y;
    const wholeY = this.y + h + 6;
    for (const [top, label] of [[closeUpY, 'wave'], [wholeY, say === null ? 'whole sound' : 'talking']]) {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(x, top, w, h);
      // the middle line, where it's silent
      fill(EDITOR_COLOURS.edge);
      rect(x, top + h / 2, w, 1);
      fill(EDITOR_COLOURS.dimText);
      setText(9, BOLD, LEFT, TOP);
      text(label, x + 4, top + 3);
    }

    // the close-up: some waves (or a hundredth of a second of noise or a file) from just after it gets
    // loud. it starts at the end of the fade in plus a little into the hold, so a bell (no hold) is
    // shown right at its loudest. it picks one sample per pixel rather than averaging, so a very high
    // pitch can look a bit uneven, which is fine for a picture
    const startSeconds = sound.attack / 1000 + Math.min(sound.sustain / 2000, 0.05);
    const start = Math.min(samples.length - 1, Math.floor(startSeconds * SOUND_RATE));
    const spanSeconds = SOUND_WAVES[sound.wave].shape || sound.wave === 'metal' ? closeUpCycles(sound.pitch) / sound.pitch : 0.01;
    const span = Math.max(8, Math.round(spanSeconds * SOUND_RATE));
    const inner = w - 8;
    const middle = closeUpY + h / 2 + 4;
    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i <= inner; i++) vertex(x + 4 + i, middle - (samples[start + Math.floor((i / inner) * span)] ?? 0) * (h / 2 - 8));
    endShape();

    // the whole sound
    strokeWeight(1);
    drawSoundShape(sound, x + 4, wholeY + 12, inner, h - 16, say);

    // the moving line while it plays (it goes round and round while looping). it goes by millis(),
    // not the audio clock, so it can be a few ms out, and while playing a piano note it moves at that
    // note's length over this picture of the normal pitch (which is the same length unless looping)
    if (preview) {
      const played = (millis() - preview.started) / 1000;
      if (preview.loop || played < preview.seconds) {
        const along = (played % preview.seconds) / preview.seconds;
        stroke(255);
        line(x + 4 + along * inner, wholeY, x + 4 + along * inner, wholeY + h);
      }
    }

    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, CENTER);
    let pitch = `${noteName(sound.pitch)}  ·  ${sound.pitch} Hz`;
    if (sound.wave === 'file') pitch = `${Math.round((sound.pitch / 440) * 100)}% speed`;
    else if (!SOUND_WAVES[sound.wave].shape && sound.wave !== 'metal') pitch = `${sound.pitch} Hz`;
    text(`${pitch}  ·  ${Math.round(seconds * 1000)} ms`, x + w / 2, this.y + this.h - 10);
  }
}

// a little piano that plays the sound at each note (onPlay(note), note numbers like noteFrequency()
// in sound.js). everything that's in notes (slide, jump, vibrato) moves with it, and for a file it
// changes the speed. it's two octaves from SOUND_EDITOR.pianoFrom, and works on any number of white
// keys, so making it longer is just whiteKeys
class SoundPiano extends UIElement {
  constructor(options) {
    super(options);
    this.onPlay = options.onPlay;
    // the note being held down, or null
    this.held = null;
    this.tip = 'Piano: plays the sound at that note. Slides, jumps and vibrato all move with it';
    // every key as { note, x, y, w, h, black }, black keys first since they sit on top
    const whiteW = this.w / SOUND_EDITOR.whiteKeys;
    const whites = [];
    const blacks = [];
    // how many notes up from C each white key is, and which have a black key just after them
    const steps = [0, 2, 4, 5, 7, 9, 11];
    for (let k = 0; k < SOUND_EDITOR.whiteKeys; k++) {
      const note = SOUND_EDITOR.pianoFrom + 12 * Math.floor(k / 7) + steps[k % 7];
      whites.push({ note, x: this.x + k * whiteW, y: this.y, w: whiteW, h: this.h, black: false });
      if (k < SOUND_EDITOR.whiteKeys - 1 && ![4, 11].includes(steps[k % 7])) {
        blacks.push({ note: note + 1, x: this.x + (k + 1) * whiteW - whiteW * 0.3, y: this.y, w: whiteW * 0.6, h: this.h * 0.6, black: true });
      }
    }
    this.keys = [...blacks, ...whites];
  }

  keyAt(px, py) {
    return this.keys.find((key) => px >= key.x && px < key.x + key.w && py >= key.y && py < key.y + key.h) ?? null;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!Input.buttonsHeld.has('left')) this.held = null;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const key = this.keyAt(Input.mouse.x, Input.mouse.y);
    if (!key) return;
    this.held = key.note;
    this.onPlay(key.note);
  }

  draw() {
    const under = this.hovered ? this.keyAt(Input.mouse.x, Input.mouse.y) : null;
    stroke(EDITOR_COLOURS.header);
    strokeWeight(1);
    // whites then blacks, so the black keys are on top
    for (const key of [...this.keys].reverse()) {
      const lit = key.note === this.held;
      fill(lit ? EDITOR_COLOURS.accent : key.black ? (key === under ? 70 : 30) : key === under ? 210 : 235);
      rect(key.x, key.y, key.w, key.h, 0, 0, 3, 3);
      // C keys are labelled, so you can tell which octave is which
      if (!key.black && (key.note - SOUND_EDITOR.pianoFrom) % 12 === 0) {
        noStroke();
        fill(lit ? 255 : 120);
        setText(9, BOLD, CENTER, BOTTOM);
        text(noteName(noteFrequency(key.note)), key.x + key.w / 2, key.y + key.h - 3);
        stroke(EDITOR_COLOURS.header);
      }
    }
  }
}
