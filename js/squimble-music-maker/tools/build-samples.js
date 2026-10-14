// builds the recorded instruments in assets/squimble-music-maker/samples/ from free sample libraries.
// each folder gets a few notes of one instrument (every few semitones, sometimes soft and loud) as
// small mono mp3s, plus an index.json saying which note each file is and where it came from. synth.js
// loads them (loadSamples) and plays the nearest one, retuned.
//
//   node js/squimble-music-maker/tools/build-samples.js <work folder> [folders...]
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --list    what it would take
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --probe   checks the octaves
//
// the work folder is where the libraries get downloaded to (only the files picked, not the gigabytes
// of everything). it needs git, and ffmpeg (on the path, or FFMPEG saying where).
//
// libraries don't agree on which octave is which (vsco's horn calls its lowest note A0, a whole
// octave below anything a horn can play), so every note's pitch is measured (pitchOf) and checked
// against its name. --probe measures a few from each source; shift then moves a source's names by
// whole octaves. a note that still measures more than a quarter tone off is reported, and the long,
// steady notes get tune (cents) so they play in tune.
//
// only libraries whose licence lets them go in a game are used, and each index.json says which:
// almost all are cc0 (no strings attached). the fluidr3 general midi set (cc by 3.0), mtg's saxes
// (cc by 4.0) need a credit, which is at the bottom of squimble-music-maker.html.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const OUT = path.join(__dirname, '../../../assets/squimble-music-maker/samples');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const RATE = 44100;

const SOURCES = {
  vsco: { git: 'https://github.com/sgossner/VSCO-2-CE', name: 'VSCO 2 Community Edition (Versilian Studios)', licence: 'CC0 1.0' },
  vcsl: { git: 'https://github.com/sgossner/VCSL', name: 'Versilian Community Sample Library (Versilian Studios)', licence: 'CC0 1.0' },
  drums: { git: 'https://github.com/sfzinstruments/virtuosity_drums', name: 'Virtuosity Drums (Versilian Studios and Karoryfer Samples)', licence: 'CC0 1.0' },
  guitars: { git: 'https://github.com/sfzinstruments/karoryfer.black-and-green-guitars', name: 'Black and Green Guitars (Karoryfer Samples)', licence: 'CC0 1.0' },
  basses: { git: 'https://github.com/sfzinstruments/karoryfer.black-and-blue-basses', name: 'Black and Blue Basses (Karoryfer Samples)', licence: 'CC0 1.0' },
  emily: { git: 'https://github.com/sfzinstruments/karoryfer.emilyguitar', name: 'Emilyguitar (Karoryfer Samples)', licence: 'CC0 1.0' },
  erhu: { git: 'https://github.com/sfzinstruments/aliexpress-erhu', name: 'Aliexpress Erhu (Karoryfer Samples)', licence: 'CC0 1.0' },
  steeldrum: { git: 'https://github.com/sfzinstruments/jlearman.SteelDrum', name: 'jSteelDrum (J. Learman)', licence: 'Public domain (the Unlicense)' },
  sax: { git: 'https://github.com/sfzinstruments/MTG.SoloSax', name: 'MTG Solo Saxophones (Music Technology Group, Universitat Pompeu Fabra)', licence: 'CC BY 4.0' },
  fluid: { url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/', name: 'FluidR3 GM soundfont (Frank Wen), via midi-js-soundfonts', licence: 'CC BY 3.0' },
};

// ---------- what goes in each folder ----------
//
// a tonal folder: from (a source), dir (a folder in it), shift (octaves its names are out by, found
// with --probe), match (which files: the first bracket is
// the note's name if the file names one, layers say which loudness each file is), low and high (the
// notes wanted, after shift), every (semitones between notes kept), rr (how many takes of each note
// to keep, played in turn), seconds (the longest a note's kept), loop (a held instrument: synth.js
// loops the steady middle of each note so it lasts as long as it's held).
// more than one part (parts) is for an instrument made of several, the strings: a section of cellos
// under violas under violins
// a kit folder has hits instead: { name: [files, as [path, loudness]] }
const vel = (map) => (file) => { for (const [mark, v] of map) if (mark.test(file)) return v; return null; };
const LOUD = vel([[/_ff?[_.\d]/i, 0.9], [/_mf[_.\d]/i, 0.65], [/_mp[_.\d]/i, 0.45], [/_pp?[_.\d]/i, 0.3]]);

const FOLDERS = {
  // ----- vsco 2 ce -----
  violin: { from: 'vsco', dir: 'Strings/Solo Violin/Arco Vib/', match: /_([A-G]#?\d)_f\.wav$/, loop: true, seconds: 4 },
  strings: {
    loop: true, seconds: 4, parts: [
      { from: 'vsco', dir: 'Strings/Cello Section/susvib/', shift: 1, match: /_([A-G]#?\d)_v1_1\.wav$/, high: 47 },
      { from: 'vsco', dir: 'Strings/Viola Section/susvib/', shift: 1, match: /_([A-G]#?\d)_v1_1\.wav$/, low: 48, high: 54 },
      { from: 'vsco', dir: 'Strings/Violin Section/susVib/', shift: 1, match: /_([A-G]#?\d)_v1\.wav$/, low: 55 },
    ],
  },
  'cello-section': { from: 'vsco', dir: 'Strings/Cello Section/susvib/', shift: 1, match: /_([A-G]#?\d)_v1_1\.wav$/, loop: true, seconds: 4 },
  pizzicato: { from: 'vsco', dir: 'Strings/Violin Section/Pizz/', shift: 1, match: /_([A-G]#?\d)_(v\d)_rr1\.wav$/, layers: { v1: 0.4, v2: 0.9 }, seconds: 2 },
  'double-bass': { from: 'vsco', dir: 'Strings/Solo Contrabass/Pizz/', shift: 1, match: /_([A-G]#?\d)_(v\d)_rr1\.wav$/, layers: { v1: 0.4, v3: 0.9 }, seconds: 3 },
  trumpet: { from: 'vsco', dir: 'Brass/Trumpet/sus/', shift: 1, match: /_sus_([A-G]#?\d)_v3_rr1\.wav$/, loop: true, seconds: 4 },
  'harmon-trumpet': { from: 'vsco', dir: 'Brass/Trumpet/harmonM-sus/', shift: 1, match: /_([A-G]#?\d)_v3_rr1\.wav$/, loop: true, seconds: 4 },
  horn: { from: 'vsco', dir: 'Brass/F Horn/sus/', shift: 1, match: /_([A-G]#?\d)_v2_1\.wav$/, loop: true, seconds: 4 },
  trombone: { from: 'vsco', dir: 'Brass/Tenor Trombone/sus/', shift: 1, match: /_([A-G]#?\d)_v2_1\.wav$/, loop: true, seconds: 4 },
  tuba: { from: 'vsco', dir: 'Brass/Tuba/sus/', shift: 1, match: /_([A-G]#?\d)_v2_rr1_Mid\.wav$/, loop: true, seconds: 4 },
  flute: { from: 'vsco', dir: 'Woodwinds/Flute/susvib/', shift: 1, match: /_([A-G]#?\d)_v1_1\.wav$/, loop: true, seconds: 4 },
  clarinet: { from: 'vsco', dir: 'Woodwinds/Clarinet/susLong/', shift: 1, match: /_([A-G]#?\d)_v2_rr1_sum\.wav$/, loop: true, seconds: 4 },
  // the upright's files are numbered, two semitones apart from the bottom a (MappingChart.txt)
  'upright-piano': { from: 'vsco', dir: 'Keys/Upright Piano/', match: /Player_(dyn\d)_rr1_(\d+)\.wav$/, note: (m) => 21 + 2 * Number(m[2]), layer: (m) => m[1], layers: { dyn1: 0.3, dyn3: 0.9 }, every: 4, low: 28, high: 100, seconds: 5 },
  // ----- vcsl -----
  piano: { from: 'vcsl', dir: 'Chordophones/Zithers/Grand Piano, Steinway B/Sus/', match: /_([A-G]#?\d)_(vl\d)_rr1\.wav$/, layers: { vl2: 0.35, vl4: 0.9 }, low: 28, high: 100, seconds: 5 },
  'tenor-sax': { from: 'vcsl', dir: 'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato/', shift: 1, match: /_([A-G]#?\d)_vl2_rr1\.wav$/, loop: true, seconds: 4 },
  harmonica: { from: 'vcsl', dir: 'Aerophones/Free Aerophones/Harmonica-Hohner-Super64/Sustains/Normal/', shift: 1, match: /_([A-G]#?\d)\.wav$/, loop: true, seconds: 4 },
  koto: { from: 'vcsl', dir: 'Chordophones/Zithers/Dan Tranh/Normal/', shift: 1, match: /^([A-G]#?\d)_ff?_1\.wav$/, seconds: 4 },
  harp: { from: 'vcsl', dir: 'Chordophones/Composite Chordophones/Concert Harp/', match: /_([A-G]#?\d)_(mf|f)1\.wav$/, layers: { mf: 0.45, f: 0.9 }, seconds: 4 },
  glockenspiel: { from: 'vcsl', dir: 'Idiophones/Struck Idiophones/Glockenspiel/', shift: 1, match: /_(soft|loud)_([A-G]#?\d)_01\.wav$/, note: 2, layer: 1, layers: { soft: 0.35, loud: 0.9 }, every: 2, seconds: 3 },
  marimba: { from: 'vcsl', dir: 'Idiophones/Struck Idiophones/Marimba/', shift: 1, match: /_([A-G]#?\d)_(soft|loud)_01\.wav$/, layers: { soft: 0.35, loud: 0.9 }, seconds: 3 },
  vibraphone: { from: 'vcsl', dir: 'Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/', shift: 1, match: /_([A-G]#?\d)_(v\d)_rr1_Main\.wav$/, layers: { v1: 0.4, v2: 0.9 }, seconds: 4 },
  'pipe-organ': { from: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/', shift: 1, match: /_([A-G]#?\d)_rr1\.wav$/, loop: true, seconds: 4 },
  // ----- karoryfer and friends -----
  'clean-guitar': { from: 'guitars', dir: 'Samples/black/ord/', shift: -1, match: /twang_([a-g]b?\d)_(p|f)_rr1\.wav$/, layers: { p: 0.35, f: 0.9 }, seconds: 5 },
  'hollow-guitar': { from: 'emily', dir: 'notes/', match: /^([a-g]b?\d)_(p|f)_rr1\.wav$/, layers: { p: 0.35, f: 0.9 }, seconds: 5 },
  'bass-guitar': { from: 'basses', dir: 'Samples/darkblack/reg/', shift: -1, match: /_([a-g]b?\d)_(p|f)_rr1\.wav$/, layers: { p: 0.35, f: 0.9 }, seconds: 4 },
  erhu: { from: 'erhu', dir: 'Samples/sus/', shift: -1, match: /erhu_([a-g]b?\d)_sus_rr1\.wav$/, loop: true, seconds: 4 },
  'steel-drum': { from: 'steeldrum', dir: 'flac/', match: /_([A-G]b?\d)_4-1\.flac$/, seconds: 3 },
  // mtg's files are numbered up from c3 (Data/alt_f_rr1.txt), and each comes with how far out of
  // tune it was recorded
  'alto-sax': { from: 'sax', dir: 'MTG Solo Saxophones/Samples/', match: /alt_f_(\d+)\.flac$/, note: (m) => 48 + Number(m[1]), tunes: 'MTG Solo Saxophones/Data/alt_f_rr1.txt', loop: true, seconds: 4 },
  // ----- fluidr3 general midi, where the cc0 libraries have nothing -----
  accordion: { gm: 'accordion', low: 41, high: 89, loop: true },
  banjo: { gm: 'banjo', low: 48, high: 84 },
  celesta: { gm: 'celesta', low: 60, high: 108 },
  // vcsl's kalimba (from tanzania) is tuned its own way, about a quarter tone sharp of a piano, which
  // clashed with everything else
  kalimba: { gm: 'kalimba', low: 48, high: 96 },
  'choir-aahs': { gm: 'choir_aahs', low: 41, high: 84, loop: true },
  'choir-oohs': { gm: 'voice_oohs', low: 41, high: 84, loop: true },
  clavinet: { gm: 'clavinet', low: 36, high: 96 },
  // its 16' drawbar fools the pitch check, which hears it two octaves down
  'drawbar-organ': { gm: 'drawbar_organ', low: 36, high: 96, loop: true, trust: true },
  dulcimer: { gm: 'dulcimer', low: 48, high: 96 },
  'electric-piano': { gm: 'electric_piano_1', low: 33, high: 100 },
  fretless: { gm: 'fretless_bass', low: 28, high: 67 },
  'music-box': { gm: 'music_box', low: 60, high: 108 },
  'nylon-guitar': { gm: 'acoustic_guitar_nylon', low: 40, high: 88 },
  'steel-guitar': { gm: 'acoustic_guitar_steel', low: 40, high: 88 },
  'pan-flute': { gm: 'pan_flute', low: 55, high: 96, loop: true },
  shakuhachi: { gm: 'shakuhachi', low: 55, high: 93, loop: true },
  shamisen: { gm: 'shamisen', low: 48, high: 88 },
  sitar: { gm: 'sitar', low: 48, high: 88 },
  'slap-bass': { gm: 'slap_bass_1', low: 28, high: 67 },
  'brass-section': { gm: 'brass_section', low: 41, high: 84, loop: true },
};

// a kit's hits: [file, loudness]. vrr() spells out a set of takes: {v} and {r} in the name are the
// loudness layer and the take
const vrr = (pattern, layers, takes = [1, 2]) => Object.entries(layers).flatMap(([v, loud]) => takes.map((r) => [pattern.replace('{v}', v).replace('{r}', r), loud]));
const kit = (mic) => ({
  from: 'drums',
  hits: {
    kick: vrr(`Samples/${mic}/kick/${mic}_kick_snoff_vl{v}_rr{r}.flac`, { 2: 0.45, 4: 0.9 }),
    snare: vrr(`Samples/${mic}/snare/${mic}_snare_center_vl{v}_rr{r}.flac`, { 3: 0.4, 6: 0.9 }).map(([file, loud]) => [file.replace(/_vl(\d)_rr(\d)/, (_, v, r) => `_vl${(v - 1) * 6 + Number(r) * 3}`), loud]),
    rim: [[`Samples/${mic}/snare/${mic}_snare_crossstick_vl8.flac`, 0.6], [`Samples/${mic}/snare/${mic}_snare_crossstick_vl12.flac`, 0.9]],
    hat: vrr(`Samples/${mic}/hh/${mic}_hh_closed_vl{v}_rr{r}.flac`, { 2: 0.4, 4: 0.9 }),
    'open-hat': vrr(`Samples/${mic}/hh/${mic}_hh_open_vl{v}_rr{r}.flac`, { 3: 0.8 }),
    ride: vrr(`Samples/${mic}/ride/${mic}_ride_ride_vl{v}_rr{r}.flac`, { 2: 0.5, 3: 0.9 }),
    crash: vrr(`Samples/${mic}/crash/${mic}_crash_crash_vl{v}_rr{r}.flac`, { 3: 0.9 }, [1]),
    'high-tom': [[`Samples/${mic}/htom/${mic}_htom_center_vl10.flac`, 0.6], [`Samples/${mic}/htom/${mic}_htom_center_vl15.flac`, 0.9]],
    'low-tom': [[`Samples/${mic}/ltom/${mic}_ltom_center_vl10.flac`, 0.6], [`Samples/${mic}/ltom/${mic}_ltom_center_vl15.flac`, 0.9]],
  },
});
const PERC = 'Samples/perc/mid/';
const KITS = {
  // a rock kit in a room, from a microphone a few feet away (the mid mic), so it's one kit rather
  // than close miked drums that need mixing
  'studio-kit': kit('mid'),
  // the same kit through virtuosity's lo-fi microphone, crunchy and boxy
  'lofi-kit': kit('lofi'),
  percussion: {
    from: 'drums',
    hits: {
      conga: vrr(`${PERC}conga/Conga_22_HitN_{v}_rr{r}_Mid.wav`, { '51_100': 0.5, '101_127': 0.9 }),
      tumba: vrr(`${PERC}tumba/Tumba_24_HitN_{v}_rr{r}_Mid.wav`, { '41_70': 0.5, '101_127': 0.9 }),
      'bongo-high': vrr(`${PERC}bongoh/BongoH_Hit1_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 3: 0.9 }),
      'bongo-low': vrr(`${PERC}bongol/BongoL_Hit1_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 3: 0.9 }),
      shaker: [1, 2, 3].map((r) => [`${PERC}shaker/LShaker_Shake1D_rr${r}_Mid.wav`, 0.8]),
      tambourine: [1, 2, 3].map((r) => [`${PERC}tambourine/Tamb1_Shake_rr${r}_Mid.wav`, 0.8]),
      cowbell: vrr(`${PERC}cowbell/Cowbell1_Normal_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 3: 0.9 }),
      claves: vrr(`${PERC}claves/Claves1_Hit_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 3: 0.9 }),
      triangle: vrr(`${PERC}triangle/Triangle1_Hit_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 2: 0.9 }),
      agogo: vrr(`${PERC}agogo/Agogo_High_v{v}_rr{r}_Mid.wav`, { 1: 0.4, 3: 0.9 }),
      cabasa: vrr(`${PERC}cabasa/Cabasa1_Rub_v{v}_rr{r}_Mid.wav`, { 2: 0.8 }),
    },
  },
  'orchestra-kit': {
    from: 'vcsl',
    hits: {
      'bass-drum': [['Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_mp1.wav', 0.5], ['Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_ff.wav', 0.9]],
      timpani: [['Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav', 0.5], ['Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_v3_rr3_Sum.wav', 0.9]],
      snare: vrr('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v{v}_rr{r}_Mid.wav', { 3: 0.45, 6: 0.9 }),
      cymbal: [['Idiophones/Struck Idiophones/Clash Cymbals 1/cymbal_crash1_mf2.wav', 0.5], ['Idiophones/Struck Idiophones/Clash Cymbals 1/cymbal_crash1_ff2.wav', 0.9]],
      gong: [['Idiophones/Struck Idiophones/Gong 1/gong_2_f.wav', 0.6], ['Idiophones/Struck Idiophones/Gong 1/gong_fff.wav', 0.95]],
      woodblock: [['Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav', 0.5], ['Idiophones/Struck Idiophones/Woodblock/wood_click_f_rr1.wav', 0.9]],
      'frame-drum': [['Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v2_rr2_Sum.wav', 0.6]],
    },
    // the big drum (vsco's giant ethnic drum, played like a taiko) is in the other library
    more: {
      from: 'vsco',
      hits: {
        taiko: [['VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_f_1.wav', 0.6], ['VSCO 1 Percussion/drums/other/ethnic/giant/mallet/EthnicLargeMallet_hit_ff_1.wav', 0.95]],
        'taiko-rim': [['VSCO 1 Percussion/drums/other/ethnic/giant/EthnicLargeStick_rimshot_1.wav', 0.8], ['VSCO 1 Percussion/drums/other/ethnic/giant/EthnicLargeStick_rimshot_2.wav', 0.8]],
      },
    },
  },
};

// ---------- notes ----------

const NAMES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// 'A#3', 'ab4', 'Db4' to a midi note, with middle c (c4) at 60
function parseNote(name) {
  const m = /^([a-g])(#|b)?(-?\d)$/i.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const gmName = (midi) => `${FLATS[midi % 12]}${Math.floor(midi / 12) - 1}`;
const fileName = (midi) => `${FLATS[midi % 12].toLowerCase()}${Math.floor(midi / 12) - 1}`;

// the files a tonal folder wants, as [{ source, file, midi, vel, tune }]: a note every few semitones
// in range, each in every loudness layer
function pickNotes(spec, trees) {
  if (spec.gm) {
    const out = [];
    for (let midi = spec.low; midi <= spec.high; midi += spec.every || 3) out.push({ source: 'fluid', file: `${spec.gm}-mp3/${gmName(midi)}.mp3`, midi });
    return out;
  }
  return (spec.parts || [spec]).flatMap((part) => {
    const shift = 12 * (part.shift ?? spec.shift ?? 0);
    const found = [];
    for (const file of trees[part.from]) {
      if (!file.startsWith(part.dir)) continue;
      const m = part.match.exec(file.slice(part.dir.length));
      if (!m) continue;
      const noteAt = part.note ?? spec.note ?? 1;
      const layerAt = part.layer ?? spec.layer ?? 2;
      const midi = (typeof noteAt === 'function' ? noteAt(m) : parseNote(m[noteAt])) + shift;
      const layer = typeof layerAt === 'function' ? layerAt(m) : m[layerAt];
      const layers = part.layers ?? spec.layers;
      if (layers && !(layer in layers)) continue;
      if (Number.isNaN(midi) || midi < (part.low ?? spec.low ?? 0) || midi > (part.high ?? spec.high ?? 127)) continue;
      found.push({ source: part.from, file, midi, vel: layers ? layers[layer] : undefined, layer });
    }
    // every few semitones, from the bottom, always keeping the top note
    const every = part.every ?? spec.every ?? 3;
    const midis = [...new Set(found.map((one) => one.midi))].sort((a, b) => a - b);
    const kept = [];
    for (const midi of midis) if (!kept.length || midi - kept[kept.length - 1] >= every) kept.push(midi);
    if (midis.length && kept[kept.length - 1] !== midis[midis.length - 1]) {
      if (midis[midis.length - 1] - kept[kept.length - 1] < 2) kept.pop();
      kept.push(midis[midis.length - 1]);
    }
    const out = [];
    for (const midi of kept) {
      const seen = new Set();
      for (const one of found.filter((f) => f.midi === midi).sort((a, b) => a.file.localeCompare(b.file))) {
        if (seen.has(one.layer)) continue;
        seen.add(one.layer);
        out.push(one);
      }
    }
    return out;
  });
}

// ---------- audio ----------

function decode(file) {
  const run = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(`ffmpeg couldn't read ${file}: ${run.stderr}`);
  const bytes = run.stdout;
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
}

function encode(data, file) {
  const run = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '5', file], { input: Buffer.from(data.buffer, data.byteOffset, data.byteLength) });
  if (run.status !== 0) throw new Error(`ffmpeg couldn't write ${file}: ${run.stderr}`);
}

const peakOf = (data) => data.reduce((top, x) => Math.max(top, Math.abs(x)), 0);

// trims the silence before the note starts and after it's died away, and anything past seconds
// (faded, so it can't click)
function tidy(data, seconds) {
  const peak = peakOf(data);
  let start = data.findIndex((x) => Math.abs(x) > peak * 0.01);
  start = Math.max(0, start - Math.round(RATE * 0.003));
  let end = data.length;
  while (end > start && Math.abs(data[end - 1]) < peak * 0.001) end--;
  end = Math.min(end, start + Math.round(RATE * seconds));
  const out = data.slice(start, end);
  const fade = Math.min(out.length >> 2, Math.round(RATE * (end - start >= RATE * seconds ? 0.4 : 0.02)));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

// the pitch of a note in hz, by yin (de cheveigné and kawahara, 2002): how alike the wave is to
// itself shifted by each lag, the first deep dip being one cycle. measured at a few points just after
// the attack, and the middle one kept
function pitchOf(data) {
  const size = 2048;
  const minLag = Math.floor(RATE / 4500);
  const maxLag = Math.floor(RATE / 25);
  const peak = peakOf(data);
  const attack = Math.max(0, data.findIndex((x) => Math.abs(x) > peak * 0.3));
  const found = [];
  for (const after of [0.08, 0.15, 0.25, 0.35, 0.5]) {
    const at = attack + Math.round(RATE * after);
    if (at + size + maxLag >= data.length) break;
    const diff = new Float32Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < size; i++) {
        const d = data[at + i] - data[at + i + lag];
        sum += d * d;
      }
      diff[lag] = sum;
    }
    let running = 0;
    const norm = new Float32Array(maxLag + 1).fill(1);
    for (let lag = 1; lag <= maxLag; lag++) {
      running += diff[lag];
      norm[lag] = running ? (diff[lag] * lag) / running : 1;
    }
    let best = -1;
    for (let lag = minLag; lag < maxLag; lag++) {
      if (norm[lag] < 0.15) {
        while (lag + 1 < maxLag && norm[lag + 1] < norm[lag]) lag++;
        best = lag;
        break;
      }
    }
    if (best < 0) continue;
    // between samples: the bottom of a parabola through the dip
    const [a, b, c] = [norm[best - 1], norm[best], norm[best + 1]];
    const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
    found.push(RATE / (best + shift));
  }
  if (!found.length) return null;
  found.sort((x, y) => x - y);
  return found[found.length >> 1];
}
const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);

// ---------- downloading ----------

function git(args, cwd) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout;
}
// a clone with the file list but none of the files, which are downloaded one by one when wanted
// (local), from the commit the list came from
const COMMITS = {};
function tree(work, key) {
  const dir = path.join(work, key);
  if (!fs.existsSync(dir)) git(['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', `${SOURCES[key].git}.git`, dir], work);
  COMMITS[key] = git(['rev-parse', 'HEAD'], dir).trim();
  return git(['ls-tree', '-r', '--name-only', 'HEAD'], dir).split('\n').filter(Boolean);
}
// a file from a source, on this computer: downloaded the first time it's wanted
async function local(work, source, name) {
  const file = path.join(work, 'files', source, name);
  if (fs.existsSync(file)) return file;
  const encoded = name.split('/').map(encodeURIComponent).join('/');
  const url = source === 'fluid' ? SOURCES.fluid.url + encoded : `${SOURCES[source].git.replace('github.com', 'raw.githubusercontent.com')}/${COMMITS[source]}/${encoded}`;
  // github pages sometimes says it's busy (503): wait and try again
  let response;
  for (let tries = 0; tries < 5; tries++) {
    response = await fetch(url);
    if (response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 2000 * (tries + 1)));
  }
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

// a few at a time, so it's quick without hammering github
async function downloadAll(work, wanted) {
  const files = [];
  for (let i = 0; i < wanted.length; i += 6) files.push(...await Promise.all(wanted.slice(i, i + 6).map(([source, name]) => local(work, source, name))));
  return files;
}

// mtg's tuning: <region> ... sample=alt_f_01.$EXT ... tune=-21
async function mtgTunes(work, file) {
  const text = fs.readFileSync(await local(work, 'sax', file), 'utf8');
  const tunes = {};
  for (const line of text.split('\n')) {
    const sample = /sample=(\S+)\.\$EXT/.exec(line);
    if (sample) tunes[sample[1]] = Number(/tune=(-?\d+)/.exec(line)?.[1] || 0);
  }
  return tunes;
}

// ---------- building ----------

function sourcesOf(spec) {
  if (spec.gm) return ['fluid'];
  if (spec.hits) return [spec.from, ...(spec.more ? [spec.more.from] : [])];
  return [...new Set((spec.parts || [spec]).map((part) => part.from))];
}

function writeIndex(folder, spec, notes) {
  const sources = sourcesOf(spec).map((key) => SOURCES[key]);
  const index = {
    source: sources.map((one) => one.name).join('; '),
    link: sources.map((one) => one.git || one.url).join(' '),
    licence: [...new Set(sources.map((one) => one.licence))].join('; '),
  };
  if (spec.loop) index.loop = true;
  index.notes = notes;
  fs.writeFileSync(path.join(OUT, folder, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
}

// every note of a folder gets the same gain, so soft layers stay soft: the loudest is just under full
function level(sounds) {
  const top = Math.max(...sounds.map((one) => peakOf(one.data)));
  for (const one of sounds) for (let i = 0; i < one.data.length; i++) one.data[i] *= 0.9 / top;
}

async function buildTonal(work, folder, spec) {
  const notes = pickNotes(spec, TREES);
  const tunes = spec.tunes ? await mtgTunes(work, spec.tunes) : null;
  const files = await downloadAll(work, notes.map((note) => [note.source, note.file]));
  const sounds = [];
  const counts = {};
  for (const [i, note] of notes.entries()) {
    const data = tidy(decode(files[i]), spec.seconds || 4);
    const hz = pitchOf(data);
    const heard = hz ? midiOf(hz) : null;
    let tune = 0;
    if (tunes) tune = tunes[path.basename(note.file).replace(/\.\w+$/, '')] || 0;
    else if (heard !== null && spec.loop && Math.abs(heard - note.midi) < 0.35) tune = Math.round((note.midi - heard) * 100);
    if (heard === null) console.log(`  ${folder} ${fileName(note.midi)}: couldn't hear its pitch`);
    else if (Math.abs(heard - note.midi) > 0.5) {
      // a held note's pitch is clear, so one that measures off is a mislabelled file, and it's left
      // out (a neighbour covers it). struck and plucked notes have overtones that fool the check
      const drop = spec.loop && !spec.trust;
      console.log(`  ${folder} ${fileName(note.midi)}: sounds like ${heard.toFixed(2)}, named ${note.midi}${drop ? ', left out' : ''}`);
      if (drop) continue;
    }
    let name = fileName(note.midi) + (note.layer !== undefined && note.vel !== undefined ? `-${Math.round(note.vel * 10)}` : '');
    counts[name] = (counts[name] || 0) + 1;
    if (counts[name] > 1) name += `-${counts[name]}`;
    const entry = { file: `${name}.mp3`, midi: note.midi };
    if (note.vel !== undefined) entry.vel = note.vel;
    if (tune) entry.tune = tune;
    sounds.push({ data, entry });
  }
  level(sounds);
  fs.mkdirSync(path.join(OUT, folder), { recursive: true });
  for (const one of sounds) encode(one.data, path.join(OUT, folder, one.entry.file));
  writeIndex(folder, spec, sounds.map((one) => one.entry));
}

async function buildKit(work, folder, spec) {
  const sounds = [];
  for (const part of [spec, spec.more].filter(Boolean)) {
    for (const [hit, takes] of Object.entries(part.hits)) {
      const files = await downloadAll(work, takes.map(([file]) => [part.from, file]));
      takes.forEach(([, vel], i) => {
        const data = tidy(decode(files[i]), 6);
        sounds.push({ data, entry: { file: `${hit}-${i + 1}.mp3`, hit, vel } });
      });
    }
  }
  level(sounds);
  fs.mkdirSync(path.join(OUT, folder), { recursive: true });
  for (const one of sounds) encode(one.data, path.join(OUT, folder, one.entry.file));
  writeIndex(folder, spec, sounds.map((one) => one.entry));
}

const TREES = {};
(async () => {
  const [work, ...rest] = process.argv.slice(2);
  if (!work) {
    console.log('usage: node build-samples.js <work folder> [--list | --probe | folders...]');
    process.exit(1);
  }
  fs.mkdirSync(work, { recursive: true });
  const mode = rest[0]?.startsWith('--') ? rest.shift() : 'build';
  const wanted = rest.length ? rest : [...Object.keys(FOLDERS), ...Object.keys(KITS)];
  for (const folder of wanted) {
    const spec = FOLDERS[folder] || KITS[folder];
    if (!spec) throw new Error(`no folder called ${folder}`);
    for (const key of sourcesOf(spec)) if (SOURCES[key].git && !TREES[key]) TREES[key] = tree(work, key);
  }
  for (const folder of wanted) {
    const spec = FOLDERS[folder] || KITS[folder];
    if (mode === '--list') {
      if (spec.hits) console.log(folder, Object.keys(spec.hits).join(' '));
      else console.log(folder, pickNotes(spec, TREES).map((n) => `${n.midi}${n.vel !== undefined ? `@${n.vel}` : ''}`).join(' '));
    } else if (mode === '--probe') {
      if (spec.hits) continue;
      for (const part of spec.parts || [spec]) {
        const notes = pickNotes(spec.parts ? { ...spec, parts: [part] } : spec, TREES);
        for (const note of [notes[0], notes[notes.length >> 1], notes[notes.length - 1]]) {
          const hz = pitchOf(tidy(decode(await local(work, note.source, note.file)), 4));
          console.log(`${folder.padEnd(15)} ${path.basename(note.file).padEnd(40)} named ${note.midi}, sounds like ${hz ? midiOf(hz).toFixed(2) : '?'}`);
        }
      }
    } else {
      console.log(`building ${folder}`);
      if (spec.hits) await buildKit(work, folder, spec);
      else await buildTonal(work, folder, spec);
    }
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
