// distant cousins' sound: calm music under the board and little sounds for finding things, both from the
// squimble music maker (js/squimble-music-maker, loaded in its order once sound's on), the way earth loading
// screens plays it. the music is the maker's gentlest moods with only the beds left in (pads, drones, bass,
// and birds and brooks by day, crickets and owls at night), so nothing in it pulls you away from the tree.
//
// the sounds are notes, not recordings: two quiet players are added to each song but never given anything
// to play in it, a bell (its mood's own) and something plucked, and every sound is played on them in the
// chord the music is on at that moment. so a discovery always lands in tune with what's playing, through
// the same room. page.js says what happened (dcSound.play), this decides how it sounds:
//   found     a creature you hadn't met: a run up the chord. one that died out runs down instead, back in time
//   sprout    new branches coming out: a pluck for each, going up, in time with the cards popping out
//   tap       opening a card you've already found: one soft pluck
//   sparkle   missing ancestors uncovered, starting again: a soft run down the scale
//   star      a new favourite: two high bell notes
//   meet      two put side by side: a note for each, then both together over the root
//   shuffle   surprise me: a quick tumble of notes, like dice
//   hooray    a milestone: a fanfare home
// the music also grows while you explore (the maker's intensity: more of the band comes in with each find)
// and settles again when you stop for a while
const dcSound = (() => {
  const MAKER = 'js/squimble-music-maker/';
  const MOODS_BY = { light: ['calm', 'heavenly', 'nostalgic', 'calm'], dark: ['calm', 'nostalgic', 'underwater', 'wintry'] };
  const SCENERY = { light: ['birds', 'stream', 'leaves', 'birds'], dark: ['crickets', 'owl', 'frogs', 'crickets'] };
  const BEDS = ['pad', 'texture', 'bass'];
  const SONG_MINUTES = 5;
  // how loud it all is: the music under the board, the soft broken chords in it, and the sounds over it
  // (the maker's 0 to 1)
  const VOLUME = 0.4, KEYS = 0.5, CHIME = 0.62, PLUCK = 0.5;
  // the music's intensity at rest, and how much each find brings in
  const REST = 0.5, LIFT = 0.25, SETTLE_AFTER = 45000;

  let player = null, loading = null, now = null, nextSong = null, settle = null, on = false;
  const theme = () => document.documentElement.dataset.dcTheme === 'dark' ? 'dark' : 'light';
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const addScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = fail;
    document.body.append(s);
  });

  function makeSong() {
    const mood = pick(MOODS_BY[theme()]);
    const rng = makeRng(Math.random(), Date.now());
    const song = generateSong(mood, MOODS[mood].style, newSeed(rng));
    song.layers = song.layers.filter(layer => BEDS.includes(layer.role));
    // always the same three, so the intensity ladder is always pad (0), the soft broken chords (0.5) and
    // the bass (1): at rest the pads and the keys play, and finds bring the bass in. (a drone used to be
    // kept too, and the ladder put it first, so at rest it was often one held note on its own for minutes)
    // (the pad and keys in every section, so they tie on the ladder and the bass is always last)
    const all = layer => { for (const section of song.sections) if (!section.play.includes(layer.id)) section.play.push(layer.id); return layer; };
    all(song.layers.find(layer => layer.role === 'pad') || addLayer(song, 'pad', rng));
    if (!song.layers.some(layer => layer.role === 'bass')) all(addLayer(song, 'bass', rng));
    const keys = all(addLayer(song, 'keys', rng));
    keys.pattern = 'broken';
    keys.volume = Math.min(keys.volume, KEYS);
    // the time of day's own scenery, in every section
    let scenery = song.layers.find(layer => layer.role === 'texture');
    if (!scenery) {
      scenery = addLayer(song, 'texture', rng);
      for (const section of song.sections) section.play.push(scenery.id);
    }
    scenery.instrument = pick(SCENERY[theme()]);
    delete scenery.recording;
    song.layers = song.layers.filter(layer => layer.role !== 'texture' || layer === scenery);
    const kept = song.layers.map(layer => layer.id);
    const beds = song.layers.filter(layer => layer.role !== 'bass').map(layer => layer.id);
    for (const section of song.sections) {
      section.play = section.play.filter(id => kept.includes(id));
      // a section that only had the tune in it gets the pads instead of silence
      if (!section.play.length) section.play = beds;
      for (const id in section.use || {}) if (!kept.includes(id)) delete section.use[id];
    }
    // the two who play the sounds: in the band, never in a section
    const chime = addLayer(song, 'bells', rng);
    const pluck = addLayer(song, 'arp', rng);
    chime.volume = CHIME;
    pluck.volume = PLUCK;
    song.fx = { ...song.fx, volume: VOLUME };
    return { written: song, ...playable(song, composeSong(song)), chime: chime.id, pluck: pluck.id };
  }
  // a song has started: it varies each time round, and in a few minutes the next takes over
  function started(song) {
    now = song;
    player.vary = round => playable(song.written, composeSong(song.written, round)).comp;
    clearTimeout(nextSong);
    nextSong = setTimeout(() => change('section'), SONG_MINUTES * 60000);
  }
  function change(at) {
    if (!player?.playing) return;
    const after = makeSong();
    player.queue(after.song, after.comp, at, () => started(after));
  }

  async function start() {
    if (!player) {
      try {
        loading ??= ['instruments.js', 'synth.js', 'moods.js', 'music.js'].reduce((p, f) => p.then(() => addScript(MAKER + f)), Promise.resolve());
        await loading;
        player ??= new MusicPlayer();
      } catch (e) {
        console.warn(e);
        loading = null;
        return false;
      }
      if (!on) return true;
    }
    const first = makeSong();
    player.intensity = REST;
    player.load(first.song, first.comp);
    started(first);
    player.play();
    return true;
  }
  function stop() {
    player?.stop();
    clearTimeout(nextSong);
    now = null;
  }

  // ---------- the sounds ----------

  // the chord sounding now, and the song's scale, as pitch classes
  function harmony() {
    const { song, comp } = player;
    const at = player.playing ? player.songBeat(player.beatAt(player.ctx.currentTime)) : 0;
    const section = comp.sections.find(one => at < one.end - 1e-6) || comp.sections[comp.sections.length - 1];
    const chord = section.chords.find(one => at < one.t + one.dur - 1e-6) || section.chords[section.chords.length - 1];
    const key = mod12(song.key + (section.lift || 0));
    return {
      at,
      chord: new Set(chord.tones.slice(0, 3).map(tone => mod12(chord.root + tone))),
      scale: new Set(SCALES[song.scale].steps.map(step => mod12(key + step))),
      root: chord.root,
    };
  }
  // count notes of a set from about a note, going up (or down)
  const from = (pcs, midi, count, way = 1) => {
    const out = [];
    for (; out.length < count; midi += way) if (pcs.has(mod12(midi))) out.push(midi);
    return out;
  };
  const centre = id => {
    const layer = player.song.layers.find(one => one.id === id);
    return (INSTRUMENTS[layer.instrument]?.home ?? ROLES[layer.role].center) + layer.octave * 12;
  };

  // plays notes ({ layer, s: seconds from now, dur in beats, midi, vel }) at once, on channels of their own
  function playNotes(notes) {
    if (!notes.length) return;
    const { ctx, song } = player;
    const t0 = ctx.currentTime + 0.03, spb = 60 / song.tempo;
    const channels = {};
    let last = 0;
    for (const note of notes) {
      const layer = song.layers.find(one => one.id === note.layer);
      if (!layer) continue;
      if (!channels[layer.id]) {
        channels[layer.id] = makeChannel(player.graph);
        setChannel(channels[layer.id], song, { ...layer, mute: false, solo: true }, ctx.currentTime, false);
      }
      playNote(ctx, channels[layer.id], layer, { midi: note.midi, dur: note.dur, vel: note.vel }, t0 + note.s, spb);
      last = Math.max(last, note.s + note.dur * spb);
    }
    setTimeout(() => Object.values(channels).forEach(channel => closeChannel(channel, player.ctx.currentTime)), (last + 5) * 1000);
  }
  // one of the maker's stingers, at once rather than on the next beat: a click wants an answer now
  function stinger(kind) {
    const h = harmony(), spb = 60 / player.song.tempo;
    playNotes(stingerNotes(player.song, player.comp, kind, h.at).map(n => ({ ...n, s: (n.t - h.at) * spb })));
  }

  const SOUNDS = {
    found({ extinct } = {}) {
      if (!extinct) return stinger('found');
      // down the chord, the last note an octave lower still: deep time
      const h = harmony(), c = now.chime;
      const run = from(h.chord, centre(c) + 7, 4, -1);
      run[3] -= 12;
      playNotes(run.map((midi, i) => ({ layer: c, s: i * 0.11, dur: i === 3 ? 2.5 : 0.5, midi, vel: 0.6 - i * 0.04 })));
    },
    sprout({ count = 3, after = 0, gap = 0.045 } = {}) {
      const h = harmony(), p = now.pluck;
      const notes = from(h.chord, centre(p) - 5, Math.min(count, 10));
      playNotes(notes.map((midi, i) => ({ layer: p, s: after + 0.12 + i * gap, dur: 1, midi, vel: 0.42 + 0.03 * i })));
    },
    tap() {
      const h = harmony(), p = now.pluck;
      playNotes([{ layer: p, s: 0, dur: 1, midi: from(h.chord, centre(p) + 2, 1)[0], vel: 0.3 }]);
    },
    sparkle: () => stinger('sparkle'),
    star() {
      const h = harmony(), c = now.chime;
      const [a, b] = from(h.chord, centre(c) + 5, 2);
      playNotes([{ layer: c, s: 0, dur: 0.5, midi: a, vel: 0.55 }, { layer: c, s: 0.13, dur: 2, midi: b, vel: 0.65 }]);
    },
    meet() {
      const h = harmony(), c = now.chime, p = now.pluck;
      const [a, , b] = from(h.chord, centre(c) - 3, 3);
      playNotes([
        { layer: c, s: 0, dur: 1, midi: a, vel: 0.5 }, { layer: c, s: 0.22, dur: 1, midi: b, vel: 0.5 },
        { layer: c, s: 0.5, dur: 2.5, midi: a, vel: 0.5 }, { layer: c, s: 0.5, dur: 2.5, midi: b, vel: 0.5 },
        { layer: p, s: 0.5, dur: 2.5, midi: near(h.root, centre(p) - 12), vel: 0.55 },
      ]);
    },
    shuffle() {
      const h = harmony(), p = now.pluck, top = centre(p) + 5;
      const notes = from(h.scale, top - 7, 7);
      playNotes([0, 1, 2, 3].map(i => ({ layer: p, s: i * 0.06, dur: 0.25, midi: pick(notes), vel: 0.35 })));
    },
    hooray: () => stinger('hooray'),
    // a wrong answer in a quiz: two falling notes, soft
    ouch: () => stinger('ouch'),
  };

  // the band grows with each find, and settles once you've stopped for a while
  function lift() {
    player.setIntensity(Math.min(1, player.intensity + LIFT));
    clearTimeout(settle);
    settle = setTimeout(() => player?.playing && player.setIntensity(REST), SETTLE_AFTER);
  }

  return {
    get on() { return on; },
    // turns it all on or off; resolves false if the music couldn't load
    async set(want) {
      on = want;
      if (!on) { stop(); return true; }
      const ok = await start();
      if (!ok) on = false;
      return ok;
    },
    play(kind, opts) {
      if (!on || !player?.playing || !now) return;
      try {
        SOUNDS[kind](opts);
        if (kind === 'found' || kind === 'sprout') lift();
      } catch (e) { console.warn(e); }
    },
    // night falls (or day breaks): the next song is the new time of day's, from the next bar
    theme() { if (on) change('bar'); },
    // browsers hold sound back until the page is clicked or a key pressed
    wake() { if (player?.playing && player.ctx.state !== 'running') player.wake(); },
  };
})();
