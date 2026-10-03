// the tile editor: making and changing tiles inside the map editor (editor.js), so tiles.json
// (tiles.js) never needs hand editing.
//   - New (inspector, Tiles tab) opens a box for a new tile; right click in the palette (or Edit)
//     opens it for an existing one
//   - tabs: Look, then TILE_BEHAVIOURS' tabs (Behaviours, Effects...), then Dual grid (blendsWith)
//   - a side column shows the texture file and a live patch of the tile on the map
//   - an existing tile changes on the map as you edit (drag the box aside to see). Save keeps it;
//     Cancel, Escape or × restores it
//   - Save applies to the game straight away (paint and walk on it)
//   - Export (beside New) downloads tiles.json for assets/squimble-quest/tiles/, plus any picture
//     chosen since page load; the message says which folder
// no renaming or deleting: maps store tile names, so either would lose it from every map. do those
// in tiles.json by hand

// every non-look setting (TILE_DEFAULTS in tiles.js) as an editor row on its tab. tabs follow Look in
// first-mention order; a new tab name makes a new tab ("adding a new tile setting", top of tiles.js).
//   key    TILE_DEFAULTS / tiles.json name
//   tab    its tab
//   label  words before the field
//   after  optional words after it
//   field  (value) => a NumberField, Checkbox or Picker. number fields have a max, so typos can't do
//          anything silly
//   scale  optional display multiplier for whole-number fields, e.g. 100 shows speed 0.8 as 80 (%)
const TILE_BEHAVIOURS = [
  { tab: 'Behaviours', key: 'solid', label: 'Solid', field: (value) => new Checkbox({ w: 180, value, label: "can't walk on it" }) },
  { tab: 'Behaviours', key: 'seeThrough', label: 'See over', field: (value) => new Checkbox({ w: 180, value, label: 'enemies see across it' }) },
  // min 1%: 0 would trap anyone on it. 500 is 5x
  { tab: 'Behaviours', key: 'speed', label: 'Speed', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, min: 1, max: 500 }) },
  { tab: 'Behaviours', key: 'damagePerSecond', label: 'Damage', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  { tab: 'Behaviours', key: 'damagePerStep', label: 'Damage', after: 'per step', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },

  { tab: 'Effects', key: 'healPerSecond', label: 'Heal', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  // max 95%: at 100 anyone standing still could never get moving
  { tab: 'Effects', key: 'slippery', label: 'Slippery', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 95 }) },
  {
    tab: 'Effects', key: 'pushDirection', label: 'Push',
    field: (value) => new Picker({ w: 180, choices: [null, ...Object.keys(PUSH_DIRECTIONS)], value, label: (way) => way ?? 'nowhere' }),
  },
  { tab: 'Effects', key: 'pushSpeed', label: 'Push by', after: 'tiles a second', field: (value) => new NumberField({ w: 90, value, max: 20 }) },
];

// max rows per tab; more continue in a numbered tab ("Effects 2"). the box is always this tall,
// leaving room for the side pictures
const TILE_EDITOR_ROWS = 7;

// a 2 x 2 dual grid patch is 3 x 3 pieces, bits as in DUAL_TILESET_LAYOUT (dualgrid.js). drawn by
// the "On the map" preview
const DUAL_PREVIEW_PATCH = [
  [0b0001, 0b0011, 0b0010],
  [0b0101, 0b1111, 0b1010],
  [0b0100, 0b1100, 0b1000],
];

const TileEditor = {
  // Files chosen since page load, by file name. the game only loads textures from its folders, so
  // Export tiles downloads these too
  newPictures: {},

  // opens the box for a TILE_TYPES tile, or a new one with null
  open(type) {
    const isNew = type === null;
    // picture chosen in this box, { file, img } (p5 image), or null; kept only on Save
    let chosen = null;
    // the tile's settings and picture before editing, restored on cancel (live preview changes the
    // tile itself)
    const original = type && Object.fromEntries(['name', ...Object.keys(TILE_DEFAULTS)].map((key) => [key, type[key]]));
    const ownImg = type?.textureImg ?? null;

    // fields kept in variables rather than read from onConfirm's values, since the Name row only
    // exists for new tiles and shifts the rest
    const nameField = new TextField({ w: 180, value: '' });
    // false normal, true dual grid, like dualGrid in tiles.json
    const kindPicker = new Picker({
      w: 180,
      choices: [false, true],
      value: type?.dualGrid ?? false,
      label: (dual) => (dual ? 'dual grid' : 'normal'),
    });
    // new tiles start grey. swatch opens a picker; hex or rgb can be pasted
    const colourField = new ColourField({ w: 180, value: type?.colour ?? '#8a8f99' });
    // none, or the texture file name. Choose picture swaps in a new one
    const texturePicker = new Picker({
      w: 180,
      choices: type?.texture ? [null, type.texture] : [null],
      value: type?.texture ?? null,
      // long names truncated to fit
      label: (file) => (!file ? 'none, just colour' : file.length > 18 ? `${file.slice(0, 17)}…` : file),
    });
    // a row per TILE_BEHAVIOURS entry, from the tile's value (or the default)
    const behaviourRows = TILE_BEHAVIOURS.map((b) => {
      const value = type?.[b.key] ?? TILE_DEFAULTS[b.key];
      return { ...b, field: b.field(b.scale ? Math.round(value * b.scale) : value) };
    });
    // blendsWith (tiles.js): every dual grid tile (even future ones), or only the ticked ones, with a
    // checkbox per other dual grid tile
    const blendPicker = new Picker({
      w: 180,
      choices: [true, false],
      value: !type?.blendsWith,
      label: (all) => (all ? 'every dual grid tile' : 'only the ticked ones'),
      onChange: (all) => blendBoxes.forEach((box) => { box.enabled = !all; }),
    });
    const blendBoxes = Object.values(TILE_TYPES)
      .filter((other) => other.dualGrid && other !== type)
      .map((other) => new Checkbox({
        w: 180, label: other.name, enabled: !blendPicker.value,
        value: !type?.blendsWith || type.blendsWith.includes(other.name),
      }));
    const blendRows = [
      { label: 'Blends', field: blendPicker },
      ...blendBoxes.map((field) => ({ label: '', field })),
    ];

    // TILE_BEHAVIOURS' tabs then Dual grid, split into TILE_EDITOR_ROWS pages
    const sections = [...new Set(TILE_BEHAVIOURS.map((b) => b.tab))]
      .map((name) => [name, behaviourRows.filter((row) => row.tab === name)]);
    sections.push(['Dual grid', blendRows]);
    const tabs = [];
    for (const [name, rows] of sections) {
      for (let i = 0; i < rows.length; i += TILE_EDITOR_ROWS) {
        const page = i / TILE_EDITOR_ROWS;
        tabs.push({ label: page ? `${name} ${page + 1}` : name, rows: rows.slice(i, i + TILE_EDITOR_ROWS) });
      }
    }

    // the selected texture as a p5 image: just chosen, or the tile's own. null for none or if the
    // tile's file failed to load
    const picture = () => {
      const file = texturePicker.value;
      if (!file) return null;
      if (chosen?.file.name === file) return chosen.img;
      return ownImg;
    };
    // current settings, tiles.json shaped (tiles.js)
    const settingsNow = () => {
      const settings = {
        name: isNew ? cleanMapName(nameField.value) : type.name,
        colour: colourField.value.toLowerCase(),
        dualGrid: kindPicker.value,
        texture: texturePicker.value,
      };
      for (const row of behaviourRows) settings[row.key] = row.scale ? row.field.value / row.scale : row.field.value;
      settings.blendsWith = blendPicker.value ? null : blendBoxes.filter((box) => box.value).map((box) => box.label);
      return settings;
    };
    // what the map shows (settings as text, to detect changes, and picture), and whether it differs
    // from the original
    let shown = { settings: JSON.stringify(settingsNow()), img: picture() };
    let changed = false;
    // why it can't be saved (shown; Save greyed), or null
    const problem = () => {
      // tile names follow map name rules (cleanMapName() in mapfile.js), since maps store them
      const name = cleanMapName(nameField.value);
      if (isNew && !name) return 'It needs a name';
      if (isNew && TILE_TYPES[name]) return `There's already a tile called ${name}`;
      if (!HEX_COLOUR.test(colourField.value)) return 'The colour needs to look like #6fae4f';
      const img = picture();
      const tilesetProblem = kindPicker.value && img ? dualTilesetProblem(img) : null;
      if (tilesetProblem) return `Can't be a dual grid tileset: ${tilesetProblem}`;
      return null;
    };

    FormBox.open({
      title: isNew ? 'New tile' : `Tile: ${type.name}`,
      hint: isNew ? 'Save to try it out, Export tiles to keep it' : 'Changes show on the map as you make them',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Look',
          rows: [
            // no renaming (top of this file)
            ...(isNew ? [{ label: 'Name', field: nameField }] : []),
            { label: 'Kind', field: kindPicker },
            { label: 'Colour', field: colourField },
            { label: 'Texture', field: texturePicker },
          ],
        },
        ...tabs,
      ],
      minRows: TILE_EDITOR_ROWS,
      // previews, and Choose picture below them
      side: (x, y, w, h) => [
        new TilePreview({
          x, y, w, h: h - 32,
          look: () => ({ dualGrid: kindPicker.value, colour: colourField.value, img: picture(), problem: problem() }),
        }),
        new Button({
          x, y: y + h - 24, w, h: 24, label: 'Choose picture', style: 'editor',
          onClick: () => this.choosePicture((file, img) => {
            chosen = { file, img };
            texturePicker.setChoices([null, file.name], file.name);
          }),
        }),
      ],
      canConfirm: () => problem() === null,
      // an existing tile updates live whenever the box would save; a new one isn't on the map yet
      onUpdate: () => {
        if (isNew || problem() !== null) return;
        const settings = settingsNow();
        const now = { settings: JSON.stringify(settings), img: picture() };
        if (now.settings === shown.settings && now.img === shown.img) return;
        shown = now;
        changed = true;
        setTile(settings, now.img);
      },
      onCancel: () => {
        if (changed) setTile(original, ownImg);
      },
      onConfirm: () => {
        const settings = settingsNow();
        const { name, texture } = settings;
        const isChosen = chosen !== null && texture === chosen.file.name;
        if (isChosen) this.newPictures[texture] = chosen.file;
        // an old texture on a tile that changed kind now belongs in the other folder
        const moved = !isNew && !isChosen && texture && kindPicker.value !== original.dualGrid;

        // tiles.js. uses the picture directly, since it may not be in its folder yet
        setTile(settings, picture());

        // the palette reads TILE_TYPES each frame, so it's current. a new tile gets picked (editor.js)
        if (isNew) Editor.pick({ kind: 'tile', name });
        showMessage(moved
          ? `Saved ${name}. Move ${texture} into tiles/${this.folderName(TILE_TYPES[name])}/ too`
          : `Saved ${name}. Export tiles to keep it`);
      },
    });
  },

  // texture folder name inside assets/squimble-quest/tiles/
  folderName(type) {
    return type.dualGrid ? 'dual-grid' : 'normal';
  },

  // picks a picture (pickFile() in utils.js), then onLoad(File, p5 image)
  choosePicture(onLoad) {
    pickFile('image/png,image/*', (file) => {
      // temporary url so p5 can load it
      const url = URL.createObjectURL(file);
      loadImage(url, (img) => {
        URL.revokeObjectURL(url);
        onLoad(file, img);
      }, () => {
        URL.revokeObjectURL(url);
        showMessage(`Couldn't open ${file.name} as a picture`);
      });
    });
  },

  // downloads tiles.json (tiles.js) and any in-use picture chosen since page load, then says where
  // they go (utils.js download helpers)
  exportTiles() {
    downloadTextFile('tiles.json', tilesDataToText(tilesToData()));
    const pictures = [];
    for (const type of Object.values(TILE_TYPES)) {
      const file = this.newPictures[type.texture];
      // shared pictures download once
      if (!file || pictures.some((p) => p.name === type.texture)) continue;
      downloadData(type.texture, file);
      pictures.push({ name: type.texture, folder: this.folderName(type) });
    }
    const also = pictures.map((p) => `, ${p.name} in tiles/${p.folder}/`).join('');
    showMessage(`Exported! Put tiles.json in assets/squimble-quest/tiles/${also}`);
  },
};

// the side column: the texture file, a 2 x 2 patch as on the map, and any save problem.
//   look  () => { dualGrid, colour, img, problem }
class TilePreview extends UIElement {
  constructor(options) {
    // show-only; clicks go to the form box
    super({ ...options, interactive: false });
    this.look = options.look;
    // last tileset's pieces and source, so it's only recut when the picture changes
    this.pieces = null;
    this.piecesFrom = null;
  }

  draw() {
    const { dualGrid, colour, img, problem } = this.look();
    // black until the colour's complete (mid typing)
    const fillColour = HEX_COLOUR.test(colour) ? colour : '#000000';
    // two squares side by side, room below for the problem. a multiple of 6 whole px, so the patch's
    // halves (normal) and thirds (dual grid) meet exactly with no faint lines
    const gap = 8;
    const size = Math.floor(Math.min((this.w - gap) / 2, this.h - 70) / 6) * 6;
    const firstLeft = Math.round(this.x + (this.w - size * 2 - gap) / 2);
    const secondLeft = firstLeft + size + gap;
    const top = this.y + 16;

    const label = (words, left) => {
      noStroke();
      fill(EDITOR_COLOURS.dimText);
      setText(11, BOLD, CENTER, CENTER);
      text(words, left + size / 2, this.y + 6);
    };
    // dark backing square
    const backing = (left) => {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(left, top, size, size);
    };

    // 1. the texture file, fitted without stretching; tilesets get faint piece lines. no texture
    // shows the colour
    label(img ? 'Texture file' : 'Colour', firstLeft);
    backing(firstLeft);
    if (img) {
      // scaled to fit, aspect kept, centred
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const imgLeft = firstLeft + (size - w) / 2;
      const imgTop = top + (size - h) / 2;
      image(img, imgLeft, imgTop, w, h);
      if (dualGrid) {
        // 4 x 4 piece lines
        stroke(255, 255, 255, 50);
        strokeWeight(1);
        for (let i = 1; i < 4; i++) {
          line(imgLeft + (w * i) / 4, imgTop, imgLeft + (w * i) / 4, imgTop + h);
          line(imgLeft, imgTop + (h * i) / 4, imgLeft + w, imgTop + (h * i) / 4);
        }
      }
    } else {
      fill(fillColour);
      rect(firstLeft, top, size, size);
    }

    // 2. a 2 x 2 patch as on the map; dual grid rounds off at the edges
    label('On the map', secondLeft);
    backing(secondLeft);
    const pieces = dualGrid && img ? this.piecesOf(img) : null;
    if (pieces) {
      const piece = size / 3;
      DUAL_PREVIEW_PATCH.forEach((row, r) => row.forEach((which, c) => {
        image(pieces[which], secondLeft + c * piece, top + r * piece, piece, piece);
      }));
    } else {
      // normal, or dual grid without a working tileset: four squares
      const half = size / 2;
      for (let i = 0; i < 4; i++) {
        const x = secondLeft + (i % 2) * half;
        const y = top + Math.floor(i / 2) * half;
        if (img && !dualGrid) {
          image(img, x, y, half, half);
        } else {
          noStroke();
          fill(fillColour);
          rect(x, y, half, half);
        }
      }
    }

    // 3. the save problem in red, wrapped
    if (problem) {
      noStroke();
      fill(EDITOR_COLOURS.erase);
      setText(11, BOLD, LEFT, TOP);
      text(problem, this.x, top + size + 10, this.w, this.y + this.h - (top + size + 10));
    }
  }

  // the tileset's pieces (dualgrid.js), or null if it can't be one
  piecesOf(img) {
    if (img !== this.piecesFrom) {
      this.piecesFrom = img;
      this.pieces = dualTilesetProblem(img) ? null : cutDualTileset(img, 'the tile editor picture');
    }
    return this.pieces;
  }
}
