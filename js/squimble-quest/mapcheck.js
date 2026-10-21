// two lists in the map editor's Map menu, each a window you can drag around (ListWindow in ui.js):
//   Check for problems  things on the map that would go wrong in the game (mapProblems()): a spawn or
//                       arrival warp the player would be stuck in, warps that go nowhere real,
//                       characters standing in walls, sounds, voices, items and atmospheres that don't
//                       exist. it checks again while it's open, so fixing one takes it off. clicking
//                       one goes there and flashes the tile
//   Art report          pictures that didn't load (ART_PROBLEMS in utils.js) or are the wrong size for
//                       what they're on (artSizeProblems()). handy when a batch of sprites goes in.
//                       clicking one picks that thing in the palette
// the wrong sizes go in the console once everything's loaded too (checkArtSizes())

const MapCheck = {
  window: null,

  open() {
    if (this.window?.isOpen()) return;
    let problems = [];
    let checked = -Infinity;
    // worked out again twice a second, since it builds the maps warps go to
    const lines = () => {
      if (millis() - checked > 500) {
        problems = mapProblems(worldMap);
        checked = millis();
        this.window.title = `Problems on ${worldMap.name} (${problems.length})`;
      }
      return problems.map((problem) => ({
        text: problem.text,
        colour: EDITOR_COLOURS.text,
        onClick: problem.col === null ? null : () => Editor.goTo(problem.col, problem.row),
      }));
    };
    this.window = UI.add(new ListWindow({
      title: 'Problems', w: 420, h: 260, x: GAME_W - EDITOR_LAYOUT.dockWidth - 430, y: EDITOR_LAYOUT.toolbarHeight + 10, group: 'editor',
      lines, empty: 'Nothing wrong that the check knows about', footer: () => (problems.length ? 'Click one to go there' : ''),
    }));
  },
};

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
// texture, dual grid tilesets that can't be cut into 4 x 4 pieces, and objects whose picture is a
// different shape to their tiles. a picture that's still loading (1 x 1) is skipped
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
  for (const type of Object.values(OBJECT_TYPES)) {
    if (!loaded(type.img)) continue;
    const picture = type.img.width / type.img.height;
    const tiles = type.width / type.height;
    if (Math.abs(picture / tiles - 1) > 0.02) add('object', type.name, type.image, `is ${type.img.width} × ${type.img.height} px but the object is ${type.width} × ${type.height} tiles, so it's squashed`);
  }
  return problems;
}

// the wrong sizes, in the console, once the pictures have had time to load (setup() in sketch.js)
function checkArtSizes() {
  for (const { kind, name, file, problem } of artSizeProblems()) console.warn(`The ${kind} "${name}": ${file} ${problem}`);
}
