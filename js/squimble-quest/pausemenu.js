// the pause menu: Escape in the game (not the map editor) stops everything and opens it, as a form
// box (formbox.js) with tabs:
//   Sound     how loud all of it is, and voices (npcs talking), the world (loops: sound blocks,
//             tiles, atmospheres) and effects (hits, steps...) on their own (Sound.volumes, sound.js)
//   Screen    screen shake and damage numbers on or off (GAME_SETTINGS in config.js)
//   Moving, Actions, Hotbar
//             a button for each key you can change (PAUSE_KEYS). click it, then press the new key
//             (Escape keeps the old one). a key that something else uses too says so under it. Reset
//             keys puts them all back
// changes happen straight away and are kept in this browser (localStorage), like dev mode's ticks. it's
// only settings, not saving the game. Resume, Escape or the × carry on. while it's open nothing in the
// game moves (sketch.js)

const PAUSE_STORAGE_KEY = 'sq-settings';

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

  // puts the saved settings in place. runs at the start of setup(), before the keys are listened for
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PAUSE_STORAGE_KEY)); } catch (e) {}
    if (!saved || typeof saved !== 'object') return;
    for (const key of Object.keys(Sound.volumes)) {
      if (typeof saved.volumes?.[key] === 'number') Sound.volumes[key] = constrain(saved.volumes[key], 0, 1);
    }
    for (const key of Object.keys(GAME_SETTINGS)) {
      if (typeof saved[key] === 'boolean') GAME_SETTINGS[key] = saved[key];
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
    this.waitingFor = null;
    const slider = (key) => new Slider({
      w: 180, labelWidth: 0, label: '', min: 0, max: 100, unit: '%', value: Math.round(Sound.volumes[key] * 100), normal: 100,
      onChange: (value) => {
        Sound.volumes[key] = value / 100;
        this.save();
      },
    });
    const ticks = Object.fromEntries(Object.keys(GAME_SETTINGS).map((key) => [key, new Checkbox({ w: 180, value: GAME_SETTINGS[key], label: 'on' })]));
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
          ],
        },
        {
          label: 'Screen',
          rows: [
            { label: 'Shake', field: ticks.screenShake, tip: 'The screen shakes on big hits' },
            { label: 'Damage', field: ticks.damageNumbers, tip: 'Numbers pop out of whatever gets hit' },
          ],
        },
        ...keyTabs,
      ],
      // the buttons show their key as it is now, and ticking a box takes effect straight away
      onUpdate: () => {
        for (const button of keyButtons) button.label = this.waitingFor === button.action ? 'press a key…' : keyName(KEYS[button.action][0]);
        let changed = false;
        for (const [key, tick] of Object.entries(ticks)) {
          if (GAME_SETTINGS[key] === tick.value) continue;
          GAME_SETTINGS[key] = tick.value;
          changed = true;
        }
        if (changed) this.save();
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
