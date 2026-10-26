// checks the composer (music.js): every mood makes a song in every style (ambient to final boss), the same seed always makes
// the same song, songs save and load back the same, junk files get cleaned up, chords parse,
// melodies land on chord notes on strong beats, the band shares one groove, and the rules for a band
// that fits (README.md) hold: harshness caps, no doubled instruments, no holes in melodies, no
// blinking layers, bells on the beat, the right drums for each mood, kits on patterns they suit,
// drums and textures in key, textures under the tune, the band listening (the tune on top, nothing
// rubbing against it), melodies whose motif comes back, themes longer than their motif, solos that
// never repeat and come home, an uncrowded band (two middle parts, no blur of running notes, one
// world of sounds, surprises from nearby moods, textures that go together), moods that only name
// real instruments, and the loud and hazy moods' rules (only their own instruments, one guitar a
// section in loud, quiet, loud, power chords of a root and fifth, riffs that repeat in key with the
// bass doubling them, solos over the chorus, and no drum a kit doesn't have).
// fights always have a tune, a bass and a beat, drive, aren't swung and loop. modifiers keep the
// mood's own band, clean up (no opposites, no unknowns, any order), and leave no trace on a song
// without them. counter melodies in counterpoint stay under the tune and in the intervals that blend,
// players ornament their notes, slides drawn by hand save and play, and sections keep their energy.
// the recorded instruments' files are all there, and every folder of them gets played. a prelude opens
// on scenery alone, drama stretches a song's quiet and loud, ambient songs have a tune. recordings are
// preferred, a layer's choice of recording saves, blown and bowed lines slur, songs end at home, and
// the parts that fill in stand on opposite sides. throat singers hold one note near their own, the
// gamelan's gong comes round every cycle, and a place's own kits and scenery stay in its moods.
// a blank track plays nothing, and its layers played by hand play only their own notes. every rule
// above holds for every flavour of every mood too, and flavours name only real things and save.
// (double stops, notes marked stop, are a second note under the tune on purpose, so the one note at a
// time checks leave them out)
// run it with
//   node js/squimble-music-maker/tests/music-check.js            everything, a few minutes
//   node js/squimble-music-maker/tests/music-check.js weaves     only the blocks whose names have a word
// it runs in pieces side by side on half the cores, at low priority, so the computer stays usable while
// it runs (the saved songs check beside them), each piece taking its share of the blocks and of the
// moods in the big ones. a block that fails doesn't stop the rest, so one run lists everything that's
// wrong (the first failure in each block, or in each mood of the big ones), then says how long it took
// and which blocks were slowest. it exits 1 if anything failed.
//
// synth.js is loaded too (after instruments.js, which it plays). it doesn't play anything here, nothing in it touches web
// audio until a note is played, so the sound itself was checked by listening in the browser
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const assert = require('assert');
const { fork } = require('child_process');

const args = process.argv.slice(2);
const piece = args.find((arg) => arg.startsWith('--piece='))?.slice(8).split('/').map(Number);
const words = args.filter((arg) => !arg.startsWith('--'));

// the counts that are summed over every piece before they're judged (tally)
const TOTALS = {
  chords: ({ onChord, strong }) => assert(onChord / strong > 0.85, `melodies start bars on chord notes (${onChord} of ${strong})`),
  band: ({ stuck, lines, motifs, eights, rhythms, soloBars, soloNew, soloEnds, soloHome }) => {
    assert(stuck / lines < 0.01, `single lines nearly never rub against the tune (${stuck} of ${lines})`);
    assert(motifs > 50, `enough long sections to check motifs come back (${motifs})`);
    // before themes had a second idea and a middle, eight bars averaged 1.7 bar rhythms (it's 2.6 now)
    assert(rhythms / eights > 2.3, `themes have more than one bar rhythm (${(rhythms / eights).toFixed(2)} per eight bars)`);
    assert(soloHome / soloEnds > 0.8, `solos come home to the root (${soloHome} of ${soloEnds})`);
    assert(soloBars > 200 && soloNew / soloBars > 0.9, `solos are new all the way through (${soloNew} of ${soloBars} bars)`);
  },
  loud: ({ riffs, doubled, splits, solos }) => assert(riffs > 20 && doubled > 5 && splits > 5 && solos > 20, `enough loud songs to check riffs (${riffs}), doubled bass (${doubled}), loud quiet splits (${splits}) and solos (${solos})`),
};

if (!piece) {
  // the pieces, and the saved songs check (songs already saved still play the notes they were saved with)
  const started = Date.now();
  // (half the cores, saved songs check included, at low priority: every core flat out lagged a game
  // playing beside it, and at low priority whatever else is running gets the computer first)
  const count = Math.max(1, Math.floor(os.cpus().length / 2) - 1);
  const failures = [];
  const tallies = {};
  const times = {};
  const runs = Array.from({ length: count }, (_, k) => fork(__filename, [...words, `--piece=${k}/${count}`], { silent: true }));
  if (!words.length) runs.push(fork(`${__dirname}/saved-songs-check.js`, [], { silent: true }));
  for (const run of runs) {
    try {
      os.setPriority(run.pid, os.constants.priority.PRIORITY_LOW);
    } catch {
      // (not allowed here: it runs at the usual priority)
    }
  }
  Promise.all(runs.map((run) => new Promise((resolve) => {
    let errors = '';
    run.stderr.on('data', (data) => (errors += data));
    run.stdout.on('data', (data) => process.stdout.write(data));
    run.on('message', (report) => {
      // (a shared block's checks outside its moods run in every piece: a failure there is listed once)
      for (const failure of report.failures) if (!failures.includes(failure)) failures.push(failure);
      for (const [name, counts] of Object.entries(report.tallies)) for (const [key, n] of Object.entries(counts)) ((tallies[name] ||= {})[key] = (tallies[name][key] || 0) + n);
      for (const [name, ms] of Object.entries(report.times)) times[name] = Math.max(times[name] || 0, ms);
    });
    run.on('exit', (code) => {
      if (code) failures.push(`${run.spawnargs.slice(-1)[0].includes('piece') ? 'a piece' : 'saved songs'} stopped: ${errors.split('\n').find((line) => /Error|assert/i.test(line)) || errors.trim().split('\n')[0] || `exit ${code}`}`);
      resolve();
    });
  }))).then(() => {
    for (const [name, judge] of Object.entries(TOTALS)) {
      if (!tallies[name]) continue;
      try {
        judge(tallies[name]);
      } catch (error) {
        failures.push(`${name} totals: ${error.message.split('\n')[0]}`);
      }
    }
    const slowest = Object.entries(times).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, ms]) => `${name} ${Math.round(ms / 1000)} s`).join(', ');
    for (const failure of failures) console.log(`FAILED ${failure}`);
    console.log(`${failures.length ? `${failures.length} failed` : 'all passed'} in ${Math.round((Date.now() - started) / 1000)} s (${count} pieces; slowest: ${slowest})`);
    process.exit(failures.length ? 1 : 0);
  });
  return;
}

const [PIECE, PIECES] = piece;
const failures = [];
const tallies = {};
const times = {};
// a failure's first line is kept and the check goes on
const attempt = (run) => {
  try {
    run();
  } catch (error) {
    failures.push(error.message.split('\n')[0]);
  }
};
// a block of checks. one that's shared runs in every piece, each doing its share of the moods (mine);
// the rest are dealt out, one piece each
let blocks = 0;
const mine = (i) => i % PIECES === PIECE;
function block(name, run, shared = false) {
  if (!shared && !mine(blocks++)) return;
  if (words.length && !words.some((word) => name.includes(word))) return;
  const started = Date.now();
  const before = failures.length;
  attempt(run);
  for (let i = before; i < failures.length; i++) failures[i] = `${name}: ${failures[i]}`;
  times[name] = (times[name] || 0) + Date.now() - started;
}
const tally = (name, counts) => {
  for (const [key, n] of Object.entries(counts)) ((tallies[name] ||= {})[key] = (tallies[name][key] || 0) + n);
};

const page = {};
vm.createContext(page);
for (const file of ['instruments.js', 'synth.js', 'moods.js', 'music.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), page);
const run = (expr) => vm.runInContext(expr, page);
const { generateSong, composeSong, cleanSong, rerollSong, parseChord, onGuitar, MOODS, FLAVOURS, GROOVES, METERS, PATTERNS } = run('({ generateSong, composeSong, cleanSong, rerollSong, parseChord, onGuitar, MOODS, FLAVOURS, GROOVES, METERS, PATTERNS })');
const { INSTRUMENTS, maxEdge, roleFamily, MIDDLE, usesRate, rateStep, MAX_RATE, kindred, OPENERS, songMood, OPENING, FIGHTS, carries, builds, weaves } = run('({ INSTRUMENTS, maxEdge, roleFamily, MIDDLE, usesRate, rateStep, MAX_RATE, kindred, OPENERS, songMood, OPENING, FIGHTS, carries, builds, weaves })');
const same = (a, b, message) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), message);
// how far a note's section is lifted by a key change (section.lift): a voice goes up with everyone
const liftAt = (comp, note) => comp.sections.find((s) => note.gt >= s.start - 1e-6 && note.gt < s.end - 1e-6)?.lift || 0;
const STYLES = ['ambient', 'tune', 'mini', 'boss', 'loop', 'final', 'cutscene'];
// every mood plain, then every other flavour of it (FLAVOURS), which get fewer seeds
const VARIANTS = [...Object.keys(MOODS).map((mood) => [mood]), ...Object.entries(FLAVOURS).flatMap(([mood, { kinds }]) => Object.keys(kinds).slice(1).map((kind) => [mood, kind]))];
const named = (mood, kind) => (kind ? `${mood}/${kind}` : mood);

block('chords parse', () => {
  same(parseChord('bVII'), { root: 10, tones: [0, 4, 7], fixed: false }, 'bVII');
  same(parseChord('ii°').tones, [0, 3, 6], 'ii°');
  same(parseChord('Imaj7').tones, [0, 4, 7, 11], 'Imaj7');
  assert.strictEqual(parseChord('#iv').root, 6);
  assert.strictEqual(parseChord('hello'), null);
});

// every mood and flavour makes songs in every style, the same each time, that save and load back the
// same, with sensible notes, melodies landing on chord notes on strong beats, and every remix playing.
// (each song's composed once, a second time for one seed in each style to check it's the same, and with
// two of the remixes in turn, so every remix is tried on every mood and flavour)
block('every mood, style and flavour', () => {
  const REMIXES = ['chords', 'melodies', 'band', 'arrangement', 'space', 'tonality', 'mutate', 'orchestra'];
  let strong = 0;
  let onChord = 0;
  for (const [v, [mood, kind]] of VARIANTS.entries()) {
    if (!mine(v)) continue;
    let turn = 0;
    attempt(() => {
      for (const style of STYLES) {
        for (const [k, seed] of (kind ? ['quiet-tide'] : ['mossy-lantern', 'quiet-tide', 'x']).entries()) {
          const where = `${named(mood, kind)} ${style} ${seed}`;
          const song = generateSong(mood, style, seed, [], kind);
          same(song, generateSong(mood, style, seed, [], kind), `${where}: the same seed makes the same song`);
          same(cleanSong(JSON.parse(JSON.stringify(song))), song, `${where}: saves and loads back the same`);
          assert(song.layers.length >= 1 && song.layers.length <= 7, `${where}: 1 to 7 layers`);
          const comp = composeSong(song);
          if (k === 0) same(comp.notes, composeSong(song).notes, `${where}: the same notes every time`);
          assert(comp.notes.length > 0, `${where}: makes notes`);
          for (const note of comp.notes) {
            assert(Number.isFinite(note.t) && note.t >= 0 && note.t < comp.beats + 0.1, `${where}: a note inside the song`);
            assert(note.dur > 0 && note.midi >= 0 && note.midi <= 127 && note.vel > 0 && note.vel <= 1, `${where}: a sensible note`);
          }
          // the theory: melody notes on strong beats should mostly be chord notes
          for (const note of comp.notes.filter((n) => n.layer === 'melody' && !n.stop)) {
            const section = comp.sections.find((s) => note.gt >= s.start && note.gt < s.end);
            const inBar = (note.gt - section.start) % comp.bpb;
            if (Math.abs(inBar) > 1e-6) continue;
            const chord = section.chords.find((c) => note.gt >= c.t && note.gt < c.t + c.dur);
            strong++;
            if (chord.pcs.has(((note.midi % 12) + 12) % 12)) onChord++;
          }
          for (const what of [REMIXES[turn++ % 8], REMIXES[turn++ % 8]]) composeSong(rerollSong(song, what, 'test'));
        }
      }
    });
  }
  tally('chords', { strong, onChord });
}, true);

// grooves: every line is a bar long for its time signature
block('grooves', () => {
  for (const [meter, kinds] of Object.entries(GROOVES)) {
    const steps = METERS[meter].beats * METERS[meter].sub * (METERS[meter].sub === 2 ? 2 : 1);
    for (const [kind, list] of Object.entries(kinds)) for (const groove of list) for (const [line, text] of Object.entries(groove)) assert.strictEqual(text.length, steps, `${meter} ${kind} ${line} is a bar long`);
  }
});

// the band plays one groove: drums repeat bar to bar (apart from fills), and a syncopated bass lands
// on the kick
block('one groove', () => {
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
});

// every tonal instrument has an edge (the organ had none, so it never fitted under any cap), every
// instrument a mood names is real, and every drum pattern has a groove in every time signature
block('instruments and patterns', () => {
  for (const [id, inst] of Object.entries(INSTRUMENTS)) if (inst.family !== 'kit' && inst.family !== 'texture') assert(Number.isFinite(inst.edge), `${id} has an edge`);
  for (const [id, mood] of Object.entries(MOODS)) {
    for (const name of [...Object.values(mood.palette).flat(), ...mood.kits, ...mood.textures, ...(mood.quiet || [])]) assert(INSTRUMENTS[name], `${id} names ${name}, which isn't an instrument`);
  }
  for (const pattern of Object.keys(PATTERNS.drums)) for (const meter of Object.keys(METERS)) assert(GROOVES[meter][pattern]?.length, `${pattern} has a groove in ${meter}`);
});

// a band that fits (fitBand, pickInstrument and the moods in music.js, and the README's rules)
block('a band that fits', () => {
  let stuck = 0;
  let lines = 0;
  let motifs = 0;
  let eights = 0;
  let rhythms = 0;
  let soloBars = 0;
  let soloNew = 0;
  let soloEnds = 0;
  let soloHome = 0;
  for (const [v, [mood, kind]] of VARIANTS.entries()) {
    if (!mine(v)) continue;
    attempt(() => {
      for (const style of STYLES) {
        for (let n = 0; n < (FIGHTS[style] ? 6 : 12) / (kind ? 3 : 1); n++) {
          const song = generateSong(mood, style, `fit-${n}`, [], kind);
          const where = `${named(mood, kind)} ${style} fit-${n}`;
          // the mood as this style writes it (a fight drives harder, so allows a little harsher)
          const sm = songMood(song);
          const tonal = song.layers.filter((l) => roleFamily(l.role) === 'tonal');
          for (const layer of tonal) {
            assert(INSTRUMENTS[layer.instrument].edge <= maxEdge(sm, layer.role) + 1e-9 || !sm.palette[layer.role].some((id) => INSTRUMENTS[id].edge <= maxEdge(sm, layer.role)), `${where}: the ${layer.role} isn't harsher than the mood allows`);
            if (['keys', 'bell', 'bass'].includes(INSTRUMENTS[layer.instrument].family)) assert.strictEqual(layer.tone.vibrato, 0, `${where}: no vibrato on struck or plucked ${layer.role}`);
          }
          assert.strictEqual(new Set(tonal.map((l) => l.instrument)).size, tonal.length, `${where}: no two layers on the same instrument`);
          // (a layer carrying the tune isn't another part weaving round it: it's the tune, see orchestration)
          const parts = song.layers.filter((l) => !carries(l));
          assert(!(parts.some((l) => l.role === 'arp') && parts.some((l) => l.role === 'counter')), `${where}: an arp or a counter melody, not both`);
          // not crowded: two parts at most moving round the middle, ambient songs six layers at most, and
          // running notes no faster than six a second
          assert(parts.filter((l) => MIDDLE.includes(l.role)).length <= 2, `${where}: two middle parts at most`);
          // (the scenery doesn't count: an ambient song's lone tune can join six others, pickScenery. a song
          // that builds has room for one more by its climax)
          if (style === 'ambient') assert(song.layers.filter((l) => l.role !== 'texture').length <= (builds(song) ? 7 : 6), `${where}: ambient songs have room`);
          for (const layer of song.layers.filter(usesRate)) assert(layer.rate === 'slow' || song.tempo / 60 / rateStep(layer.rate, METERS[song.meter].sub) <= MAX_RATE, `${where}: the ${layer.role} runs too fast`);
          // one band: chip and acoustic sounds never together, and surprises only from moods near this one
          const worlds = new Set(song.layers.map((l) => INSTRUMENTS[l.instrument].world));
          assert(!(worlds.has('chip') && worlds.has('acoustic')), `${where}: chip and acoustic sounds in one band`);
          const kin = kindred(sm);
          for (const layer of tonal) assert(kin.has(layer.instrument), `${where}: ${layer.instrument} is from a much darker or lighter mood`);
          // no section is only scenery, and a tune opens on two of its band (one in ambient), never a lone
          // pad: an intro that was all texture made a happy song start out ambient
          const players = song.layers.filter((l) => OPENERS.includes(l.role)).map((l) => l.id);
          // (apart from a mood's prelude, which is scenery alone on purpose: warmth's embers before the music)
          const prelude = sm.prelude && song.sections[0].name === sm.prelude ? 1 : 0;
          for (const section of song.sections.slice(prelude)) assert(section.play.some((id) => song.layers.find((l) => l.id === id).role !== 'texture'), `${where}: ${section.name} is only the texture`);
          // (a song that builds opens on one player on purpose)
          assert(song.sections[prelude].play.filter((id) => players.includes(id)).length >= Math.min(players.length, builds(song) ? 1 : OPENING[style]), `${where}: the intro is too thin`);
          // two textures are two different ones, and not two steady beds
          const textures = song.layers.filter((l) => l.role === 'texture').map((l) => INSTRUMENTS[l.instrument]);
          if (textures.length > 1) assert(textures[0] !== textures[1] && !(textures[0].bed && textures[1].bed), `${where}: two textures that don't go together`);
          const drums = song.layers.find((l) => l.role === 'drums');
          if (mood === 'cozy' && !kind && drums && !FIGHTS[style]) assert(drums.instrument === 'brushes' && drums.pattern === 'brush', `${where}: cozy drums are brushes`);
          if (mood === 'heavenly' && !kind && !FIGHTS[style]) assert(!drums, `${where}: no drums`);

          const comp = composeSong(song);
          const melody = song.layers.find((l) => l.role === 'melody');
          if (melody) {
            // no blinking: the melody doesn't sit out one section between two it plays in, apart from a C break
            // or another layer's solo
            const on = song.sections.map((s) => s.play.includes('melody'));
            // (or where it's handed the tune to another player, orchestration, or a weave's second theme has it)
            const taker = song.layers.find((l) => l.role === 'counter' && (carries(l) || (weaves(song) && l.pattern === 'counterpoint')));
            for (let i = 1; i < on.length - 1; i++) assert(!(on[i - 1] && !on[i] && on[i + 1]) || song.sections[i].part === 'C' || song.sections[i].lead || song.sections[i].play.includes(taker?.id), `${where}: the melody doesn't drop out of section ${i} and back`);
            // no holes mid phrase: phrases are near legato, calls rest for at most half a bar, and
            // fragments leave two bars of space at most
            const allowed = { calls: comp.bpb / 2 + 0.05, fragments: comp.bpb * 2 + 0.05 }[melody.pattern] || 1;
            // one note at a time: a note left ringing ran over the next section's first
            const all = comp.notes.filter((note) => note.layer === 'melody' && !note.stop).sort((a, b) => a.gt - b.gt);
            // (a piano with the pedal down rings on into its next notes on purpose: lifted is where the finger lifts)
            for (let i = 1; i < all.length; i++) assert(all[i - 1].gt + (all[i - 1].lifted ?? all[i - 1].dur) <= all[i].gt + 1e-6, `${where}: melody notes overlap at beat ${all[i].gt}`);
            for (const section of comp.sections) {
              const notes = comp.notes.filter((note) => note.layer === 'melody' && !note.stop && note.gt >= section.start && note.gt < section.end).sort((a, b) => a.gt - b.gt);
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
          // note or fifth (the new key's, after a key change)
          if (drums) {
            assert(INSTRUMENTS[drums.instrument].suits.includes(drums.pattern), `${where}: ${drums.instrument} suits ${drums.pattern}`);
            for (const note of comp.notes.filter((n) => n.layer === 'drums' && n.tune)) {
              const lift = comp.sections.find((s) => note.gt >= s.start - 1e-6 && note.gt < s.end - 1e-6)?.lift || 0;
              const pc = ((Math.round(69 + 12 * Math.log2(note.tune / 440)) - song.key - lift) % 12 + 12) % 12;
              assert(pc === 0 || pc === 7, `${where}: a drum tuned off the key`);
            }
          }
          // the texture sits under the tune, and hums the home note
          const texture = song.layers.find((l) => l.role === 'texture');
          if (texture) {
            if (melody) assert(texture.volume <= melody.volume * 0.55 + 1e-9, `${where}: the texture sits under the melody`);
            for (const note of comp.notes.filter((n) => n.layer === texture.id)) assert.strictEqual(note.midi % 12, (song.key + (comp.sections.find((one) => note.gt >= one.start - 1e-6 && note.gt < one.end - 1e-6)?.lift || 0)) % 12, `${where}: the texture's in the key`);
          }
          // the band listens (listen in music.js): keys, arps and counter melodies stay under the tune,
          // and nothing rubs a semitone against a longer melody note it's heard with
          const tune = comp.notes.filter((n) => n.layer === 'melody' && !n.stop);
          if (tune.length) {
            const rubs = (a, b) => ((Math.max(a, b) - Math.min(a, b)) % 12) === 1;
            // (found by where they start rather than by looking through the whole tune for every note: the
            // tune's one note at a time, checked above, so the last to start by a beat is the one playing)
            const byStart = [...tune].sort((a, b) => a.gt - b.gt);
            const longest = Math.max(...tune.map((m) => m.dur));
            const startedBy = (t) => {
              let [low, high] = [0, byStart.length];
              while (low < high) {
                const middle = (low + high) >> 1;
                if (byStart[middle].gt <= t) low = middle + 1;
                else high = middle;
              }
              return low;
            };
            const leadAt = (gt) => [byStart[startedBy(gt + 1e-6) - 1]].find((m) => m && gt < m.gt + (m.lifted ?? m.dur) - 1e-6);
            const heardOver = (note) => {
              const heard = [];
              for (let i = startedBy(note.gt - longest); i < byStart.length && byStart[i].gt < note.gt + note.dur - 1e-6; i++) {
                const m = byStart[i];
                if (m.dur >= 0.5 && m.gt + m.dur > note.gt + 1e-6) heard.push(m);
              }
              return heard;
            };
            for (const layer of song.layers.filter((l) => ['keys', 'pad', 'arp', 'bells', 'counter'].includes(l.role))) {
              const floor = { keys: 62, arp: 60, counter: 62 }[layer.role] + layer.octave * 12 - 12;
              for (const note of comp.notes.filter((n) => n.layer === layer.id)) {
                // (the tune as written: a pedalled piano tune rings on under what follows, lifted)
                const lead = leadAt(note.gt);
                // (its range is the song's own key's: a key change lifts the part, range and all)
                const lift = comp.sections.find((s) => note.gt >= s.start - 1e-6 && note.gt < s.end - 1e-6)?.lift || 0;
                if (lead && floor) assert(note.midi <= lead.midi || note.midi - lift - 12 < floor, `${where}: the ${layer.role} climbs over the tune at beat ${note.gt}`);
                if (layer.role !== 'pad' && layer.role !== 'keys') lines++;
                const heard = heardOver(note);
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
    });
  }
  tally('band', { stuck, lines, motifs, eights, rhythms, soloBars, soloNew, soloEnds, soloHome });
}, true);


// the loud and hazy moods (rock, metal, shoegaze: MOODS layers, quiet, soloOver, breakdown)
block('loud and hazy moods', () => {
  const { RIFFS } = run('({ RIFFS })');
  let riffs = 0;
  let doubled = 0;
  let splits = 0;
  let solos = 0;
  for (const [v, mood] of Object.keys(MOODS).filter((id) => MOODS[id].layers?.guitar).entries()) {
    if (!mine(v)) continue;
    for (const style of ['ambient', 'tune', 'boss']) {
      for (let n = 0; n < 12; n++) {
        const song = generateSong(mood, style, `loud-${n}`);
        const where = `${mood} ${style} loud-${n}`;
        const m = MOODS[mood];
        // no surprises: every instrument is one the mood names for that part (a kalimba tune in a
        // grunge song was the worry), and every kit's a rock kit's or the mood's own
        for (const layer of song.layers.filter((l) => roleFamily(l.role) === 'tonal')) {
          const list = (layer.id === 'guitar-2' && m.quiet) || m.palette[layer.role];
          assert(list.includes(layer.instrument), `${where}: the ${layer.id} plays ${layer.instrument}, which isn't the mood's`);
        }
        const comp = composeSong(song);
        const notesOf = (id, section) => comp.notes.filter((note) => note.layer === id && (!section || (note.gt >= section.start - 1e-6 && note.gt < section.end - 1e-6)));
        const guitars = song.layers.filter((l) => l.role === 'guitar');
        // loud, quiet, loud: with two guitars, exactly one of them plays each section, and the dirtier
        // one has the loudest
        if (guitars.length === 2) {
          splits++;
          for (const section of song.sections) assert.strictEqual(guitars.filter((g) => section.play.includes(g.id)).length, 1, `${where}: one guitar at a time in ${section.name}`);
          const loud = [...guitars].sort((a, b) => INSTRUMENTS[b.instrument].edge - INSTRUMENTS[a.instrument].edge)[0];
          const chorus = comp.sections.find((s) => s.part === 'B' && !s.lead);
          if (chorus && style === 'tune') assert(chorus.play.includes(loud.id), `${where}: the loud guitar plays the chorus`);
        }
        for (const guitar of guitars) {
          for (const section of comp.sections) {
            const notes = notesOf(guitar.id, section);
            // power chords are a root, a fifth and its octave, nothing else (a clipped third grinds)
            if (['power', 'eighths'].includes(guitar.pattern)) {
              for (const note of notes) {
                const chord = section.chords.find((ch) => note.gt < ch.t + ch.dur - 1e-6);
                const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
                assert([0, fifth].includes(((note.midi - chord.root) % 12 + 12) % 12), `${where}: a power chord with more than a root and fifth`);
              }
            }
            // a riff repeats bar to bar (its line turns round in the fourth bar of each four, so bars 1
            // and 2 are compared), its line is in the key, and a bass doubling it plays the same rhythm
            if (guitar.pattern === 'chug' && section.bars >= 4) {
              const bar = (id, k) => notesOf(id, section).filter((note) => note.gt >= section.start + k * comp.bpb - 1e-6 && note.gt < section.start + (k + 1) * comp.bpb - 1e-6);
              const rhythm = (id, k) => [...new Set(bar(id, k).map((note) => (note.gt - section.start - k * comp.bpb).toFixed(3)))].join();
              if (section.chords.every((ch) => ch.dur >= comp.bpb * 3 - 1e-6) || section.chords.length === 1) assert.strictEqual(rhythm(guitar.id, 1), rhythm(guitar.id, 2), `${where}: the riff repeats`);
              riffs++;
              const scale = new Set(vm.runInContext('SCALES', page)[song.scale].steps.map((step) => (song.key + (section.lift || 0) + step) % 12));
              // (a power chord's fifth is always a true fifth, on the scale or not, as on a guitar)
              for (const note of notes) {
                const chord = section.chords.find((ch) => note.gt < ch.t + ch.dur - 1e-6);
                const fifthOf = notes.some((other) => Math.abs(other.gt - note.gt) < 1e-6 && other.midi === note.midi - 7);
                assert(fifthOf || scale.has(note.midi % 12) || chord.pcs.has(note.midi % 12), `${where}: a riff note out of the key`);
              }
              const bass = song.layers.find((l) => l.role === 'bass' && l.pattern === 'riff' && section.play.includes(l.id));
              if (bass && section.play.includes(guitar.id)) {
                assert.strictEqual(rhythm(bass.id, 1), rhythm(guitar.id, 1), `${where}: the bass doubles the riff`);
                doubled++;
              }
            }
          }
        }
        // a rock solo is over the chorus, never the last section, and the drums crash only on a kit
        // that has a crash (the open hat stands in otherwise)
        for (const section of song.sections.filter((s) => s.lead)) {
          if (style !== 'ambient' && m.soloOver) assert.strictEqual(section.part, m.soloOver, `${where}: the solo is over the chorus`);
          solos++;
        }
        const drums = song.layers.find((l) => l.role === 'drums');
        if (drums) for (const note of notesOf(drums.id)) assert(INSTRUMENTS[drums.instrument].slots[note.midi], `${where}: a drum the kit doesn't have`);
      }
    }
  }
  tally('loud', { riffs, doubled, splits, solos });
  // every riff is a bar of 4/4
  for (const one of RIFFS) assert.strictEqual(one.cells.length, 16, `the riff ${one.cells} is a bar long`);
}, true);

/// fights (the boss and mini boss styles) and modifiers (song.mods, MODIFIERS and mixMood in music.js)
block('fights and modifiers', () => {
  const { STYLE_PATTERNS, FORMS, MODIFIERS, ALSO_DRIVING, cleanMods } = vm.runInContext('({ STYLE_PATTERNS, FORMS, MODIFIERS, ALSO_DRIVING, cleanMods })', page);
  const ids = Object.keys(MOODS);
  const mods = Object.keys(MODIFIERS);
  for (const [i, mood] of ids.entries()) {
    if (!mine(i)) continue;
    for (const style of ['mini', 'boss', 'final']) {
      for (let n = 0; n < 4; n++) {
        // every mood as a fight, plain and with a modifier
        const mod = n % 2 ? [mods[(i * 7 + n) % mods.length]] : [];
        const song = generateSong(mood, style, `fight-${n}`, mod);
        const where = `${mood}${mod.length ? `+${mod}` : ''} ${style} fight-${n}`;
        // a fight always has its tune, a bass and a beat, isn't swung, and (unless it's been slowed) is
        // no slower than the mood's tune
        for (const role of ['melody', 'bass', 'drums']) assert(song.layers.some((l) => l.role === role), `${where}: a fight has a ${role}`);
        assert.strictEqual(song.swing, 0, `${where}: a fight isn't swung`);
        const bpm = song.meter === '6/8' ? song.tempo / 0.65 : song.tempo;
        if (!mod.length) assert(bpm >= MOODS[mood].tuneTempo[0] - 1, `${where}: a fight is no slower than the mood's tune (${song.tempo})`);
        // it drives: its drums play one of a fight's beats where its kit can (or one of the newer driving
        // beats that's the mood's own), and it loops without an outro
        const drums = song.layers.find((l) => l.role === 'drums');
        const own = songMood(song).patterns?.drums || [];
        if (INSTRUMENTS[drums.instrument].suits.some((p) => STYLE_PATTERNS.boss.drums.includes(p))) assert(STYLE_PATTERNS.boss.drums.includes(drums.pattern) || (ALSO_DRIVING.includes(drums.pattern) && own.includes(drums.pattern)), `${where}: the drums drive (${drums.pattern})`);
        assert(!song.sections.some((s) => s.name === 'Outro'), `${where}: a fight loops, it doesn't wind down`);
        same(cleanSong(JSON.parse(JSON.stringify(song))), song, `${where}: saves and loads back the same`);
        composeSong(song);
      }
    }
  }
  for (const style of ['mini', 'boss', 'final']) for (const form of FORMS[style]) assert(form.every(([, , bars]) => bars >= 2), `${style} forms are whole sections`);

  // every modifier on every mood, in every style: a good song, the band still fitting together
  for (const [i, mood] of ids.entries()) {
    if (!mine(i)) continue;
    for (const [k, mod] of mods.entries()) {
      const style = ['ambient', 'tune', 'tune', 'boss'][k % 4];
      const song = generateSong(mood, style, `mod-${k}`, [mod]);
      const where = `${mood}+${mod} ${style}`;
      assert(song.layers.length >= 1 && song.layers.length <= 7, `${where}: 1 to 7 layers`);
      same(song.mods, [mod], `${where}: the modifier is kept`);
      same(song, generateSong(mood, style, `mod-${k}`, [mod]), `${where}: the same seed makes the same song`);
      const sm = songMood(song);
      const tonal = song.layers.filter((l) => roleFamily(l.role) === 'tonal');
      assert.strictEqual(new Set(tonal.map((l) => l.instrument)).size, tonal.length, `${where}: no two layers on the same instrument`);
      const worlds = new Set(song.layers.map((l) => INSTRUMENTS[l.instrument].world));
      assert(!(worlds.has('chip') && worlds.has('acoustic')), `${where}: chip and acoustic sounds in one band`);
      // the words that only change how the band plays (not lo-fi, retro, acoustic, epic, jazzy or
      // spooky, which swap sounds in on purpose) keep to the mood's own instruments, or ones from moods
      // like it: angry folk is still a folk band
      if (['calm', 'angry', 'fast', 'slow', 'dark', 'bright', 'sparse', 'lush', 'groovy', 'dreamy'].includes(mod)) {
        for (const layer of tonal.filter((l) => l.role !== 'pad')) {
          const list = (layer.id === 'guitar-2' && MOODS[mood].quiet) || MOODS[mood].palette[layer.role] || [];
          assert(list.includes(layer.instrument) || kindred(MOODS[mood]).has(layer.instrument) || kindred(sm).has(layer.instrument) || !list.length, `${where}: the ${layer.id} (${layer.instrument}) isn't the mood's`);
        }
      }
      const comp = composeSong(song);
      assert(comp.notes.length > 0, `${where}: makes notes`);
      for (const note of comp.notes) assert(Number.isFinite(note.t) && note.dur > 0 && note.vel > 0 && note.vel <= 1, `${where}: a sensible note`);
    }
  }
  // modifiers are cleaned up: unknown ones dropped, each once, never with their opposite (the earlier
  // in MODIFIERS wins), at most four, and the order they're given in doesn't matter
  same(cleanMods(['fast', 'nonsense', 'fast', 'calm']), ['calm', 'fast'], 'modifiers cleaned');
  // (given both, the one earlier in MODIFIERS wins, so the order they came in still doesn't matter. the
  // page turns the opposite off when you pick one, so it never sends both)
  same(cleanMods(['angry', 'calm']), ['calm'], 'opposites: calm and angry can\'t both be on');
  same(cleanMods(['calm', 'angry']), ['calm'], 'opposites in either order');
  assert(cleanMods(mods).length <= 4, 'at most four modifiers');
  same(generateSong('folk', 'tune', 'o', ['fast', 'jazzy']), generateSong('folk', 'tune', 'o', ['jazzy', 'fast']), 'modifier order doesn\'t matter');
  // a song without modifiers has no mods key at all, so it saves exactly as before, and an old song's
  // blend is let go of cleanly
  assert(!('mods' in generateSong('calm', 'tune', 'b')), 'no mods key without modifiers');
  assert(!('blend' in cleanSong({ mood: 'metal', blend: 'desert' })), 'old blends are dropped');
  // angry and dark really are darker: a happy song made angry is nearly always in a minor-ish mode,
  // and its chords moved with it (no major I chord under a dorian or minor tune)
  let darker = 0;
  for (let n = 0; n < 40; n++) {
    const song = generateSong('happy', 'tune', `grr-${n}`, ['angry']);
    if (['dorian', 'minor', 'phrygian', 'minorPentatonic', 'blues'].includes(song.scale)) darker++;
  }
  assert(darker > 30, `angry makes a happy song darker (${darker} of 40)`);
  // fast is faster and slow is slower, for the same seed
  const plain = generateSong('cozy', 'tune', 'tempo');
  assert(generateSong('cozy', 'tune', 'tempo', ['fast']).tempo > plain.tempo && generateSong('cozy', 'tune', 'tempo', ['slow']).tempo < plain.tempo, 'fast and slow change the tempo');
}, true);

// counterpoint: a second melody (the counter melody's "counterpoint" pattern) stays under the tune and
// on its strong beats blends with it (a third, sixth, fifth or octave)
block('counterpoint', () => {
  let strong = 0;
  let blends = 0;
  let checked = 0;
  for (const mood of ['happy', 'jazz', 'magic', 'wintry', 'cozy', 'lounge', 'heroic']) {
    for (let n = 0; n < 8; n++) {
      const song = generateSong(mood, 'tune', `cp-${n}`);
      const counter = song.layers.find((l) => l.role === 'counter');
      const melody = song.layers.find((l) => l.role === 'melody');
      if (!counter || !melody) continue;
      counter.pattern = 'counterpoint';
      const comp = composeSong(cleanSong(song));
      const tune = comp.notes.filter((n) => n.layer === melody.id && !n.stop);
      for (const note of comp.notes.filter((n) => n.layer === counter.id && !n.stop)) {
        const section = comp.sections.find((s) => note.gt < s.end - 1e-6);
        if (section.lead) continue;
        const over = tune.find((m) => m.gt <= note.gt + 1e-6 && note.gt < m.gt + m.dur - 1e-6);
        if (!over) continue;
        checked++;
        assert(note.midi <= over.midi, `${mood} cp-${n}: the second melody climbs over the tune at beat ${note.gt}`);
        if (Math.abs(note.gt - Math.round(note.gt)) > 1e-6 || Math.round(note.gt - section.start) % comp.bpb) continue;
        strong++;
        if ([0, 3, 4, 7, 8, 9].includes((over.midi - note.midi) % 12)) blends++;
      }
    }
  }
  assert(checked > 300 && blends / strong > 0.8, `a second melody blends with the tune on strong beats (${blends} of ${strong})`);
});

// ornaments: the players that ornament do (bends on their notes), the ones that don't (a piano)
// don't, every bend starts at the note and stays within an octave, and a plucked drone is plucked round
// and round rather than held
block('ornaments', () => {
  let bent = 0;
  for (const mood of ['raga', 'blues', 'country', 'jazz', 'folk', 'desert', 'metal']) {
    for (let n = 0; n < 4; n++) {
      const song = generateSong(mood, 'tune', `orn-${n}`);
      const comp = composeSong(song);
      for (const note of comp.notes.filter((one) => one.bend)) {
        const layer = song.layers.find((l) => l.id === note.layer);
        assert(INSTRUMENTS[layer.instrument].ornaments || note.added, `${mood} orn-${n}: the ${layer.instrument} was given an ornament it doesn't play`);
        assert(note.bend.every(([at, semitones]) => at >= 0 && Math.abs(semitones) <= 12), `${mood} orn-${n}: a bend out of range`);
        bent++;
      }
      for (const layer of song.layers.filter((l) => l.role === 'drone' && INSTRUMENTS[l.instrument].kind === 'pluck')) assert.strictEqual(layer.pattern, 'cycle', `${mood} orn-${n}: the tanpura is plucked round and round`);
    }
  }
  assert(bent > 100, `players ornament their notes (${bent} bends)`);
  // every instrument's ornaments are ones the composer knows, and every struck one has its modes
  const KNOWN = ['slide', 'bend', 'bendBy', 'release', 'grace', 'trill', 'fall', 'doit', 'shake', 'swell', 'stop', 'glide'];
  for (const [id, inst] of Object.entries(INSTRUMENTS)) {
    for (const key of Object.keys(inst.ornaments || {})) assert(KNOWN.includes(key), `${id} has an ornament called ${key}`);
    if (inst.kind === 'modal') assert(inst.modes?.length, `${id} is struck but has no modes`);
  }
});

// a slide and a shake drawn in the note editor (edits.add [beat, midi, length, to, glide, shake]) save,
// load and play as a bent note, and plain notes stay three numbers long
block('drawn slides and energy', () => {
  const song = generateSong('calm', 'tune', 'slide-0');
  const layer = song.layers.find((l) => l.role === 'melody');
  // (and a slide's shape and a swell: [..., curve, swell])
  layer.edits.A = { add: [[0, 63, 2, 64, 0.25, 20], [2, 60, 1], [3, 62, 2, 65, 1, 0, 1], [5, 60, 2, 60, 0, 0, 0, -1], [7, 60, 1, 60, 0, 0, 0, 0]], remove: [] };
  const clean = cleanSong(JSON.parse(JSON.stringify(song)));
  same(clean.layers.find((l) => l.id === layer.id).edits.A.add, [[0, 63, 2, 64, 0.25, 20], [2, 60, 1], [3, 62, 2, 65, 1, 0, 1], [5, 60, 2, 60, 0, 0, 0, -1], [7, 60, 1]], 'slides save and load');
  const comp = composeSong(clean);
  const slid = comp.notes.find((n) => n.layer === layer.id && n.added && n.midi === 63);
  same(slid.bend, [[0, 0], [0.25, 1]], 'a drawn slide plays as a bend');
  assert.strictEqual(slid.shake, 20, 'a drawn shake plays');
  same(comp.notes.find((n) => n.layer === layer.id && n.added && n.midi === 62).bend, [[0, 0], [1, 3, 1]], 'a drawn slide keeps its shape');
  assert.strictEqual(comp.notes.find((n) => n.layer === layer.id && n.added && n.midi === 60 && n.dur === 2).swell, -1, 'a drawn swell plays');
  // sections keep their energy (how hard they're played), and songs from before it have none
  const energetic = generateSong('happy', 'tune', 'energy');
  assert(energetic.sections.every((s) => typeof s.energy === 'number'), 'sections have an energy');
  assert(!('energy' in cleanSong({ sections: [{ name: 'A', part: 'A', bars: 4, play: [] }] }).sections[0]), 'old sections stay as they were');
});

// a track made by hand (blankSong, the page's New track) starts silent, its layers (hand) play only the
// notes added to them, with their strength and palm mute, and all of it saves and loads. songs that
// aren't made by hand don't gain the keys
block('tracks made by hand', () => {
  const { blankSong } = vm.runInContext('({ blankSong })', page);
  const song = blankSong();
  assert(song.own && song.layers.length && song.layers.every((l) => l.hand), 'a blank track is its own, every layer by hand');
  assert.strictEqual(composeSong(song).notes.length, 0, 'a blank track plays nothing');
  const melody = song.layers.find((l) => l.role === 'melody');
  melody.edits.A = { add: [[0, 60, 1], [1, 64, 1, 64, 0, 0, 0, 0, 0.4], [2, 67, 0.5, 67, 0, 0, 0, 0, 0, 1]], remove: [] };
  const clean = cleanSong(JSON.parse(JSON.stringify(song)));
  same(clean, song, 'a blank track saves and loads back the same');
  const notes = composeSong(clean).notes;
  same(notes.map((n) => n.midi), [60, 64, 67], 'a hand layer plays just its notes');
  assert(Math.abs(notes[1].vel - 0.4 * notes[0].vel / 0.75) < 0.1, 'a note keeps its strength');
  assert(notes[2].mute && !notes[0].mute, 'a note keeps its palm mute');
  const written = generateSong('happy', 'tune', 'not-mine');
  assert(!('own' in written) && written.layers.every((l) => !('hand' in l)), 'written songs stay as they were');
  // a written layer turned over to hand plays nothing written
  written.layers[0].hand = true;
  assert(!composeSong(cleanSong(written)).notes.some((n) => n.layer === written.layers[0].id), 'a hand layer has nothing written for it');
});

// a note the band moved can still be removed by hand: the page removes it by the pitch it was written at
block('removing a moved note', () => {
  const { editKey } = vm.runInContext('({ editKey })', page);
  const song = generateSong('happy', 'tune', 'rm-0');
  const hit = composeSong(song).notes.find((n) => n.written !== undefined);
  assert(hit, 'the band moved a note to test with');
  const section = composeSong(song).sections.find((s) => hit.gt >= s.start && hit.gt < s.end);
  song.layers.find((l) => l.id === hit.layer).edits[section.part] = { add: [], remove: [editKey(hit.gt - section.start, hit.written)] };
  assert(!composeSong(cleanSong(song)).notes.some((n) => n.layer === hit.layer && Math.abs(n.gt - hit.gt) < 1e-6 && n.midi === hit.midi), 'a moved note can be removed');
});

// a layer can play another part's notes than its section's (section.use, the arrange grid's letters),
// and parts go past C once they're given chords
block('a part per layer', () => {
  const { packEdit, partOf, blankSong } = vm.runInContext('({ packEdit, partOf, blankSong })', page);
  const song = blankSong();
  song.sections = [
    { name: 'One', part: 'A', bars: 2, play: ['melody', 'bass'] },
    { name: 'Two', part: 'A', bars: 2, play: ['melody', 'bass'], use: { melody: 'D', bass: 'A', drums: 'B' } },
  ];
  const melody = song.layers.find((l) => l.id === 'melody');
  melody.edits = { A: { add: [packEdit({ t: 0, midi: 60, dur: 1 })], remove: [] }, D: { add: [packEdit({ t: 1, midi: 67, dur: 1 })], remove: [] } };
  const cleaned = cleanSong(song);
  assert.strictEqual(JSON.stringify(cleaned.sections[1].use), '{"melody":"D"}', "use keeps only layers that play, in another part than the section's");
  assert.strictEqual(partOf(cleaned.sections[1], melody), 'D');
  assert(cleaned.layers.find((l) => l.id === 'melody').edits.D, 'edits past part C are kept');
  const comp = composeSong(cleaned);
  const mine = comp.notes.filter((n) => n.layer === 'melody').map((n) => [Math.round(n.gt * 100) / 100, n.midi]);
  assert.strictEqual(JSON.stringify(mine), '[[0,60],[9,67]]', "the second section plays part D's notes over part A's chords");
  assert.strictEqual(comp.sections[1].chords[0].name, comp.sections[0].chords[0].name, 'the chords stay the section part\'s');
  // a section on a part with no chords yet plays the home chord; a written layer on part D gets new notes
  const e = cleanSong({ ...cleaned, sections: [{ name: 'E', part: 'E', bars: 2, play: ['melody'] }] });
  assert.strictEqual(e.parts.E, 'I', 'a new part starts on the home chord');
  assert(!('D' in cleanSong(blankSong()).parts), 'unused parts past C aren\'t saved');
  // (a riff plays the same in every part, so a tune that isn't one)
  let written;
  for (let n = 0; !written || written.layers.find((l) => l.role === 'melody').pattern === 'riff'; n++) written = generateSong('happy', 'tune', `per-layer-${n}`);
  const lead = written.layers.find((l) => l.role === 'melody');
  const at = written.sections.findIndex((s) => s.play.includes(lead.id) && !s.lead && s.part === 'A');
  const before = composeSong(written);
  const notesIn = (comp, i) => comp.notes.filter((n) => n.layer === lead.id && n.gt >= comp.sections[i].start && n.gt < comp.sections[i].end).map((n) => n.midi).join();
  written.sections[at].use = { [lead.id]: 'D' };
  const after = composeSong(cleanSong(written));
  assert.notStrictEqual(notesIn(after, at), notesIn(before, at), "a written melody on a new part plays a new tune there");
  for (let i = 0; i < written.sections.length; i++) if (i !== at && written.sections[i].part !== 'A') assert.strictEqual(notesIn(after, i), notesIn(before, i), 'other parts stay as they were');
});

// a part copied to a new one plays the same notes (layer.like) until it's rewritten, and a part can have
// settings of its own (layer.byPart): doubled in one section only, or another octave, played as a layer
// of its own (playable)
block('copied parts and their own settings', () => {
  const { playable, partLayer, rerollLayerPart } = vm.runInContext('({ playable, partLayer, rerollLayerPart })', page);
  const clone = (thing) => JSON.parse(JSON.stringify(thing));
  let song;
  for (let n = 0; !song || song.layers.find((l) => l.role === 'melody').pattern === 'riff'; n++) song = generateSong('heroic', 'tune', `copied-${n}`);
  const lead = song.layers.find((l) => l.role === 'melody');
  const twice = song.sections.map((_, i) => i).filter((i) => song.sections[i].part === song.sections.find((s) => s.play.includes(lead.id) && !s.lead).part && song.sections[i].play.includes(lead.id) && !song.sections[i].lead);
  assert(twice.length >= 2, 'a melody part played twice to test with');
  const at = twice[twice.length - 1];
  const before = composeSong(song);
  const midis = (comp, i, id = lead.id) => comp.notes.filter((n) => n.layer === id && n.gt >= comp.sections[i].start && n.gt < comp.sections[i].end).map((n) => `${n.gt.toFixed(2)}:${n.midi}`).join();
  const copy = clone(song);
  copy.sections[at].use = { [lead.id]: 'D' };
  copy.layers.find((l) => l.id === lead.id).like = { D: song.sections[at].part };
  const copied = cleanSong(copy);
  assert.strictEqual(copied.layers.find((l) => l.id === lead.id).like.D, song.sections[at].part, 'like is kept');
  assert.strictEqual(midis(composeSong(copied), at), midis(before, at), 'a copied part plays the same notes where it was copied');
  for (const i of twice) assert.strictEqual(midis(composeSong(copied), i), midis(before, i), 'and so do the other sections');
  // doubled and an octave up in that section only
  copied.layers.find((l) => l.id === lead.id).byPart = { D: { with: [{ instrument: 'strings' }], doubleAll: true, octave: 1, volume: 0.9, recording: 'none' } };
  const own = cleanSong(copied);
  const by = own.layers.find((l) => l.id === lead.id).byPart.D;
  assert(by.with && by.octave === 1 && by.volume === 0.9, `byPart keeps what differs (${JSON.stringify(by)})`);
  assert(!('recording' in by) || lead.recording, 'and only nulls what the layer has');
  const comp = composeSong(own);
  const notesAt = (i) => comp.notes.filter((n) => n.layer === lead.id && n.gt >= comp.sections[i].start && n.gt < comp.sections[i].end);
  assert(notesAt(at).length && notesAt(at).every((n) => n.double), 'doubled where it plays part D');
  assert(twice.filter((i) => i !== at).every((i) => notesAt(i).every((n) => !n.double) || lead.with), 'not where it plays the old part');
  const high = (i) => notesAt(i).reduce((sum, n) => sum + n.midi, 0) / notesAt(i).length;
  assert(high(at) > high(twice[0]) + 8, 'an octave up there');
  const played = playable(own, comp);
  assert(played.song.layers.some((l) => l.id === `${lead.id}~D` && l.volume === 0.9 && l.with), 'the player gets part D as a layer of its own');
  assert(played.comp.notes.filter((n) => n.layer === `${lead.id}~D`).length === notesAt(at).length, "with part D's notes");
  assert.strictEqual(playable(song, before).comp, before, 'a song with no part settings plays as it is');
  assert.strictEqual(partLayer(lead, 'A'), lead, 'a part with none is the layer');
  assert(!partLayer({ ...lead, with: [{ instrument: 'strings' }], byPart: { E: { with: 'none' } } }, 'E').with, "'none' takes a setting away from a part");
  // a link carries it all (a link's changes read null as a key taken away, hence 'none')
  const { songChanges, withChanges } = vm.runInContext('({ songChanges, withChanges })', page);
  const doubled = cleanSong({ ...own, layers: own.layers.map((l) => (l.id === lead.id ? { ...l, with: [{ instrument: 'strings' }], byPart: { ...l.byPart, E: { with: 'none' } } } : l)) });
  assert.strictEqual(JSON.stringify(cleanSong(withChanges(song, songChanges(song, doubled)))), JSON.stringify(doubled), 'a link round trips copied parts and their settings');
  // rewritten, the copy is its own
  const rewritten = rerollLayerPart(own, lead.id, 'D', 0.4);
  assert(rewritten && !rewritten.layers.find((l) => l.id === lead.id).like, 'rewriting a copied part ends the copy');
  // junk
  const junk = cleanSong({ layers: [{ role: 'bass', byPart: { D: { instrument: 'wind', volume: 'loud', nonsense: 1 }, Z: { volume: 1 } }, like: { D: 'D', E: 'Q', F: 'A' } }] }).layers[0];
  assert(!junk.byPart && JSON.stringify(junk.like) === '{"F":"A"}', `junk part settings are dropped (${JSON.stringify(junk)})`);
});

// junk in, a playable song out
block('junk', () => {
  for (const junk of [null, 'hello', 42, {}, { layers: [{ role: 'nope' }, { role: 'bass', instrument: 'wind', volume: 'loud' }], sections: [{ bars: -5, play: 'bass' }], tempo: 1e9 }]) {
    const song = cleanSong(junk);
    assert(song.sections.length && song.tempo <= 220, 'junk is cleaned');
    composeSong(song);
  }
  const cleaned = cleanSong({ layers: [{ role: 'bass', instrument: 'wind' }] });
  assert.notStrictEqual(cleaned.layers[0].instrument, 'wind', "a bass can't be played by a texture");
});

// a saved song keeps the composer it was made with (COMPOSER): one from before the stamp plays with the
// kept one (kept/composer-1.js), as the page fetches it, and a new one with today's. the post-rock song
// that came back with a different tune once the flavours got their own phrasing
block('kept composers', () => {
  const kept = {};
  vm.createContext(kept);
  for (const file of ['instruments.js', 'synth.js', 'kept/composer-1.js', 'moods.js', 'music.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), kept);
  const run = (expr) => vm.runInContext(expr, kept);
  const song = run("generateSong('bleak', 'tune', 'frosted-waffle', [], 'postrock')");
  assert.strictEqual(song.composer, run('COMPOSER'), 'a new song is stamped with the composer that made it');
  same(run('composeSong')(song).notes, composeSong(song).notes, "a new song plays with today's composer");
  const saved = JSON.parse(JSON.stringify(song));
  delete saved.composer;
  assert(!('composer' in cleanSong(saved)) && !('composer' in cleanSong({ ...saved, composer: 9 })), 'no stamp, or junk, is the first composer');
  same(run('composeSong')(run('cleanSong')(saved)).notes, run('KEPT_COMPOSERS[1].composeSong')(cleanSong(saved)).notes, 'a song from before the stamp plays with the kept composer');
  assert.notStrictEqual(JSON.stringify(run('composeSong')(saved).notes), JSON.stringify(composeSong(song).notes), 'the kept composer is the old one');
});

// sung lines (singLine in synth.js): a singer's move to the next note isn't an even slide. it dips the
// other way first, arrives on time, over shoots by 25 cents at most (scaled, so never a flat held wrong
// note), and has settled by the end of the move. a recorded choir sings a tune as a line, not its pads
block('sung lines', () => {
  const { singerMove, pathAt, sings, INSTRUMENTS: all } = vm.runInContext('({ singerMove, pathAt, sings, INSTRUMENTS })', page);
  for (const [from, to] of [[6000, 6200], [6400, 6100], [5000, 6200], [7200, 6000]]) {
    const length = 0.06 + 0.009 * Math.abs(to - from) / 100;
    const path = singerMove(from, to, 1, length);
    const way = Math.sign(to - from);
    const where = `a move from ${from / 100} to ${to / 100}`;
    assert((pathAt(path, 1) - from) * way < 0, `${where} dips the other way first`);
    assert(Math.abs(pathAt(path, 1 + length) - to) < Math.abs(to - from) * 0.05, `${where} arrives after its length`);
    const most = Math.max(...path.map(([, p]) => (p - to) * way));
    assert(most > 0 && most <= 25 + 1e-6, `${where} over shoots, by 25 cents at most (${most.toFixed(1)})`);
    assert(Math.abs(pathAt(path, 1 + length * 2.6 + 0.05) - to) < 1e-6, `${where} settles on the note`);
    for (let k = 1; k < path.length; k++) assert(path[k][0] >= path[k - 1][0], `${where}'s points are in time order`);
  }
  assert(sings(all['choir-oo'], { role: 'melody' }) && sings(all['choir-ah'], { role: 'counter' }), 'a choir sings a tune as a line');
  assert(!sings(all['choir-oo'], { role: 'pad' }) && !sings(all.flute, { role: 'melody' }), 'a choir holding chords, or a flute, plays note by note');
  assert(sings(all['alto-voice'], { role: 'pad' }), 'a sung voice always sings');
});

// shoegaze's kinds (composer 4): open strings ring over every chord without ever rubbing a semitone
// against it, still six strings; the wash strums every eighth and the glide never faster than twelve
// strokes a second; a drop tuned guitar goes below d2 but never under its low b; the baggy beat plays in
// every metre
block('shoegaze kinds', () => {
  const { generateSong: make, composeSong: compose, INSTRUMENTS: all, GROOVES: grooves } = vm.runInContext('({ generateSong, composeSong, INSTRUMENTS, GROOVES })', page);
  let open = 0;
  let washed = 0;
  let glided = 0;
  let dropped = 0;
  for (const kind of ['rush', 'melt', 'undertow', 'concrete', 'glow', null]) {
    for (let n = 0; n < 12; n++) {
      const song = make('shoegaze', 'tune', `gaze ${kind} ${n}`, [], kind || undefined);
      const { notes } = compose(song);
      for (const layer of song.layers.filter((one) => one.role === 'guitar')) {
        const mine = notes.filter((note) => note.layer === layer.id);
        if (all[layer.instrument].drop) {
          const lowest = Math.min(...mine.map((note) => note.midi));
          assert(lowest >= 35, `${song.seed}: the drop tuned guitar never goes under its low b (${lowest})`);
          if (lowest < 38) dropped++;
        }
        if (!['wash', 'glide', 'ring', 'strum'].includes(layer.pattern)) continue;
        // strokes: notes starting within 60 ms of each other
        const strokes = [];
        for (const note of mine.slice().sort((a, b) => a.t - b.t)) {
          const last = strokes[strokes.length - 1];
          if (last && note.t - last.t < 0.03 * (song.tempo / 60)) last.notes.push(note.midi);
          else strokes.push({ t: note.t, notes: [note.midi] });
        }
        for (const stroke of strokes) assert(stroke.notes.length <= 6, `${song.seed}: a ${layer.pattern} stroke is six strings at most (${stroke.notes.length})`);
        if (layer.pattern === 'wash') washed++;
        if (layer.pattern === 'glide') {
          glided++;
          const gaps = strokes.slice(1).map((stroke, i) => stroke.t - strokes[i].t).filter((gap) => gap > 1e-6);
          assert(Math.min(...gaps) * (60 / song.tempo) >= 1 / 12 - 1e-3, `${song.seed}: the glide strums twelve times a second at most`);
        }
      }
    }
  }
  // a drone over each chord of a long song in an open strings kind: never a semitone from a chord note
  // (on a guitar, so a shape a hand can't hold is moved: forGuitar mustn't bring a rub back)
  const { guitarShape, ROLES } = vm.runInContext('({ guitarShape, ROLES })', page);
  for (const key of [0, 4, 7, 9, 11]) {
    for (const [root, tones] of [[0, [0, 4, 7]], [5, [0, 4, 7, 11]], [9, [0, 3, 7, 10]], [8, [0, 4, 7]], [1, [0, 4, 7]], [3, [0, 4, 7, 11]], [7, [0, 5, 7]]]) {
      const c = { mood: { openStrings: true }, song: { key }, center: ROLES.guitar.center, layer: { instrument: 'offset-guitar' }, section: {} };
      const shape = guitarShape(c, { root, tones }, true);
      const pcs = tones.map((tone) => (root + tone) % 12);
      for (const midi of shape) {
        if (pcs.includes(midi % 12)) continue;
        open++;
        assert(pcs.every((pc) => ![1, 11].includes((midi - pc + 12) % 12)), `an open string over ${root}/${tones} in ${key} rubs a semitone`);
      }
      assert(shape.length <= 6, 'open string shapes are still six strings');
    }
  }
  assert(open && washed && glided && dropped, `every case came up (open ${open}, wash ${washed}, glide ${glided}, drop ${dropped})`);
  for (const meter of Object.keys(grooves)) assert(grooves[meter].baggy?.length, `the baggy beat plays in ${meter}`);
});

// recordings (RECORDINGS in synth.js): every folder an instrument or a kit's slot names is there, with
// an index.json whose files are all there too and which says its licence. a kit's hit is one the
// folder has
block('recordings are there', () => {
  const root = `${__dirname}/../../../assets/squimble-music-maker/samples`;
  const indexes = {};
  const index = (folder) => {
    if (!indexes[folder]) {
      const file = `${root}/${folder}/index.json`;
      assert(fs.existsSync(file), `${folder} has an index.json`);
      indexes[folder] = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert(indexes[folder].licence && indexes[folder].source, `${folder} says where it's from and its licence`);
      for (const note of indexes[folder].notes) {
        assert(fs.existsSync(`${root}/${folder}/${note.file}`), `${folder}/${note.file} is there`);
        assert(note.hit || (Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127), `${folder}/${note.file} is a note or a hit`);
      }
      // (a singer's recorded moves, buildMoves: in their files, leaving, landing and arriving in that
      // order, an octave at most, with a gain for each end)
      for (const move of indexes[folder].moves || []) {
        assert(fs.existsSync(`${root}/${folder}/${move.file}`), `${folder}/${move.file} is there`);
        assert(move.leave < move.land && move.land <= move.arrive && move.arrive < move.length && move.from !== move.to && Math.abs(move.to - move.from) <= 12 && move.gain.every((gain) => gain > 0), `${folder}'s move from ${move.from} to ${move.to} makes sense`);
      }
    }
    return indexes[folder];
  };
  for (const [id, inst] of Object.entries(INSTRUMENTS)) {
    if (inst.samples) {
      // (scenery's recordings are events, a call or a scream, rather than notes)
      assert(index(inst.samples).notes.some((note) => note.midi !== undefined || (inst.family === 'texture' && note.hit)), `${id}'s recordings have notes`);
      assert(inst.sampled?.gain > 0, `${id} has a gain for its recordings`);
    }
    // its other recordings: each there, with a gain, and a name for the page (as is the usual one)
    for (const [folder, settings] of Object.entries(inst.more || {})) {
      assert(index(folder).notes.some((note) => note.midi !== undefined), `${id}'s ${folder} recordings have notes`);
      assert(settings.gain > 0 && settings.name && inst.sampled.name, `${id}'s ${folder} recording has a gain and a name`);
    }
    for (const slot of inst.slots || []) {
      if (!slot.hit) continue;
      const [folder, name] = slot.hit.split('/');
      assert(index(folder).notes.some((note) => note.hit === name), `${id}'s ${slot.hit} is in ${folder}`);
    }
  }
  // nothing's left in the folder that no instrument plays
  const used = new Set(Object.values(INSTRUMENTS).flatMap((inst) => [inst.samples, ...Object.keys(inst.more || {}), ...(inst.slots || []).map((slot) => slot.hit?.split('/')[0])]));
  for (const folder of fs.readdirSync(root)) assert(used.has(folder), `the ${folder} recordings are played by something`);
});

// a layer's choice of recording (layer.recording, one of its instrument's others) saves and loads, one
// it doesn't have is dropped, and the usual one isn't saved at all, so old songs save as they did
block('choosing a recording', () => {
  const song = generateSong('soul', 'tune', 'rec-0');
  const keys = song.layers.find((l) => l.role === 'keys') || song.layers[0];
  keys.instrument = 'wurlitzer';
  keys.recording = 'pianet';
  assert.strictEqual(cleanSong(JSON.parse(JSON.stringify(song))).layers.find((l) => l.id === keys.id).recording, 'pianet', 'a chosen recording saves');
  keys.recording = 'not-a-folder';
  assert(!('recording' in cleanSong(JSON.parse(JSON.stringify(song))).layers.find((l) => l.id === keys.id)), 'an unknown recording is dropped');
});

// the fifth round. a layer picks one of its instrument's recordings (pickRecording), so over many songs
// the others get played, and two layers (or a layer and a doubler) never share one when they needn't.
// a melody is sometimes doubled (pickDoubles), only ever by recorded instruments, a choir's always and
// everywhere, anything else's only in the loud sections; doubling saves and loads. a mood with pedal
// lets its piano notes ring to the chord's end, and a voice with a range sings inside it
block('recordings picked and doubled', () => {
  const { INSTRUMENTS: all, CHOIRS } = vm.runInContext('({ INSTRUMENTS, CHOIRS })', page);
  const folder = (id, choice) => (all[id].more?.[choice] ? choice : all[id].samples);
  let others = 0;
  let doubled = 0;
  let choirs = 0;
  for (const mood of Object.keys(MOODS)) {
    for (let n = 0; n < 4; n++) {
      const song = generateSong(mood, n % 2 ? 'tune' : 'ambient', `fifth-${n}`);
      const folders = song.layers.flatMap((l) => [folder(l.instrument, l.recording), ...(l.with || []).map((one) => folder(one.instrument, one.recording))]).filter(Boolean);
      if (song.layers.some((l) => l.recording)) others++;
      // (two recordings the same only when an instrument has no other: the bass guitars share theirs)
      const counts = {};
      for (const one of folders) counts[one] = (counts[one] || 0) + 1;
      for (const layer of song.layers.filter((l) => all[l.instrument].more)) {
        const mine = folder(layer.instrument, layer.recording);
        const free = [all[layer.instrument].samples, ...Object.keys(all[layer.instrument].more)].some((one) => !counts[one]);
        assert(counts[mine] === 1 || !free, `${mood} fifth-${n}: the ${layer.role} shares its recording (${mine}) when it needn't`);
      }
      const comp = composeSong(song);
      for (const layer of song.layers.filter((l) => l.with)) {
        doubled++;
        assert(layer.role === 'melody' && layer.with.every((one) => all[one.instrument].samples), `${mood} fifth-${n}: only a melody is doubled, and only by recordings`);
        const notes = comp.notes.filter((note) => note.layer === layer.id && !note.added);
        if (CHOIRS[layer.instrument]) {
          choirs++;
          assert(layer.with.length >= 1 && notes.every((note) => note.double), `${mood} fifth-${n}: a choir sings the tune in sections, every note`);
        } else {
          const quiet = comp.sections.filter((section) => (section.energy ?? 0.75) < 0.7);
          assert(!notes.some((note) => note.double && quiet.some((section) => note.t >= section.start && note.t < section.end)), `${mood} fifth-${n}: a doubled tune is doubled only where it's loud`);
        }
        same(cleanSong(JSON.parse(JSON.stringify(song))).layers.find((l) => l.id === layer.id).with, layer.with, `${mood} fifth-${n}: doubling saves`);
      }
      for (const layer of song.layers.filter((l) => all[l.instrument].range)) {
        const [low, high] = all[layer.instrument].range;
        for (const note of comp.notes.filter((one) => one.layer === layer.id)) assert(note.midi >= low && note.midi <= high + liftAt(comp, note), `${mood} fifth-${n}: the ${layer.instrument} sings inside what it recorded (${note.midi})`);
      }
    }
  }
  assert(others > 40, `layers play their instruments' other recordings too (${others} songs)`);
  assert(doubled > 30 && choirs >= 1, `melodies are doubled now and then, choirs too (${doubled}, ${choirs} choirs)`);
  // the pedal: in nostalgic songs, a piano note rings on to its chord's end (a bar at most), so most are
  // longer than written, and nothing rings past its section
  let pedalled = 0;
  for (let n = 0; n < 8; n++) {
    const song = generateSong('nostalgic', n % 2 ? 'tune' : 'ambient', `pedal-${n}`);
    const comp = composeSong(song);
    for (const layer of song.layers.filter((l) => all[l.instrument].pedal)) {
      // (only the notes the pedal held: a note can be written to ring over)
      for (const note of comp.notes.filter((one) => one.layer === layer.id && one.lifted !== undefined)) {
        const section = comp.sections.find((one) => note.gt >= one.start - 1e-6 && note.gt < one.end - 1e-6);
        assert(note.gt + note.dur <= section.end + 1e-6, `nostalgic pedal-${n}: a pedalled note stays in its section`);
        if (note.dur >= 1) pedalled++;
      }
    }
  }
  assert(pedalled > 100, `nostalgic pianos ring on with the pedal (${pedalled} long notes)`);
  const plain = generateSong('jazz', 'tune', 'pedal-jazz');
  assert(!MOODS.jazz.pedal && composeSong(plain).notes.length, 'a mood without pedal plays its piano as written');
});

// recordings are preferred: over many songs, in moods whose palettes have both, most pitched parts are
// recorded. and the parts that fill in stand on opposite sides of the tune
block('recordings preferred', () => {
  const { INSTRUMENTS: all } = vm.runInContext('({ INSTRUMENTS })', page);
  let parts = 0;
  let recorded = 0;
  for (const mood of ['happy', 'calm', 'sad', 'heroic', 'wistful', 'folk']) {
    for (let n = 0; n < 12; n++) {
      const song = generateSong(mood, 'tune', `prefer-${n}`);
      for (const layer of song.layers.filter((l) => roleFamily(l.role) === 'tonal')) {
        parts++;
        if (all[layer.instrument].samples) recorded++;
      }
      const sides = ['keys', 'counter', 'arp'].map((role) => song.layers.find((l) => l.role === role)).filter(Boolean);
      if (sides.length === 2) assert(Math.sign(sides[0].pan) !== Math.sign(sides[1].pan), `${mood} prefer-${n}: two parts that fill in stand on opposite sides`);
      const melody = song.layers.find((l) => l.role === 'melody');
      if (melody) assert(Math.abs(melody.pan) <= 0.12, `${mood} prefer-${n}: the tune is near the middle`);
    }
  }
  assert(recorded / parts > 0.65, `recordings are preferred (${recorded} of ${parts})`);
});

// slurs: only on instruments that hold a note (blown, bowed, sung, a held synth lead), only between
// joined notes, never on a repeated pitch, and never on a piano. a song that ends comes home, and a
// fight, which loops, doesn't have to
block('slurs and endings', () => {
  const { legato } = vm.runInContext('({ legato })', page);
  let slurred = 0;
  for (const mood of ['folk', 'heroic', 'jazz', 'calm', 'happy', 'dragon']) {
    for (let n = 0; n < 4; n++) {
      const song = generateSong(mood, 'tune', `slur-${n}`);
      const comp = composeSong(song);
      for (const layer of song.layers) {
        const line = comp.notes.filter((note) => note.layer === layer.id && !note.stop).sort((a, b) => a.gt - b.gt);
        line.forEach((note, i) => {
          if (!note.slur) return;
          slurred++;
          assert(legato(INSTRUMENTS[layer.instrument]), `${mood} slur-${n}: the ${layer.instrument} can't slur`);
          assert(i > 0 && line[i - 1].midi !== note.midi, `${mood} slur-${n}: a repeated note is tongued, not slurred`);
        });
      }
      const last = comp.sections[comp.sections.length - 1];
      const chord = last.chords[last.chords.length - 1];
      assert.strictEqual(chord.root, (song.key + (last.lift || 0) + vm.runInContext(`diatonicChord(harmonySteps('${song.scale}'), 0).root`, page)) % 12, `${mood} slur-${n}: the song ends on its home chord`);
    }
  }
  assert(slurred > 200, `blown and bowed lines slur (${slurred})`);
});

// a note struck again on its layer knows when (findRestrikes in synth.js), so its ring is cut off there.
// without it a pad's fast chord pattern piled up dozens of copies of each note and the browser gave up
block('restrikes', () => {
  const { findRestrikes, restrikes } = vm.runInContext('({ findRestrikes, restrikes })', page);
  const comp = composeSong(generateSong('metal', 'tune', 'glitchy-cactus'));
  findRestrikes(comp.notes);
  const pad = comp.notes.filter((note) => note.layer === 'pad');
  pad.forEach((note, i) => {
    const next = pad.slice(i + 1).find((other) => other.midi === note.midi);
    assert.strictEqual(restrikes.get(note), next && next.t - note.t, 'a restruck note knows when it comes again');
  });
});

// the third round: a throat singer (an instrument with a home) holds one note at a time, near where
// they sang it; the gamelan's gong comes round every cycle; and a place's own kits and scenery are only
// ever in the moods that name them
block('throat singers, gongs and own kits', () => {
  const { INSTRUMENTS } = vm.runInContext('({ INSTRUMENTS })', page);
  // (a singer's tune too: the steppe's throat singers sing melodies, every note within nine semitones of
  // their own, and a sung line is one voice, so one note at a time)
  let singers = 0;
  let tunes = 0;
  for (let n = 0; n < 40; n++) {
    const song = generateSong('steppe', n % 2 ? 'ambient' : 'tune', `sing-${n}`);
    const comp = composeSong(song);
    for (const layer of song.layers.filter((one) => INSTRUMENTS[one.instrument]?.home)) {
      singers++;
      if (layer.role === 'melody') tunes++;
      const notes = comp.notes.filter((note) => note.layer === layer.id);
      const home = INSTRUMENTS[layer.instrument].home;
      for (const note of notes) {
        assert(Math.abs(note.midi - home) <= (layer.role === 'drone' ? 6 : 9) + liftAt(comp, note), `steppe sing-${n}: the ${layer.instrument} sings near its own note (${note.midi})`);
        // (humanising can overlap two joined notes by a few milliseconds, which the voice glides over)
        assert(!notes.some((other) => other !== note && other.t < note.t + note.dur - 0.05 && note.t < other.t + other.dur - 0.05), `steppe sing-${n}: one note at a time`);
      }
    }
  }
  assert(singers > 20, `steppe songs nearly always have a throat singer (${singers} in 40)`);
  assert(tunes > 6, `throat singers often sing the tune (${tunes} of 40)`);
  for (let n = 0; n < 6; n++) {
    const song = generateSong('gamelan', 'tune', `gong-${n}`);
    const drums = song.layers.find((layer) => layer.role === 'drums');
    if (drums?.instrument !== 'gamelan-kit') continue;
    const comp = composeSong(song);
    const bpb = { '4/4': 4, '3/4': 3, '6/8': 2, '5/4': 5 }[song.meter];
    for (const section of comp.sections.filter((one) => one.play.includes(drums.id))) {
      for (let bar = 0; bar < section.bars; bar += 4) assert(comp.notes.some((note) => note.layer === drums.id && note.midi === 6 && Math.abs(note.t - (section.start + bar * bpb)) < 0.05), `gamelan gong-${n}: the gong comes round every four bars`);
    }
  }
  for (const [id, kind] of VARIANTS) {
    for (const style of ['tune', 'ambient', 'boss']) {
      for (let n = 0; n < (kind ? 2 : 4); n++) {
        const song = generateSong(id, style, `own-${n}`, [], kind);
        const mood = songMood(song);
        for (const layer of song.layers.filter((one) => one.role === 'drums' || one.role === 'texture')) {
          if (INSTRUMENTS[layer.instrument].own) assert([...mood.kits, ...mood.textures].includes(layer.instrument), `${named(id, kind)} ${style} own-${n}: the ${layer.instrument} is only where a mood names it`);
        }
      }
    }
  }
});

// orchestration (pickOrchestra, passTune and carries in music.js): a layer taking the tune plays the
// melody's own line, the two take turns and play it together the last time the theme comes round, so
// some section always has the tune, and bells doubling it play it an octave up. the bass hook repeats
// bar to bar, starts each chord on its root, and keeps to the key. a loop never has an intro or an
// outro, and a retired mood opens as the one that replaced it
block('orchestration', () => {
  const { RETIRED, SCALES } = vm.runInContext('({ RETIRED, SCALES })', page);
  let taken = 0;
  let doubled = 0;
  let hooks = 0;
  let hookNotes = 0;
  let inKey = 0;
  const notesIn = (comp, id, section) => comp.notes.filter((note) => note.layer === id && !note.stop && note.gt >= section.start - 1e-6 && note.gt < section.end - 1e-6);
  const shape = (notes, by = 0) => notes.map((note) => `${note.gt.toFixed(3)}:${note.midi - by}`).sort().join();
  for (const mood of ['magic', 'gaslamp', 'dragon', 'shop', 'heroic', 'aztec', 'playful']) {
    for (const style of ['loop', 'tune', 'boss']) {
      for (let n = 0; n < 10; n++) {
        const song = generateSong(mood, style, `orch-${n}`);
        const where = `${mood} ${style} orch-${n}`;
        const comp = composeSong(song);
        const melody = song.layers.find((l) => l.role === 'melody');
        const taker = song.layers.find((l) => l.role === 'counter' && carries(l));
        const doubler = song.layers.find((l) => l.role === 'bells' && carries(l));
        if (style === 'loop') assert(!song.sections.some((s) => ['Intro', 'Outro'].includes(s.name)), `${where}: a loop has no intro or outro`);
        if (taker && melody) {
          taken++;
          const sung = comp.sections.filter((s) => !s.lead && (s.play.includes(melody.id) || s.play.includes(taker.id)));
          assert(sung.some((s) => s.play.includes(taker.id) && !s.play.includes(melody.id)), `${where}: the tune is handed over at least once`);
          for (const section of sung.filter((s) => s.play.includes(taker.id) && s.play.includes(melody.id))) {
            // (ornaments are bends, so the written pitches are the same)
            // (a voice with a range sings it in its own octave: the same notes, moved by octaves)
            const pcs = (notes) => notes.map((note) => `${note.gt.toFixed(3)}:${((note.midi % 12) + 12) % 12}`).sort().join();
            if (INSTRUMENTS[taker.instrument].range) assert.strictEqual(pcs(notesIn(comp, taker.id, section)), pcs(notesIn(comp, melody.id, section)), `${where}: the ${taker.instrument} sings the melody's line in ${section.name}`);
            else assert.strictEqual(shape(notesIn(comp, taker.id, section), taker.octave * 12), shape(notesIn(comp, melody.id, section)), `${where}: the ${taker.instrument} plays the melody's line in ${section.name}`);
          }
        }
        if (doubler && melody) {
          for (const section of comp.sections.filter((s) => s.play.includes(doubler.id) && s.play.includes(melody.id) && !s.lead)) {
            const tune = new Set(notesIn(comp, melody.id, section).map((note) => `${note.gt.toFixed(3)}:${note.midi + 12}`));
            for (const note of notesIn(comp, doubler.id, section)) assert(tune.has(`${note.gt.toFixed(3)}:${note.midi}`), `${where}: the ${doubler.instrument} doubles the tune an octave up`);
            doubled++;
          }
        }
        const bass = song.layers.find((l) => l.role === 'bass' && l.pattern === 'hook');
        if (bass) {
          const scale = new Set(SCALES[song.scale].steps.map((step) => (song.key + step) % 12));
          for (const section of comp.sections.filter((s) => s.play.includes(bass.id) && s.bars >= 4)) {
            hooks++;
            const bar = (k) => notesIn(comp, bass.id, section).filter((note) => note.gt >= section.start + k * comp.bpb - 1e-6 && note.gt < section.start + (k + 1) * comp.bpb - 1e-6).map((note) => (note.gt - section.start - k * comp.bpb + 1e-9).toFixed(3)).join();
            assert.strictEqual(bar(1), bar(2), `${where}: the bass hook repeats bar to bar`);
            for (const note of notesIn(comp, bass.id, section)) {
              const chord = section.chords.find((ch) => note.gt < ch.t + ch.dur - 1e-6);
              if (Math.abs(note.gt - chord.t) < 1e-6) assert.strictEqual(((note.midi % 12) + 12) % 12, chord.root, `${where}: a new chord starts on its root`);
              hookNotes++;
              if (scale.has((note.midi - (section.lift || 0)) % 12) || chord.pcs.has(note.midi % 12)) inKey++;
            }
          }
        }
        same(cleanSong(JSON.parse(JSON.stringify(song))), song, `${where}: saves and loads back the same`);
      }
    }
  }
  assert(taken > 40 && doubled > 20, `enough songs hand the tune round (${taken}) and double it (${doubled})`);
  // (the notes leading into the next chord are a semitone off it on purpose, so not all of them)
  assert(hooks > 20 && inKey / hookNotes > 0.8, `bass hooks keep to the key (${inKey} of ${hookNotes}, in ${hooks} sections)`);
  for (const [old, [mood, mods]] of Object.entries(RETIRED)) {
    assert(!MOODS[old] && MOODS[mood], `${old} is retired, into ${mood}`);
    const song = cleanSong({ mood: old });
    assert.strictEqual(song.mood, mood, `a song saved in ${old} opens in ${mood}`);
    assert(mods.every((id) => song.mods?.includes(id)), `${old} opens as ${mood} with ${mods.join(', ') || 'no modifiers'}`);
  }
});

// the fourth round: a prelude (warmth, silent hill's fog) is scenery alone, and the music comes in
// after it, but a loop never has one. drama (tragic, the dramatic modifier) pulls the quiet sections
// down and the loud ones up, in the same song shape. and an ambient song nearly always has a tune now,
// and scenery where its place has some (pickScenery)
block('preludes, drama and ambient', () => {
  const roles = (song, section) => section.play.map((id) => song.layers.find((l) => l.id === id).role);
  for (const [mood, kind] of [['nostalgic', 'warmth'], ['eerie', 'fog']]) {
    for (const style of ['ambient', 'tune']) {
      for (const seed of ['ember', 'ash', 'smoke', 'x']) {
        const where = `${mood}/${kind} ${style} ${seed}`;
        const song = generateSong(mood, style, seed, [], kind);
        assert(roles(song, song.sections[0]).every((role) => role === 'texture'), `${where}: opens on its scenery alone`);
        assert(roles(song, song.sections[1]).some((role) => role !== 'texture'), `${where}: the music comes in after the scenery`);
        assert(composeSong(song).notes.some((note) => note.layer.startsWith('texture') && note.t < 0.1), `${where}: the scenery plays from the start`);
      }
    }
    const loop = generateSong(mood, 'loop', 'ember', [], kind);
    assert(roles(loop, loop.sections[0]).some((role) => role !== 'texture'), `${mood}/${kind}: a loop has no prelude`);
  }
  // (the dramatic modifier also gives a tune longer shapes, DRAMA_FORMS, unless its mood has its own,
  // and builds more often, so drama on its own is checked on the loud moods' own shapes, in songs that
  // don't build)
  let stretched = 0;
  for (const mood of ['grunge', 'hardcore', 'metal', 'shoegaze']) {
    for (const seed of ['drama-1', 'drama-2', 'drama-3', 'drama-4']) {
      const plain = generateSong(mood, 'tune', seed);
      const big = generateSong(mood, 'tune', seed, ['dramatic']);
      // (nor a song with nothing quiet to pull down: a hardcore song can be loud all the way through)
      if (builds(plain) || builds(big) || Math.min(...plain.sections.map((section) => section.energy)) >= 0.65) continue;
      stretched++;
      const energies = (song) => song.sections.map((section) => section.energy);
      // (a solo goes where the melody's playing, which drama can move)
      const shape = (song) => song.sections.filter((section) => !section.lead).map((section) => section.name);
      same(shape(big), shape(plain), `${mood} ${seed}: drama keeps the song's shape`);
      assert(Math.min(...energies(big)) < Math.min(...energies(plain)) && Math.max(...energies(big)) >= Math.max(...energies(plain)), `${mood} ${seed}: drama makes the quiet quieter and the loud no quieter`);
    }
  }
  assert(stretched >= 6, `enough songs to check drama on (${stretched})`);
  // and a dramatic tune is longer than the same tune without it
  for (const mood of ['calm', 'happy', 'heroic', 'sad']) {
    const plain = composeSong(generateSong(mood, 'tune', 'drama-1'));
    const big = composeSong(generateSong(mood, 'tune', 'drama-1', ['dramatic']));
    assert(big.beats > plain.beats, `${mood}: a dramatic tune is longer`);
  }
  let tunes = 0;
  let scenery = 0;
  let songs = 0;
  for (const mood of Object.keys(MOODS).filter((id) => MOODS[id].style === 'ambient')) {
    for (let n = 0; n < 8; n++) {
      const song = generateSong(mood, 'ambient', `full-${n}`);
      songs++;
      if (song.layers.some((l) => l.role === 'melody')) tunes++;
      if (song.layers.some((l) => l.role === 'texture') || !songMood(song).textures.length) scenery++;
    }
  }
  assert(tunes / songs > 0.75, `ambient songs mostly have a tune (${tunes} of ${songs})`);
  assert(scenery / songs > 0.9, `ambient songs mostly have scenery (${scenery} of ${songs})`);
});

// flavours (FLAVOURS in moods.js, flavourMood in music.js): every mood says what it is and has kinds, the first
// of which is the mood as it is and never saved, so a song from before flavours makes the same notes.
// a kind only names real instruments that fit their role, real patterns, kits, scenery and chords, and
// never leaves a role with nothing gentle enough for the mood's cap. a flavour saves and loads, one the
// mood doesn't have is dropped, modifiers work on it, and a style it brings is a real one
block('flavours', () => {
  const { PATTERNS, INSTRUMENTS, maxEdge, instrumentFits, parseProgression, MODIFIERS, CONTOURS, RHYTHMS } = vm.runInContext('({ PATTERNS, INSTRUMENTS, maxEdge, instrumentFits, parseProgression, MODIFIERS, CONTOURS, RHYTHMS })', page);
  const mods = Object.keys(MODIFIERS);
  // every rhythm family's notes sit on the meter's finest grid, as CELLS' do, and it has all three speeds
  for (const [name, family] of Object.entries(RHYTHMS)) {
    for (const [sub, speeds] of Object.entries(family)) {
      same(Object.keys(speeds).sort(), ['fast', 'mid', 'slow'], `${name} ${sub}: three speeds`);
      for (const cell of Object.values(speeds).flat()) assert(cell.every((n) => n > 0 && Math.abs(n * sub * 2 - Math.round(n * sub * 2)) < 1e-9), `${name} ${sub}: ${cell} is on the grid`);
    }
  }
  for (const id of Object.keys(MOODS)) assert(FLAVOURS[id]?.about && Object.keys(FLAVOURS[id].kinds).length >= 2, `${id} says what it is and has flavours`);
  for (const [id, { kinds }] of Object.entries(FLAVOURS)) {
    assert(MOODS[id], `${id} has flavours but isn't a mood`);
    const [plain, ...others] = Object.keys(kinds);
    same(Object.keys(kinds[plain]).sort(), ['name', 'tip'], `${id}'s first flavour is the mood as it is`);
    same(generateSong(id, 'tune', 'plain', [], plain), generateSong(id, 'tune', 'plain'), `${id}: the plain flavour is the mood`);
    assert(!('flavour' in generateSong(id, 'tune', 'plain', [], plain)), `${id}: the plain flavour isn't saved`);
    for (const [n, kind] of others.entries()) {
      const where = `${id}/${kind}`;
      const settings = kinds[kind];
      assert(settings.name && settings.tip.startsWith(`${settings.name}:`), `${where}: a name and a tip`);
      assert(!settings.style || STYLES.includes(settings.style), `${where}: its style is real`);
      for (const [role, list] of Object.entries(settings.palette || {})) for (const inst of list) assert(instrumentFits(inst, role), `${where}: ${inst} isn't a ${role}`);
      for (const [role, list] of Object.entries(settings.patterns || {})) for (const pattern of list) assert(PATTERNS[role.replace(/^\w+\./, '')]?.[pattern], `${where}: ${role} has no pattern ${pattern}`);
      for (const kit of settings.kits || []) assert.strictEqual(INSTRUMENTS[kit]?.family, 'kit', `${where}: ${kit} isn't a kit`);
      for (const texture of settings.textures || []) assert.strictEqual(INSTRUMENTS[texture]?.family, 'texture', `${where}: ${texture} isn't scenery`);
      for (const chords of settings.chords || []) same(parseProgression(chords).bad, [], `${where}: ${chords} are chords`);
      // every kind but the plain one sings its own way (phrasing), with real shapes and rhythms
      assert(settings.phrasing, `${where}: has its own phrasing`);
      for (const shape of Object.keys(settings.phrasing.shapes || {})) assert(CONTOURS[shape], `${where}: no shape ${shape}`);
      assert(!settings.phrasing.rhythm || RHYTHMS[settings.phrasing.rhythm], `${where}: no rhythm ${settings.phrasing.rhythm}`);
      for (const style of STYLES) {
        const song = generateSong(id, style, 'kind', [], kind);
        assert.strictEqual(song.flavour, kind, `${where} ${style}: the flavour is kept`);
        same(cleanSong(JSON.parse(JSON.stringify(song))), song, `${where} ${style}: saves and loads back the same`);
        const sm = songMood(song);
        for (const [role, list] of Object.entries(sm.palette)) assert(list.some((inst) => INSTRUMENTS[inst].edge <= maxEdge(sm, role) + 1e-9), `${where} ${style}: the ${role} has nothing gentle enough for the mood`);
      }
      // a modifier on a flavour, in a style it wasn't made for
      const mod = mods[(n * 3 + id.length) % mods.length];
      const song = generateSong(id, n % 2 ? 'ambient' : 'boss', 'mod', [mod], kind);
      same(song.mods, [mod], `${where}+${mod}: the modifier is kept`);
      assert(composeSong(song).notes.length > 0, `${where}+${mod}: makes notes`);
    }
  }
  assert(!('flavour' in cleanSong({ mood: 'underwater', flavour: 'nonsense' })), 'an unknown flavour is dropped');
  assert(!('flavour' in cleanSong({ mood: 'calm', flavour: 'reef' })), "another mood's flavour is dropped");
  assert(!('flavour' in cleanSong({ mood: 'underwater', flavour: 'deep' })), 'the plain flavour is never saved');
});

// songs that build (BUILDS, builds() in music.js): with the rising modifier every tune and ambient song
// builds and loops and fights never do. a build's sections climb to the top without falling back, the
// band only grows on the way up, nobody solos, the last section at the top has the whole band (but a
// second guitar, which only plays its own sections), the drummer rolls through the bar before the top
// and the tune's doubled only there. a mood without build never builds, and one that can doesn't always
block('songs that build', () => {
  const { builds, BUILD_DOUBLE_ENERGY } = vm.runInContext('({ builds, BUILD_DOUBLE_ENERGY })', page);
  const energy = (section) => section.energy ?? 0.75;
  for (const mood of Object.keys(MOODS)) {
    for (const style of STYLES) {
      const song = generateSong(mood, style, 'rising-tide', ['rising']);
      const where = `${mood} ${style} rising`;
      assert.strictEqual(builds(song), style === 'tune' || style === 'ambient' || style === 'cutscene', `${where}: builds in a tune, an ambient song or a cutscene only`);
      if (!builds(song)) continue;
      const sections = song.sections.filter((section) => section.play.some((id) => song.layers.find((layer) => layer.id === id).role !== 'texture'));
      const top = Math.max(...sections.map(energy));
      const first = sections.findIndex((section) => energy(section) >= top - 0.01);
      for (let i = 1; i <= first; i++) {
        assert(energy(sections[i]) >= energy(sections[i - 1]), `${where}: climbs to the top without falling back`);
        assert(sections[i].play.length >= sections[i - 1].play.length - (song.layers.filter((l) => l.role === 'guitar').length > 1 ? 1 : 0), `${where}: the band only grows on the way up`);
      }
      assert(sections[0].play.length < sections[first].play.length, `${where}: starts smaller than its climax`);
      assert(!song.sections.some((section) => section.lead), `${where}: no solo`);
      const last = [...sections].reverse().find((section) => energy(section) >= top - 0.01);
      const missing = song.layers.filter((layer) => !last.play.includes(layer.id));
      assert(missing.length <= 1 && missing.every((layer) => layer.role === 'guitar' || layer.role === 'texture'), `${where}: everyone at the climax (missing ${missing.map((l) => l.id)})`);
      const comp = composeSong(song);
      const drums = song.layers.find((layer) => layer.role === 'drums');
      const at = comp.sections.find((section) => section.index === song.sections.indexOf(sections[first]));
      const before = comp.sections[at.index - 1];
      if (drums && before?.play.includes(drums.id)) {
        const roll = comp.notes.filter((note) => note.layer === drums.id && note.midi === 1 && note.t >= at.start - comp.bpb - 0.1 && note.t < at.start - 0.1);
        assert(roll.length >= comp.bpb * 2, `${where}: the drummer rolls into the climax (${roll.length} hits)`);
      }
      for (const note of comp.notes.filter((n) => n.double)) {
        const section = comp.sections.find((one) => note.t >= one.start - 1e-6 && note.t < one.end - 1e-6);
        const layer = song.layers.find((one) => one.id === note.layer);
        assert(energy(section) >= BUILD_DOUBLE_ENERGY || layer.doubleAll || ['choir-oo', 'choir-ah', 'soprano', 'chant-voice', 'dream-voice'].includes(layer.instrument), `${where}: doubled only at the top`);
      }
    }
  }
  let built = 0;
  for (let n = 0; n < 40; n++) built += builds(generateSong('heroic', 'tune', `climb-${n}`)) ? 1 : 0;
  assert(built > 4 && built < 36, `heroic tunes build some of the time (${built} of 40)`);
  for (let n = 0; n < 20; n++) assert(!builds(generateSong('cozy', 'tune', `climb-${n}`)), 'a mood without build never builds');
  for (let n = 0; n < 20; n++) assert(builds(generateSong('cozy', 'cutscene', `climb-${n}`)), 'a cutscene always builds');
});

// short links (songChanges and withChanges in music.js): a song is its seed's song with only what
// changed on top, so an untouched song has no changes, and any song, remixed, edited by hand or made
// from a blank track, comes back exactly from its changes
block('short links', () => {
  const { songChanges, withChanges, blankSong, packEdit, rerollSong } = vm.runInContext('({ songChanges, withChanges, blankSong, packEdit, rerollSong })', page);
  const back = (from, to, where) => same(cleanSong(withChanges(from, songChanges(from, to))), to, `${where}: comes back from its changes`);
  for (const [mood, style, mods, kind] of [['calm', 'ambient', []], ['heroic', 'tune', ['rising']], ['metal', 'boss', ['dark']], ['underwater', 'tune', [], 'reef']]) {
    const song = generateSong(mood, style, 'linked', mods, kind);
    const where = `${mood} ${style}`;
    assert.strictEqual(songChanges(song, generateSong(mood, style, 'linked', mods, kind)), undefined, `${where}: an untouched song has no changes`);
    back(song, song, where);
    const edited = JSON.parse(JSON.stringify(song));
    edited.name = 'Mine';
    edited.layers[0].volume = 0.31;
    edited.layers.pop();
    edited.sections[0].bars = 3;
    edited.layers[0].edits.B = { add: [packEdit({ t: 1, midi: 64, dur: 0.5 })], remove: ['0:60'] };
    back(song, cleanSong(edited), `${where} edited`);
    for (const what of ['band', 'chords', 'arrangement', 'orchestra', 'mutate']) back(song, rerollSong(song, what, 0.5), `${where} ${what} remixed`);
  }
  const own = blankSong();
  own.layers[0].edits.A = { add: [packEdit({ t: 0, midi: 67, dur: 1 })], remove: [] };
  back(blankSong(), cleanSong(own), 'a blank track with a note');
});

// key changes (section.lift, liftKey in music.js) and longer songs. a key change never drops back
// down within a song (once it's lifted it stays lifted to the end), every note in a lifted section is
// the note it'd be without the lift, moved up by it (the drone and scenery aside, which are joined up
// differently, and the drums, which roll and crash into it; a guitar's chords are struck when they were,
// but held as a hand holds them up there, forGuitar), the chords move with it, and the drummer crashes into a loud one. boss fights go round
// for longer than they did, a final boss and a cutscene always change key and are long, and a final boss
// outlasts a boss fight
block('key changes', () => {
  const lengths = { boss: [], final: [], cutscene: [] };
  for (const mood of Object.keys(MOODS)) {
    for (const style of ['boss', 'final', 'cutscene']) {
      const song = generateSong(mood, style, 'lifting');
      const where = `${mood} ${style} lifting`;
      const up = song.sections.map((section) => section.lift || 0);
      const first = up.findIndex((n) => n > 0);
      if (style !== 'boss') assert(first >= 0, `${where}: changes key`);
      if (first >= 0) assert(up.slice(first).every((n) => n === up[first]), `${where}: a key change stays up to the end`);
      const comp = composeSong(song);
      lengths[style].push((comp.beats * 60) / song.tempo);
      if (first < 0) continue;
      const flat = JSON.parse(JSON.stringify(song));
      for (const section of flat.sections) delete section.lift;
      const plain = composeSong(cleanSong(flat));
      const held = new Set(song.layers.filter((l) => ['drone', 'texture', 'drums'].includes(l.role)).map((l) => l.id));
      const necks = song.layers.filter((l) => !held.has(l.id) && onGuitar(l.instrument)).map((l) => l.id);
      for (const id of necks) {
        held.add(id);
        // (struck on the grid steps it was, as the learn tab gathers them)
        const steps = (notes) => [...new Set(notes.filter((n) => n.layer === id).map((n) => Math.round(n.gt / comp.step)))];
        assert.deepStrictEqual(steps(comp.notes), steps(plain.notes), `${where}: ${id} strikes its chords when it did`);
      }
      const mine = comp.notes.filter((n) => !held.has(n.layer));
      const theirs = plain.notes.filter((n) => !held.has(n.layer));
      assert.strictEqual(mine.length, theirs.length, `${where}: a key change keeps every note`);
      mine.forEach((note, i) => {
        const section = comp.sections.find((one) => note.gt >= one.start - 1e-6 && note.gt < one.end - 1e-6);
        assert(note.layer === theirs[i].layer && Math.abs(note.t - theirs[i].t) < 1e-9, `${where}: a key change keeps the rhythm`);
        assert.strictEqual(note.midi, theirs[i].midi + (section.lift || 0), `${where}: ${note.layer} at ${note.gt} moves with the key`);
      });
      for (const section of comp.sections.filter((one) => one.lift)) {
        const was = plain.sections[section.index].chords;
        section.chords.forEach((chord, i) => assert.strictEqual(chord.root, (was[i].root + section.lift) % 12, `${where}: the chords move with the key`));
      }
      const drums = song.layers.find((l) => l.role === 'drums');
      const loud = comp.sections.find((one, i) => one.lift && (one.energy ?? 0.75) >= 0.9 && !(i && comp.sections[i - 1].lift && (comp.sections[i - 1].energy ?? 0.75) >= 0.9));
      if (drums && loud?.play.includes(drums.id)) {
        assert(comp.notes.some((n) => n.layer === drums.id && Math.abs(n.gt - loud.start) < 1e-6 && (n.midi === 6 || n.midi === 3)), `${where}: the drummer crashes into the key change`);
      }
    }
  }
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  assert(Math.min(...lengths.boss) >= 90, `boss fights go round for a minute and a half at least (${Math.min(...lengths.boss).toFixed(0)} s)`);
  assert(Math.min(...lengths.final) >= 150 && mean(lengths.final) > mean(lengths.boss) * 1.2, `a final boss is long, and longer than a boss fight (${Math.min(...lengths.final).toFixed(0)} s, ${mean(lengths.final).toFixed(0)} s against ${mean(lengths.boss).toFixed(0)} s)`);
  assert(Math.min(...lengths.cutscene) >= 100 && mean(lengths.cutscene) >= 200, `cutscenes take their time (${Math.min(...lengths.cutscene).toFixed(0)} s, ${mean(lengths.cutscene).toFixed(0)} s on average)`);
  // a hand drawn key change saves, and junk doesn't
  same(cleanSong({ sections: [{ name: 'Up', part: 'A', bars: 8, play: [], lift: 2 }] }).sections[0].lift, 2, 'a key change saves');
  for (const junk of [0, -1, 9, 1.5, '2']) assert(!('lift' in cleanSong({ sections: [{ name: 'Up', part: 'A', bars: 8, play: [], lift: junk }] }).sections[0]), `a key change of ${junk} is dropped`);
});

// seeds: two words, each list with no repeats, and plenty of them
block('seeds', () => {
  const { SEED_WORDS, newSeed, makeRng } = vm.runInContext('({ SEED_WORDS, newSeed, makeRng })', page);
  for (const row of SEED_WORDS) {
    assert.strictEqual(new Set(row).size, row.length, 'no seed word twice in a list');
    assert(row.every((word) => /^[a-z]+$/.test(word)), 'seed words are plain lowercase words');
  }
  assert(SEED_WORDS[0].length * SEED_WORDS[1].length > 500000, 'over half a million seeds');
  assert(/^[a-z]+-[a-z]+$/.test(newSeed(makeRng('seed'))), 'a seed is two words');
});

// new notes for one part (rerollLayerPart): only that layer's notes in that part change (the rest keep
// their place, pitch and length; only the feel's tiny timing wobble moves), the motif stays, a second
// press gives another, it saves and links, and a part written from the chords alone gives null
block('new notes for one part', () => {
  const { rerollLayerPart, songChanges, withChanges } = vm.runInContext('({ rerollLayerPart, songChanges, withChanges })', page);
  const written = (comp, keep) => comp.notes.filter(keep).map((n) => `${n.layer} ${n.gt.toFixed(3)} ${n.midi} ${n.dur.toFixed(3)}`).sort().join();
  for (const [mood, style, seed] of [['epic', 'final', 'clash'], ['calm', 'tune', 'theme'], ['ethereal', 'ambient', 'drift'], ['metal', 'boss', 'riff']]) {
    const where = `${mood}/${style}/${seed}`;
    const song = generateSong(mood, style, seed);
    const melody = song.layers.find((l) => l.role === 'melody');
    const before = composeSong(song);
    if (!melody || !before.sections.some((s) => s.part === 'B' && s.play.includes(melody.id))) continue;
    const next = rerollLayerPart(song, melody.id, 'B', 1);
    assert(next, `${where}: the melody's part B can be written again`);
    const after = composeSong(next);
    const inB = (n) => before.sections.some((s) => s.part === 'B' && n.gt >= s.start - 1e-6 && n.gt < s.end - 1e-6);
    same(written(after, (n) => !inB(n)), written(before, (n) => !inB(n)), `${where}: only part B changes`);
    assert.notStrictEqual(written(after, (n) => inB(n) && n.layer === melody.id), written(before, (n) => inB(n) && n.layer === melody.id), `${where}: part B's melody is new`);
    same(cleanSong(JSON.parse(JSON.stringify(next))), next, `${where}: a part's own seed saves`);
    same(cleanSong(withChanges(song, songChanges(song, next))), next, `${where}: and links`);
    const again = rerollLayerPart(next, melody.id, 'B', 2);
    assert(again && again.layers.find((l) => l.id === melody.id).partSeeds.B !== next.layers.find((l) => l.id === melody.id).partSeeds.B, `${where}: pressing again gives another`);
    same(rerollSong(next, 'melodies', 1).layers.map((l) => l.partSeeds), next.layers.map(() => undefined), `${where}: new melodies for everyone clear the parts' own seeds`);
  }
  const song = generateSong('calm', 'tune', 'theme');
  const bass = song.layers.find((l) => l.role === 'bass');
  bass.pattern = 'held';
  assert.strictEqual(rerollLayerPart(cleanSong(song), bass.id, 'B', 1), null, 'a held bass has nothing new to write');
  assert(!('partSeeds' in cleanSong({ layers: [{ role: 'melody', partSeeds: { B: 5, Z: 'x' } }] }).layers[0]), 'junk part seeds are dropped');
});

// weaves (wizard101's marleybone): the tune alone, the second theme alone, then both, a trio where the
// bells carry the tune with no drums, and everyone at the climax. the second theme is the same line
// alone as when it meets the tune (a few notes may change on a later time round, as any tune's do), and
// a mood without a weave chance never weaves
block('weaves', () => {
  const { weaves } = vm.runInContext('({ weaves })', page);
  let woven = 0;
  for (const mood of Object.keys(MOODS)) {
    for (const style of ['tune', 'loop']) {
      for (const seed of ['mossy-lantern', 'quiet-tide', 'x', 'brave-teacup']) {
        const where = `${mood} ${style} ${seed}`;
        const song = generateSong(mood, style, seed);
        if (!MOODS[mood].weave) {
          assert(!weaves(song), `${where}: only a mood with a weave chance weaves`);
          continue;
        }
        if (!weaves(song)) continue;
        woven++;
        assert(song.layers.length <= 7, `${where}: a weave keeps to seven players`);
        const find = (role) => song.layers.find((l) => l.role === role);
        const [melody, counter, bells, drums] = [find('melody'), find('counter'), find('bells'), find('drums')];
        assert(melody && counter?.pattern === 'counterpoint' && bells?.pattern === 'double', `${where}: a weave has its tune, a second theme and bells to carry it`);
        const comp = composeSong(song);
        const at = (name) => comp.sections.find((s) => s.name === name);
        const has = (name, layer) => at(name).play.includes(layer.id);
        assert(has('Theme', melody) && !has('Theme', counter), `${where}: the tune alone first`);
        assert(has('Second theme', counter) && !has('Second theme', melody), `${where}: then the second theme alone`);
        assert(has('Together', melody) && has('Together', counter), `${where}: then both`);
        assert(has('Trio', bells) && !has('Trio', melody) && !has('Trio', counter) && !(drums && has('Trio', drums)), `${where}: the trio is the bells, with no drums`);
        assert(song.layers.every((l) => has('Climax', l)), `${where}: everyone at the climax`);
        const line = (name, layer) => comp.notes.filter((n) => n.layer === layer.id && n.gt >= at(name).start - 1e-6 && n.gt < at(name).end - 1e-6).map((n) => `${+(n.gt - at(name).start).toFixed(2)}:${n.written ?? n.midi}`);
        const alone = line('Second theme', counter);
        const together = line('Together', counter);
        assert(alone.length > 0 && line('Trio', bells).length > 0, `${where}: the second theme and the trio's bells play`);
        const kept = alone.filter((one, i) => one === together[i]).length;
        assert(kept >= Math.max(alone.length, together.length) * 0.75, `${where}: the second theme is the same alone as with the tune (${kept} of ${alone.length})`);
      }
    }
  }
  assert(woven >= 20, `songs weave (${woven})`);
});

// what this piece found, for the run that started it
process.send({ failures, tallies, times }, () => process.exit(0));
