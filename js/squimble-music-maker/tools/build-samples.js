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
  // the second round: electric pianos, a second electric and acoustic guitar, a double bass, and two
  // real drum machines. (the 909 set on the same site says it can't be passed on for profit, and the
  // jrhodes set is non commercial, so neither is here: squimble quest might be sold one day)
  epianos: { git: 'https://github.com/sfzinstruments/GregSullivan.E-Pianos', name: "Greg Sullivan's E-Pianos (Wurlitzer EP200, Yamaha CP80, Hohner Pianet T)", licence: 'CC BY 3.0' },
  shiny: { git: 'https://github.com/sfzinstruments/karoryfer.shinyguitar', name: 'Shiny Guitar (Karoryfer Samples)', licence: 'CC0 1.0' },
  meat: { git: 'https://github.com/sfzinstruments/karoryfer.meatbass', name: 'Meatbass (Karoryfer Samples)', licence: 'CC0 1.0' },
  // michael fischer's tr-808 recordings say they're free with no restrictions, and francois dion's
  // tr-707 ones that they're public domain
  machines: { git: 'https://github.com/fluid-music/open-drums', name: "Roland TR-808 (Michael Fischer) and TR-707 (Francois Dion) recordings, via fluid-music's open-drums", licence: 'Free, no restrictions (TR-808); public domain (TR-707)' },
  // the third round: the world, the ancient world, pop and some places. more of karoryfer's (a
  // bagpipe, ghana's bobobo drums and a cajon, a 70s kit through an old microphone, a medieval lyre,
  // and body percussion), all cc0
  squidpipes: { git: 'https://github.com/sfzinstruments/karoryfer.squidpipes', name: 'Squidpipes (Karoryfer Samples)', licence: 'CC0 1.0' },
  gogodze1: { git: 'https://github.com/sfzinstruments/karoryfer.gogodze-phu-vol-i', name: 'Gogodze Phu Vol I (Karoryfer Samples)', licence: 'CC0 1.0' },
  gogodze2: { git: 'https://github.com/sfzinstruments/karoryfer.gogodze-phu-vol-ii', name: 'Gogodze Phu Vol II (Karoryfer Samples)', licence: 'CC0 1.0' },
  cithara: { git: 'https://github.com/sfzinstruments/cithara-barbarica', name: 'Cithara Barbarica (sfzinstruments)', licence: 'CC0 1.0' },
  body: { git: 'https://github.com/sfzinstruments/body_percussion', name: 'Body Percussion (sfzinstruments)', licence: 'CC0 1.0' },
  // single recordings from freesound, each from its preview (an mp3 anyone can download). the ones
  // that are cc by need a credit, which is at the bottom of squimble-music-maker.html
  bram: { url: 'https://cdn.freesound.org/previews/', name: 'Alfonso Pérez singing Tuvan kargyraa and sygyt, recorded at the MTG by Bram (freesound.org/people/Bram)', licence: 'CC BY 4.0' },
  nemaavla: { url: 'https://cdn.freesound.org/previews/', name: 'Overtone singing, khoomei, by nemaavla (freesound.org/people/nemaavla)', licence: 'CC0 1.0' },
  gamelan: { url: 'https://cdn.freesound.org/previews/', name: 'Javanese Gamelan, a pelog bonang and bonang panerus, by Iain McCurdy (freesound.org/people/iainmccurdy)', licence: 'CC BY 4.0' },
  deathwhistle: { url: 'https://cdn.freesound.org/previews/', name: 'Aztec Death Whistle by Guy_Personface (freesound.org/people/Guy_Personface)', licence: 'CC0 1.0' },
  whale: { url: 'https://cdn.freesound.org/previews/', name: 'LowWhalesong by RebekahDay (freesound.org/people/RebekahDay)', licence: 'CC0 1.0' },
  scratch: { url: 'https://cdn.freesound.org/previews/', name: 'Dj_Puzzle_Scratch_05 by SaschaRettberg (freesound.org/people/SaschaRettberg)', licence: 'CC0 1.0' },
  rainstick: { url: 'https://cdn.freesound.org/previews/', name: 'Rainstick 39 sec by AncientOracle (freesound.org/people/AncientOracle)', licence: 'CC0 1.0' },
  conch: { url: 'https://cdn.freesound.org/previews/', name: 'Snailhorn by Ohrwurm (freesound.org/people/Ohrwurm)', licence: 'CC0 1.0' },
  bowls: { url: 'https://cdn.freesound.org/previews/', name: 'Singing bowls, a and c tuned, by brodjaman (freesound.org/people/brodjaman)', licence: 'CC0 1.0' },
  sistrum: { url: 'https://cdn.freesound.org/previews/', name: 'sistrum by memexikon (freesound.org/people/memexikon)', licence: 'CC0 1.0' },
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

  // ----- the second round: the gaps the first round left, and second recordings to choose from -----
  // the instruments that were still synthesised
  ocarina: { gm: 'ocarina', low: 60, high: 96, loop: true },
  'clay-ocarina': { from: 'vcsl', shift: 1, dir: 'Aerophones/Edge-blown Aerophones/Ocarina, Typical/Sustains/Sus/', match: /_Sus_([A-G]#?\d)\.wav$/, every: 2, loop: true, seconds: 4 },
  // a baroque soprano recorder: the nearest thing to a tin whistle in a free library
  recorder: { from: 'vcsl', shift: 1, dir: 'Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/', match: /_Sus_([A-G]#?\d)_rr1_Main\.wav$/, every: 2, loop: true, seconds: 4 },
  whistle: { gm: 'whistle', low: 60, high: 96, loop: true },
  // a shehnai is a shawm, the double reed of the bazaar and the wedding band
  shehnai: { gm: 'shanai', low: 55, high: 91, loop: true },
  // a reed organ is a harmonium's western cousin, the same pumped free reeds
  'reed-organ': { gm: 'reed_organ', low: 41, high: 84, loop: true },
  // a bandoneon: a single bank of free reeds under keys, the closest free recording to a melodica
  bandoneon: { gm: 'tango_accordion', low: 48, high: 88, loop: true },
  // a strumstick, a three string fretted dulcimer, plucked with the fingers: woody and nasal, the nearest
  // free recording to an oud
  strumstick: { from: 'vcsl', shift: 1, dir: 'Chordophones/Composite Chordophones/Strumstick/', match: /_Main_([A-G]#?\d)_(vl2|vl3)_rr1\.wav$/, layers: { vl2: 0.5, vl3: 0.9 }, seconds: 3 },
  // tubular bells, the orchestra's church bells
  'tubular-bells': { from: 'vcsl', shift: 1, dir: 'Idiophones/Struck Idiophones/Tubular Bells 2/', match: /^TB_hit_([A-G]#?\d)_(v2|v4)_\d\.wav$/, layers: { v2: 0.45, v4: 0.9 }, seconds: 6 },
  // hand chimes: tuned bars with a soft clapper, pure and sweet, for the gentle bells
  'hand-chimes': { from: 'vcsl', shift: 1, dir: 'Idiophones/Struck Idiophones/Hand Chimes/', match: /^sus_([A-G]#?\d)_r01_main\.wav$/, every: 2, seconds: 5 },
  // new instruments
  xylophone: { from: 'vcsl', shift: 1, dir: 'Idiophones/Struck Idiophones/Xylophone/Medium Mallets/', match: /^Xylo_Medium_([A-G]#?\d)_(pp|ff)_01_far\.wav$/, layers: { pp: 0.4, ff: 0.9 }, every: 1, seconds: 2 },
  harpsichord: { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Harpsichord, Flemish/Sustains/Low/', match: /_Low_Far_([A-G]#?\d)_rr1\.wav$/, seconds: 4 },
  wurlitzer: { from: 'epianos', dir: 'Wurlitzer EP200/Samples/', match: /^([a-g]b?\d)(mp|f)\.flac$/, layers: { mp: 0.45, f: 0.9 }, seconds: 4 },
  // the 808's kick with its decay turned right up, tuned to a g: the long, booming bass under trap and
  // half the club records since. only one note, so it's stretched further than other recordings
  '808-bass': { from: 'machines', files: [['tr-808/TR808WAV/BDTuned/BD0010-g1.wav', 31, 0.45], ['tr-808/TR808WAV/BDTuned/BD2510-g1.wav', 31, 0.9]], seconds: 4 },
  // second recordings, to choose between on the page
  'cp80': { from: 'epianos', dir: 'CP80/Samples/', match: /^\d+-([A-G]#?\d)-(PP|F)\.flac$/, layers: { PP: 0.35, F: 0.9 }, low: 28, high: 100, seconds: 5 },
  pianet: { from: 'epianos', dir: 'Pianet T/Samples/', match: /^\d+_([A-G]#?\d)_(P|FF)\.flac$/, layers: { P: 0.4, FF: 0.9 }, seconds: 3 },
  'dx-piano': { gm: 'electric_piano_2', low: 33, high: 100 },
  'fm-piano': { from: 'vcsl', low: 28, dir: 'Electrophones/TX81Z/FM Piano/', match: /^FMPiano_([A-G]#?\d)_(vl1|vl3)\.wav$/, layers: { vl1: 0.35, vl3: 0.9 }, seconds: 4 },
  'shiny-guitar': { from: 'shiny', dir: 'Samples/electric/', match: /^([a-g]b?\d)_(vl2|vl4)_rr1_\d\.wav$/, layers: { vl2: 0.4, vl4: 0.9 }, seconds: 5 },
  'shiny-acoustic': { from: 'shiny', dir: 'Samples/acoustic/', match: /^([a-g]b?\d)_(vl2|vl4)_rr1_\d\.wav$/, layers: { vl2: 0.4, vl4: 0.9 }, seconds: 5 },
  'meat-bass': { from: 'meat', dir: 'Samples/pizz/', match: /^([a-g]b?\d)_(vl\d)_rr1\.wav$/, layers: { vl2: 0.45, vl4: 0.9 }, seconds: 3 },
  'folk-harp': { from: 'vcsl', shift: 1, dir: 'Chordophones/Composite Chordophones/Folk Harp/', match: /^EWHarp_Normal_([A-G]#?\d)_(v2|v3)_RR1\.wav$/, layers: { v2: 0.45, v3: 0.9 }, seconds: 4 },
  balafon: { from: 'vcsl', shift: 1, dir: 'Idiophones/Struck Idiophones/Balafon/Traditional Mallet/', match: /_([A-G]#?\d)_vl(1|3)_rr1_Mid\.wav$/, layers: { 1: 0.4, 3: 0.9 }, seconds: 3 },

  // ----- the third round: the world, the ancient world, pop and some places -----
  // throat singing. one singer holds a low note while the shape of his mouth picks out its overtones as
  // a whistled tune above it, so a take works as a drone: retuned to the song's home note, every
  // overtone moves with it and stays in tune. files are [preview, the note it's nearest, loudness, the
  // second the take starts (past any breath), cents it's out by (measured)]. khoomei and sygyt are the
  // higher, whistling styles, kargyraa the low growl an octave under the voice
  khoomei: { from: 'nemaavla', files: [['240/240916_2007100-hq.mp3', 54, undefined, 0.2, 4]], loop: true, seconds: 11, trust: true },
  sygyt: { from: 'bram', files: [['19/19534_2-hq.mp3', 55, undefined, 14.2, -39], ['19/19530_2-hq.mp3', 58, undefined, 1, 25]], loop: true, seconds: 11.5, trust: true },
  kargyraa: { from: 'bram', files: [['19/19527_2-hq.mp3', 39, undefined, 1, 37]], loop: true, seconds: 14, trust: true },
  // a didgeridoo's held drone, three takes of its one note (about c sharp 2), played in turn
  didgeridoo: { from: 'vcsl', files: [[2, 1], [3, 12], [8, -44]].map(([n, tune]) => [`Aerophones/Lip Aerophones/Didgeridoo/Didgeridoo1_Sus${n}_Main.wav`, 37, undefined, 0, tune]), loop: true, seconds: 8, trust: true },
  // bagpipes whose bag is a giant squid's mantle (really): the chanter, loud and reedy
  bagpipe: { from: 'squidpipes', shift: -1, dir: 'Samples/long_clean/', match: /^([a-g]b?\d)_long_clean\.wav$/, loop: true, seconds: 4 },
  'gm-bagpipe': { gm: 'bagpipe', low: 55, high: 84, loop: true },
  // a mbira dzavadzimu from zimbabwe: metal keys on a board, plucked with the thumbs, buzzing a little
  mbira: { from: 'vcsl', shift: 1, dir: 'Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B/', match: /_Main_([A-G]#?\d)_\d+_50_100_rr\d\.wav$/, seconds: 3 },
  // a medieval lyre with metal strings, plucked with the fingers
  lyre: { from: 'cithara', dir: 'Samples/finger/', match: /^cithara_([a-g]b?\d)_finger_rr1\.wav$/, every: 2, seconds: 4 },
  // wine glasses rubbed round their rims: four notes, pure and eerie
  'wine-glass': { from: 'vcsl', shift: 1, dir: 'Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow/', match: /^glass\d_([A-G]#?\d)_Slow_\d_[Mm]ain\.wav$/, every: 1, loop: true, seconds: 6, measure: true },
  // a bowed psaltery: a triangle of strings bowed one at a time, thin and ghostly
  'bowed-psaltery': { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/', match: /^BowedPsaltery_([A-G]#?\d)_Main_LongBow_rr\d\.wav$/, every: 2, loop: true, seconds: 5 },
  // a renaissance chamber organ, its 8' pipes: smaller and breathier than a church organ
  'renaissance-organ': { from: 'vcsl', shift: 1, dir: "Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/", match: /_Room_([A-G]#?\d)_rr1\.wav$/, loop: true, seconds: 4 },
  // a javanese gamelan's bonang (kettle gongs in a row) and the bonang panerus an octave above, in
  // pelog. its notes fall between a piano's, so each is labelled by its measured pitch and played in tune
  // (measure). the panerus's top four fooled the pitch check, so they're left out
  bonang: { from: 'gamelan', files: [196, 197, 198, 199, 200, 201, 202, 203, 204, 205].map((n, i) => [`676/676${n}_3655844-hq.mp3`, 74 + i * 1.6]), seconds: 4, measure: true },
  // the general midi set's, where nothing else had them: an oboe (and the ancient world's aulos, its
  // ancestor), a bassoon, a blown bottle, the orchestra hit (hip hop's stab), disco's string machine, a
  // honky tonk piano for the saloon, and a fiddle
  oboe: { gm: 'oboe', low: 58, high: 91, loop: true },
  bassoon: { gm: 'bassoon', low: 34, high: 72, loop: true },
  'blown-bottle': { gm: 'blown_bottle', low: 60, high: 96, loop: true },
  'orchestra-hit': { gm: 'orchestra_hit', low: 48, high: 84 },
  'synth-strings': { gm: 'synth_strings_1', low: 36, high: 96, loop: true },
  'honky-tonk': { gm: 'honkytonk_piano', low: 28, high: 100 },
  fiddle: { gm: 'fiddle', low: 55, high: 96, loop: true },
  // a singing bowl rubbed round its rim, tuned, for the underwater and temple scenery
  'singing-bowl': { from: 'bowls', files: [['204/204915_710671-hq.mp3', 46], ['204/204917_710671-hq.mp3', 75]], seconds: 12, measure: true },
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
  // the same kit from its close microphones (the kick and snare mics, the overheads for the cymbals):
  // dry and punchy, for the tight kit
  'tight-kit': {
    from: 'drums',
    hits: {
      kick: kit('kickmic').hits.kick,
      snare: kit('snaremic').hits.snare,
      rim: kit('snaremic').hits.rim,
      hat: kit('oh').hits.hat,
      'open-hat': kit('oh').hits['open-hat'],
      'low-tom': kit('mid').hits['low-tom'],
      crash: kit('oh').hits.crash,
    },
  },
  // a real roland tr-808, each sound with its knobs half way: the club kit
  tr808: {
    from: 'machines',
    hits: Object.fromEntries(Object.entries({ kick: 'BD/BD5075', 'short-kick': 'BD/BD2525', snare: 'SD/SD5050', clap: 'CP/CP', hat: 'CH/CH', 'open-hat': 'OH/OH50', rim: 'RS/RS', 'low-tom': 'LT/LT50', cowbell: 'CB/CB', crash: 'CY/CY5050', claves: 'CL/CL', maracas: 'MA/MA', conga: 'MC/MC50' })
      .map(([hit, file]) => [hit, [[`tr-808/TR808WAV/${file}.WAV`, 0.9]]])),
  },
  // a tr-707, the cheaper drum machine of the mid 80s, sampled where the 808 was analogue: post-punk's
  // drum machine (the cure, new order), and the "drum machine" kit
  tr707: {
    from: 'machines',
    hits: Object.fromEntries(Object.entries({ kick: ['BassDrum1'], snare: ['Snare1', 'Snare2'], hat: ['HhC'], 'open-hat': ['HhO'], rim: ['RimShot'], 'low-tom': ['LowTom'], crash: ['Crash'], ride: ['Ride'], clap: ['HandClap'], cowbell: ['CowBell'], tambourine: ['Tamb'] })
      .map(([hit, files]) => [hit, files.map((file) => [`tr-707/TR707WAV/${file}.wav`, 0.9])])),
  },

  // ----- the third round -----
  // bobobo drums from ghana: a bass drum and two each of tenor and treble drums, open (l) and slapped
  // (s), and a cajon (a box drum: its bass in the middle, its snare wires cracking at the edge)
  bobobo: {
    from: 'gogodze1',
    hits: {
      bass: vrr('Samples/bobobo/bobobo_bass_vl{v}_rr{r}.wav', { 2: 0.45, 4: 0.9 }),
      tenor: vrr('Samples/bobobo/bobobo_tenor_l_vl{v}_rr{r}.wav', { 2: 0.45, 4: 0.9 }),
      'tenor-slap': vrr('Samples/bobobo/bobobo_tenor_s_vl{v}_rr{r}.wav', { 2: 0.45, 4: 0.9 }),
      treble: vrr('Samples/bobobo/bobobo_treble_l_vl{v}_rr{r}.wav', { 2: 0.45, 4: 0.9 }),
      'treble-slap': vrr('Samples/bobobo/bobobo_treble_s_vl{v}_rr{r}.wav', { 2: 0.45, 4: 0.9 }),
    },
  },
  cajon: {
    from: 'gogodze1',
    hits: {
      bass: vrr('Samples/cajon/dyn/cajon_sl1_vl{v}_rr{r}_dyn.wav', { 2: 0.45, 4: 0.9 }),
      mid: vrr('Samples/cajon/dyn/cajon_sl3_vl{v}_rr{r}_dyn.wav', { 2: 0.45, 4: 0.9 }),
      slap: vrr('Samples/cajon/dyn/cajon_sl5_vl{v}_rr{r}_dyn.wav', { 2: 0.45, 4: 0.9 }),
      side: vrr('Samples/cajon/dyn/cajon_sr1_vl{v}_rr{r}_dyn.wav', { 2: 0.45, 4: 0.9 }),
    },
  },
  // a 1970s kit through an old microphone (karoryfer aimed it at kim jung mi's "now"): the dusty drums
  // boom bap was sampled from
  'retro-kit': {
    from: 'gogodze2',
    hits: Object.fromEntries(Object.entries({ kick: 'ks', snare: 'sc', rim: 'ss', hat: 'hc', 'open-hat': 'ho', 'low-tom': 'tl' })
      .map(([hit, name]) => [hit, vrr(`Samples/retro_mic/${name}_vl{v}_rr{r}.wav`, { 2: 0.45, 4: 0.9 })])),
  },
  // body percussion: stomps, claps, snaps, a chest thumped
  body: {
    from: 'body',
    hits: Object.fromEntries(Object.entries({ stomp: 'stomp_l', clap: 'handclap', snap: 'snap_r', chest: 'chestthump_l', belly: 'bellycenter_l', thigh: 'heel_r' })
      .map(([hit, name]) => [hit, [1, 2, 3].map((r) => [`Samples/body/${name}${name.startsWith('snap') ? '' : '_vl2'}_rr${r}.wav`, 0.8])])),
  },
  // the rest of the world's percussion: a darbuka's five strokes, a frame drum, a log drum (slit drum),
  // finger cymbals, clapping, a gourd scraper, nepalese hand bells, a sleigh bell, a brake drum and an
  // anvil (the junkyard's), a big bass drum, and an egyptian sistrum
  'world-percussion': {
    from: 'vcsl',
    hits: {
      ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`darbuka-${n}`, [1, 2].map((v) => [`Membranophones/Struck Membranophones/Darbuka/Darbuka_${n}_hit_vl${v}_rr1.wav`, v === 1 ? 0.45 : 0.9])])),
      'frame-drum': [2, 3].map((v) => [`Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v${v}_rr1_Sum.wav`, v === 2 ? 0.45 : 0.9]),
      'frame-high': [2, 3].map((v) => [`Membranophones/Struck Membranophones/Frame Drum/HDrumS_Hit_v${v}_rr1_Sum.wav`, v === 2 ? 0.45 : 0.9]),
      'slit-high': [1, 3].map((v) => [`Idiophones/Struck Idiophones/Slit Drum/LogDrumHi_MedM_v${v}_rr1_Sum.wav`, v === 1 ? 0.45 : 0.9]),
      'slit-low': [1, 3].map((v) => [`Idiophones/Struck Idiophones/Slit Drum/LogDrumLo_MedM_v${v}_rr1_Sum.wav`, v === 1 ? 0.45 : 0.9]),
      'finger-cymbals': [['Idiophones/Struck Idiophones/Finger Cymbals/Fing_Cymb.wav', 0.8]],
      clap: [1, 2, 3].map((r) => [`Idiophones/Struck Idiophones/Claps/Clap_rr${r}.wav`, 0.8]),
      guiro: [1, 2].map((r) => [`Idiophones/Struck Idiophones/Guiro/Guiro_Hit_rr${r}_Mid.wav`, 0.8]),
      'hand-bells': [1, 2, 3].map((n) => [`Idiophones/Struck Idiophones/Hand Bells, Nepalese/HB_${n}.wav`, 0.8]),
      'sleigh-bells': [1, 2].map((r) => [`Idiophones/Struck Idiophones/Sleigh Bells/Sleighbells_Hit_rr${r}_Mid.wav`, 0.8]),
      'brake-drum': [1, 3].map((v) => [`Idiophones/Struck Idiophones/Brake Drum/BrakeDrum1_Hammer_v${v}_rr1_Mid.wav`, v === 1 ? 0.45 : 0.9]),
      anvil: [1, 3].map((v) => [`Idiophones/Struck Idiophones/Anvil/Anvil_Hit1_v${v}_rr1_Mid.wav`, v === 1 ? 0.45 : 0.9]),
      'big-shaker': [1, 2].map((r) => [`Idiophones/Struck Idiophones/Shaker, Large/LShaker_Hit_rr${r}_Mid.wav`, 0.8]),
      'bass-drum': [2, 5].map((v) => [`Membranophones/Struck Membranophones/Bass Drum 1/BDrumNew_hit_v${v}_rr1_Sum.wav`, v === 2 ? 0.45 : 0.9]),
    },
    more: { from: 'sistrum', hits: { sistrum: [['0/699_551-hq.mp3', 0.8]] } },
  },
  // scenery recorded rather than synthesised: one long recording cut where it goes quiet into events
  // (split: the most to keep and the longest one can be, in seconds), played now and then
  'death-whistle': { from: 'deathwhistle', hits: { event: [['832/832472_2825355-hq.mp3', 0.8, { split: { most: 8, longest: 5 } }]] } },
  whale: { from: 'whale', hits: { event: [['171/171945_3206712-hq.mp3', 0.8, { split: { most: 3, longest: 7 } }]] } },
  scratches: { from: 'scratch', hits: { event: [['661/661407_14498354-hq.mp3', 0.8, { split: { most: 6, longest: 2.5, gap: 0.08 } }]] } },
  rainstick: { from: 'rainstick', hits: { event: [['476/476851_8152631-hq.mp3', 0.8, { split: { most: 4, longest: 7 } }]] } },
  conch: { from: 'conch', hits: { event: [['64/64830_866470-hq.mp3', 0.8, { split: { most: 5, longest: 8 } }]] } },
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
  // files: picked by hand, [path, midi, loudness, the second to start from, cents out of tune]
  if (spec.files) return spec.files.map(([file, midi, vel, start = 0, tune = 0]) => ({ source: spec.from, file, midi, vel, layer: vel, start, tune }));
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
  const url = SOURCES[source].url ? SOURCES[source].url + encoded : `${SOURCES[source].git.replace('github.com', 'raw.githubusercontent.com')}/${COMMITS[source]}/${encoded}`;
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
    const data = tidy(decode(files[i]).subarray(Math.round((note.start || 0) * RATE)), spec.seconds || 4);
    const hz = pitchOf(data);
    const heard = hz ? midiOf(hz) : null;
    let tune = note.tune || 0;
    // measure: tuned its own way (a gamelan, wine glasses), so it's named by the note it's nearest and
    // tuned the rest of the way
    if (spec.measure && heard !== null) {
      note.midi = Math.round(heard);
      tune = Math.round((note.midi - heard) * 100);
    } else note.midi = Math.round(note.midi);
    if (tunes) tune = tunes[path.basename(note.file).replace(/\.\w+$/, '')] || 0;
    else if (!note.tune && !spec.measure && heard !== null && spec.loop && Math.abs(heard - note.midi) < 0.35) tune = Math.round((note.midi - heard) * 100);
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

// a long recording cut into its events (a call, a scream, a scratch) where it goes quiet: runs of 50 ms
// steps louder than a tenth of its loud level, joined over gaps shorter than gap seconds. the most
// events kept are spread across the recording, each at most longest seconds (faded off)
function events(data, { most, longest, gap = 0.25 }) {
  const hop = Math.round(RATE * 0.05);
  const levels = [];
  for (let at = 0; at + hop <= data.length; at += hop) {
    let sum = 0;
    for (let i = at; i < at + hop; i++) sum += data[i] * data[i];
    levels.push(Math.sqrt(sum / hop));
  }
  const loud = [...levels].sort((a, b) => a - b)[Math.floor(levels.length * 0.95)];
  const runs = [];
  let start = -1;
  let quiet = 0;
  levels.forEach((level, i) => {
    if (level > loud * 0.1) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0 && ++quiet * 0.05 > gap) {
      runs.push([start, i - quiet + 1]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, levels.length]);
  const long = runs.filter(([a, z]) => (z - a) * 0.05 >= 0.3);
  const kept = long.length <= most ? long : Array.from({ length: most }, (_, k) => long[Math.floor((k * long.length) / most)]);
  return kept.map(([a, z]) => tidy(data.slice(Math.max(0, a * hop - Math.round(RATE * 0.02)), Math.min(data.length, (z + 2) * hop)), longest));
}

async function buildKit(work, folder, spec) {
  const sounds = [];
  for (const part of [spec, spec.more].filter(Boolean)) {
    for (const [hit, takes] of Object.entries(part.hits)) {
      const files = await downloadAll(work, takes.map(([file]) => [part.from, file]));
      let n = 0;
      takes.forEach(([, vel, how = {}], i) => {
        const whole = decode(files[i]);
        for (const data of how.split ? events(whole, how.split) : [tidy(whole, 6)]) sounds.push({ data, entry: { file: `${hit}-${++n}.mp3`, hit, vel } });
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
