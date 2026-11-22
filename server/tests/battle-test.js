// plays a quick wizard battle through the server: two players join a room and say who they are, the room
// maker's healths are used, a third is turned away, cheating moves are ignored, both sides see the same scenes
// until someone wins, and leaving tells the other player
// node tests/battle-test.js                 (against wrangler dev)
// node tests/battle-test.js https://...     (against the live server)
import assert from 'node:assert';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const ws = base.replace(/^http/, 'ws');
const code = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase();

// a player whose messages wait in a list until next() takes them
function join() {
  return new Promise((ok, fail) => {
    const s = new WebSocket(`${ws}/room/${code}`);
    const got = [];
    let wake = null;
    s.onmessage = e => { got.push(JSON.parse(e.data)); wake?.(); };
    s.onopen = () => ok(s);
    s.onerror = () => fail(new Error(`couldn't join room ${code}`));
    s.next = async (ms = 3000) => {
      const until = Date.now() + ms;
      while (!got.length) {
        if (Date.now() > until) throw new Error('nothing came');
        await new Promise(r => { wake = r; setTimeout(r, 50); });
      }
      return got.shift();
    };
    s.say = msg => s.send(JSON.stringify(msg));
  });
}
const quiet = async (s) => { await assert.rejects(s.next(600)); };

assert((await fetch(`${base}/health`).then(r => r.json())).ok);

const blue = { robe: '#3f6dc0', trim: '#98c1ff', band: '#f6c96b', beard: '#f6ead6' };
const a = await join();
a.say({ type: 'move', moveType: 'Defend', move: 'Low Defend', element: 'n/a' }); // nothing counts before hello
a.say({ type: 'hello', name: 'Bramble', look: blue, rules: { you: 150, friend: 75 } });
assert.equal((await a.next()).type, 'waiting');
const b = await join();
// a name with junk in it is cleaned up, a look that isn't colours is dropped, and rules from the joiner are
// only theirs to lose (the room maker's are already in)
b.say({ type: 'hello', name: '  Pip\u0007<b>the very long</b>  ', look: { robe: 'red;', trim: 1 } });
const [sa, sb] = [await a.next(), await b.next()];
assert.equal(sa.type, 'start');
assert.deepEqual(sa.you, { name: 'Bramble', look: blue, health: 150 });
assert.deepEqual(sa.foe, { name: 'Pip<b>the ve', look: null, health: 75 });
assert.deepEqual(sb.you, sa.foe);
b.say({ type: 'hello', name: 'Again' }); // only once
await quiet(a);

const c = await join();
assert.equal((await c.next()).type, 'full');

// berserk at full health, made up moves and junk all get ignored
a.say({ type: 'move', moveType: 'Attack', move: 'Berserk Strike', element: 'Fire' });
a.say({ type: 'move', moveType: 'Attack', move: 'Mega Attack', element: 'Fire' });
a.send('not json');
await quiet(b);

let scenes = 0;
let end = null;
while (!end) {
  a.say({ type: 'move', moveType: 'Attack', move: 'High Attack', element: 'Fire' });
  a.say({ type: 'move', moveType: 'Attack', move: 'Low Attack', element: 'Fire' }); // a second pick is ignored
  assert.equal((await b.next()).type, 'picked');
  b.say({ type: 'move', moveType: 'Heal', move: 'Low Heal', element: 'n/a' });
  const [ta, tb] = [await a.next(), await b.next()];
  assert.equal(ta.type, 'turn');
  assert.equal(ta.t.move, 'High Attack');
  assert.equal(tb.t.enemyMove, 'High Attack');
  assert.equal(ta.you.health, tb.foe.health);
  assert.equal(ta.foe.health, tb.you.health);
  scenes++;
  end = ta.result && [ta.result, tb.result];
  assert(scenes < 100);
}
assert.deepEqual(end.sort(), ['lose', 'win']);

// a rematch needs both
a.say({ type: 'again' });
assert.equal((await b.next()).type, 'again');
b.say({ type: 'again' });
const again = await a.next();
assert.equal(again.type, 'start');
assert.equal(again.you.health, 150);
assert.equal((await b.next()).type, 'start');

a.close();
assert.equal((await b.next()).type, 'left');
b.close();
console.log(`room ${code}: ${scenes} scenes, results ${end.join(' / ')}, everything checks out`);
