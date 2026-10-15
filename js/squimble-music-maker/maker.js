// squimble music maker: the page. music.js writes the songs and synth.js plays them, both loaded
// unchanged, so squimble quest can use them without this file. what this adds is the controls:
//
//   song        the song being edited (cleanSong()'s shape in music.js). every control reads and
//               writes it, then changed() composes it again and hands the new notes to the player,
//               which carries on mid song with them (MusicPlayer.load in synth.js)
//   comp        composeSong(song): the notes, sections and chords the score and editor draw
//   undo, redo  the song as json before each change
//
// sliders don't compose on every pixel they move: they ask for it (soon()) and frame() does it at
// most once a frame. sliders that only change the sound (volume, reverb...) skip composing (mixed()).
//
// a draft of the song is kept in this browser so a reload doesn't lose it, and the library is too.
// both are only conveniences: the song file and the link are the real ways to keep one.
//
// it's a music maker as well as a generator: New track opens a blank song (blankSong in music.js)
// whose layers play only the notes drawn or played in by hand (layer.hand). on a track of your own
// (song.own) the moods, style and modifiers stop writing new songs and only change how any written
// parts play, and Make it mine turns a written song into one of your own.

(() => {
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const key = (label, tip, onClick, className = '') => {
    const button = make('button', `mm-key ${className}`.trim(), label);
    button.type = 'button';
    if (tip) button.dataset.tip = tip;
    if (onClick) button.addEventListener('click', onClick);
    return button;
  };
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const percent = (value) => `${Math.round(value * 100)}%`;
  const fileName = (name) => name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') || 'song';
  const noteName = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const randomRng = () => makeRng(Math.random(), Date.now());
  // the pitches a note bends through (note.bend, its pins), for drawing it
  const bendPitches = (note) => (note.bend || []).map(([, semitones]) => note.midi + semitones);

  const player = new MusicPlayer();
  let song;
  let comp;
  let selected = null;
  let editPart = 'A';
  let tab = 'song';
  let startBeat = 0;
  const undo = [];
  const redo = [];
  let needCompose = false;
  let needMix = false;
  let scoreDirty = true;
  let editorScroll = 0;
  let editor = null;
  // the note editor's tool (note, slide, shake or swell), how fast a drawn slide goes (quick, half,
  // whole) and its shape (CURVES in synth.js: 0 straight, 1 smooth, 2 quick then settling), how wide a
  // vibrato is in cents, and which way a drawn swell goes (1 growing, -1 dying away)
  let tool = 'note';
  let slideSpeed = 'quick';
  let slideShape = 1;
  let shakeWidth = 22;
  let swellWay = 1;

  // ---------- changes ----------

  // before any change: the song as it was, for undo
  function remember() {
    const now = JSON.stringify(song);
    if (undo[undo.length - 1] !== now) undo.push(now);
    if (undo.length > 150) undo.shift();
    redo.length = 0;
    renderTop();
  }

  // after a change to the notes. panels: rebuild the open tab (not while a slider's being dragged)
  function changed(panels = true) {
    comp = composeSong(song);
    if (startBeat >= comp.beats) startBeat = 0;
    player.load(song, comp);
    scoreDirty = true;
    needCompose = false;
    if (panels) renderPanel();
    else if (editor) editor.box.replaceWith(noteEditor(editor.layer));
    renderTop();
    keepDraft();
  }
  const soon = () => { needCompose = true; };
  const mixed = () => { needMix = true; };

  // a whole new song (new seed, mood, undo, a file...)
  function open(next) {
    song = cleanSong(next);
    if (!song.layers.some((layer) => layer.id === selected)) selected = (song.layers.find((layer) => layer.role === 'melody') || song.layers[0])?.id ?? null;
    changed();
  }

  function step(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(song));
    open(JSON.parse(from.pop()));
  }

  const layerById = (id) => song.layers.find((layer) => layer.id === id);
  // an id no layer has yet: the role, then bass-2, bass-3...
  const freeId = (role) => {
    let id = role;
    for (let n = 2; layerById(id); n++) id = `${role}-${n}`;
    return id;
  };

  // moves the notes added by hand to a layer up or down (a new key, a new octave). a kit's notes are
  // its drums, not pitches, so they stay
  function moveNotes(layer, by) {
    if (!by || roleFamily(layer.role) !== 'tonal') return;
    const pitch = (midi) => Math.min(127, Math.max(0, midi + by));
    for (const changes of Object.values(layer.edits)) {
      changes.add = changes.add.map((raw) => {
        const one = unpackEdit(raw);
        return packEdit({ ...one, midi: pitch(one.midi), to: pitch(one.to) });
      });
    }
  }

  // a written layer's notes, as they play now, become its own (layer.hand), so they stay put when the
  // chords or the mood change, and every one can be moved or taken out. each part's notes come from the
  // first section that plays it (later times round vary a little; now they'll all be the same). the
  // player's ornaments are left off, apart from plain slides, and each note keeps how hard it's played
  // and whether it's palm muted
  function takeNotes(layer) {
    if (layer.hand || roleFamily(layer.role) === 'texture') return;
    layer.edits = {};
    for (const part of PARTS) {
      const sec = comp.sections.find((one) => one.part === part && one.play.includes(layer.id) && one.lead !== layer.id);
      if (!sec) continue;
      const add = comp.notes.filter((note) => note.layer === layer.id && note.gt >= sec.start - 1e-6 && note.gt < sec.end - 1e-6).map((note) => {
        const slide = note.bend?.length === 2 && note.bend[0][0] === 0 && note.bend[0][1] === 0 ? note.bend[1] : null;
        return packEdit({
          t: +(note.gt - sec.start).toFixed(3), midi: note.midi, dur: +note.dur.toFixed(3),
          ...(slide ? { to: note.midi + slide[1], glide: +slide[0].toFixed(3), curve: slide[2] || 0 } : {}),
          shake: Math.round(note.shake || 0), swell: note.swell || 0, vel: Math.round(note.vel * 100) / 100, mute: note.mute ? 1 : 0,
        });
      });
      if (add.length) layer.edits[part] = { add, remove: [] };
    }
    layer.hand = true;
  }

  // ---------- browser storage ----------

  const DRAFT_KEY = 'squimble-music-draft';
  const LIBRARY_KEY = 'squimble-music-library';
  const keepDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(song)); } catch { /* storage off, that's fine */ } };
  const readLibrary = () => {
    try {
      const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  };
  const writeLibrary = (library) => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
      return true;
    } catch {
      return false;
    }
  };

  // ---------- the tip line ----------

  const tipLine = $('#mmTip');
  const DEFAULT_TIP = 'Point at anything to see what it does. Space plays and stops, Ctrl + Z undoes, and your keyboard plays the open layer (A to L).';
  let pointedTip = '';
  let message = '';
  let messageUntil = 0;
  let messageTimer = 0;
  function showTip() {
    const news = performance.now() < messageUntil;
    tipLine.textContent = news ? message : pointedTip || DEFAULT_TIP;
    tipLine.classList.toggle('is-news', news);
  }
  function say(text) {
    message = text;
    messageUntil = performance.now() + 5000;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(showTip, 5050);
    showTip();
  }
  const machine = $('#maker');
  const pointTo = (event) => {
    pointedTip = event.target.closest?.('[data-tip]')?.dataset.tip || '';
    showTip();
  };
  machine.addEventListener('pointerover', pointTo);
  machine.addEventListener('focusin', pointTo);
  machine.addEventListener('pointerleave', () => { pointedTip = ''; showTip(); });

  // ---------- the top: name, seed, moods, remix, transport ----------

  const nameField = $('#mmName');
  const seedField = $('#mmSeed');
  nameField.addEventListener('focus', remember);
  nameField.addEventListener('input', () => {
    song.name = nameField.value.trim() || 'Untitled';
    keepDraft();
  });
  const useSeed = () => {
    const seed = seedField.value.trim().slice(0, 60);
    if (!seed || seed === song.seed) return;
    remember();
    open(generateSong(song.mood, song.style, seed, song.mods));
    say(`"${seed}" in ${MOODS[song.mood].name.toLowerCase()}.`);
  };
  seedField.addEventListener('change', useSeed);
  seedField.addEventListener('keydown', (event) => { if (event.key === 'Enter') useSeed(); });

  $('#mmNew').addEventListener('click', () => {
    remember();
    open(generateSong(song.mood, song.style, newSeed(randomRng()), song.mods));
  });
  $('#mmBlank').addEventListener('click', () => {
    remember();
    open(blankSong());
    setTab('layers');
    say('A blank track. Draw notes for the melody below, or turn on Record and play them in on your keyboard.');
  });
  $('#mmUndo').addEventListener('click', () => step(undo, redo));
  $('#mmRedo').addEventListener('click', () => step(redo, undo));
  $('#mmSave').addEventListener('click', () => {
    const library = readLibrary();
    library[song.name] = { song, saved: Date.now() };
    say(writeLibrary(library) ? `Saved "${song.name}" to your library.` : "Couldn't save: this browser isn't letting the page keep anything. Download the song file instead.");
    renderLibrary();
  });

  // the moods, one row at a time (MOOD_GROUPS): a key per row shows its moods, so thirty odd moods
  // fit on a phone. the row opens on the song's mood whenever the song changes mood
  const moodKeys = $('#mmMoods');
  const groupKeys = $('#mmMoodGroups');
  let shownMood = '';
  let shownOwn = null;
  const showGroup = (group) => {
    for (const button of groupKeys.children) button.setAttribute('aria-pressed', button.dataset.group === group);
    for (const button of moodKeys.children) button.hidden = MOODS[button.dataset.mood].group !== group;
  };
  for (const group of MOOD_GROUPS) {
    const moods = Object.values(MOODS).filter((one) => one.group === group).map((one) => one.name);
    const button = key(group, `${group}: ${moods.join(', ')}`, () => showGroup(group), 'mm-key-small mm-key-line mm-group');
    button.dataset.group = group;
    groupKeys.append(button);
  }
  // a fight stays a fight, and the modifiers stay, when the mood changes. otherwise a mood brings its
  // own style, the one it was made for. on a track of your own, a mood only changes how its written
  // parts play (and the colours): it never writes a new song over yours. the same goes for the style
  // and the modifiers
  const retune = (change) => {
    remember();
    change();
    changed();
  };
  for (const [id, mood] of Object.entries(MOODS)) {
    const button = key(mood.name, '', () => {
      if (song.own) return retune(() => { song.mood = id; });
      remember();
      open(generateSong(id, FIGHTS[song.style] ? song.style : mood.style, song.seed, song.mods));
    }, 'mm-mood');
    button.dataset.mood = id;
    button.style.setProperty('--c', mood.colour);
    button.style.setProperty('--c-ink', inkOn(mood.colour));
    moodKeys.append(button);
  }
  // the modifiers (MODIFIERS in music.js): words that change how the mood plays, a key each, lit while
  // it's on. turning one on turns its opposite off (calm and angry, fast and slow), and the song is
  // written again from the same seed with them, so adding fast gives the same song, faster, as near as
  // it can. they replaced the old blend menu, which mixed a second mood's band in
  const modKeys = $('#mmMods');
  const modName = (id) => MODIFIERS[id].name.toLowerCase();
  for (const [id, mod] of Object.entries(MODIFIERS)) {
    const button = key(mod.name, mod.tip, () => {
      const on = song.mods || [];
      const next = on.includes(id) ? on.filter((one) => one !== id) : [...on.filter((one) => one !== mod.against), id];
      if (next.length > MOST_MODS) return say(`That's ${MOST_MODS} modifiers, the most a song can have. Turn one off first.`);
      if (song.own) {
        retune(() => {
          if (next.length) song.mods = next;
          else delete song.mods;
        });
      } else {
        remember();
        open(generateSong(song.mood, song.style, song.seed, next));
      }
      const words = (song.mods || []).map(modName);
      say(words.length ? `${MOODS[song.mood].name}, ${words.join(', ')}.` : `Just ${MOODS[song.mood].name.toLowerCase()}.`);
    }, 'mm-key-small mm-key-line mm-mod');
    button.dataset.mod = id;
    modKeys.append(button);
  }
  for (const button of document.querySelectorAll('[data-style]')) {
    button.addEventListener('click', () => {
      if (song.style === button.dataset.style) return;
      if (song.own) return retune(() => { song.style = button.dataset.style; });
      remember();
      open(generateSong(song.mood, button.dataset.style, song.seed, song.mods));
    });
  }

  const REMIXES = [
    ['chords', 'Chords', 'New chord progressions for every part. The tunes follow the new chords'],
    ['melodies', 'Melodies', 'New tunes and rhythms for every layer, with the same chords and instruments'],
    ['band', 'Instruments', 'A new instrument and sound for every layer, playing the same notes'],
    ['arrangement', 'Arrangement', 'A new shape: which sections, how long they are, and who plays in each'],
    ['tonality', 'Key and tempo', 'A new key, scale, tempo and time signature'],
    ['space', 'Room', 'A new reverb, echo and tape sound'],
    ['mutate', 'Mutate', 'Small nudges to almost everything, for a close cousin of this song'],
  ];
  for (const [what, label, tip] of REMIXES) {
    $('#mmRemix').append(key(label, tip, () => {
      remember();
      open(rerollSong(song, what, Math.random()));
    }, 'mm-key-small'));
  }
  // the way from a written song to one of your own (takeNotes)
  $('#mmRemix').append(key('Make it mine', 'Make it mine: every part becomes notes of your own, to change one by one. They stay put when the chords or the mood change, and nothing writes over them', () => {
    remember();
    for (const layer of song.layers) takeNotes(layer);
    song.own = true;
    changed();
    say("It's yours now. Every part plays notes you can change: open one in the Band tab.");
  }, 'mm-key-small mm-key-line'));

  // dark or light text, whichever reads on a colour
  function inkOn(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#1c1a17' : '#fbf6ec';
  }

  const playKey = $('#mmPlay');
  const loopKey = $('#mmLoop');
  const togglePlay = () => {
    if (player.playing) player.stop();
    else player.play(startBeat);
    renderTransport();
  };
  playKey.addEventListener('click', togglePlay);
  loopKey.addEventListener('click', () => {
    player.loop = !player.loop;
    loopKey.setAttribute('aria-pressed', player.loop);
  });
  // recordings or synthesisers (RECORDINGS in synth.js). notes already sent finish as they were
  const recordedKey = $('#mmRecorded');
  recordedKey.addEventListener('click', () => {
    RECORDINGS.on = !RECORDINGS.on;
    recordedKey.setAttribute('aria-pressed', RECORDINGS.on);
    player.load(song, comp);
    player.mix();
  });
  const clickKey = $('#mmClick');
  clickKey.addEventListener('click', () => {
    player.metronome = !player.metronome;
    clickKey.setAttribute('aria-pressed', player.metronome);
  });
  // record: what's played on the keyboard while the song plays is written into the open layer
  // (recordNote). turning it on starts the song if it isn't playing
  const recKey = $('#mmRec');
  let recording = false;
  recKey.addEventListener('click', () => {
    recording = !recording;
    recKey.setAttribute('aria-pressed', recording);
    if (!recording) return;
    const layer = layerById(selected);
    if (!layer || roleFamily(layer.role) === 'texture') say('Open a layer with notes in the Band tab to record into it.');
    else say(`Recording the ${ROLES[layer.role].name.toLowerCase()}. ${layer.role === 'drums' ? 'A S D F G H J K L are the drums' : 'A to L are the white keys, W E T Y U O P the black ones, Z and X change octave'}.`);
    if (!player.playing) {
      player.play(startBeat);
      renderTransport();
    }
  });
  function renderTransport() {
    playKey.classList.toggle('is-playing', player.playing);
    playKey.querySelector('span').textContent = player.playing ? 'Stop' : 'Play';
    playKey.querySelector('svg').innerHTML = player.playing ? '<path d="M2.5 2.5h7v7h-7z"/>' : '<path d="M3 1.8v8.4L10 6z"/>';
  }

  function renderTop() {
    if (document.activeElement !== nameField) nameField.value = song.name;
    if (document.activeElement !== seedField) seedField.value = song.seed;
    $('#mmUndo').disabled = !undo.length;
    $('#mmRedo').disabled = !redo.length;
    for (const button of moodKeys.children) button.setAttribute('aria-pressed', button.dataset.mood === song.mood);
    if (shownMood !== song.mood) showGroup(MOODS[song.mood].group);
    shownMood = song.mood;
    for (const button of modKeys.children) button.setAttribute('aria-pressed', !!song.mods?.includes(button.dataset.mod));
    for (const button of document.querySelectorAll('[data-style]')) button.setAttribute('aria-pressed', button.dataset.style === song.style);
    const own = !!song.own;
    if (shownOwn !== own) {
      shownOwn = own;
      machine.classList.toggle('is-own', own);
      $('#mmOwnNote').hidden = !own;
      $('#mmMoodHeading').textContent = own ? 'Feel' : 'Mood';
      for (const button of moodKeys.children) {
        const { name } = MOODS[button.dataset.mood];
        button.dataset.tip = own ? `${name}: how any parts written for you play, and the colours. Your own notes stay as they are` : `${name}: the same seed as this song, written in this mood`;
      }
    }
    const colour = MOODS[song.mood].colour;
    document.body.style.setProperty('--mm-mood', colour);
    document.body.style.setProperty('--mm-mood-ink', inkOn(colour));
  }

  let lastReadout = '';
  function renderReadout() {
    const secondsPerBeat = 60 / song.tempo;
    const at = player.playing ? player.position() : startBeat;
    const section = comp.sections.find((one) => at >= one.start && at < one.end) || comp.sections[0];
    const bar = Math.floor(at / comp.bpb) + 1;
    const where = `${section.name} · bar ${bar}`;
    const text = `${where} · ${clock(at * secondsPerBeat)} / ${clock(comp.beats * secondsPerBeat)} · ${NOTE_NAMES[song.key]} ${SCALES[song.scale].name.toLowerCase()} · ${song.tempo} bpm · ${song.meter}`;
    if (text !== lastReadout) $('#mmReadout').textContent = lastReadout = text;
  }

  // ---------- the score ----------

  const score = $('#mmScore');
  const paper = document.createElement('canvas');
  const HEAD = 22;
  const CHORDS = 20;
  const LANE = 30;
  const PAPER = '#efe6d3';
  const PAPER_DARK = '#e4d7bc';
  const RULE = '#d4c4a4';
  const INK = '#2c2721';
  const INK_SOFT = '#76695a';
  const PART_COLOURS = { A: '#e2d2b0', B: '#d3bf97', C: '#c4ac80' };
  let layout = null;

  function clipText(g, text, x, y, room) {
    if (room < 12) return;
    let shown = text;
    while (shown.length > 1 && g.measureText(shown).width > room) shown = shown.slice(0, -2) + '…';
    g.fillText(shown, x, y);
  }

  // where each layer's notes sit in its lane: its lowest and highest notes
  function laneY(layer, range, midi, top) {
    const room = LANE - 11;
    if (layer.role === 'drums') {
      const last = (INSTRUMENTS[layer.instrument]?.slots?.length || 6) - 1;
      return top + 5 + ((last - midi) / last) * room;
    }
    const [low, high] = range;
    return top + 5 + (high === low ? 0.5 : (high - midi) / (high - low)) * room;
  }

  // the parts that don't move (everything but the playhead), drawn once per change
  function drawPaper() {
    const width = score.clientWidth;
    if (!width) return;
    const dpr = window.devicePixelRatio || 1;
    const gutter = width < 560 ? 74 : 132;
    const height = HEAD + CHORDS + Math.max(1, song.layers.length) * LANE + 1;
    for (const canvas of [score, paper]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    score.style.height = `${height}px`;
    const right = width - 10;
    const x = (beat) => gutter + (beat / comp.beats) * (right - gutter);
    const ranges = {};
    const lanes = {};
    layout = { width, height, gutter, right, x, dpr, ranges, lanes, beatAt: (px) => ((px - gutter) / (right - gutter)) * comp.beats };
    const g = paper.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, width, height);
    g.textBaseline = 'middle';
    for (const section of comp.sections) {
      const x0 = x(section.start);
      const x1 = x(section.end);
      g.fillStyle = PART_COLOURS[section.part];
      g.fillRect(x0, 0, x1 - x0, HEAD);
      g.fillStyle = INK;
      g.font = '700 11px Recursive, sans-serif';
      clipText(g, section.name, x0 + 5, HEAD / 2 + 1, x1 - x0 - 8);
      g.font = '500 10.5px Recursive, monospace';
      for (const chord of section.chords) {
        const cx = x(chord.t);
        g.fillStyle = RULE;
        g.fillRect(cx, HEAD, 1, CHORDS);
        g.fillStyle = INK_SOFT;
        // chord names only where they fit whole: a cut off one could be misread as another chord
        if (g.measureText(chord.name).width < x(chord.t + chord.dur) - cx - 5) g.fillText(chord.name, cx + 3, HEAD + CHORDS / 2);
      }
    }
    g.fillStyle = 'rgba(44, 39, 33, 0.07)';
    if (((right - gutter) / comp.beats) * comp.bpb >= 5) for (let beat = 0; beat < comp.beats; beat += comp.bpb) g.fillRect(x(beat), HEAD + CHORDS, 1, height);
    g.fillStyle = 'rgba(44, 39, 33, 0.3)';
    for (const section of comp.sections) g.fillRect(Math.round(x(section.start)), 0, 1, height);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, gutter - 4, HEAD + CHORDS);
    song.layers.forEach((layer, i) => {
      const top = HEAD + CHORDS + i * LANE;
      lanes[layer.id] = top;
      g.fillStyle = RULE;
      g.fillRect(0, top, width, 1);
      g.fillStyle = layer.id === selected ? PAPER_DARK : PAPER;
      g.fillRect(0, top + 1, gutter - 4, LANE - 1);
      g.globalAlpha = audible(song, layer) ? 1 : 0.3;
      const colour = ROLES[layer.role].colour;
      g.fillStyle = colour;
      g.fillRect(6, top + 7, 5, LANE - 13);
      g.fillStyle = INK;
      g.font = '700 11.5px Recursive, sans-serif';
      clipText(g, ROLES[layer.role].name + (layer.solo ? ' · solo' : ''), 17, gutter > 100 ? top + 10 : top + LANE / 2, gutter - 24);
      if (gutter > 100) {
        g.fillStyle = INK_SOFT;
        g.font = '500 10.5px Recursive, sans-serif';
        clipText(g, INSTRUMENTS[layer.instrument].name, 17, top + 21, gutter - 24);
      }
      const notes = comp.notes.filter((note) => note.layer === layer.id);
      let low = Infinity;
      let high = -Infinity;
      for (const note of notes) {
        for (const midi of [note.midi, ...bendPitches(note)]) {
          low = Math.min(low, midi);
          high = Math.max(high, midi);
        }
      }
      ranges[layer.id] = [low, high];
      g.fillStyle = colour;
      if (layer.role === 'texture') {
        g.globalAlpha *= 0.32;
        for (const note of notes) g.fillRect(x(note.t), top + 6, x(note.t + note.dur) - x(note.t), LANE - 11);
      } else {
        for (const note of notes) {
          const nx = x(note.t);
          const nw = Math.max(1.5, x(note.t + note.dur) - nx - 0.5);
          // a slide or bend is a line following its pitch from the note's start (only where it's wide
          // enough to see), the rest of the note at the pitch it ends on
          if (note.bend && nw > 6) {
            g.strokeStyle = colour;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(nx, laneY(layer, ranges[layer.id], note.midi + note.bend[0][1], top) + 1.5);
            for (const [at, semitones] of note.bend) g.lineTo(x(note.t + Math.min(at, note.dur)), laneY(layer, ranges[layer.id], note.midi + semitones, top) + 1.5);
            g.lineTo(nx + nw, laneY(layer, ranges[layer.id], note.midi + note.bend[note.bend.length - 1][1], top) + 1.5);
            g.stroke();
          } else g.fillRect(nx, laneY(layer, ranges[layer.id], note.midi, top), nw, 3);
        }
      }
      g.globalAlpha = 1;
    });
    scoreDirty = false;
  }

  // every frame: the paper, the notes sounding now in ink, and the playhead (or the marker)
  function drawScore() {
    if (scoreDirty || !layout || score.clientWidth !== layout.width) drawPaper();
    if (!layout) return;
    const g = score.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(paper, 0, 0);
    g.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    const { x } = layout;
    if (player.playing) {
      const at = player.position();
      g.fillStyle = INK;
      for (const note of comp.notes) {
        if (note.t > at) break;
        if (note.t + note.dur <= at || note.layer === undefined) continue;
        const layer = layerById(note.layer);
        if (!layer || layer.role === 'texture' || !audible(song, layer)) continue;
        const nx = x(note.t);
        g.fillRect(nx, laneY(layer, layout.ranges[layer.id], note.midi, layout.lanes[layer.id]) - 1, Math.max(2, x(note.t + note.dur) - nx), 5);
      }
      g.fillRect(Math.round(x(at)) - 1, 0, 2, layout.height);
    } else {
      const mx = Math.round(x(startBeat));
      g.fillStyle = INK;
      g.beginPath();
      g.moveTo(mx - 5, 0);
      g.lineTo(mx + 5, 0);
      g.lineTo(mx, 7);
      g.fill();
      g.fillStyle = 'rgba(44, 39, 33, 0.55)';
      for (let y = 8; y < layout.height; y += 6) g.fillRect(mx, y, 1, 3);
    }
  }

  // clicking the sections or chords moves the marker (and the playhead, if it's playing). clicking a
  // lane opens that layer in the band tab, on the part that was clicked
  score.addEventListener('pointerdown', (event) => {
    if (!layout) return;
    const rect = score.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const beat = Math.min(comp.beats - 1e-6, Math.max(0, layout.beatAt(px)));
    if (py < HEAD + CHORDS) {
      if (px < layout.gutter) return;
      startBeat = Math.floor(beat / comp.bpb) * comp.bpb;
      if (player.playing) player.play(startBeat);
      return;
    }
    const layer = song.layers[Math.floor((py - HEAD - CHORDS) / LANE)];
    if (!layer) return;
    selected = layer.id;
    if (px > layout.gutter) editPart = (comp.sections.find((one) => beat >= one.start && beat < one.end) || comp.sections[0]).part;
    setTab('layers');
    scoreDirty = true;
  });
  new ResizeObserver(() => { scoreDirty = true; }).observe(score);
  document.fonts?.ready.then(() => { scoreDirty = true; });

  // ---------- controls for the panels ----------

  let sliderCount = 0;
  // a labelled slider. get and set read and write the song. kind: 'notes' if it changes the notes,
  // 'mix' if it only changes how they sound
  function slider({ label, tip, min, max, step = 0.01, get, set, format, kind = 'notes' }) {
    const row = make('div', 'mm-slider');
    row.dataset.tip = tip;
    const id = `mmSlider${++sliderCount}`;
    const name = make('label', '', label);
    name.htmlFor = id;
    const input = make('input');
    Object.assign(input, { type: 'range', id, min, max, step, value: get() });
    const out = make('output', '', format(get()));
    out.htmlFor = id;
    const fill = () => input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
    let dragging = false;
    input.addEventListener('input', () => {
      if (!dragging) remember();
      dragging = true;
      set(+input.value);
      out.textContent = format(+input.value);
      fill();
      if (kind === 'mix') mixed();
      else soon();
    });
    input.addEventListener('change', () => { dragging = false; });
    fill();
    row.append(name, input, out);
    return row;
  }

  // a row of keys, one lit. options: [value, label, tip]
  function choices(options, get, pick, label) {
    const group = make('div', 'mm-choices');
    group.setAttribute('role', 'group');
    if (label) group.setAttribute('aria-label', label);
    for (const [value, text, tip] of options) {
      const button = key(text, tip, () => pick(value), 'mm-key-small');
      button.setAttribute('aria-pressed', get() === value);
      group.append(button);
    }
    return group;
  }
  // a change from a key or menu: remember, change, compose
  const edit = (change) => () => {
    remember();
    change();
    changed();
  };

  function field(label, control, tip) {
    const row = make('div', 'mm-field');
    if (tip) row.dataset.tip = tip;
    const name = make('span', 'mm-field-label', label);
    row.append(name, control);
    return row;
  }
  function section(title, ...children) {
    const box = make('div', 'mm-section');
    box.append(make('h3', 'mm-section-title', title), ...children);
    return box;
  }

  // ---------- tabs ----------

  const panel = $('#mmPanel');
  const tabKeys = document.querySelectorAll('.mm-tab');
  for (const button of tabKeys) button.addEventListener('click', () => setTab(button.dataset.tab));
  function setTab(name) {
    tab = name;
    for (const button of tabKeys) button.setAttribute('aria-selected', button.dataset.tab === tab);
    renderPanel();
  }

  function renderPanel() {
    editor = null;
    const build = { song: songPanel, layers: bandPanel, arrange: arrangePanel, space: roomPanel }[tab];
    panel.replaceChildren(...build());
  }

  // ---------- the song tab ----------

  function songPanel() {
    const scale = make('select', 'mm-select');
    for (const [id, { name }] of Object.entries(SCALES)) scale.append(new Option(name, id, false, id === song.scale));
    scale.addEventListener('change', edit(() => { song.scale = scale.value; }));
    const keyNames = NOTE_NAMES.map((name, i) => [i, name, `Play it in ${name}`]);
    const meters = [
      ['4/4', '4/4', '4/4: four beats to a bar, most music'],
      ['3/4', '3/4', '3/4: three beats to a bar, a waltz'],
      ['6/8', '6/8', '6/8: two beats that each split in three, a lilting jig'],
      ['5/4', '5/4', '5/4: five beats to a bar, a bit off kilter'],
    ];
    const chordBars = CHORD_BARS.map((bars) => [bars, bars === 0.5 ? '½ bar' : `${bars} bar${bars > 1 ? 's' : ''}`, `Each chord lasts ${bars === 0.5 ? 'half a bar' : bars === 1 ? 'a bar' : `${bars} bars`}`]);
    const columns = make('div', 'mm-columns');
    columns.append(
      section('Key and scale',
        // (notes added by hand move with the key, the nearest way, so they stay in it)
        field('Key', Object.assign(choices(keyNames, () => song.key, (value) => edit(() => {
          const by = mod12(value - song.key);
          for (const layer of song.layers) moveNotes(layer, by > 6 ? by - 12 : by);
          song.key = value;
        })(), 'Key'), { className: 'mm-choices mm-notes' }), 'Key: the note the song feels at home on. Notes you\'ve drawn move with it'),
        field('Scale', scale, 'Scale: which notes it uses. Major is bright, minor sad, dorian wistful, lydian dreamy, phrygian dark, whole tone strange'),
      ),
      section('Time',
        slider({ label: 'Tempo', tip: 'Tempo: beats a minute', min: 30, max: 220, step: 1, get: () => song.tempo, set: (v) => { song.tempo = v; }, format: (v) => `${v} bpm`, kind: 'mix' }),
        field('Time', choices(meters, () => song.meter, (value) => edit(() => { song.meter = value; })(), 'Time signature'), 'Time signature: how beats group into bars'),
        slider({ label: 'Swing', tip: 'Swing: pushes every off beat later, for a lazy, bouncing feel', min: 0, max: 1, get: () => song.swing, set: (v) => { song.swing = v; }, format: percent }),
        slider({ label: 'Humanise', tip: "Humanise: nudges each note off the grid and plays them unevenly, like a person. At 0 it's machine perfect", min: 0, max: 1, get: () => song.humanise, set: (v) => { song.humanise = v; }, format: percent }),
      ),
    );
    const top = make('div', 'mm-columns');
    top.append(
      slider({ label: 'Colour', tip: 'Colour: plain chords at 0, more sevenths, ninths and suspended chords as it goes up, for a jazzier, dreamier sound', min: 0, max: 1, get: () => song.colour, set: (v) => { song.colour = v; }, format: percent }),
      field('Each chord', choices(chordBars, () => song.chordBars, (value) => edit(() => { song.chordBars = value; })(), 'Chord length'), 'How long each chord lasts'),
    );
    const chords = section('Chords', top, ...PARTS.map(chordRow), make('p', 'mm-hint', 'Chords are roman numerals counting up the scale from the key: I is home, IV and V are the strong ones. Capitals are major (bright), lower case minor (sad). b and # move one a semitone (bVII), ° is diminished and + augmented. Add 7, maj7, 6, sus2, sus4 or add9 for colour (Imaj7). A - holds the last chord for another turn. Click a chord to hear it.'));
    return [columns, chords];
  }

  // one part's chords: a box to type them in, the chords they make (click to hear one), and a key for new ones
  function chordRow(part) {
    const row = make('div', 'mm-chords');
    const used = comp.sections.filter((one) => one.part === part).length;
    const name = make('span', 'mm-part', part);
    name.style.background = PART_COLOURS[part];
    const input = make('input', 'mm-input mm-chord-input');
    Object.assign(input, { type: 'text', value: song.parts[part], spellcheck: false, autocomplete: 'off' });
    input.setAttribute('aria-label', `Part ${part}'s chords`);
    row.dataset.tip = `Part ${part}'s chords${used ? `, played in ${used} section${used > 1 ? 's' : ''}` : ", which no section uses yet (see Arrange)"}`;
    const chips = make('div', 'mm-chips');
    const problem = make('p', 'mm-chord-problem');
    const showChips = () => {
      const { bad } = parseProgression(song.parts[part]);
      problem.textContent = bad.length ? `Not chords: ${bad.join(', ')}` : '';
      const chords = sectionChords(song, { part, bars: partBars(song, part) }, 0);
      const bars = comp.bpb;
      chips.replaceChildren(...chords.map((chord) => {
        const chip = make('button', 'mm-chip');
        chip.type = 'button';
        const length = chord.dur / bars;
        chip.append(make('b', '', chord.name), make('small', '', length === 0.5 ? '½ bar' : `${length} bar${length === 1 ? '' : 's'}`));
        chip.addEventListener('click', () => {
          const voice = song.layers.find((layer) => layer.role === 'pad' || layer.role === 'keys') || song.layers.find((layer) => roleFamily(layer.role) === 'tonal');
          if (voice) player.audition(song, voice, voiceChord(chord.root, chord.tones, 60, null), 3);
        });
        return chip;
      }));
    };
    input.addEventListener('focus', remember);
    input.addEventListener('input', () => {
      song.parts[part] = input.value.slice(0, 200) || 'I';
      soon();
      showChips();
    });
    input.addEventListener('change', () => changed(false));
    showChips();
    const again = key('New', `New chords for part ${part} only`, () => {
      remember();
      open(rerollPart(song, part, Math.random()));
    }, 'mm-key-small mm-key-line');
    const line = make('div', 'mm-chords-line');
    line.append(name, input, again);
    row.append(line, chips, problem);
    return row;
  }

  // ---------- the band tab ----------

  // an instrument's name, saying if it's played from recordings (a kit counts if any drum is)
  const instrumentName = (instrument) => `${instrument.name}${sampleFolders(instrument).length ? ' (recorded)' : ''}`;

  function instrumentSelect(layer) {
    const select = make('select', 'mm-select');
    select.setAttribute('aria-label', 'Instrument');
    const groups = {};
    for (const [id, instrument] of Object.entries(INSTRUMENTS)) {
      if (!instrumentFits(id, layer.role)) continue;
      if (!groups[instrument.family]) {
        groups[instrument.family] = make('optgroup');
        groups[instrument.family].label = FAMILIES[instrument.family];
        select.append(groups[instrument.family]);
      }
      groups[instrument.family].append(new Option(instrumentName(instrument), id, false, id === layer.instrument));
    }
    select.addEventListener('change', () => {
      remember();
      layer.instrument = select.value;
      delete layer.recording;
      changed();
      player.audition(song, layer, layer.role === 'drums' ? [0, 2, 1] : layer.role === 'texture' ? [60] : [ROLES[layer.role].center + layer.octave * 12], layer.role === 'texture' ? 4 : 1.5);
    });
    return select;
  }

  // which of an instrument's recordings a layer plays (recordingsOf in synth.js), for the instruments
  // that have more than one: a wurlitzer or a pianet, karoryfer's black guitar or their shiny one
  function recordingSelect(layer) {
    const select = make('select', 'mm-select');
    select.setAttribute('aria-label', 'Recording');
    for (const [folder, settings] of recordingsOf(INSTRUMENTS[layer.instrument])) {
      select.append(new Option(settings.name || folder, folder, false, folder === recordingFolder(INSTRUMENTS[layer.instrument], layer.recording)));
    }
    select.addEventListener('change', () => {
      remember();
      if (select.selectedIndex === 0) delete layer.recording;
      else layer.recording = select.value;
      changed();
      player.audition(song, layer, [ROLES[layer.role].center + layer.octave * 12], 1.5);
    });
    return select;
  }

  function bandPanel() {
    const list = make('ul', 'mm-layers');
    for (const layer of song.layers) {
      const item = make('li', `mm-layer${layer.id === selected ? ' is-open' : ''}`);
      const open = make('button', 'mm-layer-open');
      open.type = 'button';
      open.setAttribute('aria-pressed', layer.id === selected);
      open.dataset.tip = `Open the ${ROLES[layer.role].name.toLowerCase()} to change it`;
      const chip = make('i', 'mm-layer-chip');
      chip.style.background = ROLES[layer.role].colour;
      const words = make('span', 'mm-layer-words');
      words.append(make('b', '', ROLES[layer.role].name), make('small', '', `${instrumentName(INSTRUMENTS[layer.instrument])}${layer.hand ? ' · my notes' : ''}`));
      open.append(chip, words);
      open.addEventListener('click', () => {
        selected = layer.id;
        scoreDirty = true;
        renderPanel();
      });
      const mute = key('M', `Mute the ${ROLES[layer.role].name.toLowerCase()}`, () => {
        remember();
        layer.mute = !layer.mute;
        scoreDirty = true;
        mixed();
        renderPanel();
      }, 'mm-key-small mm-key-square');
      mute.setAttribute('aria-pressed', layer.mute);
      mute.setAttribute('aria-label', 'Mute');
      const solo = key('S', `Solo: hear only the ${ROLES[layer.role].name.toLowerCase()} (and any other soloed layers)`, () => {
        remember();
        layer.solo = !layer.solo;
        scoreDirty = true;
        mixed();
        renderPanel();
      }, 'mm-key-small mm-key-square');
      solo.setAttribute('aria-pressed', layer.solo);
      solo.setAttribute('aria-label', 'Solo');
      item.append(open, mute, solo);
      list.append(item);
    }
    const roles = make('select', 'mm-select');
    roles.setAttribute('aria-label', 'Kind of layer to add');
    for (const role of ROLE_ORDER) roles.append(new Option(ROLES[role].name, role));
    const add = make('div', 'mm-add');
    add.dataset.tip = 'Add a layer. It plays in every section to start with: turn it off where you like in Arrange';
    // empty: a layer that plays only what you give it (layer.hand). written: one the mood writes a part
    // for, like the layers a new song comes with. a texture has no notes to give it, so it's written
    const addLayer = (hand) => () => {
      if (song.layers.length >= 16) return say("That's 16 layers, the most a song can have.");
      remember();
      const role = roles.value;
      const layer = { ...clone(LAYER_DEFAULTS), id: freeId(role), role };
      dressLayer(song, layer, randomRng(), true);
      if (hand && roleFamily(role) !== 'texture') layer.hand = true;
      song.layers.push(layer);
      song.layers.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
      for (const one of song.sections) one.play.push(layer.id);
      selected = layer.id;
      changed();
    };
    add.append(
      roles,
      key('Empty', 'Add an empty layer that plays only the notes you draw or record', addLayer(true), song.own ? 'mm-key-small' : 'mm-key-small mm-key-line'),
      key('Written', 'Add a layer with a part written for you, following the chords, in the mood', addLayer(false), song.own ? 'mm-key-small mm-key-line' : 'mm-key-small'),
    );
    const side = make('div', 'mm-band-side');
    side.append(list, add);
    const layer = layerById(selected);
    const grid = make('div', 'mm-band');
    grid.append(side, layer ? layerDetail(layer) : make('p', 'mm-hint', 'No layers yet. Add one to start.'));
    return [grid];
  }

  function layerDetail(layer) {
    const detail = make('div', 'mm-detail');
    const role = ROLES[layer.role];
    const family = roleFamily(layer.role);
    const playing = comp.sections.filter((one) => one.play.includes(layer.id)).length;
    const head = make('div', 'mm-detail-head');
    const title = make('h3', 'mm-detail-title', role.name);
    title.style.setProperty('--chip', role.colour);
    head.append(title, make('span', 'mm-detail-note', `plays in ${playing} of ${comp.sections.length} sections`));
    const actions = make('div', 'mm-detail-actions');
    if (family !== 'texture' && !layer.hand) {
      actions.append(key('New notes', `New notes for the ${role.name.toLowerCase()}: a new seed, same instrument and pattern. Clears notes you've changed by hand`, edit(() => {
        layer.seed = newToken(randomRng());
        layer.edits = {};
      }), 'mm-key-small'));
      actions.append(key('Keep notes', `Keep the ${role.name.toLowerCase()}'s notes as your own, to change one by one. They stay put when the chords or the mood change`, edit(() => takeNotes(layer)), 'mm-key-small'));
    }
    actions.append(key('New sound', 'A new instrument and sound for this layer from the mood, same notes', edit(() => dressLayer(song, layer, randomRng(), false)), 'mm-key-small'));
    actions.append(key('Copy', `Another ${role.name.toLowerCase()} just like this one, playing the same notes in the same sections. Give it a new instrument to double the part`, () => {
      if (song.layers.length >= 16) return say("That's 16 layers, the most a song can have.");
      remember();
      const copy = { ...clone(layer), id: freeId(layer.role), solo: false };
      song.layers.splice(song.layers.indexOf(layer) + 1, 0, copy);
      for (const one of song.sections) if (one.play.includes(layer.id)) one.play.push(copy.id);
      selected = copy.id;
      changed();
    }, 'mm-key-small'));
    actions.append(key('Remove', `Take the ${role.name.toLowerCase()} out of the song`, () => {
      remember();
      song.layers = song.layers.filter((one) => one !== layer);
      for (const one of song.sections) one.play = one.play.filter((id) => id !== layer.id);
      selected = song.layers[0]?.id ?? null;
      changed();
    }, 'mm-key-small mm-key-line'));
    head.append(actions);

    const sound = section('Sound', field('Instrument', instrumentSelect(layer), 'Instrument: what plays this layer. Any instrument can play any part'));
    if (recordingsOf(INSTRUMENTS[layer.instrument]).length > 1) {
      sound.append(field('Recording', recordingSelect(layer), 'Recording: this instrument was recorded more than once, by different people on different instruments. Try each, they all have their own character'));
    }
    // what it plays: only your notes (layer.hand), or one of the role's patterns written for it. notes
    // you've added stay either way, on top of a pattern
    if (family !== 'texture') {
      const options = [
        ['hand', 'My notes', 'My notes: it plays only the notes you draw or record, nothing written for you'],
        ...Object.entries(PATTERNS[layer.role]).map(([id, name]) => [id, name, `${name}: a ${role.name.toLowerCase()} part written for you, following the chords, plus any notes you add`]),
      ];
      sound.append(field('Plays', choices(options, () => (layer.hand ? 'hand' : layer.pattern), (value) => edit(() => {
        if (value === 'hand') layer.hand = true;
        else {
          delete layer.hand;
          layer.pattern = value;
        }
      })(), 'Pattern'), 'What this layer plays: your own notes, or a part written for it'));
    }
    if (!layer.hand && usesRate(layer)) sound.append(field('Speed', choices(Object.entries(RATES).map(([id, name]) => [id, name, `${name} notes`]), () => layer.rate, (value) => edit(() => { layer.rate = value; })(), 'Speed'), 'How fast the notes go'));
    if (!layer.hand && layer.role === 'arp') sound.append(slider({ label: 'Range', tip: 'Range: how many octaves the arp climbs', min: 1, max: 3, step: 1, get: () => layer.span, set: (v) => { layer.span = v; }, format: (v) => `${v} octave${v > 1 ? 's' : ''}` }));
    // (on a layer of your own notes, they move with it)
    if (family === 'tonal') {
      sound.append(slider({
        label: 'Octave', tip: layer.hand ? 'Octave: move your notes, and the keyboard, up or down' : 'Octave: move it up or down', min: -2, max: 2, step: 1, get: () => layer.octave,
        set: (v) => {
          if (layer.hand) moveNotes(layer, (v - layer.octave) * 12);
          layer.octave = v;
        },
        format: (v) => (v > 0 ? `+${v}` : `${v}`),
      }));
    }
    if (!layer.hand && family !== 'texture' && layer.role !== 'drone') sound.append(slider({ label: 'Busy', tip: 'Busy: how many notes it plays. Low is sparse and spacious, high is lively', min: 0, max: 1, get: () => layer.density, set: (v) => { layer.density = v; }, format: percent }));

    const mix = section('Mix',
      slider({ label: 'Volume', tip: 'Volume', min: 0, max: 1, get: () => layer.volume, set: (v) => { layer.volume = v; }, format: percent, kind: 'mix' }),
      slider({ label: 'Pan', tip: 'Pan: left or right', min: -1, max: 1, get: () => layer.pan, set: (v) => { layer.pan = v; }, format: (v) => (Math.abs(v) < 0.02 ? 'centre' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'left' : 'right'}`), kind: 'mix' }),
      slider({ label: 'Reverb', tip: 'Reverb: how much of it goes into the room (set the room up in the Room tab)', min: 0, max: 1, get: () => layer.reverb, set: (v) => { layer.reverb = v; }, format: percent, kind: 'mix' }),
      slider({ label: 'Echo', tip: 'Echo: how much of it bounces back', min: 0, max: 1, get: () => layer.echo, set: (v) => { layer.echo = v; }, format: percent, kind: 'mix' }),
    );
    // brightness is a power of two, so the middle of the slider is the instrument as made
    const bright = slider({ label: 'Brightness', tip: 'Brightness: duller to the left, sharper and buzzier to the right', min: -2, max: 2, get: () => Math.log2(layer.tone.bright), set: (v) => { layer.tone.bright = 2 ** v; }, format: (v) => `x${(2 ** v).toFixed(2)}`, kind: 'mix' });
    const tone = section('Tone');
    if (family === 'tonal') {
      tone.append(
        slider({ label: 'Attack', tip: 'Attack: how slowly each note fades in. Long is soft and swelling', min: 0.1, max: 4, get: () => layer.tone.attack, set: (v) => { layer.tone.attack = v; }, format: (v) => `x${v.toFixed(2)}`, kind: 'mix' }),
        slider({ label: 'Release', tip: 'Release: how long each note rings on after it ends', min: 0.1, max: 4, get: () => layer.tone.release, set: (v) => { layer.tone.release = v; }, format: (v) => `x${v.toFixed(2)}`, kind: 'mix' }),
        bright,
        slider({ label: 'Detune', tip: 'Detune: pulls its notes out of tune with each other. A little is warm and wide, a lot is eerie', min: 0, max: 50, step: 0.5, get: () => layer.tone.detune, set: (v) => { layer.tone.detune = v; }, format: (v) => `${v.toFixed(1)} cents`, kind: 'mix' }),
        slider({ label: 'Vibrato', tip: "Vibrato: wobbles the pitch, like a singer's or a violinist's", min: 0, max: 50, step: 0.5, get: () => layer.tone.vibrato, set: (v) => { layer.tone.vibrato = v; }, format: (v) => `${v.toFixed(1)} cents`, kind: 'mix' }),
      );
    } else if (family === 'kit') {
      tone.append(slider({ label: 'Ring', tip: 'Ring: how long each drum rings', min: 0.1, max: 4, get: () => layer.tone.release, set: (v) => { layer.tone.release = v; }, format: (v) => `x${v.toFixed(2)}`, kind: 'mix' }), bright);
    } else tone.append(bright);

    const columns = make('div', 'mm-columns');
    columns.append(sound, make('div'));
    columns.lastChild.append(mix, tone);
    detail.append(head, columns);
    if (family !== 'texture') detail.append(noteEditor(layer));
    return detail;
  }

  // ---------- the note editor ----------

  // one part of one layer as a grid: time across, pitch (or drum) down. the rows that are in the
  // chord playing at that moment are shaded, so it's easy to see which notes will fit. edits are kept
  // per part (layer.edits in music.js), so a change plays every time that part comes round
  function noteEditor(layer) {
    const box = make('div', 'mm-editor');
    editor = { layer, box, draw: () => {} };
    const head = make('div', 'mm-editor-head');
    head.append(make('h3', 'mm-section-title', 'Notes'));
    const parts = PARTS.filter((part) => comp.sections.some((one) => one.part === part && one.play.includes(layer.id)));
    if (!parts.length) {
      box.append(head, make('p', 'mm-hint', "This layer doesn't play in any section. Turn it on in the Arrange tab."));
      return box;
    }
    if (!parts.includes(editPart)) editPart = parts[0];
    head.append(choices(parts.map((part) => [part, `Part ${part}`, `Show part ${part}'s notes`]), () => editPart, (part) => {
      editPart = part;
      editorScroll = 0;
      renderPanel();
    }, 'Part'));
    const changes = layer.edits[editPart];
    if (changes && layer.hand) {
      // a part of your own can be copied to another part (a chorus that starts like the verse), and
      // cleared. copying replaces whatever that part had
      for (const other of parts.filter((one) => one !== editPart)) {
        head.append(key(`Copy to ${other}`, `Copy part ${editPart}'s notes into part ${other}, in place of what's there`, edit(() => { layer.edits[other] = clone(changes); }), 'mm-key-small mm-key-line'));
      }
      head.append(key('Clear', `Take out every note in part ${editPart}`, edit(() => { delete layer.edits[editPart]; }), 'mm-key-small mm-key-line'));
    } else if (changes) {
      head.append(key('Undo my changes', `Put part ${editPart} back to the notes it was written with`, edit(() => { delete layer.edits[editPart]; }), 'mm-key-small mm-key-line'));
    }
    const drums = layer.role === 'drums';
    // the tools: plain notes, slides and vibrato (a drum can't slide, so the drums only get notes).
    // a slide's speed is how much of the note it takes to get there
    const tools = make('div', 'mm-editor-tools');
    if (!drums) {
      tools.append(choices([
        ['note', 'Notes', 'Notes: click to add a note and drag to make it longer, click a note to remove it'],
        ['chord', 'Chords', 'Chords: click to put down the whole chord playing there, gathered round the row you click. Drag to make it longer'],
        ['slide', 'Slides', 'Slides: drag from where a note starts to where it ends up, up or down, and it slides from one pitch to the other (D# up to E, say)'],
        ['shake', 'Vibrato', 'Vibrato: click a note to give it vibrato (or take it off), like a singer on a held note or a guitarist shaking a string. Drag to draw a new note with it'],
        ['swell', 'Swells', 'Swells: click a note to make it grow, click again to make it die away, and again for neither. The way a violinist or a horn player shapes a long note'],
      ], () => tool, (value) => { tool = value; renderPanel(); }, 'Tool'));
      if (tool === 'slide') {
        tools.append(choices([
          ['quick', 'Quick', 'Quick: it slides in a sixteenth, then holds the new pitch, like a flick up to the note'],
          ['half', 'Half way', 'Half way: it slides over the first half of the note, then holds'],
          ['whole', 'The whole note', 'The whole note: it slides the whole time, arriving as the note ends'],
        ], () => slideSpeed, (value) => { slideSpeed = value; renderPanel(); }, 'Slide speed'));
        tools.append(choices([
          [0, 'Straight', 'Straight: the same speed all the way, like a synth\'s glide'],
          [1, 'Smooth', 'Smooth: it eases out of the first note and into the second, like a singer or a trombone'],
          [2, 'Settle', 'Settle: most of the way at once, then easing onto the pitch, like a finger sliding up a fretless neck'],
        ], () => slideShape, (value) => { slideShape = value; renderPanel(); }, 'Slide shape'));
      }
      if (tool === 'shake') {
        tools.append(choices([
          [12, 'Gentle', 'Gentle: a narrow vibrato, like a violinist\'s'],
          [22, 'Wide', 'Wide: a guitarist shaking a held string'],
          [35, 'Very wide', 'Very wide: a big, wobbling vibrato, like an old singer or a whammy bar'],
        ], () => shakeWidth, (value) => { shakeWidth = value; renderPanel(); }, 'Vibrato width'));
      }
      if (tool === 'swell') {
        tools.append(choices([
          [1, 'Grows', 'Grows: new notes you draw start quiet and grow'],
          [-1, 'Dies away', 'Dies away: new notes you draw start full and fade'],
        ], () => swellWay, (value) => { swellWay = value; renderPanel(); }, 'Swell'));
      }
    }
    const HINTS = {
      note: `Click to add a note and drag to make it longer. Click a note to remove it. Shaded rows are in the chord playing there. Click a note name to hear it${drums ? '' : ', or play them on your keyboard (A to L, W E T Y U O P for the black keys)'}.`,
      chord: 'Click to put down the chord playing there, its notes gathered round the row you click, and drag to make it longer. The chords come from the Song tab. Click a note to remove it.',
      slide: 'Drag from a note\'s start to where it should end up: across for how long, up or down for the pitch it slides to. Click a note to remove it.',
      shake: 'Click a note to give it vibrato, or click it again to take it off. Drag on an empty spot to draw a new note with vibrato.',
      swell: 'Click a note to make it grow, again to make it die away, and again to make it plain. Drag on an empty spot to draw a new note that swells. It shows as a wedge, like a hairpin in a score.',
    };
    box.append(head, tools, make('p', 'mm-hint', HINTS[drums ? 'note' : tool]));

    const sec = comp.sections.find((one) => one.part === editPart && one.play.includes(layer.id));
    const grid = comp.step;
    const steps = Math.round(sec.beats / grid);
    const STEP = 15;
    const ROW = 13;
    const notes = comp.notes.filter((note) => note.layer === layer.id && note.gt >= sec.start - 1e-6 && note.gt < sec.end - 1e-6);
    const scalePcs = new Set(SCALES[song.scale].steps.map((n) => (song.key + n) % 12));
    let rows;
    // a rock kit has a seventh drum, its crash
    if (drums) rows = (INSTRUMENTS[layer.instrument]?.slots || KIT_SLOTS.slice(0, 6)).map((_, i) => i).reverse();
    else {
      const center = ROLES[layer.role].center + layer.octave * 12;
      // (a part of your own gets more room: there's nothing written to show where it'll go)
      let low = center - (layer.hand ? 14 : 10);
      let high = center + (layer.hand ? 17 : 12);
      // (and every pitch a note bends through, so a slide's end has a row to be drawn on)
      const pitches = notes.flatMap((note) => [note.midi, ...bendPitches(note)]);
      for (const midi of pitches) {
        low = Math.min(low, midi - 2);
        high = Math.max(high, midi + 2);
      }
      rows = [];
      const present = new Set(pitches);
      for (let midi = Math.min(127, high); midi >= Math.max(0, low); midi--) if (scalePcs.has(midi % 12) || present.has(midi)) rows.push(midi);
    }
    const width = steps * STEP;
    const height = rows.length * ROW;
    const dpr = window.devicePixelRatio || 1;
    const labels = make('canvas', 'mm-editor-labels');
    const scroller = make('div', 'mm-editor-scroll');
    const canvas = make('canvas', 'mm-editor-grid');
    scroller.append(canvas);
    const LABELS = drums ? 66 : 46;
    for (const [one, w] of [[labels, LABELS], [canvas, width]]) {
      one.width = Math.round(w * dpr);
      one.height = Math.round(height * dpr);
      one.style.width = `${w}px`;
      one.style.height = `${height}px`;
    }
    labels.setAttribute('role', 'img');
    labels.setAttribute('aria-label', drums ? 'Drums' : 'Note names');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Part ${editPart}'s notes for the ${ROLES[layer.role].name.toLowerCase()}`);

    const lg = labels.getContext('2d');
    lg.setTransform(dpr, 0, 0, dpr, 0, 0);
    lg.fillStyle = PAPER_DARK;
    lg.fillRect(0, 0, LABELS, height);
    lg.textBaseline = 'middle';
    rows.forEach((row, i) => {
      const home = !drums && row % 12 === song.key;
      lg.fillStyle = home ? INK : INK_SOFT;
      lg.font = `${home ? 700 : 500} 10px Recursive, monospace`;
      lg.fillText(drums ? KIT_SLOTS[row] : noteName(row), 5, i * ROW + ROW / 2 + 0.5);
    });
    labels.addEventListener('pointerdown', (event) => {
      const row = rows[Math.floor((event.clientY - labels.getBoundingClientRect().top) / ROW)];
      if (row !== undefined) player.audition(song, layer, [row], 1);
    });

    const rowOf = (midi) => rows.indexOf(midi);
    // where a pitch sits down the grid, between two rows if it isn't one of them (a slide passes
    // through notes that aren't in the scale)
    const yOf = (pitch) => {
      for (let i = 0; i < rows.length - 1; i++) {
        if (pitch <= rows[i] && pitch >= rows[i + 1]) return (i + (rows[i] - pitch) / (rows[i] - rows[i + 1])) * ROW + ROW / 2;
      }
      return pitch > rows[0] ? ROW / 2 : (rows.length - 0.5) * ROW;
    };
    const xOf = (t) => ((t - sec.start) / grid) * STEP;
    let drag = null;
    const colour = ROLES[layer.role].colour;
    const draw = () => {
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = PAPER;
      g.fillRect(0, 0, width, height);
      if (!drums) {
        rows.forEach((row, i) => {
          if (row % 12 === song.key) {
            g.fillStyle = 'rgba(44, 39, 33, 0.05)';
            g.fillRect(0, i * ROW, width, ROW);
          }
        });
        g.fillStyle = 'rgba(126, 108, 196, 0.13)';
        for (const chord of sec.chords) {
          const x0 = xOf(chord.t);
          const x1 = xOf(chord.t + chord.dur);
          rows.forEach((row, i) => { if (chord.pcs.has(row % 12)) g.fillRect(x0, i * ROW, x1 - x0, ROW); });
        }
      }
      for (let s = 0; s <= steps; s++) {
        const beat = s * grid;
        const bar = Math.abs(beat / comp.bpb - Math.round(beat / comp.bpb)) < 1e-6;
        const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
        g.fillStyle = bar ? 'rgba(44, 39, 33, 0.4)' : onBeat ? 'rgba(44, 39, 33, 0.16)' : 'rgba(44, 39, 33, 0.06)';
        g.fillRect(s * STEP, 0, 1, height);
      }
      for (let i = 1; i < rows.length; i++) {
        g.fillStyle = 'rgba(44, 39, 33, 0.06)';
        g.fillRect(0, i * ROW, width, 1);
      }
      // a note: its block on its starting pitch, outlined if you added it, then the line its pitch
      // follows if it slides or bends, and a wiggle along its top if it has vibrato
      const block = (note) => {
        const i = rowOf(note.midi);
        if (i < 0) return;
        const dur = drums ? grid : note.dur;
        const x = xOf(note.gt);
        const w = Math.max(4, (dur / grid) * STEP - 1);
        g.fillStyle = colour;
        g.fillRect(x + 1, i * ROW + 2, w - 1, ROW - 3);
        if (note.added) {
          g.strokeStyle = INK;
          g.lineWidth = 1.5;
          g.strokeRect(x + 1.75, i * ROW + 2.75, w - 2.5, ROW - 4.5);
        }
        if (note.bend) {
          g.strokeStyle = INK;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 1, yOf(note.midi + note.bend[0][1]));
          for (const [at, semitones] of note.bend) g.lineTo(xOf(note.gt + Math.min(at, dur)), yOf(note.midi + semitones));
          g.lineTo(x + w, yOf(note.midi + note.bend[note.bend.length - 1][1]));
          g.stroke();
        }
        if (note.shake) {
          g.strokeStyle = INK;
          g.lineWidth = 1;
          g.beginPath();
          for (let dx = 2, up = true; dx < w - 1; dx += 3, up = !up) g[dx === 2 ? 'moveTo' : 'lineTo'](x + dx, i * ROW + (up ? 1 : 4));
          g.stroke();
        }
        // a swell is a hairpin, the way scores write one: opening out as it grows, closing as it dies
        if (note.swell) {
          const [narrow, wide] = note.swell > 0 ? [x + 3, x + w - 2] : [x + w - 2, x + 3];
          g.strokeStyle = INK;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(wide, i * ROW + 3.5);
          g.lineTo(narrow, i * ROW + ROW / 2);
          g.lineTo(wide, i * ROW + ROW - 3.5);
          g.stroke();
        }
      };
      for (const note of notes) block(note);
      if (drag) dragNotes(drag).forEach(block);
      const at = player.playing ? player.position() : null;
      if (at !== null && at >= sec.start && at < sec.end) {
        g.fillStyle = INK;
        g.fillRect(xOf(at) - 1, 0, 2, height);
      }
    };

    // what's being drawn, as notes: its start and length from the drag, a slide to where the pointer
    // is if it's the slide tool (taking as long as the slide speed says), vibrato if it's the vibrato
    // tool, and with the chord tool, the chord playing there voiced round the row (voiceChord)
    const dragNotes = (one) => {
      const length = drums ? grid : (one.to - one.from + 1) * grid;
      const at = sec.start + one.from * grid;
      const t = +(one.from * grid).toFixed(3);
      if (!drums && tool === 'chord') {
        const chord = sec.chords.find((c) => at < c.t + c.dur - 1e-6) || sec.chords[sec.chords.length - 1];
        return voiceChord(chord.root, chord.tones, one.row, null).map((midi) => ({ gt: at, dur: length, midi, added: true, entry: packEdit({ t, midi, dur: length }) }));
      }
      const note = { gt: at, dur: length, midi: one.row, added: true };
      const drawn = { t, midi: one.row, dur: length };
      if (!drums && tool === 'slide' && one.toRow !== one.row) {
        const glide = +{ quick: Math.min(grid, length), half: length / 2, whole: length }[slideSpeed].toFixed(3);
        note.bend = [[0, 0], [glide, one.toRow - one.row, slideShape]];
        Object.assign(drawn, { to: one.toRow, glide, curve: slideShape });
      } else if (!drums && tool === 'shake') {
        note.shake = shakeWidth;
        drawn.shake = shakeWidth;
      } else if (!drums && tool === 'swell') {
        note.swell = swellWay;
        drawn.swell = swellWay;
      }
      note.entry = packEdit(drawn);
      return [note];
    };

    draw();
    editor.draw = draw;

    const place = (event) => {
      const rect = canvas.getBoundingClientRect();
      const stepAt = Math.max(0, Math.min(steps - 1, Math.floor((event.clientX - rect.left) / STEP)));
      const row = rows[Math.max(0, Math.min(rows.length - 1, Math.floor((event.clientY - rect.top) / ROW)))];
      return { stepAt, row };
    };
    canvas.addEventListener('pointerdown', (event) => {
      const { stepAt, row } = place(event);
      const t = sec.start + stepAt * grid;
      const hit = notes.find((note) => note.midi === row && t >= note.gt - 1e-6 && t < note.gt + (drums ? grid : note.dur) - 1e-6);
      remember();
      const changes = (layer.edits[editPart] ||= { add: [], remove: [] });
      if (hit) {
        const relative = +(hit.gt - sec.start).toFixed(3);
        const mine = hit.added && changes.add.find(([at, midi]) => Math.abs(at - relative) < 1e-3 && midi === hit.midi);
        if ((tool === 'shake' || tool === 'swell') && !drums) {
          // vibrato on or off, or the swell going round (growing, dying away, neither). a note you
          // added just changes; a written one becomes one of yours: it's taken out (by the pitch it was
          // written at, the same as removing it) and the same note's added back, changed
          const change = (one) => {
            if (tool === 'shake') one.shake = one.shake ? 0 : shakeWidth;
            else one.swell = one.swell > 0 ? -1 : one.swell < 0 ? 0 : 1;
          };
          if (mine) {
            const one = unpackEdit(mine);
            change(one);
            changes.add[changes.add.indexOf(mine)] = packEdit(one);
          } else if (!hit.added) {
            changes.remove.push(editKey(relative, hit.written ?? hit.midi));
            const one = { t: relative, midi: hit.midi, dur: +hit.dur.toFixed(3), shake: hit.shake || 0, swell: hit.swell || 0 };
            change(one);
            changes.add.push(packEdit(one));
          }
          changed(false);
          return;
        }
        if (mine) changes.add = changes.add.filter((one) => one !== mine);
        // a note the band moved (listen in music.js) is still known by the pitch it was written at
        else changes.remove.push(editKey(relative, hit.written ?? hit.midi));
        changed(false);
        return;
      }
      drag = { from: stepAt, to: stepAt, row, toRow: row };
      canvas.setPointerCapture(event.pointerId);
      draw();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const at = place(event);
      drag.to = Math.max(drag.from, at.stepAt);
      drag.toRow = at.row;
      draw();
    });
    canvas.addEventListener('pointerup', () => {
      if (!drag) return;
      const changes = (layer.edits[editPart] ||= { add: [], remove: [] });
      const drawn = dragNotes(drag);
      for (const note of drawn) {
        changes.add.push(note.entry);
        // a note added where a written one had been removed shouldn't stay removed
        changes.remove = changes.remove.filter((one) => one !== editKey(note.entry[0], note.midi));
      }
      // hear it as it'll play, slide and all
      const [note] = drawn;
      player.audition(song, layer, drawn.map((one) => one.midi), drums ? 1 : note.dur, { bend: note.bend, shake: note.shake, swell: note.swell });
      drag = null;
      changed(false);
    });
    scroller.addEventListener('scroll', () => { editorScroll = scroller.scrollLeft; });
    requestAnimationFrame(() => { scroller.scrollLeft = editorScroll; });

    const body = make('div', 'mm-editor-body');
    body.append(labels, scroller);
    box.append(body);
    return box;
  }

  // ---------- the arrange tab ----------

  function arrangePanel() {
    const wrap = make('div', 'mm-arrange-wrap');
    const table = make('table', 'mm-arrange');
    const headRow = make('tr');
    const corner = make('th', 'mm-arrange-corner', 'Sections');
    corner.scope = 'col';
    headRow.append(corner);
    song.sections.forEach((one, index) => {
      const cell = make('th');
      cell.scope = 'col';
      const name = make('input', 'mm-input mm-section-name');
      Object.assign(name, { type: 'text', value: one.name, maxLength: 20, spellcheck: false });
      name.setAttribute('aria-label', `Section ${index + 1}'s name`);
      name.addEventListener('focus', remember);
      name.addEventListener('input', () => {
        one.name = name.value.trim() || 'Part';
        scoreDirty = true;
        comp.sections[index].name = one.name;
        keepDraft();
      });
      const part = make('select', 'mm-select mm-select-small');
      part.setAttribute('aria-label', `Section ${index + 1}'s chords`);
      part.dataset.tip = "Which part's chords this section plays";
      for (const letter of PARTS) part.append(new Option(`Part ${letter}`, letter, false, letter === one.part));
      part.addEventListener('change', edit(() => { one.part = part.value; }));
      // who takes a solo here, if anyone (section.lead, solo() in music.js)
      const lead = make('select', 'mm-select mm-select-small');
      lead.setAttribute('aria-label', `Section ${index + 1}'s solo`);
      lead.dataset.tip = 'A solo: this layer plays a long new line here, one that never repeats, instead of its usual part';
      lead.append(new Option('No solo', '', false, !one.lead));
      for (const layer of song.layers.filter((one) => SOLOISTS[one.role])) lead.append(new Option(`${ROLES[layer.role].name} solo`, layer.id, false, one.lead === layer.id));
      lead.addEventListener('change', edit(() => {
        if (!lead.value) return delete one.lead;
        one.lead = lead.value;
        if (!one.play.includes(lead.value)) one.play.push(lead.value);
      }));
      const bars = make('div', 'mm-bars');
      bars.dataset.tip = 'How many bars long it is';
      bars.append(
        key('−', '', edit(() => { one.bars = Math.max(1, one.bars - 1); }), 'mm-key-small mm-key-square'),
        make('span', '', `${one.bars} bars`),
        key('+', '', edit(() => { one.bars = Math.min(64, one.bars + 1); }), 'mm-key-small mm-key-square'),
      );
      bars.firstChild.setAttribute('aria-label', 'One bar shorter');
      bars.lastChild.setAttribute('aria-label', 'One bar longer');
      // how hard it's played (section.energy, feel() in music.js): the band plays a quiet section softer
      // and swells up into a louder one
      const loudness = make('div', 'mm-slider mm-section-loud');
      const loud = make('input');
      loudness.append(loud);
      const fill = () => loud.style.setProperty('--fill', `${loud.value * 100}%`);
      Object.assign(loud, { type: 'range', min: 0, max: 1, step: 0.05, value: one.energy ?? 0.75 });
      loud.setAttribute('aria-label', `How hard ${one.name} is played`);
      loud.dataset.tip = 'Loudness: how hard the band plays here. Softer for an intro or a break, harder for a chorus. It swells up into a louder section';
      let moving = false;
      loud.addEventListener('input', () => {
        if (!moving) remember();
        moving = true;
        one.energy = +loud.value;
        fill();
        soon();
      });
      loud.addEventListener('change', () => { moving = false; });
      fill();
      const tools = make('div', 'mm-section-tools');
      const move = (by) => edit(() => {
        const [taken] = song.sections.splice(index, 1);
        song.sections.splice(index + by, 0, taken);
      });
      const tool = (label, tip, onClick, disabled) => {
        const button = key(label, tip, onClick, 'mm-key-small mm-key-square mm-key-line');
        button.setAttribute('aria-label', tip);
        button.disabled = disabled;
        return button;
      };
      tools.append(
        tool('▶', 'Play from here', () => {
          startBeat = comp.sections[index].start;
          player.play(startBeat);
          renderTransport();
        }, false),
        tool('←', 'Move it earlier', move(-1), index === 0),
        tool('→', 'Move it later', move(1), index === song.sections.length - 1),
        tool('×', 'Remove it', edit(() => song.sections.splice(index, 1)), song.sections.length === 1),
      );
      cell.append(name, part, lead, bars, loudness, tools);
      headRow.append(cell);
    });
    const thead = make('thead');
    thead.append(headRow);
    const tbody = make('tbody');
    for (const layer of song.layers) {
      const row = make('tr');
      const label = make('th', 'mm-arrange-layer');
      label.scope = 'row';
      const chip = make('i', 'mm-layer-chip');
      chip.style.background = ROLES[layer.role].colour;
      label.append(chip, make('span', '', ROLES[layer.role].name));
      row.append(label);
      for (const one of song.sections) {
        const cell = make('td');
        const on = one.play.includes(layer.id);
        const toggle = make('button', 'mm-cell');
        toggle.type = 'button';
        toggle.style.setProperty('--chip', ROLES[layer.role].colour);
        toggle.setAttribute('aria-pressed', on);
        toggle.setAttribute('aria-label', `${ROLES[layer.role].name} in ${one.name}`);
        toggle.dataset.tip = `${on ? 'Playing' : 'Not playing'}: click to turn the ${ROLES[layer.role].name.toLowerCase()} ${on ? 'off' : 'on'} in ${one.name}`;
        toggle.addEventListener('click', edit(() => {
          one.play = on ? one.play.filter((id) => id !== layer.id) : [...one.play, layer.id];
        }));
        cell.append(toggle);
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(thead, tbody);
    wrap.append(table);
    const addSection = key('Add a section', 'A new section at the end, a copy of the last one', edit(() => {
      if (song.sections.length >= 64) return;
      const last = song.sections[song.sections.length - 1];
      song.sections.push({ ...last, name: last.name, play: [...last.play] });
    }), 'mm-key-small');
    const foot = make('div', 'mm-arrange-foot');
    foot.append(addSection, make('p', 'mm-hint', 'Each section plays one part\'s chords (set them in the Song tab). Sections of the same part play the same tune, a little changed on later times round, unless one of them has a solo. For a game loop, try leaving the quiet intro and outro out.'));
    return [wrap, foot];
  }

  // ---------- the room tab ----------

  function roomPanel() {
    const fx = song.fx;
    const space = (key, label, tip, format = percent) => slider({ label, tip, min: 0, max: 1, get: () => fx[key], set: (v) => { fx[key] = v; }, format, kind: 'mix' });
    const times = ECHO_TIMES.map((beats) => [beats, beats === 0.5 ? '½ beat' : beats === 0.75 ? '¾ beat' : beats === 1.5 ? '1½ beats' : `${beats} beat${beats > 1 ? 's' : ''}`, `The echo comes back ${beats} beat${beats === 1 ? '' : 's'} later`]);
    const columns = make('div', 'mm-columns');
    columns.append(
      section('Reverb',
        space('reverb', 'Amount', 'Reverb: how much of the room you hear'),
        space('size', 'Room size', 'Room size: a small room to a huge hall or cave. Big rooms ring for seconds'),
        space('tone', 'Tone', 'Tone: a dark, soft room on the left, a bright, glassy one on the right'),
      ),
      section('Echo',
        space('echo', 'Amount', 'Echo: how loud the echoes are'),
        field('Time', choices(times, () => fx.echoTime, (value) => { remember(); fx.echoTime = value; mixed(); renderPanel(); }, 'Echo time'), 'How long until the echo comes back, in beats so it stays in time'),
        space('echoRepeats', 'Repeats', 'Repeats: how many times it echoes before it fades'),
      ),
      section('Tape and amp',
        space('warmth', 'Warmth', 'Warmth: rolls off the high end, like an old radio or a muffled room'),
        space('wobble', 'Wobble', 'Wobble: the pitch wavers like a worn cassette'),
        space('drive', 'Drive', 'Drive: grit and crunch, like pushing an amp too hard'),
        space('volume', 'Volume', 'Volume: the whole song'),
      ),
    );
    return [columns];
  }

  // ---------- library and export ----------

  const status = $('#mmStatus');
  function renderLibrary() {
    const list = $('#mmLibrary');
    const entries = Object.entries(readLibrary()).filter(([, entry]) => entry && entry.song).sort((a, b) => (b[1].saved || 0) - (a[1].saved || 0));
    if (!entries.length) {
      list.replaceChildren(make('li', 'mm-library-empty', 'Nothing saved yet. Press Save on a song you like.'));
      return;
    }
    list.replaceChildren(...entries.map(([name, entry]) => {
      const saved = cleanSong(entry.song);
      const item = make('li', name === song.name ? 'is-open' : '');
      const chip = make('i', 'mm-library-chip');
      chip.style.background = MOODS[saved.mood].colour;
      const openKey = make('button', 'mm-library-name');
      openKey.type = 'button';
      openKey.append(make('span', '', name), make('small', '', `${saved.own ? 'Your own track' : `${MOODS[saved.mood].name}${saved.mods ? ` (${saved.mods.map(modName).join(', ')})` : ''} ${STYLES[saved.style].toLowerCase()}`} ·${NOTE_NAMES[saved.key]} ${SCALES[saved.scale].name.toLowerCase()} · ${saved.tempo} bpm`));
      openKey.addEventListener('click', () => {
        remember();
        open(saved);
        say(`Opened "${name}".`);
      });
      const forget = make('button', 'mm-library-forget', 'Forget');
      forget.type = 'button';
      forget.addEventListener('click', () => {
        const library = readLibrary();
        delete library[name];
        writeLibrary(library);
        renderLibrary();
      });
      item.append(chip, openKey, forget);
      return item;
    }));
  }

  function download(blob, name) {
    const link = make('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }

  const wavKeys = [$('#mmWav'), $('#mmWavLoop')];
  async function exportWav(loop) {
    for (const button of wavKeys) button.disabled = true;
    status.textContent = 'Recording... a few seconds for a long song.';
    try {
      const blob = await renderSong(song, comp, loop);
      download(blob, `${fileName(song.name)}${loop ? '-loop' : ''}.wav`);
      status.textContent = `Downloaded ${fileName(song.name)}${loop ? '-loop' : ''}.wav.`;
    } catch (error) {
      status.textContent = "Couldn't record it in this browser.";
      console.error(error);
    }
    for (const button of wavKeys) button.disabled = false;
  }
  $('#mmWav').addEventListener('click', () => exportWav(false));
  $('#mmWavLoop').addEventListener('click', () => exportWav(true));
  $('#mmFile').addEventListener('click', () => {
    download(new Blob([`${JSON.stringify(song, null, 2)}\n`], { type: 'application/json' }), `${fileName(song.name)}.json`);
    status.textContent = `Downloaded ${fileName(song.name)}.json.`;
  });
  $('#mmOpen').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      remember();
      open(data);
      status.textContent = `Opened ${file.name}.`;
    } catch {
      status.textContent = `${file.name} isn't a song file.`;
    }
  });

  // links carry the song as base64 json after #song=
  const toLink = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromLink = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
  $('#mmLink').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#song=${toLink(JSON.stringify(song))}`;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied. Anyone who opens it hears this song.';
    } catch {
      status.textContent = url;
    }
  });

  // ---------- playing from the keyboard ----------

  // the computer keyboard as a piano for the open layer, laid out the way most music software does it:
  // the middle row (a s d f...) is the white keys from a C, the row above the black keys between them,
  // and z and x move it all down or up an octave. a kit plays its drums on a s d f... in order. with
  // Record on and the song playing, each note's written into the layer where it was played
  const PIANO = 'awsedftgyhujkolp;';
  const DRUM_KEYS = 'asdfghjkl';
  let keyOctave = 0;
  const held = {};
  function keyPitch(layer, letter) {
    if (layer.role === 'drums') {
      const slot = DRUM_KEYS.indexOf(letter);
      return slot < (INSTRUMENTS[layer.instrument].slots?.length || 6) ? slot : -1;
    }
    const step = PIANO.indexOf(letter);
    if (step < 0) return -1;
    const center = (INSTRUMENTS[layer.instrument].home ?? ROLES[layer.role].center) + layer.octave * 12;
    return Math.min(127, Math.max(0, Math.floor(center / 12) * 12 + keyOctave * 12 + step));
  }
  function pressKey(event) {
    const layer = layerById(selected);
    const letter = event.key.toLowerCase();
    if (!layer || roleFamily(layer.role) === 'texture') return;
    if ((letter === 'z' || letter === 'x') && layer.role !== 'drums') {
      keyOctave = Math.max(-3, Math.min(3, keyOctave + (letter === 'x' ? 1 : -1)));
      say(`The keyboard starts on ${noteName(keyPitch(layer, 'a'))} now.`);
      return;
    }
    const midi = keyPitch(layer, letter);
    if (midi < 0 || held[letter]) return;
    event.preventDefault();
    // a held note rings until the key's let go (16 beats at most). a drum just hits
    const drum = layer.role === 'drums';
    held[letter] = { layer, midi, drum, channel: player.audition(song, layer, [midi], drum ? 1 : 16), from: recording && player.playing ? player.position() : null };
  }
  function releaseKey(letter) {
    const press = held[letter];
    if (!press) return;
    delete held[letter];
    if (!press.drum) closeChannel(press.channel, player.ctx.currentTime);
    if (press.from !== null && player.playing) recordNote(press.layer, press.midi, press.from, player.position());
  }
  document.addEventListener('keyup', (event) => releaseKey(event.key.toLowerCase()));
  window.addEventListener('blur', () => Object.keys(held).forEach(releaseKey));

  // a note played in while recording, written into the part of the section it was played in, lined up
  // on the grid. a note already there at the same time and pitch is replaced, so going round the loop
  // playing the same beat doesn't pile up copies
  function recordNote(layer, midi, from, to) {
    if (!layerById(layer.id)) return;
    const grid = comp.step;
    const at = (Math.round(from / grid) * grid) % comp.beats;
    const sec = comp.sections.find((one) => at < one.end - 1e-6) || comp.sections[comp.sections.length - 1];
    if (!sec.play.includes(layer.id)) return say(`The ${ROLES[layer.role].name.toLowerCase()} isn't playing in ${sec.name}, so that wasn't kept. Turn it on there in Arrange.`);
    // (a note held over the end of the loop finishes at the start)
    const length = to >= from ? to - from : to + comp.beats - from;
    const t = +(at - sec.start).toFixed(3);
    const dur = layer.role === 'drums' ? grid : Math.min(sec.beats - t, Math.max(grid, Math.round(length / grid) * grid));
    remember();
    const changes = (layer.edits[sec.part] ||= { add: [], remove: [] });
    changes.add = changes.add.filter(([start, pitch]) => Math.abs(start - t) > 1e-3 || pitch !== midi);
    changes.add.push(packEdit({ t, midi, dur: +dur.toFixed(3) }));
    changes.remove = changes.remove.filter((one) => one !== editKey(t, midi));
    changed(false);
  }

  // ---------- keys and the frame loop ----------

  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest?.('input, select, textarea');
    if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && event.key !== ' ') pressKey(event);
    if (event.key === ' ' && !typing && !event.target.closest?.('button')) {
      event.preventDefault();
      togglePlay();
    }
    if ((event.ctrlKey || event.metaKey) && !typing) {
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        step(undo, redo);
      } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
        event.preventDefault();
        step(redo, undo);
      }
    }
  });

  function frame() {
    if (needCompose) changed(false);
    if (needMix) {
      needMix = false;
      player.load(song, comp);
      scoreDirty = true;
      keepDraft();
    }
    if (!player.playing && playKey.classList.contains('is-playing')) renderTransport();
    drawScore();
    renderReadout();
    if (editor && player.playing) editor.draw();
    requestAnimationFrame(frame);
  }

  // ---------- start ----------

  function firstSong() {
    if (location.hash.startsWith('#song=')) {
      try {
        const linked = cleanSong(JSON.parse(fromLink(location.hash.slice(6))));
        history.replaceState(null, '', location.pathname);
        return linked;
      } catch { /* a broken link: start fresh instead */ }
    }
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft) return cleanSong(draft);
    } catch { /* nothing kept */ }
    return generateSong('calm', 'ambient', newSeed(randomRng()));
  }
  open(firstSong());
  renderLibrary();
  showTip();
  requestAnimationFrame(frame);
})();
