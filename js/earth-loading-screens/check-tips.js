// checks tips.js: every line has a picture and a caption whose [[links]] are
// closed, no picture is used twice, and (unless --offline) every picture is really on Wikimedia
// Commons, as the page loads them from there. prints what's wrong and exits 1, or says it's all fine.
//
//   node js/earth-loading-screens/check-tips.js
//   node js/earth-loading-screens/check-tips.js --offline
const TIPS = require('./tips.js');
const problems = [];

TIPS.forEach((t, i) => {
  const at = `line ${i + 1} (${(t.text || '').slice(0, 40)}...)`;
  if (!t.pic) problems.push(`${at}: no picture`);
  if (!t.text) problems.push(`${at}: no caption`);
  else if (t.text.split('[[').length !== t.text.split(']]').length) problems.push(`${at}: a [[link]] isn't closed`);
});
const seen = new Map();
TIPS.forEach((t, i) => {
  const name = (t.pic || '').replace(/_/g, ' ');
  if (seen.has(name)) problems.push(`lines ${seen.get(name) + 1} and ${i + 1} use the same picture, ${name}`);
  seen.set(name, i);
});

(async () => {
  if (!process.argv.includes('--offline')) {
    const names = [...seen.keys()].filter(Boolean);
    const wait = s => new Promise(r => setTimeout(r, s * 1000));
    for (let i = 0; i < names.length; i += 50) {
      const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&titles=' +
        encodeURIComponent(names.slice(i, i + 50).map(n => 'File:' + n).join('|'));
      // commons turns away scripts that ask too fast (429) for as long as Retry-After says: wait it out
      let res;
      for (let tries = 0; tries < 6; tries++) {
        res = await fetch(url, { headers: { 'User-Agent': 'EarthLoadingScreensCheck/1.0' } });
        if (res.status !== 429) break;
        const seconds = (+res.headers.get('retry-after') || 30) + 2;
        console.log(`Commons asked to slow down, waiting ${seconds}s...`);
        await wait(seconds);
      }
      if (!res.ok) { problems.push(`Commons said ${res.status}, try again later (or use --offline)`); break; }
      await wait(1.5);
      for (const p of Object.values((await res.json()).query.pages))
        if (!p.imageinfo) problems.push(`not on Wikimedia Commons: ${p.title.replace(/^File:/, '')}`);
    }
  }
  if (problems.length) {
    console.log(problems.join('\n'));
    process.exit(1);
  }
  console.log(`all ${TIPS.length} tips look fine`);
})();
