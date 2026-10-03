// enemy pathfinding: walks round walls, through mazes and corridors, weighs harm against time like a
// player would, and works round the other characters. used by the smart, careful and reckless ais
// (ENEMY_AIS in enemies.js). who they chase is sensePlayer() in enemies.js, shared with every ai.
//
// how a plan is made (planPath()): A* over tiles (a search that tries the most promising tiles
// first, so it finds the cheapest route without trying every tile). each step costs
//   seconds to walk it (slow tiles cost more) + hp it'd take × caution × fear + crowd
//   caution  seconds of extra walking worth 1 hp to this ai. 0.15 (smart): it walks ~5 tiles round
//            one lava tile, but takes a spike rather than a long detour
//   fear     maxHealth / health, up to PATH_MAX_FEAR: hurt enemies get careful
//   crowd    seconds for tiles other characters are on or will be on soon (crowdCosts()), read from
//            what each one is: a pathfinder along its own plan, a direct chaser in a straight line
//            until a wall stops it, anyone else (no ai, idle, npcs) standing where they are. so a
//            group spreads out and comes at you from more than one side instead of queueing
// a route that would kill it, or leave it under PATH_SAFETY of its health, is a wall even to
// reckless. no route (water between): it goes to the closest free tile it found and waits. replans
// every PATH_REPLAN_TIME.
//
// walking a plan (huntAlongPath()):
//   - close to the player it heads for a free, harmless tile beside them (attackSpot()), so a group
//     surrounds them, and it won't step into lava they stand in to swing: it waits at the edge
//   - it turns on tile middles and never steps diagonally past a wall, or past a tile worse
//     underfoot than either end, so it doesn't brush lava beside its route. never left in lava
//   - stuck (trying to walk but not moving, PATH_STUCK) it steps back from whoever's in the way and
//     plans round them for a moment; if they're already giving way, it keeps going
//   - with nobody to chase it walks back to where it started
//
// dev mode draws every plan (drawEnemyPlans(), P toggles): tiles searched (blue), crowd costs
// (purple dots, bigger costs more), the route (green, orange to red where it hurts, with the hp),
// the goal, and a label: the ai, what it's doing, the route's time and hp, fear when scared.
//
// ponytail: ignores push and slippery tiles (they still act on the walk). add them to stepCost() if
// enemies get swept off their routes

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
// stuck: tried to walk but moved under `progress` × its speed for `patience` seconds (random in the
// range, so two stuck on each other don't give way at once). then it steps straight back from the
// nearest character for `backOff` seconds, and for `avoid` seconds characters within 1.5 tiles cost
// `cost` more seconds, so it goes round them or waits its turn
const PATH_STUCK = { progress: 0.25, patience: [0.3, 0.8], backOff: 0.35, avoid: 1.5, cost: 8 };

const PATH_COLOURS = {
  searched: [80, 170, 255, 45],   // tiles the search looked at
  crowd:    [190, 90, 255, 150],  // crowd cost dots
  safe:     [90, 230, 120, 220],  // route through harmless tiles
  hurt:     [255, 70, 40, 230],   // route through a tile that hurts as much as PATH_COLOUR_FULL_HURT
  goal:     [255, 255, 255, 220],
};
// hp on one tile that draws fully red
const PATH_COLOUR_FULL_HURT = 20;

// an ai (enemies.js) that chases along planned routes. caution: see the top of this file
function pathfinder(caution) {
  return (enemy, world, dt) => huntAlongPath(enemy, world, dt, caution);
}

function huntAlongPath(enemy, world, dt, caution) {
  const map = world.map;
  // feetTile() is in warps.js
  const [col, row] = feetTile(enemy, map);
  // only on its own map: one that followed through a warp has no home here
  enemy.home ??= { map, col, row };
  const player = sensePlayer(enemy, world, dt); // enemies.js
  const goal = player ? attackSpot(enemy, world, player) : enemy.home.map === map ? [enemy.home.col, enemy.home.row] : null;
  if (!goal || (!player && goal[0] === col && goal[1] === row)) {
    enemy.plan = null;
    return walked(enemy, STAND_STILL);
  }
  const aim = player ? { x: player.x, y: player.y } : null;
  const attack = !!player && Math.hypot(player.x - enemy.x, player.y - enemy.y) < enemy.type.attackRange;

  const stuck = checkStuck(enemy, world, dt, attack);
  // giving way: a step straight back from whoever it's stuck on first, since they may be beside it
  // in the same tile, where no route can go round them
  const s = enemy.stuck;
  if (s.backOff > 0) {
    s.backOff -= dt;
    return walked(enemy, { move: towards(enemy.x - s.awayFrom.x, enemy.y - s.awayFrom.y), aim, attack });
  }
  const plan = enemy.plan;
  if (stuck || !plan || plan.map !== map || plan.target !== player || (plan.age += dt) > PATH_REPLAN_TIME) {
    enemy.plan = planPath(map, enemy, col, row, goal[0], goal[1], caution, crowdCosts(enemy, world));
    enemy.plan.target = player;
    enemy.plan.age = randomBetween(0, PATH_REPLAN_TIME / 2); // utils.js
  }
  const path = enemy.plan.path;

  // drop tiles it's passed (several if pushed or slid ahead). the one it's on goes once it's at the
  // middle (towards() stops within 4px), so it turns on tile middles
  const feetY = enemy.y + feetBelowCentre(enemy.settings);
  const here = path.findIndex((tile) => tile.col === col && tile.row === row);
  if (here > 0) path.splice(0, here);
  if (here >= 0 && Math.abs((col + 0.5) * TILE - enemy.x) <= 4 && Math.abs((row + 0.5) * TILE - feetY) <= 4) path.shift();

  const next = path[0];
  if (!next) {
    // there: straight at the player to swing, like chasePlayer, but not onto anything worse
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

// true the frame it's been stuck long enough to replan round whoever's beside it (PATH_STUCK). not
// while fighting: pressing against the player is the point. if one beside it is already giving way,
// it keeps going instead, or both would step aside, come back and stick again
function checkStuck(enemy, world, dt, fighting) {
  const s = enemy.stuck ??= { x: enemy.x, y: enemy.y, time: 0, patience: randomBetween(...PATH_STUCK.patience), avoid: 0, backOff: 0, awayFrom: null, trying: false };
  const moved = Math.hypot(enemy.x - s.x, enemy.y - s.y);
  s.x = enemy.x;
  s.y = enemy.y;
  s.avoid = Math.max(0, s.avoid - dt);
  s.time = s.trying && !fighting && moved < enemy.speed * dt * PATH_STUCK.progress ? s.time + dt : 0;
  if (s.time < s.patience) return false;
  s.time = 0;
  s.patience = randomBetween(...PATH_STUCK.patience);
  const near = (other) => other !== enemy && !other.dead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < TILE * 1.5;
  if (world.enemies.some((other) => near(other) && other.stuck?.avoid > 0)) return false;
  s.avoid = PATH_STUCK.avoid;
  // back off from the nearest one (huntAlongPath())
  const blockers = [...world.enemies, ...world.npcs].filter(near);
  const blocker = blockers.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
  if (blocker) {
    s.backOff = PATH_STUCK.backOff;
    s.awayFrom = { x: blocker.x, y: blocker.y };
  }
  return true;
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
