// checks the data folders (DATA_KINDS in datafiles.js): every index.json is a list of names, every
// name in it has a file, every file is named in it, and every file is { } with settings in. run it
// with node js/squimble-quest/tests/data-check.js after adding or exporting files. it lists anything
// wrong, and no output means it all passed. it can't tell if a setting is a typo, the game's console
// says that when it loads
const fs = require('fs');
const vm = require('vm');

const game = {};
vm.createContext(game);
vm.runInContext(fs.readFileSync(`${__dirname}/../datafiles.js`, 'utf8'), game);
const DATA_KINDS = vm.runInContext('DATA_KINDS', game);
const root = `${__dirname}/../../../assets/squimble-quest/`;

const problems = [];
for (const folder of Object.values(DATA_KINDS)) {
  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(`${root}${folder}${file}`, 'utf8'));
    } catch (err) {
      problems.push(`${folder}${file} can't be read: ${err.message}`);
      return undefined;
    }
  };
  const names = read('index.json');
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
    if (names !== undefined) problems.push(`${folder}index.json should be a list of names, like ["grunt", "dummy"]`);
    continue;
  }
  const files = fs.readdirSync(`${root}${folder}`).filter((file) => file.endsWith('.json') && file !== 'index.json');
  for (const name of names) {
    if (names.indexOf(name) !== names.lastIndexOf(name)) problems.push(`${folder}index.json has "${name}" more than once`);
    if (!files.includes(`${name}.json`)) problems.push(`${folder}index.json has "${name}", but there's no ${folder}${name}.json`);
  }
  for (const file of files) {
    const name = file.slice(0, -'.json'.length);
    if (!names.includes(name)) problems.push(`${folder}${file} isn't in ${folder}index.json, so the game doesn't load it. add "${name}" there`);
    const data = read(file);
    if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) problems.push(`${folder}${file} should be { } with settings in`);
  }
}

if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
}
