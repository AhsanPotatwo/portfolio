// warps: tiles that take the player to another map, or somewhere else on the same one. a house's
// door, a cave entrance, a manhole, a trapdoor, a secret passage, a teleporter, the way through to
// the next part of a castle: they're all warps. "warp" is the usual name in games for a tile that
// moves you somewhere. they're placed and linked up in the map editor (Triggers tab, see editor.js).
//
// a warp to another spot on the same map is a teleport: only the player moves, and everything
// else carries on as it was. going to another map and back finds it how it was left too (see
// loadMap() in sketch.js)
//
// on a map, each warp is:
//
//   { name, col, row, to, toWarp, activate }
//
//   name      what it's called, so other warps can lead to it. each warp on a map has its own name
//   col, row  the tile it's on. it can share the tile with objects, enemies and npcs
//   to        the name of the map it leads to (maps.js). '' goes nowhere, which is still useful as
//             somewhere to arrive: a warp that's only a way in, never a way out
//   toWarp    the name of the warp on that map to arrive at. '' arrives at that map's spawn point
//   activate  'step' opens it when the player steps onto its tile.
//             'interact' opens it when the player's close enough and presses E (KEYS in config.js)
//
// every warp is both a way out and a place to arrive, so a house needs two: one on the town map
// leading to the one inside, and one inside leading back out. warps link by name rather than by
// position, so a warp can be moved around in the editor without breaking anything leading to it
// (but renaming it does, see warpProblem()).
//
// arriving on a 'step' warp doesn't send you straight back through it. a step warp only opens
// when you step onto its tile from another tile, the same way tile onEnter works (character.js),
// and the tile you arrive on counts as already stepped on.
//
// a warp is on the map rather than part of a tile or object, because a tile or object has nowhere
// to keep where it leads. what shows the player where a warp is, is whatever's drawn on its tile:
// a door, trapdoor or manhole object, or a gap in a wall. a solid object works too, with an
// 'interact' warp on the same tile: E opens it from the tile in front, since WARP_REACH is more
// than a tile.
//
// warps only move the player. something you press E at that does anything else (a sign, a chest,
// a lever) would be its own kind of trigger, and could copy how Warps finds what's in reach

// how close the middle of the player's feet has to be to the middle of an 'interact' warp's tile
// to open it, in pixels. a bit more than a tile, so it works from the tile in front, even when the
// warp's tile is one you can't walk onto
const WARP_REACH = 40;

// how warps look in the map editor. they're invisible while playing, the map's tiles and objects
// are what show where they are
const WARP_COLOURS = {
  fill:   'rgba(179, 107, 255, 0.35)', // see-through, so the tile underneath still shows
  edge:   '#b36bff',
  // for a warp that leads somewhere that doesn't exist (see warpProblem())
  broken: '#ff6b6b',
};

const Warps = {
  // the tile the player's feet were on last frame. a 'step' warp opens when this changes to the
  // warp's tile, so standing on one does nothing, only stepping onto one
  lastCol: null,
  lastRow: null,
  // the 'interact' warp close enough to open with E this frame, or null. worked out in sketch.js
  // every frame while playing, and drawn with an E over it
  reachable: null,

  // run by loadMap() (sketch.js) once the player's been put on the new map. whatever tile they've
  // arrived on counts as already stepped on, so a 'step' warp there doesn't send them straight back
  arrived(player, map) {
    this.lastCol = map.colAt(player.x);
    this.lastRow = map.rowAt(player.y + feetBelowCentre(player.settings));
    this.reachable = null;
  },

  // run every frame while playing, after the player has moved. opens a 'step' warp if they've
  // just stepped onto one. player.tileCol and tileRow are the tile under their feet (character.js)
  checkStep(player, map) {
    const col = player.tileCol;
    const row = player.tileRow;
    if (col === this.lastCol && row === this.lastRow) return;
    this.lastCol = col;
    this.lastRow = row;
    const warp = map.warpAt(col, row);
    if (warp && warp.activate === 'step') this.use(warp);
  },

  // the closest 'interact' warp that leads somewhere and is within WARP_REACH of the player's
  // feet, or null
  inReach(player, map) {
    const feetX = player.x;
    const feetY = player.y + feetBelowCentre(player.settings);
    let closest = null;
    let closestDistance = WARP_REACH;
    for (const warp of map.warps) {
      if (warp.activate !== 'interact' || !warp.to) continue;
      const distance = Math.hypot((warp.col + 0.5) * TILE - feetX, (warp.row + 0.5) * TILE - feetY);
      if (distance <= closestDistance) {
        closest = warp;
        closestDistance = distance;
      }
    }
    return closest;
  },

  // goes through a warp. if it leads somewhere that doesn't exist, the player stays put and a
  // message says what's wrong
  use(warp) {
    if (!warp.to) return;
    const problem = warpProblem(warp);
    if (problem) {
      showMessage(`This warp is broken: ${problem}`); // hud.js
      console.warn(`The warp "${warp.name}" is broken: ${problem}.`);
      return;
    }
    loadMap(warp.to, warp.toWarp); // in sketch.js
  },

  // an E over the warp that can be opened right now. uses world positions, so draw it before
  // camera.end()
  drawPrompt() {
    const warp = this.reachable;
    if (warp) drawKeyPrompt((warp.col + 0.5) * TILE, warp.row * TILE - 4); // npc.js
  },
};

// what's wrong with where a warp leads, as a sentence to show, or null if nothing is. used when
// going through a warp, to mark broken warps red in the editor, and to check every warp once the
// maps have loaded (checkAllWarps() below)
function warpProblem(warp) {
  if (!warp.to) return null;
  // getMap() builds the map the first time it's asked for, then keeps it (maps.js)
  const map = getMap(warp.to);
  if (!map) return `there's no map called "${warp.to}"`;
  if (warp.toWarp && !map.warp(warp.toWarp)) return `the map "${warp.to}" has no warp called "${warp.toWarp}"`;
  return null;
}

// the names of every warp on a map, for picking which one to arrive at in the editor
function warpNamesOn(mapName) {
  return getMap(mapName)?.warps.map((warp) => warp.name) ?? [];
}

// looks at every warp on every map and warns in the browser console about any that lead somewhere
// that doesn't exist. run once when the game starts, after the map files have loaded (sketch.js).
// ponytail: builds every map to look at its warps, fine until there are lots of big maps
function checkAllWarps() {
  for (const name of Object.keys(MAPS)) {
    for (const warp of getMap(name).warps) {
      const problem = warpProblem(warp);
      if (problem) console.warn(`The warp "${warp.name}" on the map "${name}" is broken: ${problem}.`);
    }
  }
}

// a warp's marker in the map editor: its tile, see-through purple (red if it's broken), with an E
// on it if it opens with E, and its name above it. px is one screen pixel (see Editor.drawCursor())
function drawWarpMarker(warp, px) {
  const x = warp.col * TILE;
  const y = warp.row * TILE;
  const colour = warpProblem(warp) ? WARP_COLOURS.broken : WARP_COLOURS.edge;
  drawWarpSquare(x, y, TILE, colour, warp.activate === 'interact', px);

  // the name, with a dark outline so it shows up on anything
  fill(255);
  stroke(0, 0, 0, 200);
  strokeWeight(3 * px);
  setText(10, BOLD, CENTER, BOTTOM);
  text(warp.name, x + TILE / 2, y - 2);
  noStroke();
}

// the square part of a warp's marker, also used for the warp in the editor's bar
function drawWarpSquare(x, y, size, colour, showE, px = 1) {
  fill(WARP_COLOURS.fill);
  stroke(colour);
  strokeWeight(2 * px);
  rect(x + px, y + px, size - 2 * px, size - 2 * px, 3);
  if (showE) {
    noStroke();
    fill(255);
    setText(size * 0.5, BOLD, CENTER, CENTER);
    text('E', x + size / 2, y + size / 2 + 1);
  }
}
