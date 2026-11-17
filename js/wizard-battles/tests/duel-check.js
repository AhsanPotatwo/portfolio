// checks the online duel in rules.js: a few scenes worked out by hand, then thousands of random duels.
// run with: node js/wizard-battles/tests/duel-check.js
const assert = require('assert');
const { MOVES, ELEMENTS, newDuel, legalPick, duelTurn, duelView } = require('../rules.js');

const hit = () => 0; // every roll lands
const miss = () => 0.99; // every roll misses
const atk = (tier, element) => ({ moveType: 'Attack', move: `${tier} Attack`, element });
const pick = (moveType, tier) => ({ moveType, move: `${tier} ${moveType}`, element: 'n/a' });

// fire beats earth: double one way, half the other
let d = newDuel();
duelTurn(d, [atk('Mid', 'Fire'), atk('Mid', 'Earth')], hit);
assert.deepEqual(d.wizards.map((w) => w.health), [85, 40]);

// heals land before attacks, so a heal can't be undone by being at 0 first
d = newDuel();
d.wizards[1].health = 30;
duelTurn(d, [atk('High', 'Neutral'), pick('Heal', 'High')], hit);
assert.equal(d.wizards[1].health, 25);
assert.equal(d.wizards[1].accPenalty, 30);

// a shield halves it (45 * 0.5 rounds up to 23)
d = newDuel();
duelTurn(d, [pick('Defend', 'High'), atk('High', 'Neutral')], hit);
assert.equal(d.wizards[0].health, 77);

// the heal penalty comes off the next move: 75% - 30% = 45%, so a roll of 50 misses, then it's cleared
d = newDuel();
duelTurn(d, [pick('Heal', 'High'), pick('Defend', 'Low')], hit);
const [mine] = duelTurn(d, [atk('Mid', 'Fire'), pick('Defend', 'Low')], () => 0.5);
assert.equal(mine.success, false);
assert.equal(d.wizards[0].accPenalty, 0);

// both at 0 in the same scene is a draw, for both sides
d = newDuel();
d.wizards[0].health = d.wizards[1].health = 10;
let sides = duelTurn(d, [atk('Low', 'Neutral'), atk('Low', 'Neutral')], hit);
assert.equal(d.winner, 'draw');
assert.equal(duelView(d, sides, 0).result, 'draw');

// berserk only at 15% or less, and a miss hurts you
d = newDuel();
const berserk = { moveType: 'Attack', move: 'Berserk Strike', element: 'Water' };
assert(!legalPick(d, 0, berserk));
d.wizards[0].health = 15;
assert(legalPick(d, 0, berserk));
duelTurn(d, [berserk, pick('Defend', 'Low')], miss);
assert.equal(d.wizards[0].health, 5);

// healths set by the room: berserk is 15% of your own, so 30 out of 200
d = newDuel([50, 200]);
assert.deepEqual(d.wizards.map((w) => w.maxHealth), [50, 200]);
d.wizards[1].health = 31;
assert(!legalPick(d, 1, berserk));
d.wizards[1].health = 30;
assert(legalPick(d, 1, berserk));

// nonsense from a player is turned away
d = newDuel();
for (const bad of [null, {}, atk('Huge', 'Fire'), atk('Low', 'Lava'), { ...pick('Defend', 'Low'), element: 'Fire' },
  { moveType: 'Heal', move: 'Low Attack', element: 'n/a' }, { moveType: 'toString', move: 'Low Attack', element: 'Fire' }]) {
  assert(!legalPick(d, 0, bad), JSON.stringify(bad));
}

// thousands of random duels: healths stay in range, both sides see the same scene, and every duel ends
const any = (list) => list[Math.floor(Math.random() * list.length)];
for (let n = 0; n < 3000; n++) {
  d = newDuel();
  while (d.winner == null) {
    const picks = [0, 1].map((seat) => {
      const type = any(Object.keys(MOVES));
      const p = { moveType: type, move: any(MOVES[type]).move, element: type === 'Attack' ? any(ELEMENTS) : 'n/a' };
      const b = { moveType: 'Attack', move: 'Berserk Strike', element: any(ELEMENTS) };
      return legalPick(d, seat, b) && Math.random() < 0.5 ? b : p;
    });
    picks.forEach((p, seat) => assert(legalPick(d, seat, p)));
    sides = duelTurn(d, picks);
    const [a, b] = [duelView(d, sides, 0), duelView(d, sides, 1)];
    assert.equal(a.t.damageEnemy, b.t.damagePlayer);
    assert.equal(a.you.health, b.foe.health);
    for (const w of d.wizards) assert(w.health >= 0 && w.health <= w.maxHealth);
    assert(d.moveNum < 500, 'a duel that never ends');
  }
}
console.log('duel check passed');
