// ================================ enemy pathfinding ================================
//
// how the smart, careful and reckless enemies (ENEMY_AIS in enemies.js) get to the player: round
// walls, through mazes and corridors, weighing harm against time like a player would, and working
// round each other. read this before changing any of it.
//
// ---------- the pieces, and where they live ----------
//
//   sensePlayer()    enemies.js  who to chase: sight, hearing, alerting allies, memory. every ai uses
//                                it (direct's chasePlayer too), so all enemies notice and lose you the
//                                same way. writes enemy.chasing and enemy.unseen
//   ENEMY_AIS        enemies.js  the ais the editor offers (right click an enemy). pathfinder(caution)
//                                below makes ours; the number is all that differs between them
//   huntAlongPath()  here        the ai itself, run every frame (see "one frame")
//   planPath()       here        the A* route. pure: reads the map and the enemy and changes nothing,
//                                so tests/pathfinding-check.js runs it in node on drawn maps
//   crowdCosts()     here        what the other characters will do next, as extra cost per tile
//   checkStuck()     here        noticing it's stuck, and who gives way (goesFirst())
//   drawEnemyPlans() here        dev mode's view of all of it (sketch.js draws it, P toggles)
//   clearLine()      tilemap.js  line of sight, for sensePlayer(). seeThrough tiles (water) don't block
//
// ---------- one frame ----------
//
// sketch.js makes world = { map, players, enemies, npcs, characters }, then each enemy.update()
// (enemy.js) calls think() → enemy.ai(enemy, world, dt), which for us is huntAlongPath(). it returns
// controls { move, aim, attack } (top of character.js), the same as the player's keys, and
// Character.walk() does the moving: tile speed and pushes, walls (map.moveAlongX/Y in tilemap.js) and
// other characters' feet (stopAtOthers()). so the ai only ever picks a direction. it can't walk
// through anything, and anything it gets wrong shows up as walking into a wall or another enemy.
//
// huntAlongPath(), in order:
//   1. who to chase (sensePlayer()). nobody: walk home, or stand still once there
//   2. where to: the player's tile, or close to them a free harmless tile beside them (attackSpot())
//   3. stuck? (checkStuck()). giving way to someone: step back from them, later wait (see below)
//   4. replan if PATH_REPLAN_TIME is up, it just got stuck, or the map or who it's after changed
//   5. drop the tiles it's passed, then walk to the middle of the next (towards() in enemies.js)
//   6. no tiles left: close in and swing, but not onto worse ground; never left standing in lava
//
// ---------- what each enemy keeps (declared in Enemy's constructor, enemy.js) ----------
//
//   chasing, unseen  sensePlayer()'s: the player it's after, and seconds since it last saw or heard
//                    them. Warps.sendFollowers() (warps.js) reads chasing to pick who follows you
//                    through a warp, and the dev mode label shows both
//   plan             planPath()'s result, plus target (the player it was made for, null going home)
//                    and age (seconds). other enemies read it too: crowdCosts() predicts them by it
//   home             { map, col, row }: its first tile, set on its first think. only used on that
//                    map, so one that followed you through a warp doesn't walk to a tile on the
//                    wrong one
//   stuck            checkStuck()'s: last position, seconds stuck, patience, trying (did it ask to
//                    walk last frame: walked()), avoid, yieldTo, backOff and wait (PATH_STUCK)
// all of these start empty on a fresh Enemy: spawnCharacters() (sketch.js) makes those on a map's
// first visit and whenever the editor opens, closes or changes characters. leaving a map keeps its
// enemy objects as they are (loadMap()), so they carry on where they were. plan and home hold the
// map they were made on (plan.map, home.map), and both are ignored on any other map.
//
// ---------- planning: what a route costs (planPath()) ----------
//
// A* over tiles: a search that tries the most promising tiles first, so it finds the cheapest route
// without trying every tile. 8 directions; each step onto a tile costs
//   seconds to walk it (slow tiles cost more) + hp it'd take × caution × fear + crowd
//   caution  seconds of extra walking worth 1 hp to this ai: smart 0.15 walks ~5 tiles round one lava
//            tile but takes a spike rather than a long detour; careful 0.5 goes a long way round;
//            reckless 0.03 takes harm whenever it's quicker
//   fear     maxHealth / health, up to PATH_MAX_FEAR, so hurt enemies get careful. hit a smart one
//            twice and it takes the bridge instead of the lava
//   crowd    crowdCosts(), below
// hp: a tile's damagePerStep, plus damagePerSecond × the seconds crossing it (stepCost()). a route
// that would kill it, or leave it under PATH_SAFETY of its health, is a wall, even to reckless; the
// margin is there because the walk never matches the plan exactly. no way at all (water between,
// or the search ran out): it goes to the closest free tile it found that isn't lava, and waits,
// labelled "(no way)". diagonal steps never cut past a wall (the feet would catch), or past a tile
// worse underfoot than either end (it'd brush the lava beside its route).
//
// ---------- other characters (crowdCosts()) ----------
//
// each plan adds seconds to the tiles other characters are on or will be on soon, predicting each
// one from what it is (expectedRoute()):
//   - a pathfinder: its own plan's next PATH_CROWD.ahead tiles, fading along them
//   - a direct chaser (chasePlayer): a straight line at its target, until a wall, where it'll stand
//   - anyone else (no ai, not chasing, npcs): staying put, which costs most (PATH_CROWD.parked)
// so a group spreads out: the second takes the other side of a fork, some take a wider gap instead
// of queueing at a door, and near the player they surround them (attackSpot()). this is the only
// way they "talk": each reads the others' plans. enemies plan one after another in world.enemies
// order, each seeing the others' latest plans, and replanning every PATH_REPLAN_TIME settles them.
//
// ---------- getting unstuck: right of way (checkStuck(), goesFirst()) ----------
//
// costs per tile can't describe everything: two can end up shoulder to shoulder in one tile at a
// gap, each blocking the other's way in. so if it tries to walk but doesn't move for a moment
// (PATH_STUCK) it replans, and if anyone beside it has right of way it gives way to them:
//   - right of way: fewest tiles left to its goal (the one in front at a door), ties to whoever's
//     first in world.enemies, so both always agree. anyone without a plan (npcs, direct, idle
//     enemies) goes first, since they won't step aside
//   - giving way: a step straight back from that one (not from whoever's nearest, which is often the
//     one pushing from behind), then waiting while its next tile is beside them, until they move
//     on, die or PATH_STUCK.wait runs out. meanwhile the characters beside it cost extra, so it takes
//     another way if there is one
//   - with right of way it keeps pushing; the others are stepping back
// the result is a queue at a door: the front one goes, the next follows when there's room. the
// labels say "giving way" and "stuck, going round".
//
// ---------- tuning ----------
//
//   caution            ENEMY_AIS (enemies.js): how much each ai minds harm
//   sightRange         per enemy kind (ENEMY_DEFAULTS); ENEMY_HEARING, ENEMY_ALERT_RANGE and
//                      ENEMY_MEMORY (enemies.js) for the rest of its senses
//   PATH_REPLAN_TIME   lower reacts faster to a dodging player, costs more time per frame
//   PATH_CROWD         higher spreads them more; too high and they take silly detours rather than
//                      share a corridor
//   PATH_STUCK         lower patience unsticks sooner but jitters in crowds; a longer wait queues
//                      more patiently before trying another way
//   PATH_SURROUND      how near the player before it picks a tile beside them
//   PATH_MAX_SEARCH    how far a plan can look before giving up (time per plan)
//   PATH_SAFETY        how close to death a route may take it
//
// ---------- known limits ----------
//
//   - push and slippery tiles aren't planned for, only walked on (see the ponytail note below)
//   - healing tiles aren't sought out, and time spent standing still (queueing on spikes) isn't costed
//   - in a one tile corridor only the front one can fight; the rest queue or find another way
//   - a fully surrounded player: extras find every way through the crowd expensive, the search runs
//     out and they wait where they are with "(no way)" until a spot frees up. fine as it is
//   - routes go tile by tile, with the feet (24 px) fitting a 32 px tile. an enemy with feet wider
//     than about TILE - 8 would snag on corners, and wider than a tile would be sent down corridors
//     it can't fit; planPath() would need its size
//   - sight ignores objects (furniture is low) and is one line from feet to feet
//   - plan, chasing and yieldTo point at objects. fine with one running map; a multiplayer server
//     would want ids (README "Multiplayer, maybe")
//   - time: a plan is up to a few ms when the search runs out; replans are staggered (each plan
//     starts part way through PATH_REPLAN_TIME), and 25 grunts add about 0.6 ms a frame
//
// ---------- changing it ----------
//
//   - another pathfinding ai: a line in ENEMY_AIS with pathfinder(caution). a new behaviour (one that
//     keeps its distance, say) is its own ai function, which can still use sensePlayer() to pick a
//     target and planPath() for routes
//   - a tile setting that should matter to routes: stepCost() (time, hp) and tileHarm() (what counts
//     as harmful for corners, spots beside the player and getting out of lava)
//   - a new kind of character in the way: expectedRoute() decides how it's predicted
//   - check: node js/squimble-quest/tests/pathfinding-check.js, then the ai-test map (maps README)
//     with dev mode on: blue tiles searched, purple dots crowd costs (bigger costs more), the route
//     in green going orange to red where it hurts (with the hp), the goal circled, and a label with
//     the ai, what it's doing, the route's seconds and hp, and fear
//
// ponytail: push and slippery tiles aren't in stepCost(). add them if enemies get swept off routes

// most tiles one plan may search, so a far or unreachable player can't stall a frame (~55 × 55 tiles)
const PATH_MAX_SEARCH = 3000;
// seconds between replans; the player keeps moving. each new plan starts up to half of this in, so a
// group doesn't all plan in one frame
const PATH_REPLAN_TIME = 0.3;
// most fear multiplies caution by (see above)
const PATH_MAX_FEAR = 4;
// share of max health a route must leave it with, or it's treated as a wall
const PATH_SAFETY = 0.1;
// px from the player within which it heads for a free tile beside them (attackSpot())
const PATH_SURROUND = 3 * TILE;
// seconds added to a tile per character (crowdCosts()): standing there and moving on, each of its
// next PATH_CROWD.ahead tiles (fading along them), or staying put there (parked)
const PATH_CROWD = { here: 1, next: 0.6, ahead: 6, parked: 4 };
// stuck (checkStuck()): tried to walk but moved under `progress` × its speed for `patience` seconds
// (random in the range, so a group doesn't all react in the same frame). then, unless it has right
// of way (goesFirst()), it gives way to the one that does: steps straight back from it for `backOff`
// seconds, then waits while its next tile is beside that one, for up to `wait` seconds. and for
// `avoid` seconds characters within 1.5 tiles cost `cost` more seconds, so it takes another way if
// there is one
const PATH_STUCK = { progress: 0.25, patience: [0.3, 0.8], backOff: 0.35, wait: 2, avoid: 1.5, cost: 8 };

const PATH_COLOURS = {
  searched: [80, 170, 255, 45],   // tiles the search looked at
  crowd:    [190, 90, 255, 150],  // crowd cost dots
  safe:     [90, 230, 120, 220],  // route through harmless tiles
  hurt:     [255, 70, 40, 230],   // route through a tile that hurts as much as PATH_COLOUR_FULL_HURT
  goal:     [255, 255, 255, 220],
};
// hp on one tile that draws fully red
const PATH_COLOUR_FULL_HURT = 20;

// an ai (ENEMY_AIS in enemies.js) that chases along planned routes. caution: seconds of detour worth
// 1 hp to it (top of this file). each call makes a new function, so aiName() tells them apart
function pathfinder(caution) {
  return (enemy, world, dt) => huntAlongPath(enemy, world, dt, caution);
}

// the pathfinders' ai, every frame: controls for this enemy (steps 1 to 6 at the top of this file)
function huntAlongPath(enemy, world, dt, caution) {
  const map = world.map;
  // feetTile() is in warps.js
  const [col, row] = feetTile(enemy, map);
  // only on its own map: one that followed through a warp has no home here
  enemy.home ??= { map, col, row };
  // 1, 2. who it's after (enemies.js) and where to head
  const player = sensePlayer(enemy, world, dt);
  const goal = player ? attackSpot(enemy, world, player) : enemy.home.map === map ? [enemy.home.col, enemy.home.row] : null;
  if (!goal || (!player && goal[0] === col && goal[1] === row)) {
    enemy.plan = null;
    return walked(enemy, STAND_STILL);
  }
  const aim = player ? { x: player.x, y: player.y } : null;
  const attack = !!player && Math.hypot(player.x - enemy.x, player.y - enemy.y) < enemy.type.attackRange;

  // 3. stuck, and giving way
  const stuck = checkStuck(enemy, world, dt, attack);
  // giving way (checkStuck()) ends once the one with right of way has moved on, died, or the wait's up
  const s = enemy.stuck;
  const leader = s.yieldTo;
  if (leader) {
    s.wait -= dt;
    if (leader.dead || s.wait <= 0 || Math.hypot(leader.x - enemy.x, leader.y - enemy.y) > TILE * 1.5) s.yieldTo = null;
  }
  // first a step straight back from it: they may be shoulder to shoulder in one tile, where no route
  // can go round, and stepping back from anyone else (say the one behind) can push it into a wall
  if (s.yieldTo && s.backOff > 0) {
    s.backOff -= dt;
    return walked(enemy, { move: towards(enemy.x - leader.x, enemy.y - leader.y), aim, attack });
  }
  // 4. replan. crowdCosts() reads every other character, so it's made fresh each time
  const plan = enemy.plan;
  if (stuck || !plan || plan.map !== map || plan.target !== player || (plan.age += dt) > PATH_REPLAN_TIME) {
    enemy.plan = planPath(map, enemy, col, row, goal[0], goal[1], caution, crowdCosts(enemy, world));
    enemy.plan.target = player;
    enemy.plan.age = randomBetween(0, PATH_REPLAN_TIME / 2); // utils.js
  }
  const path = enemy.plan.path;

  // 5. drop tiles it's passed (several if pushed or slid ahead). the one it's on goes once it's at the
  // middle (towards() stops within 4px), so it turns on tile middles
  const feetY = enemy.y + feetBelowCentre(enemy.settings);
  const here = path.findIndex((tile) => tile.col === col && tile.row === row);
  if (here > 0) path.splice(0, here);
  if (here >= 0 && Math.abs((col + 0.5) * TILE - enemy.x) <= 4 && Math.abs((row + 0.5) * TILE - feetY) <= 4) path.shift();

  const next = path[0];
  if (!next) {
    // 6. there: straight at the player to swing, like chasePlayer, but not onto anything worse
    // underfoot, so it waits at the edge of lava they stand in. no way to them: wait at the closest
    let move = STAND_STILL.move;
    if (player && enemy.plan.reached) {
      move = towards(player.x - enemy.x, player.y - enemy.y);
      const ahead = map.get(map.colAt(enemy.x + (move.x * TILE) / 2), map.rowAt(feetY + (move.y * TILE) / 2));
      if (tileHarm(ahead) > tileHarm(map.get(col, row))) move = STAND_STILL.move;
    }
    // never left standing in lava
    const out = move === STAND_STILL.move && map.get(col, row).damagePerSecond ? nearestSafeTile(map, col, row) : null;
    if (out) move = towards((out.col + 0.5) * TILE - enemy.x, (out.row + 0.5) * TILE - feetY);
    return walked(enemy, { move, aim, attack });
  }
  // then it waits its turn while its way on is beside the one going first (a queue at a doorway).
  // not walking, so it doesn't count as stuck meanwhile
  if (s.yieldTo) {
    const [leaderCol, leaderRow] = feetTile(s.yieldTo, map);
    if (Math.abs(next.col - leaderCol) <= 1 && Math.abs(next.row - leaderRow) <= 1) return walked(enemy, { move: STAND_STILL.move, aim, attack });
  }
  return walked(enemy, { move: towards((next.col + 0.5) * TILE - enemy.x, (next.row + 0.5) * TILE - feetY), aim, attack });
}

// how much a tile hurts (tiles.js settings), for comparing tiles. 0 off the map
function tileHarm(tile) {
  return tile ? tile.damagePerStep + tile.damagePerSecond : 0;
}

// the nearest tile within a few steps that doesn't hurt, as { col, row }, or null
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

// the tile to head for: the player's, but within PATH_SURROUND of them the nearest free, harmless
// one of theirs and the 8 round it, so a group surrounds them instead of queueing behind whoever's
// there, and won't follow them into lava to fight
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

// notes whether it's trying to walk, for checkStuck() next frame
function walked(enemy, controls) {
  if (enemy.stuck) enemy.stuck.trying = controls.move.x !== 0 || controls.move.y !== 0;
  return controls;
}

// true the frame it's been stuck long enough to replan (PATH_STUCK). not while fighting: pressing
// against the player is the point. if a character beside it has right of way (goesFirst()), it also
// gives way to the nearest such one: enemy.stuck.yieldTo, acted on in huntAlongPath(). with right of
// way itself it just keeps pushing; the others step back. without a fixed order, two stuck on each
// other both gave way, came back and stuck again, and stepping back from the nearest character
// (often the one behind) pushed it into a wall, jamming a group at a door for good
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

// right of way between two characters stuck on each other: does `a` go before `b`? whoever's
// fewest tiles from its goal (the one in front at a doorway), ties to whoever's first in
// world.enemies, so they always agree. anyone without a plan (npcs, direct, idle) goes first: it
// won't step aside, so the pathfinder gives way, waits PATH_STUCK.wait, then tries another way
function goesFirst(a, b, world) {
  const tilesLeft = (c) => (c.plan ? c.plan.path.length : -1);
  if (tilesLeft(a) !== tilesLeft(b)) return tilesLeft(a) < tilesLeft(b);
  return world.enemies.indexOf(a) < world.enemies.indexOf(b);
}

// extra seconds per tile (map.index() → s) for every other character, from what it'll do (see the
// top of this file and PATH_CROWD). while stuck, the ones beside it cost PATH_STUCK.cost more
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
    // stuck on this one: where it is and its next two tiles, since they may share a tile (two
    // shoulder to shoulder at a gap, each blocking the other's way in)
    if (enemy.stuck?.avoid > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) < TILE * 1.5) {
      for (const tile of [{ col, row }, ...(ahead?.tiles.slice(0, 2) ?? [])]) add(tile.col, tile.row, PATH_STUCK.cost);
    }
    if (!ahead) {
      add(col, row, PATH_CROWD.parked);
      continue;
    }
    add(col, row, PATH_CROWD.here);
    ahead.tiles.forEach((tile, i) => add(tile.col, tile.row, PATH_CROWD.next * (1 - i / PATH_CROWD.ahead)));
    // a direct chaser stops at the wall in its way and stays
    const last = ahead.tiles[ahead.tiles.length - 1];
    if (ahead.blocked && last) add(last.col, last.row, PATH_CROWD.parked);
  }
  return costs;
}

// { tiles, blocked } another character will walk next (up to PATH_CROWD.ahead), or null if it'll
// stay put. blocked: a wall stops it at the last one
function expectedRoute(other, map) {
  if (other.plan?.map === map && other.plan.path.length > 0) return { tiles: other.plan.path.slice(0, PATH_CROWD.ahead), blocked: false };
  if (other.ai !== chasePlayer || !other.chasing) return null; // enemies.js
  // straight at its target from the feet, a half tile at a time, until a wall
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

// the cheapest route from the enemy's tile to the goal tile (see the top of this file). crowd:
// optional map.index() → extra seconds (crowdCosts()).
// { map, path: [{ col, row }] (start left out), reached, time (s), damage (hp), fear, searched
// (map.index() of every tile looked at, for dev mode), crowd, age (s since made) }
function planPath(map, enemy, startCol, startRow, goalCol, goalRow, caution, crowd = new Map()) {
  const fear = Math.min(PATH_MAX_FEAR, enemy.maxHealth / Math.max(enemy.health, 1));
  const weight = caution * fear;
  // the heuristic (a guess at the cost left) must never guess high, or routes come out wrong, so it
  // assumes the fastest tile all the way
  const fastest = Math.max(1, ...Object.values(TILE_TYPES).map((type) => type.speed));
  const guess = (col, row) => {
    const dx = Math.abs(col - goalCol);
    const dy = Math.abs(row - goalRow);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * TILE / (enemy.speed * fastest);
  };

  const start = map.index(startCol, startRow);
  const goal = map.index(goalCol, goalRow);
  // per tile index: cost so far, seconds, hp, and the tile it came from
  const cost = new Map([[start, 0]]);
  const time = new Map([[start, 0]]);
  const damage = new Map([[start, 0]]);
  const cameFrom = new Map();
  const searched = [];
  const done = new Set();
  const open = [[guess(startCol, startRow), start]];
  // closest to the goal so far, for when it can't be reached
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
    // somewhere to wait, so not in lava, nor where someone else is
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
      // no cutting a corner past a wall (the feet would catch) or past anything worse underfoot than
      // either end (it'd brush it)
      if (dx !== 0 && dy !== 0) {
        const worst = Math.max(tileHarm(tile), tileHarm(next));
        const corner = (cc, cr) => map.isSolid(cc, cr) || tileHarm(map.get(cc, cr)) > worst;
        if (corner(col + dx, row) || corner(col, row + dy)) continue;
      }
      const step = stepCost(next, enemy, dx !== 0 && dy !== 0);
      if (!step) continue;
      const hp = damage.get(current) + step.damage;
      // would kill it, or nearly (walking never matches the plan exactly)
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

// 8 directions, straight ones first
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// { time (s), damage (hp) } to walk onto a tile (tiles.js settings), or null if it can't (speed 0).
// damage: its step damage plus damage per second for the time crossing it (longer diagonally)
function stepCost(tile, enemy, diagonal) {
  const speed = enemy.speed * tile.speed;
  if (speed <= 0) return null;
  const time = (diagonal ? TILE * Math.SQRT2 : TILE) / speed;
  return { time, damage: tile.damagePerStep + tile.damagePerSecond * time };
}

// ---------- a tiny priority queue (binary heap) of [priority, value], lowest first ----------

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

// every enemy's ai and what it's doing, and its plan if it has one (see the top of this file). world
// positions (inside camera.begin/end), from sketch.js
function drawEnemyPlans(enemies, camera) {
  const px = 1 / camera.zoom;
  for (const enemy of enemies) if (enemy.plan) drawPlan(enemy, enemy.plan, px);

  // labels last, over every plan, nudged up so they don't overlap
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

// what an enemy's doing, for its dev mode label
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

  // the route from the enemy's feet, coloured by what each tile does to it
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

  // where it's heading: the goal, or the closest it could get
  const last = plan.path[plan.path.length - 1];
  if (!last) return;
  noFill();
  stroke(...(plan.reached ? PATH_COLOURS.goal : PATH_COLOURS.hurt));
  strokeWeight(2 * px);
  circle((last.col + 0.5) * TILE, (last.row + 0.5) * TILE, TILE * 0.6);
}
