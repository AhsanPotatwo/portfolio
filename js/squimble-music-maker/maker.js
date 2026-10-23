// squimble music maker: the page. music.js writes the songs and synth.js plays them, so squimble quest
// can use those two without this file. this is the controls:
//
//   song        the song being edited (cleanSong()'s shape). every control changes it, then changed()
//               composes it again and the player carries on mid song with the new notes
//   comp        composeSong(song): the notes, sections and chords the score and editor draw
//   undo, redo  the song as json before each change
//
// sliders ask for a compose (soon()) and frame() does it at most once a frame. sliders that only change
// the sound (volume, reverb...) skip composing (mixed()).
//
// the open song is kept as a draft so a reload doesn't lose it. saved songs are in library.js.
// New track opens blankSong(), whose layers play only notes drawn or played in (layer.hand). on a track
// of your own (song.own) moods, styles and modifiers only change how written parts play.

(() => {
  // an iphone on ios 15 (safari before 16) has no roundRect on a canvas, and the learn tab's drawing
  // stopped at the first one. only ever called with one radius here
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      this.moveTo(x + k, y);
      this.arcTo(x + w, y, x + w, y + h, k);
      this.arcTo(x + w, y + h, x, y + h, k);
      this.arcTo(x, y + h, x, y, k);
      this.arcTo(x, y, x + w, y, k);
      this.closePath();
    };
  }
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
  // the library song being worked on: its id and the song as saved, to tell if it's changed (null for a
  // song not in the library). frozen: that save's notes, played if the composer ever writes different ones
  let working = null;
  let frozen = null;
  let asSaved = false;
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
  // the note editor's tool, a drawn slide's speed and shape (CURVES in synth.js), a vibrato's width in
  // cents, and which way a drawn swell goes (1 growing, -1 dying away)
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
    // a save opened as saved plays its saved notes if the composer no longer writes them (kept/ is there
    // so it never should, but if it does the song isn't lost)
    asSaved = false;
    if (frozen && JSON.stringify(song) !== frozen.json) frozen = null;
    if (frozen && notesPrint(comp.notes) === frozen.print) frozen = null;
    if (frozen) {
      comp.notes = JSON.parse(frozen.text);
      asSaved = true;
    }
    if (startBeat >= comp.beats) startBeat = 0;
    load();
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
    player.restart();
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

  // moves a layer's hand added notes up or down (a new key or octave). a kit's notes are drums, so they stay
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
  // chords or mood change. each part's notes come from the first section that plays it. ornaments are
  // left off but plain slides, and each note keeps its strength and palm mute
  function takeNotes(layer) {
    if (layer.hand || roleFamily(layer.role) === 'texture') return;
    layer.edits = {};
    for (const part of PARTS) {
      // (a section in the song's own key if there is one: lifted notes are taken back down, as they'll be
      // lifted again where they play)
      const playing = comp.sections.filter((one) => one.part === part && one.play.includes(layer.id) && one.lead !== layer.id);
      const sec = playing.find((one) => !one.lift) || playing[0];
      if (!sec) continue;
      const add = comp.notes.filter((note) => note.layer === layer.id && note.gt >= sec.start - 1e-6 && note.gt < sec.end - 1e-6).map((note) => {
        const slide = note.bend?.length === 2 && note.bend[0][0] === 0 && note.bend[0][1] === 0 ? note.bend[1] : null;
        return packEdit({
          t: +(note.gt - sec.start).toFixed(3), midi: note.midi - (sec.lift || 0), dur: +note.dur.toFixed(3),
          ...(slide ? { to: note.midi - (sec.lift || 0) + slide[1], glide: +slide[0].toFixed(3), curve: slide[2] || 0 } : {}),
          shake: Math.round(note.shake || 0), swell: note.swell || 0, vel: Math.round(note.vel * 100) / 100, mute: note.mute ? 1 : 0,
        });
      });
      if (add.length) layer.edits[part] = { add, remove: [] };
    }
    layer.hand = true;
  }

  // ---------- browser storage ----------

  // the song as it is after every change, so closing the tab loses nothing, and which save it's from
  const DRAFT_KEY = 'squimble-music-draft';
  const WORKING_KEY = 'squimble-music-working';
  const BACKED_UP_KEY = 'squimble-music-backed-up';
  const keepDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(song));
      localStorage.setItem(WORKING_KEY, working ? working.id : '');
    } catch { /* storage off, that's fine */ }
  };
  const library = new SongLibrary();

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
    renderSaveState();
  });
  // a new seed, song, blank track or link isn't the save that was open, so Save makes a new one
  const detach = () => { working = null; frozen = null; };
  const useSeed = () => {
    const seed = seedField.value.trim().slice(0, 60);
    if (!seed || seed === song.seed) return;
    remember();
    detach();
    open(generateSong(song.mood, song.style, seed, song.mods, song.flavour));
    say(`"${seed}" in ${MOODS[song.mood].name.toLowerCase()}.`);
  };
  seedField.addEventListener('change', useSeed);
  seedField.addEventListener('keydown', (event) => { if (event.key === 'Enter') useSeed(); });

  $('#mmNew').addEventListener('click', () => {
    remember();
    detach();
    open(generateSong(song.mood, song.style, newSeed(randomRng()), song.mods, song.flavour));
  });
  $('#mmBlank').addEventListener('click', () => {
    remember();
    detach();
    open(blankSong());
    setTab('layers');
    say('A blank track. Draw notes for the melody below, or turn on Record and play them in on your keyboard.');
  });
  $('#mmUndo').addEventListener('click', () => step(undo, redo));
  $('#mmRedo').addEventListener('click', () => step(redo, undo));
  // Save: over the open save (the one before goes in its history), or a new one. Save copy: always a new
  // one. a name another song has gets a number
  let saving = false;
  async function saveSong(copy) {
    if (saving) return;
    if (needCompose) changed(false);
    if (working && !copy && JSON.stringify(song) === working.json) {
      say(`"${song.name}" is saved. Nothing's changed since.`);
      return;
    }
    saving = true;
    const entry = await library.save(song, comp.notes, copy ? null : working?.id);
    saving = false;
    if (!entry) {
      say("Couldn't save: this browser isn't letting the page keep anything. Download a backup or the song file instead.");
      return;
    }
    const renamed = entry.name !== song.name;
    const over = !copy && working?.id === entry.id;
    song.name = entry.name;
    working = { id: entry.id, json: JSON.stringify(song) };
    frozen = null;
    keepDraft();
    renderTop();
    renderLibrary();
    if (copy) say(`Saved a copy as "${entry.name}". The song you opened is as it was.`);
    else if (renamed) say(`Saved as "${entry.name}", since another song in your library has that name.`);
    else say(over ? `Saved "${entry.name}". The save before is in its history.` : `Saved "${entry.name}" to your library.`);
  }
  $('#mmSave').addEventListener('click', () => saveSong(false));
  $('#mmSaveCopy').addEventListener('click', () => saveSong(true));
  // what Save will do, on the key: save a new song, save changes over the open one, or nothing to save
  function renderSaveState() {
    const entry = working && library.get(working.id);
    if (working && library.ready && (!entry || entry.binned)) working = null;
    const saveKey = $('#mmSave');
    const name = entry?.name || song.name;
    saveKey.textContent = !working ? 'Save' : JSON.stringify(song) === working.json ? 'Saved' : 'Save changes';
    saveKey.dataset.tip = working
      ? `Save over "${name}" in your library. The save before is kept in its history, so you can always go back`
      : 'Save it to your library below, kept in this browser. Back the library up to keep a copy as a file';
    $('#mmSaveCopy').hidden = !working;
    // (the library says which song's open and whether it's changed: drawn again when that does)
    if (saveKey.dataset.state !== `${working?.id}:${saveKey.textContent}`) {
      saveKey.dataset.state = `${working?.id}:${saveKey.textContent}`;
      if (library.ready) renderLibrary();
    }
  }

  // the moods a row at a time (MOOD_GROUPS), so they fit on a phone, opening on the song's mood's row
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
  // a fight, a loop or a cutscene keeps its style (and the modifiers stay) when the mood changes;
  // otherwise a mood brings the style it was made for. on a track of your own, a mood, style or modifier
  // only changes how its written parts play (retune), never writing a new song over it
  const keeps = (style) => LOOPS[style] || style === 'cutscene';
  const retune = (change) => {
    remember();
    change();
    changed();
  };
  // (a mood opens in its plain flavour: a flavour belongs to its own mood)
  for (const [id, mood] of Object.entries(MOODS)) {
    const button = key(mood.name, '', () => {
      if (song.own) return retune(() => { song.mood = id; delete song.flavour; });
      remember();
      open(generateSong(id, keeps(song.style) ? song.style : mood.style, song.seed, song.mods));
    }, 'mm-mood');
    button.dataset.mood = id;
    button.style.setProperty('--c', mood.colour);
    button.style.setProperty('--c-ink', inkOn(mood.colour));
    moodKeys.append(button);
  }
  // the modifiers (MODIFIERS in music.js), a key each, lit while on. turning one on turns its opposite
  // off, and the song's written again from the same seed, so adding fast gives the same song, faster
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
        open(generateSong(song.mood, song.style, song.seed, next, song.flavour));
      }
      const words = (song.mods || []).map(modName);
      say(words.length ? `${MOODS[song.mood].name}, ${words.join(', ')}.` : `Just ${MOODS[song.mood].name.toLowerCase()}.`);
    }, 'mm-key-small mm-key-line mm-mod');
    button.dataset.mod = id;
    modKeys.append(button);
  }
  // the song's mood in a sentence, and a key per flavour (FLAVOURS in music.js), the first the plain mood.
  // a flavour brings the style it was made for, like a mood, and is written from the same seed
  const kindKeys = $('#mmKinds');
  let shownKinds = '';
  const kindNow = () => song.flavour || plainFlavour(song.mood);
  function renderKinds() {
    const now = `${song.mood}|${kindNow()}`;
    if (shownKinds === now) return;
    shownKinds = now;
    const mood = MOODS[song.mood];
    const { about, kinds } = FLAVOURS[song.mood];
    const name = make('b', '', mood.name);
    $('#mmAbout').replaceChildren(name, ` ${about}`);
    $('#mmKindTip').textContent = kinds[kindNow()].tip;
    kindKeys.replaceChildren(...Object.entries(kinds).map(([id, kind]) => {
      const button = key(kind.name, kind.tip, () => {
        if (id === kindNow()) return;
        const flavour = id === plainFlavour(song.mood) ? undefined : id;
        if (song.own) {
          retune(() => {
            if (flavour) song.flavour = flavour;
            else delete song.flavour;
          });
        } else {
          remember();
          open(generateSong(song.mood, keeps(song.style) ? song.style : kind.style || mood.style, song.seed, song.mods, flavour));
        }
        say(`${mood.name}: ${kind.name.toLowerCase()}.`);
      }, 'mm-key-small mm-kind');
      button.setAttribute('aria-pressed', id === kindNow());
      return button;
    }));
  }
  for (const button of document.querySelectorAll('[data-style]')) {
    button.addEventListener('click', () => {
      if (song.style === button.dataset.style) return;
      if (song.own) return retune(() => { song.style = button.dataset.style; });
      remember();
      open(generateSong(song.mood, button.dataset.style, song.seed, song.mods, song.flavour));
    });
  }

  const REMIXES = [
    ['chords', 'Chords', 'New chord progressions for every part. The tunes follow the new chords'],
    ['melodies', 'Melodies', 'New tunes and rhythms for every layer, with the same chords and instruments'],
    ['band', 'Instruments', 'A new instrument and sound for every layer, playing the same notes'],
    ['arrangement', 'Arrangement', 'A new shape: which sections, how long they are, and who plays in each'],
    ['orchestra', 'Orchestra', 'Hand the tune round a new way: another instrument taking it in turns with the melody, or bells doubling it an octave up, the way orchestral game music does'],
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
    try {
      if (player.playing) player.stop();
      else player.play(startBeat);
    } catch {
      // (no web audio at all: an iphone in lockdown mode turns it off, for one)
      say("This browser won't make sound from a web page (its Web Audio is turned off), so the song can't play here.");
    }
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
    load();
    player.mix();
  });
  const clickKey = $('#mmClick');
  clickKey.addEventListener('click', () => {
    player.metronome = !player.metronome;
    clickKey.setAttribute('aria-pressed', player.metronome);
  });
  // record: what's played on the keyboard is written into the open layer (recordNote). starts the song
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
    renderKinds();
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
        button.dataset.tip = own ? `${name}: how any parts written for you play, and the colours. Your own notes stay as they are` : `${name}: ${FLAVOURS[button.dataset.mood].about}`;
      }
    }
    renderSaveState();
    const colour = MOODS[song.mood].colour;
    document.body.style.setProperty('--mm-mood', colour);
    document.body.style.setProperty('--mm-mood-ink', inkOn(colour));
  }

  let lastReadout = '';
  function renderReadout() {
    const secondsPerBeat = 60 / (song.tempo * practice);
    const at = player.playing ? player.position() : startBeat;
    const section = comp.sections.find((one) => at >= one.start && at < one.end) || comp.sections[0];
    const bar = Math.floor(at / comp.bpb) + 1;
    const where = `${section.name} · bar ${bar}`;
    const text = `${where} · ${clock(at * secondsPerBeat)} / ${clock(comp.beats * secondsPerBeat)} · ${NOTE_NAMES[song.key]} ${SCALES[song.scale].name.toLowerCase()} · ${song.tempo} bpm${practice < 1 ? ` (practising at ${percent(practice)})` : ''} · ${song.meter}`;
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
          // a slide or bend is a line following its pitch (where it's wide enough to see)
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

  // clicking the sections or chords moves the marker (and the playhead). clicking a lane opens that layer
  // in the band tab, on the part clicked
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
    scoreDirty = true;
    // (while learning, it's the part to learn)
    if (tab === 'learn') return renderPanel();
    if (px > layout.gutter) editPart = (comp.sections.find((one) => beat >= one.start && beat < one.end) || comp.sections[0]).part;
    setTab('layers');
    scoreDirty = true;
  });
  new ResizeObserver(() => { scoreDirty = true; }).observe(score);
  document.fonts?.ready.then(() => { scoreDirty = true; });

  // ---------- controls for the panels ----------

  let sliderCount = 0;
  // a labelled slider. get and set read and write the song. kind: 'notes', or 'mix' if it only changes
  // the sound
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
    learn = null;
    const build = { song: songPanel, layers: bandPanel, arrange: arrangePanel, space: roomPanel, learn: learnPanel }[tab];
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
    // which composer writes the notes (COMPOSER_VERSIONS in music.js). a song keeps the one it was made
    // with; unstamped ones open as the first. only shown for a song (or the save it came from) made by
    // an older one, since a new song has nothing to choose
    const older = (one) => (one?.composer || 1) !== COMPOSER;
    if (!older(song) && !(working && older(JSON.parse(working.json)))) return [columns, chords];
    const composers = [
      [1, 'Up to 21 Oct', 'The composer up to 21 October. Songs saved before the 22nd'],
      [1.5, '22 Oct, morning', 'The composer of the morning of 22 October, when each flavour got its own way of writing tunes. Songs saved then open as the one before: pick this if one sounds different from how you saved it'],
      [2, 'Up to 23 Oct', 'The composer of 22 and 23 October, with key changes and longer songs. Songs saved then are written by it'],
      [COMPOSER, "Today's", "Today's composer, with the magic worlds' themes coming in one at a time and meeting. Every new song is written by it"],
    ];
    const composer = section('Composer',
      field('Written by', choices(composers, () => song.composer || 1, (value) => edit(() => {
        if (value === 1) delete song.composer;
        else song.composer = value;
      })(), 'Composer'), 'Which version of the composer writes the notes. A song keeps the one it was saved with, so it always sounds the same'),
      make('p', 'mm-hint', "A song keeps the version of the composer that made it, so it never changes. Songs saved before the afternoon of 22 October don't say which version made them and open as the oldest: if one sounds different from how you saved it, try 22 Oct, morning, then save it."),
    );
    return [columns, chords, composer];
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

  // the patterns that need more saying than "a part written for you"
  const PATTERN_TIPS = {
    'counter.tune': 'Takes the tune: it plays the melody\'s own line, taking turns with the melody section by section and joining it the last time round, the way an orchestra hands a theme from the flutes to the strings',
    'bells.double': 'Doubles the tune: the melody an octave up, in the sections where it comes round biggest, like a glockenspiel over a flute',
    'bass.hook': 'Bass hook: a line of its own that bounces round the chord\'s notes on the drums\' rhythm, walks into each new chord and runs up into every fourth bar',
  };

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

  // which of an instrument's recordings a layer plays (recordingsOf in synth.js), when it has several
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

  // the instruments doubling a layer (layer.with): a key each to take it off, and a menu to add another
  // (recorded only, three at most)
  const OCTAVE_WORDS = { '-2': ', two octaves down', '-1': ', an octave down', 1: ', an octave up', 2: ', two octaves up' };
  function doublesEditor(layer) {
    const box = make('div', 'mm-doubles');
    for (const one of layer.with || []) {
      const name = `${INSTRUMENTS[one.instrument].name}${OCTAVE_WORDS[one.octave || 0] || ''}`;
      box.append(key(`${name} ×`, `Stop the ${INSTRUMENTS[one.instrument].name.toLowerCase()} doubling this part`, edit(() => {
        layer.with = layer.with.filter((other) => other !== one);
        if (!layer.with.length) {
          delete layer.with;
          delete layer.doubleAll;
        }
      }), 'mm-key-small'));
    }
    if ((layer.with || []).length < 3) {
      const pick = make('select', 'mm-select');
      pick.setAttribute('aria-label', 'Double it with');
      pick.append(new Option('Add an instrument...', ''));
      for (const [id, instrument] of Object.entries(INSTRUMENTS)) {
        if (!instrument.samples || ['kit', 'texture'].includes(instrument.family)) continue;
        pick.append(new Option(instrument.name, id));
      }
      const octave = make('select', 'mm-select');
      octave.setAttribute('aria-label', 'In which octave');
      for (const [value, words] of [[0, 'Same octave'], [1, 'Octave up'], [-1, 'Octave down']]) octave.append(new Option(words, value));
      pick.addEventListener('change', () => {
        if (!pick.value) return;
        const added = { instrument: pick.value, ...(+octave.value ? { octave: +octave.value } : {}) };
        edit(() => { layer.with = [...(layer.with || []), added]; })();
        // the new doubler's recordings load as the song's do (songSamples), then it joins in
        player.audition(song, { ...layer, instrument: added.instrument, with: undefined }, [ROLES[layer.role].center + (layer.octave + (added.octave || 0)) * 12], 1.5);
      });
      box.append(pick, octave);
    }
    return box;
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
    // empty: plays only what you give it (layer.hand). written: the mood writes it a part. a texture has
    // no notes to give, so it's always written
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
        delete layer.partSeeds;
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
    if (family === 'tonal') {
      sound.append(field('Doubled by', doublesEditor(layer), 'Doubled by: other instruments playing this part with it, the way an orchestra puts a flute with the violins, or a choir sings the tune in sections. Only recorded instruments double'));
      if (layer.with) {
        const everywhere = layer.doubleAll ?? !!CHOIRS[layer.instrument];
        sound.append(field('Doubled', choices([['loud', 'Loud parts', 'Doubled only in the loud sections, so the tune grows as the song does'], ['all', 'Everywhere', 'Doubled the whole way through']], () => (everywhere ? 'all' : 'loud'), (value) => edit(() => { layer.doubleAll = value === 'all'; })(), 'Where it is doubled'), 'Where the doubling plays'));
      }
    }
    // what it plays: only your notes (layer.hand), or a pattern with your added notes on top
    if (family !== 'texture') {
      const options = [
        ['hand', 'My notes', 'My notes: it plays only the notes you draw or record, nothing written for you'],
        ...Object.entries(PATTERNS[layer.role]).map(([id, name]) => [id, name, PATTERN_TIPS[`${layer.role}.${id}`] || `${name}: a ${role.name.toLowerCase()} part written for you, following the chords, plus any notes you add`]),
      ];
      sound.append(field('Plays', choices(options, () => (layer.hand ? 'hand' : layer.pattern), (value) => edit(() => {
        // a layer that took the tune hands it back: the melody plays again wherever it was playing it
        const melody = song.layers.find((one) => one.role === 'melody');
        if (melody && layer.role === 'counter' && carries(layer) && value !== 'tune') {
          for (const one of song.sections) if (one.play.includes(layer.id) && !one.lead && !one.play.includes(melody.id)) one.play.push(melody.id);
        }
        if (value === 'hand') layer.hand = true;
        else {
          delete layer.hand;
          layer.pattern = value;
        }
        // and one that takes or doubles it gets the tune handed round (passTune in music.js)
        if (carries(layer)) {
          for (const one of song.sections) if (melody && one.play.includes(melody.id) && !one.lead && !one.play.includes(layer.id)) one.play.push(layer.id);
          passTune(song);
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

  // one part of one layer as a grid: time across, pitch (or drum) down, the chord's notes shaded. edits
  // are per part (layer.edits), so a change plays every time the part comes round
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
    // the sections a part plays in (Theme, Clash...), each name once
    const named = (part) => [...new Set(comp.sections.filter((one) => one.part === part && one.play.includes(layer.id)).map((one) => one.name))].join(', ');
    head.append(choices(parts.map((part) => [part, `Part ${part}`, `Show part ${part}'s notes, played in ${named(part)}`]), () => editPart, (part) => {
      editPart = part;
      editorScroll = 0;
      renderPanel();
    }, 'Part'));
    const changes = layer.edits[editPart];
    // new notes for this part only (rerollLayerPart). not on a part that plays the melody's line, nor on
    // an older composer's song, which doesn't know about part seeds
    if (!layer.hand && !carries(layer) && (song.composer || 1) === COMPOSER) {
      head.append(key(`New part ${editPart}`, `New notes for part ${editPart} only (${named(editPart)}), grown from the same idea as the rest of the ${ROLES[layer.role].name.toLowerCase()}, so it still sounds like this song. The other parts stay as they are${changes ? ', and notes you changed here go' : ''}. Press again for another`, () => {
        const next = rerollLayerPart(song, layer.id, editPart, Math.random());
        if (!next) return say(`This ${ROLES[layer.role].name.toLowerCase()} plays part ${editPart}'s chords as they come, so there's nothing new to write. New chords for part ${editPart} (Song tab) or another pattern will change it.`);
        // (like any edit, it plays on from where it is, so you hear the new part come round)
        remember();
        song = next;
        changed();
      }, 'mm-key-small mm-key-line'));
    }
    if (changes && layer.hand) {
      // a part of your own can be copied over another part, or cleared
      for (const other of parts.filter((one) => one !== editPart)) {
        head.append(key(`Copy to ${other}`, `Copy part ${editPart}'s notes into part ${other}, in place of what's there`, edit(() => { layer.edits[other] = clone(changes); }), 'mm-key-small mm-key-line'));
      }
      head.append(key('Clear', `Take out every note in part ${editPart}`, edit(() => { delete layer.edits[editPart]; }), 'mm-key-small mm-key-line'));
    } else if (changes) {
      head.append(key('Undo my changes', `Put part ${editPart} back to the notes it was written with`, edit(() => { delete layer.edits[editPart]; }), 'mm-key-small mm-key-line'));
    }
    const drums = layer.role === 'drums';
    // the tools (drums only get notes). a slide's speed is how much of the note it takes
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

    // (edits are in the song's own key, so a section in it is shown rather than one after a key change)
    const playing = comp.sections.filter((one) => one.part === editPart && one.play.includes(layer.id));
    const sec = playing.find((one) => !one.lift) || playing[0];
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
    // where a pitch sits down the grid, between rows if it isn't one (a slide passes through them)
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
      // a note: its block (outlined if you added it), its pitch line if it bends, a wiggle for vibrato
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

    // what's being drawn, as notes, by the tool: a slide to the pointer's row, vibrato, a swell, or the
    // chord playing there voiced round the row (voiceChord)
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
          // vibrato on or off, or the swell going round. a note you added just changes; a written one is
          // taken out (by its written pitch) and added back as yours, changed
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
      // a key change (section.lift, liftKey in music.js): this section played that many semitones higher
      const lift = make('select', 'mm-select mm-select-small');
      lift.setAttribute('aria-label', `Section ${index + 1}'s key`);
      lift.dataset.tip = 'Key change: this section played higher than the rest, the trick for a last chorus or a climax. Usually the sections after it go up too';
      for (const n of [0, 1, 2, 3]) lift.append(new Option(n ? `Key up ${n}` : 'Home key', n, false, (one.lift || 0) === n));
      // a song saved before key changes plays with the composer it was made with (COMPOSER), which has none
      if ((song.composer || 1) < 2) {
        lift.disabled = true;
        lift.dataset.tip = 'Key changes came after this song was saved, and it plays as it did then. Make it again from its seed to use them';
      }
      lift.addEventListener('change', edit(() => {
        if (+lift.value) one.lift = +lift.value;
        else delete one.lift;
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
      // how hard it's played (section.energy, feel() in music.js)
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
      cell.append(name, part, lead, lift, bars, loudness, tools);
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

  // ---------- the learn tab ----------
  //
  // one layer's part as a player reads it: notes falling onto piano keys, a guitar's or bass's neck over
  // a scrolling tab, or sheet music. learn.js works out the hands and this draws them, following the
  // playhead, or the marker while stopped (← and → step through it). practice speed slows the player

  // a guitar opens on a guitar's neck, a bass guitar (or an upright) on a bass's, anything else a piano
  const GUITARS = new Set(['nylon', 'steel-guitar', 'lead-guitar', 'fuzz-lead', 'swell-guitar', 'reverse-guitar']);
  const BASS_GUITARS = new Set(['pluck-bass', 'pick-bass', 'fuzz-bass', 'slap-bass', 'fretless', 'chorus-bass', 'upright']);
  const ownView = (layer) => (INSTRUMENTS[layer.instrument].family === 'guitar' || GUITARS.has(layer.instrument) ? 'guitar' : BASS_GUITARS.has(layer.instrument) ? 'bass' : 'piano');
  const VIEWS = [
    ['piano', 'Piano', "Piano: the notes fall onto the keys they're played on, like a piano cover video"],
    ['guitar', 'Guitar', 'Guitar: where your fingers go on the neck, and the tab'],
    ['bass', 'Bass guitar', "Bass guitar: where your fingers go on a four string bass's neck, and the tab"],
    ['sheet', 'Sheet music', 'Sheet music: the part written out on a staff'],
  ];
  const LEARN_HINTS = {
    piano: 'The notes fall onto the keys: press each key as its bar reaches it and hold it until the bar has gone. Green is your right hand and blue your left (give it a part under Left hand). While it\'s stopped, ← and → step through the part a chord at a time, and the keys show the one at the marker.',
    guitar: "The neck shows where your fingers go for what's playing now, and faintly, the next shape. 1 is your first finger and 4 your little finger, a long bar is one finger laid flat across the strings (a barre), O is an open string and × one you don't play. The tab underneath scrolls past the line: each line is a string, the thinnest at the top, and the numbers are frets. ↓ and ↑ are strums down and up, PM is palm muted, / and \\ slide up and down, b bends up to the note and ~ is vibrato. While it's stopped, ← and → step through it.",
    bass: "The neck shows where your fingers go for the note playing now (1 is your first finger and 4 your little finger, O an open string), and faintly the next one. The tab underneath scrolls past the line: each line is a string, the thinnest at the top, and the numbers are frets. While it's stopped, ← and → step through it.",
    sheet: "The part as sheet music, scrolling past the line. It's kept simple: one line of notes, each rounded to the nearest sixteenth and held until the next one. Guitar and bass parts are written an octave above where they sound, the way their music always is. While it's stopped, ← and → step through it.",
  };
  // synthesia's colours, which most falling note videos keep: green for the right hand, blue the left
  const HANDS = { right: ['#3f9a52', '#2c7a3d'], left: ['#3b74c4', '#28579b'] };
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  // clefs, rests and accidentals, from noto music (loaded with just these characters)
  const MUSIC_FONT = '"Noto Music", "Segoe UI Symbol", serif';
  const GLYPHS = { treble: '\u{1D11E}', bass: '\u{1D122}', 4: '\u{1D13B}', 2: '\u{1D13C}', 1: '\u{1D13D}', 0.5: '\u{1D13E}', 0.25: '\u{1D13F}', '1': '♯', '-1': '♭', '0': '♮' };
  document.fonts?.load(`20px ${MUSIC_FONT}`, GLYPHS.treble).then(() => { if (learn) learn.dirty = true; });
  const views = {};
  const leftHands = {};
  let practice = 1;
  let learn = null;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  // the player's copy of the song, slower at a practice speed. the song itself keeps its tempo
  const load = () => player.load(practice === 1 ? song : { ...song, tempo: song.tempo * practice }, comp);

  function learnPanel() {
    const tonal = song.layers.filter((layer) => roleFamily(layer.role) === 'tonal');
    if (!tonal.length) return [make('p', 'mm-hint', "No part plays notes yet, so there's nothing to learn. Add one in the Band tab.")];
    let layer = layerById(selected);
    if (!layer || roleFamily(layer.role) !== 'tonal') {
      layer = tonal.find((one) => one.role === 'melody') || tonal[0];
      selected = layer.id;
      scoreDirty = true;
    }
    // (two layers in the same role are told apart by number)
    const partName = (one) => {
      const same = tonal.filter((other) => other.role === one.role);
      return `${ROLES[one.role].name}${same.length > 1 ? ` ${same.indexOf(one) + 1}` : ''}`;
    };
    const view = views[layer.id] || ownView(layer);
    const pickPart = (id) => {
      selected = id;
      scoreDirty = true;
      renderPanel();
    };
    const controls = make('div', 'mm-learn-controls');
    controls.append(
      field('Learn', choices(tonal.map((one) => [one.id, partName(one), `${partName(one)}, played on the ${INSTRUMENTS[one.instrument].name.toLowerCase()}`]), () => layer.id, pickPart, 'Part to learn'), 'Which part to learn. Clicking a layer in the score picks it too'),
      field('Show it on', choices(VIEWS, () => view, (value) => { views[layer.id] = value; renderPanel(); }, 'Show it on'), 'What to show it on. It starts on the instrument the part is played on, or the piano'),
    );
    // a tune starts with the bass in the left hand, like a piano cover. any part can take it, or none
    let left = '';
    if (view === 'piano') {
      const others = tonal.filter((one) => one !== layer);
      const usual = ['melody', 'counter', 'bells', 'arp'].includes(layer.role) ? others.find((one) => one.role === 'bass')?.id ?? '' : '';
      left = leftHands[layer.id] ?? usual;
      if (!others.some((one) => one.id === left)) left = '';
      if (others.length) {
        controls.append(field('Left hand', choices([['', 'Nothing', 'Just the one part, in your right hand'], ...others.map((one) => [one.id, partName(one), `The ${partName(one).toLowerCase()} in your left hand, in blue`])], () => left, (id) => { leftHands[layer.id] = id; renderPanel(); }, 'Left hand'), 'Left hand: a second part to play with your left hand'));
      }
    }
    controls.append(field('Speed', choices([[1, 'Full', 'Full speed'], [0.75, '¾', 'Three quarters speed'], [0.5, 'Half', 'Half speed, for working out the hard bits']], () => practice, (value) => {
      practice = value;
      load();
      renderPanel();
    }, 'Practice speed'), "Practice speed: the song plays slower while you learn it. It doesn't change the song, its tempo or its downloads"));
    const canvas = make('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `The ${partName(layer).toLowerCase()} shown as ${view === 'sheet' ? 'sheet music' : `it's played on a ${VIEWS.find(([id]) => id === view)[1].toLowerCase()}`}, following the playhead`);
    const wrap = make('div', 'mm-learn');
    wrap.append(canvas);
    learn = { id: layer.id, view, left, canvas, comp: null, dirty: true };
    // clicking it moves the marker to the nearest chord or note
    canvas.addEventListener('pointerdown', (event) => {
      if (!learn?.beatAt || !learn.data.events.length) return;
      const rect = canvas.getBoundingClientRect();
      const beat = learn.beatAt(event.clientX - rect.left, event.clientY - rect.top);
      moveMarker(learn.data.events.reduce((best, one) => (Math.abs(one.t - beat) < Math.abs(best.t - beat) ? one : best)));
    });
    // (and under it, a word on anything that can't be shown exactly as it sounds)
    learn.note = make('p', 'mm-hint');
    const out = [controls, make('p', 'mm-hint', LEARN_HINTS[view]), wrap, learn.note];
    if (view === 'guitar' || view === 'bass') {
      learn.shapes = make('div', 'mm-shapes');
      out.push(learn.shapes);
    }
    return out;
  }

  // the marker to a chord or note: the player jumps there, or if it's stopped, plays it
  function moveMarker(event) {
    startBeat = clamp(event.t, 0, comp.beats - 1e-6);
    if (player.playing) player.play(startBeat);
    else player.audition(song, learn.data.layer, event.notes.map((note) => note.midi), clamp(event.end - event.t, 0.5, 3));
    learn.dirty = true;
  }

  // ← and →, while it's stopped: the chord or note after or before the marker
  function stepMarker(by) {
    const { events } = learn.data;
    const next = by > 0 ? events.find((one) => one.t > startBeat + 1e-6) || events[0] : events.findLast((one) => one.t < startBeat - 1e-6) || events[events.length - 1];
    if (next) moveMarker(next);
  }

  // what the view needs from the notes, worked out again whenever they change
  function learnData() {
    const layer = layerById(learn.id);
    const partOf = (id) => playedTogether(comp.notes.filter((note) => note.layer === id), comp.step);
    const events = partOf(learn.id);
    // the closest two things are decides how wide a beat's drawn, so nothing's written over anything
    let gap = comp.bpb;
    for (let i = 1; i < events.length; i++) if (events[i].t - events[i - 1].t > 1e-6) gap = Math.min(gap, events[i].t - events[i - 1].t);
    const data = { layer, events, gap };
    if (learn.view === 'piano') data.left = learn.left ? partOf(learn.left) : [];
    if (learn.view === 'guitar' || learn.view === 'bass') {
      Object.assign(data, events.length ? frettings(events, learn.view) : { placed: [], tuning: STRINGS[learn.view].standard });
      // the shape held at each event: an upstroke (or anything else at the same frets) is the chord
      // before it still held, not a new shape
      data.held = [];
      data.placed.forEach((one, i) => {
        const before = i ? data.held[i - 1] : -1;
        const chord = before >= 0 && data.placed[before];
        data.held.push(chord && one.strings.every((s) => chord.strings.some((c) => c.string === s.string && c.fret === s.fret)) ? before : i);
      });
    }
    if (learn.view === 'sheet') {
      const quarters = song.meter === '6/8' ? 1.5 : 1;
      const signature = keySignature(song.key, SCALES[song.scale].steps);
      const pieces = sheetPieces(events, { beats: comp.beats, bpb: comp.bpb, step: comp.step, quarters }, signature, ownView(layer) === 'piano' ? 0 : 12);
      const steps = pieces.flatMap((piece) => (piece.heads || []).map((head) => head.step)).sort((a, b) => a - b);
      // treble clef when most of it's from middle c up
      const treble = !steps.length || steps[steps.length >> 1] >= 28;
      Object.assign(data, { quarters, signature, pieces, treble, shift: ownView(layer) !== 'piano', low: steps[0], high: steps[steps.length - 1] });
      data.layout = sheetLayout(data);
    }
    learn.data = data;
    learn.comp = comp;
    learn.dirty = true;
    if (learn.shapes) renderShapes(data);
    const caveats = [];
    if (data.folded) caveats.push(`Some notes are out of a ${learn.view === 'bass' ? "bass's" : "guitar's"} range, so they're shown an octave nearer.`);
    const short = [...new Set(events.filter((_, i) => data.placed?.[i].left).map(eventName))];
    if (short.length) caveats.push(`${short.slice(0, 3).join(', ')}${short.length > 3 ? ' and others' : ''} ${short.length > 1 ? 'are' : 'is'} played without a note the hand can't hold with the rest of the chord.`);
    learn.note.textContent = caveats.join(' ');
    learn.note.hidden = !caveats.length;
  }

  // every frame the tab's open: drawn again while it plays, or when the marker or the notes move
  function drawLearn() {
    if (!learn.canvas.isConnected) {
      learn = null;
      return;
    }
    if (learn.comp !== comp) {
      if (!layerById(learn.id)) return renderPanel();
      learnData();
    }
    const { canvas, data } = learn;
    const width = canvas.clientWidth;
    const at = player.playing ? player.position() : startBeat;
    if (!width || (!player.playing && !learn.dirty && learn.width === width && learn.at === at)) return;
    Object.assign(learn, { dirty: false, width, at });
    const height = { piano: 300, guitar: 256, bass: 214, sheet: data.layout?.height }[learn.view];
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, width, height);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    if (!data.events.length) {
      learn.beatAt = null;
      g.fillStyle = INK_SOFT;
      g.font = '500 13px Recursive, sans-serif';
      g.fillText("This part doesn't play any notes yet.", 16, 24);
      return;
    }
    ({ piano: drawPiano, guitar: drawNeck, bass: drawNeck, sheet: drawSheet })[learn.view](g, width, height, at);
  }

  // how far each time round is shifted: when the song loops, its start comes round again after the end
  const laps = () => (player.loop ? [-comp.beats, 0, comp.beats] : [0]);
  // the events in a stretch of beats, each with where it falls in it
  function eventsIn(events, from, to) {
    const found = [];
    for (const shift of laps()) {
      events.forEach((event, i) => {
        const t = event.t + shift;
        if (t <= to && event.end + shift >= from) found.push({ event, i, t });
      });
    }
    return found;
  }
  // the chords from the song in a stretch of beats, the same way
  function chordsIn(from, to) {
    const found = [];
    for (const shift of laps()) {
      for (const sec of comp.sections) for (const chord of sec.chords) if (chord.t + shift >= from && chord.t + shift <= to) found.push({ chord, t: chord.t + shift });
    }
    return found;
  }
  // the event sounding at a beat (-1 for none) and the next to start after it
  const soundingAt = (events, at) => events.findLastIndex((one) => one.t <= at + 1e-6 && one.end > at);
  const nextAfter = (events, at) => {
    const i = events.findIndex((one) => one.t > at + 1e-6);
    return i < 0 && player.loop ? 0 : i;
  };
  // what to call an event: its chord's name if it's a chord (a root and fifth is a power chord, C5),
  // otherwise its notes
  function eventName(event) {
    if (event.notes.length < 3) return event.notes.map((note) => noteName(note.midi)).join(' ');
    const sec = comp.sections.find((one) => event.t >= one.start - 1e-6 && event.t < one.end - 1e-6);
    const chord = sec?.chords.find((one) => event.t < one.t + one.dur - 1e-6);
    if (!chord) return '';
    const power = event.notes.every((note) => [0, 7].includes(mod12(note.midi - chord.root)));
    return power ? `${NOTE_NAMES[chord.root]}5` : chord.name;
  }
  // the bar a beat's in, counting from 1, round again when it loops
  const barNumber = (beat) => (Math.round(beat / comp.bpb) % Math.round(comp.beats / comp.bpb) + Math.round(comp.beats / comp.bpb)) % Math.round(comp.beats / comp.bpb) + 1;

  // the piano: the keys along the bottom, covering the part's notes in whole octaves (two at least),
  // and the notes falling onto them, as long as they're held, landing as they're played
  function drawPiano(g, w, h, at) {
    const { events, left } = learn.data;
    const hands = [[left, HANDS.left], [events, HANDS.right]];
    const pitches = [...events, ...left].flatMap((event) => event.notes.map((note) => note.midi));
    let low = Math.min(...pitches);
    let high = Math.max(...pitches);
    low -= mod12(low);
    high += 11 - mod12(high);
    while (high - low < 23) {
      if (low >= 33) low -= 12;
      else high += 12;
    }
    low = Math.max(21, low);
    high = Math.min(108, high);
    const whites = [];
    for (let midi = low; midi <= high; midi++) if (!BLACK_KEYS.has(midi % 12)) whites.push(midi);
    const ww = w / whites.length;
    const keyX = {};
    whites.forEach((midi, i) => { keyX[midi] = i * ww; });
    for (let midi = low; midi <= high; midi++) if (BLACK_KEYS.has(midi % 12)) keyX[midi] = keyX[midi + 1] - ww * 0.3;
    const keyW = (midi) => (BLACK_KEYS.has(midi % 12) ? ww * 0.6 : ww);
    const keysH = clamp(ww * 4.6, 54, 100);
    const top = h - keysH;
    // about two and a half seconds of falling, two bars at least
    const ahead = Math.max(comp.bpb * 2, Math.round((song.tempo / 60) * 2.5));
    const ppb = top / ahead;
    const y = (t) => top - (t - at) * ppb;
    learn.beatAt = (_, py) => at + (top - Math.min(py, top)) / ppb;
    g.fillStyle = 'rgba(44, 39, 33, 0.06)';
    for (const midi of whites) if (midi % 12 === 0) g.fillRect(Math.round(keyX[midi]), 0, 1, top);
    g.font = '500 10px Recursive, sans-serif';
    g.textBaseline = 'bottom';
    for (let bar = Math.ceil(at / comp.bpb); bar * comp.bpb <= at + ahead; bar++) {
      const by = Math.round(y(bar * comp.bpb));
      g.fillStyle = 'rgba(44, 39, 33, 0.18)';
      g.fillRect(0, by, w, 1);
      g.fillStyle = INK_SOFT;
      g.fillText(`${barNumber(bar * comp.bpb)}`, 4, by - 2);
    }
    const lit = {};
    g.save();
    g.beginPath();
    g.rect(0, 0, w, top);
    g.clip();
    g.textAlign = 'center';
    g.font = '700 10px Recursive, sans-serif';
    for (const [list, [colour, dark]] of hands) {
      for (const { event, t } of eventsIn(list, at - comp.bpb, at + ahead)) {
        for (const note of event.notes) {
          if (note.midi < low || note.midi > high) continue;
          const black = BLACK_KEYS.has(note.midi % 12);
          if (t <= at + 1e-6 && at < t + note.dur) lit[note.midi] = black ? dark : colour;
          const x = keyX[note.midi] + 1;
          const nw = keyW(note.midi) - 2;
          const y1 = y(t);
          const y0 = y(t + note.dur);
          if (y1 < 0) continue;
          g.fillStyle = black ? dark : colour;
          g.beginPath();
          g.roundRect(x, y0, nw, Math.max(4, y1 - y0 - 1), 3);
          g.fill();
          if (nw >= 13 && y1 - y0 >= 16) {
            g.fillStyle = '#fbf6ec';
            g.fillText(NOTE_NAMES[note.midi % 12], x + nw / 2, y1 - 3);
          }
        }
      }
    }
    g.restore();
    for (const midi of whites) {
      g.fillStyle = lit[midi] || '#fbf7ee';
      g.fillRect(keyX[midi], top, ww, keysH);
      g.fillStyle = RULE;
      g.fillRect(Math.round(keyX[midi]), top, 1, keysH);
      if (midi % 12 === 0 && ww >= 13) {
        g.fillStyle = lit[midi] ? '#fbf6ec' : midi === 60 ? INK : INK_SOFT;
        g.font = `${midi === 60 ? 700 : 500} 10px Recursive, sans-serif`;
        g.fillText(noteName(midi), keyX[midi] + ww / 2, h - 3);
      }
    }
    for (let midi = low; midi <= high; midi++) {
      if (!BLACK_KEYS.has(midi % 12)) continue;
      g.fillStyle = lit[midi] || INK;
      g.fillRect(keyX[midi], top, ww * 0.6, keysH * 0.62);
    }
    g.fillStyle = INK;
    g.fillRect(0, top - 2, w, 3);
  }

  // a guitar's or a bass's neck along the top, with the fingers for what's sounding now (and the
  // next shape faintly), and the tab scrolling under it
  function drawNeck(g, w, _, at) {
    const { events, placed, tuning, dropped, layer } = learn.data;
    const strings = tuning.length;
    const colour = ROLES[layer.role].colour;
    const now = soundingAt(events, at);
    const next = nextAfter(events, at);
    const gap = strings === 6 ? 15 : 18;
    const boardTop = 34;
    const boardBottom = boardTop + gap * (strings - 1);
    const x0 = 44;
    const right = w - 12;
    const highest = Math.max(0, ...placed.flatMap((one) => one.strings.map((s) => s.fret)));
    const frets = Math.min(STRINGS[learn.view].frets, Math.max(12, highest + 1));
    // frets narrow up the neck, as on a real one, but less, so the high ones still have room
    const fx = (fret) => x0 + ((right - x0) * (1 - 2 ** (-fret / 24))) / (1 - 2 ** (-frets / 24));
    const sy = (string) => boardTop + (strings - 1 - string) * gap;
    const mid = (fret) => (fx(fret - 1) + fx(fret)) / 2;
    g.fillStyle = '#e6d6b6';
    g.fillRect(x0, boardTop - 7, right - x0, boardBottom - boardTop + 14);
    g.fillStyle = RULE;
    for (const fret of [3, 5, 7, 9, 15, 17, 19, 21]) {
      if (fret > frets) continue;
      g.beginPath();
      g.arc(mid(fret), (boardTop + boardBottom) / 2, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    if (frets >= 12) {
      for (const y of [boardTop + (boardBottom - boardTop) * 0.25, boardTop + (boardBottom - boardTop) * 0.75]) {
        g.beginPath();
        g.arc(mid(12), y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#b5a483';
    for (let fret = 1; fret <= frets; fret++) g.fillRect(Math.round(fx(fret)), boardTop - 7, 1.5, boardBottom - boardTop + 14);
    g.fillStyle = INK;
    g.fillRect(x0 - 3, boardTop - 7, 4, boardBottom - boardTop + 14);
    g.textAlign = 'center';
    g.fillStyle = INK_SOFT;
    g.font = '500 10px Recursive, sans-serif';
    for (const fret of [3, 5, 7, 9, 12, 15, 17, 19, 21]) if (fret <= frets) g.fillText(`${fret}`, mid(fret), boardBottom + 17);
    for (let string = 0; string < strings; string++) {
      g.fillStyle = '#8c7b62';
      const thick = 0.7 + (strings - 1 - string) * 0.3;
      g.fillRect(x0 - 4, sy(string) - thick / 2, right - x0 + 4, thick);
      g.fillStyle = INK_SOFT;
      g.font = '600 11px Recursive, sans-serif';
      g.fillText(NOTE_NAMES[tuning[string] % 12], 12, sy(string));
    }
    const shown = now >= 0 ? now : next;
    g.textAlign = 'left';
    if (shown >= 0) {
      g.fillStyle = now >= 0 ? INK : INK_SOFT;
      g.font = '700 14px Recursive, sans-serif';
      g.fillText(`${now >= 0 ? '' : 'Next: '}${eventName(events[shown])}`, x0, 13);
    }
    g.textAlign = 'right';
    g.fillStyle = INK_SOFT;
    g.font = '500 11px Recursive, sans-serif';
    g.fillText(dropped ? 'Drop D: the low string tuned down to D' : 'Standard tuning', right, 13);

    // a shape on the neck: barres, then a dot a fretted string with its finger in it, O on an open
    // string and, for a chord, × on a string that isn't played. faint: the next shape, outlined
    const dot = Math.min(7.5, gap * 0.46);
    const drawHold = (one, faint) => {
      const { fingers, barres } = fingersFor(one.strings, one.hand);
      g.globalAlpha = faint ? 0.42 : 1;
      g.lineWidth = 1.6;
      g.strokeStyle = colour;
      g.fillStyle = colour;
      g.textAlign = 'center';
      g.font = '800 10px Recursive, sans-serif';
      const mark = (x, y, finger, shape) => {
        shape();
        if (faint) g.stroke();
        else {
          g.fill();
          g.fillStyle = '#fbf6ec';
          g.fillText(`${finger}`, x, y + 0.5);
          g.fillStyle = colour;
        }
      };
      for (const barre of barres) {
        const x = mid(barre.fret);
        const y1 = sy(barre.to);
        const y2 = sy(barre.from);
        mark(x, (y1 + y2) / 2, barre.finger, () => {
          g.beginPath();
          g.roundRect(x - dot, y1 - dot, dot * 2, y2 - y1 + dot * 2, dot);
        });
      }
      for (const s of one.strings) {
        if (s.fret === 0) {
          g.beginPath();
          g.arc(x0 - 14, sy(s.string), dot * 0.62, 0, Math.PI * 2);
          g.stroke();
          continue;
        }
        if (barres.some((barre) => barre.fret === s.fret && s.string >= barre.from && s.string <= barre.to)) continue;
        mark(mid(s.fret), sy(s.string), fingers[s.string], () => {
          g.beginPath();
          g.arc(mid(s.fret), sy(s.string), dot, 0, Math.PI * 2);
        });
      }
      if (!faint && one.strings.length >= 3) {
        g.fillStyle = INK_SOFT;
        g.font = '700 12px Recursive, sans-serif';
        for (let string = 0; string < strings; string++) if (!one.strings.some((s) => s.string === string)) g.fillText('×', x0 - 14, sy(string) + 0.5);
      }
      g.globalAlpha = 1;
    };
    const { held } = learn.data;
    if (next >= 0 && (now < 0 || held[next] !== held[now])) drawHold(placed[held[next]], true);
    if (now >= 0) drawHold(placed[held[now]], false);

    // the tab: a line a string, thinnest on top, a fret number where each note's played and a line
    // as long as it's held. chords along the top, palm muting over the notes, strums under them
    const line = strings === 6 ? 12 : 14;
    const tabTop = boardBottom + 62;
    const ty = (string) => tabTop + (strings - 1 - string) * line;
    const tabBottom = ty(0);
    const labelW = 26;
    const nowX = labelW + (w - labelW) * 0.22;
    const ppb = clamp(26 / learn.data.gap, 36, 150);
    const tx = (t) => nowX + (t - at) * ppb;
    learn.beatAt = (px) => at + (px - nowX) / ppb;
    const from = at - (nowX - labelW) / ppb;
    const to = at + (w - nowX) / ppb;
    g.fillStyle = 'rgba(44, 39, 33, 0.35)';
    for (let string = 0; string < strings; string++) g.fillRect(labelW, ty(string), w - labelW, 1);
    g.textAlign = 'left';
    g.font = '500 9.5px Recursive, sans-serif';
    for (let bar = Math.ceil(from / comp.bpb); bar * comp.bpb <= to; bar++) {
      const x = Math.round(tx(bar * comp.bpb));
      g.fillStyle = 'rgba(44, 39, 33, 0.55)';
      g.fillRect(x, ty(strings - 1), 1, tabBottom - ty(strings - 1) + 1);
      g.fillStyle = INK_SOFT;
      g.fillText(`${barNumber(bar * comp.bpb)}`, x + 3, ty(strings - 1) - 8);
    }
    g.fillStyle = INK;
    g.font = '700 11px Recursive, sans-serif';
    for (const { chord, t } of chordsIn(from, to)) g.fillText(chord.name, tx(t), tabTop - 30);
    const visible = eventsIn(events, from - learn.data.gap, to);
    g.globalAlpha = 0.3;
    g.fillStyle = colour;
    for (const { event, i, t } of visible) {
      for (const s of placed[i].strings) {
        const note = event.notes.find((one) => one.midi === s.midi) || event.notes[0];
        g.fillRect(tx(t), ty(s.string) - 1.5, Math.max(0, (note.dur - 0.05) * ppb), 3);
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    for (const { event, i, t } of visible) {
      const x = tx(t);
      const sounding = t <= at + 1e-6 && at < t + event.end - event.t;
      g.font = '700 11px Recursive, ui-monospace, monospace';
      for (const s of placed[i].strings) {
        const note = event.notes.find((one) => one.midi === s.midi) || event.notes[0];
        const text = `${s.fret}${tabMark(note)}`;
        const tw = g.measureText(text).width;
        g.fillStyle = PAPER;
        g.fillRect(x - tw / 2 - 2, ty(s.string) - 6, tw + 4, 12);
        g.fillStyle = sounding ? colour : t > at ? INK : INK_SOFT;
        g.fillText(text, x, ty(s.string) + 0.5);
      }
      g.font = '700 9px Recursive, sans-serif';
      g.fillStyle = INK_SOFT;
      if (event.notes.some((note) => note.mute)) g.fillText('PM', x, tabTop - 14);
      if (event.notes.length >= 3) {
        g.font = '700 12px Recursive, sans-serif';
        g.fillText(event.up ? '↑' : '↓', x, tabBottom + 13);
      }
    }
    g.fillStyle = colour;
    g.fillRect(Math.round(nowX) - 1, ty(strings - 1) - 10, 2, tabBottom - ty(strings - 1) + 20);
    g.fillStyle = PAPER;
    g.fillRect(0, tabTop - 40, labelW, tabBottom - tabTop + 60);
    g.fillStyle = INK_SOFT;
    g.font = '600 10px Recursive, sans-serif';
    // (tab writes the thin e string small, to tell it from the thick one)
    for (let string = 0; string < strings; string++) {
      const name = NOTE_NAMES[tuning[string] % 12];
      g.fillText(string === strings - 1 && name === 'E' ? 'e' : name, 12, ty(string) + 0.5);
    }
  }

  // tab's marks for what a note does (note.bend and note.shake, ornament() in music.js): / and \ a
  // slide up or down, b a bend up to it, ~ vibrato
  function tabMark(note) {
    let mark = '';
    if (note.bend) {
      const first = note.bend[0][1];
      const last = note.bend[note.bend.length - 1][1];
      if (note.bend.length === 2 && first === 0 && last) mark = last > 0 ? '/' : '\\';
      else if (note.bend.length <= 3 && last - first >= 1) mark = 'b';
    }
    return note.shake ? `${mark}~` : mark;
  }

  // a box for each chord shape the part uses, like a songbook's. clicking one plays it and moves the
  // marker to where it first comes in
  function renderShapes(data) {
    // (one box a chord, its fullest shape, in the order the chords first come in)
    const first = new Map();
    data.placed.forEach((one, i) => {
      if (one.strings.length < 3 || data.held[i] !== i) return;
      const name = eventName(data.events[i]);
      if (!first.has(name) || one.strings.length > data.placed[first.get(name)].strings.length) first.set(name, i);
    });
    learn.shapes.replaceChildren();
    if (!first.size) return;
    learn.shapes.append(make('h3', 'mm-section-title', 'Chord shapes in this part'));
    const row = make('div', 'mm-shape-row');
    for (const i of [...first.values()].slice(0, 16)) {
      const event = data.events[i];
      const name = eventName(event);
      const button = make('button', 'mm-shape');
      button.type = 'button';
      button.dataset.tip = `${name}: click to hear it and put the marker where it first comes in`;
      const canvas = make('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      drawShape(canvas, data.placed[i], data.tuning.length);
      button.append(canvas, make('span', '', name));
      button.addEventListener('click', () => moveMarker(event));
      row.append(button);
    }
    learn.shapes.append(row);
  }

  function drawShape(canvas, one, strings) {
    const W = 70;
    const H = 86;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fretted = one.strings.filter((s) => s.fret > 0).map((s) => s.fret);
    const highest = Math.max(0, ...fretted);
    const base = highest <= 4 ? 1 : Math.min(...fretted);
    const rows = Math.max(4, highest - base + 1);
    const left = 17;
    const top = 16;
    const sx = (string) => left + (string * (W - left - 9)) / (strings - 1);
    const fh = (H - top - 6) / rows;
    const fy = (fret) => top + (fret - base + 0.5) * fh;
    g.fillStyle = INK_SOFT;
    for (let string = 0; string < strings; string++) g.fillRect(sx(string), top, 1, rows * fh);
    for (let fret = 0; fret <= rows; fret++) g.fillRect(sx(0), top + fret * fh, sx(strings - 1) - sx(0) + 1, fret === 0 && base === 1 ? 3 : 1);
    g.fillStyle = INK;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = '600 10px Recursive, sans-serif';
    if (base > 1) g.fillText(`${base}`, 7, fy(base));
    const { fingers, barres } = fingersFor(one.strings, one.hand);
    const r = Math.min(5.5, fh * 0.4);
    for (const barre of barres) {
      g.beginPath();
      g.roundRect(sx(barre.from) - r, fy(barre.fret) - r, sx(barre.to) - sx(barre.from) + r * 2, r * 2, r);
      g.fill();
    }
    g.font = '800 8.5px Recursive, sans-serif';
    for (let string = 0; string < strings; string++) {
      const s = one.strings.find((x) => x.string === string);
      if (!s || s.fret === 0) {
        g.fillStyle = INK;
        g.font = '700 10px Recursive, sans-serif';
        g.fillText(s ? 'o' : '×', sx(string), top - 7);
        continue;
      }
      g.fillStyle = INK;
      if (!barres.some((barre) => barre.fret === s.fret && string >= barre.from && string <= barre.to)) {
        g.beginPath();
        g.arc(sx(string), fy(s.fret), r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#fbf6ec';
      g.font = '800 8.5px Recursive, sans-serif';
      g.fillText(`${fingers[string]}`, sx(string), fy(s.fret) + 0.5);
    }
  }

  // sheet music: where the staff goes, with room above and below for the part's highest and lowest
  // notes on ledger lines. step: lines and spaces up from c-1 (spellPitch in learn.js)
  function sheetLayout({ treble, low, high }) {
    const gap = 9;
    const bottomStep = treble ? 30 : 18;
    const above = Math.max(0, (high ?? 0) - (bottomStep + 8)) * (gap / 2);
    const below = Math.max(0, bottomStep - (low ?? bottomStep)) * (gap / 2);
    const staffTop = 30 + gap * 3 + above;
    return { gap, bottomStep, staffTop, bottomY: staffTop + gap * 4, height: Math.round(staffTop + gap * 4 + below + gap * 3.5 + 12) };
  }

  // the staff scrolling past the line, the clef and signatures kept at the left. notes are spaced by
  // time, so they line up with the playhead
  function drawSheet(g, w, h, at) {
    const { pieces, signature, treble, shift, quarters, layout, layer, gap: closest } = learn.data;
    const { gap, bottomStep, staffTop, bottomY } = layout;
    const ys = (step) => bottomY - ((step - bottomStep) * gap) / 2;
    const colour = ROLES[layer.role].colour;
    const pinned = 70 + Math.abs(signature) * 8;
    const nowX = pinned + (w - pinned) * 0.2;
    const ppb = clamp(26 / Math.min(closest, comp.step * 2), 40, 200);
    const tx = (t) => nowX + (t - at) * ppb;
    learn.beatAt = (px) => at + (px - nowX) / ppb;
    const from = at - (nowX - pinned) / ppb;
    const to = at + (w - nowX) / ppb;
    const staffLines = (x0, x1) => {
      g.fillStyle = 'rgba(44, 39, 33, 0.6)';
      for (let i = 0; i < 5; i++) g.fillRect(x0, staffTop + i * gap, x1 - x0, 1);
    };
    staffLines(0, w);
    g.textAlign = 'left';
    for (let bar = Math.ceil(from / comp.bpb); bar * comp.bpb <= to; bar++) {
      const x = Math.round(tx(bar * comp.bpb) - ppb * comp.step * 0.35);
      g.fillStyle = 'rgba(44, 39, 33, 0.75)';
      g.fillRect(x, staffTop, 1, gap * 4 + 1);
      g.fillStyle = INK_SOFT;
      g.font = '500 9.5px Recursive, sans-serif';
      g.fillText(`${barNumber(bar * comp.bpb)}`, x + 3, 30);
    }
    g.fillStyle = INK;
    g.font = '700 11px Recursive, sans-serif';
    for (const { chord, t } of chordsIn(from, to)) g.fillText(chord.name, tx(t) - 4, 14);
    const rx = gap * 0.62;
    const ry = gap * 0.43;
    for (const offset of laps()) {
      pieces.forEach((piece, i) => {
        const t = piece.t + offset;
        const length = piece.value / quarters;
        if (t + length < from - 1 || t > to) return;
        const x = tx(t);
        const sounding = t <= at + 1e-6 && at < t + length;
        const ink = sounding ? colour : INK;
        g.fillStyle = ink;
        g.strokeStyle = ink;
        const base = piece.dot ? piece.value / 1.5 : piece.value;
        const dotAt = (y) => {
          if (!piece.dot) return;
          g.beginPath();
          g.arc(x + rx + 5, y, 1.7, 0, Math.PI * 2);
          g.fill();
        };
        if (piece.rest) {
          g.font = `${gap * 3.6}px ${MUSIC_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(GLYPHS[base], x, ys(bottomStep + (base === 4 ? 5 : 4)));
          dotAt(ys(bottomStep + 5));
          return;
        }
        const heads = [...piece.heads].sort((a, b) => a.step - b.step);
        const mean = heads.reduce((sum, head) => sum + head.step, 0) / heads.length;
        const up = mean < bottomStep + 4;
        // ledger lines, short lines for notes above or below the staff
        g.fillStyle = 'rgba(44, 39, 33, 0.8)';
        const lowStep = heads[0].step;
        const highStep = heads[heads.length - 1].step;
        for (let step = bottomStep - 2; step >= lowStep; step -= 2) g.fillRect(x - rx - 4, ys(step), rx * 2 + 8, 1);
        for (let step = bottomStep + 10; step <= highStep; step += 2) g.fillRect(x - rx - 4, ys(step), rx * 2 + 8, 1);
        g.fillStyle = ink;
        // a second (two notes a step apart) puts one head on the other side of the stem
        let side = 0;
        heads.forEach((head, j) => {
          side = j && head.step - heads[j - 1].step === 1 && !side ? (up ? 1 : -1) : 0;
          const hx = x + side * rx * 1.9;
          const y = ys(head.step);
          g.beginPath();
          g.ellipse(hx, y, rx, ry, -0.35, 0, Math.PI * 2);
          if (base < 2) g.fill();
          else {
            g.lineWidth = base === 4 ? 2 : 1.5;
            g.stroke();
          }
          if (head.show) {
            g.font = `${gap * 2}px ${MUSIC_FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(GLYPHS[head.acc], x - rx - 7 - (j % 2) * 7, y);
          }
          dotAt(y - ((head.step - bottomStep) % 2 === 0 ? gap / 2 : 0));
          // a tie: a curve to the next piece, the same note held on
          const after = pieces[i + 1];
          if (piece.tie && after) {
            const x2 = tx(after.t + offset);
            const curve = up ? gap * 0.9 : -gap * 0.9;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(hx + rx * 0.8, y + curve * 0.45);
            g.quadraticCurveTo((hx + x2) / 2, y + curve * 1.3, x2 - rx * 0.8, y + curve * 0.45);
            g.stroke();
          }
        });
        if (base >= 4) return;
        const stemX = up ? x + rx - 0.7 : x - rx + 0.7;
        const stemFrom = ys(up ? lowStep : highStep);
        const stemTo = up ? ys(highStep) - gap * 3.3 : ys(lowStep) + gap * 3.3;
        g.fillRect(stemX - 0.6, Math.min(stemFrom, stemTo), 1.3, Math.abs(stemTo - stemFrom));
        // flags: one for an eighth, two for a sixteenth
        const flags = base === 0.5 ? 1 : base === 0.25 ? 2 : 0;
        g.lineWidth = 1.6;
        for (let k = 0; k < flags; k++) {
          const y0 = stemTo + (up ? 1 : -1) * k * gap * 0.85;
          const dir = up ? 1 : -1;
          g.beginPath();
          g.moveTo(stemX, y0);
          g.bezierCurveTo(stemX + gap * 0.2, y0 + dir * gap * 0.9, stemX + gap * 1.2, y0 + dir * gap * 1.1, stemX + gap * 0.8, y0 + dir * gap * 2.2);
          g.stroke();
        }
      });
    }
    g.fillStyle = colour;
    g.fillRect(Math.round(nowX) - 1, staffTop - gap * 1.5, 2, gap * 7);
    // what stays at the left: the clef (with an 8 under it for a guitar's or a bass's part, written an
    // octave up), the key signature and the time signature
    g.fillStyle = PAPER;
    g.fillRect(0, 0, pinned, h);
    staffLines(0, pinned);
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `${gap * 4.1}px ${MUSIC_FONT}`;
    g.fillText(GLYPHS[treble ? 'treble' : 'bass'], 20, treble ? ys(bottomStep) + gap * 1.05 : ys(bottomStep + 6) + gap * 1.45);
    if (shift) {
      g.font = '700 10px Recursive, sans-serif';
      g.fillText('8', 20, treble ? ys(bottomStep) + gap * 2.7 : ys(bottomStep) + gap * 1.2);
    }
    const marks = signature > 0 ? [38, 35, 39, 36, 33, 37, 34] : [34, 37, 33, 36, 32, 35, 31];
    g.font = `${gap * 2}px ${MUSIC_FONT}`;
    g.textBaseline = 'middle';
    for (let i = 0; i < Math.abs(signature); i++) g.fillText(GLYPHS[Math.sign(signature)], 40 + i * 8, ys(marks[i] - (treble ? 0 : 14)));
    const [count, unit] = song.meter.split('/');
    g.font = `900 ${gap * 2.1}px Recursive, sans-serif`;
    const tsX = 44 + Math.abs(signature) * 8 + 6;
    g.fillText(count, tsX, staffTop + gap);
    g.fillText(unit, tsX, staffTop + gap * 3);
  }

  const status = $('#mmStatus');

  // ---------- library and backups ----------
  //
  // the shelf of saved songs (library.js): open one or its history, the bin, song files and backups

  const when = (time) => new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', year: new Date(time).getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
  const ago = (time) => {
    const days = Math.floor((Date.now() - time) / 86400000);
    return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  };
  const about = (saved) => `${saved.own ? 'Your own track' : `${MOODS[saved.mood].name}${saved.flavour ? `: ${FLAVOURS[saved.mood].kinds[saved.flavour].name.toLowerCase()}` : ''}${saved.mods ? ` (${saved.mods.map(modName).join(', ')})` : ''} ${STYLES[saved.style].toLowerCase()}`} · ${NOTE_NAMES[saved.key]} ${SCALES[saved.scale].name.toLowerCase()} · ${saved.tempo} bpm`;
  const smallKey = (text, tip, action) => {
    const button = make('button', 'mm-library-forget', text);
    button.type = 'button';
    if (tip) button.dataset.tip = tip;
    button.addEventListener('click', action);
    return button;
  };
  // a save opened: the latest, notes and all, or an older one from its history (Save changes makes it
  // the latest again)
  async function openSaved(entry, version, news = `Opened "${entry.name}".`) {
    const notes = version ? null : await library.notes(entry);
    remember();
    working = { id: entry.id, json: JSON.stringify(cleanSong(entry.song)) };
    frozen = notes ? { json: working.json, print: entry.print, text: JSON.stringify(notes) } : null;
    open(version ? version.song : entry.song);
    if (version) say(`Opened "${entry.name}" as it was on ${when(version.saved)}. Save changes makes this the latest again, and the latest goes in its history.`);
    else if (asSaved) {
      say(`${news} It's playing the notes it was saved with, since the composer now writes it a little differently. Change anything and it's written again.`);
      console.warn(`"${entry.name}" plays its saved notes: composeSong no longer writes them. A composer change needs keeping (README, "Adding things").`);
    } else say(news);
    renderLibrary();
  }
  let historyOf = null;
  let binOpen = false;
  function renderLibrary() {
    const list = $('#mmLibrary');
    const entries = library.list();
    if (!library.ready) list.replaceChildren(make('li', 'mm-library-empty', 'Opening your library...'));
    else if (!entries.length) list.replaceChildren(make('li', 'mm-library-empty', 'Nothing saved yet. Press Save on a song you like.'));
    else {
      list.replaceChildren(...entries.flatMap((entry) => {
        const saved = cleanSong(entry.song);
        const isOpen = working?.id === entry.id;
        const item = make('li', isOpen ? 'is-open' : '');
        const chip = make('i', 'mm-library-chip');
        chip.style.background = MOODS[saved.mood].colour;
        const openKey = make('button', 'mm-library-name');
        openKey.type = 'button';
        const state = isOpen ? (JSON.stringify(song) === working.json ? ' · open' : ' · open, changed since saving') : '';
        openKey.append(make('span', '', entry.name), make('small', '', `${about(saved)} · saved ${when(entry.saved)}${state}`));
        openKey.addEventListener('click', () => openSaved(entry));
        const keys = make('div', 'mm-library-keys');
        if (entry.versions.length) {
          keys.append(smallKey(historyOf === entry.id ? 'Hide history' : `History (${entry.versions.length})`, 'Every earlier save of this song. Open one to hear it or carry on from it', () => {
            historyOf = historyOf === entry.id ? null : entry.id;
            renderLibrary();
          }));
        }
        keys.append(smallKey('Download', "Download it as a song file, to keep or send to someone. Add song files puts it in any browser's library, sounding just as it does here", () => downloadSong(library.songFile(entry))));
        keys.append(smallKey('Bin', 'Put it in the bin. It stays there until you delete it for good, so you can bring it back', async () => {
          await library.bin(entry.id);
          if (historyOf === entry.id) historyOf = null;
          renderLibrary();
          renderSaveState();
          say(`"${entry.name}" is in the bin, under your library. Restore brings it back.`);
        }));
        item.append(chip, openKey, keys);
        if (historyOf !== entry.id) return [item];
        const older = make('li', 'mm-library-history');
        const versions = make('ol');
        for (const version of entry.versions) {
          const row = make('li');
          const back = make('button', 'mm-library-name');
          back.type = 'button';
          back.append(make('span', '', when(version.saved)), make('small', '', `${version.name !== entry.name ? `${version.name} · ` : ''}${about(cleanSong(version.song))}`));
          back.addEventListener('click', () => openSaved(entry, version));
          row.append(back);
          versions.append(row);
        }
        older.append(versions);
        return [item, older];
      }));
    }
    // the bin: songs put there, until they're deleted for good
    const binned = library.list(true);
    const bin = $('#mmBin');
    bin.hidden = !binned.length;
    const binKey = $('#mmBinKey');
    binKey.textContent = binOpen ? `Hide the bin (${binned.length})` : `Bin (${binned.length})`;
    binKey.setAttribute('aria-expanded', binOpen);
    const binList = $('#mmBinList');
    binList.hidden = !binOpen;
    binList.replaceChildren(...binned.map((entry) => {
      const item = make('li');
      const chip = make('i', 'mm-library-chip');
      chip.style.background = MOODS[cleanSong(entry.song).mood].colour;
      const name = make('div', 'mm-library-name');
      name.append(make('span', '', entry.name), make('small', '', `binned ${when(entry.binned)}`));
      const keys = make('div', 'mm-library-keys');
      keys.append(
        smallKey('Restore', 'Back into your library, history and all', async () => {
          await library.unbin(entry.id);
          renderLibrary();
          say(`"${library.get(entry.id).name}" is back in your library.`);
        }),
        smallKey('Delete', 'Gone for good, history and all, unless a backup has it', async () => {
          if (!confirm(`Delete "${entry.name}" for good? It can't be brought back, unless it's in a backup.`)) return;
          await library.destroy(entry.id);
          renderLibrary();
          say(`Deleted "${entry.name}".`);
        }),
      );
      item.append(chip, name, keys);
      return item;
    }));
    // when it was last backed up, and how many songs have been saved since
    let backedUp = 0;
    try { backedUp = +localStorage.getItem(BACKED_UP_KEY) || 0; } catch { /* never */ }
    const all = [...library.songs.values()];
    const since = all.filter((entry) => entry.saved > backedUp).length;
    $('#mmBackupNote').textContent = !all.length ? 'A backup is every song in your library as one file, history and all, to keep somewhere safe or open in another browser.'
      : !backedUp ? "Your songs are only in this browser. Clearing its data would lose them, and Safari clears a site's data when it hasn't been visited for a few weeks. Back up to keep them as a file."
      : `Last backed up ${ago(backedUp)}.${since ? ` ${since} ${since === 1 ? 'song has' : 'songs have'} been saved since.` : ' Nothing new since.'}`;
    $('#mmBackupNote').classList.toggle('is-warn', !!all.length && (!backedUp || since > 0));
  }
  $('#mmBinKey').addEventListener('click', () => {
    binOpen = !binOpen;
    renderLibrary();
  });
  $('#mmBackup').addEventListener('click', () => {
    const day = new Date().toISOString().slice(0, 10);
    download(new Blob([JSON.stringify(library.backup())], { type: 'application/json' }), `squimble-songs-${day}.json`);
    try { localStorage.setItem(BACKED_UP_KEY, String(Date.now())); } catch { /* the note just won't know */ }
    renderLibrary();
    say(`Downloaded squimble-songs-${day}.json: every song in your library, history and all. Restore opens it in any browser.`);
  });
  // backups and song files into the library (Restore, Add song files). it only ever adds: a song already
  // here gets any saves the file has that it doesn't. a single song file opens as well
  async function addFiles(input) {
    const files = [...input.files];
    input.value = '';
    await libraryReady;
    const total = { added: 0, merged: 0, same: 0 };
    const bad = [];
    let only = null;
    for (const file of files) {
      try {
        const data = JSON.parse(await file.text());
        const counts = await library.restore(data);
        for (const key of Object.keys(total)) total[key] += counts[key];
        if (files.length === 1 && data.squimble !== 'music library' && counts.ids.length === 1) only = library.get(counts.ids[0]);
      } catch {
        bad.push(file.name);
      }
    }
    renderLibrary();
    renderSaveState();
    if (only) return openSaved(only, null, total.added ? `Added "${only.name}" to your library.` : `"${only.name}" is in your library already, so it's opened that.`);
    const parts = [total.added && `${total.added} new`, total.merged && `${total.merged} given saves they were missing`, total.same && `${total.same} already here`].filter(Boolean);
    say(`${parts.length ? `Added: ${parts.join(', ')}.` : ''}${bad.length ? ` ${bad.join(', ')} ${bad.length === 1 ? "isn't" : "aren't"} a backup or a song file.` : ''}`.trim());
  }
  $('#mmRestore').addEventListener('change', (event) => addFiles(event.target));
  $('#mmOpen').addEventListener('change', (event) => addFiles(event.target));
  const downloadSong = (file) => {
    download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${fileName(file.name)}.json`);
    say(`Downloaded ${fileName(file.name)}.json. Add song files puts it in any browser's library, sounding just like this.`);
  };
  // notes for songs saved before the library kept them, one at a time, never while one's playing
  const noNotes = new Set();
  function fillNotes() {
    const entry = [...library.songs.values()].find((one) => !one.notes && !noNotes.has(one.id));
    if (!entry) return;
    if (player.playing) {
      setTimeout(fillNotes, 4000);
      return;
    }
    noNotes.add(entry.id);
    let notes = null;
    try { notes = composeSong(cleanSong(entry.song)).notes; } catch { /* it plays as it can */ }
    (notes ? library.addNotes(entry.id, notes) : Promise.resolve()).then(() => setTimeout(fillNotes, 300));
  }

  // ---------- exports ----------

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
  // the open song as a song file (library.songFile), with the notes it plays now, so it sounds the same
  // in any browser. an unchanged save goes as that save; anything else as a new save of the open song
  $('#mmFile').addEventListener('click', async () => {
    if (needCompose) changed(false);
    const here = working && JSON.stringify(song) === working.json ? library.get(working.id) : null;
    const now = Date.now();
    const notes = comp.notes;
    downloadSong(library.songFile({ id: working?.id || newId(), name: song.name, created: here?.created || now, saved: here?.saved || now, song: clone(song), notes: await packNotes(notes), print: notesPrint(notes) }));
  });

  // ---------- links ----------
  //
  // a link is the seed and the settings that make the song from it, #seed/mood/style/modifiers/flavour,
  // then anything changed since (songChanges in music.js), deflated and in url safe base64. a track made
  // by hand has no seed, so its link is its changes from a blank track, #/changes. old #song= links
  // (the whole song, thousands of characters) still open. the byte helpers are library.js's
  const toBase64 = (bytes) => bytesToText(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromBase64 = (text) => textToBytes(text.replace(/-/g, '+').replace(/_/g, '/'));
  // (numbers to four places, notesJson: sixteen digit volumes nearly doubled a remixed band's link)
  const pack = async (thing) => toBase64(await squeezeBytes(new TextEncoder().encode(notesJson(thing)), new CompressionStream('deflate-raw')));
  const unpack = async (text) => JSON.parse(new TextDecoder().decode(await squeezeBytes(fromBase64(text), new DecompressionStream('deflate-raw'))));
  const fromOldLink = (text) => JSON.parse(new TextDecoder().decode(fromBase64(text)));
  // the song a link starts from: the seed's, or a blank track
  const linkBase = (one) => (one.own ? blankSong() : generateSong(one.mood, one.style, one.seed, one.mods, one.flavour));
  async function songLink(one) {
    const changes = songChanges(linkBase(one), cleanSong(one));
    const tail = changes ? await pack(changes) : '';
    let fields = [one.seed, one.mood, one.style, (one.mods || []).join('+'), one.flavour || '', tail];
    // (the modifiers, flavour and changes are left off when there are none)
    while (fields.length > 3 && !fields[fields.length - 1]) fields.pop();
    if (one.own) fields = ['', tail];
    return `${location.origin}${location.pathname}#${fields.map(encodeURIComponent).join('/')}`;
  }
  const isLink = (hash) => hash.startsWith('#song=') || hash.includes('/');
  // a link's song and its changes, still packed, so the page opens on the song while they unpack
  function readLink(hash) {
    if (hash.startsWith('#song=')) return [cleanSong(fromOldLink(hash.slice(6))), ''];
    const fields = hash.slice(1).split('/').map(decodeURIComponent);
    if (!fields[0]) return [blankSong(), fields[1] || ''];
    const [seed, mood, style, mods, flavour, tail] = fields;
    return [generateSong(mood, style, seed, mods ? mods.split('+') : [], flavour || undefined), tail || ''];
  }
  $('#mmLink').addEventListener('click', async () => {
    let url = '';
    try {
      url = await songLink(song);
      await navigator.clipboard.writeText(url);
      status.textContent = `Link copied (${url.length} characters). Anyone who opens it hears this song.`;
    } catch {
      status.textContent = url || "Couldn't make a link in this browser. Download the song file instead.";
    }
  });

  // ---------- playing from the keyboard ----------

  // the computer keyboard as a piano for the open layer, as music software lays it out: a s d f... the
  // white keys from a C, the row above the black ones, z and x an octave. a kit's drums are a s d f...
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

  // a note played in while recording, on the grid in its section's part. one already at the same time
  // and pitch is replaced, so playing along round the loop doesn't pile up copies
  function recordNote(layer, played, from, to) {
    if (!layerById(layer.id)) return;
    const grid = comp.step;
    const at = (Math.round(from / grid) * grid) % comp.beats;
    const sec = comp.sections.find((one) => at < one.end - 1e-6) || comp.sections[comp.sections.length - 1];
    if (!sec.play.includes(layer.id)) return say(`The ${ROLES[layer.role].name.toLowerCase()} isn't playing in ${sec.name}, so that wasn't kept. Turn it on there in Arrange.`);
    // (a note held over the end of the loop finishes at the start)
    const length = to >= from ? to - from : to + comp.beats - from;
    // (kept in the song's own key, since it's lifted again where it plays. a drum isn't a pitch)
    const midi = layer.role === 'drums' ? played : played - (sec.lift || 0);
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
    if (learn?.data?.events.length && !typing && !player.playing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      stepMarker(event.key === 'ArrowRight' ? 1 : -1);
    }
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
    // asked for first, so one frame going wrong can't stop drawing for good (old safari did that)
    requestAnimationFrame(frame);
    if (needCompose) changed(false);
    if (needMix) {
      needMix = false;
      load();
      scoreDirty = true;
      keepDraft();
    }
    if (!player.playing && playKey.classList.contains('is-playing')) renderTransport();
    drawScore();
    renderReadout();
    if (editor && player.playing) editor.draw();
    if (learn) drawLearn();
  }

  // ---------- start ----------

  // the song in the address bar's link, if there is one. its changes come in once they're unpacked
  function fromAddress() {
    if (!isLink(location.hash)) return null;
    try {
      const [linked, tail] = readLink(location.hash);
      history.replaceState(null, '', location.pathname);
      if (tail) unpack(tail).then((changes) => { detach(); open(withChanges(linked, changes)); }).catch(() => say("Couldn't read the changes in that link, so this is the song its seed makes."));
      return linked;
    } catch {
      return null;
    }
  }
  // (a link pasted into a tab that already has the page open only changes the hash, it doesn't reload)
  window.addEventListener('hashchange', () => {
    const linked = fromAddress();
    if (!linked) return;
    remember();
    detach();
    open(linked);
  });
  let fromLink = false;
  function firstSong() {
    const linked = fromAddress();
    fromLink = !!linked;
    if (linked) return linked;
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft) return cleanSong(draft);
    } catch { /* nothing kept */ }
    return generateSong('calm', 'ambient', newSeed(randomRng()));
  }
  // unstamped songs saved after composer 1.5 was committed (the morning of 22 october) can only be its,
  // so they're marked once (and the draft, if it's one of them), their composer 1 notes dropped. ones
  // saved before then could be either: the Song tab's Composer picks
  const MORNING = Date.UTC(2026, 9, 22, 7, 18, 33);
  async function markMorningSongs() {
    try {
      if (localStorage.getItem('squimble-music-marked-1.5')) return;
    } catch { return; }
    const draft = JSON.stringify(song);
    const mark = (one) => (!one.song.composer && one.saved >= MORNING ? { ...one, song: { ...one.song, composer: 1.5 } } : one);
    for (const entry of [...library.songs.values()]) {
      const { notes, print, ...rest } = entry;
      const marked = { ...mark(rest), versions: rest.versions.map(mark) };
      if (JSON.stringify(marked) === JSON.stringify(rest)) continue;
      await library.put(marked.song === rest.song ? { ...marked, ...(notes ? { notes, print } : {}) } : marked);
      if (marked.song !== rest.song && draft === JSON.stringify(cleanSong(rest.song))) {
        song = cleanSong({ ...song, composer: 1.5 });
        changed();
      }
    }
    try { localStorage.setItem('squimble-music-marked-1.5', '1'); } catch { /* it'll look again */ }
  }
  // (which save was open last time, read before opening the song keeps the draft and writes over it)
  let wasOpen = '';
  try { wasOpen = localStorage.getItem(WORKING_KEY) || ''; } catch { /* none */ }
  open(firstSong());
  renderLibrary();
  // the library opens a moment later. the song left open last time, if it was a save, is still that
  // save, and plays the notes it saved if it hasn't changed since
  const libraryReady = library.start().then(async () => {
    await markMorningSongs();
    const id = wasOpen;
    const entry = !fromLink && id && library.get(id);
    if (entry && !entry.binned) {
      working = { id, json: JSON.stringify(cleanSong(entry.song)) };
      const notes = JSON.stringify(song) === working.json && await library.notes(entry);
      if (notes && JSON.stringify(song) === working.json) {
        frozen = { json: working.json, print: entry.print, text: JSON.stringify(notes) };
        changed();
      }
      keepDraft();
    }
    library.onchange = () => { renderLibrary(); renderSaveState(); };
    renderLibrary();
    renderTop();
    setTimeout(fillNotes, 1500);
  });
  showTip();
  requestAnimationFrame(frame);
})();
