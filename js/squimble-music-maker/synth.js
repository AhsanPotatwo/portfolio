/// ================================== squimble music maker: the band ==================================
//
// this file plays composeSong()'s notes (music.js) with the browser's own synthesis (web audio):
// oscillators, filters and delays wired up fresh for every note, either live through the speakers
// (MusicPlayer) or offline into a wav (renderSong()). about half the instruments can also play from
// recordings of real ones (see "recordings" below), with the synthesised version kept as their
// fallback.
//
// squimble quest's sound effects work out every sample in javascript (sound.js). music doesn't,
// because songs are minutes long and change while they play: working a whole song out first would
// take seconds every time a slider moved. the plucked strings and struck instruments are the
// exceptions: one note of each is worked out sample by sample and kept (ksBuffer(), modalBuffer()),
// because that's the only way to get them sounding real, and one note takes a few milliseconds.
//
// ---------- instruments ----------
//
// INSTRUMENTS is data, one entry per instrument, so a new one is usually a new line. family is what
// it's listed under (and which roles can use it, roleFamily() in music.js). edge is how harsh or
// cutting it is, 0 (a sine sub bass) to 1 (a saw lead): moods cap it, and backing layers get a lower
// cap than the melody, so a buzzy instrument never ends up under a gentle one (fitBand() in music.js).
// a new instrument needs an edge too, judged by ear. world: 'chip' or 'acoustic' for the sounds that
// belong to one kind of band, left out for ones that go with anything: chip and acoustic sounds never
// share a song (pickInstrument() in music.js). a texture that's steady rather than now and then is a
// bed: a song has one at most. kind is the engine:
//   sub      subtractive: oscillators (osc: [wave, detune in cents, octave, level]) through a
//            filter. a wave is one of the browser's four or one of WAVES (built from harmonics)
//   fm       frequency modulation: one sine wobbling another's pitch, the bells and electric pianos
//            of the 80s. ratio sets how metallic, index how bright, and indexDecay how fast it mellows.
//            partials: extra sines [ratio, level, seconds to fade]
//   pluck    a plucked string (ksBuffer). bright, soft (a finger rather than a pick) and decay
//            (seconds) shape it, ring is how much the string's top end softens as it rings (0.5 a
//            nylon string, 0.3 an electric guitar's steel one), buzz is a sitar's buzzing bridge, and
//            twang is the cents a plucked string starts sharp by before settling. sustain adds a held
//            tone under the string for notes longer than it rings (an ebow, or an amp feeding back),
//            and a note marked mute is palm muted (a metal chug)
//   modal    something struck (a piano, a marimba, a bell), worked out from the pitches it rings at
//            (modalBuffer): modes, strike, unison, stretch and track, all explained there
//   choir    buzzy oscillators through three narrow filters at a vowel's formants (VOWELS). singers is
//            how many (their detunes), breath mixes in air, and rasp clips the buzz so it cracks like a
//            shouting voice
//   drums    a kit: six slots (KIT_SLOTS), each one of DRUMS with its own tune, tone, decay and gain.
//            suits: the patterns (music.js PATTERNS) it sounds right playing. a tune is moved to the
//            song's key by the composer (tuneDrum() in music.js)
//   texture  a background like rain or birdsong (TEXTURES), held for whole sections
//   sample   a recording (ENGINES.sample). no instrument says it: an instrument with samples plays
//            this way once its recordings have loaded, and its own kind until then
// tonal instruments have env [attack, decay, sustain level, release] in seconds and gain, and can
// have filter { freq, q, env (how far it opens at the start), attack, decay, track (how much it
// follows the note), lfo [rate, depth] (a slow sweep, depth a share of freq) }, vibrato { rate, depth
// in cents, delay }, tremolo { rate, depth }, breath (noise), fuzz (soft clipping on each note, for a
// wall of guitars), crush (how many steps of loudness are kept, the gritty 8 bit sound), reverse
// (the note swells up over its whole length and stops dead, like tape played backwards), scoop
// (cents a blown or bowed note starts flat by, sliding up onto it the way players do), chiff (the
// puff of air starting a flute's note, or a hammond's key click), drift (cents a held note wanders by,
// slowly, because breath and bows are never steady) and ensemble (every oscillator or singer drifts on
// its own, like a section of players rather than one).
// a layer's tone (music.js) scales them, so the same instrument sounds different in every song. a
// harder note is brighter as well as louder (hardness()), and pads and drones spread their
// oscillators across the stereo field, both of which real instruments do and midi doesn't.
//
// every instrument can slide and bend (pitchMods): a note can carry a bend (pins of pitch over time,
// like beepbox's, each move straight or curved), a shake (vibrato of its own) and a swell (growing or
// dying away), which the composer's ornaments and the note editor's tools write. ornaments says which a
// player of the instrument uses and how often: { slide, bend, bendBy, release, grace, trill, fall,
// doit, shake, swell, stop, glide }, see ornament() in music.js. blown, bowed and sung lines are also
// slurred (note.slur: no fresh attack on joined notes, see voiceChain)
// body is the resonances of the instrument's body (a violin's box, a trumpet's bell), and rotary a
// spinning leslie speaker, which are built once per layer with its rig (instrumentChain()).
//
// an instrument with an amp (the guitars, and the basses and leads built like them) is played through
// a rig of pedals, an amp and a speaker cabinet (ampChain()). the rig sits in the layer's channel, so
// all of the layer's notes go through it together, the way a guitar's strings all go into one amp.
// own: an instrument only the moods that name it get, never a surprise pick in another mood (a
// grunge voice turning up as a happy song's tune). a kit or texture that's own is never borrowed by a
// mood that has none of its own (the death whistle in a disco song).
// home: the note a singer (or a didgeridoo) was recorded near. their part sits round it, one note at a
// time, instead of round their role's usual note (the drone composer in music.js). sung: a voice
// recording that glides from note to note through a phrase instead of starting again each note
// (singLine).
//
// ---------- the room ----------
//
// each layer has a channel, like a strip on a mixing desk (its instrument's rig if it has one, a low
// cut, an eq that gives its part a place in the mix, then volume, pan, and sends to the room, the
// reverb and the echo), and they meet in buildGraph()'s chain: drive -> warmth (a low pass filter) ->
// tape wobble -> glue compressor -> a little mud taken out -> tape saturation -> volume -> limiter.
// the reverb plays an impulse made of decaying noise (impulse()), so it needs no recorded room, and the
// room every part shares is the same idea made small (roomImpulse()). see "the mixing desk" below.

const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

// waves made from harmonics: how strong the 1st, 2nd, 3rd... harmonics are
const WAVES = {
  glass: [1, 0, 0.35, 0, 0.18, 0, 0.1, 0, 0.05],
  organ: [1, 0.6, 0.4, 0.2, 0, 0.15, 0, 0.1],
  hollow: [1, 0, 0.3, 0, 0.12, 0, 0.06],
  soft: [1, 0.25, 0.08, 0.03],
  // the nes's pulse channels (a square wave that's on for a quarter or an eighth of each cycle), the
  // sound of undertale and most 8 bit tunes, and its triangle channel, which steps in 16 levels and so
  // has a faint buzz a pure triangle doesn't
  pulse25: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.25) / (i + 1)),
  pulse12: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.125) / (i + 1)),
  chiptri: [1, 0.02, -0.11, 0.015, 0.04, 0.012, -0.02, 0.01, 0.012, 0.008],
  // the newer acoustic leads. I copied the rough shape of each instrument's spectrum (how strong each
  // harmonic is) from pictures of real ones, then the body (see instrumentChain) adds the bumps that
  // stay put whatever note is played. a plain sawtooth was too even, and that evenness is a lot of
  // what made the old leads sound like a keyboard
  // a sax's reed: every harmonic, falling away slowly, so it's thick and a bit honky
  reed: [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08],
  // brass: the upper harmonics stay strong, which is the "blare" (the filter then decides how much)
  brass: [1, 0.9, 0.82, 0.72, 0.62, 0.55, 0.48, 0.42, 0.36, 0.3, 0.25, 0.2, 0.16, 0.12],
  // a bowed string's slip-stick wave is close to a saw, with a dip where the bow sits on the string
  // (about every 7th harmonic), so it isn't as buzzy as a synth's saw
  bowed: [1, 0.5, 0.33, 0.25, 0.2, 0.15, 0.04, 0.12, 0.1, 0.09, 0.08, 0.07, 0.02, 0.05],
  // a hammond's drawbars pulled out 888000000 plus a little 4' and 2 2/3': the jazz and gospel setting
  drawbar: [1, 1, 0.8, 0.5, 0, 0.35, 0, 0.2],
  // a free reed (harmonica, melodica, harmonium): a narrow pulse, nasal and bright
  freereed: Array.from({ length: 24 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.3) / (i + 1) ** 0.9),
};

// the formants (resonances) of sung vowels: [hz, level]
const VOWELS = {
  ah: [[800, 1], [1150, 0.5], [2900, 0.2]],
  oo: [[350, 1], [650, 0.45], [2700, 0.08]],
  // a soft, closed "mm-oh", for the soul voice: rounder than ah, warmer than oo
  oh: [[500, 1], [900, 0.4], [2600, 0.1]],
  // a throat singer's: the tongue makes one very narrow resonance, high up, that whistles whichever
  // overtone is nearest it
  khoomei: [[400, 1], [1600, 1.4], [3200, 0.05]],
};

// a kit's drums. rock kits have a ride for perc, a floor tom for low perc, and a crash: kits without
// one crash on their open hat (the drum composer in music.js)
const KIT_SLOTS = ['Kick', 'Snare', 'Hat', 'Open hat', 'Perc', 'Low perc', 'Crash'];

const INSTRUMENTS = {
  // pads
  // the analog pads drift a little (drift, in cents), the way an old synth's oscillators never quite
  // sit still. a pad that's perfectly steady is the first thing that gives a song away as a computer
  'warm-pad':    { name: 'Warm pad', family: 'pad', edge: 0.2, kind: 'sub', osc: [['sawtooth', -9], ['sawtooth', 9], ['triangle', 0, -1, 0.6]], filter: { freq: 850, q: 0.8, env: 1.8, attack: 1.2, decay: 2 }, env: [1.4, 1.5, 0.8, 2.8], drift: 3, gain: 0.05 },
  'glass-pad':   { name: 'Glass pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['glass', -5], ['glass', 6, 1, 0.3]], filter: { freq: 4200, q: 0.5 }, env: [1.8, 2, 0.75, 3.5], gain: 0.07 },
  // a choir is lots of people, each a little out of time and tune with the others (ensemble: every
  // singer drifts on their own), which is why a real one shimmers and a synth "choir" sounds flat
  'choir-ah':    { name: 'Choir, ah', family: 'pad', edge: 0.2, world: 'acoustic', kind: 'choir', vowel: 'ah', env: [1.1, 1, 0.85, 2.4], ensemble: true, drift: 7, gain: 0.22, vibrato: { rate: 4.8, depth: 9, delay: 0.8 }, samples: 'choir-aahs', sampled: { gain: 0.2 } },
  'choir-oo':    { name: 'Choir, oo', family: 'pad', edge: 0.1, world: 'acoustic', kind: 'choir', vowel: 'oo', env: [1.4, 1, 0.85, 2.8], ensemble: true, drift: 7, gain: 0.3, vibrato: { rate: 4.5, depth: 8, delay: 1 }, samples: 'choir-oohs', sampled: { gain: 0.57 } },
  // a string section: bowed waves (WAVES.bowed) for several players, each drifting on their own, a
  // little bow noise (breath), and a violin's wooden body (body) on top, which is most of what made it
  // sound like strings rather than a synth pad
  strings:       { name: 'Strings', family: 'pad', edge: 0.35, kind: 'sub', osc: [['bowed', -8], ['bowed', 7], ['bowed', 0, 0, 0.8], ['bowed', 3, 1, 0.12]], breath: 0.04, filter: { freq: 2600, q: 0.5, track: 0.3 }, body: [[280, 4, 2], [460, 3, 2.5], [1500, -3, 1.2], [2800, 4, 0.9]], env: [0.8, 1, 0.9, 1.4], ensemble: true, drift: 5, gain: 0.024, vibrato: { rate: 5.3, depth: 9, delay: 0.5 }, samples: 'strings', sampled: { gain: 0.9 } },
  'dark-pad':    { name: 'Dark pad', family: 'pad', edge: 0.3, kind: 'sub', osc: [['sawtooth', -14], ['square', 12, -1, 0.45]], filter: { freq: 380, q: 3, env: 2.6, attack: 3, decay: 4 }, env: [2.5, 2, 0.8, 4], drift: 3, gain: 0.06 },
  shimmer:       { name: 'Shimmer', family: 'pad', edge: 0.15, kind: 'sub', osc: [['sine', 0], ['sine', 5, 1, 0.5], ['triangle', -4, 2, 0.18]], env: [2, 2, 0.7, 4.5], gain: 0.07, tremolo: { rate: 3.2, depth: 0.3 } },
  organ:         { name: 'Organ', family: 'pad', edge: 0.35, kind: 'sub', osc: [['organ', 0], ['organ', 4, 1, 0.3]], filter: { freq: 4500, q: 0.3 }, env: [0.06, 0.4, 0.9, 0.35], gain: 0.06, tremolo: { rate: 6, depth: 0.15 }, samples: 'pipe-organ', sampled: { name: 'Pipe organ (VCSL)', gain: 0.33 }, more: { 'renaissance-organ': { name: 'Renaissance chamber organ (VCSL)', gain: 0.3 } } },
  'air-pad':     { name: 'Air pad', family: 'pad', edge: 0.05, kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.15]], breath: 1.6, env: [2.2, 2, 0.8, 3.5], gain: 0.08 },
  'haunted-pad': { name: 'Haunted pad', family: 'pad', edge: 0.45, kind: 'sub', osc: [['hollow', -24], ['hollow', 21], ['sine', 0, -1, 0.5]], filter: { freq: 1000, q: 5 }, env: [3, 2, 0.8, 4], gain: 0.055, tremolo: { rate: 0.35, depth: 0.55 }, vibrato: { rate: 0.21, depth: 28, delay: 0 } },
  // a filter that breathes open and shut by itself, the slowly turning analog pads of aphex twin's
  // selected ambient works and the dying light score
  'analog-pad':  { name: 'Analog pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['sawtooth', -11], ['sawtooth', 12], ['pulse25', 0, -1, 0.5]], filter: { freq: 750, q: 1.4, lfo: [0.11, 0.55] }, env: [1.6, 2, 0.85, 3], drift: 3, gain: 0.05 },
  // have a nice life's wall of guitars: detuned saws clipped together, then darkened, so it's thick
  // rather than buzzy
  'fuzz-wall':   { name: 'Fuzz wall', family: 'pad', edge: 0.4, kind: 'sub', osc: [['sawtooth', -16], ['sawtooth', 15], ['sawtooth', 5, 1, 0.4], ['square', -7, -1, 0.5]], fuzz: 4, filter: { freq: 1300, q: 0.7, lfo: [0.07, 0.25] }, env: [0.9, 2, 0.9, 2.5], gain: 0.057 },
  // swells into each chord and stops dead as the next arrives, an old tape trick of ambient music
  'reverse-piano': { name: 'Reversed piano', family: 'pad', edge: 0.15, kind: 'sub', reverse: true, osc: [['soft', 0], ['glass', 1, 1, 0.25]], filter: { freq: 900, q: 0.5, env: 3, track: 0.4 }, env: [0, 0, 1, 0.08], gain: 0.17 },
  // guitars as pads: slowdive's volume swells (the knob rolled up after each chord's picked, through a
  // chorus), and my bloody valentine's reverse reverb, a fuzzed chord sucked in backwards
  'swell-guitar':  { name: 'Swelling guitar', family: 'pad', edge: 0.2, own: true, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 4, sustain: 0.8, env: [0.9, 2, 0.9, 2.5], gain: 1,
    amp: { tight: 80, curve: 'tube', gain: 2, cab: 5000, level: 0.3, chorus: [0.5, 0.005] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.9, env: [0.5, 1, 1, 1.5] }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 2.6 } } },
  'reverse-guitar': { name: 'Reversed guitar', family: 'pad', edge: 0.4, own: true, kind: 'sub', reverse: true, osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 0.5 }, env: [0, 0, 1, 0.08], gain: 0.5,
    amp: { tight: 60, curve: 'soft', gain: 30, mids: [900, -6], cab: 3500, level: 0.05, reverse: 0.6 } },
  // a horn section (trumpets, saxes and a trombone) playing chords together: the punchy stabs of funk,
  // soul and mettaton's big band. brass waves, the filter opening as each chord blares, every player a
  // little apart
  'brass-section': { name: 'Brass section', family: 'pad', edge: 0.5, world: 'acoustic', kind: 'sub', osc: [['brass', -9], ['brass', 8], ['brass', 0, 0, 0.8]], filter: { freq: 750, q: 0.9, env: 3.2, attack: 0.07, decay: 0.4, track: 0.5 }, body: [[1200, 4, 1], [2600, 3, 1.2]], env: [0.04, 0.4, 0.8, 0.3], scoop: 15, ensemble: true, drift: 4, gain: 0.066, vibrato: { rate: 5, depth: 4, delay: 0.6 }, samples: 'brass-section', sampled: { gain: 0.35 } },
  // a harmonium, india's little pumped reed organ: free reeds (bright and nasal) under a raga, wheezing
  // slightly as the bellows go
  harmonium:     { name: 'Harmonium', family: 'pad', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['freereed', -4], ['freereed', 5], ['freereed', 0, -1, 0.5]], breath: 0.05, filter: { freq: 2600, q: 0.5, track: 0.3 }, body: [[900, 3, 1]], env: [0.08, 0.5, 0.9, 0.3], drift: 2, gain: 0.076, tremolo: { rate: 0.6, depth: 0.08 }, samples: 'reed-organ', sampled: { gain: 0.13 } },
  // a string machine: a whole string section from one keyboard's divided down saws, slightly out of tune
  // with themselves, swelling in. disco's strings (chic, the bee gees) and 80s pop
  'synth-strings': { name: 'String machine', family: 'pad', edge: 0.3, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['sawtooth', 0, 1, 0.3]], filter: { freq: 2400, q: 0.5, track: 0.3 }, env: [0.25, 0.6, 0.9, 0.8], ensemble: true, drift: 3, gain: 0.038, samples: 'synth-strings', sampled: { gain: 0.098 } },
  // the orchestra hit: a whole orchestra's chord, stabbed once, the 80s sampler's party trick and then
  // hip hop's (afrika bambaataa, public enemy). it plays stabs
  'orchestra-hit': { name: 'Orchestra hit', family: 'pad', edge: 0.6, own: true, kind: 'sub', osc: [['brass', -8], ['brass', 8], ['sawtooth', 0, -1, 0.5]], filter: { freq: 3000, q: 0.6, env: 2, attack: 0.005, decay: 0.2 }, env: [0.004, 0.35, 0.15, 0.3], gain: 0.23, samples: 'orchestra-hit', sampled: { gain: 0.41 } },

  // keys and mallets
  // the struck ones are modal (see modalBuffer): every overtone a real one rings with, at its own
  // pitch and dying at its own rate, worked out once per note. they used to be fm, which gets the
  // brightness right but not the way a struck bar or string sings on its lowest notes as the top dies
  // a felt piano: felt laid between the hammers and strings, so the top's soft and the strike's a
  // muffled thump (nils frahm, the quiet minecraft pieces). two strings a note, beating slowly
  'felt-keys':   { name: 'Felt piano', family: 'keys', edge: 0.1, kind: 'modal', modes: [[1, 1, 3.4], [2, 0.42, 1.9, 0.3], [3, 0.16, 1.2, 0.6], [4, 0.07, 0.8, 0.9], [5, 0.03, 0.5, 1.2]], strike: [0.22, 500, 0.025], unison: 0.9, stretch: 0.0003, track: 0.5, env: [0.003, 1, 1, 0.5], gain: 0.47, samples: 'upright-piano', sampled: { gain: 0.82, filter: { freq: 2400, q: 0.5 } } },
  // a fender rhodes: a struck tine, nearly a pure tone, its second harmonic growling in when it's hit
  // hard (the "bark", hard), with the stereo tremolo the suitcase model had
  'e-piano':     { name: 'Electric piano', family: 'keys', edge: 0.2, kind: 'modal', modes: [[1, 1, 3.6], [2, 0.16, 1.5, 0.8], [3, 0.05, 0.6, 1.4], [7, 0.05, 0.05, 2]], strike: [0.04, 3000, 0.003], track: 0.4, env: [0.003, 1, 1, 0.6], gain: 0.3, tremolo: { rate: 4.5, depth: 0.12 }, samples: 'electric-piano', sampled: { name: 'Rhodes (FluidR3)', gain: 0.22 }, more: { 'dx-piano': { name: 'DX7 style electric piano (FluidR3)', gain: 0.41 }, 'fm-piano': { name: 'Yamaha TX81Z FM piano (VCSL)', gain: 0.52 } } },
  // a harp's soundboard (body) gives its low strings their warmth
  harp:          { name: 'Harp', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'pluck', bright: 0.3, soft: 0.75, decay: 3, filter: { freq: 2000, q: 0.5, track: 0.5 }, body: [[220, 3, 1.2], [700, 2, 1.2]], env: [0.006, 3, 1, 2.5], gain: 0.43, samples: 'harp', sampled: { name: 'Concert harp (VCSL)', gain: 0.55 }, more: { 'folk-harp': { name: 'Folk harp (VCSL)', gain: 0.6 } } },
  // a music box's comb: steel teeth plucked by pins, a tick and then nearly pure tones
  'music-box':   { name: 'Music box', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.8], [4, 0.2, 0.35, 0.8], [2, 0.05, 1]], strike: [0.12, 6000, 0.003], track: 0.4, env: [0.002, 1, 1, 0.6], gain: 0.34, samples: 'music-box', sampled: { gain: 0.53 } },
  // a marimba's bars are tuned so their first overtones are two octaves and a bit over three up, and
  // the tube under each one feeds the low note, so it's warm and woody and the top dies fast
  marimba:       { name: 'Marimba', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.1], [4, 0.14, 0.22, 0.7], [9.9, 0.04, 0.06, 1.2]], strike: [0.12, 1500, 0.006], track: 0.7, env: [0.002, 1, 1, 0.5], gain: 0.45, samples: 'marimba', sampled: { name: 'Marimba (VCSL)', gain: 0.53 }, more: { balafon: { name: 'Balafon (VCSL)', gain: 2.7 } } },
  // a kalimba's metal tine: a pure note with a short, high, out of tune overtone at the thumb's flick
  kalimba:       { name: 'Kalimba', family: 'keys', edge: 0.25, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.5], [5.9, 0.12, 0.12, 1], [2, 0.03, 0.4]], strike: [0.15, 3000, 0.004], track: 0.5, env: [0.002, 1, 1, 0.6], gain: 0.45, samples: 'kalimba', sampled: { gain: 1.3 } },
  celesta:       { name: 'Celesta', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.6], [2, 0.2, 0.6, 0.5], [3, 0.05, 0.25, 1]], strike: [0.1, 2000, 0.005], track: 0.4, env: [0.002, 1, 1, 0.7], gain: 0.39, samples: 'celesta', sampled: { gain: 0.39 } },
  pizzicato:     { name: 'Pizzicato', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.35, soft: 0.4, decay: 0.9, filter: { freq: 2600, q: 0.6, track: 0.4 }, body: [[280, 4, 2], [460, 3, 2.5], [2800, 3, 0.9]], env: [0.002, 0.8, 1, 0.3], gain: 0.3, samples: 'pizzicato', sampled: { gain: 0.3 } },
  // vibes: aluminium bars, long ringing, and the motor turning discs in the tubes (the tremolo)
  vibes:         { name: 'Vibraphone', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3.5], [4, 0.08, 0.7, 0.6], [10, 0.02, 0.12, 1]], strike: [0.06, 2500, 0.004], track: 0.5, env: [0.003, 1, 1, 1.2], gain: 0.39, tremolo: { rate: 5.5, depth: 0.35 }, samples: 'vibraphone', sampled: { gain: 0.58 } },
  // guitars ring through a wooden box: its air rings at about 100 hz and its top at about 200, which
  // is the warmth an acoustic guitar has and a plucked string alone doesn't
  nylon:         { name: 'Nylon guitar', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.5, soft: 0.45, decay: 2.2, filter: { freq: 3000, q: 0.6, track: 0.3 }, body: [[105, 5, 2], [210, 4, 2], [420, -2, 1.5], [2500, 2, 0.8]], env: [0.003, 2.2, 1, 0.8], gain: 0.8, ornaments: { slide: 0.05, grace: 0.04 }, samples: 'nylon-guitar', sampled: { gain: 0.29 } },
  // a steel string guitar, brighter and longer ringing than the nylon: stardew valley's strummed and
  // fingerpicked guitar
  'steel-guitar': { name: 'Steel guitar', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'pluck', bright: 0.7, soft: 0.25, decay: 2.8, filter: { freq: 4200, q: 0.5, track: 0.3 }, body: [[100, 5, 2], [190, 4, 2], [3000, 3, 1]], env: [0.002, 2.8, 1, 0.8], gain: 0.5, ornaments: { slide: 0.05 }, samples: 'steel-guitar', sampled: { name: 'Steel string guitar (FluidR3)', gain: 0.3 }, more: { 'shiny-acoustic': { name: 'Acoustic guitar (Karoryfer)', gain: 0.53 } } },
  // the desert's lute, fretless and picked with a quill: a short, woody, nasal pluck, ornamented the
  // way oud players do (graces and little trills)
  oud:           { name: 'Oud', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 1.5, filter: { freq: 2600, q: 0.8, track: 0.4 }, body: [[150, 4, 2], [300, 3, 2], [1800, 3, 1]], env: [0.002, 1.5, 1, 0.5], gain: 0.68, ornaments: { grace: 0.2, trill: 0.08, slide: 0.15 }, samples: 'strumstick', sampled: { gain: 1.2 } },
  // a steel pan: its octave and twelfth are hammered in tune with it, so it's bright then mellow
  // rather than clangy
  'steel-drum':  { name: 'Steel drum', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 1.5], [2, 0.5, 0.9, 0.5], [3, 0.2, 0.4, 0.8], [4, 0.08, 0.2, 1]], strike: [0.12, 3000, 0.005], track: 0.4, env: [0.003, 1, 1, 0.7], gain: 0.52, samples: 'steel-drum', sampled: { gain: 0.79 } },
  // a grand piano: three strings a note a touch apart (unison) so it shimmers, its overtones a little
  // sharp of true (stretch, the stiffness of steel strings, which is why pianos are tuned stretched),
  // each dying at its own rate, the top dying first, and the felt hammer's thump. harder is brighter
  // (hard on the upper modes)
  piano:         { name: 'Grand piano', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'modal', modes: [[1, 1, 5], [2, 0.55, 3.3, 0.2], [3, 0.35, 2.4, 0.4], [4, 0.22, 1.8, 0.6], [5, 0.14, 1.4, 0.8], [6, 0.09, 1.1, 1], [7, 0.05, 0.9, 1.2], [8, 0.04, 0.7, 1.4], [9, 0.025, 0.5, 1.6], [10, 0.015, 0.4, 1.8]], strike: [0.3, 2500, 0.012], unison: 1.2, stretch: 0.0005, track: 0.6, env: [0.002, 1, 1, 0.35], gain: 0.45, samples: 'piano', sampled: { name: 'Steinway B grand (VCSL)', gain: 0.68 }, more: { cp80: { name: 'Yamaha CP80 electric grand', gain: 0.23 } } },
  // a hammond organ: tonewheels (perfectly in tune, so no drift), the drawbars, a click as each key
  // makes contact (chiff), and the leslie speaker spinning (rotary, see instrumentChain), which is the
  // swirl of jazz, gospel and soul organ
  hammond:       { name: 'Hammond organ', family: 'keys', edge: 0.35, kind: 'sub', osc: [['drawbar', 0]], chiff: 0.3, filter: { freq: 5000, q: 0.3 }, env: [0.005, 0.2, 1, 0.08], rotary: 1.1, gain: 0.11, samples: 'drawbar-organ', sampled: { gain: 0.27 } },
  // a clavinet: a string hit by a rubber pad and damped by yarn the moment you let go, through a
  // pickup. bright, short and funky (stevie wonder's superstition)
  clavinet:      { name: 'Clavinet', family: 'keys', edge: 0.45, kind: 'pluck', bright: 0.85, soft: 0, decay: 0.7, ring: 0.4, body: [[1200, 5, 1.5], [3000, 4, 1]], env: [0.002, 0.7, 1, 0.06], gain: 0.59, samples: 'clavinet', sampled: { gain: 0.32 } },
  // a banjo: a string over a drum skin, so it's bright, short and ringing with no deep bass (the head
  // rings at about 700 hz). twang: a plucked string starts a little sharp and settles
  banjo:         { name: 'Banjo', family: 'keys', edge: 0.4, world: 'acoustic', kind: 'pluck', bright: 0.8, soft: 0.05, decay: 1.1, twang: 10, body: [[700, 7, 2.5], [2200, 5, 1.5], [160, -5, 1]], env: [0.002, 1.1, 1, 0.25], gain: 0.69, ornaments: { slide: 0.08, grace: 0.06 }, samples: 'banjo', sampled: { gain: 0.5 } },
  // a sitar: its curved bridge (the jawari) lets the string brush it, so it buzzes and the buzz sweeps
  // as the note dies (buzz). players bend and slide between notes (meend) all the time, so it has a
  // lot of ornaments, and slow slides (glide)
  sitar:         { name: 'Sitar', family: 'keys', edge: 0.4, world: 'acoustic', own: true, kind: 'pluck', bright: 0.75, soft: 0.1, decay: 3.2, ring: 0.35, buzz: 0.12, twang: 8, body: [[350, 4, 2], [1400, 3, 1.5], [3200, 3, 1]], env: [0.002, 3, 1, 0.8], gain: 0.75, ornaments: { slide: 0.5, grace: 0.25, trill: 0.1, glide: 0.22 }, samples: 'sitar', sampled: { gain: 0.45 } },
  // a koto: thirteen silk strings over movable bridges. pressing the string behind the bridge bends
  // a note up (bend)
  koto:          { name: 'Koto', family: 'keys', edge: 0.25, world: 'acoustic', own: true, kind: 'pluck', bright: 0.6, soft: 0.25, decay: 2.2, twang: 14, body: [[250, 4, 2], [900, 3, 1.5]], env: [0.002, 2.2, 1, 0.6], gain: 0.75, ornaments: { bend: 0.25, bendBy: 2, grace: 0.1, glide: 0.15, release: 0.15 }, samples: 'koto', sampled: { gain: 0.34 } },
  // a shamisen: three strings over a skin, struck with a big plectrum. it buzzes (sawari) and snaps
  shamisen:      { name: 'Shamisen', family: 'keys', edge: 0.45, world: 'acoustic', own: true, kind: 'pluck', bright: 0.85, soft: 0, decay: 0.8, buzz: 0.16, twang: 20, body: [[600, 5, 2.5], [2500, 4, 1.5]], env: [0.002, 0.8, 1, 0.2], gain: 0.96, ornaments: { slide: 0.2, grace: 0.2 }, samples: 'shamisen', sampled: { gain: 0.68 } },
  // a santoor, kashmir's hammered dulcimer: a few strings to a note (unison, so it shimmers), hit
  // with light mallets and left to ring
  santoor:       { name: 'Santoor', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 2.2], [2, 0.55, 1.4, 0.3], [3, 0.35, 1, 0.5], [4, 0.2, 0.7, 0.7], [5, 0.12, 0.5, 0.9], [6, 0.06, 0.4, 1]], strike: [0.3, 4000, 0.004], unison: 4, track: 0.5, env: [0.002, 1, 1, 1.2], gain: 0.39, samples: 'dulcimer', sampled: { gain: 0.52 } },
  // a xylophone: rosewood bars tuned so their first overtone is a twelfth up (3), bright, dry and quick,
  // the bones of a cartoon (and danse macabre)
  xylophone:     { name: 'Xylophone', family: 'keys', edge: 0.35, world: 'acoustic', kind: 'modal', modes: [[1, 1, 0.6], [3, 0.25, 0.15, 0.7], [6.3, 0.06, 0.05, 1]], strike: [0.2, 4000, 0.003], track: 0.7, env: [0.002, 1, 1, 0.3], gain: 0.68, samples: 'xylophone', sampled: { gain: 1.1 } },
  // a harpsichord: every string plucked by a quill, the same loudness however hard it's pressed, bright
  // and a little nasal. a castle's music room, or something old and strange
  harpsichord:   { name: 'Harpsichord', family: 'keys', edge: 0.4, world: 'acoustic', kind: 'pluck', bright: 0.9, soft: 0, decay: 2.5, ring: 0.3, body: [[300, 3, 1.5], [2500, 3, 1]], env: [0.002, 2.5, 1, 0.15], gain: 0.98, samples: 'harpsichord', sampled: { gain: 0.61 } },
  // a wurlitzer: a steel reed struck by a hammer under a pickup, rounder than a rhodes at the bottom and
  // barking at the top when it's hit hard, with the built in tremolo. soul, ray charles, supertramp,
  // and the indie and dream pop of now
  wurlitzer:     { name: 'Wurlitzer', family: 'keys', edge: 0.3, kind: 'modal', modes: [[1, 1, 2.5], [2, 0.3, 1.2, 0.9], [3, 0.12, 0.5, 1.2], [5, 0.05, 0.2, 1.5]], strike: [0.06, 2500, 0.003], track: 0.4, env: [0.003, 1, 1, 0.4], gain: 0.41, tremolo: { rate: 5.5, depth: 0.15 }, samples: 'wurlitzer', sampled: { name: 'Wurlitzer EP200', gain: 0.31 }, more: { pianet: { name: 'Hohner Pianet T', gain: 0.26 } } },
  // a mbira from zimbabwe: metal keys on a board over a gourd, plucked with the thumbs. like a kalimba,
  // with the bottle caps on it buzzing (the high, out of tune modes) and a deeper ring
  mbira:         { name: 'Mbira', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 1.8], [2, 0.08, 0.6], [5.4, 0.15, 0.15, 1], [11.3, 0.06, 0.05, 1.2]], strike: [0.25, 3500, 0.004], track: 0.5, env: [0.002, 1, 1, 0.7], gain: 0.46, samples: 'mbira', sampled: { name: 'Mbira dzavadzimu (VCSL)', gain: 1.9 } },
  // a lyre, the ancient world's harp: ten metal strings plucked with the fingers, brighter and longer
  // ringing than a harp's gut ones
  lyre:          { name: 'Lyre', family: 'keys', edge: 0.25, world: 'acoustic', own: true, kind: 'pluck', bright: 0.55, soft: 0.5, decay: 3.5, ring: 0.35, filter: { freq: 3200, q: 0.5, track: 0.4 }, body: [[300, 3, 1.5], [900, 2, 1.2]], env: [0.004, 3.5, 1, 2], gain: 0.42, ornaments: { grace: 0.1, slide: 0.04 }, samples: 'lyre', sampled: { name: 'Cithara barbarica', gain: 0.27 } },
  // an upright piano gone out of tune in a saloon: each note's strings a few cents apart (unison), so it
  // jangles. the wasteland's bar and the pirates' tavern
  'honky-tonk':  { name: 'Honky tonk piano', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3.5], [2, 0.55, 2.5, 0.2], [3, 0.35, 1.8, 0.4], [4, 0.22, 1.3, 0.6], [5, 0.12, 1, 0.8], [6, 0.06, 0.8, 1]], strike: [0.3, 3000, 0.01], unison: 9, stretch: 0.0005, track: 0.6, env: [0.002, 1, 1, 0.35], gain: 0.62, samples: 'honky-tonk', sampled: { gain: 0.7 } },
  // a javanese gamelan's bonang: a row of bronze kettle gongs struck with padded sticks, in pelog (its
  // notes fall between a piano's, so the recordings are each played in tune, see build-samples.js). a
  // gong's overtones aren't whole multiples, so it shimmers rather than rings
  bonang:        { name: 'Bonang', family: 'keys', edge: 0.35, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 2.5], [2.76, 0.2, 0.7, 0.6], [4.1, 0.08, 0.3, 1], [5.6, 0.03, 0.15, 1.2]], strike: [0.15, 3000, 0.003], unison: 2, track: 0.4, env: [0.002, 1, 1, 1], gain: 0.73, samples: 'bonang', sampled: { name: 'Bonang and bonang panerus', gain: 0.75, reach: 12 } },

  // electric guitars: a picked string through a rig (amp, ampChain()), from clean to as heavy as it
  // goes. edge rises with the gain. rhythm guitars are double tracked (two takes, left and right).
  // the dirty ones ring a long time (decay) and lose little brightness as they do (ring), and their
  // rig squashes the string before it clips (sustain): a distorted chord should ring on for bars, not
  // die like an acoustic one. ornaments.slide is the rock trick of sliding into a power chord
  // clean, bright and a little squashed: the twinkling guitar of emo (tigers jaw, american football)
  'clean-guitar':  { name: 'Clean guitar', family: 'guitar', edge: 0.2, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 3, env: [0.002, 3, 1, 0.3], gain: 1,
    amp: { tight: 90, curve: 'tube', gain: 1.2, mids: [700, -2], presence: [3200, 3], cab: 7500, level: 0.5, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.88 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.2 } } },
  // clean through a chorus pedal, shimmering left and right: come as you are, and all of dream pop
  'chorus-guitar': { name: 'Chorus guitar', family: 'guitar', edge: 0.2, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 3.2, env: [0.002, 3, 1, 0.4], gain: 1,
    amp: { tight: 90, curve: 'tube', gain: 1.2, presence: [3000, 2], cab: 6500, level: 0.45, chorus: [0.7, 0.0035] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.77 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.1 } } },
  // a valve amp turned up until it just breaks up: crunchy when picked hard, nearly clean when soft
  'crunch-guitar': { name: 'Crunch guitar', family: 'guitar', edge: 0.45, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 4, ring: 0.4, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.1, glide: 0.06 },
    amp: { tight: 100, curve: 'tube', gain: 4, sustain: 6, presence: [2500, 3], cab: 5500, level: 0.165, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.94 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.3 } } },
  // an overdrive pedal (a tube screamer) into a hot amp: the mids pushed before the clipping, so it
  // sings rather than fizzes
  'drive-guitar':  { name: 'Overdrive guitar', family: 'guitar', edge: 0.6, kind: 'pluck', bright: 0.65, soft: 0.1, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.15, glide: 0.06 },
    amp: { tight: 140, boost: [720, 6], curve: 'soft', gain: 12, sustain: 10, presence: [2800, 2], cab: 5000, level: 0.0254, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 } } },
  // a distortion pedal (a boss ds-1, a rat): hard clipped, flatter and rawer. nirvana's chorus
  'dist-guitar':   { name: 'Distortion guitar', family: 'guitar', edge: 0.75, kind: 'pluck', bright: 0.7, soft: 0.05, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.2, glide: 0.06 },
    amp: { tight: 110, curve: 'hard', gain: 30, sustain: 14, mids: [700, -3], presence: [3000, 3], cab: 4500, level: 0.0265, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 } } },
  // a big muff fuzz: so much gain every note sustains, the mids scooped out and the top rolled off, so
  // it's thick and woolly rather than sharp. the smashing pumpkins, weezer, my bloody valentine
  'fuzz-guitar':   { name: 'Fuzz guitar', family: 'guitar', edge: 0.65, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 7, ring: 0.3, env: [0.002, 3, 1, 0.35], gain: 1, ornaments: { slide: 0.15, glide: 0.07 },
    amp: { tight: 50, curve: 'soft', gain: 70, sustain: 18, mids: [900, -9], cab: 3800, level: 0.0213, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 } } },
  // a high gain amp, metallica's and doom's: the lows cut before the clipping so a chug stays tight,
  // then the mids scooped and the low end and bite put back after
  'metal-guitar':  { name: 'Metal guitar', family: 'guitar', edge: 0.9, kind: 'pluck', bright: 0.75, soft: 0, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.15], gain: 1, ornaments: { slide: 0.12, glide: 0.05 },
    amp: { tight: 150, boost: [800, 5], curve: 'hard', gain: 90, sustain: 12, mids: [550, -10], body: [110, 6], presence: [3500, 5], cab: 5500, level: 0.0231, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.4 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.9 } } },
  // fuzz on a guitar tuned way down, the speaker rolled off early: sleep, electric wizard, whirr
  'sludge-guitar': { name: 'Sludge guitar', family: 'guitar', edge: 0.7, kind: 'pluck', bright: 0.55, soft: 0.1, decay: 7.5, ring: 0.3, env: [0.002, 4, 1, 0.4], gain: 1, ornaments: { slide: 0.2, glide: 0.1 },
    amp: { tight: 40, curve: 'soft', gain: 120, sustain: 18, mids: [700, -6], body: [120, 6], cab: 3000, level: 0.021, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.2 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.6 } } },
  // kevin shields' glide guitar: fuzz, the tremolo arm never still so whole chords warp in and out of
  // tune, a held tone under the string so chords don't die, and reverse reverb swelling up behind
  'glide-guitar':  { name: 'Glide guitar', family: 'guitar', edge: 0.55, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 6, ring: 0.35, sustain: 0.5, env: [0.01, 3, 1, 0.5], gain: 1, vibrato: { rate: 0.6, depth: 32, delay: 0 },
    amp: { tight: 60, curve: 'soft', gain: 40, sustain: 12, mids: [1000, -4], cab: 3500, level: 0.0263, chorus: [0.45, 0.004], reverse: 0.8 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 } } },
  // a hollow body jazz guitar on its neck pickup, the tone knob rolled back, into a clean valve amp:
  // round and warm (wes montgomery, joe pass)
  'jazz-guitar':   { name: 'Jazz guitar', family: 'guitar', edge: 0.15, kind: 'pluck', bright: 0.4, soft: 0.4, decay: 2.6, body: [[110, 3, 1.5], [250, 2, 1.5]], env: [0.003, 2.6, 1, 0.3], gain: 1, ornaments: { slide: 0.1, grace: 0.05 },
    amp: { tight: 50, curve: 'tube', gain: 1.4, mids: [900, -2], cab: 2600, level: 0.68 }, samples: 'hollow-guitar', sampled: { gain: 0.9 } },

  // bells
  // a church bell's real overtones: the hum an octave down, the strike note, a minor third (the
  // tierce, why bells sound a little sad), the fifth, the octave and some odd ones above. too harsh
  // for anything but the dark and epic moods
  bell:          { name: 'Church bell', family: 'bell', edge: 0.7, world: 'acoustic', kind: 'modal', modes: [[0.5, 0.45, 6], [1, 0.8, 4.5], [1.19, 0.25, 3.5], [1.5, 0.25, 3], [2, 0.55, 2.5, 0.3], [2.51, 0.18, 1.6, 0.5], [2.66, 0.22, 1.4, 0.5], [3.01, 0.12, 1, 0.8], [4.1, 0.08, 0.6, 1]], strike: [0.25, 4000, 0.004], track: 0.3, env: [0.002, 1, 1, 2.5], gain: 0.58, samples: 'tubular-bells', sampled: { gain: 0.7 } },
  // the gentle bells keep harmonic overtones (2, 3, 7) so they never clash with the chords
  'glass-bell':  { name: 'Glass bell', family: 'bell', edge: 0.3, kind: 'modal', modes: [[1, 1, 4], [2, 0.3, 2, 0.4], [3, 0.06, 0.9, 0.8]], strike: [0.05, 6000, 0.003], track: 0.3, env: [0.004, 1, 1, 2], gain: 0.336, samples: 'hand-chimes', sampled: { gain: 0.33 } },
  chime:         { name: 'Wind chime', family: 'bell', edge: 0.45, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3], [3, 0.2, 1, 0.5], [7, 0.05, 0.3, 1]], strike: [0.1, 7000, 0.002], track: 0.3, env: [0.002, 1, 1, 1.5], gain: 0.31 },
  // nearly a pure tone, the soft bell lead of aphex twin's ageispolis. a synth, so it stays fm
  'sine-bell':   { name: 'Sine bell', family: 'bell', edge: 0.1, kind: 'fm', ratio: 1, index: 0.35, indexDecay: 0.4, sustainIndex: 0, partials: [[2, 0.12, 0.6]], env: [0.003, 2.2, 0, 1.2], gain: 0.2 },
  // a struck pipe, out of tune with itself on purpose: fallout's rusting wasteland. too harsh for
  // anything but the dark moods
  'metal-ping':  { name: 'Metal ping', family: 'bell', edge: 0.55, kind: 'fm', ratio: 2.41, index: 1.1, indexDecay: 0.5, sustainIndex: 0.08, partials: [[5.43, 0.08, 0.3]], env: [0.002, 3, 0, 2], gain: 0.13 },
  // a glockenspiel: little steel bars, bright and short, with the bars' own out of tune overtones
  // dying almost at once
  glock:         { name: 'Glockenspiel', family: 'bell', edge: 0.4, world: 'acoustic', kind: 'modal', modes: [[1, 1, 2.2], [2.71, 0.2, 0.5, 0.6], [5.15, 0.06, 0.15, 1]], strike: [0.12, 8000, 0.002], track: 0.4, env: [0.002, 1, 1, 0.8], gain: 0.43, samples: 'glockenspiel', sampled: { gain: 1.1 } },

  // leads
  // the blown and bowed leads drift a few cents as they're held (drift: breath is never perfectly
  // steady), blown ones start with a puff of air (chiff), and each says which ornaments a player of
  // it would use (ornaments, which the composer adds, see ornament() in music.js)
  flute:         { name: 'Flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.12], ['sine', 0, 2, 0.04]], breath: 0.35, chiff: 0.35, env: [0.09, 0.3, 0.85, 0.5], scoop: 15, drift: 4, gain: 0.19, vibrato: { rate: 5, depth: 12, delay: 0.35 }, ornaments: { grace: 0.2, slide: 0.06, trill: 0.06, swell: 0.15 }, samples: 'flute', sampled: { gain: 2.5 } },
  ocarina:       { name: 'Ocarina', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['soft', 0]], breath: 0.15, chiff: 0.2, filter: { freq: 2500, q: 0.4 }, env: [0.05, 0.3, 0.8, 0.45], scoop: 10, drift: 3, gain: 0.21, vibrato: { rate: 5.5, depth: 8, delay: 0.3 }, ornaments: { grace: 0.12, slide: 0.08, swell: 0.15 }, samples: 'ocarina', sampled: { name: 'Ocarina (FluidR3)', gain: 0.39 }, more: { 'clay-ocarina': { name: 'Clay ocarina (VCSL)', gain: 0.71 } } },
  'soft-lead':   { name: 'Soft lead', family: 'lead', edge: 0.2, kind: 'sub', osc: [['triangle', -3], ['triangle', 4]], filter: { freq: 1800, q: 0.6, track: 0.5 }, env: [0.04, 0.4, 0.75, 0.6], scoop: 8, gain: 0.16, vibrato: { rate: 5, depth: 6, delay: 0.4 }, ornaments: { slide: 0.12, glide: 0.08, swell: 0.15 } },
  'saw-lead':    { name: 'Saw lead', family: 'lead', edge: 1, kind: 'sub', osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 2, env: 2.2, attack: 0.02, decay: 0.3, track: 0.5 }, env: [0.01, 0.3, 0.7, 0.35], gain: 0.085, vibrato: { rate: 5.5, depth: 9, delay: 0.3 }, ornaments: { slide: 0.15, glide: 0.07 } },
  'square-lead': { name: 'Square lead', family: 'lead', edge: 0.85, world: 'chip', kind: 'sub', osc: [['square', -4], ['square', 5, -1, 0.3]], filter: { freq: 2000, q: 0.7, track: 0.4 }, env: [0.01, 0.25, 0.65, 0.25], gain: 0.07, vibrato: { rate: 6, depth: 7, delay: 0.25 }, ornaments: { slide: 0.1, glide: 0.05 } },
  // a violin: the bowed wave through its body, bow noise, drift, slides between notes and the odd
  // double stop (two strings at once, stop) the way fiddlers play
  violin:        { name: 'Violin', family: 'lead', edge: 0.5, world: 'acoustic', kind: 'sub', osc: [['bowed', 0], ['bowed', 4, 0, 0.35]], breath: 0.05, filter: { freq: 3400, q: 0.6, track: 0.3 }, body: [[280, 5, 2], [460, 4, 2.5], [1500, -3, 1.2], [2800, 5, 0.9]], env: [0.15, 0.4, 0.85, 0.5], scoop: 20, drift: 5, gain: 0.048, vibrato: { rate: 5.6, depth: 16, delay: 0.25 }, ornaments: { slide: 0.25, grace: 0.15, trill: 0.05, stop: 0.1, glide: 0.12, swell: 0.3 }, samples: 'violin', sampled: { name: 'Violin (VSCO)', gain: 0.33 }, more: { fiddle: { name: 'Fiddle (FluidR3)', gain: 0.3 } } },
  // a french horn: brass waves, dark, the filter opening as each note blooms
  horn:          { name: 'Horn', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['brass', -3], ['brass', 3]], filter: { freq: 650, q: 0.8, env: 2.6, attack: 0.12, decay: 0.5, track: 0.6 }, body: [[450, 4, 1.2]], env: [0.08, 0.4, 0.8, 0.5], scoop: 15, drift: 3, gain: 0.12, vibrato: { rate: 4.8, depth: 6, delay: 0.5 }, ornaments: { slide: 0.08, fall: 0.06, swell: 0.3 }, samples: 'horn', sampled: { gain: 0.2 } },
  whistle:       { name: 'Whistle', family: 'lead', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['sine', 0]], breath: 0.25, chiff: 0.25, env: [0.06, 0.2, 0.9, 0.35], scoop: 25, drift: 4, gain: 0.2, vibrato: { rate: 6, depth: 18, delay: 0.2 }, ornaments: { grace: 0.25, slide: 0.12, trill: 0.08, swell: 0.1 }, samples: 'recorder', sampled: { name: 'Soprano recorder (VCSL)', gain: 1.3 }, more: { whistle: { name: 'Whistled (FluidR3)', gain: 0.42 } } },
  'pluck-lead':  { name: 'Plucked synth', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -5], ['square', 5, 0, 0.5]], filter: { freq: 500, q: 3, env: 7, attack: 0.003, decay: 0.12, track: 0.6 }, env: [0.003, 0.35, 0.2, 0.25], gain: 0.09 },
  // one nes pulse channel with its delayed vibrato: undertale, deltarune, early terraria
  'pulse-lead':  { name: 'Pulse lead', family: 'lead', edge: 0.6, world: 'chip', kind: 'sub', osc: [['pulse25', 0]], filter: { freq: 5000, q: 0.3, track: 0.3 }, env: [0.004, 0.25, 0.75, 0.18], gain: 0.17, vibrato: { rate: 6, depth: 10, delay: 0.35 }, ornaments: { slide: 0.08, glide: 0.05 } },
  // a square crushed down to a few steps of loudness, the broken atari chip of crystal castles
  'bit-lead':    { name: 'Bit lead', family: 'lead', edge: 0.9, world: 'chip', kind: 'sub', osc: [['sawtooth', 0], ['triangle', 6, 1, 0.5]], crush: 4, filter: { freq: 4000, q: 0.5, track: 0.3 }, env: [0.003, 0.2, 0.7, 0.12], gain: 0.155, ornaments: { slide: 0.1, glide: 0.05 }, vibrato: { rate: 7, depth: 14, delay: 0.15 } },
  'pan-flute':   { name: 'Pan flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.08]], breath: 0.7, chiff: 0.5, filter: { freq: 2600, q: 0.4 }, env: [0.03, 0.25, 0.8, 0.45], scoop: 18, drift: 4, gain: 0.14, vibrato: { rate: 5.2, depth: 9, delay: 0.4 }, ornaments: { grace: 0.15, slide: 0.15, swell: 0.15 }, samples: 'pan-flute', sampled: { gain: 0.34 } },
  // a reed's odd harmonics (the hollow wave), a little breath and a slow, late vibrato: warm and woody,
  // the clarinet of stardew valley's autumn and of old village themes
  clarinet:      { name: 'Clarinet', family: 'lead', edge: 0.2, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.06]], breath: 0.12, chiff: 0.1, filter: { freq: 2400, q: 0.5, track: 0.4 }, body: [[1500, 3, 1.2]], env: [0.05, 0.4, 0.85, 0.45], scoop: 12, drift: 3, gain: 0.13, vibrato: { rate: 4.8, depth: 5, delay: 0.6 }, ornaments: { slide: 0.12, grace: 0.08, swell: 0.2 }, samples: 'clarinet', sampled: { gain: 0.58 } },
  // two reeds tuned a few cents apart, beating against each other (the musette sound), over a lower
  // reed: a village dance tune
  accordion:     { name: 'Accordion', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['pulse25', -8], ['pulse25', 8], ['sawtooth', 0, -1, 0.3]], filter: { freq: 2600, q: 0.6, track: 0.3 }, body: [[1000, 3, 1]], env: [0.03, 0.3, 0.9, 0.3], gain: 0.09, tremolo: { rate: 5, depth: 0.08 }, ornaments: { grace: 0.12, trill: 0.05, swell: 0.2 }, samples: 'accordion', sampled: { gain: 0.31 } },
  // a double reed, nasal and loud enough to carry outdoors: the zurna and mizmar of the desert, and a
  // bagpipe's chanter. a thin pulse through a resonant filter, sliding up onto each note
  shawm:         { name: 'Shawm', family: 'lead', edge: 0.6, world: 'acoustic', own: true, kind: 'sub', osc: [['pulse12', 0], ['sawtooth', 3, 0, 0.4]], breath: 0.1, filter: { freq: 1800, q: 1.6, track: 0.5 }, body: [[1200, 4, 2], [2800, 3, 1.5]], env: [0.04, 0.3, 0.85, 0.35], scoop: 25, drift: 5, gain: 0.13, vibrato: { rate: 5.8, depth: 14, delay: 0.3 }, ornaments: { grace: 0.25, trill: 0.1, slide: 0.15, swell: 0.15 }, samples: 'shehnai', sampled: { gain: 0.25 } },
  // 80s brass from a synth, the filter opening as each note swells (dying light, deltarune)
  'synth-brass': { name: 'Synth brass', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -7], ['sawtooth', 7], ['pulse25', 0, -1, 0.4]], filter: { freq: 900, q: 1, env: 3, attack: 0.12, decay: 0.6, track: 0.5 }, env: [0.05, 0.4, 0.85, 0.45], scoop: 15, gain: 0.07, vibrato: { rate: 5, depth: 5, delay: 0.5 }, ornaments: { slide: 0.1, fall: 0.08, swell: 0.25 } },
  // lead guitars, standing in for a singer: a held tone under the string so long notes sing on, bends
  // up onto notes (bendBy: a whole tone), slides, and a wide shake on long notes (shake). the bends
  // used to be a coin toss in the synth on every play; now the composer writes them, so they're the
  // same every time and you can see them in the score
  'lead-guitar': { name: 'Lead guitar', family: 'lead', edge: 0.65, own: true, kind: 'pluck', bright: 0.7, soft: 0.1, decay: 5, ring: 0.35, sustain: 0.35, env: [0.003, 2, 0.9, 0.25], gain: 1, vibrato: { rate: 5.5, depth: 10, delay: 0.3 }, ornaments: { bend: 0.35, bendBy: 2, slide: 0.2, shake: 0.45, stop: 0.06, glide: 0.08, release: 0.15 },
    amp: { tight: 150, boost: [800, 6], curve: 'soft', gain: 25, sustain: 10, presence: [2800, 2], cab: 4800, level: 0.034 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.2 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 3 } } },
  // shred: more gain, wider vibrato, whole tone bends (kirk hammett, dimebag, the doom solos)
  'metal-lead':  { name: 'Metal lead', family: 'lead', edge: 0.85, own: true, kind: 'pluck', bright: 0.75, soft: 0, decay: 5, ring: 0.35, sustain: 0.4, env: [0.002, 2, 0.9, 0.2], gain: 1, vibrato: { rate: 6, depth: 14, delay: 0.22 }, ornaments: { bend: 0.4, bendBy: 2, slide: 0.25, shake: 0.55, glide: 0.06, release: 0.12 },
    amp: { tight: 200, boost: [900, 5], curve: 'hard', gain: 70, sustain: 12, mids: [600, -5], presence: [3200, 4], cab: 5200, level: 0.036 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.9 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 4 } } },
  // a fuzz lead, thick and sustaining forever: billy corgan, j mascis
  'fuzz-lead':   { name: 'Fuzz lead', family: 'lead', edge: 0.65, own: true, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 6, ring: 0.3, sustain: 0.45, env: [0.003, 2, 0.9, 0.3], gain: 1, vibrato: { rate: 5, depth: 10, delay: 0.35 }, ornaments: { bend: 0.3, bendBy: 1, slide: 0.2, shake: 0.4, glide: 0.09, release: 0.12 },
    amp: { tight: 70, curve: 'soft', gain: 80, sustain: 16, mids: [900, -6], cab: 3600, level: 0.038 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.5 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 3.4 } } },
  // voices with no words, for the moods whose songs would have a singer: a breathy one sung close and
  // buried in the guitars (rachel goswell, bilinda butcher), and one rasping like it's shouting
  // (kurt cobain, courtney love). singers slide between notes more than any instrument
  'dream-voice': { name: 'Dreamy voice', family: 'lead', edge: 0.1, own: true, kind: 'choir', vowel: 'oo', singers: [-5, 5], breath: 0.5, env: [0.12, 0.5, 0.85, 0.9], scoop: 15, drift: 5, gain: 0.26, vibrato: { rate: 5, depth: 10, delay: 0.4 }, ornaments: { slide: 0.3, grace: 0.06, glide: 0.12, swell: 0.3 } },
  'rasp-voice':  { name: 'Rasping voice', family: 'lead', edge: 0.55, own: true, kind: 'choir', vowel: 'ah', singers: [0, 6], rasp: 4, breath: 0.3, env: [0.03, 0.3, 0.85, 0.3], scoop: 35, drift: 6, gain: 0.21, vibrato: { rate: 5.5, depth: 14, delay: 0.3 }, ornaments: { slide: 0.25, fall: 0.12, glide: 0.08, swell: 0.15 } },
  // saxophones: the reed wave, a puff of breath, the brass body's resonances, and the filter opening
  // as each note's blown harder. players scoop into notes, slide, fall off the ends of phrases and
  // shake long notes (bebop, mettaton's death by glamour, lounge and soul)
  'alto-sax':    { name: 'Alto sax', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['reed', 0], ['reed', 4, 0, 0.25]], breath: 0.18, chiff: 0.15, filter: { freq: 1800, q: 0.7, env: 1.8, attack: 0.06, decay: 0.4, track: 0.6 }, body: [[550, 3, 1.2], [1500, 4, 1.2], [2700, 3, 1.5]], env: [0.04, 0.4, 0.85, 0.3], scoop: 20, drift: 6, gain: 0.094, vibrato: { rate: 5.2, depth: 14, delay: 0.45 }, ornaments: { slide: 0.2, bend: 0.15, bendBy: 1, fall: 0.2, grace: 0.1, shake: 0.2, glide: 0.08, swell: 0.2, doit: 0.12 }, samples: 'alto-sax', sampled: { gain: 0.32 } },
  'tenor-sax':   { name: 'Tenor sax', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['reed', 0], ['reed', 5, 0, 0.25]], breath: 0.22, chiff: 0.15, filter: { freq: 1300, q: 0.7, env: 1.8, attack: 0.06, decay: 0.45, track: 0.6 }, body: [[450, 4, 1.2], [1100, 4, 1.2], [2300, 2, 1.5]], env: [0.05, 0.4, 0.85, 0.35], scoop: 20, drift: 6, gain: 0.09, vibrato: { rate: 5, depth: 12, delay: 0.5 }, ornaments: { slide: 0.2, bend: 0.15, bendBy: 1, fall: 0.2, grace: 0.1, shake: 0.2, glide: 0.09, swell: 0.2, doit: 0.1 }, samples: 'tenor-sax', sampled: { gain: 0.26 } },
  // a trumpet: brass waves, the filter flaring open on every note, the bell's bright resonances, a
  // lip slur up onto the note (scoop) and falls off the ends of phrases
  trumpet:       { name: 'Trumpet', family: 'lead', edge: 0.55, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], filter: { freq: 900, q: 0.9, env: 3.5, attack: 0.05, decay: 0.35, track: 0.7 }, body: [[1200, 5, 1.4], [2500, 4, 1.5]], env: [0.03, 0.35, 0.85, 0.25], scoop: 25, drift: 4, gain: 0.083, vibrato: { rate: 5.5, depth: 10, delay: 0.5 }, ornaments: { fall: 0.25, slide: 0.1, bend: 0.1, bendBy: 1, shake: 0.1, glide: 0.06, swell: 0.15, doit: 0.12 }, samples: 'trumpet', sampled: { gain: 0.3 } },
  // a trumpet with a harmon mute in its bell: thin, nasal and close (miles davis)
  'mute-trumpet': { name: 'Muted trumpet', family: 'lead', edge: 0.35, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], breath: 0.05, filter: { freq: 1500, q: 2.2, env: 1.6, attack: 0.05, decay: 0.3, track: 0.6 }, body: [[1600, 9, 3], [600, -8, 1]], env: [0.03, 0.35, 0.85, 0.3], scoop: 20, drift: 4, gain: 0.098, vibrato: { rate: 5, depth: 8, delay: 0.5 }, ornaments: { fall: 0.2, slide: 0.15, bend: 0.1, bendBy: 1, glide: 0.07, doit: 0.1 }, samples: 'harmon-trumpet', sampled: { gain: 0.5 } },
  // a trombone's slide is the one brass instrument that slides for real, so it slides often and slowly
  trombone:      { name: 'Trombone', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['brass', -3], ['brass', 3]], filter: { freq: 600, q: 0.9, env: 3, attack: 0.08, decay: 0.5, track: 0.6 }, body: [[500, 4, 1.2], [1100, 3, 1.3]], env: [0.05, 0.4, 0.85, 0.3], scoop: 15, drift: 4, gain: 0.091, vibrato: { rate: 4.8, depth: 6, delay: 0.6 }, ornaments: { slide: 0.55, fall: 0.2, glide: 0.18, swell: 0.2, doit: 0.1 }, samples: 'trombone', sampled: { gain: 0.14 } },
  // a harmonica: free reeds, cupped hands (body) and breath. players bend notes down with their mouth
  // and let them come back up, the cry of the blues and of a lonesome country tune
  harmonica:     { name: 'Harmonica', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['freereed', 0], ['freereed', 6, 0, 0.5]], breath: 0.25, filter: { freq: 2200, q: 0.7, track: 0.4 }, body: [[800, 4, 1.5], [2200, 3, 1.5]], env: [0.03, 0.3, 0.85, 0.2], drift: 5, gain: 0.127, tremolo: { rate: 5.5, depth: 0.1 }, ornaments: { bend: 0.35, bendBy: 1, slide: 0.2, shake: 0.3, grace: 0.1, glide: 0.08, swell: 0.2 }, samples: 'harmonica', sampled: { gain: 0.25 } },
  // a pedal steel: a steel bar sliding along the strings, a volume pedal swelling each note in (the
  // slow attack) and pedals bending one string of a chord up a step, so it slides between notes all
  // the time and often plays two at once (stop): country's crying sound
  'pedal-steel': { name: 'Pedal steel', family: 'lead', edge: 0.3, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 5, sustain: 0.5, env: [0.08, 2, 0.9, 0.6], gain: 1, vibrato: { rate: 5, depth: 8, delay: 0.5 }, ornaments: { slide: 0.6, glide: 0.2, stop: 0.3, shake: 0.1, release: 0.25 },
    amp: { tight: 60, curve: 'tube', gain: 1.2, presence: [2500, 2], cab: 6500, level: 0.96 }, samples: 'shiny-guitar', sampled: { gain: 1 } },
  // an erhu: two strings over a snake skin, bowed. nasal (the skin's resonances), with deep vibrato
  // and long slides between notes
  erhu:          { name: 'Erhu', family: 'lead', edge: 0.4, world: 'acoustic', own: true, kind: 'sub', osc: [['bowed', 0]], breath: 0.08, filter: { freq: 2600, q: 1, track: 0.3 }, body: [[800, 7, 2.5], [1700, -3, 1.5], [3000, 5, 2]], env: [0.1, 0.4, 0.85, 0.35], scoop: 30, drift: 6, gain: 0.074, vibrato: { rate: 5.8, depth: 22, delay: 0.25 }, ornaments: { slide: 0.6, glide: 0.22, grace: 0.15, trill: 0.05, swell: 0.35 }, samples: 'erhu', sampled: { gain: 0.2 } },
  // a shakuhachi: a bamboo flute played so breathily the air is half the sound, its pitch bent by
  // tilting the head (bend, slide), with a slow, deep vibrato
  shakuhachi:    { name: 'Shakuhachi', family: 'lead', edge: 0.15, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.08]], breath: 0.8, chiff: 0.6, env: [0.12, 0.4, 0.8, 0.5], scoop: 30, drift: 8, gain: 0.17, vibrato: { rate: 4.5, depth: 14, delay: 0.6 }, ornaments: { slide: 0.3, bend: 0.25, bendBy: 1, grace: 0.1, glide: 0.2, swell: 0.4 }, samples: 'shakuhachi', sampled: { gain: 0.43 } },
  // a bansuri: india's bamboo flute, breathy and sweet, sliding into notes and graced all the time
  bansuri:       { name: 'Bansuri', family: 'lead', edge: 0.15, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.1]], breath: 0.5, chiff: 0.4, env: [0.08, 0.3, 0.85, 0.45], scoop: 20, drift: 5, gain: 0.18, vibrato: { rate: 5.2, depth: 12, delay: 0.5 }, ornaments: { slide: 0.35, glide: 0.18, grace: 0.25, trill: 0.08, swell: 0.25 }, samples: 'flute', sampled: { gain: 2.3 } },
  // a melodica: a keyboard you blow into, reeds like an accordion's. reggae's lead (augustus pablo)
  melodica:      { name: 'Melodica', family: 'lead', edge: 0.35, world: 'acoustic', kind: 'sub', osc: [['freereed', -3], ['freereed', 3]], breath: 0.15, filter: { freq: 2400, q: 0.6, track: 0.3 }, body: [[1000, 3, 1.2]], env: [0.03, 0.3, 0.9, 0.15], drift: 3, gain: 0.1, ornaments: { grace: 0.1, slide: 0.1, swell: 0.15 }, samples: 'bandoneon', sampled: { gain: 0.34 } },
  // a bagpipe's chanter: a double reed blown from a bag, so it never stops for breath and can't play
  // louder or softer. pipers can't tongue either, so they split notes with quick grace notes ("cuts")
  // instead, which is why it has so many
  bagpipe:       { name: 'Bagpipe', family: 'lead', edge: 0.65, world: 'acoustic', own: true, kind: 'sub', osc: [['pulse12', 0], ['sawtooth', 2, 0, 0.5]], filter: { freq: 2400, q: 1.2, track: 0.4 }, body: [[1000, 4, 2], [2500, 3, 1.5]], env: [0.03, 0.2, 0.95, 0.15], drift: 2, gain: 0.11, ornaments: { grace: 0.4, trill: 0.05 }, samples: 'bagpipe', sampled: { name: 'Squidpipes (Karoryfer)', gain: 0.27 }, more: { 'gm-bagpipe': { name: 'Bagpipe (FluidR3)', gain: 0.2 } } },
  // an oboe: a double reed, nasal and plaintive, the pastoral solo of the orchestra. its ancestor, the
  // aulos, is the ancient world's pipe
  oboe:          { name: 'Oboe', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['reed', 0]], breath: 0.05, filter: { freq: 2000, q: 1.2, track: 0.4 }, body: [[1100, 6, 2], [2700, 4, 1.5]], env: [0.04, 0.3, 0.85, 0.3], scoop: 15, drift: 4, gain: 0.25, vibrato: { rate: 5.2, depth: 10, delay: 0.35 }, ornaments: { grace: 0.15, trill: 0.06, slide: 0.08, swell: 0.25 }, samples: 'oboe', sampled: { gain: 0.41 } },
  // blowing across a bottle: nearly a pure tone in a lot of breath. underwater, a cave, something old
  'blown-bottle': { name: 'Blown bottle', family: 'lead', edge: 0.1, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['sine', 0, 1, 0.05]], breath: 0.9, chiff: 0.3, env: [0.08, 0.3, 0.8, 0.4], drift: 4, gain: 0.2, ornaments: { slide: 0.1, swell: 0.2 }, samples: 'blown-bottle', sampled: { gain: 0.41 } },
  // wine glasses sung by a wet finger round the rim: pure, glassy and very still. only four were
  // recorded, high up, so it's a tune instrument
  'wine-glass':  { name: 'Wine glasses', family: 'lead', edge: 0.1, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['sine', 0, 1, 0.15], ['sine', 0, 2, 0.05]], env: [0.6, 0.5, 0.9, 1.5], drift: 2, gain: 0.22, tremolo: { rate: 4, depth: 0.15 }, ornaments: { swell: 0.3 }, samples: 'wine-glass', sampled: { gain: 0.74 } },
  // a bowed psaltery: a triangle of strings, each bowed on its own, thin and ghostly
  'bowed-psaltery': { name: 'Bowed psaltery', family: 'lead', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['bowed', 0]], breath: 0.04, filter: { freq: 3500, q: 0.5 }, body: [[1200, 3, 1.5]], env: [0.25, 0.4, 0.85, 1.2], drift: 4, gain: 0.063, vibrato: { rate: 5, depth: 6, delay: 0.5 }, ornaments: { swell: 0.3 }, samples: 'bowed-psaltery', sampled: { gain: 0.83 } },
  // a soul singer with no words: a warm "oh", sliding and running between notes (melisma, grace) and
  // shaking long ones
  'soul-voice':  { name: 'Soul voice', family: 'lead', edge: 0.15, own: true, kind: 'choir', vowel: 'oh', singers: [-3, 4], breath: 0.25, env: [0.08, 0.4, 0.85, 0.5], scoop: 25, drift: 6, gain: 0.2, vibrato: { rate: 5.4, depth: 16, delay: 0.35 }, ornaments: { slide: 0.45, glide: 0.12, grace: 0.25, fall: 0.1, shake: 0.2, swell: 0.25 } },

  // basses
  'sub-bass':    { name: 'Sub bass', family: 'bass', edge: 0, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.25]], env: [0.02, 0.3, 0.9, 0.3], gain: 0.42 },
  'round-bass':  { name: 'Round bass', family: 'bass', edge: 0.1, kind: 'sub', osc: [['triangle', 0], ['sine', 0, -1, 0.5]], filter: { freq: 600, q: 0.5 }, env: [0.01, 0.4, 0.75, 0.2], gain: 0.4 },
  'synth-bass':  { name: 'Synth bass', family: 'bass', edge: 0.5, kind: 'sub', osc: [['sawtooth', -4], ['square', 4, -1, 0.5]], filter: { freq: 280, q: 4, env: 4, attack: 0.005, decay: 0.15 }, env: [0.005, 0.3, 0.7, 0.12], gain: 0.15, ornaments: { slide: 0.1, glide: 0.05 } },
  // an electric bass played with the fingers: round, with a soft thump
  'pluck-bass':  { name: 'Plucked bass', family: 'bass', edge: 0.2, kind: 'pluck', bright: 0.45, soft: 0.3, decay: 2, filter: { freq: 900, q: 0.7 }, env: [0.002, 1.5, 1, 0.15], gain: 1.3, ornaments: { slide: 0.08, glide: 0.06 }, samples: 'bass-guitar', sampled: { gain: 0.83 } },
  // a double bass, its big wooden body booming under the plucked string
  upright:       { name: 'Upright bass', family: 'bass', edge: 0.1, world: 'acoustic', kind: 'pluck', bright: 0.22, soft: 0.6, decay: 1.4, filter: { freq: 600, q: 0.8 }, body: [[90, 4, 2], [180, 3, 1.5], [1100, 2, 1.2]], env: [0.004, 1, 1, 0.14], gain: 0.6, ornaments: { slide: 0.05, glide: 0.06 }, samples: 'double-bass', sampled: { name: 'Contrabass (VSCO)', gain: 0.72 }, more: { 'meat-bass': { name: 'Meatbass (Karoryfer)', gain: 0.39 } } },
  // (edge 0.7 rather than a lead's 1: it's buzzy, but under the band, and at 1 it never fitted under any
  // mood's backing cap, so it was never picked)
  'growl-bass':  { name: 'Growl bass', family: 'bass', edge: 0.7, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['square', 0, -1, 0.6]], filter: { freq: 420, q: 6, env: 3, attack: 0.01, decay: 0.25 }, env: [0.005, 0.3, 0.8, 0.12], gain: 0.11, ornaments: { slide: 0.15, glide: 0.06 } },
  'chip-bass':   { name: 'Triangle bass', family: 'bass', edge: 0.15, world: 'chip', kind: 'sub', osc: [['chiptri', 0]], env: [0.003, 0.2, 0.9, 0.06], gain: 0.42 },
  // two saws a little apart, beating slowly against each other under a moving filter
  reese:         { name: 'Reese bass', family: 'bass', edge: 0.6, kind: 'sub', osc: [['sawtooth', -14], ['sawtooth', 14], ['sine', 0, -1, 0.6]], filter: { freq: 380, q: 1.5, lfo: [0.2, 0.35] }, env: [0.01, 0.3, 0.9, 0.15], gain: 0.12, ornaments: { slide: 0.15, glide: 0.08 } },
  // a bassoon: the oboe's big brother, a double reed folded in two. woody and a little comic, a medieval
  // or pastoral band's bass
  bassoon:       { name: 'Bassoon', family: 'bass', edge: 0.25, world: 'acoustic', kind: 'sub', osc: [['reed', 0]], filter: { freq: 900, q: 1, track: 0.5 }, body: [[500, 4, 2], [1150, 3, 1.5]], env: [0.04, 0.3, 0.85, 0.25], scoop: 10, drift: 3, gain: 0.14, ornaments: { slide: 0.05 }, samples: 'bassoon', sampled: { gain: 0.21 } },
  // the high, chorused post-punk bass that carries the tune as much as the root
  'chorus-bass': { name: 'Chorus bass', family: 'bass', edge: 0.35, kind: 'sub', osc: [['sawtooth', -8], ['triangle', 8], ['sine', 0, -1, 0.4]], filter: { freq: 1100, q: 0.8, env: 2, attack: 0.005, decay: 0.2, track: 0.4 }, env: [0.004, 0.5, 0.6, 0.15], gain: 0.18 },
  // a bass played with a pick through a grinding amp, with its clean low end blended back in (dry),
  // the way a bass rig keeps its weight: rock, punk and grunge
  'pick-bass':   { name: 'Picked bass', family: 'bass', edge: 0.3, own: true, kind: 'pluck', bright: 0.55, soft: 0.1, decay: 1.8, env: [0.002, 1.6, 1, 0.1], gain: 1,
    amp: { low: 35, curve: 'tube', gain: 4, presence: [1500, 3], cab: 2800, level: 0.15, dry: 0.45 }, samples: 'bass-guitar', sampled: { gain: 0.92 } },
  // a fuzz bass, as heavy as the guitars: sludge and nugaze
  'fuzz-bass':   { name: 'Fuzz bass', family: 'bass', edge: 0.5, own: true, kind: 'pluck', bright: 0.5, soft: 0.1, decay: 3, env: [0.002, 2, 1, 0.12], gain: 1,
    amp: { low: 35, curve: 'soft', gain: 25, sustain: 8, mids: [600, -3], cab: 2200, level: 0.03, dry: 0.5 }, samples: 'bass-guitar', sampled: { gain: 0.98 } },
  // slap bass: the thumb slapping the low strings and fingers popping the high ones, so it's bright
  // and percussive (funk, mettaton's disco)
  'slap-bass':   { name: 'Slap bass', family: 'bass', edge: 0.35, kind: 'pluck', bright: 0.85, soft: 0, decay: 1.6, ring: 0.4, body: [[80, 3, 1], [2500, 4, 1]], env: [0.002, 1.6, 1, 0.08], gain: 0.5, ornaments: { slide: 0.15, glide: 0.07 }, samples: 'slap-bass', sampled: { gain: 0.68 } },
  // a fretless bass: no frets, so it slides between notes and its notes "mwah" (the filter opening
  // and closing on each one). jaco pastorius, and a lot of soul and lounge
  fretless:      { name: 'Fretless bass', family: 'bass', edge: 0.15, kind: 'sub', osc: [['triangle', 0], ['sawtooth', 0, 0, 0.3], ['sine', 0, -1, 0.4]], filter: { freq: 650, q: 1.8, env: 2.2, attack: 0.03, decay: 0.35, track: 0.5 }, env: [0.01, 0.6, 0.8, 0.15], drift: 3, gain: 0.325, ornaments: { slide: 0.5, glide: 0.15 }, samples: 'fretless', sampled: { gain: 0.48 } },
  // a tuba: the oom of an oom-pah band, brass waves kept dark
  tuba:          { name: 'Tuba', family: 'bass', edge: 0.2, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], filter: { freq: 350, q: 0.8, env: 2.2, attack: 0.08, decay: 0.5, track: 0.6 }, env: [0.05, 0.4, 0.85, 0.25], scoop: 10, drift: 3, gain: 0.15, samples: 'tuba', sampled: { gain: 0.3 } },
  // the 808's bass drum with its decay turned right up: a long, booming sine that drops onto its note,
  // under trap, club records and crystal castles. players slide between notes all the time (the trap
  // "glide"). one recording, so it stretches further than others (reach)
  '808-bass':    { name: '808 bass', family: 'bass', edge: 0.1, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.12]], env: [0.005, 1.2, 0.5, 0.25], gain: 0.57, ornaments: { slide: 0.15, glide: 0.08 }, samples: '808-bass', sampled: { gain: 1.1, reach: 20 } },

  // drones
  'deep-drone':  { name: 'Deep drone', family: 'drone', edge: 0.35, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 9], ['sine', 0, -1, 0.7]], filter: { freq: 300, q: 2 }, env: [4, 3, 0.85, 5], gain: 0.07, tremolo: { rate: 0.13, depth: 0.25 } },
  // cellos holding a note: bowed waves, a cello's body, each player drifting on their own
  'cello-drone': { name: 'Cello drone', family: 'drone', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['bowed', -3], ['bowed', 4]], breath: 0.03, filter: { freq: 900, q: 1 }, body: [[130, 4, 2], [400, 3, 2], [2000, 2, 1]], env: [2.5, 2, 0.85, 3], ensemble: true, drift: 4, gain: 0.0525, vibrato: { rate: 4.5, depth: 7, delay: 1.5 }, samples: 'cello-section', sampled: { gain: 0.36 } },
  void:          { name: 'The void', family: 'drone', edge: 0.1, kind: 'sub', osc: [['sine', 0], ['sine', 7], ['sine', -5, 1, 0.3]], breath: 0.6, env: [5, 3, 0.85, 6], gain: 0.17, tremolo: { rate: 0.08, depth: 0.4 } },
  'bowed-metal': { name: 'Bowed metal', family: 'drone', edge: 0.6, kind: 'fm', ratio: 2.71, index: 1.4, indexDecay: 6, sustainIndex: 0.9, env: [3, 2, 0.85, 4], gain: 0.07, vibrato: { rate: 0.3, depth: 20, delay: 0 } },
  'organ-drone': { name: 'Organ drone', family: 'drone', edge: 0.3, kind: 'sub', osc: [['organ', 0], ['organ', 3, -1, 0.5]], filter: { freq: 1600, q: 0.3 }, env: [2, 2, 0.9, 3], gain: 0.06, samples: 'pipe-organ', sampled: { gain: 0.37 } },
  // a warm tone on a worn tape loop, drooping and swelling: basinski, and aphex twin's quieter side
  'tape-loop':   { name: 'Tape loop', family: 'drone', edge: 0.1, kind: 'sub', osc: [['soft', 0], ['sine', 3, 1, 0.3]], filter: { freq: 1200, q: 0.4 }, env: [3, 2, 0.85, 4], gain: 0.1, vibrato: { rate: 0.17, depth: 14, delay: 0 }, tremolo: { rate: 0.09, depth: 0.3 } },
  // a tanpura: four long strings plucked over and over under a raga, never the tune, buzzing like the
  // sitar's (buzz). it's plucked, so it plays the drone's "cycle" pattern (music.js), not a held note
  tanpura:       { name: 'Tanpura', family: 'drone', edge: 0.2, world: 'acoustic', own: true, kind: 'pluck', bright: 0.7, soft: 0.2, decay: 6, ring: 0.35, buzz: 0.1, body: [[200, 3, 1.5], [800, 2, 1.5]], env: [0.003, 6, 1, 2], gain: 0.54, samples: 'sitar', sampled: { gain: 0.28 } },
  // throat singing from mongolia and tuva: one singer holds a low note while the shape of their mouth
  // picks out its overtones, so a whistled tune floats above the drone. every overtone is a whole
  // multiple of the note, so moved to the song's home note it stays in tune whatever the key. a singer
  // holds one note near their own (home, see the drone composer in music.js), not a chord. the recordings
  // are a tuvan sygyt (whistling) and a mongolian khoomei; the synthesised version is a voice through a
  // narrow vowel that whistles one overtone
  'throat-singing': { name: 'Throat singing', family: 'drone', edge: 0.3, world: 'acoustic', own: true, kind: 'choir', vowel: 'khoomei', singers: [0], breath: 0.1, home: 56, sung: true, env: [0.8, 1, 0.9, 2], drift: 3, gain: 0.19, samples: 'sygyt', sampled: { name: 'Sygyt (Alfonso Pérez)', gain: 0.22, reach: 12 }, more: { khoomei: { name: 'Khoomei (nemaavla)', gain: 0.35, reach: 12 } } },
  // kargyraa, the low style: the false vocal folds flap at half the voice's speed, so it growls an
  // octave under the note it's singing, with the overtones above it
  kargyraa:      { name: 'Throat singing, low', family: 'drone', edge: 0.35, world: 'acoustic', own: true, kind: 'choir', vowel: 'ah', singers: [0], breath: 0.15, home: 39, sung: true, env: [0.8, 1, 0.9, 2], drift: 3, gain: 0.68, samples: 'kargyraa', sampled: { name: 'Kargyraa (Alfonso Pérez)', gain: 0.41, reach: 12 } },
  // a didgeridoo: lips buzzing into a hollowed out branch, one deep note whose sound is shaped by the
  // mouth (the filter opening and closing) and breathed round and round without a break
  didgeridoo:    { name: 'Didgeridoo', family: 'drone', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['sawtooth', 0], ['square', 0, 0, 0.3]], breath: 0.1, filter: { freq: 450, q: 5, lfo: [0.6, 0.5] }, home: 37, env: [0.3, 0.5, 0.9, 0.8], drift: 2, gain: 0.061, samples: 'didgeridoo', sampled: { gain: 1.1, reach: 12 } },

  // drum kits, slots in KIT_SLOTS order
  'soft-kit': { name: 'Soft kit', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['pulse', 'sparse', 'brush', 'halftime', 'groove', 'train'], slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.7, hit: 'studio-kit/kick', level: 1.4 }, { voice: 'brush', tone: 2200, decay: 0.18, gain: 0.3 }, { voice: 'shaker', tone: 5500, decay: 0.07, gain: 0.18, hit: 'percussion/shaker', level: 0.23 },
    { voice: 'shaker', tone: 5000, decay: 0.25, gain: 0.2, hit: 'percussion/shaker', level: 0.37 }, { voice: 'tick', tune: 1100, decay: 0.06, gain: 0.2, hit: 'percussion/claves', level: 0.56 }, { voice: 'tom', tune: 90, decay: 0.4, gain: 0.45, hit: 'studio-kit/low-tom', level: 0.48, at: 90 }] },
  'lofi-kit': { name: 'Lo-fi kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'sparse', 'pulse', 'shuffle', 'onedrop'], slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.85, hit: 'lofi-kit/kick', level: 2.1 }, { voice: 'snare', tune: 180, tone: 1500, decay: 0.22, gain: 0.42, hit: 'lofi-kit/snare', level: 0.36 }, { voice: 'hat', tone: 6500, decay: 0.045, gain: 0.18, hit: 'lofi-kit/hat', level: 0.057 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.16, hit: 'lofi-kit/open-hat', level: 0.2 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.25, hit: 'lofi-kit/rim', level: 0.34 }, { voice: 'tom', tune: 100, decay: 0.35, gain: 0.5, hit: 'lofi-kit/low-tom', level: 0.76, at: 100 }] },
  // a pop and funk kit from its close microphones, dry and punchy, with a drum machine's clap
  'tight-kit': { name: 'Tight kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'march', 'tribal', 'sparse', 'pulse', 'shuffle', 'funk', 'onedrop', 'train'], slots: [
    { voice: 'kick', tune: 55, decay: 0.28, gain: 0.9, hit: 'tight-kit/kick', level: 1.2 }, { voice: 'snare', tune: 180, tone: 1900, decay: 0.16, gain: 0.5, hit: 'tight-kit/snare', level: 0.43 }, { voice: 'hat', tone: 8000, decay: 0.035, gain: 0.2, hit: 'tight-kit/hat', level: 0.13 },
    { voice: 'hat', tone: 8000, decay: 0.25, gain: 0.17, hit: 'tight-kit/open-hat', level: 0.43 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.4, hit: 'tr707/clap', level: 0.16 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5, hit: 'tight-kit/low-tom', level: 0.53, at: 110 },
    { voice: 'crash', tone: 6000, decay: 1.6, gain: 0.18, hit: 'tight-kit/crash', level: 0.86 }] },
  taiko: { name: 'Taiko', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'march', 'pulse', 'halftime', 'sparse'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95, hit: 'orchestra-kit/taiko', level: 0.45, at: 58 }, { voice: 'rim', tune: 1200, decay: 0.05, gain: 0.35, hit: 'orchestra-kit/taiko-rim', level: 2.9 }, { voice: 'shaker', tone: 4500, decay: 0.08, gain: 0.2, hit: 'percussion/shaker', level: 0.25 },
    { voice: 'hat', tone: 5000, decay: 0.2, gain: 0.15 }, { voice: 'tick', tune: 900, decay: 0.07, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.93 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75, hit: 'orchestra-kit/taiko', level: 0.71, at: 58 }] },
  // a heartbeat: a concert bass drum played softly, twice (lub-dub), and little else
  heartbeat: { name: 'Heartbeat', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse'], slots: [
    { voice: 'heart', tune: 52, decay: 0.2, gain: 0.85, hit: 'orchestra-kit/bass-drum', level: 1.4 }, { voice: 'brush', tone: 1800, decay: 0.2, gain: 0.25 }, { voice: 'shaker', tone: 6000, decay: 0.05, gain: 0.12, hit: 'percussion/shaker', level: 0.15 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.14, hit: 'percussion/shaker', level: 0.29 }, { voice: 'tick', tune: 1500, decay: 0.05, gain: 0.16, hit: 'percussion/claves', level: 0.41 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.5, hit: 'orchestra-kit/timpani', level: 3, at: 70 }] },
  brushes: { name: 'Brushes', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['brush', 'sparse', 'pulse', 'swing', 'train', 'shuffle', 'bossa'], slots: [
    { voice: 'kick', tune: 48, decay: 0.3, gain: 0.55, hit: 'studio-kit/kick', level: 1 }, { voice: 'brush', tone: 2600, decay: 0.22, gain: 0.38 }, { voice: 'brush', tone: 4000, decay: 0.08, gain: 0.18 },
    { voice: 'brush', tone: 3000, decay: 0.4, gain: 0.22 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.18, hit: 'studio-kit/rim', level: 0.73 }, { voice: 'tom', tune: 95, decay: 0.4, gain: 0.4, hit: 'studio-kit/low-tom', level: 0.47, at: 95 }] },
  // a clock's insides: woodblocks and claves ticking, a triangle for the chime
  clockwork: { name: 'Clockwork', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse', 'march', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 60, decay: 0.12, gain: 0.45 }, { voice: 'tick', tune: 900, decay: 0.05, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.81, at: 900 }, { voice: 'tick', tune: 2400, decay: 0.03, gain: 0.2, hit: 'percussion/claves', level: 0.42 },
    { voice: 'tick', tune: 1800, decay: 0.12, gain: 0.2, hit: 'percussion/triangle', level: 1.5 }, { voice: 'rim', tune: 2000, decay: 0.025, gain: 0.25, hit: 'percussion/claves', level: 0.42 }, { voice: 'tick', tune: 500, decay: 0.08, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.76, at: 900 }] },
  // the nes's drums: square wave thumps and bursts of noise
  'chip-kit': { name: 'Chip kit', family: 'kit', world: 'chip', kind: 'drums', suits: ['groove', 'march', 'halftime', 'four', 'break', 'pulse', 'sparse'], slots: [
    { voice: 'blip', tune: 55, decay: 0.16, gain: 0.58 }, { voice: 'noise', tone: 7000, decay: 0.13, gain: 0.58 }, { voice: 'noise', tone: 14000, decay: 0.03, gain: 0.29 },
    { voice: 'noise', tone: 12000, decay: 0.2, gain: 0.23 }, { voice: 'blip', tune: 880, decay: 0.04, gain: 0.22 }, { voice: 'blip', tune: 110, decay: 0.18, gain: 0.45 }] },
  // a club kit, a real roland tr-808: the long kick, the clap, the ticking hats (crystal castles, dying
  // light's chases, and most club records since 1982)
  'club-kit': { name: 'Club kit', family: 'kit', kind: 'drums', suits: ['four', 'break', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 50, decay: 0.5, gain: 1, hit: 'tr808/kick', level: 1.3 }, { voice: 'clap', tone: 1400, decay: 0.2, gain: 0.48, hit: 'tr808/clap', level: 0.27 }, { voice: 'hat', tone: 9500, decay: 0.03, gain: 0.17, hit: 'tr808/hat', level: 0.023 },
    { voice: 'hat', tone: 9000, decay: 0.35, gain: 0.15, hit: 'tr808/open-hat', level: 0.017 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.2, hit: 'tr808/rim', level: 0.23 }, { voice: 'tom', tune: 80, decay: 0.4, gain: 0.45, hit: 'tr808/low-tom', level: 0.51, at: 80 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr808/crash', level: 0.29 }] },
  // a cheap drum machine in a big room, a real roland tr-707 (sampled drums, the 80s' affordable box):
  // post-punk, have a nice life, and the beats under aphex twin's early ambient
  machine: { name: 'Drum machine', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'break', 'pulse', 'sparse', 'four', 'march'], slots: [
    { voice: 'kick', tune: 52, decay: 0.4, gain: 0.85, hit: 'tr707/kick', level: 1.3 }, { voice: 'snare', tune: 190, tone: 1200, decay: 0.4, gain: 0.45, hit: 'tr707/snare', level: 0.41 }, { voice: 'hat', tone: 7000, decay: 0.04, gain: 0.15, hit: 'tr707/hat', level: 0.021 },
    { voice: 'hat', tone: 7000, decay: 0.3, gain: 0.13, hit: 'tr707/open-hat', level: 0.021 }, { voice: 'rim', tune: 1300, decay: 0.04, gain: 0.22, hit: 'tr707/rim', level: 0.18 }, { voice: 'tom', tune: 100, decay: 0.5, gain: 0.45, hit: 'tr707/low-tom', level: 0.34, at: 100 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr707/crash', level: 0.2 }] },
  // rock kits: a ride for perc, a floor tom for low perc, and a real crash. a rock kit hit hard in a
  // live room, its snare cracking
  'rock-kit': { name: 'Rock kit', family: 'kit', kind: 'drums', suits: ['rock', 'punk', 'groove', 'halftime', 'breakdown', 'wash', 'march', 'sparse', 'pulse', 'shuffle', 'train'], slots: [
    { voice: 'kick', tune: 55, decay: 0.35, gain: 0.85, click: 0.35, hit: 'studio-kit/kick', level: 1.9 }, { voice: 'snare', tune: 190, tone: 1900, decay: 0.3, gain: 0.58, hit: 'studio-kit/snare', level: 0.54 }, { voice: 'hat', tone: 8000, decay: 0.04, gain: 0.2, hit: 'studio-kit/hat', level: 0.15 },
    { voice: 'hat', tone: 7500, decay: 0.35, gain: 0.17, hit: 'studio-kit/open-hat', level: 0.53 }, { voice: 'ride', tune: 2600, tone: 6500, decay: 0.9, gain: 0.17, hit: 'studio-kit/ride', level: 1.3 }, { voice: 'tom', tune: 90, decay: 0.45, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.6, at: 90 },
    { voice: 'crash', tone: 6000, decay: 1.8, gain: 0.2, hit: 'studio-kit/crash', level: 0.75 }] },
  // a metal kit: a short, clicking kick that stays clear under double kick, a tight high snare, and a
  // trashier crash
  'metal-kit': { name: 'Metal kit', family: 'kit', kind: 'drums', suits: ['double', 'rock', 'punk', 'breakdown', 'halftime', 'groove', 'march', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 62, decay: 0.2, gain: 0.8, click: 0.7, hit: 'studio-kit/kick', level: 2 }, { voice: 'snare', tune: 210, tone: 2400, decay: 0.22, gain: 0.58, hit: 'studio-kit/snare', level: 0.46 }, { voice: 'hat', tone: 9000, decay: 0.03, gain: 0.19, hit: 'studio-kit/hat', level: 0.087 },
    { voice: 'hat', tone: 8500, decay: 0.3, gain: 0.16, hit: 'studio-kit/open-hat', level: 0.35 }, { voice: 'ride', tune: 3000, tone: 7000, decay: 0.7, gain: 0.18, hit: 'studio-kit/ride', level: 1.3 }, { voice: 'tom', tune: 85, decay: 0.4, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.52, at: 85 },
    { voice: 'crash', tone: 4800, decay: 1.4, gain: 0.22, hit: 'studio-kit/crash', level: 0.76 }] },
  // shoegaze drums: a soft kick, a snare left ringing in a big room, and cymbals washing on and on
  'gaze-kit': { name: 'Gaze kit', family: 'kit', kind: 'drums', suits: ['wash', 'rock', 'halftime', 'groove', 'four', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 50, decay: 0.4, gain: 0.8, click: 0.1, hit: 'studio-kit/kick', level: 1.6 }, { voice: 'snare', tune: 175, tone: 1500, decay: 0.45, gain: 0.5, hit: 'studio-kit/snare', level: 0.5 }, { voice: 'hat', tone: 6500, decay: 0.06, gain: 0.17, hit: 'studio-kit/hat', level: 0.19 },
    { voice: 'hat', tone: 6000, decay: 0.5, gain: 0.15, hit: 'studio-kit/open-hat', level: 0.79 }, { voice: 'ride', tune: 2200, tone: 5000, decay: 1.6, gain: 0.17, hit: 'studio-kit/ride', level: 1.6 }, { voice: 'tom', tune: 80, decay: 0.6, gain: 0.5, hit: 'studio-kit/low-tom', level: 0.47, at: 80 },
    { voice: 'crash', tone: 5000, decay: 2.6, gain: 0.19, hit: 'studio-kit/crash', level: 0.88 }] },

  // hand drums: a darbuka's low doum and sharp tek, a riq's jingles, and a higher drum for the tribal
  // lines. the desert, the tropics, and a folk band's bodhran
  'hand-drums': { name: 'Hand drums', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'groove', 'march', 'halftime', 'pulse', 'sparse', 'tala', 'bossa'], slots: [
    { voice: 'tom', tune: 75, decay: 0.35, gain: 0.75, hit: 'percussion/tumba', level: 0.48, at: 75 }, { voice: 'rim', tune: 900, decay: 0.06, gain: 0.35, hit: 'percussion/bongo-high', level: 0.43 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.22 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'tick', tune: 1400, decay: 0.05, gain: 0.22, hit: 'percussion/claves', level: 0.57 }, { voice: 'tom', tune: 140, decay: 0.25, gain: 0.45, hit: 'percussion/conga', level: 1.1, at: 140 }] },
  // the orchestra's: a concert bass drum, a field snare, timpani for the low drum, a woodblock, and
  // clashed cymbals. trailers, epic battles and final bosses
  'orchestra-kit': { name: 'Orchestral drums', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'march', 'halftime', 'rock', 'groove', 'pulse', 'sparse'], slots: [
    { voice: 'taiko', tune: 45, decay: 1.1, gain: 0.9, hit: 'orchestra-kit/bass-drum', level: 0.66 }, { voice: 'snare', tune: 200, tone: 2200, decay: 0.2, gain: 0.5, hit: 'orchestra-kit/snare', level: 2 }, { voice: 'shaker', tone: 7000, decay: 0.05, gain: 0.12, hit: 'percussion/shaker', level: 0.18 },
    { voice: 'crash', tone: 5000, decay: 1.2, gain: 0.16, hit: 'orchestra-kit/cymbal', level: 0.31 }, { voice: 'tick', tune: 1000, decay: 0.07, gain: 0.25, hit: 'orchestra-kit/woodblock', level: 0.77 }, { voice: 'tom', tune: 70, decay: 0.9, gain: 0.6, hit: 'orchestra-kit/timpani', level: 4.1, at: 70 },
    { voice: 'crash', tone: 5500, decay: 2.2, gain: 0.2, hit: 'orchestra-kit/cymbal', level: 0.51 }] },
  // a jazz kit played with sticks: the ride cymbal carries the time (in the hat slot, so the swing
  // pattern's "hat" line rides), the hi hat's foot chick on two and four (the open hat slot), a
  // feathered kick and the snare comping softly
  'jazz-kit': { name: 'Jazz kit', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['swing', 'brush', 'sparse', 'pulse', 'shuffle', 'bossa'], slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.55, click: 0.1, hit: 'studio-kit/kick', level: 1.1 }, { voice: 'snare', tune: 200, tone: 2000, decay: 0.18, gain: 0.4, hit: 'studio-kit/snare', level: 0.28 }, { voice: 'ride', tune: 2800, tone: 6000, decay: 1.2, gain: 0.2, hit: 'studio-kit/ride', level: 1.7 },
    { voice: 'hat', tone: 7000, decay: 0.05, gain: 0.16, hit: 'studio-kit/hat', level: 0.15 }, { voice: 'rim', tune: 1400, decay: 0.03, gain: 0.2, hit: 'studio-kit/rim', level: 0.81 }, { voice: 'tom', tune: 95, decay: 0.5, gain: 0.45, hit: 'studio-kit/low-tom', level: 0.56, at: 95 },
    { voice: 'crash', tone: 5500, decay: 2, gain: 0.15, hit: 'studio-kit/crash', level: 0.6 }] },
  // latin percussion for bossa nova and lounge: a soft kick, a rim click (the cross stick clave) for the
  // snare, shakers, and a pair of congas
  'latin-kit': { name: 'Latin percussion', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['bossa', 'groove', 'sparse', 'pulse', 'tribal', 'halftime'], slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.6, hit: 'studio-kit/kick', level: 1.2 }, { voice: 'rim', tune: 1800, decay: 0.03, gain: 0.3, hit: 'percussion/claves', level: 0.68 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.15, hit: 'percussion/cabasa', level: 0.46 }, { voice: 'conga', tune: 330, decay: 0.25, gain: 0.4, hit: 'percussion/conga', level: 1.2, at: 330 }, { voice: 'conga', tune: 220, decay: 0.35, gain: 0.45, hit: 'percussion/tumba', level: 1, at: 220 }] },
  // tabla: the big bayan's "ge" (its pitch pushed up by the heel of the hand), the dayan's ringing "na"
  // (tuned to the song's home note, as a real one is tuned to sa), its short "ti" and open "tun", and
  // the flat slap "ka"
  tabla: { name: 'Tabla', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tala', 'tribal', 'pulse', 'sparse', 'groove'], slots: [
    { voice: 'bayan', tune: 70, decay: 0.6, gain: 0.4 }, { voice: 'dayan', tune: 330, decay: 0.5, gain: 0.225 }, { voice: 'dayan', tune: 330, decay: 0.08, gain: 0.125 },
    { voice: 'dayan', tune: 330, decay: 0.9, gain: 0.175 }, { voice: 'slap', tone: 1200, decay: 0.04, gain: 0.175 }, { voice: 'bayan', tune: 60, decay: 0.9, gain: 0.3 }] },
  // a funk and disco kit: a punchy kick, a crisp snare, tight hats that open on the off beats, a
  // cowbell, and a crash
  'funk-kit': { name: 'Funk kit', family: 'kit', kind: 'drums', suits: ['funk', 'four', 'groove', 'halftime', 'break', 'onedrop', 'shuffle', 'sparse', 'pulse', 'march'], slots: [
    { voice: 'kick', tune: 58, decay: 0.22, gain: 0.95, click: 0.4, hit: 'studio-kit/kick', level: 2.2 }, { voice: 'snare', tune: 200, tone: 2100, decay: 0.18, gain: 0.55, hit: 'studio-kit/snare', level: 0.43 }, { voice: 'hat', tone: 9000, decay: 0.03, gain: 0.2, hit: 'studio-kit/hat', level: 0.11 },
    { voice: 'hat', tone: 8500, decay: 0.28, gain: 0.17, hit: 'studio-kit/open-hat', level: 0.36 }, { voice: 'cowbell', tune: 560, decay: 0.15, gain: 0.16, hit: 'percussion/cowbell', level: 0.24 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5, hit: 'studio-kit/low-tom', level: 0.71, at: 110 },
    { voice: 'crash', tone: 6000, decay: 1.6, gain: 0.18, hit: 'studio-kit/crash', level: 0.63 }] },
  // the far east's temple drums: big taiko, a high, tight shime daiko for the snare, a little bell,
  // a wooden fish (mokugyo), and a gong for the crash
  temple: { name: 'Temple drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95, hit: 'orchestra-kit/taiko', level: 0.47, at: 58 }, { voice: 'taiko', tune: 220, decay: 0.15, gain: 0.45, hit: 'orchestra-kit/taiko-rim', level: 7.2 }, { voice: 'hat', tone: 9000, decay: 0.15, gain: 0.13, hit: 'percussion/triangle', level: 0.1 },
    { voice: 'tick', tune: 700, decay: 0.08, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 1 }, { voice: 'rim', tune: 1000, decay: 0.05, gain: 0.3, hit: 'percussion/claves', level: 0.68 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75, hit: 'orchestra-kit/taiko', level: 0.71, at: 58 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },

  // the third round's kits. they're own: only the moods that name them get them, and they're never
  // borrowed for a band whose mood has none that fit (pickInstrument), so older songs kept their kits
  // ghana's bobobo drums: the bass drum, a tenor drum for the low perc, the treble drum slapped for the
  // high one, clapping, and shakers
  'african-drums': { name: 'Bobobo drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'groove', 'march', 'halftime', 'pulse', 'sparse', 'gallop'], slots: [
    { voice: 'taiko', tune: 70, decay: 0.5, gain: 0.85, hit: 'bobobo/bass', level: 0.62 }, { voice: 'conga', tune: 300, decay: 0.15, gain: 0.45, hit: 'bobobo/treble-slap', level: 0.64 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5500, decay: 0.2, gain: 0.18, hit: 'world-percussion/big-shaker', level: 0.82 }, { voice: 'clap', tone: 1200, decay: 0.12, gain: 0.35, hit: 'body/clap', level: 0.43 }, { voice: 'conga', tune: 180, decay: 0.3, gain: 0.5, hit: 'bobobo/tenor', level: 0.98 }] },
  // a cajon, the box drum you sit on: its bass in the middle of the face, the snare wires cracking at its
  // top edge, a knock on its side, with a shaker and tambourine. coffee shops, flamenco, an acoustic pop band
  'cajon-kit': { name: 'Cajon', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['groove', 'halftime', 'pulse', 'sparse', 'bossa', 'train', 'tribal', 'boombap'], slots: [
    { voice: 'kick', tune: 60, decay: 0.2, gain: 0.7, hit: 'cajon/bass', level: 1.4 }, { voice: 'snare', tune: 200, tone: 1800, decay: 0.15, gain: 0.45, hit: 'cajon/slap', level: 3.5 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'rim', tune: 900, decay: 0.05, gain: 0.3, hit: 'cajon/side', level: 0.36 }, { voice: 'tom', tune: 120, decay: 0.2, gain: 0.45, hit: 'cajon/mid', level: 1.6 }] },
  // stomping and clapping: feet for the kick, hands for the snare, snaps, a slapped thigh and a thumped
  // chest. a sea shanty's crew, a tribe round the fire, we will rock you
  'stomp-kit': { name: 'Stomp and clap', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['groove', 'march', 'halftime', 'pulse', 'sparse', 'tribal', 'train', 'gallop'], slots: [
    { voice: 'kick', tune: 45, decay: 0.25, gain: 0.8, hit: 'body/stomp', level: 2.3 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.45, hit: 'body/clap', level: 0.59 }, { voice: 'tick', tune: 2000, decay: 0.03, gain: 0.2, hit: 'body/snap', level: 2.2 },
    { voice: 'clap', tone: 1500, decay: 0.25, gain: 0.3, hit: 'world-percussion/clap', level: 0.24 }, { voice: 'slap', tone: 1000, decay: 0.05, gain: 0.25, hit: 'body/thigh', level: 0.69 }, { voice: 'tom', tune: 100, decay: 0.25, gain: 0.45, hit: 'body/chest', level: 4.6 }] },
  // boom bap: a 70s kit through an old microphone, the dusty drums hip hop was sampled from. a fat kick,
  // a cracking snare, a rim click, and the hats
  'boombap-kit': { name: 'Boom bap kit', family: 'kit', own: true, kind: 'drums', suits: ['boombap', 'groove', 'halftime', 'sparse', 'pulse', 'funk', 'shuffle', 'break'], slots: [
    { voice: 'kick', tune: 52, decay: 0.35, gain: 0.9, hit: 'retro-kit/kick', level: 0.46 }, { voice: 'snare', tune: 190, tone: 1700, decay: 0.2, gain: 0.5, hit: 'retro-kit/snare', level: 0.89 }, { voice: 'hat', tone: 7000, decay: 0.04, gain: 0.18, hit: 'retro-kit/hat', level: 0.19 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.15, hit: 'retro-kit/open-hat', level: 0.094 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.25, hit: 'retro-kit/rim', level: 1.1 }, { voice: 'tom', tune: 95, decay: 0.35, gain: 0.5, hit: 'retro-kit/low-tom', level: 0.48, at: 95 }] },
  // trap: the 808 again, its kick booming long, a clap for the snare, and hats rolling (the trap beat)
  'trap-kit': { name: 'Trap kit', family: 'kit', own: true, kind: 'drums', suits: ['trap', 'halftime', 'groove', 'sparse', 'pulse', 'four', 'break'], slots: [
    { voice: 'kick', tune: 45, decay: 0.8, gain: 1, hit: 'tr808/kick', level: 1.1 }, { voice: 'clap', tone: 1400, decay: 0.2, gain: 0.48, hit: 'tr808/clap', level: 0.27 }, { voice: 'hat', tone: 9500, decay: 0.03, gain: 0.17, hit: 'tr808/hat', level: 0.023 },
    { voice: 'hat', tone: 9000, decay: 0.35, gain: 0.15, hit: 'tr808/open-hat', level: 0.017 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.2, hit: 'tr808/rim', level: 0.23 }, { voice: 'tom', tune: 80, decay: 0.4, gain: 0.45, hit: 'tr808/low-tom', level: 0.51, at: 80 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr808/crash', level: 0.29 }] },
  // egypt and the middle east: the darbuka's low doum (the kick) and sharp tek (the snare), its soft ka,
  // the riq's jingles, finger cymbals (zills) and a frame drum
  'darbuka-kit': { name: 'Darbuka and riq', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['maqsum', 'tribal', 'groove', 'halftime', 'pulse', 'sparse', 'tala', 'march'], slots: [
    { voice: 'tom', tune: 90, decay: 0.4, gain: 0.75, hit: 'world-percussion/darbuka-1', level: 0.45 }, { voice: 'rim', tune: 900, decay: 0.06, gain: 0.35, hit: 'world-percussion/darbuka-4', level: 1.5 }, { voice: 'slap', tone: 1500, decay: 0.04, gain: 0.2, hit: 'world-percussion/darbuka-2', level: 0.093 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'tick', tune: 3000, decay: 0.2, gain: 0.15, hit: 'world-percussion/finger-cymbals', level: 13 }, { voice: 'tom', tune: 75, decay: 0.6, gain: 0.5, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // the aztecs' drums: the huehuetl (a tall drum played with the hands, the kick), the teponaztli (a
  // slit log drum, two tongues of wood a fifth or so apart), rattles and a bone scraper
  'aztec-kit': { name: 'Aztec drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime', 'groove'], slots: [
    { voice: 'taiko', tune: 55, decay: 0.6, gain: 0.85, hit: 'world-percussion/bass-drum', level: 1.6 }, { voice: 'tick', tune: 600, decay: 0.15, gain: 0.35, hit: 'world-percussion/slit-high', level: 1.7 }, { voice: 'shaker', tone: 5000, decay: 0.08, gain: 0.18, hit: 'world-percussion/big-shaker', level: 0.56 },
    { voice: 'shaker', tone: 3500, decay: 0.15, gain: 0.18, hit: 'world-percussion/guiro', level: 6.2 }, { voice: 'tick', tune: 400, decay: 0.12, gain: 0.3, hit: 'world-percussion/slit-low', level: 1.8 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.55, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // a shaman's drum from the steppe: a big frame drum, struck in the middle and at the rim, with bells
  // on it, galloping like the horses
  'shaman-drum': { name: 'Shaman drum', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['gallop', 'tribal', 'march', 'pulse', 'sparse', 'halftime'], slots: [
    { voice: 'taiko', tune: 60, decay: 0.7, gain: 0.85, hit: 'world-percussion/frame-drum', level: 2 }, { voice: 'tom', tune: 120, decay: 0.3, gain: 0.45, hit: 'world-percussion/frame-high', level: 4.9 }, { voice: 'shaker', tone: 7000, decay: 0.1, gain: 0.14, hit: 'world-percussion/sleigh-bells', level: 1.4 },
    { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.4 }, { voice: 'rim', tune: 1100, decay: 0.05, gain: 0.25, hit: 'percussion/claves', level: 0.62 }, { voice: 'tom', tune: 70, decay: 0.6, gain: 0.55, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // the wasteland's junkyard: a bass drum, a brake drum hammered for the backbeat, an anvil, rattles and
  // a cymbal found in the scrap
  'junk-kit': { name: 'Junkyard', family: 'kit', own: true, kind: 'drums', suits: ['groove', 'halftime', 'march', 'tribal', 'sparse', 'pulse', 'rock', 'train'], slots: [
    { voice: 'kick', tune: 50, decay: 0.4, gain: 0.85, hit: 'world-percussion/bass-drum', level: 2.4 }, { voice: 'snare', tune: 220, tone: 2500, decay: 0.25, gain: 0.5, hit: 'world-percussion/brake-drum', level: 1.2 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.19 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.54 }, { voice: 'cowbell', tune: 800, decay: 0.2, gain: 0.15, hit: 'world-percussion/anvil', level: 0.63 }, { voice: 'tom', tune: 90, decay: 0.45, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.6, at: 90 },
    { voice: 'crash', tone: 5000, decay: 1.6, gain: 0.18, hit: 'orchestra-kit/cymbal', level: 0.39 }] },
  // a gamelan's drums: the kendang (a two headed hand drum) leading, little cymbals, and the big gong,
  // which closes every cycle of four bars (gong, the drum composer in music.js), as a gong ageng does
  'gamelan-kit': { name: 'Kendang and gong', family: 'kit', world: 'acoustic', own: true, kind: 'drums', gong: 4, suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime', 'maqsum'], slots: [
    { voice: 'tom', tune: 90, decay: 0.4, gain: 0.7, hit: 'world-percussion/darbuka-1', level: 0.42 }, { voice: 'conga', tune: 300, decay: 0.15, gain: 0.4, hit: 'world-percussion/darbuka-5', level: 5.7 }, { voice: 'tick', tune: 4000, decay: 0.05, gain: 0.12, hit: 'world-percussion/finger-cymbals', level: 7 },
    { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.6 }, { voice: 'rim', tune: 1000, decay: 0.05, gain: 0.25, hit: 'world-percussion/darbuka-2', level: 0.47 }, { voice: 'tom', tune: 120, decay: 0.3, gain: 0.45, hit: 'world-percussion/frame-high', level: 4.9 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },

  // textures. they're scenery: most are now things that happen now and then with quiet in between,
  // like the vinyl's crackle, because a steady wash (the old wind) was loud and rarely added anything.
  // each gain brings it to about the vinyl's loudness (measured with tests/levels.html)
  wind:     { name: 'Wind', family: 'texture', kind: 'texture', texture: 'wind', gain: 0.25, samples: 'wind', sampled: { gain: 0.15 }, every: [8, 18] },
  // rain and crickets sit lower than the rest: they're mostly high frequencies, which the ear hears
  // as louder and harsher than the same level of wind or ocean
  rain:     { name: 'Rain', family: 'texture', kind: 'texture', texture: 'rain', bed: true, gain: 0.12, samples: 'rain', sampled: { gain: 0.45 } },
  ocean:    { name: 'Ocean', family: 'texture', kind: 'texture', texture: 'ocean', bed: true, gain: 0.2, samples: 'ocean', sampled: { gain: 0.21 } },
  vinyl:    { name: 'Vinyl crackle', family: 'texture', kind: 'texture', texture: 'vinyl', bed: true, gain: 0.6 },
  fire:     { name: 'Campfire', family: 'texture', kind: 'texture', texture: 'fire', bed: true, gain: 0.3, samples: 'fire', sampled: { gain: 1.5 } },
  rumble:   { name: 'Rumble', family: 'texture', kind: 'texture', texture: 'rumble', gain: 0.4, samples: 'thunder', sampled: { gain: 0.66 }, every: [16, 40] },
  crickets: { name: 'Crickets', family: 'texture', kind: 'texture', texture: 'crickets', bed: true, gain: 0.2 },
  hum:      { name: 'Hum', family: 'texture', kind: 'texture', texture: 'hum', bed: true, gain: 0.15 },
  drips:    { name: 'Cave drips', family: 'texture', kind: 'texture', texture: 'drips', gain: 0.3, samples: 'drips', sampled: { gain: 0.9 }, every: [5, 12] },
  geiger:   { name: 'Geiger counter', family: 'texture', kind: 'texture', texture: 'geiger', gain: 0.7 },
  birds:    { name: 'Birdsong', family: 'texture', kind: 'texture', texture: 'birds', gain: 0.15, samples: 'birds', sampled: { gain: 0.44 }, every: [6, 16] },
  creaks:   { name: 'Creaking metal', family: 'texture', kind: 'texture', texture: 'creaks', gain: 1.2, samples: 'creaks', sampled: { gain: 0.15 }, every: [8, 20] },
  // more of a place for ambient songs: a brook babbling (steady, but only bubbles, no hiss), leaves
  // rustling now and then, frogs, a far off owl, and wind chimes somewhere out of sight
  stream:   { name: 'Brook', family: 'texture', kind: 'texture', texture: 'stream', bed: true, gain: 0.035, samples: 'stream', sampled: { gain: 0.148 } },
  leaves:   { name: 'Rustling leaves', family: 'texture', kind: 'texture', texture: 'leaves', gain: 0.6, samples: 'leaves', sampled: { gain: 0.22 }, every: [6, 16] },
  frogs:    { name: 'Frogs', family: 'texture', kind: 'texture', texture: 'frogs', gain: 0.8, samples: 'frogs', sampled: { gain: 2.8 }, every: [5, 16] },
  owl:      { name: 'Owl', family: 'texture', kind: 'texture', texture: 'owl', gain: 0.08, samples: 'owl', sampled: { gain: 0.126 }, every: [14, 32] },
  chimes:   { name: 'Distant chimes', family: 'texture', kind: 'texture', texture: 'chimes', gain: 0.09 },
  // an amp starting to feed back now and then, for the loud moods
  feedback: { name: 'Feedback', family: 'texture', kind: 'texture', texture: 'feedback', gain: 0.04 },
  // the third round's scenery, own like its kits (only where a mood names them). most have recordings:
  // events cut from one long recording (build-samples.js), played now and then (every, in seconds) from
  // their own spot, the way the synthesised ones are (recordedScenery). a pitched one (the singing bowl)
  // is moved to the song's home note
  bubbles:  { name: 'Bubbles', family: 'texture', kind: 'texture', own: true, texture: 'bubbles', gain: 0.18 },
  whale:    { name: 'Whale song', family: 'texture', kind: 'texture', own: true, texture: 'whale', gain: 0.062, samples: 'whale', sampled: { gain: 0.15 }, every: [14, 30] },
  'death-whistle': { name: 'Death whistle', family: 'texture', kind: 'texture', own: true, texture: 'deathWhistle', gain: 0.44, samples: 'death-whistle', sampled: { gain: 0.14 }, every: [14, 32] },
  conch:    { name: 'Conch calls', family: 'texture', kind: 'texture', own: true, texture: 'conch', gain: 0.13, samples: 'conch', sampled: { gain: 0.088 }, every: [16, 34] },
  rainstick: { name: 'Rainstick', family: 'texture', kind: 'texture', own: true, texture: 'rainstick', gain: 0.25, samples: 'rainstick', sampled: { gain: 0.58 }, every: [10, 24] },
  scratches: { name: 'Record scratches', family: 'texture', kind: 'texture', own: true, texture: 'scratches', gain: 0.63, samples: 'scratches', sampled: { gain: 0.34 }, every: [8, 20] },
  'singing-bowl': { name: 'Singing bowl', family: 'texture', kind: 'texture', own: true, texture: 'bowl', gain: 0.05, samples: 'singing-bowl', sampled: { gain: 0.13 }, every: [16, 34] },
  // the fourth round's scenery, own too: silent hill's fog (a radio crackling with static, a siren far
  // off, metal clanging, chains, footsteps of someone you can't see, crows), minecraft's nether (lava
  // bubbling under the embers) and a city of machines (a factory humming, steam let out of a pipe).
  // all recorded, with a synthesised version for when the recordings can't load
  lava:     { name: 'Lava', family: 'texture', kind: 'texture', own: true, texture: 'lava', bed: true, gain: 0.148, samples: 'lava', sampled: { gain: 0.83 } },
  factory:  { name: 'Factory', family: 'texture', kind: 'texture', own: true, texture: 'factory', bed: true, gain: 0.098, samples: 'factory', sampled: { gain: 0.126 } },
  static:   { name: 'Radio static', family: 'texture', kind: 'texture', own: true, texture: 'static', gain: 0.2, samples: 'static', sampled: { gain: 0.34 }, every: [6, 18] },
  siren:    { name: 'Distant siren', family: 'texture', kind: 'texture', own: true, texture: 'siren', gain: 0.057, samples: 'siren', sampled: { gain: 0.133 }, every: [25, 50] },
  clanks:   { name: 'Clanging metal', family: 'texture', kind: 'texture', own: true, texture: 'clanks', gain: 0.067, samples: 'clanks', sampled: { gain: 0.376 }, every: [6, 16] },
  chains:   { name: 'Chains', family: 'texture', kind: 'texture', own: true, texture: 'chains', gain: 0.166, samples: 'chains', sampled: { gain: 0.6 }, every: [10, 24] },
  crows:    { name: 'Crows', family: 'texture', kind: 'texture', own: true, texture: 'crows', gain: 0.65, samples: 'crows', sampled: { gain: 0.39 }, every: [12, 28] },
  footsteps: { name: 'Footsteps', family: 'texture', kind: 'texture', own: true, texture: 'footsteps', gain: 0.6, samples: 'footsteps', sampled: { gain: 1.95 }, every: [14, 30] },
  steam:    { name: 'Steam', family: 'texture', kind: 'texture', own: true, texture: 'steam', gain: 0.079, samples: 'steam', sampled: { gain: 0.176 }, every: [10, 24] },
};
// how the instrument lists are grouped on the page
const FAMILIES = { pad: 'Pads', keys: 'Keys and mallets', guitar: 'Guitars', bell: 'Bells', lead: 'Leads', bass: 'Basses', drone: 'Drones', kit: 'Drum kits', texture: 'Textures' };

// ---------- shared sounds ----------

// noise, crackle and plucked strings are worked out once per sample rate and kept. AudioBuffers
// aren't tied to a context, so the live player and wav renders share them. periodic waves are tied to
// their context, so they're kept per context
const audioCaches = new Map();
const cacheFor = (rate) => {
  if (!audioCaches.has(rate)) audioCaches.set(rate, { strings: new Map() });
  return audioCaches.get(rate);
};
const waveCaches = new WeakMap();

function setWave(ctx, osc, wave) {
  if (!WAVES[wave]) {
    osc.type = wave;
    return;
  }
  if (!waveCaches.has(ctx)) waveCaches.set(ctx, {});
  const waves = waveCaches.get(ctx);
  if (!waves[wave]) {
    const sines = new Float32Array([0, ...WAVES[wave]]);
    waves[wave] = ctx.createPeriodicWave(new Float32Array(sines.length), sines);
  }
  osc.setPeriodicWave(waves[wave]);
}

function noiseBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.noise) {
    cache.noise = new AudioBuffer({ length: rate * 3, sampleRate: rate });
    const data = cache.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return cache.noise;
}

// sparse clicks and pops, for vinyl, fire and rain
function crackleBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.crackle) {
    cache.crackle = new AudioBuffer({ length: rate * 4, sampleRate: rate });
    const data = cache.crackle.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      if (Math.random() > 0.00045) continue;
      const size = Math.random() ** 2 * (Math.random() < 0.5 ? -0.9 : 0.9);
      for (let k = 0; k < 40 && i + k < data.length; k++) data[i + k] += size * Math.exp(-k / 5) * (k % 2 ? -0.6 : 1);
    }
  }
  return cache.crackle;
}

// a plucked string by the karplus-strong method (1983): a burst of noise goes round a loop one wave
// of the note long, softened a little each time round, which is very nearly what a real string
// does. web audio can't loop that tightly, so this is worked out sample by sample, once per note, and kept.
// soft mixes the noise with the smooth triangle a string takes when a finger pulls it aside: that has
// hardly any high overtones, so the note starts round instead of with a hard metallic zing. the harp
// was all noise at first, and it hit too hard and rang like wire
//
// three more things a string can do, from the instrument:
//   ring   how much the string's top end is softened each time round, 0.5 (a lot: the classic sound,
//          nylon and gut) down to about 0.3 (a little: a steel string on an electric guitar, which
//          stays bright and rings for ages)
//   buzz   the sitar's bridge: the string brushes a curved bridge whenever it swings past the buzz
//          level, which flattens the top of its wave. that makes the bright, evolving buzz, and it
//          fades as the note dies because a quieter string stops reaching the bridge
//   the end of the buffer fades out, so a note held longer than the string rings can't click off
//   (through a high gain amp even a string 60 db down is loud, and its end was a click)
// the loop can only be a whole number of samples long, which put high notes up to 13 cents out of
// tune (an e5 at 44.1 khz). buffer.cents is how far off it is, and the pluck engine tunes it back
function ksBuffer(rate, midi, bright, decay, soft, ring = 0.5, buzz = 0, amped = false) {
  const cache = cacheFor(rate).strings;
  const key = `${midi}|${bright.toFixed(2)}|${decay.toFixed(1)}|${soft}|${ring}|${buzz}`;
  if (cache.has(key)) return cache.get(key);
  const f = mtof(midi);
  // the loop filter (weights 1 - ring and ring) adds ring samples of delay to the loop
  const period = Math.max(2, Math.round(rate / f - ring));
  const length = Math.floor(rate * Math.min(amped ? 8 : 5, decay + 0.4));
  const buffer = new AudioBuffer({ length, sampleRate: rate });
  buffer.cents = 1200 * Math.log2((f * (period + ring)) / rate);
  const data = buffer.getChannelData(0);
  const string = new Float32Array(period);
  let last = 0;
  for (let i = 0; i < period; i++) {
    last += (Math.random() * 2 - 1 - last) * bright;
    // pulled aside a third of the way along, and centred on zero
    const x = i / period;
    const pulled = (x < 0.3 ? x / 0.3 : (1 - x) / 0.7) - 0.5;
    string[i] = last * (1 - soft) + pulled * soft;
  }
  // what's kept each time round, so it's 60 dB quieter after decay seconds
  const keep = 0.001 ** (1 / (f * decay));
  const fade = Math.floor(rate * 0.3);
  for (let i = 0, at = 0; i < length; i++) {
    const next = (at + 1) % period;
    data[i] = string[at] * Math.min(1, (length - i) / fade);
    let value = (string[at] * (1 - ring) + string[next] * ring) * keep;
    if (buzz && value > buzz) value = buzz + (value - buzz) * 0.25;
    string[at] = value;
    at = next;
  }
  // a few hundred strings (each up to 8 seconds of samples) is plenty to keep
  if (cache.size > 300) cache.clear();
  cache.set(key, buffer);
  return buffer;
}

// ---------- struck things: modes ----------
//
// a struck bar, tine, bell or piano string rings at a handful of pitches at once (its modes), each
// dying away at its own rate. a marimba bar's are two octaves and about three octaves and a third up,
// a bell's include a minor third, a piano string's are nearly whole multiples but a little sharp
// (stretch). I used fm for these at first, which gets the brightness of the strike right but not the
// way the top dies first and leaves the low note singing, which is the sound of a real one. so each is
// worked out sample by sample once per note, like the plucked strings, and kept. an instrument says:
//   modes    [ratio to the note, level, seconds to fade 60 db, hard], where hard is how much harder
//            playing brings that mode out (a rhodes' bark, a piano's brightness when hit hard)
//   strike   [level, hz, seconds]: the mallet or hammer hitting, a short burst of darkened noise
//   unison   cents apart of a second string a note (a piano's strings, a santoor's courses), which
//            beat slowly against each other: the shimmer of a real piano
//   stretch  how much sharper each overtone is than a whole multiple, for stiff strings
//   track    how much faster high notes die than low ones, the way a short bar or string rings less
// level (0 to 3) is how hard it's hit, from the note's strength, so loud notes are brighter rather
// than just louder. each mode is a damped sine made by a two multiply recurrence, cheap enough that a
// whole chord of new notes takes a few milliseconds
function modalBuffer(rate, midi, inst, level) {
  const cache = cacheFor(rate);
  if (!cache.modal) cache.modal = new WeakMap();
  if (!cache.modal.has(inst)) cache.modal.set(inst, new Map());
  const kept = cache.modal.get(inst);
  const key = `${midi}|${level}`;
  if (kept.has(key)) return kept.get(key);
  const f = mtof(midi);
  const slower = (262 / f) ** (inst.track ?? 0.5);
  const longest = Math.max(...inst.modes.map(([, , decay]) => decay)) * Math.min(2, slower);
  const length = Math.floor(rate * Math.min(7, longest + 0.2));
  const buffer = new AudioBuffer({ length, sampleRate: rate });
  const data = buffer.getChannelData(0);
  // every mode's level adds up to 1 at the start, so instruments with more modes aren't louder
  const total = inst.modes.reduce((sum, [, amount]) => sum + amount, 0) * (inst.unison ? 2 : 1);
  const ring = (hz, amount, decay) => {
    if (hz > rate * 0.45 || amount <= 0) return;
    const w = (2 * Math.PI * hz) / rate;
    const r = 0.001 ** (1 / (decay * rate));
    const a = 2 * r * Math.cos(w);
    const b = r * r;
    const end = Math.min(length, Math.floor(rate * decay * 1.2));
    let y1 = (amount / total) * r * Math.sin(w);
    let y2 = 0;
    data[1] += y1;
    for (let i = 2; i < end; i++) {
      const y = a * y1 - b * y2;
      data[i] += y;
      y2 = y1;
      y1 = y;
    }
  };
  const hardness = level / 2;
  for (const [ratio, amount, decay, hard = 0] of inst.modes) {
    const hz = f * ratio * Math.sqrt(1 + (inst.stretch || 0) * ratio * ratio);
    // higher modes of high notes die faster still
    const fades = decay * Math.min(2, slower) * (ratio > 1.5 ? Math.min(1, (2000 / hz) ** 0.3) : 1);
    const loud = amount * hardness ** hard;
    ring(hz, loud, fades);
    if (inst.unison && ratio < 6) ring(hz * 2 ** (inst.unison / 1200), loud, fades * 0.9);
  }
  if (inst.strike) {
    const [amount, hz, seconds] = inst.strike;
    const smooth = Math.min(1, (2 * Math.PI * hz) / rate);
    let low = 0;
    for (let i = 0; i < Math.min(length, rate * seconds * 3); i++) {
      low += (Math.random() * 2 - 1 - low) * smooth;
      data[i] += low * amount * (0.5 + hardness * 0.5) * Math.exp(-i / (rate * seconds));
    }
  }
  // the very end fades, so nothing clicks off if it's still ringing
  const fade = Math.floor(rate * 0.2);
  for (let i = Math.max(0, length - fade); i < length; i++) data[i] *= (length - i) / fade;
  if (kept.size > 200) kept.clear();
  kept.set(key, buffer);
  return buffer;
}

// a slow, smooth wander between -1 and 1, eight seconds of it, for the drift of a held note (a
// breath, a bow, a voice is never perfectly steady). random points a quarter of a second apart,
// joined by smooth curves. each note plays it from somewhere different, at a slightly different speed
function driftBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.drift) {
    const seconds = 8;
    cache.drift = new AudioBuffer({ length: rate * seconds, sampleRate: rate });
    const data = cache.drift.getChannelData(0);
    const points = Array.from({ length: seconds * 4 + 1 }, () => Math.random() * 2 - 1);
    points[points.length - 1] = points[0];
    for (let i = 0; i < data.length; i++) {
      const at = (i / rate) * 4;
      const k = Math.floor(at);
      const x = at - k;
      const s = x * x * (3 - 2 * x);
      data[i] = points[k] + (points[Math.min(k + 1, points.length - 1)] - points[k]) * s;
    }
  }
  return cache.drift;
}

function noiseSource(ctx, when, end) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx.sampleRate);
  source.loop = true;
  source.start(when, Math.random() * 2.5);
  source.stop(end);
  return source;
}

// a slow wave added to a setting (a filter's frequency, a gain), for wobbles and swells
function lfo(ctx, rate, depth, param, when, end, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start(when);
  osc.stop(end);
  amount.osc = osc;
  return amount;
}

// ---------- tonal instruments ----------

// the part every tonal note shares: the volume envelope, then tremolo and the filter in front of it.
// returns where the engine plugs its sound in, and when everything can stop. again: seconds until the
// same note's struck again on the layer (restrikes)
function voiceChain(ctx, out, inst, tone, f, when, dur, vel, note = {}, again = Infinity) {
  const { pump, slur, swell } = note;
  const [attackTime, decay, sustain, releaseTime] = inst.env;
  // never more than half the note, or a short chord would only reach full volume after the beat's gone.
  // a slurred note (note.slur: a wind or bow player going from one note to the next without stopping
  // the breath or the bow) arrives at once, the way only a phrase's first note is tongued or bowed
  let attack = Math.max(0.002, Math.min(attackTime * tone.attack, dur * 0.5, slur ? 0.015 : Infinity));
  let release = Math.max(0.03, releaseTime * tone.release);
  // a reversed note swells over all of itself, and a pumped one (a club pad ducking under every kick,
  // pad.pump in music.js) over half. both let go at once, so the next starts clean
  if (inst.reverse || pump) {
    attack = dur * (inst.reverse ? 1 : 0.55);
    release = 0.05;
  }
  const peak = inst.gain * vel;
  const amp = ctx.createGain();
  if (inst.reverse) {
    // a fading note played backwards: hardly there at first, then rushing up at the end
    amp.gain.setValueAtTime(peak * 0.001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + attack);
  } else {
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + attack);
  }
  if (sustain < 1 && !pump) amp.gain.setTargetAtTime(peak * sustain, when + attack, Math.max(0.001, decay / 3));
  // a note shorter than its attack is held until the attack's done, so it can't click off mid ramp
  const off = when + Math.max(dur, attack);
  let end = off + release * 1.4 + 0.05;
  // struck again before it's rung away: a string or key played again stops its last ring, so it fades
  // out there while the new note fades in (over about the same attack, so a pad's held note doesn't
  // dip between chords). a pad's fast chord pattern (pulse) used to leave every strike ringing out its
  // whole release, dozens of copies of each note at once, until the browser couldn't keep up and the
  // song crackled, slowed and stopped. struck again before it's let go, the release never comes
  const cut = when + Math.max(attack, again);
  const fade = Math.max(0.01, attack / 3);
  const restruck = cut + fade * 6 < end;
  if (!restruck || off < cut) amp.gain.setTargetAtTime(0, off, release / 4);
  if (restruck) {
    amp.gain.setTargetAtTime(0, cut, fade);
    end = cut + fade * 6;
  }
  // swell: a held note that grows (a bowed or blown crescendo, 1) or dies away (a diminuendo, -1) over
  // its length, the way a player shapes a long note instead of holding it flat like a keyboard
  if (swell) {
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(swell > 0 ? 0.3 : 1, when);
    shape.gain.exponentialRampToValueAtTime(swell > 0 ? 1 : 0.22, when + Math.max(0.05, dur * 0.9));
    amp.connect(shape).connect(out);
  } else amp.connect(out);
  let input = amp;
  if (inst.tremolo) {
    const tremolo = ctx.createGain();
    tremolo.gain.value = 1 - inst.tremolo.depth / 2;
    lfo(ctx, inst.tremolo.rate, inst.tremolo.depth / 2, tremolo.gain, when, end);
    tremolo.connect(input);
    input = tremolo;
  }
  if (inst.filter) {
    const { freq, q = 0.7, env = 1, attack: opens = 0.01, decay: closes = 0.3, track = 0, lfo: sweep } = inst.filter;
    const filter = ctx.createBiquadFilter();
    filter.Q.value = q;
    const base = Math.min(16000, freq * tone.bright * (f / 262) ** track * (inst.kind === 'sample' ? recordedHardness(vel) : hardness(vel)));
    filter.frequency.setValueAtTime(base, when);
    if (sweep) lfo(ctx, sweep[0], base * sweep[1], filter.frequency, when, end);
    // backwards, it opens up as the note swells instead of closing as it fades
    if (inst.reverse) filter.frequency.exponentialRampToValueAtTime(Math.min(18000, base * env), when + attack);
    else if (env !== 1) {
      filter.frequency.linearRampToValueAtTime(Math.min(18000, base * env), when + opens);
      filter.frequency.setTargetAtTime(base, when + opens, closes);
    }
    filter.connect(input);
    input = filter;
  }
  return { input, when, end, vel, dur, slur: !!slur };
}

// how much brighter a note is for being played harder, about 1 at a middling 0.75. every real
// instrument does this (a piano struck hard rings brighter, not just louder), and every note sounding
// the same colour whatever its strength was a lot of what made the band sound like midi
const hardness = (vel) => 0.6 + 0.55 * vel;
// the same for a recording, but steeper, the way a sampler's velocity opens its filter: most folders
// have one loudness of each note, so a soft note was the loud recording turned down, as bright as a
// hard one, and that's the sampled keyboard sound. 1 at a middling 0.75 (as recorded), a soft 0.4
// closes it to under half (about 5 khz), and a hard note opens it a little past the recording
const recordedHardness = (vel) => Math.min(1.4, Math.max(0.25, (vel / 0.75) ** 1.3));

function vibrato(ctx, inst, tone, when, end) {
  const depth = (inst.vibrato?.depth || 0) + tone.vibrato;
  if (depth <= 0) return null;
  return shaking(ctx, depth, inst.vibrato?.rate || 5, inst.vibrato?.delay ?? 0.3, when, end);
}
// a vibrato: depth cents either way, rate times a second, starting after delay seconds. every note's
// runs at a slightly different speed, like real players. a player's vibrato doesn't switch on: the note
// starts straight, then the vibrato grows over a few tenths of a second and speeds up a little as it
// settles (a violinist's or a singer's). it used to ramp up from the very start of the note, so even
// short notes wobbled. a vibrato with no delay is an effect (a tape's warble), so it's there at once
function shaking(ctx, depth, rate, delay, when, end) {
  const amount = ctx.createGain();
  const grow = delay > 0 ? 0.4 : 0.01;
  const speed = rate * (0.92 + Math.random() * 0.16);
  amount.gain.setValueAtTime(0, when + delay);
  amount.gain.linearRampToValueAtTime(depth, when + delay + grow);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(delay > 0 ? speed * 0.8 : speed, when + delay);
  osc.frequency.linearRampToValueAtTime(speed, when + delay + grow * 1.5);
  osc.connect(amount);
  osc.start(when);
  osc.stop(end);
  return amount;
}

// drift: the slow wander of a held note, cents either way (driftBuffer). its own spot in the wander
// for every call, so two notes (or two players in a section) never wander together
function drifting(ctx, cents, when, end) {
  const source = ctx.createBufferSource();
  source.buffer = driftBuffer(ctx.sampleRate);
  source.loop = true;
  source.playbackRate.value = 0.7 + Math.random() * 0.6;
  const amount = ctx.createGain();
  amount.gain.value = cents;
  source.connect(amount);
  source.start(when, Math.random() * 8);
  source.stop(end);
  return amount;
}

// an ensemble's drift (a section of players, a choir): one wander a note, shared out to each player
// turned a different way and by a different amount, so they drift apart from each other. returns a
// function giving player i's share, or null for an instrument that isn't an ensemble. I first gave
// every player a wander of its own, which sounded no different and made a string chord half as
// expensive again to play (four oscillators, four wanders, a note)
function ensembleDrift(ctx, inst, voice) {
  if (!inst.ensemble || !inst.drift) return null;
  const wander = drifting(ctx, inst.drift, voice.when, voice.end);
  return (i) => {
    const share = ctx.createGain();
    share.gain.value = (i % 2 ? 1 : -1) * (1 - 0.25 * (i >> 1));
    wander.connect(share);
    return share;
  };
}

// everything that moves a note's pitch while it plays, as nodes to plug into each oscillator's detune
// (in cents): the instrument's vibrato, its drift, and the note's own slide or bend and shake.
//   note.bend   pins, [beats from the note's start, semitones from its pitch], with the pitch going
//               in straight lines between them (the way beepbox draws a note's bend). [[0, 0], [0.5,
//               2]] slides up a whole tone over half a beat and stays there; [[0, -2], [0.1, 0]] is a
//               guitarist bending up onto the note. the composer writes them (ornament() in
//               music.js) and so does the note editor's slide tool
//               a pin can have a third number, the shape of the move from the pin before it (CURVES):
//               0 straight, 1 smooth (eased in and out: a singer's slide), 2 settling (quick, then
//               easing onto the note: a fretless or a trombone's portamento), 3 speeding up (slow, then
//               quick: a fall off the end of a note, a doit, a dive). real slides are almost never
//               straight lines: a player's finger or lips move fast in the middle and slow down onto
//               the pitch, which is what the ear hears as smooth
//   note.shake  a vibrato of its own, cents either way: a guitarist shaking a held note, a singer's
//               held last note
// spb is seconds per beat, so the pins land in time whatever the tempo
const CURVES = [(x) => x, (x) => x * x * (3 - 2 * x), (x) => 1 - (1 - x) ** 3, (x) => x ** 3];
function pitchMods(ctx, inst, tone, note, when, end, spb) {
  const mods = [];
  const wobble = vibrato(ctx, inst, tone, when, end);
  if (wobble) mods.push(wobble);
  if (note.shake) mods.push(shaking(ctx, note.shake, 5.6, Math.min(0.25, (note.dur || 1) * spb * 0.3), when, end));
  // an ensemble drifts player by player instead (the sub and choir engines)
  if (inst.drift && !inst.ensemble) mods.push(drifting(ctx, inst.drift, when, end));
  if (note.bend?.length) {
    const bend = ctx.createConstantSource();
    bend.offset.setValueAtTime(note.bend[0][1] * 100, when);
    note.bend.forEach(([at, semitones, curve = 0], i) => {
      const [from, was] = note.bend[i - 1] || note.bend[0];
      // a curve is drawn as eight short straight lines, which web audio's ramps can do
      const pieces = curve && CURVES[curve] && at > from ? 8 : 1;
      for (let k = 1; k <= pieces; k++) {
        const x = k / pieces;
        const y = pieces > 1 ? CURVES[curve](x) : 1;
        bend.offset.linearRampToValueAtTime((was + (semitones - was) * y) * 100, when + Math.max(0, from + (at - from) * x) * spb);
      }
    });
    bend.start(when);
    bend.stop(end);
    mods.push(bend);
  }
  return mods;
}
const bendWith = (mods, param) => { for (const mod of mods) mod.connect(param); };

// a little random tuning per note, more with the layer's detune: real instruments are never exact
const scatter = (tone) => (Math.random() * 2 - 1) * (1.5 + tone.detune * 0.35);

// fuzz (soft clipping, tanh) and crush (rounding to a few steps of loudness) bend a note's wave
// through a curve. curves aren't tied to a context, so they're made once and kept
const curves = new Map();
function shapeCurve(kind, amount) {
  const key = `${kind}|${amount}`;
  if (!curves.has(key)) {
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = kind === 'fuzz' ? Math.tanh(amount * x) / Math.tanh(amount) : Math.round(x * amount) / amount;
    }
    curves.set(key, curve);
  }
  return curves.get(key);
}

// each engine makes one note's sound into voice.input (voiceChain), and bends every oscillator it
// makes with voice.pitch (pitchMods: vibrato, drift, slides, shakes), so any instrument can slide
const ENGINES = {
  sub(ctx, voice, inst, tone, f) {
    const off = scatter(tone);
    // fuzz and crush get the oscillators mixed down to the curve's range first, so every instrument
    // hits it equally hard however many oscillators it stacks
    let into = voice.input;
    if (inst.fuzz || inst.crush) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shapeCurve(inst.fuzz ? 'fuzz' : 'crush', inst.fuzz || inst.crush);
      shaper.connect(voice.input);
      into = ctx.createGain();
      into.gain.value = 1 / inst.osc.reduce((sum, [, , , level = 1]) => sum + level, 0);
      into.connect(shaper);
    }
    // pads and drones spread their oscillators across the stereo field, like a string section or a
    // chorus pedal: one mono point in the middle sounded like a keyboard, not a room full of players
    const wide = (inst.family === 'pad' || inst.family === 'drone') && inst.osc.length > 1;
    const spread = ensembleDrift(ctx, inst, voice);
    inst.osc.forEach(([wave, detune = 0, octave = 0, level = 1], i) => {
      const osc = ctx.createOscillator();
      setWave(ctx, osc, wave);
      osc.frequency.value = f * 2 ** octave;
      // the layer's detune spreads the oscillators apart, for a wider, more chorused sound
      const cents = detune + off + (i ? (i % 2 ? 1 : -1) * tone.detune : 0);
      // scoop: a blown or bowed note starts a little flat and slides up onto the note, as players do.
      // not quick notes, where it would only sound out of tune, and not a slurred one: the player's
      // already on the breath (or the bow), so it moves straight to the next note
      const scoop = voice.dur > 0.2 && !voice.slur ? inst.scoop || 0 : 0;
      osc.detune.setValueAtTime(cents - scoop, voice.when);
      if (scoop) osc.detune.linearRampToValueAtTime(cents, voice.when + 0.07);
      bendWith(voice.pitch, osc.detune);
      // an ensemble (a string section, a choir, a horn section) is several players, each drifting on
      // their own, which is the shimmer a section has and one oscillator doesn't (ensembleDrift)
      if (spread) spread(i).connect(osc.detune);
      const gain = ctx.createGain();
      gain.gain.value = level;
      let out = gain;
      if (wide && i) {
        out = ctx.createStereoPanner();
        out.pan.value = i % 2 ? -0.6 : 0.6;
        gain.connect(out);
      }
      osc.connect(gain);
      out.connect(into);
      osc.start(voice.when);
      osc.stop(voice.end);
    });
    if (inst.breath) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(12000, f * 2);
      band.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = inst.breath;
      noiseSource(ctx, voice.when, voice.end).connect(band).connect(gain).connect(voice.input);
    }
    // chiff: the puff of air as a flute or whistle note starts (or an organ key's click), a burst of
    // noise a little above the note that's gone in a few hundredths of a second. without it a flute's
    // notes faded in like a pad's
    if (inst.chiff && !voice.slur) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(12000, f * 3);
      band.Q.value = 1.5;
      const puff = hitEnvelope(ctx, voice.when, inst.chiff * hardness(voice.vel), 0.004, 0.05);
      noiseSource(ctx, voice.when, voice.when + 0.15).connect(band).connect(puff).connect(voice.input);
    }
  },

  fm(ctx, voice, inst, tone, f) {
    const { when, end } = voice;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = f;
    carrier.detune.value = scatter(tone);
    const modulator = ctx.createOscillator();
    // the browser can't go above half its sample rate, and nobody could hear it anyway
    modulator.frequency.value = Math.min(20000, f * inst.ratio);
    const depth = ctx.createGain();
    const index = inst.index * f * Math.min(4, tone.bright) * hardness(voice.vel);
    depth.gain.setValueAtTime(index, when);
    depth.gain.setTargetAtTime(index * (inst.sustainIndex ?? 0.1), when, inst.indexDecay ?? 0.3);
    modulator.connect(depth).connect(carrier.frequency);
    // the modulator bends with the carrier, so a slide keeps the same tone all the way
    bendWith(voice.pitch, carrier.detune);
    bendWith(voice.pitch, modulator.detune);
    carrier.connect(voice.input);
    for (const osc of [carrier, modulator]) {
      osc.start(when);
      osc.stop(end);
    }
    for (const [ratio, level, fade] of inst.partials || []) {
      if (f * ratio > 18000) continue;
      const partial = ctx.createOscillator();
      partial.frequency.value = f * ratio;
      bendWith(voice.pitch, partial.detune);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, when);
      gain.gain.setTargetAtTime(0, when, fade);
      partial.connect(gain).connect(voice.input);
      partial.start(when);
      partial.stop(end);
    }
  },

  pluck(ctx, voice, inst, tone, f, midi, note = {}) {
    const { when, end } = voice;
    const source = ctx.createBufferSource();
    // a palm mute (a metal chug): the picking hand resting on the strings by the bridge, so the string
    // dies in a moment and loses its top. through a high gain amp that's the "chug"
    const muted = !!note.mute;
    // high strings ring for less time than low ones, as on a real harp. every note ringing just as long
    // left the top notes hanging on, thin and glassy. a string through a sustaining rig (amp.sustain)
    // hardly loses any: a distorted guitar's top string rings as long as its bottom one
    const tilt = inst.amp?.sustain ? 0.2 : 0.5;
    const decay = muted ? 0.2 : inst.decay * Math.min(2, tone.release) * Math.min(1, (330 / f) ** tilt);
    // brightness rounded to tenths, so the strings kept per note stay few (ksBuffer's cache)
    const bright = Math.round(Math.min(0.95, inst.bright * tone.bright * hardness(voice.vel) * (muted ? 0.6 : 1)) * 10) / 10;
    source.buffer = ksBuffer(ctx.sampleRate, midi, Math.max(0.1, bright), decay, inst.soft || 0, inst.ring ?? 0.5, inst.buzz || 0, !!inst.amp);
    let into = voice.input;
    if (muted) {
      into = ctx.createBiquadFilter();
      into.frequency.value = 900;
      into.Q.value = 0.5;
      into.connect(voice.input);
    }
    source.connect(into);
    const strings = [source];
    // sustain: a steady tone under the string, swelling in as the pluck dies, for guitars held longer
    // than a string rings (an ebow, or an amp feeding back into the strings). a shoegaze chord or a
    // lead's long note had died away before the bar was out
    if (inst.sustain && !muted) {
      const held = ctx.createOscillator();
      held.type = 'sawtooth';
      held.frequency.value = f;
      const level = ctx.createGain();
      level.gain.setValueAtTime(0, when);
      level.gain.linearRampToValueAtTime(inst.sustain * 0.25, when + Math.min(0.4, voice.dur));
      held.connect(level).connect(into);
      strings.push(held);
    }
    // the string is tuned back to true (buffer.cents, see ksBuffer), plus a little random tuning.
    // twang: a plucked string is stretched by the pluck, so it starts a few cents sharp and settles
    // within a tenth of a second, strongest on a banjo or a shamisen. the old lead guitar bends (a coin
    // toss here) are now the composer's (note.bend, pitchMods)
    const off = scatter(tone) - (source.buffer.cents || 0);
    const twang = muted ? 0 : (inst.twang || 0) * hardness(voice.vel);
    for (const string of strings) {
      const tuned = string === source ? off : off + (source.buffer.cents || 0);
      string.detune.setValueAtTime(tuned + twang, when);
      if (twang) string.detune.setTargetAtTime(tuned, when, 0.03);
      bendWith(voice.pitch, string.detune);
      string.start(when);
      string.stop(end);
    }
  },

  // struck things (modalBuffer): one buffer per note, worked out from its modes, how hard it's hit
  // picking from four levels of brightness
  modal(ctx, voice, inst, tone, f, midi) {
    const source = ctx.createBufferSource();
    const level = Math.max(0, Math.min(3, Math.round(voice.vel * hardness(voice.vel) * 3 * Math.min(1.4, tone.bright))));
    source.buffer = modalBuffer(ctx.sampleRate, midi, inst, level);
    source.detune.value = scatter(tone) * 0.5;
    bendWith(voice.pitch, source.detune);
    source.connect(voice.input);
    source.start(voice.when);
    source.stop(voice.end);
  },

  choir(ctx, voice, inst, tone, f) {
    const mix = ctx.createGain();
    // rasp: the buzz clipped before the vowel shapes it, so the voice cracks like it's shouting
    let into = mix;
    if (inst.rasp) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shapeCurve('fuzz', inst.rasp);
      into = ctx.createGain();
      into.connect(shaper).connect(mix);
    }
    for (const [freq, level] of VOWELS[inst.vowel]) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq * Math.min(1.3, tone.bright ** 0.2);
      band.Q.value = freq / 110;
      const gain = ctx.createGain();
      gain.gain.value = level;
      mix.connect(band).connect(gain).connect(voice.input);
    }
    // breath: air through the same vowel, for a voice sung close and soft
    if (inst.breath) {
      const air = ctx.createGain();
      air.gain.value = inst.breath;
      noiseSource(ctx, voice.when, voice.end).connect(air).connect(mix);
    }
    // three singers (unless it says), never quite together, each drifting on their own in a choir
    const spread = ensembleDrift(ctx, inst, voice);
    for (const [i, detune] of (inst.singers || [-9, 0, 8]).entries()) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune * (1 + tone.detune / 15) + scatter(tone);
      bendWith(voice.pitch, osc.detune);
      if (spread) spread(i).connect(osc.detune);
      osc.connect(into);
      osc.start(voice.when);
      osc.stop(voice.end);
    }
  },
};

// ---------- recordings ----------
//
// some instruments are recordings of real ones, where synthesis struggles most (bowed strings, brass,
// saxes, pianos, choirs, drum kits). a recording is the same as a plucked string here: a buffer of
// one note, played through voiceChain, so slides, vibrato, the room and the rigs all still work.
//   samples   a folder in assets/squimble-music-maker/samples/ (RECORDINGS.root), holding a few notes
//             of the instrument and an index.json saying which (tools/build-samples.js makes them).
//             the nearest note is played, retuned
//   sampled   settings for the recorded version: gain (set so it's as loud as the synthesised one),
//             name (what the page calls this recording), env or filter if the instrument's own don't
//             suit it, and reach (how far past its lowest and highest notes it still plays, 7
//             semitones unless it says)
//   more      other recordings of the same instrument to choose between, { folder: settings }: a
//             wurlitzer and a pianet, karoryfer's black guitar and their shiny one. a layer's
//             recording says which it plays (layer.recording in music.js), the first unless it says
// a kit's slot can have hit: 'folder/name' (and level, and at: the tune the recording sounds at, for
// a drum the composer retunes to the song's key).
// the synthesised version is still there and plays until the files have loaded, if they can't load
// (a page opened straight from a file can't fetch them), for a note far outside what was recorded,
// and with RECORDINGS.on false. so a song never waits or goes silent
const RECORDINGS = { on: true, root: 'assets/squimble-music-maker/samples/', sets: new Map() };

// starts loading a folder (once) and returns a promise of it. a set is { notes, hits, low, high, loop }
function loadSamples(folder) {
  if (!RECORDINGS.sets.has(folder)) {
    const set = { ready: null };
    const get = async (file) => {
      const response = await fetch(`${RECORDINGS.root}${folder}/${file}`);
      if (!response.ok) throw new Error(`${response.status} loading ${folder}/${file}`);
      return response;
    };
    set.loading = (async () => {
      const index = await (await get('index.json')).json();
      // decoded once, at 44.1 khz: AudioBuffers aren't tied to a context, so the live player and wav
      // renders share them
      const decoder = new OfflineAudioContext(1, 1, 44100);
      const notes = await Promise.all(index.notes.map(async (note) => {
        const buffer = await decoder.decodeAudioData(await (await get(note.file)).arrayBuffer());
        return { ...note, buffer, loop: index.loop ? loopNote(buffer) : null };
      }));
      const hits = {};
      for (const note of notes) if (note.hit) (hits[note.hit] ||= []).push(note);
      const midis = notes.filter((note) => note.midi !== undefined).map((note) => note.midi);
      set.ready = { notes, hits, loop: !!index.loop, low: Math.min(...midis), high: Math.max(...midis) };
    })().catch((error) => {
      set.failed = true;
      console.warn(`recordings: ${folder} didn't load, so it stays synthesised (${error.message})`);
    });
    RECORDINGS.sets.set(folder, set);
  }
  return RECORDINGS.sets.get(folder).loading;
}

// an instrument's recordings, [[folder, settings], ...], the one it plays unless told otherwise first
const recordingsOf = (inst) => (inst?.samples ? [[inst.samples, inst.sampled || {}], ...Object.entries(inst.more || {})] : []);
// the folder a layer plays: the one it chose, if the instrument has it
const recordingFolder = (inst, choice) => (recordingsOf(inst).find(([folder]) => folder === choice) || recordingsOf(inst)[0] || [])[0];
// the folders an instrument (and its kit's slots) needs, for the recording chosen
const sampleFolders = (inst, choice) => [recordingFolder(inst, choice), ...(inst?.slots || []).map((slot) => slot.hit?.split('/')[0])].filter(Boolean);
// starts loading everything a song plays, for awaiting before a render
function songSamples(song) {
  if (!RECORDINGS.on) return Promise.resolve();
  const folders = new Set(song.layers.flatMap((layer) => sampleFolders(INSTRUMENTS[layer.instrument], layer.recording)));
  return Promise.all([...folders].map(loadSamples));
}
const sampleSet = (folder) => (RECORDINGS.on ? RECORDINGS.sets.get(folder)?.ready : null);

// the recorded version of an instrument, or null to play the synthesised one. it keeps the
// instrument's settings except the ones that would fight the recording: its filter (a recording has
// its own tone, so it gets an almost open one that still darkens soft notes and dark layers), its
// vibrato and drift (the player's own are recorded), and its body (the real body's in it). a struck
// or plucked note dies away on its own, so it isn't faded as well
const recordedViews = new WeakMap();
function recorded(inst, midi, choice) {
  // (scenery plays its recordings its own way, playTexture)
  if (inst?.kind === 'texture') return null;
  const folder = recordingFolder(inst, choice);
  const set = folder && sampleSet(folder);
  const settings = recordingsOf(inst).find(([one]) => one === folder)?.[1] || {};
  // more than a fifth past the recordings and a note sounds stretched: those few stay synthesised
  const reach = settings.reach ?? 7;
  if (!set || (midi !== undefined && (midi < set.low - reach || midi > set.high + reach))) return null;
  if (!recordedViews.has(inst)) recordedViews.set(inst, new Map());
  const views = recordedViews.get(inst);
  if (!views.has(folder)) {
    const env = set.loop ? inst.env : [0.002, 0.1, 1, inst.env[3]];
    views.set(folder, { ...inst, kind: 'sample', env, filter: { freq: 12000, q: 0.5 }, vibrato: undefined, drift: 0, body: undefined, ...settings, samples: folder });
  }
  return views.get(folder);
}

// the steady middle of a held note, which loops for as long as the note's held: [start, end] in
// seconds, or null for a note too short to have one. the end is crossfaded into what comes just
// before the start, so going round can't click. worked out once, when the note's loaded, so it
// doesn't matter how many milliseconds of silence the mp3 put at the front
function loopNote(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const hop = Math.round(rate * 0.01);
  const levels = [];
  for (let at = 0; at + hop <= data.length; at += hop) {
    let sum = 0;
    for (let i = at; i < at + hop; i++) sum += data[i] * data[i];
    levels.push(Math.sqrt(sum / hop));
  }
  const peak = Math.max(...levels);
  // from once the attack's settled to before it starts dying away
  const settled = levels.findIndex((level) => level > peak * 0.7) + 5;
  let last = levels.length - 1;
  while (last > settled && levels[last] < peak * 0.5) last--;
  const start = (settled + Math.round((last - settled) * 0.3)) * hop;
  const end = last * hop;
  if (end - start < rate * 0.25) return null;
  const fade = Math.min(Math.round(rate * 0.12), (end - start) >> 1, start);
  for (let i = 0; i < fade; i++) {
    const t = (i / fade) * Math.PI / 2;
    data[end - fade + i] = data[end - fade + i] * Math.cos(t) + data[start - fade + i] * Math.sin(t);
  }
  return [start / rate, end / rate];
}

// the recording to play: the nearest note, at the nearest loudness. takes of the same note and
// loudness (round robins) are picked between at random, so a drum hit twice isn't the same twice
function pickTake(takes, midi, vel) {
  let best = Infinity;
  let found = [];
  for (const take of takes) {
    const score = Math.abs((take.midi ?? midi) - midi) + 4 * Math.abs((take.vel ?? vel) - vel);
    if (score < best - 1e-6) {
      best = score;
      found = [take];
    } else if (score < best + 1e-6) found.push(take);
  }
  return found[Math.floor(Math.random() * found.length)];
}

ENGINES.sample = (ctx, voice, inst, tone, f, midi, note = {}) => {
  const take = pickTake(sampleSet(inst.samples).notes, midi, voice.vel);
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  if (take.loop) {
    source.loop = true;
    [source.loopStart, source.loopEnd] = take.loop;
  }
  source.detune.value = (midi - take.midi) * 100 + (take.tune || 0) + scatter(tone) * 0.5;
  bendWith(voice.pitch, source.detune);
  let into = voice.input;
  // a palm mute: the string's top taken off and the note stopped short (see the pluck engine)
  if (note.mute) {
    const stop = new GainNode(ctx, { gain: 1 });
    stop.gain.setTargetAtTime(0, voice.when + 0.04, 0.06);
    into = new BiquadFilterNode(ctx, { frequency: 900, Q: 0.5 });
    into.connect(stop).connect(voice.input);
  }
  source.connect(into);
  // legato: a slurred note (note.slur, joined on to the last without a fresh breath or bow) starts in
  // its recording's steady middle, past the attack, so a flute or violin line goes from note to note
  // the way the player does instead of every note starting with its own puff or scrape. the last
  // note's release overlaps it, which is the crossfade a legato sample library makes between notes
  source.start(voice.when, note.slur && take.loop ? take.loop[0] : 0);
  source.stop(voice.end);
};

// a kit's slot from a recording (slot.hit), or false if it isn't loaded. a drum the composer moved
// into the song's key is retuned from the pitch it was recorded at (slot.at). the kit's decay still
// ends a long ring, so a short hat stays short
function playHit(ctx, out, when, vel, slot, p) {
  const [folder, name] = slot.hit.split('/');
  const takes = sampleSet(folder)?.hits[name];
  if (!takes) return false;
  const take = pickTake(takes, 0, vel);
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  if (slot.at) source.playbackRate.value = Math.min(2, Math.max(0.5, p.tune / slot.at));
  const level = ctx.createGain();
  level.gain.setValueAtTime((slot.level ?? 1) * (0.45 + 0.55 * vel), when);
  level.gain.setTargetAtTime(0, when + Math.max(0.08, p.decay * 2), Math.max(0.05, p.decay));
  source.connect(level).connect(out);
  source.start(when);
  source.stop(when + Math.min(take.buffer.duration, Math.max(0.08, p.decay * 2) + Math.max(0.05, p.decay) * 6) + 0.05);
  return true;
}

// ---------- drums ----------

function hitEnvelope(ctx, when, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setTargetAtTime(0, when + attack, decay / 4);
  return gain;
}
function noiseHit(ctx, out, when, peak, type, freq, q, attack, decay) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = Math.min(16000, freq);
  filter.Q.value = q;
  noiseSource(ctx, when, when + attack + decay * 1.6 + 0.05).connect(filter).connect(hitEnvelope(ctx, when, peak, attack, decay)).connect(out);
}
// a pitched hit that drops from one frequency to another, like a drum skin settling
function toneHit(ctx, out, when, peak, from, to, sweep, decay, wave = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + sweep);
  osc.connect(hitEnvelope(ctx, when, peak, 0.002, decay)).connect(out);
  osc.start(when);
  osc.stop(when + decay * 1.6 + 0.05);
}

// a cymbal the way the roland 808 made one: six square waves at clashing pitches, filtered down to
// just their metallic shimmer, with a little noise for air. plain filtered noise (what I had first)
// sounds like hiss rather than metal. tone is where the filters sit, so brighter kits ring higher
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metal(ctx, out, when, peak, tone, decay) {
  const end = when + decay * 1.6 + 0.05;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(15000, tone * 1.3);
  band.Q.value = 0.8;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = Math.min(14000, tone);
  band.connect(high).connect(hitEnvelope(ctx, when, peak, 0.001, decay)).connect(out);
  for (const freq of METAL) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * (tone / 7000);
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    osc.connect(gain).connect(band);
    osc.start(when);
    osc.stop(end);
  }
  noiseHit(ctx, out, when, peak * 0.3, 'highpass', tone, 0.7, 0.001, decay * 0.7);
}

// each gets the slot's settings (p): tune (hz), tone (a filter's hz), decay (seconds), gain, and step
// (one step of the groove, in seconds)
const heartGap = (p) => {
  let gap = p.step || 0.24;
  while (gap < 0.15) gap *= 2;
  return gap;
};
const DRUMS = {
  kick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 3.5, p.tune, 0.06, p.decay);
    // the beater's click, so it's heard on small speakers that can't play the low thump. a metal kick
    // clicks hard (click), or double kick blurs into a rumble
    noiseHit(ctx, out, when, vel * p.gain * (p.click ?? 0.2), 'lowpass', 3500, 0.7, 0.001, 0.012);
  },
  // lub-dub. the dub lands a whole number of groove steps later, so it's on the grid like everything
  // else: it used to be a fixed 0.24 seconds, which fell between the steps at most tempos
  heart(ctx, out, when, vel, p) {
    DRUMS.kick(ctx, out, when, vel, p);
    DRUMS.kick(ctx, out, when + heartGap(p), vel * 0.6, p);
  },
  taiko(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 1.8, p.tune, 0.12, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.5, 'lowpass', 300, 0.7, 0.002, 0.15);
  },
  tom: (ctx, out, when, vel, p) => toneHit(ctx, out, when, vel * p.gain, p.tune * 1.5, p.tune, 0.12, p.decay),
  // the wires (a wide band of noise), their sizzle, and the drum's body
  snare(ctx, out, when, vel, p) {
    noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 0.4, 0.001, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.45, 'highpass', 5000, 0.7, 0.001, p.decay * 0.5);
    toneHit(ctx, out, when, vel * p.gain * 0.6, p.tune * 1.28, p.tune, 0.04, 0.1, 'triangle');
  },
  hat: (ctx, out, when, vel, p) => metal(ctx, out, when, vel * p.gain, p.tone, p.decay),
  // a crash: the metal ringing on for a second or two over a burst of bright noise, which is most of a
  // real crash's wash
  crash(ctx, out, when, vel, p) {
    metal(ctx, out, when, vel * p.gain * 0.6, p.tone, p.decay);
    noiseHit(ctx, out, when, vel * p.gain, 'highpass', p.tone * 0.7, 0.5, 0.002, p.decay * 0.8);
  },
  // a ride: a quieter shimmer, and the ping of the stick on it, which is in key (tune) with its octave
  ride(ctx, out, when, vel, p) {
    metal(ctx, out, when, vel * p.gain * 0.55, p.tone, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.3, p.tune, p.tune, 0.01, 0.3);
    toneHit(ctx, out, when, vel * p.gain * 0.12, p.tune * 2, p.tune * 2, 0.01, 0.15);
  },
  shaker: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 1.2, 0.012, p.decay),
  brush: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 0.6, 0.025, p.decay),
  rim(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune, p.tune * 0.95, 0.01, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.4, 'bandpass', 3000, 1, 0.001, 0.02);
  },
  tick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune, p.tune, 0.01, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.4, p.tune * 2.6, p.tune * 2.6, 0.01, p.decay * 0.4);
  },
  // the chip kit's: a square wave dropping in pitch, and plain noise cut off above tone
  blip: (ctx, out, when, vel, p) => toneHit(ctx, out, when, vel * p.gain, p.tune * 4, p.tune, 0.05, p.decay, 'square'),
  noise: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'lowpass', p.tone, 0.5, 0.001, p.decay),
  // three quick bursts, like hands not quite together
  clap(ctx, out, when, vel, p) {
    for (let i = 0; i < 3; i++) noiseHit(ctx, out, when + i * 0.011, vel * p.gain * (i === 2 ? 1 : 0.6), 'bandpass', p.tone, 1, 0.001, i === 2 ? p.decay : 0.01);
  },
  // a conga: a hand on a tall drum, a round tone dropping a little in pitch, and the slap of the palm
  conga(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 1.15, p.tune, 0.03, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.25, p.tune * 2.3, p.tune * 2.2, 0.02, p.decay * 0.4);
    noiseHit(ctx, out, when, vel * p.gain * 0.3, 'bandpass', 2500, 1, 0.001, 0.02);
  },
  // the tabla's dayan: tuned to the song's home note (tuneDrum in music.js), and the black spot on its
  // skin (the syahi) makes its overtones nearly whole multiples, so it rings like a note, not a thud
  dayan(ctx, out, when, vel, p) {
    for (const [ratio, level] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]]) toneHit(ctx, out, when, vel * p.gain * level, p.tune * ratio * 1.01, p.tune * ratio, 0.02, p.decay / ratio ** 0.5);
    noiseHit(ctx, out, when, vel * p.gain * 0.35, 'bandpass', 3500, 1.2, 0.001, 0.015);
  },
  // the tabla's bayan: a low boom whose pitch the heel of the hand pushes up as it rings ("ge")
  bayan(ctx, out, when, vel, p) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(p.tune * 0.9, when);
    osc.frequency.linearRampToValueAtTime(p.tune * 1.35, when + p.decay * 0.6);
    osc.connect(hitEnvelope(ctx, when, vel * p.gain, 0.003, p.decay)).connect(out);
    osc.start(when);
    osc.stop(when + p.decay * 1.6 + 0.05);
    noiseHit(ctx, out, when, vel * p.gain * 0.2, 'lowpass', 600, 0.7, 0.002, 0.03);
  },
  // a flat slap on a drum, all click and no ring (the tabla's "ka")
  slap: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 1.5, 0.001, p.decay),
  // the 808's cowbell: two squares about a sixth apart through a narrow filter
  cowbell(ctx, out, when, vel, p) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = p.tune * 1.5;
    band.Q.value = 3;
    band.connect(hitEnvelope(ctx, when, vel * p.gain, 0.001, p.decay)).connect(out);
    for (const ratio of [1, 1.48]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = p.tune * ratio;
      osc.connect(band);
      osc.start(when);
      osc.stop(when + p.decay * 1.6 + 0.05);
    }
  },
  // a gong: out of tune overtones that bloom a moment after it's struck (the high ones last) and ring
  // for seconds, the pitch sagging a little as it goes. the temple kit crashes on one
  gong(ctx, out, when, vel, p) {
    const end = when + p.decay * 1.6 + 0.1;
    for (const [ratio, level, bloom] of [[1, 1, 0.02], [1.48, 0.6, 0.15], [1.93, 0.45, 0.3], [2.47, 0.35, 0.4], [3.2, 0.25, 0.5], [4.1, 0.15, 0.6]]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(p.tune * ratio, when);
      osc.frequency.linearRampToValueAtTime(p.tune * ratio * 0.985, end);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(vel * p.gain * level * 0.3, when + bloom);
      gain.gain.setTargetAtTime(0, when + bloom, p.decay / 4);
      osc.connect(gain).connect(out);
      osc.start(when);
      osc.stop(end);
    }
    noiseHit(ctx, out, when, vel * p.gain * 0.25, 'lowpass', 1500, 0.7, 0.003, 0.3);
  },
};

// ---------- textures ----------

// each makes its sound from when to end into out, which fades it in and out. bright is the layer's
// brightness, and the pitched ones (hum, crickets, drips, birds) take the song's home note from midi
// and stay on its home note, fifth or fourth, which are in every key's scales. the numbers after the
// filters bring each up to about the same loudness
//
// most happen now and then, with quiet in between, the way the vinyl's crackle does: the wind was a
// steady roar of noise, and it drowned the tune while rarely adding anything. moments() picks when

// times for something that happens now and then: the first soon after the start, so trying a texture
// out on the page is heard, then a gap of low to high seconds after each
function moments(when, end, low, high) {
  const out = [];
  for (let t = when + 0.3 + Math.random() * 1.2; t < end; t += low + Math.random() * (high - low)) out.push(t);
  return out;
}
// one swell (a gust, a wave, a far off roll) on a gain that otherwise sits silent
function swell(param, at, rise, fall, peak) {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + rise);
  param.linearRampToValueAtTime(0, at + rise + fall);
}
// swells of rise and fall seconds (each a [low, high] range) with still gaps between them, on noise
// through a filter. boost makes up for a filter that leaves little through
function swells(ctx, out, when, end, filter, rise, fall, gap, boost = 1) {
  const level = ctx.createGain();
  level.gain.value = 0;
  for (let t = when + 0.3 + Math.random(); t < end;) {
    const up = rise[0] + Math.random() * (rise[1] - rise[0]);
    const down = fall[0] + Math.random() * (fall[1] - fall[0]);
    swell(level.gain, t, up, down, (0.5 + Math.random() * 0.5) * boost);
    t += up + down + gap[0] + Math.random() * (gap[1] - gap[0]);
  }
  noiseSource(ctx, when, end).connect(filter).connect(level).connect(out);
}
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
// somewhere left or right, for one event: a bird calls from the left, the next drip falls to the
// right, the way a real place sounds. every event from one spot sounded like a speaker in the room
function spot(ctx, out) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(out);
  return pan;
}

// tiny bubbles for the brook: each a short sine whose pitch jumps up as it bursts, scattered over a
// few seconds that loop. worked out once per sample rate, like the crackle, so a brook minutes long
// isn't thousands of oscillators
function bubbleBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.bubbles) {
    cache.bubbles = new AudioBuffer({ length: rate * 5, sampleRate: rate });
    const data = cache.bubbles.getChannelData(0);
    for (let n = 0; n < 160; n++) {
      const at = Math.floor(Math.random() * (data.length - rate * 0.1));
      const f = 450 + Math.random() ** 2 * 1400;
      const length = Math.floor(rate * (0.015 + Math.random() * 0.035));
      const size = 0.2 + Math.random() * 0.8;
      let phase = 0;
      for (let i = 0; i < length; i++) {
        phase += (2 * Math.PI * f * (1 + (0.6 * i) / length)) / rate;
        data[at + i] += Math.sin(phase) * size * Math.sin((Math.PI * i) / length) ** 2;
      }
    }
  }
  return cache.bubbles;
}
// the key's home note in the octave starting at bottom, for the pitched textures
const homeAbove = (bottom, midi) => bottom + ((((midi - bottom) % 12) + 12) % 12);

const TEXTURES = {
  // gusts of four to ten seconds, with still air for four to fourteen between them
  wind(ctx, out, when, end, bright) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 450 * bright;
    band.Q.value = 1.2;
    lfo(ctx, 0.07, 280 * bright, band.frequency, when, end);
    swells(ctx, out, when, end, band, [1.5, 4], [2.5, 6], [4, 14]);
  },
  rain(ctx, out, when, end, bright) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1200;
    const low = ctx.createBiquadFilter();
    low.frequency.value = Math.min(9000, 5000 * bright);
    const level = ctx.createGain();
    level.gain.value = 0.35;
    noiseSource(ctx, when, end).connect(high).connect(low).connect(level).connect(out);
    TEXTURES.drops(ctx, out, when, end, 2500, 0.8);
  },
  // crackle through a filter, for rain drops, vinyl and fire
  drops(ctx, out, when, end, freq, level, type = 'highpass') {
    const source = ctx.createBufferSource();
    source.buffer = crackleBuffer(ctx.sampleRate);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(out);
    source.start(when, Math.random() * 3);
    source.stop(end);
  },
  // waves rolling in and drawing back, with a calm moment between some of them
  ocean(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 700 * bright;
    swells(ctx, out, when, end, low, [2, 4], [3, 5.5], [0, 5]);
  },
  vinyl(ctx, out, when, end, bright) {
    TEXTURES.drops(ctx, out, when, end, 1500 * bright, 1);
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = 4000;
    hiss.Q.value = 0.5;
    const level = ctx.createGain();
    level.gain.value = 0.05;
    noiseSource(ctx, when, end).connect(hiss).connect(level).connect(out);
  },
  fire(ctx, out, when, end, bright) {
    TEXTURES.drops(ctx, out, when, end, 3500 * bright, 1.3, 'lowpass');
    const roar = ctx.createBiquadFilter();
    roar.frequency.value = 400 * bright;
    // the roar sits well under the crackle: it was a steady hiss loud enough to cover the tune
    const flicker = ctx.createGain();
    flicker.gain.value = 0.5;
    lfo(ctx, 0.6, 0.25, flicker.gain, when, end);
    noiseSource(ctx, when, end).connect(roar).connect(flicker).connect(out);
  },
  // far off rolls, like thunder or something heavy moving underground, with long quiet between
  rumble(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 80 * bright;
    low.Q.value = 2;
    lfo(ctx, 0.05, 25 * bright, low.frequency, when, end);
    swells(ctx, out, when, end, low, [2, 4], [4, 7], [5, 15], 5);
  },
  // two crickets: a high tone chopped up fast (the chirp), switched on and off slowly. they sing the
  // song's home note and the note above it, high up: at fixed pitches they were a whistle out of key.
  // the chirp is a triangle, not a square, so each one fades rather than clicking on and off
  crickets(ctx, out, when, end, bright, midi = 60) {
    const home = 101 + ((((midi - 101) % 12) + 12) % 12);
    for (const [note, chirp, rest] of [[home, 32, 0.9], [home + 2, 27, 0.63]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = mtof(note);
      // these swing -1 to 1, so they sit at half with half either way: off to fully on
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      lfo(ctx, chirp, 0.5, chop.gain, when, end, 'triangle');
      const pulse = ctx.createGain();
      pulse.gain.value = 0.15;
      lfo(ctx, rest, 0.15, pulse.gain, when, end, 'square');
      osc.connect(chop).connect(pulse).connect(out);
      osc.start(when);
      osc.stop(end);
    }
  },
  // mains hum and its beating overtones, like a fridge in an empty room. it hums the song's home note:
  // it was always an a, which droned a semitone or a tritone off in most keys
  hum(ctx, out, when, end, bright, midi = 60) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 500 * bright;
    low.connect(out);
    const home = mtof(28 + ((((midi - 28) % 12) + 12) % 12));
    for (const [ratio, level] of [[1, 0.5], [1.0064, 0.4], [2.004, 0.25], [3.002, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = home * ratio;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(low);
      osc.start(when);
      osc.stop(end);
    }
  },
  // water dripping into a pool in a cave, every few seconds: minecraft's caves, fallout's vaults. each
  // drop is a little bubble whose pitch jumps up as it bursts, on the home note or fifth, now and then
  // with a second drop after
  drips(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(84, midi);
    const drop = (at, f, level, where = spot(ctx, out)) => {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 0.6, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + 0.035);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.004);
      gain.gain.setTargetAtTime(0, at + 0.004, 0.045);
      osc.connect(gain).connect(where);
      osc.start(at);
      osc.stop(at + 0.4);
    };
    for (const at of moments(when, end, 1.5, 7)) {
      const f = mtof(home + pickOne([0, 7, 12, 7, 0, -5]));
      const where = spot(ctx, out);
      drop(at, f, 0.6 + Math.random() * 0.4, where);
      if (Math.random() < 0.25) drop(at + 0.12 + Math.random() * 0.25, f * pickOne([1, 1.5, 0.75]), 0.4, where);
    }
  },
  // a geiger counter somewhere near: a few clicks bunched together, then nothing for a while (fallout)
  geiger(ctx, out, when, end) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2500;
    high.connect(spot(ctx, out));
    const click = (at, level) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, at);
      gain.gain.setTargetAtTime(0, at + 0.001, 0.0015);
      noiseSource(ctx, at, at + 0.012).connect(gain).connect(high);
    };
    for (const at of moments(when, end, 0.8, 5)) {
      for (let k = 0, t = at; k < 1 + Math.floor(Math.random() ** 2 * 7); k++, t += 0.01 + Math.random() ** 2 * 0.15) click(t, 0.4 + Math.random() * 0.6);
    }
  },
  // a bird singing a few notes now and then, quick slides up or down onto the key's notes, high up
  birds(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(93, midi);
    for (const at of moments(when, end, 5, 14)) {
      const call = pickOne(['up', 'down', 'trill']);
      const count = call === 'trill' ? 5 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 4);
      const where = spot(ctx, out);
      let t = at;
      for (let k = 0; k < count; k++) {
        const f = mtof(home + pickOne([0, 5, 7, 12]));
        const length = call === 'trill' ? 0.045 : 0.08 + Math.random() * 0.1;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(call === 'down' ? f * 1.25 : f * 0.8, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + length * 0.8);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.01);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.02);
        t += length + (call === 'trill' ? 0.02 : 0.05 + Math.random() * 0.12);
      }
    }
  },
  // metal settling somewhere far off, a slow scraping groan, then a long quiet (fallout, dying light).
  // the groan is a low buzz through a narrow, sliding resonance, chopped quickly like something
  // catching and slipping
  creaks(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 8, 20)) {
      const length = 1.5 + Math.random() * 2.5;
      const stop = at + length + 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const pitch = 30 + Math.random() * 30;
      osc.frequency.setValueAtTime(pitch, at);
      osc.frequency.linearRampToValueAtTime(pitch * (0.8 + Math.random() * 0.5), at + length);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 9;
      const ring = (400 + Math.random() * 500) * Math.min(1.5, bright);
      band.frequency.setValueAtTime(ring, at);
      band.frequency.linearRampToValueAtTime(ring * (0.7 + Math.random() * 0.6), at + length);
      const catches = ctx.createGain();
      catches.gain.value = 0.5;
      lfo(ctx, 9 + Math.random() * 11, 0.5, catches.gain, at, stop, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.4, length * 0.6, 1);
      osc.connect(band).connect(catches).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(stop);
    }
  },
  // a brook: bubbles babbling past (bubbleBuffer) on two loops at different speeds, so they never line
  // up the same way, over the faintest low wash of water. it swells and settles slowly, the way a
  // stream's sound comes and goes on the breeze. it's a steady sound, but only bubbles, never a hiss
  stream(ctx, out, when, end, bright) {
    const level = ctx.createGain();
    level.gain.value = 0.7;
    lfo(ctx, 0.05 + Math.random() * 0.03, 0.3, level.gain, when, end);
    level.connect(out);
    for (const [speed, side] of [[1, -0.35], [1.27, 0.35]]) {
      const source = ctx.createBufferSource();
      source.buffer = bubbleBuffer(ctx.sampleRate);
      source.loop = true;
      source.playbackRate.value = speed * Math.min(1.3, bright ** 0.5);
      const pan = ctx.createStereoPanner();
      pan.pan.value = side;
      source.connect(pan).connect(level);
      source.start(when, Math.random() * 4);
      source.stop(end);
    }
    const wash = ctx.createBiquadFilter();
    wash.frequency.value = 500 * bright;
    const quiet = ctx.createGain();
    quiet.gain.value = 0.08;
    noiseSource(ctx, when, end).connect(wash).connect(quiet).connect(level);
  },
  // a breeze through leaves now and then: a rustle rising and falling over a second or two, the
  // crackle sped up into a dry patter over a hush of air, with long quiet between
  leaves(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 6, 16)) {
      const rise = 0.4 + Math.random() * 0.8;
      const fall = 0.8 + Math.random() * 1.5;
      const stop = at + rise + fall + 0.05;
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, rise, fall, 0.6 + Math.random() * 0.4);
      level.connect(spot(ctx, out));
      const patter = ctx.createBufferSource();
      patter.buffer = crackleBuffer(ctx.sampleRate);
      patter.loop = true;
      patter.playbackRate.value = 2.5 + Math.random();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3200 * Math.min(1.3, bright);
      band.Q.value = 0.6;
      patter.connect(band).connect(level);
      patter.start(at, Math.random() * 3);
      patter.stop(stop);
      const air = ctx.createBiquadFilter();
      air.type = 'highpass';
      air.frequency.value = 2500;
      const hush = ctx.createGain();
      hush.gain.value = 0.12;
      noiseSource(ctx, at, stop).connect(air).connect(hush).connect(level);
    }
  },
  // frogs by a pond: now and then one croaks a few times, a low buzz rattled fast (the ribbit) through
  // a nasal resonance, on the home note or fifth, and sometimes another answers from somewhere else
  frogs(ctx, out, when, end, bright, midi = 60) {
    const croaks = (at, where) => {
      const f = mtof(homeAbove(43, midi) + pickOne([0, 7, 12]));
      const count = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < count; k++) {
        const t = at + k * (0.35 + Math.random() * 0.25);
        const length = 0.12 + Math.random() * 0.12;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.92, t + length);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 700 * Math.min(1.3, bright);
        band.Q.value = 4;
        const rattle = ctx.createGain();
        rattle.gain.value = 0.5;
        lfo(ctx, 28 + Math.random() * 10, 0.5, rattle.gain, t, t + length + 0.05, 'square');
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(band).connect(rattle).connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }
    };
    for (const at of moments(when, end, 5, 16)) {
      croaks(at, spot(ctx, out));
      if (Math.random() < 0.35) croaks(at + 1.5 + Math.random() * 1.5, spot(ctx, out));
    }
  },
  // an owl far off: hoo, then often hoo-hoo, a soft whistle sliding down onto the home note or fifth,
  // with a long quiet between
  owl(ctx, out, when, end, bright, midi = 60) {
    const hoot = (t, f, length, where) => {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 1.04, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + length * 0.4);
      osc.frequency.exponentialRampToValueAtTime(f * 0.97, t + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + length * 0.3);
      gain.gain.linearRampToValueAtTime(0, t + length);
      osc.connect(gain).connect(where);
      osc.start(t);
      osc.stop(t + length + 0.05);
    };
    for (const at of moments(when, end, 14, 32)) {
      const where = spot(ctx, out);
      const f = mtof(homeAbove(60, midi) + pickOne([0, 0, 7]));
      hoot(at, f, 0.5, where);
      if (Math.random() < 0.7) {
        hoot(at + 0.9, f, 0.22, where);
        hoot(at + 1.2, f, 0.45, where);
      }
    }
  },
  // wind chimes somewhere out of sight: now and then the breeze knocks a few together, thin bells on
  // the home note, fourth or fifth, high up and fading slowly. their overtone is harmonic (3), as the
  // gentle bells' are, so they never clash with the chords
  chimes(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(84, midi);
    for (const at of moments(when, end, 6, 18)) {
      const where = spot(ctx, out);
      const count = 1 + Math.floor(Math.random() * 4);
      for (let k = 0, t = at; k < count; k++, t += 0.15 + Math.random() * 0.5) {
        const f = mtof(home + pickOne([0, 5, 7, 12]));
        const length = 1.5 + Math.random() * 1.5;
        const strength = 0.5 + Math.random() * 0.5;
        for (const [ratio, level] of [[1, 1], [3, 0.2]]) {
          const osc = ctx.createOscillator();
          osc.frequency.value = f * ratio;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level * strength, t + 0.003);
          gain.gain.setTargetAtTime(0, t + 0.003, length / (ratio > 1 ? 8 : 4));
          osc.connect(gain).connect(where);
          osc.start(t);
          osc.stop(t + length + 0.1);
        }
      }
    }
  },
  // guitar feedback somewhere in the room: now and then an amp starts to sing on its own, a high note
  // swelling up out of nothing, wavering as it grows, then let go (nirvana, my bloody valentine). it
  // sings the home note or fifth, two octaves or so up, through a little fuzz
  feedback(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(76, midi);
    const fuzz = ctx.createWaveShaper();
    fuzz.curve = shapeCurve('fuzz', 3);
    const tone = ctx.createBiquadFilter();
    tone.frequency.value = 3500 * Math.min(1.3, bright);
    fuzz.connect(tone).connect(out);
    for (const at of moments(when, end, 10, 26)) {
      const length = 2 + Math.random() * 3;
      const stop = at + length + 0.05;
      const osc = ctx.createOscillator();
      osc.frequency.value = mtof(home + pickOne([0, 7, 12, 0]));
      const shake = ctx.createOscillator();
      shake.frequency.value = 5 + Math.random();
      const waver = ctx.createGain();
      waver.gain.setValueAtTime(0, at);
      waver.gain.linearRampToValueAtTime(12, at + length * 0.7);
      shake.connect(waver).connect(osc.detune);
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.75, length * 0.25, 0.9);
      osc.connect(level).connect(spot(ctx, fuzz));
      for (const one of [osc, shake]) {
        one.start(at);
        one.stop(stop);
      }
    }
  },

  // a few bubbles rising past now and then: quick sines sliding up as they burst (bubbleBuffer's, one
  // at a time), bunched together, from somewhere left or right
  bubbles(ctx, out, when, end) {
    for (const at of moments(when, end, 3, 10)) {
      const where = spot(ctx, out);
      const count = 3 + Math.floor(Math.random() * 10);
      for (let k = 0, t = at; k < count; k++, t += 0.03 + Math.random() ** 2 * 0.25) {
        const f = 300 + Math.random() ** 2 * 1200;
        const length = 0.02 + Math.random() * 0.05;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 1.7, t + length);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.7, t + length * 0.3);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.02);
      }
    }
  },
  // a whale far off: a long, low moan rising and falling between the home note and the notes round it,
  // wavering, with a long quiet between calls
  whale(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(43, midi);
    for (const at of moments(when, end, 14, 30)) {
      const length = 2 + Math.random() * 3;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const path = [0, pickOne([5, 7, 12]), pickOne([0, 7, -5])];
      path.forEach((step, i) => osc.frequency[i ? 'exponentialRampToValueAtTime' : 'setValueAtTime'](mtof(home + step), at + (length * i) / (path.length - 1)));
      const shake = ctx.createOscillator();
      shake.frequency.value = 5 + Math.random() * 3;
      const depth = ctx.createGain();
      depth.gain.value = 25;
      shake.connect(depth).connect(osc.detune);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 2 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.35, length * 0.65, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      for (const one of [osc, shake]) {
        one.start(at);
        one.stop(at + length + 0.05);
      }
    }
  },
  // an aztec death whistle: air forced through a clay chamber, so it screams. a burst of noise through
  // two narrow resonances that rise and fall, like a voice, now and then and far off
  deathWhistle(ctx, out, when, end) {
    for (const at of moments(when, end, 14, 32)) {
      const length = 1.5 + Math.random() * 2;
      const where = spot(ctx, out);
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.25, length * 0.75, 1);
      level.connect(where);
      const peak = 1100 + Math.random() * 500;
      for (const ratio of [1, 2.3]) {
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', Q: 18 });
        band.frequency.setValueAtTime(peak * ratio * 0.7, at);
        band.frequency.linearRampToValueAtTime(peak * ratio, at + length * 0.3);
        band.frequency.linearRampToValueAtTime(peak * ratio * 0.6, at + length);
        lfo(ctx, 9 + Math.random() * 6, 40 * ratio, band.frequency, at, at + length + 0.05);
        noiseSource(ctx, at, at + length + 0.05).connect(band).connect(level);
      }
    }
  },
  // a conch shell blown as a horn: a call on the home note, scooping up onto it, swelling and dying
  conch(ctx, out, when, end, bright, midi = 60) {
    for (const at of moments(when, end, 16, 34)) {
      const length = 1.5 + Math.random() * 2.5;
      const f = mtof(homeAbove(50, midi));
      const osc = ctx.createOscillator();
      setWave(ctx, osc, 'brass');
      osc.frequency.setValueAtTime(f * 0.94, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + 0.25);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1200, Q: 1 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.3, length, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.4);
    }
  },
  // a rainstick turned over: seeds pattering down through the cactus spines, a few seconds of tiny
  // clicks that thin out as it empties
  rainstick(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const length = 2.5 + Math.random() * 2.5;
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3500 + Math.random() * 2000, Q: 1.5 });
      const patter = ctx.createGain();
      patter.gain.value = 0.5;
      lfo(ctx, 35 + Math.random() * 20, 0.5, patter.gain, at, at + length + 0.05, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.4, length - 0.4, 1);
      noiseSource(ctx, at, at + length + 0.05).connect(band).connect(patter).connect(level).connect(spot(ctx, out));
    }
  },
  // a dj scratching a record: a short sound pushed back and forth under the needle, quick sweeps up and
  // down, now and then
  scratches(ctx, out, when, end) {
    for (const at of moments(when, end, 8, 20)) {
      const strokes = 2 + Math.floor(Math.random() * 4);
      const where = spot(ctx, out);
      for (let k = 0, t = at; k < strokes; k++) {
        const length = 0.08 + Math.random() * 0.12;
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', Q: 4 });
        band.frequency.setValueAtTime(k % 2 ? 2400 : 500, t);
        band.frequency.exponentialRampToValueAtTime(k % 2 ? 500 : 2400, t + length);
        const level = ctx.createGain();
        level.gain.value = 0;
        swell(level.gain, t, length * 0.3, length * 0.7, 1);
        noiseSource(ctx, t, t + length + 0.02).connect(band).connect(level).connect(where);
        t += length + Math.random() * 0.06;
      }
    }
  },
  // lava (minecraft's nether): thick bubbles bursting slowly, low, over the far off roll of the rumble
  lava(ctx, out, when, end, bright) {
    TEXTURES.rumble(ctx, out, when, end, bright);
    for (const at of moments(when, end, 0.4, 2.5)) {
      const f = 70 + Math.random() * 110;
      const length = 0.08 + Math.random() * 0.12;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * 2.2, at + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, at + length * 0.4);
      gain.gain.linearRampToValueAtTime(0, at + length);
      osc.connect(gain).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.02);
    }
  },
  // a factory somewhere close: a machine humming on the home note and something heavy rolling
  factory(ctx, out, when, end, bright, midi) {
    TEXTURES.hum(ctx, out, when, end, bright, midi);
    TEXTURES.rumble(ctx, out, when, end, bright);
  },
  // a radio between stations (silent hill's warns you something's near): bursts of static that
  // swell, flicker and cut out
  static(ctx, out, when, end) {
    for (const at of moments(when, end, 6, 18)) {
      const length = 1 + Math.random() * 3;
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1800 + Math.random() * 1500, Q: 0.7 });
      const flicker = ctx.createGain();
      flicker.gain.value = 0.6;
      lfo(ctx, 6 + Math.random() * 14, 0.4, flicker.gain, at, at + length + 0.05, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.15, length, 1);
      noiseSource(ctx, at, at + length + 0.05).connect(band).connect(flicker).connect(level).connect(spot(ctx, out));
    }
  },
  // an air raid siren far off: one slow wail rising, holding and falling away, now and then
  siren(ctx, out, when, end) {
    for (const at of moments(when, end, 25, 50)) {
      const length = 7 + Math.random() * 4;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, at);
      osc.frequency.exponentialRampToValueAtTime(560, at + length * 0.35);
      osc.frequency.setValueAtTime(560, at + length * 0.55);
      osc.frequency.exponentialRampToValueAtTime(170, at + length);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 1 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.35, length * 0.65, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  },
  // metal struck somewhere off in the dark, ringing at a struck plate's out of tune overtones (silent
  // hill's otherworld, a factory floor): one to three blows
  clanks(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 6, 16)) {
      const where = spot(ctx, out);
      const f = 160 + Math.random() * 260;
      for (let k = 0, t = at; k < 1 + Math.floor(Math.random() * 3); k++, t += 0.25 + Math.random() * 0.6) {
        for (const [ratio, level, ring] of [[1, 1, 1.2], [2.76, 0.5, 0.6], [5.4, 0.3, 0.3], [8.93, 0.15, 0.15]]) {
          const osc = ctx.createOscillator();
          osc.frequency.value = f * ratio * Math.min(1.2, bright);
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level, t + 0.002);
          gain.gain.setTargetAtTime(0, t + 0.002, ring / 4);
          osc.connect(gain).connect(where);
          osc.start(t);
          osc.stop(t + ring + 0.05);
        }
      }
    }
  },
  // chains rattling: a second or so of little metal ticks, bunched
  chains(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const where = spot(ctx, out);
      const length = 0.4 + Math.random() * 0.8;
      for (let t = at; t < at + length; t += 0.01 + Math.random() ** 2 * 0.08) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 2200 + Math.random() * 4000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3 + Math.random() * 0.7, t);
        gain.gain.setTargetAtTime(0, t + 0.001, 0.012);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    }
  },
  // crows somewhere above: two or three harsh caws, a buzzing voice falling a little
  crows(ctx, out, when, end) {
    for (const at of moments(when, end, 12, 28)) {
      const where = spot(ctx, out);
      const f = 480 + Math.random() * 220;
      for (let k = 0, t = at; k < 2 + Math.floor(Math.random() * 2); k++, t += 0.35 + Math.random() * 0.2) {
        const length = 0.2 + Math.random() * 0.12;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.85, t + length);
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1500, Q: 3 });
        const rasp = ctx.createGain();
        rasp.gain.value = 0.6;
        lfo(ctx, 45, 0.4, rasp.gain, t, t + length + 0.05, 'square');
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(band).connect(rasp).connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }
    }
  },
  // slow footsteps somewhere you can't see, a few crunches on gravel, then gone
  footsteps(ctx, out, when, end) {
    for (const at of moments(when, end, 14, 30)) {
      const where = spot(ctx, out);
      for (let k = 0, t = at; k < 3 + Math.floor(Math.random() * 4); k++, t += 0.6 + Math.random() * 0.2) {
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1200 + Math.random() * 600, Q: 0.8 });
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.7 + Math.random() * 0.3, t + 0.01);
        gain.gain.setTargetAtTime(0, t + 0.01, 0.05);
        noiseSource(ctx, t, t + 0.25).connect(band).connect(gain).connect(where);
      }
    }
  },
  // steam let out of a pipe: a hiss coming on hard and dying away
  steam(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const length = 1.5 + Math.random() * 2.5;
      const high = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 2500, Q: 0.5 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.1, length, 1);
      noiseSource(ctx, at, at + length + 0.15).connect(high).connect(level).connect(spot(ctx, out));
    }
  },
  // a singing bowl struck now and then, on the home note: the bowl's out of tune overtones (2.71, 5.15)
  // dying long, beating slowly against a twin a hair apart
  bowl(ctx, out, when, end, bright, midi = 60) {
    for (const at of moments(when, end, 16, 34)) {
      const f = mtof(homeAbove(60, midi));
      const where = spot(ctx, out);
      for (const [ratio, level, ring] of [[1, 1, 8], [1.004, 0.6, 8], [2.71, 0.3, 4], [5.15, 0.1, 2]]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.01);
        gain.gain.setTargetAtTime(0, at + 0.01, ring / 4);
        osc.connect(gain).connect(where);
        osc.start(at);
        osc.stop(at + ring + 0.1);
      }
    }
  },
};

// recorded scenery: one of the texture's recordings now and then (inst.every seconds apart), each from
// its own spot. a recording with a pitch (a singing bowl) is moved to the nearest home note, so it's in
// the song's key like the synthesised ones
function recordedScenery(ctx, out, inst, set, when, end, midi = 60) {
  const [low, high] = inst.every || [10, 25];
  for (const at of moments(when, end, low, high)) {
    const take = pickOne(set.notes);
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    if (take.midi !== undefined) source.detune.value = (homeAbove(take.midi - 6, midi) - take.midi) * 100 + (take.tune || 0);
    const level = ctx.createGain();
    level.gain.value = 0.6 + Math.random() * 0.4;
    source.connect(level).connect(spot(ctx, out));
    source.start(at);
    source.stop(Math.min(end, at + take.buffer.duration));
  }
}

// a recorded bed (rain, a fire, a brook) never stops, so its slices play one after another, crossfaded
// over a second and a half, never the same slice twice running: one slice looped would be the same
// few seconds of rain coming round and round
const BED_FADE = 1.5;
const BED_RISE = Float32Array.from({ length: 32 }, (_, i) => Math.sin((Math.PI / 2) * (i / 31)));
const BED_FALL = BED_RISE.slice().reverse();
function recordedBed(ctx, out, set, when, end) {
  let last = null;
  for (let at = when; at < end;) {
    const others = set.notes.filter((one) => one !== last);
    const take = (last = pickOne(others.length ? others : set.notes));
    const length = take.buffer.duration;
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    const level = ctx.createGain();
    level.gain.setValueCurveAtTime(BED_RISE, at, BED_FADE);
    level.gain.setValueCurveAtTime(BED_FALL, at + length - BED_FADE, BED_FADE);
    source.connect(level).connect(out);
    source.start(at);
    source.stop(Math.min(end, at + length));
    at += length - BED_FADE;
  }
}

function playTexture(ctx, out, inst, tone, when, dur, vel, midi) {
  const fade = Math.min(3, dur / 3);
  const end = when + dur;
  // its recordings, if it has them and they've loaded
  const set = inst.samples && sampleSet(inst.samples);
  const level = (set ? inst.sampled.gain : inst.gain) * vel;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + fade);
  gain.gain.setValueAtTime(level, end - fade);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(out);
  if (set && inst.bed) recordedBed(ctx, gain, set, when, end + 0.05);
  else if (set) recordedScenery(ctx, gain, inst, set, when, end + 0.05, midi);
  else TEXTURES[inst.texture](ctx, gain, when, end + 0.05, Math.min(3, tone.bright), midi);
}

// one note of a layer. drums use the layer's release for how long they ring, and brightness for
// their filters. a drum note's tune is its slot's, moved into the song's key by the composer
// beats until each of a song's notes is struck again on its layer, for cutting its ring off there
// (voiceChain). worked out when the notes are handed over (MusicPlayer.load, renderSong), not stored on
// the notes, so the composer's output stays as it was
const restrikes = new WeakMap();
// how far apart a keyboard's lowest and highest notes are spread (playNote), a share of hard left to
// hard right two and a half octaves either side of the middle
const KEY_SPREAD = 0.35;
function findRestrikes(notes) {
  const last = new Map();
  for (const note of notes) {
    const key = `${note.layer} ${note.midi}`;
    if (last.has(key)) restrikes.set(last.get(key), note.t - last.get(key).t);
    last.set(key, note);
  }
}

function playNote(ctx, channel, layer, note, when, secondsPerBeat) {
  const inst = INSTRUMENTS[layer.instrument];
  if (!inst || !channel) return;
  const dur = note.dur * secondsPerBeat;
  if (inst.kind === 'drums') {
    const slot = inst.slots[note.midi];
    // drums sit a little under everything else: at full level every kick pushed the compressor down,
    // and the whole band pumped with it
    if (!slot) return;
    const p = { ...slot, tune: note.tune || slot.tune, step: dur, decay: slot.decay * layer.tone.release, tone: (slot.tone || 0) * layer.tone.bright };
    if (!(slot.hit && playHit(ctx, channel.input, when, note.vel, slot, p))) DRUMS[slot.voice](ctx, channel.input, when, note.vel * 0.7, p);
    // a recorded heartbeat is one thump, so its second comes the way DRUMS.heart's does
    else if (slot.voice === 'heart') playHit(ctx, channel.input, when + heartGap(p), note.vel * 0.6, slot, p);
    return;
  }
  if (inst.kind === 'texture') {
    playTexture(ctx, channel.input, inst, layer.tone, when, dur, note.vel, note.midi);
    return;
  }
  const f = mtof(note.midi);
  // the recording, if it's loaded (recorded()). a sung one is the singer's voice however far it's
  // moved, so it never swaps to the synthesised version part way through a phrase
  const played = recorded(inst, inst.sung ? undefined : note.midi, layer.recording) || inst;
  if (inst.sung && played.kind === 'sample' && !note.stop) {
    singLine(ctx, channel, played, layer.tone, note, when, dur, secondsPerBeat);
    return;
  }
  // keys and mallets are spread by pitch, low notes left and high notes right, as a piano or a marimba
  // is heard from the player's seat and recorded in stereo. the recordings are mono, and every note
  // from one point is the flat, boxed in sound of a cheap sampler
  let out = channel.input;
  if (inst.family === 'keys' || inst.family === 'bell') {
    out = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, (note.midi - 66) / 30)) * KEY_SPREAD });
    out.connect(channel.input);
  }
  const voice = voiceChain(ctx, out, played, layer.tone, f, when, dur, note.vel, note, (restrikes.get(note) ?? Infinity) * secondsPerBeat);
  voice.pitch = pitchMods(ctx, played, layer.tone, note, when, voice.end, secondsPerBeat);
  ENGINES[played.kind](ctx, voice, played, layer.tone, f, note.midi, note);
}

// a sung line (sung on an instrument: the throat singers). a recording of a voice started again on
// every note is a fresh breath and a fresh attack every note, which sounds like a sampler, not a
// singer. so a layer's channel keeps one voice going through a phrase: its first note starts the
// recording, and each note joined on after it (starting within a moment of the last one's end) bends
// that same recording to the new pitch, gliding there the way a voice does, and carries its loudness
// across. a note sung again on the same pitch dips a little and comes back, as a singer re-voices it.
// the notes come one at a time (the live player sends them a moment ahead), so each note plans the
// voice's ending, and the next one, if it joins on, takes that ending back
const GLIDE = 0.09;
const JOINED = 0.12;
function singLine(ctx, channel, inst, tone, note, when, dur, spb) {
  const set = sampleSet(inst.samples);
  const last = channel.voice;
  const joined = last && last.inst === inst && when >= last.start && Math.abs(when - last.off) < JOINED;
  const peak = inst.gain * note.vel;
  let voice = last;
  let cents;
  if (!joined) {
    const take = pickTake(set.notes, note.midi, note.vel);
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    if (take.loop) {
      source.loop = true;
      [source.loopStart, source.loopEnd] = take.loop;
    }
    const amp = ctx.createGain();
    cents = (note.midi - take.midi) * 100 + (take.tune || 0);
    source.detune.setValueAtTime(cents, when);
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + Math.max(0.01, Math.min(inst.env[0] * tone.attack, dur * 0.5)));
    source.connect(amp).connect(channel.input);
    source.start(when);
    voice = channel.voice = { inst, take, source, amp, start: when };
  } else {
    const { source, amp, take } = voice;
    cents = (note.midi - take.midi) * 100 + (take.tune || 0);
    // the glide: quick, and never more than a share of either note, so a run of short notes still
    // lands on each of them
    const glide = Math.min(GLIDE, (when - voice.at) * 0.4, dur * 0.4);
    // the last note's planned ending is taken back (from no earlier than now, or a ramp under way
    // would jump)
    const from = Math.max(ctx.currentTime, voice.at + 0.01, Math.min(voice.off, when - glide));
    amp.gain.cancelScheduledValues(from);
    amp.gain.setValueAtTime(voice.peak, from);
    if (note.midi === voice.midi) amp.gain.linearRampToValueAtTime(voice.peak * 0.55, Math.max(from, when - 0.01));
    amp.gain.linearRampToValueAtTime(peak, when + Math.max(0.03, glide));
    source.detune.setValueAtTime(voice.cents, Math.max(from, when - glide / 2));
    source.detune.linearRampToValueAtTime(cents, when + glide / 2);
  }
  // this note's ending, which the next note takes back if it joins on
  const off = when + dur;
  const release = Math.max(0.05, inst.env[3] * tone.release);
  voice.amp.gain.setTargetAtTime(0, off, release / 4);
  voice.source.stop(off + release * 1.5 + 0.05);
  // its own bends and shakes, on top of the glide
  bendWith(pitchMods(ctx, inst, tone, note, when, off, spb), voice.source.detune);
  Object.assign(voice, { at: when, off, midi: note.midi, cents, peak });
}

// ---------- guitar rigs ----------
//
// a rig is pedals, an amp and a speaker cabinet, in a layer's channel so every note on the layer goes
// through it together. that matters: a guitar's strings all go into one amp, and a chord clipped as
// one sound growls (its notes making new ones against each other), where notes clipped one by one and
// added up sound like several small guitars. the growl is also why rock plays power chords, a root and
// fifth with no third to grind against them. an instrument's amp is:
//   tight     hz cut below before the clipping (an overdrive's trick: a metal chug stays tight
//             instead of farting out)
//   boost     [hz, db] a mid push before the clipping, so it sings rather than fizzes
//   sustain   db of squash before the clipping (a compressor, then that much gain back): as the
//             string dies away the compressor lets go and turns it back up, so it hits the clipping
//             nearly as hard for seconds. that's why a cranked amp or a big muff makes a chord ring on
//             and on. without it a distorted chord died like an acoustic one, which was the thing that
//             sounded least like a real guitar
//   curve, gain   how it clips (ampCurve) and how hard it's driven
//   mids, presence, body   [hz, db] after the clipping: metal and fuzz scoop their mids, and put back
//             bite (presence) and thump (body, a low shelf)
//   cab       hz the speaker rolls the top off from, steeply as a real cabinet does: the fizz above it
//             is what makes cheap distortion harsh
//   low       hz the speaker rolls the lows off below (70 unless it says; a bass rig keeps 35)
//   level     its loudness, set with tests/levels.html. dry: clean signal blended back (a bass rig)
//   double    two takes, one a few ms behind the other with its own slow waver, panned left and right,
//             the way rock rhythm guitars are recorded twice and spread wide
//   chorus    [rate, depth in seconds] two wavering copies either side: the chorus pedal
//   reverse   reverse reverb: an echo that swells up and cuts off (my bloody valentine's yamaha)

// how a rig clips, its curve over -1 to 1 with the gain built in:
//   soft   tanh, rounding off gently: overdrive, and fuzz when driven hard
//   hard   clean until a sudden knee, then flat: a distortion pedal's diodes
//   tube   lopsided, one half clipping before the other: a valve amp turned up, whose even harmonics
//          are why it sounds warm
function ampCurve(kind, gain) {
  const key = `amp|${kind}|${gain}`;
  if (!curves.has(key)) {
    const curve = new Float32Array(4096);
    const shape = {
      soft: (x) => Math.tanh(gain * x),
      hard: (x) => (gain * x) / (1 + Math.abs(gain * x) ** 6) ** (1 / 6),
      tube: (x) => Math.tanh(gain * (x + 0.25)) - Math.tanh(gain * 0.25),
    }[kind] || ((x) => Math.tanh(gain * x));
    const top = Math.max(Math.abs(shape(1)), Math.abs(shape(-1)));
    for (let i = 0; i < curve.length; i++) curve[i] = shape((i / (curve.length - 1)) * 2 - 1) / top;
    curves.set(key, curve);
  }
  return curves.get(key);
}

// reverse reverb's impulse: noise rising for half a second, then cut dead. kept per context
const reverseImpulses = new WeakMap();
function reverseImpulse(ctx) {
  if (!reverseImpulses.has(ctx)) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < length; i++) {
        low += (Math.random() * 2 - 1 - low) * 0.3;
        data[i] = low * (i / length) ** 2;
      }
    }
    reverseImpulses.set(ctx, buffer);
  }
  return reverseImpulses.get(ctx);
}

// a rig from an instrument's amp: { input, output, stop() }. stop ends its wavering oscillators
function ampChain(ctx, amp) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const running = [];
  let at = input;
  const filter = (type, freq, q, db = 0) => {
    const one = ctx.createBiquadFilter();
    one.type = type;
    one.frequency.value = freq;
    one.Q.value = q;
    one.gain.value = db;
    at.connect(one);
    at = one;
  };
  // a delay line wavering slowly, panned: the second take of a double track, or one side of a chorus
  const wavering = (from, time, depth, rate, pan, level) => {
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = time;
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    osc.connect(amount).connect(delay.delayTime);
    osc.start(ctx.currentTime);
    running.push(osc);
    const gain = ctx.createGain();
    gain.gain.value = level;
    from.connect(delay).connect(gain).connect(new StereoPannerNode(ctx, { pan })).connect(output);
  };
  if (amp.tight) filter('highpass', amp.tight, 0.7);
  if (amp.boost) filter('peaking', amp.boost[0], 0.8, amp.boost[1]);
  if (amp.sustain) {
    // the browser's compressor puts back gain by itself (its "makeup gain"), so the threshold is all
    // that's set: the further down it is, the more of the string's dying away gets held up
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -6 - amp.sustain;
    squash.knee.value = 6;
    squash.ratio.value = 20;
    squash.attack.value = 0.004;
    squash.release.value = 0.3;
    at.connect(squash);
    at = squash;
  }
  if (amp.gain) {
    // a little under 1 going in, so a chord's notes added up drive it about as hard as the gain says.
    // oversampled, or the clipping's new harmonics fold back down as a whine
    filter('lowpass', 12000, 0.5);
    const drive = ctx.createGain();
    drive.gain.value = 0.6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = ampCurve(amp.curve, amp.gain);
    shaper.oversample = '4x';
    at.connect(drive).connect(shaper);
    at = shaper;
  }
  if (amp.mids) filter('peaking', amp.mids[0], 0.9, amp.mids[1]);
  if (amp.presence) filter('peaking', amp.presence[0], 1, amp.presence[1]);
  if (amp.body) filter('lowshelf', amp.body[0], 0.7, amp.body[1]);
  if (amp.cab) {
    filter('lowpass', amp.cab, 0.8);
    filter('lowpass', amp.cab * 1.3, 0.6);
  }
  filter('highpass', amp.low || 70, 0.6);
  const mix = ctx.createGain();
  mix.gain.value = amp.level;
  at.connect(mix);
  if (amp.dry) {
    const dry = ctx.createGain();
    dry.gain.value = amp.dry / amp.level;
    input.connect(dry).connect(mix);
  }
  if (amp.double) {
    mix.connect(new StereoPannerNode(ctx, { pan: -0.75 })).connect(output);
    wavering(mix, 0.013, 0.0006, 0.31, 0.75, 1);
  } else if (amp.chorus) {
    const [rate, depth] = amp.chorus;
    mix.connect(output);
    wavering(mix, 0.008, depth, rate, -0.8, 0.6);
    wavering(mix, 0.011, depth, rate * 1.13, 0.8, 0.6);
  } else mix.connect(output);
  if (amp.reverse) {
    const verb = ctx.createConvolver();
    verb.buffer = reverseImpulse(ctx);
    const gain = ctx.createGain();
    gain.gain.value = amp.reverse;
    mix.connect(verb).connect(gain).connect(output);
  }
  return { input, output, stop: () => running.forEach((osc) => osc.stop()) };
}

// ---------- an instrument's own chain: its body, its rig, its speaker ----------
//
// what an instrument's sound goes through that's the same for every note, so it's built once per
// layer (in the layer's channel, wireRig) instead of once per note:
//   body     [[hz, db, q], ...]: the resonances of the instrument's body, which stay put whatever note
//            is played. a violin's wooden box rings at about 280 and 460 hz, a trumpet's bell lifts
//            about 1.2 khz, a guitar's air rings at about 100 hz. a synth's tone moves with the note
//            and a real instrument's doesn't, and that was a lot of why the old ones sounded like
//            synths. it's also how you'd tell a violin from a viola playing the same note
//   amp      a guitar rig (ampChain)
//   rotary   a leslie speaker, its horn spinning this many times a second: the pitch wobbles as the
//            horn swings towards you and away, and the sound swirls round the room. the drum under
//            it spins a little slower, so the two never line up (hammond organ)
// returns { input, output, stop() }, or null for an instrument with none of them
function instrumentChain(ctx, inst) {
  if (!inst || !(inst.body || inst.amp || inst.rotary)) return null;
  const input = ctx.createGain();
  const running = [];
  let at = input;
  for (const [hz, db, q] of inst.body || []) {
    const peak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: hz, Q: q, gain: db });
    at.connect(peak);
    at = peak;
  }
  if (inst.amp) {
    const rig = ampChain(ctx, inst.amp);
    at.connect(rig.input);
    at = rig.output;
    running.push(rig);
  }
  let output = at;
  if (inst.rotary) {
    output = ctx.createGain();
    for (const [speed, side] of [[1, 1], [0.83, -1]]) {
      const delay = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.004 });
      const pan = ctx.createStereoPanner();
      const level = new GainNode(ctx, { gain: 0.55 });
      const spin = new OscillatorNode(ctx, { frequency: inst.rotary * speed });
      for (const [param, depth] of [[delay.delayTime, 0.0007], [pan.pan, 0.7 * side], [level.gain, 0.12]]) spin.connect(new GainNode(ctx, { gain: depth })).connect(param);
      spin.start(ctx.currentTime);
      running.push(spin);
      at.connect(delay).connect(level).connect(pan).connect(output);
    }
  }
  return { input, output, stop: () => running.forEach((one) => one.stop()) };
}

// ---------- the room ----------

// a room's echo, made up: noise dying away over a second or so to several seconds, getting darker as
// it goes, like a real room where the walls soak up the high end first. the convolver normalises it,
// so a big room isn't louder than a small one
function impulse(ctx, size, tone) {
  const rate = ctx.sampleRate;
  const seconds = 0.6 + size * 6;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const gap = Math.floor(rate * (0.005 + size * 0.03));
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = gap; i < length; i++) {
      const fade = Math.exp((-6.9 * (i - gap)) / (length - gap));
      low += (Math.random() * 2 - 1 - low) * (0.06 + tone * 0.85 * (1 - (i / length) * 0.8));
      data[i] = low * fade;
    }
    // early reflections: the first few bounces off the nearest walls, heard as separate taps before
    // the wash. different on each side, so the room is wide. a wash of noise on its own is the sound
    // of a cheap reverb, a room with no walls
    // together they carry about a fifth of the energy of the wash's first 80 ms, and each is smeared
    // over a few samples, so it's a soft knock rather than a click
    let early = 0;
    for (let i = gap; i < Math.min(length, gap + rate * 0.08); i++) early += data[i] * data[i];
    const level = Math.sqrt((early * 0.35) / 7 / 4);
    for (let k = 0; k < 7; k++) {
      const at = gap + Math.floor(rate * (0.004 + Math.random() * (0.01 + size * 0.05)));
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 12 && at + j < length; j++) data[at + j] += sign * level * (1 - k * 0.08) * Math.exp(-j / 3);
    }
  }
  return buffer;
}

// soft clipping (tanh) for drive. divided down as it gets stronger, so it adds grit without getting
// much louder
function driveCurve(amount) {
  const k = 1 + amount * 4;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * ((i / 1023) * 2 - 1)) / (0.6 * k + 0.4);
  return curve;
}

// ---------- the mixing desk ----------
//
// the band used to meet in one pile: every part as bright as it was made, all of them dry apart from
// one big reverb, through a fast compressor that flattened every hit. each part could sound fine on its
// own and still not sound like one band playing together, which is a lot of what made songs sound like
// midi rather than a record. a mixing engineer's first jobs fix exactly that, so the desk does them:
//   - one room for everyone (roomImpulse, PLACES.room): a short, small room, mostly its early
//     reflections, that every part (the drums too) is sent to a little. it's what makes recordings made
//     in different places, and synths made in none, sound like they were played in the same place. the
//     big reverb is still there on top, for distance
//   - every part has a place (PLACES): the tune gets a little presence (2.5 khz, where the ear is
//     keenest) and the parts behind it give that range up, and the air on top, so they sit back and the
//     tune stands in front of them without being turned up. far away things lose their top end
//   - the reverb and echo lose their low end on the way back (a high pass on their returns): a bass
//     note's boom ringing round the room for three seconds was mud under every chord
//   - glue: a gentle compressor that lets each hit's start through (a slow attack) and rides the band
//     together, rather than a fast one squashing every drum hit flat
//   - tape: a soft saturation on the whole mix, lopsided like a tape machine's, which rounds the peaks
//     and adds the even harmonics that make a mix sound warm. too little to hear as distortion
//   - a limiter last, so a loud chorus with every part in can't clip the speakers
// what each part gets, by role: presence and air in db, and how much of it goes to the room
const PLACES = {
  melody: { presence: 1.5, air: 1, room: 0.2 },
  counter: { presence: -1, air: 0, room: 0.22 },
  arp: { presence: -2, air: -1, room: 0.25 },
  bells: { presence: -1.5, air: 0, room: 0.25 },
  keys: { presence: -2, air: -1, room: 0.25 },
  guitar: { presence: -1, air: -1, room: 0.2 },
  pad: { presence: -3, air: -2, room: 0.25 },
  drone: { presence: -3, air: -2, room: 0.25 },
  bass: { presence: 0, air: -2, room: 0.05 },
  drums: { presence: 0, air: 0, room: 0.3 },
  texture: { presence: -2, air: -1, room: 0.1 },
};

// the room everyone shares: a small one with hard walls, a cluster of early reflections in the first
// 40 ms (each side's different, so it's wide) and a short tail that's gone in about half a second,
// darker as it dies. kept per context: it never changes
const roomImpulses = new WeakMap();
function roomImpulse(ctx) {
  if (!roomImpulses.has(ctx)) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 0.6);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < length; i++) {
        low += (Math.random() * 2 - 1 - low) * (0.5 - (0.35 * i) / length);
        data[i] = low * Math.exp((-6.9 * i) / length) * 0.3;
      }
      for (let k = 0; k < 14; k++) {
        const at = Math.floor(rate * (0.003 + Math.random() * 0.04));
        const level = (Math.random() < 0.5 ? -1 : 1) * Math.exp(-at / (rate * 0.03));
        for (let j = 0; j < 16 && at + j < length; j++) data[at + j] += level * Math.exp(-j / 4);
      }
    }
    roomImpulses.set(ctx, buffer);
  }
  return roomImpulses.get(ctx);
}

// tape saturation's curve: tanh, pushed a little off centre so the two halves of the wave clip
// differently (even harmonics, a tape machine's warmth), and scaled so quiet sound passes at the same
// level: only the peaks are rounded. a peak at half scale comes out about 1 db lower
function tapeCurve() {
  const k = 1.1;
  const bias = 0.1;
  const slope = k * (1 - Math.tanh(k * bias) ** 2);
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = (Math.tanh(k * ((i / 2047) * 2 - 1 + bias)) - Math.tanh(k * bias)) / slope;
  return curve;
}

function buildGraph(ctx) {
  const g = { ctx };
  g.bus = ctx.createGain();
  g.drive = ctx.createWaveShaper();
  g.drive.oversample = '2x';
  g.warmth = ctx.createBiquadFilter();
  g.warmth.Q.value = 0.5;
  // tape wobble: everything goes through a tiny delay whose length wavers, which bends the pitch
  // like a stretched cassette. a slow wow and a faster flutter
  g.wobble = ctx.createDelay(0.1);
  g.wobble.delayTime.value = 0.015;
  g.wow = lfo(ctx, 0.5, 0, g.wobble.delayTime, 0, 1e6);
  g.flutter = lfo(ctx, 6.5, 0, g.wobble.delayTime, 0, 1e6);
  // glue (see the mixing desk above). its attack is slow enough to let a drum's hit through before it
  // turns down, so the beat keeps its punch, and its ratio is low, so it rides the band rather than
  // pumping it: the old one (3 to 1, 5 ms) flattened every hit and pumped on every kick
  g.comp = new DynamicsCompressorNode(ctx, { threshold: -24, knee: 10, ratio: 2, attack: 0.03, release: 0.25 });
  // a little of the boxy low mids out of the whole mix, where every part's body piles up
  const mud = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 300, Q: 0.8, gain: -1.5 });
  const tape = new WaveShaperNode(ctx, { curve: tapeCurve(), oversample: '2x' });
  g.master = ctx.createGain();
  // the limiter: hard and fast, only there to catch peaks
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  g.bus.connect(g.drive).connect(g.warmth).connect(g.wobble).connect(g.comp).connect(mud).connect(tape).connect(g.master).connect(limiter).connect(ctx.destination);
  g.reverbIn = ctx.createGain();
  g.reverb = ctx.createConvolver();
  g.reverbIn.connect(g.reverb).connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 200, Q: 0.5 })).connect(g.bus);
  // the room every part shares, its boom and its fizz taken off
  g.roomIn = ctx.createGain();
  g.roomIn.connect(new ConvolverNode(ctx, { buffer: roomImpulse(ctx) })).connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 180, Q: 0.5 }))
    .connect(new BiquadFilterNode(ctx, { frequency: 8000, Q: 0.5 })).connect(g.bus);
  // the echo bounces left and right (ping pong), losing some top end each time, and its low end on
  // the way back to the band
  const echoOut = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 250, Q: 0.5 });
  echoOut.connect(g.bus);
  g.echoIn = ctx.createGain();
  g.echoLeft = ctx.createDelay(4);
  g.echoRight = ctx.createDelay(4);
  g.feedLeft = ctx.createGain();
  g.feedRight = ctx.createGain();
  const damp = ctx.createBiquadFilter();
  damp.frequency.value = 3200;
  const left = ctx.createStereoPanner();
  left.pan.value = -0.7;
  const right = ctx.createStereoPanner();
  right.pan.value = 0.7;
  g.echoIn.connect(g.echoLeft);
  g.echoLeft.connect(left).connect(echoOut);
  g.echoLeft.connect(damp).connect(g.feedLeft).connect(g.echoRight);
  g.echoRight.connect(right).connect(echoOut);
  g.echoRight.connect(g.feedRight).connect(g.echoLeft);
  return g;
}

// puts a song's fx (music.js FX_DEFAULTS) onto the graph. changes glide, so dragging a slider while it
// plays doesn't click
function applySpace(g, fx, tempo) {
  const now = g.ctx.currentTime;
  const set = (param, value) => {
    if (g.ready) param.setTargetAtTime(value, now, 0.03);
    else param.setValueAtTime(value, now);
  };
  const room = `${fx.size.toFixed(2)}|${fx.tone.toFixed(2)}`;
  if (g.room !== room) {
    g.room = room;
    g.reverb.buffer = impulse(g.ctx, fx.size, fx.tone);
  }
  if (g.driven !== fx.drive) {
    g.driven = fx.drive;
    g.drive.curve = fx.drive > 0.01 ? driveCurve(fx.drive) : null;
  }
  set(g.reverbIn.gain, fx.reverb * 1.2);
  set(g.echoIn.gain, fx.echo);
  const seconds = Math.min(3.9, (fx.echoTime * 60) / tempo);
  set(g.echoLeft.delayTime, seconds);
  set(g.echoRight.delayTime, seconds);
  set(g.feedLeft.gain, fx.echoRepeats * 0.85);
  set(g.feedRight.gain, fx.echoRepeats * 0.85);
  // warmth 0 leaves it open (about 19 khz), 1 closes it right down to 700 hz
  set(g.warmth.frequency, 700 * 2 ** ((1 - fx.warmth) * 4.8));
  set(g.wow.gain, fx.wobble * 0.004);
  set(g.flutter.gain, fx.wobble * 0.0003);
  // (1.1: the glue and the room made songs about 2 db louder than the old desk, so this was 1.3)
  set(g.master.gain, fx.volume ** 2 * 1.1);
  g.ready = true;
}

// a layer's channel: notes go into input, then through its instrument's own chain if it has one (its
// body, rig or speaker: instrumentChain, plugged in by setChannel), its low cut and its place in the mix
// (presence and air, PLACES), then volume, pan, and how much goes to the room, the reverb and the echo.
// the rig comes before the volume, so turning a guitar down doesn't drive its amp any less
function makeChannel(g) {
  const { ctx } = g;
  const channel = {
    ctx, input: ctx.createGain(), cut: new BiquadFilterNode(ctx, { type: 'highpass', frequency: 20, Q: 0.6 }),
    presence: new BiquadFilterNode(ctx, { type: 'peaking', frequency: 2500, Q: 0.8 }), air: new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 8000 }),
    volume: ctx.createGain(), pan: ctx.createStereoPanner(), room: ctx.createGain(), reverb: ctx.createGain(), echo: ctx.createGain(),
  };
  channel.cut.connect(channel.presence).connect(channel.air).connect(channel.volume);
  channel.volume.connect(channel.pan);
  channel.pan.connect(g.bus);
  channel.pan.connect(channel.room).connect(g.roomIn);
  channel.pan.connect(channel.reverb).connect(g.reverbIn);
  channel.pan.connect(channel.echo).connect(g.echoIn);
  return channel;
}
// plugs the layer's instrument's chain in (or none), when the instrument's changed. a recording
// has its own body in it, so it gets the chain without one once it's loaded (recorded())
function wireRig(channel, instrument, recording) {
  const inst = INSTRUMENTS[instrument];
  const played = (inst?.body && recorded(inst, undefined, recording)) || inst;
  const key = played === inst ? instrument : `${instrument} ${played.samples}`;
  if (channel.rigFor === key) return;
  channel.rigFor = key;
  channel.input.disconnect();
  channel.rig?.output.disconnect();
  channel.rig?.stop();
  channel.rig = instrumentChain(channel.ctx, played);
  if (channel.rig) {
    channel.input.connect(channel.rig.input);
    channel.rig.output.connect(channel.cut);
  } else channel.input.connect(channel.cut);
}
// making room in the mix: every part but the bass and drums has its lowest frequencies cut (a high
// pass), in hz, the first thing a mixing engineer does. a pad's or a piano's low end isn't heard as
// such, it's heard as mud under the bass, and with five or six parts all adding a little it was a lot
// of why a full band sounded crowded and boomy. the cut follows the layer's octave, and it's gentler in
// a song with no bass or drone, where something has to fill the bottom
const CUTS = { melody: 130, counter: 120, arp: 160, bells: 240, keys: 100, guitar: 75, pad: 110, drone: 20, bass: 20, drums: 20, texture: 60 };
const cutFor = (song, layer) => {
  const low = song.layers.some((one) => (one.role === 'bass' || one.role === 'drone') && !one.mute);
  const hz = (CUTS[layer.role] ?? 20) * 2 ** (layer.octave || 0);
  return Math.max(20, low ? hz : Math.min(hz, 50));
};
const audible = (song, layer) => (song.layers.some((other) => other.solo) ? layer.solo : !layer.mute);
function setChannel(channel, song, layer, now, glide) {
  wireRig(channel, layer.instrument, layer.recording);
  const set = (param, value) => (glide ? param.setTargetAtTime(value, now, 0.02) : param.setValueAtTime(value, now));
  set(channel.cut.frequency, cutFor(song, layer));
  const place = PLACES[layer.role] || PLACES.keys;
  set(channel.presence.gain, place.presence);
  set(channel.air.gain, place.air);
  set(channel.room.gain, place.room);
  set(channel.volume.gain, audible(song, layer) ? layer.volume ** 2 * 1.6 : 0);
  set(channel.pan.pan, layer.pan);
  set(channel.reverb.gain, layer.reverb);
  set(channel.echo.gain, layer.echo);
}
// a channel finished with: silent, and its rig's oscillators stopped
function closeChannel(channel, now) {
  // (a held audition is closed when its key's let go, and again by its own timer)
  if (channel.closed) return;
  channel.closed = true;
  channel.volume.gain.setTargetAtTime(0, now, 0.02);
  setTimeout(() => {
    channel.input.disconnect();
    channel.rig?.stop();
  }, 300);
}

// ---------- playing ----------

// plays a song live. load() swaps in a new song or new notes while it plays: notes already sent to
// the browser (the next third of a second) finish as they were, and everything after is the new
// version, so you can change anything mid song. times are beats counted from when play() started,
// including every time round the loop (loopOffset is where the current time round began)
class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.loop = true;
    // a click on every beat while it plays, for playing along (never in a wav)
    this.metronome = false;
    this.channels = {};
  }

  wake() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.graph = buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.song) applySpace(this.graph, this.song.fx, this.song.tempo);
  }

  beatAt(time) { return this.anchorBeat + (time - this.anchorTime) / this.secondsPerBeat; }
  timeAt(beat) { return this.anchorTime + (beat - this.anchorBeat) * this.secondsPerBeat; }

  // where the song is now, in beats from its start
  position() {
    if (!this.playing) return null;
    let beat = this.beatAt(this.ctx.currentTime) - this.loopOffset;
    // loopOffset moves on when the next time round starts being scheduled, a moment early
    if (beat < 0) beat += this.comp.beats;
    return Math.max(0, beat);
  }

  load(song, comp) {
    const secondsPerBeat = 60 / song.tempo;
    if (this.playing && secondsPerBeat !== this.secondsPerBeat) {
      // a new tempo carries on from where it is now
      this.anchorBeat = this.beatAt(this.ctx.currentTime);
      this.anchorTime = this.ctx.currentTime;
    }
    this.song = song;
    this.comp = comp;
    findRestrikes(comp.notes);
    this.secondsPerBeat = secondsPerBeat;
    if (this.ctx) applySpace(this.graph, song.fx, song.tempo);
    this.fetchRecordings();
    if (!this.playing) return;
    this.mix();
    // a shorter song that's now behind the playhead starts again from the top
    if (this.scheduledTo - this.loopOffset > comp.beats) this.loopOffset = this.scheduledTo;
    this.index = this.firstFrom(this.scheduledTo - this.loopOffset);
  }

  // starts loading the song's recordings. its synthesised instruments play until they're in, then
  // the channels are rewired for them (a recording's rig has no body, wireRig)
  fetchRecordings() {
    const song = this.song;
    songSamples(song).then(() => { if (this.song === song) this.mix(); });
  }

  // volume, pan, mute and solo, without touching the notes
  mix() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    for (const layer of this.song.layers) {
      if (!this.channels[layer.id]) this.channels[layer.id] = makeChannel(this.graph);
      setChannel(this.channels[layer.id], this.song, layer, now, true);
    }
  }

  firstFrom(beat) {
    const { notes } = this.comp;
    let low = 0;
    let high = notes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (notes[middle].t < beat - 1e-9) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  play(from = 0) {
    this.wake();
    this.stop();
    this.playing = true;
    this.anchorTime = this.ctx.currentTime + 0.06;
    this.anchorBeat = from;
    this.loopOffset = 0;
    this.scheduledTo = from;
    this.channels = {};
    this.mix();
    this.index = this.firstFrom(from);
    // anything already sounding at the start (a pad held over it) plays its remaining part
    for (const note of this.comp.notes) {
      if (note.t < from && note.t + note.dur > from + 0.1) this.send({ ...note, dur: note.t + note.dur - from }, this.anchorTime);
    }
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  // a different song while it plays: the old one fades out on its own graph, taking its notes and its
  // reverb and echo tails with it, and the new one starts where the playhead is, with anything held
  // over the playhead (a pad, a drone) sounding straight away rather than from its next note
  restart() {
    if (!this.playing) return;
    const at = this.position();
    const old = this.graph;
    old.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    setTimeout(() => {
      old.master.disconnect();
      old.wow.osc.stop();
      old.flutter.osc.stop();
    }, 400);
    this.graph = buildGraph(this.ctx);
    this.play(at < this.comp.beats ? at : 0);
  }

  send(note, when) {
    const layer = this.song.layers.find((one) => one.id === note.layer);
    if (layer) playNote(this.ctx, this.channels[note.layer], layer, note, Math.max(when, this.ctx.currentTime), this.secondsPerBeat);
  }

  // every 25 ms: send the browser every note due in the next 0.3 seconds. it plays them on its own
  // clock, so the timing is exact even when this timer runs late
  tick() {
    if (!this.playing) return;
    const ahead = this.beatAt(this.ctx.currentTime + 0.3);
    const { notes } = this.comp;
    while (this.scheduledTo < ahead) {
      const songEnd = this.loopOffset + this.comp.beats;
      const until = Math.min(ahead, songEnd);
      while (this.index < notes.length && notes[this.index].t + this.loopOffset < until) {
        const note = notes[this.index++];
        this.send(note, this.timeAt(note.t + this.loopOffset));
      }
      if (this.metronome) {
        for (let beat = Math.ceil(this.scheduledTo - this.loopOffset - 1e-9); beat < until - this.loopOffset - 1e-9; beat++) this.click(this.timeAt(beat + this.loopOffset), beat % this.comp.bpb === 0);
      }
      this.scheduledTo = until;
      if (until < songEnd || !this.loop) break;
      this.loopOffset = songEnd;
      this.index = 0;
    }
    // not looping: stop once the end's been reached, leaving the last notes to ring out
    if (!this.loop && this.beatAt(this.ctx.currentTime) - this.loopOffset >= this.comp.beats) this.stop(false);
  }

  // the metronome's tick: a short high blip, higher on the first beat of a bar. straight out, past the
  // room and the tape, so it's dry and on time
  click(when, first) {
    const { ctx } = this;
    const blip = new OscillatorNode(ctx, { frequency: first ? 1760 : 1320 });
    const level = new GainNode(ctx, { gain: 0 });
    level.gain.setValueAtTime(0, when);
    level.gain.linearRampToValueAtTime(first ? 0.25 : 0.15, when + 0.002);
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    blip.connect(level).connect(ctx.destination);
    blip.start(when);
    blip.stop(when + 0.06);
  }

  // plays some notes on a layer's instrument straight away, for hearing a chord or a note while
  // editing. it has its own channel, so it plays even if the layer's muted. extra goes on every note
  // (a slide's bend, a shake), so a slide drawn in the note editor is heard as it'll play. it hands
  // back the channel, so a note held on the keyboard can be let go of early (closeChannel)
  audition(song, layer, midis, beats = 1.5, extra = {}) {
    this.wake();
    // the first try of a new instrument may be its synthesised self, while its recordings load
    if (RECORDINGS.on) sampleFolders(INSTRUMENTS[layer.instrument], layer.recording).forEach(loadSamples);
    const channel = makeChannel(this.graph);
    setChannel(channel, song, { ...layer, mute: false, solo: true }, this.ctx.currentTime, false);
    for (const midi of midis) playNote(this.ctx, channel, layer, { midi, dur: beats, vel: 0.75, ...extra }, this.ctx.currentTime + 0.02, 60 / song.tempo);
    setTimeout(() => closeChannel(channel, this.ctx.currentTime), (beats * 60 / song.tempo + 4) * 1000);
    return channel;
  }

  // cut: fade everything out now. otherwise notes already sent play out, and the channels close once
  // they've rung away
  stop(cut = true) {
    clearInterval(this.timer);
    if (this.playing) {
      const channels = Object.values(this.channels);
      const close = () => channels.forEach((channel) => closeChannel(channel, this.ctx.currentTime));
      if (cut) close();
      else setTimeout(close, 8000);
    }
    this.playing = false;
  }
}

// ---------- wav files ----------

// renders a whole song offline, faster than real time. loop: for a game's background music, so the
// end runs straight into the start: the reverb and notes still ringing past the end are folded back
// onto the beginning, so it loops with no gap or click
async function renderSong(song, comp, loop) {
  // a render can't swap to a recording halfway through, so it waits for them all first
  await songSamples(song);
  const rate = 44100;
  const secondsPerBeat = 60 / song.tempo;
  const length = comp.beats * secondsPerBeat;
  const tail = 7;
  const ctx = new OfflineAudioContext(2, Math.ceil((length + tail) * rate), rate);
  const graph = buildGraph(ctx);
  applySpace(graph, song.fx, song.tempo);
  const channels = {};
  const layers = {};
  for (const layer of song.layers) {
    channels[layer.id] = makeChannel(graph);
    setChannel(channels[layer.id], song, layer, 0, false);
    layers[layer.id] = layer;
  }
  findRestrikes(comp.notes);
  for (const note of comp.notes) playNote(ctx, channels[note.layer], layers[note.layer], note, note.t * secondsPerBeat, secondsPerBeat);
  const buffer = await ctx.startRendering();
  const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let frames = buffer.length;
  if (loop) {
    frames = Math.round(length * rate);
    for (const samples of data) for (let i = frames; i < samples.length; i++) samples[i % frames] += samples[i];
  } else {
    // trim the silence after the last echo dies away
    while (frames > rate && Math.abs(data[0][frames - 1]) < 1e-4 && Math.abs(data[1][frames - 1]) < 1e-4) frames--;
  }
  return wavFile(data, frames, rate);
}

// 16 bit stereo wav. turned down if anything would clip
function wavFile(channels, frames, rate) {
  let peak = 0;
  for (const samples of channels) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  const view = new DataView(new ArrayBuffer(44 + frames * 4));
  const text = (at, string) => { for (let i = 0; i < string.length; i++) view.setUint8(at + i, string.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0, at = 44; i < frames; i++) {
    for (const samples of channels) {
      view.setInt16(at, Math.max(-1, Math.min(1, samples[i] * scale)) * 32767, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
