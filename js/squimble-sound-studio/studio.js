// squimble sound studio: the sound editor from squimble quest as a web page. the sound all comes from
// the game's own code, loaded unchanged (squimble-sound-studio.html):
//   sound.js        the synthesiser, playing sounds, the library (SOUNDS, VOICES) and sounds.json
//   soundeditor.js  the make one buttons (SOUND_GENERATORS) and SoundEditor. Studio below is a
//                   SoundEditor with its p5 screen swapped for this page, so making, knobs, Random,
//                   Mutate, Undo, choosing a file and exporting all run the game's code
//   formbox.js      Slider. every slider here is a real game Slider (for its curve, rounding and
//                   normal value), shown as an <input type="range">
// so a change to the synthesiser or a new make one button in the game shows up here by itself.
//
// what this file adds is the page: building the controls, keeping them showing the draft, and the
// web only parts (a library kept in this browser, WAV downloads, the line for sounds.json).
//
// like the game's editor, Studio.draft is the sound being changed. the sliders' onChange write into
// it, the reused SoundEditor methods change it, and frame() runs every animation frame doing what
// SoundEditor.update() does in the game (undo history, restarting the loop, playing a turned knob),
// then render() puts the draft on the page if anything's changed, and the scope is drawn.
//
// known problems:
//   - your sounds are kept in this browser (localStorage), but audio files aren't, so a saved file
//     sound is silent after a reload until its file is chosen again
//   - a game sound you've changed shows your version until you press Reset on it
//   - the history is cleared whenever another sound opens, like the game's

(() => {
  // sound.js and soundeditor.js call these, which live in parts of the game this page doesn't load
  // the same rules as cleanMapName() in mapfile.js, which sound names follow
  window.cleanMapName = (name) => name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  // the game shows these along the bottom of the screen, here it's the tip line
  window.showMessage = (text) => {
    message = text;
    messageUntil = performance.now() + 6000;
    showTip();
  };

  const $ = (selector) => document.querySelector(selector);
  // a new element with a class and, optionally, some text
  const make = (tag, className = '', text = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const key = (label, tip, onClick) => {
    const button = make('button', 'ss-key', label);
    button.type = 'button';
    if (tip) button.dataset.tip = tip;
    if (onClick) button.addEventListener('click', onClick);
    return button;
  };

  const nameField = $('#ssName');
  const tipLine = $('#ssTip');
  const DEFAULT_TIP = 'Point at anything to see what it does. Double click a slider to put it back to normal, or use the arrow keys to nudge it.';

  const Studio = Object.assign(Object.create(SoundEditor), {
    draft: soundSettings({}),
    original: '',
    openedAs: '',
    settled: '',
    history: [],
    sliders: {},
    knobSliders: {},
    recipe: null,
    knobTurned: false,
    tab: 'Pitch',
    makers: 'Game',
    newFiles: {},
    playedAs: null,
    playedPitch: null,
    playedAt: 0,
    loopButton: { on: false },
    nameField,
    sayField: null,

    // opens a sound or voice by name, or a new one of a kind, like SoundEditor.open() without the
    // screen. asks first if the open one has changes that aren't saved
    open(name = null, kind = 'sound') {
      if (this.unsaved() && !confirm('This sound has changes that aren\'t saved. Throw them away?')) return;
      this.loopButton.on = false;
      Sound.stopPreview();
      this.original = name ?? '';
      this.draft = soundSettings(name ? findSound(name) : kind === 'voice' ? NEW_VOICE : { kind });
      if (this.draft.kind === 'voice') {
        this.tab = 'Voice';
        this.makers = 'Voices';
      }
      if (this.tab === 'Character') this.tab = 'Pitch';
      this.recipe = null;
      this.history = [];
      this.syncSliders();
      this.openedAs = JSON.stringify(this.draft);
      this.settled = this.openedAs;
      nameField.value = name ?? '';
      libraryKind = this.draft.kind;
      render();
      renderLibrary();
    },

    unsaved() {
      return this.openedAs !== '' && JSON.stringify(this.draft) !== this.openedAs;
    },

    // puts it in its library and keeps it in this browser. the editor stays open on it
    save() {
      const problem = this.problem();
      if (problem) return showMessage(problem);
      const name = cleanMapName(nameField.value);
      setSound(name, this.draft);
      const { name: _, ...data } = typeToData({ ...this.draft, name }, SOUND_DEFAULTS);
      saved[name] = data;
      keepSaved();
      this.original = name;
      this.openedAs = JSON.stringify(this.draft);
      nameField.value = name;
      libraryKind = this.draft.kind;
      renderLibrary();
      showMessage(`Saved ${name} to your library`);
    },

    // the reused SoundEditor methods call this after changing the tab, the make one kind or the recipe
    showParts() {
      render();
    },
  });

  // ---------- sliders ----------

  // a row for a game Slider: its label, an <input type="range"> along its curve (0 to 1000), and its
  // value. it keeps the parts on the slider, for render()
  function sliderRow(slider, id, tip, format) {
    const row = make('div', 'ss-slider');
    row.dataset.tip = tip;
    const label = make('label', '', slider.label);
    label.htmlFor = id;
    const input = make('input');
    Object.assign(input, { type: 'range', id, min: 0, max: 1000, step: 1 });
    const output = make('output');
    output.htmlFor = id;
    row.append(label, input, output);
    input.addEventListener('input', () => slider.set(slider.valueAt(input.value / 1000)));
    // arrows nudge it 1% along at a time, further if that rounds back to the same value (a slider
    // with only a few steps, like Repeats)
    input.addEventListener('keydown', (event) => {
      const way = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (!way) return;
      event.preventDefault();
      const was = slider.value;
      for (let step = 0.01; slider.value === was && step <= 1; step += 0.01) {
        slider.set(slider.valueAt(Math.min(1, Math.max(0, slider.positionOf(was) + way * step))));
      }
    });
    // the game puts a slider back to normal with a right click, a page is more used to a double click
    const reset = (event) => {
      event.preventDefault();
      if (!input.disabled) slider.set(slider.normal);
    };
    row.addEventListener('dblclick', reset);
    row.addEventListener('contextmenu', reset);
    Object.assign(slider, { row, input, output, format, enabled: true });
    return row;
  }

  // moves a slider's row to its value
  function showSlider(slider) {
    const at = slider.positionOf(slider.value);
    // the fill goes from 0 (the middle, for sliders either side of 0) to the value, like the game's
    const from = slider.positionOf(Math.min(slider.max, Math.max(slider.min, 0)));
    slider.input.value = Math.round(at * 1000);
    slider.input.style.setProperty('--a', `${Math.min(at, from) * 100}%`);
    slider.input.style.setProperty('--b', `${Math.max(at, from) * 100}%`);
    const text = slider.format(slider.value);
    slider.output.value = text;
    slider.row.classList.toggle('is-off', text === 'off');
    slider.input.disabled = !slider.enabled;
    slider.row.classList.toggle('is-idle', !slider.enabled);
  }

  // ---------- building the studio ----------

  const panels = {};
  const tabButtons = {};
  const kindButtons = {};
  const makerLists = {};
  const knobGroups = {};
  const waveButtons = {};

  // the settings tabs, each a panel of sliders under its sections' headings (SOUND_EDITOR.tabs)
  SOUND_EDITOR.tabs.forEach((tab, t) => {
    const button = key(tab.name, `${tab.name}: ${tab.hint}`, () => Studio.showTab(tab.name));
    button.setAttribute('aria-controls', `ssPanel${t}`);
    tabButtons[tab.name] = button;
    $('#ssTabs').append(button);
    const panel = make('div', 'ss-panel');
    panel.id = `ssPanel${t}`;
    panels[tab.name] = panel;
    $('#ssPanels').append(panel);

    if (tab.name === 'Character') {
      // the knobs of every kind of make one button, half in each column, only the recipe's kind shown
      panel.append(make('h3', 'ss-section-title'), make('p', 'ss-hint'));
      for (const [kind, { knobs }] of Object.entries(SOUND_GENERATORS)) {
        Studio.knobSliders[kind] = {};
        const group = make('div', 'ss-columns');
        const half = Math.ceil(knobs.length / 2);
        const columns = [make('div'), make('div')];
        knobs.forEach((knob, i) => {
          const slider = new Slider({ ...knob, value: knob.normal, onChange: (value) => Studio.turnKnob(knob.key, value) });
          Studio.knobSliders[kind][knob.key] = slider;
          const format = (value) => (knob.options ? knob.options[value] : `${knob.min < 0 && value > 0 ? '+' : ''}${value} ${knob.unit}`);
          columns[Math.floor(i / half)].append(sliderRow(slider, `ssKnob-${kind}-${knob.key}`.replace(/\W/g, ''), `${knob.label}: ${knob.tip}`, format));
        });
        group.append(...columns);
        knobGroups[kind] = group;
        panel.insertBefore(group, panel.lastChild);
      }
      return;
    }

    const columns = make('div', 'ss-columns');
    for (const sections of tab.columns) {
      const column = make('div');
      for (const section of sections) {
        const box = make('div', 'ss-section');
        box.append(make('h3', 'ss-section-title', section));
        for (const setting of SOUND_SETTINGS.filter((s) => s.section === section)) {
          const slider = new Slider({ ...setting, value: setting.normal, onChange: (value) => { Studio.draft[setting.key] = value; } });
          Studio.sliders[setting.key] = slider;
          box.append(sliderRow(slider, `ssSetting-${setting.key}`, `${setting.label}: ${setting.tip}`, (value) => Studio.formatSetting(setting, value)));
        }
        column.append(box);
      }
      columns.append(column);
    }
    panel.append(columns);

    // the Voice tab's Say box: type something and press Say (or Enter) to hear it talk
    if (tab.name === 'Voice') {
      const say = make('div', 'ss-say');
      say.dataset.tip = 'Say: type something here, then press Say (or Enter) to hear this sound saying it, the way an npc with it as their voice talks';
      const field = make('input', 'ss-input');
      Object.assign(field, { type: 'text', value: SOUND_EDITOR.sayText, maxLength: 52 });
      field.setAttribute('aria-label', 'Words to say');
      field.addEventListener('keydown', (event) => event.key === 'Enter' && Studio.speak());
      Studio.sayField = field;
      const button = key('Say', '', () => Studio.speak());
      button.classList.add('ss-key-go');
      button.prepend(playIcon());
      say.append(field, button);
      panel.append(say);
    }
    panel.append(make('p', 'ss-hint', tab.hint));
  });

  function playIcon() {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 12 12');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<path d="M3 1.8v8.4L10 6z"/>';
    return icon;
  }

  // a button for each wave, with a little picture of it (like drawWaveShape() in sound.js). the
  // waves with no shape get their made up one from WAVE_PICTURES
  for (const [wave, { label, tip, shape }] of Object.entries(SOUND_WAVES)) {
    const picture = shape ?? WAVE_PICTURES[wave] ?? WAVE_PICTURES.noise;
    const points = Array.from({ length: 53 }, (_, i) => `${i},${(8 - picture(((i / 52) * 2) % 1, 0.5) * 6.4).toFixed(2)}`);
    // file asks for a file the first time, and goes back to the chosen one after that
    const button = key('', `${label}: ${tip}`, () => (wave === 'file' && !Studio.draft.file ? Studio.chooseFile() : Studio.change({ wave })));
    button.innerHTML = `<svg viewBox="0 0 52 16" aria-hidden="true"><polyline points="${points.join(' ')}"/></svg>`;
    button.append(label);
    waveButtons[wave] = button;
    $('#ssWaves').append(button);
  }
  $('#ssChooseFile').addEventListener('click', () => Studio.chooseFile());

  // the make one kinds, and each kind's buttons
  for (const [kind, { makers }] of Object.entries(SOUND_GENERATORS)) {
    kindButtons[kind] = key(kind, `${kind}: show the ${kind.toLowerCase()} buttons`, () => Studio.showMakers(kind));
    $('#ssKinds').append(kindButtons[kind]);
    const list = make('div', 'ss-maker-list');
    for (const [label, maker] of Object.entries(makers)) {
      list.append(key(label, `${label}: ${maker.tip}. Press it again for another one, then change it in the Character tab`, () => Studio.generate(kind, label)));
    }
    makerLists[kind] = list;
    $('#ssMakers').append(list);
  }
  $('#ssRandom').addEventListener('click', () => {
    Studio.recipe = null;
    Studio.replace(Studio.randomSettings());
    render();
  });
  $('#ssMutate').addEventListener('click', () => Studio.mutate());

  // the piano: two octaves from SOUND_EDITOR.pianoFrom, like SoundPiano. one key is in the tab
  // order and the arrows move between them, so it's one stop for the keyboard rather than 25
  const piano = $('#ssPiano');
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const pianoKeys = [];
  for (let k = 0; k < SOUND_EDITOR.whiteKeys; k++) {
    const note = SOUND_EDITOR.pianoFrom + 12 * Math.floor(k / 7) + steps[k % 7];
    pianoKeys.push({ note, k, black: false });
    if (k < SOUND_EDITOR.whiteKeys - 1 && ![4, 11].includes(steps[k % 7])) pianoKeys.push({ note: note + 1, k, black: true });
  }
  for (const { note, k, black } of pianoKeys) {
    const name = noteName(noteFrequency(note));
    const button = make('button', black ? 'ss-black' : '', !black && (note - SOUND_EDITOR.pianoFrom) % 12 === 0 ? name : '');
    button.type = 'button';
    button.tabIndex = note === SOUND_EDITOR.pianoFrom ? 0 : -1;
    button.setAttribute('aria-label', `Play at ${name}`);
    if (black) button.style.left = `calc(100% / ${SOUND_EDITOR.whiteKeys} * ${k + 0.7})`;
    const down = () => {
      button.classList.add('is-down');
      Studio.play(noteFrequency(note));
    };
    const up = () => button.classList.remove('is-down');
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointerleave', up);
    // a keyboard click (detail 0), since pointerdown already played a mouse or finger
    button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      down();
      setTimeout(up, 150);
    });
    piano.append(button);
  }
  piano.addEventListener('keydown', (event) => {
    const way = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!way) return;
    const keys = [...piano.children].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const next = keys[keys.indexOf(document.activeElement) + way];
    if (!next) return;
    event.preventDefault();
    keys.forEach((button) => { button.tabIndex = button === next ? 0 : -1; });
    next.focus();
  });

  // the top bar and transport
  document.querySelectorAll('.ss-bar [data-kind]').forEach((button) => button.addEventListener('click', () => Studio.changeKind(button.dataset.kind)));
  $('#ssUndo').addEventListener('click', () => Studio.undo());
  $('#ssSave').addEventListener('click', () => Studio.save());
  nameField.addEventListener('keydown', (event) => event.key === 'Enter' && Studio.save());
  $('#ssPlay').addEventListener('click', () => Studio.play());
  $('#ssStop').addEventListener('click', () => {
    Studio.loopButton.on = false;
    Sound.stopPreview();
  });
  // turning Loop on plays it looping (at the last piano note), off stops it, like the game's
  $('#ssLoop').addEventListener('click', () => {
    Studio.loopButton.on = !Studio.loopButton.on;
    if (Studio.loopButton.on) Studio.play(Studio.playedPitch);
    else Sound.stopPreview();
  });
  // space plays, unless it's for typing or pressing a button
  document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || event.target.closest('input[type="text"], button, a, textarea')) return;
    if (!event.target.closest('.ss-studio') && event.target !== document.body) return;
    event.preventDefault();
    Studio.play();
  });

  // ---------- the tip line ----------

  let hoveredTip = null;
  let message = null;
  let messageUntil = 0;
  // along the bottom, like the game: the tip for what's pointed at or focused, then a message, then
  // why it can't be saved, else how to use it
  function showTip() {
    const problem = Studio.problem();
    let text = DEFAULT_TIP;
    let kind = '';
    if (hoveredTip) text = hoveredTip;
    else if (message && performance.now() < messageUntil) [text, kind] = [message, 'is-news'];
    else if (problem) [text, kind] = [problem, 'is-problem'];
    if (tipLine.textContent !== text) tipLine.textContent = text;
    tipLine.className = `ss-tip ${kind}`;
  }
  const studio = $('#studio');
  const tipFrom = (event) => {
    hoveredTip = event.target.closest('[data-tip]')?.dataset.tip ?? null;
    showTip();
  };
  studio.addEventListener('pointerover', tipFrom);
  studio.addEventListener('focusin', tipFrom);
  studio.addEventListener('pointerleave', () => {
    hoveredTip = null;
    showTip();
  });

  // ---------- putting the draft on the page ----------

  // updates everything that shows the draft. frame() calls it when something's changed
  function render() {
    const d = Studio.draft;
    // sliders that don't do anything with the other settings as they are get greyed out, the same
    // ones as in the game (soundSettingMatters() in soundeditor.js)
    const matters = soundSettingMatters(d);
    for (const [settingKey, slider] of Object.entries(Studio.sliders)) {
      slider.enabled = matters[settingKey] ?? true;
      showSlider(slider);
    }

    // tabs, with a dot on the ones that have settings that aren't normal
    for (const tab of SOUND_EDITOR.tabs) {
      const on = Studio.tab === tab.name;
      tabButtons[tab.name].setAttribute('aria-pressed', on);
      tabButtons[tab.name].classList.toggle('is-changed', SOUND_SETTINGS.some((s) => tab.columns.flat().includes(s.section) && d[s.key] !== s.normal));
      panels[tab.name].hidden = !on;
    }
    // the Character tab: the knobs of the make one button it came from, or what to do
    const recipe = Studio.recipe;
    const character = panels.Character;
    const tab = SOUND_EDITOR.tabs.find((t) => t.name === 'Character');
    character.querySelector('.ss-section-title').textContent = recipe ? `From ${recipe.name}, in ${recipe.kind}` : '';
    character.querySelector('.ss-section-title').hidden = !recipe;
    character.querySelector('.ss-hint').textContent = recipe ? tab.hint : tab.empty;
    for (const [kind, group] of Object.entries(knobGroups)) {
      group.hidden = kind !== recipe?.kind;
      if (!group.hidden) Object.values(Studio.knobSliders[kind]).forEach(showSlider);
    }

    for (const [kind, button] of Object.entries(kindButtons)) {
      button.setAttribute('aria-pressed', Studio.makers === kind);
      makerLists[kind].hidden = Studio.makers !== kind;
    }
    for (const [wave, button] of Object.entries(waveButtons)) button.setAttribute('aria-pressed', d.wave === wave);
    $('#ssChooseFile').hidden = d.wave !== 'file';
    $('#ssFileName').textContent = d.wave !== 'file' ? '' : d.file ? `${d.file}${SOUND_FILES[d.file] ? '' : ' (not loaded)'}` : 'no file chosen';
    document.querySelectorAll('.ss-bar [data-kind]').forEach((button) => button.setAttribute('aria-pressed', d.kind === button.dataset.kind));
    $('#ssLoop').setAttribute('aria-pressed', Studio.loopButton.on);
    $('#ssUndo').disabled = Studio.history.length === 0;
    $('#ssSave').disabled = Studio.problem() !== null;
    const typed = nameField.value;
    const name = cleanMapName(typed);
    $('#ssSavesAs').textContent = name && name !== typed ? `saves as ${name}` : '';

    // a changed sound still under the name it opened with (coin, say) would clash with that one in
    // sounds.json, so the line gives it a new name until it's renamed or saved
    const named = name && !(name === Studio.original && Studio.unsaved());
    renderExport(named ? name : d.kind === 'voice' ? 'my-voice' : 'my-sound', named);
    showTip();
  }

  // ---------- the scope ----------

  const scope = $('#ssScope');
  const context = scope.getContext('2d');
  const readout = $('#ssReadout');
  const colours = getComputedStyle(document.body);
  const colour = (name) => colours.getPropertyValue(name).trim();
  // the scope is an lcd, so it draws in the screen's inks. SIGNAL is for the library's pictures
  const SIGNAL = colour('--ss-signal');
  const INK = colour('--ss-lcd-ink');
  const FILL = colour('--ss-lcd-fill');
  const LINE = colour('--ss-lcd-line');

  // SoundVisualiser.draw() for a canvas: a close-up of a few waves from just after it gets loud,
  // and the whole sound with a line moving along it while it plays (or it talking, while it's
  // saying something), from the real audio. its note, pitch and length go underneath
  function drawScope() {
    const ratio = window.devicePixelRatio || 1;
    const w = scope.clientWidth;
    const h = scope.clientHeight;
    if (scope.width !== Math.round(w * ratio) || scope.height !== Math.round(h * ratio)) {
      scope.width = Math.round(w * ratio);
      scope.height = Math.round(h * ratio);
    }
    const ctx = context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sound = Studio.draft;
    const preview = Sound.previewing;
    const say = preview && (millis() - preview.started) / 1000 < preview.seconds ? preview.say : null;
    const { samples } = Sound.render(sound);
    const { seconds } = Sound.render(sound, false, sound.pitch, say);
    const panel = (h - 8) / 2;
    const wholeY = panel + 8;
    ctx.font = '500 11px Tektur, sans-serif';
    for (const [top, label] of [[0, 'wave'], [wholeY, say === null ? 'whole sound' : 'talking']]) {
      ctx.fillStyle = LINE;
      ctx.fillRect(0, top + panel / 2, w, 1);
      ctx.fillStyle = FILL;
      ctx.fillText(label, 4, top + 12);
    }

    // the close-up, from the end of the fade in plus a little into the hold
    const startSeconds = sound.attack / 1000 + Math.min(sound.sustain / 2000, 0.05);
    const start = Math.min(samples.length - 1, Math.floor(startSeconds * SOUND_RATE));
    const spanSeconds = SOUND_WAVES[sound.wave].shape || sound.wave === 'metal' ? closeUpCycles(sound.pitch) / sound.pitch : 0.01;
    const span = Math.max(8, Math.round(spanSeconds * SOUND_RATE));
    const middle = panel / 2 + 4;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= w; i++) ctx.lineTo(i, middle - (samples[start + Math.floor((i / w) * span)] ?? 0) * (panel / 2 - 10));
    ctx.stroke();

    // the whole sound, a line from the loudest to the quietest point of each column
    const columns = Math.max(1, Math.floor(w));
    const overview = soundOverview(sound, columns, say);
    const centre = wholeY + panel / 2 + 4;
    const height = panel - 18;
    ctx.fillStyle = FILL;
    for (let c = 0; c < columns; c++) {
      const top = centre - overview[c * 2 + 1] * (height / 2);
      ctx.fillRect(c, top, 1, Math.max(1, (overview[c * 2 + 1] - overview[c * 2]) * (height / 2)));
    }
    if (preview) {
      const played = (millis() - preview.started) / 1000;
      if (preview.loop || played < preview.seconds) {
        ctx.fillStyle = INK;
        ctx.fillRect(((played % preview.seconds) / preview.seconds) * w, wholeY, 1.5, panel);
      }
    }

    let pitch = [noteName(sound.pitch), `${sound.pitch} Hz`];
    if (sound.wave === 'file') pitch = [`${Math.round((sound.pitch / 440) * 100)}% speed`];
    else if (!SOUND_WAVES[sound.wave].shape && sound.wave !== 'metal') pitch = [`${sound.pitch} Hz`];
    const words = [...pitch, `${Math.round(seconds * 1000)} ms`];
    const html = words.map((word) => `<span>${word}</span>`).join('');
    if (readout.innerHTML !== html) readout.innerHTML = html;
  }

  // ---------- export ----------

  // a WAV file (16 bit, one channel) of some samples from the synthesiser (-1 to 1)
  function wavFile(samples) {
    const bytes = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const write = (at, text) => [...text].forEach((letter, i) => bytes.setUint8(at + i, letter.charCodeAt(0)));
    write(0, 'RIFF');
    bytes.setUint32(4, 36 + samples.length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    bytes.setUint32(16, 16, true);
    bytes.setUint16(20, 1, true); // plain samples
    bytes.setUint16(22, 1, true); // one channel
    bytes.setUint32(24, SOUND_RATE, true);
    bytes.setUint32(28, SOUND_RATE * 2, true);
    bytes.setUint16(32, 2, true);
    bytes.setUint16(34, 16, true);
    write(36, 'data');
    bytes.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => bytes.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
    return new Blob([bytes], { type: 'audio/wav' });
  }

  // what Download WAV makes: it saying the Say box for a voice, one go round of the loop with Loop
  // on (made to repeat without a click), else the sound playing once
  function wavPlan() {
    if (Studio.talks()) return { say: Studio.sayField.value, loop: false, note: `A WAV file of it saying "${Studio.sayField.value}".` };
    if (Studio.loopButton.on) return { say: null, loop: true, note: 'A WAV file made for looping: set it to repeat in any audio player or game and it plays on and on with no click or gap. Turn Loop off to get the sound played just once.' };
    return { say: null, loop: false, note: 'A WAV file of the sound played once. Want one that repeats smoothly, like background music? Turn Loop on first.' };
  }

  $('#ssWav').addEventListener('click', () => {
    const { say, loop } = wavPlan();
    const { samples } = Sound.render(Studio.draft, loop, Studio.draft.pitch, say);
    const name = cleanMapName(nameField.value) || 'sound';
    downloadData(`${name}.wav`, wavFile(samples));
    showMessage(`Downloaded ${name}.wav`);
  });

  // the sound's line for sounds.json, exactly as the game writes it (soundsToText() in sound.js)
  let codeLine = '';
  function renderExport(name, named) {
    const d = Studio.draft;
    codeLine = jsonLine(typeToData({ ...d, name }, SOUND_DEFAULTS)).trim();
    if ($('#ssCode').textContent !== codeLine) $('#ssCode').textContent = codeLine;
    const use = d.kind === 'voice'
      ? `then give an npc voice: '${name}' in npcs.js, or pick it for one in the map editor`
      : `then play it from code with playSound('${name}'), or put it on a sound block in the map editor`;
    const file = d.wave === 'file' && d.file ? ` Put ${d.file} in assets/squimble-quest/sounds/files/ too.` : '';
    const rename = named ? '' : `It's called ${name} for now, type a new name in the Name box to change it. `;
    $('#ssCodeNote').textContent = `${rename}Paste it into the sounds list in assets/squimble-quest/sounds/sounds.json, ${use}.${file}`;
    $('#ssWavNote').textContent = wavPlan().note;
  }

  $('#ssCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(codeLine)
      .then(() => showMessage('Copied the line for sounds.json'))
      .catch(() => {
        getSelection().selectAllChildren($('#ssCode'));
        showMessage('Couldn\'t copy it, it\'s selected so you can copy it yourself');
      });
  });
  $('#ssExportAll').addEventListener('click', () => Studio.exportSounds());

  // ---------- the library ----------

  // your sounds, by name, kept in this browser. the game's own, from its sounds.json, are kept too
  // so Reset can put a changed one back
  const STORE = 'squimble-sound-studio';
  let saved = {};
  let gameSounds = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE))?.sounds ?? {};
  } catch {
    saved = {};
  }
  function keepSaved() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ sounds: saved }));
    } catch {
      showMessage('This browser won\'t keep your sounds after the page closes, so download sounds.json to keep them');
    }
  }

  // which library is showing, 'sound' or 'voice'
  let libraryKind = 'sound';
  const library = $('#ssLibrary');
  // little pictures waiting to be drawn, one a frame, since some sounds take a while to work out
  let toDraw = [];

  function renderLibrary() {
    document.querySelectorAll('[data-library]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.library === libraryKind));
    $('#ssNew').textContent = libraryKind === 'voice' ? 'New voice' : 'New sound';
    library.replaceChildren();
    toDraw = [];
    const sounds = Object.values(libraryKind === 'voice' ? VOICES : SOUNDS);
    if (sounds.length === 0) library.append(make('li', 'ss-lib-empty', `No ${libraryKind}s yet. Make one above and save it.`));
    for (const sound of sounds) {
      const row = make('li');
      row.classList.toggle('is-open', sound.name === Studio.original);
      const play = key('', '', () => {
        Studio.loopButton.on = false;
        Sound.preview(sound, sound.kind === 'voice' ? { say: Studio.sayField.value } : {});
      });
      play.append(playIcon());
      play.setAttribute('aria-label', `Play ${sound.name}`);
      const open = make('button', 'ss-lib-name', sound.name);
      open.type = 'button';
      open.setAttribute('aria-label', `Open ${sound.name}`);
      open.addEventListener('click', () => Studio.open(sound.name));
      if (saved[sound.name]) open.append(make('small', '', gameSounds[sound.name] ? 'changed' : 'yours'));
      const picture = make('canvas');
      picture.setAttribute('aria-hidden', 'true');
      toDraw.push([picture, sound]);
      row.append(play, open, picture);
      if (saved[sound.name]) {
        const forget = make('button', 'ss-lib-forget', gameSounds[sound.name] ? 'Reset' : 'Remove');
        forget.type = 'button';
        forget.setAttribute('aria-label', `${forget.textContent} ${sound.name}`);
        forget.addEventListener('click', () => forgetSound(sound.name));
        row.append(forget);
      }
      library.append(row);
    }
  }

  // Reset puts a game sound back how the game has it, Remove takes one of yours out
  function forgetSound(name) {
    delete saved[name];
    keepSaved();
    if (gameSounds[name]) {
      setSound(name, gameSounds[name]);
    } else {
      delete SOUNDS[name];
      delete VOICES[name];
    }
    renderLibrary();
  }

  function drawLibraryPicture() {
    const next = toDraw.shift();
    if (!next) return;
    const [canvas, sound] = next;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = 80 * ratio;
    canvas.height = 26 * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = SIGNAL;
    const overview = soundOverview(sound, 80);
    for (let c = 0; c < 80; c++) {
      const top = 13 - overview[c * 2 + 1] * 12;
      ctx.fillRect(c, top, 1, Math.max(1, (overview[c * 2 + 1] - overview[c * 2]) * 12));
    }
  }

  document.querySelectorAll('[data-library]').forEach((button) => button.addEventListener('click', () => {
    libraryKind = button.dataset.library;
    renderLibrary();
  }));
  $('#ssNew').addEventListener('click', () => Studio.open(null, libraryKind));

  // ---------- every frame ----------

  // whether a mouse button or finger is down, so a whole slider drag is one Undo (like the game's)
  let pointerDown = false;
  document.addEventListener('pointerdown', () => { pointerDown = true; });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  window.addEventListener('pointercancel', () => { pointerDown = false; });

  let shown = '';
  // SoundEditor.update() without the typing (the page does that), then the page and the scope
  function frame() {
    Sound.update(null);
    const now = JSON.stringify(Studio.draft);
    if (now !== Studio.settled && !pointerDown) {
      Studio.history.push(JSON.parse(Studio.settled));
      Studio.settled = now;
    }
    // with Loop on, start it again when something changes (at most every 0.1s). with it off, a
    // knob plays once it's let go
    if (Studio.loopButton.on && now !== Studio.playedAs && millis() - Studio.playedAt > 100) Studio.play(Studio.playedPitch);
    if (Studio.knobTurned && !pointerDown) {
      Studio.knobTurned = false;
      if (!Studio.loopButton.on) {
        if (Studio.talks()) Studio.speak();
        else Studio.play();
      }
    }
    const r = Studio.recipe;
    const state = now + JSON.stringify([r?.kind, r?.name, r?.knobs, Studio.tab, Studio.makers, Studio.loopButton.on, nameField.value, Studio.history.length, Boolean(SOUND_FILES[Studio.draft.file]), Studio.sayField.value]);
    if (state !== shown) {
      shown = state;
      render();
    }
    if (message && performance.now() > messageUntil) {
      message = null;
      showTip();
    }
    drawScope();
    drawLibraryPicture();
    requestAnimationFrame(frame);
  }

  // starts on a new sound, then the game's coin once the library has loaded (unless you've already
  // started changing things)
  Studio.open(null, 'sound');
  requestAnimationFrame(frame);
  loadSoundFile().then(() => {
    gameSounds = Object.fromEntries([...Object.values(SOUNDS), ...Object.values(VOICES)].map((sound) => [sound.name, { ...sound }]));
    for (const [name, data] of Object.entries(saved)) setSound(name, data);
    if (!Studio.unsaved() && findSound('coin')) Studio.open('coin');
    else renderLibrary();
  });
})();
