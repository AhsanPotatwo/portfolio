// checks the composer (music.js): every mood makes a song in both styles, the same seed always makes
// the same song, songs save and load back the same, junk files get cleaned up, chords parse,
// melodies land on chord notes on strong beats, the band shares one groove, and the rules for a band
// that fits (README.md) hold: harshness caps, no doubled instruments, no holes in melodies, no
// blinking layers, bells on the beat, the right drums for each mood, kits on patterns they suit,
// drums and textures in key, textures under the tune, and the band listening (the tune on top, nothing
// rubbing against it). run it with
// node js/squimble-music-maker/tests/music-check.js (no output means it all passed).
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

// a band that fits (fitBand, pickInstrument and the moods in music.js, and the README's rules)
const { INSTRUMENTS, maxEdge, roleFamily } = vm.runInContext('({ INSTRUMENTS, maxEdge, roleFamily })', page);
// every tonal instrument has an edge: the organ had none, so it never fitted under any cap
for (const [id, inst] of Object.entries(INSTRUMENTS)) if (inst.family !== 'kit' && inst.family !== 'texture') assert(Number.isFinite(inst.edge), `${id} has an edge`);
let stuck = 0;
let lines = 0;
for (const mood of Object.keys(MOODS)) {
  for (const style of ['ambient', 'tune']) {
    for (let n = 0; n < 12; n++) {
      const song = generateSong(mood, style, `fit-${n}`);
      const where = `${mood} ${style} fit-${n}`;
      const tonal = song.layers.filter((l) => roleFamily(l.role) === 'tonal');
      for (const layer of tonal) {
        assert(INSTRUMENTS[layer.instrument].edge <= maxEdge(MOODS[mood], layer.role) + 1e-9 || !MOODS[mood].palette[layer.role].some((id) => INSTRUMENTS[id].edge <= maxEdge(MOODS[mood], layer.role)), `${where}: the ${layer.role} isn't harsher than the mood allows`);
        if (['keys', 'bell', 'bass'].includes(INSTRUMENTS[layer.instrument].family)) assert.strictEqual(layer.tone.vibrato, 0, `${where}: no vibrato on struck or plucked ${layer.role}`);
      }
      assert.strictEqual(new Set(tonal.map((l) => l.instrument)).size, tonal.length, `${where}: no two layers on the same instrument`);
      assert(!(song.layers.some((l) => l.role === 'arp') && song.layers.some((l) => l.role === 'counter')), `${where}: an arp or a counter melody, not both`);
      const drums = song.layers.find((l) => l.role === 'drums');
      if (mood === 'cozy' && drums) assert(drums.instrument === 'brushes' && drums.pattern === 'brush', `${where}: cozy drums are brushes`);
      if (mood === 'dreamy' || mood === 'heavenly') assert(!drums, `${where}: no drums`);

      const comp = composeSong(song);
      const melody = song.layers.find((l) => l.role === 'melody');
      if (melody) {
        // no blinking: the melody doesn't sit out one section between two it plays in, apart from a C break
        const on = song.sections.map((s) => s.play.includes('melody'));
        for (let i = 1; i < on.length - 1; i++) assert(!(on[i - 1] && !on[i] && on[i + 1]) || song.sections[i].part === 'C', `${where}: the melody doesn't drop out of section ${i} and back`);
        // no holes mid phrase: phrases are near legato, calls rest for at most half a bar
        const allowed = melody.pattern === 'calls' ? comp.bpb / 2 + 0.05 : 1;
        for (const section of comp.sections) {
          const notes = comp.notes.filter((note) => note.layer === 'melody' && note.gt >= section.start && note.gt < section.end).sort((a, b) => a.gt - b.gt);
          // and one note at a time: two starting together was a stray blip clashing with the tune
          for (let i = 1; i < notes.length; i++) assert(notes[i].gt - notes[i - 1].gt > 1e-6, `${where}: two melody notes start together at beat ${notes[i].gt}`);
          for (let i = 1; i < notes.length; i++) assert(notes[i].gt - (notes[i - 1].gt + notes[i - 1].dur) <= allowed, `${where}: a gap of ${(notes[i].gt - notes[i - 1].gt - notes[i - 1].dur).toFixed(2)} beats in the ${melody.pattern} melody`);
        }
      }
      const bells = song.layers.find((l) => l.role === 'bells' && l.pattern === 'phasing');
      if (bells) for (const note of comp.notes.filter((n) => n.layer === bells.id)) assert(Math.abs(note.gt - Math.round(note.gt)) < 1e-6, `${where}: drifting bells land on the beat`);

      // the drums: a kit only plays patterns it suits, and its pitched drums are on the key's home
      // note or fifth
      if (drums) {
        assert(INSTRUMENTS[drums.instrument].suits.includes(drums.pattern), `${where}: ${drums.instrument} suits ${drums.pattern}`);
        for (const note of comp.notes.filter((n) => n.layer === 'drums' && n.tune)) {
          const pc = ((Math.round(69 + 12 * Math.log2(note.tune / 440)) - song.key) % 12 + 12) % 12;
          assert(pc === 0 || pc === 7, `${where}: a drum tuned off the key`);
        }
      }
      // the texture sits under the tune, and hums the home note
      const texture = song.layers.find((l) => l.role === 'texture');
      if (texture) {
        if (melody) assert(texture.volume <= melody.volume * 0.55 + 1e-9, `${where}: the texture sits under the melody`);
        for (const note of comp.notes.filter((n) => n.layer === texture.id)) assert.strictEqual(note.midi % 12, song.key, `${where}: the texture's in the key`);
      }
      // the band listens (listen in music.js): keys, arps and counter melodies stay under the tune,
      // and nothing rubs a semitone against a longer melody note it's heard with
      const tune = comp.notes.filter((n) => n.layer === 'melody');
      if (tune.length) {
        const rubs = (a, b) => ((Math.max(a, b) - Math.min(a, b)) % 12) === 1;
        for (const layer of song.layers.filter((l) => ['keys', 'pad', 'arp', 'bells', 'counter'].includes(l.role))) {
          const floor = { keys: 62, arp: 60, counter: 62 }[layer.role] + layer.octave * 12 - 12;
          for (const note of comp.notes.filter((n) => n.layer === layer.id)) {
            const lead = tune.find((m) => m.gt <= note.gt + 1e-6 && note.gt < m.gt + m.dur - 1e-6);
            if (lead && floor) assert(note.midi <= lead.midi || note.midi - 12 < floor, `${where}: the ${layer.role} climbs over the tune at beat ${note.gt}`);
            if (layer.role !== 'pad' && layer.role !== 'keys') lines++;
            const heard = tune.filter((m) => m.dur >= 0.5 && m.gt < note.gt + note.dur - 1e-6 && m.gt + m.dur > note.gt + 1e-6);
            if (!heard.some((m) => rubs(m.midi, note.midi))) continue;
            // pads and keys keep a rubbing note only when it's the chord's own (root, third or fifth).
            // a single line rubs only if no chord note nearby was free
            if (layer.role === 'pad' || layer.role === 'keys') {
              const section = comp.sections.find((s) => note.gt < s.end - 1e-6);
              const chord = section.chords.find((ch) => note.gt < ch.t + ch.dur - 1e-6);
              assert(chord.tones.slice(0, 3).some((tone) => (chord.root + tone) % 12 === note.midi % 12), `${where}: the ${layer.role}'s added note rubs against the tune`);
            } else stuck++;
          }
        }
      }
    }
  }
}

assert(stuck / lines < 0.01, `single lines nearly never rub against the tune (${stuck} of ${lines})`);

// a note the band moved can still be removed by hand: the page removes it by the pitch it was written at
{
  const { editKey } = vm.runInContext('({ editKey })', page);
  const song = generateSong('happy', 'tune', 'rm-0');
  const hit = composeSong(song).notes.find((n) => n.written !== undefined);
  assert(hit, 'the band moved a note to test with');
  const section = composeSong(song).sections.find((s) => hit.gt >= s.start && hit.gt < s.end);
  song.layers.find((l) => l.id === hit.layer).edits[section.part] = { add: [], remove: [editKey(hit.gt - section.start, hit.written)] };
  assert(!composeSong(cleanSong(song)).notes.some((n) => n.layer === hit.layer && Math.abs(n.gt - hit.gt) < 1e-6 && n.midi === hit.midi), 'a moved note can be removed');
}

// junk in, a playable song out
for (const junk of [null, 'hello', 42, {}, { layers: [{ role: 'nope' }, { role: 'bass', instrument: 'wind', volume: 'loud' }], sections: [{ bars: -5, play: 'bass' }], tempo: 1e9 }]) {
  const song = cleanSong(junk);
  assert(song.sections.length && song.tempo <= 220, 'junk is cleaned');
  composeSong(song);
}
const cleaned = cleanSong({ layers: [{ role: 'bass', instrument: 'wind' }] });
assert.notStrictEqual(cleaned.layers[0].instrument, 'wind', "a bass can't be played by a texture");
