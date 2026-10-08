// checks who follows the player through a warp (canFollow() and Warps in warps.js). run it with
// node js/squimble-quest/tests/warps-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// just enough of the game for warps.js: two maps, a player and some enemies
const outside = { warps: [] };
const hut = { warps: [{ name: 'exit', col: 0, row: 3 }], characters: { enemies: [] }, warp(name) { return this.warps.find((w) => w.name === name); } };
const game = {
  TILE: 32,
  getMap: (name) => ({ outside, hut })[name],
  feetBelowCentre: () => 0,
};
vm.createContext(game);
// const Warps doesn't end up on game by itself, so put it there
vm.runInContext(`${fs.readFileSync(`${__dirname}/../warps.js`, 'utf8')}
this.Warps = Warps;`, game);

const player = {};
// standing in the middle of the door's tile
const enemy = (settings = {}) => ({
  chasing: player,
  speed: 100,
  x: 16,
  y: 16,
  followsThroughWarps: true,
  type: { doorOpenTime: 1 },
  placeFeetOnTile(col, row) { Object.assign(this, { col, row }); },
  ...settings,
});
const door = { col: 0, row: 0, to: 'hut', toWarp: 'exit', activate: 'interact', enemies: true };
const hole = { ...door, activate: 'step' };

// the rules
assert(game.canFollow(enemy(), door), 'follows through a door');
assert(!game.canFollow(enemy(), { ...door, enemies: false }), 'not through a warp that keeps enemies out');
assert(!game.canFollow(enemy({ followsThroughWarps: false }), door), 'not if it stays behind');
assert(!game.canFollow(enemy({ type: { doorOpenTime: null } }), door), "not through a door it can't open");
assert(game.canFollow(enemy({ type: { doorOpenTime: null } }), hole), "but through a step warp even if it can't open doors");

// going through to another map: only the ones that can follow leave, and they come out at the other end
const grunt = enemy();
const stays = enemy({ followsThroughWarps: false });
const idle = enemy({ chasing: null });
game.enemies = [grunt, stays, idle];
game.worldMap = outside;
game.Warps.sendFollowers(door, player);
assert.deepStrictEqual([...game.Warps.followers], [grunt], 'only the chaser that can follow is on its way');
assert.deepStrictEqual([...game.enemies], [stays, idle], 'and it left the map it was on');
assert.strictEqual(grunt.following.time, 1, 'already at the warp, so just 1 s to open the door');

// the player is in the hut now
game.worldMap = hut;
game.enemies = [];
game.Warps.update(1.1);
assert.deepStrictEqual([...game.enemies], [grunt], 'it comes out in the hut');
assert.deepStrictEqual([grunt.col, grunt.row], [0, 3], 'on the warp it leads to');
assert.strictEqual(grunt.following, null, "and isn't following any more");
