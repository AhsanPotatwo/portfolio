// accessibility: the pause menu's settings that need drawing of their own (the rest are a line or two
// where they're used, GAME_SETTINGS in config.js says where). the colour blind filter has its own
// file (colourblind.js)
//
// ---------- captions (GAME_SETTINGS.captions) ----------
// words in the bottom right for sounds as they play, like the sound captions in other games, for
// players who can't hear them (or have the sound off). each points to where its sound is, so you can
// tell footsteps are coming from behind you. the same words again (every footstep) keep one caption
// up and follow the newest, rather than stacking. which words:
//   SOUND_CAPTIONS by the sound's name, or else its name ("lava-bubbling" says "Lava bubbling"), so a
//   new sound is captioned without doing anything. '' there leaves a sound out
// left out: npcs talking (the dialogue box already shows the words), the editors' previews, sounds too
// far away to hear, and your own (right where you are: your steps and swings), which would always be up
//
// ponytail: captions are one line each, in a fixed size. a text size setting would scale these, the
// dialogue box and messages together
// ponytail: SOUND_CAPTIONS is here by name. once there are lots of sounds, a caption setting in each
// sound's file (with a row in the sound editor) would keep it with the sound

const SOUND_CAPTIONS = {
  'grass-step': 'Footsteps',
  'dirt-step': 'Footsteps',
  wade: 'Wading',
  splash: 'Splash',
  'lava-splash': 'Lava splash',
};

const CAPTIONS = {
  // how long one stays up after its sound last played, and the last part of that it fades over
  seconds: 2.5,
  fade: 0.6,
  // the most shown at once. the oldest goes
  most: 5,
  // how loud (0 to 1, from distance) a sound has to be to get one
  quietest: 0.05,
  // px from your feet that count as your own sounds
  own: 24,
  textSize: 14,
};

const Captions = {
  // each { words, at, until }: what it says, where its sound is ({ x, y, map } or null for everywhere,
  // like thunder) and when it goes (seconds, millis() / 1000). newest last
  list: [],

  // every sound that plays (Sound.onPlay, sound.js)
  heard(sound, voice) {
    if (!GAME_SETTINGS.captions || Editor.active || !sound.name) return;
    if (voice.channel !== 'world' && voice.channel !== 'effects') return;
    const words = SOUND_CAPTIONS[sound.name] ?? sayName(sound.name);
    if (!words) return;
    const at = voice.at;
    const you = Sound.listener;
    if (at && you) {
      if (Math.max(voice.minVolume, Sound.volumeAt(at, voice.range)) < CAPTIONS.quietest) return;
      if (at.map === you.map && Math.hypot(at.x - you.x, at.y - you.y) < CAPTIONS.own) return;
    }
    this.list = this.list.filter((caption) => caption.words !== words);
    this.list.push({ words, at, until: millis() / 1000 + CAPTIONS.seconds });
    if (this.list.length > CAPTIONS.most) this.list.shift();
  },

  // every frame, over the game (sketch.js). newest at the bottom
  draw() {
    const now = millis() / 1000;
    this.list = this.list.filter((caption) => caption.until > now);
    if (!GAME_SETTINGS.captions || Editor.active) return;
    const you = Sound.listener;
    const h = CAPTIONS.textSize + 10;
    setText(CAPTIONS.textSize, BOLD, RIGHT, CENTER);
    this.list.forEach((caption, i) => {
      const right = GAME_W - 12;
      const y = GAME_H - 12 - (this.list.length - i) * (h + 4);
      const w = textWidth(caption.words) + 16 + (caption.at ? 20 : 0);
      push();
      drawingContext.globalAlpha = Math.min(1, (caption.until - now) / CAPTIONS.fade);
      noStroke();
      fill(0, 0, 0, 200);
      rect(right - w, y, w, h, 4);
      fill(255);
      text(caption.words, right - 8, y + h / 2);
      // an arrow on the left pointing from you to the sound, which follows it as it or you move
      if (caption.at && you && caption.at.map === you.map) {
        translate(right - w + 12, y + h / 2);
        rotate(Math.atan2(caption.at.y - you.y, caption.at.x - you.x));
        triangle(6, 0, -4, -5, -4, 5);
      }
      pop();
    });
  },
};

Sound.onPlay = (sound, voice) => Captions.heard(sound, voice);

// "lava-bubbling" to "Lava bubbling"
function sayName(name) {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
