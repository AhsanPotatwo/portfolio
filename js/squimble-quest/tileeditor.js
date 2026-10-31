// the tile editor: for making and changing tiles inside the map editor (editor.js), so you never
// have to edit the tile files (tiles.js) by hand.
//   - New (in the inspector on the Tiles tab) opens a box for a new tile. right clicking a tile in
//     the palette (or Edit) opens it for one that already exists
//   - the tabs are Look, then TILE_BEHAVIOURS' tabs (Behaviours, Effects, Sounds, Footsteps, Liquid), then Dual grid
//     (blendsWith). settings with lots of choices (particles, which tiles blend onto it) are one row
//     each with a list that drops down (MultiPicker in formbox.js), so the tabs never spill over
//   - the Look tab has its name, kind, colour and texture, and for normal tiles more pictures:
//     Variants (each tile on the map shows one of them or the texture, picked by where it is) and
//     Frames (it goes through them, every Frame time ms, so it moves). the + adds a picture, clicking
//     one takes it off. tiles.js draws them (tileImageAt())
//   - a column down the side shows the texture file and a little patch of the tile like on the map
//   - a tile that already exists changes on the map while you edit it (drag the box out of the way to
//     see). Save keeps the changes, and Cancel, Escape or the x puts it back how it was
//   - Save changes the game straight away (you can paint with it and walk on it)
//   - Export (next to New) downloads the file of every new or changed tile for
//     assets/squimble-quest/tiles/ (DataFiles.export() in datafiles.js), plus any pictures
//     chosen since the page loaded. the message says which folder they go in
//   - changing the name renames it when it's saved, and Delete tile (down the side) asks for a tile to
//     put in its place. maps keep working either way: the tile remembers the old name (oldNames in
//     tiles.js), so map files that still say it get it. Export tiles then says which old file to delete

// every setting apart from the look ones (TILE_DEFAULTS in tiles.js), each as a row in the editor on
// its tab. the tabs come after Look in the order they're first mentioned, and a tab name that's new
// makes a new tab ("adding a new tile setting" at the top of tiles.js).
//   key    its name in TILE_DEFAULTS and the tile files
//   tab    which tab it goes on
//   label  the words before the field
//   after  optional words after it
//   field  (value) => a NumberField, Checkbox, Picker or MultiPicker. number fields have a max so a typo can't do
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
  // the particle effects it keeps making, ticked in a list that drops down (particleeditor.js)
  { tab: 'Effects', key: 'particles', label: 'Particles', field: (value) => particleMultiPicker(value), tip: 'Particle effects every tile of this kind keeps making (on screen)' },
  { tab: 'Effects', key: 'particleRate', label: 'How often', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 1000 }), tip: "Faster or slower than each effect's own Keep going rate. 0 stops them" },

  // the sounds it keeps making, ticked in a list that drops down (soundblocks.js)
  { tab: 'Sounds', key: 'sounds', label: 'Sounds', field: (value) => soundMultiPicker(value), tip: 'Loops every tile of this kind keeps playing, heard from the closest ones' },
  { tab: 'Sounds', key: 'soundVolume', label: 'Volume', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 400 }) },
  { tab: 'Sounds', key: 'soundRange', label: 'Heard from', after: 'tiles', field: (value) => new NumberField({ w: 90, value, max: 50 }), tip: "How far away they're heard. 0 uses each sound's own Heard from" },
  // at least 1, or it would never play
  { tab: 'Sounds', key: 'soundSpots', label: 'At most', after: 'tiles at once', field: (value) => new NumberField({ w: 90, value, min: 1, max: 8 }), tip: 'Each sound only plays from this many of the closest tiles, however many there are. More is fuller in a big patch' },
  { tab: 'Sounds', key: 'soundPitchVariety', label: 'Pitch varies', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 50 }), tip: "Each of those tiles plays up to this much higher or lower, so they don't sound like copies" },

  // what walking on it sounds like (Character.footstep() in character.js)
  { tab: 'Footsteps', key: 'stepSounds', label: 'Steps', field: (value) => soundMultiPicker(value), tip: 'Each step plays one of these at random, never the same twice in a row. Tick a few takes for variety' },
  { tab: 'Footsteps', key: 'stepVolume', label: 'Volume', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 400 }) },
  // at least 10%, since 0 would never finish playing
  { tab: 'Footsteps', key: 'stepPitch', label: 'Pitch', after: '% of normal', scale: 100, field: (value) => new NumberField({ w: 90, value, min: 10, max: 400 }), tip: 'Higher and shorter over 100, lower and longer under. Lets one step sound do for a few materials' },
  { tab: 'Footsteps', key: 'stepPitchVariety', label: 'Pitch varies', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 50 }), tip: 'Each step plays up to this much higher or lower, so they never sound exactly the same' },
  { tab: 'Footsteps', key: 'stepRange', label: 'Heard from', after: 'tiles', field: (value) => new NumberField({ w: 90, value, max: 50 }), tip: "How far away enemies' and npcs' steps are heard. 0 uses each sound's own Heard from" },

  // what wading in it looks like (drawInLiquid() in character.js). sink at most 90%, or the head goes under too
  { tab: 'Liquid', key: 'sink', label: 'Sink in', after: '% of height', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 90 }), tip: 'Over 0 makes it a liquid: whoever walks in sinks this far. 40 is about the waist' },
  { tab: 'Liquid', key: 'clarity', label: 'See through', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 100 }), tip: 'How much of the part under shows, wobbling. 0 hides it (lava, mud)' },
  { tab: 'Liquid', key: 'surfaceColour', label: 'Surface', field: (value) => new ColourField({ w: 180, value }), tip: 'The ring round whoever is in it, where they meet the surface, and their wake' },
  { tab: 'Liquid', key: 'glow', label: 'Glow', field: (value) => new Checkbox({ w: 180, value, label: 'lights up whoever is in it' }), tip: 'For lava: the ring glows, and so does whoever is in it from the surface up' },
  { tab: 'Liquid', key: 'wake', label: 'Wake', after: '%', scale: 100, field: (value) => new NumberField({ w: 90, value, max: 200 }), tip: 'How strong the V behind whoever wades through it is, in the surface colour. Lower for thick liquids like lava, 0 for none' },
  { tab: 'Liquid', key: 'splashParticles', label: 'Splash', field: (value) => particleMultiPicker(value), tip: 'Particle effects when someone steps in' },
  { tab: 'Liquid', key: 'rippleParticles', label: 'Ripples', field: (value) => particleMultiPicker(value), tip: "Particle effects round whoever's standing in it every so often. They start on the surface" },
  { tab: 'Liquid', key: 'splashSounds', label: 'Splash sound', field: (value) => soundMultiPicker(value), tip: 'One of these plays when someone steps in. Wading is Footsteps' },
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

    // the fields are kept in variables instead of reading them from onConfirm's values. typing a new
    // name for a tile that exists renames it when it's saved
    const nameField = new TextField({ w: 180, value: type?.name ?? '', maxLength: 32 });
    // false is normal and true is dual grid, same as dualGrid in a tile file
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
      label: (file) => file ?? 'none, just colour',
    });
    // more pictures, for normal tiles only (greyed out for dual grid), and how long each frame shows
    const variantList = new PictureListField({ w: 180, value: type?.variants ?? [] });
    const frameList = new PictureListField({ w: 180, value: type?.frames ?? [] });
    const frameTimeField = new NumberField({ w: 90, value: Math.round((type?.frameTime ?? TILE_DEFAULTS.frameTime) * 1000), min: 20, max: 10000 });
    // a row for each TILE_BEHAVIOURS entry, starting on the tile's value (or the default)
    const behaviourRows = TILE_BEHAVIOURS.map((b) => {
      const value = type?.[b.key] ?? TILE_DEFAULTS[b.key];
      return { ...b, field: b.field(b.scale ? Math.round(value * b.scale) : value) };
    });
    // blendsWith (tiles.js): either every dual grid tile (even ones made later) or only the ones
    // ticked in a list that drops down, which is greyed out while it's every one
    const blendPicker = new Picker({
      w: 180,
      choices: [true, false],
      value: !type?.blendsWith,
      label: (all) => (all ? 'every dual grid tile' : 'only the ticked ones'),
      onChange: (all) => { blendTiles.enabled = !all; },
    });
    const dualNames = Object.values(TILE_TYPES).filter((other) => other.dualGrid && other !== type).map((other) => other.name);
    const blendTiles = new MultiPicker({
      w: 180,
      choices: dualNames,
      value: type?.blendsWith ?? dualNames,
      enabled: !blendPicker.value,
      label: (name) => name,
      art: (name, x, y, size) => drawTypeArt(TILE_TYPES[name], x, y, size, size), // editor.js
    });
    const blendRows = [
      { label: 'Blends', field: blendPicker, tip: 'Which dual grid tiles (like grass) round off onto this one' },
      { label: 'Ticked', field: blendTiles, tip: 'Unticked ones stop in a straight line at its edge. Good for planks and walls' },
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
    // the settings as they are now, in the same shape as a tile file (tiles.js)
    // (an existing tile keeps its name until it's saved, then renameTile() renames it)
    const settingsNow = () => {
      const settings = {
        name: isNew ? cleanMapName(nameField.value) : type.name,
        colour: colourField.value.toLowerCase(),
        dualGrid: kindPicker.value,
        texture: texturePicker.value,
        variants: variantList.value.length > 0 ? [...variantList.value] : null,
        frames: frameList.value.length > 0 ? [...frameList.value] : null,
        frameTime: frameTimeField.value / 1000,
        oldNames: type?.oldNames ?? null,
      };
      for (const row of behaviourRows) settings[row.key] = row.scale ? row.field.value / row.scale : row.field.value;
      settings.blendsWith = blendPicker.value ? null : blendTiles.value;
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
      if (!name) return 'It needs a name';
      if (TILE_TYPES[name] && name !== type?.name) return `There's already a tile called ${name}`;
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
            { label: 'Name', field: nameField, tip: isNew ? 'Letters, numbers, - and _' : 'A new name renames it when you save. Maps keep working' },
            { label: 'Kind', field: kindPicker },
            { label: 'Colour', field: colourField },
            { label: 'Texture', field: texturePicker },
            { label: 'Variants', field: variantList, tip: 'More pictures. Each tile on the map shows the texture or one of these, so it looks less repeated' },
            { label: 'Frames', field: frameList, tip: 'Pictures it goes through after the texture, so it moves. A tile with frames ignores its variants' },
            { label: 'Frame time', field: frameTimeField, after: 'ms', tip: 'How long each frame shows' },
          ],
        },
        ...tabs,
      ],
      minRows: TILE_EDITOR_ROWS,
      // the previews, with Choose picture (and Delete tile for one that exists) under them
      side: (x, y, w, h) => [
        new TilePreview({
          x, y, w, h: h - (isNew ? 32 : 60),
          look: () => ({
            dualGrid: kindPicker.value, colour: colourField.value, img: picture(), problem: problem(),
            // the pictures the 2 x 2 patch shows: the frames as they go, or the variants mixed up
            pictures: [picture(), ...(frameList.value.length ? frameList : variantList).images()].filter(Boolean),
            animated: frameList.value.length > 0, frameTime: frameTimeField.value / 1000,
          }),
        }),
        new Button({
          x, y: y + h - (isNew ? 24 : 52), w, h: 24, label: 'Choose picture', style: 'editor',
          onClick: () => this.choosePicture((file, img) => {
            chosen = { file, img };
            texturePicker.setChoices([null, file.name], file.name);
          }),
        }),
        ...(isNew ? [] : [new Button({
          x, y: y + h - 24, w, h: 24, label: 'Delete tile', style: 'danger',
          onClick: () => {
            FormBox.close();
            this.askToDelete(type.name);
          },
        })]),
      ],
      canConfirm: () => problem() === null,
      // a tile that already exists updates live whenever the box would be able to save. a new one
      // isn't on the map yet
      onUpdate: () => {
        // variants and frames are only for normal tiles
        variantList.enabled = frameList.enabled = frameTimeField.enabled = !kindPicker.value;
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
        const { texture } = settings;
        const isChosen = chosen !== null && texture === chosen.file.name;
        if (isChosen) this.newPictures[texture] = chosen.file;
        // variant and frame pictures chosen in this box, so Export tiles downloads them
        for (const list of [variantList, frameList]) Object.assign(this.newPictures, list.chosenFiles());
        // an old texture on a tile that switched kind now belongs in the other folder
        const moved = !isNew && !isChosen && texture && kindPicker.value !== original.dualGrid;

        // tiles.js. uses the picture directly, since it might not be in its folder yet
        setTile(settings, picture());
        // a new name for a tile that exists renames it
        const name = cleanMapName(nameField.value);
        if (!isNew && name !== type.name) renameTile(type.name, name);

        // the palette reads TILE_TYPES every frame, so it's already up to date. a new tile gets picked
        // (editor.js)
        if (isNew) Editor.pick({ kind: 'tile', name });
        showMessage(moved
          ? `Saved ${name}. Move ${texture} into tiles/${this.folderName(TILE_TYPES[name])}/ too`
          : `Saved ${name}. Export tiles to keep it`);
      },
    });
  },

  // asks which tile goes where this one was, then deletes it (deleteTile()). it says which maps use it
  askToDelete(name) {
    const others = Object.keys(TILE_TYPES).filter((other) => other !== name);
    if (others.length === 0) return showMessage("That's the only tile, so it can't go");
    const users = mapsUsingTile(name);
    const picker = tilePicker(others[0]); // editor.js
    picker.setChoices([...others, null], others[0]);
    FormBox.open({
      title: `Delete tile: ${name}`,
      hint: users.length > 0 ? `Used on ${users.join(', ')}` : 'No map uses it',
      confirmLabel: 'Delete',
      rows: [{ label: 'Replace with', field: picker, tip: 'Maps that use it get this instead, now and whenever they load. Empty leaves holes' }],
      onConfirm: ([replacement]) => {
        deleteTile(name, replacement);
        showMessage(`Deleted ${name}. Export tiles to say which file to delete${users.length > 0 && !replacement ? ', and save the maps that used it' : ''}`);
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

  // downloads the file of every tile that's new or changed (datafiles.js), and any picture that's in
  // use and was chosen since the page loaded, then says where they go. each picture only downloads
  // once, so exporting again doesn't repeat it
  exportTiles() {
    const pictures = [];
    for (const type of Object.values(TILE_TYPES)) {
      // the texture, then the variants and frames, which are always normal tile pictures
      const files = [[type.texture, this.folderName(type)], ...[...(type.variants ?? []), ...(type.frames ?? [])].map((name) => [name, 'normal'])];
      for (const [name, folder] of files) {
        const file = this.newPictures[name];
        // pictures used by more than one tile only download once
        if (!file || pictures.some((p) => p.name === name)) continue;
        pictures.push({ name, data: file, folder: `tiles/${folder}/` });
        delete this.newPictures[name];
      }
    }
    DataFiles.export(['tile'], pictures);
  },
};

// the column down the side: the texture file, a 2 x 2 patch like it'd look on the map, and anything
// stopping it saving.
//   look  () => { dualGrid, colour, img, problem, pictures, animated, frameTime }. pictures is what the
//         patch shows for a normal tile: the frames as they go if it's animated, otherwise mixed up
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
    const { dualGrid, colour, img, problem, pictures, animated, frameTime } = this.look();
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
          // like tileImageAt() (tiles.js)
          const frame = animated ? Math.floor(millis() / 1000 / Math.max(0.02, frameTime)) : tileHash(i % 2, Math.floor(i / 2));
          image(pictures[frame % pictures.length] ?? img, x, y, half, half);
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

// a row of little pictures (a tile's variants or frames) with a + at the end. the + picks a picture
// (TileEditor.choosePicture()), clicking one takes it off. value is their file names in order.
// enabled false greys it out
class PictureListField extends UIElement {
  constructor(options) {
    super(options);
    this.value = [...options.value];
    // file name => p5 image, as they load (tilePicture() in tiles.js), and pictures chosen here
    this.loaded = {};
    this.chosen = {};
    for (const file of this.value) tilePicture(file, 'the tile editor').then((img) => { this.loaded[file] = img; });
    // the square the mouse is over: a number, 'add', or null
    this.under = null;
  }

  // the pictures in order (ones still loading or that failed are left out)
  images() {
    return this.value.map((file) => this.loaded[file]).filter(Boolean);
  }

  // the Files picked in this box that are still in the list, by name (for Export tiles)
  chosenFiles() {
    return Object.fromEntries(Object.entries(this.chosen).filter(([name]) => this.value.includes(name)));
  }

  // each square's { x, y, size }, the pictures then the +. as many pictures as fit, then a count
  squares() {
    const size = this.h - 6;
    const room = Math.floor((this.w - 4) / (size + 3)) - 1;
    return { size, room, at: (i) => ({ x: this.x + 3 + i * (size + 3), y: this.y + 3 }) };
  }

  update(hovered) {
    this.hovered = hovered && this.enabled;
    const { size, room } = this.squares();
    this.under = null;
    if (!this.hovered) return;
    const shown = Math.min(this.value.length, room);
    const i = Math.floor((Input.mouse.x - this.x - 3) / (size + 3));
    if (i >= 0 && i < shown) this.under = i;
    else if (i === shown) this.under = 'add';
    if (!Input.buttonsPressed.has('left') || this.under === null) return;
    if (this.under === 'add') {
      TileEditor.choosePicture((file, img) => {
        // the game finds it by name from now on (TILE_PICTURES in tiles.js)
        TILE_PICTURES[file.name] = Promise.resolve(img);
        this.loaded[file.name] = img;
        this.chosen[file.name] = file;
        this.value.push(file.name);
      });
      return;
    }
    this.value.splice(this.under, 1);
  }

  draw() {
    push();
    if (!this.enabled) drawingContext.globalAlpha *= BUTTON_STYLES.default.disabledAlpha;
    drawFieldBox(this, this.hovered); // formbox.js
    const { size, room, at } = this.squares();
    const shown = Math.min(this.value.length, room);
    for (let i = 0; i < shown; i++) {
      const { x, y } = at(i);
      const img = this.loaded[this.value[i]];
      if (img) image(img, x, y, size, size);
      noFill();
      stroke(this.under === i ? EDITOR_COLOURS.erase : EDITOR_COLOURS.edge);
      strokeWeight(1);
      rect(x, y, size, size);
      // a cross while the mouse is on it, since clicking takes it off
      if (this.under === i) {
        line(x + 3, y + 3, x + size - 3, y + size - 3);
        line(x + size - 3, y + 3, x + 3, y + size - 3);
      }
    }
    const add = at(shown);
    noStroke();
    fill(this.under === 'add' ? 255 : EDITOR_COLOURS.dimText);
    setText(14, BOLD, CENTER, CENTER);
    text('+', add.x + size / 2, add.y + size / 2);
    if (this.value.length > shown) {
      setText(11, BOLD, LEFT, CENTER);
      text(`+${this.value.length - shown}`, add.x + size + 4, add.y + size / 2);
    }
    if (this.value.length === 0) {
      fill(EDITOR_COLOURS.dimText);
      setText(11, BOLD, LEFT, CENTER);
      text('none', add.x + size + 6, add.y + size / 2);
    }
    pop();
  }
}

// renames a tile and keeps maps working: maps that have been built swap the name, the tile remembers
// its old one (oldNames in tiles.js) for maps still to be built and map files that still say it, other
// tiles' blendsWith follow, and so does the editor. Export tiles then downloads it under the new name
// and says to delete the old file
function renameTile(oldName, newName) {
  const type = TILE_TYPES[oldName];
  type.name = newName;
  type.oldNames = [...new Set([...(type.oldNames ?? []), oldName])].filter((name) => name !== newName);
  delete TILE_TYPES[oldName];
  TILE_TYPES[newName] = type;
  sortTiles();
  swapTileInMaps(oldName, newName);
  for (const other of Object.values(TILE_TYPES)) {
    if (other.blendsWith?.includes(oldName)) other.blendsWith = other.blendsWith.map((name) => (name === oldName ? newName : name));
  }
  Editor.renamed('tile', oldName, newName); // editor.js
}

// deletes a tile. maps that use it get `replacement` instead (a tile's name, or null for empty), which
// remembers the deleted name (oldNames) so map files that still say it get the replacement too
function deleteTile(name, replacement) {
  const type = TILE_TYPES[name];
  delete TILE_TYPES[name];
  if (replacement) {
    const into = TILE_TYPES[replacement];
    into.oldNames = [...new Set([...(into.oldNames ?? []), name, ...(type.oldNames ?? [])])];
  }
  swapTileInMaps(name, replacement ?? null);
  for (const other of Object.values(TILE_TYPES)) {
    if (other.blendsWith?.includes(name)) other.blendsWith = other.blendsWith.filter((other2) => other2 !== name);
  }
  Editor.renamed('tile', name, replacement); // editor.js
}

// puts TILE_TYPES back in layer order, since the palette goes by its order (a renamed tile would
// otherwise jump to the end)
function sortTiles() {
  const types = Object.values(TILE_TYPES).sort((a, b) => a.layer - b.layer);
  for (const type of types) delete TILE_TYPES[type.name];
  for (const type of types) TILE_TYPES[type.name] = type;
}

// every map that's been built uses `to` (a tile name or null) where it used `from` (maps.js). the
// editor's undo and copy and paste swap old names when they're used (resolveTileName())
function swapTileInMaps(from, to) {
  for (const map of Object.values(VISITED_MAPS)) map.tiles = map.tiles.map((name) => (name === from ? to : name));
}

// the names of the maps that use a tile. it builds every map to look (maps.js)
function mapsUsingTile(name) {
  return Object.keys(MAPS).filter((mapName) => getMap(mapName).tiles.includes(name));
}
