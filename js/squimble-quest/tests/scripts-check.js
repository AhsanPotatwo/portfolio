// checks the list of files at the top of sketch.js is the files squimble-quest.html loads, in the same
// order, and that every .js file in js/squimble-quest/ is loaded. the two lists are kept by hand (README
// "Keep the notes true"), and they'd drifted apart once already. run it with
// node js/squimble-quest/tests/scripts-check.js
// no output means it all passed
const fs = require('fs');
const assert = require('assert');

const folder = `${__dirname}/..`;
const html = fs.readFileSync(`${folder}/../../squimble-quest.html`, 'utf8');
const loaded = [...html.matchAll(/src="js\/squimble-quest\/([\w-]+\.js)"/g)].map((m) => m[1]);
// lines like "//   config.js     settings: ...", before the game loop's own code starts
const header = fs.readFileSync(`${folder}/sketch.js`, 'utf8').split('\n// multiplayer:')[0];
const listed = [...header.matchAll(/^\/\/ {3}([\w-]+\.js) /gm)].map((m) => m[1]);

assert.strictEqual(loaded.at(-1), 'sketch.js', 'sketch.js loads last, since p5 starts the game once it has');
assert.deepStrictEqual(listed, loaded.slice(0, -1), "the list atop sketch.js is squimble-quest.html's <script> tags, in order");
const files = fs.readdirSync(folder).filter((file) => file.endsWith('.js'));
for (const file of files) assert(loaded.includes(file), `${file} is in squimble-quest.html's <script> tags`);
