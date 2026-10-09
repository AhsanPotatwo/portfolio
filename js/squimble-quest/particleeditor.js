// the particle editor: a box for making and changing particle effects (particles.js), with a preview
// down the side that bursts the effect every PARTICLE_PREVIEW.every seconds (or when you click it), as
// if something standing there got hit from the left (or on the Keep going tab, nonstop from one tile,
// like lava making it). Geometry Dash's particle creator was the idea. it
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
  // how much bigger than on the map at 100% zoom, so small bits are easy to see
  zoom: 1.5,
};

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
    const tabs = [{ label: 'Amount', rows: [{ label: 'Name', field: nameField }] }];
    for (const line of PARTICLE_SETTINGS) {
      fields[line.key] = particleField(line, draft[line.key]);
      let tab = tabs.find(({ label }) => label === line.tab);
      if (!tab) tabs.push(tab = { label: line.tab, rows: [] });
      tab.rows.push({ label: line.label, field: fields[line.key] });
    }
    const coloursOk = () => PARTICLE_SETTINGS.every((line) => !line.colour || HEX_COLOUR.test(fields[line.key].value)); // textfield.js

    FormBox.open({
      title: name ? `Particles: ${name}` : 'New particles',
      hint: 'Right click a slider to put it back to normal',
      confirmLabel: 'Save',
      tabs,
      side: (x, y, w, h) => [
        new ParticlePreview({ x, y, w, h: h - 32, effect: draft, img }),
        new Button({
          x, y: y + h - 24, w, h: 24, label: 'Choose picture', style: 'editor',
          onClick: () => TileEditor.choosePicture((file, picture) => { // tileeditor.js
            PARTICLE_PICTURES[file.name] = picture;
            this.newPictures[file.name] = file;
            fields.picture.setChoices(fields.picture.choices.includes(file.name) ? fields.picture.choices : [...fields.picture.choices, file.name], file.name);
            // a picture doesn't show as squares or circles, so switch to bits of it
            if (fields.shape.value === 'square' || fields.shape.value === 'circle') fields.shape.setChoices(fields.shape.choices, 'bits');
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

// the field for a PARTICLE_SETTINGS line (particles.js), starting on value
function particleField(line, value) {
  if (line.choices) return new Picker({ w: 180, choices: line.choices(), value, label: line.say });
  if (line.colour) return new ColourField({ w: 180, value });
  if (line.tick) return new Checkbox({ w: 180, value, label: line.tick });
  return new Slider({ w: 180, labelWidth: 0, label: '', min: line.min, max: line.max, step: line.step ?? 1, curve: line.curve, unit: line.unit, value, normal: line.normal });
}

// the preview down the side of the particle editor: the effect bursting out of a body outline, seen
// from above like on the map. it has its own ParticleSystem with no walls. click it for another burst.
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
  }

  // on the Keep going tab it shows the effect the way a tile makes it, nonstop at its rate from
  // anywhere on one tile (ParticleEmitters in particles.js). otherwise it's a hit
  keepGoing() {
    return FormBox.tabs[FormBox.tab]?.label === 'Keep going';
  }

  update(hovered) {
    this.hovered = hovered;
    const dt = Math.min(deltaTime / 1000, MAX_DT); // config.js
    const click = hovered && Input.buttonsPressed.has('left');
    if (this.keepGoing()) {
      const bursts = burstsIn(this.effect.rate, dt) + (click ? 1 : 0); // particles.js
      for (let i = 0; i < bursts; i++) this.system.burst(this.effect, randomBetween(-TILE / 2, TILE / 2), randomBetween(-TILE / 2, TILE / 2), { img: this.img });
    } else {
      this.wait -= dt;
      if (this.wait <= 0 || click) {
        this.system.burst(this.effect, 0, 0, { height: PARTICLE_PREVIEW.height, angle: 0, img: this.img });
        this.wait = PARTICLE_PREVIEW.every;
      }
    }
    this.system.update(dt, null);
  }

  draw() {
    const { x, y, w, h } = this;
    const { bodyWidth, bodyHeight, zoom } = PARTICLE_PREVIEW;
    const keepGoing = this.keepGoing();
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
    noFill();
    stroke(255, 255, 255, 50);
    strokeWeight(1);
    if (keepGoing) rect(-TILE / 2, -TILE / 2, TILE, TILE);
    else rect(-bodyWidth / 2, -bodyHeight + 7, bodyWidth, bodyHeight);
    this.system.drawAll();
    pop();
    noStroke();
    fill(EDITOR_COLOURS.dimText); // editor.js
    setText(11, BOLD, CENTER, BOTTOM);
    text(keepGoing ? 'One tile making it' : 'Click for another', x + w / 2, y + h - 4);
  }
}
