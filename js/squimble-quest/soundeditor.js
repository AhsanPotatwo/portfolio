// the sound editor: a full screen synthesiser for making and changing the sounds in the library
// (SOUNDS, sound.js). open it from the map editor's Sounds tab (New, Edit, or right click a sound in
// the palette) or from a sound block's settings (Edit sound).
//   - top: the sound's name, Undo, Cancel and Save. saving under a different name makes a copy
//   - left: the visualiser (a close-up of the wave and the whole sound, both from the real audio),
//     Play / Stop / Loop, a piano that plays the sound at other notes, and the "make one" buttons,
//     which come up with a random sound of that kind (like the old sfxr), plus Random and Mutate
//   - right: a button for each wave (file picks an mp3, wav or ogg), then a slider for every
//     SOUND_SETTINGS entry in its section. hover over a slider for a tip along the bottom, right
//     click it to put it back to normal, or scroll over it to nudge it
// with Loop on, changing anything while it plays starts it again straight away, so you can hear what a
// slider does while you drag it. Save changes the sound in the game straight away, and Export (next
// to New in the inspector) downloads sounds.json and any audio files chosen since the page loaded.
// it's a ui group over the whole screen, like the warp graph (warpgraph.js), and the map editor hands
// it the updates while it's open (Editor.update())

// layout, in screen px
const SOUND_EDITOR = {
  headerHeight: 36,
  footerHeight: 30,
  // the left column
  left: 16,
  leftWidth: 300,
  // the right side: where it starts, each column of sliders' width, and the gap between columns
  right: 336,
  columnWidth: 296,
  columnGap: 16,
  // where the sliders start, each slider's height, and the room for a section's heading
  slidersTop: 100,
  rowHeight: 23,
  sectionHeight: 20,
  // which SOUND_SETTINGS sections go in each column of sliders
  columns: [['Pitch', 'Tone'], ['Volume shape', 'Effects']],
  // the piano's lowest note (note numbers like noteFrequency() in sound.js, 48 is C4) and how many
  // white keys it has (15 is two octaves)
  pianoFrom: 48,
  whiteKeys: 15,
};

// a random number from a to b, rounded to one decimal place, for the generators
const randomNumber = (a, b) => Math.round(randomBetween(a, b) * 10) / 10;
// one thing from a list at random
const randomPick = (list) => list[Math.floor(randomBetween(0, list.length))];
// value half the time, otherwise undefined (which leaves that setting normal)
const sometimes = (value) => (randomBetween(0, 1) < 0.5 ? value : undefined);

// the "make one" buttons: each comes up with a random sound of its kind, as settings on top of the
// normal ones (anything left out stays normal). a new kind is just a new line here
const SOUND_GENERATORS = {
  Coin: () => ({ wave: randomPick(['square', 'sine', 'triangle']), pitch: randomNumber(700, 1400), jump: randomPick([3, 4, 5, 7, 12]), jumpAt: randomNumber(40, 100), attack: 0, sustain: randomNumber(30, 90), punch: randomNumber(30, 60), decay: randomNumber(100, 300), pulseWidth: randomNumber(20, 50) }),
  Laser: () => ({ wave: randomPick(['square', 'sawtooth', 'sine']), pitch: randomNumber(500, 2000), slide: -randomNumber(40, 150), slideAccel: randomNumber(-50, 50), attack: 0, sustain: randomNumber(40, 150), decay: randomNumber(50, 200), pulseWidth: randomNumber(10, 50), pulseSweep: randomNumber(-50, 50), highPass: sometimes(randomNumber(5, 30)) }),
  Explosion: () => ({ wave: 'noise', pitch: randomNumber(80, 600), slide: -randomNumber(5, 30), attack: 0, sustain: randomNumber(80, 300), punch: randomNumber(20, 70), decay: randomNumber(300, 900), flanger: sometimes(randomNumber(1, 8)), flangerSweep: sometimes(randomNumber(-10, 10)), crush: sometimes(randomNumber(10, 50)), lowPass: randomNumber(60, 100), volume: 80 }),
  'Power-up': () => ({ wave: randomPick(['square', 'sawtooth', 'triangle']), pitch: randomNumber(200, 600), slide: randomNumber(15, 60), vibrato: sometimes(randomNumber(0.2, 1)), vibratoSpeed: randomNumber(8, 20), attack: 0, sustain: randomNumber(150, 350), decay: randomNumber(80, 300), repeats: randomPick([1, 1, 2, 3]), gap: randomNumber(20, 60) }),
  Hit: () => ({ wave: randomPick(['noise', 'noise', 'sawtooth', 'square']), pitch: randomNumber(150, 900), slide: -randomNumber(30, 100), attack: 0, sustain: randomNumber(10, 60), decay: randomNumber(40, 160), punch: randomNumber(0, 50), highPass: sometimes(randomNumber(5, 30)), volume: 70 }),
  Jump: () => ({ wave: 'square', pitch: randomNumber(200, 500), slide: randomNumber(25, 80), attack: 0, sustain: randomNumber(50, 150), decay: randomNumber(50, 150), pulseWidth: randomNumber(20, 50), lowPass: sometimes(randomNumber(50, 90)) }),
  Blip: () => ({ wave: randomPick(['square', 'sine', 'triangle']), pitch: randomNumber(300, 1500), attack: 0, sustain: randomNumber(20, 80), decay: randomNumber(10, 60), pulseWidth: randomNumber(20, 50), highPass: sometimes(randomNumber(5, 30)) }),
  Bell: () => ({ wave: randomPick(['sine', 'triangle', 'organ']), pitch: randomNumber(500, 2000), attack: randomNumber(0, 5), sustain: 0, decay: randomNumber(400, 1500), vibrato: sometimes(randomNumber(0.05, 0.3)), vibratoSpeed: randomNumber(3, 8), repeats: randomPick([1, 1, 2]), gap: randomNumber(20, 80) }),
  // made to loop smoothly (nothing moving the pitch), for loop sound blocks
  Hum: () => ({ wave: randomPick(['organ', 'sine', 'triangle', 'sawtooth']), pitch: randomNumber(55, 180), attack: 0, sustain: randomNumber(1000, 2000), decay: 0, lowPass: randomNumber(40, 90), volume: 70, range: 5 }),
};

const SoundEditor = {
  active: false,
  // the sound being changed. a copy, so nothing changes in the game until Save
  draft: null,
  // its name when the editor opened, '' for a new sound
  original: '',
  // ui elements kept to change later: the name field, each setting's slider by key, and buttons
  nameField: null,
  sliders: {},
  loopButton: null,
  saveButton: null,
  undoButton: null,
  // section headings to draw, { text, x, y }
  headings: [],
  // earlier drafts for Undo (from the make one buttons, Random, Mutate, waves and files)
  history: [],
  // audio Files chosen since the page loaded, by file name. Export downloads these too, since the game
  // only loads audio from its own folder
  newFiles: {},
  // the draft as text and the pitch the last time it started playing, so Loop knows to start it again
  // when something changes, and when that was (millis())
  playedAs: null,
  playedPitch: null,
  playedAt: 0,

  // opens it on a sound from SOUNDS, or a new one with no name
  open(name = null) {
    this.active = true;
    this.original = name ?? '';
    this.draft = soundSettings(name ? SOUNDS[name] : {});
    this.history = [];
    this.headings = [];
    this.sliders = {};
    // keys go into the name field (input.js)
    Input.typing = true;
    Sound.stopAll();

    const L = SOUND_EDITOR;
    const add = (element) => UI.add(Object.assign(element, { group: 'sound-editor' }));
    add(new SoundEditorPanel({ x: 0, y: 0, w: GAME_W, h: GAME_H }));

    // the top: name, Undo, Cancel and Save
    this.nameField = add(new TextField({ x: 170, y: 6, w: 160, h: 24, value: name ?? '' }));
    this.nameField.focus();
    this.undoButton = add(new Button({ x: GAME_W - 280, y: 6, w: 80, h: 24, label: 'Undo', style: 'editor', onClick: () => this.undo() }));
    add(new Button({ x: GAME_W - 194, y: 6, w: 80, h: 24, label: 'Cancel', style: 'editor', onClick: () => this.close() }));
    this.saveButton = add(new Button({ x: GAME_W - 108, y: 6, w: 92, h: 24, label: 'Save', style: 'editorPrimary', onClick: () => this.save() }));

    // the left: visualiser, Play / Stop / Loop, piano, make one buttons
    const x = L.left;
    add(new SoundVisualiser({ x, y: 48, w: L.leftWidth, h: 176, sound: () => this.draft }));
    add(new Button({ x, y: 232, w: 100, h: 26, label: '▶  Play', style: 'editorPrimary', onClick: () => this.play() }));
    add(new Button({
      x: x + 104, y: 232, w: 92, h: 26, label: '■  Stop', style: 'editor',
      onClick: () => {
        this.loopButton.on = false;
        Sound.stopPreview();
      },
    }));
    this.loopButton = add(new Button({
      x: x + 200, y: 232, w: 100, h: 26, label: '↻  Loop', style: 'editor', toggle: true,
      onClick: (button) => (button.on ? this.play(this.playedPitch) : Sound.stopPreview()),
    }));
    add(new SoundPiano({ x, y: 266, w: L.leftWidth, h: 62, onPlay: (note) => this.play(noteFrequency(note)) }));
    const makers = [...Object.keys(SOUND_GENERATORS), 'Random', 'Mutate'];
    makers.forEach((label, i) => add(new Button({
      x: x + (i % 3) * 102, y: 356 + Math.floor(i / 3) * 30, w: 96, h: 24, label, style: label === 'Random' || label === 'Mutate' ? 'editorPrimary' : 'editor',
      onClick: () => (label === 'Mutate' ? this.mutate() : this.generate(label)),
    })));

    // the right: a button for each wave, then the sliders, section by section
    Object.keys(SOUND_WAVES).forEach((wave, i) => add(new EditorButton({
      x: L.right + i * 66, y: 54, w: 62, h: 24, label: SOUND_WAVES[wave].label,
      isOn: () => this.draft.wave === wave,
      // file asks for a file the first time, and goes back to the chosen one after that
      onClick: () => (wave === 'file' && !this.draft.file ? this.chooseFile() : this.change({ wave })),
    })));
    add(new Button({ x: L.right + Object.keys(SOUND_WAVES).length * 66, y: 54, w: 140, h: 24, label: 'Choose file...', style: 'editor', onClick: () => this.chooseFile() }));
    L.columns.forEach((sections, c) => {
      const columnX = L.right + c * (L.columnWidth + L.columnGap);
      let y = L.slidersTop;
      for (const section of sections) {
        this.headings.push({ text: section, x: columnX, y });
        y += L.sectionHeight;
        for (const setting of SOUND_SETTINGS.filter((s) => s.section === section)) {
          // tip is shown by SoundEditorPanel while it's hovered
          this.sliders[setting.key] = add(Object.assign(new Slider({
            ...setting,
            x: columnX, y, w: L.columnWidth, h: L.rowHeight,
            value: this.draft[setting.key],
            format: (value) => this.formatSetting(setting, value),
            onChange: (value) => { this.draft[setting.key] = value; },
          }), { tip: setting.tip }));
          y += L.rowHeight;
        }
      }
    });
  },

  // what a setting's slider shows on its right
  formatSetting(setting, value) {
    if (setting.key === 'pitch') return this.draft.wave === 'file' ? `${Math.round((value / 440) * 100)}% speed` : `${value} Hz  ${noteName(value)}`;
    if (setting.off === value) return 'off';
    return `${value} ${setting.unit}`;
  },

  close() {
    this.active = false;
    Input.typing = false;
    Sound.stopPreview();
    UI.removeGroup('sound-editor');
  },

  // why it can't be saved (shown along the bottom, and Save is greyed out), or null
  problem() {
    const name = cleanMapName(this.nameField.value); // mapfile.js, sound names follow the same rules
    if (!name) return 'Type a name for it at the top';
    if (name !== this.original && SOUNDS[name]) return `There's already a sound called ${name}, pick another name`;
    if (this.draft.wave === 'file' && !this.draft.file) return 'Choose an audio file first';
    return null;
  },

  // puts the sound in the library (straight into the game), picks it in the palette, and closes
  save() {
    if (this.problem()) return;
    const name = cleanMapName(this.nameField.value);
    setSound(name, this.draft);
    Editor.pick({ kind: 'sound', name });
    showMessage(`Saved ${name}. Export sounds in the inspector to keep it`);
    this.close();
  },

  // every frame while it's open, from Editor.update()
  update() {
    for (const key of Input.typed) {
      if (key === 'Enter') return this.save();
      if (key === 'Escape') return this.close();
      if (key.paste !== undefined) this.nameField.paste(key.paste);
      else if (key !== 'Tab') this.nameField.type(key);
    }
    // sliders that don't do anything with the other settings as they are get greyed out
    const d = this.draft;
    const matters = {
      pulseWidth: d.wave === 'square',
      pulseSweep: d.wave === 'square',
      resonance: d.lowPass < 100 || d.lowPassSweep !== 0,
      jumpAt: d.jump !== 0,
      vibratoSpeed: d.vibrato > 0,
      gap: d.repeats > 1,
    };
    for (const [key, slider] of Object.entries(this.sliders)) slider.enabled = matters[key] ?? true;
    this.saveButton.enabled = this.problem() === null;
    this.undoButton.enabled = this.history.length > 0;
    // with Loop on, start it again when something changes (at most every 0.1s, since the sound has to
    // be worked out again each time)
    if (this.loopButton.on && JSON.stringify(d) !== this.playedAs && millis() - this.playedAt > 100) this.play(this.playedPitch);
  },

  // plays the draft at full volume, at another pitch for the piano, looping if Loop is on
  play(pitch = null) {
    this.playedAs = JSON.stringify(this.draft);
    this.playedPitch = pitch;
    this.playedAt = millis();
    Sound.preview(this.draft, { loop: this.loopButton.on, pitch: pitch ?? this.draft.pitch });
  },

  // swaps in new settings (keeping Undo's history), moving every slider to match, and plays it
  replace(settings) {
    this.history.push(this.draft);
    this.draft = soundSettings(settings);
    for (const [key, slider] of Object.entries(this.sliders)) {
      slider.set(this.draft[key]);
      // the slider rounds it to its step
      this.draft[key] = slider.value;
    }
    this.play();
  },

  // changes some settings, keeping the rest
  change(settings) {
    this.replace({ ...this.draft, ...settings });
  },

  // a random sound from a make one button, or anything at all for Random. heard from stays the same,
  // since that's about where it goes rather than how it sounds
  generate(kind) {
    const settings = kind === 'Random' ? this.randomSettings() : SOUND_GENERATORS[kind]();
    this.replace({ ...settings, range: this.draft.range });
  },

  // a completely random sound: a random wave, and about half the settings moved somewhere random. the
  // volume shape is kept short enough to hear what it is
  randomSettings() {
    const settings = { wave: randomPick(Object.keys(SOUND_WAVES).filter((wave) => wave !== 'file')) };
    for (const setting of SOUND_SETTINGS) {
      if (['volume', 'range', 'repeats', 'gap'].includes(setting.key) || randomBetween(0, 1) < 0.5) continue;
      settings[setting.key] = Slider.prototype.valueAt.call(setting, randomBetween(0, 1));
    }
    settings.attack = Math.min(settings.attack ?? 5, 300);
    settings.sustain = randomNumber(30, 400);
    settings.decay = Math.min(settings.decay ?? 100, 800);
    return settings;
  },

  // nudges about half the settings a little bit along their sliders, for a sound that's similar but
  // different
  mutate() {
    const settings = { ...this.draft };
    for (const setting of SOUND_SETTINGS) {
      if (setting.key === 'range' || randomBetween(0, 1) < 0.5) continue;
      const slider = this.sliders[setting.key];
      settings[setting.key] = slider.valueAt(Math.min(1, Math.max(0, slider.positionOf(settings[setting.key]) + randomBetween(-0.06, 0.06))));
    }
    this.replace(settings);
  },

  undo() {
    if (this.history.length === 0) return;
    this.replace(this.history.pop());
    // replace() just saved the undone one, which shouldn't be undoable back to
    this.history.pop();
  },

  // lets you pick an audio file (pickFile() in utils.js) and uses it as the wave, held for as long as
  // the file is. everything else goes back to normal so it starts off sounding just like the file
  chooseFile() {
    pickFile('audio/*,.mp3,.wav,.ogg', (file) => {
      file.arrayBuffer()
        .then(decodeAudio) // sound.js
        .then((decoded) => {
          SOUND_FILES[file.name] = decoded;
          audioFilesAsked.add(file.name);
          this.newFiles[file.name] = file;
          this.replace({ wave: 'file', file: file.name, attack: 0, sustain: Math.round(decoded.seconds * 1000), decay: 0, volume: this.draft.volume, range: this.draft.range });
          if (decoded.seconds * 1000 > SOUND_SETTINGS.find((s) => s.key === 'sustain').max) showMessage(`${file.name} is long, only the start of it is used`);
        })
        .catch(() => showMessage(`Couldn't open ${file.name} as audio`));
    });
  },

  // downloads sounds.json (sound.js) and any audio file chosen since the page loaded that a sound
  // uses, then says where they go (the download helpers are in utils.js). the inspector's Export
  // button on the Sounds tab
  exportSounds() {
    downloadTextFile('sounds.json', soundsToText());
    const files = [...new Set(Object.values(SOUNDS).map((sound) => sound.file))].filter((name) => this.newFiles[name]);
    for (const name of files) downloadData(name, this.newFiles[name]);
    const also = files.length > 0 ? `, and ${files.join(', ')} in sounds/files/` : '';
    showMessage(`Exported! Put sounds.json in assets/squimble-quest/sounds/${also}`);
  },
};

// the background of the whole sound editor, its headings and labels, and the tip line along the
// bottom. covers the whole screen, so nothing behind it can be clicked
class SoundEditorPanel extends UIElement {
  draw() {
    const L = SOUND_EDITOR;
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.bar);
    rect(0, 0, GAME_W, GAME_H);
    fill(C.header);
    rect(0, 0, GAME_W, L.headerHeight);
    rect(0, GAME_H - L.footerHeight, GAME_W, L.footerHeight);
    fill(C.edge);
    rect(0, L.headerHeight, GAME_W, 1);
    rect(0, GAME_H - L.footerHeight, GAME_W, 1);

    fill(C.text);
    setText(14, BOLD, LEFT, CENTER);
    text('Sound editor', 16, L.headerHeight / 2);
    fill(C.dimText);
    setText(12, BOLD, LEFT, CENTER);
    text('Name', 130, L.headerHeight / 2);

    // headings
    setText(11, BOLD, LEFT, TOP);
    fill(C.dimText);
    text('WAVE', L.right, 40);
    text('MAKE ONE  (a random sound of that kind)', L.left, 340);
    for (const heading of SoundEditor.headings) {
      fill(C.dimText);
      text(heading.text.toUpperCase(), heading.x, heading.y + 4);
      fill(C.edge);
      rect(heading.x + textWidth(heading.text.toUpperCase()) + 8, heading.y + 10, L.columnWidth - textWidth(heading.text.toUpperCase()) - 8, 1);
    }
    // which file a file sound uses
    const draft = SoundEditor.draft;
    if (draft.wave === 'file') {
      fill(SOUND_COLOURS.edge);
      setText(11, BOLD, LEFT, CENTER);
      text(draft.file ? `${draft.file}${SOUND_FILES[draft.file] ? '' : ' (not loaded)'}` : 'no file chosen', L.right, 87);
    }

    // along the bottom: what's stopping it saving in red, else the tip for the slider under the mouse
    const problem = SoundEditor.problem();
    const slider = UI.hovered instanceof Slider ? UI.hovered : null;
    setText(11, BOLD, LEFT, CENTER);
    fill(problem && !slider ? C.erase : C.dimText);
    const hint = 'Hover over a slider to see what it does. Right click one to put it back to normal, or scroll over it to nudge it';
    text(slider ? `${slider.label}: ${slider.tip}` : problem ?? hint, 16, GAME_H - L.footerHeight / 2);
  }
}

// the picture of the sound being edited, read every frame so it changes as you go, in two panels:
//   wave         a close-up of a few waves from just after it gets loud, from the real audio, so
//                filters and crunch show too. more waves for a higher pitch, taller when louder
//   whole sound  the whole thing from start to end (drawSoundShape() in sound.js), with a line moving
//                along it while it plays
// and its note, pitch and length underneath.
//   sound  () => the settings to draw
class SoundVisualiser extends UIElement {
  constructor(options) {
    // just for show, clicks go through to what's behind
    super({ ...options, interactive: false });
    this.sound = options.sound;
  }

  draw() {
    const sound = this.sound();
    const { samples, seconds } = Sound.render(sound);
    const { x, w } = this;
    // two panels with a gap, and room for the words at the bottom
    const h = (this.h - 22 - 6) / 2;
    const closeUpY = this.y;
    const wholeY = this.y + h + 6;
    for (const [top, label] of [[closeUpY, 'wave'], [wholeY, 'whole sound']]) {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(x, top, w, h);
      // the middle line, where it's silent
      fill(EDITOR_COLOURS.edge);
      rect(x, top + h / 2, w, 1);
      fill(EDITOR_COLOURS.dimText);
      setText(9, BOLD, LEFT, TOP);
      text(label, x + 4, top + 3);
    }

    // the close-up: some waves (or a hundredth of a second of noise or a file) from just after it gets
    // loud
    const startSeconds = sound.attack / 1000 + Math.min(sound.sustain / 2000, 0.05);
    const start = Math.min(samples.length - 1, Math.floor(startSeconds * SOUND_RATE));
    const spanSeconds = SOUND_WAVES[sound.wave].shape ? closeUpCycles(sound.pitch) / sound.pitch : 0.01;
    const span = Math.max(8, Math.round(spanSeconds * SOUND_RATE));
    const inner = w - 8;
    const middle = closeUpY + h / 2 + 4;
    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i <= inner; i++) vertex(x + 4 + i, middle - (samples[start + Math.floor((i / inner) * span)] ?? 0) * (h / 2 - 8));
    endShape();

    // the whole sound
    strokeWeight(1);
    drawSoundShape(sound, x + 4, wholeY + 12, inner, h - 16);

    // the moving line while it plays (it goes round and round while looping)
    const preview = Sound.previewing;
    if (preview) {
      const played = (millis() - preview.started) / 1000;
      if (preview.loop || played < preview.seconds) {
        const along = (played % preview.seconds) / preview.seconds;
        stroke(255);
        line(x + 4 + along * inner, wholeY, x + 4 + along * inner, wholeY + h);
      }
    }

    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, CENTER);
    const pitch = sound.wave === 'file' ? `${Math.round((sound.pitch / 440) * 100)}% speed` : `${noteName(sound.pitch)}  ·  ${sound.pitch} Hz`;
    text(`${pitch}  ·  ${Math.round(seconds * 1000)} ms`, x + w / 2, this.y + this.h - 10);
  }
}

// a little piano that plays the sound at each note (onPlay(note), note numbers like noteFrequency()
// in sound.js). everything that's in notes (slide, jump, vibrato) moves with it
class SoundPiano extends UIElement {
  constructor(options) {
    super(options);
    this.onPlay = options.onPlay;
    // the note being held down, or null
    this.held = null;
    // every key as { note, x, y, w, h, black }, black keys first since they sit on top
    const whiteW = this.w / SOUND_EDITOR.whiteKeys;
    const whites = [];
    const blacks = [];
    // how many notes up from C each white key is, and which have a black key just after them
    const steps = [0, 2, 4, 5, 7, 9, 11];
    for (let k = 0; k < SOUND_EDITOR.whiteKeys; k++) {
      const note = SOUND_EDITOR.pianoFrom + 12 * Math.floor(k / 7) + steps[k % 7];
      whites.push({ note, x: this.x + k * whiteW, y: this.y, w: whiteW, h: this.h, black: false });
      if (k < SOUND_EDITOR.whiteKeys - 1 && ![4, 11].includes(steps[k % 7])) {
        blacks.push({ note: note + 1, x: this.x + (k + 1) * whiteW - whiteW * 0.3, y: this.y, w: whiteW * 0.6, h: this.h * 0.6, black: true });
      }
    }
    this.keys = [...blacks, ...whites];
  }

  keyAt(px, py) {
    return this.keys.find((key) => px >= key.x && px < key.x + key.w && py >= key.y && py < key.y + key.h) ?? null;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!Input.buttonsHeld.has('left')) this.held = null;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const key = this.keyAt(Input.mouse.x, Input.mouse.y);
    if (!key) return;
    this.held = key.note;
    this.onPlay(key.note);
  }

  draw() {
    const under = this.hovered ? this.keyAt(Input.mouse.x, Input.mouse.y) : null;
    stroke(EDITOR_COLOURS.header);
    strokeWeight(1);
    // whites then blacks, so the black keys are on top
    for (const key of [...this.keys].reverse()) {
      const lit = key.note === this.held;
      fill(lit ? EDITOR_COLOURS.accent : key.black ? (key === under ? 70 : 30) : key === under ? 210 : 235);
      rect(key.x, key.y, key.w, key.h, 0, 0, 3, 3);
      // C keys are labelled, so you can tell which octave is which
      if (!key.black && (key.note - SOUND_EDITOR.pianoFrom) % 12 === 0) {
        noStroke();
        fill(lit ? 255 : 120);
        setText(9, BOLD, CENTER, BOTTOM);
        text(noteName(noteFrequency(key.note)), key.x + key.w / 2, key.y + key.h - 3);
        stroke(EDITOR_COLOURS.header);
      }
    }
  }
}
