// the warp graph: a picture of how warps link up, for seeing how maps join together while
// building them. open it from a warp's settings box in the map editor (Show links, see editWarp()
// in editor.js).
//
// it shows the warp you're editing at the top, then every warp linked to it, then every warp
// linked to those, and so on, like a family tree. a link counts either way round, so the warps
// leading *to* a warp are in its family as well as the one it leads to. warps that aren't linked
// to it at all, even ones on the same map, aren't shown.
//
// each box is a warp: its name, and the map it's on under that. arrows point the way each warp
// leads, so a pair of warps leading to each other (a door and the way back out) has an arrow at
// both ends. a warp leading to a map's spawn point shows that spawn point as a box too, and
// something a warp leads to that doesn't exist is a red box.
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
  gapY: 60,
  // how far it can zoom out and in
  minZoom: 0.2,
  maxZoom: 2,
  // the window onto a warp's map that shows while hovering over its box, in screen pixels, and how
  // zoomed in it is. zoomed out a bit from normal play, so there's enough around the warp to tell
  // where it is (the whole inside of the hut fits)
  previewWidth: 360,
  previewHeight: 240,
  previewZoom: 0.75,
};

// every warp linked to the warp called warpName on the map mapName, however far away, laid out
// like a family tree. gives back { nodes, links }:
//   nodes  one per warp: { key, map, name, missing, start, x, y }. name is '' for a map's spawn
//          point, missing is true if it doesn't exist, start is true for the one it started from,
//          and x, y is the middle of its box
//   links  one per warp that leads somewhere: { from, to }, each a node's key
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

  // the family, one row at a time: the start, then everything linked to it, then everything linked
  // to those... each warp's parent is whichever warp in the row above found it first
  const row = { [startKey]: 0 };
  const children = { [startKey]: [] };
  const family = [startKey];
  for (const key of family) {
    for (const next of linked[key]) {
      if (next in row) continue;
      row[next] = row[key] + 1;
      children[key].push(next);
      children[next] = [];
      family.push(next);
    }
  }

  // across: warps with no children take the next space along, left to right, and a parent sits
  // over the middle of its children. that keeps each branch together without any overlapping
  const across = {};
  let nextSpace = 0;
  const placeAcross = (key) => {
    const kids = children[key];
    kids.forEach(placeAcross);
    across[key] = kids.length ? (across[kids[0]] + across[kids[kids.length - 1]]) / 2 : nextSpace++;
  };
  placeAcross(startKey);

  const g = WARP_GRAPH;
  return {
    nodes: family.map((key) => ({
      ...found[key],
      start: key === startKey,
      x: across[key] * (g.nodeWidth + g.gapX),
      y: row[key] * (g.nodeHeight + g.gapY),
    })),
    links: links.filter(({ from, to }) => from in row && to in row && from !== to),
  };
}

const WarpGraph = {
  // true while the graph is showing. it sits over the warp's settings box (FormBox in editor.js),
  // which comes back when it closes
  active: false,

  // shows the graph for the warp called warpName on the map mapName
  open(mapName, warpName) {
    this.active = true;
    const add = (element) => UI.add(Object.assign(element, { group: 'warp-graph' }));
    add(new WarpGraphView({ x: 0, y: 0, w: GAME_W, h: GAME_H, title: `Warps linked to ${warpName}`, family: warpFamily(mapName, warpName) }));
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
    // the space under the title, zoomed out to fit if it's too big (but never zoomed in)
    const nodes = this.family.nodes;
    const left = Math.min(...nodes.map((node) => node.x)) - WARP_GRAPH.nodeWidth / 2;
    const right = Math.max(...nodes.map((node) => node.x)) + WARP_GRAPH.nodeWidth / 2;
    const bottom = Math.max(...nodes.map((node) => node.y)) + WARP_GRAPH.nodeHeight / 2;
    const top = -WARP_GRAPH.nodeHeight / 2;
    // the space it fits in: the whole screen but a margin, and the title along the top
    const space = { x: 20, y: 80, w: GAME_W - 40, h: GAME_H - 100 };
    this.zoom = constrain(Math.min(1, space.w / (right - left), space.h / (bottom - top)), WARP_GRAPH.minZoom, WARP_GRAPH.maxZoom);
    this.panX = space.x + space.w / 2 - ((left + right) / 2) * this.zoom;
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
    // links first, so the boxes cover the ends that start inside them
    for (const { from, to } of this.family.links) drawWarpLink(byKey[from], byKey[to]);
    for (const node of this.family.nodes) drawWarpNode(node);
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
// red for one that doesn't exist, purple (like warps in the editor, warps.js) for the rest
function drawWarpNode(node) {
  const { nodeWidth: w, nodeHeight: h } = WARP_GRAPH;
  fill(EDITOR_COLOURS.bar); // editor.js
  stroke(node.start ? '#ffd23f' : node.missing ? WARP_COLOURS.broken : WARP_COLOURS.edge);
  strokeWeight(node.start ? 3 : 2);
  rect(node.x - w / 2, node.y - h / 2, w, h, 6);

  noStroke();
  fill(255);
  setText(14, node.name ? BOLD : ITALIC, CENTER, CENTER);
  text(node.name || 'spawn point', node.x, node.y - 8);
  fill(255, 255, 255, 150);
  setText(11, NORMAL, CENTER, CENTER);
  text(node.missing ? `${node.map} (missing)` : node.map, node.x, node.y + 10);
}

// an arrow from one warp's box to another's. it points at the edge of the box it leads to, rather
// than its middle, so the arrowhead isn't hidden under it
function drawWarpLink(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // how far back from the middle the edge of the box is, along the line
  const back = Math.min(WARP_GRAPH.nodeWidth / 2 / Math.abs(dx), WARP_GRAPH.nodeHeight / 2 / Math.abs(dy));
  const endX = to.x - dx * back;
  const endY = to.y - dy * back;

  stroke(150, 155, 170);
  strokeWeight(2);
  line(from.x, from.y, endX, endY);

  // the arrowhead, a triangle turned to point along the line
  push();
  translate(endX, endY);
  rotate(Math.atan2(dy, dx));
  noStroke();
  fill(150, 155, 170);
  triangle(0, 0, -11, -6, -11, 6);
  pop();
}
