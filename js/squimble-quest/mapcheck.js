// lists in the map editor's Map menu, each a window you can drag around (ListWindow in ui.js):
//   Check for problems  things on the map that would go wrong in the game (mapProblems()): a spawn or
//                       arrival warp the player would be stuck in, warps that go nowhere real,
//                       characters standing in walls, sounds, voices, items and atmospheres that don't
//                       exist. it checks again while it's open, so fixing one takes it off. clicking
//                       one goes there and flashes the tile
//   Check every map     the same for every map, each problem with its map's name. clicking one goes to
//                       that map too
//   Find uses           everywhere the thing picked in the palette is used (findUses()): on every map,
//                       and in other things' settings (a tile kind's particles, an item's hit sound).
//                       handy before renaming or deleting something, or to find that one grunt
//   Art report          pictures that didn't load (ART_PROBLEMS in utils.js) or are the wrong size for
//                       what they're on (artSizeProblems()). handy when a batch of sprites goes in.
//                       clicking one picks that thing in the palette
// the wrong sizes go in the console once everything's loaded too (checkArtSizes())

const MapCheck = {
  window: null,

  // every is Check every map, otherwise it's just the map you're on. one list at a time, so opening
  // either replaces what's open
  open(every = false) {
    if (this.window?.isOpen()) this.window.close();
    let problems = [];
    let checked = -Infinity;
    // worked out again twice a second, since it builds the maps warps go to
    const lines = () => {
      if (millis() - checked > 500) {
        const names = every ? Object.keys(MAPS) : [worldMap.name];
        problems = names.flatMap((map) => mapProblems(getMap(map)).map((problem) => ({ ...problem, map })));
        checked = millis();
        this.window.title = `Problems on ${every ? 'every map' : worldMap.name} (${problems.length})`;
      }
      return problems.map((problem) => ({
        text: problem.text,
        note: every ? problem.map : null,
        colour: EDITOR_COLOURS.text,
        // one for the whole map just goes to that map (if it's another)
        onClick: problem.col === null && !every ? null : () => Editor.goToMap(problem.map, problem.col, problem.row),
      }));
    };
    this.window = UI.add(new ListWindow({
      title: 'Problems', w: 420, h: 260, x: GAME_W - EDITOR_LAYOUT.dockWidth - 430, y: EDITOR_LAYOUT.toolbarHeight + 10, group: 'editor',
      lines, empty: 'Nothing wrong that the check knows about', footer: () => (problems.length ? 'Click one to go there' : ''),
    }));
  },
};

const FindUses = {
  window: null,

  // thing is { kind, name } (Editor.selected). like the problem list it looks again twice a second
  // while open, so it keeps up with painting and erasing
  open(thing) {
    if (this.window?.isOpen()) this.window.close();
    let uses = [];
    let checked = -Infinity;
    const lines = () => {
      if (millis() - checked > 500) {
        uses = findUses(thing);
        checked = millis();
        this.window.title = `Uses of ${thing.name} (${uses.length})`;
      }
      return uses.map((use) => ({
        text: use.text,
        note: use.map ?? '',
        onClick: use.map ? () => Editor.goToMap(use.map, use.col, use.row) : null,
      }));
    };
    this.window = UI.add(new ListWindow({
      // lower down than the problem list, so both can be open
      title: 'Uses', w: 420, h: 260, x: GAME_W - EDITOR_LAYOUT.dockWidth - 430, y: EDITOR_LAYOUT.toolbarHeight + 70, group: 'editor',
      lines, empty: `Nothing uses ${thing.name}`, footer: () => (uses.some((use) => use.map) ? 'Click one to go there' : ''),
    }));
  },
};

// everywhere a palette thing ({ kind, name }) is used, as [{ text, map, col, row }]: tiles counted per
// map (going to the first), everything placed on a map whose settings name it (an enemy holding it, a
// sound block playing it), and every catalogue entry whose settings name it, which have no map. the
// Triggers tab lists every spawn, warp or area instead
function findUses({ kind, name }) {
  const uses = [];
  const add = (text, map = null, col = null, row = null) => uses.push({ text, map, col, row });
  // what's on a map, by what it's called in the list and how to say which one it is. a `type` names a
  // catalogue entry of that kind, so a grunt enemy isn't a use of a grunt object
  const placed = (map) => [
    ['enemy', map.enemySpawns, (spawn) => `An enemy (${spawn.type})`],
    ['npc', map.npcSpawns, (spawn) => `An npc (${spawn.type})`],
    ['object', map.objects, (obj) => `A ${obj.type}`],
    // items on the ground, whose kind is their category (the palette tab they're on)
    ...Object.keys(ITEM_CATEGORIES).map((category) => [category, map.items.filter((entry) => ITEM_TYPES[entry.type]?.category === category), (entry) => `A ${entry.type} on the ground`]),
    ['sound', map.sounds, (block) => `A sound block (${block.sound})`],
    ['warp', map.warps, (warp) => `Warp ${warp.name}`],
    ['area', map.areas, (area) => `An area (${area.atmosphere || 'no atmosphere'})`],
  ];
  const usesIt = (entry, listKind) => Object.entries(entry).some(([key, value]) =>
    key === 'type' ? listKind === kind && value === name : key !== 'name' && mentions(value, name));

  for (const mapName of Object.keys(MAPS)) {
    const map = getMap(mapName); // maps.js
    if (kind === 'trigger') {
      if (name === 'spawn') add('The spawn', mapName, map.colAt(map.spawn.x), map.rowAt(map.spawn.y + feetBelowCentre(PLAYER)));
      for (const warp of name === 'warp' ? map.warps : []) add(`Warp ${warp.name} to ${warp.to || 'nowhere'}`, mapName, warp.col, warp.row);
      for (const area of name === 'area' ? map.areas : []) add(`An area (${area.atmosphere || 'no atmosphere'})`, mapName, area.col, area.row);
      continue;
    }
    if (kind === 'tile') {
      let count = 0;
      let first = null;
      for (let row = map.top; row < map.top + map.rows; row++) {
        for (let col = map.left; col < map.left + map.cols; col++) {
          if (map.tiles[map.index(col, row)] !== name) continue;
          count++;
          first ??= { col, row };
        }
      }
      if (count > 0) add(`${count} tile${count === 1 ? '' : 's'}`, mapName, first.col, first.row);
    }
    if (map.atmosphere === name) add("The map's atmosphere", mapName);
    for (const [listKind, list, say] of placed(map)) {
      for (const entry of list) if (usesIt(entry, listKind)) add(say(entry), mapName, entry.col, entry.row);
    }
  }

  // other things' settings, like the lava tile's particles or the sword's hit sound
  const catalogues = [
    ['tile', TILE_TYPES], ['object', OBJECT_TYPES], ['enemy', ENEMY_TYPES], ['npc', NPC_TYPES], ['item', ITEM_TYPES],
    ['sound', SOUNDS], ['voice', VOICES], ['particle effect', PARTICLE_EFFECTS], ['atmosphere', ATMOSPHERES],
  ];
  for (const [what, types] of catalogues) {
    for (const [other, settings] of Object.entries(types)) {
      if (other === name) continue;
      if (Object.entries(settings).some(([key, value]) => key !== 'name' && key !== 'label' && mentions(value, name))) add(`The ${what} ${other} names it in its settings`);
    }
  }
  if (mentions(PLAYER, name)) add("The player's settings name it (PLAYER in config.js)");
  return uses;
}

// whether value, or anything in its lists and plain objects, is exactly name. other objects (p5
// colours and pictures, characters) are skipped, and so is anything nested too deep to be a setting
function mentions(value, name, depth = 0) {
  if (value === name) return true;
  if (depth > 4 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((inside) => mentions(inside, name, depth + 1));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).some((inside) => mentions(inside, name, depth + 1));
}

// what's wrong with a map, as [{ text, col, row }] (col and row are null for the whole map)
function mapProblems(map) {
  const problems = [];
  const add = (text, col = null, row = null) => problems.push({ text, col, row });
  const stuck = (col, row) => (map.get(col, row) ? 'a solid tile' : 'an empty tile');

  const spawn = { col: map.colAt(map.spawn.x), row: map.rowAt(map.spawn.y + feetBelowCentre(PLAYER)) };
  if (map.isSolid(spawn.col, spawn.row)) add(`The spawn is on ${stuck(spawn.col, spawn.row)}, so the player starts stuck`, spawn.col, spawn.row);
  if (map.atmosphere && !ATMOSPHERES[map.atmosphere]) add(`The map's atmosphere "${map.atmosphere}" doesn't exist`);

  // the warps on any map that arrive at one of this map's warps (maps.js builds them)
  const arrivals = new Set();
  for (const name of Object.keys(MAPS)) {
    for (const warp of getMap(name).warps) if (warp.to === map.name && warp.toWarp) arrivals.add(warp.toWarp);
  }
  const walkable = (col, row) => !map.isSolid(col, row);
  for (const warp of map.warps) {
    const { col, row, name } = warp;
    const broken = warpProblem(warp); // warps.js
    if (broken) add(`Warp ${name}: ${broken}`, col, row);
    if (!map.isSolid(col, row)) continue;
    if (arrivals.has(name)) add(`Warp ${name} is on ${stuck(col, row)}, so players arriving there get stuck`, col, row);
    if (warp.activate === 'step') add(`Warp ${name} opens by stepping, but it's on ${stuck(col, row)} nobody can step on`, col, row);
    else if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => walkable(col + dc, row + dr))) add(`Warp ${name} opens with E, but there's nowhere next to it to stand`, col, row);
  }

  for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
    for (const spawn of map[info.list]) {
      const { col, row, type } = spawn;
      const who = `${kind === 'enemy' ? 'An enemy' : 'An npc'} (${type})`;
      if (map.isSolid(col, row)) add(`${who} stands on ${stuck(col, row)}, so it can't move`, col, row);
      if (spawn.sound && !SOUNDS[spawn.sound]) add(`${who} carries the sound "${spawn.sound}", which doesn't exist`, col, row);
      if (spawn.voice && !VOICES[spawn.voice]) add(`${who} talks with the voice "${spawn.voice}", which doesn't exist`, col, row);
      if (typeof spawn.holds === 'string' && !ITEM_TYPES[spawn.holds]?.weapon) add(`${who} holds "${spawn.holds}", which isn't a weapon`, col, row);
      for (const name of Object.values(spawn.wears ?? {})) if (!ITEM_TYPES[name]) add(`${who} wears "${name}", which doesn't exist`, col, row);
      for (const key of ['hitParticles', 'deathParticles']) {
        if (spawn[key] && !PARTICLE_EFFECTS[spawn[key]]) add(`${who} bursts the particles "${spawn[key]}", which don't exist`, col, row);
      }
    }
  }

  for (const block of map.sounds) {
    if (!SOUNDS[block.sound]) add(`A sound block plays "${block.sound}", which doesn't exist`, block.col, block.row);
  }
  for (const area of map.areas) {
    if (area.atmosphere && !ATMOSPHERES[area.atmosphere]) add(`An area uses the atmosphere "${area.atmosphere}", which doesn't exist`, area.col, area.row);
  }
  for (const obj of map.objects) {
    const type = OBJECT_TYPES[obj.type];
    if (!map.inside(obj.col + type.width - 1, obj.row + type.height - 1)) add(`A ${obj.type} hangs off the edge of the map`, obj.col, obj.row);
    for (const name of obj.items ?? []) if (name !== null && !ITEM_TYPES[name]) add(`A ${obj.type} starts with "${name}", which doesn't exist`, obj.col, obj.row);
  }
  for (const { type, col, row } of map.items) {
    if (!ITEM_TYPES[type]) add(`An item on the ground is "${type}", which doesn't exist`, col, row);
    else if (map.isSolid(col, row)) add(`A ${type} lies on ${stuck(col, row)}, so it can't be picked up`, col, row);
  }
  return problems;
}

// ---------- art ----------

const ArtReport = {
  window: null,

  open() {
    if (this.window?.isOpen()) return;
    const problems = [...ART_PROBLEMS, ...artSizeProblems()];
    const lines = problems.map((problem) => ({
      text: `${problem.name}: ${problem.file.split('/').pop()} ${problem.problem}`,
      note: problem.kind,
      onClick: this.pickable(problem) ? () => this.pick(problem) : null,
    }));
    this.window = UI.add(new ListWindow({
      title: `Art report (${problems.length})`, w: 460, h: 260, x: GAME_W - EDITOR_LAYOUT.dockWidth - 470, y: EDITOR_LAYOUT.toolbarHeight + 40, group: 'editor',
      lines: () => lines, empty: 'Every picture loaded and fits what it\'s on', footer: () => 'Details are in the console (F12) too',
    }));
  },

  // the palette tab a problem's thing is on, if it has one
  kindOf(problem) {
    if (problem.kind === 'item') return ITEM_TYPES[problem.name]?.category ?? null;
    return { tile: 'tile', object: 'object', enemy: 'enemy', npc: 'npc', 'particle effect': 'particle' }[problem.kind] ?? null;
  },

  pickable(problem) {
    const kind = this.kindOf(problem);
    return Boolean(kind && EDITOR_CATALOGUES[kind]?.[problem.name]);
  },

  pick(problem) {
    Editor.choose({ kind: this.kindOf(problem), name: problem.name });
  },
};

// pictures that loaded but don't fit what they're on, in the same shape as ART_PROBLEMS: tiles that
// aren't square (they'd be stretched) or whose variants and frames are a different size to their
// texture, dual grid tilesets that can't be cut into 4 x 4 pieces, and sheets of frames (art.js)
// that don't split evenly into their frames and directions. a picture that's still loading (1 x 1) is
// skipped
function artSizeProblems() {
  const problems = [];
  const add = (kind, name, file, problem) => problems.push({ kind, name, file, problem });
  const loaded = (img) => img && img.width > 1;
  for (const type of Object.values(TILE_TYPES)) {
    if (type.dualGrid && loaded(type.textureImg)) {
      const problem = dualTilesetProblem(type.textureImg); // dualgrid.js
      if (problem) add('tile', type.name, texturePath(type), `can't be a dual grid tileset: ${problem}`);
    }
    if (type.dualGrid || !loaded(type.img)) continue;
    const { width, height } = type.img;
    if (width !== height) add('tile', type.name, texturePath(type), `is ${width} × ${height} px, so it's stretched to a square`);
    const which = type.frameImgs.length ? 'frame' : 'variant';
    for (const img of type.frameImgs.length ? type.frameImgs : type.variantImgs) {
      if (loaded(img) && (img.width !== width || img.height !== height)) add('tile', type.name, texturePath(type), `has a ${which} that's ${img.width} × ${img.height} px, a different size`);
    }
  }
  for (const art of ART_CACHE.values()) {
    if (!loaded(art?.img)) continue;
    const { width, height } = art.img;
    if (width % art.frames || height % art.directions) add(art.kind, art.name, art.image, `is ${width} × ${height} px, which doesn't split into ${art.frames} frames across and ${art.directions} directions down, so its frames slide about`);
  }
  return problems;
}

// the wrong sizes, in the console, once the pictures have had time to load (setup() in sketch.js)
function checkArtSizes() {
  for (const { kind, name, file, problem } of artSizeProblems()) console.warn(`The ${kind} "${name}": ${file} ${problem}`);
}
