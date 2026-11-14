// the sky behind the page (sky.js): every mood has a scene, every scene draws a real song for a while
// without going wrong, and the big shapes stay dark enough for the words in front of them.
//   node js/squimble-music-maker/tests/sky-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// a pretend page: a canvas whose drawing calls do nothing
const pen = new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, value) => ((target[key] = value), true) });
Object.assign(globalThis, {
  window: globalThis,
  document: { getElementById: () => ({ getContext: () => pen }), querySelector: () => ({ getBoundingClientRect: () => ({ top: 500, bottom: 76 }) }) },
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
  innerWidth: 1366,
  innerHeight: 768,
  devicePixelRatio: 1,
});
const dir = path.join(__dirname, '..');
for (const file of ['instruments.js', 'synth.js', 'moods.js', 'music.js', 'sky.js']) vm.runInThisContext(fs.readFileSync(path.join(dir, file), 'utf8'), { filename: file });

const failures = [];
const fail = (what) => failures.push(what);

// relative luminance of 'rgb(r,g,b)' or '#rrggbb', for contrast
const luminance = (colour) => {
  const rgb = colour.startsWith('#') ? [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)) : colour.match(/\d+/g).map(Number);
  const [r, g, b] = rgb.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

let lowest = Infinity;
for (const key of Object.keys(MOODS)) {
  if (!sky.MOOD_SCENES[key]) fail(`${key} has no scene`);
  // the lede is --mm-on-sky-soft (the css): it has to read on the big shapes as well as the sky
  const text = sky.mix(MOODS[key].colour, '#eadcbf', 0.18);
  const p = sky.palette(MOODS[key].colour);
  for (const tone of ['faint', 'soft']) {
    const ratio = contrast(text, p[tone]);
    lowest = Math.min(lowest, ratio);
    if (ratio < 4.5) fail(`${key}: page text on ${tone} is ${ratio.toFixed(2)}, under 4.5`);
  }
}
for (const key of Object.keys(sky.MOOD_SCENES)) if (!MOODS[key]) fail(`a scene for ${key}, which isn't a mood`);

// each mood's scene for ten seconds of its own song playing, then two stopped, at 60 frames a second
let clock = 0;
globalThis.performance = { now: () => clock };
for (const key of Object.keys(MOODS)) {
  const song = generateSong(key, 'tune', 'sky');
  const comp = composeSong(song);
  const player = { playing: true, song, comp, position: () => (clock / 1000) * (song.tempo / 60) };
  try {
    sky.mood(key, MOODS[key].colour);
    for (let frame = 0; frame < 720; frame++) {
      clock += 1000 / 60;
      player.playing = frame < 600;
      sky.frame(player);
    }
  } catch (error) {
    fail(`${key}: ${error.stack.split('\n').slice(0, 2).join(' ')}`);
  }
}

console.log(`lowest contrast of page text on a big shape: ${lowest.toFixed(2)}`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log(`sky check passed: ${Object.keys(MOODS).length} moods`);
