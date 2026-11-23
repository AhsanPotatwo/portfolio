// squimble music maker: the sky behind the music box, drawn to the music.
//
// every mood has a scene of its own (MOOD_SCENES), made of plain shapes that carry a feeling rather
// than pictures of things: blobs rising and sinking slowly for calm, big stars swelling on the beat for
// happy, shards jabbing out on the kick for metal, strings trembling for tense. flat colours only, in
// the mood's colour sunk into the dark the way the page's sky is (--mm-sky in the css), so it stays
// behind the toy and never fights the words in front of it.
//
// every scene spreads evenly over the whole window and stays put as the page scrolls, so it looks the
// same wherever you are on the page when you pick a mood. under it lies a faint pattern (the ground)
// that slides along slower than the page, like something further back, and scrolling stirs the
// whole sky up for a moment, so moving down the page never shows a flat, dead colour.
//
// it drifts slowly on its own and comes alive while a song plays: the beat, the drums' kicks, snares and
// crashes, and the tune's notes. they're read from the song's own notes as the playhead passes them, not
// listened to, so it costs next to nothing. maker.js calls sky.mood() when the mood changes and
// sky.frame(player) every frame. with reduced motion it's drawn once and left still
'use strict';

const sky = (() => {
  const canvas = document.getElementById('mmSky');
  const c = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  // the page's dark, the same as the css mixes the mood into
  const NIGHT = '#170d07';
  const CREAM = '#fff6d8';
  // W and H in css pixels; U is a size unit, a hundredth of the shorter side, so a phone gets the same
  // picture smaller
  let W = 0;
  let H = 0;
  let U = 1;
  // device pixels to a css pixel, as drawn (capped, to keep big screens light)
  let DPR = 1;
  // the top of the sky: under the site's header while it sticks there (on a phone it scrolls away)
  let T = 0;
  const header = document.querySelector('.site-header');

  // ---------- colours ----------
  // mixed in oklab like the css's color-mix, so the tones sit with the sky exactly
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const gam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  function lab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [lin(n >> 16), lin((n >> 8) & 255), lin(n & 255)];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function mix(a, b, k) {
    const [L, A, B] = lab(a).map((v, i) => v * k + lab(b)[i] * (1 - k));
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return `rgb(${rgb.map((v) => Math.round(Math.min(255, Math.max(0, gam(Math.max(0, v)))))).join()})`;
  }
  const luminance = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map((v) => lin(+v));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // a mood's tones: sky is the page itself (for holes cut in things), faint and soft for anything big,
  // as they sit behind the words: soft comes down for a light mood until the page's soft text (the
  // css's --mm-on-sky-soft) still reads on it at 4.5 to 1 (tests/sky-check.js). mid and glow are for
  // small or thin things. two layers of one mood that cross each other don't share a tone, or they'd
  // melt into one
  function palette(mood) {
    const text = luminance(mix(mood, '#eadcbf', 0.18)) + 0.05;
    let soft = 0.5;
    while (soft > 0.43 && text / (luminance(mix(mood, NIGHT, soft)) + 0.05) < 4.5) soft -= 0.01;
    return { sky: mix(mood, NIGHT, 0.36), faint: mix(mood, NIGHT, Math.min(0.43, soft - 0.03)), soft: mix(mood, NIGHT, soft), mid: mix(mood, NIGHT, 0.66), glow: mix(mood, CREAM, 0.55) };
  }

  // ---------- drawing ----------
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  // how see-through a scene is while it's swapped for another
  let alpha = 1;
  const fade = (a) => { c.globalAlpha = alpha * a; };
  function dot(x, y, r, fill) {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(x, y, Math.max(0, r), 0, TAU);
    c.fill();
  }
  function shape(points, fill) {
    c.fillStyle = fill;
    c.beginPath();
    for (const [x, y] of points) c.lineTo(x, y);
    c.closePath();
    c.fill();
  }
  function ring(x, y, rx, ry, stroke, width) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.beginPath();
    c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
    c.stroke();
  }
  // a five pointed star, its points rounded off a little so it's friendly rather than sharp. edge
  // widens it all round (for the gap drawn under one)
  function star(x, y, r, turn, fill, edge = 0) {
    c.fillStyle = c.strokeStyle = fill;
    c.lineWidth = r * 0.22 + edge;
    c.lineJoin = 'round';
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = turn + (k * Math.PI) / 5 - Math.PI / 2;
      const d = k % 2 ? r * 0.46 : r;
      c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }
  // wedges round a point, every other one filled: light fanning out
  function rays(x, y, n, turn, length, fill) {
    c.fillStyle = fill;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = turn + (i * TAU) / n;
      const w = Math.PI / n / 1.6;
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a - w) * length, y + Math.sin(a - w) * length);
      c.lineTo(x + Math.cos(a + w) * length, y + Math.sin(a + w) * length);
    }
    c.fill();
  }
  // things that live a moment (a ripple, an ember, a wisp), drawn with how far through their life they
  // are. a few dozen at most, so a busy song can't pile them up
  function bits(most = 60) {
    const list = [];
    return {
      add(bit) { if (list.length < most) list.push({ age: 0, life: 1, ...bit }); },
      draw(m, draw) {
        for (let i = list.length - 1; i >= 0; i--) {
          const bit = list[i];
          bit.age += m.dt / bit.life;
          if (bit.age >= 1) list.splice(i, 1);
          else draw(bit, bit.age);
        }
      },
    };
  }
  // now and then while nothing plays, so a scene that waits for the music isn't dead
  function every(low, high) {
    let wait = rnd(low, high);
    return (m) => !m.playing && (wait -= m.dt) < 0 && (wait = rnd(low, high));
  }

  // ---------- patterns ----------
  // the tiles a mood's ground repeats, drawn once onto a tile g device pixels square. u is the size unit
  // in device pixels. each meets itself at the tile's edges, so the pattern has no seams
  const TILES = {
    dots(t, g, u) { spots(t, [[g / 4, g / 4], [g * 0.75, g * 0.75]], 0.4 * u); },
    stipple(t, g, u) {
      // a scatter, the same every time it's made, with each speck copied over the edges it crosses
      let seed = 7;
      const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const list = [];
      for (let i = 0; i < 14; i++) {
        const [x, y, r] = [next() * g, next() * g, (0.15 + next() * 0.35) * u];
        for (const dx of [-g, 0, g]) for (const dy of [-g, 0, g]) list.push([x + dx, y + dy, r]);
      }
      for (const [x, y, r] of list) spots(t, [[x, y]], r);
    },
    rings(t, g, u) {
      t.lineWidth = 0.3 * u;
      for (const [x, y] of [[g / 4, g / 4], [g * 0.75, g * 0.75]]) {
        t.beginPath();
        t.arc(x, y, g * 0.08, 0, TAU);
        t.stroke();
      }
    },
    // circles overlapping their neighbours, a lattice of petals where they cross
    circles(t, g, u) {
      t.lineWidth = 0.25 * u;
      for (const [x, y] of [[0, 0], [g, 0], [0, g], [g, g], [g / 2, g / 2]]) {
        t.beginPath();
        t.arc(x, y, g / 2, 0, TAU);
        t.stroke();
      }
    },
    diag(t, g, u) {
      t.lineWidth = 0.25 * u;
      t.beginPath();
      for (const k of [-1, 0, 1]) {
        t.moveTo(k * g, g);
        t.lineTo(k * g + g, 0);
      }
      t.stroke();
    },
    dashes(t, g, u) {
      t.lineWidth = 0.3 * u;
      t.lineCap = 'round';
      t.beginPath();
      for (const [x, y] of [[g * 0.2, g * 0.3], [g * 0.7, g * 0.8]]) {
        t.moveTo(x, y);
        t.lineTo(x + g * 0.12, y);
      }
      t.stroke();
    },
    grid(t, g, u) {
      t.fillRect(0, 0, g, Math.max(1, 0.2 * u));
      t.fillRect(0, 0, Math.max(1, 0.2 * u), g);
    },
    diamonds(t, g, u) {
      t.lineWidth = 0.25 * u;
      t.beginPath();
      t.moveTo(0, g / 2);
      t.lineTo(g / 2, 0);
      t.lineTo(g, g / 2);
      t.lineTo(g / 2, g);
      t.closePath();
      t.stroke();
    },
    checks(t, g, u) {
      const s = g * 0.12;
      t.beginPath();
      t.roundRect(g / 4 - s, g / 4 - s, s * 2, s * 2, s * 0.3);
      t.roundRect(g * 0.75 - s, g * 0.75 - s, s * 2, s * 2, s * 0.3);
      t.fill();
    },
    tri(t, g, u) {
      const s = g * 0.1;
      t.beginPath();
      t.moveTo(g / 4, g / 4 - s);
      t.lineTo(g / 4 + s, g / 4 + s * 0.8);
      t.lineTo(g / 4 - s, g / 4 + s * 0.8);
      t.moveTo(g * 0.75, g * 0.75 + s);
      t.lineTo(g * 0.75 + s, g * 0.75 - s * 0.8);
      t.lineTo(g * 0.75 - s, g * 0.75 - s * 0.8);
      t.fill();
    },
    waves(t, g, u) {
      t.lineWidth = 0.3 * u;
      t.beginPath();
      for (let x = 0; x <= g; x += g / 16) t.lineTo(x, g / 2 + Math.sin((x / g) * TAU) * g * 0.12);
      t.stroke();
    },
    // a row of steps up and down again
    steps(t, g, u) {
      t.lineWidth = 0.3 * u;
      t.beginPath();
      let y = g * 0.7;
      t.moveTo(0, y);
      for (let k = 0; k < 6; k++) {
        t.lineTo((k + 1) * (g / 6), y);
        y += k < 3 ? -g * 0.13 : g * 0.13;
        if (k < 5) t.lineTo((k + 1) * (g / 6), y);
      }
      t.stroke();
    },
  };
  function spots(t, points, r) {
    t.beginPath();
    for (const [x, y] of points) {
      t.moveTo(x + r, y);
      t.arc(x, y, r, 0, TAU);
    }
    t.fill();
  }

  // ---------- scenes ----------
  // each makes its things once and returns a draw for every frame. m is the music this frame:
  //   dt     seconds since the last frame
  //   go     how fast things drift: slow while nothing plays, full speed while it does
  //   pulse  0 to 1, jumping on the kick (or the beat, for songs without drums) and falling away
  //   kick   the same for kicks only
  //   beat   true on the frame a beat starts (a slow made up one while nothing plays)
  //   hits   what started this frame: { kind: kick, snare, crash, note or bass, midi, vel }
  // positions are fractions of the window, so a resize just works
  const SCENES = {
    // a faint pattern over the whole window, under everything else, so no part of the sky is ever bare.
    // it drifts slowly, and slides as the page scrolls but slower than the page, like something further
    // back. kind: which of TILES, gap: how big a tile is, alpha: how strong, drift: which way it goes,
    // depth: how far back (how much slower than the page it slides)
    ground(p, o) {
      const tile = document.createElement('canvas');
      const [dx, dy] = o.drift || [0.5, -0.3];
      let made = 0;
      let pattern = null;
      let x = rnd(100);
      let y = rnd(100);
      return (m) => {
        const g = Math.max(4, Math.round((o.gap || 12) * U * DPR));
        if (made !== g) {
          made = g;
          tile.width = tile.height = g;
          const t = tile.getContext('2d');
          t.fillStyle = t.strokeStyle = p.mid;
          TILES[o.kind](t, g, U * DPR);
          pattern = c.createPattern(tile, 'repeat');
        }
        const size = g / DPR;
        x = (x + m.dt * m.go * dx * U) % size;
        y = (y + m.dt * m.go * dy * U) % size;
        // (whole device pixels, so the pattern doesn't shimmer as it slides)
        const at = (v) => Math.round((((v % size) + size) % size) * DPR) / DPR;
        pattern.setTransform(new DOMMatrix([1 / DPR, 0, 0, 1 / DPR, at(x), at(y - m.scroll * (calm.matches ? 0 : o.depth || 0.2))]));
        fade(o.alpha || 0.3);
        c.fillStyle = pattern;
        c.fillRect(0, 0, W, H);
        fade(1);
      };
    },

    // big plain shapes floating slowly up the page as if they were lighter than the air, swaying a
    // little and turning as they go, swelling on the kick. kinds: which shapes, size: [smallest, biggest],
    // solid: filled in the big things' tones instead of drawn round
    float(p, o) {
      const kinds = o.kinds || ['ring', 'square', 'tri'];
      const [low, high] = o.size || [3, 7];
      const list = Array.from({ length: o.n || 10 }, (_, i) => ({ x: rnd(), y: rnd(-0.1, 1.1), r: rnd(low, high), turn: rnd(TAU), spin: rnd(-0.15, 0.15), sp: rnd(0.5, 1.1), sway: rnd(TAU), kind: kinds[i % kinds.length], fill: o.solid ? (i % 2 ? p.soft : p.faint) : i % 3 ? p.soft : p.mid }));
      return (m) => {
        c.lineWidth = 0.45 * U;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        for (const q of list) {
          q.y -= m.dt * m.go * q.sp * 0.008 * (o.speed || 1);
          q.sway += m.dt * m.go * q.sp * 0.5;
          q.turn += m.dt * m.go * q.spin;
          if (q.y < -0.1) Object.assign(q, { y: 1.1, x: rnd() });
          const r = q.r * U * (1 + 0.1 * m.pulse);
          c.save();
          c.translate((q.x + 0.012 * Math.sin(q.sway)) * W, q.y * H);
          c.rotate(q.turn);
          c.beginPath();
          if (q.kind === 'ring') c.arc(0, 0, r, 0, TAU);
          else if (q.kind === 'square') c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
          else if (q.kind === 'diamond') {
            c.moveTo(0, -r);
            c.lineTo(r * 0.6, 0);
            c.lineTo(0, r);
            c.lineTo(-r * 0.6, 0);
            c.closePath();
          } else {
            for (let k = 0; k < 3; k++) c.lineTo(Math.cos(k * TAU / 3) * r, Math.sin(k * TAU / 3) * r);
            c.closePath();
          }
          c.restore();
          c.fillStyle = c.strokeStyle = q.fill;
          if (o.solid) c.fill();
          else c.stroke();
        }
      };
    },

    // a lava lamp: big soft blobs rising and sinking past each other, swelling on the kick. the ones the
    // same colour melt together where they touch
    lava(p, o) {
      const n = o.n || 6;
      const blobs = Array.from({ length: n }, (_, i) => ({ x: (i + rnd(0.2, 0.8)) / n, r: rnd(7, 13), ph: rnd(TAU), sp: rnd(0.08, 0.15), wob: rnd(TAU), fill: i % 3 ? p.faint : p.soft }));
      return (m) => {
        for (const b of blobs) {
          b.ph += m.dt * m.go * b.sp * (o.speed || 1);
          b.wob += m.dt * m.go;
          const r = b.r * U * (1 + 0.1 * m.pulse);
          const squash = 0.1 * Math.sin(b.wob);
          c.fillStyle = b.fill;
          c.beginPath();
          c.ellipse(W * b.x + Math.sin(b.ph * 2) * 3 * U, H * (0.5 - 0.62 * Math.cos(b.ph)), r * (1 + squash), r * (1 - squash), 0, 0, TAU);
          c.fill();
        }
      };
    },

    // puffy clouds sailing by and bobbing on the beat, with small lights blinking above for the tune.
    // rays: light from above, turning slowly
    clouds(p, o) {
      const puffs = Array.from({ length: o.n || 5 }, () => ({ x: rnd(-0.1, 1.1), y: rnd(0.08, 0.9), s: rnd(0.7, 1.3), sp: rnd(0.6, 1.2) }));
      const blinks = bits();
      let turn = 0;
      return (m) => {
        if (o.rays) {
          turn += m.dt * m.go * 0.03;
          rays(W / 2, -H * 0.2, 14, turn, Math.hypot(W, H) * 1.3, p.faint);
        }
        for (const q of puffs) {
          q.x += m.dt * m.go * q.sp * 0.006 * (o.speed || 1);
          if (q.x > 1.2) Object.assign(q, { x: -0.2, y: rnd(0.08, 0.9) });
          const s = q.s * U;
          const x = q.x * W;
          const y = q.y * H - m.pulse * 1.5 * s;
          c.fillStyle = p.soft;
          c.beginPath();
          c.roundRect(x - 11 * s, y + 1, 23 * s, 6 * s, 3 * s);
          c.fill();
          dot(x - 6.5 * s, y + 2.5 * s, 4 * s, p.soft);
          dot(x, y, 6.5 * s, p.soft);
          dot(x + 6.5 * s, y + 2 * s, 4.8 * s, p.soft);
        }
        for (const hit of m.hits) if (hit.kind === 'note') blinks.add({ x: rnd(), y: rnd(), r: 0.5 + hit.vel * 0.6, life: 0.8 });
        blinks.draw(m, (b, age) => dot(b.x * W, b.y * H, b.r * U * Math.sin(age * Math.PI), p.mid));
      };
    },

    // a sun, or just the light from one. at is where, as fractions of the window. rays turn round it
    // (fanning over the whole page), stripes cut it like an 80s sunset, beams are spotlights swinging
    // from below. disc: false for the light alone
    sun(p, o) {
      const [fx, fy] = o.at || [0.86, 0.16];
      let turn = 0;
      let swing = 0;
      return (m) => {
        turn += m.dt * m.go * 0.04;
        swing += m.dt * m.go * (0.6 + m.pulse);
        const x = W * fx;
        const y = H * fy;
        const r = (o.size || 9) * U * (1 + 0.05 * m.pulse);
        if (o.rays) rays(x, y, o.rays, turn, Math.hypot(W, H) * 1.3, p.faint);
        if (o.beams) {
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + 0.45 * Math.sin(swing * 0.5 + i * 2.1);
            const from = [W * (0.2 + i * 0.3), H * 1.05];
            const length = H * 1.3;
            shape([from, [from[0] + Math.cos(a - 0.09) * length, from[1] + Math.sin(a - 0.09) * length], [from[0] + Math.cos(a + 0.09) * length, from[1] + Math.sin(a + 0.09) * length]], p.faint);
          }
        }
        if (o.disc === false) return;
        dot(x, y, r * 1.25, p.soft);
        dot(x, y, r, p.mid);
        if (o.stripes) {
          c.fillStyle = p.soft;
          const slide = (swing * 0.04) % 0.17;
          for (let k = 0; k < 6; k++) {
            const at = 0.05 + k * 0.17 + slide;
            const half = Math.sqrt(Math.max(0, 1 - at * at)) * r;
            if (at < 1) c.fillRect(x - half, y + at * r, half * 2, r * 0.03 * (k + 1.5));
          }
        }
      };
    },

    // big rounded five pointed stars floating up through the page, turning slowly, swelling on the beat
    stars5(p, o) {
      const n = o.n || 18;
      // the big ones behind, a few small brighter ones in front
      const list = Array.from({ length: n }, (_, i) => {
        const small = i >= n - 3;
        return { x: rnd(), y: rnd(-0.1, 1.1), r: small ? rnd(2, 3.5) : rnd(6, 12), turn: rnd(TAU), spin: rnd(-0.15, 0.15), sp: rnd(0.6, 1.2), fill: small ? p.mid : i % 2 ? p.soft : p.faint };
      });
      return (m) => {
        for (const s of list) {
          s.y -= m.dt * m.go * s.sp * 0.012;
          s.x += m.dt * m.go * s.sp * 0.003;
          if (s.y < -0.15) Object.assign(s, { y: 1.15, x: rnd() });
          if (s.x > 1.1) s.x = -0.1;
          s.turn += m.dt * m.go * s.spin;
          // a gap the colour of the sky round each, so two the same colour that cross still read as two
          // stars, one in front of the other, not one odd shape
          const r = s.r * U * (1 + 0.14 * m.pulse);
          star(s.x * W, s.y * H, r, s.turn, p.sky, 1.6 * U);
          star(s.x * W, s.y * H, r, s.turn, s.fill);
        }
      };
    },

    // dots all over the page that hop on the kick, stretching as they go up and squashing as they land.
    // size: how big the biggest are
    hop(p, o) {
      const dots = Array.from({ length: o.n || 14 }, (_, i) => ({ x: rnd(0.02, 0.98), y: rnd(0.06, 0.98), r: rnd(1, o.size || 2.6), h: 0, v: 0, squash: 0, fill: i % 3 ? p.soft : p.mid }));
      const idle = every(0.4, 1.2);
      const jump = (d, power) => { if (d.h > -U * 0.5) d.v = -power * U; };
      return (m) => {
        for (const hit of m.hits) {
          if (hit.kind === 'kick') for (const d of dots) if (Math.random() < 0.55) jump(d, rnd(30, 55) * hit.vel);
          if (hit.kind === 'snare' && Math.random() < 0.5) jump(pick(dots), 40);
          if (hit.kind === 'note' && Math.random() < 0.2) jump(pick(dots), 26);
        }
        if (idle(m)) jump(pick(dots), 26);
        for (const d of dots) {
          d.v += 300 * U * m.dt;
          d.h += d.v * m.dt;
          if (d.h >= 0) {
            if (d.v > 8 * U) d.squash = Math.min(1, d.v / (60 * U));
            d.h = 0;
            d.v = 0;
          }
          d.squash *= Math.exp(-m.dt * 9);
          const r = d.r * U;
          const stretch = Math.min(0.3, Math.abs(d.v) / (150 * U));
          const sx = 1 + 0.45 * d.squash - stretch * 0.5;
          const sy = 1 - 0.35 * d.squash + stretch;
          c.fillStyle = d.fill;
          c.beginPath();
          // (squashed from the bottom, so it sits where it landed)
          c.ellipse(d.x * W, d.y * H + d.h + r - r * sy, r * sx, r * sy, 0, 0, TAU);
          c.fill();
        }
      };
    },

    // two little flocks of triangles in a v, sweeping round the page together, beating on the kick
    flock(p, o) {
      const n = o.n || 9;
      const flocks = [rnd(100), rnd(100)];
      const lead = (time, k) => [0.5 + 0.44 * Math.sin(time * 0.11 + k * 3), 0.5 + 0.4 * Math.sin(time * 0.17 + 1 + k * 2)];
      return (m) => {
        flocks.forEach((t, k) => {
          flocks[k] = t += m.dt * m.go * (1 + 0.5 * m.pulse);
          for (let i = 0; i < n; i++) {
            // each follows the leader's path a little behind, out to one side
            const back = t - Math.ceil(i / 2) * 0.9;
            const [x, y] = lead(back, k);
            const [x2, y2] = lead(back + 0.05, k);
            const a = Math.atan2((y2 - y) * H, (x2 - x) * W);
            const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 3 * U;
            const px = x * W - Math.sin(a) * side;
            const py = y * H + Math.cos(a) * side;
            const r = 1.5 * U * (1 + 0.25 * m.pulse);
            shape([[px + Math.cos(a) * r * 1.7, py + Math.sin(a) * r * 1.7], [px + Math.cos(a + 2.5) * r, py + Math.sin(a + 2.5) * r], [px + Math.cos(a - 2.5) * r, py + Math.sin(a - 2.5) * r]], i ? p.mid : p.glow);
          }
        });
      };
    },

    // streaks rushing past, faster on the kick
    streaks(p, o) {
      const lines = Array.from({ length: o.n || 22 }, () => ({ x: rnd(), y: rnd(), length: rnd(0.04, 0.14), sp: rnd(0.6, 1.4), fill: Math.random() < 0.3 ? p.soft : p.faint }));
      let rush = 0;
      return (m) => {
        rush = Math.max(rush * Math.exp(-m.dt * 4), m.pulse);
        for (const s of lines) {
          s.x -= m.dt * m.go * s.sp * (o.speed || 0.25) * (1 + 2.5 * rush);
          if (s.x < -s.length) Object.assign(s, { x: 1, y: rnd() });
          c.fillStyle = s.fill;
          c.beginPath();
          c.roundRect(s.x * W, s.y * H, s.length * W, 0.7 * U, 0.35 * U);
          c.fill();
        }
      };
    },

    // stars, each lit by a note of the tune: high notes light high stars. a crash sends one shooting.
    // drift: fireflies instead, wandering about
    stars(p, o) {
      const list = Array.from({ length: o.n || 40 }, () => ({ x: rnd(), y: rnd(), r: rnd(0.25, 0.65), ph: rnd(TAU), flash: 0 })).sort((a, b) => a.y - b.y);
      const shooting = bits(4);
      let t = 0;
      return (m) => {
        t += m.dt * m.go;
        for (const hit of m.hits) {
          if (hit.kind === 'note') {
            const at = Math.min(list.length - 1, Math.max(0, Math.round(((84 - hit.midi) / 36) * (list.length - 1) + rnd(-3, 3))));
            list[at].flash = 0.6 + 0.4 * hit.vel;
          }
          if (hit.kind === 'crash' && !o.drift) shooting.add({ x: rnd(0.1, 0.7), y: rnd(0.05, 0.6), life: 0.8 });
        }
        if (!m.playing && Math.random() < m.dt * 0.6) pick(list).flash = 0.5;
        for (const s of list) {
          s.flash = Math.max(0, s.flash - m.dt * 1.4);
          let x = s.x * W;
          let y = s.y * H;
          if (o.drift) {
            x += Math.sin(t * 0.21 + s.ph) * 6 * U;
            y += Math.sin(t * 0.17 + s.ph * 2) * 4 * U;
          }
          if (s.flash > 0.05) dot(x, y, (s.r + 1.1 * s.flash) * U, p.glow);
          else dot(x, y, (s.r + 0.12 * Math.sin(t * 1.5 + s.ph)) * U, o.drift ? p.soft : p.mid);
        }
        shooting.draw(m, (b, age) => {
          const x = (b.x + age * 0.25) * W;
          const y = (b.y + age * 0.15) * H;
          fade(1 - age);
          c.strokeStyle = p.glow;
          c.lineWidth = 0.5 * U;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 0.06 * W, y - 0.036 * W);
          c.stroke();
          fade(1);
        });
      };
    },

    // a ringed planet bobbing, with a moon going round it
    planet(p) {
      let a = 0;
      return (m) => {
        a += m.dt * m.go * 0.25;
        const x = W * 0.84;
        const y = H * 0.3 + Math.sin(a) * 2 * U - m.pulse * U;
        const r = 9 * U;
        const moon = () => dot(x + Math.cos(a * 2) * r * 2.6, y + Math.sin(a * 2) * r * 0.8, 1.6 * U, p.mid);
        if (Math.sin(a * 2) < 0) moon();
        c.strokeStyle = p.mid;
        c.lineWidth = 1.4 * U;
        c.beginPath();
        c.ellipse(x, y, r * 1.9, r * 0.45, -0.3, Math.PI, TAU);
        c.stroke();
        dot(x, y, r, p.soft);
        dot(x - r * 0.35, y - r * 0.2, r * 0.18, p.faint);
        dot(x + r * 0.3, y + r * 0.35, r * 0.12, p.faint);
        c.beginPath();
        c.ellipse(x, y, r * 1.9, r * 0.45, -0.3, 0, Math.PI);
        c.stroke();
        if (Math.sin(a * 2) >= 0) moon();
      };
    },

    // a crescent moon
    moon(p) {
      return (m) => {
        const x = W * 0.82;
        const y = H * 0.22 - m.pulse * 0.6 * U;
        const r = 7 * U;
        dot(x, y, r, p.mid);
        dot(x + r * 0.42, y - r * 0.22, r * 0.86, p.sky);
      };
    },

    // broken rings turning slowly round two hidden centres, at different speeds and both ways, a note
    // lighting one now and then
    arcs(p, o) {
      const list = (o.centres || [[0.86, 0.24], [0.1, 0.78]]).flatMap(([x, y]) => Array.from({ length: 4 }, (_, k) => ({ x, y, r: 9 + k * 6, span: rnd(1, 3.4), a: rnd(TAU), sp: (k % 2 ? 1 : -1) * rnd(0.05, 0.14), end: Math.random() < 0.6, lit: 0 })));
      return (m) => {
        for (const hit of m.hits) if (hit.kind === 'note' && Math.random() < 0.3) pick(list).lit = 1;
        c.lineCap = 'round';
        for (const q of list) {
          q.a += m.dt * m.go * q.sp * (1 + m.pulse);
          q.lit = Math.max(0, q.lit - m.dt * 1.5);
          const r = q.r * U;
          c.strokeStyle = q.lit > 0.1 ? p.mid : p.soft;
          c.lineWidth = 0.45 * U;
          c.beginPath();
          c.arc(q.x * W, q.y * H, r, q.a, q.a + q.span);
          c.stroke();
          if (q.end) dot(q.x * W + Math.cos(q.a + q.span) * r, q.y * H + Math.sin(q.a + q.span) * r, 0.9 * U, p.mid);
        }
      };
    },

    // a few loops of small dots wandering the page, faster with the music, bursting on notes and
    // falling away
    swirl(p) {
      const wands = [0, 1, 2].map((i) => ({ ph: i * 2.1, sp: rnd(0.5, 0.8), x: [0.15, 0.85, 0.5][i], y: [0.25, 0.5, 0.8][i] }));
      const trail = bits(90);
      const at = (w) => [(w.x + 0.12 * Math.sin(w.ph * 1.3)) * W, (w.y + 0.15 * Math.sin(w.ph * 0.9 + 1)) * H];
      return (m) => {
        for (const w of wands) {
          w.ph += m.dt * m.go * w.sp * (1 + m.pulse);
          const [x, y] = at(w);
          if (Math.random() < m.go * 0.5) trail.add({ x, y, r: rnd(0.3, 0.7), life: 1.2 });
        }
        for (const hit of m.hits) {
          if (hit.kind !== 'note' || Math.random() < 0.6) continue;
          const [x, y] = at(pick(wands));
          for (let i = 0; i < 4; i++) trail.add({ x: x + rnd(-5, 5) * U, y: y + rnd(-5, 5) * U, r: rnd(0.5, 0.9), life: 0.8 });
        }
        trail.draw(m, (b, age) => dot(b.x, b.y + age * 4 * U, b.r * U * (1 - age), age < 0.4 ? p.glow : p.mid));
      };
    },

    // things falling: rain, snow, leaves, petals, ash or dust. a gust on the kick
    fall(p, o) {
      const kind = o.kind;
      const fresh = (y) => ({ x: rnd(), y, s: rnd(0.6, 1.3) * (o.size || 1), rot: rnd(TAU), spin: rnd(-1.5, 1.5), ph: rnd(TAU), fill: Math.random() < 0.35 ? p.soft : p.faint });
      const list = Array.from({ length: o.n || 30 }, () => fresh(rnd(-0.05, 1)));
      const speed = { rain: 0.55, snow: 0.05, leaf: 0.06, petal: 0.05, ash: 0.025, dust: 0.008 }[kind] * (o.speed || 1);
      let gust = 0;
      return (m) => {
        gust = Math.max(gust * Math.exp(-m.dt * 2), m.pulse);
        c.lineCap = 'round';
        for (const q of list) {
          q.y += m.dt * m.go * speed * q.s * (kind === 'rain' ? 1 : 1 + gust);
          q.ph += m.dt * m.go;
          q.rot += m.dt * m.go * q.spin * (1 + 2 * gust);
          if (kind === 'dust') q.x = (q.x + m.dt * m.go * 0.012 * q.s * (1 + gust) + 1) % 1;
          if (q.y > 1.05) Object.assign(q, fresh(-0.05));
          const x = (q.x + (kind === 'rain' || kind === 'dust' ? 0 : Math.sin(q.ph) * 0.012 + gust * 0.008)) * W;
          const y = q.y * H;
          const s = q.s * U;
          if (kind === 'rain') {
            c.strokeStyle = q.fill;
            c.lineWidth = 0.35 * U;
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x - 0.8 * s, y - 3.5 * s);
            c.stroke();
          } else if (kind === 'snow' && q.s > 1) {
            c.strokeStyle = p.mid;
            c.lineWidth = 0.3 * U;
            c.beginPath();
            for (let k = 0; k < 3; k++) {
              const a = q.rot + (k * Math.PI) / 3;
              c.moveTo(x - Math.cos(a) * 1.6 * s, y - Math.sin(a) * 1.6 * s);
              c.lineTo(x + Math.cos(a) * 1.6 * s, y + Math.sin(a) * 1.6 * s);
            }
            c.stroke();
          } else if (kind === 'snow' || kind === 'dust') dot(x, y, (kind === 'snow' ? 0.5 : 0.3) * s, kind === 'snow' ? p.mid : q.fill);
          else {
            c.save();
            c.translate(x, y);
            c.rotate(q.rot);
            // leaves and petals flip over as they fall
            c.scale(1, kind === 'ash' ? 1 : Math.cos(q.ph * 1.3));
            const r = (kind === 'leaf' ? 1.8 : kind === 'petal' ? 1.1 : 0.45) * s;
            c.fillStyle = kind === 'ash' ? q.fill : q.fill === p.soft ? p.mid : p.soft;
            c.beginPath();
            if (kind === 'ash') c.rect(-r, -r, r * 2, r * 2);
            else if (kind === 'leaf') {
              c.moveTo(-r, 0);
              c.quadraticCurveTo(0, -r * 0.8, r, 0);
              c.quadraticCurveTo(0, r * 0.8, -r, 0);
            } else {
              c.moveTo(0, r * 0.7);
              c.quadraticCurveTo(-r * 1.1, 0, -r * 0.35, -r * 0.7);
              c.lineTo(0, -r * 0.4);
              c.lineTo(r * 0.35, -r * 0.7);
              c.quadraticCurveTo(r * 1.1, 0, 0, r * 0.7);
            }
            c.fill();
            c.restore();
          }
        }
      };
    },

    // long thin shards all over the page, pointing every way, that jab out on the kick and the snare and
    // all at once on a crash. ragged: lopsided
    shards(p, o) {
      const list = Array.from({ length: o.n || 16 }, (_, i) => ({ x: rnd(), y: rnd(), a: rnd(TAU), spin: rnd(-0.05, 0.05), length: rnd(5, 13), width: rnd(1.2, 2.4), lean: o.ragged ? rnd(-0.6, 0.6) : 0, jab: 0, fill: i % 4 === 0 ? p.mid : i % 2 ? p.soft : p.faint }));
      return (m) => {
        for (const hit of m.hits) {
          if (hit.kind === 'kick') for (const s of list) if (Math.random() < 0.4) s.jab = Math.max(s.jab, hit.vel);
          if (hit.kind === 'snare') pick(list).jab = 1;
          if (hit.kind === 'crash') for (const s of list) s.jab = 1;
        }
        if (m.beat && !m.playing) pick(list).jab = 0.5;
        for (const s of list) {
          s.jab *= Math.exp(-m.dt * 7);
          s.a += m.dt * m.go * s.spin;
          const x = s.x * W;
          const y = s.y * H;
          const l = s.length * U * (1 + 0.7 * s.jab);
          const w = s.width * U;
          const [ca, sa] = [Math.cos(s.a), Math.sin(s.a)];
          // a long point forward, a short one back
          shape([[x + ca * l, y + sa * l], [x - sa * w * (1 + s.lean), y + ca * w * (1 + s.lean)], [x - ca * l * 0.3, y - sa * l * 0.3], [x + sa * w * (1 - s.lean), y - ca * w * (1 - s.lean)]], s.fill);
        }
      };
    },

    // strings stretched top to bottom, trembling all the time and shaking harder on the kick and when
    // the tune plays near them (low notes on the left, high on the right)
    strings(p, o) {
      const n = o.n || 7;
      const list = Array.from({ length: n }, (_, i) => ({ x: (i + rnd(0.3, 0.7)) / n, amp: 0, ph: rnd(TAU), k: 1 + (i % 3) }));
      return (m) => {
        for (const hit of m.hits) {
          if (hit.kind === 'kick') for (const s of list) s.amp = Math.max(s.amp, 0.6 * hit.vel);
          else if (hit.kind === 'note') {
            const s = list[Math.min(n - 1, Math.max(0, Math.round(((hit.midi - 48) / 36) * (n - 1))))];
            s.amp = Math.max(s.amp, hit.vel);
          }
        }
        c.lineWidth = 0.35 * U;
        for (const s of list) {
          s.amp = Math.max(s.amp * Math.exp(-m.dt * 2.5), 0.08);
          // (as fast however slow the song: it's a tremble, not a sway)
          s.ph += m.dt * 26;
          const wobble = Math.sin(s.ph) * s.amp * 2.2 * U;
          c.strokeStyle = s.amp > 0.4 ? p.mid : p.soft;
          c.beginPath();
          for (let y = 0; y <= H + 16; y += 16) c.lineTo(s.x * W + wobble * Math.sin((y / H) * Math.PI * s.k), y);
          c.stroke();
        }
      };
    },

    // a tunnel of frames rushing out at you from the middle, faster on the kick, each kick sending a
    // bright one through
    tunnel(p) {
      const n = 9;
      const bright = bits(8);
      let z = 0;
      const frame = (d, stroke) => {
        const s = d ** 2.4 * 1.15;
        c.strokeStyle = stroke;
        c.lineWidth = (0.2 + d * 0.6) * U;
        c.strokeRect(W / 2 - (W * s) / 2, H * 0.45 - (H * s) / 2, W * s, H * s);
      };
      return (m) => {
        z = (z + m.dt * m.go * 0.12 * (1 + 2 * m.pulse)) % 1;
        c.strokeStyle = p.faint;
        c.lineWidth = 0.3 * U;
        c.beginPath();
        for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
          c.moveTo(W / 2, H * 0.45);
          c.lineTo(x, y);
        }
        c.stroke();
        for (let k = 0; k < n; k++) frame((k + (z * n) % 1) / n, p.soft);
        for (const hit of m.hits) if (hit.kind === 'kick' || hit.kind === 'snare') bright.add({ life: 1.4 });
        bright.draw(m, (b, age) => frame(age, p.mid));
      };
    },

    // bands across the whole page sliding slowly down, thin at the top and thicker lower, like the
    // stripes of an 80s sunset carried on past the sun
    stripes(p) {
      let ph = 0;
      return (m) => {
        ph = (ph + m.dt * m.go * 0.06) % 1;
        c.fillStyle = p.faint;
        for (let k = 0; k < 14; k++) {
          const d = (k + ph) / 14;
          c.fillRect(0, d ** 1.5 * H * 1.05, W, (0.15 + d * 1.6) * U * (1 + 0.5 * m.pulse));
        }
      };
    },

    // thin curls rising and fading all over the page, like smoke
    wisps(p, o) {
      const n = o.n || 7;
      const list = bits(20);
      const add = (age = 0) => list.add({ x: rnd(0.02, 0.98), y: rnd(0.1, 1.15), life: rnd(7, 11), ph: rnd(TAU), length: rnd(14, 24), age });
      for (let i = 0; i < n; i++) add(rnd(0.8));
      return (m) => {
        if (Math.random() < (m.dt * n) / 9) add();
        c.lineCap = 'round';
        list.draw(m, (b, age) => {
          fade(Math.sin(age * Math.PI));
          c.strokeStyle = p.soft;
          c.lineWidth = 0.5 * U * (1 + 0.3 * m.pulse);
          const base = (b.y - age * 0.25) * H;
          c.beginPath();
          for (let k = 0; k <= 20; k++) {
            const f = k / 20;
            c.lineTo(b.x * W + Math.sin(f * 5 + b.ph + age * 6) * (1 + f * 3) * U, base - f * b.length * U);
          }
          c.stroke();
          fade(1);
        });
      };
    },

    // columns of chevrons marching up the page, a step on every beat
    chevrons(p, o) {
      const n = o.n || 6;
      const cols = Array.from({ length: n }, (_, i) => ({ x: (i + rnd(0.25, 0.75)) / n, off: rnd(), fill: i % 3 ? p.soft : p.mid }));
      let step = 0;
      let target = 0;
      return (m) => {
        if (m.beat) target += 1;
        step += (target - step) * (1 - Math.exp(-m.dt * 12));
        const gap = 16 * U;
        const w = 3 * U;
        c.lineWidth = 0.8 * U;
        c.lineJoin = c.lineCap = 'round';
        for (const col of cols) {
          // a quarter of the gap a beat (the pattern repeats every gap, so it wraps round unseen)
          const shift = ((step * 0.25 + col.off) % 1) * gap;
          const x = col.x * W;
          c.strokeStyle = col.fill;
          c.beginPath();
          for (let y = H + gap - shift; y > -gap; y -= gap) {
            c.moveTo(x - w, y + w * 0.7);
            c.lineTo(x, y);
            c.lineTo(x + w, y + w * 0.7);
          }
          c.stroke();
        }
      };
    },

    // pairs of dots turning round each other, a third of a turn a beat: once round a bar of three
    waltz(p, o) {
      const pairs = Array.from({ length: o.n || 7 }, () => ({ x: rnd(), y: rnd(), r: rnd(1.4, 2.4), gap: rnd(2.5, 4), ph: rnd(TAU), drift: rnd(TAU), way: Math.random() < 0.5 ? 1 : -1 }));
      let turn = 0;
      let target = 0;
      return (m) => {
        if (m.beat) target += TAU / 3;
        turn += (target - turn) * (1 - Math.exp(-m.dt * 6));
        for (const q of pairs) {
          q.drift += m.dt * m.go * 0.05;
          const x = (q.x + 0.03 * Math.sin(q.drift)) * W;
          const y = (q.y + 0.03 * Math.cos(q.drift * 1.3)) * H;
          const a = q.ph + turn * q.way;
          const d = q.gap * U;
          const r = q.r * U * (1 + 0.15 * m.pulse);
          dot(x + Math.cos(a) * d, y + Math.sin(a) * d, r, p.soft);
          dot(x - Math.cos(a) * d, y - Math.sin(a) * d, r * 0.8, p.mid);
        }
      };
    },

    // sparks rising all over the page and dying out, more of them on the kick
    embers(p, o) {
      const list = bits(o.most || 70);
      const rise = (count, old) => { for (let i = 0; i < count; i++) list.add({ x: rnd(), y: rnd(0.15, 1.15), life: rnd(2.5, 4.5), r: rnd(0.4, 1), ph: rnd(TAU), age: old ? rnd() : 0 }); };
      rise(o.start || 25, true);
      return (m) => {
        if (Math.random() < m.dt * (o.rate || 6) * m.go) rise(1);
        for (const hit of m.hits) {
          if (hit.kind === 'kick') rise(Math.round(3 * hit.vel));
          if (hit.kind === 'note' && Math.random() < 0.3) rise(1);
        }
        list.draw(m, (b, age) => {
          const x = b.x * W + Math.sin(age * 7 + b.ph) * 2 * U;
          const y = (b.y - age * 0.3) * H;
          const r = b.r * (o.size || 1) * U * Math.min(1, age * 6) * (1 - age * 0.7);
          shape([[x, y - r * 1.4], [x + r, y], [x, y + r * 1.4], [x - r, y]], age < 0.4 ? p.glow : p.mid);
        });
      };
    },

    // grains blowing across the whole page in gusts, sheets of it sweeping by behind
    storm(p, o) {
      const list = Array.from({ length: o.n || 150 }, (_, i) => ({ x: rnd(), y: rnd(), sp: rnd(0.6, 1.4), ph: rnd(TAU), long: Math.random() < 0.55, fill: i % 4 === 0 ? p.mid : p.soft }));
      const sheets = Array.from({ length: 3 }, () => ({ x: rnd(), y: rnd(0.1, 0.9), w: rnd(0.3, 0.6), h: rnd(4, 8) }));
      let gust = 0;
      return (m) => {
        gust = Math.max(gust * Math.exp(-m.dt * 1.5), m.pulse);
        const speed = (o.speed || 0.12) * (1 + 1.5 * gust);
        c.fillStyle = p.faint;
        c.beginPath();
        for (const s of sheets) {
          s.x += m.dt * m.go * speed * 0.6;
          if (s.x > 1) Object.assign(s, { x: -s.w, y: rnd(0.1, 0.9) });
          c.roundRect(s.x * W, s.y * H, s.w * W, s.h * U, (s.h * U) / 2);
        }
        c.fill();
        c.lineCap = 'round';
        c.lineWidth = 0.3 * U;
        for (const q of list) {
          q.x += m.dt * m.go * speed * q.sp;
          q.ph += m.dt * m.go * 1.5;
          if (q.x > 1.05) Object.assign(q, { x: -0.05, y: rnd() });
          const x = q.x * W;
          const y = q.y * H + Math.sin(q.ph) * 1.5 * U;
          if (q.long) {
            c.strokeStyle = q.fill;
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x - (2 + 8 * gust) * U * q.sp, y);
            c.stroke();
          } else dot(x, y, 0.35 * U * q.sp, q.fill);
        }
      };
    },

    // stepped lines drifting across the page, up the steps and down again, standing taller on the drums
    zigzags(p, o) {
      const list = Array.from({ length: o.n || 8 }, (_, i) => ({ x: rnd(), y: rnd(0.05, 0.95), steps: 3 + Math.floor(rnd(3)), sp: rnd(0.5, 1) * (i % 2 ? 1 : -1), lift: 0, fill: i % 3 ? p.soft : p.mid }));
      return (m) => {
        for (const hit of m.hits) if (hit.kind === 'kick' || hit.kind === 'snare') pick(list).lift = 1;
        // while nothing plays one stands up slowly instead of jumping, as there's no drum to jump to
        if (m.beat && !m.playing) pick(list).aim = 0.6;
        c.lineWidth = 0.5 * U;
        c.lineJoin = 'miter';
        c.lineCap = 'butt';
        for (const q of list) {
          q.x += m.dt * m.go * q.sp * 0.006;
          if (q.x > 1.15) q.x = -0.15;
          if (q.x < -0.15) q.x = 1.15;
          q.lift *= Math.exp(-m.dt * 5);
          if (q.aim) {
            q.lift = Math.max(q.lift, q.lift + (q.aim - q.lift) * (1 - Math.exp(-m.dt * 8)));
            q.aim *= Math.exp(-m.dt * 2.5);
          }
          const s = 1.6 * U;
          const rise = s * (1 + 0.8 * q.lift);
          let x = q.x * W - 2 * q.steps * s;
          let y = q.y * H;
          c.strokeStyle = q.fill;
          c.beginPath();
          c.moveTo(x, y);
          for (let twice = 0; twice < 2; twice++) {
            for (let k = 0; k < q.steps * 2; k++) {
              x += s;
              c.lineTo(x, y);
              y += k < q.steps ? -rise : rise;
              c.lineTo(x, y);
            }
          }
          c.stroke();
        }
      };
    },

    // wavy lines in rows down the whole page, rolling like a swell, rising higher on the kick
    swell(p, o) {
      let ph = 0;
      const gap = o.gap || 12;
      return (m) => {
        ph += m.dt * m.go * (o.speed || 0.6);
        const amp = (o.amp || 1.4) * U * (1 + 0.7 * m.pulse);
        c.lineWidth = 0.4 * U;
        c.lineCap = 'round';
        let row = 0;
        for (let y = gap * U * 0.5; y < H + gap * U; y += gap * U, row++) {
          c.strokeStyle = row % 3 ? p.faint : p.soft;
          c.beginPath();
          for (let x = -20; x <= W + 20; x += 20) c.lineTo(x, y + Math.sin(x / (9 * U) + ph + row * 0.9) * amp + Math.sin(x / (23 * U) - ph * 0.6 + row) * amp * 0.6);
          c.stroke();
        }
      };
    },

    // the surface seen from under it, hanging from the top of the window and swelling on the kick
    waves(p) {
      let ph = 0;
      return (m) => {
        ph += m.dt * m.go;
        const swell = 1 + 0.6 * m.pulse;
        [p.faint, p.soft, p.mid].forEach((fill, i) => {
          const base = T + (11 - i * 3.5) * U;
          c.fillStyle = fill;
          c.beginPath();
          c.moveTo(0, 0);
          for (let x = 0; x <= W + 24; x += 24) c.lineTo(x, base - (1.6 * U * swell * Math.sin((x / W) * Math.PI * (3 + i) + ph * (1 + i * 0.3) + i * 2) + U * Math.sin((x / W) * TAU * 1.3 - ph * 0.5 + i)));
          c.lineTo(W + 24, 0);
          c.fill();
        });
      };
    },

    // bubbles wobbling up the page, one for some of the tune's notes
    bubbles(p, o) {
      const list = bits(70);
      const blow = (r, old) => list.add({ x: rnd(0.02, 0.98), life: rnd(4, 7), r, ph: rnd(TAU), age: old ? rnd() : 0 });
      for (let i = 0; i < 12; i++) blow(rnd(0.6, 1.4), true);
      return (m) => {
        if (Math.random() < m.dt * (o.rate || 1.2) * m.go) blow(rnd(0.6, 1.4));
        for (const hit of m.hits) if (hit.kind === 'note' && Math.random() < 0.35) blow(0.8 + hit.vel);
        list.draw(m, (b, age) => {
          const x = b.x * W + Math.sin(age * 10 + b.ph) * 1.5 * U;
          const y = (1.04 - age * 1.1) * H;
          ring(x, y, b.r * U, b.r * U, p.mid, 0.3 * U);
          dot(x - b.r * U * 0.35, y - b.r * U * 0.35, b.r * U * 0.22, p.glow);
        });
      };
    },

    // rings spreading out where notes fall, like drops on a pond (flat) or gongs. on: kick for the kick
    // alone
    ripples(p, o) {
      const rings = bits(40);
      const idle = every(0.8 / (o.often || 1), 2 / (o.often || 1));
      const drop = (power) => rings.add({ x: rnd(), y: rnd(0.05, 0.95), r: (6 + 10 * power) * (o.size || 1), life: 2 + power * 1.5 });
      return (m) => {
        for (const hit of m.hits) if (hit.kind === 'kick' || (o.on !== 'kick' && hit.kind === 'note' && Math.random() < 0.5)) drop(hit.vel);
        if (idle(m)) drop(0.4);
        rings.draw(m, (b, age) => {
          fade(1 - age);
          for (const k of [1, 0.6]) {
            const r = b.r * U * age * k;
            ring(b.x * W, b.y * H, r, o.flat ? r * 0.4 : r, k === 1 ? p.mid : p.soft, 0.4 * U * (1.4 - age));
          }
          fade(1);
        });
      };
    },

    // a mandala breathing with the drone, a petal lighting on each note as they go round
    mandala(p, o) {
      let a = 0;
      let lit = 0;
      let glow = 0;
      const petals = (x, y, count, distance, rx, ry, turn, fill, light) => {
        for (let i = 0; i < count; i++) {
          const angle = turn + (i * TAU) / count;
          c.fillStyle = i === light && glow > 0.1 ? p.glow : fill;
          c.beginPath();
          c.ellipse(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, rx, ry, angle, 0, TAU);
          c.fill();
        }
      };
      return (m) => {
        a += m.dt * m.go * 0.08;
        glow = Math.max(0, glow - m.dt * 2);
        for (const hit of m.hits) {
          if (hit.kind !== 'note') continue;
          lit = (lit + 1) % 12;
          glow = 1;
        }
        const [fx, fy] = o.at || [0.84, 0.34];
        const x = W * fx;
        const y = H * fy;
        const R = (o.size || 12) * U * (1 + 0.05 * m.pulse);
        petals(x, y, 12, R, R * 0.42, R * 0.17, a, p.faint, lit);
        petals(x, y, 8, R * 0.55, R * 0.3, R * 0.13, -a * 1.5, p.soft, -1);
        dot(x, y, R * 0.28, p.mid);
        dot(x, y, R * 0.12, p.sky);
      };
    },

    // small squares wheeling slowly round the middle of the page, catching the light on the beat
    specks(p, o) {
      const list = Array.from({ length: o.n || 90 }, () => ({ d: Math.sqrt(rnd()) * 0.7, a: rnd(TAU), s: rnd(0.6, 1.3), lit: Math.random() < 0.3 }));
      let turn = 0;
      return (m) => {
        turn += m.dt * m.go * 0.08;
        if (m.beat) for (const q of list) if (Math.random() < 0.3) q.lit = !q.lit;
        const R = Math.hypot(W, H);
        for (const q of list) {
          const a = q.a + turn;
          const s = q.s * U;
          c.save();
          c.translate(W / 2 + Math.cos(a) * q.d * R, H * 0.45 + Math.sin(a) * q.d * R * 0.8);
          c.rotate(a);
          c.fillStyle = q.lit ? p.mid : p.soft;
          c.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
          c.restore();
        }
      };
    },

    // small shapes in neat rows over the page, a nod running across them from the left on every beat.
    // gap: how far apart, size: how big, kinds: which shapes
    rows(p, o) {
      const nods = [];
      const kinds = o.kinds || ['dot', 'square', 'tri'];
      return (m) => {
        if (m.beat) nods.push(0);
        for (let i = nods.length - 1; i >= 0; i--) if ((nods[i] += m.dt) > 4) nods.splice(i, 1);
        const g = (o.gap || 10) * U;
        const r = (o.size || 1) * U;
        for (let j = 0; j * g < H + g; j++) {
          for (let i = 0; i * g < W + g; i++) {
            let lift = 0;
            for (const t of nods) lift += Math.exp(-((t * 9 - i * 0.55 - j * 0.25) ** 2));
            lift = Math.min(1, lift);
            const x = (i + (j % 2) * 0.5) * g;
            const y = (j + 0.5) * g - lift * 1.5 * r;
            const s = r * (1 + 0.25 * lift);
            const kind = kinds[(i * 7 + j * 3) % kinds.length];
            c.fillStyle = (i * 5 + j * 11) % 7 === 0 ? p.soft : p.faint;
            c.beginPath();
            if (kind === 'dot') c.arc(x, y, s, 0, TAU);
            else if (kind === 'square') c.roundRect(x - s, y - s, s * 2, s * 2, s * 0.35);
            else {
              c.moveTo(x, y - s);
              c.lineTo(x + s, y + s * 0.8);
              c.lineTo(x - s, y + s * 0.8);
            }
            c.fill();
          }
        }
      };
    },

    // round shapes popping up where the tune plays, springing past their size and settling, then
    // shrinking away. slow: lazier
    popping(p, o) {
      const list = bits(40);
      const idle = every(0.3 / (o.often || 1), 0.9 / (o.often || 1));
      const pop = (size) => list.add({ x: rnd(), y: rnd(), r: size, life: o.slow ? 2.6 : 1.2, ring: Math.random() < 0.3, fill: Math.random() < 0.4 ? p.mid : p.soft });
      return (m) => {
        for (const hit of m.hits) {
          if (hit.kind === 'note' && Math.random() < 0.5) pop(rnd(1, 2.4) * (0.6 + hit.vel * 0.6));
          if (hit.kind === 'kick') pop(rnd(3, 5));
        }
        if (idle(m)) pop(rnd(1, 2.5));
        list.draw(m, (b, age) => {
          const s = age < 0.15 ? (age / 0.15) * 1.18 : age < 0.3 ? 1.18 - ((age - 0.15) / 0.15) * 0.18 : 1 - Math.max(0, (age - 0.6) / 0.4);
          const r = b.r * U * s;
          if (b.ring) ring(b.x * W, b.y * H, r, r, b.fill, 0.4 * U);
          else dot(b.x * W, b.y * H, r, b.fill);
        });
      };
    },

    // music notes floating up and swaying, more of them the more the tune plays
    notes(p, o) {
      const list = bits(30);
      const idle = every(1 / (o.often || 1), 2.2 / (o.often || 1));
      const add = (vel) => list.add({ x: rnd(0.03, 0.97), life: rnd(6, 9), s: rnd(0.8, 1.2) * (0.7 + vel * 0.5), ph: rnd(TAU), two: Math.random() < 0.35, fill: Math.random() < 0.4 ? p.mid : p.soft });
      return (m) => {
        for (const hit of m.hits) if (hit.kind === 'note' && Math.random() < 0.2) add(hit.vel);
        if (idle(m)) add(0.5);
        list.draw(m, (b, age) => {
          const s = b.s * U;
          c.save();
          c.translate(b.x * W + Math.sin(age * 6 + b.ph) * 3 * U, (1.05 - age * 1.15) * H);
          c.rotate(Math.sin(age * 4 + b.ph) * 0.25);
          c.fillStyle = c.strokeStyle = b.fill;
          for (const [x, y] of b.two ? [[0, 0], [4.2 * s, -1.2 * s]] : [[0, 0]]) {
            c.beginPath();
            c.ellipse(x, y, 1.5 * s, 1.1 * s, -0.35, 0, TAU);
            c.fill();
            c.fillRect(x + 1.05 * s, y - 6 * s, 0.45 * s, 6 * s);
          }
          if (b.two) shape([[1.05 * s, -6 * s], [5.7 * s, -7.2 * s], [5.7 * s, -6.1 * s], [1.05 * s, -4.9 * s]], b.fill);
          else {
            c.lineWidth = 0.5 * s;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(1.3 * s, -5.8 * s);
            c.quadraticCurveTo(4 * s, -4.2 * s, 3 * s, -1.8 * s);
            c.stroke();
          }
          c.restore();
        });
      };
    },

    // wide wavy ribbons across the page, swelling as the music gets louder: a wall of sound
    ribbons(p, o) {
      const n = o.n || 3;
      const list = Array.from({ length: n }, (_, i) => ({ y: (i + 0.7) / (n + 0.4), ph: rnd(TAU), sp: rnd(0.3, 0.6), k: rnd(0.6, 1.2), fill: i % 2 ? p.soft : p.faint }));
      let swell = 0;
      return (m) => {
        swell = Math.max(swell * Math.exp(-m.dt * 1.5), m.pulse);
        c.lineCap = 'round';
        for (const r of list) {
          r.ph += m.dt * m.go * r.sp;
          c.strokeStyle = r.fill;
          c.lineWidth = (o.width || 5) * U * (1 + 0.25 * swell);
          c.beginPath();
          for (let x = -24; x <= W + 24; x += 24) c.lineTo(x, r.y * H + Math.sin((x / W) * TAU * r.k + r.ph) * 8 * U * (1 + 0.4 * swell) + Math.sin((x / W) * TAU * 2.3 * r.k - r.ph * 1.3) * 3 * U);
          c.stroke();
        }
      };
    },

    // bands of mist drifting across
    fog(p, o) {
      const bands = Array.from({ length: o.n || 5 }, () => ({ x: rnd(-0.3, 1), y: rnd(0.08, 0.95), w: rnd(0.25, 0.55), h: rnd(2, 4) * (o.thick || 1), sp: rnd(0.5, 1) }));
      return (m) => {
        c.fillStyle = p.faint;
        c.beginPath();
        for (const b of bands) {
          b.x += m.dt * m.go * b.sp * 0.01;
          if (b.x > 1) b.x = -b.w;
          c.roundRect(b.x * W, b.y * H, b.w * W, b.h * U, (b.h * U) / 2);
        }
        c.fill();
      };
    },
  };

  // which scenes each mood draws, back to front, and how. every mood starts with a ground, so the
  // window is never bare between the bigger things
  const MOOD_SCENES = {
    calm: [['ground', { kind: 'dots', gap: 10 }], ['lava', { n: 9 }]],
    heavenly: [['ground', { kind: 'dots', gap: 14, alpha: 0.2 }], ['clouds', { rays: true, n: 8 }]],
    happy: [['ground', { kind: 'dots', gap: 13 }], ['stars5', { n: 24 }]],
    playful: [['ground', { kind: 'checks', gap: 13 }], ['hop', { n: 40, size: 3.2 }]],
    spirited: [['ground', { kind: 'diag', gap: 9, drift: [1.5, 0] }], ['clouds', { n: 7, speed: 3 }], ['flock', {}]],
    upbeat: [['ground', { kind: 'dashes', gap: 10, drift: [-2, 0] }], ['streaks', { speed: 0.35, n: 40 }]],
    cozy: [['ground', { kind: 'diamonds', gap: 12 }], ['lava', { n: 7, speed: 0.7 }], ['notes', { often: 3 }]],
    wistful: [['ground', { kind: 'circles', gap: 18, drift: [0.3, 0.3] }], ['fall', { kind: 'petal', n: 40, speed: 0.7, size: 1.4 }]],
    nostalgic: [['ground', { kind: 'stipple', gap: 30 }], ['float', { kinds: ['ring'], solid: true, n: 10, size: [5, 13], speed: 0.3 }], ['stars', { drift: true, n: 55 }]],
    sad: [['ground', { kind: 'waves', gap: 10, drift: [0.3, 0] }], ['fog', { n: 3, thick: 1.5 }], ['fall', { kind: 'rain', n: 120, speed: 0.8, size: 1.3 }]],
    tragic: [['ground', { kind: 'diag', gap: 10 }], ['fog', { n: 7, thick: 2 }], ['fall', { kind: 'rain', n: 90, speed: 0.6, size: 1.4 }]],
    bleak: [['ground', { kind: 'grid', gap: 16 }], ['fog', { n: 8 }], ['fall', { kind: 'ash', n: 70 }]],
    mysterious: [['ground', { kind: 'stipple', gap: 26 }], ['stars', { n: 70 }], ['arcs', { centres: [[0.86, 0.24], [0.1, 0.78], [0.6, 0.66], [0.32, 0.16]] }]],
    tense: [['ground', { kind: 'dashes', gap: 8, drift: [0, 0.6] }], ['strings', { n: 13 }]],
    neon: [['ground', { kind: 'grid', gap: 10, alpha: 0.2 }], ['tunnel', {}]],
    eerie: [['ground', { kind: 'stipple', gap: 22 }], ['fog', { n: 7 }], ['wisps', { n: 16 }]],
    desolate: [['ground', { kind: 'dashes', gap: 16, drift: [1, 0] }], ['fog', { n: 5 }], ['fall', { kind: 'dust', n: 90 }]],
    heroic: [['ground', { kind: 'dots', gap: 12, alpha: 0.2 }], ['sun', { at: [0.5, -0.3], rays: 16, disc: false }], ['chevrons', { n: 9 }]],
    magic: [['ground', { kind: 'rings', gap: 13, drift: [0.4, -0.6] }], ['float', { kinds: ['ring'], solid: true, n: 9, size: [4, 10], speed: 0.4 }], ['stars', { n: 70 }], ['swirl', {}]],
    gaslamp: [['ground', { kind: 'circles', gap: 16 }], ['fog', { n: 6 }], ['waltz', { n: 16 }]],
    dragon: [['ground', { kind: 'diamonds', gap: 10, drift: [0, -1] }], ['wisps', { n: 10 }], ['embers', { rate: 18, most: 150, start: 90, size: 1.6 }]],
    sands: [['ground', { kind: 'waves', gap: 12, drift: [1.2, 0] }], ['storm', {}]],
    jade: [['ground', { kind: 'circles', gap: 14 }], ['ripples', { flat: true, often: 2.5 }], ['fall', { kind: 'petal', n: 30, size: 1.4 }]],
    greenwood: [['ground', { kind: 'stipple', gap: 24 }], ['fall', { kind: 'leaf', n: 40, size: 1.6 }], ['stars', { drift: true, n: 30 }]],
    metal: [['ground', { kind: 'diag', gap: 7 }], ['shards', { n: 30 }]],
    grunge: [['ground', { kind: 'dashes', gap: 9 }], ['shards', { ragged: true, n: 22 }], ['fall', { kind: 'ash', n: 50 }]],
    hardcore: [['ground', { kind: 'grid', gap: 12 }], ['streaks', { speed: 0.3, n: 22 }], ['shards', { n: 20 }]],
    shoegaze: [['ground', { kind: 'waves', gap: 9, drift: [0.6, 0] }], ['ribbons', { n: 6, width: 6 }]],
    dreampop: [['ground', { kind: 'dots', gap: 11 }], ['lava', { n: 7, speed: 0.6 }], ['ribbons', { n: 3, width: 3 }]],
    ethereal: [['ground', { kind: 'stipple', gap: 24 }], ['ribbons', { n: 6, width: 2 }], ['stars', { n: 45 }]],
    desert: [['ground', { kind: 'stipple', gap: 28 }], ['fog', { n: 3 }], ['stars', { n: 80 }], ['moon', {}], ['fall', { kind: 'dust', n: 40, size: 1.5 }]],
    tropical: [['ground', { kind: 'circles', gap: 16, alpha: 0.2 }], ['sun', { at: [0.82, 0.22], size: 9 }], ['swell', { gap: 14, speed: 0.9, amp: 1 }]],
    folk: [['ground', { kind: 'diamonds', gap: 13 }], ['fall', { kind: 'leaf', n: 40, size: 1.7 }]],
    wintry: [['ground', { kind: 'stipple', gap: 22, drift: [0.2, 0.5] }], ['fall', { kind: 'snow', n: 120 }]],
    synthwave: [['ground', { kind: 'grid', gap: 12, alpha: 0.2 }], ['stripes', {}], ['sun', { at: [0.78, 0.36], size: 15, stripes: true }]],
    breakbeat: [['ground', { kind: 'checks', gap: 14, alpha: 0.2 }], ['fall', { kind: 'rain', n: 40 }], ['streaks', { speed: 0.6, n: 36 }]],
    jazz: [['ground', { kind: 'dashes', gap: 11 }], ['fog', { n: 4, thick: 2 }], ['wisps', { n: 14 }], ['hop', { n: 22, size: 2 }]],
    lounge: [['ground', { kind: 'circles', gap: 15 }], ['lava', { n: 6, speed: 0.5 }], ['bubbles', { rate: 3 }]],
    soul: [['ground', { kind: 'dots', gap: 12 }], ['lava', { n: 8, speed: 0.6 }], ['popping', { slow: true, often: 2.5 }]],
    showtime: [['ground', { kind: 'dots', gap: 14, alpha: 0.2 }], ['sun', { beams: true, disc: false }], ['specks', { n: 130 }]],
    shop: [['rows', { gap: 14, size: 0.9 }], ['float', { kinds: ['square', 'ring'], n: 8, size: [3, 6] }]],
    blues: [['ground', { kind: 'waves', gap: 11 }], ['fog', { n: 5, thick: 1.5 }], ['fall', { kind: 'rain', n: 70, speed: 0.6, size: 1.3 }], ['wisps', { n: 10 }]],
    country: [['ground', { kind: 'diamonds', gap: 14, alpha: 0.2 }], ['sun', { at: [0.85, 0.15], size: 8, rays: 12 }], ['fall', { kind: 'dust', n: 70 }]],
    fareast: [['ground', { kind: 'circles', gap: 13 }], ['fog', { n: 4, thick: 1.5 }], ['sun', { at: [0.8, 0.3], size: 11 }], ['fall', { kind: 'petal', n: 34, size: 1.4 }]],
    raga: [['ground', { kind: 'rings', gap: 12 }], ['wisps', { n: 6 }], ['mandala', {}], ['mandala', { at: [0.12, 0.8], size: 8 }]],
    reggae: [['ground', { kind: 'dots', gap: 11 }], ['ribbons', { n: 4, width: 5 }], ['ripples', { on: 'kick', often: 2 }]],
    aztec: [['ground', { kind: 'steps', gap: 10 }], ['zigzags', { n: 18 }], ['fall', { kind: 'leaf', n: 18, size: 1.5 }]],
    tribal: [['ground', { kind: 'tri', gap: 12 }], ['float', { kinds: ['tri', 'diamond'], n: 14, size: [4, 9], speed: 0.6 }], ['ripples', { on: 'kick', often: 2 }], ['embers', { rate: 10, size: 1.5 }]],
    egyptian: [['ground', { kind: 'tri', gap: 14, alpha: 0.2 }], ['sun', { at: [0.8, 0.2], size: 8, rays: 24 }], ['storm', { n: 90, speed: 0.08 }]],
    antiquity: [['ground', { kind: 'dots', gap: 13, alpha: 0.2 }], ['sun', { at: [0.2, 0.15], size: 7, rays: 20 }], ['fall', { kind: 'leaf', n: 18, speed: 0.6, size: 1.5 }]],
    medieval: [['ground', { kind: 'diamonds', gap: 11 }], ['fog', { n: 5, thick: 1.5 }], ['embers', { rate: 7, start: 35, size: 1.4 }]],
    steppe: [['ground', { kind: 'dashes', gap: 12, drift: [2, 0] }], ['clouds', { n: 6, speed: 2 }], ['streaks', { speed: 0.15, n: 26 }]],
    gamelan: [['ground', { kind: 'rings', gap: 11 }], ['stars', { drift: true, n: 22 }], ['ripples', { often: 2.5 }]],
    flamenco: [['ground', { kind: 'circles', gap: 14 }], ['embers', { rate: 9, size: 1.4 }], ['fall', { kind: 'petal', n: 46, size: 1.4 }]],
    pop: [['ground', { kind: 'dots', gap: 10 }], ['float', { kinds: ['ring', 'square', 'tri'], n: 14, size: [2.5, 6] }], ['popping', { often: 3 }]],
    hiphop: [['rows', { gap: 18, size: 2.6, kinds: ['square'] }], ['fall', { kind: 'dust', n: 55 }]],
    trap: [['ground', { kind: 'grid', gap: 18 }], ['float', { kinds: ['diamond'], n: 9, size: [3, 7], speed: 0.5 }], ['ripples', { on: 'kick', size: 1.6, often: 2 }]],
    wasteland: [['ground', { kind: 'dashes', gap: 14, drift: [1.5, 0] }], ['sun', { at: [0.75, 0.25], size: 8 }], ['storm', { n: 120, speed: 0.06 }]],
    underwater: [['ground', { kind: 'waves', gap: 14, alpha: 0.5, drift: [0.5, 0] }], ['sun', { at: [0.5, -0.1], rays: 10, disc: false }], ['waves', {}], ['bubbles', { rate: 2.5 }]],
    pirate: [['clouds', { n: 5 }], ['swell', { gap: 11, amp: 2 }]],
    space: [['ground', { kind: 'stipple', gap: 34, drift: [0.2, 0], depth: 0.08 }], ['ground', { kind: 'stipple', gap: 52, drift: [0.4, 0], depth: 0.3, alpha: 0.5 }], ['stars', { n: 110 }], ['planet', {}]],
    ironcity: [['ground', { kind: 'grid', gap: 14 }], ['sun', { beams: true, disc: false }], ['fall', { kind: 'rain', n: 70 }]],
  };

  // ---------- listening ----------
  // the song's notes are in time order, so a cursor walks along them behind the playhead
  const hits = [];
  let cursor = 0;
  let heard = null;
  let kinds = null;
  let kindsFor = null;
  const VOICES = { kick: 'kick', heart: 'kick', taiko: 'kick', snare: 'snare', clap: 'snare', brush: 'snare', slap: 'snare', rim: 'snare', crash: 'crash', gong: 'crash' };
  const TUNES = new Set(['melody', 'counter', 'bells']);
  // what each layer's notes mean here: a drum's by the kit's slot it hits, the tune's as notes
  function kindOf(song, layer) {
    if (!audible(song, layer)) return null;
    if (layer.role === 'drums') {
      const slots = INSTRUMENTS[layer.instrument]?.slots || [];
      return (note) => VOICES[slots[note.midi]?.voice] || null;
    }
    if (TUNES.has(layer.role)) return () => 'note';
    if (layer.role === 'bass') return () => 'bass';
    return null;
  }
  function listen(player, pos) {
    hits.length = 0;
    const { comp, song } = player;
    const notes = comp.notes;
    if (kindsFor !== song) {
      kindsFor = song;
      kinds = new Map(song.layers.map((layer) => [layer.id, kindOf(song, layer)]));
    }
    // a new song, a loop back to the start or a jump: start from here, without the notes skipped
    if (comp !== heard?.comp || pos < heard.pos || pos - heard.pos > 1) {
      cursor = 0;
      let high = notes.length;
      while (cursor < high) {
        const mid = (cursor + high) >> 1;
        if (notes[mid].t < pos) cursor = mid + 1;
        else high = mid;
      }
    }
    heard = { comp, pos };
    for (; cursor < notes.length && notes[cursor].t <= pos; cursor++) {
      const note = notes[cursor];
      const kind = kinds.get(note.layer)?.(note);
      if (kind && hits.length < 24) hits.push({ kind, midi: note.midi, vel: note.vel ?? 0.75 });
    }
  }

  // ---------- each frame ----------
  // the scene showing, and the last one fading out under it
  let showing = null;
  let leaving = null;
  let shownMood = null;
  let last = performance.now();
  let lastBeat = -1;
  let idleBeat = 0;
  let still = false;
  let skip = false;
  // stir: how much scrolling has just stirred the sky up, 0 to 1
  let stir = 0;
  const m = { dt: 0, t: 0, go: 0.35, pulse: 0, kick: 0, beat: false, playing: false, hits, scroll: 0 };

  function resize() {
    const dpr = (DPR = Math.min(devicePixelRatio || 1, 1.5));
    W = innerWidth;
    H = innerHeight;
    U = Math.max(3.2, Math.min(W, H) / 100);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    still = false;
  }
  addEventListener('resize', resize);
  // (a still sky is drawn again after a scroll, as on a phone the header it hangs under scrolls away.
  // the ground slides with the page, so no frames are skipped for a moment after one)
  let scrolledAt = -1e9;
  addEventListener('scroll', () => {
    still = false;
    scrolledAt = performance.now();
  }, { passive: true });
  resize();

  function mood(key, colour) {
    if (key === shownMood) return;
    shownMood = key;
    const p = palette(colour);
    leaving = calm.matches ? null : showing;
    showing = { alpha: leaving ? 0 : 1, draws: (MOOD_SCENES[key] || [['stars', {}]]).map(([name, o]) => SCENES[name](p, o)) };
    still = false;
  }

  function frame(player) {
    const now = performance.now();
    const playing = !!player.playing;
    // half the frames while nothing plays: it's only drifting
    if (!playing && !calm.matches && now - scrolledAt > 500 && (skip = !skip)) return;
    m.dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!showing) return;
    if (calm.matches) {
      // drawn once, standing still
      if (still) return;
      still = true;
      m.dt = 0;
    }
    m.playing = playing;
    // moving down the page stirs the sky up like walking through it: things drift faster for a moment
    const scrolled = window.scrollY || 0;
    stir = Math.max(stir * Math.exp(-m.dt * 1.5), Math.min(1, Math.abs(scrolled - m.scroll) / (H * 0.04 + 1)));
    m.scroll = scrolled;
    m.go += ((playing ? 1 : 0.35) + (calm.matches ? 0 : 0.8 * stir) - m.go) * (1 - Math.exp(-m.dt * 2));
    m.t += m.dt * m.go;
    let beatPulse = 0;
    const pos = playing ? player.position() : null;
    if (pos !== null && player.comp) {
      listen(player, pos);
      const bpb = player.comp.bpb || 4;
      m.beat = Math.floor(pos) !== lastBeat;
      lastBeat = Math.floor(pos);
      beatPulse = Math.exp(-(pos % 1) * 8) * (pos % bpb < 1 ? 1 : 0.5);
    } else {
      hits.length = 0;
      heard = null;
      lastBeat = -1;
      idleBeat += m.dt;
      m.beat = idleBeat > 1.2;
      if (m.beat) idleBeat = 0;
      // a slow breath rather than a kick: with no music to hit, a sudden jump just looks like the
      // picture stuttering
      beatPulse = 0.3 * Math.sin((Math.PI * idleBeat) / 1.2) ** 2;
    }
    m.kick *= Math.exp(-m.dt * 7);
    for (const hit of hits) if (hit.kind === 'kick') m.kick = Math.max(m.kick, hit.vel);
    m.pulse = Math.max(m.kick, beatPulse * 0.7);

    T = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    c.clearRect(0, 0, W, H);
    if (leaving) {
      leaving.alpha -= m.dt / 0.8;
      if (leaving.alpha <= 0) leaving = null;
    }
    showing.alpha = Math.min(1, showing.alpha + m.dt / 0.8);
    for (const scene of [leaving, showing]) {
      if (!scene) continue;
      alpha = scene.alpha;
      c.globalAlpha = alpha;
      for (const draw of scene.draws) draw(m);
    }
    c.globalAlpha = 1;
  }

  // (MOOD_SCENES, palette and mix for tests/sky-check.js)
  return { mood, frame, MOOD_SCENES, palette, mix };
})();
