// the tile catalogue: every kind of tile in the game, and what it does.
// a map (tilemap.js) only stores tile names like 'grass', and looks up everything else here.
//
// ============================== how to make a tile ==============================
//
// add a defineTile() at the bottom of this file:
//
//   defineTile('grass', { colour: '#6fae4f' });
//
// you only give the settings that are different from TILE_DEFAULTS. the settings:
//
//   colour   placeholder colour, used when there's no image
//   image    a picture for the tile, e.g. image: 'assets/squimble-quest/tiles/grass.png'.
//            it's stretched to TILE x TILE (32 x 32), so 16 x 16 pixel art drawn at double size
//            works fine. images load before the game starts. if one can't be found, the tile
//            uses its colour instead and there's a warning in the browser console
//   solid    true stops anything walking onto it (walls, deep water)
//   speed    how fast you walk on it compared to normal. 1 is normal, 0.5 is half speed
//   onEnter  runs once every time something steps onto one of these tiles:
//              onEnter: (entity) => entity.hurt(10)
//   onStand  runs every frame something is standing on it:
//              onStand: (entity, dt) => entity.hurt(20 * dt)
//            dt is seconds since the last frame, so "20 * dt" means 20 damage per second
//
// entity is whoever stepped on the tile. only the player for now, but enemies could later.
// behaviours can do anything the player can do: hurt(), change speed, teleport...
//
// to use a new tile, put its name on a map (see maps.js)
//
// =================================================================================

// what every tile starts with before its own settings are added
const TILE_DEFAULTS = {
  // bright pink, so a tile that forgot its colour is easy to spot
  colour: '#ff00ff',
  image: null,
  solid: false,
  speed: 1,
  onEnter: null,
  onStand: null,
};

// every tile, by name. filled in by defineTile() below
const TILE_TYPES = {};

function defineTile(name, settings) {
  TILE_TYPES[name] = { ...TILE_DEFAULTS, ...settings, name };
}

// run from preload() in sketch.js, before the game starts, for tiles and objects (objects.js):
//   prepareArt(TILE_TYPES, 'tile')
// loads their images, and turns colours into p5 colours once now rather than every time
// something's drawn (thousands of times a second). kind is only used in the warning
function prepareArt(types, kind) {
  for (const type of Object.values(types)) {
    type.fill = color(type.colour);
    type.img = null;
    if (type.image) {
      type.img = loadImage(type.image, undefined, () => {
        console.warn(`Couldn't load "${type.image}" for the ${type.name} ${kind}, using its colour instead`);
        type.img = null;
      });
    }
    // npcs can have a portrait for the text box too (npcs.js)
    type.portraitImg = null;
    if (type.portrait) {
      type.portraitImg = loadImage(type.portrait, undefined, () => {
        console.warn(`Couldn't load "${type.portrait}" for the ${type.name} ${kind}'s portrait, using a placeholder instead`);
        type.portraitImg = null;
      });
    }
  }
}

// ---------- the tiles ----------
// placeholder colours until there's art

// ground you can walk on
defineTile('blank',  { colour: '#ffffff' }); // the default map's plain floor
defineTile('grass',  { colour: '#6fae4f' });
defineTile('dirt',   { colour: '#a47148' });
defineTile('planks', { colour: '#b98a55' });
defineTile('sand',   { colour: '#e6d28e', speed: 0.8 });

// can't walk through
defineTile('wall',   { colour: '#5f6470', solid: true });
defineTile('water',  { colour: '#3b7dd8', solid: true });

// hurts you. lava hurts the whole time you stand in it, spikes hurt once per tile you step on
defineTile('lava', {
  colour: '#e4572e',
  speed: 0.7,
  onStand: (entity, dt) => entity.hurt(25 * dt),
});
defineTile('spikes', {
  colour: '#9d8bb0',
  onEnter: (entity) => entity.hurt(15),
});
