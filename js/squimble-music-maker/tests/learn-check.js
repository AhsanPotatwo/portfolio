// checks the learn tab's reading of a part (learn.js): the usual guitar shapes are fingered the way
// players finger them and shapes no hand holds are never shown, the composer's guitar chords come out as
// the barre shapes it means (the soggy-crater shoegaze song, the one this was made for), every guitar's
// chords in every mood and flavour are ones a hand holds whole (forGuitar), every part of every mood can
// be fretted in reach on a guitar and a bass, a finger a fret, keys are written with the right signature
// and notes spelled in it, and sheet music fills every bar exactly, cutting nothing across a bar line.
// run it with
// node js/squimble-music-maker/tests/learn-check.js (no output means it all passed)
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const page = {};
vm.createContext(page);
for (const file of ['instruments.js', 'synth.js', 'kept/composer-3.js', 'moods.js', 'music.js', 'learn.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), page);
const { generateSong, composeSong, MOODS, FLAVOURS, SCALES, INSTRUMENTS, playedTogether, frettings, fingersFor, keySignature, spellPitch, sheetPieces, STRINGS, onGuitar, holds, GUITAR_TUNINGS } = vm.runInContext('({ generateSong, composeSong, MOODS, FLAVOURS, SCALES, INSTRUMENTS, playedTogether, frettings, fingersFor, keySignature, spellPitch, sheetPieces, STRINGS, onGuitar, holds, GUITAR_TUNINGS })', page);
const hand = vm.runInContext('fingering', page);

// a shape written the way chord books write it, low e first: x an unplayed string
const shape = (text) => [...text].map((fret, string) => (fret === 'x' ? null : { string, fret: +fret })).filter(Boolean);
const fingering = (text) => {
  const { fingers, barres } = fingersFor(shape(text));
  return [[...text].map((fret, string) => fingers[string] ?? (fret === 'x' ? 'x' : 0)).join(''), barres.map((one) => `${one.finger}@${one.fret}:${one.from}-${one.to}`).join(' ')];
};
assert.deepStrictEqual(fingering('x32010'), ['x32010', ''], 'open c');
assert.deepStrictEqual(fingering('xx0232'), ['xx0132', ''], 'open d');
assert.deepStrictEqual(fingering('022100'), ['023100', ''], 'open e');
assert.deepStrictEqual(fingering('320003'), ['210003', ''], 'open g');
assert.deepStrictEqual(fingering('133211'), ['134211', '1@1:0-5'], 'f barre');
assert.deepStrictEqual(fingering('x02220'), ['x01230', ''], 'open a');
assert.deepStrictEqual(fingering('799xxx'), ['134xxx', ''], 'power chord');
assert.deepStrictEqual(fingering('333xxx'), ['111xxx', '1@3:0-2'], 'a power chord in drop d is one finger');
// a power chord isn't held with a string skipped in the middle (c3 g3 c4 as x3x01x)
assert.deepStrictEqual([...frettings([{ t: 0, end: 1, notes: [{ midi: 48 }, { midi: 55 }, { midi: 60 }] }], 'guitar').placed[0].strings.map((s) => s.fret)], [3, 5, 5], 'c5 as a power chord shape');
// the soggy-crater shape (b sus4 add9): a first finger barre at 7, the third barring a d g at 9
assert.deepStrictEqual(fingering('799979'), ['133314', '1@7:0-4 3@9:1-3'], 'e shape with a sus and a ninth');
// shapes no hand holds: 6 8 x 6 4 8 (shown once with the little finger on three frets at once), an e
// shaped bmaj7 with its seventh on top (the little finger flat across three strings), five fingers'
// worth, and a five fret stretch by the nut
const unheld = (text) => hand(shape(text).map(({ string, fret }) => [string, fret])) === null;
for (const text of ['68x648', '999876', '21342x', '15xxxx']) assert(unheld(text), `${text} can't be held`);
// an open string can ring under a fretted note on a lower string (c on the g string over an open b):
// the close rubs shoegaze's open strings make
assert(holds([59, 60], GUITAR_TUNINGS.standard, 22).some((way) => way.some(([string, fret]) => string === 4 && fret === 0)), 'an open b under a c');

// the composer's strummed shoegaze guitar comes out as the e shaped barre chords it plays. (soggy-crater as
// composer 3 wrote it, the song this was made for: composer 4 gave shoegaze its open strings, and the seed
// makes another song now)
const kept3 = vm.runInContext('KEPT_COMPOSERS[3]', page);
const song = kept3.generateSong('shoegaze', 'tune', 'soggy-crater');
const comp = kept3.composeSong(song);
const guitar = playedTogether(comp.notes.filter((note) => note.layer === 'guitar'), comp.step);
const fretted = frettings(guitar, 'guitar');
assert.strictEqual(fretted.dropped, false);
// (its open emaj7, e b e g# b d#, can't be held whole: the d# would be below the open top string.
// the doubled b goes, and it's 0 2 2 1 4 x. no chord loses more than one note, or its bass)
guitar.forEach((event, i) => {
  const kept = fretted.placed[i].strings.map((one) => one.midi);
  assert(kept.length >= event.notes.length - 1 && kept[0] === event.notes[0].midi, `chord at beat ${event.t} lost too much`);
});
assert.deepStrictEqual([...fretted.placed[0].strings.map((one) => one.fret)], [7, 9, 9, 9, 7, 9], 'soggy-crater opens on a b barre at the 7th fret');
assert(guitar.some((event) => event.up) && guitar.some((event) => !event.up), 'strums go down and up');

// a guitar tuned down (drop in synth.js) is read in drop b, its low notes where they're played, not folded
for (let n = 0, found = false; !found; n++) {
  assert(n < 40, 'a concrete song with a drop tuned guitar turns up');
  const one = generateSong('shoegaze', 'tune', `drop ${n}`, [], 'concrete');
  const layer = one.layers.find((l) => l.instrument === 'drop-guitar');
  if (!layer) continue;
  found = true;
  const low = frettings(playedTogether(composeSong(one).notes.filter((note) => note.layer === layer.id), comp.step), 'guitar', true);
  assert(low.down && low.tuning[0] === 35 && !low.folded, 'a drop tuned part is fretted in drop b, nothing folded');
}

// today's composer only gives a guitar chords a hand holds whole, in every mood and flavour: none of a
// guitar's chord parts loses a note in the learn tab
for (const mood of Object.keys(MOODS)) {
  for (const flavour of Object.keys(FLAVOURS[mood]?.kinds || { plain: 1 }).map((kind, i) => (i ? kind : undefined))) {
    for (const [style, seed] of [['tune', 'd learn'], ['ambient', 'e learn']]) {
      const one = generateSong(mood, style, seed, [], flavour);
      const notes = composeSong(one);
      for (const layer of one.layers.filter((l) => onGuitar(l.instrument) && ['guitar', 'keys', 'pad'].includes(l.role))) {
        const { placed } = frettings(playedTogether(notes.notes.filter((note) => note.layer === layer.id), notes.step), 'guitar', (INSTRUMENTS[layer.instrument].drop || 0) < 0);
        placed.forEach((one, i) => assert(!one.left, `${mood} ${flavour || ''} ${style} ${layer.id}: chord ${i} can't be held whole`));
      }
    }
  }
}

// every tonal part of every mood frets in reach on a guitar and on a bass, a note a string, a finger on
// one fret, and every part's sheet music fills its bars exactly
let parts = 0;
for (const mood of Object.keys(MOODS)) {
  for (const [style, seed] of [['tune', 'a learn'], ['ambient', 'b learn'], ['boss', 'c learn']]) {
    const one = generateSong(mood, style, seed);
    const notes = composeSong(one);
    const signature = keySignature(one.key, SCALES[one.scale].steps);
    assert(Math.abs(signature) <= 6);
    const quarters = one.meter === '6/8' ? 1.5 : 1;
    for (const layer of one.layers.filter((l) => l.role !== 'drums' && l.role !== 'texture')) {
      const events = playedTogether(notes.notes.filter((note) => note.layer === layer.id), notes.step);
      if (!events.length) continue;
      parts++;
      for (const kind of ['guitar', 'bass']) {
        const { tuning, placed } = frettings(events, kind);
        placed.forEach(({ strings, hand }, i) => {
          assert(strings.length, `${mood} ${layer.id} on ${kind}: nothing held at event ${i}`);
          const frets = strings.filter((s) => s.fret > 0).map((s) => s.fret);
          if (frets.length) assert(Math.max(...frets) - Math.min(...frets) <= 4, `${mood} ${layer.id}: out of reach`);
          assert.strictEqual(new Set(strings.map((s) => s.string)).size, strings.length, 'one note a string');
          for (const s of strings) {
            assert.strictEqual(tuning[s.string] + s.fret, s.midi, 'the fret plays the pitch');
            assert(s.fret <= STRINGS[kind].frets);
          }
          const { fingers } = fingersFor(strings, hand);
          for (const finger of Object.values(fingers)) assert(finger >= 1 && finger <= 4);
          for (const finger of new Set(Object.values(fingers))) assert.strictEqual(new Set(strings.filter((s) => fingers[s.string] === finger).map((s) => s.fret)).size, 1, `${mood} ${layer.id}: a finger on two frets`);
        });
      }
      const pieces = sheetPieces(events, { beats: notes.beats, bpb: notes.bpb, step: notes.step, quarters }, signature, 0);
      const bars = {};
      for (const piece of pieces) {
        const bar = Math.floor(piece.t / notes.bpb + 1e-6);
        const end = piece.t + piece.value / quarters;
        assert(end <= (bar + 1) * notes.bpb + 1e-6, `${mood} ${layer.id}: a piece crosses a bar line`);
        bars[bar] = (bars[bar] || 0) + piece.value;
      }
      for (const [bar, filled] of Object.entries(bars)) assert(Math.abs(filled - notes.bpb * quarters) < 1e-6, `${mood} ${style} ${layer.id}: bar ${bar} holds ${filled} quarters`);
    }
  }
}
assert(parts > 300, `only ${parts} parts checked`);

// signatures and spelling
const steps = (scale) => SCALES[scale].steps;
assert.strictEqual(keySignature(2, steps('dorian')), 0, 'd dorian has c major\'s notes');
assert.strictEqual(keySignature(9, steps('minorPentatonic')), 0, 'a minor pentatonic is written in a minor');
assert.strictEqual(keySignature(7, steps('majorPentatonic')), 1, 'g major pentatonic is written in g');
assert.strictEqual(keySignature(11, steps('minor')), 2, 'b minor');
assert.strictEqual(keySignature(5, steps('major')), -1, 'f major');
assert.strictEqual(keySignature(3, steps('major')), -3, 'e flat major');
assert.strictEqual(spellPitch(65, 6).name, 'E#', 'f# major has an e#');
assert.strictEqual(spellPitch(70, -1).name, 'Bb', 'f major has a b flat');
assert.strictEqual(spellPitch(65, 2).name, 'F', 'an f natural in d major');
assert.strictEqual(spellPitch(60, 0).step, 4 * 7, 'middle c is c4');
// an f natural in d major is written with a natural, and only once in its bar
const naturals = sheetPieces([{ t: 0, end: 1, notes: [{ midi: 65 }] }, { t: 1, end: 2, notes: [{ midi: 65 }] }], { beats: 4, bpb: 4, step: 0.25, quarters: 1 }, 2);
assert.deepStrictEqual([...naturals.filter((p) => !p.rest).map((p) => p.heads[0].show)], [true, false]);
