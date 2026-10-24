// squimble music maker: a layer's notes as a player reads them, for the learn tab. like music.js it
// has no page and no audio, so the checks can run it in node:
//
//   playedTogether  a layer's notes gathered into what's played at once (a strum, a chord, one note)
//   frettings       which string and fret plays each of them on a guitar or a bass
//   fingersFor      which finger holds each fret
//   keySignature    the sharps or flats a song's key is written with, and spellPitch, a note's letter in it
//   sheetPieces     a part cut into the notes, rests and ties sheet music writes

// a note's pitch class (music.js has mod12 too, but this file stands on its own)
const pitchClass = (midi) => ((midi % 12) + 12) % 12;

// a layer's notes, gathered by the grid step they start on. a strum's strings start a moment apart
// (strum() in music.js spreads them over a tenth of a beat at most), so they land on the same step.
// up: a strum that goes high to low, an upstroke. a pitch that's in it twice is kept once
function playedTogether(notes, step) {
  const byStep = new Map();
  for (const note of notes) {
    const at = Math.round(note.gt / step);
    if (!byStep.has(at)) byStep.set(at, { t: at * step, notes: [] });
    byStep.get(at).notes.push(note);
  }
  const events = [...byStep.values()].sort((a, b) => a.t - b.t);
  for (const event of events) {
    const order = [...event.notes].sort((a, b) => a.gt - b.gt);
    // (only a strum's strings start apart: a chord struck all at once is a downstroke)
    const last = order[order.length - 1];
    event.up = order.length >= 3 && last.gt > order[0].gt + 1e-6 && order[0].midi > last.midi;
    event.notes = order.filter((note, i) => order.findIndex((other) => other.midi === note.midi) === i).sort((a, b) => a.midi - b.midi);
    event.end = Math.max(...event.notes.map((note) => note.gt + note.dur));
  }
  return events;
}

// ---------- guitars and basses ----------

// open strings, lowest first. drop: the low string tuned down a tone, for parts that go down to a d
// (the composer's power chords sit from about d2 up, ROLES.guitar in music.js). lower: drop b, every
// string down a tone and a half and the low one a fifth under the next, for a guitar tuned down (drop in
// synth.js, the heavy shoegaze bands' tuning)
const STRINGS = {
  guitar: { standard: [40, 45, 50, 55, 59, 64], drop: [38, 45, 50, 55, 59, 64], lower: [35, 42, 47, 52, 56, 61], frets: 22 },
  bass: { standard: [28, 33, 38, 43], drop: [26, 33, 38, 43], frets: 20 },
};
// the widest a hand reaches, in frets from the first finger's to the little finger's
const REACH = 4;

// every way to hold these pitches at once (lowest first): one note a string, lower notes on lower
// strings, within a hand's reach. a way is [[string, fret], ...], one per pitch
function holds(pitches, tuning, frets) {
  const ways = [];
  const walk = (i, from, chosen, low, high) => {
    if (i === pitches.length) {
      ways.push(chosen.slice());
      return;
    }
    for (let string = from; string < tuning.length; string++) {
      const fret = pitches[i] - tuning[string];
      if (fret < 0 || fret > frets) continue;
      const lo = fret ? Math.min(low, fret) : low;
      const hi = fret ? Math.max(high, fret) : high;
      if (hi - lo > REACH) continue;
      chosen.push([string, fret]);
      walk(i + 1, string + 1, chosen, lo, hi);
      chosen.pop();
    }
  };
  walk(0, 0, [], Infinity, -Infinity);
  return ways;
}

// where the hand is for a way of holding: its lowest fretted fret (null if it's all open strings)
const handAt = (way) => {
  const fretted = way.filter(([, fret]) => fret > 0).map(([, fret]) => fret);
  return fretted.length ? Math.min(...fretted) : null;
};
// how awkward a way is on its own: a stretch costs more the wider it is, a string skipped in the
// middle of a chord has to be muted while strumming across it, and the neck's low end is a little
// easier (and where most players expect a part to be)
function holdCost(way) {
  const skipped = way.length > 1 ? way[way.length - 1][0] - way[0][0] + 1 - way.length : 0;
  const fretted = way.filter(([, fret]) => fret > 0).map(([, fret]) => fret);
  if (!fretted.length) return skipped * 1.5;
  const span = Math.max(...fretted) - Math.min(...fretted);
  return (span > 3 ? 1.5 + (span - 3) * 3 : span * 0.5) + skipped * 1.5 + Math.min(...fretted) * 0.06;
}
// how far the hand moves from one way to the next. any move costs something, so a part stays in
// one place on the neck when it can
function moveCost(from, to) {
  const a = handAt(from);
  const b = handAt(to);
  if (a === null || b === null || a === b) return 0;
  return 1 + Math.abs(a - b) * 0.4;
}

// the strings and frets for a part's events (playedTogether), on 'guitar' or 'bass'. each event's
// ways are scored, and the cheapest path through the whole part is found at once (viterbi, as fretting
// tools do), so a hand isn't sent up the neck for one note it could play where it is. notes too low or
// high for the neck are moved an octave nearer (folded), and a chord that can't be held whole
// loses a note or two (left, on each event and in all). drop d is used if the part goes below the
// low e but not below d, and drop b (down) if it goes below d but not below b
function frettings(events, kind) {
  const { standard, drop, lower, frets } = STRINGS[kind];
  const lowest = Math.min(...events.flatMap((event) => event.notes.map((note) => note.midi)));
  const dropped = lowest < standard[0] && lowest >= drop[0];
  const down = !!lower && lowest < drop[0] && lowest >= lower[0];
  const tuning = down ? lower : dropped ? drop : standard;
  const bottom = tuning[0];
  const top = tuning[tuning.length - 1] + frets;
  let folded = 0;
  let left = 0;
  const options = events.map((event) => {
    let pitches = [...new Set(event.notes.map((note) => {
      let midi = note.midi;
      while (midi < bottom) midi += 12;
      while (midi > top) midi -= 12;
      if (midi !== note.midi) folded++;
      return midi;
    }))].sort((a, b) => a - b);
    let ways = holds(pitches, tuning, frets);
    // too many notes to hold: a note whose pitch class is in it twice goes first (from the top), then
    // the one under the top
    while (!ways.length && pitches.length > 1) {
      const twice = pitches.findLastIndex((midi, i) => pitches.some((other, j) => j !== i && pitchClass(other) === pitchClass(midi)));
      pitches = pitches.filter((_, i) => i !== (twice >= 0 ? twice : pitches.length - 2));
      left++;
      ways = holds(pitches, tuning, frets);
    }
    return { pitches, ways, dropped: event.notes.length - pitches.length };
  });
  // viterbi: best[i][k] the cheapest way to reach event i held its kth way
  let best = [];
  const back = [];
  options.forEach(({ ways }, i) => {
    const row = ways.map((way) => {
      const own = holdCost(way);
      if (!i || !best.length) return { cost: own, from: -1 };
      let pick = { cost: Infinity, from: -1 };
      best.forEach((previous, j) => {
        const cost = previous.cost + moveCost(options[i - 1].ways[j], way) + own;
        if (cost < pick.cost) pick = { cost, from: j };
      });
      return pick;
    });
    back.push(row);
    best = row;
  });
  const chosen = new Array(options.length).fill(-1);
  let k = best.reduce((at, one, j) => (one.cost < best[at].cost ? j : at), 0);
  for (let i = options.length - 1; i >= 0 && k >= 0; i--) {
    if (!options[i].ways.length) break;
    chosen[i] = k;
    k = back[i][k].from;
  }
  // and the hand: where the first finger sits. a chord's is its lowest fret; a single note keeps the
  // hand where it was if it's in reach, so a line played in one place is fingered 1 2 3 4 up the frets
  let hand = null;
  const placed = options.map(({ pitches, ways, dropped }, i) => {
    const way = ways[chosen[i]] || [];
    const at = handAt(way);
    if (at !== null) {
      if (hand === null || way.filter(([, fret]) => fret > 0).length > 1) hand = at;
      else if (at < hand) hand = at;
      else if (at > hand + REACH - 1) hand = at - REACH + 1;
    }
    return { strings: way.map(([string, fret], j) => ({ string, fret, midi: pitches[j] })), hand, left: dropped };
  });
  return { tuning, dropped, down, folded, left, placed };
}

// which finger holds each fretted string (1 the first finger to 4 the little one), and the barres: one
// finger flat across several strings at a fret. frets are taken low to high, a finger each; when there
// aren't enough fingers left for every string still to hold, a fret's strings are barred, broken where
// a string between them rings open or lower (the barre would stop it). that's how players finger the
// usual shapes: an open d is 1 3 2, an e shaped barre chord a barre and 2 3 4. hand: where the first
// finger sits, for single notes
function fingersFor(strings, hand) {
  const fingers = {};
  const barres = [];
  const fretted = strings.filter((one) => one.fret > 0);
  if (!fretted.length) return { fingers, barres };
  const low = fretted.length > 1 ? Math.min(...fretted.map((one) => one.fret)) : hand ?? fretted[0].fret;
  const fretOn = Object.fromEntries(strings.map((one) => [one.string, one.fret]));
  // a chord all at one fret on strings side by side, with nothing open (a power chord in drop d) is
  // one finger laid across them
  const order = fretted.map((one) => one.string).sort((a, b) => a - b);
  if (fretted.length > 1 && fretted.length === strings.length && fretted.every((one) => one.fret === low) && order[order.length - 1] - order[0] === order.length - 1) {
    for (const string of order) fingers[string] = 1;
    barres.push({ fret: low, from: order[0], to: order[order.length - 1], finger: 1 });
    return { fingers, barres };
  }
  let last = 0;
  for (const fret of [...new Set(fretted.map((one) => one.fret))].sort((a, b) => a - b)) {
    const here = fretted.filter((one) => one.fret === fret).map((one) => one.string).sort((a, b) => a - b);
    const still = fretted.filter((one) => one.fret >= fret).length;
    let next = Math.min(4, Math.max(last + 1, fret - low + 1));
    if (next + still - 1 <= 4) {
      here.forEach((string, i) => { fingers[string] = Math.min(4, next + i); });
      last = Math.min(4, next + here.length - 1);
      continue;
    }
    const runs = [[here[0]]];
    for (const string of here.slice(1)) {
      const run = runs[runs.length - 1];
      let clear = true;
      for (let between = run[run.length - 1] + 1; between < string; between++) if (!(fretOn[between] > fret)) clear = false;
      if (clear) run.push(string);
      else runs.push([string]);
    }
    for (const run of runs) {
      for (const string of run) fingers[string] = next;
      if (run.length > 1) barres.push({ fret, from: run[0], to: run[run.length - 1], finger: next });
      last = next;
      next = Math.min(4, next + 1);
    }
  }
  return { fingers, barres };
}

// ---------- sheet music ----------

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
// a major key's signature: sharps above zero, flats below (f# is written with six sharps)
const SIGNATURES = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
const LETTERS = 'CDEFGAB';
const SHARPS_ORDER = 'FCGDAEB';
const FLATS_ORDER = 'BEADGCF';

// the signature a song in this key and scale is written with: the major key whose notes the scale
// shares most of. a mode shares all seven with its own (d dorian is c major's notes, no sharps or
// flats); five note and odd scales take the key or its relative major on a tie, then the fewest marks
function keySignature(key, steps) {
  const notes = new Set(steps.map((step) => pitchClass(key + step)));
  let best = 0;
  let bestScore = -Infinity;
  for (let major = 0; major < 12; major++) {
    const shared = MAJOR_STEPS.filter((step) => notes.has(pitchClass(major + step))).length;
    const home = major === pitchClass(key) || major === pitchClass(key + 3) ? 2 : 0;
    const score = shared * 10 + home - Math.abs(SIGNATURES[major]) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = major;
    }
  }
  return SIGNATURES[best];
}

// the letters a signature changes, and how: { F: 1, C: 1 } for d major
function signatureLetters(signature) {
  const letters = {};
  for (const letter of (signature > 0 ? SHARPS_ORDER : FLATS_ORDER).slice(0, Math.abs(signature))) letters[letter] = Math.sign(signature);
  return letters;
}

// a note's spelling in a signature: its letter as the signature has it if it can be (e# in f#
// major), then a plain letter, then a sharp in a sharp key or a flat in a flat key. step counts lines
// and spaces up from c-1, so a staff can place it; acc is -1, 0 or 1
function spellPitch(midi, signature) {
  const altered = signatureLetters(signature);
  const pc = pitchClass(midi);
  const way = signature < 0 ? -1 : 1;
  let letter = [...LETTERS].findIndex((name, i) => pitchClass(MAJOR_STEPS[i] + (altered[name] || 0)) === pc);
  let acc = letter >= 0 ? altered[LETTERS[letter]] || 0 : 0;
  if (letter < 0) {
    letter = MAJOR_STEPS.indexOf(pc);
    acc = 0;
  }
  if (letter < 0) {
    letter = MAJOR_STEPS.findIndex((natural) => pitchClass(natural + way) === pc);
    acc = way;
  }
  const octave = (midi - MAJOR_STEPS[letter] - acc) / 12 - 1;
  return { letter, acc, step: octave * 7 + letter, name: `${LETTERS[letter]}${acc > 0 ? '#' : acc < 0 ? 'b' : ''}` };
}

// the note values sheet music writes, in quarter notes, longest first: whole, dotted half, half,
// dotted quarter, quarter, dotted eighth, eighth, dotted sixteenth, sixteenth
const NOTE_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];
const DOTTED = { 3: true, 1.5: true, 0.75: true, 0.375: true };
// a length in quarter notes as values tied together, longest first (anything under a sixteenth is lost)
function noteValues(length) {
  const values = [];
  let left = length;
  for (const value of NOTE_VALUES) {
    while (left >= value - 1e-6) {
      values.push(value);
      left -= value;
    }
  }
  return values;
}

// a part's events (playedTogether) as sheet music in one voice: each starts on its grid step and lasts
// until it ends or the next one starts, cut at the bar lines into values tied together, with rests in
// the gaps. time: { beats, bpb, step, quarters } (quarters: quarter notes to a beat, 1.5 in 6/8).
// shift: semitones it's written above where it sounds (12 for a guitar). a piece is { t, value, dot,
// rest } plus, for notes, heads [{ step, acc, show }] (show: the accidental's written, because the
// signature or an earlier one in the bar says otherwise) and tie (it carries on into the next piece)
function sheetPieces(events, time, signature, shift = 0) {
  const { beats, bpb, step, quarters } = time;
  const snap = (t) => Math.round(t / step) * step;
  const spans = [];
  events.forEach((event, i) => {
    const start = snap(event.t);
    const next = events[i + 1] ? snap(events[i + 1].t) : beats;
    const end = Math.min(next, beats, Math.max(start + step, snap(event.end)));
    if (end > start + 1e-6 && start < beats) spans.push({ start, end, notes: event.notes });
  });
  const pieces = [];
  // a stretch of time cut at bar lines and into values. heads: null for a rest
  const lay = (from, to, heads) => {
    let t = from;
    while (t < to - 1e-6) {
      const barEnd = (Math.floor(t / bpb + 1e-6) + 1) * bpb;
      const stop = Math.min(to, barEnd);
      for (const value of noteValues((stop - t) * quarters)) {
        pieces.push({ t, value, dot: !!DOTTED[value], rest: !heads, ...(heads ? { heads, tie: true } : {}) });
        t += value / quarters;
      }
      t = stop;
    }
    if (heads && pieces.length) pieces[pieces.length - 1].tie = false;
  };
  let at = 0;
  for (const span of spans) {
    if (span.start > at + 1e-6) lay(at, span.start, null);
    const heads = span.notes.map((note) => spellPitch(note.midi + shift, signature));
    lay(span.start, span.end, heads);
    at = span.end;
  }
  if (at < beats - 1e-6) lay(at, beats, null);
  // accidentals: written when the note's differs from what's in force at its line or space (the
  // signature, or an accidental earlier in the bar). a tied note carries its accidental over
  const altered = signatureLetters(signature);
  let bar = -1;
  let inForce = {};
  let tied = false;
  for (const piece of pieces) {
    const now = Math.floor(piece.t / bpb + 1e-6);
    if (now !== bar) {
      bar = now;
      inForce = {};
    }
    if (piece.rest) {
      tied = false;
      continue;
    }
    piece.heads = piece.heads.map((head) => {
      const was = inForce[head.step] ?? (altered[LETTERS[head.letter]] || 0);
      inForce[head.step] = head.acc;
      return { step: head.step, acc: head.acc, show: !tied && head.acc !== was };
    });
    tied = piece.tie;
  }
  return pieces;
}
