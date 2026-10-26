// runs every *-check.js in this folder, one after another, and says which failed:
//   node js/squimble-quest/tests/run.js
// a check passes when it finishes with no output, so anything it prints counts as a failure. add a
// check's name (like "sound") to run only the ones with that in their name
const { spawnSync } = require('child_process');
const fs = require('fs');

const only = process.argv.slice(2);
const checks = fs.readdirSync(__dirname).filter((file) => file.endsWith('-check.js') && (only.length === 0 || only.some((name) => file.includes(name))));
const failed = [];
for (const file of checks) {
  const run = spawnSync(process.execPath, [`${__dirname}/${file}`], { encoding: 'utf8' });
  const said = `${run.stdout}${run.stderr}`.trim();
  if (run.status === 0 && !said) continue;
  failed.push(file);
  console.log(`--- ${file}\n${said || `stopped with code ${run.status}`}\n`);
}
console.log(failed.length ? `${failed.length} of ${checks.length} failed: ${failed.join(', ')}` : `all ${checks.length} passed`);
process.exitCode = failed.length ? 1 : 0;
