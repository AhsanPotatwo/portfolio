// enemy pathfinding: walks round walls, through mazes and corridors, and weighs harm against time
// like a player would. used by the smart, careful and reckless ais (ENEMY_AIS in enemies.js).
//
// how a plan is made (planPath()): A* over tiles (a search that tries the most promising tiles
// first, so it finds the cheapest route without trying every tile). each step costs
//   seconds to walk it (slow tiles cost more) + hp it'd take × caution × fear
//   caution  seconds of extra walking worth 1 hp to this ai. 0.15 (smart): it walks ~5 tiles round
//            one lava tile, but takes a spike rather than a long detour
//   fear     maxHealth / health, up to PATH_MAX_FEAR: hurt enemies get careful
// a route that would kill it is a wall (even to reckless, caution 0). no route (water between): it
// goes to the closest tile it found and waits. replans every PATH_REPLAN_TIME.
//
// dev mode draws every plan (drawEnemyPlans(), P toggles): tiles searched (blue), the route (green,
// orange to red where it hurts, with the hp), the goal, and a label with the ai, the route's time
// and hp, and fear when scared.
//
// ponytail: ignores push and slippery tiles and other characters in the way (they collide on the
// walk). add them to stepCost() / passable checks if enemies get stuck on them

// most tiles one plan may search, so a far or unreachable player can't stall a frame (~38 × 38 tiles)
const PATH_MAX_SEARCH = 1500;
// seconds between replans; the player keeps moving
const PATH_REPLAN_TIME = 0.3;
// most fear multiplies caution by (see above)
const PATH_MAX_FEAR = 4;
// once chasing, it gives up only past sightRange × this, so a long way round doesn't lose it
const PATH_GIVE_UP_RANGE = 1.5;

const PATH_COLOURS = {
  searched: [80, 170, 255, 45],   // tiles the search looked at
  safe:     [90, 230, 120, 220],  // route through harmless tiles
  hurt:     [255, 70, 40, 230],   // route through a tile that hurts as much as PATH_COLOUR_FULL_HURT
  goal:     [255, 255, 255, 220],
};
// hp on one tile that draws fully red
const PATH_COLOUR_FULL_HURT = 20;

// an ai (enemies.js) that chases the nearest player within sightRange along planned routes.
// caution: see the top of this file
function pathfinder(caution) {
  return (enemy, world, dt) => huntAlongPath(enemy, world, dt, caution);
}

function huntAlongPath(enemy, world, dt, caution) {
  const player = nearestPlayer(world, enemy);
  const distance = player ? Math.hypot(player.x - enemy.x, player.y - enemy.y) : Infinity;
  if (distance > enemy.type.sightRange * (enemy.plan ? PATH_GIVE_UP_RANGE : 1)) {
    enemy.plan = null;
    return STAND_STILL;
  }
  const aim = { x: player.x, y: player.y };
  const attack = distance < enemy.type.attackRange;

  const map = world.map;
  // feetTile() is in warps.js
  const [col, row] = feetTile(enemy, map);
  const plan = enemy.plan;
  if (!plan || plan.map !== map || (plan.age += dt) > PATH_REPLAN_TIME) {
    enemy.plan = planPath(map, enemy, col, row, ...feetTile(player, map), caution);
  }
  const path = enemy.plan.path;

  // tiles reached drop off (several if pushed or slid ahead), so it heads for the next. moving on
  // as soon as it's in a tile, not at its middle, means it hugs corners; walls slide it round
  const here = path.findIndex((tile) => tile.col === col && tile.row === row);
  if (here >= 0) path.splice(0, here + 1);

  const next = path[0];
  if (!next) {
    // on the player's tile: straight at them, like chasePlayer. no way to them: wait at the closest
    const move = enemy.plan.reached ? towards(player.x - enemy.x, player.y - enemy.y) : STAND_STILL.move;
    return { move, aim, attack };
  }
  const feetY = enemy.y + feetBelowCentre(enemy.settings);
  return { move: towards((next.col + 0.5) * TILE - enemy.x, (next.row + 0.5) * TILE - feetY), aim, attack };
}

// the cheapest route from the enemy's tile to the goal tile (see the top of this file):
// { map, path: [{ col, row }] (start left out), reached, time (s), damage (hp), fear, searched
// (map.index() of every tile looked at, for dev mode), age (s since made) }
function planPath(map, enemy, startCol, startRow, goalCol, goalRow, caution) {
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
    // somewhere to wait, so not in lava
    const left = guess(col, row);
    if (left < bestGuess && !map.get(col, row).damagePerSecond) {
      best = current;
      bestGuess = left;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const c = col + dx;
      const r = row + dy;
      if (map.isSolid(c, r)) continue;
      // no cutting a wall's corner: the feet would catch on it
      if (dx !== 0 && dy !== 0 && (map.isSolid(col + dx, row) || map.isSolid(col, row + dy))) continue;
      const step = stepCost(map.get(c, r), enemy, dx !== 0 && dy !== 0);
      if (!step) continue;
      const hp = damage.get(current) + step.damage;
      // would kill it on the way
      if (hp >= enemy.health) continue;
      const next = map.index(c, r);
      const total = cost.get(current) + step.time + step.damage * weight;
      if (cost.has(next) && cost.get(next) <= total) continue;
      cost.set(next, total);
      time.set(next, time.get(current) + step.time);
      damage.set(next, hp);
      cameFrom.set(next, current);
      heapPush(open, [total + guess(c, r), next]);
    }
  }

  const path = [];
  for (let i = best; i !== start; i = cameFrom.get(i)) {
    path.unshift({ col: map.left + (i % map.cols), row: map.top + Math.floor(i / map.cols) });
  }
  return { map, path, reached: best === goal, time: time.get(best), damage: damage.get(best), fear, searched, age: 0 };
}

// 8 directions, straight ones first
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// { time (s), damage (hp) } to walk onto a tile (tiles.js settings), or null if it can't (speed 0).
// damage: its step damage plus damage per second for the time crossing it
function stepCost(tile, enemy, diagonal) {
  const speed = enemy.speed * tile.speed;
  if (speed <= 0) return null;
  const time = (diagonal ? TILE * Math.SQRT2 : TILE) / speed;
  return { time, damage: tile.damagePerStep + tile.damagePerSecond * (TILE / speed) };
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

// every enemy's ai name, and its plan if it has one (see the top of this file). world positions
// (inside camera.begin/end), from sketch.js
function drawEnemyPlans(enemies, camera) {
  const px = 1 / camera.zoom;
  for (const enemy of enemies) {
    const plan = enemy.plan;
    if (plan) drawPlan(enemy, plan, px);

    let label = aiName(enemy.ai); // enemies.js
    if (plan) {
      label += `  ${plan.time.toFixed(1)}s`;
      if (plan.damage > 0) label += ` -${Math.round(plan.damage)}hp`;
      if (plan.fear > 1.05) label += ` fear x${plan.fear.toFixed(1)}`;
      if (!plan.reached) label += ' (no way)';
    }
    const y = enemy.y - enemy.h / 2 - 16;
    setText(11 * px, BOLD, CENTER, BOTTOM, 'Courier Prime');
    noStroke();
    fill(0, 0, 0, 160);
    rect(enemy.x - textWidth(label) / 2 - 3 * px, y - 13 * px, textWidth(label) + 6 * px, 14 * px, 3 * px);
    fill(255);
    text(label, enemy.x, y);
  }
}

function drawPlan(enemy, plan, px) {
  const map = plan.map;
  noStroke();
  fill(...PATH_COLOURS.searched);
  for (const i of plan.searched) {
    rect(map.left * TILE + (i % map.cols) * TILE + 2, map.top * TILE + Math.floor(i / map.cols) * TILE + 2, TILE - 4, TILE - 4);
  }

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
