// the warp graph: a picture of how warps link up, for seeing how maps join together while
// building them. open it from a warp's settings box in the map editor (Show links, see editWarp()
// in editor.js).
//
// it shows the warp you're editing at the top, then every warp linked to it, then every warp
// linked to those, and so on, like a family tree. a link counts either way round, so the warps
// leading *to* a warp are in its family as well as the one it leads to. warps that aren't linked
// to it at all, even ones on the same map, aren't shown.
//
// each box is a warp: its name, and the map it's on under that. lines join each warp to the one
// above it that found it, like a family tree, and arrowheads point the way each warp leads, so a
// pair of warps leading to each other (a door and the way back out) has an arrowhead at both ends.
// a link that isn't part of the tree (like one going round in a loop) is a dashed arrow straight
// across. a warp leading to a map's spawn point shows that spawn point as a box too, and
// something a warp leads to that doesn't exist is a red box.
//
// a warp with lots of links (a village square every house's door leads to) has its children in
// rows of up to maxPerRow, one under the other, so the graph grows downwards rather than too wide
// to read. it starts zoomed in enough to read, on the warp it was opened from.
//
// hovering over a box shows where that warp is: a little window onto its map, with the warp
// ringed in yellow and its enemies and npcs where they were placed.
//
// drag to move around it, the mouse wheel zooms, Close or Escape goes back to the settings box

// how the graph is laid out, in pixels at normal zoom
const WARP_GRAPH = {
  // each warp's box
  nodeWidth: 140,
  nodeHeight: 42,
  // the space between boxes side by side, and between one row and the next
  gapX: 24,
  gapY: 72,
  // the lines and arrowheads between warps
  lineColour: [150, 155, 170],
  // how rounded the corners of the lines are, in pixels
  cornerRadius: 8,
  // the most children side by side under one warp. any more wrap onto rows further down. even,
  // so a row splits evenly either side of the line down through it (see warpFamily())
  maxPerRow: 6,
  // how far it can zoom out and in
  minZoom: 0.2,
  maxZoom: 2,
  // it starts zoomed out to fit on screen, but no further out than this, so the writing can still
  // be read. anything that doesn't fit is a drag away
  startZoom: 0.75,
  // zoomed out further than this, the boxes are drawn without their writing, which would be too
  // small to read (hovering over one still shows where it is)
  wordsZoom: 0.3,
  // the window onto a warp's map that shows while hovering over its box, in screen pixels, and how
  // zoomed in it is. zoomed out a bit from normal play, so there's enough around the warp to tell
  // where it is (the whole inside of the hut fits)
  previewWidth: 360,
  previewHeight: 240,
  previewZoom: 0.75,
};

// every warp linked to the warp called warpName on the map mapName, however far away, laid out
// like a family tree. gives back { nodes, links }:
//   nodes  one per warp: { key, map, name, missing, start, parent, onlyChild, fromParent,
//          toParent, x, y }. name is '' for a map's spawn point, missing is true if it doesn't
//          exist, start is true for the one it started from, parent is the key of the warp above it
//          in the tree (null for the start), onlyChild is true if it's the only warp under its
//          parent, fromParent and toParent are whether its parent leads to it and it leads to its
//          parent, and x, y is the middle of its box
//   links  every other link, the ones that aren't between a warp and its parent: { from, to },
//          each a node's key
function warpFamily(mapName, warpName) {
  // every warp (and spawn point) any warp mentions, by key, and the keys of everything linked to
  // each one, both ways round, so a family can be followed from either end of a link
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
  // ponytail: builds every map to look at its warps, like checkAllWarps() in warps.js
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

  // the family: the start, then everything linked to it, then everything linked to those... each
  // warp's parent is whichever warp found it first
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

  // how much room each warp and everything under it needs, in spaces across (a box and the gap
  // beside it) and rows down. a warp's children go under it in rows of up to maxPerRow, each row
  // below everything hanging off the one before. the line from the warp down to its rows
  // (drawWarpBranch()) runs straight down from its middle, so every row but the last is split in
  // two either side of it, leaving a gap for it to pass through. the last row just sits in the
  // middle, like the only row does for a warp with a few children.
  //   size[key]   { left, right, depth }: how far it reaches left and right of the warp's middle,
  //               and how many rows deep it is, counting its own
  //   bands[key]  its rows of children: { kids, left, right, depth }, the same for just that row
  const g = WARP_GRAPH;
  const size = {};
  const bands = {};
  const width = (kids) => kids.reduce((sum, kid) => sum + size[kid].left + size[kid].right, 0);
  const measure = (key) => {
    children[key].forEach(measure);
    // children with none of their own first, so they pack into tidy rows, and the ones with
    // branches hanging off them last, where their branches don't push the others about. each lot
    // in order of map then name, counting numbers properly (door-2 before door-10), so they're
    // easy to find
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
  // a link between a warp and its parent is part of the tree, the rest are drawn straight across
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
  // true while the graph is showing. it sits over the warp's settings box (FormBox in editor.js),
  // which comes back when it closes
  active: false,

  // shows the graph for the warp called warpName on the map mapName
  open(mapName, warpName) {
    this.active = true;
    const add = (element) => UI.add(Object.assign(element, { group: 'warp-graph' }));
    const family = warpFamily(mapName, warpName);
    const title = `Warps linked to ${warpName} (${family.nodes.length - 1})`;
    add(new WarpGraphView({ x: 0, y: 0, w: GAME_W, h: GAME_H, title, family }));
    add(new Button({ x: GAME_W - 108, y: 12, w: 96, h: 32, label: 'Close', style: { textSize: 14 }, onClick: () => this.close() }));
  },

  close() {
    this.active = false;
    UI.removeGroup('warp-graph');
  },

  // run every frame while it's open, from Editor.update(). the settings box underneath has turned
  // typing on (Input.typing), so Escape comes through as something typed
  update() {
    if (Input.typed.includes('Escape')) this.close();
  },
};

// the graph itself, covering the whole screen. dragging and the wheel move and zoom it
class WarpGraphView extends UIElement {
  constructor(options) {
    super(options);
    // what warpFamily() gave back, and the words along the top
    this.family = options.family;
    this.title = options.title;
    // where the graph's (0, 0) is on screen, and how zoomed in it is. it starts in the middle of
    // the space under the title, zoomed out to fit if it's too big (but never zoomed in, and never
    // out past startZoom). if it still doesn't fit, it starts at the top, on the warp it was opened
    // from (the graph's (0, 0), see warpFamily())
    const nodes = this.family.nodes;
    const left = Math.min(...nodes.map((node) => node.x)) - WARP_GRAPH.nodeWidth / 2;
    const right = Math.max(...nodes.map((node) => node.x)) + WARP_GRAPH.nodeWidth / 2;
    const bottom = Math.max(...nodes.map((node) => node.y)) + WARP_GRAPH.nodeHeight / 2;
    const top = -WARP_GRAPH.nodeHeight / 2;
    // the space it fits in: the whole screen but a margin, and the title along the top
    const space = { x: 20, y: 80, w: GAME_W - 40, h: GAME_H - 100 };
    this.zoom = Math.max(WARP_GRAPH.startZoom, Math.min(1, space.w / (right - left), space.h / (bottom - top)));
    const fitsAcross = (right - left) * this.zoom <= space.w;
    this.panX = space.x + space.w / 2 - (fitsAcross ? (left + right) / 2 : 0) * this.zoom;
    this.panY = space.y + Math.max(0, space.h - (bottom - top) * this.zoom) / 2 - top * this.zoom;
    // where the mouse was last frame while dragging, or null when it isn't
    this.dragFrom = null;
    // the box the mouse is over (one of family.nodes), or null. it shows a preview of where it is
    this.hoveredNode = null;
    // the camera the preview's drawn through, and the enemies and npcs shown in it, by map name
    // (see charactersOn())
    this.previewCamera = new Camera();
    this.characters = {};
  }

  update(hovered) {
    this.hovered = hovered;
    const mouse = Input.mouse;

    // dragging moves the graph along with the mouse
    if (hovered && Input.buttonsPressed.has('left')) this.dragFrom = { x: mouse.x, y: mouse.y };
    if (!Input.buttonsHeld.has('left')) this.dragFrom = null;
    if (this.dragFrom) {
      this.panX += mouse.x - this.dragFrom.x;
      this.panY += mouse.y - this.dragFrom.y;
      this.dragFrom = { x: mouse.x, y: mouse.y };
    }

    // the wheel zooms around the mouse, so whatever's under it stays under it. the same rate as
    // the map editor's zoom (debug.js), wheel down zooms out
    if (hovered && Input.wheel !== 0) {
      const zoom = constrain(this.zoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE), WARP_GRAPH.minZoom, WARP_GRAPH.maxZoom);
      this.panX = mouse.x - (mouse.x - this.panX) * (zoom / this.zoom);
      this.panY = mouse.y - (mouse.y - this.panY) * (zoom / this.zoom);
      this.zoom = zoom;
    }

    // which box the mouse is over, worked out in the graph's own positions. none while dragging,
    // so the preview doesn't get in the way of moving around
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
    const byKey = {};
    for (const node of this.family.nodes) byKey[node.key] = node;
    // only what's on screen is drawn, which keeps a graph of hundreds of warps smooth. a box
    // around two boxes' middles, stretched by a box's size, covers them and everything between
    const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
    const left = -this.panX / this.zoom - w;
    const top = -this.panY / this.zoom - h;
    const right = (GAME_W - this.panX) / this.zoom + w;
    const bottom = (GAME_H - this.panY) / this.zoom + h;
    const showing = (a, b) => Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
    // lines first, so the boxes cover the ends that start inside them
    for (const node of this.family.nodes) {
      if (node.parent && showing(byKey[node.parent], node)) drawWarpBranch(byKey[node.parent], node);
    }
    for (const { from, to } of this.family.links) {
      if (showing(byKey[from], byKey[to])) drawWarpLink(byKey[from], byKey[to]);
    }
    // writing is slow to draw, and too small to read once zoomed out past wordsZoom
    const words = this.zoom >= WARP_GRAPH.wordsZoom;
    for (const node of this.family.nodes) {
      if (showing(node, node)) drawWarpNode(node, words);
    }
    pop();

    // the title and how to use it, along the top
    fill(255);
    setText(18, BOLD, LEFT, CENTER);
    text(this.title, 16, 28);
    fill(255, 255, 255, 150);
    setText(13, NORMAL, LEFT, CENTER);
    text('Drag to move around, wheel to zoom, hover over a warp to see where it is, Escape to close', 16, 52);

    // something that doesn't exist has nowhere to show
    if (this.hoveredNode && !this.hoveredNode.missing) this.drawPreview(this.hoveredNode);
  }

  // a window onto the map a warp's on (or the spawn point, for a spawn point's box), next to the
  // mouse. it's drawn by the same code as the game's world, through a camera of its own, with
  // the editor's markers for warps and the spawn on top
  drawPreview(node) {
    const { previewWidth: w, previewHeight: h, previewZoom: zoom } = WARP_GRAPH;
    const mouse = Input.mouse;
    // below and to the right of the mouse, like a tooltip, or the other side if there isn't room
    const x = mouse.x + 16 + w <= GAME_W - 8 ? mouse.x + 16 : Math.max(8, mouse.x - 16 - w);
    const y = mouse.y + 16 + h <= GAME_H - 8 ? mouse.y + 16 : Math.max(8, mouse.y - 16 - h);

    // getMap() is in maps.js
    const map = getMap(node.map);
    const warp = node.name ? map.warp(node.name) : null;
    // the tile to show in the middle: the warp's, or the one the player spawns standing on
    const col = warp ? warp.col : map.colAt(map.spawn.x);
    const row = warp ? warp.row : map.rowAt(map.spawn.y + feetBelowCentre(PLAYER));

    // what goes in the middle of the window: the tile, but kept far enough from the map's edges that
    // the window doesn't show past them, like the game's camera. a map that fits in the window
    // (like the hut) sits in its middle, all of it showing (clampAxis() is in camera.js)
    const camera = this.previewCamera;
    const bounds = map.bounds();
    const middleX = camera.clampAxis((col + 0.5) * TILE, w / 2 / zoom, bounds.left, bounds.right);
    const middleY = camera.clampAxis((row + 0.5) * TILE, h / 2 / zoom, bounds.top, bounds.bottom);
    // a camera always puts what it's looking at in the middle of the screen, so it looks off to
    // the side by however far the middle of the window is from the middle of the screen. that
    // puts it in the middle of the window instead
    camera.zoom = zoom;
    camera.x = middleX - (x + w / 2 - GAME_W / 2) / zoom;
    camera.y = middleY - (y + h / 2 - GAME_H / 2) / zoom;

    // the world's drawn for the whole screen, but clip() stops anything outside the window showing
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    camera.begin();
    drawWorld(camera, map, true); // world.js
    for (const character of this.charactersOn(map)) character.draw();
    // the same markers as the map editor's (see Editor.drawCursor() in editor.js), then the tile
    // it's showing ringed in yellow, like the box it's for. a bit thicker than a pixel, so it stands out
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

  // the map's enemies and npcs where they were placed, like the map editor shows them. made the
  // first time the map's previewed, then kept while the graph's open. whoever's standing further
  // down is in front, like in the game (sketch.js)
  charactersOn(map) {
    this.characters[map.name] ??= [
      ...map.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row)),
      ...map.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row)),
    ].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    return this.characters[map.name];
  }
}

// one warp's box in the graph, x, y in the middle. yellow edge for the warp it was opened from,
// red for one that doesn't exist, purple (like warps in the editor, warps.js) for the rest.
// words is whether to write its name and map in it, left off when it's too small to read them
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

// the line from a warp down to one of its children, like a family tree: straight down from the
// middle of the parent, across the gap just above the child's row, then down into the child, with
// rounded corners. its brothers and sisters share the parts down from the parent and across,
// drawn over each other, so the lines branch off one another like railway tracks.
//
// each way the link goes gets one arrowhead, where it arrives: into the top of the child if the
// parent leads to it, and into the parent if the child leads there, so only a link that goes both
// ways has two. an only child has the line to itself, so its arrowhead goes right up against the
// parent. brothers and sisters share the end at the parent, where an arrowhead couldn't say which
// of them it's for, so theirs goes at the top of their own bit of line instead, just below where
// it branches off
function drawWarpBranch(parent, child) {
  const { nodeHeight: h, gapY } = WARP_GRAPH;
  const top = child.y - h / 2;
  const bottom = parent.y + h / 2;
  const acrossY = top - gapY / 2;
  // no bigger than half the distance across, or two corners close together would overlap
  const radius = Math.min(WARP_GRAPH.cornerRadius, Math.abs(child.x - parent.x) / 2);

  // drawn straight onto the canvas, since p5 has nothing for rounded corners on a line.
  // arcTo() goes towards a corner and turns along to the next point, rounding it off
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

// a dashed arrow from one warp's box to another's, for a link that isn't part of the tree. it
// curves smoothly out of the side of one box facing the other, and into the side of the other
// facing back, with its arrowhead against that edge rather than hidden under the box. boxes in
// the same row are joined side to side, otherwise bottom to top (or top to bottom)
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

// an arrowhead with its point at x, y: a triangle turned to point angle radians (0 is right)
function drawArrowhead(x, y, angle) {
  push();
  translate(x, y);
  rotate(angle);
  noStroke();
  fill(WARP_GRAPH.lineColour);
  triangle(0, 0, -11, -6, -11, 6);
  pop();
}
