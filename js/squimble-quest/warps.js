// warps: tiles that move the player to another map or elsewhere on this one (doors, caves, manholes,
// trapdoors, secret passages, teleporters; "warp" is the usual game term). placed and linked in the
// editor's Triggers tab (editor.js). a same-map warp is a teleport: only the player moves. maps keep
// their state when left (loadMap() in sketch.js).
//
// each warp on a map: { name, col, row, to, toWarp, activate, enemies }
//   name      unique per map; what other warps link to
//   col, row  its tile; can share with objects, enemies, npcs
//   to        target map name (maps.js). '' goes nowhere: arrival-only
//   toWarp    warp to arrive at on that map. '' is its spawn
//   activate  'step': on stepping onto it. 'interact': E within WARP_REACH (KEYS in config.js)
//   enemies   true lets chasing enemies follow (sendFollowers())
//
// every warp is both exit and arrival, so a house needs two, each leading to the other. links go by
// name, so moving a warp is safe; renaming breaks links to it (warpProblem()).
//
// step warps only fire when the player's tile changes onto them (like damagePerStep, character.js),
// and the arrival tile counts as already stepped on, so arriving doesn't bounce you back.
//
// warps live on the map, not in tiles or objects, which can't store a target. what shows a warp is
// whatever's on its tile (a door/trapdoor object, a wall gap). an 'interact' warp works under a solid
// object, since WARP_REACH reaches from the next tile.
//
// warps only move the player. other E things (signs, chests, levers) should be their own trigger
// kind, copying how inReach() works

// px from the feet' middle to an 'interact' warp's tile middle. over a tile, so it works from the
// tile in front, even onto an unwalkable tile
const WARP_REACH = 40;

// seconds a following enemy takes to open an 'interact' warp after reaching it (like pressing E)
const WARP_ENEMY_OPEN_TIME = 1;

// editor-only look; in play, the tile and objects show where warps are
const WARP_COLOURS = {
  fill:   'rgba(179, 107, 255, 0.35)', // see-through, the tile shows
  edge:   '#b36bff',
  // target missing (warpProblem())
  broken: '#ff6b6b',
};

const Warps = {
  // the 'interact' warp in E reach this frame, or null. set by sketch.js while playing, drawn with an E
  reachable: null,
  // enemies following to another map, in transit: on neither map until they come out (sendFollowers())
  followers: [],

  // by loadMap() (sketch.js) and Player.respawn() after placing the player: their tile counts as
  // stepped on, so a step warp there doesn't fire
  arrived(player, map) {
    player.warpTile = feetTile(player, map);
    this.reachable = null;
  },

  // every frame while playing, after movement: fires a step warp the player just stepped onto.
  // player.warpTile (player.js) is their feet tile last frame, so standing on one does nothing
  checkStep(player, map) {
    const [col, row] = feetTile(player, map);
    const [lastCol, lastRow] = player.warpTile ?? [];
    if (col === lastCol && row === lastRow) return;
    player.warpTile = [col, row];
    const warp = map.warpAt(col, row);
    if (warp && warp.activate === 'step') this.use(warp, player);
  },

  // closest 'interact' warp with a target within WARP_REACH of the feet, or null
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

  // `player` goes through. broken target: they stay and a message says why
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

  // enemies chasing `player` follow them through: each takes its straight-line walk time plus WARP_ENEMY_OPEN_TIME
  // for E warps, then comes out at the target (comeOut()). same map: they really walk there
  // (Enemy.update() in enemy.js). another map: they can't (maps the player isn't on stand still), so
  // they leave now and wait in followers. chasing: enemy.chasing (sensePlayer() in enemies.js).
  // enemies and worldMap are the game's (sketch.js)
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

  // every frame while playing: counts down followers in transit, bringing out arrivals
  update(dt) {
    for (const enemy of this.followers) {
      enemy.following.time -= dt;
      if (enemy.following.time <= 0) this.comeOut(enemy);
    }
  },

  // a follower comes out at its warp's target. joins enemies if the player's on that map, else the
  // map's kept characters (loadMap() in sketch.js)
  comeOut(enemy) {
    const warp = enemy.following.warp;
    enemy.following = null;
    this.followers = this.followers.filter((other) => other !== enemy);
    const map = getMap(warp.to);
    const arrive = map.warp(warp.toWarp);
    if (arrive) {
      enemy.placeFeetOnTile(arrive.col, arrive.row);
    } else {
      // spawn is the player's centre; find the tile under their feet
      enemy.placeFeetOnTile(map.colAt(map.spawn.x), map.rowAt(map.spawn.y + feetBelowCentre(PLAYER)));
    }
    if (map === worldMap) {
      if (!enemies.includes(enemy)) enemies.push(enemy);
    } else {
      // a map opened from file since has no kept characters yet, and will make its own
      map.characters?.enemies.push(enemy);
    }
  },

  // E over the reachable warp. world positions (before camera.end())
  drawPrompt() {
    const warp = this.reachable;
    if (warp) drawKeyPrompt((warp.col + 0.5) * TILE, warp.row * TILE - 4); // npc.js
  },
};

// [col, row] under the player's feet now. like player.tileCol/tileRow (character.js), but those
// update on movement, so after a mid-frame death and respawn they'd still hold the death tile, making
// the respawn tile look freshly stepped on and firing the warp they arrived by
function feetTile(player, map) {
  return [map.colAt(player.x), map.rowAt(player.y + feetBelowCentre(player.settings))];
}

// what's wrong with a warp's target, as a sentence, or null. used when warping, for red editor
// markers, and by checkAllWarps()
function warpProblem(warp) {
  if (!warp.to) return null;
  // builds the map on first ask, then keeps it (maps.js)
  const map = getMap(warp.to);
  if (!map) return `there's no map called "${warp.to}"`;
  if (warp.toWarp && !map.warp(warp.toWarp)) return `the map "${warp.to}" has no warp called "${warp.toWarp}"`;
  return null;
}

// a map's warp names, for the editor's arrival picker
function warpNamesOn(mapName) {
  return getMap(mapName)?.warps.map((warp) => warp.name) ?? [];
}

// console warnings for every broken warp on every map. once after maps load (sketch.js).
// ponytail: builds every map to read its warps, fine until there are lots of big maps
function checkAllWarps() {
  for (const name of Object.keys(MAPS)) {
    for (const warp of getMap(name).warps) {
      const problem = warpProblem(warp);
      if (problem) console.warn(`The warp "${warp.name}" on the map "${name}" is broken: ${problem}.`);
    }
  }
}

// editor marker: see-through purple tile (red if broken), E if it opens with E, name above. px is
// one screen pixel (Editor.drawCursor())
function drawWarpMarker(warp, px) {
  const x = warp.col * TILE;
  const y = warp.row * TILE;
  const colour = warpProblem(warp) ? WARP_COLOURS.broken : WARP_COLOURS.edge;
  drawWarpSquare(x, y, TILE, colour, warp.activate === 'interact', px);

  // name, dark outline so it shows on anything
  fill(255);
  stroke(0, 0, 0, 200);
  strokeWeight(3 * px);
  setText(10, BOLD, CENTER, BOTTOM);
  text(warp.name, x + TILE / 2, y - 2);
  noStroke();
}

// the marker's square, also the editor palette's warp icon
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
