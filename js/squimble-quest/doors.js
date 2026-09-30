// doors: tiles that take the player to another map, or somewhere else on the same one. the way
// into a house, down into a cave, through to the next part of a castle, or a teleporter.
// they're placed and linked up in the map editor (Triggers tab, see editor.js).
//
// on a map, each door is:
//
//   { name, col, row, to, toDoor, activate }
//
//   name      what it's called, so other doors can lead to it. each door on a map has its own name
//   col, row  the tile it's on. it can share the tile with objects, enemies and npcs
//   to        the name of the map it leads to (maps.js). '' goes nowhere, which is still useful as
//             somewhere to arrive: a door that's only a way in, never a way out
//   toDoor    the name of the door on that map to arrive at. '' arrives at that map's spawn point
//   activate  'step' opens it when the player steps onto its tile.
//             'interact' opens it when the player's close enough and presses E (KEYS in config.js)
//
// every door is both a way out and a place to arrive, so a house needs two: one on the town map
// leading to the one inside, and one inside leading back out. doors link by name rather than by
// position, so a door can be moved around in the editor without breaking anything leading to it
// (but renaming it does, see doorProblem()).
//
// arriving on a 'step' door doesn't send you straight back through it. a step door only opens
// when you step onto its tile from another tile, the same way tile onEnter works (character.js),
// and the tile you arrive on counts as already stepped on.
//
// a door is on the map rather than part of a tile or object, because a tile or object has nowhere
// to keep where it leads. later, an object like a door, trapdoor or manhole could show where one
// is: put a solid door object on a tile and an 'interact' door on the same tile, and E opens it
// from the tile in front, since DOOR_REACH is more than a tile

// how close the middle of the player's feet has to be to the middle of an 'interact' door's tile
// to open it, in pixels. a bit more than a tile, so it works from the tile in front, even when the
// door's tile is one you can't walk onto
const DOOR_REACH = 40;

// how doors look in the map editor. they're invisible while playing, the map's tiles and objects
// are what show where they are
const DOOR_COLOURS = {
  fill:   'rgba(179, 107, 255, 0.35)', // see-through, so the tile underneath still shows
  edge:   '#b36bff',
  // for a door that leads somewhere that doesn't exist (see doorProblem())
  broken: '#ff6b6b',
};

const Doors = {
  // the tile the player's feet were on last frame. a 'step' door opens when this changes to the
  // door's tile, so standing on one does nothing, only stepping onto one
  lastCol: null,
  lastRow: null,
  // the 'interact' door close enough to open with E this frame, or null. worked out in sketch.js
  // every frame while playing, and drawn with an E over it
  reachable: null,

  // run by loadMap() (sketch.js) once the player's been put on the new map. whatever tile they've
  // arrived on counts as already stepped on, so a 'step' door there doesn't send them straight back
  arrived(player, map) {
    this.lastCol = map.colAt(player.x);
    this.lastRow = map.rowAt(player.y + feetBelowCentre(player.settings));
    this.reachable = null;
  },

  // run every frame while playing, after the player has moved. opens a 'step' door if they've
  // just stepped onto one. player.tileCol and tileRow are the tile under their feet (character.js)
  checkStep(player, map) {
    const col = player.tileCol;
    const row = player.tileRow;
    if (col === this.lastCol && row === this.lastRow) return;
    this.lastCol = col;
    this.lastRow = row;
    const door = map.doorAt(col, row);
    if (door && door.activate === 'step') this.use(door);
  },

  // the closest 'interact' door that leads somewhere and is within DOOR_REACH of the player's
  // feet, or null
  inReach(player, map) {
    const feetX = player.x;
    const feetY = player.y + feetBelowCentre(player.settings);
    let closest = null;
    let closestDistance = DOOR_REACH;
    for (const door of map.doors) {
      if (door.activate !== 'interact' || !door.to) continue;
      const distance = Math.hypot((door.col + 0.5) * TILE - feetX, (door.row + 0.5) * TILE - feetY);
      if (distance <= closestDistance) {
        closest = door;
        closestDistance = distance;
      }
    }
    return closest;
  },

  // goes through a door. if it leads somewhere that doesn't exist, the player stays put and a
  // message says what's wrong
  use(door) {
    if (!door.to) return;
    const problem = doorProblem(door);
    if (problem) {
      showMessage(`This door is broken: ${problem}`); // hud.js
      console.warn(`The door "${door.name}" is broken: ${problem}.`);
      return;
    }
    loadMap(door.to, door.toDoor); // in sketch.js
  },

  // an E over the door that can be opened right now. uses world positions, so draw it before
  // camera.end()
  drawPrompt() {
    const door = this.reachable;
    if (door) drawKeyPrompt((door.col + 0.5) * TILE, door.row * TILE - 4); // npc.js
  },
};

// what's wrong with where a door leads, as a sentence to show, or null if nothing is. used when
// going through a door, to mark broken doors red in the editor, and to check every door once the
// maps have loaded (checkAllDoors() below)
function doorProblem(door) {
  if (!door.to) return null;
  // getMap() builds the map the first time it's asked for, then keeps it (maps.js)
  const map = getMap(door.to);
  if (!map) return `there's no map called "${door.to}"`;
  if (door.toDoor && !map.door(door.toDoor)) return `the map "${door.to}" has no door called "${door.toDoor}"`;
  return null;
}

// the names of every door on a map, for picking which one to arrive at in the editor
function doorNamesOn(mapName) {
  return getMap(mapName)?.doors.map((door) => door.name) ?? [];
}

// looks at every door on every map and warns in the browser console about any that lead somewhere
// that doesn't exist. run once when the game starts, after the map files have loaded (sketch.js).
// ponytail: builds every map to look at its doors, fine until there are lots of big maps
function checkAllDoors() {
  for (const name of Object.keys(MAPS)) {
    for (const door of getMap(name).doors) {
      const problem = doorProblem(door);
      if (problem) console.warn(`The door "${door.name}" on the map "${name}" is broken: ${problem}.`);
    }
  }
}

// a door's marker in the map editor: its tile, see-through purple (red if it's broken), with an E
// on it if it opens with E, and its name above it. px is one screen pixel (see Editor.drawCursor())
function drawDoorMarker(door, px) {
  const x = door.col * TILE;
  const y = door.row * TILE;
  const colour = doorProblem(door) ? DOOR_COLOURS.broken : DOOR_COLOURS.edge;
  drawDoorSquare(x, y, TILE, colour, door.activate === 'interact', px);

  // the name, with a dark outline so it shows up on anything
  fill(255);
  stroke(0, 0, 0, 200);
  strokeWeight(3 * px);
  setText(10, BOLD, CENTER, BOTTOM);
  text(door.name, x + TILE / 2, y - 2);
  noStroke();
}

// the square part of a door's marker, also used for the door in the editor's bar
function drawDoorSquare(x, y, size, colour, showE, px = 1) {
  fill(DOOR_COLOURS.fill);
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
