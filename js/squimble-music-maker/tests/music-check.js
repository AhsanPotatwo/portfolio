// checks the composer (music.js): every mood makes a song in both styles, the same seed always makes
// the same song, songs save and load back the same, junk files get cleaned up, chords parse,
// melodies land on chord notes on strong beats, the band shares one groove, and the rules for a band
// that fits (README.md) hold: harshness caps, no doubled instruments, no holes in melodies, no
// blinking layers, bells on the beat, the right drums for each mood, kits on patterns they suit,
// drums and textures in key, textures under the tune, the band listening (the tune on top, nothing
// rubbing against it), melodies whose motif comes back, themes longer than their motif, solos that
// never repeat and come home, an uncrowded band (two middle parts, no blur of running notes, one
// world of sounds, surprises from nearby moods, textures that go together), and moods that only name
// real instruments.
// run it with
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
const { INSTRUMENTS, maxEdge, roleFamily, MIDDLE, usesRate, rateStep, MAX_RATE, kindred, OPENERS } = vm.runInContext('({ INSTRUMENTS, maxEdge, roleFamily, MIDDLE, usesRate, rateStep, MAX_RATE, kindred, OPENERS })', page);
// every tonal instrument has an edge: the organ had none, so it never fitted under any cap
for (const [id, inst] of Object.entries(INSTRUMENTS)) if (inst.family !== 'kit' && inst.family !== 'texture') assert(Number.isFinite(inst.edge), `${id} has an edge`);
// every instrument a mood names is real, and every drum pattern has a groove in every time signature
const { PATTERNS } = vm.runInContext('({ PATTERNS })', page);
for (const [id, mood] of Object.entries(MOODS)) {
  for (const name of [...Object.values(mood.palette).flat(), ...mood.kits, ...mood.textures]) assert(INSTRUMENTS[name], `${id} names ${name}, which isn't an instrument`);
}
for (const pattern of Object.keys(PATTERNS.drums)) for (const meter of Object.keys(METERS)) assert(GROOVES[meter][pattern]?.length, `${pattern} has a groove in ${meter}`);
let stuck = 0;
let lines = 0;
let motifs = 0;
let eights = 0;
let rhythms = 0;
let soloBars = 0;
let soloNew = 0;
let soloEnds = 0;
let soloHome = 0;
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
      // not crowded: two parts at most moving round the middle, ambient songs six layers at most, and
      // running notes no faster than six a second
      assert(song.layers.filter((l) => MIDDLE.includes(l.role)).length <= 2, `${where}: two middle parts at most`);
      if (style === 'ambient') assert(song.layers.length <= 6, `${where}: ambient songs have room`);
      for (const layer of song.layers.filter(usesRate)) assert(layer.rate === 'slow' || song.tempo / 60 / rateStep(layer.rate, METERS[song.meter].sub) <= MAX_RATE, `${where}: the ${layer.role} runs too fast`);
      // one band: chip and acoustic sounds never together, and surprises only from moods near this one
      const worlds = new Set(song.layers.map((l) => INSTRUMENTS[l.instrument].world));
      assert(!(worlds.has('chip') && worlds.has('acoustic')), `${where}: chip and acoustic sounds in one band`);
      const kin = kindred(MOODS[mood]);
      for (const layer of tonal) assert(kin.has(layer.instrument), `${where}: ${layer.instrument} is from a much darker or lighter mood`);
      // no section is only scenery, and a tune opens on two of its band (one in ambient), never a lone
      // pad: an intro that was all texture made a happy song start out ambient
      const players = song.layers.filter((l) => OPENERS.includes(l.role)).map((l) => l.id);
      for (const section of song.sections) assert(section.play.some((id) => song.layers.find((l) => l.id === id).role !== 'texture'), `${where}: ${section.name} is only the texture`);
      assert(song.sections[0].play.filter((id) => players.includes(id)).length >= Math.min(players.length, style === 'tune' ? 2 : 1), `${where}: the intro is too thin`);
      // two textures are two different ones, and not two steady beds
      const textures = song.layers.filter((l) => l.role === 'texture').map((l) => INSTRUMENTS[l.instrument]);
      if (textures.length > 1) assert(textures[0] !== textures[1] && !(textures[0].bed && textures[1].bed), `${where}: two textures that don't go together`);
      const drums = song.layers.find((l) => l.role === 'drums');
      if (mood === 'cozy' && drums) assert(drums.instrument === 'brushes' && drums.pattern === 'brush', `${where}: cozy drums are brushes`);
      if (mood === 'dreamy' || mood === 'heavenly') assert(!drums, `${where}: no drums`);

      const comp = composeSong(song);
      const melody = song.layers.find((l) => l.role === 'melody');
      if (melody) {
        // no blinking: the melody doesn't sit out one section between two it plays in, apart from a C break
        // or another layer's solo
        const on = song.sections.map((s) => s.play.includes('melody'));
        for (let i = 1; i < on.length - 1; i++) assert(!(on[i - 1] && !on[i] && on[i + 1]) || song.sections[i].part === 'C' || song.sections[i].lead, `${where}: the melody doesn't drop out of section ${i} and back`);
        // no holes mid phrase: phrases are near legato, calls rest for at most half a bar, and
        // fragments leave two bars of space at most
        const allowed = { calls: comp.bpb / 2 + 0.05, fragments: comp.bpb * 2 + 0.05 }[melody.pattern] || 1;
        // one note at a time: a note left ringing ran over the next section's first
        const all = comp.notes.filter((note) => note.layer === 'melody').sort((a, b) => a.gt - b.gt);
        for (let i = 1; i < all.length; i++) assert(all[i - 1].gt + all[i - 1].dur <= all[i].gt + 1e-6, `${where}: melody notes overlap at beat ${all[i].gt}`);
        for (const section of comp.sections) {
          const notes = comp.notes.filter((note) => note.layer === 'melody' && note.gt >= section.start && note.gt < section.end).sort((a, b) => a.gt - b.gt);
          // and one note at a time: two starting together was a stray blip clashing with the tune
          for (let i = 1; i < notes.length; i++) assert(notes[i].gt - notes[i - 1].gt > 1e-6, `${where}: two melody notes start together at beat ${notes[i].gt}`);
          for (let i = 1; i < notes.length; i++) assert(notes[i].gt - (notes[i - 1].gt + notes[i - 1].dur) <= allowed, `${where}: a gap of ${(notes[i].gt - notes[i - 1].gt - notes[i - 1].dur).toFixed(2)} beats in the ${melody.pattern} melody`);
          // the tune comes back: the second phrase starts with the same rhythm as the first (a
          // random walk of steps, new every bar, gave you nothing to remember)
          // (not in a solo, which is new all the way through)
          if (section.bars >= 8 && !section.lead) {
            const starts = (bar) => notes.filter((n) => n.gt >= section.start + bar * comp.bpb - 1e-6 && n.gt < section.start + (bar + 1) * comp.bpb - 1e-6).map((n) => (n.gt - section.start - bar * comp.bpb).toFixed(3)).join();
            assert.strictEqual(starts(4), starts(0), `${where}: the motif comes back in the section's second phrase`);
            motifs++;
          }
          const barOf = (bar, pitches) => notes.filter((n) => n.gt >= section.start + bar * comp.bpb - 1e-6 && n.gt < section.start + (bar + 1) * comp.bpb - 1e-6).map((n) => (n.gt - section.start - bar * comp.bpb).toFixed(2) + (pitches ? `:${n.midi}` : '')).join();
          // the theme is longer than its motif: eight bars of it have a few bar rhythms, not one on repeat
          if (!section.lead && notes.length) {
            for (let at = 0; at + 8 <= section.bars; at += 8) {
              eights++;
              rhythms += new Set(Array.from({ length: 8 }, (_, bar) => barOf(at + bar, false)).filter(Boolean)).size;
            }
          }
          // a solo never repeats itself, and its last note comes home: a chord note, nearly always the
          // root (a borrowed chord's root, or the IV's in a pentatonic tune, can be outside the scale)
          if (section.lead === 'melody' && notes.length) {
            const bars = Array.from({ length: section.bars }, (_, bar) => barOf(bar, true)).filter(Boolean);
            soloBars += bars.length;
            soloNew += new Set(bars).size;
            const last = notes[notes.length - 1];
            const chord = section.chords.find((ch) => last.gt < ch.t + ch.dur - 1e-6);
            assert(chord.pcs.has(((last.midi % 12) + 12) % 12), `${where}: the solo ends on a chord note`);
            soloEnds++;
            if (((last.midi % 12) + 12) % 12 === chord.root) soloHome++;
          }
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
assert(motifs > 50, `enough long sections to check motifs come back (${motifs})`);
// before themes had a second idea and a middle, eight bars averaged 1.7 bar rhythms (it's 2.6 now)
assert(rhythms / eights > 2.3, `themes have more than one bar rhythm (${(rhythms / eights).toFixed(2)} per eight bars)`);
assert(soloHome / soloEnds > 0.8, `solos come home to the root (${soloHome} of ${soloEnds})`);
assert(soloBars > 200 && soloNew / soloBars > 0.9, `solos are new all the way through (${soloNew} of ${soloBars} bars)`);

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
