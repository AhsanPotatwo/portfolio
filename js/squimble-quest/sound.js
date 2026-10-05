// sound: a tiny synthesiser using the browser's Web Audio, plus drawing what a sound's wave looks like.
// anything that makes a noise goes through playSound(), so later on swords, doors or music can use it
// too. sound blocks on the map (soundblocks.js) are the first thing that does.
//
// a sound is just plain settings (SOUND_DEFAULTS), so it can be saved in a map file. each one is a
// "beep" (or a few, with repeats) of a wave at a pitch, that fades in and out, and can slide and
// wobble in pitch on the way. sounds played somewhere in the world get quieter the further the
// player is from them, and come more out of the left or right speaker depending on which side they're on.
//
// ---------- adding things ----------
//
//   a wave      a line in SOUND_WAVES with its shape(p): how high the wave is (-1 to 1) at point p
//               (0 to 1) through one cycle. makeWave() turns that shape into the actual sound, and
//               the visualiser draws the same shape, so what you see always matches what you hear
//   a preset    a defineSound() line at the bottom. it shows up in the editor's Sounds tab by itself
//   a setting   its normal value in SOUND_DEFAULTS, what it does in Sound.beep() (and drawSoundWave()
//               if it changes how it looks), and a row in SoundBlocks.edit() (soundblocks.js)
//
// browsers only let a page make sound after you've clicked on it, but you have to click the game to
// play it anyway, so that's fine.
//
// ponytail: each sound block keeps its own settings. a named sound library (like items.json) that
// swords, doors and music could share would be the next step, built on playSound()

// how loud everything is overall (0 to 1). raw waves are really loud, so this keeps them comfortable
const SOUND_MASTER_VOLUME = 0.3;

// the kinds of wave. shape(p) is explained at the top of this file. noise is different because it
// isn't a repeating wave, it's random hiss (so the shape is only used for drawing it)
const SOUND_WAVES = {
  // smooth and pure, like a whistle or a tuning fork
  sine:     { shape: (p) => Math.sin(p * Math.PI * 2) },
  // soft and a bit hollow, like a flute
  triangle: { shape: (p) => 1 - 4 * Math.abs(p - 0.5) },
  // buzzy, the classic old video game sound
  square:   { shape: (p) => (p < 0.5 ? 1 : -1) },
  // a thinner, nasal square, like old consoles used for melodies
  pulse:    { shape: (p) => (p < 0.25 ? 1 : -1) },
  // harsh and bright, good for lasers and engines
  sawtooth: { shape: (p) => 2 * p - 1 },
  // random hiss, for hits, explosions, wind and footsteps. pitch picks how high the hiss is
  noise:    { noise: true, shape: (p) => glowHash(p * 997) * 2 - 1 }, // glowHash() is in itemglow.js
};

// every sound starts with these, and they're the only settings a sound can have
const SOUND_DEFAULTS = {
  // a SOUND_WAVES name
  wave: 'square',
  // how high it is in Hz (how many times a second the wave repeats). 440 is the A above middle C,
  // and doubling it goes up a whole octave
  pitch: 440,
  // how many ms each beep lasts
  length: 200,
  // 0 to 100
  volume: 60,
  // ms to fade in at the start of each beep and out at the end. a little bit stops it clicking
  fadeIn: 5,
  fadeOut: 80,
  // the pitch (Hz) it slides to by the end of each beep. up for jumps and coins, down for lasers and
  // falling. 0 means it doesn't slide
  slideTo: 0,
  // vibrato: how far the pitch wobbles up and down in cents (100 cents is one note), and how many
  // times a second
  wobble: 0,
  wobbleSpeed: 6,
  // how many beeps, and the ms gap between them (for alarms, footsteps, a ringing phone)
  repeats: 1,
  gap: 60,
  // how many tiles away you can still hear it. it gets quieter the further away you are
  range: 8,
};

// a full set of sound settings from some (from a preset or a map file). anything that isn't a
// SOUND_DEFAULTS setting, or is the wrong type, gets left out so a bad file can't break the audio
function soundSettings(from) {
  const sound = {};
  for (const [key, value] of Object.entries(SOUND_DEFAULTS)) {
    sound[key] = typeof from[key] === typeof value ? from[key] : value;
  }
  if (!SOUND_WAVES[sound.wave]) {
    console.warn(`There's no sound wave called "${sound.wave}", so it's a ${SOUND_DEFAULTS.wave} instead. They're in SOUND_WAVES (sound.js)`);
    sound.wave = SOUND_DEFAULTS.wave;
  }
  return sound;
}

// how many seconds the whole sound lasts, with all its repeats
function soundDuration(sound) {
  return (sound.repeats * sound.length + (sound.repeats - 1) * sound.gap) / 1000;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// the closest musical note to a pitch, like 440 gives "A4"
function noteName(hz) {
  // how many notes up from C0. A4 (440) is 57
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;
  return NOTE_NAMES[((n % 12) + 12) % 12] + Math.floor(n / 12);
}

// plays a sound. at is where it is in the world as { x, y, map } so it gets quieter with distance, or
// null to just play it at full volume (like the editor's Play button). key is optional: anything
// that marks what's playing it, so Sound.isPlaying(key) can tell
function playSound(sound, at = null, key = null) {
  Sound.play(sound, at, key);
}

const Sound = {
  // the browser's audio, made the first time something plays (null if the browser can't do audio)
  ctx: null,
  // sounds that are still going, each { out, pan, at, range, key, end }. out and pan are what
  // distance changes, end is when it finishes (in ctx.currentTime seconds)
  voices: [],
  // where sounds are heard from, { x, y, map }, set every frame by update()
  listener: null,
  // each wave's sound made from its shape (makeWave()), and a second of random noise, made once
  waves: {},
  noiseBuffer: null,
  // when the editor's Play button was last pressed (millis()), for the visualiser's moving line
  previewStarted: null,

  // the audio, or null if the browser doesn't have it. made on first use, since browsers don't let
  // pages make sound before you've clicked on them
  context() {
    if (!this.ctx) {
      if (!window.AudioContext) return null;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  play(sound, at, key) {
    const ctx = this.context();
    if (!ctx) return;
    // every beep goes through out (distance volume) then pan (left/right) to the speakers
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    out.gain.value = this.volumeAt(at, sound.range);
    pan.pan.value = this.panAt(at, sound.range);
    out.connect(pan).connect(ctx.destination);

    // a tiny bit in the future so the first beep's start isn't cut off
    let start = ctx.currentTime + 0.01;
    for (let i = 0; i < sound.repeats; i++) {
      this.beep(sound, out, start);
      start += (sound.length + sound.gap) / 1000;
    }
    this.voices.push({ out, pan, at, range: sound.range, key, end: ctx.currentTime + 0.01 + soundDuration(sound) });
  },

  // one beep of the sound starting at time t (ctx.currentTime seconds), going into out
  beep(sound, out, t) {
    const ctx = this.ctx;
    const length = sound.length / 1000;
    const end = t + length;

    // the volume shape: fade in, stay, fade out. the fades can't add up to more than the beep
    const fadeIn = Math.min(sound.fadeIn / 1000, length / 2);
    const fadeOut = Math.min(sound.fadeOut / 1000, length - fadeIn);
    const peak = (sound.volume / 100) * SOUND_MASTER_VOLUME;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(peak, t + fadeIn);
    envelope.gain.setValueAtTime(peak, end - fadeOut);
    envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(out);

    // the source, and `tuned`, the thing whose frequency is the pitch. for waves that's the
    // oscillator itself, and for noise it's the filter the hiss goes through
    let source;
    let tuned;
    if (SOUND_WAVES[sound.wave].noise) {
      source = ctx.createBufferSource();
      source.buffer = this.noise();
      source.loop = true;
      tuned = ctx.createBiquadFilter();
      tuned.type = 'bandpass';
      source.connect(tuned).connect(envelope);
    } else {
      source = ctx.createOscillator();
      source.setPeriodicWave(this.makeWave(sound.wave));
      tuned = source;
      source.connect(envelope);
    }
    tuned.frequency.setValueAtTime(sound.pitch, t);
    if (sound.slideTo > 0) tuned.frequency.exponentialRampToValueAtTime(sound.slideTo, end);

    // wobble: a slow sine wave pushing the pitch up and down (detune is in cents)
    if (sound.wobble > 0 && sound.wobbleSpeed > 0) {
      const wobbler = ctx.createOscillator();
      const depth = ctx.createGain();
      wobbler.frequency.value = sound.wobbleSpeed;
      depth.gain.value = sound.wobble;
      wobbler.connect(depth).connect(tuned.detune);
      wobbler.start(t);
      wobbler.stop(end);
    }
    source.start(t);
    source.stop(end);
  },

  // the wave's sound, made from its shape(). the browser builds waves out of lots of sine waves
  // added together (harmonics), so this measures how much of each harmonic the shape has. done once
  // per wave and kept
  makeWave(name) {
    if (!this.waves[name]) {
      const { shape } = SOUND_WAVES[name];
      const harmonics = 64;
      const samples = 512;
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);
      for (let n = 1; n < harmonics; n++) {
        for (let k = 0; k < samples; k++) {
          const p = (k + 0.5) / samples;
          const height = (shape(p) * 2) / samples;
          real[n] += height * Math.cos(2 * Math.PI * n * p);
          imag[n] += height * Math.sin(2 * Math.PI * n * p);
        }
      }
      this.waves[name] = this.ctx.createPeriodicWave(real, imag);
    }
    return this.waves[name];
  },

  // a second of random hiss, looped by noise sounds
  noise() {
    if (!this.noiseBuffer) {
      const rate = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, rate, rate);
      const data = this.noiseBuffer.getChannelData(0);
      // ponytail: Math.random() rather than randomBetween(), since this is only what you hear and
      // never changes the game
      for (let i = 0; i < rate; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
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

  // is something with this key still playing? (playSound()'s key)
  isPlaying(key) {
    return this.voices.some((voice) => voice.key === key);
  },

  // every frame (sketch.js). listener is where you hear from, { x, y, map }. voices that are still
  // going change volume and side as you move, and finished ones get tidied up
  update(listener) {
    this.listener = listener;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((voice) => {
      if (now > voice.end + 0.1) {
        voice.out.disconnect();
        return false;
      }
      if (voice.at) {
        // setTargetAtTime glides there quickly instead of jumping, which would click
        voice.out.gain.setTargetAtTime(this.volumeAt(voice.at, voice.range), now, 0.05);
        voice.pan.pan.setTargetAtTime(this.panAt(voice.at, voice.range), now, 0.05);
      }
      return true;
    });
  },

  // cuts off everything that's playing (like when the editor opens)
  stopAll() {
    for (const voice of this.voices) voice.out.disconnect();
    this.voices = [];
    this.previewStarted = null;
  },

  // plays a sound at full volume, and starts the visualiser's moving line (the editor's Play button)
  preview(sound) {
    this.stopAll();
    playSound(sound);
    this.previewStarted = millis();
  },
};

// ---------- drawing sounds ----------

// these draw with whatever stroke is set, so set it first (and noFill())

// a few cycles of a wave's shape filling x, y, w, h. loudness (0 to 1) is how tall it goes. used for
// the wave picker's little pictures, sound block markers and the visualiser's close-up
function drawWaveShape(wave, x, y, w, h, cycles = 2, loudness = 0.8) {
  const { shape } = SOUND_WAVES[wave];
  beginShape();
  for (let i = 0; i <= w; i++) vertex(x + i, y + h / 2 - shape(((i / w) * cycles) % 1) * (h / 2) * loudness);
  endShape();
}

// how many cycles the visualiser's close-up shows for a pitch: one more for every octave up, the way
// your ear hears it (55 Hz is 1, 440 is 3, 3520 is 6)
function closeUpCycles(pitch) {
  return constrain(Math.log2(pitch / 55), 1, 6);
}

// draws the whole sound from start to end inside x, y, w, h: each beep's wave with its volume shape,
// slide and wobble, and the gaps between repeats. real pitches are hundreds of waves a second, far too
// many to see, so it shows a handful, with more for higher pitches
function drawSoundWave(sound, x, y, w, h) {
  const { shape } = SOUND_WAVES[sound.wave];
  const length = sound.length / 1000;
  const step = length + sound.gap / 1000;
  const seconds = soundDuration(sound);
  // how many waves a second to show, so the whole sound has a handful (more for higher pitches)
  const wavesPerSecond = constrain(Math.log2(sound.pitch / 20) * 3, 2, 25) / seconds;
  const peak = (h / 2) * (sound.volume / 100);
  const fadeIn = Math.min(sound.fadeIn / 1000, length / 2);
  const fadeOut = Math.min(sound.fadeOut / 1000, length - fadeIn);

  let phase = 0;
  let lastBeep = -1;
  beginShape();
  for (let i = 0; i <= w; i++) {
    const t = (i / w) * seconds;
    const beep = Math.floor(t / step);
    const u = t - beep * step;
    let height = 0;
    if (beep < sound.repeats && u <= length) {
      if (beep !== lastBeep) {
        phase = 0;
        lastBeep = beep;
      }
      // the pitch right now compared to the start, with the slide and the wobble. the wobble is
      // shown 3 times bigger than it really is, otherwise you couldn't see it at all
      let ratio = sound.slideTo > 0 ? Math.pow(sound.slideTo / sound.pitch, u / length) : 1;
      ratio *= Math.pow(2, (3 * sound.wobble / 1200) * Math.sin(2 * Math.PI * sound.wobbleSpeed * u));
      phase += wavesPerSecond * ratio * (seconds / w);
      const volume = Math.min(1, fadeIn > 0 ? u / fadeIn : 1, fadeOut > 0 ? (length - u) / fadeOut : 1);
      height = shape(phase % 1) * volume;
    }
    vertex(x + i, y + h / 2 - height * peak);
  }
  endShape();
}

// ---------- presets ----------
// the starting sounds in the editor's Sounds tab. place one, then right click it to change it

const SOUND_PRESETS = {};

// defineType() is in utils.js
function defineSound(name, settings) {
  defineType(SOUND_PRESETS, SOUND_DEFAULTS, 'sound', name, settings);
}

defineSound('beep',      { wave: 'square', pitch: 440, length: 150, fadeOut: 40 });
defineSound('coin',      { wave: 'pulse', pitch: 988, slideTo: 1976, length: 180, fadeOut: 120, volume: 45 });
defineSound('jump',      { wave: 'square', pitch: 260, slideTo: 620, length: 180, fadeOut: 60, volume: 45 });
defineSound('laser',     { wave: 'sawtooth', pitch: 1600, slideTo: 180, length: 220, fadeOut: 100, volume: 40 });
defineSound('hit',       { wave: 'noise', pitch: 1200, slideTo: 300, length: 120, fadeOut: 100, volume: 80 });
defineSound('explosion', { wave: 'noise', pitch: 500, slideTo: 60, length: 800, fadeOut: 700, volume: 90, range: 14 });
defineSound('alarm',     { wave: 'triangle', pitch: 880, length: 160, repeats: 4, gap: 90, wobble: 150, wobbleSpeed: 12 });
defineSound('hum',       { wave: 'sine', pitch: 110, length: 1500, fadeIn: 300, fadeOut: 300, wobble: 20, wobbleSpeed: 4, volume: 70, range: 5 });
defineSound('chime',     { wave: 'sine', pitch: 1319, length: 700, fadeIn: 2, fadeOut: 650, repeats: 2, gap: 40, volume: 50 });
