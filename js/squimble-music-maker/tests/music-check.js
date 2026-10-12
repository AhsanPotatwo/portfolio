// checks the composer (music.js): every mood makes a song in both styles, the same seed always makes
// the same song, songs save and load back the same, junk files get cleaned up, chords parse, and
// melodies land on chord notes on strong beats. run it with node js/squimble-music-maker/tests/music-check.js
// (no output means it all passed).
//
// synth.js is loaded too, for INSTRUMENTS. it doesn't play anything here, nothing in it touches web
// audio until a note is played, so the sound itself was checked by listening in the browser
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const page = {};
vm.createContext(page);
for (const file of ['synth.js', 'music.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), page);
const { generateSong, composeSong, cleanSong, rerollSong, parseChord, MOODS } = vm.runInContext('({ generateSong, composeSong, cleanSong, rerollSong, parseChord, MOODS })', page);
const same = (a, b, message) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), message);

same(parseChord('bVII'), { root: 10, tones: [0, 4, 7], fixed: false }, 'bVII');
same(parseChord('ii°').tones, [0, 3, 6], 'ii°');
same(parseChord('Imaj7').tones, [0, 4, 7, 11], 'Imaj7');
assert.strictEqual(parseChord('#iv').root, 6);
assert.strictEqual(parseChord('hello'), null);

let strong = 0;
let onChord = 0;
for (const mood of Object.keys(MOODS)) {
  for (const style of ['ambient', 'tune']) {
    for (const seed of ['mossy-lantern', 'quiet-tide', 'x']) {
      const where = `${mood} ${style} ${seed}`;
      const song = generateSong(mood, style, seed);
      same(song, generateSong(mood, style, seed), `${where}: the same seed makes the same song`);
      same(cleanSong(JSON.parse(JSON.stringify(song))), song, `${where}: saves and loads back the same`);
      assert(song.layers.length >= 1 && song.layers.length <= 7, `${where}: 1 to 7 layers`);
      const comp = composeSong(song);
      same(comp.notes, composeSong(song).notes, `${where}: the same notes every time`);
      assert(comp.notes.length > 0, `${where}: makes notes`);
      for (const note of comp.notes) {
        assert(Number.isFinite(note.t) && note.t >= 0 && note.t < comp.beats + 0.1, `${where}: a note inside the song`);
        assert(note.dur > 0 && note.midi >= 0 && note.midi <= 127 && note.vel > 0 && note.vel <= 1, `${where}: a sensible note`);
      }
      // the theory: melody notes on strong beats should mostly be chord notes
      for (const note of comp.notes.filter((n) => n.layer === 'melody')) {
        const section = comp.sections.find((s) => note.gt >= s.start && note.gt < s.end);
        const inBar = (note.gt - section.start) % comp.bpb;
        if (Math.abs(inBar) > 1e-6) continue;
        const chord = section.chords.find((c) => note.gt >= c.t && note.gt < c.t + c.dur);
        strong++;
        if (chord.pcs.has(((note.midi % 12) + 12) % 12)) onChord++;
      }
      for (const what of ['chords', 'melodies', 'band', 'arrangement', 'space', 'tonality', 'mutate']) composeSong(rerollSong(song, what, 'test'));
    }
  }
}
assert(onChord / strong > 0.85, `melodies start bars on chord notes (${onChord} of ${strong})`);

// grooves: every line is a bar long for its time signature
const { GROOVES, METERS } = vm.runInContext('({ GROOVES, METERS })', page);
for (const [meter, kinds] of Object.entries(GROOVES)) {
  const steps = METERS[meter].beats * METERS[meter].sub * (METERS[meter].sub === 2 ? 2 : 1);
  for (const [kind, list] of Object.entries(kinds)) for (const groove of list) for (const [line, text] of Object.entries(groove)) assert.strictEqual(text.length, steps, `${meter} ${kind} ${line} is a bar long`);
}

// the band plays one groove: drums repeat bar to bar (apart from fills), and a syncopated bass lands
// on the kick
for (const seed of ['mossy-lantern', 'quiet-tide', 'rusty-tower', 'x']) {
  for (const meter of ['4/4', '3/4', '6/8', '5/4']) {
    const song = generateSong('upbeat', 'tune', seed);
    song.meter = meter;
    for (const role of ['drums', 'bass']) if (!song.layers.some((l) => l.role === role)) song.layers.push({ role, id: role, pattern: 'groove' });
    // a calm bass (busy also plays the comping hits, between the kicks)
    for (const layer of song.layers) if (layer.role === 'bass') Object.assign(layer, { pattern: 'synco', density: 0.4 });
    for (const section of song.sections) section.play = song.layers.map((l) => l.id);
    const comp = composeSong(cleanSong(song));
    const section = comp.sections.find((s) => s.bars >= 4);
    const bar = (n, layer) => comp.notes.filter((note) => note.layer === layer && note.gt >= section.start + n * comp.bpb - 1e-6 && note.gt < section.start + (n + 1) * comp.bpb - 1e-6).map((note) => `${(note.gt - section.start - n * comp.bpb).toFixed(3)}:${note.midi}`).sort().join();
    assert.strictEqual(bar(1, 'drums'), bar(2, 'drums'), `${seed} ${meter}: drums repeat bar to bar`);
    const kicks = new Set(comp.notes.filter((n) => n.layer === 'drums' && n.midi === 0).map((n) => n.gt.toFixed(3)));
    const chordStarts = new Set(comp.sections.flatMap((s) => s.chords.map((ch) => ch.t.toFixed(3))));
    const bassNotes = comp.notes.filter((n) => n.layer === 'bass');
    const onKick = bassNotes.filter((n) => kicks.has(n.gt.toFixed(3)) || chordStarts.has(n.gt.toFixed(3))).length;
    assert(onKick / bassNotes.length > 0.95, `${seed} ${meter}: the bass lands with the kick (${onKick} of ${bassNotes.length})`);
  }
}

// junk in, a playable song out
for (const junk of [null, 'hello', 42, {}, { layers: [{ role: 'nope' }, { role: 'bass', instrument: 'wind', volume: 'loud' }], sections: [{ bars: -5, play: 'bass' }], tempo: 1e9 }]) {
  const song = cleanSong(junk);
  assert(song.sections.length && song.tempo <= 220, 'junk is cleaned');
  composeSong(song);
}
const cleaned = cleanSong({ layers: [{ role: 'bass', instrument: 'wind' }] });
assert.notStrictEqual(cleaned.layers[0].instrument, 'wind', "a bass can't be played by a texture");
