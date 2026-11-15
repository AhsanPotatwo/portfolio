// every silhouette on phylopic.org with the names of what it shows, for build.js. the board shows them on the
// creatures you haven't discovered yet.
//   node js/distant-cousins/tools/phylopic.js <raw folder>     (writes phylopic.json there)
// phylopic is run by volunteers, so this goes one page a second (about 280 pages, five minutes or so)
const fs = require('fs');
const path = require('path');
const RAW = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
  // a bad answer or a dropped connection: wait a bit longer each time and ask again
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (tries > 5) throw new Error(url + ' ' + r.status);
    } catch (e) {
      if (tries > 5) throw e;
    }
    await wait(5000 * (tries + 1));
  }
};
(async () => {
  const { build, totalPages } = await get('https://api.phylopic.org/images');
  const out = [];
  for (let page = 0; page < totalPages; page++) {
    const j = await get(`https://api.phylopic.org/images?build=${build}&page=${page}&embed_items=true&embed_specificNode=true`);
    const items = j._embedded?.items || [];
    for (const it of items) {
      const node = it._embedded?.specificNode;
      const names = (node?.names || []).map(n => n.filter(p => p.class === 'scientific').map(p => p.text).join(' ')).filter(Boolean);
      // the same creature in other databases (gbif, ncbi, paleobiodb, open tree), so build.js can match by id
      // rather than by name: plenty of beetles share a latin name with a plant
      // (hrefs look like /resolve/gbif.org/species/4970263?build=562, kept as gbif.org/species/4970263)
      const ids = (node?._links?.external || []).map(e => /\/resolve\/([^?]+)/.exec(e.href)?.[1]).filter(Boolean);
      // [image, licence, who drew it, names, ids elsewhere]
      out.push([it.uuid, it._links.license?.href || '', it.attribution || it._links.contributor?.title || '', names, ids]);
    }
    console.log('page', page, out.length);
    if (!items.length) break;
    await wait(1000);
  }
  fs.writeFileSync(path.join(RAW, 'phylopic.json'), JSON.stringify(out));
  console.log('done', out.length);
})();
