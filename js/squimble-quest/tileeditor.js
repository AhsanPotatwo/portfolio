// the tile editor: for making and changing tiles inside the map editor (editor.js), so you never
// have to edit tiles.json (tiles.js) by hand.
//   - New (in the inspector on the Tiles tab) opens a box for a new tile. right clicking a tile in
//     the palette (or Edit) opens it for one that already exists
//   - the tabs are Look, then TILE_BEHAVIOURS' tabs (Behaviours, Effects...), then Dual grid
//     (blendsWith)
//   - a column down the side shows the texture file and a little patch of the tile like on the map
//   - a tile that already exists changes on the map while you edit it (drag the box out of the way to
//     see). Save keeps the changes, and Cancel, Escape or the x puts it back how it was
//   - Save changes the game straight away (you can paint with it and walk on it)
//   - Export (next to New) downloads tiles.json for assets/squimble-quest/tiles/, plus any pictures
//     chosen since the page loaded. the message says which folder they go in
// there's no renaming or deleting, because maps store tile names, so either one would lose the tile
// from every map. do those by hand in tiles.json

// every setting apart from the look ones (TILE_DEFAULTS in tiles.js), each as a row in the editor on
// its tab. the tabs come after Look in the order they're first mentioned, and a tab name that's new
// makes a new tab ("adding a new tile setting" at the top of tiles.js).
//   key    its name in TILE_DEFAULTS and tiles.json
//   tab    which tab it goes on
//   label  the words before the field
//   after  optional words after it
//   field  (value) => a NumberField, Checkbox or Picker. number fields have a max so a typo can't do
//          anything silly
//   scale  optional, multiplies the number shown in whole number fields. 100 shows a speed of 0.8 as
//          80 (%)
const TILE_BEHAVIOURS = [
  { tab: 'Behaviours', key: 'solid', label: 'Solid', field: (value) => new Checkbox({ w: 180, value, label: "can't walk on it" }) },
  { tab: 'Behaviours', key: 'seeThrough', label: 'See over', field: (value) => new Checkbox({ w: 180, value, label: 'enemies see across it' }) },
  // at least 1%, because 0 would trap anyone standing on it. 500 is 5x
  { tab: 'Behaviours', key: 'speed', label: 'Speed', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, min: 1, max: 500 }) },
  { tab: 'Behaviours', key: 'damagePerSecond', label: 'Damage', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  { tab: 'Behaviours', key: 'damagePerStep', label: 'Damage', after: 'per step', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },

  { tab: 'Effects', key: 'healPerSecond', label: 'Heal', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  // at most 95%, because at 100 anyone standing still could never get moving again
  { tab: 'Effects', key: 'slippery', label: 'Slippery', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 95 }) },
  {
    tab: 'Effects', key: 'pushDirection', label: 'Push',
    field: (value) => new Picker({ w: 180, choices: [null, ...Object.keys(PUSH_DIRECTIONS)], value, label: (way) => way ?? 'nowhere' }),
  },
  { tab: 'Effects', key: 'pushSpeed', label: 'Push by', after: 'tiles a second', field: (value) => new NumberField({ w: 90, value, max: 20 }) },
];

// the most rows on a tab. any more carry on in a numbered tab ("Effects 2"). the box is always this
// tall, which leaves room for the pictures down the side
const TILE_EDITOR_ROWS = 7;

// a 2 x 2 patch of dual grid tile is 3 x 3 pieces, with the bits like in DUAL_TILESET_LAYOUT
// (dualgrid.js). the "On the map" preview draws it
const DUAL_PREVIEW_PATCH = [
  [0b0001, 0b0011, 0b0010],
  [0b0101, 0b1111, 0b1010],
  [0b0100, 0b1100, 0b1000],
];

const TileEditor = {
  // Files chosen since the page loaded, by file name. the game only loads textures from its own
  // folders, so Export tiles downloads these as well
  newPictures: {},

  // opens the box for a tile from TILE_TYPES, or for a new one if type is null
  open(type) {
    const isNew = type === null;
    // the picture chosen in this box as { file, img } (img is a p5 image), or null. only kept if you
    // press Save
    let chosen = null;
    // the tile's settings and picture from before editing, put back if you cancel (the live preview
    // changes the actual tile)
    const original = type && Object.fromEntries(['name', ...Object.keys(TILE_DEFAULTS)].map((key) => [key, type[key]]));
    const ownImg = type?.textureImg ?? null;

    // the fields are kept in variables instead of reading them from onConfirm's values, because the
    // Name row is only there for new tiles and would shift the rest along
    const nameField = new TextField({ w: 180, value: '' });
    // false is normal and true is dual grid, same as dualGrid in tiles.json
    const kindPicker = new Picker({
      w: 180,
      choices: [false, true],
      value: type?.dualGrid ?? false,
      label: (dual) => (dual ? 'dual grid' : 'normal'),
    });
    // new tiles start grey. the colour square opens a picker, and you can paste in hex or rgb
    const colourField = new ColourField({ w: 180, value: type?.colour ?? '#8a8f99' });
    // none, or the texture's file name. Choose picture swaps in a new one
    const texturePicker = new Picker({
      w: 180,
      choices: type?.texture ? [null, type.texture] : [null],
      value: type?.texture ?? null,
      // long names get cut short to fit
      label: (file) => (!file ? 'none, just colour' : file.length > 18 ? `${file.slice(0, 17)}…` : file),
    });
    // a row for each TILE_BEHAVIOURS entry, starting on the tile's value (or the default)
    const behaviourRows = TILE_BEHAVIOURS.map((b) => {
      const value = type?.[b.key] ?? TILE_DEFAULTS[b.key];
      return { ...b, field: b.field(b.scale ? Math.round(value * b.scale) : value) };
    });
    // blendsWith (tiles.js): either every dual grid tile (even ones made later) or only the ticked
    // ones, with a tick box for each other dual grid tile
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

    // TILE_BEHAVIOURS' tabs and then Dual grid, split into pages of TILE_EDITOR_ROWS
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

    // the picked texture as a p5 image, either one that was just chosen or the tile's own. null if
    // there isn't one or the tile's file didn't load
    const picture = () => {
      const file = texturePicker.value;
      if (!file) return null;
      if (chosen?.file.name === file) return chosen.img;
      return ownImg;
    };
    // the settings as they are now, in the same shape as tiles.json (tiles.js)
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
    // what the map is showing (the settings as text so changes are easy to spot, and the picture), and
    // whether it's different from the original
    let shown = { settings: JSON.stringify(settingsNow()), img: picture() };
    let changed = false;
    // why it can't be saved (shown in the box, and Save gets greyed out), or null
    const problem = () => {
      // tile names follow the same rules as map names (cleanMapName() in mapfile.js), since maps
      // store them
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
            // no renaming (see the top of this file)
            ...(isNew ? [{ label: 'Name', field: nameField }] : []),
            { label: 'Kind', field: kindPicker },
            { label: 'Colour', field: colourField },
            { label: 'Texture', field: texturePicker },
          ],
        },
        ...tabs,
      ],
      minRows: TILE_EDITOR_ROWS,
      // the previews, with Choose picture under them
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
      // a tile that already exists updates live whenever the box would be able to save. a new one
      // isn't on the map yet
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
        // an old texture on a tile that switched kind now belongs in the other folder
        const moved = !isNew && !isChosen && texture && kindPicker.value !== original.dualGrid;

        // tiles.js. uses the picture directly, since it might not be in its folder yet
        setTile(settings, picture());

        // the palette reads TILE_TYPES every frame, so it's already up to date. a new tile gets picked
        // (editor.js)
        if (isNew) Editor.pick({ kind: 'tile', name });
        showMessage(moved
          ? `Saved ${name}. Move ${texture} into tiles/${this.folderName(TILE_TYPES[name])}/ too`
          : `Saved ${name}. Export tiles to keep it`);
      },
    });
  },

  // the name of the texture folder inside assets/squimble-quest/tiles/
  folderName(type) {
    return type.dualGrid ? 'dual-grid' : 'normal';
  },

  // lets you pick a picture (pickFile() in utils.js), then calls onLoad(File, p5 image)
  choosePicture(onLoad) {
    pickFile('image/png,image/*', (file) => {
      // a temporary url so p5 can load it
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

  // downloads tiles.json (tiles.js) and any picture that's in use and was chosen since the page loaded,
  // then says where they go (the download helpers are in utils.js)
  exportTiles() {
    downloadTextFile('tiles.json', tilesDataToText(tilesToData()));
    const pictures = [];
    for (const type of Object.values(TILE_TYPES)) {
      const file = this.newPictures[type.texture];
      // pictures used by more than one tile only download once
      if (!file || pictures.some((p) => p.name === type.texture)) continue;
      downloadData(type.texture, file);
      pictures.push({ name: type.texture, folder: this.folderName(type) });
    }
    const also = pictures.map((p) => `, ${p.name} in tiles/${p.folder}/`).join('');
    showMessage(`Exported! Put tiles.json in assets/squimble-quest/tiles/${also}`);
  },
};

// the column down the side: the texture file, a 2 x 2 patch like it'd look on the map, and anything
// stopping it saving.
//   look  () => { dualGrid, colour, img, problem }
class TilePreview extends UIElement {
  constructor(options) {
    // just for show, clicks go through to the form box
    super({ ...options, interactive: false });
    this.look = options.look;
    // the last tileset's pieces and the picture they came from, so it only cuts it again when the
    // picture changes
    this.pieces = null;
    this.piecesFrom = null;
  }

  draw() {
    const { dualGrid, colour, img, problem } = this.look();
    // black until the colour is finished (while you're halfway through typing it)
    const fillColour = HEX_COLOUR.test(colour) ? colour : '#000000';
    // two squares side by side, with room underneath for the problem. it's a multiple of 6 whole px,
    // so the patch's halves (normal) and thirds (dual grid) meet exactly with no faint lines
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

    // 1. the texture file, fitted in without stretching it, and tilesets get faint lines between the
    // pieces. with no texture it shows the colour
    label(img ? 'Texture file' : 'Colour', firstLeft);
    backing(firstLeft);
    if (img) {
      // scaled to fit, keeping its shape, and centred
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const imgLeft = firstLeft + (size - w) / 2;
      const imgTop = top + (size - h) / 2;
      image(img, imgLeft, imgTop, w, h);
      if (dualGrid) {
        // lines between the 4 x 4 pieces
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

    // 2. a 2 x 2 patch like it'd look on the map. dual grid rounds off at the edges
    label('On the map', secondLeft);
    backing(secondLeft);
    const pieces = dualGrid && img ? this.piecesOf(img) : null;
    if (pieces) {
      const piece = size / 3;
      DUAL_PREVIEW_PATCH.forEach((row, r) => row.forEach((which, c) => {
        image(pieces[which], secondLeft + c * piece, top + r * piece, piece, piece);
      }));
    } else {
      // normal, or dual grid without a tileset that works: four squares
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

    // 3. whatever's stopping it saving, in red and wrapped
    if (problem) {
      noStroke();
      fill(EDITOR_COLOURS.erase);
      setText(11, BOLD, LEFT, TOP);
      text(problem, this.x, top + size + 10, this.w, this.y + this.h - (top + size + 10));
    }
  }

  // the tileset's pieces (dualgrid.js), or null if it can't be a tileset
  piecesOf(img) {
    if (img !== this.piecesFrom) {
      this.piecesFrom = img;
      this.pieces = dualTilesetProblem(img) ? null : cutDualTileset(img, 'the tile editor picture');
    }
    return this.pieces;
  }
}
