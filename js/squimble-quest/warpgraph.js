// the warp graph: how warps link up, for seeing how maps join while building them. opened by Show
// links in a warp's settings box (editWarp() in editor.js).
//
// the edited warp at the top, then everything linked to it, then to those, etc., like a family tree.
// links count both ways (warps leading *to* a warp are family too). unlinked warps, even on the same
// map, aren't shown.
//
// each box is a warp (name, map below). lines join each warp to the one above that found it, with
// arrowheads the way each leads (a door and its way back have one at each end). non-tree links
// (loops) are dashed arrows straight across. a warp to a map's spawn shows the spawn as a box; a
// missing target is a red box.
//
// a warp with many links (a village square) has its children in rows of up to maxPerRow stacked
// downwards, so it stays readable. it starts readably zoomed (startZoom) on the opened warp.
//
// hovering a box shows a window onto its map, the warp ringed yellow, enemies and npcs at their
// spawns. drag to pan, wheel to zoom, Close or Escape returns to the settings box

// layout, px at zoom 1
const WARP_GRAPH = {
  // box size
  nodeWidth: 140,
  nodeHeight: 42,
  // gap beside boxes, and between rows
  gapX: 24,
  gapY: 72,
  // lines and arrowheads
  lineColour: [150, 155, 170],
  // line corner rounding, px
  cornerRadius: 8,
  // most children side by side; more wrap to rows below. even, so rows split evenly around the
  // parent's line (warpFamily())
  maxPerRow: 6,
  minZoom: 0.2,
  maxZoom: 2,
  // starts zoomed out to fit, but no further than this so text stays readable; the rest is a drag away
  startZoom: 0.75,
  // below this zoom boxes skip their (unreadable) text; hover previews still work
  wordsZoom: 0.3,
  // hover preview window, screen px, and its zoom: a bit out from play, enough context to place the
  // warp (the whole hut fits)
  previewWidth: 360,
  previewHeight: 240,
  previewZoom: 0.75,
};

// every warp linked to mapName's warpName at any distance, laid out as a tree. returns { nodes, links }:
//   nodes  per warp: { key, map, name, missing, start, parent, onlyChild, fromParent, toParent, x, y }.
//          name '' is a map's spawn. missing: doesn't exist. start: the opened warp. parent: the key
//          above it (null for start). onlyChild: sole child of its parent. fromParent/toParent: the
//          parent leads to it / it leads to the parent. x, y: its box's middle
//   links  non-parent links: { from, to }, node keys
function warpFamily(mapName, warpName) {
  // every warp (and spawn) any warp mentions, by key, and their links both ways, so the family can
  // be followed from either end
  const found = {};
  const linked = {};
  const links = [];
  const add = (map, name) => {
    const key = `${map}/${name}`;
    if (!found[key]) {
      // getMap() is in maps.js
      const onMap = getMap(map);
      found[key] = { key, map, name, missing: !onMap || (name !== '' && !onMap.warp(name)) };
      linked[key] = new Set();
    }
    return key;
  };

  const startKey = add(mapName, warpName);
  // ponytail: builds every map to read its warps, like checkAllWarps() in warps.js
  for (const map of Object.keys(MAPS)) {
    for (const warp of getMap(map).warps) {
      const from = add(map, warp.name);
      if (!warp.to) continue;
      const to = add(warp.to, warp.toWarp);
      links.push({ from, to });
      linked[from].add(to);
      linked[to].add(from);
    }
  }

  // breadth first from the start; a warp's parent is whichever found it first
  const parent = { [startKey]: null };
  const children = { [startKey]: [] };
  const family = [startKey];
  for (const key of family) {
    for (const next of linked[key]) {
      if (next in parent) continue;
      parent[next] = key;
      children[key].push(next);
      children[next] = [];
      family.push(next);
    }
  }

  // room each subtree needs, in spaces across (box + gap) and rows down. children go in rows of up to
  // maxPerRow, each row below everything hanging off the previous. the parent's line
  // (drawWarpBranch()) runs straight down its middle, so every row but the last splits either side of
  // it, leaving a gap; the last row is centred.
  //   size[key]   { left, right, depth }: reach left/right of its middle, and rows deep including its own
  //   bands[key]  its child rows: { kids, left, right, depth } for each
  const g = WARP_GRAPH;
  const size = {};
  const bands = {};
  const width = (kids) => kids.reduce((sum, kid) => sum + size[kid].left + size[kid].right, 0);
  const measure = (key) => {
    children[key].forEach(measure);
    // leaf children first so they pack tidily, branching ones last where their branches don't push
    // others about. each group by map then name, numerically (door-2 before door-10)
    children[key].sort((a, b) => (children[a].length > 0) - (children[b].length > 0) || a.localeCompare(b, undefined, { numeric: true }));
    bands[key] = [];
    for (let i = 0; i < children[key].length; i += g.maxPerRow) {
      const kids = children[key].slice(i, i + g.maxPerRow);
      const last = i + g.maxPerRow >= children[key].length;
      const left = last ? width(kids) / 2 : width(kids.slice(0, Math.ceil(kids.length / 2)));
      bands[key].push({ kids, left, right: width(kids) - left, depth: Math.max(...kids.map((kid) => size[kid].depth)) });
    }
    size[key] = {
      left: Math.max(0.5, ...bands[key].map((band) => band.left)),
      right: Math.max(0.5, ...bands[key].map((band) => band.right)),
      depth: 1 + bands[key].reduce((sum, band) => sum + band.depth, 0),
    };
  };
  // puts a warp's middle at x spaces, row rows, then its child rows below
  const across = {};
  const down = {};
  const place = (key, x, row) => {
    across[key] = x;
    down[key] = row;
    row++;
    for (const band of bands[key]) {
      let left = x - band.left;
      for (const kid of band.kids) {
        place(kid, left + size[kid].left, row);
        left += size[kid].left + size[kid].right;
      }
      row += band.depth;
    }
  };
  measure(startKey);
  place(startKey, 0, 0);

  const nodes = {};
  for (const key of family) {
    nodes[key] = {
      ...found[key],
      start: key === startKey,
      parent: parent[key],
      onlyChild: children[parent[key]]?.length === 1,
      fromParent: false,
      toParent: false,
      x: across[key] * (g.nodeWidth + g.gapX),
      y: down[key] * (g.nodeHeight + g.gapY),
    };
  }
  // parent links are the tree; the rest are drawn straight across
  const others = [];
  for (const link of links) {
    const { from, to } = link;
    if (!nodes[from] || !nodes[to] || from === to) continue;
    if (parent[to] === from) nodes[to].fromParent = true;
    else if (parent[from] === to) nodes[from].toParent = true;
    else others.push(link);
  }
  return { nodes: Object.values(nodes), links: others };
}

const WarpGraph = {
  // showing. sits over the warp settings box (FormBox, formbox.js), which returns on close
  active: false,

  open(mapName, warpName) {
    this.active = true;
    const add = (element) => UI.add(Object.assign(element, { group: 'warp-graph' }));
    const family = warpFamily(mapName, warpName);
    const title = `Warps linked to ${warpName} (${family.nodes.length - 1})`;
    add(new WarpGraphView({ x: 0, y: 0, w: GAME_W, h: GAME_H, title, family }));
    add(new Button({ x: GAME_W - 88, y: 12, w: 76, h: 24, label: 'Close', style: 'editor', onClick: () => this.close() }));
  },

  close() {
    this.active = false;
    UI.removeGroup('warp-graph');
  },

  // every frame while open, from Editor.update(). the settings box below has Input.typing on, so
  // Escape arrives as typed
  update() {
    if (Input.typed.includes('Escape')) this.close();
  },
};

// the full-screen graph; drag pans, wheel zooms
class WarpGraphView extends UIElement {
  constructor(options) {
    super(options);
    // warpFamily()'s result, nodes by key (for line ends), and the title
    this.family = options.family;
    this.byKey = Object.fromEntries(this.family.nodes.map((node) => [node.key, node]));
    this.title = options.title;
    // screen position of graph (0, 0), and zoom. starts centred under the title, zoomed out to fit
    // (never in, never out past startZoom). if it still doesn't fit, starts at the top on the opened
    // warp (graph (0, 0), warpFamily())
    const nodes = this.family.nodes;
    const left = Math.min(...nodes.map((node) => node.x)) - WARP_GRAPH.nodeWidth / 2;
    const right = Math.max(...nodes.map((node) => node.x)) + WARP_GRAPH.nodeWidth / 2;
    const bottom = Math.max(...nodes.map((node) => node.y)) + WARP_GRAPH.nodeHeight / 2;
    const top = -WARP_GRAPH.nodeHeight / 2;
    // the screen less a margin and the title
    const space = { x: 20, y: 80, w: GAME_W - 40, h: GAME_H - 100 };
    this.zoom = Math.max(WARP_GRAPH.startZoom, Math.min(1, space.w / (right - left), space.h / (bottom - top)));
    const fitsAcross = (right - left) * this.zoom <= space.w;
    this.panX = space.x + space.w / 2 - (fitsAcross ? (left + right) / 2 : 0) * this.zoom;
    this.panY = space.y + Math.max(0, space.h - (bottom - top) * this.zoom) / 2 - top * this.zoom;
    // last frame's mouse while dragging, else null
    this.dragFrom = null;
    // hovered node (previewed), or null
    this.hoveredNode = null;
    // the preview's camera, and its characters by map name (charactersOn())
    this.previewCamera = new Camera();
    this.characters = {};
  }

  update(hovered) {
    this.hovered = hovered;
    const mouse = Input.mouse;

    // drag pans
    if (hovered && Input.buttonsPressed.has('left')) this.dragFrom = { x: mouse.x, y: mouse.y };
    if (!Input.buttonsHeld.has('left')) this.dragFrom = null;
    if (this.dragFrom) {
      this.panX += mouse.x - this.dragFrom.x;
      this.panY += mouse.y - this.dragFrom.y;
      this.dragFrom = { x: mouse.x, y: mouse.y };
    }

    // wheel zooms around the mouse, at the editor's rate (debug.js); down zooms out
    if (hovered && Input.wheel !== 0) {
      const zoom = constrain(this.zoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE), WARP_GRAPH.minZoom, WARP_GRAPH.maxZoom);
      this.panX = mouse.x - (mouse.x - this.panX) * (zoom / this.zoom);
      this.panY = mouse.y - (mouse.y - this.panY) * (zoom / this.zoom);
      this.zoom = zoom;
    }

    // hovered box in graph coords. none while dragging, so the preview doesn't get in the way
    this.hoveredNode = null;
    if (hovered && !this.dragFrom) {
      const x = (mouse.x - this.panX) / this.zoom;
      const y = (mouse.y - this.panY) / this.zoom;
      this.hoveredNode = this.family.nodes.find((node) =>
        Math.abs(x - node.x) < WARP_GRAPH.nodeWidth / 2 && Math.abs(y - node.y) < WARP_GRAPH.nodeHeight / 2) ?? null;
    }
  }

  draw() {
    noStroke();
    fill(20, 22, 28);
    rect(0, 0, GAME_W, GAME_H);

    push();
    translate(this.panX, this.panY);
    scale(this.zoom);
    const byKey = this.byKey;
    // only draw what's on screen (keeps hundreds of warps smooth). the box around two nodes' middles,
    // grown by a node's size, covers both and everything between
    const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
    const left = -this.panX / this.zoom - w;
    const top = -this.panY / this.zoom - h;
    const right = (GAME_W - this.panX) / this.zoom + w;
    const bottom = (GAME_H - this.panY) / this.zoom + h;
    const showing = (a, b) => Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
    // lines first, so boxes cover their ends
    for (const node of this.family.nodes) {
      if (node.parent && showing(byKey[node.parent], node)) drawWarpBranch(byKey[node.parent], node);
    }
    for (const { from, to } of this.family.links) {
      if (showing(byKey[from], byKey[to])) drawWarpLink(byKey[from], byKey[to]);
    }
    // text is slow, and unreadable below wordsZoom
    const words = this.zoom >= WARP_GRAPH.wordsZoom;
    for (const node of this.family.nodes) {
      if (showing(node, node)) drawWarpNode(node, words);
    }
    pop();

    // title and help
    fill(255);
    setText(18, BOLD, LEFT, CENTER);
    text(this.title, 16, 28);
    fill(255, 255, 255, 150);
    setText(13, NORMAL, LEFT, CENTER);
    text('Drag to move around, wheel to zoom, hover over a warp to see where it is, Escape to close', 16, 52);

    // missing ones have nothing to show
    if (this.hoveredNode && !this.hoveredNode.missing) this.drawPreview(this.hoveredNode);
  }

  // a window onto the node's map at its warp (or spawn) beside the mouse, drawn by the game's world
  // code through its own camera, with the editor's warp and spawn markers on top
  drawPreview(node) {
    const { previewWidth: w, previewHeight: h, previewZoom: zoom } = WARP_GRAPH;
    const mouse = Input.mouse;
    // below right of the mouse like a tooltip, or the other side without room
    const x = mouse.x + 16 + w <= GAME_W - 8 ? mouse.x + 16 : Math.max(8, mouse.x - 16 - w);
    const y = mouse.y + 16 + h <= GAME_H - 8 ? mouse.y + 16 : Math.max(8, mouse.y - 16 - h);

    // getMap() is in maps.js
    const map = getMap(node.map);
    const warp = node.name ? map.warp(node.name) : null;
    // centre tile: the warp's, or the one the player spawns standing on
    const col = warp ? warp.col : map.colAt(map.spawn.x);
    const row = warp ? warp.row : map.rowAt(map.spawn.y + feetBelowCentre(PLAYER));

    // the window's centre: that tile, kept off the map edges like the game camera. a map smaller than
    // the window (the hut) is centred whole (clampAxis() in camera.js)
    const camera = this.previewCamera;
    const bounds = map.bounds();
    const middleX = camera.clampAxis((col + 0.5) * TILE, w / 2 / zoom, bounds.left, bounds.right);
    const middleY = camera.clampAxis((row + 0.5) * TILE, h / 2 / zoom, bounds.top, bounds.bottom);
    // a camera centres on the screen middle, so offset it by the window's distance from there
    camera.zoom = zoom;
    camera.x = middleX - (x + w / 2 - GAME_W / 2) / zoom;
    camera.y = middleY - (y + h / 2 - GAME_H / 2) / zoom;

    // the world draws full screen; clip() limits it to the window
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    camera.begin();
    drawWorld(camera, map, true); // world.js
    for (const character of this.charactersOn(map)) character.draw();
    // the editor's markers (Editor.drawCursor() in editor.js), then the tile ringed yellow like its
    // box, 2px so it stands out
    const px = 1 / zoom;
    for (const other of map.warps) drawWarpMarker(other, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);
    noFill();
    Editor.outline(col * TILE, row * TILE, TILE, TILE, '#ffd23f', px * 2);
    camera.end();
    drawingContext.restore();

    noFill();
    stroke('#ffd23f');
    strokeWeight(2);
    rect(x, y, w, h);
  }

  // the map's enemies and npcs at their spawns, as the editor shows them. made on first preview, kept
  // while open, sorted so lower is in front (like sketch.js)
  charactersOn(map) {
    this.characters[map.name] ??= [
      ...map.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row)),
      ...map.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row)),
    ].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    return this.characters[map.name];
  }
}

// a warp's box centred at x, y: yellow edge for the start, red for missing, else purple (warps.js).
// words: draw its name and map (skipped when too small)
function drawWarpNode(node, words) {
  const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
  fill(EDITOR_COLOURS.bar); // editor.js
  stroke(node.start ? '#ffd23f' : node.missing ? WARP_COLOURS.broken : WARP_COLOURS.edge);
  strokeWeight(node.start ? 3 : 2);
  rect(node.x - w / 2, node.y - h / 2, w, h, 6);

  if (!words) return;
  noStroke();
  fill(255);
  setText(14, node.name ? BOLD : ITALIC, CENTER, CENTER);
  text(node.name || 'spawn point', node.x, node.y - 8);
  fill(255, 255, 255, 150);
  setText(11, NORMAL, CENTER, CENTER);
  text(node.missing ? `${node.map} (missing)` : node.map, node.x, node.y + 10);
}

// parent → child tree line: down from the parent's middle, across just above the child's row, down
// into the child, rounded corners. siblings overdraw the shared parts, so lines branch like rail tracks.
//
// one arrowhead per direction, where it arrives: child's top if the parent leads to it, the parent if
// the child leads there (both ways: two). an only child's goes right against the parent; siblings
// share that end, where it couldn't say whose, so theirs sits at the top of their own segment, just
// below the branch
function drawWarpBranch(parent, child) {
  const { nodeHeight: h, gapY } = WARP_GRAPH;
  const top = child.y - h / 2;
  const bottom = parent.y + h / 2;
  const acrossY = top - gapY / 2;
  // at most half the horizontal distance, or close corners would overlap
  const radius = Math.min(WARP_GRAPH.cornerRadius, Math.abs(child.x - parent.x) / 2);

  // raw canvas, since p5 lacks rounded line corners. arcTo() heads to a corner and turns towards the
  // next point, rounding it
  stroke(WARP_GRAPH.lineColour);
  strokeWeight(2);
  const pen = drawingContext;
  pen.beginPath();
  pen.moveTo(parent.x, bottom);
  pen.arcTo(parent.x, acrossY, child.x, acrossY, radius);
  pen.arcTo(child.x, acrossY, child.x, top, radius);
  pen.lineTo(child.x, top);
  pen.stroke();

  if (child.fromParent) drawArrowhead(child.x, top, Math.PI / 2);
  if (child.toParent) drawArrowhead(child.x, child.onlyChild ? bottom : acrossY + radius, -Math.PI / 2);
}

// dashed non-tree link: curves out of the side of one box facing the other and into the facing side
// of the other, arrowhead against that edge (not under the box). same row: side to side, else
// bottom to top (or top to bottom)
function drawWarpLink(from, to) {
  const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
  let startX = from.x;
  let startY = from.y;
  let endX = to.x;
  let endY = to.y;
  let angle;
  noFill();
  stroke(WARP_GRAPH.lineColour);
  strokeWeight(2);
  drawingContext.setLineDash([7, 6]);
  if (Math.abs(to.y - from.y) < h) {
    const way = Math.sign(to.x - from.x);
    startX += way * w / 2;
    endX -= way * w / 2;
    const middleX = (startX + endX) / 2;
    bezier(startX, startY, middleX, startY, middleX, endY, endX, endY);
    angle = way > 0 ? 0 : Math.PI;
  } else {
    const way = Math.sign(to.y - from.y);
    startY += way * h / 2;
    endY -= way * h / 2;
    const middleY = (startY + endY) / 2;
    bezier(startX, startY, startX, middleY, endX, middleY, endX, endY);
    angle = way > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  drawingContext.setLineDash([]);
  drawArrowhead(endX, endY, angle);
}

// triangle pointing at angle (radians, 0 right), tip at x, y
function drawArrowhead(x, y, angle) {
  push();
  translate(x, y);
  rotate(angle);
  noStroke();
  fill(WARP_GRAPH.lineColour);
  triangle(0, 0, -11, -6, -11, 6);
  pop();
}
