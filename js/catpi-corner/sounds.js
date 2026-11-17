// catpi corner's sounds, all made by squimble quest's synthesiser (js/squimble-quest/sound.js, the same one
// the squimble sound studio page plays with), loaded unchanged. nothing here is a recording: each sound is
// a handful of the synthesiser's settings, worked out the first time it plays.
//
// catpis don't talk, they make little animal noises, somewhere between a cat's mew and a bird's chirp:
// a mew, a chirp, a rolling trill, a soft coo, a questioning mrr? going up, a small yelp, a grumble. most are
// the synthesiser's voice wave (a throat through a small mouth) sliding between vowels, kept low-ish, soft at
// the start and through a low-pass so nothing is sharp. which one comes out depends on the picture in the
// catpi's speech bubble (call()). every catpi has its own pitch, smaller ones higher, so you can tell them
// apart. they're kept quiet and never come too close together, so it's a background murmur, not chatter.
const Sfx = (() => {
  const S = (settings) => soundSettings(settings);
  const SOUNDS_HERE = {
    hop:    S({ wave: 'sine', pitch: 190, slide: 30, attack: 4, sustain: 20, decay: 70, lowPass: 60, volume: 20 }),
    land:   S({ wave: 'sine', pitch: 120, drop: 7, dropTime: 30, attack: 0, sustain: 16, decay: 120, lowPass: 60, volume: 48 }),
    boing:  S({ wave: 'triangle', pitch: 170, drop: 5, dropTime: 30, attack: 2, sustain: 30, decay: 150, lowPass: 55, volume: 34 }),
    munch:  S({ wave: 'noise', pitch: 900, crackle: 90, crackleLength: 8, crackleDepth: 80, attack: 4, sustain: 70, decay: 50, lowPass: 32, volume: 80 }),
    pop:    S({ wave: 'sine', pitch: 380, slide: 120, attack: 2, sustain: 8, decay: 50, lowPass: 70, volume: 24 }),
    plop:   S({ wave: 'sine', pitch: 240, drop: 10, dropTime: 25, attack: 0, sustain: 10, decay: 90, lowPass: 60, volume: 38 }),
    splash: S({ wave: 'pink', pitch: 1400, attack: 6, sustain: 40, decay: 320, crackle: 140, crackleLength: 10, crackleDepth: 50, lowPass: 62, lowPassSweep: -40, highPass: 15, volume: 50 }),
    clean:  S({ wave: 'sine', pitch: 659, repeats: 4, gap: 30, melody: 7, scale: 2, contour: 0, attack: 6, sustain: 20, decay: 180, lastNote: 3, lowPass: 70, reverb: 25, volume: 24 }),
    hatch:  S({ wave: 'sine', pitch: 440, repeats: 4, gap: 34, melody: 3, scale: 0, contour: 0, attack: 6, sustain: 40, decay: 200, lastNote: 3, lowPass: 70, reverb: 20, volume: 30 }),
    tap:    S({ wave: 'triangle', pitch: 392, jump: 5, jumpAt: 40, attack: 3, sustain: 30, decay: 80, lowPass: 55, volume: 16 }),
    swish:  S({ wave: 'pink', pitch: 800, attack: 60, sustain: 60, decay: 200, lowPass: 35, lowPassSweep: 50, volume: 45 }),
    bell:   S({ wave: 'sine', pitch: 1175, fm: 25, fmRatio: 3.5, attack: 0, sustain: 0, decay: 1200, lowPass: 75, reverb: 30, volume: 30 }),
    chime:  S({ wave: 'sine', pitch: 784, attack: 4, sustain: 0, decay: 650, repeats: 2, gap: 40, lowPass: 70, volume: 28 }),
    whoosh: S({ wave: 'pink', pitch: 500, attack: 200, sustain: 300, decay: 500, lowPass: 28, lowPassSweep: 40, tremolo: 40, tremoloSpeed: 6, volume: 60 }),
    purr:   S({ wave: 'sawtooth', pitch: 48, tremolo: 85, tremoloSpeed: 22, lowPass: 14, attack: 120, sustain: 1500, decay: 200, volume: 45 }),
    pour:   S({ wave: 'pink', pitch: 1200, crackle: 200, crackleLength: 14, crackleDepth: 40, lowPass: 52, highPass: 18, attack: 60, sustain: 1500, decay: 100, volume: 32 }),
  };

  // the noises, for a catpi whose voice sits at p hz (about 220 to 460). vowels: 0 ah, 1 eh, 2 ee, 3 oh, 4 oo
  const voice = { wave: 'voice', breath: 32, lowPass: 50, reverb: 10 };
  const CALLS = {
    // mee-oo: up a little, then sliding down as the mouth closes
    mew:     (p) => S({ ...voice, pitch: p, vowel: 2, vowelSlide: 6, jump: 2, jumpAt: 60, slide: -14, attack: 30, sustain: 160, decay: 160, mouth: 72, volume: 46 }),
    // a bird's two little notes, soft and round
    chirp:   (p) => S({ wave: 'sine', pitch: p * 2, slide: 24, repeats: 2, gap: 45, attack: 8, sustain: 35, decay: 80, vibrato: 0.5, vibratoSpeed: 12, lowPass: 45, reverb: 10, volume: 24 }),
    // a happy rolling prrrp
    trill:   (p) => S({ ...voice, pitch: p * 1.1, vowel: 4, vowelSlide: -3, tremolo: 65, tremoloSpeed: 24, slide: 5, attack: 25, sustain: 240, decay: 140, mouth: 66, volume: 44 }),
    // a soft, low ooo
    coo:     (p) => S({ ...voice, pitch: p * 0.8, vowel: 3, vowelSlide: 3, vibrato: 0.35, vibratoSpeed: 5, attack: 70, sustain: 200, decay: 220, mouth: 82, breath: 38, lowPass: 40, volume: 42 }),
    // mrr? going up at the end, like asking
    ask:     (p) => S({ ...voice, pitch: p * 0.92, vowel: 4, vowelSlide: -5, slide: 20, attack: 30, sustain: 150, decay: 110, mouth: 74, volume: 42 }),
    // a small surprised yip, never sharp
    yelp:    (p) => S({ ...voice, pitch: p * 1.2, vowel: 1, drop: 3, dropTime: 50, attack: 10, sustain: 60, decay: 100, mouth: 66, volume: 38 }),
    // mrrmph
    grumble: (p) => S({ ...voice, pitch: p * 0.6, vowel: 4, tremolo: 45, tremoloSpeed: 16, growl: 25, attack: 40, sustain: 220, decay: 150, mouth: 88, lowPass: 34, volume: 40 }),
  };
  // which noise goes with what's in the speech bubble
  const FOR = {
    heart: ['trill', 'coo'], note: ['chirp', 'trill'], star: ['chirp', 'mew'], question: ['ask'], exclaim: ['yelp'],
    dots: ['coo'], yuck: ['grumble'], dizzy: ['coo'], rain: ['yelp', 'grumble'],
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let muted = false;
  try { muted = localStorage.getItem('catpiCornerQuiet') === '1'; } catch { }
  let lastCall = 0;
  // nothing plays until you've pressed something: browsers hold sounds made before that and let them all
  // out at once on the first click
  let woke = false;
  for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { woke = true; }, { capture: true, once: true });
  const loops = {};

  function play(name, { rate = 1, volume = 1 } = {}) {
    if (muted || !woke || !SOUNDS_HERE[name]) return null;
    return Sound.play(SOUNDS_HERE[name], null, name, { rate, volume });
  }
  // a catpi making a noise about something (a bubble's picture, or the kind of call)
  function say(c, about = 'mew') {
    const now = performance.now();
    if (muted || !woke || now - lastCall < 650) return;
    lastCall = now;
    const kind = CALLS[about] ? about : pick(FOR[about] || ['mew', 'mew', 'chirp']);
    Sound.play(CALLS[kind](c.pitch), null, 'call', { rate: 0.94 + Math.random() * 0.12, volume: 0.8 });
  }
  // a loop that runs while something's held down (purring, pouring), on or off
  function hold(name, on) {
    if (on && !loops[name] && !muted && woke) loops[name] = Sound.play(SOUNDS_HERE[name], null, name, { loop: true });
    if (!on && loops[name]) { Sound.stop(loops[name]); loops[name] = null; }
  }
  function mute(quiet) {
    muted = quiet;
    try { localStorage.setItem('catpiCornerQuiet', quiet ? '1' : '0'); } catch { }
    if (quiet) { for (const k in loops) hold(k, false); Sound.stopAll(); }
  }

  return { play, say, hold, mute, get muted() { return muted; } };
})();
