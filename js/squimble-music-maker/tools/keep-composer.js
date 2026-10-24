// keeps today's composer, for a change that would make saved songs sound different: before the change,
// moods.js and music.js are copied as they are into kept/composer-n.js (n is COMPOSER), wrapped so none
// of their names clash with music.js, and the next number goes on COMPOSER_VERSIONS and the Song tab's
// Composer keys. songs saved until now keep composer n, so they go on playing as they did.
//
//   node js/squimble-music-maker/tools/keep-composer.js               the files as they are now
//   node js/squimble-music-maker/tools/keep-composer.js --from HEAD   as they were at a commit, when
//                                                                     the change is already made
//
// then make the change, describe the kept composer in the Song tab's key (maker.js, "which composer
// writes the notes") and run tests/saved-songs-check.js --add once the new composer is finished.
// (the page fetches kept/composer-n.js by its number when a song made by it opens, so there's no script
// to add.) it never writes over a kept composer
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..');
const at = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;
// a file as it is, or as it was at the commit (null if it wasn't there: before the moods had a file of
// their own, they were in music.js)
const source = (file) => {
  if (!at) return fs.readFileSync(path.join(dir, file), 'utf8');
  try {
    return execFileSync('git', ['show', `${at}:./${file}`], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const music = source('music.js');
if (!music) throw new Error(`no music.js at ${at}`);
const versions = music.match(/^const COMPOSER_VERSIONS = \[([\d., ]+)\];$/m);
if (!versions) throw new Error('COMPOSER_VERSIONS not found in music.js');
const n = Math.max(...versions[1].split(',').map(Number));
const next = Math.floor(n) + 1;
const keptFile = path.join(dir, 'kept', `composer-${n}.js`);
if (fs.existsSync(keptFile)) throw new Error(`kept/composer-${n}.js is kept already. Is COMPOSER_VERSIONS behind?`);

const day = new Date();
const short = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const long = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
const where = at ? ` (commit ${execFileSync('git', ['rev-parse', '--short', at], { cwd: dir, encoding: 'utf8' }).trim()})` : '';
const moods = source('moods.js');
fs.writeFileSync(keptFile, [
  `// ================================ squimble music maker: composer ${n}, kept ================================`,
  '//',
  `// ${moods ? 'moods.js and music.js' : 'music.js'} as they were on ${long} ${day.getFullYear()}${where}, kept so songs saved`,
  `// with composer ${n} play as they did: composeSong in music.js hands them here. wrapped in a closure so`,
  "// none of its names clash with music.js. don't change anything in it: the point is it never changes.",
  '// the page fetches it only when a song made by it opens (maker.js), and the checks load it.',
  '// (generateSong and the lists are for tests/saved-songs-check.js, which makes songs the way this',
  '// composer made them)',
  '',
  'var KEPT_COMPOSERS = KEPT_COMPOSERS || {};',
  `KEPT_COMPOSERS[${n}] = (() => {`,
  ...(moods ? [moods] : []),
  music,
  'return { composeSong, generateSong, MOODS, FLAVOURS, STYLES };',
  '})();',
  '',
].join('\n'));

// today's composer is the next one now
const musicFile = path.join(dir, 'music.js');
const live = fs.readFileSync(musicFile, 'utf8');
fs.writeFileSync(musicFile, live.replace(/^(const COMPOSER_VERSIONS = \[[\d., ]+)\];$/m, `$1, ${next}];`));
// and the Song tab gets a key for the kept one, above today's
const makerFile = path.join(dir, 'maker.js');
const maker = fs.readFileSync(makerFile, 'utf8');
const today = maker.match(/^( *)\[COMPOSER, "Today's"/m);
if (today) fs.writeFileSync(makerFile, maker.replace(today[0], `${today[1]}[${n}, 'Up to ${short}', 'The composer up to ${long}. Songs saved then are written by it'],\n${today[0]}`));

console.log(`kept composer ${n} as kept/composer-${n}.js, and today's is composer ${next}.`);
console.log(`next: make the change, say what composer ${n} was in the Song tab's key (maker.js${today ? '' : ': its key list wasn\'t found, add one by hand'}),`);
console.log(`and run tests/saved-songs-check.js --add once composer ${next} is finished.`);
