// the warp graph: shows how warps link up, so you can see how maps join together while building them.
// it opens from Show links in a warp's settings box (editWarp() in editor.js).
//
// the warp you're editing goes at the top, then everything linked to it, then everything linked to
// those, and so on, like a family tree. links count both ways (warps leading *to* a warp are family
// too). warps that aren't linked aren't shown, even if they're on the same map.
//
// each box is a warp (its name, with its map underneath). lines join each warp to the one above it
// that found it, with arrowheads showing which way each one leads (a door and its way back have one at
// each end). links that don't fit the tree (loops) are dashed arrows going straight across. a warp
// that leads to a map's spawn shows the spawn as a box, and one that leads somewhere missing is a red
// box.
//
// a warp with loads of links (like a village square) has its children in rows of up to maxPerRow,
// stacked downwards, so it's still readable. it starts zoomed in enough to read (startZoom) on the
// warp you opened it from.
//
// hovering over a box shows a little window onto its map, with the warp ringed in yellow and enemies
// and npcs at their spawns. drag to move around, wheel to zoom, and Close or Escape goes back to the
// settings box

// layout, in px at zoom 1
const WARP_GRAPH = {
  // box size
  nodeWidth: 140,
  nodeHeight: 42,
  // the gap next to boxes, and between rows
  gapX: 24,
  gapY: 72,
  // lines and arrowheads
  lineColour: [150, 155, 170],
  // how rounded the line corners are, px
  cornerRadius: 8,
  // the most children side by side, any more wrap onto rows below. it's even so the rows split evenly
  // either side of the parent's line (warpFamily())
  maxPerRow: 6,
  minZoom: 0.2,
  maxZoom: 2,
  // it starts zoomed out to fit, but no further than this so you can still read the text. anything
  // else is just a drag away
  startZoom: 0.75,
  // below this zoom the boxes skip their text (you couldn't read it anyway). hover previews still work
  wordsZoom: 0.3,
  // the hover preview window in screen px, and its zoom. it's a bit further out than in game, so
  // there's enough around the warp to tell where it is (the whole hut fits)
  previewWidth: 360,
  previewHeight: 240,
  previewZoom: 0.75,
};

// every warp that's linked to warpName on mapName, however far away, laid out as a tree. gives back
// { nodes, links }:
//   nodes  one per warp: { key, map, name, missing, start, parent, onlyChild, fromParent, toParent, x, y }.
//          name '' is a map's spawn. missing means it doesn't exist. start is the warp it was opened
//          from. parent is the key of the one above it (null for start). onlyChild means it's its
//          parent's only child. fromParent/toParent mean the parent leads to it / it leads to the
//          parent. x, y is the middle of its box
//   links  the links that aren't parent ones: { from, to }, as node keys
function warpFamily(mapName, warpName) {
  // every warp (and spawn) that any warp mentions, by key, plus their links in both directions, so the
  // family can be followed from either end
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
  // ponytail: builds every map to read its warps, same as checkAllWarps() in warps.js
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

  // goes outwards from the start one level at a time (breadth first). a warp's parent is whichever
  // one found it first
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

  // how much room each branch needs, in spaces across (a box plus a gap) and rows down. children go in
  // rows of up to maxPerRow, and each row goes below everything hanging off the row before. the
  // parent's line (drawWarpBranch()) runs straight down the middle, so every row apart from the last
  // splits either side of it, leaving a gap. the last row is centred.
  //   size[key]   { left, right, depth }: how far it reaches left and right of its middle, and how
  //               many rows deep it is including its own
  //   bands[key]  its rows of children, as { kids, left, right, depth } each
  const g = WARP_GRAPH;
  const size = {};
  const bands = {};
  const width = (kids) => kids.reduce((sum, kid) => sum + size[kid].left + size[kid].right, 0);
  const measure = (key) => {
    children[key].forEach(measure);
    // children with no children of their own go first so they pack in tidily, and ones that branch go
    // last where their branches don't push the others about. each group is sorted by map and then
    // name, with numbers in order (door-2 before door-10)
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
  // puts a warp's middle x spaces across and row rows down, then its rows of children under it
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
  // parent links make up the tree, and the rest get drawn straight across
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
  // whether it's showing. it sits on top of the warp settings box (FormBox, formbox.js), which comes
  // back when this closes
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

  // every frame while it's open, from Editor.update(). the settings box underneath has Input.typing
  // on, so Escape comes through as typed
  update() {
    if (Input.typed.includes('Escape')) this.close();
  },
};

// the full screen graph. dragging moves it around and the wheel zooms
class WarpGraphView extends UIElement {
  constructor(options) {
    super(options);
    // what warpFamily() gave back, the nodes by key (for the ends of lines), and the title
    this.family = options.family;
    this.byKey = Object.fromEntries(this.family.nodes.map((node) => [node.key, node]));
    this.title = options.title;
    // where the graph's (0, 0) is on screen, and the zoom. it starts in the middle under the title,
    // zoomed out to fit (but never zoomed in, and never out past startZoom). if it still doesn't fit
    // it starts at the top on the warp it was opened from (the graph's (0, 0), warpFamily())
    const nodes = this.family.nodes;
    const left = Math.min(...nodes.map((node) => node.x)) - WARP_GRAPH.nodeWidth / 2;
    const right = Math.max(...nodes.map((node) => node.x)) + WARP_GRAPH.nodeWidth / 2;
    const bottom = Math.max(...nodes.map((node) => node.y)) + WARP_GRAPH.nodeHeight / 2;
    const top = -WARP_GRAPH.nodeHeight / 2;
    // the screen minus a margin and the title
    const space = { x: 20, y: 80, w: GAME_W - 40, h: GAME_H - 100 };
    this.zoom = Math.max(WARP_GRAPH.startZoom, Math.min(1, space.w / (right - left), space.h / (bottom - top)));
    const fitsAcross = (right - left) * this.zoom <= space.w;
    this.panX = space.x + space.w / 2 - (fitsAcross ? (left + right) / 2 : 0) * this.zoom;
    this.panY = space.y + Math.max(0, space.h - (bottom - top) * this.zoom) / 2 - top * this.zoom;
    // the mouse position last frame while dragging, otherwise null
    this.dragFrom = null;
    // the node the mouse is over (it gets previewed), or null
    this.hoveredNode = null;
    // the preview's camera, and the characters for each map name (charactersOn())
    this.previewCamera = new Camera();
    this.characters = {};
  }

  update(hovered) {
    this.hovered = hovered;
    const mouse = Input.mouse;

    // dragging moves it around
    if (hovered && Input.buttonsPressed.has('left')) this.dragFrom = { x: mouse.x, y: mouse.y };
    if (!Input.buttonsHeld.has('left')) this.dragFrom = null;
    if (this.dragFrom) {
      this.panX += mouse.x - this.dragFrom.x;
      this.panY += mouse.y - this.dragFrom.y;
      this.dragFrom = { x: mouse.x, y: mouse.y };
    }

    // the wheel zooms in on the mouse, at the same rate as the editor (debug.js). down zooms out
    if (hovered && Input.wheel !== 0) {
      const zoom = constrain(this.zoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE), WARP_GRAPH.minZoom, WARP_GRAPH.maxZoom);
      this.panX = mouse.x - (mouse.x - this.panX) * (zoom / this.zoom);
      this.panY = mouse.y - (mouse.y - this.panY) * (zoom / this.zoom);
      this.zoom = zoom;
    }

    // which box the mouse is over, in graph positions. none while dragging, so the preview doesn't get
    // in the way
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
    // only draw what's on screen (that keeps it smooth with hundreds of warps). the box around two
    // nodes' middles, made bigger by a node's size, covers both of them and everything in between
    const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
    const left = -this.panX / this.zoom - w;
    const top = -this.panY / this.zoom - h;
    const right = (GAME_W - this.panX) / this.zoom + w;
    const bottom = (GAME_H - this.panY) / this.zoom + h;
    const showing = (a, b) => Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
    // lines first, so the boxes cover their ends
    for (const node of this.family.nodes) {
      if (node.parent && showing(byKey[node.parent], node)) drawWarpBranch(byKey[node.parent], node);
    }
    for (const { from, to } of this.family.links) {
      if (showing(byKey[from], byKey[to])) drawWarpLink(byKey[from], byKey[to]);
    }
    // text is slow to draw, and you can't read it below wordsZoom anyway
    const words = this.zoom >= WARP_GRAPH.wordsZoom;
    for (const node of this.family.nodes) {
      if (showing(node, node)) drawWarpNode(node, words);
    }
    pop();

    // the title and help text
    fill(255);
    setText(18, BOLD, LEFT, CENTER);
    text(this.title, 16, 28);
    fill(255, 255, 255, 150);
    setText(13, NORMAL, LEFT, CENTER);
    text('Drag to move around, wheel to zoom, hover over a warp to see where it is, Escape to close', 16, 52);

    // missing ones don't have anything to show
    if (this.hoveredNode && !this.hoveredNode.missing) this.drawPreview(this.hoveredNode);
  }

  // a little window onto the node's map at its warp (or spawn), next to the mouse. it's drawn by the
  // game's normal world code through its own camera, with the editor's warp and spawn markers on top
  drawPreview(node) {
    const { previewWidth: w, previewHeight: h, previewZoom: zoom } = WARP_GRAPH;
    const mouse = Input.mouse;
    // below and to the right of the mouse like a tooltip, or the other side if there's no room
    const x = mouse.x + 16 + w <= GAME_W - 8 ? mouse.x + 16 : Math.max(8, mouse.x - 16 - w);
    const y = mouse.y + 16 + h <= GAME_H - 8 ? mouse.y + 16 : Math.max(8, mouse.y - 16 - h);

    // getMap() is in maps.js
    const map = getMap(node.map);
    const warp = node.name ? map.warp(node.name) : null;
    // the tile in the middle: the warp's, or the one the player spawns standing on
    const col = warp ? warp.col : map.colAt(map.spawn.x);
    const row = warp ? warp.row : map.rowAt(map.spawn.y + feetBelowCentre(PLAYER));

    // the middle of the window: that tile, kept away from the map's edges like the game camera does.
    // a map that's smaller than the window (the hut) gets centred as a whole (clampAxis() in camera.js)
    const camera = this.previewCamera;
    const bounds = map.bounds();
    const middleX = camera.clampAxis((col + 0.5) * TILE, w / 2 / zoom, bounds.left, bounds.right);
    const middleY = camera.clampAxis((row + 0.5) * TILE, h / 2 / zoom, bounds.top, bounds.bottom);
    // a camera centres on the middle of the screen, so shift it by how far the window is from there
    camera.zoom = zoom;
    camera.x = middleX - (x + w / 2 - GAME_W / 2) / zoom;
    camera.y = middleY - (y + h / 2 - GAME_H / 2) / zoom;

    // the world draws over the full screen, so clip() keeps it inside the window
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    camera.begin();
    drawWorld(camera, map, true); // world.js
    for (const character of this.charactersOn(map)) character.draw();
    // the editor's markers (Editor.drawCursor() in editor.js), then the tile ringed in yellow like its
    // box, 2px thick so it stands out
    const px = 1 / zoom;
    for (const other of map.warps) drawWarpMarker(other, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);
    noFill();
    Editor.outline(col * TILE, row * TILE, TILE, TILE, EDITOR_COLOURS.picked, px * 2);
    camera.end();
    drawingContext.restore();

    noFill();
    stroke(EDITOR_COLOURS.picked);
    strokeWeight(2);
    rect(x, y, w, h);
  }

  // the map's enemies and npcs at their spawns, like the editor shows them. they're made the first
  // time the map gets previewed and kept while the graph's open, sorted so lower down is in front
  // (like sketch.js)
  charactersOn(map) {
    this.characters[map.name] ??= [
      ...map.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row)),
      ...map.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row)),
    ].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    return this.characters[map.name];
  }
}

// a warp's box centred on x, y: a yellow edge for the start one, red for a missing one, and purple
// for the rest (warps.js). words says whether to draw its name and map (skipped when it's too small)
function drawWarpNode(node, words) {
  const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
  fill(EDITOR_COLOURS.bar); // editor.js
  stroke(node.start ? EDITOR_COLOURS.picked : node.missing ? WARP_COLOURS.broken : WARP_COLOURS.edge);
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

// the tree line from a parent to a child: down from the middle of the parent, across just above the
// child's row, then down into the child, with rounded corners. brothers and sisters draw over the
// parts they share, so the lines branch off like train tracks.
//
// one arrowhead for each direction, at the end it arrives at: on top of the child if the parent leads
// to it, and at the parent if the child leads there (two if it goes both ways). an only child's goes
// right up against the parent. when there are several children they all share that end, so you
// couldn't tell whose arrow it was, so theirs goes at the top of their own bit of line instead, just
// under where it branches
function drawWarpBranch(parent, child) {
  const { nodeHeight: h, gapY } = WARP_GRAPH;
  const top = child.y - h / 2;
  const bottom = parent.y + h / 2;
  const acrossY = top - gapY / 2;
  // at most half the distance across, otherwise corners close together would overlap
  const radius = Math.min(WARP_GRAPH.cornerRadius, Math.abs(child.x - parent.x) / 2);

  // uses the canvas directly since p5 can't do rounded corners on lines. arcTo() heads towards a
  // corner and turns towards the next point, rounding it off
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

// a dashed link that isn't part of the tree. it curves out of whichever side of one box faces the
// other, and into the facing side of the other one, with the arrowhead against that edge (not hidden
// under the box). on the same row it goes side to side, otherwise bottom to top (or top to bottom)
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

// a triangle pointing at angle (radians, 0 is right) with its tip at x, y
function drawArrowhead(x, y, angle) {
  push();
  translate(x, y);
  rotate(angle);
  noStroke();
  fill(WARP_GRAPH.lineColour);
  triangle(0, 0, -11, -6, -11, 6);
  pop();
}
