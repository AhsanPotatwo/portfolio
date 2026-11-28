// checks arrows and dropped items with liquids (liquid, tiles.js): an arrow coming down on the floor
// sticks in it, in water it splashes and sinks, in mud (you sink into it, but it isn't a liquid) it
// sticks. shot by someone wading it flies lower, dripping, with a ring at their feet, and low over
// water it skims it. each pixel arrow (arrowPixels() in weapons.js) is one joined up piece with its
// head at the tip. a drop landing in water splashes and bubbles as it sinks, one placed there is
// already in, and one on mud isn't in a liquid. run it with
// node js/squimble-quest/tests/arrow-check.js
// no output means it all passed
const assert = require('assert');
const { load, loadFighting, asset } = require('./load');

// what touches the surface (surface.js), counted
const touched = { plops: [], rings: [] };
const Surface = {
  plop: (liquid, x, y) => touched.plops.push({ liquid, x, y }),
  ringAt: (liquid, x, y) => touched.rings.push({ liquid, x, y }),
};
let drips = 0;
const water = { speed: 1, liquid: true, sink: 0.4, clarity: 0.45, dripParticles: ['drips'] };
const mud = { speed: 1, sink: 0.3 };
const game = loadFighting({
  ENEMY_TYPES: {}, NPC_TYPES: {}, UIElement: class {},
  TILE_TYPES: { floor: { speed: 1 }, water, mud },
  constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), radians: (d) => (d * Math.PI) / 180,
  Surface, Particles: { burst: () => drips++ },
}, ['tilemap.js']);
const { Arrow, Character, PLAYER, TileMap, TILE, ARROW, arrowPixels } = game;
const bow = { ...game.makeWeapon(asset('items/bow.json').weapon, 'bow'), reach: 150 };

// 12 x 4: floor, then water from column 4, then mud from column 9
const map = new TileMap(0, 0, 12, 4, 'floor');
for (let col = 4; col < 12; col++) for (let row = 0; row < 4; row++) map.tiles[map.index(col, row)] = col < 9 ? 'water' : 'mud';
const archer = (x) => Object.assign(new Character(x, 2 * TILE, PLAYER), { targets: () => [] });
const world = { map, characters: [], arrows: [] };
// flies it to the end, and gives it back with how many frames it lasted
const fly = (arrow) => {
  let frames = 0;
  while (arrow.update(1 / 60, world) && frames < 1000) frames++;
  return { arrow, frames };
};

// from the floor, 150 px right: lands in the water at about x 182
touched.plops = [];
const wet = new Arrow(archer(1 * TILE), bow, 0);
while (wet.update(1 / 60, world) && !wet.sinking && wet.stuck === null);
assert(wet.sinking && wet.stuck === null, 'it sinks in water');
assert.strictEqual(touched.plops.length, 1, 'with a splash');
assert.strictEqual(touched.plops[0].liquid, water);
const { frames } = fly(wet);
assert(Math.abs(frames / 60 - ARROW.sinkTime) < 0.1, `and it's gone once it's sunk (${frames / 60} s)`);

// into the mud: stuck, no splash
touched.plops = [];
const muddy = new Arrow(archer(6 * TILE), bow, 0);
while (muddy.update(1 / 60, world) && muddy.stuck === null && !muddy.sinking);
assert(muddy.stuck !== null && !muddy.sinking && touched.plops.length === 0, 'it sticks in mud, which is not a liquid');

// short of the water: stuck in the floor
const dry = new Arrow(archer(0), { ...bow, reach: 60 }, 0);
while (dry.update(1 / 60, world) && dry.stuck === null && !dry.sinking);
assert(dry.stuck !== null && !dry.sinking, 'it sticks in the floor');

// shot by someone wading: lower, dripping, a ring at their feet. low over the water it skims it
touched.rings = [];
drips = 0;
const wader = Object.assign(archer(5 * TILE), { sink: 0.4, liquid: water });
const fromWater = new Arrow(wader, { ...bow, reach: 100 }, 0);
const fromDry = new Arrow(archer(1 * TILE), bow, 0);
assert(fromWater.height < fromDry.height, `shot from water it flies lower (${fromWater.height} px, ${fromDry.height} on land)`);
assert.strictEqual(touched.rings.length, 1, 'a ring at their feet');
fly(fromWater);
assert(drips > 0, 'it drips');
assert(touched.rings.length > 1, 'it skims the water');

// every angle of a pixel arrow: one piece, the head at the tip, feathers at the back
for (let turn = 0; turn < ARROW.turns; turn++) {
  const px = arrowPixels((turn / ARROW.turns) * Math.PI * 2);
  const at = new Map(px.map((p) => [`${p.dx},${p.dy}`, p]));
  assert.strictEqual(at.get('0,0')?.part, 'head', `the head's at the tip (turn ${turn})`);
  assert(px.some((p) => p.part === 'fletch'), `it has feathers (turn ${turn})`);
  const seen = new Set(['0,0']);
  const todo = [[0, 0]];
  while (todo.length) {
    const [x, y] = todo.pop();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${x + dx},${y + dy}`;
        if (at.has(key) && !seen.has(key)) {
          seen.add(key);
          todo.push([x + dx, y + dy]);
        }
      }
    }
  }
  assert.strictEqual(seen.size, px.length, `it's one joined up piece (turn ${turn})`);
}

// ---------- dropped items ----------
const ITEM_TYPES = { sword: { name: 'sword', floats: false }, bow: { name: 'bow', floats: true } };
const drops = load(['tilemap.js', 'inventory.js'], {
  TILE: 32,
  ENEMY_TYPES: {},
  NPC_TYPES: {},
  OBJECT_TYPES: {},
  DataFiles: { register: () => {} },
  UIElement: class {},
  Button: class {},
  TILE_TYPES: { floor: { speed: 1 }, water, mud },
  ITEM_TYPES,
  createItem: (name) => ({ type: ITEM_TYPES[name] }),
  randomBetween: (a, b) => a + Math.random() * (b - a),
  lerp: (a, b, t) => a + (b - a) * t,
  feetBelowCentre: () => 20,
  Surface,
});
const ground = new drops.TileMap(0, 0, 12, 4, 'floor');
for (let col = 4; col < 12; col++) for (let row = 0; row < 4; row++) ground.tiles[ground.index(col, row)] = col < 9 ? 'water' : 'mud';
const nobody = { feetBox: () => ({ x: -1000, y: -1000, w: 10, h: 10 }), dead: false };
touched.plops = [];
touched.rings = [];
const thrown = { item: { type: ITEM_TYPES.sword }, x: 6 * TILE, y: 2 * TILE, ready: false, from: { x: 0, y: 2 * TILE, height: 20 }, flight: 0 };
const onMud = { item: { type: ITEM_TYPES.sword }, x: 10 * TILE, y: 2 * TILE, ready: false, from: { x: 0, y: 2 * TILE, height: 20 }, flight: 0 };
ground.drops.push(thrown, onMud);
for (let i = 0; i < 120; i++) drops.Drops.update(ground, nobody, 1 / 60);
assert.strictEqual(thrown.liquid, water, 'a drop landing in water is in it');
assert.strictEqual(touched.plops.length, 1, 'with one splash');
assert(touched.rings.length > 0, 'and bubbles as it sinks');
assert.strictEqual(onMud.liquid, null, 'one on mud is not in a liquid');
ground.items.push({ type: 'bow', col: 5, row: 1 });
drops.Drops.restock(ground);
assert.strictEqual(ground.drops.at(-1).liquid, water, 'one placed in water is already in it');
assert.strictEqual(touched.plops.length, 1, 'without a splash');
