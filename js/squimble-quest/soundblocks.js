// sound blocks: tiles that play a sound from the library (SOUNDS, sound.js) when you step on them,
// when you press E next to them, or constantly while you're close enough to hear them (loop, for a
// humming machine or a waterfall). you place them from the editor's Sounds tab, which shows every
// sound, and right click one on the map to pick its sound, how it plays and how it moves. the sounds
// themselves are made in the sound editor (soundeditor.js). like warps they don't show while playing,
// unless they're set to be seen (a little sound marker), or put an object on the tile.
//
// a block can move its sound around (SOUND_BLOCK_MOVES): side to side, up and down, past (one way,
// then starting again) or round in a circle, centred on its tile. moving sounds get the doppler
// effect (sound.js), so a loop block going past is a car, a train or a bee flying by. it's only the
// sound that moves: stepping on it and pressing E still go by its tile, so moving is mostly for loops.
// everyone's clock is the same (millis()), so a moving block is in the same place in the editor and
// the game.
//
// this file also plays sounds that follow characters: an enemy or npc with a sound (its kind's in
// enemies.js or npcs.js, or its own picked by right clicking it in the editor) loops it from where
// it is while you're in range (updateCharacters()), so something chasing you gets higher as it comes.
//
// each block on a map (map.sounds, saved in the map file):
//   col, row  its tile. one per tile, and it can share the tile with anything else
//   activate  how it plays, a SOUND_BLOCK_ACTIVATE key
//   sound     the name of its sound in SOUNDS. a name that doesn't exist (its file was renamed) is
//             kept, but it's silent and its marker shows red
//   move      how it moves, a SOUND_BLOCK_MOVES key, left out when it's still
//   distance  how far it goes in tiles: the length of its path, or a circle's radius
//   speed     how fast it goes in tiles a second (on average, side to side slows down at the ends)
//   show      true to see its marker while playing
//
// step blocks share the warps' "only when your tile changes onto it" check (player.stepTile,
// warps.js), so arriving on one or standing still on it doesn't keep setting it off. E blocks use the
// same reach as E warps (closestInReach(), warps.js), and a warp wins if both are in reach. loop blocks
// play their sound as a loop (seamless, see renderSound()) from when you come into range until you
// leave it (Sound.update() stops it)
//
// where it hooks into the rest of the game:
//   sketch.js    every frame while playing: SoundBlocks.update() (loops), reachable (the E block),
//                SoundBlocks.play() on E, checkStep() before Warps.checkStep(), and drawPrompt()
//   tilemap.js   map.sounds, soundAt(), removeSoundAt(), and resize() dropping blocks cut off
//   mapfile.js   saving and loading "sounds" in map files ({ sound, col, row, activate })
//   editor.js    the Sounds tab places them (Editor.placeSoundBlock()), right click opens edit(),
//                Erase removes them, and drawCursor() draws drawSoundMarker() and drawSoundRange()
//
// known problems:
//   - only the player sets them off. enemies and npcs walking over a step block don't
//   - a step block plays every time you step onto it, with no cooldown, so walking back and forth
//     over it plays it over and over (on top of itself if it's long)
//   - two loop blocks with the same sound near each other play it twice, louder, and they can drift
//     in and out of step. for a big area of sound, one block with a bigger range is better
//   - a loop block's sound has to be loopable to sound good. one with a long fade out will pulse,
//     which is right for some things but not a steady hum (see "loops" atop sound.js)
//   - they're design, so Export saves them in the map file, but a new sound has to be exported too
//     (and added to index.json) or it won't be there after a reload (the block goes red and silent)
//   - a "past" block jumps back to the start of its path when it gets to the end, which you hear as
//     the sound jumping, so give it a distance past where it can be heard (its Heard from) to hide it
//   - a moving one-shot (step or E) plays from wherever it is on its path at the time
//   - a character's sound loops the whole time it's in range, standing still or not, and stops when
//     it's defeated
//
// ideas for later:
//   - paths you draw (a list of tiles to go along), for a train on a track
//   - sounds that follow objects or thrown items the same way as characters
//   - a cooldown, or "only once" blocks (a sound the first time you walk somewhere)
//   - letting enemies set off step blocks (a creaky floor that gives them away)
//   - sounds tied to objects (a fire object that crackles), which could reuse this, just placed with
//     the object
//   - blocks bigger than one tile, for an area like a river that's loudest anywhere along it

// how a block plays, and the words for it in the settings box
const SOUND_BLOCK_ACTIVATE = {
  step: 'stepping on it',
  interact: 'pressing E',
  loop: 'constantly nearby',
};

// how a block can move its sound, and the words for it in the settings box. side and past go
// left to right, up and down go top to bottom
const SOUND_BLOCK_MOVES = {
  still: 'stays still',
  side: 'side to side',
  upDown: 'up and down',
  past: 'past, left to right',
  pastDown: 'past, top to bottom',
  circle: 'round in a circle',
};

// what a block that's just been set moving starts with, in tiles and tiles a second
const SOUND_BLOCK_MOVE_DEFAULTS = { distance: 10, speed: 8 };

// where a block's sound is at a time (seconds), in world px. it's centred on the block's tile: side
// to side and up and down swing like a pendulum (slowing at the ends, so the pitch glides round
// instead of flipping), past goes one way at a steady speed and starts again, and a circle goes
// round the tile at distance tiles. a still block (or one with no speed or distance) is the middle of
// its tile
function soundBlockPosition(block, time) {
  const x = (block.col + 0.5) * TILE;
  const y = (block.row + 0.5) * TILE;
  const move = block.move ?? 'still';
  const distance = (block.distance ?? 0) * TILE;
  const speed = (block.speed ?? 0) * TILE;
  if (move === 'still' || distance <= 0 || speed <= 0) return { x, y };
  if (move === 'circle') {
    const angle = (speed / distance) * time;
    return { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
  }
  // how far along its path it is, from -distance / 2 to distance / 2. a swing there and back takes
  // as long as going 2 x distance at speed
  const along = move === 'side' || move === 'upDown'
    ? -Math.cos((Math.PI * speed * time) / distance) * (distance / 2)
    : ((speed * time) % distance) - distance / 2;
  return move === 'side' || move === 'past' ? { x: x + along, y } : { x, y: y + along };
}

// only used in the editor (and for blocks set to be seen)
const SOUND_COLOURS = {
  fill: 'rgba(80, 200, 170, 0.3)', // see-through so the tile shows
  edge: '#50c8aa',
  // the circle showing how far away it can be heard
  range: 'rgba(80, 200, 170, 0.6)',
};

const SoundBlocks = {
  // the E block in reach this frame, or null. sketch.js sets it while playing, and it gets an E over it
  reachable: null,

  // plays a block's sound from its tile. the block itself is the key, so a loop block can tell whether
  // it's still playing. a missing sound just doesn't play (playSound() gives back null)
  play(block, map) {
    playSound(block.sound, this.where(block, map), block, { loop: block.activate === 'loop' });
  },

  // where a block is, as playSound() wants it. a moving one gives back a place that works out where
  // it is whenever it's read, so Sound.update() hears it move (and bends it with the doppler effect)
  where(block, map) {
    if ((block.move ?? 'still') === 'still') return { x: (block.col + 0.5) * TILE, y: (block.row + 0.5) * TILE, map };
    return {
      get x() { return soundBlockPosition(block, millis() / 1000).x; },
      get y() { return soundBlockPosition(block, millis() / 1000).y; },
      map,
    };
  },

  // sounds playing from characters, character => its voice (Sound.play()'s), for updateCharacters()
  following: new Map(),

  // every frame while playing: characters (enemies and npcs on this map) with a sound loop it from
  // where they are while you can hear them, like loop blocks. it starts when you come into range
  // (Sound.update() stops it when you leave), and stops when they're gone (defeated, or you've left
  // the map). their feet are where it comes from
  updateCharacters(characters, map) {
    for (const [character, voice] of this.following) {
      if (character.dead || !characters.includes(character) || voice.ended || !Sound.voices.includes(voice)) {
        Sound.stop(voice);
        this.following.delete(character);
      }
    }
    for (const character of characters) {
      if (!character.sound || character.dead || this.following.has(character) || !SOUNDS[character.sound]) continue;
      const at = { get x() { return character.x; }, get y() { return character.y + character.h / 2; }, map };
      if (Sound.volumeAt(at, SOUNDS[character.sound].range) === 0) continue;
      const voice = playSound(character.sound, at, character, { loop: true });
      if (voice) this.following.set(character, voice);
    }
  },

  // while playing: a little marker for each block set to be seen (show), where its sound is. world
  // positions (before camera.end())
  draw(map) {
    for (const block of map.sounds) {
      if (!block.show) continue;
      const { x, y } = this.where(block, map);
      drawSoundSource(x, y, 1);
    }
  },

  // every frame while playing, before Warps.checkStep() (which updates player.stepTile, so this has
  // to look first). plays a step block if the player just stepped onto one.
  // careful: it only reads player.stepTile and never changes it. if Warps.checkStep() ever stops
  // being called (or gets called first) step blocks would play every frame or never
  checkStep(player, map) {
    const [col, row] = feetTile(player, map); // warps.js
    const [lastCol, lastRow] = player.stepTile ?? [];
    if (col === lastCol && row === lastRow) return;
    const block = map.soundAt(col, row);
    if (block?.activate === 'step') this.play(block, map);
  },

  // the closest E block within reach of the feet, or null
  inReach(player, map) {
    return closestInReach(player, map.sounds.filter((block) => block.activate === 'interact'));
  },

  // every frame while playing: starts loop blocks you've just come close enough to hear. a loop never
  // ends by itself, so it only gets started again after Sound.update() has stopped it (you walked out
  // of range, or went to another map). it doesn't run in the editor, so loops stay quiet there
  update(map) {
    for (const block of map.sounds) {
      if (block.activate !== 'loop' || !SOUNDS[block.sound] || Sound.isPlaying(block)) continue;
      if (Sound.volumeAt(this.where(block, map), SOUNDS[block.sound].range) > 0) this.play(block, map);
    }
  },

  // the E over the block you can reach. world positions (before camera.end())
  drawPrompt() {
    const block = this.reachable;
    if (block) drawKeyPrompt((block.col + 0.5) * TILE, block.row * TILE - 4); // npc.js
  },

  // the settings box for a block (right click it in the editor), in two tabs. Sound: which sound and
  // how it plays. Play tries the picked sound (full volume, not as it'd sound from where the player
  // is), and Edit sound saves the box and opens the sound editor on it. the sound editor then changes
  // the sound itself, so every block using it changes too. Moving: how its sound moves, how far and
  // how fast, and whether it's seen in the game
  edit(block) {
    const soundPicker = new Picker({
      w: 180,
      // a missing sound stays in the list so opening the box doesn't quietly change it
      choices: SOUNDS[block.sound] ? Object.keys(SOUNDS) : [...Object.keys(SOUNDS), block.sound],
      value: block.sound,
      label: (name) => (SOUNDS[name] ? name : `${name} (missing)`),
      art: (name, x, y, size) => {
        if (!SOUNDS[name]) return;
        stroke(SOUND_COLOURS.edge);
        strokeWeight(1);
        drawSoundShape(SOUNDS[name], x, y, size, size);
      },
    });
    const activatePicker = new Picker({
      w: 180,
      choices: Object.keys(SOUND_BLOCK_ACTIVATE),
      value: block.activate,
      label: (how) => SOUND_BLOCK_ACTIVATE[how],
    });
    const movePicker = new Picker({ w: 180, choices: Object.keys(SOUND_BLOCK_MOVES), value: block.move ?? 'still', label: (move) => SOUND_BLOCK_MOVES[move] });
    const distanceField = new NumberField({ w: 60, value: block.distance ?? SOUND_BLOCK_MOVE_DEFAULTS.distance, min: 1, max: 99 });
    const speedField = new NumberField({ w: 60, value: block.speed ?? SOUND_BLOCK_MOVE_DEFAULTS.speed, min: 1, max: 99 });
    const showBox = new Checkbox({ w: 180, value: Boolean(block.show), label: 'see it while playing' });
    FormBox.open({
      title: 'Sound block',
      hint: 'Click the right of a choice for the next one',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Sound',
          rows: [
            { label: 'Sound', field: soundPicker },
            { label: 'Plays by', field: activatePicker },
            { label: '', field: new Button({ w: 180, label: '▶  Play', style: 'editor', onClick: () => SOUNDS[soundPicker.value] && Sound.preview(SOUNDS[soundPicker.value]) }) },
            {
              label: '',
              field: new Button({
                w: 180, label: 'Edit sound', style: 'editor',
                onClick: () => {
                  // confirm first, so the block keeps the sound picked here, then open that sound
                  FormBox.confirm();
                  if (SOUNDS[block.sound]) SoundEditor.open(block.sound); // soundeditor.js
                },
              }),
            },
          ],
        },
        {
          label: 'Moving',
          rows: [
            { label: 'Moves', field: movePicker },
            { label: 'Distance', field: distanceField, after: 'tiles' },
            { label: 'Speed', field: speedField, after: 'tiles a second' },
            { label: 'Seen', field: showBox },
          ],
        },
      ],
      // read from the fields themselves, since the buttons' (undefined) values are in the list too
      onConfirm: () => {
        Object.assign(block, { sound: soundPicker.value, activate: activatePicker.value });
        // a still block doesn't keep a distance or speed, so its line in the map file stays short
        if (movePicker.value === 'still') {
          delete block.move;
          delete block.distance;
          delete block.speed;
        } else {
          Object.assign(block, { move: movePicker.value, distance: distanceField.value, speed: speedField.value });
        }
        if (showBox.value) block.show = true;
        else delete block.show;
      },
    });
  },
};

// a little sound marker: a dot with two sound waves coming off it, at x, y in world px, size 1 is
// about half a tile. for blocks set to be seen, and moving blocks in the editor
function drawSoundSource(x, y, size) {
  noStroke();
  fill(SOUND_COLOURS.edge);
  circle(x, y, 7 * size);
  noFill();
  stroke(SOUND_COLOURS.edge);
  strokeWeight(1.5 * size);
  for (const r of [10, 16]) {
    arc(x, y, r * size, r * size, -0.7, 0.7);
    arc(x, y, r * size, r * size, Math.PI - 0.7, Math.PI + 0.7);
  }
}

// the editor's marker for a block: a see-through green tile (red if its sound is missing) with its
// wave on it, an E if it plays with E, or "loop" if it loops. a moving block also shows its path
// and where its sound is right now. px is one screen pixel (Editor.drawCursor() in editor.js)
function drawSoundMarker(block, px) {
  if ((block.move ?? 'still') !== 'still') drawSoundPath(block, px);
  const x = block.col * TILE;
  const y = block.row * TILE;
  const sound = SOUNDS[block.sound];
  fill(SOUND_COLOURS.fill);
  stroke(sound ? SOUND_COLOURS.edge : WARP_COLOURS.broken);
  strokeWeight(2 * px);
  rect(x + px, y + px, TILE - 2 * px, TILE - 2 * px, 3);
  if (sound) {
    noFill();
    stroke(255);
    strokeWeight(1.5 * px);
    drawWaveShape(sound.wave, x + 6, y + 6, TILE - 12, TILE - 12);
  }
  if (block.activate === 'step') return;
  noStroke();
  fill(255);
  setText(block.activate === 'interact' ? 10 : 7, BOLD, RIGHT, TOP);
  text(block.activate === 'interact' ? 'E' : 'loop', x + TILE - 3, y + 2);
}

// a moving block's path (a line or a circle round its tile, see-through) and its sound where it is
// now, moving along it
function drawSoundPath(block, px) {
  const x = (block.col + 0.5) * TILE;
  const y = (block.row + 0.5) * TILE;
  const distance = (block.distance ?? 0) * TILE;
  noFill();
  stroke(SOUND_COLOURS.range);
  strokeWeight(2 * px);
  if (block.move === 'circle') circle(x, y, distance * 2);
  else if (block.move === 'side' || block.move === 'past') line(x - distance / 2, y, x + distance / 2, y);
  else line(x, y - distance / 2, x, y + distance / 2);
  const now = soundBlockPosition(block, millis() / 1000);
  drawSoundSource(now.x, now.y, 1);
}

// a circle showing how far away a block can be heard, for the one under the mouse in the editor. it's
// where the sound fades to nothing, measured from where the sound is (the tile's middle, or along
// its path) to the player's feet. the sound's already pretty quiet well before the edge, since the
// fade is squared (Sound.volumeAt())
function drawSoundRange(block, px) {
  const sound = SOUNDS[block.sound];
  if (!sound) return;
  const at = soundBlockPosition(block, millis() / 1000);
  noFill();
  stroke(SOUND_COLOURS.range);
  strokeWeight(1.5 * px);
  circle(at.x, at.y, sound.range * TILE * 2);
}
