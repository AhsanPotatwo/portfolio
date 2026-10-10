// the weapon editor: the Weapon, Hit and Feel tabs for changing any weapon (weapons.js), with a preview
// down the side that keeps doing the whole combo on a dummy, so you can see and feel the reach,
// knockback, hit stop and screen shake as you drag. the map editor's Weapons tab opens it: Edit or right
// click an item (Editor.editItem() puts these tabs after its Item tab), or click one of the enemies' own
// weapons at the end of the tab, which have a badge since only enemies use them (they aren't items, so
// they can't be dropped or given). Export on that tab downloads the changed item and enemy files.
//
// every hit of a combo has its own numbers: the Hit picker at the top of the Hit and Feel tabs picks
// which, and the Combo picker on the Weapon tab adds hits (a new one copies the last) or takes them
// away. Save writes the first hit as the weapon's own settings and every hit's differences from it as
// its combo, the same as a file written by hand. it changes a copy, so Cancel leaves the weapon alone.
//
// a new per-hit setting is a WEAPON_DEFAULTS line (weapons.js) and a HIT_SETTINGS line here

// the sliders on the Hit and Feel tabs, one for each setting a combo hit can have its own of
const HIT_SETTINGS = [
  { key: 'damage', tab: 'Hit', label: 'Damage', min: 0, max: 200, tip: 'Taken off each thing it hits' },
  { key: 'reach', tab: 'Hit', label: 'Reach', min: 8, max: 600, unit: 'px', tip: "How far a swing reaches from your middle, or how far an arrow flies. A tile's 32" },
  { key: 'arc', tab: 'Hit', label: 'Arc', min: 5, max: 360, unit: '°', tip: 'How wide a swing is, 360 all the way round. Narrow is a stab. Swings only' },
  { key: 'windup', tab: 'Hit', label: 'Windup', min: 0, max: 1, step: 0.01, unit: 's', tip: 'A pause with the weapon raised before it swings. Heavy, and shows it coming. Getting hit stops it' },
  { key: 'swingTime', tab: 'Hit', label: 'Swing time', min: 0.02, max: 1, step: 0.01, unit: 's', tip: 'How long a swing takes to sweep across. Swings only' },
  { key: 'cooldown', tab: 'Hit', label: 'Cooldown', min: 0.02, max: 3, step: 0.01, unit: 's', tip: 'From this attack to the next. Longer on a big last hit' },
  { key: 'arrowSpeed', tab: 'Hit', label: 'Arrow speed', min: 50, max: 1500, step: 10, unit: 'px/s', tip: 'How fast its arrows fly. Shooting only' },
  { key: 'knockback', tab: 'Feel', label: 'Knockback', min: 0, max: 1500, step: 10, unit: 'px/s', tip: 'How hard it shoves what it hits. They slide about an eighth of this in px' },
  { key: 'stagger', tab: 'Feel', label: 'Stagger', min: 0, max: 2, step: 0.05, unit: 's', tip: "How long what it hits can't walk or attack" },
  { key: 'lunge', tab: 'Feel', label: 'Lunge', min: 0, max: 800, step: 10, unit: 'px/s', tip: 'Steps the attacker forwards with each attack, hit or miss' },
  { key: 'recoil', tab: 'Feel', label: 'Recoil', min: 0, max: 800, step: 10, unit: 'px/s', tip: 'Shoves the attacker back when a swing lands. Swings only' },
  { key: 'shake', tab: 'Feel', label: 'Shake', min: 0, max: 30, step: 0.5, unit: 'px', tip: 'How hard the screen shakes when the player lands it, or gets hit by it' },
  { key: 'shakeTime', tab: 'Feel', label: 'Shake time', min: 0.05, max: 1.5, step: 0.05, unit: 's', tip: 'How long the shake takes to settle' },
  { key: 'hitStop', tab: 'Feel', label: 'Hit stop', min: 0, max: 0.3, step: 0.01, unit: 's', tip: 'How long both sides freeze when it lands. Makes it feel heavy' },
];

// the sliders on the Weapon tab, for settings that are the whole weapon's rather than one hit's
const WEAPON_WIDE_SETTINGS = [
  { key: 'comboWindow', label: 'Combo time', min: 0, max: 1.5, step: 0.05, unit: 's', tip: 'Seconds after the cooldown that attacking still carries on the combo' },
  { key: 'chargeTime', label: 'Charge time', min: 0, max: 3, step: 0.05, unit: 's', tip: 'Shooting only. Seconds holding attack to fully draw, then let go to shoot. 0 shoots on click' },
  { key: 'minPower', label: 'Tap power', min: 0.05, max: 1, step: 0.05, unit: '×', tip: 'How strong a shot let go straight away is. Damage, range, speed and knockback grow to full' },
  { key: 'chargeSlow', label: 'Draw walk', min: 0.1, max: 1, step: 0.05, unit: '×', tip: 'How fast you walk while drawing. 1 is normal speed' },
  { key: 'carrySpeed', label: 'Carry walk', min: 0.3, max: 1.5, step: 0.05, unit: '×', tip: 'How fast you walk while holding it. Below 1 for heavy weapons' },
];

// the most hits the Combo picker goes up to
const MAX_COMBO = 6;

const WEAPON_PREVIEW = {
  // seconds it waits after a combo before going again
  pause: 0.7,
  // how much smaller than on the map, so knockback stays in view
  zoom: 0.75,
  // px from the attacker's middle to the dummy's body at the start of each go, and for a bow
  gap: 20,
  shootGap: 110,
};

// the tabs, preview and saving for changing `weapon` in a FormBox. attacker and target are the
// settings of whose bodies the preview uses (PLAYER, or an enemy kind). gives back
// { tabs, side, update, ok, save } for FormBox.open()'s tabs, side, onUpdate, canConfirm and onConfirm
function weaponForm(weapon, { attacker, target }) {
  // what the fields have made so far. always the same object, so the preview's combo carries on as you
  // drag (Character.attack() starts over on a different weapon)
  const draft = { ...weapon };
  // every hit's settings in full (comboHit() in weapons.js), and which one the sliders show
  const hits = Array.from({ length: weapon.combo?.length ?? 1 }, (_, i) => onlyHitSettings(comboHit(weapon, i)));
  let shown = 0;

  const attackPicker = new Picker({ w: 180, choices: Object.keys(WEAPON_ATTACKS), value: weapon.attack, label: (attack) => WEAPON_ATTACKS[attack] });
  const comboPicker = new Picker({
    w: 180,
    choices: Array.from({ length: MAX_COMBO }, (_, i) => i + 1),
    value: hits.length,
    label: (n) => (n === 1 ? 'none (1 hit)' : `${n} hits`),
  });
  const wideSliders = Object.fromEntries(WEAPON_WIDE_SETTINGS.map((line) => [line.key, weaponSlider(line, weapon[line.key])]));
  const colourField = new ColourField({ w: 180, value: weapon.colour }); // textfield.js
  // the Hit and Feel tabs have one each, kept on the same hit
  const hitPickers = [0, 1].map(() => new Picker({ w: 180, choices: [...hits.keys()], value: 0, label: (i) => `${i + 1} of ${hits.length}` }));
  const sliders = Object.fromEntries(HIT_SETTINGS.map((line) => [line.key, weaponSlider(line, hits[0][line.key])]));

  const tabs = [
    {
      label: 'Weapon',
      rows: [
        { label: 'Attack', field: attackPicker, tip: 'Swing it in an arc, or shoot arrows like a bow' },
        { label: 'Combo', field: comboPicker, tip: 'How many hits before it starts over. Each gets its own numbers on Hit and Feel' },
        ...WEAPON_WIDE_SETTINGS.map((line) => ({ label: line.label, field: wideSliders[line.key], tip: line.tip })),
        { label: 'Colour', field: colourField, tip: "The swoosh, or the arrows' heads and feathers" },
      ],
    },
    ...['Hit', 'Feel'].map((tab, i) => ({
      label: tab,
      rows: [
        { label: 'Hit', field: hitPickers[i], tip: 'Which hit of the combo the numbers below are for' },
        ...HIT_SETTINGS.filter((line) => line.tab === tab).map((line) => ({ label: line.label, field: sliders[line.key], tip: line.tip })),
      ],
    })),
  ];

  // every frame: the sliders go into the hit they show, then the hits into the draft
  const update = () => {
    for (const { key } of HIT_SETTINGS) hits[shown][key] = sliders[key].value;
    while (hits.length < comboPicker.value) hits.push({ ...hits[hits.length - 1] });
    hits.length = comboPicker.value;
    // a hit picked on either tab, or the one shown was just taken away
    const picked = hitPickers.find((picker) => picker.value !== shown)?.value ?? shown;
    if (picked !== shown || shown >= hits.length) {
      shown = Math.min(picked, hits.length - 1);
      for (const { key } of HIT_SETTINGS) Object.assign(sliders[key], { value: hits[shown][key], normal: hits[shown][key] });
    }
    for (const picker of hitPickers) {
      if (picker.choices.length !== hits.length || picker.value !== shown) picker.setChoices([...hits.keys()], shown);
    }
    Object.assign(draft, hitsToSettings(hits), { attack: attackPicker.value });
    for (const { key } of WEAPON_WIDE_SETTINGS) draft[key] = wideSliders[key].value;
    // a colour that's halfway through being typed waits until it's finished
    if (HEX_COLOUR.test(colourField.value)) draft.colour = colourField.value;
  };

  return {
    tabs,
    side: (x, y, w, h) => [new WeaponPreview({ x, y, w, h, weapon: draft, attacker, target })],
    update,
    ok: () => HEX_COLOUR.test(colourField.value),
    // into the real weapon, so everyone using it changes straight away
    save: () => {
      update();
      Object.assign(weapon, draft);
    },
  };
}

// a slider for a FormBox row (formbox.js), for a HIT_SETTINGS line or anything like one
function weaponSlider(line, value) {
  return new Slider({ w: 180, labelWidth: 0, label: '', min: line.min, max: line.max, step: line.step ?? 1, unit: line.unit, value });
}

// just the HIT_SETTINGS out of a weapon's settings
function onlyHitSettings(settings) {
  return Object.fromEntries(HIT_SETTINGS.map(({ key }) => [key, settings[key]]));
}

// the weapon settings for a list of hits: the first one's as the weapon's own, and a combo of what's
// different about each hit (the first is always {}), or no combo for one hit
function hitsToSettings(hits) {
  const first = hits[0];
  const differences = (hit) => Object.fromEntries(HIT_SETTINGS.filter(({ key }) => hit[key] !== first[key]).map(({ key }) => [key, hit[key]]));
  return { ...first, combo: hits.length > 1 ? hits.map(differences) : null };
}

// ---------- enemies' own weapons ----------

// the enemies' own weapons (like the grunt's claws), named like "grunt's weapon" at the end of the
// map editor's Weapons tab (PaletteGrid in editor.js)
function enemyWeaponNames() {
  return Object.keys(ENEMY_TYPES).filter((name) => ENEMY_TYPES[name].weapon).map((name) => `${name}'s weapon`);
}

// the enemy kind a palette name from enemyWeaponNames() belongs to, or undefined for anything else
function enemyWithWeapon(paletteName) {
  return Object.keys(ENEMY_TYPES).find((name) => ENEMY_TYPES[name].weapon && `${name}'s weapon` === paletteName);
}

// the box for an enemy kind's own weapon, with the enemy swinging it at the player in the preview
function editEnemyWeapon(name) {
  const type = ENEMY_TYPES[name];
  const form = weaponForm(type.weapon, { attacker: type, target: PLAYER });
  FormBox.open({
    title: `Weapon: ${name}'s own`,
    hint: 'Only enemies use it. Export in the inspector to keep changes',
    confirmLabel: 'Save',
    tabs: form.tabs,
    side: form.side,
    onUpdate: form.update,
    canConfirm: form.ok,
    onConfirm: form.save,
  });
}

// an enemy's own weapon in the palette, size px square at x, y: three slashes in its colour, and a badge
// in the top right with a little of the enemy in it (like the dual grid badge, drawDualBadge() in
// editor.js), since only enemies use it
function drawEnemyWeaponArt(name, x, y, size) {
  const type = ENEMY_TYPES[name];
  const middleX = x + size / 2;
  const middleY = y + size / 2;
  stroke(type.weapon.colour);
  strokeWeight(2.5);
  for (const along of [-6, 0, 6]) line(middleX + along - 5, middleY + 8, middleX + along + 5, middleY - 8);
  noStroke();
  fill(0, 0, 0, 150);
  rect(x + size - 15, y + 3, 12, 12, 3);
  stroke(type.outline);
  strokeWeight(1);
  fill(type.fill);
  rect(x + size - 11, y + 5, 5, 8, 1);
}

// ---------- the preview ----------

// the preview's floor: flat, endless and normal, with nothing in the way. only what Character and
// Arrow ask a map for (tilemap.js has the real ones)
const PREVIEW_FLOOR = {
  tile: { speed: 1 },
  get() {
    return this.tile;
  },
  colAt: () => 0,
  rowAt: () => 0,
  moveAlongX: (box, dx) => dx,
  moveAlongY: (box, dy) => dy,
  bounds: () => ({ left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity }),
};

// the preview down the side of the weapon editor: someone using the weapon on a dummy, through its
// whole combo and again, walking up when it's out of reach. they're real Characters (character.js) on
// PREVIEW_FLOOR, so knockback, stagger, recoil and hit stop work exactly like on the map, and it shakes
// with its own camera like the screen would. nothing in it touches the game. click it to start over.
//   weapon    the settings to use (weaponForm()'s draft, which changes as you drag)
//   attacker  the settings of whose body uses it (PLAYER, or the enemy kind it belongs to)
//   target    the settings of whose body gets hit (an enemy kind, or PLAYER for an enemy's weapon)
class WeaponPreview extends UIElement {
  constructor(options) {
    super(options);
    this.weapon = options.weapon;
    // only its shake is used (Camera.shake())
    this.camera = new Camera();
    // no particles, since they'd burst onto the map
    const character = (settings) => Object.assign(new Character(0, 0, settings), { camera: this.camera, hitParticles: null });
    this.attacker = character(options.attacker);
    this.target = character(options.target);
    this.attacker.currentWeapon = () => this.weapon;
    this.attacker.targets = () => [this.target];
    // the dummy fills straight back up
    this.target.die = () => { this.target.health = this.target.maxHealth; };
    // what characters know (top of character.js)
    this.world = { map: PREVIEW_FLOOR, players: [], enemies: [], npcs: [], characters: [this.attacker, this.target], arrows: [] };
    this.start();
  }

  // everyone back in place for another go
  start() {
    for (const c of [this.attacker, this.target]) {
      Object.assign(c, {
        y: 0, health: c.maxHealth, pushVelocity: { x: 0, y: 0 }, pushLocked: false, stagger: 0, frozen: 0, swing: null,
        attackCooldown: 0, attackBuffer: 0, comboStep: 0, comboLeft: 0, backhand: false, charge: null,
      });
    }
    this.attacker.x = 0;
    this.target.x = (this.weapon.attack === 'shoot' ? WEAPON_PREVIEW.shootGap : WEAPON_PREVIEW.gap) + this.target.w / 2;
    this.world.arrows = [];
    // seconds it's been waiting since the combo finished
    this.waited = 0;
  }

  update(hovered) {
    this.hovered = hovered;
    const dt = Math.min(deltaTime / 1000, MAX_DT); // config.js
    const { attacker, target, weapon } = this;
    const attacking = attacker.comboStep < (weapon.combo?.length ?? 1);
    // once the combo's finished and settled, a pause and then another go
    if (!attacking && attacker.attackCooldown === 0 && !attacker.swing) this.waited += dt;
    if (this.waited >= WEAPON_PREVIEW.pause || (hovered && Input.buttonsPressed.has('left'))) this.start();

    // walks up when the next hit wouldn't reach, like an enemy would
    const reach = comboHit(weapon, attacker.comboStep).reach;
    const far = weapon.attack !== 'shoot' && target.x - target.w / 2 - attacker.x > reach * 0.9;
    attacker.update({ move: { x: attacking && far ? 1 : 0, y: 0 }, aim: { x: target.x, y: target.y }, attack: attacking && !far }, dt, this.world);
    target.update(STAND_STILL, dt, this.world);
    this.world.arrows = this.world.arrows.filter((arrow) => arrow.update(dt, this.world));
    this.camera.updateShake(dt);
  }

  draw() {
    const { x, y, w, h } = this;
    noStroke();
    fill(WORLD_COLOURS.outside); // world.js
    rect(x, y, w, h, 3);
    push();
    // anything knocked off the edge gets cut off
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    // the shake is in screen px, like the real one
    translate(Math.round(x + w * 0.25 + this.camera.shakeX), Math.round(y + h * 0.5 + this.camera.shakeY));
    scale(WEAPON_PREVIEW.zoom);
    // a faint tile grid fixed to the floor, so you can see how far things move
    const left = -w * 0.25 / WEAPON_PREVIEW.zoom;
    const right = w * 0.75 / WEAPON_PREVIEW.zoom;
    const half = h / 2 / WEAPON_PREVIEW.zoom;
    stroke(255, 255, 255, 18);
    strokeWeight(1 / WEAPON_PREVIEW.zoom);
    for (let gx = Math.ceil(left / TILE) * TILE; gx < right; gx += TILE) line(gx, -half, gx, half);
    for (let gy = Math.ceil(-half / TILE) * TILE; gy < half; gy += TILE) line(left, gy, right, gy);
    this.target.draw();
    this.attacker.draw();
    for (const arrow of this.world.arrows) arrow.draw();
    pop();

    const hits = this.weapon.combo?.length ?? 1;
    noStroke();
    fill(EDITOR_COLOURS.dimText); // editor.js
    setText(11, BOLD, CENTER, BOTTOM);
    text(hits > 1 ? `Hit ${Math.max(1, Math.min(this.attacker.comboStep, hits))} of ${hits}, click to restart` : 'Click to restart', x + w / 2, y + h - 4);
  }
}
