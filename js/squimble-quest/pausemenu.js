// the pause menu: Escape in the game (not the map editor) stops everything and opens it, as a form
// box (formbox.js) with tabs:
//   Sound     how loud all of it is, and voices (npcs talking), the world (loops: sound blocks,
//             tiles, atmospheres) and effects (hits, steps...) on their own (Sound.volumes, sound.js)
//             then captions and mono sound
//   Screen    screen shake, damage numbers, a colour blind filter (colourblind.js), how bright flashes
//             get and the crosshair's size
//   Assist    pausing when you switch window
//   Moving, Actions, Hotbar
//             a button for each key you can change (PAUSE_KEYS). click it, then press the new key
//             (Escape keeps the old one). a key that something else uses too says so under it. Reset
//             keys puts them all back
// changes happen straight away and are kept in this browser (localStorage), like dev mode's ticks. it's
// only settings, not saving the game. Resume, Escape or the × carry on. while it's open nothing in the
// game moves (sketch.js)
//
// multiplayer: one player can't stop the game for everyone, so pausing and Auto pause (away below)
// would just open the menu while the world carries on (see where sketch.js works out paused)
//
// the settings on Sound, Screen and Assist are GAME_SETTINGS (config.js, which says where each is
// used), laid out by SETTING_ROWS. so a new one, like another accessibility option, is a line in each
// plus whatever reads it, and it gets a field, loading, saving and right click to reset for free

const PAUSE_STORAGE_KEY = 'sq-settings';

// the GAME_SETTINGS on each tab, as [key, label, tip, field]. field is 'tick', a slider's
// [min, max, step] in % (the setting is that / 100), or a picker's choices as { value: words }
const SETTING_ROWS = {
  Sound: [
    ['captions', 'Captions', 'Words in the corner for sounds near you, with an arrow to where each one is', 'tick'],
    ['monoSound', 'Mono', 'Both ears hear the same, for hearing on one side or with one earphone', 'tick'],
  ],
  Screen: [
    ['screenShake', 'Shake', 'The screen shakes on big hits', 'tick'],
    ['damageNumbers', 'Damage', 'Numbers pop out of whatever gets hit', 'tick'],
    ['colourBlind', 'Colour blind', 'Protanopia: reds look dark. Deuteranopia: reds and greens mix up. Tritanopia: blues and yellows mix up', Object.fromEntries(Object.entries(COLOUR_BLIND_TYPES).map(([type, { label }]) => [type, label]))],
    ['colourBlindStrength', 'Strength', 'How much the colour blind filter changes colours', [0, 100, 1]],
    ['flashes', 'Flashes', "How bright lightning and the red glow when you're hurt get. 0% for none", [0, 100, 5]],
    ['crosshairSize', 'Crosshair', 'How big the dot you aim with is', [100, 300, 25]],
  ],
  Assist: [
    ['pauseWhenAway', 'Auto pause', 'Pauses when you switch to another window or tab', 'tick'],
  ],
};

// the settings as they start, for right click on a slider and checking saved ones' types
const DEFAULT_SETTINGS = { ...GAME_SETTINGS };

// the actions whose first key can be changed, by tab, with what to call them. their other keys (the
// arrows next to WASD, the numpad's numbers) stay as they are. E is both Talk and Inventory on purpose:
// it talks when there's someone to talk to
const PAUSE_KEYS = [
  ['Moving', [['up', 'Walk up'], ['down', 'Walk down'], ['left', 'Walk left'], ['right', 'Walk right'], ['roll', 'Dodge roll']]],
  ['Actions', [['interact', 'Talk, use'], ['inventory', 'Inventory'], ['drop', 'Drop'], ['fullscreen', 'Full screen']]],
  ['Hotbar', [1, 2, 3, 4, 5].map((n) => [`slot${n}`, `Slot ${n}`])],
];

// each of those actions' keys as they start, for Reset keys
const DEFAULT_KEYS = Object.fromEntries(PAUSE_KEYS.flatMap(([, keys]) => keys).map(([action]) => [action, [...KEYS[action]]]));

const PauseMenu = {
  active: false,
  // the action waiting for a key to be pressed, or null
  waitingFor: null,
  // set when you switch window or tab, or leave full screen (sketch.js), with pauseWhenAway on, and
  // sketch.js opens the menu
  away: false,

  // not in the editor, or with the menu already open (resuming would open it again)
  leave() {
    if (GAME_SETTINGS.pauseWhenAway && !this.active && !Editor.active) this.away = true;
  },

  // puts the saved settings in place. runs at the start of setup(), before the keys are listened for
  load() {
    window.addEventListener('blur', () => this.leave());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.leave(); });
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PAUSE_STORAGE_KEY)); } catch (e) {}
    if (saved && typeof saved === 'object') this.use(saved);
    this.apply();
  },

  // the settings that something else has to be told about
  apply() {
    ColourBlind.apply();
    Sound.mono = GAME_SETTINGS.monoSound;
  },

  // puts in the saved settings that make sense: the right type, sliders inside their range, pickers
  // one of their choices
  use(saved) {
    for (const key of Object.keys(Sound.volumes)) {
      if (typeof saved.volumes?.[key] === 'number') Sound.volumes[key] = constrain(saved.volumes[key], 0, 1);
    }
    for (const [key, , , field] of Object.values(SETTING_ROWS).flat()) {
      const value = saved[key];
      if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
      if (Array.isArray(field)) GAME_SETTINGS[key] = constrain(value, field[0] / 100, field[1] / 100);
      else if (field === 'tick' || field[value] !== undefined) GAME_SETTINGS[key] = value;
    }
    for (const [action, code] of Object.entries(saved.keys ?? {})) {
      if (DEFAULT_KEYS[action] && typeof code === 'string' && code !== 'Escape') KEYS[action][0] = code;
    }
  },

  save() {
    // only keys that aren't their normal one
    const keys = Object.fromEntries(Object.keys(DEFAULT_KEYS).filter((action) => KEYS[action][0] !== DEFAULT_KEYS[action][0]).map((action) => [action, KEYS[action][0]]));
    try { localStorage.setItem(PAUSE_STORAGE_KEY, JSON.stringify({ volumes: Sound.volumes, ...GAME_SETTINGS, keys })); } catch (e) {}
  },

  // changes a GAME_SETTINGS one, straight away
  change(key, value) {
    GAME_SETTINGS[key] = value;
    this.apply();
    this.save();
  },

  // changes an action's first key, and listens for it straight away (input.js)
  setKey(action, code) {
    KEYS[action][0] = code;
    Input.rebuildKeys();
    this.save();
  },

  // what else uses the key, like "Inventory", or ''. any of the game's keys count: the ones here by
  // their name, dev mode's and the map editor's by their action in KEYS (config.js)
  sharedWith(action) {
    const code = KEYS[action][0];
    const label = (other) => PAUSE_KEYS.flatMap(([, keys]) => keys).find(([name]) => name === other)?.[1] ?? `${other} (dev mode)`;
    const others = Object.keys(KEYS).filter((other) => other !== action && KEYS[other].includes(code));
    return others.map(label).join(', ');
  },

  open() {
    this.active = true;
    this.away = false;
    this.waitingFor = null;
    const slider = (key) => new Slider({
      w: 180, labelWidth: 0, label: '', min: 0, max: 100, unit: '%', value: Math.round(Sound.volumes[key] * 100), normal: 100,
      onChange: (value) => {
        Sound.volumes[key] = value / 100;
        this.save();
      },
    });
    // a field for each SETTING_ROWS row. ticks are checked in onUpdate (a Checkbox has no onChange)
    const ticks = [];
    const settingRows = (tab) => SETTING_ROWS[tab].map(([key, label, tip, kind]) => {
      let field;
      if (kind === 'tick') {
        field = new Checkbox({ w: 180, value: GAME_SETTINGS[key], label: 'on' });
        ticks.push([key, field]);
      } else if (Array.isArray(kind)) {
        const [min, max, step] = kind;
        field = new Slider({
          w: 180, labelWidth: 0, label: '', min, max, step, unit: '%', value: Math.round(GAME_SETTINGS[key] * 100), normal: Math.round(DEFAULT_SETTINGS[key] * 100),
          onChange: (value) => this.change(key, value / 100),
        });
      } else {
        field = new Picker({ w: 180, choices: Object.keys(kind), value: GAME_SETTINGS[key], label: (choice) => kind[choice], onChange: (choice) => this.change(key, choice) });
      }
      return { label, field, tip };
    });
    // a button showing the key, which waits for a new one when clicked
    const keyButton = (action) => {
      const button = new Button({
        w: 180, label: '', style: 'editor',
        onClick: () => {
          this.waitingFor = action;
          Input.captureNextKey((code) => {
            this.waitingFor = null;
            if (code) this.setKey(action, code);
          });
        },
      });
      button.action = action;
      return button;
    };
    const keyButtons = [];
    const keyTabs = PAUSE_KEYS.map(([label, keys]) => ({
      label,
      rows: keys.map(([action, name]) => {
        const button = keyButton(action);
        keyButtons.push(button);
        return { label: name, field: button, tip: `What you press to ${name.toLowerCase()}. Click, then press the new key` };
      }),
    }));
    keyTabs[1].rows.push({
      label: '',
      field: new Button({
        w: 180, label: 'Reset keys', style: 'editor',
        onClick: () => {
          for (const [action, codes] of Object.entries(DEFAULT_KEYS)) KEYS[action][0] = codes[0];
          Input.rebuildKeys();
          this.save();
        },
      }),
      tip: 'Puts every key back to how it started',
    });

    FormBox.open({
      title: 'Paused',
      confirmLabel: 'Resume',
      cancelLabel: null,
      // UI_ART.panel (config.js), like the inventory screen
      art: 'panel',
      // a getter, so it says what the key being looked at is shared with (the form box reads it each
      // frame)
      get hint() {
        if (PauseMenu.waitingFor) return 'Press the new key (Esc keeps the old one)';
        const shared = keyButtons.find((button) => button.visible && PauseMenu.sharedWith(button.action));
        return shared ? `${keyName(KEYS[shared.action][0])} is also for ${PauseMenu.sharedWith(shared.action)}` : 'Settings are kept in this browser';
      },
      tabs: [
        {
          label: 'Sound',
          rows: [
            { label: 'Volume', field: slider('all'), tip: 'How loud everything is' },
            { label: 'Voices', field: slider('voices'), tip: 'People talking' },
            { label: 'World', field: slider('world'), tip: 'Sounds that keep going: places, machines, lava, wind' },
            { label: 'Effects', field: slider('effects'), tip: 'Hits, footsteps and everything else' },
            ...settingRows('Sound'),
          ],
        },
        { label: 'Screen', rows: settingRows('Screen') },
        { label: 'Assist', rows: settingRows('Assist') },
        ...keyTabs,
      ],
      // the buttons show their key as it is now, and ticking a box takes effect straight away
      onUpdate: () => {
        for (const button of keyButtons) button.label = this.waitingFor === button.action ? 'press a key…' : keyName(KEYS[button.action][0]);
        for (const [key, tick] of ticks) {
          if (GAME_SETTINGS[key] !== tick.value) this.change(key, tick.value);
        }
      },
      onConfirm: () => this.resume(),
      onCancel: () => this.resume(),
    });
  },

  resume() {
    this.active = false;
    this.waitingFor = null;
    Input.captureNextKey(null);
  },
};
