// warps: tiles that move the player to another map or somewhere else on this one (doors, caves,
// manholes, trapdoors, secret passages, teleporters. "warp" is just what games usually call them).
// you place and link them in the editor's Triggers tab (editor.js). a warp to somewhere on the same
// map is a teleport, and only the player moves. maps stay how they were when you left them (loadMap()
// in sketch.js).
//
// each warp on a map is { name, col, row, to, toWarp, activate, enemies }
//   name      what other warps link to. no two on the same map can share one
//   col, row  its tile. it can share the tile with objects, enemies and npcs
//   to        the name of the map it goes to (maps.js). '' goes nowhere, so you can only arrive there
//   toWarp    the warp you arrive at on that map. '' means its spawn
//   activate  'step' goes off when you step onto it. 'interact' needs E within WARP_REACH (KEYS
//             in config.js)
//   enemies   true lets enemies that are chasing you follow you through (sendFollowers())
//
// every warp is both a way out and a place to arrive, so a house needs two that lead to each other.
// links go by name, so moving a warp is fine, but renaming one breaks any links to it (warpProblem()).
//
// step warps only go off when the player's tile changes onto them (like damagePerStep in
// character.js), and the tile you arrive on counts as already stepped on, so arriving doesn't bounce
// you straight back.
//
// warps live on the map rather than in tiles or objects, because those can't store where to go. what
// shows you there's a warp is whatever's on its tile (a door or trapdoor object, a gap in a wall). an
// 'interact' warp works under a solid object, since WARP_REACH reaches it from the next tile.
//
// warps only move the player. other things you press E on (signs, chests, levers) should be their own
// kind of trigger, copying how inReach() works

// how many px from the middle of your feet to the middle of an 'interact' warp's tile. it's more than
// a tile so it works from the tile in front, even if the warp's tile can't be walked on
const WARP_REACH = 40;

// how many seconds a following enemy takes to open an 'interact' warp once it gets there (like it's
// pressing E)
const WARP_ENEMY_OPEN_TIME = 1;

// only used in the editor. while playing, the tile and objects show where warps are
const WARP_COLOURS = {
  fill:   'rgba(179, 107, 255, 0.35)', // see-through so the tile shows
  edge:   '#b36bff',
  // where it goes doesn't exist (warpProblem())
  broken: '#ff6b6b',
};

const Warps = {
  // the 'interact' warp you can reach with E this frame, or null. sketch.js sets it while playing, and
  // it gets drawn with an E over it
  reachable: null,
  // enemies following you to another map that are on their way. they aren't on either map until they
  // come out (sendFollowers())
  followers: [],

  // loadMap() (sketch.js) and Player.respawn() call this after placing the player. their tile counts
  // as stepped on, so a step warp (or step sound block) there doesn't go off
  arrived(player, map) {
    player.stepTile = feetTile(player, map);
    this.reachable = null;
  },

  // every frame while playing, after everyone's moved. sets off a step warp if the player just stepped
  // onto one. player.stepTile (player.js) is the tile their feet were on last frame, so just standing
  // on one does nothing. SoundBlocks.checkStep() (soundblocks.js) reads it too, so it has to go first
  checkStep(player, map) {
    const [col, row] = feetTile(player, map);
    const [lastCol, lastRow] = player.stepTile ?? [];
    if (col === lastCol && row === lastRow) return;
    player.stepTile = [col, row];
    const warp = map.warpAt(col, row);
    if (warp && warp.activate === 'step') this.use(warp, player);
  },

  // the closest 'interact' warp that goes somewhere, within WARP_REACH of the feet, or null
  inReach(player, map) {
    return closestInReach(player, map.warps.filter((warp) => warp.activate === 'interact' && warp.to));
  },

  // `player` goes through. if where it goes is broken they stay put and a message says why
  use(warp, player) {
    if (!warp.to) return;
    const problem = warpProblem(warp);
    if (problem) {
      showMessage(`This warp is broken: ${problem}`); // hud.js
      console.warn(`The warp "${warp.name}" is broken: ${problem}.`);
      return;
    }
    if (warp.enemies) this.sendFollowers(warp, player);
    loadMap(warp.to, warp.toWarp); // in sketch.js
  },

  // enemies chasing `player` follow them through. each one takes as long as it would to walk there in
  // a straight line, plus WARP_ENEMY_OPEN_TIME for E warps, and then comes out the other end
  // (comeOut()). on the same map they actually walk there (Enemy.update() in enemy.js). to another map
  // they can't, because maps the player isn't on stand still, so they leave now and wait in followers.
  // chasing means enemy.chasing (sensePlayer() in enemies.js). enemies and worldMap are the game's
  // (sketch.js)
  sendFollowers(warp, player) {
    const x = (warp.col + 0.5) * TILE;
    const y = (warp.row + 0.5) * TILE;
    const open = warp.activate === 'interact' ? WARP_ENEMY_OPEN_TIME : 0;
    const chasing = enemies.filter((enemy) => !enemy.following && enemy.chasing === player && enemy.speed > 0);
    for (const enemy of chasing) {
      const walk = Math.hypot(x - enemy.x, y - (enemy.y + feetBelowCentre(enemy.settings))) / enemy.speed;
      enemy.following = { warp, time: walk + open };
    }
    if (getMap(warp.to) === worldMap) return;
    this.followers.push(...chasing);
    enemies = enemies.filter((enemy) => !chasing.includes(enemy));
  },

  // every frame while playing: counts down the followers on their way, and brings out any that arrive
  update(dt) {
    for (const enemy of this.followers) {
      enemy.following.time -= dt;
      if (enemy.following.time <= 0) this.comeOut(enemy);
    }
  },

  // a follower comes out where its warp leads. it joins enemies if the player's on that map, otherwise
  // it goes in the characters that map is keeping (loadMap() in sketch.js)
  comeOut(enemy) {
    const warp = enemy.following.warp;
    enemy.following = null;
    this.followers = this.followers.filter((other) => other !== enemy);
    const map = getMap(warp.to);
    const arrive = map.warp(warp.toWarp);
    if (arrive) {
      enemy.placeFeetOnTile(arrive.col, arrive.row);
    } else {
      // the spawn is the player's middle, so find the tile under their feet
      enemy.placeFeetOnTile(map.colAt(map.spawn.x), map.rowAt(map.spawn.y + feetBelowCentre(PLAYER)));
    }
    if (map === worldMap) {
      if (!enemies.includes(enemy)) enemies.push(enemy);
    } else {
      // a map that's been opened from a file since then doesn't have kept characters yet, and will
      // make its own
      map.characters?.enemies.push(enemy);
    }
  },

  // the E over the warp you can reach. world positions (before camera.end())
  drawPrompt() {
    const warp = this.reachable;
    if (warp) drawKeyPrompt((warp.col + 0.5) * TILE, warp.row * TILE - 4); // npc.js
  },
};

// [col, row] of the tile under the player's feet right now. like player.tileCol/tileRow
// (character.js), except those only update when they move. so after dying and respawning in the
// middle of a frame they'd still have the tile you died on, which made the respawn tile look like you
// just stepped onto it, and sent you back out the warp you arrived by
function feetTile(player, map) {
  return [map.colAt(player.x), map.rowAt(player.y + feetBelowCentre(player.settings))];
}

// the closest of `things` (anything with a col and row) within WARP_REACH of the player's feet, or
// null. used for everything you press E on: warps, and sound blocks (soundblocks.js)
function closestInReach(player, things) {
  const feetX = player.x;
  const feetY = player.y + feetBelowCentre(player.settings);
  let closest = null;
  let closestDistance = WARP_REACH;
  for (const thing of things) {
    const distance = Math.hypot((thing.col + 0.5) * TILE - feetX, (thing.row + 0.5) * TILE - feetY);
    if (distance <= closestDistance) {
      closest = thing;
      closestDistance = distance;
    }
  }
  return closest;
}

// what's wrong with where a warp goes, as a sentence, or null if nothing is. used when warping, for
// the red markers in the editor, and by checkAllWarps()
function warpProblem(warp) {
  if (!warp.to) return null;
  // builds the map the first time it's asked for, then keeps it (maps.js)
  const map = getMap(warp.to);
  if (!map) return `there's no map called "${warp.to}"`;
  if (warp.toWarp && !map.warp(warp.toWarp)) return `the map "${warp.to}" has no warp called "${warp.toWarp}"`;
  return null;
}

// the names of a map's warps, for the editor's "arrive at" picker
function warpNamesOn(mapName) {
  return getMap(mapName)?.warps.map((warp) => warp.name) ?? [];
}

// console warnings for every broken warp on every map. runs once after the maps load (sketch.js).
// ponytail: builds every map to read its warps, fine until there are lots of big maps
function checkAllWarps() {
  for (const name of Object.keys(MAPS)) {
    for (const warp of getMap(name).warps) {
      const problem = warpProblem(warp);
      if (problem) console.warn(`The warp "${warp.name}" on the map "${name}" is broken: ${problem}.`);
    }
  }
}

// the editor's marker: a see-through purple tile (red if it's broken), an E if it opens with E, and
// its name above it. px is one screen pixel (Editor.drawCursor())
function drawWarpMarker(warp, px) {
  const x = warp.col * TILE;
  const y = warp.row * TILE;
  const colour = warpProblem(warp) ? WARP_COLOURS.broken : WARP_COLOURS.edge;
  drawWarpSquare(x, y, TILE, colour, warp.activate === 'interact', px);

  // its name, with a dark outline so it shows up on anything
  fill(255);
  stroke(0, 0, 0, 200);
  strokeWeight(3 * px);
  setText(10, BOLD, CENTER, BOTTOM);
  text(warp.name, x + TILE / 2, y - 2);
  noStroke();
}

// the marker's square, which is also the warp's picture in the editor palette
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
