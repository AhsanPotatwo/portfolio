// wizard battles' sound effects, all made by squimble quest's synthesiser (js/squimble-quest/sound.js, the same
// one catpi corner uses), loaded unchanged. nothing here is a recording, each sound is a few of the
// synthesiser's settings. it's a toy theatre, so the stage noises are wooden knocks, paper and curtains, and
// only the spells get to sound like magic.
const WizardSfx = (() => {
  const S = (settings) => soundSettings(settings);
  const SOUNDS_HERE = {
    // the desk's keys and cards
    key:      S({ wave: 'triangle', pitch: 300, drop: 6, dropTime: 8, attack: 0, sustain: 12, decay: 70, lowPass: 45, volume: 34 }),
    card:     S({ wave: 'pink', pitch: 2400, attack: 2, sustain: 14, decay: 70, highPass: 35, lowPass: 70, volume: 60 }),
    token:    S({ wave: 'sine', pitch: 520, slide: 40, attack: 2, sustain: 20, decay: 90, lowPass: 60, volume: 22 }),
    curtain:  S({ wave: 'pink', pitch: 600, attack: 260, sustain: 420, decay: 620, lowPass: 30, lowPassSweep: 25, tremolo: 25, tremoloSpeed: 5, volume: 70 }),
    page:     S({ wave: 'pink', pitch: 1800, attack: 20, sustain: 60, decay: 120, highPass: 25, lowPass: 60, lowPassSweep: -40, volume: 40 }),

    // casting: a little rising shimmer as the staff swings
    cast:     S({ wave: 'sine', pitch: 494, jump: 4, jumpAt: 35, jump2: 3, jump2At: 70, attack: 4, sustain: 90, decay: 140, lowPass: 65, reverb: 15, volume: 18 }),
    Fire:     S({ wave: 'noise', pitch: 1100, crackle: 110, crackleLength: 12, crackleDepth: 55, attack: 50, sustain: 280, decay: 260, lowPass: 42, lowPassSweep: -25, volume: 120 }),
    Water:    S({ wave: 'sine', pitch: 420, slide: 160, repeats: 6, gap: 22, pitchScatter: 6, scatter: 40, attack: 2, sustain: 18, decay: 45, lowPass: 60, volume: 26 }),
    Earth:    S({ wave: 'pink', pitch: 220, growl: 40, attack: 30, sustain: 260, decay: 320, lowPass: 22, crackle: 30, crackleLength: 30, crackleDepth: 40, volume: 110 }),
    Neutral:  S({ wave: 'sine', pitch: 880, fm: 18, fmRatio: 2, slide: -24, attack: 2, sustain: 80, decay: 320, lowPass: 70, reverb: 20, volume: 22 }),
    berserk:  S({ wave: 'sawtooth', pitch: 72, growl: 60, tremolo: 30, tremoloSpeed: 11, attack: 40, sustain: 380, decay: 280, lowPass: 28, volume: 46 }),

    // landing, or not
    hit:      S({ wave: 'noise', pitch: 700, drop: 12, dropTime: 18, punch: 60, attack: 0, sustain: 30, decay: 170, lowPass: 42, volume: 72 }),
    thump:    S({ wave: 'sine', pitch: 96, drop: 10, dropTime: 30, attack: 0, sustain: 20, decay: 160, lowPass: 50, volume: 48 }),
    miss:     S({ wave: 'pink', pitch: 1000, attack: 40, sustain: 50, decay: 170, highPass: 30, lowPassSweep: -60, volume: 40 }),
    shield:   S({ wave: 'triangle', pitch: 240, drop: 5, dropTime: 10, repeats: 2, gap: 45, attack: 0, sustain: 15, decay: 90, lowPass: 50, volume: 42 }),
    clang:    S({ wave: 'sine', pitch: 330, fm: 40, fmRatio: 2.7, attack: 0, sustain: 10, decay: 380, lowPass: 60, volume: 26 }),
    tear:     S({ wave: 'noise', pitch: 3000, crackle: 300, crackleLength: 3, crackleDepth: 85, attack: 5, sustain: 200, decay: 60, highPass: 20, lowPass: 70, volume: 40 }),
    heal:     S({ wave: 'sine', pitch: 523, repeats: 5, gap: 18, melody: 12, scale: 2, contour: 0, attack: 3, sustain: 30, decay: 160, lastNote: 3, lowPass: 70, reverb: 25, volume: 22 }),
    fizzle:   S({ wave: 'triangle', pitch: 380, slide: -110, vibrato: 0.6, vibratoSpeed: 9, attack: 10, sustain: 180, decay: 140, lowPass: 45, volume: 20 }),
    pop:      S({ wave: 'sine', pitch: 380, slide: 120, attack: 2, sustain: 8, decay: 50, lowPass: 70, volume: 22 }),
    fall:     S({ wave: 'triangle', pitch: 180, drop: 8, dropTime: 60, repeats: 2, gap: 70, attack: 0, sustain: 20, decay: 140, lowPass: 40, volume: 50 }),

    // the end of the show
    win:      S({ wave: 'square', pulseWidth: 30, pitch: 392, repeats: 6, gap: 26, melody: 4, scale: 0, contour: 0, attack: 4, sustain: 80, decay: 120, lastNote: 4, lowPass: 45, reverb: 20, volume: 20 }),
    lose:     S({ wave: 'triangle', pitch: 330, repeats: 5, gap: 40, melody: 9, scale: 1, contour: 1, attack: 6, sustain: 110, decay: 160, lastNote: 4, lowPass: 50, reverb: 20, volume: 26 }),
  };

  let muted = false;
  try { muted = localStorage.getItem('wizardBattlesQuiet') === '1'; } catch { }
  // nothing plays before you've clicked: browsers hold early sounds and let them all out at once
  let woke = false;
  addEventListener('pointerdown', wake, { capture: true });
  addEventListener('keydown', wake, { capture: true });
  function wake() {
    if (woke) return;
    woke = true;
    // works every sound out now, one at a time between frames, so the first fireball doesn't stutter
    const names = Object.keys(SOUNDS_HERE);
    const next = () => {
      const name = names.shift();
      if (!name) return;
      Sound.render(SOUNDS_HERE[name]);
      setTimeout(next, 30);
    };
    setTimeout(next, 200);
  }

  function play(name, { rate = 1, volume = 1 } = {}) {
    if (muted || !woke || !SOUNDS_HERE[name]) return null;
    // the game never calls Sound.update(), so finished ones come off the list here
    Sound.voices = Sound.voices.filter((voice) => !voice.ended);
    return Sound.play(SOUNDS_HERE[name], null, name, { rate, volume });
  }
  function mute(quiet) {
    muted = quiet;
    try { localStorage.setItem('wizardBattlesQuiet', quiet ? '1' : '0'); } catch { }
    if (quiet) Sound.stopAll();
  }

  return { play, mute, get muted() { return muted; } };
})();
