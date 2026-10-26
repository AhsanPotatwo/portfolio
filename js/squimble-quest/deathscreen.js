// the death screen. ponytail: a placeholder for trying out what dying should do (README known issues):
// when this computer's player dies they disappear (or leave their deathImage, PLAYER in config.js),
// the world carries on without them, the screen darkens and says so, and after a moment Respawn (the
// button, or E) brings them back.
//
// what death actually does is all in player.js: die() (dead is set, Character.hurt() calls it) and
// respawn() (where you come back and what's reset). this file is only how it looks. while dead
// (sketch.js):
//   - enemies lose interest: a dead player isn't in world.players, so sensePlayer() forgets them and
//     the pathfinders walk home (enemies.js). nothing can hit them (Character.hittable())
//   - they can't move, attack, pick up drops, use the hotbar, open the inventory or press E on things,
//     and step warps and step sound blocks don't go off
//   - the inventory or a conversation that was open closes
// after respawning nothing can hit them for PLAYER.respawnSafeTime (config.js), blinking, since whatever
// killed them near the spawn notices them again straight away.
// things to try here later: losing items or money, a respawn timer, respawning somewhere else, and a
// "you were killed by ..." line (hitWith() in weapons.js knows who)

// fade: seconds to darken. wait: seconds before you can respawn, so E pressed in the fight doesn't skip
// it. dim: how dark it gets at the end, 0 to 255
const DEATH_SCREEN = { fade: 0.8, wait: 0.6, dim: 150, colour: '#ff6b6b' };

const DeathScreen = {
  // seconds since the player died, or null while they're alive
  time: null,
  // the Respawn button (button.js), shown once you can respawn
  button: null,
  // the player it's for (sketch.js's)
  player: null,

  // once, in setup() (sketch.js)
  init(player) {
    this.player = player;
    // below the middle, where the camera keeps the player, so a death picture or animation there shows
    this.button = UI.add(new Button({ x: GAME_W / 2 - 80, y: GAME_H / 2 + 60, w: 160, h: 44, label: 'Respawn', style: 'primary', visible: false, onClick: () => this.respawn() }));
  },

  // every frame while playing (sketch.js), after everyone's moved. pressed is whether E was pressed
  update(dt, pressed) {
    const player = this.player;
    if (!player.dead) {
      this.time = null;
      return;
    }
    // the frame they die, whatever they had open closes
    if (this.time === null) {
      this.time = 0;
      if (InventoryScreen.active) InventoryScreen.show(false);
      if (Dialogue.active) Dialogue.close();
      player.stopDrawing();
    }
    this.time += dt;
    if (pressed && this.time >= DEATH_SCREEN.wait) this.respawn();
  },

  respawn() {
    this.player.respawn(); // player.js
    this.time = null;
  },

  // over the world and under the ui, every frame (sketch.js). shown is false in the editor, and
  // clickable false there and under the pause menu, so the button isn't in their way
  draw(shown, clickable) {
    this.button.visible = clickable && this.time !== null && this.time >= DEATH_SCREEN.wait;
    if (this.time === null || !shown) return;
    const faded = Math.min(1, this.time / DEATH_SCREEN.fade);
    noStroke();
    // UI_ART's deathBackground and deathTitle (config.js, art.js) fade in instead of the dark and the
    // words, playing from when they died if they're sheets
    push();
    drawingContext.globalAlpha *= faded;
    const background = drawArtBox(uiArt('deathBackground'), 0, 0, GAME_W, GAME_H, this.time);
    pop();
    if (!background) {
      fill(0, 0, 0, DEATH_SCREEN.dim * faded);
      rect(0, 0, GAME_W, GAME_H);
    }
    push();
    drawingContext.globalAlpha *= faded;
    const title = drawArt(uiArt('deathTitle'), GAME_W / 2, GAME_H / 2 - 100, { anchor: 'centre', time: this.time });
    pop();
    if (!title) {
      const words = color(DEATH_SCREEN.colour);
      words.setAlpha(255 * faded);
      fill(words);
      setText(40); // utils.js
      text('You died', GAME_W / 2, GAME_H / 2 - 100);
    }
    if (!this.button.visible) return;
    fill(255, 255, 255, 200);
    // keyName() is in debug.js
    setText(14, NORMAL);
    text(`or press ${keyName(KEYS.interact[0])}`, GAME_W / 2, this.button.y + this.button.h + 22);
  },
};
