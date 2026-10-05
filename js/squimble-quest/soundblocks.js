// sound blocks: tiles that play a sound from the library (SOUNDS, sound.js) when you step on them,
// when you press E next to them, or constantly while you're close enough to hear them (loop, for a
// humming machine or a waterfall). you place them from the editor's Sounds tab, which shows every
// sound, and right click one on the map to pick its sound and how it plays. the sounds themselves are
// made in the sound editor (soundeditor.js). like warps they don't show while playing, so put an
// object on the tile if you want something to see there.
//
// each block on a map (map.sounds, saved in the map file):
//   col, row  its tile. one per tile, and it can share the tile with anything else
//   activate  how it plays, a SOUND_BLOCK_ACTIVATE key
//   sound     the name of its sound in SOUNDS. a name that doesn't exist (renamed in sounds.json) is
//             kept, but it's silent and its marker shows red
//
// step blocks share the warps' "only when your tile changes onto it" check (player.stepTile,
// warps.js), so arriving on one or standing still on it doesn't keep setting it off. E blocks use the
// same reach as E warps (closestInReach(), warps.js), and a warp wins if both are in reach. loop blocks
// play their sound as a loop (seamless, see renderSound()) from when you come into range until you
// leave it (Sound.update() stops it)

// how a block plays, and the words for it in the settings box
const SOUND_BLOCK_ACTIVATE = {
  step: 'stepping on it',
  interact: 'pressing E',
  loop: 'constantly nearby',
};

// only used in the editor. while playing you can't see sound blocks
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
  // it's still playing
  play(block, map) {
    playSound(block.sound, this.where(block, map), block, { loop: block.activate === 'loop' });
  },

  // where a block is, as playSound() wants it
  where(block, map) {
    return { x: (block.col + 0.5) * TILE, y: (block.row + 0.5) * TILE, map };
  },

  // every frame while playing, before Warps.checkStep() (which updates player.stepTile, so this has
  // to look first). plays a step block if the player just stepped onto one
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

  // every frame while playing: starts loop blocks you've just come close enough to hear
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

  // the settings box for a block (right click it in the editor): which sound, and how it plays. Play
  // tries the picked sound, and Edit sound saves the box and opens the sound editor on it
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
    FormBox.open({
      title: 'Sound block',
      hint: 'Click the right of a choice for the next one',
      confirmLabel: 'Save',
      rows: [
        { label: 'Sound', field: soundPicker },
        { label: 'Plays by', field: activatePicker },
        // buttons last, so their (undefined) values don't shift the ones onConfirm gets
        { label: '', field: new Button({ w: 180, label: '▶  Play', style: 'editor', onClick: () => SOUNDS[soundPicker.value] && Sound.preview(SOUNDS[soundPicker.value]) }) },
        {
          label: '',
          field: new Button({
            w: 180, label: 'Edit sound', style: 'editor',
            onClick: () => {
              FormBox.confirm();
              if (SOUNDS[block.sound]) SoundEditor.open(block.sound); // soundeditor.js
            },
          }),
        },
      ],
      onConfirm: ([sound, activate]) => {
        Object.assign(block, { sound, activate });
      },
    });
  },
};

// the editor's marker for a block: a see-through green tile (red if its sound is missing) with its
// wave on it, an E if it plays with E, or "loop" if it loops. px is one screen pixel
// (Editor.drawCursor() in editor.js)
function drawSoundMarker(block, px) {
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

// a circle showing how far away a block can be heard, for the one under the mouse in the editor
function drawSoundRange(block, px) {
  const sound = SOUNDS[block.sound];
  if (!sound) return;
  noFill();
  stroke(SOUND_COLOURS.range);
  strokeWeight(1.5 * px);
  circle((block.col + 0.5) * TILE, (block.row + 0.5) * TILE, sound.range * TILE * 2);
}
