// checks library.js, where saved songs are kept: notes pack and come back the same, saving over a song
// keeps the one before in its history, a name is never taken twice, the bin gives songs back, a backup
// restores everything and restoring only ever adds, and songs saved before the library had ids are
// moved over once. node has no indexeddb, so this is the library working from local storage alone, as
// it does in a browser that won't open one; the database itself was checked in the browser
// node js/squimble-music-maker/tests/library-check.js (no output means it all passed), a few seconds
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// a page's local storage, kept between "visits" (each a new context)
const stored = new Map();
const localStorage = {
  getItem: (key) => (stored.has(key) ? stored.get(key) : null),
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key),
};
const visit = () => {
  const page = { localStorage, TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, atob, btoa, setTimeout, clearTimeout, console };
  vm.createContext(page);
  for (const file of ['synth.js', 'music.js', 'library.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), page);
  return (expr) => vm.runInContext(expr, page);
};
const same = (a, b, message) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), message);

(async () => {
  let run = visit();
  const { generateSong, composeSong, cleanSong, notesPrint, packNotes, unpackNotes } = run('({ generateSong, composeSong, cleanSong, notesPrint, packNotes, unpackNotes })');
  const song = generateSong('bleak', 'tune', 'frosted-waffle', [], 'postrock');
  const notes = composeSong(song).notes;
  same(cleanSong(JSON.parse(JSON.stringify(song))), song, 'a saved song cleans back to itself, so it isn\'t "changed since saving"');

  // notes pack small and come back the same
  const packed = await packNotes(notes);
  const back = await unpackNotes(packed);
  assert.strictEqual(notesPrint(back), notesPrint(notes), 'notes come back with the same fingerprint');
  assert(packed.length < JSON.stringify(notes).length / 4, 'notes pack small');
  const moved = JSON.parse(JSON.stringify(notes));
  moved[10].midi += 1;
  assert.notStrictEqual(notesPrint(moved), notesPrint(notes), 'one note moved is a different fingerprint');
  assert.strictEqual(await unpackNotes('[{"t":"x"}]'), null, "broken notes don't come back");
  assert.strictEqual(await unpackNotes(new Uint8Array([1, 2, 3])), null, "junk bytes don't come back");

  // songs saved before the library: one local storage key, by name. moved over once, and left there
  stored.set('squimble-music-library', JSON.stringify({ 'Frosted Waffle': { song, saved: 1000 }, 'Squeaky Lighthouse': { song: generateSong('shop', 'loop', 'squeaky-lighthouse', [], 'shady'), saved: 2000 }, junk: 5 }));
  await run('library = new SongLibrary(); library.start()');
  assert.strictEqual(run('library.list().length'), 2, 'old saves are moved into the library');
  assert.strictEqual(run('library.list()[0].name'), 'Squeaky Lighthouse', 'newest first');
  assert(stored.has('squimble-music-library'), 'the old saves are left where they were');
  run = visit();
  await run('library = new SongLibrary(); library.start()');
  assert.strictEqual(run('library.list().length'), 2, 'and only moved once');

  // saving: new, then over it (the one before goes in its history), then a copy
  const first = await run('(song) => library.save(song, [])')({ ...song, name: 'Mine' });
  assert.strictEqual(first.name, 'Mine');
  const changedSong = { ...song, name: 'Mine', tempo: song.tempo + 10 };
  const second = await run('(song, notes, id) => library.save(song, notes, id)')(changedSong, notes, first.id);
  assert.strictEqual(second.id, first.id, 'saving over keeps the song');
  assert.strictEqual(second.versions.length, 1, 'and the save before goes in its history');
  assert.strictEqual(second.versions[0].song.tempo, song.tempo, 'as it was');
  assert.strictEqual(notesPrint(await run('(entry) => library.notes(entry)')(second)), notesPrint(notes), "a save keeps the notes it played");
  const copy = await run('(song) => library.save(song, [])')(changedSong);
  assert.strictEqual(copy.name, 'Mine 2', "a copy never takes another song's name");
  assert.notStrictEqual(copy.id, first.id);
  const clash = await run('(song) => library.save(song, [])')({ ...song, name: 'Frosted Waffle' });
  assert.strictEqual(clash.name, 'Frosted Waffle 2', 'saving a new song never saves over another with its name');

  // the bin: out of the library, back, and only gone for good from there
  await run('(id) => library.destroy(id)')(copy.id);
  assert(run('(id) => !!library.get(id)')(copy.id), "a song not in the bin can't be deleted");
  await run('(id) => library.bin(id)')(copy.id);
  assert(!run('library.list()').some((entry) => entry.id === copy.id) && run('library.list(true)').length === 1, 'binned songs leave the library for the bin');
  await run('(id) => library.unbin(id)')(copy.id);
  assert(run('library.list()').some((entry) => entry.id === copy.id), 'and come back');
  await run('(id) => library.bin(id)')(clash.id);
  await run('(id) => library.destroy(id)')(clash.id);
  assert(!run('(id) => !!library.get(id)')(clash.id), 'deleted from the bin is gone');

  // it's all still there on the next visit
  const before = run('JSON.stringify([...library.songs.values()].map(({ notes, print, ...rest }) => rest).sort((a, b) => a.id < b.id ? -1 : 1))');
  run = visit();
  await run('library = new SongLibrary(); library.start()');
  assert.strictEqual(run('JSON.stringify([...library.songs.values()].map(({ notes, print, ...rest }) => rest).sort((a, b) => a.id < b.id ? -1 : 1))'), before, 'the library is kept between visits');

  // a backup: into an empty browser, everything comes back. again, nothing changes. a copy that went
  // its own way gets the saves it was missing, and keeps its own
  await run('(id) => library.bin(id)')(copy.id);
  const backup = JSON.parse(run('JSON.stringify(library.backup())'));
  stored.clear();
  run = visit();
  await run('library = new SongLibrary(); library.start()');
  assert.strictEqual(run('library.songs.size'), 0);
  same(await run('(data) => library.restore(data)')(backup), { added: 4, merged: 0, same: 0 }, 'a backup restores every song');
  assert.strictEqual(run('library.list(true).length'), 1, 'the bin too');
  same(await run('(data) => library.restore(data)')(backup), { added: 0, merged: 0, same: 4 }, 'restoring it twice changes nothing');
  const third = await run('(song, notes, id) => library.save(song, notes, id)')({ ...changedSong, tempo: 99 }, notes, first.id);
  assert.strictEqual(third.versions.length, 2);
  const elsewhere = JSON.parse(JSON.stringify(backup));
  const theirs = elsewhere.songs.find((entry) => entry.id === first.id);
  theirs.versions.unshift({ name: theirs.name, song: theirs.song, saved: theirs.saved });
  theirs.song = { ...theirs.song, tempo: 140 };
  theirs.saved += 5;
  same(await run('(data) => library.restore(data)')(elsewhere), { added: 0, merged: 1, same: 3 }, 'a backup that went its own way is merged');
  const merged = run('(id) => library.get(id)')(first.id);
  assert.strictEqual(merged.song.tempo, 99, 'the newest save is still the latest');
  assert(merged.versions.some((one) => one.song.tempo === 140), "and the other browser's save is in its history");
  assert.strictEqual(new Set([merged.saved, ...merged.versions.map((one) => one.saved)]).size, merged.versions.length + 1, 'each save once');
  assert.strictEqual(notesPrint(await run('(entry) => library.notes(entry)')(merged)), notesPrint(notes), 'with its notes');

  // a song file restores as a new song; junk doesn't
  same(await run('(data) => library.restore(data)')(JSON.parse(JSON.stringify(song))), { added: 1, merged: 0, same: 0 }, 'a song file is added');
  for (const junk of [null, 5, {}, { squimble: 'music library', songs: [null, { id: 3 }, { id: 'x' }] }]) {
    try {
      const counts = await run('(data) => library.restore(data)')(junk);
      same(counts, { added: 0, merged: 0, same: 0 }, 'junk adds nothing');
    } catch { /* not a backup: fine */ }
  }
  console.log('library-check passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
