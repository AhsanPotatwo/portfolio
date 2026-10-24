// builds the recorded instruments in assets/squimble-music-maker/samples/ from free sample libraries.
// each folder gets a few notes of one instrument (every few semitones, sometimes soft and loud) as
// small mono mp3s, plus an index.json saying which note each file is and where it came from. synth.js
// loads them (loadSamples) and plays the nearest one, retuned.
//
//   node js/squimble-music-maker/tools/build-samples.js <work folder> [folders...]
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --list    what it would take
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --probe   checks the octaves
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --moves [folders...]   adds recorded moves (buildMoves)
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
  // the fourth round: real scenery. the synthesised rain, sea, fire, brook, birds, owl, frogs, drips,
  // creaks, leaves, wind and far off thunder got recordings, and there's new scenery for silent hill's
  // fog (radio static, a siren, metal clanging, chains, footsteps, crows), minecraft's nether (lava)
  // and a city's machines (a factory, steam). all cc0, from freesound
  ...Object.fromEntries([
    ['rain', 'Rain light 2 (rural) by jmbphilmes'], ['ocean', 'Ocean Waves by Noted451'], ['fire', 'Crackling Fire by samarobryn'],
    ['stream', 'Creek 06 (loop) by VKProduktion'], ['birds', 'Birds In The Morning by BurghRecords'], ['owl', 'Owl hoots by Gerent'],
    ['frogs', 'Nature sounds frog 1 by Sandermotions'], ['drips', 'Water Dripping in Cave by Sclolex'],
    ['creaks', 'Long Metal Creak by LoafDV, Metal Creak 4 by ingudios and Metallic Groan by hinchinbrook'],
    ['leaves', 'Rustling leaves by giddster, Leaves_Rustling_Edited by AmberdeMeillon and leaves.mp3 by DSOADigital'],
    ['wind', 'Wind Gust by crashoverride6, gust of wind by Tony B kksm and Winter Winds by UrsaDaBear'],
    ['thunder', 'Distant Thunder Clap_Gentle by mikala_oidua and distant thunder by moxobna'], ['lava', 'Lava Loop 4 by Fission9'],
    ['static', 'Radio Interference/Static by harveyjnz and tv channel change static blips by kyles'], ['siren', 'Air Raid Siren Alarm by Poligonstudio'],
    ['clanks', 'SFX Metal Shed Door - Hits, Clangs, Rattle by EpicWizard'], ['chains', 'ChainsRattling by klakmart and chain by nettimato'],
    ['crows', 'Crows_01 by Q.K. and Crows by ken788'], ['footsteps', 'SlowStepsOnGravel by tabiCATcreations'],
    ['factory', 'Large Warehouse/Factory Ambience by fimrod'], ['steam', 'Air (or steam) pressure release by brunoboselli and Steam.wav by sniperous'],
  ].map(([key, name]) => [`fs-${key}`, { url: 'https://cdn.freesound.org/previews/', name: `${name} (freesound.org)`, licence: 'CC0 1.0' }])),
  // the fifth round: real recordings for the sounds that still came from the general midi set (the
  // nylon guitar, the voices, the banjo, the oboe and bassoon), and second and third recordings of the
  // commonest instruments, so two songs on the same instrument don't sound the same. the university of
  // iowa's recordings say they "may be downloaded and used for any projects, without restrictions"
  iowa: { url: 'https://theremin.music.uiowa.edu/sound%20files/MIS/Piano_Other/guitar/', name: 'University of Iowa Electronic Music Studios, Musical Instrument Samples (a Raimundo 118 classical guitar)', licence: 'Free for any use, without restrictions' },
  hadzi: { git: 'https://github.com/sfzinstruments/legato_vocal_tutorial', name: "Hadzi-Fia's sung a vowel (Karoryfer Samples), via sfzinstruments' legato vocal", licence: 'CC0 1.0' },
  cello: { git: 'https://github.com/sfzinstruments/karoryfer-bigcat.cello', name: 'Karoryfer x Bigcat cello (Karoryfer Samples and Bigcat Instruments)', licence: 'CC0 1.0' },
  ganjo: { git: 'https://github.com/sfzinstruments/ganjo', name: 'Ganjo, a guitar banjo (sfzinstruments)', licence: 'CC0 1.0' },
  zither: { git: 'https://github.com/sfzinstruments/hungarian_zither', name: 'Hungarian zither (sfzinstruments)', licence: 'CC0 1.0' },
  growly: { git: 'https://github.com/sfzinstruments/karoryfer.growlybass', name: 'Growlybass (Karoryfer Samples)', licence: 'CC0 1.0' },
  pasta: { git: 'https://github.com/sfzinstruments/karoryfer.pastabass', name: 'Pastabass (Karoryfer Samples)', licence: 'CC0 1.0' },
  sneaky: { git: 'https://github.com/sfzinstruments/karoryfer.sneakybass', name: 'Sneakybass (Karoryfer Samples)', licence: 'CC0 1.0' },
  weresax: { git: 'https://github.com/sfzinstruments/karoryfer.weresax', name: 'Weresax (Karoryfer Samples)', licence: 'CC0 1.0' },
  splendid: { git: 'https://github.com/sfzinstruments/SplendidGrandPiano', name: 'Splendid Grand Piano (Akai, mapped by kinwie)', licence: 'Public domain' },
  // a second general midi set, for the choirs and the rhodes: its recordings are different ones from
  // fluidr3's, which is the point. cc by-sa 3.0: these files can go in a game, with a credit, and
  // anyone can share them on the same terms
  hum: { url: 'https://cdn.freesound.org/previews/', name: 'Humming C D A by drotzruhn (freesound.org)', licence: 'CC0 1.0' },
  sharon: { url: 'https://cdn.freesound.org/previews/', name: 'Music, Sharon Sings Notes and Shouts by CHallSmith (freesound.org)', licence: 'CC0 1.0' },
  musyng: { url: 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/', name: 'Musyng Kite soundfont, via midi-js-soundfonts', licence: 'CC BY-SA 3.0' },
  // the voices round: a woman singing long notes, from her takes on freesound
  owstu: { url: 'https://cdn.freesound.org/previews/', name: 'Female Voc Long Notes, female vocal long and vocal C sharp long by owstu (freesound.org)', licence: 'CC0 1.0' },
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

  // ----- the fifth round: real recordings where the general midi set stood in, and more to choose from -----
  // a real classical guitar, three loudnesses. each of iowa's files is a run of notes up one string
  // (runs: [file, its first note, loudness]), cut where it goes quiet. one string per octave, so a run
  // of notes keeps one colour: the low e, then the a, the g and the high e
  'iowa-nylon': {
    from: 'iowa', every: 2, seconds: 4,
    // (the loud run up the high e stops a note early, at b flat)
    runs: ['pp', 'mf', 'ff'].flatMap((dyn, v) => [['sulE.E2B2', 40], ['sulA.C3B3', 48], ['sulG.C4B4', 60], [dyn === 'ff' ? 'sul_E.C5Bb5' : 'sul_E.C5B5', 72]]
      .map(([run, first]) => [`Guitar.${dyn}.${run}.mono.aif`, first, [0.3, 0.6, 0.9][v]])),
  },
  // real voices, sung, so they glide between notes (singLine in synth.js). a man singing ah, low (its
  // names are an octave high: the file called c4 sings 129 hz), for chant and the bottom of a choir
  // (and the singer's recorded moves from note to note, buildMoves)
  'chant-voice': { from: 'hadzi', shift: -1, dir: 'Samples/vowel_sustain/a/', match: /^vowel_a_([a-g]b?\d)\.wav$/, every: 2, loop: true, seconds: 6, moves: { dir: 'Samples/vowel_transition/a/', match: /^vowel_a_([a-g]b?\d)_from([a-g]b?\d)\.wav$/ } },
  // someone humming three long notes, a3, c4 and d4 (cut from one take), for lullabies and memories
  'hum-voice': { from: 'hum', files: [[1.6, 60], [19.5, 62], [40.2, 57]].map(([at, midi]) => ['439/439504_6616150-hq.mp3', midi, undefined, at]), loop: true, seconds: 3.6, measure: true },
  // an operatic soprano's held notes from g4 to c6, with her own vibrato, for the high voice over a choir
  soprano: { from: 'sharon', files: [[0.1, 79], [20.7, 81], [40.3, 67], [45.85, 72], [84.6, 84]].map(([at, midi]) => ['870/870863_18412227-hq.mp3', midi, undefined, at]), loop: true, seconds: 3.2, measure: true },
  // a solo cello, bowed, at four loudnesses on the d and g strings (the d's, which is the warmer)
  cello: { from: 'cello', shift: 1, dir: 'Samples/sus/', match: /^([A-G]b?\d)_(p|mf|f)_d\.wav$/, layers: { p: 0.35, mf: 0.6, f: 0.9 }, loop: true, seconds: 5 },
  // the general midi banjo was a toy. this is a real one (a six string guitar banjo), several takes of
  // each note, so a rolling banjo doesn't machine gun
  'ganjo': { from: 'ganjo', shift: -1, dir: 'Common/', match: /^Banjo_Common - ([A-G]#?\d)(?:_\d+)?\.wav$/, every: 2, rr: 2, seconds: 3, retune: true },
  // a hungarian zither (citera): melody strings over drones, bright and rattly, for folk, the middle ages
  // and the steppe
  zither: { from: 'zither', dir: 'Samples/mel/', match: /^prime_zither_([a-g]b?\d)_mel_rr\d\.flac$/, rr: 2, seconds: 4 },
  // vcsl's knight upright, the softest of its two loudnesses: a felt piano (c418's)
  'knight-upright': { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Upright Piano, Knight/Sustains/', match: /^Player_(vl\d)_rr1_([A-G]#?-?\d)\.wav$/, note: 2, layer: 1, layers: { vl1: 0.35, vl2: 0.8 }, low: 28, high: 100, every: 3, seconds: 6 },
  'splendid-piano': { from: 'splendid', shift: 1, dir: 'Samples/', match: /^(PP|MF|FF) ([A-G]#?\d)\.flac$/, note: 2, layer: 1, layers: { PP: 0.3, MF: 0.6, FF: 0.9 }, low: 28, high: 100, every: 3, seconds: 6 },
  // bowed vibraphone: a pure, glassy tone that swells in and hangs, for pads and ambient bells
  'bowed-vibes': { from: 'vcsl', shift: 1, dir: 'Idiophones/Struck Idiophones/Vibraphone/Bowed/', match: /^Vibes_bowed_([A-G]#?\d)_rr1_Main\.wav$/, every: 1, loop: true, seconds: 8 },
  // the orchestra's tremolo strings (violins over violas over cellos), the shiver under a tense scene
  'tremolo-strings': {
    loop: true, seconds: 4, parts: [
      { from: 'vsco', dir: 'Strings/Cello Section/trem/', shift: 1, match: /^trem_([A-G]#?\d)_v2_1\.wav$/, high: 47 },
      { from: 'vsco', dir: 'Strings/Viola Section/trem/', shift: 1, match: /^Violas_trem_([A-G]#?\d)_v2_rr1\.wav$/, low: 48, high: 54 },
      { from: 'vsco', dir: 'Strings/Violin Section/Trem/', shift: 1, match: /^VlnEns_Trem_([A-G]#?\d)_v2\.wav$/, low: 55 },
    ],
  },
  // vsco's real oboe and bassoon, where the general midi ones stood in
  'vsco-oboe': { from: 'vsco', shift: 1, dir: 'Woodwinds/Oboe/Vib/', match: /^Oboe_Vib_([A-G]#?\d)_(v1|v3)_Main\.wav$/, layers: { v1: 0.4, v3: 0.85 }, loop: true, seconds: 4 },
  'vsco-bassoon': { from: 'vsco', shift: 1, dir: 'Woodwinds/Bassoon/sus/', match: /^PSBassoon_([A-G]#?\d)_(v1|v2)_1\.wav$/, layers: { v1: 0.45, v2: 0.85 }, loop: true, seconds: 4 },
  'straight-trumpet': { from: 'vsco', shift: 1, dir: 'Brass/Trumpet/straightM-sus/', match: /_([A-G]#?\d)_v3_rr1\.wav$/, loop: true, seconds: 4 },
  // a saxello (a straight soprano sax), and karoryfer's alto: other saxes to choose from
  saxello: { from: 'vcsl', shift: 1, dir: 'Aerophones/Reed Aerophones/Saxello/Vibrato/', match: /_SusVB_MainSpirit_([A-G]#?\d)_vl2_rr1\.wav$/, every: 2, loop: true, seconds: 4 },
  'weresax-alto': { from: 'weresax', shift: 1, dir: 'Samples/alto/', match: /^([a-g]b?\d)_(p|f)_rr1_cnd\.wav$/, layers: { p: 0.4, f: 0.9 }, loop: true, seconds: 4 },
  // karoryfer's green guitar, the black one's brother: a second electric, so two guitar parts in one
  // song aren't the same recording
  'green-guitar': { from: 'guitars', dir: 'Samples/green/ord/', shift: -1, match: /twang_([a-g]b?\d)_(p|f)_rr[12]\.wav$/, layers: { p: 0.35, f: 0.9 }, rr: 2, seconds: 5 },
  // more basses, each its own: a growly electric, a pastabass (picked, fat), a double bass played softly
  'growly-bass': { from: 'growly', shift: -1, dir: 'sustain/', match: /^([a-g]b?\d)_(p|f)_rr1\.wav$/, layers: { p: 0.4, f: 0.9 }, seconds: 4 },
  'pasta-bass': { from: 'pasta', shift: -1, dir: 'samples/fetuccine/', match: /^([a-g]b?\d)_(vl2|vl4)_rr1\.wav$/, layers: { vl2: 0.45, vl4: 0.9 }, seconds: 4 },
  'sneaky-bass': { from: 'sneaky', shift: -1, dir: 'Samples/finger/', match: /^sneakybass_([a-g]b?\d)_finger_rr[12]\.wav$/, rr: 2, seconds: 3 },
  // the second general midi set's choirs and rhodes, for a second (and with fluidr3's, a third) choir
  'choir-aahs-2': { gm: 'choir_aahs', font: 'musyng', low: 41, high: 84, loop: true },
  'voice-oohs-2': { gm: 'voice_oohs', font: 'musyng', low: 41, high: 84, loop: true },
  'synth-choir': { gm: 'synth_choir', font: 'musyng', low: 41, high: 84, loop: true },
  rhodes: { gm: 'electric_piano_1', font: 'musyng', low: 33, high: 100 },
  // ----- the spiral round: a small orchestra's colours -----
  // vsco's piccolo, the flute an octave up that glitters over an orchestra's loudest bars
  piccolo: { from: 'vsco', shift: 1, dir: 'Woodwinds/Piccolo/Sus/', match: /^piccolo_([A-G]#?\d)_sustain1\.wav$/, loop: true, seconds: 4 },

  // ----- the voices round: a second or third recording for most instruments that had one, mood by mood -----
  // a woman singing long notes, softly, close to the microphone: the recorded voice for the dreamy and
  // soul voices. her takes sing one note after another, so each note is cut from where it holds steady
  // (found by measuring the pitch every 20 ms)
  'female-voice': {
    from: 'owstu', loop: true, measure: true, seconds: 4,
    files: [['639/639853_1690102-hq.mp3', 56, 7.2, 3], ['639/639853_1690102-hq.mp3', 59, 0.3, 1.4], ['639/639850_1690102-hq.mp3', 60, 0.1, 1.55], ['628/628817_1690102-hq.mp3', 62, 5, 2.65],
      ['639/639849_1690102-hq.mp3', 64, 0.55, 1.75], ['639/639849_1690102-hq.mp3', 65, 4, 1.75], ['628/628817_1690102-hq.mp3', 67, 0.55, 2.8], ['555/555984_1690102-hq.mp3', 73, 0.4, 4]]
      .map(([file, midi, at, length]) => [file, midi, undefined, at, 0, length]),
  },
  // vsco and vcsl: other players, other instruments of the same kind, other ways of playing
  'vsco-harp': { from: 'vsco', dir: 'Strings/Harp/', match: /^KSHarp_([A-G]#?\d)_(?:mp|mf|f)\.wav$/, every: 2, seconds: 4 },
  'violin-pizz': { from: 'vsco',dir: 'Strings/Solo Violin/Pizz/', match: /^LLVln_Pizz_([A-G]#?\d)_(p|f)_RR1\.wav$/, layers: { p: 0.4, f: 0.9 }, seconds: 2 },
  'trumpet-vib': { from: 'vsco', shift: 1, dir: 'Brass/Trumpet/susvib/', match: /_susvib_([A-G]#?\d)_(v1|v2)_rr1\.wav$/, layers: { v1: 0.45, v2: 0.85 }, loop: true, seconds: 4 },
  'trombone-vib': { from: 'vsco', shift: 1, dir: 'Brass/Tenor Trombone/vib/', match: /^tenortbn_vib_([A-G]#?\d)_v1_1\.wav$/, every: 2, loop: true, seconds: 4 },
  // a flute played straight, with no vibrato: breathier and plainer, the zen garden's and c418's flute
  'flute-plain': { from: 'vsco', shift: 1, dir: 'Woodwinds/Flute/susNV/', match: /^LDFlute_susNV_([A-G]#?\d)_(v1|v3)_1\.wav$/, layers: { v1: 0.4, v3: 0.85 }, loop: true, seconds: 4 },
  // a double bass bowed, with vibrato: the darkest drone the orchestra has
  'bowed-bass': { from: 'vsco', shift: 1, dir: 'Strings/Solo Contrabass/SusVib/', match: /^BKCtbss_SusVib_([A-G]#?\d)_v3_rr1\.wav$/, every: 2, loop: true, seconds: 5 },
  'french-harpsichord': { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Harpsichord, French/Sustains/', match: /^Harpsi2_Normal_([A-G]#?\d)_rr1_Main\.wav$/, seconds: 4 },
  'harmonica-c': { from: 'vcsl', shift: 1, dir: 'Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C/Sustains/Normal/', match: /^Hohner-Special20_Normal_([A-G]#?\d)\.wav$/, every: 1, loop: true, seconds: 4 },
  // a tubular glockenspiel: little tuned metal tubes, the wind chime's real sound. its names are off
  // ("non-standard pitch"), so each is measured and named by the note it's nearest
  'tubular-glock': { from: 'vcsl', dir: 'Idiophones/Struck Idiophones/Tubular Glockenspiel/', match: /^([A-G]#?\d)_(medium)1\.wav$/, every: 1, seconds: 5, measure: true },
  // a kenyan kalimba, tuned its own way and measured. (the nyunga nyunga's buzzing keys, and vcsl's other
  // tubular bells, fooled every pitch check, so they're left out)
  'kenya-kalimba': { from: 'vcsl', shift: 1, dir: 'Idiophones/Plucked Idiophones/Kalimba, Kenya/', match: /^Mbira6_Normal_MainSpirit_([A-G]#?\d)_k\d+_vl3_rr2\.wav$/, every: 1, seconds: 3, measure: true },
  // the recorder's bigger sisters, the tenor and bass, for a consort of recorders
  'tenor-recorder': { from: 'vcsl', shift: 1, dir: 'Aerophones/Edge-blown Aerophones/Baroque Tenor Recorder/Sustain/', match: /^TenRecorder_Sus_([A-G]#?\d)_rr1_Main\.wav$/, every: 2, loop: true, seconds: 4 },
  'alto-recorder': { from: 'vcsl', shift: 1, dir: 'Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/', match: /^AltRecorder_Sus_([A-G]#?\d)_rr1_Main\.wav$/, every: 2, loop: true, seconds: 4 },
  'yamaha-upright': { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Upright Piano, Yamaha/Sustains/', match: /^Upright1_Sus_([A-G]#?\d)_(vl1|vl3)_rr1\.wav$/, layers: { vl1: 0.35, vl3: 0.85 }, low: 28, high: 100, every: 1, seconds: 6 },
  'kawai-grand': { from: 'vcsl', shift: 1, dir: 'Chordophones/Zithers/Grand Piano, Kawai/Sustains/', match: /^GPiano_sus_([A-G]#?-?\d)_(v1|v3)_rr1_Player\.wav$/, layers: { v1: 0.35, v3: 0.85 }, low: 28, high: 100, seconds: 6 },
  clavisynth: { from: 'vcsl', shift: 2,dir: 'Electrophones/TX81Z/Clavisynth/', match: /^Clavisynth_([A-G]#?\d)_(vl1|vl3)\.wav$/, layers: { vl1: 0.4, vl3: 0.9 }, low: 36, high: 96, seconds: 3 },
  // the second general midi set's (musyng kite), a second recording of the instruments that had one
  'string-ensemble': { gm: 'string_ensemble_1', font: 'musyng', low: 36, high: 96, loop: true },
  'tremolo-strings-2': { gm: 'tremolo_strings', font: 'musyng', low: 36, high: 96, loop: true },
  'brass-section-2': { gm: 'brass_section', font: 'musyng', low: 41, high: 84, loop: true },
  'synth-strings-2': { gm: 'synth_strings_2', font: 'musyng', low: 36, high: 96, loop: true },
  'clarinet-2': { gm: 'clarinet', font: 'musyng', low: 50, high: 91, loop: true },
  'horn-2': { gm: 'french_horn', font: 'musyng', low: 41, high: 77, loop: true },
  'tuba-2': { gm: 'tuba', font: 'musyng', low: 28, high: 65, loop: true },
  'cello-2': { gm: 'cello', font: 'musyng', low: 36, high: 76, loop: true },
  'pan-flute-2': { gm: 'pan_flute', font: 'musyng', low: 55, high: 96, loop: true },
  'tenor-sax-2': { gm: 'tenor_sax', font: 'musyng', low: 44, high: 80, loop: true },
  'shakuhachi-2': { gm: 'shakuhachi', font: 'musyng', low: 55, high: 93, loop: true },
  'shehnai-2': { gm: 'shanai', font: 'musyng', low: 55, high: 91, loop: true },
  'reed-organ-2': { gm: 'reed_organ', font: 'musyng', shift: 1, low: 53, high: 96, loop: true },
  'bandoneon-2': { gm: 'tango_accordion', font: 'musyng', low: 48, high: 88, loop: true },
  'accordion-2': { gm: 'accordion', font: 'musyng', low: 41, high: 89, loop: true },
  'blown-bottle-2': { gm: 'blown_bottle', font: 'musyng', low: 60, high: 96, loop: true },
  'drawbar-organ-2': { gm: 'drawbar_organ', font: 'musyng', low: 36, high: 96, loop: true, trust: true },
  'celesta-2': { gm: 'celesta', font: 'musyng', low: 60, high: 108 },
  'music-box-2': { gm: 'music_box', font: 'musyng', low: 60, high: 108 },
  'vibraphone-2': { gm: 'vibraphone', font: 'musyng', low: 53, high: 89 },
  'xylophone-2': { gm: 'xylophone', font: 'musyng', low: 65, high: 108 },
  'steel-drum-2': { gm: 'steel_drums', font: 'musyng', low: 52, high: 88 },
  'koto-2': { gm: 'koto', font: 'musyng', low: 48, high: 88 },
  'sitar-2': { gm: 'sitar', font: 'musyng', low: 48, high: 88 },
  'shamisen-2': { gm: 'shamisen', font: 'musyng', low: 48, high: 88 },
  'dulcimer-2': { gm: 'dulcimer', font: 'musyng', low: 48, high: 96 },
  'honky-tonk-2': { gm: 'honkytonk_piano', font: 'musyng', low: 28, high: 100 },
  'jazz-guitar-2': { gm: 'electric_guitar_jazz', font: 'musyng', low: 40, high: 84 },
  'slap-bass-2': { gm: 'slap_bass_1', font: 'musyng', low: 28, high: 67 },
  'fretless-2': { gm: 'fretless_bass', font: 'musyng', low: 28, high: 67 },
  'orchestra-hit-2': { gm: 'orchestra_hit', font: 'musyng', low: 48, high: 84 },
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
  // the fourth round's scenery. a steady sound with no quiet in it (rain, a fire, a brook, static, a
  // siren's wail) is sliced instead (chop: how many slices, how long each, in seconds). a bed is
  // played as slices one after another, crossfaded (synth.js), so it never loops the same few seconds
  rain: { from: 'fs-rain', hits: { bed: [['200/200273_2322692-hq.mp3', 0.8, { chop: { most: 4, length: 18 } }]] } },
  ocean: { from: 'fs-ocean', hits: { bed: [['531/531015_9818404-hq.mp3', 0.8, { chop: { most: 3, length: 20 } }]] } },
  fire: { from: 'fs-fire', hits: { bed: [['414/414767_4955305-hq.mp3', 0.8, { chop: { most: 3, length: 18 } }]] } },
  stream: { from: 'fs-stream', hits: { bed: [['231/231536_4034520-hq.mp3', 0.8, { chop: { most: 2, length: 16 } }]] } },
  lava: { from: 'fs-lava', hits: { bed: [['474/474852_9395330-hq.mp3', 0.8, { chop: { most: 2, length: 18 } }]] } },
  factory: { from: 'fs-factory', hits: { bed: [['278/278987_5322055-hq.mp3', 0.8, { chop: { most: 2, length: 10 } }]] } },
  birds: { from: 'fs-birds', hits: { event: [['554/554513_7241289-hq.mp3', 0.8, { chop: { most: 8, length: 7 } }]] } },
  drips: { from: 'fs-drips', hits: { event: [['177/177958_985466-hq.mp3', 0.8, { chop: { most: 6, length: 6 } }]] } },
  // (pitched: an owl hoots on a note, so each hoot's pitch is measured and synth.js moves it to the
  // song's home note, like the singing bowl)
  owl: { from: 'fs-owl', hits: { event: ['558/558396_556505-hq.mp3', '558/558397_556505-hq.mp3', '558/558398_556505-hq.mp3'].map((file) => [file, 0.8, { pitched: true }]) } },
  frogs: { from: 'fs-frogs', hits: { event: [['278/278868_1402315-hq.mp3', 0.8, { chop: { most: 5, length: 5 } }]] } },
  creaks: { from: 'fs-creaks', hits: { event: ['238/238289_1554038-hq.mp3', '119/119468_1819253-hq.mp3', '496/496836_9847211-hq.mp3'].map((file) => [file, 0.8, { chop: { most: 1, length: 8 } }]) } },
  leaves: { from: 'fs-leaves', hits: { event: ['437/437356_1738686-hq.mp3', '443/443065_8282799-hq.mp3', '362/362253_6115487-hq.mp3'].map((file) => [file, 0.8, { chop: { most: 1, length: 9 } }]) } },
  // (even: every piece brought to the same loudness, for takes recorded at very different levels, so
  // one gust or roll isn't 20 db under the next)
  wind: { from: 'fs-wind', even: true, hits: { event: ['146/146932_1274078-hq.mp3', '80/80937_1247285-hq.mp3', '400/400992_7393256-hq.mp3'].map((file) => [file, 0.8, { chop: { most: 1, length: 11 } }]) } },
  thunder: { from: 'fs-thunder', even: true, hits: { event: [['347/347562_5481182-hq.mp3', 0.8, { split: { most: 2, longest: 12, gap: 1 } }], ['107/107518_43834-hq.mp3', 0.8, { split: { most: 4, longest: 12, gap: 1 } }]] } },
  static: { from: 'fs-static', hits: { event: [['337/337700_4004161-hq.mp3', 0.8, { chop: { most: 6, length: 5 } }], ['454/454259_612689-hq.mp3', 0.8, { split: { most: 4, longest: 4 } }]] } },
  siren: { from: 'fs-siren', hits: { event: [['412/412171_7383104-hq.mp3', 0.8, { chop: { most: 4, length: 10 } }]] } },
  clanks: { from: 'fs-clanks', hits: { event: [['264/264889_2291325-hq.mp3', 0.8, { split: { most: 10, longest: 3 } }]] } },
  chains: { from: 'fs-chains', hits: { event: [['108/108265_179679-hq.mp3', 0.8, { split: { most: 4, longest: 4 } }], ['387/387240_1815993-hq.mp3', 0.8, { split: { most: 3, longest: 4 } }]] } },
  crows: { from: 'fs-crows', hits: { event: [['56/56233_91374-hq.mp3', 0.8, { split: { most: 4, longest: 4 } }], ['386/386768_5768130-hq.mp3', 0.8, { split: { most: 4, longest: 4 } }]] } },
  footsteps: { from: 'fs-footsteps', hits: { event: [['415/415783_6702737-hq.mp3', 0.8, { chop: { most: 6, length: 5 } }]] } },
  steam: { from: 'fs-steam', hits: { event: [['457/457294_300738-hq.mp3', 0.8, { split: { most: 2, longest: 7 } }], ['365/365071_6639672-hq.mp3', 0.8, { chop: { most: 1, length: 8 } }]] } },
  // mark trees (a row of little chimes) brushed downwards: the shimmer an orchestra marks a new section
  // or a key change with
  'spell-percussion': {
    from: 'vcsl',
    hits: {
      'mark-tree': [['Idiophones/Struck Idiophones/Mark Trees/Legacy/windchimes_desc1.wav', 0.7], ['Idiophones/Struck Idiophones/Mark Trees/Legacy/windchimes_slowDesc1.wav', 0.8]],
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
    // (shift: a set whose files are named an octave off, musyng kite's reed organ)
    for (let midi = spec.low; midi <= spec.high; midi += spec.every || 3) out.push({ source: spec.font || 'fluid', file: `${spec.gm}-mp3/${gmName(midi)}.mp3`, midi: midi - 12 * (spec.shift || 0) });
    return out;
  }
  // files: picked by hand, [path, midi, loudness, the second to start from, cents out of tune, seconds
  // to keep (for a take that sings one note after another)]
  // runs: files of several notes each, cut apart later (buildTonal), so only the files are named here
  if (spec.runs) return spec.runs.map(([file, midi, vel]) => ({ source: spec.from, file, midi, vel, layer: vel, run: true }));
  if (spec.files) return spec.files.map(([file, midi, vel, start = 0, tune = 0, length]) => ({ source: spec.from, file, midi, vel, layer: vel, start, tune, length }));
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
      // rr: how many takes of each note at each loudness (round robins, played in turn), one unless it says
      const seen = {};
      for (const one of found.filter((f) => f.midi === midi).sort((a, b) => a.file.localeCompare(b.file))) {
        if ((seen[one.layer] = (seen[one.layer] || 0) + 1) > (part.rr ?? spec.rr ?? 1)) continue;
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
const rmsOf = (data) => Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);

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
  const peak = peakOf(data);
  const attack = Math.max(0, data.findIndex((x) => Math.abs(x) > peak * 0.3));
  const found = [];
  for (const after of [0.08, 0.15, 0.25, 0.35, 0.5]) {
    const at = attack + Math.round(RATE * after);
    const hz = pitchAt(data, at, size);
    if (hz) found.push(hz);
  }
  if (!found.length) return null;
  found.sort((x, y) => x - y);
  return found[found.length >> 1];
}
// the pitch in hz of size samples from at, or null if there's no clear one
function pitchAt(data, at, size) {
  const minLag = Math.floor(RATE / 4500);
  const maxLag = Math.floor(RATE / 25);
  if (at + size + maxLag >= data.length) return null;
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
  if (best < 0) return null;
  // between samples: the bottom of a parabola through the dip
  const [a, b, c] = [norm[best - 1], norm[best], norm[best + 1]];
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  return RATE / (best + shift);
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
  if (spec.gm) return [spec.font || 'fluid'];
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
  let notes = pickNotes(spec, TREES);
  const tunes = spec.tunes ? await mtgTunes(work, spec.tunes) : null;
  let files = await downloadAll(work, notes.map((note) => [note.source, note.file]));
  // a run is a file of notes going up a semitone at a time, each one let ring a long while: cut at
  // each note's start (onsets), the first its first note, then every few kept. a plucked note's tail
  // goes nearly quiet long before the next one, so cutting where it goes quiet split notes in two
  const cut = new Map();
  if (spec.runs) {
    const pieces = [];
    // (a finger squeak or a buzz can look like a note starting, so every piece's pitch is measured, and
    // each note of the run keeps its loudest piece that's clearly that note)
    notes.forEach((note, i) => {
      const whole = decode(files[i]);
      const last = parseNote(/\.[A-G]b?\d([A-G]b?\d)\.mono/.exec(note.file)[1]);
      const starts = onsets(whole);
      const best = new Map();
      starts.forEach((at, k) => {
        const data = tidy(whole.slice(at, starts[k + 1] ?? whole.length), spec.seconds || 4);
        const hz = pitchOf(data);
        if (!hz) return;
        const midi = Math.round(midiOf(hz));
        if (midi < note.midi || midi > last || Math.abs(midiOf(hz) - midi) > 0.35 || (midi - 40) % (spec.every || 3)) return;
        if (!best.has(midi) || peakOf(data) > peakOf(best.get(midi).data)) {
          // (its tune: iowa's guitar is about 20 cents flat)
          best.set(midi, { ...note, midi, file: `${note.file}#${midi}`, data, tune: Math.round((midi - midiOf(hz)) * 100) });
        }
      });
      pieces.push(...best.values());
    });
    notes = pieces;
    files = pieces.map((piece) => piece.file);
    for (const piece of pieces) cut.set(piece.file, piece.data);
  }
  const sounds = [];
  const counts = {};
  for (const [i, note] of notes.entries()) {
    const data = cut.get(files[i]) || tidy(decode(files[i]).subarray(Math.round((note.start || 0) * RATE)), note.length || spec.seconds || 4);
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
    // (retune: a plucked instrument tuned its own way, the ganjo about a quarter tone sharp, measured and
    // tuned note by note like a held one)
    else if (!note.tune && !spec.measure && heard !== null && (spec.loop || spec.retune) && Math.abs(heard - note.midi) < (spec.retune ? 0.7 : 0.35)) tune = Math.round((note.midi - heard) * 100);
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

// recorded moves between notes (true legato): each file sings one note into another, so a sung line can
// move the way the singer did instead of a recording being bent. a move is measured every 10 ms: the
// note it leaves (how long it's held there, how in tune), when it leaves, lands and arrives, and how in
// tune the note it arrives on is. one that doesn't start on its first note (silence, then straight on to
// the second) is left out. each is cut to the move with a little of both notes, and packed with the
// others arriving on the same note into one file. its gain is [start, end]: how much to turn each end
// up or down to match the folder's held notes, so a move is as loud as the voice either side of it.
// added to a folder already built, which keeps its notes and their tunes:
//   node js/squimble-music-maker/tools/build-samples.js <work folder> --moves chant-voice
function measureMove(data, from, to) {
  const hop = Math.round(RATE * 0.01);
  const pitch = [];
  const level = [];
  for (let at = 0; at + hop <= data.length; at += hop) {
    const hz = pitchAt(data, at, 1536);
    pitch.push(hz && midiOf(hz));
    level.push(rmsOf(data.subarray(at, at + hop)));
  }
  const loud = Math.max(...level);
  const heard = (k) => pitch[k] && level[k] > loud * 0.12;
  const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
  // the first note, from the start until the pitch heads off
  if (!heard(0) && !heard(1)) return null;
  const first = heard(0) ? 0 : 1;
  const was = median(pitch.slice(first, first + 4).filter(Boolean));
  let leave = first;
  while (heard(leave + 1) && Math.abs(pitch[leave + 1] - was) < Math.max(0.25, Math.abs(to - from) * 0.2)) leave++;
  const fromPitch = median(pitch.slice(first, leave + 1));
  // the second, once it's stayed within a third of a semitone for 80 ms
  const late = pitch.filter((p, k) => k > pitch.length / 2 && heard(k) && Math.abs(p - to) < 1);
  if (leave - first < 4 || late.length < 10 || Math.abs(fromPitch - from) > 1) return null;
  let arrive = leave + 1;
  while (arrive < pitch.length - 8 && !Array.from({ length: 8 }, (_, j) => heard(arrive + j) && Math.abs(pitch[arrive + j] - median(late)) < 0.33).every(Boolean)) arrive++;
  if (arrive >= pitch.length - 8 || arrive - leave > 50) return null;
  // in tune where it's heard, the quarter second after it arrives, and where it lands: the first moment
  // within a semitone of that. between landing and arriving a singer swings past the note and back (by
  // as much as 90 cents after a big fall), every 20 ms of which is kept as bend, cents off the note
  const toPitch = median(pitch.slice(arrive, arrive + 25).filter(Boolean));
  let land = leave + 1;
  while (land < arrive && !(heard(land) && Math.abs(pitch[land] - toPitch) < 1)) land++;
  const bend = [];
  // (null where it isn't clear)
  for (let k = land; k < arrive; k += 2) bend.push(heard(k) ? Math.round((pitch[k] - toPitch) * 100) : null);
  return { leave: leave * hop, land: land * hop, arrive: arrive * hop, start: first * hop, bend, tune: [Math.round((from - fromPitch) * 100), Math.round((to - toPitch) * 100)] };
}

async function buildMoves(work, folder, spec) {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, folder, 'index.json'), 'utf8'));
  // how loud the held notes are where they're held, for each end of a move to match the nearest
  const held = index.notes.map((note) => {
    const data = decode(path.join(OUT, folder, note.file));
    return { midi: note.midi, rms: rmsOf(data.subarray(Math.round(data.length * 0.3), Math.round(data.length * 0.7))) };
  });
  const loudness = (midi) => held.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a)).rms;
  const { dir, match } = spec.moves;
  const shift = 12 * (spec.shift || 0);
  const found = TREES[spec.from].filter((file) => file.startsWith(dir) && match.test(file.slice(dir.length)));
  const files = await downloadAll(work, found.map((file) => [spec.from, file]));
  const packs = new Map();
  let left = 0;
  found.forEach((file, i) => {
    const [, toName, fromName] = match.exec(file.slice(dir.length));
    const [from, to] = [parseNote(fromName) + shift, parseNote(toName) + shift];
    const data = decode(files[i]);
    const move = measureMove(data, from, to);
    if (!move) {
      left++;
      return;
    }
    // from a tenth of a second before it leaves to a quarter after it arrives (time enough to hand over
    // to the held note, singLine)
    const start = Math.max(move.start, move.leave - Math.round(RATE * 0.1));
    const clip = data.slice(start, Math.min(data.length, move.arrive + Math.round(RATE * 0.25)));
    const fade = Math.round(RATE * 0.01);
    for (let k = 0; k < fade; k++) {
      clip[k] *= k / fade;
      clip[clip.length - 1 - k] *= k / fade;
    }
    const ends = [rmsOf(data.subarray(move.start, move.leave)), rmsOf(data.subarray(move.arrive, move.arrive + Math.round(RATE * 0.25)))];
    // (turned up to match where it arrives, or as far as it goes without clipping)
    const k = Math.min(loudness(to) / ends[1], 0.95 / peakOf(clip));
    // (a first note sung so softly it'd need turning up more than two and a half times is mostly breath)
    // (nor one that goes quiet half way, a breath in the middle of a big fall: a 6 db dip under the voice
    // either side, as it'll be played, gain and all, was heard as a hiccup)
    let dip = 1;
    for (let at = move.leave; at < move.arrive; at += Math.round(RATE * 0.01)) {
      const u = (at - move.leave) / (move.arrive - move.leave);
      const heard = rmsOf(data.subarray(at, at + Math.round(RATE * 0.03))) * ((loudness(from) / ends[0]) * (1 - u) + (loudness(to) / ends[1]) * u);
      dip = Math.min(dip, heard / (loudness(from) * (1 - u) + loudness(to) * u));
    }
    if (loudness(from) / ends[0] > 2.5 * k || dip < 0.5) {
      left++;
      return;
    }
    for (let j = 0; j < clip.length; j++) clip[j] *= k;
    if (!packs.has(to)) packs.set(to, []);
    const seconds = (at) => +((at - start) / RATE).toFixed(3);
    packs.get(to).push({ clip, entry: { from, to, leave: seconds(move.leave), land: seconds(move.land), arrive: seconds(move.arrive), bend: move.bend, tune: move.tune, gain: [+(loudness(from) / (ends[0] * k)).toFixed(2), +(loudness(to) / (ends[1] * k)).toFixed(2)] } });
  });
  // packed one after another with a tenth of a second between, at says where each starts
  index.moves = [];
  for (const [to, list] of [...packs].sort((a, b) => a[0] - b[0])) {
    const gap = Math.round(RATE * 0.1);
    const file = `moves-${fileName(to)}.mp3`;
    const pack = new Float32Array(list.reduce((sum, one) => sum + one.clip.length + gap, gap));
    let at = gap;
    for (const one of list) {
      pack.set(one.clip, at);
      index.moves.push({ file, at: +(at / RATE).toFixed(4), length: +(one.clip.length / RATE).toFixed(3), ...one.entry });
      at += one.clip.length + gap;
    }
    encode(pack, path.join(OUT, folder, file));
  }
  // (a move to a line, or the index would be thousands of lines long)
  const moves = index.moves.map((one) => JSON.stringify(one)).join(',\n  ');
  fs.writeFileSync(path.join(OUT, folder, 'index.json'), `${JSON.stringify({ ...index, moves: 0 }, null, 1).replace('"moves": 0', `"moves": [\n  ${moves}\n ]`)}\n`);
  console.log(`  ${folder}: ${index.moves.length} moves, ${left} left out`);
}

// a long, steady recording with no quiet in it (rain, static, a siren's wail) sliced instead: most slices
// of length seconds spread across it (fewer if it's too short for them all not to overlap), each faded
// in and out so it can't click
function slices(data, { most, length }) {
  const size = Math.min(data.length, Math.round(RATE * length));
  const count = Math.max(1, Math.min(most, Math.floor(data.length / size)));
  const fade = Math.round(RATE * Math.min(0.4, length / 6));
  return Array.from({ length: count }, (_, k) => {
    const at = count > 1 ? Math.round((k * (data.length - size)) / (count - 1)) : (data.length - size) >> 1;
    const out = data.slice(at, at + size);
    for (let i = 0; i < fade; i++) {
      out[i] *= i / fade;
      out[out.length - 1 - i] *= i / fade;
    }
    return out;
  });
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

// where each note in a recording of separate notes starts, as sample offsets: a 10 ms step at least
// six times louder than the 100 ms before it, and loud enough to be a note (a tenth of the loudest),
// at least a second and a half after the last one
function onsets(data) {
  const hop = Math.round(RATE * 0.01);
  const levels = [];
  for (let at = 0; at + hop <= data.length; at += hop) {
    let sum = 0;
    for (let i = at; i < at + hop; i++) sum += data[i] * data[i];
    levels.push(sum / hop);
  }
  const loud = Math.max(...levels);
  // (a file that starts on its first note has nothing quiet before it to rise from)
  const found = [levels.findIndex((level) => level > loud * 0.01)];
  for (let i = found[0] + 150; i < levels.length; i++) {
    const before = levels.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10;
    if (levels[i] > loud * 0.01 && levels[i] > before * 6 && (!found.length || i - found[found.length - 1] > 150)) found.push(i);
  }
  return found.map((i) => Math.max(0, (i - 1) * hop));
}

async function buildKit(work, folder, spec) {
  const sounds = [];
  for (const part of [spec, spec.more].filter(Boolean)) {
    for (const [hit, takes] of Object.entries(part.hits)) {
      const files = await downloadAll(work, takes.map(([file]) => [part.from, file]));
      let n = 0;
      takes.forEach(([, vel, how = {}], i) => {
        const whole = decode(files[i]);
        const pieces = how.chop ? slices(whole, how.chop) : how.split ? events(whole, how.split) : [tidy(whole, 6)];
        // a slice or event 30 db under the take's loudest is only the recording's quiet tail
        const loudest = Math.max(...pieces.map(rmsOf));
        for (const data of pieces.filter((one) => rmsOf(one) > loudest * 0.03)) {
          const entry = { file: `${hit}-${++n}.mp3`, hit, vel };
          const hz = how.pitched && pitchOf(data);
          if (hz) {
            entry.midi = Math.round(midiOf(hz));
            entry.tune = Math.round((entry.midi - midiOf(hz)) * 100);
          }
          sounds.push({ data, entry });
        }
      });
    }
  }
  if (spec.even) {
    const loudest = Math.max(...sounds.map((one) => rmsOf(one.data)));
    for (const one of sounds) {
      const k = loudest / rmsOf(one.data);
      for (let i = 0; i < one.data.length; i++) one.data[i] *= k;
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
    } else if (mode === '--moves') {
      if (spec.moves) await buildMoves(work, folder, spec);
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
