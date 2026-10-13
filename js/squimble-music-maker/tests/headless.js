// opens a page in headless chrome, waits until a javascript expression comes out truthy, and prints
// it (and any errors the page threw). it's how levels.html gets measured without opening a browser,
// and how the page gets checked for errors:
//
//   node js/squimble-music-maker/tests/headless.js js/squimble-music-maker/tests/levels.html "document.getElementById('out').textContent.startsWith('rendering') ? '' : document.getElementById('out').textContent"
//   node js/squimble-music-maker/tests/headless.js squimble-music-maker.html "document.querySelector('.mm-mod') && 'loaded'"
//
// the expression can be an async function call ((async () => {...})()): it's awaited. a third
// argument is how many seconds to wait at most (300 unless it says), a fourth the debugging port.
// chrome's path is CHROME if that's set. it talks to chrome over the devtools protocol with node's
// own WebSocket (node 22 or newer), so it needs nothing installed.
//
// a few things I learned the hard way using it:
//   - --dump-dom gives up before levels.html's offline renders finish, which is why this polls
//   - the page smooth scrolls, so before measuring an element to send it mouse events, scroll it with
//     scrollIntoView({ behavior: 'instant' }) or you measure it mid scroll
//   - headless chrome renders audio slowly here (about half real time even for the old code), so
//     judge speed by comparing old and new code in the same run, not by the numbers alone
//   - in git bash, don't pass an argument starting with "//": it's rewritten to "/"
const path = require('path');
const { spawn } = require('child_process');
const [file, expression, timeout = '300', port = '9333'] = process.argv.slice(2);
if (!file || !expression) {
  console.log('usage: node headless.js <page> <expression> [seconds] [port]');
  process.exit(1);
}
const url = /^(file|https?):/.test(file) ? file : `file:///${path.resolve(file).replace(/\\/g, '/')}`;
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required',
  '--allow-file-access-from-files', `--user-data-dir=${require('os').tmpdir()}/squimble-headless-${port}`, url,
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(300);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((one) => one.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error("chrome didn't start");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve));
  let id = 0;
  const waiting = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message.result);
      waiting.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    waiting.set(++id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  const end = Date.now() + timeout * 1000;
  let out;
  while (Date.now() < end) {
    out = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
    if (out) break;
    await sleep(1000);
  }
  console.log(out ?? 'TIMED OUT');
  if (errors.length) console.log(`ERRORS:\n${errors.join('\n')}`);
  socket.close();
  chrome.kill();
  process.exit(0);
})();
