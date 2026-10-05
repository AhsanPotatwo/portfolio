// ================================ enemy pathfinding ================================
//
// how the smart, careful and reckless enemies (ENEMY_AIS in enemies.js) get to the player: round
// walls, through mazes and corridors, weighing up getting hurt against taking longer like a player
// would, and working their way round each other. read this before changing any of it.
//
// ---------- the pieces, and where they live ----------
//
//   sensePlayer()    enemies.js  who to chase: sight, hearing, alerting allies and memory. every ai
//                                uses it (direct's chasePlayer too), so all enemies notice you and lose
//                                you the same way. it sets enemy.chasing and enemy.unseen
//   ENEMY_AIS        enemies.js  the ais you can pick in the editor (right click an enemy).
//                                pathfinder(caution) below makes the ones in this file, and the number
//                                is the only difference between them
//   huntAlongPath()  here        the ai itself, which runs every frame (see "one frame")
//   planPath()       here        the A* route. it only reads the map and the enemy and doesn't change
//                                anything, so tests/pathfinding-check.js can run it in node on little
//                                maps drawn as text
//   crowdCosts()     here        what the other characters are about to do, as extra cost on tiles
//   checkStuck()     here        noticing when it's stuck, and deciding who gives way (goesFirst())
//   drawEnemyPlans() here        dev mode's view of all of this (sketch.js draws it, P turns it on/off)
//   clearLine()      tilemap.js  line of sight, for sensePlayer(). seeThrough tiles (water) don't block it
//
// ---------- one frame ----------
//
// sketch.js makes world = { map, players, enemies, npcs, characters }, then each enemy.update()
// (enemy.js) calls think(), which calls enemy.ai(enemy, world, dt), and for these enemies that's
// huntAlongPath(). it gives back controls { move, aim, attack } (top of character.js), the same as the
// player gets from their keys, and Character.walk() does the actual moving: tile speed and pushes,
// walls (map.moveAlongX/Y in tilemap.js) and other characters' feet (stopAtOthers()). so all the ai
// ever does is pick a direction. it can't walk through anything, and if it gets something wrong you
// just see it walking into a wall or another enemy.
//
// huntAlongPath(), in order:
//   1. who to chase (sensePlayer()). if nobody, walk home, or stand still once it's there
//   2. where to go: the player's tile, or once it's close, a free tile next to them that doesn't
//      hurt (attackSpot())
//   3. is it stuck? (checkStuck()). if it's giving way to someone, step back from them and then wait
//      (see below)
//   4. plan a new route if PATH_REPLAN_TIME is up, it just got stuck, or the map or who it's after
//      has changed
//   5. drop the tiles it's already passed, then walk to the middle of the next one (towards() in
//      enemies.js)
//   6. no tiles left: move in and swing, but not onto worse ground. it never gets left standing in lava
//
// ---------- what each enemy keeps track of (set up in Enemy's constructor, enemy.js) ----------
//
//   chasing, unseen  from sensePlayer(): the player it's after, and the seconds since it last saw or
//                    heard them. Warps.sendFollowers() (warps.js) reads chasing to decide who follows
//                    you through a warp, and the dev mode label shows both
//   plan             what planPath() gave back, plus target (the player it was made for, or null
//                    when going home) and age (in seconds). other enemies read it too, since
//                    crowdCosts() uses it to guess where they're going
//   home             { map, col, row }: the first tile it was on, set the first time it thinks. only
//                    used on that map, so one that followed you through a warp doesn't try to walk to
//                    a tile on the wrong map
//   stuck            from checkStuck(): where it was last, how many seconds it's been stuck, patience,
//                    trying (whether it asked to walk last frame, see walked()), avoid, yieldTo,
//                    backOff and wait (PATH_STUCK)
// these all start empty on a new Enemy. spawnCharacters() (sketch.js) makes new ones the first time
// you visit a map and whenever the editor opens, closes or changes characters. leaving a map keeps
// its enemies exactly as they are (loadMap()), so they carry on from where they were. plan and home
// remember which map they were made on (plan.map, home.map), and get ignored on any other map.
//
// ---------- planning: what a route costs (planPath()) ----------
//
// it uses A* over the tiles, which is a search that tries the most promising tiles first, so it finds
// the cheapest route without having to try every tile. it can go in 8 directions, and each step onto
// a tile costs
//   the seconds to walk it (slow tiles cost more) + the hp it'd lose * caution * fear + crowd
//   caution  how many seconds of extra walking this ai thinks 1 hp is worth. smart (0.15) walks about
//            5 tiles round one lava tile, but takes a spike rather than a long detour. careful (0.5)
//            goes a long way round. reckless (0.03) takes damage whenever it's quicker
//   fear     maxHealth / health, up to PATH_MAX_FEAR, so hurt enemies get more careful. hit a smart
//            one twice and it'll take the bridge instead of going through the lava
//   crowd    crowdCosts(), further down
// the hp is a tile's damagePerStep plus damagePerSecond * the seconds it takes to cross it
// (stepCost()). a route that would kill it, or leave it with less than PATH_SAFETY of its health,
// counts as a wall, even for reckless. that margin is there because the walk never goes exactly like
// the plan. if there's no way at all (water in between, or the search ran out) it goes to the closest
// free tile it found that isn't lava and waits there, labelled "(no way)". diagonal steps never cut
// past a wall corner (the feet would catch on it), or past a tile that's worse to stand on than
// either end (it'd brush the lava next to its route).
//
// ---------- other characters (crowdCosts()) ----------
//
// every plan adds seconds to the tiles that other characters are on or will be on soon, guessing what
// each one will do based on what it is (expectedRoute()):
//   - a pathfinder: the next PATH_CROWD.ahead tiles of its own plan, costing less further along
//   - a direct chaser (chasePlayer): a straight line towards who it's after, up to a wall, where it'll
//     stand
//   - anyone else (no ai, not chasing, npcs): staying where they are, which costs the most
//     (PATH_CROWD.parked)
// so a group spreads out. the second one takes the other side of a fork, some go through a wider gap
// instead of queueing at a door, and near the player they surround them (attackSpot()). this is the
// only way they "talk" to each other: each one reads the others' plans. enemies plan one after another
// in world.enemies order, each seeing the others' newest plans, and replanning every PATH_REPLAN_TIME
// sorts them out.
//
// ---------- getting unstuck: right of way (checkStuck(), goesFirst()) ----------
//
// costs on tiles can't cover everything. two can end up shoulder to shoulder on one tile at a gap,
// each one blocking the other from getting in. so if it tries to walk but doesn't move for a moment
// (PATH_STUCK) it plans again, and if anyone next to it has right of way it gives way to them:
//   - right of way: whoever has the fewest tiles left to its goal (the one in front at a door). if
//     it's a tie it goes to whoever's first in world.enemies, so they both always agree. anyone
//     without a plan (npcs, direct, enemies doing nothing) goes first, since they won't move out of
//     the way
//   - giving way: one step straight back from that one (not from whoever's closest, because that's
//     usually the one pushing from behind), then waiting while its next tile is next to them, until
//     they move on, die, or PATH_STUCK.wait runs out. while that's happening the characters next to it
//     cost extra, so it'll take another way if there is one
//   - the one with right of way just keeps pushing, since the others are stepping back
// what you end up with is a queue at a door: the front one goes, and the next follows when there's
// room. their labels say "giving way" and "stuck, going round".
//
// ---------- tuning ----------
//
//   caution            ENEMY_AIS (enemies.js): how much each ai cares about getting hurt
//   sightRange         set for each kind of enemy (ENEMY_DEFAULTS). ENEMY_HEARING, ENEMY_ALERT_RANGE
//                      and ENEMY_MEMORY (enemies.js) are for the rest of its senses
//   PATH_REPLAN_TIME   lower reacts quicker to a player dodging about, but takes more time each frame
//   PATH_CROWD         higher spreads them out more. too high and they take silly detours instead of
//                      sharing a corridor
//   PATH_STUCK         less patience gets them unstuck sooner but makes them jittery in crowds. a
//                      longer wait makes them queue more patiently before trying another way
//   PATH_SURROUND      how close to the player it has to be before it picks a tile next to them
//   PATH_MAX_SEARCH    how far a plan can look before it gives up (how long each plan takes)
//   PATH_SAFETY        how close to dying a route is allowed to take it
//
// ---------- known limits ----------
//
//   - push and slippery tiles aren't planned for, they just get walked on (see the ponytail note below)
//   - they don't go looking for healing tiles, and time spent standing still (like queueing on spikes)
//     isn't counted
//   - in a one tile wide corridor only the one at the front can fight. the rest queue up or find
//     another way
//   - when the player's completely surrounded, the extra ones find every way through the crowd too
//     expensive, so the search runs out and they wait where they are with "(no way)" until a spot
//     frees up. that's fine as it is
//   - routes go tile by tile, and the feet (24 px) fit in a 32 px tile. an enemy with feet wider than
//     about TILE - 8 would catch on corners, and one wider than a tile would get sent down corridors
//     it can't fit through. planPath() would need to know its size
//   - sight ignores objects (furniture is low) and is just one line from feet to feet
//   - plan, chasing and yieldTo point straight at objects. that's fine with one map running, but a
//     multiplayer server would want ids (README "Multiplayer, maybe")
//   - speed: a plan takes up to a few ms when the search runs out. replans are spread out (each plan
//     starts part of the way through PATH_REPLAN_TIME), and 25 grunts add about 0.6 ms a frame
//
// ---------- changing it ----------
//
//   - another pathfinding ai: a line in ENEMY_AIS with pathfinder(caution). a new kind of behaviour
//     (one that keeps its distance, say) is its own ai function, which can still use sensePlayer() to
//     pick who to go for and planPath() for routes
//   - a tile setting that routes should care about: stepCost() (time and hp) and tileHarm() (what
//     counts as harmful for corners, spots next to the player, and getting out of lava)
//   - a new kind of character getting in the way: expectedRoute() decides how to guess what it'll do
//   - checking it: node js/squimble-quest/tests/pathfinding-check.js, then the ai-test map (maps
//     README) with dev mode on. blue tiles are the ones it searched, purple dots are crowd costs
//     (bigger costs more), the route is green going orange to red where it hurts (with the hp), the
//     goal is circled, and the label shows the ai, what it's doing, the route's seconds and hp, and fear
//
// ponytail: push and slippery tiles aren't in stepCost(). add them if enemies start getting swept off
// their routes

// the most tiles one plan is allowed to search, so a player that's far away or can't be reached
// can't freeze a frame (about 55 x 55 tiles)
const PATH_MAX_SEARCH = 3000;
// seconds between new plans, since the player keeps moving. each new plan starts up to half of this
// already used up, so a group doesn't all plan in the same frame
const PATH_REPLAN_TIME = 0.3;
// the most that fear can multiply caution by (see above)
const PATH_MAX_FEAR = 4;
// how much of its max health a route has to leave it with, otherwise it's treated as a wall
const PATH_SAFETY = 0.1;
// once it's this many px from the player it heads for a free tile next to them (attackSpot())
const PATH_SURROUND = 3 * TILE;
// seconds added to a tile for each character (crowdCosts()): for standing there and moving on, for
// each of its next PATH_CROWD.ahead tiles (less the further along), or for staying put there (parked)
const PATH_CROWD = { here: 1, next: 0.6, ahead: 6, parked: 4 };
// stuck (checkStuck()) means it tried to walk but moved less than `progress` * its speed for
// `patience` seconds (a random number in that range, so a group doesn't all react in the same frame).
// then, unless it has right of way (goesFirst()), it gives way to the one that does: it steps
// straight back from it for `backOff` seconds, then waits while its next tile is next to that one, for
// up to `wait` seconds. and for `avoid` seconds, characters within 1.5 tiles cost `cost` more
// seconds, so it takes another way if there is one
const PATH_STUCK = { progress: 0.25, patience: [0.3, 0.8], backOff: 0.35, wait: 2, avoid: 1.5, cost: 8 };

const PATH_COLOURS = {
  searched: [80, 170, 255, 45],   // tiles the search looked at
  crowd:    [190, 90, 255, 150],  // crowd cost dots
  safe:     [90, 230, 120, 220],  // route through harmless tiles
  hurt:     [255, 70, 40, 230],   // route through a tile that hurts as much as PATH_COLOUR_FULL_HURT or more
  goal:     [255, 255, 255, 220],
};
// how much hp lost on one tile draws it completely red
const PATH_COLOUR_FULL_HURT = 20;

// makes an ai (ENEMY_AIS in enemies.js) that chases along planned routes. caution is how many seconds
// of detour it thinks 1 hp is worth (top of this file). every call makes a new function, which is how
// aiName() tells them apart
function pathfinder(caution) {
  return (enemy, world, dt) => huntAlongPath(enemy, world, dt, caution);
}

// the pathfinders' ai, run every frame. gives the controls for this enemy (steps 1 to 6 at the top of
// this file)
function huntAlongPath(enemy, world, dt, caution) {
  const map = world.map;
  // feetTile() is in warps.js
  const [col, row] = feetTile(enemy, map);
  // only on its own map. one that followed you through a warp doesn't have a home here
  enemy.home ??= { map, col, row };
  // 1, 2. who it's after (enemies.js) and where to go
  const player = sensePlayer(enemy, world, dt);
  const goal = player ? attackSpot(enemy, world, player) : enemy.home.map === map ? [enemy.home.col, enemy.home.row] : null;
  if (!goal || (!player && goal[0] === col && goal[1] === row)) {
    enemy.plan = null;
    return walked(enemy, STAND_STILL);
  }
  const aim = player ? { x: player.x, y: player.y } : null;
  const attack = !!player && Math.hypot(player.x - enemy.x, player.y - enemy.y) < enemy.type.attackRange;

  // 3. being stuck, and giving way
  const stuck = checkStuck(enemy, world, dt, attack);
  // giving way (checkStuck()) ends once the one with right of way has moved on or died, or the wait's up
  const s = enemy.stuck;
  const leader = s.yieldTo;
  if (leader) {
    s.wait -= dt;
    if (leader.dead || s.wait <= 0 || Math.hypot(leader.x - enemy.x, leader.y - enemy.y) > TILE * 1.5) s.yieldTo = null;
  }
  // first a step straight back from it. they might be shoulder to shoulder in one tile, where no route
  // can get round, and stepping back from anyone else (like the one behind) can push it into a wall
  if (s.yieldTo && s.backOff > 0) {
    s.backOff -= dt;
    return walked(enemy, { move: towards(enemy.x - leader.x, enemy.y - leader.y), aim, attack });
  }
  // 4. plan again. crowdCosts() reads every other character, so it gets worked out fresh every time
  const plan = enemy.plan;
  if (stuck || !plan || plan.map !== map || plan.target !== player || (plan.age += dt) > PATH_REPLAN_TIME) {
    enemy.plan = planPath(map, enemy, col, row, goal[0], goal[1], caution, crowdCosts(enemy, world));
    enemy.plan.target = player;
    enemy.plan.age = randomBetween(0, PATH_REPLAN_TIME / 2); // utils.js
  }
  const path = enemy.plan.path;

  // 5. drop the tiles it's already passed (could be several if it got pushed or slid ahead). the one
  // it's on gets dropped once it's at the middle (towards() stops within 4px), so it turns in the
  // middle of tiles
  const feetY = enemy.y + feetBelowCentre(enemy.settings);
  const here = path.findIndex((tile) => tile.col === col && tile.row === row);
  if (here > 0) path.splice(0, here);
  if (here >= 0 && Math.abs((col + 0.5) * TILE - enemy.x) <= 4 && Math.abs((row + 0.5) * TILE - feetY) <= 4) path.shift();

  const next = path[0];
  if (!next) {
    // 6. it's there, so go straight at the player to swing like chasePlayer does, but not onto
    // anything worse to stand on, so it waits at the edge of lava they're standing in. if there's no
    // way to them it waits at the closest spot
    let move = STAND_STILL.move;
    if (player && enemy.plan.reached) {
      move = towards(player.x - enemy.x, player.y - enemy.y);
      const ahead = map.get(map.colAt(enemy.x + (move.x * TILE) / 2), map.rowAt(feetY + (move.y * TILE) / 2));
      if (tileHarm(ahead) > tileHarm(map.get(col, row))) move = STAND_STILL.move;
    }
    // never gets left standing in lava
    const out = move === STAND_STILL.move && map.get(col, row).damagePerSecond ? nearestSafeTile(map, col, row) : null;
    if (out) move = towards((out.col + 0.5) * TILE - enemy.x, (out.row + 0.5) * TILE - feetY);
    return walked(enemy, { move, aim, attack });
  }
  // then it waits its turn while the way it wants to go is next to the one going first (a queue at a
  // doorway). it isn't trying to walk, so it doesn't count as stuck while it waits
  if (s.yieldTo) {
    const [leaderCol, leaderRow] = feetTile(s.yieldTo, map);
    if (Math.abs(next.col - leaderCol) <= 1 && Math.abs(next.row - leaderRow) <= 1) return walked(enemy, { move: STAND_STILL.move, aim, attack });
  }
  return walked(enemy, { move: towards((next.col + 0.5) * TILE - enemy.x, (next.row + 0.5) * TILE - feetY), aim, attack });
}

// how much a tile hurts (its tiles.js settings), for comparing tiles. 0 for off the map
function tileHarm(tile) {
  return tile ? tile.damagePerStep + tile.damagePerSecond : 0;
}

// the closest tile within a few steps that doesn't hurt, as { col, row }, or null
function nearestSafeTile(map, col, row) {
  const seen = new Set([`${col},${row}`]);
  const queue = [{ col, row }];
  while (queue.length > 0 && seen.size < 100) {
    const tile = queue.shift();
    if (tileHarm(map.get(tile.col, tile.row)) === 0) return tile;
    for (const [dx, dy] of NEIGHBOURS) {
      const next = { col: tile.col + dx, row: tile.row + dy };
      if (seen.has(`${next.col},${next.row}`) || map.isSolid(next.col, next.row)) continue;
      seen.add(`${next.col},${next.row}`);
      queue.push(next);
    }
  }
  return null;
}

// the tile to head for: the player's, but once it's within PATH_SURROUND of them, the closest free
// one out of theirs and the 8 round it that doesn't hurt. that way a group surrounds them instead of
// queueing behind whoever's already there, and won't follow them into lava to fight
function attackSpot(enemy, world, player) {
  const map = world.map;
  const [col, row] = feetTile(player, map);
  if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > PATH_SURROUND) return [col, row];
  const taken = new Set(world.enemies.filter((other) => other !== enemy && !other.dead).map((other) => feetTile(other, map).join()));
  const feetY = enemy.y + feetBelowCentre(enemy.settings);
  let best = [col, row];
  let bestDistance = Infinity;
  for (const [dx, dy] of [[0, 0], ...NEIGHBOURS]) {
    const c = col + dx;
    const r = row + dy;
    if (map.isSolid(c, r) || taken.has(`${c},${r}`) || tileHarm(map.get(c, r)) > 0) continue;
    const distance = Math.hypot((c + 0.5) * TILE - enemy.x, (r + 0.5) * TILE - feetY);
    if (distance < bestDistance) {
      best = [c, r];
      bestDistance = distance;
    }
  }
  return best;
}

// remembers whether it's trying to walk, for checkStuck() next frame
function walked(enemy, controls) {
  if (enemy.stuck) enemy.stuck.trying = controls.move.x !== 0 || controls.move.y !== 0;
  return controls;
}

// true on the frame it's been stuck long enough to plan again (PATH_STUCK). not while fighting, since
// pushing up against the player is the whole point then. if a character next to it has right of way
// (goesFirst()), it also gives way to the closest one of those (enemy.stuck.yieldTo, which
// huntAlongPath() deals with). if it has right of way itself it just keeps pushing and the others
// step back. I tried it without a fixed order first, and two stuck on each other would both give
// way, come back and get stuck again. stepping back from the closest character (usually the one
// behind) also pushed it into a wall, which jammed a group at a door forever
function checkStuck(enemy, world, dt, fighting) {
  const s = enemy.stuck ??= { x: enemy.x, y: enemy.y, time: 0, patience: randomBetween(...PATH_STUCK.patience), trying: false, avoid: 0, yieldTo: null, backOff: 0, wait: 0 };
  const moved = Math.hypot(enemy.x - s.x, enemy.y - s.y);
  s.x = enemy.x;
  s.y = enemy.y;
  s.avoid = Math.max(0, s.avoid - dt);
  s.time = s.trying && !fighting && moved < enemy.speed * dt * PATH_STUCK.progress ? s.time + dt : 0;
  if (s.time < s.patience) return false;
  s.time = 0;
  s.patience = randomBetween(...PATH_STUCK.patience);
  const distance = (other) => Math.hypot(other.x - enemy.x, other.y - enemy.y);
  const near = [...world.enemies, ...world.npcs].filter((other) => other !== enemy && !other.dead && distance(other) < TILE * 1.5);
  const leader = near.filter((other) => goesFirst(other, enemy, world)).sort((a, b) => distance(a) - distance(b))[0];
  if (near.length > 0 && !leader) return false;
  if (leader) {
    s.yieldTo = leader;
    s.backOff = PATH_STUCK.backOff;
    s.wait = PATH_STUCK.wait;
    s.avoid = PATH_STUCK.avoid;
  }
  return true;
}

// right of way between two characters stuck on each other: does `a` go before `b`? whoever has the
// fewest tiles left to its goal goes first (the one in front at a doorway), and a tie goes to
// whoever's first in world.enemies, so they always agree. anyone without a plan (npcs, direct, ones
// doing nothing) goes first, because it won't move out of the way, so the pathfinder gives way, waits
// PATH_STUCK.wait, then tries another way
function goesFirst(a, b, world) {
  const tilesLeft = (c) => (c.plan ? c.plan.path.length : -1);
  if (tilesLeft(a) !== tilesLeft(b)) return tilesLeft(a) < tilesLeft(b);
  return world.enemies.indexOf(a) < world.enemies.indexOf(b);
}

// extra seconds on tiles (a Map from map.index() to seconds) for every other character, based on what
// it'll do (see the top of this file and PATH_CROWD). while it's stuck, the ones next to it cost
// PATH_STUCK.cost more
function crowdCosts(enemy, world) {
  const map = world.map;
  const costs = new Map();
  const add = (col, row, seconds) => {
    if (!map.inside(col, row)) return;
    const i = map.index(col, row);
    costs.set(i, (costs.get(i) ?? 0) + seconds);
  };
  for (const other of [...world.enemies, ...world.npcs]) {
    if (other === enemy || other.dead || other.following) continue;
    const [col, row] = feetTile(other, map);
    const ahead = expectedRoute(other, map);
    // stuck on this one: where it is and its next two tiles, since they might be sharing a tile (two
    // shoulder to shoulder at a gap, each blocking the other from getting in)
    if (enemy.stuck?.avoid > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) < TILE * 1.5) {
      for (const tile of [{ col, row }, ...(ahead?.tiles.slice(0, 2) ?? [])]) add(tile.col, tile.row, PATH_STUCK.cost);
    }
    if (!ahead) {
      add(col, row, PATH_CROWD.parked);
      continue;
    }
    add(col, row, PATH_CROWD.here);
    ahead.tiles.forEach((tile, i) => add(tile.col, tile.row, PATH_CROWD.next * (1 - i / PATH_CROWD.ahead)));
    // a direct chaser stops at the wall in its way and stays there
    const last = ahead.tiles[ahead.tiles.length - 1];
    if (ahead.blocked && last) add(last.col, last.row, PATH_CROWD.parked);
  }
  return costs;
}

// { tiles, blocked }: the tiles another character will walk on next (up to PATH_CROWD.ahead), or null
// if it'll stay where it is. blocked means a wall stops it at the last one
function expectedRoute(other, map) {
  if (other.plan?.map === map && other.plan.path.length > 0) return { tiles: other.plan.path.slice(0, PATH_CROWD.ahead), blocked: false };
  if (other.ai !== chasePlayer || !other.chasing) return null; // enemies.js
  // a straight line from its feet towards who it's after, half a tile at a time, until it hits a wall
  const from = { x: other.x, y: other.y + feetBelowCentre(other.settings) };
  const to = { x: other.chasing.x, y: other.chasing.y + feetBelowCentre(other.chasing.settings) };
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (TILE / 2));
  const tiles = [];
  let [lastCol, lastRow] = [map.colAt(from.x), map.rowAt(from.y)];
  for (let i = 1; i <= steps && tiles.length < PATH_CROWD.ahead; i++) {
    const col = map.colAt(from.x + (to.x - from.x) * (i / steps));
    const row = map.rowAt(from.y + (to.y - from.y) * (i / steps));
    if (col === lastCol && row === lastRow) continue;
    if (map.isSolid(col, row)) return { tiles, blocked: true };
    tiles.push({ col, row });
    [lastCol, lastRow] = [col, row];
  }
  return { tiles, blocked: false };
}

// the cheapest route from the enemy's tile to the goal tile (see the top of this file). crowd is an
// optional Map from map.index() to extra seconds (crowdCosts()).
// gives back { map, path: [{ col, row }] (without the start), reached, time (s), damage (hp), fear,
// searched (map.index() of every tile it looked at, for dev mode), crowd, age (s since it was made) }
function planPath(map, enemy, startCol, startRow, goalCol, goalRow, caution, crowd = new Map()) {
  const fear = Math.min(PATH_MAX_FEAR, enemy.maxHealth / Math.max(enemy.health, 1));
  const weight = caution * fear;
  // the heuristic (a guess at how much cost is left) must never guess too high, or the routes come out
  // wrong, so it pretends it's the fastest tile the whole way
  const fastest = Math.max(1, ...Object.values(TILE_TYPES).map((type) => type.speed));
  const guess = (col, row) => {
    const dx = Math.abs(col - goalCol);
    const dy = Math.abs(row - goalRow);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * TILE / (enemy.speed * fastest);
  };

  const start = map.index(startCol, startRow);
  const goal = map.index(goalCol, goalRow);
  // for each tile index: the cost so far, seconds, hp, and the tile it came from
  const cost = new Map([[start, 0]]);
  const time = new Map([[start, 0]]);
  const damage = new Map([[start, 0]]);
  const cameFrom = new Map();
  const searched = [];
  const done = new Set();
  const open = [[guess(startCol, startRow), start]];
  // the closest it's got to the goal so far, for when it can't be reached
  let best = start;
  let bestGuess = guess(startCol, startRow);

  while (open.length > 0 && searched.length < PATH_MAX_SEARCH) {
    const current = heapPop(open)[1];
    if (done.has(current)) continue;
    done.add(current);
    searched.push(current);
    if (current === goal) {
      best = current;
      break;
    }
    const col = map.left + (current % map.cols);
    const row = map.top + Math.floor(current / map.cols);
    const tile = map.get(col, row);
    // somewhere to wait, so not in lava and not where someone else is
    const left = guess(col, row) + (crowd.get(current) ?? 0);
    if (left < bestGuess && !tile.damagePerSecond) {
      best = current;
      bestGuess = left;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const c = col + dx;
      const r = row + dy;
      if (map.isSolid(c, r)) continue;
      const next = map.get(c, r);
      // no cutting a corner past a wall (the feet would catch on it) or past anything worse to stand on
      // than either end (it'd brush against it)
      if (dx !== 0 && dy !== 0) {
        const worst = Math.max(tileHarm(tile), tileHarm(next));
        const corner = (cc, cr) => map.isSolid(cc, cr) || tileHarm(map.get(cc, cr)) > worst;
        if (corner(col + dx, row) || corner(col, row + dy)) continue;
      }
      const step = stepCost(next, enemy, dx !== 0 && dy !== 0);
      if (!step) continue;
      const hp = damage.get(current) + step.damage;
      // would kill it, or nearly (the walk never goes exactly like the plan)
      if (hp >= enemy.health - PATH_SAFETY * enemy.maxHealth) continue;
      const i = map.index(c, r);
      const total = cost.get(current) + step.time + step.damage * weight + (crowd.get(i) ?? 0);
      if (cost.has(i) && cost.get(i) <= total) continue;
      cost.set(i, total);
      time.set(i, time.get(current) + step.time);
      damage.set(i, hp);
      cameFrom.set(i, current);
      heapPush(open, [total + guess(c, r), i]);
    }
  }

  const path = [];
  for (let i = best; i !== start; i = cameFrom.get(i)) {
    path.unshift({ col: map.left + (i % map.cols), row: map.top + Math.floor(i / map.cols) });
  }
  return { map, path, reached: best === goal, time: time.get(best), damage: damage.get(best), fear, searched, crowd, age: 0 };
}

// the 8 directions, straight ones first
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// { time (s), damage (hp) } to walk onto a tile (its tiles.js settings), or null if it can't (speed 0).
// damage is its step damage plus its damage per second for however long it takes to cross (longer
// diagonally)
function stepCost(tile, enemy, diagonal) {
  const speed = enemy.speed * tile.speed;
  if (speed <= 0) return null;
  const time = (diagonal ? TILE * Math.SQRT2 : TILE) / speed;
  return { time, damage: tile.damagePerStep + tile.damagePerSecond * time };
}

// ---------- a tiny priority queue (a binary heap) of [priority, value], lowest first ----------

function heapPush(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= heap[i][0]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
      if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
      if (smallest === i) break;
      [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
      i = smallest;
    }
  }
  return top;
}

// ---------- dev mode ----------

// every enemy's ai and what it's doing, plus its plan if it has one (see the top of this file). world
// positions (inside camera.begin/end), called from sketch.js
function drawEnemyPlans(enemies, camera) {
  const px = 1 / camera.zoom;
  for (const enemy of enemies) if (enemy.plan) drawPlan(enemy, enemy.plan, px);

  // the labels go last so they're on top of every plan, and get nudged up so they don't overlap
  setText(11 * px, BOLD, CENTER, CENTER, 'Courier Prime');
  const lineHeight = 13 * px;
  const placed = [];
  for (const enemy of [...enemies].sort((a, b) => b.y - a.y)) {
    // aiName() is in enemies.js
    const lines = [`${aiName(enemy.ai)}  ${enemyState(enemy)}`];
    const plan = enemy.plan;
    if (plan) {
      let numbers = `${plan.time.toFixed(1)}s`;
      if (plan.damage > 0) numbers += ` -${Math.round(plan.damage)}hp`;
      if (plan.fear > 1.05) numbers += ` fear x${plan.fear.toFixed(1)}`;
      if (!plan.reached) numbers += ' (no way)';
      lines.push(numbers);
    }
    const w = Math.max(...lines.map((line) => textWidth(line))) + 6 * px;
    const h = lines.length * lineHeight + 2 * px;
    const box = { x: enemy.x - w / 2, y: enemy.y - enemy.h / 2 - 14 * px - h, w, h };
    while (placed.some((other) => boxesOverlap(box, other))) box.y -= px; // utils.js
    placed.push(box);
    noStroke();
    fill(0, 0, 0, 160);
    rect(box.x, box.y, box.w, box.h, 3 * px);
    fill(255);
    lines.forEach((line, i) => text(line, enemy.x, box.y + (i + 0.5) * lineHeight + px));
  }
}

// what an enemy's doing, for its label in dev mode
function enemyState(enemy) {
  if (enemy.stuck?.yieldTo) return 'giving way';
  if (enemy.stuck?.avoid > 0) return 'stuck, going round';
  if (enemy.chasing) return enemy.unseen > 0 ? `lost sight ${enemy.unseen.toFixed(1)}s` : 'sees you';
  return enemy.plan ? 'going home' : 'idle';
}

function drawPlan(enemy, plan, px) {
  const map = plan.map;
  const tileX = (i) => (map.left + (i % map.cols)) * TILE;
  const tileY = (i) => (map.top + Math.floor(i / map.cols)) * TILE;
  noStroke();
  fill(...PATH_COLOURS.searched);
  for (const i of plan.searched) rect(tileX(i) + 2, tileY(i) + 2, TILE - 4, TILE - 4);
  fill(...PATH_COLOURS.crowd);
  for (const [i, seconds] of plan.crowd) circle(tileX(i) + TILE / 2, tileY(i) + TILE / 2, Math.min(TILE * 0.7, 4 + seconds * 4));

  // the route from the enemy's feet, coloured by what each tile would do to it
  const safe = color(...PATH_COLOURS.safe);
  const hurt = color(...PATH_COLOURS.hurt);
  let x = enemy.x;
  let y = enemy.y + feetBelowCentre(enemy.settings);
  strokeWeight(3 * px);
  for (const { col, row } of plan.path) {
    const nx = (col + 0.5) * TILE;
    const ny = (row + 0.5) * TILE;
    const step = stepCost(map.get(col, row), enemy, false);
    const harm = step ? step.damage : 0;
    stroke(lerpColor(safe, hurt, Math.min(1, harm / PATH_COLOUR_FULL_HURT)));
    line(x, y, nx, ny);
    if (harm > 0) {
      noStroke();
      fill(hurt);
      setText(10 * px, BOLD, CENTER, CENTER, 'Courier Prime');
      text(`-${Math.round(harm)}`, nx, ny - 9 * px);
    }
    x = nx;
    y = ny;
  }

  // where it's heading: the goal, or the closest it could get to it
  const last = plan.path[plan.path.length - 1];
  if (!last) return;
  noFill();
  stroke(...(plan.reached ? PATH_COLOURS.goal : PATH_COLOURS.hurt));
  strokeWeight(2 * px);
  circle((last.col + 0.5) * TILE, (last.row + 0.5) * TILE, TILE * 0.6);
}
