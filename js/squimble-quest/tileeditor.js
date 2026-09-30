// the tile editor: making and changing tiles from inside the map editor (editor.js), so tiles.json
// (tiles.js) never has to be opened by hand.
//   - + New tile, on the right of the editor's tabs, opens a box for a new tile
//   - right clicking a tile in the bar opens the same box for that tile, with all its settings
//   - the box has tabs: Look for how it looks, then the tabs from TILE_BEHAVIOURS below for what it
//     does (Behaviours, Effects...)
//   - the box shows the tile's texture file, and a patch of the tile as it'd look on the map, which
//     change as you change the settings
//   - Save changes the tile in the game straight away, so you can paint with it and walk on it
//   - Export tiles downloads tiles.json with every tile in it. put it in assets/squimble-quest/tiles/,
//     replacing the old one, and the tiles are in the game for good. a picture chosen since the page
//     loaded is downloaded too, and the message says which folder it goes in
//
// a tile can't be renamed or deleted here: maps store tile names, so either would lose it from every
// map that uses it. tiles.json can still be changed by hand for that

// every setting a tile has besides how it looks (TILE_DEFAULTS in tiles.js), each a row in the tile
// editor's box, on its tab. the tabs come after Look, in the order they're first mentioned here, so a
// new tab name makes a new tab. see "adding a new kind of tile setting" at the top of tiles.js.
//   key    its name in TILE_DEFAULTS and tiles.json
//   tab    which tab it's on
//   label  the words before its box
//   after  the words after its box (can be left out)
//   field  makes its box, starting on value: (value) => a NumberField, Checkbox or Picker. number
//          boxes have a max, so a typo can't make something silly
//   scale  what the setting's multiplied by to show in its box, e.g. 100 shows a speed of 0.8 as 80
//          (%), since NumberField only does whole numbers (can be left out)
const TILE_BEHAVIOURS = [
  { tab: 'Behaviours', key: 'solid', label: 'Solid', field: (value) => new Checkbox({ w: 180, value, label: "can't walk on it" }) },
  // at least 1%, because 0 would leave anyone who stepped on it stuck there. 500 is five times as fast
  { tab: 'Behaviours', key: 'speed', label: 'Speed', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, min: 1, max: 500 }) },
  { tab: 'Behaviours', key: 'damagePerSecond', label: 'Damage', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  { tab: 'Behaviours', key: 'damagePerStep', label: 'Damage', after: 'per step', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },

  { tab: 'Effects', key: 'healPerSecond', label: 'Heal', after: 'a second', field: (value) => new NumberField({ w: 90, value, max: 9999 }) },
  // 95% at most: at 100 anyone stood still on it could never get moving
  { tab: 'Effects', key: 'slippery', label: 'Slippery', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 95 }) },
  {
    tab: 'Effects', key: 'pushDirection', label: 'Push',
    field: (value) => new Picker({ w: 180, choices: [null, ...Object.keys(PUSH_DIRECTIONS)], value, label: (way) => way ?? 'nowhere' }),
  },
  { tab: 'Effects', key: 'pushSpeed', label: 'Push by', after: 'tiles a second', field: (value) => new NumberField({ w: 90, value, max: 20 }) },
];

// the most rows a tab of the tile editor has. a tab with more carries on in another tab ("Effects 2").
// the box is always this tall, which leaves room for the pictures beside the rows
const TILE_EDITOR_ROWS = 7;

// a 2 x 2 patch of a dual grid tile is 3 x 3 pieces, each saying which of the four tiles around it
// are the tile (like DUAL_TILESET_LAYOUT in dualgrid.js). the box's "on the map" picture draws these
const DUAL_PREVIEW_PATCH = [
  [0b0001, 0b0011, 0b0010],
  [0b0101, 0b1111, 0b1010],
  [0b0100, 0b1100, 0b1000],
];

const TileEditor = {
  // pictures chosen from the computer since the page loaded, by file name. each is a File (the
  // browser's name for a chosen file). the game can only load textures from its own folders, so
  // Export tiles downloads these too, ready to go in their folder
  newPictures: {},

  // opens the box for a tile (from TILE_TYPES), or for a new tile with null
  open(type) {
    const isNew = type === null;
    // the picture chosen in this box, { file, img } (img is a p5 image), or null. it's only kept if
    // the box is saved
    let chosen = null;

    // the fields for each row of the box. they're kept in variables rather than read from the values
    // FormBox hands to onConfirm, because the Name row is only there for new tiles, which moves every
    // other row along one
    const nameField = new TextField({ w: 180, value: '' });
    // false is normal and true is dual grid, the same as dualGrid in tiles.json
    const kindPicker = new Picker({
      w: 180,
      choices: [false, true],
      value: type?.dualGrid ?? false,
      label: (dual) => (dual ? 'dual grid' : 'normal'),
    });
    // a new tile starts grey. its square opens the colour picker, and hex or rgb can be pasted in
    const colourField = new ColourField({ w: 180, value: type?.colour ?? '#8a8f99' });
    // none, or the texture's file name. Choose picture (beside the rows) swaps in a new one
    const texturePicker = new Picker({
      w: 180,
      choices: type?.texture ? [null, type.texture] : [null],
      value: type?.texture ?? null,
      // long file names are cut short to fit in the box
      label: (file) => (!file ? 'none, just colour' : file.length > 18 ? `${file.slice(0, 17)}…` : file),
    });
    // a row for each of TILE_BEHAVIOURS, starting on the tile's setting (or the normal one, for a new tile)
    const behaviourRows = TILE_BEHAVIOURS.map((b) => {
      const value = type?.[b.key] ?? TILE_DEFAULTS[b.key];
      return { ...b, field: b.field(b.scale ? Math.round(value * b.scale) : value) };
    });
    // the tabs: Look, then each tab named in TILE_BEHAVIOURS, cut into TILE_EDITOR_ROWS sized pieces
    const tabs = [];
    for (const name of new Set(TILE_BEHAVIOURS.map((b) => b.tab))) {
      const rows = behaviourRows.filter((row) => row.tab === name);
      for (let i = 0; i < rows.length; i += TILE_EDITOR_ROWS) {
        const page = i / TILE_EDITOR_ROWS;
        tabs.push({ label: page ? `${name} ${page + 1}` : name, rows: rows.slice(i, i + TILE_EDITOR_ROWS) });
      }
    }

    // the texture picked right now as a picture: the one just chosen, or the tile's own. null for
    // none, or if the tile's own file couldn't be loaded
    const picture = () => {
      const file = texturePicker.value;
      if (!file) return null;
      if (chosen?.file.name === file) return chosen.img;
      return type?.textureImg ?? null;
    };
    // what's stopping it being saved, as words to show, or null if nothing is. Save is greyed out
    // while there's something
    const problem = () => {
      // tile names follow the same rules as map names (cleanMapName() in mapfile.js): lowercase,
      // - for spaces, and nothing a file name can't have, since maps store them
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
      hint: 'Save to try it out, Export tiles to keep it',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Look',
          rows: [
            // a tile can't be renamed, see the top of this file
            ...(isNew ? [{ label: 'Name', field: nameField }] : []),
            { label: 'Kind', field: kindPicker },
            { label: 'Colour', field: colourField },
            { label: 'Texture', field: texturePicker },
          ],
        },
        ...tabs,
      ],
      minRows: TILE_EDITOR_ROWS,
      // the pictures, and the button for choosing one from the computer under them
      side: (x, y, w, h) => [
        new TilePreview({
          x, y, w, h: h - 40,
          look: () => ({ dualGrid: kindPicker.value, colour: colourField.value, img: picture(), problem: problem() }),
        }),
        new Button({
          x, y: y + h - 32, w, h: 32, label: 'Choose picture', style: { textSize: 14 },
          onClick: () => this.choosePicture((file, img) => {
            chosen = { file, img };
            texturePicker.setChoices([null, file.name], file.name);
          }),
        }),
      ],
      canConfirm: () => problem() === null,
      onConfirm: () => {
        const name = isNew ? cleanMapName(nameField.value) : type.name;
        const texture = texturePicker.value;
        const isChosen = chosen !== null && texture === chosen.file.name;
        if (isChosen) this.newPictures[texture] = chosen.file;
        // an old texture whose tile changed kind now belongs in the other folder
        const moved = !isNew && !isChosen && texture && kindPicker.value !== type.dualGrid;

        // tiles.js. the picture's used straight away, rather than loaded from its folder, where it
        // might not be yet
        const settings = { name, colour: colourField.value.toLowerCase(), dualGrid: kindPicker.value, texture };
        for (const row of behaviourRows) settings[row.key] = row.scale ? row.field.value / row.scale : row.field.value;
        setTile(settings, picture());

        // a changed tile's square in the bar draws itself from the tile every frame, so it's already
        // up to date. only a new tile needs a square making
        if (isNew) {
          // a square for it in the bar, picked and ready to paint with (editor.js)
          Editor.makeSwatches();
          Editor.selected = { kind: 'tile', name };
        }
        showMessage(moved
          ? `Saved ${name}. Move ${texture} into tiles/${this.folderName(TILE_TYPES[name])}/ too`
          : `Saved ${name}. Export tiles to keep it`);
      },
    });
  },

  // which folder a tile's texture goes in, as its name inside assets/squimble-quest/tiles/
  folderName(type) {
    return type.dualGrid ? 'dual-grid' : 'normal';
  },

  // asks for a picture from the computer (like Open file does for maps, mapfile.js), then gives it to
  // onLoad as (file, img): the File, and a p5 image of it
  choosePicture(onLoad) {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/png,image/*';
    picker.addEventListener('change', () => {
      const file = picker.files[0];
      if (!file) return;
      // a temporary address for the file, so p5 can load it like any other picture
      const url = URL.createObjectURL(file);
      loadImage(url, (img) => {
        URL.revokeObjectURL(url);
        onLoad(file, img);
      }, () => {
        URL.revokeObjectURL(url);
        showMessage(`Couldn't open ${file.name} as a picture`);
      });
    });
    picker.click();
  },

  // downloads tiles.json with every tile in it (tiles.js), and any picture a tile uses that was
  // chosen since the page loaded, then says where they go
  exportTiles() {
    downloadTextFile('tiles.json', tilesDataToText(tilesToData())); // mapfile.js
    const pictures = [];
    for (const type of Object.values(TILE_TYPES)) {
      const file = this.newPictures[type.texture];
      // two tiles can share a picture, it's only downloaded once
      if (!file || pictures.some((p) => p.name === type.texture)) continue;
      downloadData(type.texture, file);
      pictures.push({ name: type.texture, folder: this.folderName(type) });
    }
    const also = pictures.map((p) => `, ${p.name} in tiles/${p.folder}/`).join('');
    showMessage(`Exported! Put tiles.json in assets/squimble-quest/tiles/${also}`);
  },
};

// the tile editor's pictures, in the column beside its rows: the texture file as it is, a 2 x 2 patch
// of the tile as it'd look on the map, and what's stopping it being saved, if anything.
//   look  gives what to show: () => { dualGrid, colour, img, problem }
class TilePreview extends UIElement {
  constructor(options) {
    // just for show, clicks go to the form box behind it
    super({ ...options, interactive: false });
    this.look = options.look;
    // the pieces of the last tileset shown, and the picture they're from, so it's only cut up again
    // when the picture changes rather than every frame
    this.pieces = null;
    this.piecesFrom = null;
  }

  draw() {
    const { dualGrid, colour, img, problem } = this.look();
    // black until the colour's a whole colour, e.g. while it's being typed
    const fillColour = HEX_COLOUR.test(colour) ? colour : '#000000';
    // the two pictures are squares, leaving room under them for the problem. a multiple of 6 whole
    // pixels, so the patch's halves (normal) and thirds (dual grid) meet exactly, without faint lines
    const size = Math.floor(Math.min(this.w, (this.h - 130) / 2) / 6) * 6;
    const left = Math.round(this.x + (this.w - size) / 2);

    const label = (words, y) => {
      noStroke();
      fill(255, 255, 255, 150);
      setText(12, BOLD, CENTER, CENTER);
      text(words, this.x + this.w / 2, y);
    };
    // a dark square for a picture to go on
    const backing = (y) => {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(left, y, size, size);
    };

    // 1. the texture file, as big as fits without stretching it. a tileset gets faint lines between
    // its pieces. no texture shows the colour
    let y = this.y;
    label(img ? 'Texture file' : 'Colour', y + 6);
    y += 16;
    backing(y);
    if (img) {
      // shrunk (or grown) to fit the square, keeping its shape, and centred in it
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const imgLeft = left + (size - w) / 2;
      const imgTop = y + (size - h) / 2;
      image(img, imgLeft, imgTop, w, h);
      if (dualGrid) {
        // 3 lines each way split it into its 4 x 4 pieces
        stroke(255, 255, 255, 50);
        strokeWeight(1);
        for (let i = 1; i < 4; i++) {
          line(imgLeft + (w * i) / 4, imgTop, imgLeft + (w * i) / 4, imgTop + h);
          line(imgLeft, imgTop + (h * i) / 4, imgLeft + w, imgTop + (h * i) / 4);
        }
      }
    } else {
      fill(fillColour);
      rect(left, y, size, size);
    }

    // 2. a 2 x 2 patch of it on the map. a dual grid tile rounds off at the edges like on the map
    y += size + 14;
    label('On the map', y + 6);
    y += 16;
    backing(y);
    const pieces = dualGrid && img ? this.piecesOf(img) : null;
    if (pieces) {
      const piece = size / 3;
      DUAL_PREVIEW_PATCH.forEach((row, r) => row.forEach((which, c) => {
        image(pieces[which], left + c * piece, y + r * piece, piece, piece);
      }));
    } else {
      // normal tiles, or a dual grid tile without a tileset that works: four squares like the map
      const half = size / 2;
      for (let i = 0; i < 4; i++) {
        const x = left + (i % 2) * half;
        const top = y + Math.floor(i / 2) * half;
        if (img && !dualGrid) {
          image(img, x, top, half, half);
        } else {
          noStroke();
          fill(fillColour);
          rect(x, top, half, half);
        }
      }
    }

    // 3. what's stopping it being saved, in red, wrapped to fit the column
    if (problem) {
      noStroke();
      fill('#ff6b6b');
      setText(12, BOLD, LEFT, TOP);
      text(problem, this.x, y + size + 10, this.w, this.y + this.h - (y + size + 10));
    }
  }

  // the tileset cut into pieces (dualgrid.js), or null if it can't be one
  piecesOf(img) {
    if (img !== this.piecesFrom) {
      this.piecesFrom = img;
      this.pieces = dualTilesetProblem(img) ? null : cutDualTileset(img, 'the tile editor picture');
    }
    return this.pieces;
  }
}
