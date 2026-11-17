// checks rules.js plays exactly like the uni version. runs the original sketch.js (with the few bits of p5 it
// uses faked) and rules.js side by side, fed the same seeded random numbers, through thousands of battles of
// random moves, and checks every turn's outcome, both healths and the accuracy penalty match.
// run with: node js/wizard-battles/tests/rules-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const WizardRules = require('../rules.js');

// small seeded random numbers (mulberry32), so both sides can get the same ones
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the original, with a function on the end to play one turn (its globals are lets, so only its own code can set them)
const source = fs.readFileSync(path.join(__dirname, '../sketch.js'), 'utf8') + `
function __start() {
  enemy1 = new enemy(600, 300, 100, 200, 200, "Enemy", "#FF6B6B");
  player1 = new player(200, 300, 100, 100, 100, "Player", "#98C1FF");
}
function __turn(a, b, c) {
  moveType = a; move = b; moveElement = c;
  moveRegister();
  return { moveOutcome, enemyMoveOutcome, player: player1.playerHealth, enemy: enemy1.enemyHealth, accPenalty };
}`;

let rand = Math.random;
const shims = {
  console: { log() {}, error() {} },
  Math,
  random: (a, b) => (Array.isArray(a) ? a[Math.floor(rand() * a.length)] : a === undefined ? rand() : b === undefined ? rand() * a : rand() * (b - a) + a),
  round: Math.round, max: Math.max, min: Math.min, floor: Math.floor,
};
const script = new vm.Script(source);

const pick = (r, list) => list[Math.floor(r() * list.length)];
let turns = 0;
let wins = 0;
for (let game = 0; game < 3000; game++) {
  // a fresh copy of the original each battle, since it keeps its move lists in globals
  const ctx = vm.createContext({ ...shims });
  script.runInContext(ctx);
  ctx.__start();
  const battle = WizardRules.newBattle(() => rand());
  const choose = seeded(game * 7919 + 1);

  while (!battle.result) {
    // a random player: sometimes a type it keeps choosing, so the enemy's counters and "playing it safe" get used
    const type = pick(choose, ['Attack', 'Attack', 'Defend', 'Heal']);
    let move = pick(choose, WizardRules.MOVES[type]).move;
    if (type === 'Attack' && battle.desperate && choose() < 0.5) move = 'Berserk Strike';
    const element = type === 'Attack' ? pick(choose, game % 3 ? WizardRules.ELEMENTS : ['Fire', 'Fire', 'Water']) : 'n/a';

    const seed = game * 100003 + turns;
    rand = seeded(seed);
    const original = ctx.__turn(type, move, element);
    rand = seeded(seed);
    const t = battle.turn(type, move, element);

    const mine = { moveOutcome: t.moveOutcome, enemyMoveOutcome: t.enemyMoveOutcome, player: battle.player.health, enemy: battle.enemy.health, accPenalty: battle.accPenalty };
    assert.deepStrictEqual(mine, { ...original }, `battle ${game} turn ${t.moveNum}: ${type} ${move} ${element}`);
    turns++;
    if (turns > 5e6) throw new Error('a battle never ended');
  }
  if (battle.result === 'win') wins++;
}

// the csv comes out the same as the original's for a known battle
assert.ok(WizardRules.csv({ moveListPlayer: ['Move 1, Attack, Mid Attack, Earth, Hit for 60 damage'], moveListEnemy: ['Nove 1, attack, Mid Attack, Water, Enemy hit for 18 damage'] }, 'K2U75E2AY1')
  .includes('K2U75E2AY1,1,Enemy,attack,Mid Attack,Water,Enemy hit for 18 damage,18,true'));

console.log(`rules match the original: 3000 battles, ${turns} turns, random player won ${wins}`);
