// saved songs must play exactly as they did when they were saved, whatever the composer does next.
// a song saves its settings and the notes are written from them every time it plays, so a change to
// music.js that writes different notes for the same settings changes every song anyone has saved. it
// happened once (a post-rock song came back with a different tune), and this check is why it won't
// again: saved-songs/composer-n.json.gz holds songs as each composer made them, with a fingerprint of
// the notes each played (notesPrint in library.js, the same one the page keeps with a save). every
// one must still play those notes, through the page's own scripts (synth.js, kept/, music.js)
//
// when it fails: the change writes different notes for songs already saved. keep music.js as it was
// before the change as kept/composer-n.js (n is COMPOSER), add its script to the page, put COMPOSER up
// one, then run this with --add to keep the new composer's songs too (README.md, "Adding things")
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
const kept = fs.readdirSync(`${dir}/kept`).filter((file) => /^composer-\d+\.js$/.test(file)).sort((a, b) => parseInt(a.slice(9), 10) - parseInt(b.slice(9), 10));
for (const file of ['synth.js', ...kept.map((one) => `kept/${one}`), 'music.js', 'library.js']) vm.runInContext(fs.readFileSync(`${dir}/${file}`, 'utf8'), page);
const run = (expr) => vm.runInContext(expr, page);
const { COMPOSER, composeSong, cleanSong, notesPrint } = run('({ COMPOSER, composeSong, cleanSong, notesPrint })');
const html = fs.readFileSync(`${dir}/../../squimble-music-maker.html`, 'utf8');
for (const one of kept) assert(html.includes(`js/squimble-music-maker/kept/${one}`), `the page loads kept/${one}`);
for (let n = 1; n < COMPOSER; n++) assert(run(`KEPT_COMPOSERS[${n}]`), `composer ${n} is kept (kept/composer-${n}.js), since COMPOSER is ${COMPOSER}`);

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
  // as they'd be saved: what the page keeps is the song after a trip through json
  return songs.map((song) => JSON.parse(JSON.stringify(song)));
}

if (process.argv.includes('--add')) {
  // only for a composer with no songs kept yet: the ones there are what saved songs must stay
  for (let n = 1; n <= COMPOSER; n++) {
    if (fs.existsSync(file(n))) continue;
    const songs = makeSongs(n).map((song) => ({ song, print: played(song) }));
    fs.mkdirSync(`${__dirname}/saved-songs`, { recursive: true });
    fs.writeFileSync(file(n), zlib.gzipSync(JSON.stringify(songs), { level: 9 }));
    console.log(`kept ${songs.length} songs from composer ${n}`);
  }
}

for (let n = 1; n <= COMPOSER; n++) {
  assert(fs.existsSync(file(n)), `composer ${n} has songs kept to check (run this with --add once it's finished)`);
  const songs = JSON.parse(zlib.gunzipSync(fs.readFileSync(file(n))));
  const changed = songs.filter(({ song, print }) => played(song) !== print);
  assert(!changed.length, `${changed.length} of ${songs.length} songs made by composer ${n} no longer play the notes they were saved with (${changed.slice(0, 5).map(({ song }) => `${song.seed} ${song.mood}/${song.flavour || ''} ${song.style}`).join(', ')}). Keep music.js as it was before this change as kept/composer-${COMPOSER}.js and put COMPOSER up one: see the top of this file`);
}
