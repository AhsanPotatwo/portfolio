// everything the player can press E on: npcs, E warps, chests and E sound blocks, and anything new
// (signs, levers, shops, quest givers...).
//
// ============================== how to add something you press E on ==============================
//
// add a line to INTERACTABLES with three functions:
//   find(player, map)   the closest one of its kind in reach, or null. closestInReach() (warps.js) does
//                       the work for anything on a tile: closestInReach(player, map.levers)
//   use(thing, player, map)  what E does to it
//   prompt(thing)       draws the E over it with drawKeyPrompt() (npc.js), in world positions
// when more than one kind is in reach, the first in the list wins, so put it where it should come in
// line. that's all: sketch.js asks Interact every frame, and nothing's in reach while talking, in the
// inventory or dead.
//
// ==================================================================================================

// in the order they win when more than one's in reach: you talk to an npc rather than open the door
// behind them, go through a door rather than open the chest next to it, and so on
const INTERACTABLES = [
  {
    // npcs, within TALK_RANGE and not through a wall (dialogue.js). npcs is the game's (sketch.js)
    find: (player, map) => Dialogue.npcInRange(player, npcs, map),
    use: (npc, player) => Dialogue.open(npc, player, gameCamera),
    prompt: (npc) => drawKeyPrompt(npc.x, npc.y - npc.h / 2 - 8),
  },
  { find: (player, map) => Warps.inReach(player, map), use: (warp, player) => Warps.use(warp, player), prompt: (warp) => Warps.drawPrompt(warp) },
  { find: (player, map) => StorageObjects.inReach(player, map), use: (obj) => StorageObjects.open(obj), prompt: (obj) => StorageObjects.drawPrompt(obj) },
  { find: (player, map) => SoundBlocks.inReach(player, map), use: (block, player, map) => SoundBlocks.play(block, map), prompt: (block) => SoundBlocks.drawPrompt(block) },
];

const Interact = {
  // what E would use this frame, { kind, thing } (kind is its INTERACTABLES line), or null. it gets an
  // E drawn over it. Warps.arrived() clears it, since after moving the player it was from somewhere else
  target: null,

  // every frame while playing (sketch.js): finds what's in reach, unless busy (talking, in the
  // inventory, dead), and uses it if E was pressed. gives back whether it used something, since then
  // E has done its job (it doesn't also open the inventory) and step triggers wait a frame
  //
  // multiplayer: only this computer's player finds and uses things here. using would be an action sent
  // with the controls, like { move, aim, attack }, so whoever runs the rules can do it for any player
  update(player, map, busy, pressed) {
    this.target = null;
    if (!busy) {
      for (const kind of INTERACTABLES) {
        const thing = kind.find(player, map);
        if (thing) {
          this.target = { kind, thing };
          break;
        }
      }
    }
    if (!this.target || !pressed) return false;
    const { kind, thing } = this.target;
    // whatever it did (opened a box, changed the map), the E shouldn't still show over it
    this.target = null;
    kind.use(thing, player, map);
    return true;
  },

  // the E over what's in reach. world positions (before camera.end())
  drawPrompt() {
    if (this.target) this.target.kind.prompt(this.target.thing);
  },
};
