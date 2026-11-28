// the particle editor: a box for making and changing particle effects (particles.js), with a preview
// down the side that bursts the effect every PARTICLE_PREVIEW.every seconds (or when you click it), as
// if something standing there got hit from the left (or on the Keep going tab, nonstop from one tile,
// like lava making it). under it is the scene: a plain floor, or a little bit of map with water or
// lava, to see what the effect does landing in liquids (its Liquids tab). Geometry Dash's particle
// creator was the idea. it
// opens from the map editor's Particles tab (New, Edit, or right click one in the palette) and from an
// enemy's settings (Edit particles, editor.js).
//
// each PARTICLE_SETTINGS line (particles.js) gets a row on its tab, so a new setting needs nothing in
// here. it changes a copy (the draft) and the preview shows that, so Cancel leaves the effect alone.
// Save puts it in PARTICLE_EFFECTS, and saving under a new name makes a copy, leaving the old one. the
// Particles tab's Export downloads the files of new or changed effects, plus any pictures chosen since
// the page loaded.
//
// there's no rename or delete, since enemy files and maps name their effects. do it by hand (the file
// and index.json)

const PARTICLE_PREVIEW = {
  // seconds between bursts
  every: 1.5,
  // px above the floor they come out at, like from the middle of a body
  height: 25,
  // the outline of a body standing there, to show the size (px)
  bodyWidth: 28,
  bodyHeight: 50,
  // how much bigger than on the map at 100% zoom, so small bits are easy to see. scenes with tiles
  // zoom in whole steps up to mapZoom, so the pixel art stays sharp
  zoom: 1.5,
  mapZoom: 2,
  // px wide the side column is, wider than most boxes to fit a bit of map
  sideWidth: 260,
  // the scenes' little world: its top left tile and size, far off any map and the light preview's
  col: 200000,
  row: 200000,
  cols: 30,
  rows: 20,
  // the scenes. liquid is the kind of liquid in it (liquidTile()), and the body stands on the shore
  // with it to the right, in it, or wades back and forth through it at walk px/s
  scenes: {
    floor: { say: 'plain floor' },
    shore: { say: 'hit by water', liquid: 'water', body: 'shore' },
    wading: { say: 'hit while wading', liquid: 'water', body: 'in' },
    wader: { say: 'someone wading through', liquid: 'water', body: 'walks' },
    lava: { say: 'hit by lava', liquid: 'lava', body: 'shore' },
  },
  walk: 45,
  // the ground round the liquid: the first of these tiles there is, or any you can walk on
  ground: ['sand', 'grass', 'dirt'],
};

// the scene picked under the preview, kept from one box to the next
const ParticlePreviewState = { scene: 'floor' };

const ParticleEditor = {
  // pictures chosen since the page loaded, by file name. Export downloads the ones in use, since the
  // game only loads pictures from particles/pictures/
  newPictures: {},

  // name: a PARTICLE_EFFECTS name, or null for a new one. options:
  //   img     a p5 image the preview uses for "the thing's own" picture (an enemy's)
  //   onSave  optional, called with the name it was saved as
  open(name, { img = null, onSave } = {}) {
    const draft = { ...PARTICLE_DEFAULTS, ...PARTICLE_EFFECTS[name] };
    delete draft.name;
    const nameField = new TextField({ w: 180, value: name ?? this.freeName() });
    const savedName = () => cleanMapName(nameField.value); // mapfile.js
    // each setting's field by key, and the tabs they go on in PARTICLE_SETTINGS order
    const fields = {};
    const tabs = [{ label: 'Amount', rows: [{ label: 'Name', field: nameField, tip: 'Saving under a new name makes a copy and leaves this one' }] }];
    for (const line of PARTICLE_SETTINGS) {
      fields[line.key] = particleField(line, draft[line.key]);
      let tab = tabs.find(({ label }) => label === line.tab);
      if (!tab) tabs.push(tab = { label: line.tab, rows: [] });
      tab.rows.push({ label: line.label, field: fields[line.key], tip: line.tip });
    }
    const coloursOk = () => PARTICLE_SETTINGS.every((line) => !line.colour || HEX_COLOUR.test(fields[line.key].value)); // textfield.js

    FormBox.open({
      title: name ? `Particles: ${name}` : 'New particles',
      hint: 'Right click a slider to put it back to normal',
      confirmLabel: 'Save',
      tabs,
      sideWidth: PARTICLE_PREVIEW.sideWidth,
      side: (x, y, w, h) => [
        new ParticlePreview({ x, y, w, h: h - 60, effect: draft, img }),
        new Picker({
          x, y: y + h - 52, w, h: 24,
          choices: Object.keys(PARTICLE_PREVIEW.scenes),
          value: ParticlePreviewState.scene,
          label: (key) => `Scene: ${PARTICLE_PREVIEW.scenes[key].say}`,
          onChange: (key) => { ParticlePreviewState.scene = key; },
        }),
        new Button({
          x, y: y + h - 24, w, h: 24, label: 'Choose picture', style: 'editor',
          onClick: () => TileEditor.choosePicture((file, picture) => { // tileeditor.js
            PARTICLE_PICTURES[file.name] = picture;
            this.newPictures[file.name] = file;
            fields.picture.setChoices(fields.picture.choices.includes(file.name) ? fields.picture.choices : [...fields.picture.choices, file.name], file.name);
            // a picture doesn't show on a drawn shape (squares, stars...), so switch to bits of it
            if (PARTICLE_SHAPES[fields.shape.value].path) fields.shape.setChoices(fields.shape.choices, 'bits');
          }),
        }),
      ],
      // copies the fields into the draft every frame, so the preview changes as you drag. a colour
      // that's halfway through being typed waits until it's finished
      onUpdate: () => {
        for (const line of PARTICLE_SETTINGS) {
          const value = fields[line.key].value;
          if (!line.colour || HEX_COLOUR.test(value)) draft[line.key] = value;
        }
      },
      canConfirm: () => savedName() !== '' && coloursOk(),
      onConfirm: () => {
        const saved = savedName();
        PARTICLE_EFFECTS[saved] = { ...draft, name: saved };
        if (Editor.tab === 'particle') Editor.pick({ kind: 'particle', name: saved });
        onSave?.(saved);
      },
    });
  },

  // the first free name out of new-particles, new-particles-2...
  freeName() {
    let name = 'new-particles';
    for (let n = 2; PARTICLE_EFFECTS[name]; n++) name = `new-particles-${n}`;
    return name;
  },

  // downloads the files of new or changed effects and any chosen pictures they use (datafiles.js)
  exportEffects() {
    const pictures = [];
    for (const [file, data] of Object.entries(this.newPictures)) {
      if (!Object.values(PARTICLE_EFFECTS).some((effect) => effect.picture === file)) continue;
      pictures.push({ name: file, data, folder: `${DATA_KINDS.particle}pictures/` });
      delete this.newPictures[file];
    }
    DataFiles.export(['particle'], pictures);
  },
};

// a MultiPicker of particle effects, like the ones a tile keeps making (tileeditor.js). value is a
// list of names or null, and it gives back null when none are ticked. one that doesn't exist stays in
// the list, so opening the box doesn't quietly drop it
function particleMultiPicker(value) {
  return new MultiPicker({
    w: 180,
    choices: [...new Set([...Object.keys(PARTICLE_EFFECTS), ...(value ?? [])])],
    value,
    empty: null,
    label: (name) => (PARTICLE_EFFECTS[name] ? name : `${name} (missing)`),
    art: drawParticleChoice,
  });
}

// an effect's little picture in a picker or its list (size px square at x, y). nothing for a name
// that isn't an effect (none, its own, a missing one)
function drawParticleChoice(name, x, y, size) {
  const effect = PARTICLE_EFFECTS[name];
  if (effect) drawParticleArt(effect, x + size / 2, y + size / 2, size); // particles.js
}

// the field for a PARTICLE_SETTINGS line (particles.js), starting on value
function particleField(line, value) {
  if (line.choices) return new Picker({ w: 180, choices: line.choices(), value, label: line.say, art: line.art });
  if (line.colour) return new ColourField({ w: 180, value });
  if (line.tick) return new Checkbox({ w: 180, value, label: line.tick });
  return new Slider({ w: 180, labelWidth: 0, label: '', min: line.min, max: line.max, step: line.step ?? 1, curve: line.curve, unit: line.unit, value, normal: line.normal });
}

// the preview down the side of the particle editor: the effect bursting out of a body outline, seen
// from above like on the map. it has its own ParticleSystem, with no walls on the plain floor. in a
// scene with a liquid (ParticlePreviewState.scene) it has its own little TileMap too, drawn by the
// game's own tile and surface code (tilemap.js, surface.js) into a picture of its own like the light
// preview (lighting.js), so splashes, clouds and floating bits look just like on a map. the body
// shoves floating bits like anyone wading (waders() in surface.js), and the one wading through makes
// a wake (wakes.js). click it for another burst.
//   effect  the settings to show (the editor's draft, which changes as you drag)
//   img     the picture "the thing's own" uses, or null
class ParticlePreview extends UIElement {
  constructor(options) {
    super(options);
    this.effect = options.effect;
    this.img = options.img;
    this.system = new ParticleSystem();
    // seconds until the next burst
    this.wait = 0;
    // the scene's map and its picture, the scene they're for, and the body: where its feet are, px
    // from the middle of the map, which way it's walking and how far in it's sunk
    this.map = null;
    this.g = null;
    this.shown = null;
    this.body = { x: 0, y: 0, dir: 1, vx: 0, sunk: 0, w: PARTICLE_PREVIEW.bodyWidth, h: PARTICLE_PREVIEW.bodyHeight };
  }

  // on the Keep going tab it shows the effect the way a tile makes it, nonstop at its rate from
  // anywhere on one tile (ParticleEmitters in particles.js). otherwise it's a hit
  keepGoing() {
    return FormBox.tabs[FormBox.tab]?.label === 'Keep going';
  }

  scene() {
    return PARTICLE_PREVIEW.scenes[ParticlePreviewState.scene] ?? PARTICLE_PREVIEW.scenes.floor;
  }

  // the middle of the scene's map, in world px, where the shore is
  middle() {
    const P = PARTICLE_PREVIEW;
    return { x: (P.col + Math.floor(P.cols / 2)) * TILE, y: (P.row + Math.floor(P.rows / 2)) * TILE };
  }

  update(hovered) {
    this.hovered = hovered;
    const dt = Math.min(deltaTime / 1000, MAX_DT); // config.js
    const click = hovered && Input.buttonsPressed.has('left');
    const scene = this.scene();
    // a new scene starts over
    if (this.shown !== scene) {
      this.shown = scene;
      this.system.clear();
      this.map = scene.liquid ? this.buildMap(scene) : null;
      Object.assign(this.body, { x: scene.body === 'shore' ? -TILE * 0.75 : 0, y: 0, dir: 1, vx: 0 });
      this.wait = 0;
    }
    const map = this.map;
    const origin = map ? this.middle() : { x: 0, y: 0 };
    const body = this.body;
    if (scene.body === 'walks') {
      body.vx = body.dir * PARTICLE_PREVIEW.walk;
      body.x += body.vx * dt;
      if (Math.abs(body.x) > TILE * 3.5) body.dir = -Math.sign(body.x);
    }
    const liquid = map?.get(map.colAt(origin.x + body.x), map.rowAt(origin.y + body.y));
    body.sunk = liquid?.sink ? liquid.sink * body.h : 0;
    const feet = { x: origin.x + body.x, y: origin.y + body.y };
    if (scene.body === 'walks' && liquid?.sink) Wakes.follow({ x: feet.x, y: feet.y - body.h / 2, w: body.w, h: body.h }, liquid, 1, dt);

    if (this.keepGoing()) {
      // one tile: on the plain floor where the body is, otherwise out in the liquid
      const tile = this.keepGoingTile(origin);
      const bursts = burstsIn(this.effect.rate, dt) + (click ? 1 : 0); // particles.js
      for (let i = 0; i < bursts; i++) this.system.burst(this.effect, tile.x + randomBetween(-TILE / 2, TILE / 2), tile.y + randomBetween(-TILE / 2, TILE / 2), { img: this.img });
    } else {
      this.wait -= dt;
      if (this.wait <= 0 || click) {
        this.system.burst(this.effect, feet.x, feet.y, { height: PARTICLE_PREVIEW.height, angle: scene.body === 'walks' ? (body.dir > 0 ? 0 : Math.PI) : 0, img: this.img });
        this.wait = PARTICLE_PREVIEW.every;
      }
    }
    const waders = body.sunk ? [{ x: feet.x, y: feet.y, vx: body.vx, vy: 0, r: (body.w * LIQUID.ringWidth) / 2 }] : [];
    this.system.update(dt, map, waders);
  }

  // the middle of the tile the Keep going tab shows making it
  keepGoingTile(origin) {
    return this.map ? { x: origin.x + TILE * 1.5, y: origin.y + TILE * 0.5 } : { x: 0, y: 0 };
  }

  // the scene's little map: ground all round, and its liquid to the right of the middle (shore) or
  // round it (in, walks), with a bit of shore above and below
  buildMap(scene) {
    const P = PARTICLE_PREVIEW;
    const walkable = (name) => TILE_TYPES[name] && !TILE_TYPES[name].solid && !TILE_TYPES[name].sink;
    const ground = P.ground.find(walkable) ?? Object.keys(TILE_TYPES).find(walkable) ?? null;
    const map = new TileMap(P.col, P.row, P.cols, P.rows, ground); // tilemap.js
    const liquid = liquidTile(scene.liquid);
    const mid = { col: P.col + Math.floor(P.cols / 2), row: P.row + Math.floor(P.rows / 2) };
    if (liquid) {
      const left = scene.body === 'shore' ? mid.col : mid.col - 6;
      for (let row = mid.row - 3; row <= mid.row + 3; row++) {
        for (let col = left; col <= mid.col + 8; col++) map.set(col, row, liquid);
      }
    }
    // the preview's own particles, for the surface's ripples and floating rings (surface.js)
    map.particles = this.system;
    return map;
  }

  draw() {
    const { x, y, w, h } = this;
    const keepGoing = this.keepGoing();
    if (this.map) this.drawScene(Math.round(w), Math.round(h));
    else this.drawFloor();
    noFill();
    stroke(EDITOR_COLOURS.edge); // editor.js
    strokeWeight(1);
    rect(x + 0.5, y + 0.5, w - 1, h - 1, 3);
    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, BOTTOM);
    text(keepGoing ? 'One tile making it' : 'Click for another', x + w / 2, y + h - 4);
  }

  // how high they go above the floor at most, for zooming out to keep the top of their jump in view
  top() {
    return (this.keepGoing() ? 0 : PARTICLE_PREVIEW.height) + this.effect.startHeight + this.effect.jumpHeight;
  }

  // the plain floor: just the body outline (or the tile) on the editor's dark
  drawFloor() {
    const { x, y, w, h } = this;
    const keepGoing = this.keepGoing();
    const zoom = Math.min(PARTICLE_PREVIEW.zoom, (h * 0.6) / Math.max(1, this.top()));
    noStroke();
    fill(WORLD_COLOURS.outside); // world.js
    rect(x, y, w, h, 3);
    push();
    // the particles get cut off at the edges
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    // the floor spot they come out above: left of the middle for hits since they fly right, and in
    // the middle of the tile otherwise
    translate(Math.round(x + w * (keepGoing ? 0.5 : 0.3)), Math.round(y + h * 0.65));
    scale(zoom);
    this.drawBody(keepGoing ? { x: 0, y: 0 } : null);
    this.system.drawAll();
    pop();
  }

  // a scene with a map, drawn into its own picture and laid in the box
  drawScene(w, h) {
    const { x, y } = this;
    const scene = this.scene();
    const origin = this.middle();
    let zoom = Math.min(PARTICLE_PREVIEW.mapZoom, w / 200, (h * 0.6) / Math.max(1, this.top()));
    zoom = zoom >= 1 ? Math.floor(zoom) : 1 / Math.ceil(1 / zoom);
    // the body (or the tile) a third of the way across and two thirds down, like the plain floor, and
    // in the middle for the one wading back and forth
    const across = scene.body === 'walks' && !this.keepGoing() ? 0.5 : 0.3;
    const camera = new PreviewCamera(origin.x + ((0.5 - across) * w) / zoom, origin.y + ((0.5 - 0.65) * h) / zoom, zoom, w, h); // lighting.js
    if (this.g?.width !== w || this.g?.height !== h) {
      this.g?.remove();
      this.g = lightGraphics(w, h);
    }
    const view = camera.view();
    const feetY = origin.y + this.body.y;
    drawingInto(this.g, () => {
      push();
      background(WORLD_COLOURS.outside);
      camera.begin();
      this.map.drawTiles(camera);
      this.system.drawFloor(view, this.map);
      this.system.drawFlyingWith([{ y: feetY, draw: () => this.drawBody(this.keepGoing() ? this.keepGoingTile(origin) : null, origin) }], view);
      camera.end();
      pop();
    });
    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.g.elt, 0, 0, w, h, x, y, w, h);
    ctx.restore();
  }

  // the outline of the body standing (its feet at origin + body), sunk into a liquid with a ring round
  // it where it meets the surface, or of the tile making it (tile, its middle) on the Keep going tab
  drawBody(tile, origin = { x: 0, y: 0 }) {
    noFill();
    stroke(255, 255, 255, 50);
    strokeWeight(1);
    if (tile) {
      rect(tile.x - TILE / 2, tile.y - TILE / 2, TILE, TILE);
      return;
    }
    const { bodyWidth, bodyHeight } = PARTICLE_PREVIEW;
    const bx = origin.x + this.body.x;
    const by = origin.y + this.body.y + 7;
    const sunk = this.body.sunk;
    rect(bx - bodyWidth / 2, by - bodyHeight + sunk, bodyWidth, bodyHeight - sunk);
    if (!sunk || !this.map) return;
    const liquid = this.map.get(this.map.colAt(bx), this.map.rowAt(by - 7));
    if (!liquid?.sink) return;
    noStroke();
    drawingContext.fillStyle = Surface.palette(liquid).css.foam; // surface.js
    const rx = (bodyWidth * LIQUID.ringWidth) / 2;
    Surface.arc(bx, by, rx, rx * LIQUID.ringSquash, 0, Math.PI * 2);
  }
}

// a liquid tile for a preview scene: the tile called name if it's a liquid, or else the first liquid
// like it (one you can see into for water, a glowing one for lava), or any liquid, or null
function liquidTile(name) {
  if (TILE_TYPES[name]?.sink) return name;
  const liquids = Object.keys(TILE_TYPES).filter((n) => TILE_TYPES[n].sink);
  const like = liquids.find((n) => (name === 'lava' ? TILE_TYPES[n].glow : TILE_TYPES[n].clarity > 0));
  return like ?? liquids[0] ?? null;
}
