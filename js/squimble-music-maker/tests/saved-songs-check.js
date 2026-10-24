// saved songs must play exactly as they did when they were saved, whatever the composer does next.
// a song saves its settings and the notes are written from them every time it plays, so a change to
// music.js that writes different notes for the same settings changes every song anyone has saved. it
// happened once (a post-rock song came back with a different tune), and this check is why it won't
// again: saved-songs/composer-n.json.gz holds songs as each composer made them, with a fingerprint of
// the notes each played (notesPrint in library.js, the same one the page keeps with a save). every
// one must still play those notes, through the page's own scripts (instruments.js, synth.js, kept/,
// moods.js, music.js)
//
// when it fails: the change writes different notes for songs already saved. put the change aside, run
// tools/keep-composer.js (it keeps today's composer as it is and starts the next), make the change
// again, then run this with --add to keep the new composer's songs too (README.md, "Adding things")
//
// node js/squimble-music-maker/tests/saved-songs-check.js (no output means it all passed), about a
// minute. music-check.js runs it first
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');
const assert = require('assert');

const dir = `${__dirname}/..`;
const page = {};
vm.createContext(page);
const kept = fs.readdirSync(`${dir}/kept`).filter((file) => /^composer-[\d.]+\.js$/.test(file)).sort((a, b) => parseFloat(a.slice(9)) - parseFloat(b.slice(9)));
for (const file of ['instruments.js', 'synth.js', ...kept.map((one) => `kept/${one}`), 'moods.js', 'music.js', 'library.js']) vm.runInContext(fs.readFileSync(`${dir}/${file}`, 'utf8'), page);
const run = (expr) => vm.runInContext(expr, page);
const { COMPOSER, COMPOSER_VERSIONS, composeSong, cleanSong, notesPrint } = run('({ COMPOSER, COMPOSER_VERSIONS, composeSong, cleanSong, notesPrint })');
const html = fs.readFileSync(`${dir}/../../squimble-music-maker.html`, 'utf8');
// (maker.js fetches an older composer by its number when a song needs it: all of them up front were
// most of what the page loaded)
assert(!html.includes('squimble-music-maker/kept/'), "the page doesn't load the kept composers up front");
for (const n of COMPOSER_VERSIONS) {
  if (n === COMPOSER) continue;
  assert(fs.existsSync(`${dir}/kept/composer-${n}.js`) && run(`KEPT_COMPOSERS[${n}]`), `composer ${n} is kept as kept/composer-${n}.js, since COMPOSER is ${COMPOSER}`);
}

const file = (n) => `${__dirname}/saved-songs/composer-${n}.json.gz`;
const played = (song) => notesPrint(composeSong(cleanSong(JSON.parse(JSON.stringify(song)))).notes);

// the songs a composer makes: every flavour of every mood once, the styles taken in turn, some
// modifiers, a song with notes drawn in, and a track made by hand
function makeSongs(n) {
  const maker = n === COMPOSER ? run('({ generateSong, blankSong, MOODS, FLAVOURS, STYLES })') : run(`KEPT_COMPOSERS[${n}]`);
  const styles = Object.keys(maker.STYLES);
  const songs = [];
  let turn = 0;
  for (const mood of Object.keys(maker.MOODS)) {
    for (const flavour of Object.keys(maker.FLAVOURS[mood].kinds)) songs.push(maker.generateSong(mood, styles[turn++ % styles.length], `kept-${turn}`, [], flavour));
  }
  for (const mods of [['calm'], ['fast', 'dark'], ['jazzy'], ['dramatic'], ['epic'], ['rising']]) songs.push(maker.generateSong('heroic', 'tune', `kept-${mods.join('-')}`, mods));
  const drawn = JSON.parse(JSON.stringify(maker.generateSong('calm', 'tune', 'kept-drawn')));
  drawn.layers.find((layer) => layer.role === 'melody').edits.A = { add: [[0, 72, 1], [1, 74, 0.5, 76, 0.25, 20], [2, 71, 2]], remove: [] };
  songs.push(drawn);
  if (maker.blankSong) {
    const own = JSON.parse(JSON.stringify(maker.blankSong()));
    own.layers[0].edits.A = { add: [[0, 60, 1], [1, 64, 1], [2, 67, 2]], remove: [] };
    songs.push(own);
  }
  // as they'd be saved: what the page keeps is the song after a trip through json, saying which composer
  // made it (none for the first; 1.5 made songs without saying, and it's picked in the Song tab)
  return songs.map((song) => ({ ...JSON.parse(JSON.stringify(song)), ...(n === 1 ? {} : { composer: n }) }));
}

if (process.argv.includes('--add')) {
  // only for a composer with no songs kept yet: the ones there are what saved songs must stay
  for (const n of COMPOSER_VERSIONS) {
    if (fs.existsSync(file(n))) continue;
    const songs = makeSongs(n).map((song) => ({ song, print: played(song) }));
    fs.mkdirSync(`${__dirname}/saved-songs`, { recursive: true });
    fs.writeFileSync(file(n), zlib.gzipSync(JSON.stringify(songs), { level: 9 }));
    console.log(`kept ${songs.length} songs from composer ${n}`);
  }
}

for (const n of COMPOSER_VERSIONS) {
  assert(fs.existsSync(file(n)), `composer ${n} has songs kept to check (run this with --add once it's finished)`);
  const songs = JSON.parse(zlib.gunzipSync(fs.readFileSync(file(n))));
  const changed = songs.filter(({ song, print }) => played(song) !== print);
  assert(!changed.length, `${changed.length} of ${songs.length} songs made by composer ${n} no longer play the notes they were saved with (${changed.slice(0, 5).map(({ song }) => `${song.seed} ${song.mood}/${song.flavour || ''} ${song.style}`).join(', ')}). Put the change aside and run tools/keep-composer.js first: see the top of this file`);
}
