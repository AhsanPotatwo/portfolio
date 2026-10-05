// sound blocks: tiles that make a sound (sound.js) when you step on them, when you press E next to
// them, or over and over while you're close by (loop, for things like a humming machine or a
// waterfall). you place them from the editor's Sounds tab, where each square is a starting sound
// (SOUND_PRESETS), and right click one on the map to change it. the settings box is a mini
// synthesiser, with a picture of the sound and a Play button. like warps they don't show while
// playing, so put an object on the tile if you want something to see there.
//
// each block on a map (map.sounds, saved in the map file):
//   col, row  its tile. one per tile, and it can share the tile with anything else
//   activate  how it plays, a SOUND_BLOCK_ACTIVATE key
//   sound     its SOUND_DEFAULTS settings (sound.js)
//
// step blocks share the warps' "only when your tile changes onto it" check (player.stepTile,
// warps.js), so arriving on one or standing still on it doesn't keep setting it off. E blocks use the
// same reach as E warps (closestInReach(), warps.js), and a warp wins if both are in reach.

// how a block plays, and the words for it in the settings box
const SOUND_BLOCK_ACTIVATE = {
  step: 'stepping on it',
  interact: 'pressing E',
  // plays again every time it finishes, as long as you're close enough to hear it (its range)
  loop: 'over and over nearby',
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

  // plays a block's sound from its tile. the block itself is the key, so a loop block can tell
  // whether it's still playing
  play(block, map) {
    playSound(block.sound, { x: (block.col + 0.5) * TILE, y: (block.row + 0.5) * TILE, map }, block);
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

  // every frame while playing: starts loop blocks again once they've finished, if you can hear them
  update(map) {
    for (const block of map.sounds) {
      if (block.activate !== 'loop' || Sound.isPlaying(block)) continue;
      const at = { x: (block.col + 0.5) * TILE, y: (block.row + 0.5) * TILE, map };
      if (Sound.volumeAt(at, block.sound.range) > 0) this.play(block, map);
    }
  },

  // the E over the block you can reach. world positions (before camera.end())
  drawPrompt() {
    const block = this.reachable;
    if (block) drawKeyPrompt((block.col + 0.5) * TILE, block.row * TILE - 4); // npc.js
  },

  // the settings box for a block (right click it in the editor). the changes happen when you press
  // Save, but Play always plays what's in the box right now
  edit(block) {
    const s = block.sound;
    const number = (value, min, max) => new NumberField({ w: 90, value, min, max });
    const wavePicker = new Picker({
      w: 180,
      choices: Object.keys(SOUND_WAVES),
      value: s.wave,
      label: (wave) => wave,
      art: (wave, x, y, size) => {
        noFill();
        stroke(255);
        strokeWeight(1.5);
        drawWaveShape(wave, x, y, size, size);
      },
    });
    // every number setting's field, with the smallest and biggest it can be
    const fields = {
      pitch: number(s.pitch, 20, 5000),
      length: number(s.length, 10, 5000),
      volume: number(s.volume, 0, 100),
      fadeIn: number(s.fadeIn, 0, 5000),
      fadeOut: number(s.fadeOut, 0, 5000),
      slideTo: number(s.slideTo, 0, 5000),
      wobble: number(s.wobble, 0, 1200),
      wobbleSpeed: number(s.wobbleSpeed, 0, 50),
      repeats: number(s.repeats, 1, 16),
      gap: number(s.gap, 0, 5000),
      range: number(s.range, 1, 50),
    };
    const activatePicker = new Picker({
      w: 180,
      choices: Object.keys(SOUND_BLOCK_ACTIVATE),
      value: block.activate,
      label: (how) => SOUND_BLOCK_ACTIVATE[how],
    });
    // the sound as it is in the box right now
    const soundNow = () => {
      const sound = { wave: wavePicker.value };
      for (const [key, field] of Object.entries(fields)) sound[key] = field.value;
      return sound;
    };

    FormBox.open({
      title: 'Sound block',
      hint: '440 Hz is an A, 100 cents is one note',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Sound',
          rows: [
            { label: 'Wave', field: wavePicker },
            { label: 'Pitch', field: fields.pitch, after: 'Hz' },
            { label: 'Length', field: fields.length, after: 'ms' },
            { label: 'Volume', field: fields.volume, after: '%' },
          ],
        },
        {
          label: 'Shape',
          rows: [
            { label: 'Fade in', field: fields.fadeIn, after: 'ms' },
            { label: 'Fade out', field: fields.fadeOut, after: 'ms' },
            { label: 'Slide to', field: fields.slideTo, after: 'Hz (0 = off)' },
            { label: 'Wobble', field: fields.wobble, after: 'cents' },
            { label: 'Wobble speed', field: fields.wobbleSpeed, after: 'a second' },
          ],
        },
        {
          label: 'Playing',
          rows: [
            { label: 'Plays by', field: activatePicker },
            { label: 'Repeats', field: fields.repeats, after: 'times' },
            { label: 'Gap', field: fields.gap, after: 'ms between' },
            { label: 'Heard from', field: fields.range, after: 'tiles away' },
          ],
        },
      ],
      minRows: 6,
      // the visualiser, with Play under it
      side: (x, y, w, h) => [
        new SoundVisualiser({ x, y, w, h: h - 32, sound: soundNow }),
        new Button({ x, y: y + h - 24, w, h: 24, label: '▶  Play', style: 'editor', onClick: () => Sound.preview(soundNow()) }),
      ],
      onConfirm: () => {
        block.activate = activatePicker.value;
        block.sound = soundNow();
      },
    });
  },
};

// the editor's picture of the sound in the settings box, in two panels, read every frame so it
// changes as you type:
//   wave         a close-up of the wave's shape. more cycles for a higher pitch, taller when louder
//   whole sound  the whole thing from start to end (drawSoundWave() in sound.js): the fades, slide,
//                wobble and repeats, with a line moving along it while Play is going
// and its note, pitch and length underneath.
//   sound  () => the sound settings to draw
class SoundVisualiser extends UIElement {
  constructor(options) {
    // just for show, clicks go through to the form box
    super({ ...options, interactive: false });
    this.sound = options.sound;
  }

  draw() {
    const sound = this.sound();
    const { x, w } = this;
    // two panels with a gap, and room for the words at the bottom
    const h = (this.h - 22 - 6) / 2;
    const closeUpY = this.y;
    const wholeY = this.y + h + 6;

    for (const [top, label] of [[closeUpY, 'wave'], [wholeY, 'whole sound']]) {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(x, top, w, h);
      // the middle line, where the wave is silent
      fill(EDITOR_COLOURS.edge);
      rect(x, top + h / 2, w, 1);
      fill(EDITOR_COLOURS.dimText);
      setText(9, BOLD, LEFT, TOP);
      text(label, x + 4, top + 3);
    }

    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1.5);
    drawWaveShape(sound.wave, x + 4, closeUpY + 12, w - 8, h - 16, closeUpCycles(sound.pitch), sound.volume / 100);
    drawSoundWave(sound, x + 4, wholeY + 12, w - 8, h - 16);

    // the moving line while it plays, going across at the same speed as the sound
    const played = Sound.previewStarted === null ? Infinity : (millis() - Sound.previewStarted) / 1000;
    if (played < soundDuration(sound)) {
      stroke(255);
      strokeWeight(1);
      const lineX = x + 4 + (played / soundDuration(sound)) * (w - 8);
      line(lineX, wholeY, lineX, wholeY + h);
    }

    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, CENTER);
    text(`${noteName(sound.pitch)}  ·  ${sound.pitch} Hz  ·  ${Math.round(soundDuration(sound) * 1000)} ms`, x + w / 2, this.y + this.h - 10);
  }
}

// the editor's marker for a block: a see-through green tile with its wave on it, an E if it plays with
// E, or "loop" if it loops. px is one screen pixel (Editor.drawCursor() in editor.js)
function drawSoundMarker(block, px) {
  const x = block.col * TILE;
  const y = block.row * TILE;
  fill(SOUND_COLOURS.fill);
  stroke(SOUND_COLOURS.edge);
  strokeWeight(2 * px);
  rect(x + px, y + px, TILE - 2 * px, TILE - 2 * px, 3);
  noFill();
  stroke(255);
  strokeWeight(1.5 * px);
  drawWaveShape(block.sound.wave, x + 6, y + 6, TILE - 12, TILE - 12);
  if (block.activate === 'step') return;
  noStroke();
  fill(255);
  setText(block.activate === 'interact' ? 10 : 7, BOLD, RIGHT, TOP);
  text(block.activate === 'interact' ? 'E' : 'loop', x + TILE - 3, y + 2);
}

// a circle showing how far away a block can be heard, for the one under the mouse in the editor
function drawSoundRange(block, px) {
  noFill();
  stroke(SOUND_COLOURS.range);
  strokeWeight(1.5 * px);
  circle((block.col + 0.5) * TILE, (block.row + 0.5) * TILE, block.sound.range * TILE * 2);
}
