// squimble quest, a top down rpg of quests and combat across worlds with their own themes: forests,
// underwater, volcanoes and fire, deserts, wastelands, snow, caves, space and alien planets. each map
// gets its feel from an atmosphere (atmosphere.js). if you're new to the code, read README.md in this
// folder first.
//
// this file is the game loop. squimble-quest.html loads all the other files before it, in this order:
//   config.js     settings: sizes, speeds, controls, button styles
//   utils.js      helpers: maths, text, catalogues, loading/downloading files
//   art.js        pictures for everything: the picture format, sheets of frames, drawing them
//   datafiles.js  the data folders: a file per tile, sound, item, enemy... and loading/exporting them
//   input.js      keyboard and mouse
//   camera.js     what's on screen, and turning world positions into screen ones and back
//   tiles.js      tile kinds and what they do, from tiles/
//   dualgrid.js   dual grid tiles: ground that blends into its neighbours
//   objects.js    object kinds (furniture, decorations...)
//   pathfinding.js enemy routes round walls and harm, and dev mode's view of them
//   enemies.js    enemy kinds and their ai (after pathfinding.js)
//   npcs.js       npc kinds and what they say
//   weapons.js    weapons, their swings and arrows
//   particles.js  particle effects: bits that fly up, fall and fade (blood when something's hit)
//   items.js      item kinds and their weapons, from items/
//   tilemap.js    a tile map: storing, drawing, resizing, collision
//   maps.js       start map, visited maps
//   mapfile.js    saving and loading map files
//   world.js      draws the world (map + dev mode lines)
//   character.js  shared by player/enemies/npcs: walking, health, attacking, drawing
//   player.js     the player (after character.js)
//   enemy.js      an enemy (after character.js)
//   npc.js        an npc (after character.js)
//   looks.js      what characters look like: parts (body, eyes, shirt...) from parts/, stacked and recoloured
//   ui.js         UIElement and the UI manager, and windows you can drag around
//   button.js     buttons (after ui.js)
//   textfield.js  text and number boxes (after ui.js)
//   formbox.js    the editors' ask-for-things box, Picker and Checkbox
//   hud.js        non-ui overlays (crosshair, messages, panels)
//   inventory.js  inventories, hotbar, inventory screen and equipment, character previews, items on the ground (after button.js)
//   itemglow.js   the rarity glow and sparkles drawn around items
//   dialogue.js   talking to npcs: who's in range, the text box
//   warps.js      warps (doors, caves, teleporters...): using them, checking targets
//   warpgraph.js  editor's diagram of linked warps (after button.js)
//   sound.js      the sound library and synthesiser: working sounds out, playing them, drawing them
//   soundblocks.js sound blocks: tiles that play a sound, and their settings box (after sound.js)
//   interact.js   everything you press E on (npcs, warps, chests, sound blocks) and which wins
//   editor.js     the map editor, from dev mode (after button.js, textfield.js)
//   edittools.js  the editor's tools (fill, rectangle, select...) and copy and paste (after editor.js)
//   edithistory.js the editor's undo and redo, and keeping unsaved maps in the browser
//   editormenu.js the editor's menu bar, tool strip and keys (after edittools.js)
//   mapcheck.js   the editor's problem list and art report
//   tileeditor.js editor's tile box (after editor.js)
//   particleeditor.js the particle editor box and its preview (after tileeditor.js)
//   atmosphere.js a map's fog, colour, weather and background sound, and its editor box (after particleeditor.js)
//   weaponeditor.js the weapon editor tabs, enemy weapons in the palette, and the combo preview (after editor.js)
//   storageeditor.js the box for what starts in a chest, opened by right clicking one in the editor
//   soundeditor.js the sound editor, a full screen synthesiser (after editor.js)
//   shaders.js    WebGL effects over the world (lighting, shadows, screen effects), dev mode only for now
//   colourblind.js colour blind filters over the whole canvas, picked in the pause menu
//   access.js     accessibility settings that draw: sound captions (after sound.js)
//   pausemenu.js  the pause menu: sound, screen, accessibility and assist settings, and keys (after formbox.js)
//   deathscreen.js the placeholder death screen: "You died" and Respawn (after button.js)
//   debug.js      dev mode (` or Ctrl + D)
//
// every spot that'd get in the way of multiplayer is marked with a "multiplayer:" comment, so search
// for that to find them all (README.md, "Multiplayer, maybe")

// multiplayer: one player and one running map. these globals are this computer's player and the map
// it's on, and lots of files read them directly (worldMap in weapons.js, player.js, warps.js...). with
// players on different maps, each occupied map would be a "room" holding its own enemies, npcs, arrows
// and players, and these would just point at this computer's player and its room
let player;
// not called "camera" because p5 already has camera() for 3D
let gameCamera;
// the map the player is on
let worldMap;
// the enemies and npcs that are alive on it right now (see spawnCharacters())
let enemies = [];
let npcs = [];
// arrows in the air on it (Arrow in weapons.js), from anyone. they're forgotten on changing map, and
// whenever the characters are made again (spawnCharacters())
let arrows = [];
// false until the tiles and maps have loaded, and a loading screen shows until then
let mapsReady = false;

// p5 waits for anything loaded in here before it runs setup(), so pictures for buttons go here too.
// the data files (tiles, items, enemies...) load in setup() instead, along with the maps
function preload() {
  // the rarity glow pictures and colours (itemglow.js), the player's pictures (PLAYER in config.js)
  // and the ui's (UI_ART, BUTTON_STYLES), so they're there from the first frame (art.js)
  prepareArt(RARITIES, 'rarity');
  prepareArt({ player: PLAYER }, 'player');
  loadUiArt();
}

function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // draws at the resolution it's shown at, now and whenever that changes (full screen, resizing the
  // window, browser zoom)
  new ResizeObserver(fitResolution).observe(canvas.elt.parentElement);
  // the full screen button in the bar under the game (squimble-quest.html). F does it too (draw())
  document.getElementById('sqFullscreen')?.addEventListener('click', toggleFullscreen);
  // the game's only played full screen, since people would take the small one on the page as how it's
  // meant to look. clicking or tabbing to it goes full screen (enterFullscreen()), and leaving lets go
  // of it, back to "Click to play" (hud.js), pausing like switching tab does
  canvas.elt.addEventListener('focus', () => {
    if (!document.fullscreenElement) enterFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    // the "full screen" message is out of date once it's left, however it was left
    hudMessage = null; // hud.js
    canvas.elt.blur();
    PauseMenu.leave();
  });
  // keeps pixel art sharp when it's scaled up. p5 keeps it when fitResolution() changes the resolution
  noSmooth();

  // the pause menu's saved settings and keys, before the keys are listened for (pausemenu.js)
  PauseMenu.load();
  // canvas.elt is the actual <canvas> element
  Input.attach(canvas.elt);
  // closing the page asks first if a map has changes that couldn't be kept in the browser
  // (edithistory.js), which only happens if its storage is full or blocked
  window.addEventListener('beforeunload', (e) => {
    if (EditHistory.notKept.size > 0) e.preventDefault();
  });

  player = new Player(0, 0);
  gameCamera = new Camera();
  gameCamera.follow(player);
  // shakes when the player hits or gets hit (hitWith() in weapons.js)
  player.camera = gameCamera;
  Hotbar.init(player.inventory);
  // E or I opens it (it's hidden until then)
  InventoryScreen.init(player);

  // every kind of data (DATA_KINDS in datafiles.js) loads at once, then the maps, since loading a map
  // checks its tiles, sounds and characters exist. then it starts on START_MAP (maps.js). this isn't
  // in preload() because there a missing file would stop the game starting, but here it just gets
  // skipped
  // a loading screen over the game until then (js/loading-screen.js), filling as each kind finishes
  const loading = LoadingScreen.show(canvas.elt.parentElement, { theme: 'squimble', text: 'Loading…' });
  const kinds = Object.keys(DATA_KINDS).filter((kind) => kind !== 'map');
  let loadedKinds = 0;
  const kindLoaded = () => loading.progress(++loadedKinds / (kinds.length + 1));
  Promise.all(kinds.map((kind) => DataFiles.load(kind).then(kindLoaded))).then(() => {
    loading.text('Loading maps…');
    return DataFiles.load('map');
  }).then(() => {
    kindLoaded();
    player.giveStartingItems();
    // the editor starts with the first tile picked, which exists now
    Editor.checkSelected();
    // no map files loaded, so use the blank stand-in map (maps.js)
    if (Object.keys(MAPS).length === 0) {
      console.warn('No map files could be loaded, so the game is on a blank stand-in map.');
      addMap(FALLBACK_MAP, buildFallbackMap);
    }

    let first = START_MAP;
    if (!MAPS[first]) {
      first = Object.keys(MAPS)[0];
      console.warn(`START_MAP is "${START_MAP}", but that map didn't load. Starting on "${first}" instead.`);
    }
    loadMap(first);
    // console warnings for broken warp links (warps.js), and pictures the wrong size once they've had a
    // few seconds to load (mapcheck.js)
    checkAllWarps();
    setTimeout(checkArtSizes, 3000);
    mapsReady = true;
    loading.hide();
  });

  // turns dev mode back on if it was on last time, and the shader that was on
  Debug.init();
  Shaders.init();
  Editor.init();
  Dialogue.init();
  DeathScreen.init(player);

  // to add ui: UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => { ... } }));
  // see the guide in button.js

  // phones and tablets get a message instead (squimble-quest.css), so don't run the game
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// makes the canvas draw at the resolution it's shown at: its width on the page times the screen's own
// pixels per page px (devicePixelRatio, 2 on most high res screens). the game is still GAME_W x GAME_H
// game px (config.js), so only how sharp it is changes: 960 x 540 full screen on a 1080p monitor draws
// 1920 x 1080 real pixels, and the page shows it as big as the window allows (squimble-quest.css).
// capped at 4 (3840 x 2160) so a huge screen doesn't slow it down
function fitResolution() {
  const shown = drawingContext.canvas.getBoundingClientRect().width;
  // 0 while it's hidden (phones get a message instead)
  if (!shown) return;
  const density = Math.min(4, Math.round(shown * window.devicePixelRatio) / GAME_W);
  if (Math.abs(density - pixelDensity()) > 0.001) pixelDensity(density);
}

// full screen on and off, from the button under the game and F. the button took the keyboard, so
// focusing the game gives it back, and goes full screen (setup())
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else drawingContext.canvas.focus();
}

// full screen for the frame round the game, which then fills the screen with the game in the middle,
// black bars if the monitor isn't 16:9 (squimble-quest.css). the browser only allows it just after a
// click or key press, and if it says no the game lets go of the keyboard, back to "Click to play".
// Escape normally leaves full screen straight away, but the editor's boxes use it too (formbox.js,
// soundeditor.js, warpgraph.js), so in browsers that can (Chrome, Edge) the keyboard lock keeps a tap of
// Escape for the game and holding it leaves (the browser says so at the top). others leave on a tap
function enterFullscreen() {
  const canvas = drawingContext.canvas;
  canvas.closest('.sq-game-frame').requestFullscreen()
    .then(() => {
      navigator.keyboard?.lock(['Escape']).catch(() => {});
      showMessage(`Full screen. Press ${keyName(KEYS.fullscreen[0])} or ${navigator.keyboard ? 'hold' : 'press'} Esc to leave`); // hud.js
    })
    .catch(() => {
      canvas.blur();
      showMessage("The browser didn't allow full screen, which the game needs");
    });
}

// goes to map `name` (MAPS, maps.js), arriving on warp `warpName` (warps.js), or on the map's spawn
// if there isn't one. dying always respawns you at the spawn (Player.respawn(), player.js). the camera
// jumps to a new map but glides on the same one. warps and dev mode's M use this.
//
// maps stay how you left them until you reload: the tiles and any editor changes (getMap(), maps.js),
// and the characters, which get stored on the map when you leave and put back when you return
// (defeated ones stay gone, hurt ones stay hurt). going to the same map (a warp somewhere else on it)
// keeps the same characters, so it's just a teleport
//
// multiplayer: this swaps the whole world (everyone's enemies, npcs, arrows, particles) over to the new
// map, because it assumes the one player is the only one there. with more players a warp would move
// just that player from one room to another, and the old map keeps running if anyone's still on it
function loadMap(name, warpName = '') {
  if (Dialogue.active) Dialogue.close();
  // worldMap is undefined the very first time
  if (worldMap) worldMap.characters = { enemies, npcs };
  const map = getMap(name);
  const sameMap = map === worldMap;
  worldMap = map;
  // particles are just for show, so the last map's are forgotten (particles.js), and so are its arrows
  if (!sameMap) {
    Particles.clear();
    DamageNumbers.clear(); // weapons.js
    Remains.clear(); // character.js
    arrows = [];
  }

  // a warp that doesn't exist (warpProblem() in warps.js normally catches it first) arrives at the
  // spawn instead
  const warp = warpName ? worldMap.warp(warpName) : null;
  const arrive = warp ? standingOnTile(PLAYER, warp.col, warp.row) : worldMap.spawn;
  player.placeAt(arrive.x, arrive.y);
  // the tile you arrive on counts as stepped on, so its warp doesn't send you straight back (warps.js)
  Warps.arrived(player, worldMap);

  // fresh characters on the first visit, and always in the editor (it shows the design, Editor.open())
  if (worldMap.characters && !Editor.active) {
    ({ enemies, npcs } = worldMap.characters);
  } else {
    spawnCharacters();
  }

  gameCamera.bounds = worldMap.bounds();
  // in the editor the camera follows the editor's view, so move that too
  if (Editor.active) {
    Editor.view.x = arrive.x;
    Editor.view.y = arrive.y;
  }
  // gliding over from the last map would look wrong. on the same map it glides, like after dying
  if (!sameMap) gameCamera.snap();
}

// makes every enemy and npc again from the spawn lists, at full health, including defeated ones. runs
// the first time you visit a map, and when the editor opens, closes or changes them (so it's a quick
// way to reset enemies)
//
// multiplayer: opening the editor resets the map's enemies and npcs for everyone on it, mid fight. fine
// while the editor's dev only, but it'd want to be off (or only on an empty map) once others can join
function spawnCharacters() {
  // the npc you're talking to is about to be replaced
  if (Dialogue.active) Dialogue.close();
  // they'd hang in the air in the editor, or hit the new characters, and the dead's remains go too
  arrows = [];
  Remains.clear();
  enemies = worldMap.enemySpawns.map((spawn) => {
    const enemy = new Enemy(spawn.type, spawn.col, spawn.row, spawn.ai, spawn.follows, spawn.stats);
    // its particles, where null (none) is a pick too (particles.js)
    if (spawn.hitParticles !== undefined) enemy.hitParticles = spawn.hitParticles;
    if (spawn.deathParticles !== undefined) enemy.deathParticles = spawn.deathParticles;
    // what it's wearing, by EQUIPMENT_SLOTS key (inventory.js)
    if (spawn.wears) enemy.wears = spawn.wears;
    // and what it holds instead of its own weapon (enemy.js)
    if (spawn.holds !== undefined) enemy.holds = spawn.holds;
    return fromSpawn(enemy, spawn);
  });
  npcs = worldMap.npcSpawns.map((spawn) => fromSpawn(new Npc(spawn.type, spawn.col, spawn.row, spawn.voice, spawn.look), spawn));
}

// what every character takes from its spawn: the sound it loops wherever it goes, its own if its spawn
// picked one, otherwise its kind's (soundblocks.js plays them), and which spawn it came from (its id,
// takeId() in tilemap.js), so a save game can say whose enemy is dead or where an npc's got to
function fromSpawn(character, spawn) {
  character.sound = spawn.sound ?? character.type.sound;
  character.spawnId = spawn.id;
  return character;
}

// a frame of the game being played, not paused or in the editor (draw()): the player, then everyone
// and everything else, then what E does and step triggers, then dying. aim is the mouse in world
// positions, or null
function updatePlaying(dt, aim) {
  // switching window or tab pauses (pausemenu.js). otherwise Escape closes the inventory, or pauses
  if (PauseMenu.away) {
    PauseMenu.open();
  } else if (Input.wasPressed('escape')) {
    if (InventoryScreen.active) InventoryScreen.show(false);
    else PauseMenu.open();
  }
  // what characters know about the world (top of character.js). characters is made once here
  // instead of once per character. a dead player isn't one of the players, so enemies lose interest
  // (sensePlayer() in enemies.js) and nothing attacks them until they respawn (deathscreen.js)
  //
  // multiplayer: players is a list already, so everything that reads it works with more. the other
  // players would go in here (and in characters), each updated with the controls their computer sent
  const world = { map: worldMap, players: player.dead ? [] : [player], enemies, npcs, characters: [player, ...enemies, ...npcs], arrows };

  // the dead don't do anything until they respawn (deathscreen.js)
  if (!player.dead) {
    // the number keys and wheel pick the held item, Q drops it, and the open inventory drags items
    // around (inventory.js). not while talking though, since the dialogue box hides the hotbar
    //
    // multiplayer: these change the game straight from the keyboard and mouse (which item's held,
    // what's in which slot, dropping things), round the side of the controls. picking a slot, swapping
    // slots and dropping would each want to be an action sent like { move, aim, attack }, so whoever
    // runs the rules can apply them for any player (Hotbar and InventoryScreen in inventory.js)
    if (!Dialogue.active) {
      Hotbar.update();
      if (Input.wasPressed('drop')) Drops.drop(worldMap, player, player.inventory.selected);
    }
    if (InventoryScreen.active) InventoryScreen.update(worldMap, player);

    // mousePressed() ignores clicks on the ui. with the inventory open you stand still and the mouse
    // moves items. while talking you can't attack, but walking away ends the conversation
    // (dialogue.js). both put a drawn bow down instead of shooting it, since not holding charge would
    // let it go (Character.updateCharge())
    if (InventoryScreen.active || Dialogue.active) player.stopDrawing();
    player.update(InventoryScreen.active ? STAND_STILL : {
      move: Input.direction(),
      aim,
      attack: !Dialogue.active && Input.mousePressed('left'),
      // held, for drawing a bow. pressed counts too, so a click that's let go within a frame still
      // shoots
      charge: !Dialogue.active && (Input.mouseHeld('left') || Input.mousePressed('left')),
      // shift, while wearing the quick charm (Character.canRoll())
      roll: !Dialogue.active && Input.wasPressed('roll'),
    }, dt, world);
  }
  // picks up items that are close enough, and moves thrown ones through the air (inventory.js)
  //
  // multiplayer: only this computer's player picks things up, and it also moves drops through the air.
  // it'd go once per player, with the throw moving once per frame on its own (Drops in inventory.js)
  Drops.update(worldMap, player, dt);

  for (const enemy of enemies) enemy.update(dt, world);
  // the map keeps this list when you leave, so defeated ones stay gone (loadMap())
  enemies = enemies.filter((enemy) => !enemy.dead);
  for (const npc of npcs) npc.update(dt, world);
  // after the characters, so arrows shot this frame fly from the start (weapons.js). world.arrows
  // is the same list, which shooting pushed onto
  arrows = arrows.filter((arrow) => arrow.update(dt, world));
  // enemies following you to another map come out when it's time (warps.js)
  Warps.update(dt);
  // loop sound blocks start when you come close enough to hear them, and so do the sounds
  // characters carry around and tiles make, like lava bubbling (soundblocks.js)
  SoundBlocks.update(worldMap);
  SoundBlocks.updateCharacters([...enemies, ...npcs], worldMap);
  SoundBlocks.updateTiles(worldMap);

  // E uses the first thing in reach (INTERACTABLES in interact.js: an npc, an E warp, a chest, an E
  // sound block). nothing's in reach while talking (E moves the conversation on instead, dialogue.js),
  // in the inventory or dead. with nothing in reach E opens or closes the inventory (I always does, and
  // closes a chest too). talking is from before E, so the line E opens with isn't skipped straight away
  const talking = Dialogue.active;
  const used = Interact.update(player, worldMap, talking || InventoryScreen.active || player.dead, Input.wasPressed('interact'));
  if (talking) Dialogue.update(player, worldMap, dt);
  else if (!used && !player.dead && Input.wasPressed('inventory')) InventoryScreen.show(!InventoryScreen.active);
  // step triggers go after E, which might have changed the map, so they never look at the new map in
  // the same frame. sound blocks go before warps, since Warps.checkStep() is what remembers the tile
  // you're on
  if (!used && !player.dead) {
    SoundBlocks.checkStep(player, worldMap);
    Warps.checkStep(player, worldMap);
  }
  // last, after everything that could kill them this frame. E respawns (deathscreen.js)
  DeathScreen.update(dt, Input.wasPressed('interact'));
}

function draw() {
  // the loading screen covers it till then (setup())
  if (!mapsReady) return;

  // how long the last frame took in seconds, capped (MAX_DT in config.js)
  const dt = Math.min(deltaTime / 1000, MAX_DT);

  // 1. input
  Input.update();
  // before anything else uses the mouse, so clicking on the ui doesn't also count as a click in the game
  UI.update();
  if (Input.wasPressed('fullscreen')) toggleFullscreen();

  // the mouse in world positions
  const aimScreen = Input.aimPoint();
  const aim = aimScreen ? gameCamera.screenToWorld(aimScreen.x, aimScreen.y) : null;

  // 2. update: dev tools first (they can move the player and zoom), and the camera last
  Debug.update(player, gameCamera, worldMap, aim, dt);
  // in the editor WASD moves the camera and everyone stands still. the pause menu stops everything
  // (pausemenu.js)
  //
  // multiplayer: both of these stop the whole world: enemies, arrows, warps, particles. one player
  // can't pause everyone else's game, so the pause menu (and Auto pause when the window loses focus)
  // would become just a menu over a world that keeps going, with your player standing still like the
  // inventory does. the editor opening would need the same, or to only work alone
  const paused = !Editor.active && PauseMenu.active;
  if (Editor.active) {
    Editor.update(worldMap, gameCamera, aim, dt);
  } else if (paused) {
    FormBox.update();
  } else {
    updatePlaying(dt, aim);
  }
  gameCamera.update(dt);
  // in the editor too, so the Particles tab can try them out and tiles show theirs while you edit them
  // (particles.js). tiles and objects on screen that keep making particles go first, but not under the
  // full screen editors, where you can't see them
  if (!WarpGraph.active && !SoundEditor.active && !paused) ParticleEmitters.update(dt, worldMap, gameCamera.view());
  // the map's and its areas' flashes of lightning and background sounds (atmosphere.js), going by
  // where the player's feet are, or the middle of the screen in the editor. their weather is
  // particles, so it's in ParticleEmitters
  if (!paused) {
    Atmosphere.update(worldMap, dt, Editor.active ? gameCamera : { x: player.x, y: player.y + feetBelowCentre(PLAYER) });
    Particles.update(dt, worldMap);
    DamageNumbers.update(dt);
    Remains.update(dt); // character.js
  }
  // sounds get quieter the further they are from the player's feet, and higher or lower as they and
  // the player move (the doppler effect, sound.js). this runs in the editor too, so finished sounds
  // (like the sound editor's previews) still get tidied up
  Sound.update({ x: player.x, y: player.y + feetBelowCentre(PLAYER), map: worldMap }, dt);

  // 3. draw, from back to front. the warp graph and the sound editor cover the whole screen
  // (warpgraph.js, soundeditor.js), so skip drawing the world under them. a big map with lots of warps
  // is slow and would slow them down
  if (!WarpGraph.active && !SoundEditor.active) {
    gameCamera.begin();
    drawWorld(gameCamera, worldMap, Debug.shows('grid'));
    // particles lying on the floor go under everything (particles.js)
    const view = gameCamera.view();
    Particles.drawFloor(view, worldMap);
    // shaders like Sun tell what's standing on the ground by what changes from here... (shaders.js)
    Shaders.capture('ground');
    // sort by feet so whatever's lower on screen is in front. drops sort by their shadow (even while
    // they're being thrown), and so do arrows and flying particles. drops show in the editor too,
    // since you can place them there. standing objects (trees, wardrobes, objects.js) sort by their
    // base and dead enemies' remains by where they fell (character.js). there can be thousands of
    // flying particles, so they keep their own sorted list and get drawn in runs between these
    // (particles.js)
    const things = [
      ...[player, ...enemies, ...npcs].map((c) => ({ y: c.y + c.h / 2, draw: () => c.draw() })),
      ...worldMap.standingObjects().map((o) => ({ y: (o.row + OBJECT_TYPES[o.type].height) * TILE, draw: () => worldMap.drawObject(o, view) })),
      ...Remains.list.map((r) => ({ y: r.bottom, draw: () => Remains.draw(r) })),
      ...worldMap.drops.map((d) => ({ y: Drops.where(d).y, draw: () => Drops.draw(d) })),
      ...arrows.map((a) => ({ y: a.y, draw: () => a.draw() })),
    ];
    things.sort((a, b) => a.y - b.y);
    Particles.drawFlyingWith(things, view);
    // ...to here
    Shaders.capture('things');
    // fog, colour and the rest of the map's atmosphere over all of it, then its areas' (atmosphere.js),
    // but under damage numbers, prompts and the editor's cursor so they stay readable
    Atmosphere.draw(gameCamera, worldMap);
    // over everything, so they're never hidden behind someone (weapons.js)
    DamageNumbers.draw();
    // dev mode: each enemy's ai and its route (pathfinding.js)
    if (Debug.shows('paths')) drawEnemyPlans(enemies, gameCamera);
    // sound blocks set to be seen (soundblocks.js). the editor draws every block its own way
    if (!Editor.active) SoundBlocks.draw(worldMap);
    // the E over whatever's in reach (interact.js)
    if (!Editor.active && !Dialogue.active) Interact.drawPrompt();
    if (Editor.active) Editor.drawCursor(worldMap, gameCamera, aim);
    gameCamera.end();
    // the dev mode shader over the world, but not the ui (shaders.js)
    Shaders.apply(gameCamera, worldMap, player, aim);
    // red round the edges when the player's just been hit (hud.js)
    if (!Editor.active) drawHurtFlash(player);
  }
  // dark with "You died" over the world while dead, not in the editor, and its Respawn button not over
  // the pause menu (deathscreen.js)
  DeathScreen.draw(!Editor.active, !Editor.active && !paused);

  // the ui, in screen positions. the editor fades it out while you move (editor.js), and globalAlpha
  // lasts until pop()
  push();
  if (Editor.active) drawingContext.globalAlpha = Editor.uiAlpha;
  Debug.draw(player, gameCamera, worldMap, aim);
  if (!Editor.active && !Dialogue.active && !InventoryScreen.active && !player.dead) Hotbar.drawLabel();
  // dev mode can outline every ui element (debug.js)
  UI.draw(Debug.shows('hitboxes'));
  InventoryScreen.drawDragged();
  pop();
  drawMessage();
  // words for sounds, if they're on (access.js)
  Captions.draw();
  if (worldMap.name === FALLBACK_MAP) drawNoMapsMessage();
  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'), UI.hovered !== null);
  } else {
    drawClickToPlay();
  }
}
