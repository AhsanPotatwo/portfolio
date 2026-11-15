// the pictures in wikipedia's article on each creature, so build.js can pick a life restoration over a
// jawbone. build.js lists the articles it wants in media-wanted.txt (title, how many wikipedias have it); this
// fetches them into media.json ({ title: [[file, caption, lead?]] }), then build again.
//   node js/distant-cousins/tools/media.js <raw folder>
// wikipedia's api, fifty articles to a request, one request at a time (its one-per-article picture lists start
// saying "slow down" after a few dozen, and this one caps at about 1,000 articles every two minutes). every article gets its lead picture, the free one. the better known
// ones also get every picture whose file name says who it is, kept only if it lives on commons (the rest are
// wikipedia's own, often not free to use). there are no captions this way, so build.js goes by file names.
// it saves as it goes, so stopping and starting again carries on where it was
const fs = require('fs');
const path = require('path');
const RAW = process.argv[2];
const OUT = path.join(RAW, 'media.json');
const FULL = 15;                   // wikipedias an article needs for all its pictures (about 5,700 do: a second each)
// one at a time: wikipedia caps a client at about one batch every six seconds, and more workers only get told off
const WORKERS = 1;
const API ='https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&';
const UA = { 'user-agent': 'DistantCousinsBuild/1.0 (static family tree site, one-off picture harvest)' };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(query) {
  for (let tries = 0; ; tries++) {
    try {
      // a connection that stalls would hang the whole run, so each ask gets twenty seconds
      const r = await fetch(API + query, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      if (r.status === 429) { await wait(1000 * (+r.headers.get('retry-after') || 30)); continue; }
      if (r.status < 500 || tries > 5) return null;
    } catch (e) {
      if (tries > 5) return null;
    }
    await wait(3000 * (tries + 1));
  }
}
// everything the api says about some articles, following its "continue" until it's all there
async function pages(titles, props) {
  const out = new Map(), back = new Map();
  let more = {};
  do {
    const j = await get(props + '&titles=' + titles.map(encodeURIComponent).join('|') + Object.entries(more).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join(''));
    if (!j) break;
    for (const x of [...(j.query?.normalized || []), ...(j.query?.redirects || [])]) back.set(x.to, back.get(x.from) || x.from);
    for (const p of j.query?.pages || []) {
      const t = back.get(p.title) || p.title, had = out.get(t) || { images: [] };
      if (p.pageprops?.page_image_free) had.lead = p.pageprops.page_image_free.replace(/_/g, ' ');
      for (const i of p.images || []) had.images.push(i.title.slice(5));
      out.set(t, had);
    }
    more = j.continue || null;
    await wait(150);
  } while (more);
  return out;
}
// not pictures of anything: wikipedia's little icons, sounds, documents and maps
const JUNK = /logo|icon|symbol|status[ _]iucn|edit-clear|question[ _]book|wiki|commons|disambig|padlock|flag[ _]of|map|range|distribution|\.(ogg|ogv|oga|webm|mp3|wav|mid|pdf|djvu|stl)$/i;
const words = t => t.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter(w => w.length >= 4);

(async () => {
  const media = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const wanted = fs.readFileSync(path.join(RAW, 'media-wanted.txt'), 'utf8').split('\n').filter(Boolean)
    .map(l => l.split('\t')).filter(([t]) => !(t in media));
  const save = () => fs.writeFileSync(OUT, JSON.stringify(media));
  console.log(wanted.length, 'articles,', wanted.filter(([, n]) => +n >= FULL).length, 'with all their pictures');
  const starts = [];
  for (let i = 0; i < wanted.length; i += 50) starts.push(i);
  let finished = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => { while (starts.length) {
    const i = starts.shift();
    const group = wanted.slice(i, i + 50);
    const full = new Set(group.filter(([, n]) => +n >= FULL).map(([t]) => t));
    const titles = group.map(([t]) => t);
    const got = await pages(titles, full.size ? 'prop=pageprops|images&ppprop=page_image_free&imlimit=max' : 'prop=pageprops&ppprop=page_image_free');
    // the pictures worth a look: the ones named after the creature
    const look = new Map();
    for (const t of full) {
      const ws = words(t);
      look.set(t, (got.get(t)?.images || []).filter(f => !JUNK.test(f) && ws.some(w => f.toLowerCase().includes(w))));
    }
    // which of those are on commons
    const files = [...new Set([...look.values()].flat())];
    const shared = new Set();
    for (let k = 0; k < files.length; k += 50) {
      const j = await get('prop=imageinfo&titles=' + files.slice(k, k + 50).map(f => encodeURIComponent('File:' + f)).join('|'));
      for (const p of j?.query?.pages || []) if (p.imagerepository === 'shared') shared.add(p.title.slice(5));
      await wait(150);
    }
    for (const t of titles) {
      const lead = got.get(t)?.lead;
      media[t] = [...(lead ? [[lead, '', 1]] : []), ...(look.get(t) || []).filter(f => shared.has(f) && f !== lead).map(f => [f, '', 0])];
    }
    if (++finished % 20 === 0) { save(); console.log(finished * 50, 'of', wanted.length); }
  } }));
  save();
  console.log('done', Object.keys(media).length);
})();
