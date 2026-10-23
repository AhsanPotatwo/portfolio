// ================================== squimble music maker: the composer ==================================
//
// writes the music: plain maths and objects, no page and no audio, so node can run it (tests/) and
// squimble quest can load it as it is. synth.js plays it (and holds INSTRUMENTS, which the band is
// picked from), maker.js is the page.
//
// ---------- how a song works ----------
//
// a song is plain settings, the json that's saved and shared (cleanSong() has every key):
//   mood, mods, style   what it's written as (MOODS, MODIFIERS, STYLES). mods: words like calm or fast
//              that change how the mood plays, only there when it has some
//   flavour    which kind of the mood it is (FLAVOURS), only there when it isn't the plain mood
//   seed       a word or two every random choice comes from, so the same settings give the same notes
//   key, scale, tempo, meter, swing, humanise, colour (how rich the chords are), chordBars
//   parts      chords for parts A, B and C as roman numerals ("i bVI bIII bVII"), so they work in any key
//   layers     the band: each has a role (pad, bass, melody...), an instrument, a pattern (how the role
//              plays), its own seed (and partSeeds, for a part given new notes), its mix, and notes
//              changed by hand (edits). hand: plays only those
//   own        a track made by hand (blankSong()) rather than written from the seed
//   composer   the composer that made it (COMPOSER_VERSIONS), when it isn't the first
//   sections   the song from start to end: which part's chords, how many bars, which layers play
//   fx         the room it's played in (reverb, echo, tape wobble...)
//
// generateSong(mood, style, seed, mods, flavour) makes a song, composeSong(song) turns any song into
// notes, rerollSong() remixes by running one pick again with a fresh seed, and blankSong() is an empty
// track to fill by hand. songMood() is the mood with its flavour, modifiers and style worked in.
//
// ---------- the music theory ----------
//
// no ai, just the rules of thumb composers use:
//   - scales and modes (SCALES). chords stack every other scale note, so a dorian song gets dorian chords
//   - progressions: ones that suit each mood, a markov chain of which chord leads where (CHORD_MOVES),
//     two chord vamps, and roots wandering by odd intervals for horror
//   - voice leading: each chord's notes move as little as they can from the last's (voiceChord)
//   - melodies grow from one motif: repeated, sequenced, answered in question and answer phrases and
//     brought back changed in other parts, on chord notes on strong beats ("melodies", tune())
//   - one groove for the band: drum charts written by hand, the bass and stabs on the same rhythm (GROOVES)
//   - eno's tape loops: bells on loops of different lengths, drifting in and out of line ("phasing")
//   - swing, humanising and dynamics: quiet sections softer, a swell into a louder one (feel)
//   - counterpoint: a second melody in thirds and sixths, moving when the tune holds (counterpoint())
//   - ornaments: slides, bends, graces, falls and shakes, per instrument (ornament())
//   - orchestration: the tune handed round the band and doubled at its biggest (pickOrchestra, passTune)
//   - a bass that's a hook: a riff of its own on the drums' rhythm (bassHook)
//
// ---------- a band that fits ----------
//
// parts can sound fine alone and wrong together, so a lot of this file is rules for what goes with
// what: one groove (GROOVES), harshness caps (maxEdge), no two layers on one instrument, no arp with a
// counter melody (fitBand), layers that stay in once in (pickArrangement), melodies without holes, and a
// band that listens once it's written (listen): the tune on top and nothing rubbing against it.
// README.md lists every rule with what sounded wrong before it. read it before changing one.
//
// ---------- times ----------
//
// every time is in beats from the song's start, so the tempo never changes the notes. synth.js turns
// beats into seconds.

// ---------- random numbers ----------

// a string to a 32 bit number (fnv-1a), so any words can be a seed
function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// a seeded random number maker (mulberry32). the parts are joined into its seed, so
// makeRng(song.seed, layer.seed, 'A') is the same numbers every time
function makeRng(...parts) {
  let state = hashText(parts.join('|'));
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low, high) => low + next() * (high - low),
    int: (low, high) => low + Math.floor(next() * (high - low + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    // { thing: weight } or [[thing, weight]]. object keys come back as strings
    weighted(options) {
      const entries = Array.isArray(options) ? options : Object.entries(options);
      let roll = next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [thing, weight] of entries) if ((roll -= weight) < 0) return thing;
      return entries[entries.length - 1][0];
    },
  };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const mod12 = (n) => ((n % 12) + 12) % 12;
const clone = (thing) => JSON.parse(JSON.stringify(thing));

// seeds are two words, which also name the song. squimble quest is a child's dream, so the words come
// from every world it could wander into, a row each: about 680 first words and 780 second, over half a
// million seeds. a new word never changes an old seed's song: the seed is the words, hashed
const SEED_WORDS = [
  [
    'mossy', 'amber', 'quiet', 'hollow', 'silver', 'drowsy', 'copper', 'misty', 'wandering', 'paper',
    'velvet', 'frozen', 'sunken', 'golden', 'little', 'crooked', 'distant', 'gentle', 'rusty', 'hidden',
    'lonely', 'starlit', 'smoky', 'tiny', 'ancient', 'sleepy', 'restless', 'pale', 'stormy', 'woolly',
    'dreamy', 'snoozy', 'yawning', 'sleepwalking', 'fuzzy', 'twinkly', 'whispering', 'upside', 'giggling', // dreams
    'neon', 'chrome', 'laser', 'turbo', 'quantum', 'atomic', 'glitchy', 'robotic', 'hologram', 'bleeping', // the future
    'dusty', 'rootin', 'outlaw', 'tumbleweed', 'rattlesnake', 'bandit', 'rodeo', 'galloping', 'sheriff', // wild west
    'shambling', 'undead', 'mouldy', 'groaning', 'creaky', 'haunted', 'spooky', 'ghostly', 'skeletal', // zombies and ghosts
    'ferny', 'leafy', 'twiggy', 'brambly', 'toadstool', 'acorny', 'barky', 'dewy', // the forest
    'scrappy', 'scorched', 'wrecked', 'salvaged', 'glowing', 'junkyard', 'radioactive', 'busted', // the wasteland
    'snowy', 'frosty', 'blizzard', 'shivering', 'chilly', 'glacial', 'icicle', 'mittened', // snowland
    'molten', 'sizzling', 'fiery', 'smouldering', 'blazing', 'volcanic', 'cinder', 'erupting', 'burpy', // lava and volcanoes
    'sandy', 'sunbaked', 'parched', 'mirage', 'scorpion', 'pharaoh', 'shimmering', 'dune', // the desert
    'salty', 'barnacle', 'scurvy', 'swashbuckling', 'cursed', 'jolly', 'briny', 'peglegged', 'plundered', // pirates
    'bubbly', 'coral', 'soggy', 'drippy', 'abyssal', 'snorkelling', 'glowfish', // under the sea
    'cosmic', 'lunar', 'starry', 'orbiting', 'galactic', 'alien', 'nebula', 'zerogravity', // outer space
    'sugary', 'gumdrop', 'fizzy', 'sticky', 'lollipop', 'candied', 'frosted', 'jammy', 'sprinkled', // candy land
    'prehistoric', 'stompy', 'jurassic', 'fossil', 'roaring', 'primordial', // dinosaurs
    'clockwork', 'brass', 'ticking', 'steamy', 'cogwork', 'whirring', // clockwork and steam
    'cloudy', 'floating', 'windy', 'feathery', 'rainbow', 'drifting', // the sky
    'tin', 'windup', 'patchwork', 'rubber', 'button', 'stitched', 'squeaky', // the toybox
    'royal', 'enchanted', 'knightly', 'noble', 'jousting', 'wizardly', 'moonlit', // castles and magic
    'wonky', 'stripy', 'juggling', 'tumbling', 'bonkers', 'loopy', // the circus
    'sneaky', 'shadowy', 'silent', 'bamboo', 'paperlantern', // ninjas
    'squishy', 'gloopy', 'zany', 'kooky', 'wibbly', 'wobbly', 'peculiar', 'grumpy', 'cheeky', 'dizzy', // just silly
    'jiggly', 'hiccuping', 'sneezing', 'ticklish', 'bumbling', 'rumbling', 'tumbledown', 'higgledy', 'noodly', 'wiggly',
    // the second wave of words: more for every world, and new ones
    'dozy', 'hushed', 'slumbering', 'cuddly', 'murmuring', 'dreaming', 'faraway', 'wishful', 'swaying',
    'lulling', 'nestled', 'tucked', 'weightless', 'glimmering', 'sparkly', 'shimmery', 'dappled', 'moony',
    'pillowy', 'nodding', 'snoring', 'snuggly', 'fluffy', 'cosy', // dreams
    'cyber', 'digital', 'pixel', 'sonic', 'magnetic', 'electric', 'plasma', 'bionic', 'hyper', 'synthetic',
    'binary', 'gleaming', 'humming', 'beeping', 'buzzing', 'zapping', 'automatic', 'flickering', 'wireless',
    'supersonic', // the future
    'lonesome', 'saddled', 'spurred', 'whiskered', 'trailworn', 'stampeding', 'wrangling', 'moseying',
    'bowlegged', 'sunburnt', 'grizzled', 'wanted', 'howling', 'yeehaw', // wild west
    'creepy', 'eerie', 'phantom', 'cobwebbed', 'shrieking', 'moaning', 'batty', 'wailing', 'clammy',
    'shivery', 'spectral', 'bony', 'rattling', 'midnight', 'foggy', 'witchy', // zombies and ghosts
    'woodsy', 'piney', 'rooty', 'nutty', 'shady', 'buzzy', 'hooting', 'squirrelly', 'berry', 'thorny',
    'tangled', 'whistling', 'sappy', 'grassy', 'muddy', 'chirping', 'hopping', 'burrowing', // the forest
    'dented', 'grimy', 'smudged', 'rickety', 'patched', 'crusty', 'oily', 'sooty', 'clanking', 'sputtering',
    'bent', 'creaking', 'abandoned', 'forgotten', // the wasteland
    'icy', 'sparkling', 'powdery', 'wintry', 'flurrying', 'polar', 'arctic', 'snowbound', 'sledding',
    'skating', 'toasty', 'frostbitten', 'crunchy', // snowland
    'scalding', 'steaming', 'toasted', 'charred', 'ashen', 'sulphurous', 'bubbling', 'crackling', 'hot',
    'spicy', 'peppery', 'flaming', 'roasting', // lava and volcanoes
    'dusky', 'windswept', 'sweltering', 'thirsty', 'sandswept', 'arid', 'jewelled', 'nomadic', 'spiced',
    'tasselled', // the desert
    'eyepatched', 'hooked', 'seafaring', 'buccaneering', 'mutinous', 'shipshape', 'barnacled', 'tattered',
    'treasured', 'marooned', 'blustery', 'saltwater', // pirates
    'fishy', 'wavy', 'squiddy', 'pearly', 'tidal', 'kelpy', 'sunlit', 'shelly', 'splashy', 'gurgling',
    'deepsea', 'finny', 'oceanic', 'rippling', 'glistening', 'aquatic', 'turquoise', // under the sea
    'stellar', 'astral', 'meteoric', 'celestial', 'martian', 'rocketing', 'spacey', 'twinkling',
    'interstellar', 'eclipsed', 'cratered', 'beaming', // outer space
    'sweet', 'syrupy', 'chewy', 'minty', 'gooey', 'caramel', 'buttery', 'honeyed', 'crumbly', 'fudgy',
    'sherbet', 'bubblegum', 'creamy', 'swirly', 'peppermint', 'chocolatey', 'iced', 'glazed', 'zesty', // candy land
    'scaly', 'toothy', 'spiky', 'clawed', 'hatching', 'thundering', 'colossal', 'leathery', 'stomping',
    'feathered', 'ferocious', 'giant', 'mighty', // dinosaurs
    'brassy', 'oiled', 'puffing', 'tinkering', 'mechanical', 'riveted', 'chugging', 'cranking', 'springy',
    'polished', 'gilded', // clockwork and steam
    'airy', 'breezy', 'soaring', 'fluttering', 'gusty', 'sunny', 'hovering', 'lofty', 'skyward', 'swooping',
    'puffy', 'azure', 'thundery', // the sky
    'wooden', 'painted', 'plush', 'clicky', 'bouncy', 'twirling', 'spinning', 'stuffed', 'jigsaw',
    'clattering', 'knitted', 'beaded', // the toybox
    'magical', 'mystic', 'charmed', 'arcane', 'bewitched', 'spellbound', 'regal', 'gallant', 'valiant',
    'heraldic', 'crowned', 'shining', 'fabled', 'legendary', 'sorcerous', 'glittering', 'runic', 'courtly',
    'brave', 'bold', // castles and magic
    'acrobatic', 'dazzling', 'spangled', 'whirling', 'honking', 'flipping', 'balancing', 'trumpeting',
    'showy', 'grand', 'marvellous', 'amazing', 'stupendous', 'fantastic', // the circus
    'stealthy', 'swift', 'nimble', 'masked', 'crouching', 'leaping', 'shadowed', 'cherry', 'secret', // ninjas
    'ridiculous', 'goofy', 'daft', 'barmy', 'potty', 'wacky', 'silly', 'muddled', 'boingy', 'flappy',
    'floppy', 'gurgly', 'snorting', 'giddy', 'blobby', 'splodgy', 'squelchy', 'sploshy', 'tootling',
    'whiffy', 'parping', 'scrumptious', 'gigantic', 'teeny', 'humongous', 'itsy', 'chonky', 'sproingy',
    'wobbling', 'rumpled', 'bumpy', 'lumpy', 'grumbly', 'mumbly', 'snuffly', 'zoomy', 'zippy', 'merry',
    'perky', 'chirpy', 'sassy', 'plucky', 'spunky', 'bonny', // just silly
    'clucking', 'mooing', 'oinking', 'baaing', 'quacking', 'blooming', 'budding', 'rustic', 'harvested',
    'ploughed', 'sprouting', 'seedy', 'ripe', 'juicy', 'appley', // the farm
    'pebbly', 'seaside', 'paddling', 'crabby', 'beachy', 'shingly', 'breezeblown', // the seaside
    'lush', 'swinging', 'humid', 'chattering', 'tropical', 'emerald', 'tangly', 'jungly', 'prowling',
    'striped', 'spotted', 'slithering', // the jungle
    'rocky', 'craggy', 'alpine', 'towering', 'echoing', 'peaked', 'snowcapped', 'yodelling', // the mountains
    'bustling', 'rainy', 'rooftop', 'jazzy', 'busy', 'skyscraping', 'cobbled', 'urban', // the city
    'bookish', 'inky', 'dogeared', 'scribbled', 'curious', 'clever', 'studious', 'puzzling', 'riddling', // school
    'crispy', 'buttered', 'soupy', 'saucy', 'cheesy', 'baked', 'whisked', 'simmering', 'doughy', 'sugared', // the kitchen
    'drizzly', 'sunshiny', 'windblown', 'hailing', 'stormbound', // the weather
    'tuneful', 'melodic', 'whistled', 'drumming', 'strumming', 'singing', 'tinkling', 'chiming', 'jingling',
    'jangling', 'booming', 'thrumming', 'twanging', 'crooning', // music
    'scarlet', 'crimson', 'violet', 'indigo', 'teal', 'lilac', 'ruby', 'sapphire', 'ochre', 'cobalt',
    'magenta', 'lemon', 'peachy', 'plum', 'rosy', 'charcoal', 'ivory', 'opal', 'jade', 'tangerine',
    'cerulean', // colours
    'shy', 'happy', 'proud', 'hopeful', 'lucky', 'jumpy', 'cheerful', 'bashful', 'kindly', 'thoughtful',
    'gleeful', 'restful', 'mellow', 'peaceful', 'mischievous', 'fearless', // feelings
    'early', 'late', 'midsummer', 'wintertime', 'twilight', 'dawnlit', 'noonday', 'evening', 'yesteryear',
    'olden', 'autumnal', 'springtime', // times of day and year
  ],
  [
    'lantern', 'meadow', 'harbour', 'burrow', 'comet', 'orchard', 'tide', 'ember', 'willow', 'cavern',
    'chapel', 'garden', 'lighthouse', 'puddle', 'marsh', 'kettle', 'attic', 'glade', 'ridge', 'moth',
    'pond', 'shrine', 'tower', 'river', 'acorn', 'thicket', 'well', 'moon', 'hearth', 'squimble',
    'pillow', 'nightlight', 'blanketfort', 'slumber', 'lullaby', 'sandman', 'daydream', 'bedtime', 'pyjamas', // dreams
    'robot', 'spaceport', 'hoverboard', 'cyborg', 'android', 'mainframe', 'rocket', 'megacity', 'monorail', 'teleporter', // the future
    'saloon', 'cowpoke', 'canyon', 'stagecoach', 'ranch', 'mesa', 'gulch', 'corral', 'lasso', 'prospector', 'goldmine', // wild west
    'zombie', 'graveyard', 'crypt', 'ghoul', 'skeleton', 'bunker', 'tombstone', 'mummy', 'brains', 'werewolf', // zombies and ghosts
    'fern', 'bramble', 'badger', 'hedgehog', 'woodland', 'treehouse', 'mushroom', 'pinecone', 'owl', // the forest
    'scrapheap', 'wasteland', 'rustbucket', 'wreck', 'outpost', 'scavenger', 'jalopy', // the wasteland
    'igloo', 'glacier', 'snowman', 'yeti', 'penguin', 'tundra', 'avalanche', 'sleigh', 'mitten', 'snowglobe', // snowland
    'volcano', 'caldera', 'magma', 'crater', 'geyser', 'forge', 'salamander', 'furnace', 'lavalamp', // lava and volcanoes
    'oasis', 'pyramid', 'sphinx', 'cactus', 'camel', 'sandstorm', 'caravan', 'sarcophagus', // the desert
    'galleon', 'parrot', 'kraken', 'treasure', 'plank', 'cutlass', 'cove', 'shipwreck', 'doubloon', 'crowsnest', 'buccaneer', // pirates
    'reef', 'jellyfish', 'submarine', 'octopus', 'seahorse', 'abyss', 'atlantis', 'mermaid', 'lagoon', // under the sea
    'asteroid', 'galaxy', 'planet', 'ufo', 'moonbase', 'stardust', 'blackhole', 'spacesuit', // outer space
    'cupcake', 'gingerbread', 'jellybean', 'marshmallow', 'toffee', 'pudding', 'sundae', 'custard', 'gobstopper', // candy land
    'dinosaur', 'raptor', 'swamp', 'pterodactyl', 'triceratops', 'tarpit', 'egg', // dinosaurs
    'clocktower', 'cog', 'gizmo', 'zeppelin', 'airship', 'contraption', 'automaton', // clockwork and steam
    'cloud', 'kite', 'balloon', 'beanstalk', 'windmill', 'skyship', // the sky
    'toybox', 'teddy', 'marionette', 'puppet', 'nutcracker', 'yoyo', 'marble', 'dollhouse', // the toybox
    'castle', 'dragon', 'knight', 'wizard', 'goblin', 'troll', 'dungeon', 'drawbridge', 'unicorn', 'potion', 'cauldron', 'griffin', // castles and magic
    'circus', 'carousel', 'clown', 'juggler', 'trapeze', 'funfair', 'rollercoaster', // the circus
    'dojo', 'ninja', 'samurai', 'pagoda', 'shuriken', // ninjas
    'noodle', 'waffle', 'sock', 'spoon', 'pickle', 'whatsit', 'doohickey', 'kerfuffle', 'hullabaloo', 'shenanigans', // just silly
    'jamboree', 'thingamajig', 'gubbins', 'wobble', 'bonanza', 'rumpus',
    // the second wave of words: more for every world, and new ones
    'dream', 'nap', 'snooze', 'quilt', 'cushion', 'snore', 'yawn', 'teacup', 'moonbeam', 'stargazer',
    'nightcap', 'hammock', 'cradle', 'wish', 'storybook', 'bunkbed', 'slipper', 'sleepover', 'sheep', // dreams
    'gadget', 'circuit', 'satellite', 'drone', 'jetpack', 'microchip', 'neutron', 'pixel', 'reactor',
    'beacon', 'byte', 'hovercar', 'starship', 'portal', 'console', 'antenna', 'radar', 'cyberspace', 'servo', // the future
    'cowboy', 'cowgirl', 'sheriff', 'horseshoe', 'bandana', 'wagon', 'bronco', 'outlaw', 'spur', 'boot',
    'banjo', 'campfire', 'coyote', 'buffalo', 'frontier', 'homestead', 'trail', // wild west
    'ghost', 'phantom', 'spectre', 'banshee', 'poltergeist', 'cobweb', 'witch', 'pumpkin', 'bat', 'spider',
    'haunt', 'manor', 'coffin', 'gargoyle', 'vampire', 'broomstick', // zombies and ghosts
    'squirrel', 'fox', 'deer', 'rabbit', 'robin', 'woodpecker', 'log', 'stump', 'brook', 'clearing',
    'canopy', 'den', 'sapling', 'oak', 'birch', 'firefly', 'beetle', 'snail', 'frog', 'mole', 'otter',
    'beaver', 'bluebell', // the forest
    'tyre', 'barrel', 'bolt', 'gasket', 'scrapyard', 'shack', 'buggy', 'tincan', 'wrench', 'spanner',
    'pylon', 'canteen', // the wasteland
    'snowflake', 'polarbear', 'walrus', 'seal', 'husky', 'sledge', 'toboggan', 'snowball', 'icefloe',
    'iceberg', 'chalet', 'scarf', 'earmuffs', 'reindeer', 'mammoth', 'aurora', // snowland
    'obsidian', 'lava', 'ash', 'phoenix', 'brimstone', 'kiln', 'bonfire', 'torch', 'firework', // lava and volcanoes
    'scarab', 'bazaar', 'lamp', 'carpet', 'genie', 'tent', 'nomad', 'cobra', 'jackal', 'palm', 'sandcastle',
    'hourglass', 'compass', // the desert
    'anchor', 'cannon', 'map', 'spyglass', 'hook', 'deck', 'mast', 'sail', 'rigging', 'captain', 'skull',
    'chest', 'island', 'jollyroger', 'eyepatch', 'shanty', 'bounty', 'mutiny', 'gangplank', 'porthole', // pirates
    'whale', 'dolphin', 'starfish', 'clam', 'pearl', 'shell', 'crab', 'lobster', 'squid', 'urchin', 'kelp',
    'manatee', 'narwhal', 'turtle', 'pufferfish', 'anemone', 'diver', 'tidepool', 'current', 'wave', // under the sea
    'meteor', 'quasar', 'pulsar', 'astronaut', 'cosmonaut', 'rover', 'orbit', 'eclipse', 'supernova',
    'moonrock', 'constellation', 'telescope', 'jupiter', 'saturn', 'neptune', 'venus', 'mars', 'pluto', // outer space
    'lolly', 'bonbon', 'truffle', 'fudge', 'brownie', 'doughnut', 'pancake', 'muffin', 'biscuit', 'macaron',
    'licorice', 'candyfloss', 'sherbet', 'jelly', 'trifle', 'meringue', 'eclair', 'crumble', 'sprinkle',
    'icing', 'cookie', 'milkshake', // candy land
    'stegosaurus', 'brontosaurus', 'diplodocus', 'ankylosaurus', 'velociraptor', 'sabretooth', 'hatchling',
    'nest', 'bone', // dinosaurs
    'gear', 'spring', 'pendulum', 'piston', 'boiler', 'valve', 'chimney', 'locomotive', 'workshop', 'clock',
    'cuckoo', 'sprocket', 'lever', 'inventor', 'tinker', 'goggles', // clockwork and steam
    'thunder', 'lightning', 'breeze', 'sunbeam', 'skylark', 'swallow', 'eagle', 'glider', 'parachute',
    'weathervane', 'cloudburst', 'horizon', 'sunrise', 'sunset', 'cumulus', 'kestrel', // the sky
    'rockinghorse', 'spinningtop', 'drum', 'blocks', 'kazoo', 'tricycle', 'scooter', 'trainset', 'dominoes',
    'jigsaw', 'ragdoll', 'tinsoldier', 'kaleidoscope', 'pinwheel', // the toybox
    'moat', 'turret', 'banner', 'crown', 'throne', 'sceptre', 'scroll', 'spellbook', 'wand', 'amulet',
    'jester', 'princess', 'prince', 'king', 'queen', 'squire', 'fairy', 'pixie', 'elf', 'dwarf', 'ogre',
    'sprite', 'gnome', 'pegasus', 'centaur', 'quest', 'tournament', 'catapult', 'battlement', 'feast', // castles and magic
    'acrobat', 'ringmaster', 'unicycle', 'tightrope', 'popcorn', 'bigtop', 'stilts', 'cannonball',
    'sideshow', 'lion', 'elephant', 'confetti', 'bumpercar', 'helterskelter', 'ferriswheel', // the circus
    'kimono', 'katana', 'bonsai', 'koi', 'tea', 'temple', 'sensei', 'cherryblossom', 'origami', 'sushi',
    'gong', // ninjas
    'banana', 'wellie', 'bobble', 'teapot', 'umbrella', 'sandwich', 'potato', 'turnip', 'sausage', 'crumpet',
    'giggle', 'hiccup', 'sneeze', 'burp', 'whoopsie', 'doodle', 'boing', 'bloop', 'flapjack', 'wiggle',
    'jiggle', 'squiggle', 'noggin', 'kerplunk', 'hoopla', 'malarkey', 'tomfoolery', 'nincompoop',
    'whatchamacallit', 'skedaddle', 'brouhaha', 'ballyhoo', 'codswallop', 'gobbledygook', 'hootenanny',
    'razzmatazz', 'whirligig', // just silly
    'barn', 'tractor', 'scarecrow', 'haystack', 'henhouse', 'pigsty', 'goat', 'cow', 'chicken', 'duckling',
    'lamb', 'piglet', 'pony', 'sunflower', 'carrot', 'beehive', 'greenhouse', 'allotment', 'wheelbarrow',
    'wateringcan', 'daisy', 'tulip', 'buttercup', // the farm
    'pier', 'bucket', 'spade', 'deckchair', 'seagull', 'rockpool', 'promenade', 'beachhut', 'icecream',
    'lido', 'surfboard', 'pebble', 'boardwalk', // the seaside
    'monkey', 'gorilla', 'tiger', 'jaguar', 'sloth', 'toucan', 'vine', 'waterfall', 'tarantula', 'chameleon',
    'anaconda', 'orchid', 'mango', 'coconut', // the jungle
    'summit', 'peak', 'cliff', 'valley', 'cave', 'boulder', 'yak', 'cablecar', 'cabin', // the mountains
    'skyscraper', 'subway', 'taxi', 'bus', 'rooftop', 'alley', 'streetlamp', 'cafe', 'bakery', 'bookshop',
    'fountain', 'statue', 'pigeon', 'tram', 'billboard', 'arcade', 'diner', 'jukebox', 'launderette', // the city
    'book', 'quill', 'inkpot', 'globe', 'chalkboard', 'satchel', 'pencil', 'crayon', 'notebook', 'library',
    'puzzle', 'riddle', 'atlas', 'encyclopedia', 'abacus', // school
    'saucepan', 'toaster', 'oven', 'spatula', 'whisk', 'ladle', 'colander', 'stew', 'soup', 'porridge',
    'pie', 'scone', 'jam', 'butter', 'cheese', 'omelette', 'pasta', 'dumpling', 'pizza', 'taco', 'burrito', // the kitchen
    'drizzle', 'rainstorm', 'hailstone', 'snowdrift', 'whirlwind', 'tornado', 'monsoon', 'heatwave',
    'raindrop', 'rainbow', // the weather
    'tune', 'melody', 'ukulele', 'fiddle', 'tuba', 'trombone', 'xylophone', 'tambourine', 'harmonica',
    'bagpipe', 'accordion', 'cymbal', 'drumkit', 'jingle', 'chorus', 'serenade', 'ballad', 'jig', 'waltz',
    'polka', 'hoedown', 'disco', 'symphony', // music
    'ladybird', 'bumblebee', 'caterpillar', 'butterfly', 'grasshopper', 'cricket', 'dragonfly', 'glowworm',
    'earwig', 'woodlouse', 'slug', 'worm', 'ant', // minibeasts
    'kitten', 'puppy', 'bunny', 'hamster', 'guineapig', 'gerbil', 'goldfish', 'tortoise', 'parakeet',
    'budgie', 'ferret', 'raccoon', 'panda', 'koala', 'kangaroo', 'platypus', 'llama', 'alpaca', 'capybara',
    'axolotl', 'flamingo', 'pelican', 'puffin', 'moose', 'bear', 'wolf', 'lynx', // creatures
  ],
];
const newSeed = (rng) => `${rng.pick(SEED_WORDS[0])}-${rng.pick(SEED_WORDS[1])}`;
const seedTitle = (seed) => String(seed).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Untitled';
// a short random word for a layer's own seed
const newToken = (rng) => rng.int(0, 2 ** 30).toString(36);

// ---------- scales, meters and chords ----------

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// steps: semitones above the key. harmony: the scale its chords come from, for scales with fewer than
// 7 notes (stacking a pentatonic scale's notes doesn't make proper chords)
const SCALES = {
  major:            { name: 'Major',             steps: [0, 2, 4, 5, 7, 9, 11] },
  lydian:           { name: 'Lydian',            steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian:       { name: 'Mixolydian',        steps: [0, 2, 4, 5, 7, 9, 10] },
  majorPentatonic:  { name: 'Major pentatonic',  steps: [0, 2, 4, 7, 9], harmony: 'major' },
  dorian:           { name: 'Dorian',            steps: [0, 2, 3, 5, 7, 9, 10] },
  minor:            { name: 'Minor',             steps: [0, 2, 3, 5, 7, 8, 10] },
  minorPentatonic:  { name: 'Minor pentatonic',  steps: [0, 3, 5, 7, 10], harmony: 'minor' },
  harmonicMinor:    { name: 'Harmonic minor',    steps: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor:     { name: 'Melodic minor',     steps: [0, 2, 3, 5, 7, 9, 11] },
  phrygian:         { name: 'Phrygian',          steps: [0, 1, 3, 5, 7, 8, 10] },
  phrygianDominant: { name: 'Phrygian dominant', steps: [0, 1, 4, 5, 7, 8, 10] },
  locrian:          { name: 'Locrian',           steps: [0, 1, 3, 5, 6, 8, 10] },
  hungarianMinor:   { name: 'Hungarian minor',   steps: [0, 2, 3, 6, 7, 8, 11] },
  hirajoshi:        { name: 'Hirajoshi',         steps: [0, 2, 3, 7, 8], harmony: 'minor' },
  inSen:            { name: 'In sen',            steps: [0, 1, 5, 7, 10], harmony: 'phrygian' },
  wholeTone:        { name: 'Whole tone',        steps: [0, 2, 4, 6, 8, 10] },
  // the minor pentatonic with the flat fifth (the "blue note") in it
  blues:            { name: 'Blues',             steps: [0, 3, 5, 6, 7, 10], harmony: 'minor' },
  // a flat second and a flat sixth around a major third and seventh: raga bhairav, the dawn raga, and
  // the most exotic sounding of the scales here
  doubleHarmonic:   { name: 'Double harmonic',   steps: [0, 1, 4, 5, 7, 8, 11] },
  // a gamelan's two tunings, as near as a piano's notes get: pelog (five of its seven, with the flat
  // second and sixth) and slendro (five nearly even steps, here a pentatonic's)
  pelog:            { name: 'Pelog',             steps: [0, 1, 3, 7, 8], harmony: 'phrygian' },
  slendro:          { name: 'Slendro',           steps: [0, 2, 5, 7, 9], harmony: 'major' },
};
const harmonySteps = (scale) => SCALES[SCALES[scale].harmony || scale].steps;

// beats: beats in a bar (what the tempo counts). sub: 2 when a beat splits in two, 3 when it splits
// in three (6/8 is two beats of three)
const METERS = {
  '4/4': { beats: 4, sub: 2 },
  '3/4': { beats: 3, sub: 2 },
  '6/8': { beats: 2, sub: 3 },
  '5/4': { beats: 5, sub: 2 },
};
// the finest grid notes sit on, in beats (a 16th, or an 8th in 6/8)
const gridStep = (meter) => (METERS[meter].sub === 3 ? 1 / 3 : 1 / 4);
// how fast arps, pulses and broken chords go, in beats
const RATES = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
const rateStep = (rate, sub) => ({ slow: 1, medium: 1 / sub, fast: 1 / (sub * 2) })[rate] || 1 / sub;

// how many bars each chord lasts
const CHORD_BARS = [0.5, 1, 2, 4];
const PARTS = ['A', 'B', 'C'];

// a roman numeral chord, like "bVII", "iv", "ii°", "Imaj7" or "Vsus4". upper case is major, lower
// case minor, and b or # moves it a semitone. root is in semitones above the key, tones in
// semitones above the root. fixed: it says its own colour, so colourChord() leaves it alone
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
function parseChord(token) {
  const match = /^([b#]?)(vii|vi|v|iv|iii|ii|i)(°|o|dim|\+|aug|maj7|7|6|sus2|sus4|add9)?$/i.exec(token);
  if (!match) return null;
  const upper = match[2] === match[2].toUpperCase();
  const root = mod12(MAJOR_DEGREES[ROMANS.indexOf(match[2].toLowerCase())] + (match[1] === 'b' ? -1 : match[1] === '#' ? 1 : 0));
  const extra = (match[3] || '').toLowerCase();
  let tones = upper ? [0, 4, 7] : [0, 3, 7];
  if (extra === '°' || extra === 'o' || extra === 'dim') tones = [0, 3, 6];
  if (extra === '+' || extra === 'aug') tones = [0, 4, 8];
  if (extra === 'sus2') tones = [0, 2, 7];
  if (extra === 'sus4') tones = [0, 5, 7];
  if (extra === '7') tones.push(10);
  if (extra === 'maj7') tones.push(11);
  if (extra === '6') tones.push(9);
  if (extra === 'add9') tones.push(14);
  return { root, tones, fixed: !!extra };
}

// a progression's text to its chords. "-" (or ".") holds the last chord for another turn, so
// "i - bVI bVII" is i for twice as long. bad: anything that isn't a chord, for the page to point out
function parseProgression(text) {
  const slots = [];
  const bad = [];
  for (const token of String(text || '').trim().split(/[\s,|]+/)) {
    if (!token) continue;
    if (token === '-' || token === '.') {
      if (slots.length) slots[slots.length - 1].slots++;
      continue;
    }
    const chord = parseChord(token);
    if (chord) slots.push({ chord, token, slots: 1 });
    else bad.push(token);
  }
  return { slots, bad };
}

// the triad on a degree of the scale, by stacking every other note
function diatonicChord(steps, degree) {
  const n = steps.length;
  const note = (i) => steps[i % n] + 12 * Math.floor(i / n);
  const root = note(degree);
  return { root: mod12(root), tones: [0, note(degree + 2) - root, note(degree + 4) - root] };
}

// and back to a roman numeral, so generated chords show (and save) like typed ones
const ROMAN_BY_ROOT = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
function chordToken(root, tones) {
  const minor = tones[1] === 3;
  let token = ROMAN_BY_ROOT[mod12(root)];
  if (minor) token = token.replace(/[IV]+/, (numeral) => numeral.toLowerCase());
  if (minor && tones[2] === 6) token += '°';
  if (tones[1] === 4 && tones[2] === 8) token += '+';
  return token;
}

// a chord's letter name, e.g. "F#m7"
function chordName(rootPc, tones) {
  const has = (n) => tones.includes(n);
  let name = has(4) ? (has(8) && !has(7) ? 'aug' : '') : has(3) ? (has(6) && !has(7) ? 'dim' : 'm') : has(2) ? 'sus2' : has(5) ? 'sus4' : '';
  if (name === 'dim' && has(9)) name = 'dim7';
  else if (name === 'dim' && has(10)) name = 'm7b5';
  else if (has(11)) name = name === 'm' ? 'm(maj7)' : `${name}maj7`;
  else if (has(10)) name = name.startsWith('sus') ? `7${name}` : `${name}7`;
  else if (has(9)) name += '6';
  if (has(14)) name += has(10) || has(11) ? '(9)' : 'add9';
  return NOTE_NAMES[mod12(rootPc)] + name;
}

// adds sevenths, ninths and suspensions to plain chords, more the higher the song's colour. the
// random numbers come from the chord's place in its part, so it's coloured the same every time round
function colourChord(tones, root, colour, rng) {
  const out = tones.slice();
  const major = tones[1] === 4 && tones[2] === 7;
  const diminished = tones[1] === 3 && tones[2] === 6;
  if (rng.chance(colour * 0.85)) out.push(major && root === 7 ? 10 : major ? 11 : diminished ? 9 : 10);
  if (rng.chance(colour * 0.45) && !diminished) out.push(14);
  if (rng.chance(colour * 0.12) && !diminished) out[1] = rng.chance(0.5) ? 2 : 5;
  return out;
}

// how often each chord leads to each other chord (rows: from I, ii, iii, IV, V, vi, vii; columns: to
// the same), roughly the "tonic, predominant, dominant, home" pull of most western music
const CHORD_MOVES = [
  [0, 2, 1, 4, 4, 3, 1],
  [1, 0, 0, 1, 5, 1, 2],
  [1, 0, 0, 3, 1, 4, 0],
  [3, 2, 1, 0, 4, 1, 1],
  [5, 0, 1, 1, 0, 3, 0],
  [1, 3, 1, 4, 2, 0, 0],
  [5, 0, 1, 0, 0, 1, 0],
];

// voices a chord around a note: every inversion in every nearby octave, keeping whichever moves
// least from the last chord (voice leading), or sits nearest the centre if there wasn't one
function voiceChord(rootPc, tones, center, previous) {
  let best = null;
  let bestCost = Infinity;
  for (let inversion = 0; inversion < tones.length; inversion++) {
    const shape = tones.map((tone, i) => tone + (i < inversion ? 12 : 0)).sort((a, b) => a - b);
    const base = center - 6 + mod12(rootPc - (center - 6)) - 12;
    for (let octave = -1; octave <= 2; octave++) {
      const notes = shape.map((tone) => base + tone + 12 * octave);
      const middle = (notes[0] + notes[notes.length - 1]) / 2;
      let cost = Math.abs(middle - center) * (previous ? 0.3 : 1);
      if (previous) for (let i = 0; i < Math.min(notes.length, previous.length); i++) cost += Math.abs(notes[i] - previous[i]);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return best;
}

// the midi note with this pitch class nearest a centre
const near = (pc, center) => center - 6 + mod12(pc - (center - 6));

// ---------- the band: roles and patterns ----------

// what each layer does. center: the midi note its part sits around. order is the score's, top to
// bottom, roughly high to low
const ROLES = {
  melody:  { name: 'Melody',  colour: '#d0533a', center: 69 },
  counter: { name: 'Counter', colour: '#c4852f', center: 62 },
  arp:     { name: 'Arp',     colour: '#2c96a3', center: 60 },
  bells:   { name: 'Bells',   colour: '#c3628f', center: 79 },
  keys:    { name: 'Keys',    colour: '#3c8a64', center: 62 },
  // low: a guitar's chords sit in its bottom strings, power chords from about d2 up
  guitar:  { name: 'Guitar',  colour: '#a8503a', center: 44 },
  pad:     { name: 'Pad',     colour: '#7e6cc4', center: 57 },
  drone:   { name: 'Drone',   colour: '#5d5470', center: 45 },
  bass:    { name: 'Bass',    colour: '#2c5c8a', center: 40 },
  drums:   { name: 'Drums',   colour: '#3a332c', center: 0 },
  texture: { name: 'Texture', colour: '#958a76', center: 0 },
};
const ROLE_ORDER = Object.keys(ROLES);
// a role's kind of instrument: drum kits and textures are their own families, everything else plays notes
const roleFamily = (role) => (role === 'drums' ? 'kit' : role === 'texture' ? 'texture' : 'tonal');
const instrumentFits = (id, role) => {
  const instrument = INSTRUMENTS[id];
  if (!instrument) return false;
  const family = roleFamily(role);
  return family === 'tonal' ? instrument.family !== 'kit' && instrument.family !== 'texture' : instrument.family === family;
};

// how each role can play. the first is its default
const PATTERNS = {
  melody:  { phrases: 'Phrases', calls: 'Calls and gaps', long: 'Long notes', riff: 'Riff', fragments: 'Fragments' },
  counter: { counterpoint: 'Second melody', answer: 'Answers', harmony: 'Harmony', free: 'Its own tune', tune: 'Takes the tune' },
  arp:     { up: 'Up', down: 'Down', updown: 'Up and down', converge: 'Inwards', random: 'Random', twinkle: 'Twinkling', roll: 'Banjo roll' },
  bells:   { phasing: 'Drifting loops', sparkle: 'Chimes on the chords', double: 'Doubles the tune' },
  keys:    { broken: 'Broken chords', block: 'Block chords', strum: 'Strummed', waltz: 'Oom-pah', comp: 'Jazz comping', skank: 'Off beat skank', bossa: 'Bossa nova' },
  guitar:  { power: 'Power chords', eighths: 'Eighths', chug: 'Chugging riff', ring: 'Ringing chords', tremolo: 'Tremolo picked', strum: 'Strummed', funk: 'Funk scratch', boomchick: 'Boom chick' },
  pad:     { sustain: 'Held', swell: 'Swells', pulse: 'Pulsing', stabs: 'Stabs', pump: 'Pumping' },
  drone:   { tonic: 'Home note', fifths: 'Open fifths', follow: 'Follows chords', cluster: 'Cluster', cycle: 'Plucked round and round' },
  bass:    { held: 'Held', pulse: 'Pulse', rootfifth: 'Root and fifth', octave: 'Octaves', walking: 'Walking', synco: 'Syncopated', riff: 'Doubles the riff', boogie: 'Boogie', hook: 'Bass hook' },
  drums:   { groove: 'Groove', halftime: 'Half time', brush: 'Brushes', pulse: 'Pulse', tribal: 'Tribal', march: 'March', sparse: 'Sparse', four: 'Four to the floor', break: 'Breakbeat', rock: 'Rock', punk: 'Punk', double: 'Double kick', breakdown: 'Breakdown', wash: 'Wash',
    swing: 'Swing', bossa: 'Bossa nova', tala: 'Tala', funk: 'Funk', onedrop: 'One drop', train: 'Train beat', shuffle: 'Shuffle',
    boombap: 'Boom bap', trap: 'Trap', maqsum: 'Maqsum', gallop: 'Gallop' },
  texture: { steady: 'Steady' },
};
// the patterns that use a layer's speed (rate)
const USES_RATE = { arp: true, 'bass.pulse': true, 'bass.octave': true, 'pad.pulse': true, 'keys.broken': true };
const usesRate = (layer) => !!(USES_RATE[layer.role] || USES_RATE[`${layer.role}.${layer.pattern}`]);
// the roles that can take a solo (section.lead, addSolo): the ones that play a line or chords up top
const SOLOISTS = { melody: true, counter: true, keys: true, arp: true, bells: true };
// a layer that plays the melody's own line rather than a part of its own (see "orchestration"): a
// counter melody taking the tune for a section, or bells doubling it an octave up
const carries = (layer) => (layer.role === 'counter' && layer.pattern === 'tune') || (layer.role === 'bells' && layer.pattern === 'double');

// ---------- moods ----------

// each mood is the ranges its songs are picked from:
//   scales, meters   weights. tempo, tuneTempo   bpm ranges for ambient songs and for the rest
//   chords      progressions that suit it. methods   how often each way of making chords is used
//   richness    range for the song's chord colour
//   energy, space, bright, dark   0 to 1: how busy, roomy, bright and unsettling. they steer density,
//               reverb, filters, detuning and which layers turn up
//   palette     instruments for each role (now and then something else, surprise)
//   textures, kits   scenery and drum kits. no kits, no drums
//   drums       [chance in an ambient song, chance in the rest]. a beat under a dreamy song sounds wrong
//   edge        the harshest instrument it allows (edge in synth.js), from energy and dark if left out
//   patterns    role patterns it prefers over STYLE_PATTERNS ('ambient.guitar': ambient songs only)
//   swing       chance of swing (none unless it says). swingAmount   its range, 0.15 to 0.5 unless it says
//   fx          extra wobble, drive or echo
//   opens       the parts that open its songs, most wanted first (pickArrangement)
//   group       its row on the page (MOOD_GROUPS)
//   ornate      how much its players ornament their notes (ornament()), 1 unless it says
//   chordBars   how long its chords last, to pick from (a twelve bar blues is a bar a chord)
//   orchestra   { pass, double }: chances its tune is handed round and doubled (pickOrchestra)
//   prelude     the name of a section of scenery alone that opens its songs (pickArrangement)
//   drama       how far its sections' energies are stretched apart, 1 unless it says (stretch)
//   build       chance its tunes and ambient songs build to a climax (builds()), never if left out
//   pedal       its pianos hold the sustain pedal down (pedal())
//   weave       chance its tunes and loops bring their themes in one at a time, then together (weaves())
//   phrasing    how its tunes are written, as a flavour's (FLAVOURS)
// modifiers also set most (more or fewer layers), busy (busier parts), soft (slower attacks) and reharm
// (its progressions moved into the song's scale, reharmonise()). the loud and hazy moods also have:
//   layers      chance of each role, over LAYER_CHANCE (a rock band has a guitar and no keys)
//   forms       song shapes for tunes, over FORMS
//   solo, soloOver   chance of a solo in a tune, and the part it's over (rock's is the chorus)
//   quiet, loudQuiet   cleaner guitars, and the chance a second one plays the quiet sections
//   breakdown   part C is a half time breakdown, not a quiet drop (grooveFor)
//   bury        0 to 1, how far the tune sinks into the band (shoegaze's singer)
//   surprise    chance of an instrument from outside the palette, 0.12 unless it says
// a section marked LIFTED in a song shape ([name, part, bars, energy, LIFTED]) is a key change: it and
// everything after it play a step or a half step higher (section.lift). defined before MOODS uses it
const LIFTED = true;
// song shapes for the loud and hazy moods (MOODS forms), in FORMS' terms: [name, part, about how many
// bars, energy]. verses and choruses, with the chorus (B) as the loud part
const LOUD_FORMS = [
  [['Intro', 'A', 4, 0.45], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.72], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.6], ['Chorus', 'B', 8, 1], ['Outro', 'B', 4, 0.5]],
  [['Intro', 'A', 4, 0.55], ['Verse', 'A', 8, 0.7], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.72], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.45]],
  // the chorus's chords loud first, then down for the verse (smells like teen spirit)
  [['Intro', 'B', 4, 0.9], ['Verse', 'A', 8, 0.65], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.55], ['Chorus', 'B', 8, 1]],
];
// metal: the riff on its own to open, and a heavy break (part C) before the last chorus
const METAL_FORMS = [
  [['Intro', 'A', 4, 0.5], ['Riff', 'A', 8, 0.85], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Riff', 'A', 4, 0.85], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Break', 'C', 8, 0.9], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.6]],
  [['Intro', 'C', 4, 0.45], ['Riff', 'A', 8, 0.9], ['Verse', 'A', 8, 0.8], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.8], ['Chorus', 'B', 8, 1], ['Break', 'C', 8, 0.9], ['Riff', 'A', 8, 0.9]],
];
// hardcore: loud nearly all the way, a quiet clean intro, and a breakdown before the last chorus
const HARDCORE_FORMS = [
  [['Intro', 'A', 4, 0.4], ['Verse', 'A', 8, 0.9], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.9], ['Chorus', 'B', 8, 1], ['Breakdown', 'C', 8, 0.95], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.4]],
  [['Intro', 'B', 4, 0.95], ['Verse', 'A', 8, 0.85], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.85], ['Chorus', 'B', 8, 1], ['Breakdown', 'C', 8, 0.95], ['Chorus', 'B', 8, 1]],
];
// shoegaze: a slow start, the wall, a hazy middle, and often a long loud outro of noise
const GAZE_FORMS = [
  [['Intro', 'A', 8, 0.5], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Haze', 'C', 8, 0.65], ['Chorus', 'B', 8, 1], ['Outro', 'B', 8, 0.85]],
  [['Intro', 'C', 4, 0.5], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['Haze', 'C', 8, 0.6], ['B', 'B', 16, 1]],
  [['Swell', 'B', 8, 0.6], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Wash', 'B', 8, 0.9]],
];
// a dramatic tune (the dramatic modifier, on a mood without shapes of its own): longer than a tune's
// usual shapes, round twice, a fall to almost nothing, then the last choruses a key higher, like a power
// ballad's or a film theme's ending
const DRAMA_FORMS = [
  [['Intro', 'C', 4, 0.3], ['Verse', 'A', 8, 0.6], ['Chorus', 'B', 8, 0.9], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.4], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1, LIFTED], ['Chorus', 'B', 8, 1, LIFTED], ['Outro', 'A', 4, 0.3, LIFTED]],
  [['Intro', 'A', 4, 0.3], ['Theme', 'A', 8, 0.65], ['Theme', 'A', 8, 0.8], ['Climb', 'B', 8, 0.95], ['Fall', 'C', 8, 0.4], ['Theme', 'A', 8, 0.85], ['Climb', 'B', 8, 1], ['Theme', 'A', 8, 1, LIFTED], ['Climb', 'B', 8, 1, LIFTED], ['Outro', 'A', 4, 0.3, LIFTED]],
];

const MOODS = {
  calm: {
    group: 'Gentle',
    opens: ['pad', 'keys', 'drone', 'arp'],
    name: 'Calm', colour: '#9cc5a1', style: 'ambient',
    scales: { major: 3, lydian: 1.5, majorPentatonic: 2, mixolydian: 1 }, tempo: [58, 76], tuneTempo: [78, 96],
    chords: ['I IV', 'I - IV -', 'I vi IV I', 'IV I', 'I iii IV IV', 'Imaj7 IVmaj7', 'ii I', 'I V vi IV'],
    richness: [0.3, 0.75], energy: 0.25, space: 0.65, bright: 0.55, dark: 0.05,
    palette: {
      pad: ['warm-pad', 'glass-pad', 'strings', 'air-pad', 'analog-pad', 'bowed-vibes'], melody: ['flute', 'felt-keys', 'ocarina', 'soft-lead', 'pan-flute', 'piano'],
      counter: ['felt-keys', 'harp', 'soft-lead', 'nylon'], keys: ['felt-keys', 'harp', 'e-piano', 'nylon', 'piano'], arp: ['harp', 'kalimba', 'felt-keys', 'nylon'],
      bells: ['glass-bell', 'chime', 'vibes', 'sine-bell'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['organ-drone', 'deep-drone', 'cello-drone'],
    },
    textures: ['birds', 'ocean', 'crickets', 'rain', 'stream', 'leaves', 'frogs'], kits: ['soft-kit'], drums: [0.1, 0.35],
    patterns: { drums: ['pulse', 'sparse', 'brush'], melody: ['phrases', 'fragments', 'phrases', 'long'] }, ornate: 0.6,
  },
  heavenly: {
    group: 'Gentle',
    opens: ['pad', 'drone', 'keys'],
    build: 0.25, name: 'Heavenly', colour: '#bcdcf2', style: 'ambient',
    scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [52, 70], tuneTempo: [70, 90],
    chords: ['I V vi iii IV I IV V', 'I IV I V', 'IV I', 'I bVII IV I', 'I V vi IV', 'IV V vi I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.2, space: 1, bright: 0.75, dark: 0,
    palette: {
      pad: ['choir-ah', 'organ', 'shimmer', 'strings', 'bowed-vibes', 'vox-pad'], melody: ['choir-oo', 'flute', 'glass-bell', 'violin', 'soprano'],
      counter: ['harp', 'celesta', 'choir-oo', 'cello'], keys: ['harp', 'celesta', 'organ'], arp: ['harp', 'celesta'],
      bells: ['bell', 'glass-bell', 'celesta', 'chime', 'sine-bell'], bass: ['sub-bass', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind', 'birds', 'chimes', 'stream'], kits: [], drums: [0, 0], patterns: { drone: ['fifths', 'tonic'] }, ornate: 0.5,
  },
  // stardew valley's spring and summer: a flute, clarinet or accordion tune over a fingerpicked or
  // strummed guitar, soft strings, a bass bouncing between root and fifth, and a light kit
  happy: {
    group: 'Bright',
    opens: ['keys', 'arp', 'bass', 'pad'],
    name: 'Happy', colour: '#ffcf4d', style: 'tune',
    scales: { major: 4, majorPentatonic: 2, mixolydian: 1 }, tempo: [70, 90], tuneTempo: [100, 124],
    meters: { '4/4': 6, '3/4': 2, '6/8': 2 },
    chords: ['I V vi IV', 'I IV V IV', 'I vi IV V', 'I IV I V', 'I iii IV V', 'vi IV I V', 'I IV vi V', 'I V IV V'],
    richness: [0.1, 0.5], energy: 0.65, space: 0.4, bright: 0.75, dark: 0,
    palette: {
      pad: ['strings', 'warm-pad', 'organ'], melody: ['flute', 'clarinet', 'accordion', 'ocarina', 'whistle', 'marimba', 'pan-flute', 'square-lead', 'pulse-lead'],
      counter: ['marimba', 'clarinet', 'pizzicato', 'nylon'], keys: ['steel-guitar', 'nylon', 'felt-keys', 'e-piano', 'piano'], arp: ['nylon', 'steel-guitar', 'harp', 'kalimba', 'marimba', 'xylophone', 'banjo'],
      bells: ['celesta', 'vibes', 'chime', 'glock', 'xylophone'], bass: ['upright', 'pluck-bass', 'round-bass', 'chip-bass'], drone: ['organ-drone'],
    },
    textures: ['birds', 'crickets', 'stream', 'leaves'], kits: ['soft-kit', 'soft-kit', 'tight-kit', 'chip-kit'], drums: [0.1, 0.85], swing: 0.2,
    patterns: { drums: ['groove', 'groove', 'halftime'], bass: ['rootfifth', 'rootfifth', 'octave', 'held', 'synco'], keys: ['strum', 'broken', 'block'], arp: ['updown', 'up', 'converge'] },
    orchestra: { pass: 0.35, double: 0.25 },
  },
  playful: {
    group: 'Bright',
    opens: ['keys', 'bass', 'arp', 'drums'],
    name: 'Playful', colour: '#f5a3c7', style: 'tune',
    scales: { major: 3, majorPentatonic: 2, lydian: 1, mixolydian: 1 }, tempo: [76, 96], tuneTempo: [108, 132],
    meters: { '4/4': 4, '3/4': 2, '6/8': 3 },
    chords: ['I IV V I', 'I vi ii V', 'I II IV I', 'I bVII IV I', 'IV V I vi', 'I iii IV V', 'I I7 IV iv'],
    richness: [0.1, 0.5], energy: 0.7, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['organ', 'warm-pad', 'strings'], melody: ['pizzicato', 'marimba', 'whistle', 'clarinet', 'accordion', 'kalimba', 'square-lead', 'music-box', 'pulse-lead', 'xylophone'],
      counter: ['pizzicato', 'clarinet', 'kalimba', 'celesta', 'xylophone'], keys: ['marimba', 'felt-keys', 'steel-guitar', 'music-box', 'xylophone'], arp: ['kalimba', 'pizzicato', 'nylon', 'celesta', 'xylophone'],
      bells: ['celesta', 'music-box', 'chime', 'glock'], bass: ['pluck-bass', 'upright', 'round-bass', 'chip-bass', 'tuba'], drone: ['organ-drone'],
    },
    textures: ['birds', 'crickets', 'stream'], kits: ['clockwork', 'tight-kit', 'soft-kit', 'chip-kit'], drums: [0.1, 0.85], swing: 0.35,
    patterns: { drums: ['groove', 'march'], bass: ['octave', 'rootfifth', 'walking'], keys: ['waltz', 'block', 'broken'], melody: ['phrases', 'calls', 'riff'] },
    orchestra: { pass: 0.3, double: 0.4 },
  },
  // undertale, deltarune, terraria: chip leads and a bouncing bass under a tune you can't get out of
  // your head, with the odd jazzy or borrowed chord (deltarune leans on the "royal road", IV V iii vi)
  spirited: {
    group: 'Bright',
    opens: ['arp', 'bass', 'keys', 'drums'],
    name: 'Spirited', colour: '#4fb0e8', style: 'tune',
    scales: { major: 3, mixolydian: 1, dorian: 1.5, minor: 1.2, majorPentatonic: 1 }, tempo: [76, 96], tuneTempo: [112, 148],
    meters: { '4/4': 6, '3/4': 1, '6/8': 1.5 },
    chords: ['I V vi IV', 'IVmaj7 V7 iii vi', 'i bVI bVII i', 'i bVII bVI bVII', 'vi IV I V', 'I iii IV iv', 'ii V I vi', 'I bVII IV I', 'IV V iii vi'],
    richness: [0.2, 0.65], energy: 0.75, space: 0.4, bright: 0.75, dark: 0.1, edge: 0.85, swing: 0.15,
    palette: {
      pad: ['strings', 'organ', 'warm-pad'], melody: ['pulse-lead', 'square-lead', 'pan-flute', 'synth-brass', 'felt-keys'],
      counter: ['pulse-lead', 'nylon', 'marimba'], keys: ['felt-keys', 'nylon', 'e-piano', 'piano'], arp: ['pulse-lead', 'square-lead', 'nylon', 'kalimba', 'harp', 'xylophone'],
      bells: ['celesta', 'glass-bell', 'music-box'], bass: ['chip-bass', 'pluck-bass', 'upright', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['birds'], kits: ['chip-kit', 'tight-kit'], drums: [0.15, 0.95],
    patterns: { drums: ['groove', 'march', 'break', 'groove'], bass: ['octave', 'hook', 'walking', 'synco', 'rootfifth'], melody: ['phrases', 'riff', 'phrases', 'calls'] },
    orchestra: { pass: 0.25, double: 0.45 },
  },
  upbeat: {
    group: 'Bright',
    opens: ['drums', 'bass', 'keys', 'arp'],
    build: 0.25, name: 'Upbeat', colour: '#ff8f45', style: 'tune',
    scales: { major: 2, mixolydian: 2, dorian: 2, majorPentatonic: 1, minorPentatonic: 1 }, tempo: [84, 100], tuneTempo: [118, 142],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['I V vi IV', 'I bVII IV I', 'vi IV I V', 'I IV vi V', 'i bVII bVI bVII', 'ii V I I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.9, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'shimmer', 'analog-pad'], melody: ['saw-lead', 'square-lead', 'pluck-lead', 'whistle', 'synth-brass', 'pulse-lead'],
      counter: ['pluck-lead', 'e-piano', 'marimba'], keys: ['e-piano', 'felt-keys', 'steel-guitar', 'wurlitzer'], arp: ['pluck-lead', 'kalimba', 'e-piano', 'saw-lead', 'steel-guitar'],
      bells: ['vibes', 'chime'], bass: ['synth-bass', 'pluck-bass', 'growl-bass', '808-bass', 'moog-bass'], drone: ['deep-drone'],
    },
    textures: [], kits: ['tight-kit', 'lofi-kit', 'club-kit'], drums: [0.15, 0.95], edge: 1,
    patterns: { bass: ['octave', 'synco', 'pulse', 'rootfifth'], drums: ['groove', 'groove', 'halftime', 'four', 'break'] },
  },
  cozy: {
    group: 'Bright',
    opens: ['keys', 'bass', 'pad'],
    name: 'Cozy', colour: '#c9875f', style: 'tune',
    scales: { major: 2, mixolydian: 1, dorian: 2, majorPentatonic: 1 }, tempo: [62, 78], tuneTempo: [72, 92],
    chords: ['Imaj7 vi ii V7', 'I IV iii vi ii V', 'IVmaj7 iii ii Imaj7', 'I vi ii V', 'ii V7 Imaj7 -', 'Imaj7 IVmaj7', 'vi ii V7 Imaj7'],
    richness: [0.6, 1], energy: 0.45, space: 0.45, bright: 0.4, dark: 0.05, swing: 0.8,
    palette: {
      pad: ['warm-pad', 'organ', 'strings'], melody: ['e-piano', 'felt-keys', 'flute', 'vibes', 'soft-lead', 'nylon', 'clarinet', 'piano', 'mute-trumpet', 'wurlitzer', 'humming'],
      counter: ['felt-keys', 'vibes', 'harp', 'nylon'], keys: ['e-piano', 'felt-keys', 'nylon', 'piano', 'jazz-guitar', 'wurlitzer'], arp: ['e-piano', 'harp', 'vibes', 'nylon'],
      bells: ['vibes', 'chime'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'fire', 'rain'], kits: ['brushes'], drums: [0.05, 0.55],
    patterns: { bass: ['walking', 'rootfifth', 'held'], drums: ['brush'], keys: ['strum', 'block', 'broken'] }, fx: { wobble: 0.5 },
  },
  wistful: {
    group: 'Gentle',
    opens: ['keys', 'pad', 'arp'],
    pedal: true, build: 0.15, name: 'Wistful', colour: '#e3b3a0', style: 'ambient',
    scales: { mixolydian: 1.5, dorian: 2, major: 1.5, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [74, 94],
    chords: ['I iii IV iv', 'IV iv I', 'I V vi iii IV I IV V', 'vi IV I V', 'I bVII IV I', 'Imaj7 IVmaj7 iii vi', 'IV I V vi', 'I III IV iv'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.7, bright: 0.45, dark: 0.15,
    palette: {
      pad: ['strings', 'warm-pad', 'glass-pad', 'choir-oo', 'analog-pad', 'reverse-piano', 'bowed-vibes'], melody: ['music-box', 'e-piano', 'celesta', 'flute', 'violin', 'nylon', 'piano', 'cello', 'humming'],
      counter: ['harp', 'felt-keys', 'celesta', 'cello'], keys: ['felt-keys', 'e-piano', 'harp', 'piano', 'wurlitzer'], arp: ['harp', 'music-box', 'celesta'],
      bells: ['music-box', 'celesta', 'glass-bell'], bass: ['round-bass', 'sub-bass', 'upright'], drone: ['cello-drone', 'organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'rain', 'birds', 'leaves', 'chimes'], kits: ['brushes'], drums: [0.05, 0.45],
    patterns: { drums: ['brush', 'sparse'], melody: ['fragments', 'phrases', 'long'] }, fx: { wobble: 0.45 }, ornate: 0.8,
  },
  // c418's minecraft volumes alpha and beta: neither happy nor sad. a felt piano or a rhodes playing a
  // few notes with room round them over a warm pad and a sub bass, a major key leaning on its ii, iii and
  // borrowed iv, worn like an old tape. its flavours are the albums' other sides
  nostalgic: {
    group: 'Gentle', opens: ['keys', 'pad', 'drone'],
    pedal: true, build: 0.15, name: 'Nostalgic', colour: '#86a98f', style: 'ambient',
    scales: { major: 3, lydian: 1.5, mixolydian: 1, majorPentatonic: 1, dorian: 0.5 }, tempo: [58, 76], tuneTempo: [72, 96],
    meters: { '4/4': 5, '3/4': 2, '6/8': 1 },
    chords: ['ii IV I iii', 'I iii IV iv', 'Imaj7 IVmaj7', 'IV I vi V', 'vi IV I V', 'I V vi IV', 'IVmaj7 iii7 vi -', 'I - IV -', 'IV iv I -', 'I vi iii IV'],
    methods: { bank: 5, markov: 2, vamp: 1.5 },
    richness: [0.35, 0.8], energy: 0.3, space: 0.75, bright: 0.45, dark: 0.12, edge: 0.6, surprise: 0, ornate: 0.4,
    palette: {
      melody: ['piano', 'felt-keys', 'e-piano', 'soft-lead', 'music-box', 'humming'], counter: ['felt-keys', 'e-piano', 'soft-lead', 'piano'],
      keys: ['piano', 'felt-keys', 'e-piano', 'wurlitzer'], arp: ['felt-keys', 'e-piano', 'piano', 'harp', 'sine-bell'], bells: ['sine-bell', 'glass-bell', 'music-box'],
      pad: ['warm-pad', 'analog-pad', 'strings', 'air-pad', 'glass-pad', 'bowed-vibes', 'vox-pad'], bass: ['sub-bass', 'round-bass', 'moog-bass'], drone: ['tape-loop', 'organ-drone', 'cello-drone'],
    },
    textures: ['drips', 'rain', 'birds', 'leaves', 'stream', 'crickets'], kits: ['machine', 'soft-kit'], drums: [0.05, 0.4],
    layers: { keys: 0.75 },
    patterns: { melody: ['fragments', 'phrases', 'fragments', 'long'], keys: ['broken', 'block', 'broken'], pad: ['sustain', 'swell'], bass: ['held', 'rootfifth'], drums: ['sparse', 'pulse', 'halftime'], arp: ['updown', 'up', 'random'] },
    fx: { wobble: 0.3 },
  },
  sad: {
    group: 'Dark',
    opens: ['pad', 'keys', 'drone'],
    pedal: true, build: 0.2, name: 'Sad', colour: '#6b95d8', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, harmonicMinor: 0.7, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [66, 88],
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'vi IV I V', 'i bVII bVI bVII', 'i iv i v', 'i - bVI -', 'iv i', 'i bVI iv V', 'i bIII bVII iv'],
    richness: [0.3, 0.8], energy: 0.3, space: 0.7, bright: 0.35, dark: 0.3,
    palette: {
      pad: ['strings', 'warm-pad', 'choir-oo', 'dark-pad', 'fuzz-wall', 'reverse-piano', 'bowed-vibes'], melody: ['felt-keys', 'violin', 'flute', 'e-piano', 'music-box', 'piano', 'cello', 'humming'],
      counter: ['felt-keys', 'harp', 'violin', 'cello'], keys: ['felt-keys', 'harp', 'e-piano', 'piano'], arp: ['harp', 'felt-keys'],
      bells: ['glass-bell', 'music-box'], bass: ['sub-bass', 'round-bass', 'upright', 'chorus-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['rain', 'vinyl', 'wind', 'owl'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.4], patterns: { drums: ['sparse', 'pulse', 'brush'] },
  },
  // calamity's title theme, the tale of a cruel world (dm dokuro): sad and dramatic at once, and moving
  // rather than gloomy. a lone piano, then strings and a choir swelling in under it, building to the
  // whole orchestra with the timpani crashing, then falling back to the piano. harmonic minor's raised
  // seventh pulls it home, and its sections swing a long way between quiet and loud (drama)
  tragic: {
    group: 'Dark', opens: ['keys', 'drone', 'pad'],
    build: 0.55, name: 'Tragic', colour: '#94455a', style: 'tune',
    scales: { minor: 3, harmonicMinor: 2.5, dorian: 0.5 }, tempo: [52, 68], tuneTempo: [66, 90],
    meters: { '4/4': 5, '3/4': 1.5, '6/8': 1.5 },
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'bVI bVII i -', 'i v bVI bIII iv i iv V', 'i bVII bVI V', 'iv bVI bVII i', 'i bIII bVII iv', 'i - bVI V'],
    methods: { bank: 6, markov: 1.5 },
    richness: [0.15, 0.55], energy: 0.55, space: 0.85, bright: 0.45, dark: 0.55, edge: 0.75, surprise: 0, ornate: 0.8, drama: 1.3,
    palette: {
      melody: ['piano', 'violin', 'choir-oo', 'horn', 'oboe', 'cello', 'soprano'], counter: ['violin', 'horn', 'choir-oo', 'oboe', 'trombone', 'cello'],
      keys: ['piano', 'harp'], arp: ['piano', 'harp'], bells: ['bell', 'glock', 'celesta'],
      pad: ['strings', 'choir-ah', 'choir-oo', 'brass-section', 'tremolo-strings'], bass: ['upright', 'round-bass', 'sub-bass', 'tuba'], drone: ['cello-drone', 'organ-drone', 'deep-drone'],
    },
    textures: ['wind', 'rain', 'rumble'], kits: ['orchestra-kit', 'taiko'], drums: [0.2, 0.75],
    layers: { pad: 1, keys: 0.85, counter: 0.55 },
    patterns: { drums: ['halftime', 'march', 'tribal'], keys: ['broken', 'broken', 'block'], pad: ['swell', 'sustain', 'pulse'], melody: ['phrases', 'long', 'phrases'], bass: ['held', 'octave', 'pulse'], counter: ['counterpoint', 'harmony'], drone: ['tonic', 'fifths'] },
    // a prologue on the piano, the theme growing each time round to a climax, a fall to almost nothing,
    // then a second, bigger climax a key higher to end on, as the title theme does (about four minutes)
    forms: [
      [['Prologue', 'C', 8, 0.3], ['Theme', 'A', 8, 0.55], ['Theme', 'A', 8, 0.7], ['Rise', 'B', 8, 0.85], ['Theme', 'A', 8, 0.95], ['Climax', 'B', 8, 1], ['Fall', 'C', 8, 0.4], ['Theme', 'A', 8, 0.8], ['Climax', 'B', 8, 1, LIFTED], ['Climax', 'B', 8, 1, LIFTED], ['Epilogue', 'A', 4, 0.3, LIFTED]],
      [['Prologue', 'A', 4, 0.3], ['Theme', 'A', 8, 0.6], ['Rise', 'B', 8, 0.8], ['Fall', 'C', 8, 0.45], ['Theme', 'A', 8, 0.9], ['Climax', 'B', 8, 1], ['Climax', 'B', 8, 1], ['Requiem', 'C', 8, 0.35], ['Theme', 'A', 8, 0.85, LIFTED], ['Climax', 'B', 8, 1, LIFTED], ['Epilogue', 'C', 4, 0.3, LIFTED]],
    ],
    orchestra: { pass: 0.5, double: 0.3 },
  },
  // have a nice life: a slow wall of fuzz, a lone chanted line, a cheap drum machine in a huge room,
  // all of it worn and washed out. serious rather than sad
  bleak: {
    group: 'Dark',
    opens: ['pad', 'drone', 'bass'],
    build: 0.3, name: 'Bleak', colour: '#6f7d8c', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, phrygian: 1 }, tempo: [50, 68], tuneTempo: [72, 92],
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i v bVI iv', 'i bVII', 'i - - - bVI - - -', 'iv i', 'i bIII iv bVI', 'i bVI'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.15, 0.5], energy: 0.4, space: 1, bright: 0.3, dark: 0.55,
    palette: {
      pad: ['fuzz-wall', 'choir-ah', 'choir-oo', 'dark-pad', 'vox-pad'], melody: ['violin', 'whistle', 'felt-keys', 'nylon', 'choir-oo', 'cello', 'chant-voice'],
      counter: ['strings', 'felt-keys', 'nylon'], keys: ['felt-keys', 'e-piano', 'nylon'], arp: ['nylon', 'felt-keys', 'sine-bell'],
      bells: ['sine-bell', 'glass-bell'], bass: ['chorus-bass', 'sub-bass', 'round-bass'], drone: ['deep-drone', 'cello-drone', 'organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'rain', 'hum'], kits: ['machine'], drums: [0.35, 0.8],
    patterns: { drums: ['halftime', 'pulse', 'groove'], melody: ['long', 'phrases', 'fragments'], bass: ['held', 'pulse', 'rootfifth'], pad: ['sustain', 'swell'] },
    fx: { wobble: 0.35, drive: 0.25 },
  },
  mysterious: {
    group: 'Dark',
    opens: ['drone', 'pad', 'arp'],
    build: 0.15, name: 'Mysterious', colour: '#8b6fd0', style: 'ambient',
    scales: { dorian: 2, phrygian: 1.5, harmonicMinor: 1, hirajoshi: 1.2, inSen: 1, minor: 1 }, tempo: [56, 76], tuneTempo: [80, 104],
    chords: ['i bII', 'i IV', 'i bVII bVI bVII', 'i v iv i', 'i bIII bVII iv', 'i - bII -', 'i IV i bVII', 'i bVI'],
    methods: { bank: 4, markov: 2, vamp: 3 },
    richness: [0.4, 0.9], energy: 0.35, space: 0.8, bright: 0.45, dark: 0.45,
    palette: {
      pad: ['choir-oo', 'air-pad', 'glass-pad', 'dark-pad', 'bowed-vibes'], melody: ['kalimba', 'flute', 'glass-bell', 'ocarina', 'whistle'],
      counter: ['kalimba', 'harp', 'pizzicato'], keys: ['harp', 'kalimba', 'celesta', 'harpsichord'], arp: ['kalimba', 'harp', 'marimba'],
      bells: ['glass-bell', 'bell', 'chime', 'metal-ping', 'sine-bell'], bass: ['sub-bass', 'pluck-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone', 'tape-loop'],
    },
    textures: ['drips', 'crickets', 'hum', 'wind', 'owl', 'frogs'], kits: ['clockwork', 'heartbeat'], drums: [0.15, 0.6], patterns: { drums: ['sparse', 'pulse'] },
  },
  tense: {
    group: 'Dark',
    opens: ['pad', 'bass', 'drone', 'drums'],
    build: 0.4, name: 'Tense', colour: '#c4573a', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 1.5, locrian: 0.5, hungarianMinor: 1 }, tempo: [70, 92], tuneTempo: [96, 132],
    chords: ['i bII', 'i - bII -', 'i iv bII V', 'i bVI V', 'i bII i bVII', 'i iv bVI V', 'i v bVI bII'],
    methods: { bank: 5, markov: 1, vamp: 2, chromatic: 1 },
    richness: [0.2, 0.6], energy: 0.65, space: 0.5, bright: 0.4, dark: 0.65,
    palette: {
      pad: ['strings', 'dark-pad', 'haunted-pad', 'analog-pad', 'tremolo-strings'], melody: ['violin', 'saw-lead', 'horn', 'pluck-lead', 'synth-brass'],
      counter: ['pizzicato', 'pluck-lead', 'strings', 'cello'], keys: ['felt-keys', 'pizzicato', 'harp', 'harpsichord'], arp: ['pluck-lead', 'pizzicato', 'saw-lead', 'marimba', 'harpsichord'],
      bells: ['bell', 'glass-bell', 'metal-ping'], bass: ['synth-bass', 'sub-bass', 'growl-bass', 'reese'], drone: ['deep-drone', 'cello-drone', 'bowed-metal'],
    },
    textures: ['rumble', 'hum', 'creaks', 'geiger'], kits: ['heartbeat', 'clockwork', 'taiko', 'machine'], drums: [0.3, 0.9], edge: 0.9,
    patterns: { bass: ['pulse', 'synco', 'octave'], drums: ['pulse', 'tribal', 'halftime', 'sparse'], pad: ['sustain', 'pulse'] },
  },
  // crystal castles, and the synths of dying light: dark and serious, a crushed chip lead over pumping
  // pads, octave bass and a club kick. as ambient it's the slower night drive, arps pulsing under pads
  neon: {
    group: 'Beats',
    opens: ['pad', 'arp', 'bass', 'drums'],
    build: 0.2, name: 'Neon', colour: '#d43fb4', style: 'tune',
    scales: { minor: 3, phrygian: 1, dorian: 1, harmonicMinor: 1 }, tempo: [80, 100], tuneTempo: [124, 140],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i iv', 'i bIII bVII iv', 'i v bVI iv', 'i - bII -', 'i bVI iv V'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.1, 0.45], energy: 0.85, space: 0.6, bright: 0.6, dark: 0.6, edge: 1,
    palette: {
      pad: ['analog-pad', 'dark-pad', 'choir-ah', 'glass-pad', 'vox-pad'], melody: ['bit-lead', 'pulse-lead', 'saw-lead', 'sine-bell'],
      counter: ['pluck-lead', 'pulse-lead', 'synth-brass'], keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'pulse-lead', 'sine-bell', 'saw-lead'],
      bells: ['sine-bell', 'glass-bell'], bass: ['synth-bass', 'reese', 'growl-bass', 'sub-bass', '808-bass', 'moog-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['hum', 'vinyl'], kits: ['club-kit', 'machine', 'chip-kit'], drums: [0.35, 1],
    patterns: { drums: ['four', 'four', 'break', 'halftime'], pad: ['pump', 'pump', 'sustain'], bass: ['octave', 'synco', 'pulse'], melody: ['riff', 'phrases', 'riff'] },
    fx: { drive: 0.35 },
  },
  eerie: {
    group: 'Dark',
    opens: ['drone', 'pad'],
    build: 0.15, name: 'Eerie', colour: '#9fcf4f', style: 'ambient',
    scales: { phrygian: 1.5, locrian: 1.5, hungarianMinor: 1.5, wholeTone: 1, inSen: 1, harmonicMinor: 1 }, tempo: [44, 64], tuneTempo: [70, 96],
    chords: ['i bII', 'i #iv°', 'i bvi', 'i - #iv -', 'i III', 'i bII bvii', 'i vii°'],
    methods: { chromatic: 4, bank: 3, vamp: 1 },
    richness: [0.4, 1], energy: 0.2, space: 0.9, bright: 0.3, dark: 1,
    palette: {
      pad: ['haunted-pad', 'dark-pad', 'choir-oo', 'air-pad', 'reverse-piano', 'bowed-vibes', 'tremolo-strings'], melody: ['music-box', 'glass-bell', 'whistle', 'violin', 'harpsichord', 'soprano'],
      counter: ['music-box', 'celesta', 'bowed-metal'], keys: ['music-box', 'celesta', 'felt-keys', 'harpsichord'], arp: ['music-box', 'celesta', 'glass-bell'],
      bells: ['bell', 'glass-bell', 'music-box', 'metal-ping'], bass: ['sub-bass', 'deep-drone'], drone: ['void', 'bowed-metal', 'deep-drone', 'cello-drone', 'tape-loop'],
    },
    textures: ['creaks', 'drips', 'hum', 'geiger'], kits: ['heartbeat', 'clockwork'], drums: [0.15, 0.4],
    patterns: { drone: ['cluster', 'tonic', 'cluster'], drums: ['pulse', 'sparse'], melody: ['long', 'phrases', 'fragments'] },
  },
  // fallout 1 and 2, and aphex twin's darker ambient: a wasteland after it all ended. low drones and
  // bowed metal, a lone plucked or bell line with long silences, pipes pinging, a geiger counter
  desolate: {
    group: 'Dark',
    opens: ['drone', 'pad'],
    name: 'Desolate', colour: '#a8925f', style: 'ambient',
    scales: { minor: 2, phrygian: 1.5, dorian: 1.5, hungarianMinor: 0.5 }, tempo: [48, 66], tuneTempo: [70, 92],
    chords: ['i - bVI -', 'i bII', 'i v', 'i bVII bVI bVII', 'i - iv -', 'i bVI', 'i - - - bII - - -'],
    methods: { bank: 4, vamp: 3, chromatic: 1 },
    richness: [0.2, 0.7], energy: 0.25, space: 0.95, bright: 0.3, dark: 0.75, edge: 0.8,
    palette: {
      pad: ['dark-pad', 'reverse-piano', 'analog-pad', 'haunted-pad', 'bowed-vibes'], melody: ['nylon', 'sine-bell', 'felt-keys', 'whistle'],
      counter: ['nylon', 'felt-keys', 'metal-ping'], keys: ['felt-keys', 'nylon', 'e-piano'], arp: ['nylon', 'sine-bell', 'felt-keys'],
      bells: ['metal-ping', 'sine-bell', 'glass-bell'], bass: ['sub-bass', 'reese', 'round-bass'], drone: ['bowed-metal', 'deep-drone', 'tape-loop', 'void'],
    },
    textures: ['geiger', 'creaks', 'drips', 'wind'], kits: ['machine', 'heartbeat'], drums: [0.12, 0.5],
    patterns: { drums: ['sparse', 'pulse'], melody: ['fragments', 'long', 'fragments'], drone: ['tonic', 'cluster', 'fifths'], bells: ['phasing', 'sparkle'] },
    fx: { wobble: 0.2 },
  },
  heroic: {
    group: 'Bright',
    opens: ['drums', 'pad', 'bass'],
    build: 0.45, name: 'Heroic', colour: '#d4a13a', style: 'tune',
    scales: { mixolydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [66, 84], tuneTempo: [92, 124],
    meters: { '4/4': 6, '3/4': 1, '6/8': 2 },
    chords: ['I bVII IV I', 'i bVI bIII bVII', 'I V vi IV', 'IV V iii vi', 'I bVI bVII I', 'i bVI bVII i', 'I IV V I', 'I iii IV V'],
    richness: [0.1, 0.45], energy: 0.8, space: 0.6, bright: 0.65, dark: 0.2,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad', 'organ', 'brass-section', 'tremolo-strings'], melody: ['horn', 'violin', 'flute', 'saw-lead', 'synth-brass', 'trumpet'],
      counter: ['horn', 'strings', 'violin', 'cello'], keys: ['harp', 'pizzicato', 'felt-keys'], arp: ['harp', 'pizzicato', 'pluck-lead'],
      bells: ['bell', 'chime'], bass: ['pluck-bass', 'synth-bass', 'round-bass'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind'], kits: ['taiko', 'tight-kit'], drums: [0.2, 0.95], edge: 0.9,
    patterns: { drums: ['march', 'tribal', 'groove'], bass: ['octave', 'rootfifth', 'pulse'] },
    orchestra: { pass: 0.5, double: 0.35 },
  },

  // ---------- magic: wizard101's worlds ----------
  // nelson everhart's wizard101 scores (the spiral's worlds) are a small orchestra playing a place, and
  // they share their ways of doing it:
  //   - the tune handed round the woodwinds, strings and horns, call and answer (orchestration)
  //   - themes brought in one at a time over the same chords, each on its own instrument, then played
  //     together, then somewhere quieter on other instruments (a celesta over a harp), and the whole
  //     orchestra to finish (weave)
  //   - a harp, harpsichord, pizzicato or koto keeping a figure going under it all (an ostinato)
  //   - a cymbal, a gong or a bell tree marking each new section, timpani at the top
  //   - major and minor borrowed from each other (a minor iv in a major key, a major chord ending a minor
  //     tune), harmonic minor's sharp seventh, a lydian lift, a key change at the climax
  //   - waltzes, everywhere: marleybone, wysteria, darkmoor, celestia
  //   - each world's colour over the orchestra: krokotopia's lyre and sistrum, mooshu's koto and gong
  // written to loop while you walk round a world, so they open in the loop style. from listening, the
  // guided listening write-ups at ravenwood academy (marleybone, wizard city, dragonspyre, krokotopia,
  // mooshu, celestia, darkmoor, wysteria) and everhart's 2009 interview with todd coleman

  // wizard city (and hogwarts, john williams's hedwig's theme): the commons' tune falls down the scale
  // with quick runs and rocks between two notes, on an english horn (the oboe stands in) then a flute,
  // over bouncing pizzicato. ravenwood's horn climbs a lydian arpeggio, the strings rocking under it.
  // olde town and unicorn way bring the themes together and change key at the top. a bassoon in the
  // bass, and the magic chords: a major key borrowing from its minor (the major third chord, the minor
  // four) and harmonic minor's sharp seventh
  magic: {
    group: 'Magic', opens: ['keys', 'arp', 'bass'],
    build: 0.3, weave: 0.5, name: 'Magic', colour: '#7b68d8', style: 'loop',
    scales: { major: 3, lydian: 1.5, harmonicMinor: 1.5, melodicMinor: 0.7, dorian: 0.5 }, tempo: [60, 78], tuneTempo: [96, 128],
    meters: { '4/4': 3, '3/4': 3, '6/8': 2 },
    chords: ['I III IV iv', 'i iv V i', 'I bVI IV iv', 'I vi ii V', 'I III vi IV', 'IV iv I -', 'I II IV I', 'Imaj7 II IV iv', 'I iii IV V', 'i VI iv V'],
    methods: { bank: 6, markov: 2 },
    richness: [0.2, 0.6], energy: 0.55, space: 0.7, bright: 0.65, dark: 0.25, edge: 0.6, surprise: 0, ornate: 0.9,
    phrasing: { shapes: { fall: 2, pendulum: 2, zigzag: 1.5, triad: 1.5, leap: 1, climb: 1 }, hook: 0.5 },
    palette: {
      melody: ['flute', 'clarinet', 'oboe', 'celesta', 'horn', 'violin'], counter: ['clarinet', 'oboe', 'horn', 'cello', 'bassoon', 'flute'],
      keys: ['pizzicato', 'harp', 'celesta', 'harpsichord'], arp: ['harp', 'pizzicato', 'celesta'], bells: ['celesta', 'glock', 'music-box', 'glass-bell'],
      pad: ['strings', 'choir-oo', 'tremolo-strings', 'organ', 'shimmer'], bass: ['bassoon', 'upright', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['chimes', 'owl', 'birds', 'fire'], kits: ['spell-kit', 'orchestra-kit'], drums: [0, 0.4],
    layers: { keys: 0.85, counter: 0.6, bells: 0.5, arp: 0.35 },
    patterns: { keys: ['broken', 'waltz', 'block'], arp: ['up', 'updown'], bass: ['rootfifth', 'hook', 'held'], drums: ['sparse', 'march', 'pulse'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'] },
    orchestra: { pass: 0.7, double: 0.6 },
  },
  // marleybone: a foggy victorian london of dogs in top hats, and the spiral's grandest waltz. a clarinet
  // over a fluttering harp and chiming bells, the strings swelling in, then the waltz proper: the tune
  // passed from the clarinet to the horns with a harpsichord keeping time, a cymbal crash and the clarinet
  // back, the strings and trumpets carrying it to the top, a hushed celesta passage, then the horns over
  // everyone. its other themes: a cello's tune over a celesta, a key change into harmonic minor with a
  // bell tree, a flute and a bassoon in counterpoint over a pizzicato waltz, a tuba's fanfare, and a
  // march that's dark and joyous at once. (the sneaking detective it used to be is Back alleys)
  gaslamp: {
    group: 'Magic', opens: ['keys', 'arp', 'bass'],
    weave: 0.65, name: 'Gaslamp', colour: '#8a8f6a', style: 'loop',
    scales: { harmonicMinor: 2.5, minor: 1.5, major: 1.5, melodicMinor: 1, dorian: 0.5 }, tempo: [64, 82], tuneTempo: [108, 138],
    meters: { '3/4': 6, '4/4': 2, '6/8': 1 },
    chords: ['i iv V i', 'i bVI ii° V', 'i - iv V', 'i VI ii° V', 'I vi ii V', 'iv i V i', 'I III IV iv', 'i iv bVII III', 'I iv I V', 'i VI III V'],
    methods: { bank: 6, markov: 2 },
    richness: [0.15, 0.5], energy: 0.6, space: 0.55, bright: 0.5, dark: 0.4, edge: 0.7, surprise: 0, ornate: 1,
    phrasing: { shapes: { arch: 2, turn: 2, leap: 2, sigh: 1, pendulum: 1 }, hook: 0.4 },
    palette: {
      melody: ['clarinet', 'oboe', 'violin', 'flute', 'horn'], counter: ['cello', 'bassoon', 'horn', 'flute', 'oboe', 'trombone'],
      keys: ['harpsichord', 'pizzicato', 'harp', 'celesta'], arp: ['harp', 'harpsichord', 'pizzicato', 'celesta'], bells: ['celesta', 'glock', 'music-box'],
      pad: ['strings', 'brass-section', 'tremolo-strings', 'organ'], bass: ['tuba', 'bassoon', 'upright'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['rain', 'creaks', 'fire'], kits: ['orchestra-kit', 'clockwork'], drums: [0.2, 0.7],
    layers: { counter: 0.6, keys: 0.85, pad: 0.65, bells: 0.45 },
    patterns: { keys: ['waltz', 'waltz', 'broken'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'walking', 'hook'], drums: ['sparse', 'march', 'pulse'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell', 'stabs'], bells: ['sparkle'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // dragonspyre: a fallen city of fire and ash. a minor chord with its major seventh held over everyone
  // (imaj7), harps and woodwinds fluttering down, the strings' tune with the brass against it, a lone
  // trumpet's call answered by low brass and a men's choir, a march on the snare and bass drum, woodwind
  // arpeggios swooping like wings, chromatic mediants (bIII and bVI, and a minor key's major III and VI)
  // and a major chord to end a minor phrase on (a picardy third). the fire crackling under it. it took
  // over from epic, which was the same orchestra playing trailers
  dragon: {
    group: 'Magic', opens: ['drone', 'pad', 'drums'],
    build: 0.45, weave: 0.35, name: 'Dragon', colour: '#a33a24', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 2, hungarianMinor: 0.7 }, tempo: [54, 70], tuneTempo: [84, 124],
    meters: { '4/4': 6, '3/4': 1.5, '6/8': 1.5 },
    chords: ['i bII i bII', 'i bVI bVII i', 'i iv bVI V', 'i - bVI -', 'i bVI bIII bVII', 'iv i bVI V', 'i bVI iv V', 'imaj7 iv V I', 'i III bVI V', 'i VI bIII V', 'i bIII VI V'],
    methods: { bank: 6, markov: 1, vamp: 1.5 },
    richness: [0, 0.3], energy: 0.75, space: 0.8, bright: 0.45, dark: 0.75, edge: 0.9, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['horn', 'violin', 'trumpet', 'choir-oo', 'trombone', 'oboe', 'chant-voice', 'cello'], counter: ['trombone', 'horn', 'strings', 'bassoon', 'chant-voice', 'cello'],
      keys: ['pizzicato', 'harp', 'piano', 'harpsichord'], arp: ['harp', 'pizzicato', 'piano'], bells: ['bell', 'glock', 'celesta'],
      pad: ['choir-ah', 'strings', 'organ', 'brass-section', 'dark-pad', 'tremolo-strings'], bass: ['tuba', 'round-bass', 'sub-bass', 'bassoon'], drone: ['organ-drone', 'cello-drone', 'deep-drone'],
    },
    textures: ['fire', 'rumble', 'wind'], kits: ['orchestra-kit', 'taiko'], drums: [0.4, 1],
    layers: { pad: 1, drone: 0.4, counter: 0.6 },
    patterns: { drums: ['tribal', 'march', 'halftime', 'march'], pad: ['sustain', 'pulse', 'stabs', 'swell'], bass: ['octave', 'held', 'pulse'], arp: ['down', 'updown', 'converge'], melody: ['long', 'phrases', 'phrases'], counter: ['counterpoint', 'harmony'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.55, double: 0.3 },
  },
  // krokotopia: a desert empire of crocodile pharaohs, as an orchestra plays it rather than a bazaar
  // band (that's Desert and Egyptian). a tam-tam strikes to open, a harp keeps time under lyres and reeds,
  // horns hold a slow tune of long notes, an oboe dances over it, then the strings with the horn against
  // them. a lyre states a theme twice and a vibraphone takes it. its march: a low flute's dancing tune
  // over an ostinato, passed to the oboe and the horn, hand drums, a triangle on two and a sistrum
  // scraping the off beats, and a royal intrada with the loudest tam-tam of all
  sands: {
    group: 'Magic', opens: ['keys', 'arp', 'drone'],
    weave: 0.5, name: 'Sands', colour: '#c9a14a', style: 'loop',
    scales: { phrygianDominant: 2, harmonicMinor: 2, doubleHarmonic: 1, minor: 1.5, dorian: 0.5 }, tempo: [58, 74], tuneTempo: [88, 118],
    meters: { '4/4': 5, '3/4': 1.5, '6/8': 1 },
    chords: ['I bII I -', 'i iv V i', 'I bII bvii I', 'i bVI V i', 'iv V i -', 'I - bII -', 'i bVI bVII i', 'i iv bVI V'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.6, space: 0.65, bright: 0.55, dark: 0.4, edge: 0.7, surprise: 0, ornate: 1.2,
    phrasing: { shapes: { chant: 1.5, turn: 2, arch: 2, sigh: 1, zigzag: 1 }, rhythm: 'long', hook: 0.3 },
    palette: {
      melody: ['horn', 'oboe', 'flute', 'violin', 'clarinet'], counter: ['horn', 'cello', 'oboe', 'bassoon', 'flute'],
      keys: ['harp', 'lyre', 'pizzicato'], arp: ['harp', 'lyre', 'pizzicato'], bells: ['vibes', 'celesta', 'glock'],
      pad: ['strings', 'brass-section', 'choir-ah', 'tremolo-strings'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'fire', 'stream'], kits: ['palace-kit'], drums: [0.3, 0.8],
    layers: { keys: 0.8, counter: 0.6, pad: 0.75 },
    patterns: { drums: ['march', 'maqsum', 'tribal', 'sparse'], keys: ['broken', 'broken', 'strum'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'held', 'hook'], melody: ['long', 'phrases', 'phrases'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // mooshu: a high gong, then plucked strings (the koto) playing together, and a flute holding a note
  // with a grace on it. its first theme is quick, syncopated and fluttering, the flute calling and the
  // koto answering over finger cymbals. the second is calmer, the bowed strings coming in and the flute
  // holding it out. then the strings keep a figure going and the flute plays both themes as one. the
  // erhu sings the second theme when the plague comes, the brass climbing and the harp and high strings
  // falling. war is dark brass and deep drums in an uneven beat (seven, here five), and its mystic theme
  // a koto in even eighths that feel syncopated, finger cymbals, blocks, a tam-tam and everyone at the end
  jade: {
    group: 'Magic', opens: ['keys', 'arp', 'drone'],
    weave: 0.6, name: 'Jade', colour: '#3f9e7a', style: 'loop',
    scales: { majorPentatonic: 3, minorPentatonic: 1.5, hirajoshi: 1, dorian: 0.7 }, tempo: [56, 72], tuneTempo: [84, 116],
    meters: { '4/4': 6, '3/4': 1, '6/8': 0.5 },
    chords: ['I - IV I', 'vi IV I V', 'I V vi iii', 'IV V iii vi', 'vi - I -', 'I vi IV V', 'i bVII bVI bVII', 'I II IV I'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.55, space: 0.7, bright: 0.6, dark: 0.3, edge: 0.7, surprise: 0, ornate: 1.2,
    phrasing: { shapes: { zigzag: 2, turn: 2, fall: 1.5, pendulum: 1.5, leap: 1 }, rhythm: 'syncopated', hook: 0.5 },
    palette: {
      melody: ['flute', 'shakuhachi', 'erhu', 'koto'], counter: ['erhu', 'cello', 'horn', 'flute', 'shakuhachi'],
      keys: ['koto', 'harp', 'pizzicato', 'zither'], arp: ['koto', 'harp', 'zither', 'pizzicato'], bells: ['glock', 'celesta', 'vibes'],
      pad: ['strings', 'tremolo-strings', 'choir-oo', 'brass-section'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'stream', 'chimes', 'birds'], kits: ['jade-kit', 'temple'], drums: [0.3, 0.8],
    layers: { keys: 0.85, counter: 0.6, pad: 0.7 },
    patterns: { drums: ['sparse', 'march', 'tribal'], keys: ['broken', 'strum'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // avalon: king arthur's land, green and old, with the fae close by. not written up anywhere I could
  // find, so this one's from listening and the spiral's habits: noble horns and strings over a harp, a
  // flute or a whistle with a lilt to it, dorian and mixolydian, a dance in six or three, then everyone at
  // the end. grizzleheim, the north (Longhouse), is a cousin: a men's choir, horns and drums, fifths
  greenwood: {
    group: 'Magic', opens: ['keys', 'arp', 'pad'],
    weave: 0.5, name: 'Greenwood', colour: '#5c8a3a', style: 'loop',
    scales: { dorian: 2.5, mixolydian: 2, major: 1.5, minor: 1 }, tempo: [58, 74], tuneTempo: [96, 126],
    meters: { '6/8': 3, '3/4': 2, '4/4': 3 },
    chords: ['i bVII i -', 'I bVII IV I', 'i bIII bVII i', 'I IV I V', 'i iv bVII III', 'I vi IV V', 'i bVI bVII i', 'IV I V vi'],
    methods: { bank: 5, markov: 2 },
    richness: [0.1, 0.4], energy: 0.55, space: 0.7, bright: 0.6, dark: 0.3, edge: 0.7, surprise: 0, ornate: 1.1,
    phrasing: { shapes: { arch: 2, leap: 2, wave: 1.5, triad: 1.5, turn: 1 }, rhythm: 'dotted', hook: 0.4 },
    palette: {
      melody: ['flute', 'horn', 'violin', 'whistle', 'oboe', 'clarinet'], counter: ['horn', 'cello', 'violin', 'flute', 'bassoon'],
      keys: ['harp', 'pizzicato', 'harpsichord'], arp: ['harp', 'pizzicato', 'lyre'], bells: ['glock', 'celesta', 'music-box'],
      pad: ['strings', 'brass-section', 'choir-ah', 'tremolo-strings'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['birds', 'leaves', 'stream', 'owl'], kits: ['orchestra-kit', 'hand-drums'], drums: [0.2, 0.7],
    layers: { keys: 0.8, counter: 0.6, pad: 0.75 },
    patterns: { drums: ['march', 'sparse', 'pulse', 'tribal'], keys: ['broken', 'waltz', 'strum'], arp: ['up', 'updown'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'long'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['fifths', 'tonic'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },

  // ---------- loud: rock and metal ----------
  // the guitar is the band here (the guitar role, and synth.js's rigs). there are no words, so the
  // tune is a lead guitar or a wordless voice standing in for the singer, and solos come often

  // doom (1993): bobby prince's metal, after metallica, pantera and slayer. a palm muted low string
  // chugging under a riff that walks down the scale (riff()), double kick and a crash every phrase,
  // the bass doubling the riff, twin guitars in harmony, and a solo screaming over the last chorus.
  // as ambient it's drone metal: chords left ringing through fuzz, slowly
  metal: {
    group: 'Loud', opens: ['guitar', 'drums', 'bass'],
    build: 0.25, name: 'Metal', colour: '#9c2f2f', style: 'tune',
    scales: { phrygian: 2, minor: 2, harmonicMinor: 1, minorPentatonic: 1, locrian: 0.3 }, tempo: [56, 76], tuneTempo: [118, 172],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['i - - bII', 'i - bVI bVII', 'i bII i bVII', 'i - bIII bII', 'i bVI bIII bVII', 'i - iv bVI', 'i - bVI V', 'i bVII bVI bVII'],
    methods: { bank: 6, vamp: 2, markov: 0.5 },
    richness: [0, 0.15], energy: 1, space: 0.35, bright: 0.6, dark: 0.7, edge: 1.25, surprise: 0,
    palette: {
      // (the sludge guitar came over when sludge became metal made slow and dark)
      guitar: ['metal-guitar', 'metal-guitar', 'sludge-guitar'], melody: ['metal-lead', 'lead-guitar'], counter: ['lead-guitar', 'metal-lead'],
      pad: ['dark-pad', 'choir-ah', 'strings'], keys: ['felt-keys'], arp: ['pluck-lead'], bells: ['bell'],
      bass: ['pick-bass', 'growl-bass'], drone: ['deep-drone', 'bowed-metal'],
    },
    textures: ['feedback', 'rumble'], kits: ['metal-kit'], drums: [0.5, 1],
    layers: { guitar: 1, keys: 0, arp: 0.05, pad: 0.2, counter: 0.35, bells: 0.05, drone: 0.15, texture: 0.15 },
    patterns: { guitar: ['chug', 'chug', 'power'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['double', 'rock', 'punk', 'double'], 'ambient.drums': ['halftime', 'sparse'], bass: ['riff', 'riff', 'pulse'], counter: ['harmony'], melody: ['phrases', 'riff', 'calls'] },
    forms: METAL_FORMS, solo: 0.9, soloOver: 'B', breakdown: true, fx: { drive: 0.15 },
  },
  // nirvana, hole, alice in chains: a quiet verse on a clean or chorused guitar, then a distortion
  // pedal stamped on for the chorus (loud, quiet, loud), power chords sliding round a minor or bluesy
  // key, a rasping voice, a drummer hitting as hard as they can, and a solo that's half noise
  grunge: {
    group: 'Loud', opens: ['guitar', 'bass', 'drums'],
    name: 'Grunge', colour: '#7e8b4a', style: 'tune',
    scales: { minor: 2, dorian: 1.5, minorPentatonic: 1.5, mixolydian: 1, phrygian: 0.5 }, tempo: [62, 80], tuneTempo: [96, 132],
    meters: { '4/4': 8, '3/4': 1, '6/8': 1 },
    chords: ['i iv bIII bVI', 'i bVII bVI bVII', 'i bIII bVII iv', 'i - bVI bVII', 'i v bVI iv', 'i bII bIII bII', 'I bIII IV bVI', 'i iv bVII bIII'],
    richness: [0, 0.3], energy: 0.9, space: 0.4, bright: 0.5, dark: 0.45, edge: 1, surprise: 0,
    palette: {
      guitar: ['dist-guitar', 'drive-guitar', 'fuzz-guitar'], melody: ['rasp-voice', 'lead-guitar', 'fuzz-lead'], counter: ['lead-guitar', 'chorus-guitar', 'fuzz-lead', 'clean-guitar'],
      pad: ['fuzz-wall', 'strings', 'organ'], keys: ['chorus-guitar', 'clean-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['glass-bell'],
      bass: ['pick-bass', 'fuzz-bass'], drone: ['deep-drone'],
    },
    quiet: ['chorus-guitar', 'clean-guitar', 'crunch-guitar'], loudQuiet: 0.85,
    textures: ['feedback', 'hum'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0, arp: 0.2, pad: 0.15, counter: 0.25, bells: 0.03, drone: 0.05, texture: 0.25 },
    patterns: { guitar: ['power', 'power', 'eighths', 'ring'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['rock', 'rock', 'halftime'], 'ambient.drums': ['halftime', 'sparse'], bass: ['synco', 'pulse', 'rootfifth'], melody: ['phrases', 'calls', 'phrases'] },
    forms: LOUD_FORMS, solo: 0.7, soloOver: 'B', fx: { drive: 0.15 },
  },
  // title fight, citizen, tigers jaw: melodic hardcore and emo. fast punk beats under driving eighths
  // on a distorted guitar, a clean guitar twinkling through the quiet parts, a rasped tune that wants
  // to be shouted back, and a half time breakdown before the last chorus
  hardcore: {
    group: 'Loud', opens: ['drums', 'guitar', 'arp'],
    name: 'Hardcore', colour: '#5fb36b', style: 'tune',
    scales: { major: 2, minor: 2, dorian: 1, mixolydian: 1, majorPentatonic: 0.5 }, tempo: [72, 92], tuneTempo: [138, 196],
    meters: { '4/4': 9, '6/8': 1 },
    chords: ['I V vi IV', 'vi IV I V', 'IV I V vi', 'i bVI bIII bVII', 'I iii vi IV', 'IVmaj7 I V vi', 'ii IV I V', 'i bVII bVI bVII'],
    richness: [0.2, 0.55], energy: 1, space: 0.4, bright: 0.65, dark: 0.3, edge: 1, surprise: 0,
    palette: {
      guitar: ['dist-guitar', 'drive-guitar', 'crunch-guitar'], melody: ['rasp-voice', 'lead-guitar'], counter: ['chorus-guitar', 'clean-guitar', 'lead-guitar'],
      pad: ['strings'], keys: ['clean-guitar'], arp: ['clean-guitar', 'chorus-guitar'], bells: ['glass-bell'],
      bass: ['pick-bass', 'fuzz-bass'], drone: ['deep-drone'],
    },
    quiet: ['clean-guitar', 'chorus-guitar'], loudQuiet: 0.5,
    textures: ['feedback'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0, arp: 0.55, pad: 0.05, counter: 0.25, bells: 0.02, drone: 0.02, texture: 0.15 },
    patterns: { guitar: ['eighths', 'eighths', 'power'], 'ambient.guitar': ['ring', 'strum'], drums: ['punk', 'rock', 'punk'], 'ambient.drums': ['halftime', 'sparse'], arp: ['twinkle', 'twinkle', 'updown'], bass: ['pulse', 'pulse', 'synco'], melody: ['phrases', 'calls', 'phrases'] },
    forms: HARDCORE_FORMS, solo: 0.35, soloOver: 'B', breakdown: true,
  },

  // ---------- hazy: shoegaze and dream pop ----------
  // guitars as a wall of sound, a tune buried in it (bury), and a huge room

  // my bloody valentine, slowdive, lsd and the search for god: fuzz with the tremolo arm never still,
  // so whole chords warp (kevin shields' glide guitar), reverse reverb sucking each chord in, a voice
  // buried in the wall like another guitar, steady drums under a wash of cymbals, and sweet chords
  // (major sevenths, added ninths, a borrowed iv) blurred by the room
  shoegaze: {
    group: 'Loud', opens: ['guitar', 'pad', 'drums'],
    build: 0.35, name: 'Shoegaze', colour: '#e0709a', style: 'tune',
    scales: { major: 2, mixolydian: 2, lydian: 1, dorian: 1, minor: 0.7 }, tempo: [64, 82], tuneTempo: [88, 126],
    meters: { '4/4': 7, '6/8': 1.5, '3/4': 1 },
    chords: ['I IV', 'Imaj7 IVmaj7', 'I bVII IV I', 'I iii IV iv', 'I - IV -', 'IV I V vi', 'I vi IV iv', 'Iadd9 IVadd9', 'I bIII IV I'],
    richness: [0.5, 0.95], energy: 0.75, space: 1, bright: 0.5, dark: 0.2, edge: 0.95, surprise: 0,
    palette: {
      guitar: ['glide-guitar', 'fuzz-guitar'], pad: ['reverse-guitar', 'fuzz-wall', 'swell-guitar', 'glass-pad'], melody: ['dream-voice', 'fuzz-lead'],
      counter: ['chorus-guitar', 'fuzz-lead'], keys: ['chorus-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['glass-bell', 'sine-bell'],
      bass: ['pick-bass', 'round-bass', 'chorus-bass'], drone: ['tape-loop', 'organ-drone'],
    },
    textures: ['feedback', 'hum', 'vinyl'], kits: ['gaze-kit'], drums: [0.25, 0.95],
    layers: { guitar: 1, pad: 0.8, keys: 0, arp: 0.15, counter: 0.3, bells: 0.15, drone: 0.25, texture: 0.3 },
    patterns: { guitar: ['ring', 'tremolo', 'ring', 'strum'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['wash', 'wash', 'rock'], 'ambient.drums': ['wash', 'sparse', 'pulse'], bass: ['pulse', 'held', 'rootfifth'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'long'] },
    forms: GAZE_FORMS, solo: 0.5, bury: 0.8, fx: { wobble: 0.35, drive: 0.1 },
  },
  // slowdive's quieter side, cocteau twins, beach house: chorused clean guitars ringing and picked out
  // in a big echo, a breathy voice floating over them, slow organ and synth pads, and a drum machine
  // ticking away gently
  dreampop: {
    group: 'Loud', opens: ['arp', 'guitar', 'pad', 'drums'],
    name: 'Dream pop', colour: '#8fd3cf', style: 'tune',
    scales: { major: 2, lydian: 1.5, mixolydian: 1, dorian: 1, minor: 0.5 }, tempo: [58, 76], tuneTempo: [72, 104],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1.5 },
    chords: ['Imaj7 IVmaj7', 'I vi IV V', 'I iii vi IV', 'IVmaj7 V iii vi', 'I II IV I', 'vi IV I V', 'I V vi iii', 'Imaj7 iii IVmaj7 iv'],
    richness: [0.45, 0.9], energy: 0.5, space: 0.95, bright: 0.55, dark: 0.15, edge: 0.8, surprise: 0,
    palette: {
      guitar: ['chorus-guitar', 'clean-guitar'], pad: ['swell-guitar', 'analog-pad', 'organ', 'glass-pad', 'choir-oo', 'vox-pad'], melody: ['dream-voice', 'chorus-guitar', 'sine-bell'],
      counter: ['chorus-guitar', 'clean-guitar', 'glass-bell'], keys: ['e-piano', 'chorus-guitar', 'wurlitzer'], arp: ['chorus-guitar', 'clean-guitar', 'harp'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      bass: ['round-bass', 'chorus-bass', 'pick-bass'], drone: ['organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'hum', 'ocean', 'rain'], kits: ['machine', 'gaze-kit'], drums: [0.25, 0.85],
    layers: { guitar: 0.7, pad: 0.8, keys: 0.25, arp: 0.6, counter: 0.25, bells: 0.25, drone: 0.2, texture: 0.4 },
    patterns: { guitar: ['ring', 'strum', 'tremolo'], drums: ['wash', 'groove', 'halftime', 'four'], arp: ['updown', 'up', 'twinkle'], bass: ['held', 'rootfifth', 'pulse'], melody: ['long', 'phrases', 'fragments'] },
    forms: GAZE_FORMS, solo: 0.35, bury: 0.5, fx: { wobble: 0.4 },
  },
  // the cocteau twins (treasure, heaven or las vegas, victorialand): elizabeth fraser's voice soaring
  // and fluttering in words of its own, up front rather than buried, over robin guthrie's chorused
  // guitars cascading through long echoes, simon raymonde's bass playing a tune of its own, and a drum
  // machine. dreamy but melodic: the tune is the point. its flavours are the dancing side and the
  // mellow, sad side (FLAVOURS)
  ethereal: {
    group: 'Loud', opens: ['arp', 'guitar', 'pad', 'bass'],
    build: 0.3, name: 'Ethereal', colour: '#c9a7e8', style: 'tune',
    scales: { major: 2, lydian: 2, mixolydian: 1, dorian: 1 }, tempo: [60, 78], tuneTempo: [92, 116],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1 },
    chords: ['Iadd9 IVmaj7', 'I iii IV iv', 'I V vi IV', 'IVmaj7 I V vi', 'I bVII IV I', 'vi IV I V', 'Imaj7 iii7 IVmaj7 V', 'I II IV I'],
    richness: [0.45, 0.85], energy: 0.6, space: 1, bright: 0.65, dark: 0.15, edge: 0.7, surprise: 0, ornate: 1.3,
    palette: {
      guitar: ['chorus-guitar', 'clean-guitar'], melody: ['dream-voice', 'dream-voice', 'chorus-guitar', 'glass-bell'], counter: ['chorus-guitar', 'clean-guitar', 'glass-bell', 'choir-oo'],
      keys: ['chorus-guitar', 'e-piano', 'harp'], arp: ['chorus-guitar', 'clean-guitar', 'harp', 'celesta'], bells: ['glass-bell', 'celesta', 'sine-bell', 'glock'],
      pad: ['swell-guitar', 'reverse-guitar', 'glass-pad', 'choir-oo', 'shimmer', 'vox-pad'], bass: ['chorus-bass', 'pick-bass', 'round-bass', 'fretless'], drone: ['tape-loop', 'organ-drone'],
    },
    textures: ['vinyl', 'ocean'], kits: ['machine', 'gaze-kit'], drums: [0.3, 0.9],
    layers: { guitar: 0.6, arp: 0.75, pad: 0.8, keys: 0.2, counter: 0.35, bells: 0.3, drone: 0.15, texture: 0.25 },
    patterns: { guitar: ['ring', 'strum', 'tremolo'], arp: ['updown', 'twinkle', 'up', 'down'], drums: ['groove', 'halftime', 'wash'], bass: ['synco', 'rootfifth', 'octave', 'held'], melody: ['phrases', 'phrases', 'long', 'calls'], counter: ['counterpoint', 'harmony'], pad: ['sustain', 'swell'] },
    solo: 0.2, bury: 0.15, fx: { wobble: 0.25, echo: 0.3 },
  },

  // ---------- world and electronic ----------
  // places and genres. they keep to themselves (surprise: 0), so adding them left older moods' songs as
  // they were. a world mood as a boss (desert, angry) is calamity's desert scourge

  // arabian nights, a bazaar, the sands: the phrygian dominant scale (its flat second over a major
  // chord), an oud and a shawm (a zurna) over a drone and hand drums, and the andalusian cadence
  desert: {
    group: 'World', opens: ['drums', 'drone', 'arp', 'keys'],
    build: 0.2, name: 'Desert', colour: '#e0a458', style: 'tune',
    scales: { phrygianDominant: 3, harmonicMinor: 2, hungarianMinor: 1, phrygian: 1 }, tempo: [56, 74], tuneTempo: [92, 124],
    meters: { '4/4': 6, '6/8': 2, '5/4': 0.5 },
    chords: ['I bII', 'I bII I bvii', 'I - bII -', 'iv bII I -', 'I bII bvii I', 'i bVII bVI V', 'i iv V i', 'i bVI V i'],
    methods: { bank: 5, vamp: 3, markov: 0.5 },
    richness: [0, 0.25], energy: 0.6, space: 0.6, bright: 0.55, dark: 0.4, surprise: 0,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad'], melody: ['shawm', 'oud', 'violin', 'pan-flute'], counter: ['oud', 'violin', 'pizzicato'],
      keys: ['oud', 'harp', 'pizzicato'], arp: ['oud', 'harp', 'pizzicato'], bells: ['chime', 'glass-bell'],
      bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'crickets', 'fire'], kits: ['hand-drums', 'taiko'], drums: [0.3, 0.9],
    patterns: { drums: ['tribal', 'groove', 'tribal'], drone: ['tonic', 'fifths'], bass: ['rootfifth', 'pulse', 'held'], melody: ['phrases', 'phrases', 'long'] }, ornate: 1.4,
    orchestra: { pass: 0.35, double: 0.1 },
  },
  // islands, jungles and beaches: steel drums and marimbas over a bouncing bass and hand drums, a
  // little swing, birds and frogs. terraria's jungle, and the tropical half of the desert scourge
  tropical: {
    group: 'World', opens: ['keys', 'drums', 'bass', 'arp'],
    name: 'Tropical', colour: '#3fbf8f', style: 'tune',
    scales: { major: 2, majorPentatonic: 2, mixolydian: 2, dorian: 1 }, tempo: [64, 82], tuneTempo: [100, 128],
    meters: { '4/4': 6, '6/8': 1.5 },
    chords: ['I IV V IV', 'I V vi IV', 'I bVII IV I', 'ii V I -', 'I IV I V', 'vi IV I V', 'I iii IV V'],
    richness: [0.15, 0.55], energy: 0.65, space: 0.45, bright: 0.75, dark: 0.05, swing: 0.25, surprise: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'organ'], melody: ['steel-drum', 'marimba', 'pan-flute', 'whistle', 'kalimba', 'xylophone'], counter: ['marimba', 'kalimba', 'nylon'],
      keys: ['nylon', 'marimba', 'steel-guitar'], arp: ['marimba', 'kalimba', 'steel-drum', 'nylon', 'xylophone'], bells: ['vibes', 'chime'],
      bass: ['pluck-bass', 'upright', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['birds', 'frogs', 'ocean', 'rain', 'stream'], kits: ['hand-drums', 'soft-kit'], drums: [0.2, 0.9],
    patterns: { drums: ['tribal', 'groove', 'groove'], bass: ['synco', 'rootfifth', 'octave'], keys: ['strum', 'block'], melody: ['phrases', 'riff', 'calls'] },
    orchestra: { pass: 0.3, double: 0.3 },
  },
  // woods, villages and taverns: a fiddle, a tin whistle or a bagpipe's chanter over a strummed guitar,
  // open fifths droning, a bodhran, and jigs in 6/8. dorian and mixolydian, the old modes of folk tunes
  folk: {
    group: 'World', opens: ['keys', 'drone', 'drums'],
    build: 0.15, name: 'Folk', colour: '#8fb35a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, major: 2, minor: 1, majorPentatonic: 1 }, tempo: [58, 76], tuneTempo: [96, 132],
    meters: { '6/8': 4, '4/4': 4, '3/4': 2 },
    chords: ['i bVII i bVII', 'I bVII IV I', 'i bIII bVII i', 'I IV I V', 'i iv bVII i', 'I V IV I', 'i bVII bVI bVII', 'I - bVII -'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.6, space: 0.5, bright: 0.6, dark: 0.15, surprise: 0,
    palette: {
      pad: ['strings', 'organ', 'warm-pad'], melody: ['violin', 'whistle', 'pan-flute', 'shawm', 'accordion', 'flute'], counter: ['violin', 'whistle', 'harp', 'clarinet'],
      keys: ['nylon', 'harp', 'steel-guitar', 'zither'], arp: ['harp', 'nylon', 'steel-guitar', 'banjo', 'zither'], bells: ['chime', 'celesta'],
      bass: ['upright', 'round-bass', 'tuba'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['birds', 'leaves', 'stream', 'fire', 'owl'], kits: ['hand-drums'], drums: [0.15, 0.85],
    patterns: { drums: ['groove', 'march', 'tribal'], drone: ['fifths', 'tonic'], bass: ['rootfifth', 'held'], keys: ['strum', 'waltz', 'broken'], melody: ['phrases', 'riff', 'phrases'] }, ornate: 1.3,
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // snow, ice and christmas: celesta and glass bells, a shimmering pad, a waltz now and then, the wind
  // and a fire
  wintry: {
    group: 'World', opens: ['pad', 'keys', 'arp'],
    build: 0.15, name: 'Wintry', colour: '#a9d6e5', style: 'ambient',
    scales: { lydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [56, 74], tuneTempo: [84, 110],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['I II', 'i bVI bIII bVII', 'Imaj7 IVmaj7', 'I iii IV iv', 'vi IV I V', 'i iv bVII bIII', 'IV V iii vi'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.85, bright: 0.8, dark: 0.15, surprise: 0,
    palette: {
      pad: ['glass-pad', 'shimmer', 'strings', 'choir-oo', 'air-pad', 'bowed-vibes'], melody: ['celesta', 'glass-bell', 'flute', 'music-box', 'violin', 'glock'], counter: ['harp', 'celesta', 'flute'],
      keys: ['celesta', 'harp', 'felt-keys', 'piano', 'harpsichord'], arp: ['celesta', 'music-box', 'harp', 'glass-bell', 'glock', 'harpsichord', 'zither'], bells: ['glass-bell', 'chime', 'celesta', 'sine-bell', 'glock'],
      bass: ['round-bass', 'sub-bass', 'upright'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind', 'chimes', 'fire'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.5],
    patterns: { drums: ['pulse', 'sparse', 'groove'], arp: ['up', 'updown', 'twinkle'], melody: ['phrases', 'long'] },
    orchestra: { pass: 0.3, double: 0.35 },
  },
  // night drives in the 80s future (outrun, kavinsky, the hotline miami and far cry blood dragon
  // scores): a saw lead or synth brass over arps, an octave bass in eighths and a drum machine
  synthwave: {
    group: 'Beats', opens: ['arp', 'bass', 'drums', 'pad'],
    build: 0.3, name: 'Synthwave', colour: '#ff6ac1', style: 'tune',
    scales: { minor: 3, dorian: 1.5, major: 1, mixolydian: 1 }, tempo: [76, 94], tuneTempo: [96, 124],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i bVII bVI bVII', 'vi IV I V', 'i iv bVI bVII', 'i - bVI bVII', 'IVmaj7 V iii vi', 'i bIII bVII iv', 'I V vi IV'],
    methods: { bank: 5, markov: 1, vamp: 1 },
    richness: [0.15, 0.5], energy: 0.75, space: 0.7, bright: 0.65, dark: 0.35, edge: 1, surprise: 0,
    palette: {
      pad: ['analog-pad', 'warm-pad', 'strings', 'glass-pad', 'vox-pad'], melody: ['saw-lead', 'synth-brass', 'square-lead', 'soft-lead', 'moog-lead'], counter: ['synth-brass', 'pluck-lead', 'soft-lead'],
      keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'saw-lead', 'sine-bell'], bells: ['sine-bell', 'glass-bell'],
      bass: ['synth-bass', 'reese', 'sub-bass', '808-bass', 'moog-bass'], drone: ['deep-drone'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.3, 1],
    patterns: { drums: ['groove', 'four', 'halftime', 'groove'], bass: ['octave', 'octave', 'pulse'], arp: ['up', 'updown', 'down'], pad: ['sustain', 'swell'], melody: ['phrases', 'long', 'riff'] },
    fx: { wobble: 0.15 },
  },
  // drum and bass: breakbeats at 170 under a reese bass and airy pads, a soft lead floating over them
  // (liquid), or the beat in half time. calamity's cryogen and profaned guardians. as ambient it's the
  // same breaks slowed to a trip hop crawl
  breakbeat: {
    group: 'Beats', opens: ['drums', 'pad', 'bass'],
    build: 0.3, name: 'Breakbeat', colour: '#5ec4ff', style: 'tune',
    scales: { minor: 2.5, dorian: 2, lydian: 0.7, phrygian: 0.7 }, tempo: [80, 92], tuneTempo: [164, 176],
    meters: { '4/4': 1 },
    chords: ['i bVI', 'i - iv -', 'Imaj7 IVmaj7', 'i bVII bVI bVII', 'ii V Imaj7 -', 'i bIII bVII iv', 'vi IV I V'],
    methods: { bank: 4, vamp: 2, markov: 1 },
    richness: [0.4, 0.9], energy: 0.85, space: 0.7, bright: 0.55, dark: 0.4, edge: 0.9, surprise: 0,
    palette: {
      pad: ['air-pad', 'glass-pad', 'analog-pad', 'strings', 'vox-pad'], melody: ['soft-lead', 'sine-bell', 'e-piano', 'saw-lead', 'whistle'],
      counter: ['e-piano', 'pluck-lead', 'sine-bell'], keys: ['e-piano', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano'], bells: ['sine-bell', 'glass-bell'],
      bass: ['reese', 'sub-bass', 'synth-bass', '808-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['rain', 'hum'], kits: ['machine', 'club-kit'], drums: [0.35, 1],
    patterns: { drums: ['break', 'break', 'halftime'], bass: ['held', 'synco', 'held'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'fragments'] },
  },

  // ---------- easy: jazz, lounge, soul and showtime ----------
  // for shops, cafes, towns and anywhere a character's hanging about. they keep to themselves (surprise: 0)

  // a small jazz combo, bebop and cool jazz: a sax or trumpet over piano comping in rootless voicings
  // (comp), a walking bass and a ride cymbal swinging hard. ii V I everywhere, every chord a seventh,
  // and a second horn weaving round the first (counterpoint)
  jazz: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
    name: 'Jazz', colour: '#c98b2b', style: 'tune',
    scales: { major: 2, dorian: 2, mixolydian: 1, melodicMinor: 0.5, minor: 0.7 }, tempo: [64, 84], tuneTempo: [112, 168],
    meters: { '4/4': 8, '3/4': 1.5 },
    chords: ['ii7 V7 Imaj7 Imaj7', 'Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7', 'Imaj7 IV7 iii7 VI7', 'ii7 V7 iii7 VI7', 'Imaj7 bVII7 Imaj7 V7', 'i7 iv7 bVII7 bIIImaj7', 'ii7 V7 i7 i7'],
    methods: { bank: 6, markov: 1 },
    richness: [0.75, 1], energy: 0.6, space: 0.45, bright: 0.55, dark: 0.15, edge: 0.7, swing: 1, swingAmount: [0.5, 0.68], surprise: 0, ornate: 1.1,
    palette: {
      melody: ['alto-sax', 'tenor-sax', 'trumpet', 'mute-trumpet', 'vibes', 'piano'], counter: ['trombone', 'vibes', 'mute-trumpet', 'tenor-sax'],
      keys: ['piano', 'jazz-guitar', 'e-piano', 'hammond'], arp: ['vibes', 'jazz-guitar'], bells: ['vibes'],
      pad: ['brass-section', 'strings', 'organ'], bass: ['upright', 'fretless'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain'], kits: ['jazz-kit', 'brushes'], drums: [0.3, 0.95],
    layers: { counter: 0.55, arp: 0.15, keys: 0.95, bells: 0.05, pad: 0.35 },
    patterns: { drums: ['swing', 'swing', 'brush'], bass: ['walking', 'walking', 'rootfifth'], keys: ['comp', 'comp', 'block'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer', 'harmony'], pad: ['stabs', 'sustain'] },
  },
  // easy listening and bossa nova: a nylon guitar or a rhodes comping the bossa rhythm, a flute, vibes
  // or a breathy tenor floating over it, soft strings, and a rim click and shaker. major sevenths all
  // the way (jobim, the girl from ipanema, a hotel lobby)
  lounge: {
    group: 'Easy', opens: ['keys', 'drums', 'bass'],
    name: 'Lounge', colour: '#e8a87c', style: 'tune',
    scales: { major: 3, lydian: 1, dorian: 1.5, mixolydian: 1 }, tempo: [60, 76], tuneTempo: [92, 128],
    meters: { '4/4': 8, '3/4': 1 },
    chords: ['Imaj7 II7 ii7 V7', 'Imaj7 vi7 ii7 V7', 'ii7 V7 Imaj7 IVmaj7', 'IVmaj7 iii7 ii7 Imaj7', 'Imaj7 IVmaj7', 'i7 IV7', 'Imaj7 - II7 -', 'iii7 vi7 ii7 V7'],
    methods: { bank: 6, markov: 1 },
    richness: [0.7, 1], energy: 0.45, space: 0.55, bright: 0.6, dark: 0.05, edge: 0.5, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['flute', 'vibes', 'tenor-sax', 'nylon', 'mute-trumpet', 'soft-lead'], counter: ['vibes', 'flute', 'strings', 'clarinet'],
      keys: ['nylon', 'e-piano', 'piano', 'jazz-guitar', 'wurlitzer'], arp: ['vibes', 'nylon', 'e-piano'], bells: ['vibes', 'glass-bell'],
      pad: ['strings', 'warm-pad', 'choir-oo'], bass: ['upright', 'fretless', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['ocean', 'vinyl', 'rain'], kits: ['latin-kit', 'brushes'], drums: [0.2, 0.9],
    layers: { counter: 0.45, keys: 0.95 },
    patterns: { drums: ['bossa', 'bossa', 'brush'], keys: ['bossa', 'bossa', 'comp'], bass: ['rootfifth', 'rootfifth', 'held'], counter: ['counterpoint', 'harmony'], melody: ['phrases', 'long', 'phrases'] },
  },
  // soul, r&b and neo soul (d'angelo, erykah badu, a late night radio station): a rhodes or a hammond
  // on ninth chords, a fat bass sliding into the beat, a lazy, behind the beat groove, strings and a
  // horn section, and a voice or a sax with no words, running and sliding between notes
  soul: {
    group: 'Easy', opens: ['keys', 'drums', 'bass'],
    name: 'Soul', colour: '#b0516e', style: 'tune',
    scales: { dorian: 2.5, minor: 1.5, mixolydian: 1.5, major: 1, minorPentatonic: 1 }, tempo: [62, 78], tuneTempo: [72, 98],
    meters: { '4/4': 1 },
    chords: ['i7 iv7', 'IVmaj7 V7 iii7 vi7', 'ii7 V7 Imaj7 -', 'vi7 ii7 V7 Imaj7', 'Imaj7 iii7 IVmaj7 iv7', 'i7 iv7 bVII7 bIIImaj7', 'i7 - bVIImaj7 -', 'IVmaj7 - iii7 vi7'],
    methods: { bank: 6, vamp: 1 },
    richness: [0.8, 1], energy: 0.55, space: 0.45, bright: 0.45, dark: 0.2, edge: 0.7, swing: 0.6, swingAmount: [0.15, 0.35], surprise: 0, ornate: 1.2,
    palette: {
      melody: ['soul-voice', 'alto-sax', 'e-piano', 'mute-trumpet', 'soft-lead'], counter: ['strings', 'tenor-sax', 'e-piano', 'soft-lead'],
      keys: ['e-piano', 'hammond', 'piano', 'wurlitzer'], arp: ['e-piano', 'vibes'], bells: ['vibes', 'glass-bell'],
      pad: ['strings', 'brass-section', 'warm-pad', 'choir-oo'], bass: ['slap-bass', 'fretless', 'pluck-bass', 'sub-bass', '808-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain'], kits: ['lofi-kit', 'funk-kit', 'tight-kit'], drums: [0.35, 0.95],
    layers: { counter: 0.5, keys: 0.95 },
    patterns: { drums: ['halftime', 'groove', 'groove'], bass: ['synco', 'hook', 'held'], keys: ['block', 'comp', 'strum'], pad: ['sustain', 'swell', 'stabs'], counter: ['counterpoint', 'answer'] },
    fx: { wobble: 0.15 },
  },
  // funk and disco with the lights on: mettaton's death by glamour, a big band in sequins. a horn
  // section stabbing, a sax or trumpet tune with a second horn line against it, a slap bass jumping
  // octaves, a clean guitar scratching sixteenths (funk), a clavinet, and four on the floor
  showtime: {
    group: 'Easy', opens: ['drums', 'bass', 'guitar'],
    name: 'Showtime', colour: '#ff4fa0', style: 'tune',
    scales: { dorian: 2, minor: 2, mixolydian: 1.5, major: 1, harmonicMinor: 0.5 }, tempo: [80, 100], tuneTempo: [112, 132],
    meters: { '4/4': 1 },
    chords: ['i7 IV7', 'i7 bVII7 bVI7 V7', 'ii7 V7 Imaj7 VI7', 'i7 iv7 bVII7 bIIImaj7', 'I7 IV7', 'i7 - bVI7 V7', 'IVmaj7 V7 iii7 vi7', 'i7 bVII7 i7 bVII7'],
    methods: { bank: 6, vamp: 1 },
    richness: [0.5, 0.85], energy: 0.9, space: 0.4, bright: 0.7, dark: 0.25, edge: 1, swing: 0.2, surprise: 0, ornate: 1.1,
    palette: {
      guitar: ['clean-guitar', 'chorus-guitar'], melody: ['alto-sax', 'trumpet', 'tenor-sax', 'synth-brass', 'soul-voice'], counter: ['trumpet', 'trombone', 'tenor-sax', 'strings'],
      keys: ['clavinet', 'e-piano', 'hammond', 'wurlitzer'], arp: ['clavinet', 'pluck-lead'], bells: ['glock', 'vibes'],
      pad: ['brass-section', 'strings'], bass: ['slap-bass', 'synth-bass', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: [], kits: ['funk-kit'], drums: [0.4, 1],
    layers: { guitar: 0.75, pad: 0.85, counter: 0.55, keys: 0.5, bells: 0.02, drone: 0 },
    patterns: { guitar: ['funk', 'funk'], drums: ['funk', 'four', 'funk'], bass: ['octave', 'hook', 'synco', 'octave'], pad: ['stabs', 'stabs', 'swell'], keys: ['block', 'skank'], counter: ['counterpoint', 'harmony', 'answer'], melody: ['phrases', 'riff', 'calls'] },
    fx: { drive: 0.1 },
    orchestra: { pass: 0.35, double: 0.2 },
  },
  // a game's shop (toby fox's hip shop in deltarune, and undertale's shops): a short loop to browse to.
  // the bass is the hook, a line of its own bouncing round the chords and walking into the next one,
  // with the tune talking to it in short calls and leaving it gaps. jazzy seventh chords on an
  // electric piano, a lazy swung beat, and not much else: four parts that each know their job
  shop: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
    name: 'Shop', colour: '#e8a33d', style: 'loop',
    scales: { dorian: 3, mixolydian: 2, minor: 1, major: 1, minorPentatonic: 0.5 }, tempo: [70, 88], tuneTempo: [92, 116],
    meters: { '4/4': 1 },
    chords: ['i7 IV7', 'ii7 V7 Imaj7 vi7', 'i7 iv7 bVII7 bIIImaj7', 'Imaj7 IV7', 'i7 bVI7 bVII7 i7', 'IVmaj7 iii7 ii7 V7', 'i7 - IV7 -', 'vi7 ii7 V7 Imaj7'],
    methods: { bank: 6, vamp: 1.5 },
    chordBars: [1, 1, 2],
    richness: [0.55, 0.9], energy: 0.6, space: 0.35, bright: 0.6, dark: 0.15, edge: 0.75, swing: 0.75, swingAmount: [0.2, 0.42], surprise: 0, ornate: 1,
    palette: {
      melody: ['e-piano', 'vibes', 'mute-trumpet', 'soft-lead', 'pulse-lead', 'alto-sax', 'marimba', 'whistle'], counter: ['vibes', 'mute-trumpet', 'alto-sax', 'clavinet'],
      keys: ['e-piano', 'wurlitzer', 'clavinet', 'hammond', 'piano'], arp: ['marimba', 'vibes', 'pluck-lead'], bells: ['glock', 'vibes'],
      pad: ['hammond', 'strings', 'warm-pad'], bass: ['slap-bass', 'fretless', 'pluck-bass', 'upright', 'synth-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl'], kits: ['lofi-kit', 'funk-kit', 'boombap-kit'], drums: [0.5, 1],
    layers: { keys: 0.9, pad: 0.3, counter: 0.35, arp: 0.25, bells: 0.15, drone: 0, texture: 0.3 },
    patterns: { bass: ['hook', 'hook', 'synco'], drums: ['groove', 'halftime', 'boombap', 'funk'], keys: ['comp', 'block', 'skank'], melody: ['calls', 'riff', 'phrases'], counter: ['answer', 'counterpoint'], pad: ['stabs', 'sustain'] },
    orchestra: { pass: 0.2, double: 0.2 },
  },

  // ---------- roots: the blues and country ----------

  // the blues: twelve bars of three chords, each a bar long and each a dominant seventh, a shuffle
  // swinging in triplets, a boogie bass, and a harmonica or guitar bending its notes up from the
  // blue note (the minor third bent towards the major one is the sound of the blues)
  blues: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
    name: 'Blues', colour: '#3d5a99', style: 'tune',
    scales: { blues: 2, minorPentatonic: 2, mixolydian: 2, dorian: 1 }, tempo: [56, 72], tuneTempo: [72, 124],
    meters: { '4/4': 8, '6/8': 2 },
    chords: ['I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', 'I7 IV7 I7 V7'],
    methods: { bank: 1 }, chordBars: [1],
    richness: [0.3, 0.6], energy: 0.6, space: 0.45, bright: 0.45, dark: 0.3, edge: 0.8, swing: 1, swingAmount: [0.6, 0.7], surprise: 0, ornate: 1.4,
    palette: {
      guitar: ['crunch-guitar', 'clean-guitar'], melody: ['harmonica', 'lead-guitar', 'tenor-sax', 'piano'], counter: ['harmonica', 'piano', 'hammond', 'trombone'],
      keys: ['piano', 'hammond', 'e-piano', 'wurlitzer'], arp: ['piano', 'jazz-guitar'], bells: ['vibes'],
      pad: ['hammond', 'organ', 'brass-section'], bass: ['upright', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain', 'crickets'], kits: ['brushes', 'jazz-kit', 'tight-kit'], drums: [0.25, 0.95],
    layers: { guitar: 0.4, counter: 0.45, keys: 0.6 },
    patterns: { drums: ['shuffle', 'shuffle', 'swing'], bass: ['boogie', 'walking', 'boogie'], keys: ['comp', 'block', 'strum'], melody: ['calls', 'phrases', 'calls'], counter: ['answer', 'counterpoint'], guitar: ['power', 'eighths'] },
  },
  // country and bluegrass: an acoustic guitar playing boom chick (a bass note, then the chord), a banjo
  // rolling, a fiddle or a harmonica with the tune, a pedal steel crying and sliding underneath, a
  // root and fifth bass, and the train beat on a snare
  country: {
    group: 'Easy', opens: ['guitar', 'bass', 'drums'],
    name: 'Country', colour: '#c69c5d', style: 'tune',
    scales: { major: 4, mixolydian: 1.5, majorPentatonic: 2 }, tempo: [60, 76], tuneTempo: [96, 140],
    meters: { '4/4': 6, '3/4': 2, '6/8': 0.5 },
    chords: ['I IV V I', 'I - IV I', 'I IV I V', 'I V vi IV', 'I I7 IV iv', 'I vi IV V', 'I - V -', 'IV I V I', 'I II7 V7 I'],
    richness: [0, 0.3], energy: 0.65, space: 0.4, bright: 0.7, dark: 0.05, edge: 0.7, swing: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      guitar: ['steel-guitar', 'clean-guitar'], melody: ['violin', 'harmonica', 'pedal-steel', 'banjo', 'whistle'], counter: ['pedal-steel', 'violin', 'harmonica'],
      arp: ['banjo', 'banjo', 'steel-guitar', 'nylon', 'harp'], keys: ['piano', 'steel-guitar'], bells: ['chime'],
      pad: ['strings', 'organ'], bass: ['upright', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['crickets', 'birds', 'fire', 'leaves'], kits: ['brushes', 'soft-kit', 'tight-kit'], drums: [0.2, 0.9],
    layers: { guitar: 0.9, counter: 0.5, arp: 0.45, keys: 0.25, pad: 0.25, bells: 0.03, drone: 0.03 },
    patterns: { guitar: ['boomchick', 'boomchick', 'strum'], arp: ['roll', 'roll'], drums: ['train', 'groove', 'train'], bass: ['rootfifth', 'rootfifth', 'walking'], counter: ['counterpoint', 'answer', 'harmony'], melody: ['phrases', 'phrases', 'calls'] },
  },

  // ---------- more world ----------

  // japan and china: pentatonic tunes on a shakuhachi or an erhu, a koto plucking under them, temple
  // drums and a gong, long held notes bent and slid into. very little harmony: a drone and a chord or
  // two
  fareast: {
    group: 'World', opens: ['drone', 'keys', 'drums', 'arp'],
    build: 0.2, name: 'Far east', colour: '#d9534f', style: 'tune',
    scales: { majorPentatonic: 3, hirajoshi: 2, inSen: 1.5, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [80, 116],
    meters: { '4/4': 6, '3/4': 1, '6/8': 0.5 },
    chords: ['I vi', 'I - V -', 'vi IV I V', 'i bVI', 'i - bII -', 'I V vi iii', 'vi - I -', 'i iv', 'I II'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.2], energy: 0.45, space: 0.75, bright: 0.55, dark: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['shakuhachi', 'erhu', 'koto', 'flute'], counter: ['erhu', 'koto', 'shakuhachi'],
      keys: ['koto', 'shamisen', 'harp'], arp: ['koto', 'shamisen', 'harp'], bells: ['glass-bell', 'chime', 'bell'],
      pad: ['strings', 'choir-oo', 'air-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'stream', 'chimes', 'birds'], kits: ['temple', 'taiko'], drums: [0.25, 0.85],
    patterns: { drums: ['tribal', 'march', 'sparse'], drone: ['tonic', 'fifths'], arp: ['up', 'updown', 'converge'], melody: ['phrases', 'long', 'phrases'], counter: ['counterpoint', 'answer'], bass: ['held', 'rootfifth'] },
    orchestra: { pass: 0.35, double: 0.1 },
  },
  // india: a raga over a tanpura plucked round and round (cycle), a sitar or a bansuri gliding between
  // notes (meend) and graced on nearly every one, a santoor shimmering, and tabla playing a tala. no
  // chord changes at all, really: the drone is the harmony
  raga: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    build: 0.2, name: 'Raga', colour: '#ff9933', style: 'tune',
    scales: { mixolydian: 2, dorian: 2, doubleHarmonic: 1.5, phrygianDominant: 1, lydian: 1, major: 1 }, tempo: [50, 66], tuneTempo: [76, 120],
    meters: { '4/4': 6, '6/8': 1, '5/4': 0.5 },
    chords: ['I', 'I - - bVII', 'i', 'I - - IV', 'i - - bVII'],
    methods: { bank: 3, vamp: 2 },
    richness: [0, 0.1], energy: 0.5, space: 0.65, bright: 0.6, dark: 0.25, edge: 0.7, surprise: 0, ornate: 1.5,
    palette: {
      melody: ['sitar', 'bansuri', 'shawm', 'violin'], counter: ['bansuri', 'sitar', 'violin'],
      keys: ['santoor', 'sitar', 'harp'], arp: ['santoor', 'sitar'], bells: ['chime', 'glass-bell'],
      pad: ['harmonium', 'strings', 'choir-ah'], bass: ['sub-bass', 'round-bass'], drone: ['tanpura', 'tanpura', 'cello-drone'],
    },
    textures: ['birds', 'crickets', 'stream'], kits: ['tabla'], drums: [0.45, 0.95],
    layers: { drone: 0.95, bass: 0.35, pad: 0.4 },
    patterns: { drums: ['tala', 'tala', 'tribal'], drone: ['cycle', 'cycle'], melody: ['phrases', 'long', 'phrases'], counter: ['answer', 'counterpoint'], arp: ['up', 'updown'], bass: ['held', 'held', 'rootfifth'] },
  },
  // reggae: the one drop (the kick and snare together on the third beat and nothing on the first), the
  // organ and guitar chopping the off beats (skank), a deep, round bass carrying the tune as much as
  // the root, and a melodica or a horn on top. laid back, and a little swung
  reggae: {
    group: 'World', opens: ['drums', 'bass', 'keys'],
    name: 'Reggae', colour: '#3a9d23', style: 'tune',
    scales: { major: 2, mixolydian: 1.5, dorian: 2, minor: 1 }, tempo: [62, 74], tuneTempo: [70, 90],
    meters: { '4/4': 1 },
    chords: ['I IV', 'I - IV -', 'i iv', 'I V vi IV', 'i bVII', 'ii V', 'I IV V IV', 'vi IV I V'],
    richness: [0.1, 0.4], energy: 0.55, space: 0.55, bright: 0.6, dark: 0.15, edge: 0.75, swing: 0.5, surprise: 0, ornate: 0.9,
    palette: {
      melody: ['melodica', 'trumpet', 'soft-lead', 'alto-sax', 'whistle'], counter: ['trombone', 'melodica', 'trumpet'],
      keys: ['hammond', 'piano', 'e-piano', 'clavinet', 'wurlitzer'], arp: ['clean-guitar', 'e-piano'], bells: ['vibes'],
      pad: ['hammond', 'organ', 'brass-section'], bass: ['round-bass', 'sub-bass', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['ocean', 'birds', 'vinyl'], kits: ['funk-kit', 'tight-kit', 'lofi-kit'], drums: [0.4, 1],
    layers: { keys: 0.95 },
    patterns: { drums: ['onedrop', 'onedrop', 'groove'], keys: ['skank', 'skank'], bass: ['synco', 'held', 'synco'], pad: ['sustain', 'stabs'], melody: ['phrases', 'calls'], counter: ['answer', 'harmony', 'counterpoint'] },
  },


  // ---------- the ancient world, more of the world, pop and places ----------
  // they keep to themselves (surprise: 0), and their most local instruments, kits and scenery are own

  // the aztecs and the maya: clay flutes and ocarinas over slit drums (the teponaztli), the big hand
  // drum (huehuetl), rattles and a bone scraper. a death whistle screams far off and a conch calls.
  // pentatonic tunes over a drone, hardly any chords. and wizard101's azteca, the jungle adventure: a
  // marimba taking the tune, strings and a horn swelling under it, and a bass that moves
  aztec: {
    group: 'Ancient', opens: ['drums', 'drone', 'arp'],
    build: 0.25, name: 'Aztec', colour: '#c0603a', style: 'tune',
    scales: { minorPentatonic: 3, majorPentatonic: 1, phrygian: 1, dorian: 1 }, tempo: [60, 76], tuneTempo: [92, 120],
    meters: { '4/4': 6, '3/4': 1, '6/8': 1.5 },
    chords: ['i bVII', 'i - bVII -', 'i iv', 'i bVI bVII i', 'i - - bVII', 'i v'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.6, bright: 0.5, dark: 0.45, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['ocarina', 'pan-flute', 'marimba', 'blown-bottle', 'flute'], counter: ['pan-flute', 'ocarina', 'horn', 'marimba'],
      keys: ['marimba', 'xylophone', 'kalimba'], arp: ['marimba', 'xylophone', 'kalimba'], bells: ['chime', 'glass-bell', 'xylophone'],
      pad: ['choir-ah', 'strings', 'air-pad', 'dark-pad'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone'],
    },
    textures: ['death-whistle', 'conch', 'rainstick', 'birds', 'wind'], kits: ['aztec-kit'], drums: [0.4, 0.95],
    patterns: { drums: ['tribal', 'tribal', 'march'], drone: ['tonic', 'fifths'], melody: ['phrases', 'calls', 'phrases'], bass: ['held', 'hook', 'pulse', 'rootfifth'], arp: ['up', 'updown', 'converge'] },
    orchestra: { pass: 0.45, double: 0.3 },
  },
  // drums round a fire: ghana's bobobo drums, stamping and clapping, a mbira or kalimba ringing a riff
  // over and over, a chant, and a didgeridoo's drone. one or two chords, riffs that go round, and
  // often in twelve (6/8)
  tribal: {
    group: 'Ancient', opens: ['drums', 'keys', 'drone'],
    build: 0.35, name: 'Tribal', colour: '#a0522d', style: 'tune',
    scales: { minorPentatonic: 3, majorPentatonic: 2, dorian: 1, mixolydian: 1 }, tempo: [66, 84], tuneTempo: [96, 128],
    meters: { '4/4': 5, '6/8': 3, '3/4': 0.5 },
    chords: ['I', 'i', 'I IV', 'i bVII', 'I - IV -', 'i - iv -', 'I bVII IV I'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.2], energy: 0.75, space: 0.45, bright: 0.6, dark: 0.3, surprise: 0,
    palette: {
      melody: ['mbira', 'kalimba', 'marimba', 'ocarina'], counter: ['kalimba', 'marimba', 'mbira'],
      keys: ['mbira', 'marimba', 'kalimba'], arp: ['kalimba', 'mbira', 'marimba', 'xylophone'], bells: ['chime'],
      pad: ['choir-ah', 'choir-oo', 'air-pad'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['didgeridoo', 'didgeridoo', 'deep-drone'],
    },
    textures: ['rainstick', 'birds', 'frogs', 'fire', 'crickets'], kits: ['african-drums', 'stomp-kit'], drums: [0.6, 1],
    patterns: { drums: ['tribal', 'tribal', 'gallop', 'groove'], drone: ['tonic'], bass: ['pulse', 'synco', 'rootfifth'], melody: ['riff', 'phrases', 'calls'], arp: ['up', 'updown', 'random'] },
  },
  // ancient egypt: the double harmonic scale (hijaz, two flat seconds' worth of strangeness), a mizmar
  // (the shawm) or an oboe over a lyre and an oud, strings swelling like a film's, and the darbuka
  // playing maqsum with finger cymbals and a riq
  egyptian: {
    group: 'Ancient', opens: ['drums', 'drone', 'arp', 'keys'],
    build: 0.25, name: 'Egyptian', colour: '#d4a53c', style: 'tune',
    scales: { doubleHarmonic: 3, phrygianDominant: 3, harmonicMinor: 1 }, tempo: [60, 78], tuneTempo: [96, 126],
    meters: { '4/4': 6, '6/8': 1, '5/4': 0.5 },
    chords: ['I bII', 'I bII I -', 'i iv V i', 'I - bII -', 'I bII bvii I', 'i bVI V -', 'iv V i -'],
    methods: { bank: 5, vamp: 3 },
    richness: [0, 0.2], energy: 0.6, space: 0.6, bright: 0.6, dark: 0.45, surprise: 0, ornate: 1.4,
    palette: {
      melody: ['shawm', 'oboe', 'violin', 'flute', 'lyre'], counter: ['oud', 'violin', 'lyre', 'flute'],
      keys: ['oud', 'lyre', 'harp', 'santoor'], arp: ['lyre', 'harp', 'oud', 'santoor'], bells: ['chime', 'glass-bell'],
      pad: ['strings', 'choir-ah', 'warm-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'fire', 'crickets'], kits: ['darbuka-kit'], drums: [0.35, 0.95],
    patterns: { drums: ['maqsum', 'maqsum', 'tribal'], drone: ['tonic', 'fifths'], melody: ['phrases', 'phrases', 'long'], bass: ['rootfifth', 'pulse', 'held'] },
    orchestra: { pass: 0.35, double: 0.1 },
  },
  // greece and rome: a lyre and a harp, an aulos (the oboe) or pan pipes, horns for rome's legions, a
  // choir in a temple, a frame drum and finger cymbals, and the old modes (dorian, phrygian, mixolydian)
  antiquity: {
    group: 'Ancient', opens: ['keys', 'pad', 'drums'],
    build: 0.3, name: 'Antiquity', colour: '#b9a77a', style: 'tune',
    scales: { dorian: 3, phrygian: 1.5, mixolydian: 1.5, minor: 1, lydian: 0.5 }, tempo: [56, 72], tuneTempo: [88, 116],
    meters: { '4/4': 5, '3/4': 2, '6/8': 1, '5/4': 0.7 },
    chords: ['i bVII i -', 'i iv i bVII', 'I bVII I -', 'i bIII bVII i', 'I IV I V', 'i v i bVII'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.5, space: 0.7, bright: 0.6, dark: 0.3, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['oboe', 'pan-flute', 'lyre', 'horn', 'flute', 'chant-voice'], counter: ['lyre', 'harp', 'pan-flute', 'oboe'],
      keys: ['lyre', 'harp', 'pizzicato'], arp: ['lyre', 'harp', 'pizzicato'], bells: ['glass-bell', 'chime', 'bell'],
      pad: ['choir-ah', 'choir-oo', 'strings', 'brass-section'], bass: ['upright', 'round-bass', 'bassoon'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'fire', 'stream', 'birds'], kits: ['darbuka-kit', 'orchestra-kit'], drums: [0.25, 0.9],
    patterns: { drums: ['march', 'tribal', 'halftime'], melody: ['phrases', 'long', 'phrases'], keys: ['strum', 'broken', 'waltz'], bass: ['rootfifth', 'held'] },
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // castles and taverns: a bagpipe, a recorder or a shawm, a fiddle, a harpsichord or a lyre for the
  // lute, a chamber organ, a bassoon underneath, open fifths droning, and a tabor beating a dance in
  // six or three
  medieval: {
    group: 'Ancient', opens: ['drone', 'keys', 'drums'],
    build: 0.2, name: 'Medieval', colour: '#7d8c4a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, minor: 1.5, major: 1 }, tempo: [58, 74], tuneTempo: [96, 132],
    meters: { '6/8': 3, '3/4': 3, '4/4': 4 },
    chords: ['i bVII i -', 'I bVII IV I', 'i bVII bVI bVII', 'i iv v i', 'I IV I V', 'i bIII bVII i'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.15], energy: 0.6, space: 0.55, bright: 0.6, dark: 0.25, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['bagpipe', 'whistle', 'shawm', 'violin', 'flute', 'chant-voice'], counter: ['whistle', 'violin', 'bowed-psaltery', 'oboe'],
      keys: ['harpsichord', 'lyre', 'harp', 'oud', 'zither'], arp: ['harpsichord', 'lyre', 'harp', 'oud', 'zither'], bells: ['chime', 'bell'],
      pad: ['organ', 'choir-ah', 'strings'], bass: ['bassoon', 'upright', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['fire', 'birds', 'leaves', 'owl'], kits: ['hand-drums', 'stomp-kit'], drums: [0.15, 0.9],
    patterns: { drums: ['march', 'groove', 'tribal'], drone: ['fifths', 'tonic'], keys: ['strum', 'waltz', 'broken'], bass: ['rootfifth', 'held'], melody: ['phrases', 'riff', 'phrases'] },
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // the mongolian steppe: throat singing, often singing the tune itself (a sung line, gliding from note
  // to note: singLine() in synth.js) with the low kargyraa or cellos droning under it, or holding the home
  // note under a horse head fiddle (the erhu, its chinese cousin, stands in) or a flute. a plucked
  // zither (the koto stands in for the yatga), and a shaman's drum galloping. pentatonic, wide open,
  // hardly any chords
  steppe: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    build: 0.25, name: 'Steppe', colour: '#6f9fb8', style: 'tune',
    scales: { majorPentatonic: 3, minorPentatonic: 2, dorian: 1, mixolydian: 1 }, tempo: [56, 72], tuneTempo: [92, 124],
    meters: { '4/4': 4, '6/8': 3, '3/4': 1 },
    chords: ['I', 'I - IV -', 'i', 'I V', 'i bVII', 'I - V -', 'vi - I -'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.75, bright: 0.55, dark: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['throat-singing', 'throat-singing', 'throat-singing', 'erhu', 'flute', 'shakuhachi'], counter: ['erhu', 'throat-singing', 'koto', 'flute'],
      keys: ['koto', 'harp', 'nylon', 'zither'], arp: ['koto', 'harp', 'nylon', 'zither'], bells: ['chime'],
      pad: ['strings', 'choir-oo', 'air-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['throat-singing', 'throat-singing', 'kargyraa', 'cello-drone'],
    },
    textures: ['wind', 'fire', 'crickets', 'birds'], kits: ['shaman-drum'], drums: [0.3, 0.95],
    layers: { drone: 0.9 },
    patterns: { drums: ['gallop', 'gallop', 'tribal'], drone: ['tonic'], melody: ['phrases', 'long', 'phrases'], bass: ['held', 'rootfifth', 'pulse'], arp: ['up', 'updown'] },
  },
  // java and bali: the bonang's kettle gongs playing interlocking patterns, metallophones, a suling
  // (the flute), the kendang drumming, and the big gong coming round every cycle. pelog and slendro
  gamelan: {
    group: 'World', opens: ['arp', 'drums', 'keys'],
    build: 0.25, name: 'Gamelan', colour: '#c9a227', style: 'tune',
    scales: { pelog: 3, slendro: 3, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [84, 120],
    meters: { '4/4': 1 },
    chords: ['i', 'i - bII -', 'I', 'I - IV -', 'i bVI', 'vi - I -'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.1], energy: 0.6, space: 0.6, bright: 0.65, dark: 0.3, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['bonang', 'flute', 'vibes', 'xylophone'], counter: ['bonang', 'vibes', 'marimba'],
      keys: ['vibes', 'marimba', 'bonang'], arp: ['bonang', 'glock', 'xylophone', 'marimba'], bells: ['glock', 'chime', 'bonang'],
      pad: ['choir-oo', 'air-pad', 'glass-pad'], bass: ['sub-bass', 'round-bass'], drone: ['deep-drone', 'organ-drone'],
    },
    textures: ['birds', 'frogs', 'rain', 'stream'], kits: ['gamelan-kit'], drums: [0.4, 0.95],
    layers: { arp: 0.8, bells: 0.5 },
    patterns: { drums: ['tribal', 'march', 'tribal'], arp: ['up', 'updown', 'converge', 'random'], melody: ['riff', 'phrases', 'phrases'], bells: ['phasing', 'sparkle'], bass: ['held', 'pulse'] },
  },
  // andalusia: flamenco's nylon guitar strumming (rasgueado) the andalusian cadence (four chords
  // stepping down to a major chord on the scale's fifth), palmas clapping, a cajon, and a violin or a
  // trumpet crying over it in the phrygian dominant
  flamenco: {
    group: 'World', opens: ['keys', 'drums'],
    build: 0.2, name: 'Flamenco', colour: '#b3263a', style: 'tune',
    scales: { phrygianDominant: 3, phrygian: 2, harmonicMinor: 1 }, tempo: [60, 76], tuneTempo: [100, 132],
    meters: { '3/4': 3, '6/8': 2, '4/4': 3 },
    chords: ['iv bIII bII I', 'I bII I -', 'I bII bIII bII', 'iv - bII I', 'I - bII -', 'iv bIII bII bII'],
    methods: { bank: 6, vamp: 1 },
    richness: [0, 0.3], energy: 0.75, space: 0.45, bright: 0.6, dark: 0.4, surprise: 0, ornate: 1.3,
    palette: {
      melody: ['nylon', 'violin', 'trumpet', 'flute'], counter: ['violin', 'oboe', 'nylon'],
      keys: ['nylon', 'steel-guitar', 'harp'], arp: ['nylon', 'harp', 'steel-guitar'], bells: ['chime'],
      pad: ['strings', 'choir-ah'], bass: ['upright', 'round-bass'], drone: ['cello-drone'],
    },
    textures: ['fire', 'crickets'], kits: ['cajon-kit', 'stomp-kit'], drums: [0.3, 0.95],
    layers: { keys: 0.95 },
    patterns: { drums: ['groove', 'halftime', 'tribal'], keys: ['strum', 'strum', 'broken'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'calls'] },
  },

  // pop: four chords (I V vi IV and its friends), a bright piano or a plucked synth with the hook, a
  // string machine and pads, a strummed guitar now and then, and a tight kit on a backbeat or four on
  // the floor
  pop: {
    group: 'Beats', opens: ['keys', 'drums', 'bass'],
    build: 0.2, name: 'Pop', colour: '#ff7eb6', style: 'tune',
    scales: { major: 4, mixolydian: 1, minor: 1.5, dorian: 0.5 }, tempo: [70, 90], tuneTempo: [100, 124],
    meters: { '4/4': 1 },
    chords: ['I V vi IV', 'vi IV I V', 'I vi IV V', 'IV I V vi', 'I V IV IV', 'vi V IV V', 'I iii IV V', 'IV V vi -'],
    methods: { bank: 6, markov: 1 },
    richness: [0.15, 0.5], energy: 0.75, space: 0.5, bright: 0.75, dark: 0.1, edge: 0.9, surprise: 0,
    palette: {
      guitar: ['clean-guitar', 'chorus-guitar'], melody: ['pluck-lead', 'soft-lead', 'piano', 'e-piano', 'synth-brass', 'whistle'], counter: ['soft-lead', 'piano', 'synth-strings', 'pluck-lead'],
      keys: ['piano', 'e-piano', 'wurlitzer', 'steel-guitar'], arp: ['pluck-lead', 'piano', 'e-piano', 'marimba'], bells: ['glock', 'sine-bell', 'celesta'],
      pad: ['synth-strings', 'warm-pad', 'strings', 'analog-pad'], bass: ['pluck-bass', 'synth-bass', 'slap-bass'], drone: ['organ-drone'],
    },
    textures: [], kits: ['tight-kit', 'club-kit', 'cajon-kit'], drums: [0.4, 1],
    layers: { guitar: 0.4, texture: 0, drone: 0 },
    patterns: { guitar: ['strum', 'ring', 'eighths'], drums: ['groove', 'four', 'groove', 'halftime'], bass: ['octave', 'synco', 'rootfifth', 'pulse'], keys: ['block', 'strum', 'broken'], melody: ['phrases', 'riff', 'phrases', 'calls'], pad: ['sustain', 'pulse', 'swell'] },
  },
  // hip hop with no rapper, the beat tape (j dilla, nujabes, pete rock): a dusty kit swinging a boom
  // bap beat, a rhodes or a piano looping jazzy chords, an upright or an 808, strings and an orchestra
  // hit for stabs, vinyl crackle and a dj's scratches
  hiphop: {
    group: 'Beats', opens: ['drums', 'keys', 'bass'],
    name: 'Hip hop', colour: '#8d6e63', style: 'tune',
    scales: { minor: 2, dorian: 2.5, minorPentatonic: 1, major: 0.5 }, tempo: [72, 84], tuneTempo: [84, 96],
    meters: { '4/4': 1 },
    chords: ['i7 iv7', 'ii7 V7 Imaj7 -', 'i7 - bVImaj7 -', 'Imaj7 vi7', 'i7 bVII7 bVImaj7 V7', 'iv7 i7', 'i7 iv7 bVIImaj7 bIIImaj7'],
    methods: { bank: 5, vamp: 3 },
    richness: [0.6, 1], energy: 0.6, space: 0.4, bright: 0.45, dark: 0.3, edge: 0.8, swing: 0.8, swingAmount: [0.15, 0.35], surprise: 0, ornate: 0.8,
    palette: {
      melody: ['e-piano', 'piano', 'vibes', 'flute', 'mute-trumpet', 'alto-sax'], counter: ['strings', 'vibes', 'e-piano', 'harp'],
      keys: ['e-piano', 'piano', 'wurlitzer'], arp: ['harp', 'vibes', 'e-piano'], bells: ['vibes', 'glock'],
      pad: ['strings', 'orchestra-hit', 'choir-oo', 'warm-pad'], bass: ['upright', '808-bass', 'round-bass', 'fretless'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'scratches', 'rain'], kits: ['boombap-kit'], drums: [0.5, 1],
    layers: { keys: 0.9, texture: 0.5, drone: 0 },
    fx: { wobble: 0.1 },
    patterns: { drums: ['boombap', 'boombap', 'halftime'], bass: ['synco', 'held', 'synco'], keys: ['block', 'comp', 'strum'], pad: ['stabs', 'sustain', 'swell'], melody: ['riff', 'phrases', 'calls', 'fragments'], counter: ['answer', 'counterpoint'] },
  },
  // trap: half time at 140, the 808 booming and sliding between notes, hats rolling, a clap on three,
  // and a dark, simple hook on bells, a flute or a plucked synth over a choir
  trap: {
    group: 'Beats', opens: ['drums', 'bass', 'arp'],
    name: 'Trap', colour: '#5e35b1', style: 'tune',
    scales: { minor: 3, harmonicMinor: 2, phrygian: 1 }, tempo: [64, 74], tuneTempo: [130, 150],
    meters: { '4/4': 1 },
    chords: ['i bVI', 'i - bVI -', 'i iv', 'i bVI bIII bVII', 'i - iv -', 'i bII'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.3], energy: 0.8, space: 0.5, bright: 0.6, dark: 0.6, edge: 0.9, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['flute', 'sine-bell', 'pluck-lead', 'glock', 'music-box'], counter: ['sine-bell', 'pluck-lead', 'strings'],
      keys: ['piano', 'e-piano', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'glock', 'music-box'], bells: ['glock', 'sine-bell', 'music-box'],
      pad: ['choir-ah', 'choir-oo', 'dark-pad', 'strings'], bass: ['808-bass', '808-bass', 'sub-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['rain', 'hum'], kits: ['trap-kit'], drums: [0.5, 1],
    layers: { counter: 0.35 },
    patterns: { drums: ['trap', 'trap', 'halftime'], bass: ['held', 'synco', 'held'], melody: ['riff', 'phrases', 'riff'], pad: ['sustain', 'swell'], arp: ['up', 'updown', 'down'] },
  },

  // ---------- places ----------
  // the wasteland after the bombs (fallout: new vegas, mad max): a twangy guitar, a harmonica, a
  // whistled tune or a lonely trumpet (morricone), a slide guitar, an out of tune saloon piano, the
  // wind, a geiger counter, creaking metal, and drums made of scrap
  wasteland: {
    group: 'Places', opens: ['guitar', 'drone', 'drums'],
    name: 'Wasteland', colour: '#a08a5c', style: 'tune',
    scales: { minor: 2, dorian: 1.5, minorPentatonic: 2, blues: 1, phrygian: 0.7 }, tempo: [56, 72], tuneTempo: [84, 112],
    meters: { '4/4': 5, '6/8': 2, '3/4': 1 },
    chords: ['i bVII bVI V', 'i iv i V', 'i - bVI -', 'i bIII bVII iv', 'i v i bVII', 'i - iv V'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.55, space: 0.7, bright: 0.45, dark: 0.55, edge: 0.85, surprise: 0, ornate: 1.2,
    palette: {
      guitar: ['clean-guitar', 'crunch-guitar'], melody: ['harmonica', 'whistle', 'trumpet', 'pedal-steel'], counter: ['harmonica', 'pedal-steel', 'violin', 'trumpet'],
      keys: ['honky-tonk', 'piano', 'nylon'], arp: ['nylon', 'banjo', 'honky-tonk'], bells: ['metal-ping', 'bell'],
      pad: ['strings', 'choir-ah', 'dark-pad', 'organ'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['bowed-metal', 'deep-drone', 'cello-drone'],
    },
    textures: ['wind', 'geiger', 'creaks', 'fire', 'crickets'], kits: ['junk-kit', 'brushes'], drums: [0.2, 0.9],
    layers: { guitar: 0.6 },
    patterns: { guitar: ['ring', 'strum', 'boomchick', 'eighths'], drums: ['halftime', 'train', 'march', 'groove'], bass: ['held', 'rootfifth', 'pulse'], melody: ['phrases', 'long', 'calls'], keys: ['waltz', 'strum', 'block'] },
  },
  // deep under the sea: wine glasses and a blown bottle, glassy pads, harp and vibes rippling, a
  // whale calling far off and bubbles rising. slow, wide and wavering
  underwater: {
    group: 'Places', opens: ['pad', 'arp', 'drone'],
    build: 0.15, name: 'Underwater', colour: '#2f8fb0', style: 'ambient',
    scales: { lydian: 2, major: 1.5, dorian: 1.5, majorPentatonic: 1 }, tempo: [50, 66], tuneTempo: [76, 96],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['Imaj7 IVmaj7', 'I II', 'ii7 Imaj7', 'i7 iv7', 'Imaj7 iii7 IVmaj7 -', 'vi7 IVmaj7 Imaj7 V'],
    richness: [0.5, 0.9], energy: 0.3, space: 0.9, bright: 0.45, dark: 0.2, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['wine-glass', 'blown-bottle', 'vibes', 'sine-bell', 'celesta', 'flute', 'soprano'], counter: ['harp', 'vibes', 'soft-lead', 'celesta'],
      keys: ['harp', 'felt-keys', 'e-piano', 'vibes'], arp: ['harp', 'celesta', 'vibes', 'sine-bell', 'music-box'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      pad: ['glass-pad', 'choir-oo', 'air-pad', 'shimmer', 'bowed-vibes'], bass: ['sub-bass', 'round-bass'], drone: ['void', 'deep-drone', 'tape-loop'],
    },
    textures: ['whale', 'bubbles', 'ocean'], kits: ['soft-kit'], drums: [0.05, 0.4],
    fx: { wobble: 0.3 },
    patterns: { drums: ['pulse', 'sparse'], arp: ['twinkle', 'updown', 'up'], melody: ['long', 'phrases', 'fragments'], bass: ['held', 'held', 'rootfifth'] },
  },
  // pirates and sea shanties: an accordion and a fiddle, a tin whistle, a banjo, a saloon piano below
  // decks, a tuba or a bassoon, the crew stamping and clapping a jig in six, the sea and the ship's
  // timbers creaking
  pirate: {
    group: 'Places', opens: ['drums', 'keys', 'bass'],
    build: 0.25, name: 'Pirates', colour: '#3b5b8c', style: 'tune',
    scales: { dorian: 3, minor: 2, mixolydian: 1, major: 1 }, tempo: [60, 76], tuneTempo: [100, 132],
    meters: { '6/8': 4, '4/4': 3, '3/4': 1 },
    chords: ['i bVII i bVII', 'i iv V i', 'i bIII bVII i', 'i bVI bVII i', 'i - bVII -', 'i iv bVII bIII', 'I IV V I'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.7, space: 0.5, bright: 0.6, dark: 0.35, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['accordion', 'violin', 'whistle', 'melodica'], counter: ['violin', 'accordion', 'whistle'],
      keys: ['honky-tonk', 'nylon', 'steel-guitar', 'banjo'], arp: ['banjo', 'nylon', 'steel-guitar', 'harp'], bells: ['bell', 'chime'],
      pad: ['organ', 'strings', 'choir-ah'], bass: ['tuba', 'upright', 'bassoon'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['ocean', 'creaks', 'wind', 'fire'], kits: ['stomp-kit', 'hand-drums'], drums: [0.2, 0.95],
    patterns: { drums: ['march', 'groove', 'train'], keys: ['waltz', 'strum', 'block'], bass: ['rootfifth', 'rootfifth', 'held'], melody: ['phrases', 'riff', 'phrases'] },
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // outer space: analog pads and a string machine drifting, sine bells and plucked arps like distant
  // signals, the void humming underneath, and a drum machine far off. lydian and the whole tone scale
  space: {
    group: 'Places', opens: ['pad', 'arp', 'drone'],
    build: 0.3, name: 'Space', colour: '#3d2c8d', style: 'ambient',
    scales: { lydian: 3, wholeTone: 0.8, major: 1, dorian: 1, minor: 1 }, tempo: [52, 68], tuneTempo: [90, 116],
    meters: { '4/4': 5, '3/4': 1 },
    chords: ['I II', 'Imaj7 II', 'i bVI', 'I bVII', 'Imaj7 IVmaj7', 'i - bII -'],
    richness: [0.4, 0.9], energy: 0.4, space: 0.95, bright: 0.6, dark: 0.35, edge: 0.8, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['soft-lead', 'sine-bell', 'wine-glass', 'synth-brass', 'moog-lead'], counter: ['soft-lead', 'sine-bell', 'pluck-lead'],
      keys: ['e-piano', 'pluck-lead', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'celesta'], bells: ['sine-bell', 'glass-bell', 'metal-ping'],
      pad: ['analog-pad', 'glass-pad', 'synth-strings', 'choir-oo', 'shimmer', 'bowed-vibes', 'vox-pad'], bass: ['sub-bass', 'synth-bass', 'reese'], drone: ['void', 'deep-drone', 'tape-loop'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.15, 0.8],
    fx: { wobble: 0.1 },
    patterns: { drums: ['halftime', 'pulse', 'four'], arp: ['up', 'updown', 'random', 'converge'], melody: ['long', 'phrases', 'fragments'], pad: ['swell', 'sustain'] },
  },
  // daxter on the psp (jamey scott's score) and haven city: a city under the baron's iron fist. the
  // baron's palace is serious and brooding, but you'd still put it on: low strings and a bass hook, a
  // dark pizzicato or marimba riff, brass stabs and a choir, over a mid tempo beat that's half orchestra
  // and half machine. it loops, like the game's levels. its flavours are daxter's day job spraying bugs,
  // the city's factories and the baron's prison
  ironcity: {
    group: 'Places', opens: ['bass', 'drums', 'arp'],
    build: 0.3, name: 'Iron city', colour: '#6f6b8f', style: 'loop',
    scales: { minor: 2, dorian: 2, harmonicMinor: 1.5, phrygian: 0.7 }, tempo: [64, 80], tuneTempo: [92, 112],
    meters: { '4/4': 1 },
    chords: ['i bVI bVII i', 'i - iv -', 'i bII i bVII', 'i iv bVI V', 'i bVII bVI V', 'i - bVI bVII', 'i v bVI iv'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.1, 0.45], energy: 0.65, space: 0.6, bright: 0.45, dark: 0.6, edge: 0.85, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['horn', 'synth-brass', 'violin', 'trombone', 'clarinet', 'oboe'], counter: ['trombone', 'horn', 'pizzicato', 'bassoon', 'clarinet', 'cello'],
      keys: ['pizzicato', 'marimba', 'harpsichord', 'piano'], arp: ['pizzicato', 'marimba', 'pluck-lead', 'harpsichord'], bells: ['glock', 'metal-ping', 'bell'],
      pad: ['strings', 'choir-ah', 'brass-section', 'dark-pad', 'synth-strings', 'tremolo-strings'], bass: ['synth-bass', 'upright', 'tuba', 'round-bass', 'bassoon'], drone: ['deep-drone', 'cello-drone', 'organ-drone'],
    },
    textures: ['factory', 'steam', 'clanks', 'rain'], kits: ['machine', 'orchestra-kit', 'tight-kit', 'junk-kit'], drums: [0.35, 0.9],
    layers: { arp: 0.6, pad: 0.85 },
    patterns: { drums: ['groove', 'halftime', 'break', 'march'], bass: ['hook', 'synco', 'octave', 'pulse'], arp: ['up', 'updown', 'converge'], keys: ['broken', 'block'], pad: ['stabs', 'sustain', 'pulse'], melody: ['phrases', 'calls', 'riff'], counter: ['counterpoint', 'answer'] },
    orchestra: { pass: 0.45, double: 0.15 },
  },
};
// the rows of moods on the page, in order
const MOOD_GROUPS = ['Gentle', 'Bright', 'Magic', 'Easy', 'Dark', 'Beats', 'World', 'Ancient', 'Places', 'Loud'];

// moods a mood and modifiers already make (sludge is metal, slow and dark), or a newer mood does better
// (epic is dragon). a song saved in one opens as its replacement, keeping its own band, chords and
// sections (cleanSong)
const RETIRED = {
  dreamy: ['calm', ['dreamy']], deep: ['underwater', []], angry: ['tense', ['angry']], showdown: ['spirited', ['dark', 'fast']],
  sludge: ['metal', ['slow', 'dark']], nugaze: ['shoegaze', ['dark', 'slow']], altrock: ['grunge', ['bright']], disco: ['showtime', []], epic: ['dragon', []],
};

// ---------- flavours ----------
//
// most moods hold more than one kind of music (underwater is the dreamy deep and a calypso party on a
// reef), and each kind is a flavour of its mood rather than a mood of its own (see RETIRED for how the
// list grew too long before).
//   about     what the mood sounds like and what it's for, for the page
//   kinds     its flavours: { name, tip, style (the one it's made for, if not the mood's), and any mood
//             settings it changes }. palette, patterns and layers change a role at a time; anything else
//             replaces the mood's (flavourMood). the first kind is the plain mood: it changes nothing and
//             a song in it has no flavour key
//   phrasing  how a kind's tunes are written (every kind but the plain one has one):
//             shapes   the shapes its motifs take (CONTOURS, over CONTOUR_WEIGHTS)
//             rhythm   the kind of rhythm they're made of (RHYTHMS: dotted, even, long, syncopated...)
//             hook     how often its motif is a short hook played twice
//             pickup   how often a phrase leads in with a note or two
// a few say how busy every part is (busy) and how often they build (build). the random numbers don't
// depend on the flavour, but a new shape or rhythm takes them another way, so the same seed in another
// flavour is a new tune written that kind of music's way
const FLAVOURS = {
  calm: {
    about: 'Soft, unhurried and safe, like lying in long grass with nowhere to be: gentle pads, a felt piano or a flute, birdsong and running water. For menus, safe places and quiet wandering.',
    kinds: {
      meadow: { name: 'Meadow', tip: 'Meadow: a warm afternoon in the grass: soft pads, a felt piano or flute, a harp, birds and a stream' },
      lullaby: {
        name: 'Lullaby', tip: 'Lullaby: rocking gently in three: a music box or celesta, a harp underneath, crickets and an owl outside. No drums',
        phrasing: { shapes: { pendulum: 3, wave: 3, arch: 2, fall: 1 }, rhythm: 'even', hook: 0.2 }, busy: -0.1,
        scales: { majorPentatonic: 3, major: 2, lydian: 1 }, tempo: [50, 64], tuneTempo: [64, 82], meters: { '3/4': 3, '6/8': 2, '4/4': 1 },
        chords: ['I IV I V', 'I vi IV V', 'I - IV -', 'IV I V I', 'I iii IV I'],
        palette: { melody: ['music-box', 'celesta', 'flute', 'felt-keys'], keys: ['harp', 'felt-keys', 'celesta'], arp: ['harp', 'music-box', 'celesta'], bells: ['music-box', 'celesta', 'glass-bell'], counter: ['harp', 'felt-keys', 'flute'] },
        textures: ['crickets', 'owl', 'rain'], drums: [0, 0.1], energy: 0.2,
        patterns: { keys: ['waltz', 'broken'], arp: ['updown', 'up'], melody: ['phrases', 'long'] },
      },
      zen: {
        name: 'Zen garden', tip: 'Zen garden: raked stones and still water: a bamboo flute or koto in a five note scale, a singing bowl ringing, water over stones',
        phrasing: { shapes: { chant: 2, fall: 2, arch: 2, turn: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        scales: { majorPentatonic: 3, lydian: 1, major: 0.5 }, ornate: 1,
        palette: { melody: ['shakuhachi', 'flute', 'koto', 'felt-keys'], keys: ['koto', 'harp', 'felt-keys'], arp: ['koto', 'harp'], counter: ['koto', 'harp', 'shakuhachi'], bells: ['chime', 'glass-bell', 'sine-bell'], drone: ['cello-drone', 'organ-drone', 'tape-loop'] },
        textures: ['singing-bowl', 'stream', 'chimes', 'birds'], kits: ['temple'], drums: [0.05, 0.2],
        patterns: { drums: ['sparse', 'pulse'], melody: ['long', 'fragments', 'phrases'], drone: ['tonic', 'fifths'] },
      },
    },
  },
  heavenly: {
    about: 'Weightless and bright, high above everything: a choir, an organ, harps and bells ringing out in a vast room, and no drums. For shrines, heaven and endings.',
    kinds: {
      clouds: { name: 'Clouds', tip: 'Clouds: drifting above them: a choir and an organ, harps and bells, wide and slow' },
      cathedral: {
        name: 'Cathedral', tip: 'Cathedral: light through stained glass: a hymn on the organ and a choir, a horn or violin singing over it, the bells tolling',
        phrasing: { shapes: { chant: 2, climb: 2, arch: 2, triad: 1 }, rhythm: 'long', hook: 0 },
        scales: { major: 3, mixolydian: 1 }, chords: ['I IV I V', 'I IV I -', 'I vi IV I', 'IV I', 'I iii IV I', 'I V vi iii IV I IV V', 'I IV V I'],
        methods: { bank: 6, markov: 1 }, richness: [0, 0.3], edge: 0.75,
        palette: { melody: ['choir-oo', 'violin', 'horn', 'flute'], pad: ['organ', 'choir-ah', 'strings'], keys: ['organ', 'harp'], counter: ['violin', 'choir-oo', 'horn'], bells: ['bell', 'chime', 'glass-bell'], drone: ['organ-drone'] },
        textures: ['wind'], patterns: { melody: ['long', 'phrases'], pad: ['sustain', 'swell'], keys: ['block', 'broken'] },
      },
      ascent: {
        name: 'Ascension', tip: 'Ascension: rising towards the light: shimmering pads, arps climbing, glass bells and wine glasses',
        phrasing: { shapes: { climb: 4, triad: 2, arch: 1 }, rhythm: 'even', hook: 0.25 },
        scales: { lydian: 3, major: 1 }, energy: 0.3,
        palette: { melody: ['glass-bell', 'choir-oo', 'wine-glass', 'soft-lead'], pad: ['shimmer', 'air-pad', 'glass-pad', 'choir-ah'], arp: ['celesta', 'harp', 'glass-bell'] },
        layers: { arp: 0.6 }, patterns: { arp: ['up', 'up', 'updown'], pad: ['swell', 'sustain'] },
      },
    },
  },
  happy: {
    about: 'Sunny and carefree, like the first warm morning of the year: a flute or clarinet over a strummed guitar, a bouncing bass and a light kit. For farms, villages and good days.',
    kinds: {
      spring: { name: 'Spring', tip: 'Spring: fields, chores and sunshine: a flute, clarinet or accordion over a guitar, soft strings and a bass bouncing between two notes' },
      island: {
        name: 'Island life', tip: 'Island life: a lazy day on a little island: a bouncy electric piano or vibes on jazzy chords, a slap or fretless bass, a light swung beat',
        phrasing: { shapes: { repeat: 2, call: 2, zigzag: 1, arch: 1 }, rhythm: 'syncopated', hook: 0.6 },
        chords: ['Imaj7 vi7 ii7 V7', 'IVmaj7 iii7 ii7 Imaj7', 'I vi ii V', 'Imaj7 IVmaj7', 'IVmaj7 V7 iii7 vi7', 'ii7 V7 Imaj7 -'], richness: [0.5, 0.9], swing: 0.45,
        palette: { melody: ['vibes', 'e-piano', 'whistle', 'marimba', 'flute'], keys: ['e-piano', 'wurlitzer', 'piano', 'nylon'], bass: ['fretless', 'slap-bass', 'upright', 'pluck-bass'], counter: ['marimba', 'vibes', 'clarinet'] },
        kits: ['tight-kit', 'soft-kit'], patterns: { drums: ['groove', 'halftime'], bass: ['synco', 'rootfifth', 'hook'], keys: ['block', 'comp', 'strum'] },
      },
      festival: {
        name: 'Festival', tip: 'Festival: the whole village out for the fair: a brass band, an accordion, a glockenspiel and a marching snare, the tune passed round',
        phrasing: { shapes: { triad: 3, repeat: 2, leap: 2, climb: 1 }, rhythm: 'dotted', hook: 0.6 },
        energy: 0.75, edge: 0.8, meters: { '4/4': 5, '6/8': 2, '3/4': 1 },
        palette: { melody: ['trumpet', 'accordion', 'clarinet', 'flute', 'whistle'], counter: ['trombone', 'clarinet', 'horn'], keys: ['piano', 'honky-tonk'], bass: ['tuba', 'upright'], bells: ['glock', 'xylophone'], pad: ['brass-section', 'organ', 'strings'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { drums: ['march', 'groove'], bass: ['rootfifth', 'octave'], keys: ['waltz', 'block'] },
        orchestra: { pass: 0.5, double: 0.5 },
      },
    },
  },
  playful: {
    about: 'Mischievous and bouncy, a cartoon tiptoeing about with a grin: pizzicato, marimba, clarinet and a music box hopping over an oom-pah bass. For puzzles, silly characters and mischief.',
    kinds: {
      romp: { name: 'Romp', tip: 'Romp: pizzicato, marimba and clarinet hopping over oom-pah keys and a walking bass' },
      tiptoe: {
        name: 'Tiptoe', tip: 'Tiptoe: sneaking about: pizzicato and a bassoon creeping in a minor key, a xylophone poking its head out, a sly walking bass',
        phrasing: { shapes: { turn: 2, dive: 2, repeat: 2, zigzag: 1 }, rhythm: 'snap', hook: 0.5 },
        scales: { minor: 2, dorian: 2, harmonicMinor: 1 }, chords: ['i iv V i', 'i bVI V -', 'i - iv V', 'i iv i V', 'i bVII bVI V'],
        energy: 0.55, dark: 0.35, edge: 0.6,
        palette: { melody: ['pizzicato', 'bassoon', 'clarinet', 'xylophone', 'oboe'], counter: ['bassoon', 'pizzicato', 'clarinet'], keys: ['pizzicato', 'harpsichord', 'xylophone'], bass: ['upright', 'bassoon', 'tuba'] },
        kits: ['clockwork', 'orchestra-kit'], patterns: { bass: ['walking', 'rootfifth'], drums: ['march', 'sparse'], keys: ['broken', 'block'], melody: ['calls', 'phrases'] },
      },
      circus: {
        name: 'Big top', tip: 'Big top: a circus march: an accordion or trumpet, a tuba oom-pah, a glockenspiel and a snare, round and round',
        phrasing: { shapes: { zigzag: 2, triad: 2, repeat: 2, climb: 1 }, rhythm: 'running', hook: 0.7 }, busy: 0.1,
        scales: { major: 3, mixolydian: 1, harmonicMinor: 0.5 }, tuneTempo: [120, 150], meters: { '4/4': 3, '3/4': 3, '6/8': 2 },
        chords: ['I I7 IV iv', 'I vi ii V', 'I II7 V7 I', 'I IV I V', 'I bVI V I'], energy: 0.8, edge: 0.75,
        palette: { melody: ['accordion', 'trumpet', 'clarinet', 'xylophone'], keys: ['honky-tonk', 'xylophone', 'piano'], pad: ['organ', 'brass-section'], bass: ['tuba', 'bassoon'], bells: ['glock', 'xylophone'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { drums: ['march'], keys: ['waltz'], bass: ['rootfifth', 'octave'] },
      },
    },
  },
  spirited: {
    about: "Bright and full of heart, like setting off with friends on an adventure: a chirpy 8 bit lead, a bouncing bass and a tune you'll be humming for days. For adventures, towns and friendly fights.",
    kinds: {
      adventure: { name: 'Adventure', tip: 'Adventure: off down the road: chiptune leads, a bouncing bass and a light kit, with the odd jazzy, surprising chord' },
      home: {
        name: 'Keepsake', tip: 'Keepsake: coming back to the house you grew up in, warm and a little sad: a music box or piano tune, slow and tender',
        phrasing: { shapes: { arch: 3, sigh: 2, fall: 2, pendulum: 1 }, rhythm: 'even', hook: 0.2 },
        tuneTempo: [70, 92], energy: 0.45, drums: [0.05, 0.35], kits: ['soft-kit'], ornate: 0.6,
        chords: ['I V vi iii IV I IV V', 'IV V iii vi', 'I vi IV V', 'vi IV I V', 'IVmaj7 V7 iii vi'],
        palette: { melody: ['piano', 'music-box', 'felt-keys', 'celesta'], keys: ['piano', 'felt-keys', 'harp'], counter: ['felt-keys', 'harp', 'celesta'], arp: ['harp', 'music-box', 'celesta'], bass: ['round-bass', 'upright', 'sub-bass'] },
        patterns: { drums: ['halftime', 'pulse'], bass: ['held', 'rootfifth'], melody: ['phrases', 'long'] },
      },
      ruins: {
        name: 'Old caverns', tip: 'Old caverns: the first quiet steps underground: a slower minor tune on a chip lead or kalimba, a harp picking, water dripping',
        phrasing: { shapes: { pendulum: 2, turn: 2, fall: 2, sigh: 1 }, rhythm: 'even', hook: 0.35 },
        scales: { dorian: 2, minor: 2, harmonicMinor: 1 }, tuneTempo: [96, 120], energy: 0.55, dark: 0.35,
        chords: ['i bVI bVII i', 'i iv bVI V', 'i bVII bVI bVII', 'i - bVI -', 'i bIII bVII iv'],
        palette: { melody: ['pulse-lead', 'square-lead', 'kalimba', 'flute'], arp: ['harp', 'kalimba', 'pulse-lead'] },
        textures: ['drips'], patterns: { drums: ['groove', 'halftime', 'march'], bass: ['rootfifth', 'held', 'octave'] },
      },
    },
  },
  upbeat: {
    about: 'Bright, fast and driving, the wind in your face: a saw or square lead over an octave bass and a punchy kit. For racing, action and title screens.',
    kinds: {
      speed: { name: 'Full speed', tip: 'Full speed: saw and square leads over an octave bass and a punchy kit' },
      dance: {
        name: 'Dance floor', tip: 'Dance floor: house music: four on the floor, a piano stabbing chords, a pumping pad and an octave bass',
        phrasing: { shapes: { repeat: 3, call: 2, pendulum: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [120, 128], kits: ['club-kit', 'tight-kit'],
        palette: { keys: ['piano', 'e-piano'], melody: ['saw-lead', 'synth-brass', 'pluck-lead', 'soft-lead'] },
        layers: { keys: 0.85 }, patterns: { drums: ['four', 'four'], keys: ['block'], pad: ['pump', 'sustain'], bass: ['octave', 'synco'] },
      },
      citypop: {
        name: 'City pop', tip: 'City pop: a drive along the coast at sunset, years ago: a slap bass, an electric piano on lush sevenths, synth brass and a glossy beat',
        phrasing: { shapes: { arch: 2, call: 2, zigzag: 1, leap: 1 }, rhythm: 'syncopated', hook: 0.5, pickup: 0.7 },
        chords: ['IVmaj7 V7 iii7 vi7', 'IVmaj7 III7 vi7 -', 'ii7 V7 Imaj7 vi7', 'Imaj7 vi7 ii7 V7', 'IVmaj7 V iii vi'], richness: [0.6, 0.95],
        tuneTempo: [104, 124], scales: { major: 3, dorian: 1, mixolydian: 1 },
        palette: { melody: ['synth-brass', 'soft-lead', 'alto-sax', 'e-piano', 'pluck-lead'], keys: ['e-piano', 'wurlitzer', 'piano'], bass: ['slap-bass', 'synth-bass', 'fretless'], pad: ['strings', 'synth-strings', 'brass-section', 'warm-pad'] },
        kits: ['tight-kit', 'funk-kit', 'machine'], patterns: { bass: ['synco', 'octave', 'hook'], drums: ['groove', 'four'], keys: ['block', 'comp'] },
      },
    },
  },
  cozy: {
    about: 'Warm and snug: an electric piano or felt keys on jazzy chords, a walking bass, brushes and a crackling fire. For inns, homes and rainy evenings.',
    kinds: {
      fireside: { name: 'Fireside', tip: 'Fireside: an electric piano on jazzy chords, a walking bass, brushes and the fire' },
      teashop: {
        name: 'Tea shop', tip: 'Tea shop: lighter and sunnier: a nylon guitar or vibes, a flute, a gentle bossa nova',
        phrasing: { shapes: { wave: 2, arch: 2, turn: 1, call: 1 }, rhythm: 'syncopated', hook: 0.3 },
        bright: 0.55, palette: { melody: ['flute', 'vibes', 'nylon', 'clarinet'], keys: ['nylon', 'piano', 'e-piano'] },
        textures: ['rain', 'vinyl', 'birds'], patterns: { drums: ['bossa', 'brush'], keys: ['bossa', 'strum'], bass: ['rootfifth', 'walking'] },
      },
      rainy: {
        name: 'Rainy day', tip: 'Rainy day: a piano on its own or with a clarinet, slow, rain on the window and vinyl crackle',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1 }, rhythm: 'long', hook: 0.1 },
        energy: 0.3, tuneTempo: [64, 82], drums: [0, 0.2],
        palette: { melody: ['piano', 'clarinet', 'felt-keys'], keys: ['piano', 'felt-keys'] }, textures: ['rain', 'vinyl'],
        layers: { texture: 0.7 }, patterns: { melody: ['phrases', 'long'], bass: ['held', 'walking'] },
      },
    },
  },
  wistful: {
    about: 'Bittersweet and nostalgic: a music box, piano or nylon guitar over warm strings, worn like an old tape. For memories, goodbyes and rainy windows.',
    kinds: {
      memories: { name: 'Memories', tip: 'Memories: a music box, felt piano and strings, worn like an old tape' },
      autumn: {
        name: 'Autumn', tip: 'Autumn: a nylon guitar and a violin or clarinet in three, a cello underneath, leaves and rain',
        phrasing: { shapes: { sigh: 3, wave: 2, fall: 1 }, rhythm: 'dotted', hook: 0.2 },
        scales: { dorian: 2, mixolydian: 1, minor: 1 }, meters: { '3/4': 3, '4/4': 2, '6/8': 1 },
        palette: { melody: ['nylon', 'violin', 'clarinet', 'piano', 'flute'], keys: ['nylon', 'harp', 'piano'], arp: ['nylon', 'harp'], pad: ['strings', 'warm-pad', 'choir-oo'], drone: ['cello-drone'] },
        textures: ['leaves', 'rain', 'fire'], patterns: { keys: ['waltz', 'broken'] },
      },
      countryside: {
        name: 'Countryside', tip: "Countryside: a summer in the country you'll remember all your life: a piano tune, strings swelling under it, a flute answering, chords that rise and ache",
        phrasing: { shapes: { leap: 3, arch: 2, climb: 1, sigh: 1 }, rhythm: 'long', hook: 0.15, pickup: 0.6 }, build: 0.35,
        style: 'tune', tuneTempo: [80, 100], chords: ['IVmaj7 V iii vi', 'IV V iii vi', 'I V vi iii IV I IV V', 'vi IV V I', 'IV V I vi'],
        palette: { melody: ['piano', 'flute', 'violin', 'oboe'], counter: ['flute', 'violin', 'clarinet', 'oboe'], keys: ['piano', 'harp'], pad: ['strings', 'choir-oo'], arp: ['harp', 'piano'], bells: ['glock', 'celesta'] },
        textures: ['birds', 'leaves', 'stream'], kits: ['brushes', 'soft-kit'], drums: [0.05, 0.3],
        orchestra: { pass: 0.5, double: 0.3 },
      },
    },
  },
  nostalgic: {
    about: 'Not happy and not sad, somewhere in between: the feeling of an old world you used to spend whole summers in. A felt piano with room round it, a warm pad and a sub bass, worn like an old tape. For wandering, building and remembering.',
    kinds: {
      alpha: { name: 'First days', tip: 'First days: a few soft piano notes and a lot of quiet: a felt piano or Rhodes, a warm pad and a sub bass, gently bittersweet' },
      warmth: {
        name: 'Embers', tip: "Embers: deep underground where it's hot and lonely: nothing but the fire crackling and lava bubbling at first, then a sad synth and strings swell in, slow and reflective",
        phrasing: { shapes: { sigh: 2, chant: 2, fall: 2 }, rhythm: 'long', hook: 0 },
        scales: { dorian: 2, minor: 2, mixolydian: 1 }, tempo: [50, 64], tuneTempo: [64, 80], meters: { '4/4': 4, '3/4': 1 },
        chords: ['i bVI', 'i - bVI -', 'i bVII bVI bVII', 'iv i', 'i bIII bVII iv', 'bVI bVII i -'], energy: 0.25, dark: 0.35, prelude: 'Embers',
        palette: { melody: ['soft-lead', 'violin', 'felt-keys', 'piano', 'e-piano'], pad: ['dark-pad', 'analog-pad', 'strings', 'warm-pad', 'choir-oo'], drone: ['deep-drone', 'tape-loop', 'cello-drone'], keys: ['e-piano', 'felt-keys', 'piano'], bells: ['sine-bell', 'glass-bell'] },
        textures: ['lava', 'fire', 'rumble'], kits: [], drums: [0, 0], layers: { texture: 1, melody: 0.8 },
        patterns: { pad: ['swell', 'swell', 'sustain'], melody: ['long', 'fragments'], drone: ['tonic', 'fifths'] },
      },
      creative: {
        name: 'Tinkering', tip: 'Tinkering: building something just for the fun of it: a bouncy piano tune, plucky synths and a light drum machine',
        phrasing: { shapes: { repeat: 2, zigzag: 2, call: 2, leap: 1 }, rhythm: 'snap', hook: 0.6 },
        style: 'tune', scales: { major: 3, lydian: 1, mixolydian: 1, majorPentatonic: 1 }, tuneTempo: [96, 124], energy: 0.6, bright: 0.6, dark: 0.05, edge: 0.8,
        palette: { melody: ['piano', 'pluck-lead', 'e-piano', 'soft-lead', 'music-box', 'marimba'], keys: ['piano', 'e-piano', 'felt-keys'], arp: ['pluck-lead', 'e-piano', 'kalimba', 'felt-keys'], counter: ['e-piano', 'pluck-lead', 'felt-keys'], bass: ['round-bass', 'synth-bass', 'sub-bass', 'pluck-bass'] },
        textures: ['birds', 'stream'], kits: ['machine', 'lofi-kit', 'soft-kit'], drums: [0.2, 0.8], layers: { arp: 0.55 },
        patterns: { drums: ['groove', 'halftime', 'groove'], bass: ['rootfifth', 'octave', 'synco'], keys: ['broken', 'block'], melody: ['phrases', 'calls', 'phrases'], arp: ['updown', 'up'] },
      },
      dreiton: {
        name: 'Slow build', tip: 'Slow build: a long climb from dark to blazing: a deep analog pad, then arps, then a drum machine and a wailing synth lead, then it all falls away',
        phrasing: { shapes: { climb: 3, leap: 2, chant: 1 }, rhythm: 'long', hook: 0.3 }, build: 0,
        style: 'tune', scales: { minor: 2, dorian: 2, phrygian: 0.5 }, tuneTempo: [100, 126], energy: 0.7, bright: 0.5, dark: 0.45, edge: 1,
        chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i v bVI iv', 'bVI bVII i -'],
        palette: { melody: ['saw-lead', 'soft-lead', 'synth-brass', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'soft-lead'], pad: ['analog-pad', 'dark-pad', 'synth-strings', 'glass-pad'], bass: ['synth-bass', 'reese', 'sub-bass'], keys: ['e-piano', 'felt-keys'], bells: ['sine-bell', 'glass-bell'], counter: ['pluck-lead', 'soft-lead', 'synth-brass'] },
        textures: ['rumble'], kits: ['machine', 'club-kit'], drums: [0.4, 0.95], layers: { arp: 0.8, pad: 0.9 },
        patterns: { drums: ['break', 'halftime', 'groove'], arp: ['up', 'updown', 'converge'], bass: ['octave', 'pulse', 'held'], pad: ['sustain', 'swell', 'pulse'], melody: ['long', 'phrases'] },
        // the dark start, the arps, the build, the beat, and falling away to nothing at the end
        forms: [
          [['Dark', 'C', 8, 0.3], ['Arps', 'A', 8, 0.55], ['Build', 'A', 8, 0.75], ['Drive', 'B', 8, 0.95], ['Peak', 'B', 8, 1], ['Fall', 'C', 8, 0.4], ['Drive', 'B', 8, 0.95], ['Away', 'A', 8, 0.3]],
          [['Dark', 'A', 8, 0.3], ['Arps', 'A', 16, 0.6], ['Drive', 'B', 16, 0.95], ['Fall', 'C', 8, 0.45], ['Peak', 'B', 16, 1], ['Away', 'C', 8, 0.3]],
        ],
      },
      // subwoofer lullaby, mice on venus and living mice: a rhodes rocking between two chords over a deep
      // moog bass, a piano tune drifting over it, the odd soft tick of a drum machine
      lullaby: {
        name: 'Lullaby', tip: 'Lullaby: a warm electric piano rocking between two chords over a deep round bass, a soft piano tune drifting over it, like falling asleep in a quiet room',
        phrasing: { shapes: { pendulum: 3, arch: 2, fall: 1 }, rhythm: 'even', hook: 0.2 }, build: 0,
        scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [54, 68], tuneTempo: [66, 84], meters: { '4/4': 4, '3/4': 2 },
        chords: ['Imaj7 IVmaj7', 'I - IV -', 'Imaj7 iii7', 'IV I', 'I vi IV -', 'IVmaj7 Imaj7 iii7 vi'],
        palette: { melody: ['piano', 'felt-keys', 'humming', 'music-box'], keys: ['e-piano', 'wurlitzer', 'felt-keys'], pad: ['vox-pad', 'warm-pad', 'bowed-vibes'], bass: ['moog-bass', 'sub-bass'], bells: ['sine-bell', 'glass-bell'] },
        kits: ['machine', 'soft-kit'], drums: [0.15, 0.4], layers: { keys: 0.95, bass: 0.9 },
        patterns: { keys: ['block', 'broken', 'block'], melody: ['fragments', 'phrases', 'long'], bass: ['held', 'held', 'rootfifth'], drums: ['sparse', 'pulse'] },
      },
      // wet hands, dry hands and clark: a piano on its own, rolling up and down its chords with the pedal
      // down, a simple tune on top, and the room
      rolling: {
        name: 'Rolling keys', tip: 'Rolling keys: a piano rolling gently up and down its chords, a simple tune on top, and nothing else but the room it was played in',
        phrasing: { shapes: { wave: 3, arch: 2, climb: 1 }, rhythm: 'even', hook: 0.3 }, build: 0,
        scales: { major: 3, lydian: 1, mixolydian: 1, dorian: 0.5 }, tempo: [62, 80], tuneTempo: [72, 92],
        palette: { melody: ['piano', 'felt-keys'], arp: ['piano', 'felt-keys'], keys: ['felt-keys', 'piano'], pad: ['strings', 'warm-pad', 'bowed-vibes'], bass: ['sub-bass', 'round-bass'] },
        kits: [], drums: [0, 0], layers: { arp: 0.95, keys: 0.3, pad: 0.4, bass: 0.5, texture: 0.3 },
        patterns: { arp: ['updown', 'up', 'updown'], melody: ['phrases', 'fragments', 'long'], pad: ['swell', 'sustain'] },
      },
      // the second album's synth side, moog city 2, biome fest and haggstrom: a round moog lead sliding
      // between notes over bubbling arps and a gentle drum machine, curious and cheerful
      moogcity: {
        name: 'Circuits', tip: 'Circuits: a round, buttery synth lead sliding between its notes over bubbling arps and a gentle drum machine, cheerful and curious',
        phrasing: { shapes: { zigzag: 2, arch: 2, climb: 2, turn: 1 }, rhythm: 'dotted', hook: 0.4 },
        style: 'tune', scales: { major: 2, mixolydian: 2, lydian: 1, dorian: 1 }, tuneTempo: [92, 118], energy: 0.6, bright: 0.55, edge: 0.8,
        palette: { melody: ['moog-lead', 'soft-lead', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'kalimba'], counter: ['soft-lead', 'pluck-lead', 'e-piano'], pad: ['analog-pad', 'vox-pad', 'warm-pad'], bass: ['moog-bass', 'synth-bass', 'sub-bass'], keys: ['e-piano', 'piano'] },
        kits: ['machine', 'lofi-kit'], drums: [0.3, 0.85], layers: { arp: 0.8 },
        patterns: { drums: ['groove', 'halftime'], arp: ['up', 'updown', 'random'], bass: ['octave', 'synco', 'rootfifth'], melody: ['phrases', 'long', 'calls'] },
      },
    },
  },
  sad: {
    about: 'Sorrowful and slow: strings, a felt piano or a violin in a minor key, rain on the glass. For losses, rain and the end of things.',
    kinds: {
      sorrow: { name: 'Sorrow', tip: 'Sorrow: strings, a felt piano or violin in a minor key, and rain' },
      requiem: {
        name: 'Requiem', tip: 'Requiem: a slow string orchestra and a choir mourning together, the tune passed from violin to oboe',
        phrasing: { shapes: { sigh: 3, fall: 2, chant: 1 }, rhythm: 'long', hook: 0 }, build: 0.4,
        chords: ['i iv bVI V', 'i bVI iv V', 'i v bVI iv', 'i bVII bVI V', 'iv i V i'], richness: [0.2, 0.5], kits: [],
        palette: { melody: ['violin', 'choir-oo', 'oboe', 'horn'], pad: ['strings', 'choir-ah', 'choir-oo', 'organ'], counter: ['violin', 'oboe', 'horn'], drone: ['cello-drone', 'organ-drone'] },
        textures: ['wind'], orchestra: { pass: 0.45, double: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['sustain', 'swell'] },
      },
      alone: {
        name: 'Alone', tip: 'Alone: one piano in an empty room, slow, with long silences',
        phrasing: { shapes: { fall: 2, sigh: 2, pendulum: 1 }, rhythm: 'long', hook: 0 }, build: 0, busy: -0.15,
        palette: { melody: ['piano', 'felt-keys'], keys: ['felt-keys', 'piano'] }, kits: [],
        layers: { pad: 0.3, drone: 0.1, bells: 0.1, counter: 0.1, arp: 0.1, keys: 0.9, bass: 0.15, texture: 0.6 },
        patterns: { melody: ['fragments', 'phrases', 'long'], keys: ['broken', 'strum'] },
      },
    },
  },
  tragic: {
    about: 'Sad and dramatic at once, the end of a world told by a single piano: strings and a choir swell in under it, build to the whole orchestra, then fall away. For title screens, losses and the moments before the end.',
    kinds: {
      cruel: { name: 'Lament', tip: 'Lament: a lone piano, then strings and a choir swelling in, building to the whole orchestra and timpani, then falling back' },
      sulphur: {
        name: 'Poisoned sea', tip: 'Poisoned sea: a still, sickly sea under a green sky: a clean guitar ringing through long echoes, slow and serene, strings swelling, a half time beat, waves and rain',
        phrasing: { shapes: { chant: 2, arch: 2, fall: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [66, 86], energy: 0.5, dark: 0.5, edge: 0.75,
        palette: { guitar: ['clean-guitar', 'chorus-guitar', 'crunch-guitar'], melody: ['chorus-guitar', 'violin', 'piano', 'felt-keys'], pad: ['strings', 'dark-pad', 'choir-oo'] },
        kits: ['rock-kit', 'machine'], textures: ['ocean', 'rain', 'wind'], layers: { guitar: 0.85, keys: 0.5 }, fx: { echo: 0.15 },
        patterns: { guitar: ['ring', 'tremolo', 'strum'], drums: ['halftime', 'rock', 'halftime'], melody: ['long', 'phrases'] },
      },
      musicbox: {
        name: 'Music box', tip: 'Music box: the theme wound up on an old music box or celesta, slow, alone in an empty room, a cello droning under it',
        phrasing: { shapes: { pendulum: 2, arch: 2, sigh: 2 }, rhythm: 'even', hook: 0.3 }, build: 0,
        style: 'ambient', tempo: [50, 64],
        palette: { melody: ['music-box', 'celesta', 'piano'], keys: ['music-box', 'celesta', 'harp'], arp: ['music-box', 'celesta'], drone: ['cello-drone'] },
        kits: [], drums: [0, 0], layers: { melody: 1, pad: 0.5, keys: 0.6, counter: 0.15, bells: 0.15, bass: 0.1 }, patterns: { melody: ['phrases', 'long'] },
      },
      laststand: {
        name: 'Last stand', tip: 'Last stand: everything on the line: the tune on the horns over a choir and strings, taiko pounding',
        phrasing: { shapes: { triad: 3, leap: 2, climb: 2 }, rhythm: 'dotted', hook: 0.5 },
        style: 'boss', palette: { melody: ['horn', 'violin', 'choir-oo', 'trumpet'], pad: ['choir-ah', 'strings', 'brass-section'] }, edge: 0.85, kits: ['taiko', 'orchestra-kit'],
      },
    },
  },
  bleak: {
    about: 'Serious more than sad: a slow wall of fuzz, a lone chanted line and a cheap drum machine echoing round a huge empty hall, worn and washed out. For grey skies, long walks and heavy thoughts.',
    kinds: {
      wall: { name: 'Fuzz wall', tip: 'Fuzz wall: a slow wall of fuzz, a chanted line and a drum machine in a huge room' },
      postrock: {
        name: 'Post-rock', tip: 'Post-rock: a storm rolling slowly in over the hills: a clean guitar ringing and tremolo picking, building to a crash of drums',
        phrasing: { shapes: { chant: 2, climb: 2, wave: 2 }, rhythm: 'long', hook: 0.4 }, build: 0.6,
        energy: 0.55, edge: 0.75,
        palette: { guitar: ['clean-guitar', 'chorus-guitar', 'fuzz-guitar'], melody: ['chorus-guitar', 'violin', 'felt-keys', 'whistle'] },
        kits: ['rock-kit', 'machine'], layers: { guitar: 0.85 },
        patterns: { guitar: ['ring', 'tremolo', 'strum'], drums: ['halftime', 'rock', 'groove'], melody: ['long', 'phrases'] },
      },
      hymn: {
        name: 'Hymn', tip: 'Hymn: a church organ, a chanted choir and a tolling bell, slower still',
        phrasing: { shapes: { chant: 3, arch: 1, fall: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        tempo: [44, 58], tuneTempo: [60, 78], edge: 0.75,
        palette: { pad: ['organ', 'choir-ah', 'choir-oo'], melody: ['choir-oo', 'violin', 'felt-keys'], bells: ['bell', 'sine-bell'], drone: ['organ-drone', 'deep-drone'] },
        drums: [0.2, 0.45], patterns: { drums: ['halftime', 'pulse'], melody: ['long', 'phrases'] },
      },
    },
  },
  mysterious: {
    about: 'Something hidden: kalimbas and glass bells over drones, in strange old modes, with drips and owls. For caves, ruins and secrets.',
    kinds: {
      secrets: { name: 'Secrets', tip: 'Secrets: kalimbas and glass bells over drones, drips and owls' },
      temple: {
        name: 'Lost temple', tip: 'Lost temple: ruins swallowed by the jungle: pan pipes, ocarina and marimba over hand drums, in an old five note scale',
        phrasing: { shapes: { call: 2, turn: 2, dive: 1, pendulum: 1 }, rhythm: 'dotted', hook: 0.4 },
        scales: { hirajoshi: 2, dorian: 1, phrygian: 1, minorPentatonic: 1 },
        palette: { melody: ['pan-flute', 'ocarina', 'marimba', 'kalimba'], arp: ['marimba', 'kalimba'], keys: ['marimba', 'kalimba', 'harp'] },
        kits: ['hand-drums', 'taiko'], textures: ['drips', 'birds', 'frogs'], patterns: { drums: ['tribal', 'sparse', 'pulse'] },
      },
      moonlit: {
        name: 'Moonlit', tip: 'Moonlit: night in an enchanted wood: a flute, harp and celesta, owls and crickets, magic with a dark edge',
        phrasing: { shapes: { wave: 2, turn: 2, arch: 2 }, rhythm: 'even', hook: 0.3 }, meters: { '3/4': 3, '6/8': 2, '4/4': 1 },
        scales: { dorian: 2, lydian: 1.5, harmonicMinor: 1 }, bright: 0.5,
        palette: { melody: ['flute', 'celesta', 'glass-bell', 'ocarina'], keys: ['harp', 'celesta'], arp: ['harp', 'celesta', 'kalimba'], bells: ['glass-bell', 'celesta', 'chime'] },
        textures: ['owl', 'crickets', 'frogs'], patterns: { arp: ['twinkle', 'updown'] },
      },
    },
  },
  tense: {
    about: "Something's wrong: pulsing strings and synths, a heartbeat or taiko, dark scales. For chases, stealth and countdowns.",
    kinds: {
      danger: { name: 'Danger', tip: 'Danger: pulsing strings and synths over a heartbeat or taiko' },
      stealth: {
        name: 'Stealth', tip: 'Stealth: sneaking past the guards: a low pulsing synth bass, ticking hats, a quiet suspense pad, short notes',
        phrasing: { shapes: { repeat: 3, turn: 2, chant: 1 }, rhythm: 'snap', hook: 0.6 }, busy: -0.1,
        energy: 0.55, tuneTempo: [96, 116], kits: ['machine', 'clockwork'],
        palette: { melody: ['pluck-lead', 'sine-bell', 'felt-keys', 'violin'] }, textures: ['hum'],
        patterns: { drums: ['pulse', 'sparse', 'halftime'], bass: ['pulse', 'synco'], pad: ['pulse', 'sustain'], melody: ['fragments', 'calls'] },
      },
      countdown: {
        name: 'Countdown', tip: 'Countdown: a clock ticking under racing pizzicato strings, faster and faster',
        phrasing: { shapes: { climb: 3, repeat: 2, zigzag: 1 }, rhythm: 'running', hook: 0.7 }, build: 0.6, busy: 0.15,
        energy: 0.85, tuneTempo: [130, 156], kits: ['clockwork', 'taiko'],
        palette: { arp: ['pizzicato', 'harpsichord', 'pluck-lead'] }, layers: { arp: 0.7 },
        patterns: { drums: ['march', 'pulse'], arp: ['up', 'updown'], bass: ['pulse', 'octave'] },
      },
    },
  },
  eerie: {
    about: 'Haunted and unsettling: music boxes, a whispering choir and drones, chords that never settle. For ghosts, crypts and the dark.',
    kinds: {
      haunting: { name: 'Haunting', tip: 'Haunting: music boxes, a whispering choir and drones, chords that never settle' },
      carnival: {
        name: 'Dead carnival', tip: 'Dead carnival: an empty funfair: a broken music box and an organ playing a waltz, wobbling out of tune',
        phrasing: { shapes: { zigzag: 2, turn: 2, dive: 2 }, rhythm: 'dotted', hook: 0.4 },
        meters: { '3/4': 4, '6/8': 1 }, chords: ['i V i V', 'i iv V i', 'i bII i V', 'i bVI V i', 'i #iv° V i'], methods: { bank: 4, chromatic: 1 },
        palette: { melody: ['music-box', 'accordion', 'celesta'], keys: ['music-box', 'harpsichord', 'celesta'], pad: ['organ', 'haunted-pad'] },
        drums: [0.1, 0.35], fx: { wobble: 0.6 }, patterns: { keys: ['waltz'] },
      },
      signal: {
        name: 'Static', tip: 'Static: analog horror: tape hiss, a detuned sine bell, a cold drone, a Geiger counter ticking',
        phrasing: { shapes: { chant: 3, pendulum: 2 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['fragments', 'long'] },
        palette: { melody: ['sine-bell', 'glass-bell', 'soft-lead'], drone: ['tape-loop', 'void', 'deep-drone'], pad: ['reverse-piano', 'dark-pad', 'air-pad'] },
        textures: ['geiger', 'hum', 'vinyl'], fx: { wobble: 0.6, drive: 0.2 },
      },
      // akira yamaoka's silent hill: industrial noise and scenery standing in for most of the music
      fog: {
        name: 'Fog', tip: "Fog: a town swallowed by fog: a radio crackling with static before anything else, a cold drone, a siren far off, a lone piano, footsteps that aren't yours",
        phrasing: { shapes: { fall: 2, chant: 2, sigh: 1 }, rhythm: 'long', hook: 0 }, busy: -0.1,
        prelude: 'Static', palette: { melody: ['piano', 'felt-keys', 'sine-bell', 'music-box'], pad: ['dark-pad', 'haunted-pad', 'reverse-piano', 'air-pad'], drone: ['void', 'deep-drone', 'tape-loop', 'bowed-metal'], keys: ['piano', 'felt-keys'] },
        textures: ['static', 'footsteps', 'siren', 'crows', 'hum'], layers: { texture: 1 }, fx: { wobble: 0.3, drive: 0.15 },
      },
      otherworld: {
        name: 'Rust', tip: 'Rust: the same town turned to rust and blood: metal clanging like a slow, broken machine, chains, a siren wailing, grinding drones and a low industrial beat',
        phrasing: { shapes: { chant: 3, dive: 2 }, rhythm: 'long', hook: 0 },
        energy: 0.35, edge: 0.85, kits: ['junk-kit'], drums: [0.5, 0.85], textures: ['clanks', 'chains', 'siren', 'factory'],
        palette: { drone: ['bowed-metal', 'deep-drone', 'void'], pad: ['haunted-pad', 'dark-pad', 'fuzz-wall'], bass: ['sub-bass', 'reese'], melody: ['music-box', 'sine-bell', 'piano', 'violin'] },
        patterns: { drums: ['halftime', 'sparse', 'pulse', 'march'], drone: ['cluster', 'tonic'] }, fx: { drive: 0.3 },
      },
      promise: {
        name: 'Regret', tip: "Regret: a letter from someone who's gone: a piano and a tremolo picked guitar over a slow, dusty trip hop beat, rain and a crackling radio",
        phrasing: { shapes: { sigh: 3, arch: 2, fall: 1 }, rhythm: 'snap', hook: 0.4 },
        style: 'tune', scales: { minor: 2, dorian: 1.5, harmonicMinor: 1 }, tuneTempo: [76, 92], energy: 0.55, dark: 0.6,
        chords: ['i bVI bIII bVII', 'i iv bVI V', 'i - bVI -', 'i bVII bVI V', 'iv i bVI V'], methods: { bank: 5, markov: 1 },
        palette: { guitar: ['clean-guitar', 'chorus-guitar'], melody: ['piano', 'chorus-guitar', 'felt-keys'], bass: ['round-bass', 'sub-bass', 'pluck-bass'], keys: ['piano', 'e-piano'] },
        kits: ['lofi-kit', 'machine'], drums: [0.5, 0.9], textures: ['rain', 'static'], layers: { guitar: 0.7 },
        patterns: { guitar: ['tremolo', 'ring'], drums: ['halftime', 'groove'], bass: ['held', 'rootfifth'], melody: ['phrases', 'long'] },
      },
    },
  },
  desolate: {
    about: 'Empty and quiet after it all ended: low drones, bowed metal, a lone plucked line with long silences round it, a Geiger counter ticking. For ruins, wastelands and empty places.',
    kinds: {
      ashes: { name: 'Ashes', tip: 'Ashes: low drones, bowed metal, a lone plucked line and a Geiger counter' },
      vault: {
        name: 'Bunker', tip: 'Bunker: deep underground and humming: a machine pulse, metal pings and a cold synth line',
        phrasing: { shapes: { chant: 2, pendulum: 2 }, rhythm: 'even', hook: 0.3 }, drums: [0.35, 0.7], patterns: { drums: ['pulse', 'sparse'], melody: ['calls', 'fragments'] },
        palette: { melody: ['sine-bell', 'soft-lead', 'felt-keys'], bells: ['metal-ping', 'sine-bell'] }, kits: ['machine'], textures: ['hum', 'drips', 'geiger'],
      },
      city: {
        name: 'Ruined city', tip: 'Ruined city: a bigger, sadder sound among the broken towers: strings and a piano among the drones',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['swell', 'sustain'] },
        palette: { melody: ['piano', 'violin', 'felt-keys'], pad: ['strings', 'dark-pad', 'choir-oo'] }, textures: ['wind', 'creaks'],
      },
    },
  },
  heroic: {
    about: "Brave and bold: horns and strings over a march or taiko, the hero's theme. For quests, victories and setting out.",
    kinds: {
      quest: { name: 'Quest', tip: 'Quest: horns and strings over a march or taiko' },
      fanfare: {
        name: 'Fanfare', tip: 'Fanfare: a royal court: trumpets and a brass section, timpani and a snare, the glockenspiel doubling the tune',
        phrasing: { shapes: { triad: 4, leap: 2, repeat: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.4,
        scales: { major: 3, mixolydian: 1 }, chords: ['I IV V I', 'I V vi IV', 'I bVII IV I', 'I IV I V', 'I bVI bVII I'],
        palette: { melody: ['trumpet', 'horn'], counter: ['trombone', 'horn', 'trumpet'], pad: ['brass-section', 'strings', 'organ'], bells: ['glock', 'bell'] },
        kits: ['orchestra-kit'], patterns: { drums: ['march'] }, orchestra: { pass: 0.5, double: 0.5 },
      },
      spaceopera: {
        name: 'Space opera', tip: 'Space opera: a fleet leaping across the stars: a big brass theme over pulsing strings and synth pads',
        phrasing: { shapes: { leap: 4, climb: 2, triad: 1 }, rhythm: 'long', hook: 0.3 }, build: 0.6, tuneTempo: [84, 108],
        scales: { mixolydian: 2, minor: 2, lydian: 1 },
        palette: { melody: ['horn', 'trumpet', 'synth-brass', 'violin'], pad: ['strings', 'analog-pad', 'brass-section', 'choir-ah'], arp: ['pizzicato', 'pluck-lead'], bass: ['synth-bass', 'sub-bass', 'round-bass'] },
        kits: ['orchestra-kit', 'taiko'], textures: ['hum'], patterns: { pad: ['pulse', 'sustain'], drums: ['march', 'tribal', 'halftime'] },
      },
    },
  },
  magic: {
    about: 'Wonder and wands: a flute or an oboe over bouncing pizzicato and a harp, a horn climbing, the tune passed round a small orchestra and its themes coming together at the end. For magic schools, spell books and enchanted places.',
    kinds: {
      school: { name: 'Wizard school', tip: 'Wizard school: a flute or oboe over bouncing pizzicato and harp, the tune passed round, its themes meeting at the end' },
      fairy: {
        name: 'Fairy glade', tip: 'Fairy glade: tiny and sparkling: harp, celesta and flutes, bells everywhere, lydian',
        phrasing: { shapes: { wave: 2, climb: 2, zigzag: 1, turn: 1 }, rhythm: 'running', hook: 0.5 }, busy: 0.1,
        scales: { lydian: 3, major: 1 }, energy: 0.45, bright: 0.8, dark: 0.1,
        palette: { melody: ['flute', 'celesta', 'glass-bell', 'music-box', 'piccolo'], bells: ['glock', 'celesta', 'glass-bell', 'chime'] },
        textures: ['chimes', 'birds', 'stream'], layers: { bells: 0.8, arp: 0.5 }, patterns: { arp: ['twinkle', 'up'], bells: ['sparkle', 'phasing'] },
      },
      forbidden: {
        name: 'Forbidden', tip: 'Forbidden: dark magic: a low choir and cellos, harmonic minor, a music box in the dark',
        phrasing: { shapes: { sigh: 2, turn: 2, dive: 2 }, rhythm: 'long', hook: 0.2 }, tuneTempo: [80, 104], meters: { '4/4': 3, '3/4': 2 }, patterns: { melody: ['long', 'phrases'], keys: ['broken', 'block'] },
        scales: { harmonicMinor: 3, hungarianMinor: 1, minor: 1 }, dark: 0.65, bright: 0.4,
        chords: ['i iv V i', 'i bVI V -', 'i v bVI V', 'i bII V i', 'i - bVI V'],
        palette: { melody: ['music-box', 'oboe', 'violin', 'celesta', 'choir-oo'], counter: ['bassoon', 'clarinet', 'violin'], pad: ['choir-ah', 'strings', 'dark-pad', 'haunted-pad'], drone: ['cello-drone', 'deep-drone'] },
        textures: ['owl', 'creaks', 'drips'],
      },
      // wysteria: spring at a school for wizards. a drum and cymbal, then horns with a flute and a
      // glockenspiel answering, a choir and a harp, a clarinet's tune in quick bouncing eighths, reeds
      // carrying a waltz over the brass, the horns passing the tune to the strings for a bold climax
      blossom: {
        name: 'Blossom', tip: 'Blossom: spring in bloom: a clarinet tune that bounces, horns, a glockenspiel and a harp, a waltz that swells to the strings',
        phrasing: { shapes: { triad: 2, climb: 2, pendulum: 1.5, arch: 1 }, rhythm: 'dotted', hook: 0.55 }, weave: 0.7,
        scales: { major: 3, lydian: 1, mixolydian: 0.7 }, meters: { '3/4': 4, '4/4': 3, '6/8': 1 }, bright: 0.75, dark: 0.1,
        chords: ['I IV V I', 'I vi IV V', 'I iii IV iv', 'I V vi IV', 'IV V iii vi', 'I II IV I'],
        palette: { melody: ['clarinet', 'flute', 'oboe', 'horn'], counter: ['horn', 'flute', 'cello', 'clarinet'], pad: ['strings', 'choir-oo', 'brass-section'], bells: ['glock', 'celesta'] },
        textures: ['birds', 'leaves', 'stream'], kits: ['spell-kit', 'orchestra-kit'], drums: [0.1, 0.55],
      },
      // celestia: a sunken city of the stars. low brass and a flute, a harp and a glockenspiel, horns over
      // a string ostinato, a turn to minor with strings climbing, dorian chords swaying between home and
      // a major four, a celesta's waltz, a piccolo cold and high, and a men's choir with hand drums and
      // a marimba in its old tribe's theme
      tides: {
        name: 'Starlit tides', tip: 'Starlit tides: a sunken city under the stars: horns over swaying strings, a harp, a celesta waltz, a piccolo high and cold',
        phrasing: { shapes: { wave: 2, leap: 2, arch: 1.5, sigh: 1 }, rhythm: 'long', hook: 0.3 },
        scales: { dorian: 3, lydian: 1.5, minor: 1, major: 1 }, meters: { '3/4': 3, '4/4': 3, '6/8': 1 }, bright: 0.55, dark: 0.35, space: 0.85,
        chords: ['i IV i IV', 'i - IV -', 'I II I II', 'i bVII IV i', 'i IV bVII i', 'IV I V vi'],
        palette: { melody: ['horn', 'flute', 'piccolo', 'celesta', 'violin'], counter: ['horn', 'cello', 'flute'], arp: ['harp', 'celesta', 'marimba'], bells: ['glock', 'celesta', 'vibes'], pad: ['strings', 'choir-ah', 'tremolo-strings', 'brass-section'] },
        textures: ['bubbles', 'chimes'], kits: ['spell-kit', 'hand-drums'],
      },
    },
  },
  gaslamp: {
    about: "A foggy Victorian city of cobbles, clocks and gaslight, and its grand waltz: a clarinet over a fluttering harp and chiming bells, a harpsichord keeping time, the tune passed to the horns, strings and trumpets, then the whole orchestra. For cities, mysteries and something afoot.",
    kinds: {
      fog: { name: 'City waltz', tip: 'City waltz: a clarinet over harp and chiming bells, a harpsichord keeping time, the tune passed round, its themes meeting at the end' },
      // the sewers under the city: a deep, quick bassoon, syncopated percussion, a sneaking tune that
      // won't stay in one key (what this mood used to be: a detective's clarinet over a walking bass)
      sneak: {
        name: 'Back alleys', tip: "Back alleys: a detective's clarinet over a sneaking bassoon, pizzicato and the rain, something afoot",
        phrasing: { shapes: { turn: 2, dive: 2, repeat: 2, zigzag: 1 }, rhythm: 'snap', hook: 0.5 }, weave: 0.2,
        scales: { minor: 2, harmonicMinor: 2, dorian: 1.5 }, meters: { '4/4': 5, '6/8': 2, '3/4': 1 }, tuneTempo: [92, 120], swing: 0.35, swingAmount: [0.15, 0.3],
        chords: ['i iv V i', 'i bVI ii° V', 'i - iv V', 'i iv i V', 'i bVII bVI V'],
        palette: { melody: ['clarinet', 'oboe', 'mute-trumpet', 'harpsichord'], bass: ['bassoon', 'tuba', 'upright'], keys: ['pizzicato', 'harpsichord', 'piano'] },
        kits: ['clockwork', 'orchestra-kit', 'brushes'], patterns: { bass: ['walking', 'hook'], keys: ['broken', 'block'], drums: ['march', 'sparse', 'groove'], melody: ['calls', 'phrases'] },
      },
      musichall: {
        name: 'Music hall', tip: 'Music hall: a Victorian music hall: an upright piano, a brass band and a jaunty oom-pah in a major key',
        phrasing: { shapes: { triad: 2, repeat: 2, call: 2 }, rhythm: 'dotted', hook: 0.6 }, weave: 0,
        scales: { major: 3, mixolydian: 1 }, bright: 0.65, dark: 0.15, swing: 0.5, chords: ['I I7 IV iv', 'I vi ii V', 'I II7 V7 I', 'I IV I V'],
        palette: { melody: ['honky-tonk', 'clarinet', 'trumpet', 'accordion', 'whistle'], keys: ['honky-tonk', 'piano'], bass: ['tuba', 'upright'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { keys: ['waltz', 'block'], drums: ['march', 'groove'] },
      },
      clockwork: {
        name: 'Clockwork', tip: 'Clockwork: a steampunk workshop: clocks ticking, a harpsichord whirring, a celesta and a bassoon',
        phrasing: { shapes: { zigzag: 2, repeat: 2, climb: 2 }, rhythm: 'running', hook: 0.7 },
        palette: { arp: ['harpsichord', 'celesta', 'music-box', 'pizzicato'], melody: ['oboe', 'clarinet', 'celesta', 'harpsichord'] },
        kits: ['clockwork'], drums: [0.6, 0.9], layers: { arp: 0.8 }, textures: ['creaks', 'fire'],
        patterns: { arp: ['up', 'updown', 'converge'], drums: ['march', 'pulse', 'groove'] },
      },
      // darkmoor: a vampire's castle. an eerie celesta with a shrill violin, the theme called and
      // answered round the oboe and harp, the flute and pizzicato, a choir and chimes trading beats as a
      // minor chord turns major, a waltz, an alto flute doubled by a pipe organ
      manor: {
        name: 'Moonlit manor', tip: 'Moonlit manor: a castle at midnight: a celesta and a thin violin, a choir and chimes, a pipe organ and a waltz in harmonic minor',
        phrasing: { shapes: { sigh: 2, turn: 2, arch: 1, dive: 1 }, rhythm: 'even', hook: 0.3 },
        scales: { harmonicMinor: 3, minor: 1, hungarianMinor: 0.5 }, meters: { '3/4': 5, '4/4': 1.5 }, dark: 0.6, bright: 0.4, tuneTempo: [96, 126],
        chords: ['i iv V i', 'i bVI V -', 'i - I -', 'i iv I V', 'i bII V i', 'i VI iv V'],
        palette: { melody: ['celesta', 'violin', 'oboe', 'flute'], counter: ['violin', 'cello', 'oboe', 'bassoon'], pad: ['choir-ah', 'organ', 'strings', 'tremolo-strings'], keys: ['harp', 'pizzicato', 'harpsichord'], bass: ['bassoon', 'tuba', 'upright'] },
        textures: ['owl', 'creaks', 'wind'], kits: ['orchestra-kit'], drums: [0.1, 0.5],
      },
    },
  },
  dragon: {
    about: 'A fallen city of fire and ash: a choir, an organ and low brass over timpani and the crackle of flames, a lone trumpet calling out. For dragons, volcanoes and dark citadels.',
    kinds: {
      citadel: { name: 'Burning citadel', tip: 'Burning citadel: a choir, an organ and low brass over timpani and fire' },
      lair: {
        name: 'Lair', tip: 'Lair: the dragon asleep: low drones and cellos, a heartbeat, a lone horn, embers',
        phrasing: { shapes: { chant: 2, sigh: 2, fall: 1 }, rhythm: 'long', hook: 0 }, busy: -0.1,
        style: 'ambient', energy: 0.35, kits: ['heartbeat', 'orchestra-kit'], drums: [0.3, 0.6],
        palette: { melody: ['horn', 'oboe', 'choir-oo', 'violin'] }, textures: ['fire', 'rumble'],
        patterns: { drums: ['pulse', 'sparse'], melody: ['long', 'fragments'] },
      },
      charge: {
        name: 'Charge', tip: 'Charge: the knights ride out: a faster march, horns and trumpets in fifths, the choir driving',
        phrasing: { shapes: { triad: 3, repeat: 2, leap: 2 }, rhythm: 'dotted', hook: 0.6 },
        tuneTempo: [120, 150], energy: 0.95, meters: { '4/4': 5, '6/8': 2 },
        palette: { melody: ['trumpet', 'horn', 'choir-oo'], counter: ['trombone', 'horn'] },
        patterns: { drums: ['march', 'tribal'], bass: ['octave', 'pulse'], pad: ['pulse', 'stabs'] },
      },
    },
  },
  sands: {
    about: 'An empire of sand and gold, played by an orchestra: a tam-tam, a harp keeping time under lyres, horns holding a slow tune, an oboe dancing over it, a triangle and a sistrum. For pyramids, desert palaces and old kings.',
    kinds: {
      pyramids: { name: 'Pyramids', tip: 'Pyramids: a tam-tam, a harp and lyre keeping time, horns holding a slow tune, an oboe dancing over it' },
      // krokotopia's third and fourth themes
      royal: {
        name: 'Royal march', tip: 'Royal march: a stately march: a low flute dancing over an ostinato, hand drums, a triangle on two, a sistrum on the off beats and a gong',
        phrasing: { shapes: { triad: 2, turn: 2, repeat: 1.5, arch: 1 }, rhythm: 'dotted', hook: 0.55 },
        energy: 0.7, tuneTempo: [96, 120], meters: { '4/4': 6, '3/4': 1 }, drums: [0.5, 0.95],
        palette: { melody: ['flute', 'oboe', 'horn'], counter: ['horn', 'oboe', 'cello'] },
        patterns: { drums: ['march', 'march', 'maqsum'], bass: ['rootfifth', 'hook'], keys: ['broken'] },
      },
      // zafaria: a savanna kingdom of lions and elephants. little is written about its music, so this is
      // from listening: hand drums, a marimba and a thumb piano under horns and a choir
      savanna: {
        name: 'Golden plains', tip: 'Golden plains: a kingdom on the grasslands: hand drums, a marimba and a thumb piano, horns and a choir',
        phrasing: { shapes: { call: 2, repeat: 2, triad: 1.5, wave: 1 }, rhythm: 'syncopated', hook: 0.6 },
        scales: { major: 2, mixolydian: 2, majorPentatonic: 2, dorian: 1 }, bright: 0.65, dark: 0.2,
        chords: ['I IV I V', 'I - IV -', 'I V vi IV', 'IV I V I', 'I bVII IV I'],
        palette: { melody: ['horn', 'flute', 'choir-oo', 'kalimba'], keys: ['marimba', 'kalimba', 'mbira', 'harp'], arp: ['marimba', 'kalimba', 'mbira'], bells: ['vibes', 'glock'], pad: ['choir-ah', 'strings', 'brass-section'] },
        textures: ['birds', 'crickets', 'wind'], kits: ['hand-drums', 'palace-kit'], patterns: { drums: ['tribal', 'groove', 'march'] },
      },
    },
  },
  jade: {
    about: 'A land of jade pagodas: a high gong, a koto plucking with the harp, a flute calling and the koto answering, an erhu, finger cymbals and a gong at the top. For eastern palaces, gardens and temples.',
    kinds: {
      gardens: { name: 'Jade gardens', tip: 'Jade gardens: a gong, a koto and a flute calling and answering, finger cymbals, then the flute playing both themes at once' },
      // mooshu's plague theme
      blight: {
        name: 'Blight', tip: 'Blight: a land under a sickness: an erhu over plucked strings in a minor key, brass climbing, the harp and high strings falling',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1, turn: 1 }, rhythm: 'long', hook: 0.2 },
        scales: { minorPentatonic: 2, minor: 2, hirajoshi: 2, dorian: 1 }, dark: 0.55, bright: 0.4, tuneTempo: [76, 100],
        chords: ['i - bVI -', 'i bVII bVI bVII', 'i iv i -', 'i bVI bIII bVII', 'i v bVI V'],
        palette: { melody: ['erhu', 'shakuhachi', 'flute'], counter: ['erhu', 'horn', 'cello'], pad: ['strings', 'tremolo-strings', 'brass-section'] },
        patterns: { melody: ['long', 'phrases'], arp: ['down', 'updown'] },
      },
      // mooshu's war theme: seven beats a bar (five here, the nearest uneven beat)
      war: {
        name: 'War drums', tip: 'War drums: an army in the mountains: dark brass and deep drums in an uneven beat, strings and a flute, the plucked strings echoing the brass',
        phrasing: { shapes: { repeat: 2, dive: 2, triad: 1.5, chant: 1 }, rhythm: 'dotted', hook: 0.6 }, weave: 0.3,
        scales: { minorPentatonic: 2, minor: 2, phrygian: 1, hirajoshi: 1 }, meters: { '5/4': 3, '4/4': 3 }, energy: 0.8, dark: 0.6, bright: 0.4, tuneTempo: [100, 132], drums: [0.6, 1],
        chords: ['i - bVI -', 'i bVII bVI V', 'i bII i -', 'i iv bVI V'],
        palette: { melody: ['horn', 'trombone', 'shakuhachi', 'erhu'], counter: ['trombone', 'horn', 'cello'], pad: ['brass-section', 'strings', 'tremolo-strings'], bass: ['tuba', 'upright'] },
        kits: ['jade-kit', 'taiko'], patterns: { drums: ['tribal', 'march', 'halftime'], pad: ['stabs', 'pulse', 'sustain'], bass: ['octave', 'rootfifth'] },
      },
      // the mystical theme from the skyways
      mists: {
        name: 'Mists', tip: 'Mists: a mountain shrine in the clouds: a koto in even eighths, finger cymbals and wooden blocks, an erhu holding long notes, a gong',
        phrasing: { shapes: { pendulum: 2, turn: 2, wave: 1.5, chant: 1 }, rhythm: 'even', hook: 0.4 },
        energy: 0.45, space: 0.8, tuneTempo: [76, 100],
        palette: { melody: ['koto', 'flute', 'shakuhachi'], counter: ['erhu', 'flute'], keys: ['koto', 'zither'], arp: ['koto', 'zither', 'harp'] },
        textures: ['wind', 'chimes', 'stream'], patterns: { keys: ['broken'], arp: ['up', 'converge'], drums: ['sparse', 'pulse'] },
      },
    },
  },
  greenwood: {
    about: "A green and ancient land of knights, castles and the fae: noble horns and strings over a harp, a flute with a lilt, a dance in six. For old kingdoms, forests and quests.",
    kinds: {
      knights: { name: 'Greenwood', tip: 'Greenwood: noble horns and strings over a harp, a flute with a lilt, a dance in six' },
      // avalon's wyrd: the fae's side of the wood
      wyrd: {
        name: 'Fae wood', tip: 'Fae wood: the wood where the fae live: a harp and celesta, a flute in a minor mode, strings trembling, something watching',
        phrasing: { shapes: { turn: 2, wave: 2, sigh: 1, zigzag: 1 }, rhythm: 'even', hook: 0.35 },
        scales: { dorian: 2, minor: 2, harmonicMinor: 1, lydian: 0.5 }, dark: 0.5, bright: 0.5, energy: 0.45,
        chords: ['i bVII i -', 'i iv i bVII', 'i bVI bVII i', 'i IV i IV', 'i iv V i'],
        palette: { melody: ['flute', 'celesta', 'violin', 'oboe'], keys: ['harp', 'celesta'], arp: ['harp', 'celesta'], pad: ['tremolo-strings', 'strings', 'choir-oo'] },
        textures: ['owl', 'leaves', 'chimes'], drums: [0, 0.4],
      },
      // grizzleheim: the north of bears and runes. little is written about its music, so from listening:
      // a men's choir, horns and drums, a fiddle, fifths held under it all
      longhouse: {
        name: 'Longhouse', tip: 'Longhouse: a cold northern hall: a low men\'s choir and horns, a fiddle, deep drums and open fifths held underneath',
        phrasing: { shapes: { chant: 2, triad: 2, leap: 1.5, sigh: 1 }, rhythm: 'long', hook: 0.3 },
        scales: { dorian: 2, minor: 2, phrygian: 0.7, mixolydian: 1 }, meters: { '4/4': 4, '3/4': 2, '6/8': 1 }, dark: 0.5, bright: 0.45, energy: 0.65,
        chords: ['i bVII i -', 'i - bVI bVII', 'i bIII bVII i', 'i iv bVII i'],
        palette: { melody: ['horn', 'violin', 'chant-voice', 'cello'], counter: ['chant-voice', 'horn', 'cello', 'trombone'], pad: ['choir-ah', 'strings', 'brass-section'], drone: ['cello-drone', 'organ-drone'] },
        layers: { drone: 0.6 }, textures: ['wind', 'fire'], kits: ['taiko', 'orchestra-kit'], drums: [0.4, 0.85], patterns: { drums: ['tribal', 'march', 'halftime'], drone: ['fifths'] },
      },
    },
  },
  metal: {
    about: 'Heavy and relentless: chugging riffs, a double kick, the bass doubling the riff, twin guitars in harmony and screaming solos. For bosses, hellscapes and anything heavy.',
    kinds: {
      thrash: { name: 'Thrash', tip: 'Thrash: chugging riffs, double kick, twin leads and a solo' },
      symphonic: {
        name: 'Symphonic', tip: 'Symphonic: metal meets the orchestra: the band with a choir and strings, a horn sometimes taking the tune',
        phrasing: { shapes: { leap: 3, triad: 2, climb: 1 }, hook: 0.4 }, build: 0.4,
        scales: { harmonicMinor: 2, minor: 2, phrygian: 1 },
        palette: { pad: ['choir-ah', 'strings', 'brass-section'], melody: ['metal-lead', 'horn', 'violin'], counter: ['lead-guitar', 'horn'] },
        layers: { pad: 0.9 }, orchestra: { pass: 0.35, double: 0 },
      },
      stoner: {
        name: 'Stoner', tip: 'Stoner: slow, fuzzy and bluesy, a riff crawling along on the sludge guitar, thick as smoke',
        phrasing: { shapes: { dive: 3, repeat: 2, turn: 1 }, rhythm: 'snap', hook: 0.6 },
        tuneTempo: [64, 84], scales: { minorPentatonic: 2, blues: 1, minor: 1, phrygian: 1 },
        palette: { guitar: ['sludge-guitar'], bass: ['fuzz-bass', 'pick-bass'] },
        patterns: { drums: ['halftime', 'rock'], guitar: ['power', 'chug'] },
      },
    },
  },
  grunge: {
    about: 'Angst in a flannel shirt: a quiet clean verse, then the distortion stamped on for the chorus. For angst, garages and rainy cities.',
    kinds: {
      seattle: { name: 'Garage', tip: 'Garage: a quiet clean verse, the distortion stamped on for the chorus' },
      unplugged: {
        name: 'Unplugged', tip: 'Unplugged: the band sat down on stools: acoustic guitars, a cello, soft drums, the same sad songs quieter',
        phrasing: { shapes: { sigh: 2, chant: 2, fall: 1 }, rhythm: 'even', hook: 0.3 },
        energy: 0.5, edge: 0.7, loudQuiet: 0,
        palette: { guitar: ['steel-guitar', 'clean-guitar'], melody: ['rasp-voice', 'violin', 'harmonica'], counter: ['violin', 'clean-guitar', 'harmonica'], pad: ['strings'], bass: ['upright', 'pick-bass'] },
        kits: ['brushes', 'soft-kit'], textures: ['hum'],
        patterns: { guitar: ['strum', 'ring'], drums: ['brush', 'halftime', 'groove'], bass: ['rootfifth', 'held'] },
      },
    },
  },
  hardcore: {
    about: 'Fast and heartfelt: punk beats, driving eighths, a twinkling clean guitar and a breakdown to jump around to. For skating, rebellion and running.',
    kinds: {
      melodic: { name: 'Melodic', tip: 'Melodic: punk beats, driving eighths, a twinkling clean guitar and a breakdown' },
      poppunk: {
        name: 'Pop punk', tip: 'Pop punk: summer, skateparks and bad decisions: major keys, bouncy, a catchy lead over a punk beat',
        phrasing: { shapes: { repeat: 3, call: 2, leap: 1 }, rhythm: 'even', hook: 0.7 },
        scales: { major: 3, mixolydian: 1 }, dark: 0.1, bright: 0.75, chords: ['I V vi IV', 'I IV V I', 'vi IV I V', 'I V IV IV', 'IV I V vi'],
        patterns: { drums: ['punk', 'rock'] },
      },
      twinkle: {
        name: 'Twinkle', tip: 'Twinkle: an emo band playing in a basement: clean guitars twinkling, softer drums, major sevenths',
        phrasing: { shapes: { wave: 3, zigzag: 2, arch: 1 }, rhythm: 'running', hook: 0.4 },
        tuneTempo: [100, 140], energy: 0.6, edge: 0.6, richness: [0.5, 0.9], loudQuiet: 0.2,
        chords: ['IVmaj7 I V vi', 'Imaj7 IVmaj7', 'vi IV I V', 'IVmaj7 iii7 vi7 V', 'Imaj7 iii7 IVmaj7 -'],
        palette: { guitar: ['clean-guitar', 'chorus-guitar'], arp: ['clean-guitar', 'chorus-guitar'], melody: ['lead-guitar', 'rasp-voice', 'chorus-guitar'] },
        layers: { arp: 0.9, guitar: 0.7 }, patterns: { arp: ['twinkle', 'updown'], drums: ['rock', 'halftime', 'groove'], guitar: ['ring', 'strum'] },
      },
    },
  },
  shoegaze: {
    about: 'Loud and blissful, eyes on your shoes and the amp all the way up: guitars as a wall of sound, warping and reversed, a voice buried in it. For dreams, haze and feeling everything at once.',
    kinds: {
      wall: { name: 'Wall of sound', tip: 'Wall of sound: glide guitars warping, reverse reverb, a buried voice and a cymbal wash' },
      blackgaze: {
        name: 'Blackgaze', tip: 'Blackgaze: dawn breaking through a storm: tremolo picked guitars, fast drums, a huge, bright wash in a minor key',
        phrasing: { shapes: { chant: 2, climb: 2, arch: 1 }, rhythm: 'long', hook: 0.2 }, build: 0.5,
        scales: { minor: 2, dorian: 1, major: 1 }, tuneTempo: [130, 170], energy: 0.95, dark: 0.45, edge: 1.1,
        kits: ['gaze-kit', 'metal-kit'], patterns: { guitar: ['tremolo', 'tremolo', 'ring'], drums: ['rock', 'wash', 'double'] },
      },
    },
  },
  dreampop: {
    about: 'Soft and hazy, half asleep in the back seat: chorused clean guitars, a breathy voice floating, a slow organ and a drum machine. For night drives and drifting off.',
    kinds: {
      haze: { name: 'Haze', tip: 'Haze: chorused clean guitars, a breathy voice, organ and a drum machine' },
      bedroom: {
        name: 'Bedroom pop', tip: 'Bedroom pop: lo-fi and close: a jangling guitar, a cheap drum machine and worn tape',
        phrasing: { shapes: { repeat: 2, pendulum: 2, call: 1 }, rhythm: 'snap', hook: 0.6 },
        energy: 0.55, tuneTempo: [90, 116], kits: ['machine', 'lofi-kit'], textures: ['vinyl'], fx: { wobble: 0.6 },
        palette: { melody: ['dream-voice', 'chorus-guitar', 'soft-lead'] }, patterns: { drums: ['groove', 'halftime'], guitar: ['strum', 'ring'] },
      },
    },
  },
  ethereal: {
    about: 'A voice soaring and fluttering in a language of its own, over guitars cascading through long echoes, a bass with a tune of its own and a drum machine. Dreamy, but always melodic.',
    kinds: {
      soaring: { name: 'Soaring', tip: 'Soaring: the voice up front and fluttering, guitars cascading through the echo like light through water' },
      dancing: {
        name: 'Dancing', tip: 'Dancing: glittering and quicker: four on the floor, a bass bouncing in octaves, guitars shimmering',
        phrasing: { shapes: { zigzag: 2, repeat: 2, call: 2 }, rhythm: 'syncopated', hook: 0.7 },
        scales: { major: 3, lydian: 1, mixolydian: 1 }, tempo: [84, 96], tuneTempo: [112, 126], meters: { '4/4': 1 },
        energy: 0.8, bright: 0.75, drums: [0.5, 1], kits: ['machine', 'club-kit'], opens: ['drums', 'bass', 'arp'],
        patterns: { drums: ['four', 'groove', 'four'], bass: ['octave', 'synco', 'hook'], arp: ['updown', 'up'], guitar: ['strum', 'ring'] },
      },
      mellow: {
        name: 'Mellow', tip: 'Mellow: slow and minor, barely any drums, a guitar ringing alone in the echo, a sax drifting through like mist',
        phrasing: { shapes: { sigh: 2, wave: 2, fall: 1 }, rhythm: 'long', hook: 0.1 }, busy: -0.1,
        scales: { dorian: 2, minor: 2, mixolydian: 1 }, tempo: [52, 66], tuneTempo: [66, 84],
        chords: ['i bVI bIII bVII', 'i iv', 'vi IV I V', 'i bVII bVI bVII', 'Imaj7 vi7', 'i - bVI -', 'iv i'],
        energy: 0.35, dark: 0.35, bright: 0.45, drums: [0, 0.25],
        palette: { melody: ['dream-voice', 'tenor-sax', 'chorus-guitar'], counter: ['tenor-sax', 'clean-guitar', 'glass-bell'] },
        patterns: { melody: ['long', 'phrases', 'fragments'], drums: ['wash', 'sparse', 'halftime'], bass: ['held', 'rootfifth'] },
      },
    },
  },
  desert: {
    about: 'Arabian nights and the Andalusian sands: an oud and a shawm over hand drums and a drone, in the phrygian dominant. For deserts, bazaars and palaces.',
    kinds: {
      bazaar: { name: 'Bazaar', tip: 'Bazaar: an oud and a shawm over hand drums and a drone' },
      oasis: {
        name: 'Oasis', tip: 'Oasis: slower and cooler: a flute or oud over a drone, shade and water, few drums',
        phrasing: { shapes: { wave: 2, turn: 2, fall: 1 }, rhythm: 'long', hook: 0.2 },
        style: 'ambient', energy: 0.35, drums: [0.1, 0.4],
        palette: { melody: ['flute', 'oud', 'pan-flute', 'violin'] }, textures: ['stream', 'crickets', 'wind'],
        patterns: { drums: ['pulse', 'sparse', 'tribal'] },
      },
      palace: {
        name: 'Palace', tip: "Palace: a sultan's court: strings sweeping in unison, the darbuka, the shawm wailing",
        phrasing: { shapes: { zigzag: 2, turn: 2, dive: 1, climb: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.4,
        palette: { pad: ['strings', 'choir-ah'], counter: ['violin', 'oud', 'shawm'] }, layers: { pad: 0.9, counter: 0.6 },
        kits: ['darbuka-kit', 'hand-drums'], patterns: { drums: ['maqsum', 'tribal', 'groove'] }, orchestra: { pass: 0.5, double: 0.1 },
      },
    },
  },
  tropical: {
    about: 'Islands, jungles and beaches: steel drums and marimbas over a bouncing bass and hand drums. For beaches, jungles and holidays.',
    kinds: {
      island: { name: 'Island', tip: 'Island: steel drums and marimbas over a bouncing bass and hand drums' },
      jungle: {
        name: 'Jungle', tip: 'Jungle: deep in the canopy: pan pipes and marimba, frogs and birds, a busier hand drum beat, darker',
        phrasing: { shapes: { call: 2, turn: 2, pendulum: 2 }, rhythm: 'syncopated', hook: 0.5 },
        scales: { dorian: 2, minorPentatonic: 2, mixolydian: 1 }, dark: 0.3,
        palette: { melody: ['pan-flute', 'marimba', 'kalimba', 'ocarina'] }, textures: ['frogs', 'birds', 'rain'],
        kits: ['hand-drums', 'african-drums'], patterns: { drums: ['tribal', 'groove'] },
      },
      hawaii: {
        name: 'Hawaii', tip: 'Hawaii: a lap steel sliding, a guitar strumming like a ukulele, waves, a slow sway',
        phrasing: { shapes: { wave: 3, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [84, 104], energy: 0.5, meters: { '4/4': 1 },
        palette: { melody: ['pedal-steel', 'steel-guitar', 'vibes'], keys: ['steel-guitar', 'nylon'], arp: ['steel-guitar', 'nylon'], counter: ['pedal-steel', 'vibes', 'nylon'] },
        textures: ['ocean', 'birds'], patterns: { drums: ['groove', 'halftime'], keys: ['strum'] },
      },
    },
  },
  folk: {
    about: 'Celtic and village folk: a fiddle, tin whistle or bagpipe over a strummed guitar and droning fifths, jigs in 6/8. For villages, taverns and green hills.',
    kinds: {
      village: { name: 'Village', tip: 'Village: a fiddle or tin whistle over a strummed guitar and open fifths' },
      tavern: {
        name: 'Tavern', tip: 'Tavern: a rowdy session: fast reels, the fiddle and accordion together, stamping feet',
        phrasing: { shapes: { zigzag: 2, wave: 2, turn: 2 }, rhythm: 'running', hook: 0.4 }, busy: 0.1,
        tuneTempo: [120, 150], energy: 0.8, kits: ['stomp-kit', 'hand-drums'],
        palette: { melody: ['violin', 'accordion', 'whistle', 'bagpipe'], counter: ['accordion', 'violin', 'whistle'] },
        patterns: { drums: ['groove', 'march', 'gallop'] }, orchestra: { pass: 0.5, double: 0.1 },
      },
      air: {
        name: 'Slow air', tip: 'Slow air: a lone whistle or fiddle and a harp, mist on the hills',
        phrasing: { shapes: { arch: 2, wave: 2, sigh: 2 }, rhythm: 'long', hook: 0 },
        tuneTempo: [66, 84], energy: 0.35, drums: [0.05, 0.2],
        palette: { melody: ['whistle', 'violin', 'flute', 'pan-flute'], keys: ['harp', 'nylon'], arp: ['harp'] },
        textures: ['wind', 'stream', 'birds'], patterns: { melody: ['long', 'phrases'] },
      },
    },
  },
  wintry: {
    about: 'Snow and ice: from a quiet snowfall to Christmas by the fire. Celesta, glass bells and shimmering pads, a waltz, wind and a fire. For snowy towns and winter nights.',
    kinds: {
      snowfall: { name: 'Snowfall', tip: 'Snowfall: celesta and glass bells over shimmering pads, wind and a fire' },
      snowtown: {
        name: 'Snow town', tip: 'Snow town: a cosy little town buried in snow: a bouncy tune on bells or a chip lead, a walking bass, warm and a little silly',
        phrasing: { shapes: { repeat: 2, pendulum: 2, call: 2 }, rhythm: 'even', hook: 0.6 },
        style: 'tune', scales: { major: 3, majorPentatonic: 1, lydian: 1 }, tuneTempo: [100, 124], energy: 0.55,
        palette: { melody: ['glock', 'celesta', 'pulse-lead', 'music-box', 'xylophone'], counter: ['celesta', 'vibes', 'marimba'], bass: ['upright', 'round-bass', 'chip-bass'] },
        kits: ['soft-kit', 'chip-kit'], patterns: { bass: ['walking', 'rootfifth'], drums: ['groove'] },
      },
      christmas: {
        name: 'Christmas', tip: 'Christmas: a jolly major tune on the glockenspiel or a horn, a choir, sleigh-ride swing, warm by the fire',
        phrasing: { shapes: { triad: 2, repeat: 2, fall: 2 }, rhythm: 'dotted', hook: 0.5 },
        style: 'tune', scales: { major: 4, mixolydian: 1 }, energy: 0.65, swing: 0.4, richness: [0.3, 0.7],
        chords: ['I vi IV V', 'I IV I V', 'I I7 IV iv', 'I vi ii V', 'IV V I vi', 'I III7 vi IV'],
        palette: { melody: ['glock', 'celesta', 'flute', 'music-box', 'horn'], bells: ['glock', 'chime', 'celesta'], pad: ['choir-oo', 'strings', 'choir-ah'] },
        layers: { bells: 0.7 }, kits: ['soft-kit', 'orchestra-kit'], textures: ['fire'],
        patterns: { drums: ['groove', 'march'], bass: ['rootfifth', 'walking'] }, orchestra: { pass: 0.4, double: 0.5 },
      },
      icecave: {
        name: 'Ice cave', tip: 'Ice cave: frozen and echoing: wine glasses and glass bells, drips, a cold drone, minor',
        phrasing: { shapes: { chant: 2, pendulum: 2, fall: 1 }, rhythm: 'long', hook: 0 },
        scales: { minor: 2, dorian: 1, lydian: 1 }, dark: 0.4,
        palette: { melody: ['wine-glass', 'glass-bell', 'sine-bell', 'celesta'], drone: ['void', 'tape-loop'] }, textures: ['drips', 'wind'],
      },
    },
  },
  synthwave: {
    about: 'Night drives in the 80s future: saw leads and synth brass over arps, an octave bass and a drum machine. For racing, neon and sunsets.',
    kinds: {
      outrun: { name: 'Outrun', tip: 'Outrun: saw leads and synth brass over arps, an octave bass and a drum machine' },
      darksynth: {
        name: 'Darksynth', tip: 'Darksynth: the night drive turned into a horror film: faster and harder, a growling bass and a menacing minor lead',
        phrasing: { shapes: { repeat: 3, dive: 2, pendulum: 1 }, rhythm: 'snap', hook: 0.7 },
        tuneTempo: [110, 128], dark: 0.7, scales: { minor: 2, phrygian: 1, harmonicMinor: 1 },
        palette: { bass: ['growl-bass', 'reese', 'synth-bass'] }, fx: { drive: 0.3, wobble: 0.1 }, patterns: { drums: ['four', 'groove'] },
      },
      dreamwave: {
        name: 'Dreamwave', tip: 'Dreamwave: hazy and slow: soft leads, warm pads, a gated snare, tape gone soft in the sun',
        phrasing: { shapes: { arch: 3, sigh: 2 }, rhythm: 'long', hook: 0.3 },
        tuneTempo: [80, 100], energy: 0.55,
        palette: { melody: ['soft-lead', 'sine-bell', 'e-piano', 'pluck-lead'] }, fx: { wobble: 0.5 }, patterns: { drums: ['halftime', 'groove'] },
      },
    },
  },
  breakbeat: {
    about: 'Drum and bass: breakbeats at 170 under a reese bass and airy pads. For speed, rain and flying.',
    kinds: {
      liquid: { name: 'Liquid', tip: 'Liquid: breaks at 170 under a reese bass, airy pads and a soft lead' },
      jungle: {
        name: 'Jungle', tip: 'Jungle: the 90s original: chopped breaks, a deep sub bass, organ chords on the off beat and an orchestra hit',
        phrasing: { shapes: { call: 2, zigzag: 2, repeat: 1 }, rhythm: 'syncopated', hook: 0.6 },
        palette: { pad: ['orchestra-hit', 'strings', 'air-pad'], keys: ['hammond', 'e-piano'] }, layers: { keys: 0.6 },
        patterns: { keys: ['skank'], bass: ['held', 'synco'] },
      },
      triphop: {
        name: 'Trip hop', tip: 'Trip hop: smoky and slow: the breaks slowed right down, a dusty kit, vinyl, minor and moody',
        phrasing: { shapes: { sigh: 2, fall: 2, chant: 1 }, rhythm: 'snap', hook: 0.3 },
        tempo: [70, 84], tuneTempo: [80, 96], dark: 0.5, energy: 0.55, swing: 0.4,
        kits: ['boombap-kit', 'lofi-kit'], textures: ['vinyl', 'rain'],
        palette: { melody: ['e-piano', 'sine-bell', 'violin', 'soft-lead'], pad: ['strings', 'dark-pad'] },
        patterns: { drums: ['halftime', 'break', 'groove'] },
      },
    },
  },
  neon: {
    about: 'Dark and electric, a city that never sleeps and never feels safe: a crushed chip lead over pumping pads, an octave bass and a club kick. For night cities, hacking and running from something.',
    kinds: {
      club: { name: 'Night club', tip: 'Night club: a crushed chip lead over pumping pads, an octave bass and a club kick' },
      cyberpunk: {
        name: 'Rain city', tip: 'Rain city: neon signs reflected in wet streets: huge analog pads, a slow saw or soft lead, rain on the pavement',
        phrasing: { shapes: { chant: 2, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [90, 110], energy: 0.6,
        palette: { melody: ['soft-lead', 'saw-lead', 'synth-brass', 'sine-bell'], pad: ['analog-pad', 'glass-pad', 'dark-pad', 'choir-ah'] },
        textures: ['rain', 'hum'], patterns: { drums: ['halftime', 'groove'], pad: ['swell', 'sustain'] },
      },
      industrial: {
        name: 'Industrial', tip: 'Industrial: the factory turned into a nightclub: a distorted machine beat, metal clanging, a growling bass',
        phrasing: { shapes: { repeat: 3, dive: 2 }, rhythm: 'snap', hook: 0.8 },
        kits: ['machine', 'junk-kit'], fx: { drive: 0.6 }, textures: ['hum', 'geiger'],
        palette: { bass: ['growl-bass', 'reese', 'synth-bass'], bells: ['metal-ping', 'bell'] }, patterns: { drums: ['groove', 'halftime', 'four'] },
      },
    },
  },
  pop: {
    about: 'Four chord pop: a bright piano or plucked synth with the hook, pads, a strummed guitar and a backbeat. For menus, montages and feeling good.',
    kinds: {
      radio: { name: 'Radio', tip: 'Radio: a piano or plucked synth hook, pads and a backbeat' },
      ballad: {
        name: 'Power ballad', tip: 'Power ballad: slow and big: a piano, strings swelling, the drums coming in huge for the chorus',
        phrasing: { shapes: { arch: 3, leap: 2, sigh: 1 }, rhythm: 'long', hook: 0.3 }, build: 0.5,
        tuneTempo: [66, 84], energy: 0.55,
        palette: { melody: ['piano', 'soft-lead', 'violin', 'e-piano'], keys: ['piano', 'e-piano'], pad: ['strings', 'synth-strings', 'warm-pad'] },
        patterns: { drums: ['halftime', 'groove'], keys: ['block', 'broken'] },
      },
      bubblegum: {
        name: 'Bubblegum', tip: 'Bubblegum: sugary and sparkly: fast and bright, a plucky synth and a glockenspiel, four on the floor',
        phrasing: { shapes: { repeat: 3, call: 2, zigzag: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [124, 144], palette: { melody: ['pluck-lead', 'synth-brass', 'soft-lead', 'whistle'], bells: ['glock', 'celesta', 'sine-bell'] },
        layers: { bells: 0.5 }, kits: ['club-kit', 'tight-kit'], patterns: { drums: ['four', 'groove'], bass: ['octave', 'synco'] },
      },
    },
  },
  hiphop: {
    about: 'A beat tape with no rapper, made in a bedroom at 2am: a dusty boom bap kit, a Rhodes looping jazzy chords, vinyl and scratches. For chilling, studying and city streets.',
    kinds: {
      tape: { name: 'Beat tape', tip: 'Beat tape: a dusty boom bap kit, a Rhodes on jazzy chords, vinyl and scratches' },
      study: {
        name: 'Lo-fi study', tip: 'Lo-fi study: slower and softer: a felt piano or guitar, rain on the window, the beat lazier',
        phrasing: { shapes: { sigh: 2, pendulum: 2, fall: 1 }, rhythm: 'snap', hook: 0.4 },
        tuneTempo: [70, 84], energy: 0.45, textures: ['vinyl', 'rain'],
        palette: { melody: ['felt-keys', 'e-piano', 'nylon', 'vibes'], keys: ['felt-keys', 'e-piano', 'nylon'] }, patterns: { drums: ['boombap', 'halftime'] },
      },
      jazzhop: {
        name: 'Jazz hop', tip: 'Jazz hop: a city at dusk after the rain: a flute or sax, strings, minor sevenths, a crisp beat',
        phrasing: { shapes: { zigzag: 2, arch: 2, turn: 1 }, rhythm: 'syncopated', hook: 0.4 },
        palette: { melody: ['flute', 'alto-sax', 'tenor-sax', 'piano'], counter: ['strings', 'vibes', 'harp'] }, layers: { counter: 0.5 },
      },
      golden: {
        name: 'Golden age', tip: 'Golden age: nineties street corners: horns stabbing, a scratched record, a punchy kit',
        phrasing: { shapes: { repeat: 3, call: 2 }, rhythm: 'snap', hook: 0.7 },
        palette: { pad: ['brass-section', 'orchestra-hit', 'strings'] }, layers: { pad: 0.8, texture: 0.7 }, textures: ['scratches', 'vinyl'],
        patterns: { pad: ['stabs'] },
      },
    },
  },
  trap: {
    about: 'Trap at 140: an 808 sliding under rolling hats, a clap on three, a dark simple hook. For villains, swagger and cities at night.',
    kinds: {
      dark: { name: 'Dark trap', tip: 'Dark trap: an 808 sliding under rolling hats and a dark, simple hook' },
      cloud: {
        name: 'Cloud rap', tip: 'Cloud rap: dreamy and floating: a glassy pad, a soft lead or flute hook, the 808 underneath',
        phrasing: { shapes: { wave: 2, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.4 }, patterns: { melody: ['long', 'phrases'] },
        scales: { minor: 1, dorian: 1, lydian: 1 }, dark: 0.35, bright: 0.65, fx: { wobble: 0.3 },
        palette: { pad: ['glass-pad', 'air-pad', 'choir-oo', 'shimmer'], melody: ['flute', 'soft-lead', 'sine-bell', 'music-box'] },
      },
      drill: {
        name: 'Drill', tip: 'Drill: sliding 808s, a choir and a piano in harmonic minor, sharper and darker',
        phrasing: { shapes: { dive: 2, repeat: 2, sigh: 1 }, rhythm: 'snap', hook: 0.7 },
        scales: { harmonicMinor: 3, minor: 1, phrygian: 1 }, tuneTempo: [138, 146], dark: 0.75,
        palette: { melody: ['piano', 'choir-oo', 'flute'], pad: ['choir-ah', 'strings', 'dark-pad'] },
      },
    },
  },
  jazz: {
    about: 'A small jazz combo: a sax or trumpet over piano comping, a walking bass and a swinging ride. For clubs, cities and detectives.',
    kinds: {
      bebop: { name: 'Bebop', tip: 'Bebop: a sax or trumpet over piano comping, a walking bass and a swinging ride' },
      ballad: {
        name: 'Ballad', tip: 'Ballad: late at night: slow brushes, a breathy tenor sax or muted trumpet, lush chords',
        phrasing: { shapes: { arch: 2, sigh: 2, leap: 1 }, rhythm: 'long', hook: 0.1, pickup: 0.7 }, busy: -0.15,
        tuneTempo: [60, 80], energy: 0.35, swingAmount: [0.35, 0.55], kits: ['brushes', 'jazz-kit'],
        palette: { melody: ['tenor-sax', 'mute-trumpet', 'piano', 'vibes'] }, patterns: { drums: ['brush'], bass: ['walking', 'rootfifth', 'held'] },
      },
      bigband: {
        name: 'Big band', tip: 'Big band: the swing era: a brass section stabbing, trumpets and trombones, a sax tune, the drummer driving',
        phrasing: { shapes: { zigzag: 2, repeat: 2, triad: 2 }, rhythm: 'syncopated', hook: 0.6 }, busy: 0.1,
        tuneTempo: [140, 190], energy: 0.8, edge: 0.8,
        palette: { pad: ['brass-section'], counter: ['trombone', 'trumpet', 'alto-sax'] }, layers: { pad: 0.9, counter: 0.7 },
        patterns: { pad: ['stabs'] }, orchestra: { pass: 0.5, double: 0 },
      },
      noir: {
        name: 'Noir', tip: 'Noir: a smoky detective film: minor, a muted trumpet or tenor sax, a slow walking bass, rain',
        phrasing: { shapes: { sigh: 2, dive: 2, chant: 1 }, rhythm: 'long', hook: 0.2 }, patterns: { bass: ['walking', 'held'], drums: ['brush', 'swing'] },
        scales: { minor: 2, dorian: 1, harmonicMinor: 1, melodicMinor: 1 }, chords: ['i7 iv7 bVI7 V7', 'ii7 V7 i7 i7', 'i7 - bVI7 V7', 'i7 bVII7 bVI7 V7'],
        dark: 0.45, tuneTempo: [70, 100], palette: { melody: ['mute-trumpet', 'tenor-sax', 'piano', 'vibes'] }, textures: ['rain', 'vinyl'],
      },
    },
  },
  lounge: {
    about: 'Bossa nova and easy listening: a nylon guitar or a Rhodes on the bossa rhythm, a flute or vibes floating over it. For hotels, lifts and beaches.',
    kinds: {
      bossa: { name: 'Bossa nova', tip: 'Bossa nova: a nylon guitar or Rhodes on the bossa rhythm, a flute or vibes on top' },
      lift: {
        name: 'Lift music', tip: 'Lift music: strings and a soft lead on a slow, smooth beat, nothing to frighten anyone',
        phrasing: { shapes: { arch: 3, wave: 2 }, rhythm: 'even', hook: 0.3 },
        tuneTempo: [80, 100], energy: 0.35,
        palette: { melody: ['soft-lead', 'vibes', 'flute'], pad: ['strings', 'synth-strings', 'warm-pad'] }, layers: { pad: 0.9 },
        patterns: { drums: ['bossa', 'brush'] },
      },
      exotica: {
        name: 'Exotica', tip: 'Exotica: a tiki bar in a make believe jungle: vibes and marimba, birdcalls, bongos and lush chords',
        phrasing: { shapes: { wave: 2, call: 2, turn: 1 }, rhythm: 'syncopated', hook: 0.4 },
        palette: { melody: ['vibes', 'marimba', 'flute', 'steel-drum'], keys: ['marimba', 'vibes', 'nylon'] },
        textures: ['birds', 'frogs', 'ocean'], kits: ['latin-kit', 'hand-drums'], patterns: { drums: ['bossa', 'tribal'] },
      },
    },
  },
  soul: {
    about: 'Soul and neo soul: a Rhodes on ninth chords, a fat sliding bass, a lazy beat and a wordless voice or sax. For late nights and smooth talkers.',
    kinds: {
      latenight: { name: 'Late night', tip: 'Late night: a Rhodes on ninth chords, a sliding bass, a lazy beat and a wordless voice' },
      motown: {
        name: 'Sixties soul', tip: 'Sixties soul: a tambourine backbeat, a bass that walks and hooks, strings and horns, a bright major tune',
        phrasing: { shapes: { call: 2, repeat: 2, triad: 1 }, rhythm: 'syncopated', hook: 0.7 },
        scales: { major: 2, mixolydian: 1 }, tuneTempo: [104, 126], energy: 0.75, richness: [0.3, 0.6], swing: 0.3,
        chords: ['I vi IV V', 'I IV I V', 'I iii IV V', 'ii V I vi', 'I V vi IV'],
        palette: { pad: ['strings', 'brass-section'], keys: ['piano', 'hammond', 'wurlitzer'] },
        kits: ['tight-kit', 'funk-kit'], patterns: { drums: ['groove', 'four'], bass: ['hook', 'walking', 'synco'] },
      },
      gospel: {
        name: 'Gospel', tip: 'Gospel: a Hammond organ and a choir, a church piano, a slow 6/8 or a clapping shuffle',
        phrasing: { shapes: { climb: 2, call: 2, sigh: 1, chant: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.5,
        meters: { '6/8': 3, '4/4': 2, '3/4': 1 }, chords: ['I IV I V', 'I I7 IV iv', 'IV I V vi', 'I vi ii V', 'I IV7 I V7'],
        palette: { melody: ['soul-voice', 'piano', 'alto-sax'], pad: ['choir-ah', 'choir-oo', 'hammond', 'organ'], keys: ['hammond', 'piano'] },
        kits: ['tight-kit', 'brushes'], patterns: { drums: ['shuffle', 'groove', 'halftime'], bass: ['walking', 'rootfifth', 'held'] },
      },
    },
  },
  showtime: {
    about: 'Funk and disco with the lights on and the crowd screaming: horns stabbing, a slap bass, a funk guitar and four on the floor. For stages, big entrances and showing off.',
    kinds: {
      glamour: { name: 'Spotlight', tip: 'Spotlight: all eyes on you: horns stabbing, a slap bass, a funk guitar and four on the floor' },
      disco: {
        name: 'Disco', tip: 'Disco: Saturday night: strings swooping, an octave bass, four on the floor, hats on the off beat',
        phrasing: { shapes: { repeat: 2, zigzag: 2, leap: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [116, 128],
        palette: { pad: ['strings', 'synth-strings', 'brass-section'], melody: ['violin', 'alto-sax', 'soul-voice', 'synth-brass'] },
        patterns: { drums: ['four', 'four'], bass: ['octave', 'octave', 'synco'], pad: ['swell', 'stabs'] },
      },
      gameshow: {
        name: 'Game show', tip: 'Game show: bright and cheesy: a brass band, a Hammond, a xylophone, big major chords',
        phrasing: { shapes: { triad: 3, climb: 2, repeat: 1 }, rhythm: 'dotted', hook: 0.7 },
        scales: { major: 3, mixolydian: 1 }, dark: 0.05, richness: [0.3, 0.7],
        chords: ['I vi ii V', 'I IV V I', 'I bVII IV I', 'I II7 V7 I', 'I iii IV V'],
        palette: { melody: ['trumpet', 'synth-brass', 'xylophone', 'alto-sax'], keys: ['hammond', 'piano', 'clavinet'], bells: ['glock', 'xylophone', 'vibes'] },
      },
    },
  },
  shop: {
    about: 'Browsing the shelves while the shopkeeper hums along: a short loop where the bass is the hook, jazzy chords and a lazy beat. For shops, cafés and hanging about.',
    kinds: {
      hip: { name: 'Laid back', tip: 'Laid back: too cool to hurry: the bass is the hook, under jazzy chords and a lazy beat' },
      general: {
        name: 'General store', tip: 'General store: a little village shop with a bell over the door: a marimba or ocarina tune, a plucked bass, a gentle beat',
        phrasing: { shapes: { pendulum: 2, wave: 2, call: 1 }, rhythm: 'even', hook: 0.5 },
        scales: { major: 3, majorPentatonic: 1, mixolydian: 1 }, chords: ['I vi IV V', 'I IV I V', 'Imaj7 IVmaj7', 'I vi ii V', 'IV V I vi'],
        swing: 0.5, richness: [0.2, 0.6], bright: 0.7, dark: 0.05,
        palette: { melody: ['marimba', 'ocarina', 'xylophone', 'kalimba', 'flute'], keys: ['marimba', 'nylon', 'piano'], bass: ['upright', 'pluck-bass'] },
        kits: ['soft-kit', 'tight-kit'], patterns: { drums: ['groove', 'halftime'], bass: ['rootfifth', 'hook', 'synco'] },
      },
      shady: {
        name: 'Black market', tip: "Black market: a shady dealer's: minor, a muted trumpet or clarinet, a sneaking bass hook, a dusty beat",
        phrasing: { shapes: { dive: 2, turn: 2, chant: 1 }, rhythm: 'snap', hook: 0.6 }, tuneTempo: [84, 104], patterns: { bass: ['hook', 'walking'], drums: ['halftime', 'groove'] },
        scales: { minor: 2, dorian: 2, phrygian: 1, harmonicMinor: 1 }, dark: 0.45,
        palette: { melody: ['mute-trumpet', 'clarinet', 'alto-sax', 'vibes'] }, textures: ['vinyl', 'rain'],
      },
    },
  },
  blues: {
    about: 'Twelve bar blues: a harmonica or guitar bending its notes over a shuffle and a boogie bass. For saloons, rainy streets and hard times.',
    kinds: {
      shuffle: { name: 'Shuffle', tip: 'Shuffle: twelve bars, a harmonica or guitar bending, a boogie bass and a shuffle' },
      delta: {
        name: 'Delta', tip: 'Delta: the old country blues: an acoustic guitar and a harmonica, slow, a foot stomping',
        phrasing: { shapes: { dive: 2, chant: 2, sigh: 1 }, rhythm: 'snap', hook: 0.4 },
        tuneTempo: [66, 96], kits: ['stomp-kit'], textures: ['crickets', 'fire', 'rain'],
        palette: { melody: ['harmonica', 'steel-guitar', 'nylon'], keys: ['steel-guitar', 'nylon'], arp: ['steel-guitar'], bass: ['upright'] },
        layers: { keys: 0.8, pad: 0.05, counter: 0.3, guitar: 0 }, patterns: { drums: ['train', 'halftime', 'pulse'] },
      },
      electric: {
        name: 'Electric', tip: 'Electric: city blues, plugged in: an electric guitar crunching, a Hammond, horns, louder',
        phrasing: { shapes: { dive: 3, repeat: 2 }, rhythm: 'snap', hook: 0.6 },
        energy: 0.75, edge: 0.9, palette: { guitar: ['crunch-guitar', 'drive-guitar'], melody: ['lead-guitar', 'harmonica', 'tenor-sax'] },
        layers: { guitar: 0.85 }, kits: ['tight-kit', 'rock-kit'], patterns: { drums: ['shuffle', 'shuffle', 'rock'] },
      },
    },
  },
  country: {
    about: 'Country and bluegrass: boom chick guitar, a rolling banjo, a fiddle and a pedal steel, and the train beat. For ranches, farms and long roads.',
    kinds: {
      road: { name: 'Country road', tip: 'Country road: boom chick guitar, banjo, fiddle, pedal steel and the train beat' },
      bluegrass: {
        name: 'Bluegrass', tip: 'Bluegrass: fast and acoustic: banjo rolls, a fiddle racing, barely any drums',
        phrasing: { shapes: { zigzag: 2, climb: 2, wave: 2 }, rhythm: 'running', hook: 0.4 }, busy: 0.15,
        tuneTempo: [130, 170], energy: 0.8, drums: [0.05, 0.2],
        palette: { melody: ['violin', 'banjo'], arp: ['banjo'] }, layers: { arp: 0.9 }, patterns: { arp: ['roll'], bass: ['rootfifth'] },
      },
      campfire: {
        name: 'Campfire', tip: 'Campfire: a lonesome cowboy song: a harmonica or whistle over a slow strummed guitar in three, crickets and the fire',
        phrasing: { shapes: { wave: 2, arch: 2, sigh: 2 }, rhythm: 'dotted', hook: 0.2 },
        meters: { '3/4': 3, '6/8': 1, '4/4': 1 }, tuneTempo: [72, 96], drums: [0.05, 0.3], energy: 0.4,
        palette: { melody: ['harmonica', 'whistle', 'violin', 'pedal-steel'] }, textures: ['fire', 'crickets'],
      },
    },
  },
  fareast: {
    about: 'Japan and China: a shakuhachi or erhu over a plucked koto, temple drums and a gong, pentatonic and spacious. For temples, bamboo forests and ninjas.',
    kinds: {
      temple: { name: 'Temple', tip: 'Temple: a shakuhachi or erhu over a koto, temple drums and a gong' },
      matsuri: {
        name: 'Festival', tip: 'Festival: a summer matsuri: taiko pounding, a bamboo flute dancing, a shamisen strumming',
        phrasing: { shapes: { repeat: 2, call: 2, triad: 1 }, rhythm: 'dotted', hook: 0.6 }, build: 0.4,
        tuneTempo: [110, 140], energy: 0.8, kits: ['taiko'], drums: [0.5, 1], scales: { majorPentatonic: 3, minorPentatonic: 1 },
        palette: { melody: ['shakuhachi', 'flute'], keys: ['shamisen', 'koto'] }, patterns: { drums: ['tribal', 'march'] },
      },
      ninja: {
        name: 'Ninja', tip: 'Ninja: fast and sharp: a shamisen and koto stabbing in in sen, taiko hits, a menacing flute',
        phrasing: { shapes: { dive: 2, zigzag: 2, repeat: 1 }, rhythm: 'running', hook: 0.6 }, busy: 0.1,
        scales: { inSen: 3, hirajoshi: 2 }, dark: 0.55, tuneTempo: [120, 150], energy: 0.85,
        palette: { melody: ['shakuhachi', 'koto', 'erhu'], keys: ['shamisen', 'koto'] }, kits: ['taiko', 'temple'],
      },
      teahouse: {
        name: 'Tea house', tip: 'Tea house: China: an erhu and a flute over a plucked zither (the koto stands in for the guzheng), slow and graceful',
        phrasing: { shapes: { wave: 2, arch: 2, turn: 2 }, rhythm: 'long', hook: 0.1 },
        scales: { majorPentatonic: 3, minorPentatonic: 1 }, tuneTempo: [70, 92], energy: 0.35, drums: [0.1, 0.4],
        palette: { melody: ['erhu', 'flute', 'koto'] },
      },
    },
  },
  raga: {
    about: 'India: a sitar or bansuri sliding over a tanpura and tabla, with no chord changes: the drone is the harmony. For temples, palaces and long journeys.',
    kinds: {
      raga: { name: 'Raga', tip: 'Raga: a sitar or bansuri over a tanpura plucked round and round, and tabla' },
      dawn: {
        name: 'Dawn', tip: 'Dawn: raga Bhairav at sunrise: the double harmonic scale, slow, a bansuri, birds waking',
        phrasing: { shapes: { climb: 2, turn: 2, chant: 1 }, rhythm: 'long', hook: 0 },
        scales: { doubleHarmonic: 3 }, tuneTempo: [60, 84], drums: [0.2, 0.5],
        palette: { melody: ['bansuri', 'violin', 'sitar'] }, textures: ['birds', 'stream'],
      },
      filmi: {
        name: 'Filmi', tip: 'Filmi: a big film dance number: strings in unison, a harmonium, a big tune and the drums driving',
        phrasing: { shapes: { zigzag: 2, leap: 2, repeat: 2 }, rhythm: 'dotted', hook: 0.6 }, build: 0.4,
        tuneTempo: [110, 135], energy: 0.85, chords: ['i bVII bVI bVII', 'i iv bVII i', 'I IV V I', 'i bVI bVII i'], methods: { bank: 1 },
        palette: { pad: ['strings', 'harmonium'], melody: ['sitar', 'violin', 'bansuri', 'shawm'] },
        layers: { pad: 0.9, bass: 0.9 }, kits: ['tabla', 'hand-drums'], patterns: { drums: ['tala', 'groove', 'tribal'], bass: ['octave', 'rootfifth'] },
      },
    },
  },
  reggae: {
    about: 'Reggae: the one drop, the organ and guitar chopping the off beats, a deep round bass and a melodica on top. For beaches and lazy afternoons.',
    kinds: {
      roots: { name: 'Roots', tip: 'Roots: the one drop, the skank, a deep bass and a melodica' },
      dub: {
        name: 'Dub', tip: 'Dub: the studio played like an instrument: the bass up front, echoes everywhere, the tune dropping in and out',
        phrasing: { shapes: { chant: 2, repeat: 2 }, rhythm: 'snap', hook: 0.6 },
        space: 0.85, fx: { echo: 0.45, wobble: 0.2 }, layers: { melody: 0.6, counter: 0.1 },
        patterns: { melody: ['fragments', 'calls'] },
      },
      ska: {
        name: 'Ska', tip: 'Ska: faster: horns on the tune, the skank on every off beat, a walking bass',
        phrasing: { shapes: { repeat: 2, triad: 2, call: 2 }, rhythm: 'syncopated', hook: 0.7 },
        tuneTempo: [130, 165], energy: 0.85,
        palette: { melody: ['trumpet', 'trombone', 'alto-sax', 'tenor-sax'], counter: ['trombone', 'trumpet'], bass: ['upright', 'pluck-bass'] },
        kits: ['tight-kit', 'funk-kit'], patterns: { bass: ['walking', 'synco'], drums: ['groove', 'onedrop'] }, orchestra: { pass: 0.4, double: 0 },
      },
    },
  },
  steppe: {
    about: "The Mongolian steppe: throat singing, a horse head fiddle, a plucked zither and a shaman's drum galloping. For plains, nomads and wide skies.",
    kinds: {
      plains: { name: 'Plains', tip: 'Plains: throat singing, a fiddle, a zither and a galloping drum' },
      gallop: {
        name: 'Gallop', tip: 'Gallop: the riders out on the plain: fast, the drum galloping hard, the fiddle and throat singers driving',
        phrasing: { shapes: { repeat: 2, triad: 2, wave: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5, busy: 0.1,
        tuneTempo: [130, 160], energy: 0.9, drums: [0.6, 1], patterns: { drums: ['gallop'] },
      },
      yurt: {
        name: 'Yurt', tip: "Yurt: night in a nomad's tent: the fire, a slow fiddle, a low throat singer droning, no drums",
        phrasing: { shapes: { chant: 3, wave: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', drums: [0.05, 0.2], textures: ['fire', 'wind', 'crickets'],
        palette: { drone: ['kargyraa', 'throat-singing', 'cello-drone'], melody: ['erhu', 'flute', 'throat-singing'] },
      },
    },
  },
  gamelan: {
    about: 'Java and Bali: a bonang playing interlocking patterns, metallophones, a flute and drums, and the big gong closing each cycle. For temples, islands and dreams.',
    kinds: {
      court: { name: 'Court', tip: "Court: the bonang's kettle gongs interlocking, a flute, and the gong closing each cycle" },
      kebyar: {
        name: 'Kebyar', tip: 'Kebyar: Bali: faster and explosive, the metallophones racing',
        phrasing: { shapes: { zigzag: 2, repeat: 2, climb: 1 }, rhythm: 'running', hook: 0.6 }, busy: 0.15,
        tuneTempo: [120, 150], energy: 0.85, patterns: { arp: ['random', 'up', 'updown'] },
      },
      night: {
        name: 'Night garden', tip: 'Night garden: soft and slow: a flute floating over a few gongs, frogs and rain',
        phrasing: { shapes: { wave: 2, chant: 2 }, rhythm: 'long', hook: 0 },
        style: 'ambient', drums: [0.2, 0.4], palette: { melody: ['flute', 'vibes', 'bonang'] }, textures: ['frogs', 'rain', 'crickets'],
      },
    },
  },
  flamenco: {
    about: 'Andalusia: a nylon guitar strumming the Andalusian cadence over a cajón and clapping, a violin or trumpet crying in the phrygian dominant. For Spain, duels and passion.',
    kinds: {
      tablao: { name: 'Tablao', tip: 'Tablao: a guitar strumming the Andalusian cadence, a cajón, clapping and a crying violin' },
      rumba: {
        name: 'Rumba', tip: 'Rumba: quicker and sunnier, strummed and clapped, in a major key as often as not',
        phrasing: { shapes: { call: 2, zigzag: 2, repeat: 1 }, rhythm: 'syncopated', hook: 0.6 },
        scales: { phrygianDominant: 2, major: 1.5, harmonicMinor: 1 }, tuneTempo: [110, 135],
        chords: ['iv bIII bII I', 'I IV V I', 'i iv V i', 'I bII I -', 'I V vi IV'],
      },
      solea: {
        name: 'Soleá', tip: 'Soleá: a guitar alone, slow and grave, no drums',
        phrasing: { shapes: { dive: 2, sigh: 2, turn: 2 }, rhythm: 'long', hook: 0.1 }, build: 0,
        tuneTempo: [66, 86], energy: 0.4, drums: [0, 0.1],
        layers: { keys: 0.9, pad: 0.2, counter: 0.3, arp: 0.3, bells: 0, drone: 0.1, bass: 0.3 },
      },
    },
  },
  aztec: {
    about: 'Lost cities deep in the jungle: clay flutes and ocarinas over slit drums and a big hand drum, a death whistle screaming far off. For jungles, pyramids and lost cities.',
    kinds: {
      azteca: { name: 'Sun temple', tip: 'Sun temple: a city of gold at its height: ocarinas and pan pipes over slit drums, a marimba, strings and a horn' },
      ritual: {
        name: 'Ritual', tip: 'Ritual: atop the pyramid at night: drums and drones, a conch calling, the death whistle closer',
        phrasing: { shapes: { chant: 3, call: 2 }, rhythm: 'long', hook: 0.2 }, build: 0.5,
        energy: 0.5, dark: 0.65, layers: { melody: 0.5 }, textures: ['death-whistle', 'conch', 'fire'],
        palette: { melody: ['blown-bottle', 'ocarina', 'pan-flute'] }, patterns: { melody: ['long', 'fragments', 'calls'] },
      },
      rainforest: {
        name: 'Rainforest', tip: 'Rainforest: lush and green: marimbas and pan pipes over rain and birds, softer drums',
        phrasing: { shapes: { wave: 2, call: 2, pendulum: 1 }, rhythm: 'syncopated', hook: 0.4 },
        scales: { majorPentatonic: 2, minorPentatonic: 2, dorian: 1 }, energy: 0.5, bright: 0.6, dark: 0.3,
        textures: ['rainstick', 'birds', 'frogs'], patterns: { drums: ['march', 'sparse', 'pulse'] },
      },
    },
  },
  tribal: {
    about: 'Drums round a fire: drums, stamping and clapping, a mbira riff and a didgeridoo. For villages, rituals and the wild.',
    kinds: {
      firelight: { name: 'Firelight', tip: 'Firelight: drums, stamping and clapping, a mbira riff and a didgeridoo' },
      savanna: {
        name: 'Savanna', tip: 'Savanna: the plains as the sun comes up: a kalimba and a choir, open and bright, lighter drums',
        phrasing: { shapes: { triad: 2, call: 2, wave: 1 }, rhythm: 'even', hook: 0.4 }, patterns: { drums: ['tribal', 'groove'], melody: ['phrases', 'calls'] },
        scales: { majorPentatonic: 3, major: 1 }, energy: 0.55, bright: 0.7,
        palette: { pad: ['choir-ah', 'choir-oo'], melody: ['kalimba', 'marimba', 'flute', 'choir-oo'] }, layers: { pad: 0.9 },
        textures: ['birds', 'crickets'],
      },
      war: {
        name: 'War dance', tip: 'War dance: faster and harder: the drums driving in six, stamping, the didgeridoo growling',
        phrasing: { shapes: { repeat: 3, call: 2 }, rhythm: 'dotted', hook: 0.7 }, build: 0.6, busy: 0.1,
        meters: { '6/8': 3, '4/4': 2 }, tuneTempo: [120, 150], energy: 0.95, patterns: { drums: ['gallop', 'tribal'] },
      },
    },
  },
  egyptian: {
    about: 'Ancient Egypt: the double harmonic scale, a mizmar or oboe over a lyre and an oud, the darbuka playing with finger cymbals. For pyramids, tombs and the Nile.',
    kinds: {
      nile: { name: 'The Nile', tip: 'The Nile: a mizmar or oboe over a lyre and an oud, the darbuka and finger cymbals' },
      tomb: {
        name: 'Tomb', tip: 'Tomb: inside the pyramid: dark and slow, a low drone, a lyre in the dark, wind through the shafts',
        phrasing: { shapes: { chant: 2, turn: 2, sigh: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', dark: 0.7, energy: 0.3, drums: [0.15, 0.4],
        palette: { melody: ['lyre', 'flute', 'oboe'] }, textures: ['wind'], patterns: { drums: ['pulse', 'sparse'] },
      },
      pharaoh: {
        name: 'Pharaoh', tip: 'Pharaoh: a royal procession: horns and a choir, strings, big drums, grand and slow',
        phrasing: { shapes: { triad: 2, leap: 2, turn: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.6,
        energy: 0.75, edge: 0.8,
        palette: { melody: ['horn', 'trumpet', 'oboe', 'choir-oo'], pad: ['brass-section', 'strings', 'choir-ah'] },
        kits: ['darbuka-kit', 'orchestra-kit'], patterns: { drums: ['march', 'maqsum'] }, orchestra: { pass: 0.5, double: 0.15 },
      },
    },
  },
  antiquity: {
    about: 'Greece and Rome: a lyre and a harp, an aulos or pan pipes, horns for the legions, a temple choir, in the old modes. For temples, arenas and myths.',
    kinds: {
      agora: { name: 'Agora', tip: 'Agora: a lyre and a harp, an aulos or pan pipes and a temple choir' },
      legion: {
        name: 'Legion', tip: 'Legion: Rome on the march: horns and trumpets, a marching drum, the choir in unison',
        phrasing: { shapes: { triad: 3, repeat: 2 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5,
        energy: 0.8, kits: ['orchestra-kit'],
        palette: { melody: ['horn', 'trumpet', 'trombone'], counter: ['horn', 'trombone'], pad: ['brass-section', 'choir-ah'] },
        patterns: { drums: ['march'] },
      },
      olympus: {
        name: 'Olympus', tip: "Olympus: the gods' home: a lyre and a choir in a bright mode, no drums, light as air",
        phrasing: { shapes: { climb: 2, arch: 2, wave: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', scales: { lydian: 2, mixolydian: 1, dorian: 1 }, drums: [0, 0.15],
        palette: { melody: ['lyre', 'pan-flute', 'choir-oo', 'flute'], pad: ['choir-oo', 'choir-ah', 'strings'] },
      },
    },
  },
  medieval: {
    about: 'Castles and taverns: a bagpipe, recorder or shawm, a harpsichord or lyre for the lute, a bassoon and a tabor. For castles, markets and knights.',
    kinds: {
      market: { name: 'Market', tip: 'Market: a bagpipe, recorder or shawm over a harpsichord, a bassoon and a tabor' },
      courtdance: {
        name: 'Court dance', tip: 'Court dance: a Renaissance court: recorders and a harpsichord, a stately pavane or a quick galliard',
        phrasing: { shapes: { wave: 2, turn: 2, arch: 1 }, rhythm: 'dotted', hook: 0.4 },
        meters: { '3/4': 3, '4/4': 2 }, drums: [0.1, 0.6], kits: ['hand-drums'],
        palette: { melody: ['whistle', 'flute', 'oboe', 'bowed-psaltery'], keys: ['harpsichord', 'lyre'] }, patterns: { drums: ['march', 'pulse'] },
      },
      chant: {
        name: 'Chant', tip: 'Chant: a monastery at vespers: a choir chanting over an organ drone, slow and holy',
        phrasing: { shapes: { chant: 4, arch: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        style: 'ambient', kits: [], layers: { melody: 0.9 },
        palette: { melody: ['choir-oo'], pad: ['choir-ah', 'organ'], drone: ['organ-drone', 'cello-drone'] },
        patterns: { melody: ['long', 'phrases'] },
      },
    },
  },
  wasteland: {
    about: 'Dust, heat and ruins at the edge of nowhere: a twangy guitar, a harmonica or a lonely trumpet, a saloon piano, scrap metal drums and the wind. For deserts, ruins and outlaws.',
    kinds: {
      frontier: { name: 'Frontier', tip: 'Frontier: a twangy guitar, a harmonica or trumpet, scrap metal drums and the wind' },
      western: {
        name: 'High noon', tip: 'High noon: two figures facing each other down a dusty street: a whistled tune, a trumpet, a twangy guitar, a whip of the snare',
        phrasing: { shapes: { leap: 3, dive: 2, chant: 1 }, rhythm: 'long', hook: 0.4 },
        tuneTempo: [90, 120], richness: [0, 0.2], chords: ['i bVII bVI V', 'i iv i V', 'i - bVI V', 'i bIII bVII iv'],
        palette: { melody: ['whistle', 'trumpet', 'harmonica'], guitar: ['clean-guitar'] }, patterns: { drums: ['train', 'march'] },
      },
      radio: {
        name: 'Old radio', tip: 'Old radio: a 1940s record playing in the ruins: a crooning clarinet or muted trumpet, a piano, a swing beat, crackle',
        phrasing: { shapes: { arch: 2, sigh: 2, call: 1 }, rhythm: 'dotted', hook: 0.4, pickup: 0.7 },
        scales: { major: 3, mixolydian: 0.5 }, chords: ['I vi ii V', 'Imaj7 vi7 ii7 V7', 'I I7 IV iv', 'I II7 V7 I'], richness: [0.4, 0.8],
        swing: 0.9, swingAmount: [0.4, 0.6], bright: 0.5, dark: 0.2, edge: 0.7, fx: { wobble: 0.5, drive: 0.2 },
        palette: { melody: ['mute-trumpet', 'clarinet', 'piano', 'vibes'], keys: ['piano', 'honky-tonk'] },
        textures: ['vinyl'], kits: ['brushes', 'jazz-kit'], layers: { guitar: 0.2 },
        patterns: { drums: ['swing', 'brush'], bass: ['walking', 'rootfifth'] },
      },
    },
  },
  underwater: {
    about: 'Under the sea, from the dark deep to a reef party: wine glasses and glassy pads, harps and vibes rippling, whale song and bubbles.',
    kinds: {
      deep: { name: 'The deep', tip: 'The deep: slow, wide and wavering: wine glasses, glassy pads, a whale calling far off' },
      reef: {
        name: 'Reef party', tip: 'Reef party: everyone dancing on the reef: steel drums and marimbas on a calypso bounce, horns, a walking bass',
        phrasing: { shapes: { call: 3, repeat: 2, zigzag: 1 }, rhythm: 'syncopated', hook: 0.8 },
        style: 'tune', scales: { major: 3, mixolydian: 1, majorPentatonic: 1 }, tuneTempo: [108, 128], meters: { '4/4': 1 },
        chords: ['I IV V IV', 'I vi IV V', 'I IV I V', 'I V vi IV', 'ii V I -'], richness: [0.15, 0.5],
        energy: 0.75, bright: 0.8, dark: 0.05, edge: 0.75, swing: 0.4,
        palette: {
          melody: ['steel-drum', 'marimba', 'trumpet', 'flute', 'xylophone'], counter: ['trombone', 'marimba', 'vibes'], keys: ['marimba', 'steel-drum', 'nylon'],
          arp: ['marimba', 'steel-drum', 'xylophone'], bass: ['tuba', 'upright', 'pluck-bass'], pad: ['brass-section', 'strings', 'warm-pad'],
        },
        kits: ['hand-drums', 'latin-kit', 'soft-kit'], drums: [0.3, 0.95], textures: ['bubbles', 'ocean'],
        patterns: { drums: ['groove', 'tribal', 'bossa'], bass: ['walking', 'rootfifth', 'synco'], keys: ['strum', 'block', 'skank'], melody: ['phrases', 'riff', 'calls'] },
        orchestra: { pass: 0.4, double: 0.3 },
      },
      lagoon: {
        name: 'Lagoon', tip: 'Lagoon: sunlit shallows: a nylon guitar and vibes, a gentle bossa, waves on the shore',
        phrasing: { shapes: { wave: 3, arch: 1 }, rhythm: 'syncopated', hook: 0.3 },
        tuneTempo: [84, 104], bright: 0.6, drums: [0.1, 0.6],
        palette: { melody: ['vibes', 'flute', 'nylon', 'wine-glass'], keys: ['nylon', 'vibes'] },
        kits: ['latin-kit', 'soft-kit'], textures: ['ocean', 'bubbles', 'birds'], patterns: { drums: ['bossa', 'pulse'], keys: ['bossa', 'broken'] },
      },
      sunken: {
        name: 'Sunken city', tip: 'Sunken city: Atlantis in ruins: a choir and a harp in the deep, in old, strange modes, slow bells',
        phrasing: { shapes: { chant: 2, sigh: 2, wave: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['swell', 'sustain'] },
        scales: { dorian: 2, lydian: 1, phrygian: 1 }, dark: 0.45,
        palette: { melody: ['choir-oo', 'wine-glass', 'glass-bell'], pad: ['choir-ah', 'glass-pad', 'dark-pad'], bells: ['glass-bell', 'bell', 'sine-bell'] },
        textures: ['whale', 'bubbles'],
      },
    },
  },
  pirate: {
    about: 'Pirates on the high seas, from a rowdy shanty below decks to a swashbuckling film score. For ships, islands and treasure.',
    kinds: {
      shanty: { name: 'Shanty', tip: 'Shanty: an accordion and a fiddle, a tuba, the crew stamping a jig, the sea and the timbers creaking' },
      swashbuckler: {
        name: 'Swashbuckler', tip: 'Swashbuckler: cannon smoke and a duel in the rigging: strings driving in 6/8, horns blazing the tune, big drums, minor',
        phrasing: { shapes: { leap: 3, triad: 2, climb: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5,
        scales: { minor: 3, harmonicMinor: 1, dorian: 1 }, meters: { '6/8': 5, '4/4': 2, '3/4': 1 }, tuneTempo: [110, 140],
        chords: ['i bVI bVII i', 'i iv V i', 'i bVII bVI V', 'i - bVI bVII', 'i v bVI bVII'],
        energy: 0.9, dark: 0.5, edge: 0.85,
        palette: { melody: ['horn', 'violin', 'trumpet'], counter: ['horn', 'trombone', 'violin'], pad: ['strings', 'brass-section', 'choir-ah'], keys: ['pizzicato', 'piano'], arp: ['pizzicato', 'harp'], bass: ['upright', 'tuba', 'bassoon'] },
        kits: ['orchestra-kit', 'taiko'], layers: { pad: 1, counter: 0.6 },
        patterns: { drums: ['march', 'tribal'], pad: ['pulse', 'stabs', 'sustain'], bass: ['octave', 'pulse'] }, orchestra: { pass: 0.5, double: 0.2 },
      },
      calmseas: {
        name: 'Calm seas', tip: 'Calm seas: night on deck: a lone fiddle or accordion, the waves and the creak of the ship, slow and in three',
        phrasing: { shapes: { wave: 3, sigh: 1 }, rhythm: 'dotted', hook: 0.2 },
        style: 'ambient', meters: { '3/4': 3, '6/8': 2 }, drums: [0.05, 0.25], tuneTempo: [76, 96], energy: 0.35, textures: ['ocean', 'creaks'],
      },
      ghost: {
        name: 'Ghost ship', tip: 'Ghost ship: cursed pirates: an organ and an accordion wheezing out of tune, a choir moaning, fog',
        phrasing: { shapes: { sigh: 2, dive: 2, turn: 1 }, rhythm: 'dotted', hook: 0.3 }, meters: { '3/4': 3, '6/8': 2, '4/4': 1 }, patterns: { keys: ['waltz', 'broken'] },
        scales: { harmonicMinor: 2, phrygian: 1, minor: 1 }, dark: 0.7, fx: { wobble: 0.5 },
        palette: { melody: ['accordion', 'violin', 'music-box'], pad: ['organ', 'haunted-pad', 'choir-ah'] }, textures: ['creaks', 'ocean', 'wind'],
      },
    },
  },
  space: {
    about: 'Outer space: analog pads drifting, sine bells like distant signals, the void humming, in lydian and the whole tone scale. For stars, stations and the unknown.',
    kinds: {
      drift: { name: 'Drift', tip: 'Drift: analog pads, sine bells and the void humming' },
      station: {
        name: 'Space station', tip: 'Space station: a busy orbital base: arps pulsing, a steady drum machine, bright synths',
        phrasing: { shapes: { repeat: 2, zigzag: 2, climb: 1 }, rhythm: 'running', hook: 0.6 },
        style: 'tune', energy: 0.65, drums: [0.3, 0.9], layers: { arp: 0.7 },
        patterns: { drums: ['four', 'groove', 'halftime'], arp: ['up', 'updown'] },
      },
      alien: {
        name: 'Alien world', tip: 'Alien world: strange and hostile: the whole tone scale, bowed metal, metal pings, the void',
        phrasing: { shapes: { zigzag: 2, chant: 2, dive: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['fragments', 'long'] },
        scales: { wholeTone: 2, phrygian: 1, locrian: 0.5 }, dark: 0.65, methods: { bank: 2, chromatic: 2, vamp: 1 },
        palette: { melody: ['wine-glass', 'sine-bell', 'soft-lead'], bells: ['metal-ping', 'glass-bell'], drone: ['bowed-metal', 'void', 'deep-drone'] },
        textures: ['hum', 'geiger'],
      },
    },
  },
  ironcity: {
    about: "A city under an iron fist: brooding low strings and brass, a sneaking riff and a beat that's half orchestra and half machine. Serious, but fun to listen to. For palaces, guards and getting up to no good.",
    kinds: {
      palace: { name: "Tyrant's palace", tip: "Tyrant's palace: marble halls and armed guards: brooding low strings and a bass hook, a dark pizzicato or marimba riff, brass stabs and a choir, over a half machine beat" },
      bughunt: {
        name: 'Pest control', tip: 'Pest control: an odd job round the city, up to no good: a sneaky, bouncy groove, pizzicato and a bassoon, a clarinet tune, a funky little beat',
        phrasing: { shapes: { zigzag: 2, repeat: 2, turn: 2 }, rhythm: 'snap', hook: 0.6 },
        scales: { dorian: 2, minor: 1, mixolydian: 1 }, tuneTempo: [104, 124], energy: 0.7, dark: 0.35, edge: 0.7, swing: 0.3,
        palette: { melody: ['clarinet', 'oboe', 'pizzicato', 'marimba', 'mute-trumpet'], keys: ['pizzicato', 'marimba', 'xylophone'], bass: ['bassoon', 'tuba', 'upright', 'pluck-bass'] },
        kits: ['tight-kit', 'clockwork', 'funk-kit'], patterns: { drums: ['groove', 'funk', 'march'], bass: ['walking', 'hook', 'synco'], melody: ['calls', 'phrases'] },
      },
      factory: {
        name: 'Factory floor', tip: 'Factory floor: the dark, industrial edge of the city: metal percussion clanking, a pulsing synth bass, steam and machines',
        phrasing: { shapes: { repeat: 3, dive: 2 }, rhythm: 'running', hook: 0.7 },
        energy: 0.75, edge: 1, kits: ['junk-kit', 'machine'], textures: ['factory', 'steam', 'clanks'],
        palette: { melody: ['synth-brass', 'saw-lead', 'pluck-lead', 'horn'], bass: ['reese', 'synth-bass', 'growl-bass'], arp: ['pluck-lead', 'pizzicato', 'marimba'], pad: ['dark-pad', 'analog-pad', 'synth-strings'] },
        patterns: { drums: ['groove', 'march', 'break'], bass: ['pulse', 'octave', 'synco'], arp: ['up', 'updown'] },
      },
      prison: {
        name: 'Prison', tip: 'Prison: a slow, heavy march down the cell block: low brass and a choir, chains rattling and water dripping in the cells',
        phrasing: { shapes: { chant: 2, sigh: 2 }, rhythm: 'long', hook: 0 }, build: 0.4,
        style: 'ambient', tempo: [56, 70], energy: 0.4, dark: 0.75, kits: ['orchestra-kit', 'junk-kit'], drums: [0.4, 0.8], textures: ['chains', 'drips', 'clanks'],
        palette: { melody: ['horn', 'violin', 'oboe', 'felt-keys'], pad: ['strings', 'choir-ah', 'dark-pad'] }, patterns: { drums: ['march', 'halftime', 'sparse'] },
      },
    },
  },
};
// a song's flavour (none for the plain mood), and a mood's plain flavour
const flavourOf = (song) => FLAVOURS[song.mood]?.kinds[song.flavour];
const plainFlavour = (moodId) => Object.keys(FLAVOURS[moodId]?.kinds || {})[0];
// a mood in one of its flavours: the flavour's settings over the mood's, a role at a time for its
// palette, patterns and layers
function flavourMood(base, kind) {
  const { name, tip, style, ...changes } = kind;
  return { ...base, ...changes, palette: { ...base.palette, ...changes.palette }, patterns: { ...base.patterns, ...changes.patterns }, layers: { ...base.layers, ...changes.layers } };
}

// the patterns each style leans towards, when the mood doesn't say
const STYLE_PATTERNS = {
  ambient: {
    melody: ['phrases', 'long', 'phrases', 'fragments'], counter: ['counterpoint', 'harmony', 'answer', 'free'], arp: ['up', 'updown', 'random', 'converge'],
    bells: ['phasing', 'sparkle', 'sparkle'], keys: ['strum', 'broken'], pad: ['sustain', 'sustain', 'swell'],
    drone: ['tonic', 'fifths', 'follow'], bass: ['held', 'held', 'rootfifth'], drums: ['pulse', 'sparse'], texture: ['steady'],
    guitar: ['ring', 'tremolo'],
  },
  tune: {
    melody: ['phrases', 'phrases', 'calls', 'riff'], counter: ['counterpoint', 'answer', 'counterpoint', 'harmony'], arp: ['up', 'down', 'updown', 'converge', 'random'],
    bells: ['sparkle', 'phasing'], keys: ['broken', 'block', 'strum', 'waltz'], pad: ['sustain', 'swell', 'pulse', 'stabs'],
    // no walking bass unless the mood asks: a jazz walk under a pop tune sounded like two songs
    drone: ['tonic', 'fifths'], bass: ['rootfifth', 'pulse', 'octave', 'synco', 'held'],
    drums: ['groove', 'groove', 'halftime'], texture: ['steady'], guitar: ['power', 'eighths', 'ring'],
  },
  // a fight: a driving beat, a bass that pushes, chords pulsing under a tune you can hum, and a counter
  // melody harmonising it or playing a second tune against it
  boss: {
    melody: ['phrases', 'phrases', 'riff', 'long'], counter: ['harmony', 'counterpoint', 'harmony', 'answer'], arp: ['up', 'updown', 'down', 'converge'],
    bells: ['sparkle'], keys: ['block', 'broken', 'strum'], pad: ['pulse', 'stabs', 'sustain', 'pump', 'swell'],
    drone: ['tonic', 'fifths'], bass: ['octave', 'synco', 'pulse', 'riff', 'rootfifth'],
    drums: ['rock', 'double', 'march', 'tribal', 'break', 'four', 'punk'], texture: ['steady'], guitar: ['chug', 'power', 'eighths', 'tremolo', 'ring'],
  },
};
STYLE_PATTERNS.mini = STYLE_PATTERNS.boss;
STYLE_PATTERNS.final = STYLE_PATTERNS.boss;
// a loop is a tune that never ends, and a cutscene a tune that builds
STYLE_PATTERNS.loop = STYLE_PATTERNS.tune;
STYLE_PATTERNS.cutscene = STYLE_PATTERNS.tune;
// newer beats that drive too, so a mood whose own beat is one keeps it in a fight (a funk boss keeps its
// funk). kept out of the list above, which older moods' fights pick from, so those stayed as they were
const ALSO_DRIVING = ['funk', 'tala', 'shuffle', 'onedrop', 'train', 'trap', 'maqsum', 'gallop'];
const drives = (role, pattern) => STYLE_PATTERNS.boss[role].includes(pattern) || (role === 'drums' && ALSO_DRIVING.includes(pattern));

// the styles, as the page names them. the ids are what songs and links save, so they stayed when the
// names changed. ambient wanders, a tune starts and ends, a loop (a town or a shop) runs straight back
// into its start, a cutscene always builds (builds()) to a finale a key higher, and the fights loop:
// a mini boss short with a smaller band, a final boss long, its second phase a key higher
const STYLES = { ambient: 'Explore', tune: 'Theme', loop: 'Town', cutscene: 'Cutscene', mini: 'Skirmish', boss: 'Boss fight', final: 'Final boss' };
const FIGHTS = { boss: true, mini: true, final: true };
// the styles that go round and round, so they never come home at the end (cadence)
const LOOPS = { boss: true, mini: true, loop: true, final: true };
// how hard each fight drives at least, whatever its mood (a calm boss is still a fight)
const FIGHT_ENERGY = { boss: 0.9, mini: 0.8, final: 0.9 };
// drum kits for a fight in a mood whose own don't play a fight's beats (calm's soft kit, or none)
const FIGHT_KITS = ['tight-kit', 'orchestra-kit', 'rock-kit'];

// the patterns a role picks from: the mood's for its style, the mood's, or the style's. a fight keeps
// the mood's driving ones (metal's double kick) and drops the gentle ones (brushes under a boss)
const moodPatterns = (song, role) => {
  const mood = songMood(song);
  const own = mood.patterns?.[`${song.style}.${role}`] || mood.patterns?.[role];
  if (!FIGHTS[song.style]) return own || STYLE_PATTERNS[song.style][role];
  const driving = own?.filter((pattern) => drives(role, pattern));
  return driving?.length ? driving : STYLE_PATTERNS.boss[role];
};

// ---------- modifiers ----------
//
// a modifier is a word in front of a mood: calm folk, angry folk, jazzy folk. it changes how the mood's
// own band plays (tempo, energy, how dark its scale is, how busy, how hard the drummer hits) rather than
// bringing in a second band (the old blends did that, and mashed two bands together). a few bring
// sounds in because the word means them (lo-fi's vinyl, retro's chips, acoustic, epic's choir).
// each is { name, tip, against (its opposite), apply(mood, style) }, and apply changes a copy of the
// mood. they apply in MODIFIERS' order whatever order they were picked in, up to MOST_MODS of them
const MOST_MODS = 4;
// the beats that suit each word, used to keep a mood's own where they fit
const GENTLE_BEATS = ['pulse', 'sparse', 'brush', 'halftime', 'swing', 'bossa', 'wash', 'train', 'boombap'];
const DRIVING_BEATS = ['rock', 'double', 'march', 'tribal', 'break', 'four', 'punk', 'funk', 'groove', 'tala', 'shuffle', 'trap', 'maqsum', 'gallop'];
// a mood's own patterns for a role that are in a list, or the list's fallback if none are
const keepOr = (mood, role, keep, fallback) => {
  const own = (mood.patterns?.[role] || []).filter((pattern) => keep.includes(pattern));
  return own.length ? own : fallback;
};
const setPatterns = (mood, patterns) => { mood.patterns = { ...mood.patterns, ...patterns }; };
// every tempo times k, never above 200 bpm
const scaleTempo = (mood, k) => {
  mood.tempo = mood.tempo.map((bpm) => Math.round(Math.min(200, bpm * k)));
  mood.tuneTempo = mood.tuneTempo.map((bpm) => Math.round(Math.min(200, bpm * k)));
};
// the modes from brightest to darkest. shading a mood darker moves each of its scales one along (major
// to mixolydian), so it keeps its character. never as far as locrian, whose home chord won't settle
const SHADES = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian'];
// the scales that aren't modes, as [what it becomes brighter, what it becomes darker]
const OTHER_SHADES = { majorPentatonic: ['majorPentatonic', 'minorPentatonic'], minorPentatonic: ['majorPentatonic', 'blues'], blues: ['minorPentatonic', 'blues'], harmonicMinor: ['melodicMinor', 'phrygianDominant'], melodicMinor: ['dorian', 'harmonicMinor'], phrygianDominant: ['harmonicMinor', 'hungarianMinor'] };
function shade(mood, way) {
  const scales = {};
  for (const [scale, weight] of Object.entries(mood.scales)) {
    const at = SHADES.indexOf(scale);
    const next = at >= 0 ? SHADES[Math.max(0, Math.min(SHADES.length - 1, at + way))] : OTHER_SHADES[scale]?.[way > 0 ? 1 : 0] || scale;
    scales[next] = (scales[next] || 0) + weight;
  }
  mood.scales = scales;
  // the mood's progressions were written for its own scales, so they're moved into the new one
  mood.reharm = true;
}
// a mood's instruments mapped one by one (retro, acoustic), in its order, duplicates dropped
const mapPalette = (mood, map) => {
  const palette = {};
  for (const [role, list] of Object.entries(mood.palette)) palette[role] = [...new Set(list.map((id) => (typeof map === 'function' ? map(id, role) : map[id]) || id))];
  mood.palette = palette;
};
// what each sound becomes unplugged: synths and electric instruments to the nearest acoustic one
const UNPLUGGED = {
  'saw-lead': 'violin', 'square-lead': 'flute', 'pulse-lead': 'whistle', 'bit-lead': 'violin', 'soft-lead': 'flute', 'synth-brass': 'horn', 'pluck-lead': 'pizzicato',
  'sine-bell': 'glass-bell', 'metal-ping': 'chime', 'e-piano': 'piano', hammond: 'accordion', clavinet: 'harp', 'jazz-guitar': 'nylon', 'pedal-steel': 'violin',
  'warm-pad': 'strings', 'analog-pad': 'strings', 'glass-pad': 'choir-oo', 'dark-pad': 'strings', shimmer: 'choir-oo', 'air-pad': 'choir-oo', 'fuzz-wall': 'strings',
  'haunted-pad': 'choir-oo', 'reverse-piano': 'strings', 'swell-guitar': 'strings', 'reverse-guitar': 'strings', organ: 'harmonium',
  'lead-guitar': 'harmonica', 'metal-lead': 'violin', 'fuzz-lead': 'violin', 'dream-voice': 'choir-oo', 'rasp-voice': 'violin',
  'sub-bass': 'upright', 'round-bass': 'upright', 'synth-bass': 'upright', 'pluck-bass': 'upright', 'growl-bass': 'upright', 'chip-bass': 'upright', reese: 'upright',
  'chorus-bass': 'upright', 'pick-bass': 'upright', 'fuzz-bass': 'upright', 'slap-bass': 'upright', fretless: 'upright',
  'deep-drone': 'cello-drone', void: 'cello-drone', 'bowed-metal': 'cello-drone', 'organ-drone': 'cello-drone', 'tape-loop': 'cello-drone',
};
const UNPLUGGED_KITS = { 'lofi-kit': 'brushes', 'tight-kit': 'soft-kit', heartbeat: 'soft-kit', clockwork: 'soft-kit', 'chip-kit': 'soft-kit', 'club-kit': 'hand-drums', machine: 'soft-kit', 'rock-kit': 'soft-kit', 'metal-kit': 'orchestra-kit', 'gaze-kit': 'brushes', 'funk-kit': 'soft-kit' };
// a nes's: the tune on pulse waves, the bass on the triangle, the noise channel's drums
const CHIPS = { melody: ['pulse-lead', 'square-lead'], counter: ['pulse-lead', 'square-lead'], arp: ['pulse-lead', 'square-lead', 'pluck-lead'], bells: ['pulse-lead', 'sine-bell'], keys: ['pulse-lead', 'pluck-lead'], pad: ['organ', 'glass-pad'], bass: ['chip-bass'], drone: ['organ-drone'] };

const MODIFIERS = {
  calm: {
    name: 'Calm', against: 'angry', tip: 'Calm: slower and softer, gentler instruments from the mood, a quieter beat and more room',
    apply(mood) {
      mood.energy = Math.max(0.15, mood.energy * 0.6);
      scaleTempo(mood, 0.85);
      mood.drums = [mood.drums[0] * 0.5, mood.drums[1] * 0.6];
      // the gentler end of the mood's own instruments (edge is how harsh one is, see synth.js)
      mood.edge = Math.max(0.2, moodEdge(mood) * 0.75);
      mood.space = Math.min(1, mood.space + 0.15);
      mood.busy = (mood.busy || 0) - 0.15;
      mood.soft = (mood.soft || 1) * 1.4;
      mood.ornate = (mood.ornate ?? 1) * 0.7;
      mood.fx = { ...mood.fx, drive: 0 };
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', GENTLE_BEATS, ['pulse', 'sparse', 'halftime']), melody: keepOr(mood, 'melody', ['long', 'phrases', 'fragments'], ['phrases', 'long']),
        pad: ['sustain', 'swell'], bass: ['held', 'rootfifth'],
      });
    },
  },
  angry: {
    name: 'Angry', against: 'calm', tip: 'Angry: harder, faster and darker. The same band, playing like it means it: a driving beat, punchy chords, a darker key and some grit',
    apply(mood) {
      mood.energy = Math.min(1, Math.max(0.9, mood.energy + 0.3));
      scaleTempo(mood, 1.12);
      if (!mood.kits.length) mood.kits = ['tight-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.4), 1];
      mood.edge = Math.min(1.25, moodEdge(mood) + 0.25);
      mood.dark = Math.min(1, mood.dark + 0.3);
      mood.richness = [mood.richness[0] * 0.5, mood.richness[1] * 0.6];
      mood.space *= 0.85;
      mood.swing = 0;
      mood.fx = { ...mood.fx, drive: (mood.fx?.drive || 0) + 0.25 };
      // two shades darker: major becomes dorian, minor phrygian. one (mixolydian) still sounded cheerful
      shade(mood, 2);
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', DRIVING_BEATS, ['groove', 'march', 'tribal', 'rock']), pad: ['stabs', 'pulse', 'sustain'],
        bass: keepOr(mood, 'bass', ['octave', 'pulse', 'synco', 'riff'], ['octave', 'pulse', 'synco']),
      });
    },
  },
  fast: {
    name: 'Fast', against: 'slow', tip: 'Fast: a quarter quicker, and a little more energy',
    apply(mood) {
      scaleTempo(mood, 1.25);
      mood.energy = Math.min(1, mood.energy + 0.1);
      mood.ornate = (mood.ornate ?? 1) * 0.8;
    },
  },
  slow: {
    name: 'Slow', against: 'fast', tip: 'Slow: a quarter slower, with longer notes and softer edges',
    apply(mood) {
      scaleTempo(mood, 0.75);
      mood.energy = Math.max(0.1, mood.energy - 0.1);
      mood.soft = (mood.soft || 1) * 1.2;
    },
  },
  dark: {
    name: 'Dark', against: 'bright', tip: 'Dark: a darker scale (major becomes mixolydian, minor becomes phrygian), its chords moved with it, and a duller tone',
    apply(mood) {
      shade(mood, 1);
      mood.bright = Math.max(0.15, mood.bright - 0.2);
      mood.dark = Math.min(1, mood.dark + 0.3);
      mood.space = Math.min(1, mood.space + 0.1);
    },
  },
  bright: {
    name: 'Bright', against: 'dark', tip: 'Bright: a brighter scale (minor becomes dorian, major becomes lydian), its chords moved with it, and a sparklier tone',
    apply(mood) {
      shade(mood, -1);
      mood.bright = Math.min(1, mood.bright + 0.2);
      mood.dark = Math.max(0, mood.dark - 0.25);
    },
  },
  sparse: {
    name: 'Sparse', against: 'lush', tip: 'Sparse: fewer players and fewer notes, with space between them',
    apply(mood, style) {
      const chances = { ...LAYER_CHANCE[style], ...mood.layers };
      mood.layers = { ...mood.layers };
      for (const [role, k] of Object.entries({ counter: 0.4, arp: 0.4, bells: 0.4, keys: 0.6, drone: 0.6, pad: 0.8, texture: 0.8 })) mood.layers[role] = (chances[role] || 0) * k;
      mood.most = (mood.most || 0) - 2;
      mood.busy = (mood.busy || 0) - 0.2;
    },
  },
  lush: {
    name: 'Lush', against: 'sparse', tip: 'Lush: a fuller band, richer chords, a second melody more often, and more room',
    apply(mood, style) {
      const chances = { ...LAYER_CHANCE[style], ...mood.layers };
      mood.layers = { ...mood.layers };
      for (const [role, at] of Object.entries({ counter: 0.7, pad: 1, bells: 0.4, drone: 0.3 })) mood.layers[role] = Math.max(chances[role] || 0, at);
      mood.most = (mood.most || 0) + 1;
      mood.richness = [Math.min(1, mood.richness[0] + 0.25), Math.min(1, mood.richness[1] + 0.25)];
      mood.space = Math.min(1, mood.space + 0.15);
    },
  },
  jazzy: {
    name: 'Jazzy', tip: 'Jazzy: sevenths and ninths on every chord, a ii V I or two, swing, a walking bass and a ride cymbal',
    apply(mood) {
      mood.richness = [Math.max(0.7, mood.richness[0]), 1];
      mood.chords = [...mood.chords, 'ii7 V7 Imaj7 vi7', 'Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7'];
      mood.reharm = true;
      mood.swing = 1;
      mood.swingAmount = [0.4, 0.62];
      mood.ornate = (mood.ornate ?? 1) + 0.3;
      const kits = mood.kits.filter((id) => INSTRUMENTS[id].suits.some((pattern) => ['swing', 'brush'].includes(pattern)));
      mood.kits = kits.length ? kits : ['jazz-kit', 'brushes', 'tight-kit'];
      setPatterns(mood, { drums: ['swing', 'brush'], bass: ['walking', 'walking', 'rootfifth'], keys: ['comp', 'block'] });
    },
  },
  lofi: {
    name: 'Lo-fi', tip: 'Lo-fi: vinyl crackle, worn tape, a dusty, lazy beat and a darker tone',
    apply(mood) {
      mood.textures = ['vinyl'];
      mood.layers = { ...mood.layers, texture: 1 };
      scaleTempo(mood, 0.85);
      mood.bright = Math.max(0.15, mood.bright - 0.15);
      mood.kits = ['lofi-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.3), Math.max(mood.drums[1], 0.8)];
      mood.swing = 0.8;
      mood.swingAmount = [0.25, 0.45];
      mood.fx = { ...mood.fx, wobble: (mood.fx?.wobble || 0) + 0.4, drive: (mood.fx?.drive || 0) + 0.15 };
      setPatterns(mood, { drums: ['halftime', 'groove'] });
    },
  },
  epic: {
    name: 'Epic', tip: 'Epic: huge. Strings and a choir, big drums, long notes, a bigger room, and often a slow build to a climax that lifts into a new key',
    apply(mood) {
      mood.build = Math.max(mood.build || 0, 0.6);
      mood.space = Math.min(1, mood.space + 0.2);
      mood.energy = Math.min(1, mood.energy + 0.15);
      mood.palette = { ...mood.palette, pad: ['strings', 'choir-ah', ...mood.palette.pad] };
      // (and a tight kit for a chip band, which can't share a song with orchestral drums)
      mood.kits = ['orchestra-kit', 'taiko', 'tight-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.3), Math.max(mood.drums[1], 0.9)];
      mood.layers = { ...mood.layers, pad: 1 };
      mood.richness = [mood.richness[0] * 0.5, mood.richness[1] * 0.6];
      setPatterns(mood, { drums: ['tribal', 'march', 'halftime'], melody: ['long', 'phrases'], counter: ['harmony', 'counterpoint'], pad: ['sustain', 'pulse'] });
    },
  },
  spooky: {
    name: 'Spooky', tip: 'Spooky: strange chords that never quite settle, a darker scale, music box and glass bells, and creaks in the dark',
    apply(mood) {
      shade(mood, 1);
      mood.scales = { ...mood.scales, harmonicMinor: (mood.scales.harmonicMinor || 0) + 1, wholeTone: 0.4 };
      mood.methods = { ...(mood.methods || { bank: 5, markov: 3, vamp: 1.2 }), chromatic: 2 };
      mood.dark = Math.min(1, mood.dark + 0.4);
      mood.palette = { ...mood.palette, bells: ['music-box', 'glass-bell', ...(mood.palette.bells || [])] };
      mood.textures = ['owl', 'drips', 'creaks', 'hum'];
      setPatterns(mood, { pad: ['swell', 'sustain'], melody: keepOr(mood, 'melody', ['long', 'fragments', 'phrases'], ['phrases', 'fragments']) });
    },
  },
  retro: {
    name: 'Retro', against: 'acoustic', tip: 'Retro: the whole band played on an 8 bit console: pulse waves, a triangle bass and noise drums',
    apply(mood) {
      // every part but a guitar (retro metal keeps its guitars, as chiptune metal does)
      mood.palette = { ...mood.palette, ...CHIPS };
      mood.kits = ['chip-kit'];
      mood.edge = Math.max(moodEdge(mood), 1);
      // no surprises from other moods: they'd be acoustic or synth sounds in a chip band
      mood.surprise = 0;
      mood.textures = [];
    },
  },
  acoustic: {
    name: 'Acoustic', against: 'retro', tip: 'Acoustic: unplugged. Synths and electric instruments swapped for the nearest acoustic ones, and a softer kit',
    apply(mood) {
      mapPalette(mood, (id, role) => (role === 'guitar' ? 'steel-guitar' : UNPLUGGED[id]));
      mood.kits = [...new Set(mood.kits.map((id) => UNPLUGGED_KITS[id] || id))];
      mood.fx = { ...mood.fx, drive: 0 };
      setPatterns(mood, { guitar: ['strum', 'ring', 'boomchick'] });
    },
  },
  groovy: {
    name: 'Groovy', tip: 'Groovy: a bass hook or a funky syncopated bass, chord stabs on the off beats and a busier drummer',
    apply(mood) {
      mood.energy = Math.min(1, mood.energy + 0.1);
      mood.busy = (mood.busy || 0) + 0.1;
      mood.swing = Math.max(mood.swing || 0, 0.5);
      mood.swingAmount = [0.15, 0.35];
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', ['funk', 'groove', 'four', 'break', 'halftime', 'onedrop'], ['groove', 'funk']), bass: ['hook', 'synco', 'octave', 'hook'],
        keys: ['block', 'skank', 'comp'], pad: ['stabs', 'pump'], guitar: ['funk', 'eighths'],
      });
    },
  },
  dreamy: {
    name: 'Dreamy', tip: 'Dreamy: a brighter, floating scale, slow swells, long echoes and a huge room',
    apply(mood) {
      shade(mood, -1);
      mood.space = 1;
      mood.soft = (mood.soft || 1) * 1.6;
      mood.drums = [mood.drums[0] * 0.6, mood.drums[1] * 0.7];
      mood.palette = { ...mood.palette, pad: ['shimmer', 'glass-pad', ...mood.palette.pad] };
      mood.fx = { ...mood.fx, wobble: (mood.fx?.wobble || 0) + 0.3 };
      setPatterns(mood, { melody: ['long', 'phrases', 'fragments'], pad: ['swell', 'sustain'] });
    },
  },
  // calamity's music and film scores: quiet sections quieter and loud ones bigger (drama), strings
  // swelling under the tune, harmonic minor pulling home, and a bigger room
  dramatic: {
    name: 'Dramatic', tip: 'Dramatic: bigger swings between quiet and loud, strings swelling under the tune, a minor key pulling hard for home, a bigger room, and longer songs that often build and end a key higher',
    apply(mood) {
      mood.drama = Math.max(mood.drama || 1, 1.5);
      // it builds more often, and a tune that doesn't goes round twice and ends a key higher
      // (DRAMA_FORMS), unless the mood has song shapes of its own
      mood.build = Math.max(mood.build || 0, 0.45);
      if (!mood.forms) mood.forms = DRAMA_FORMS;
      mood.space = Math.min(1, mood.space + 0.15);
      if (mood.scales.minor) mood.scales = { ...mood.scales, harmonicMinor: (mood.scales.harmonicMinor || 0) + mood.scales.minor * 0.5 };
      mood.palette = { ...mood.palette, pad: [...new Set(['strings', ...mood.palette.pad])] };
      mood.layers = { ...mood.layers, pad: Math.max(mood.layers?.pad || 0, 0.9) };
      setPatterns(mood, { pad: ['swell', 'sustain', 'swell'], melody: keepOr(mood, 'melody', ['long', 'phrases'], ['phrases', 'long']) });
    },
  },
  // a film cue, a post-rock song, bolero: one player, then everyone, to a climax (builds)
  rising: {
    name: 'Rising', tip: 'Rising: starts with one player and builds section by section, everyone joining in, to a huge climax with the whole band on the tune',
    apply(mood) {
      mood.build = 1;
      mood.drama = Math.max(mood.drama || 1, 1.15);
    },
  },
};
// a song's modifiers cleaned up: known ones, once each, in MODIFIERS' order, the first of an opposite
// pair kept, at most MOST_MODS
function cleanMods(mods) {
  const wanted = new Set(Array.isArray(mods) ? mods : []);
  const out = [];
  for (const id of Object.keys(MODIFIERS)) {
    if (!wanted.has(id) || out.length >= MOST_MODS || out.includes(MODIFIERS[id].against)) continue;
    out.push(id);
  }
  return out;
}

// the mood a song is really written in (songMood): its flavour, then its modifiers, then its style. a
// fight drives: at least FIGHT_ENERGY, quicker, no swing, a drier room, and drums on a kit that can play
// a fight's beats, opening on the drums and bass. a song with none of these gets the mood untouched
const moodEdge = (mood) => mood.edge ?? 0.3 + mood.energy * 0.6 + mood.dark * 0.2;
function mixMood(base, mods, style, kind) {
  if (!mods.length && !FIGHTS[style] && !kind && style !== 'cutscene') return base;
  const mood = kind ? flavourMood(base, kind) : { ...base, palette: { ...base.palette } };
  for (const id of mods) MODIFIERS[id].apply(mood, style);
  // a final boss and a cutscene have more drama, and a cutscene is a little slower so its build takes
  // its time
  if (style === 'final' || style === 'cutscene') mood.drama = Math.max(mood.drama || 1, 1.25);
  if (style === 'cutscene') scaleTempo(mood, 0.85);
  if (FIGHTS[style]) {
    mood.energy = Math.max(mood.energy, FIGHT_ENERGY[style]);
    mood.space *= 0.75;
    mood.swing = 0;
    // quicker, unless it's already quick (drum and bass at 170 needs no push)
    mood.tuneTempo = mood.tuneTempo.map((bpm, i) => (bpm >= 150 ? bpm : Math.round(Math.min(165, bpm * (i ? 1.15 : 1.2)))));
    mood.meters = { '4/4': 10, '6/8': 1, '5/4': 0.5 };
    // a kit that plays a fight's beats, or a newer driving beat the mood itself plays (country's train)
    const own = mood.patterns?.drums || [];
    const kits = mood.kits.filter((id) => INSTRUMENTS[id].suits.some((pattern) => STYLE_PATTERNS.boss.drums.includes(pattern) || (ALSO_DRIVING.includes(pattern) && own.includes(pattern))));
    mood.kits = kits.length ? kits : FIGHT_KITS;
    mood.drums = [1, 1];
    mood.opens = ['drums', 'bass', ...mood.opens];
    mood.soloOver = mood.soloOver || 'B';
  }
  return mood;
}
const moodCache = new Map();
function songMood(song) {
  const mods = song.mods || [];
  const key = `${song.mood}|${song.flavour || ''}|${mods.join(',')}|${song.style}`;
  if (!moodCache.has(key)) moodCache.set(key, mixMood(MOODS[song.mood], mods, song.style, flavourOf(song)));
  return moodCache.get(key);
}

// the families a layer's surprise instrument can come from, so a drone isn't a plucked lead
const WILDCARDS = {
  melody: ['lead', 'keys', 'bell'], counter: ['lead', 'keys'], arp: ['keys', 'lead', 'bell'], bells: ['bell', 'keys'],
  keys: ['keys'], pad: ['pad', 'drone'], drone: ['drone', 'pad'], bass: ['bass'], guitar: ['guitar'],
};

// how likely each role is to be in a song. only moods that ask for a guitar get one (MOODS layers)
const LAYER_CHANCE = {
  ambient: { melody: 0.55, counter: 0.2, arp: 0.25, bells: 0.65, keys: 0.3, guitar: 0, pad: 1, drone: 0.55, bass: 0.4, drums: 0.12, texture: 0.85 },
  tune:    { melody: 1, counter: 0.45, arp: 0.5, bells: 0.2, keys: 0.65, guitar: 0, pad: 0.7, drone: 0.15, bass: 1, drums: 0.85, texture: 0.25 },
  // a fight is the tune, the bass and the beat, with an ostinato (an arp or pulsing pad) under them
  boss:    { melody: 1, counter: 0.5, arp: 0.55, bells: 0.1, keys: 0.4, guitar: 0, pad: 0.8, drone: 0.1, bass: 1, drums: 1, texture: 0.1 },
  mini:    { melody: 1, counter: 0.3, arp: 0.45, bells: 0.05, keys: 0.35, guitar: 0, pad: 0.6, drone: 0.05, bass: 1, drums: 1, texture: 0.05 },
  // a final boss is the biggest band a fight gets: a second melody, pads and something ringing on top
  final:   { melody: 1, counter: 0.6, arp: 0.5, bells: 0.2, keys: 0.4, guitar: 0, pad: 0.9, drone: 0.2, bass: 1, drums: 1, texture: 0.1 },
  // a loop is a smaller band than a tune: heard for an hour, it wants room more than parts
  loop:    { melody: 1, counter: 0.35, arp: 0.4, bells: 0.2, keys: 0.65, guitar: 0, pad: 0.55, drone: 0.1, bass: 1, drums: 0.8, texture: 0.2 },
  // a cutscene builds to everyone (BUILD_BAND tops these up)
  cutscene: { melody: 1, counter: 0.5, arp: 0.4, bells: 0.3, keys: 0.6, guitar: 0, pad: 0.9, drone: 0.25, bass: 1, drums: 0.75, texture: 0.25 },
};
// the most layers a song has, and how many of its parts play from the first bar (pickArrangement)
const MOST_LAYERS = { ambient: 6, tune: 7, boss: 7, mini: 6, loop: 6, final: 7, cutscene: 7 };
const OPENING = { ambient: 1, tune: 2, boss: 3, mini: 3, loop: 3, final: 2, cutscene: 1 };
// the parts that move round the middle of the band. three or four at once were a pile of noises, so a
// song keeps two at most, losing them in this order
const MIDDLE = ['bells', 'counter', 'arp', 'keys'];
// chance of a second texture in an ambient song (birds over a stream), never two steady beds
const SECOND_TEXTURE = 0.5;

// when each role joins in: once a section's energy reaches a number picked from its range
const ROLE_ENTRY = {
  texture: [0, 0.25], drone: [0, 0.3], pad: [0, 0.35], bells: [0.2, 0.6], keys: [0.25, 0.6], guitar: [0.2, 0.5], bass: [0.3, 0.6],
  arp: [0.45, 0.85], melody: [0.5, 0.65], counter: [0.6, 0.95], drums: [0.4, 0.75],
};

// the parts that can open a song when none of the mood's openers are in it
const OPENERS = ['pad', 'keys', 'guitar', 'arp', 'drone', 'bass', 'drums'];

// the shapes songs take: [name, part, about how many 4/4 bars, energy, LIFTED for a key change]
const FORMS = {
  ambient: [
    [['Rise', 'A', 8, 0.3], ['Drift', 'A', 16, 0.65], ['Turn', 'B', 16, 0.85], ['Drift', 'A', 16, 0.7], ['Fade', 'A', 8, 0.3]],
    [['Dawn', 'A', 8, 0.25], ['Bloom', 'A', 16, 0.6], ['Haze', 'B', 16, 0.8], ['Deep', 'C', 8, 0.5], ['Bloom', 'A', 16, 0.75], ['Dusk', 'A', 8, 0.3]],
    [['Emerge', 'A', 16, 0.4], ['Float', 'B', 16, 0.75], ['Emerge', 'A', 16, 0.65], ['Still', 'C', 8, 0.35]],
    [['Hush', 'C', 8, 0.25], ['Glow', 'A', 16, 0.6], ['Swell', 'B', 16, 0.9], ['Glow', 'A', 16, 0.6], ['Hush', 'C', 8, 0.25]],
  ],
  tune: [
    [['Intro', 'A', 4, 0.3], ['A', 'A', 8, 0.7], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['A', 'A', 8, 0.8], ['Outro', 'A', 4, 0.3]],
    [['Intro', 'A', 4, 0.3], ['Verse', 'A', 8, 0.65], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.55], ['Chorus', 'B', 8, 1], ['Outro', 'B', 4, 0.35]],
    [['Intro', 'C', 4, 0.3], ['Theme', 'A', 8, 0.75], ['Theme', 'A', 8, 0.85], ['Break', 'C', 8, 0.5], ['Climb', 'B', 8, 0.95], ['Theme', 'A', 8, 0.85]],
    [['A', 'A', 8, 0.7], ['B', 'B', 8, 0.9], ['A', 'A', 8, 0.8], ['C', 'C', 8, 0.55]],
  ],
  // fights loop, so no outro: a short intro on the beat and bass, the theme, a higher second theme
  // (each twice), a break (a calm moment or a breakdown), then the climax. about two minutes at 160
  boss: [
    [['Intro', 'C', 4, 0.45], ['Theme', 'A', 8, 0.9], ['Theme', 'A', 8, 0.95], ['Rise', 'B', 8, 1], ['Theme', 'A', 8, 0.95], ['Rise', 'B', 8, 1], ['Break', 'C', 8, 0.55], ['Build', 'C', 4, 0.8], ['Climax', 'B', 8, 1], ['Climax', 'B', 8, 1], ['Theme', 'A', 8, 0.95]],
    [['Intro', 'A', 4, 0.45], ['A', 'A', 8, 0.9], ['B', 'B', 8, 1], ['A', 'A', 8, 0.95], ['B', 'B', 8, 1], ['Break', 'C', 8, 0.55], ['Build', 'C', 4, 0.8], ['A', 'A', 8, 0.95], ['B', 'B', 8, 1], ['B', 'B', 8, 1]],
    [['Intro', 'B', 4, 0.5], ['A', 'A', 16, 0.92], ['B', 'B', 8, 1], ['Break', 'C', 8, 0.55], ['A', 'A', 8, 0.95], ['B', 'B', 16, 1], ['C', 'C', 8, 0.75], ['A', 'A', 8, 0.95], ['B', 'B', 8, 1]],
  ],
  // a final boss changes gear halfway: an omen, the first phase, a breather, then the second phase a key
  // higher and its last stand. three to five minutes, then round again from the omen in the first key
  final: [
    [['Omen', 'C', 4, 0.3], ['Theme', 'A', 8, 0.85], ['Theme', 'A', 8, 0.9], ['Clash', 'B', 8, 1], ['Theme', 'A', 8, 0.95], ['Clash', 'B', 8, 1], ['Break', 'C', 8, 0.5], ['Clash', 'B', 8, 1], ['Calm', 'C', 8, 0.35], ['Awaken', 'C', 4, 0.75], ['Fury', 'A', 8, 0.95, LIFTED], ['Fury', 'A', 8, 1, LIFTED], ['Clash', 'B', 8, 1, LIFTED], ['Last stand', 'B', 8, 1, LIFTED], ['Last stand', 'A', 8, 1, LIFTED]],
    [['Omen', 'A', 4, 0.3], ['Phase one', 'A', 8, 0.85], ['Clash', 'B', 8, 0.95], ['Phase one', 'A', 8, 0.95], ['Clash', 'B', 8, 1], ['Turn', 'C', 8, 0.7], ['Clash', 'B', 8, 1], ['Respite', 'C', 8, 0.35], ['Rising', 'C', 4, 0.75], ['Phase two', 'A', 8, 0.95, LIFTED], ['Phase two', 'B', 8, 1, LIFTED], ['Phase two', 'A', 8, 1, LIFTED], ['Desperation', 'C', 8, 0.6, LIFTED], ['Final phase', 'A', 8, 1, LIFTED], ['Final phase', 'B', 8, 1, LIFTED], ['Final phase', 'B', 8, 1, LIFTED]],
    [['Omen', 'C', 8, 0.35], ['Theme', 'A', 16, 0.9], ['Clash', 'B', 8, 1], ['Theme', 'A', 8, 0.95], ['Clash', 'B', 8, 1], ['Calm', 'C', 8, 0.3], ['Awaken', 'B', 4, 0.8], ['Fury', 'A', 16, 0.95, LIFTED], ['Clash', 'B', 8, 1, LIFTED], ['Break', 'C', 8, 0.6, LIFTED], ['Last stand', 'B', 16, 1, LIFTED]],
  ],
  // a mini boss is over quicker: a loop of two or three parts
  mini: [
    [['Intro', 'A', 2, 0.5], ['A', 'A', 8, 0.9], ['B', 'B', 8, 1], ['A', 'A', 8, 0.95]],
    [['A', 'A', 8, 0.9], ['B', 'B', 8, 1]],
    [['Intro', 'C', 2, 0.5], ['A', 'A', 8, 0.9], ['C', 'C', 4, 0.7], ['B', 'B', 8, 1]],
  ],
  // a loop starts on its theme and ends on whatever leads back into it. the theme comes round more than
  // once, so it can be handed round (pickOrchestra)
  loop: [
    [['A', 'A', 8, 0.75], ['A', 'A', 8, 0.85], ['B', 'B', 8, 0.95], ['A', 'A', 8, 0.85]],
    [['A', 'A', 8, 0.8], ['B', 'B', 8, 0.9], ['A', 'A', 8, 0.85], ['C', 'C', 8, 0.6]],
    [['A', 'A', 8, 0.75], ['B', 'B', 8, 0.9], ['C', 'C', 4, 0.65], ['A', 'A', 8, 0.85]],
    [['A', 'A', 8, 0.8], ['B', 'B', 8, 0.9]],
  ],
};

// ---------- songs that build ----------
//
// most songs go round, verse and chorus. a song that builds (builds()) starts with one player and adds
// one a section (pickArrangement), its band bigger by the end (pickLayers), up to everyone on the tune
// at the climax: the tune doubled only at the top (pickOrchestra, markDoubles), the drummer rolling into
// it (COMPOSERS.drums), no solo (addSolo). most then drop to a few players for a breath and come back a
// key higher (LIFTED) for the finale. a mood says how often its tunes and ambient songs build (build);
// the roll has its own random numbers, so songs that don't build are as they were. loops and fights
// never build, and a cutscene always does
const BUILDS = {
  tune: [
    [['Spark', 'A', 8, 0.2], ['Gather', 'A', 8, 0.4], ['Rise', 'B', 8, 0.6], ['Swell', 'A', 8, 0.75], ['Surge', 'B', 8, 0.88], ['Climax', 'A', 8, 1], ['Climax', 'B', 8, 1], ['Breath', 'C', 4, 0.4], ['Finale', 'B', 16, 1, LIFTED], ['Afterglow', 'A', 4, 0.3, LIFTED]],
    [['Spark', 'C', 8, 0.15], ['Gather', 'A', 8, 0.35], ['Rise', 'A', 8, 0.55], ['Swell', 'B', 8, 0.7], ['Surge', 'A', 8, 0.85], ['Brink', 'C', 4, 0.92], ['Climax', 'B', 8, 1], ['Climax', 'A', 8, 1, LIFTED], ['Finale', 'B', 16, 1, LIFTED]],
    [['Spark', 'A', 8, 0.2], ['Gather', 'A', 8, 0.45], ['Rise', 'B', 8, 0.65], ['Surge', 'A', 8, 0.82], ['Brink', 'C', 4, 0.92], ['Climax', 'B', 16, 1], ['Breath', 'C', 4, 0.35], ['Finale', 'B', 16, 1, LIFTED], ['Afterglow', 'C', 4, 0.25, LIFTED]],
  ],
  ambient: [
    [['Dawn', 'A', 8, 0.15], ['Bloom', 'A', 16, 0.35], ['Rise', 'B', 16, 0.55], ['Swell', 'A', 16, 0.75], ['Blaze', 'B', 16, 1], ['Blaze', 'A', 8, 1, LIFTED], ['Dusk', 'A', 8, 0.3, LIFTED]],
    [['Hush', 'C', 8, 0.15], ['Glow', 'A', 16, 0.4], ['Rise', 'B', 16, 0.62], ['Surge', 'A', 16, 0.82], ['Blaze', 'B', 16, 1], ['Still', 'C', 8, 0.35], ['Blaze', 'A', 16, 1, LIFTED]],
  ],
  // five minutes or so at a ballad's tempo: a long climb, a climax, a breath, a finale a key higher
  cutscene: [
    [['Prologue', 'C', 8, 0.15], ['Gather', 'A', 8, 0.3], ['Rise', 'A', 8, 0.45], ['Swell', 'B', 8, 0.6], ['Surge', 'A', 8, 0.75], ['Brink', 'C', 4, 0.9], ['Climax', 'B', 8, 1], ['Climax', 'A', 8, 1], ['Breath', 'C', 8, 0.35], ['Ascent', 'A', 4, 0.75], ['Finale', 'B', 8, 1, LIFTED], ['Finale', 'A', 8, 1, LIFTED], ['Epilogue', 'A', 4, 0.25, LIFTED]],
    [['Prologue', 'A', 8, 0.15], ['Gather', 'A', 8, 0.35], ['Rise', 'B', 8, 0.5], ['Surge', 'A', 8, 0.7], ['Brink', 'C', 4, 0.88], ['Climax', 'B', 16, 1], ['Breath', 'C', 8, 0.3], ['Ascent', 'C', 4, 0.7], ['Finale', 'B', 16, 1, LIFTED], ['Epilogue', 'C', 4, 0.2, LIFTED]],
    [['Prologue', 'C', 4, 0.15], ['Gather', 'A', 8, 0.3], ['Gather', 'A', 8, 0.4], ['Rise', 'B', 8, 0.55], ['Swell', 'A', 8, 0.7], ['Surge', 'B', 8, 0.85], ['Brink', 'C', 4, 0.92], ['Climax', 'A', 8, 1], ['Climax', 'B', 8, 1, LIFTED], ['Finale', 'A', 8, 1, LIFTED], ['Epilogue', 'A', 4, 0.25, LIFTED]],
  ],
};
// (a cutscene of your own doesn't build, blankSong, so it takes its shapes from here)
FORMS.cutscene = BUILDS.cutscene;
// the band a song that builds wants by its climax, as the least chance of each role (pickLayers)
const BUILD_BAND = { melody: 0.9, pad: 0.95, bass: 0.9, counter: 0.6, bells: 0.45, drone: 0.4, drums: 0.9 };
// the players' entry points in a build are spread up to here, so the last one's in before the climax
const BUILD_TOP = 0.93;
// whether a song builds: its mood's chance, on its own random numbers. always in a cutscene, never by hand
const builds = (song) => {
  const chance = song.style === 'cutscene' ? 1 : songMood(song).build || 0;
  return chance > 0 && !song.own && !!BUILDS[song.style] && makeRng(song.seed, song.mood, song.style, 'build').chance(chance);
};

// ---------- weaving: themes one at a time, then together ----------
//
// wizard101's world themes (marleybone's above all) bring their tunes in one at a time, each on its own
// instrument over the same chords (the clarinet's, then the cello's), then play them together, go
// somewhere quieter on other instruments (a celesta over the harp), and end on the whole orchestra. a
// song that weaves (weaves(): a mood's weave chance, on its own random numbers) is arranged that way
// (weaveArrangement). its counter melody writes the second theme against the tune whether or not the
// tune's playing (COMPOSERS.counter), so they fit when they meet, and its bells carry the tune alone in
// the trio. only tunes and loops weave, never a song that builds (a build's climb is its own shape).
// [name, part, about how many 4/4 bars, energy, who has the tunes, LIFTED for a key change]
//   intrada   a loud opening on the chords, the bells hinting at a tune
//   first     the tune alone
//   second    the second theme alone
//   together  both
//   trio      the bells carry the tune over the quieter players, with no drums
//   climax    everyone, the tune doubled
const WEAVES = {
  tune: [
    [['Intrada', 'B', 4, 0.85, 'intrada'], ['Theme', 'A', 8, 0.6, 'first'], ['Second theme', 'A', 8, 0.65, 'second'], ['Together', 'A', 8, 0.85, 'together'], ['Bridge', 'B', 8, 0.75, 'first'], ['Trio', 'C', 8, 0.4, 'trio'], ['Climax', 'A', 8, 1, 'climax'], ['Climax', 'B', 8, 1, 'climax'], ['Coda', 'A', 4, 0.35, 'first']],
    [['Intrada', 'A', 4, 0.85, 'intrada'], ['Theme', 'A', 8, 0.6, 'first'], ['Second theme', 'A', 8, 0.6, 'second'], ['Bridge', 'B', 8, 0.7, 'first'], ['Together', 'A', 8, 0.85, 'together'], ['Trio', 'C', 8, 0.4, 'trio'], ['Climax', 'A', 8, 1, 'climax', LIFTED], ['Climax', 'B', 8, 1, 'climax', LIFTED], ['Coda', 'A', 4, 0.35, 'first', LIFTED]],
  ],
  // (a loop's key change goes back down where it starts again)
  loop: [
    [['Intrada', 'B', 4, 0.85, 'intrada'], ['Theme', 'A', 8, 0.6, 'first'], ['Second theme', 'A', 8, 0.65, 'second'], ['Together', 'A', 8, 0.85, 'together'], ['Bridge', 'B', 8, 0.75, 'first'], ['Trio', 'C', 8, 0.4, 'trio'], ['Climax', 'A', 8, 1, 'climax']],
    [['Theme', 'A', 8, 0.6, 'first'], ['Second theme', 'A', 8, 0.65, 'second'], ['Together', 'A', 8, 0.85, 'together'], ['Bridge', 'B', 8, 0.75, 'first'], ['Trio', 'C', 8, 0.4, 'trio'], ['Climax', 'A', 8, 1, 'climax', LIFTED], ['Climax', 'B', 8, 1, 'climax', LIFTED]],
  ],
};
// who has the tunes in each kind of section (the other players come in by energy)
const WEAVERS = { intrada: ['bells'], first: ['melody'], second: ['counter'], together: ['melody', 'counter'], trio: ['bells'], climax: ['melody', 'counter', 'bells'] };
// the kinds of section where every player's in, whatever its entry point (the trio has no drums)
const WEAVE_FULL = { intrada: true, trio: true, climax: true };
// the most players a weave keeps (as many as any tune), its drone and then its scenery going to make
// room for its themes
const WEAVE_BAND = 7;
const weaves = (song) => {
  const chance = songMood(song).weave || 0;
  return chance > 0 && !song.own && !!WEAVES[song.style] && !builds(song) && makeRng(song.seed, song.mood, song.style, 'weave').chance(chance);
};

// ---------- making a song ----------

const LAYER_DEFAULTS = {
  id: '', role: 'pad', instrument: '', pattern: '', seed: '0', volume: 0.6, pan: 0, octave: 0, density: 0.5,
  rate: 'medium', span: 2, reverb: 0.4, echo: 0.1, mute: false, solo: false,
  // attack, release and bright multiply the instrument's; detune and vibrato add cents of wobble
  tone: { attack: 1, release: 1, bright: 1, detune: 0, vibrato: 0 },
  // notes changed by hand, per part: add [[beat in the section, midi, length]], remove ["beat:midi"]
  edits: {},
};
const FX_DEFAULTS = { reverb: 0.4, size: 0.6, tone: 0.5, echo: 0.2, echoTime: 0.75, echoRepeats: 0.35, warmth: 0.2, wobble: 0, drive: 0, volume: 0.8 };
const ECHO_TIMES = [0.5, 0.75, 1, 1.5, 2];

// mods (MODIFIERS, any order) and flavour (FLAVOURS) don't change the random numbers, so adding "fast"
// gives the same song, faster, as near as it can. each pick has its own random numbers
function generateSong(moodId, style, seed, mods = [], flavour) {
  const mood = MOODS[moodId] ? moodId : 'calm';
  const picked = cleanMods(mods);
  const kind = flavour !== plainFlavour(mood) && FLAVOURS[mood]?.kinds[flavour] ? { flavour } : {};
  const song = { name: seedTitle(seed), seed, composer: COMPOSER, mood, ...kind, ...(picked.length ? { mods: picked } : {}), style: STYLES[style] ? style : 'ambient', parts: {}, layers: [], sections: [], fx: {} };
  pickTonality(song, makeRng(seed, mood, 'tonality'));
  pickChords(song, makeRng(seed, mood, 'chords'));
  pickLayers(song, makeRng(seed, mood, song.style, 'layers'));
  pickWeave(song, makeRng(seed, mood, song.style, 'weave', 'band'));
  pickArrangement(song, makeRng(seed, mood, song.style, 'arrangement'));
  // (a song that builds orchestrates more, but only in a mood that orchestrates at all: a shoegaze band
  // had a counter melody join with nothing left to play it on, and drew a pan flute)
  const orchestra = songMood(song).orchestra;
  // (a weave hands its themes round its own way)
  if (!weaves(song)) pickOrchestra(song, makeRng(seed, mood, song.style, 'orchestra'), orchestra && builds(song) ? { pass: Math.max(orchestra.pass || 0, 0.5), double: Math.max(orchestra.double || 0, 0.6) } : undefined);
  pickScenery(song, makeRng(seed, mood, song.style, 'scenery'));
  pickDoubles(song, makeRng(seed, mood, song.style, 'doubles'));
  pickRecordings(song);
  pickSpace(song, makeRng(seed, mood, 'space'));
  return cleanSong(song);
}

// a blank track to make by hand (New track): one short section and an empty melody, bass and drums.
// own means picking a mood doesn't write a new song over it, only how any written parts play
function blankSong() {
  const layer = (role, instrument, volume, reverb) => ({ id: role, role, instrument, hand: true, volume, reverb, echo: 0 });
  return cleanSong({
    name: 'New track', seed: 'new-track', own: true, composer: COMPOSER, mood: 'calm', style: 'tune',
    key: 0, scale: 'major', tempo: 100, meter: '4/4', swing: 0, humanise: 0.2, colour: 0, chordBars: 1,
    layers: [layer('melody', 'piano', 0.68, 0.35), layer('bass', 'pluck-bass', 0.66, 0.1), layer('drums', 'tight-kit', 0.55, 0.1)],
    sections: [{ name: 'Verse', part: 'A', bars: 4, play: ['melody', 'bass', 'drums'], energy: 0.75 }],
    fx: { reverb: 0.3, echo: 0.1 },
  });
}

// remixing: one pick made again. nonce makes it new each time; everything else stays as it was
const REROLLS = {
  chords: (song, mood, rng) => pickChords(song, rng),
  melodies: (song, mood, rng) => {
    for (const layer of song.layers) {
      layer.seed = newToken(rng);
      delete layer.partSeeds;
    }
  },
  band: (song, mood, rng) => {
    // cleared first, so the new instruments don't dodge the old ones
    for (const layer of song.layers) layer.instrument = '';
    for (const layer of dressOrder(song.layers)) dressLayer(song, layer, rng, false);
    fitBand(song);
    pickDoubles(song, rng);
    pickRecordings(song);
  },
  arrangement: (song, mood, rng) => pickArrangement(song, rng),
  // the tune handed round a new way: whoever carried it goes, and it's picked again with better than
  // the mood's own chances (pressing it asks for orchestration)
  orchestra: (song, mood, rng) => {
    // (a weave's themes keep their places and get new instruments)
    if (weaves(song)) {
      for (const layer of song.layers) if (layer.role === 'counter' || carries(layer)) dressLayer(song, layer, rng, false);
      fitBand(song);
      return;
    }
    const gone = new Set(song.layers.filter(carries).map((layer) => layer.id));
    const takers = new Set(song.layers.filter((layer) => layer.role === 'counter' && carries(layer)).map((layer) => layer.id));
    const melody = song.layers.find((layer) => layer.role === 'melody');
    for (const section of song.sections) {
      // the melody back in wherever it had handed the tune over
      if (melody && !section.lead && section.play.some((id) => takers.has(id)) && !section.play.includes(melody.id)) section.play.push(melody.id);
      section.play = section.play.filter((id) => !gone.has(id));
    }
    song.layers = song.layers.filter((layer) => !gone.has(layer.id));
    pickOrchestra(song, rng, { pass: Math.max(0.6, mood.orchestra?.pass || 0), double: Math.max(0.5, mood.orchestra?.double || 0) });
  },
  space: (song, mood, rng) => pickSpace(song, rng),
  tonality: (song, mood, rng) => pickTonality(song, rng),
  mutate: (song, mood, rng) => mutateSong(song, rng),
};
function rerollSong(song, what, nonce) {
  const next = clone(song);
  REROLLS[what](next, songMood(next), makeRng(song.seed, what, nonce));
  return cleanSong(next);
}
// the seed a layer writes one part from: its own, or that part's own once it's been given new notes
// (layer.partSeeds). the motif, riff and feel stay on the layer's seed, so a new clash still grows from
// the same idea as the theme, and the band answers it as it answers any tune
const partSeed = (layer, part) => layer.partSeeds?.[part] || layer.seed;
// new notes for one layer in one part only, everything else as it was. notes changed by hand in that
// part go, as they were changes to the old notes. a part written from the chords alone (a held bass,
// strummed keys, counterpoint following the tune) comes out the same whatever the seed, so it tries a
// few and gives null if none is new
function rerollLayerPart(song, id, part, nonce) {
  const written = (one) => {
    const comp = composeSong(one);
    const inPart = (note) => comp.sections.some((section) => section.part === part && note.gt >= section.start - 1e-6 && note.gt < section.end - 1e-6);
    return JSON.stringify(comp.notes.filter((note) => note.layer === id && inPart(note)).map((note) => [note.gt, note.midi, note.dur]));
  };
  const before = written(song);
  const rng = makeRng(song.seed, id, part, nonce);
  for (let tries = 0; tries < 4; tries++) {
    const next = clone(song);
    const layer = next.layers.find((one) => one.id === id);
    if (!layer) return null;
    layer.partSeeds = { ...layer.partSeeds, [part]: newToken(rng) };
    delete layer.edits[part];
    if (written(next) !== before) return cleanSong(next);
  }
  return null;
}
// new chords for one part only
function rerollPart(song, part, nonce) {
  const next = clone(song);
  next.parts[part] = makeProgression(next, makeRng(song.seed, 'part', part, nonce), pickMethod(next, makeRng(nonce)));
  return cleanSong(next);
}

function pickTonality(song, rng) {
  const mood = songMood(song);
  song.key = rng.int(0, 11);
  song.scale = rng.weighted(mood.scales);
  const [low, high] = song.style === 'ambient' ? mood.tempo : mood.tuneTempo;
  song.tempo = Math.round(rng.range(low, high));
  song.meter = rng.weighted(mood.meters || (song.style !== 'ambient' ? { '4/4': 6, '3/4': 1.5, '6/8': 1.5 } : { '4/4': 5, '3/4': 2, '6/8': 1 }));
  // a 6/8 beat is three eighths long, so the same feel counts slower
  if (song.meter === '6/8') song.tempo = Math.round(song.tempo * 0.65);
  song.swing = rng.chance(mood.swing || 0) ? rng.range(...(mood.swingAmount || [0.15, 0.5])) : 0;
  song.humanise = rng.range(0.25, 0.6);
  song.colour = rng.range(...mood.richness);
  song.chordBars = rng.pick(mood.chordBars || (song.style === 'ambient' ? [1, 2, 2, 4] : mood.energy > 0.7 ? [0.5, 1, 1, 2] : [1, 1, 2]));
}

const pickMethod = (song, rng) => rng.weighted(songMood(song).methods || { bank: 5, markov: 3, vamp: 1.2 });

function pickChords(song, rng) {
  song.parts = {};
  for (const part of PARTS) {
    // B and C should sound different from A, so try a few times for a different progression
    let chords = '';
    for (let tries = 0; tries < 6 && (!chords || Object.values(song.parts).includes(chords)); tries++) {
      chords = makeProgression(song, rng, part === 'C' ? rng.pick(['vamp', 'markov', 'bank']) : pickMethod(song, rng));
    }
    song.parts[part] = chords;
  }
}

// a progression moved into another scale by degree: I V vi IV in minor is i v bVI iv. a seventh or sus
// stays on (not on a diminished chord: the parser can't read "vii°7"), and chords off the major
// scale's degrees (bVII) and holds (-) stay as they were
function reharmonise(text, steps) {
  return String(text).trim().split(/\s+/).map((token) => {
    const chord = parseChord(token);
    const degree = chord ? MAJOR_DEGREES.indexOf(chord.root) : -1;
    if (degree < 0 || degree >= steps.length) return token;
    const next = diatonicChord(steps, degree);
    const name = chordToken(next.root, next.tones);
    const extra = /(maj7|7|6|sus2|sus4|add9)$/i.exec(token)?.[1] || '';
    if (!extra || /[°+]$/.test(name)) return name;
    // a major seventh on what's now a minor chord would be a strange chord, so it's a plain seventh
    return name + (extra === 'maj7' && next.tones[1] === 3 ? '7' : extra);
  }).join(' ');
}

// one progression, made one of four ways (see the music theory notes at the top)
function makeProgression(song, rng, method) {
  const mood = songMood(song);
  const steps = harmonySteps(song.scale);
  const token = (degree) => { const chord = diatonicChord(steps, degree); return chordToken(chord.root, chord.tones); };
  if (method === 'bank') {
    // the mood's progressions, favouring ones with few notes outside the scale, so the chords and tunes
    // agree. a modifier that changed the scale moves them into it first
    const inScale = new Set(steps);
    const outside = (text) => parseProgression(text).slots.reduce((n, { chord }) => n + chord.tones.filter((tone) => !inScale.has(mod12(chord.root + tone))).length, 0);
    const bank = mood.reharm ? mood.chords.map((text) => reharmonise(text, steps)) : mood.chords;
    return rng.weighted(bank.map((text) => [text, 1 / (1 + outside(text)) ** 2]));
  }
  if (method === 'vamp') {
    // a diminished chord is too restless to sit on for long, so vamps leave them out
    const other = token(rng.pick([1, 3, 4, 5, 6].filter((degree) => degree < steps.length && diatonicChord(steps, degree).tones[2] !== 6)));
    return rng.chance(0.5) ? `${token(0)} ${other}` : `${token(0)} - ${other} -`;
  }
  if (method === 'chromatic') {
    // roots wandering by semitones, thirds and tritones: nothing feels like home, which is the point
    let root = 0;
    const out = [token(0)];
    const length = rng.pick([2, 3, 4, 4]);
    while (out.length < length) {
      root = mod12(root + rng.pick([1, 3, 4, 6, 8, 9, 11]));
      const quality = rng.weighted({ minor: 3, major: 2, dim: 1 });
      out.push(chordToken(root, quality === 'minor' ? [0, 3, 7] : quality === 'major' ? [0, 4, 7] : [0, 3, 6]));
    }
    return out.join(' ');
  }
  // markov: a walk through CHORD_MOVES starting from home
  const length = rng.pick([3, 4, 4, 4, 6, 8]);
  const degrees = [0];
  while (degrees.length < length) {
    const from = degrees[degrees.length - 1] % 7;
    degrees.push(rng.weighted(CHORD_MOVES[from].map((weight, to) => [to, weight]).filter(([to]) => to < steps.length)));
  }
  // it loops back round to the first chord, so it shouldn't sit on home at the end too
  if (degrees[length - 1] === 0) degrees[length - 1] = rng.pick([4, 3, 5].filter((degree) => degree < steps.length));
  return degrees.map(token).join(' ');
}

function pickLayers(song, rng) {
  const mood = songMood(song);
  const chances = { ...LAYER_CHANCE[song.style], ...mood.layers };
  // a fight always has a bass, even in a mood that rarely wants one (a raga)
  if (FIGHTS[song.style]) chances.bass = 1;
  // a song that builds ends with a big band (BUILD_BAND), and has room for one more player
  const build = builds(song);
  if (build) for (const [role, at] of Object.entries(BUILD_BAND)) chances[role] = Math.max(chances[role] || 0, at);
  const roles = ROLE_ORDER.filter((role) => {
    let chance = chances[role];
    if (role === 'texture' && !mood.textures.length) chance = 0;
    if (role === 'drone') chance += mood.dark * 0.3;
    if (role === 'drums') chance = mood.kits.length ? Math.max(mood.drums[song.style === 'ambient' ? 0 : 1], build ? BUILD_BAND.drums : 0) : 0;
    // no roll for a guitar in a mood without one, so other moods' seeds kept their songs
    if (role === 'guitar' && !chance) return false;
    return rng.chance(chance);
  });
  // something has to play the chords
  if (!roles.some((role) => role === 'pad' || role === 'keys' || role === 'guitar')) roles.push(rng.pick(['pad', 'keys']));
  // an arp and a counter melody both weave round the melody: together they're clutter
  if (roles.includes('arp') && roles.includes('counter')) roles.splice(roles.indexOf(rng.pick(['arp', 'counter'])), 1);
  for (const role of MIDDLE) if (roles.filter((one) => MIDDLE.includes(one)).length > 2 && roles.includes(role)) roles.splice(roles.indexOf(role), 1);
  // loud, quiet, loud: a second, cleaner guitar for the quiet sections (pickArrangement)
  const twoGuitars = roles.includes('guitar') && !!mood.quiet && rng.chance(mood.loudQuiet || 0);
  // seven at most (six in ambient songs), losing the least needed first. sparse and lush move it (mood.most)
  const most = Math.max(2, Math.min(7, MOST_LAYERS[song.style] + (mood.most || 0) + (build ? 1 : 0))) - (twoGuitars ? 1 : 0);
  // a fight keeps its bass and beat, losing the scenery and the pad first
  const spare = FIGHTS[song.style] ? ['counter', 'arp', 'drone', 'bells', 'keys', 'texture', 'pad'] : ['counter', 'arp', 'drone', 'bells', 'keys', 'bass'];
  for (const role of spare) if (roles.length > most) roles.splice(roles.indexOf(role), roles.includes(role) ? 1 : 0);
  const ids = ROLE_ORDER.filter((one) => roles.includes(one)).map((role) => [role, role]);
  if (twoGuitars) ids.splice(ids.findIndex(([, id]) => id === 'guitar') + 1, 0, ['guitar', 'guitar-2']);
  if (song.style === 'ambient' && roles.includes('texture') && roles.length < most && mood.textures.length > 1 && mood.textures.some((id) => !INSTRUMENTS[id].bed) && rng.chance(SECOND_TEXTURE)) ids.push(['texture', 'texture-2']);
  // one at a time, so each layer can see the ones dressed before it (no two playing the same instrument)
  song.layers = ids.map(([role, id]) => ({ ...clone(LAYER_DEFAULTS), id, role }));
  for (const layer of dressOrder(song.layers)) dressLayer(song, layer, rng, true);
  fitBand(song);
}

// the order a band is dressed in: the score's, but with a guitar the melody and guitars choose first
// (a dream pop song's clean guitars went to its tune and counter melody, leaving the guitar an overdrive)
const dressRank = (layer) => (layer.role === 'melody' ? 0 : layer.role === 'guitar' ? 1 : 2);
const dressOrder = (layers) => (layers.some((layer) => layer.role === 'guitar') ? [...layers].sort((a, b) => dressRank(a) - dressRank(b)) : layers);

// layers behind the melody: a lower harshness cap, darker and quieter, so the tune is what you hear
const BACKING = { counter: true, arp: true, keys: true, guitar: true, pad: true, drone: true, bass: true };
// the harshest instrument a mood allows (edge in synth.js), less for backing layers
const maxEdge = (mood, role) => moodEdge(mood) * (BACKING[role] ? 0.75 : 1);

// an instrument for a layer: from the mood's palette, now and then (surprise, 12%) one from outside it
// in a family that suits the role (WILDCARDS) and from a mood about as dark (kindred), never harsher
// than the mood allows and never one another layer plays. chip and acoustic sounds (world in synth.js)
// never share a song: whichever comes first, usually the melody, sets it
const APART = { chip: 'acoustic', acoustic: 'chip' };
// a mood with no surprises keeps to itself the other way too: its instruments aren't other moods'
// surprises. (its own palette always counts, for a flavoured or fight mood that isn't in MOODS)
const paletteOf = (mood) => [...Object.values(mood.palette).flat(), ...(mood.quiet || [])];
const kindred = (mood) => new Set([...paletteOf(mood), ...Object.values(MOODS).filter((other) => other.surprise !== 0 && Math.abs(other.dark - mood.dark) <= 0.25).flatMap(paletteOf)]);
// recorded instruments sound more alive, so they're picked five to one. it's on what an instrument has,
// not whether its files loaded, so a seed always picks the same band
const preferRecorded = (id) => [id, INSTRUMENTS[id].samples ? 5 : 1];
function pickInstrument(song, layer, rng) {
  const mood = songMood(song);
  const { role } = layer;
  const family = roleFamily(role);
  const anything = Object.keys(INSTRUMENTS).filter((id) => instrumentFits(id, role));
  const others = song.layers.filter((other) => other !== layer && INSTRUMENTS[other.instrument]);
  const worlds = new Set(others.map((other) => INSTRUMENTS[other.instrument].world));
  const belongs = (id) => !APART[INSTRUMENTS[id].world] || !worlds.has(APART[INSTRUMENTS[id].world]);
  if (family !== 'tonal') {
    // (a place's own kit or texture, the death whistle, is only ever where a mood names it)
    const free = anything.filter((id) => !INSTRUMENTS[id].own);
    let pool = family === 'kit' ? mood.kits : mood.textures;
    if (!pool.length) pool = free;
    // a second texture is a different one, and two steady beds (rain and a stream) are one too many
    const textures = others.filter((other) => other.role === 'texture').map((other) => other.instrument);
    let wanted = pool.filter((id) => belongs(id) && !textures.includes(id) && !(INSTRUMENTS[id].bed && textures.some((other) => INSTRUMENTS[other].bed)));
    // a band none of the mood's kits belong with (a chip tune made jazzy) borrows one that does,
    // playing the mood's beats if it can
    if (!wanted.length && family === 'kit') {
      const beats = moodPatterns(song, 'drums');
      const fitting = free.filter(belongs);
      wanted = fitting.filter((id) => INSTRUMENTS[id].suits.some((pattern) => beats.includes(pattern)));
      if (!wanted.length) wanted = fitting;
    }
    return rng.pick(wanted.length ? wanted : pool);
  }
  const cap = maxEdge(mood, role);
  const taken = new Set(others.filter((other) => roleFamily(other.role) === 'tonal').map((other) => other.instrument));
  // no reversed sound on a drone (minutes of swelling, then a sudden stop). a hair over the cap fits:
  // 0.6 x 0.75 is 0.4499... in floating point
  const fits = (id) => INSTRUMENTS[id].edge <= cap + 1e-9 && !taken.has(id) && !(role === 'drone' && INSTRUMENTS[id].reverse) && belongs(id);
  // the second guitar of a loud, quiet, loud song is one of the mood's cleaner ones (quiet)
  const list = (layer.id === 'guitar-2' && mood.quiet) || mood.palette[role] || [];
  const palette = list.filter(fits);
  const kin = kindred(mood);
  // an instrument that's its mood's own (own in synth.js) is never a surprise anywhere else
  const wild = anything.filter((id) => WILDCARDS[role].includes(INSTRUMENTS[id].family) && fits(id) && kin.has(id) && !INSTRUMENTS[id].own);
  if (palette.length && !(wild.length && rng.chance(mood.surprise ?? 0.12))) return rng.weighted(palette.map(preferRecorded));
  if (wild.length) return rng.weighted(wild.map(preferRecorded));
  // nothing fits: the gentlest that belongs, from the mood's list or else the role's kind of instrument
  const gentlest = (ids) => [...ids].sort((a, b) => INSTRUMENTS[a].edge - INSTRUMENTS[b].edge)[0];
  return gentlest(list.filter((id) => belongs(id) && !taken.has(id))) || gentlest(list)
    || gentlest(anything.filter((id) => WILDCARDS[role].includes(INSTRUMENTS[id].family) && !taken.has(id))) || gentlest(anything);
}

// a layer's instrument, pattern, tone and mix. fresh: a new layer, so it gets a seed and pattern too
function dressLayer(song, layer, rng, fresh) {
  const mood = songMood(song);
  const { role } = layer;
  const before = INSTRUMENTS[layer.instrument];
  layer.instrument = pickInstrument(song, layer, rng);
  const instrument = INSTRUMENTS[layer.instrument];
  // doublers were picked for the old instrument (a choir's voices on a flute would be odd)
  if (before !== instrument) delete layer.with;
  const edge = instrument.edge || 0;
  // struck and plucked things get no vibrato and hardly any detune: they just sound out of tune
  const struck = instrument.family === 'keys' || instrument.family === 'guitar' || instrument.family === 'bell' || instrument.family === 'bass';
  if (fresh) {
    layer.seed = newToken(rng);
    layer.pattern = rng.pick(moodPatterns(song, role));
    layer.rate = mood.energy > 0.75 ? rng.pick(['medium', 'fast', 'fast']) : mood.energy < 0.35 ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'fast']);
    layer.span = rng.pick([1, 2, 2]);
    layer.octave = role === 'bells' ? rng.weighted([[0, 5], [1, 1], [-1, 1]]) : role === 'melody' ? rng.weighted([[0, 6], [-1, 1]]) : 0;
  }
  // a singer (home) sings where they sang, and an instrument with its own octave (a cello) plays there.
  // swapped for one without, the part comes back to its usual place
  if (instrument.home) layer.octave = 0;
  else if (instrument.octave !== undefined) layer.octave = instrument.octave;
  else if (before?.octave !== undefined) layer.octave = 0;
  const busy = song.style !== 'ambient' ? 0.35 + mood.energy * 0.5 : 0.3 + mood.energy * 0.5;
  // (a modifier can make every part busier or sparser: mood.busy)
  layer.density = clamp01(busy + (mood.busy || 0) + rng.range(-0.15, 0.2));
  // drums follow the mood's energy, and a buried tune (shoegaze's singer) sits lower
  const volumes = { melody: 0.68 * (1 - (mood.bury || 0) * 0.2), counter: 0.5, arp: 0.42, bells: 0.45, keys: 0.52, guitar: 0.62, pad: 0.55, drone: 0.48, bass: 0.68, drums: 0.42 + mood.energy * 0.24, texture: 0.5 };
  // harsher backing sits lower, but not a guitar: its cabinet already took the harshness off
  layer.volume = clamp01((volumes[role] + rng.range(-0.06, 0.06)) * (BACKING[role] && role !== 'guitar' ? 1 - edge * 0.25 : 1));
  // a guitar's rig already spreads it, so it stays near the middle
  const centred = role === 'bass' || role === 'drums' || role === 'drone';
  layer.pan = centred ? 0 : Math.round(rng.range(-0.45, 0.45) * (role === 'guitar' ? 0.4 : 1) * 100) / 100;
  // drums and bass stay dry: a big room smears the beat, and an echo adds hits off the groove
  const wet = { melody: 0.65, counter: 0.7, arp: 0.7, bells: 1.1, keys: 0.75, guitar: 0.45, pad: 1, drone: 0.9, bass: 0.15, drums: 0.15, texture: 0.6 };
  layer.reverb = clamp01(mood.space * wet[role] * rng.range(0.75, 1.15));
  const echoes = { melody: 0.4, counter: 0.3, arp: 0.5, bells: 0.6, keys: 0.25, guitar: 0.15 };
  layer.echo = clamp01((echoes[role] || 0) * mood.space * rng.range(0.4, 1.3));
  // in a tune, chords arrive on the beat, so pads swell in and let go quicker (not plucked strings,
  // whose ring cut short ended harshly)
  const chordy = song.style !== 'ambient' && (role === 'pad' || role === 'keys' || role === 'drone') && instrument.kind !== 'pluck';
  // brightness near the mood's, darker for backing, and a harsh instrument never brighter than made
  // (edge 1 stays at 1x, a soft one can go to 1.6x). drums and textures are capped by energy instead
  const bright = 2 ** (rng.range(-0.35, 0.35) + (mood.bright - 0.5) * 0.8) * (BACKING[role] ? 0.85 : 1);
  const ceiling = role === 'drums' ? 0.75 + mood.energy * 0.35 : role === 'texture' ? 0.9 : 1 + (1 - edge) * 0.6;
  // drums ring as long as their kit says, whatever the room. chords in tunes let go a little quicker
  // (at 0.55 they stopped dead, which sounded like midi)
  const release = rng.range(0.7, 1.6) * (0.7 + mood.space * 0.5) * (chordy ? 0.8 : 1);
  layer.tone = {
    // (calm, slow and dreamy soften every attack: mood.soft)
    attack: rng.range(0.6, 1.6) * (mood.energy > 0.7 ? 0.7 : 1) * (chordy ? 0.4 : 1) * (mood.soft || 1),
    release: role === 'drums' ? Math.min(1.1, release) : release,
    bright: Math.min(bright, ceiling),
    detune: struck ? mood.dark * rng.range(0, 4) + rng.range(0, 1.5) : mood.dark * rng.range(0, 20) + rng.range(0, 4),
    vibrato: !struck && rng.chance(0.35) ? rng.range(2, 10) : 0,
  };
  pickRecording(song, layer);
}

// which of its instrument's recordings a layer plays (more in synth.js), so two parts aren't the same
// guitar: its own random numbers (seed and instrument), never one another layer or doubler plays, and
// the weaker recordings less often (weight)
const folderOf = (id, choice) => {
  const inst = INSTRUMENTS[id];
  return inst?.samples && (inst.more?.[choice] ? choice : inst.samples);
};
function pickRecording(song, layer) {
  const inst = INSTRUMENTS[layer.instrument];
  delete layer.recording;
  if (!inst?.more) return;
  const taken = new Set(song.layers.filter((other) => other !== layer).flatMap((other) => [folderOf(other.instrument, other.recording), ...(other.with || []).map((one) => folderOf(one.instrument, one.recording))]));
  const all = [[inst.samples, inst.sampled?.weight ?? 1], ...Object.entries(inst.more).map(([folder, settings]) => [folder, settings.weight ?? 1])];
  const free = all.filter(([folder]) => !taken.has(folder));
  const folder = makeRng(layer.seed, layer.instrument, 'recording').weighted(free.length ? free : all);
  if (folder !== inst.samples) layer.recording = folder;
}
// picked again once the whole band's chosen, so a pad dressed first can't take the drone's only organ
const pickRecordings = (song) => song.layers.forEach((layer) => pickRecording(song, layer));

// rules for parts that belong together, run whenever the band's picked (README, "Parts"):
//   - with an arp, keys strum and pads hold: two layers doing one job tangle
//   - a counter melody "in harmony" with no melody answers instead
//   - backing sits at least 0.1 under the melody's volume, and textures well under it
//   - a kit plays only patterns it suits (suits in synth.js)
//   - running notes no faster than six a second (MAX_RATE)
const MAX_RATE = 6;
function fitBand(song) {
  const find = (role) => song.layers.find((layer) => layer.role === role);
  const arp = find('arp');
  const melody = find('melody');
  const busyKeys = song.layers.some((layer) => layer.role === 'keys' && (layer.pattern === 'broken' || layer.pattern === 'waltz'));
  const textures = song.layers.filter((layer) => layer.role === 'texture').length;
  // how far under the tune backing sits: 0.1, less for a mood that buries its tune (shoegaze)
  const gap = 0.1 * (1 - (songMood(song).bury || 0));
  for (const layer of song.layers) {
    // (comping, bossa and a skank are a few chords a bar, not running notes, so they stay)
    if (arp && layer.role === 'keys' && !['comp', 'bossa', 'skank'].includes(layer.pattern)) layer.pattern = 'strum';
    // a plucked drone (the tanpura) can't hold a section, so it's plucked round and round
    if (layer.role === 'drone' && INSTRUMENTS[layer.instrument]?.kind === 'pluck') layer.pattern = 'cycle';
    if ((arp || busyKeys) && layer.role === 'pad' && (layer.pattern === 'pulse' || layer.pattern === 'stabs')) layer.pattern = 'sustain';
    while (usesRate(layer) && layer.rate !== 'slow' && song.tempo / 60 / rateStep(layer.rate, METERS[song.meter].sub) > MAX_RATE) layer.rate = layer.rate === 'fast' ? 'medium' : 'slow';
    if (!melody && layer.role === 'counter' && layer.pattern === 'harmony') layer.pattern = 'answer';
    // (not a layer taking the tune: half the time it's the tune)
    if (melody && BACKING[layer.role] && layer.role !== 'bass' && !carries(layer)) layer.volume = Math.min(layer.volume, Math.max(0.2, melody.volume - gap));
    const suits = layer.role === 'drums' && INSTRUMENTS[layer.instrument]?.suits;
    if (suits && !suits.includes(layer.pattern)) {
      // a fight falls back on any fight's beat the kit can play before the kit's own first
      const wanted = [...moodPatterns(song, 'drums'), ...(FIGHTS[song.style] ? STYLE_PATTERNS.boss.drums : [])];
      layer.pattern = wanted.find((pattern) => suits.includes(pattern)) || suits[0];
    }
    if (layer.role === 'texture') layer.volume = Math.min(layer.volume, (melody ? melody.volume * 0.55 : 0.42) * (textures > 1 ? 0.85 : 1));
  }
  spread(song);
}

// where the band stands: the tune in the middle and the parts that fill in on opposite sides of it,
// starting on a side from the seed. at random they could all end up on one side, on top of each other.
// (not pads, already wide, or textures, which place each sound themselves)
const SIDES = ['keys', 'counter', 'arp', 'guitar', 'bells'];
function spread(song) {
  let side = hashText(song.seed) % 2 ? 1 : -1;
  const melody = song.layers.find((layer) => layer.role === 'melody');
  if (melody) melody.pan = Math.max(-0.12, Math.min(0.12, melody.pan));
  for (const role of SIDES) {
    for (const layer of song.layers.filter((one) => one.role === role)) {
      // (a guitar's rig already spreads it, and two guitars take turns, so they stay near the middle)
      const far = Math.max(role === 'guitar' ? 0.05 : 0.2, Math.abs(layer.pan));
      layer.pan = Math.round(side * far * 100) / 100;
      side = -side;
    }
  }
}

// how many bars a part's progression takes to go round once
function partBars(song, part) {
  const turns = parseProgression(song.parts[part]).slots.reduce((sum, slot) => sum + slot.slots, 0) || 1;
  return turns * song.chordBars;
}

// loud, quiet, loud: with two guitars, the cleaner plays the quiet sections and the dirtier the loud
// ones (energy LOUD or more, or the song's loudest)
const LOUD = 0.85;
// a mood's drama stretches a section's energy away from 0.65 (at 1.5: 0.3 to 0.13, 0.85 to 0.95)
const stretch = (energy, drama) => Math.round(Math.min(1, Math.max(0.1, 0.65 + (energy - 0.65) * drama)) * 100) / 100;
function pickArrangement(song, rng) {
  if (weaves(song)) return weaveArrangement(song, rng);
  const mood = songMood(song);
  const build = builds(song);
  const form = rng.pick((build && BUILDS[song.style]) || (song.style === 'tune' && mood.forms) || FORMS[song.style]).map(([name, part, bars, energy, lifted]) => [name, part, bars, mood.drama ? stretch(energy, mood.drama) : energy, lifted]);
  // a key change (LIFTED) is a whole step, or a half step a third of the time, on its own random numbers
  const lift = form.some(([, , , , lifted]) => lifted) ? (makeRng(song.seed, song.mood, song.style, 'lift').chance(0.65) ? 2 : 1) : 0;
  const entry = {};
  for (const layer of song.layers) entry[layer.id] = rng.range(...ROLE_ENTRY[layer.role]);
  // the song opens on its mood's openers (OPENING of them, one in a build) and they play all the way,
  // so the intro already sounds like the song
  const lowest = Math.min(...form.map(([, , , energy]) => energy));
  const wanted = mood.opens.map((role) => song.layers.find((layer) => layer.role === role)).filter(Boolean);
  const anyone = song.layers.filter((layer) => OPENERS.includes(layer.role));
  const openers = [...new Set([...wanted, ...anyone])].slice(0, build ? 1 : OPENING[song.style]);
  for (const layer of openers) entry[layer.id] = Math.min(entry[layer.id], lowest);
  // in a build the players come in one at a time, spread evenly up to BUILD_TOP, the tune by the middle
  // of the climb. scenery's there from the start
  if (build) {
    const band = song.layers.filter((layer) => layer.role !== 'texture' && !openers.includes(layer)).sort((a, b) => entry[a.id] - entry[b.id]);
    const from = lowest + 0.05;
    band.forEach((layer, i) => { entry[layer.id] = from + ((i + 1) / band.length) * (BUILD_TOP - from); });
    for (const layer of band) if (layer.role === 'melody') entry[layer.id] = Math.min(entry[layer.id], 0.55);
  }
  let before = [];
  song.sections = form.map(([name, part, fourFourBars, energy, lifted]) => {
    const bars = sectionBars(song, part, fourFourBars);
    // a layer plays once the energy reaches its entry point, and stays through small dips: it only drops
    // out for a real change of gear, like a break or the outro
    let play = song.layers.filter((layer) => entry[layer.id] <= energy || (before.includes(layer.id) && entry[layer.id] <= energy + 0.2)).map((layer) => layer.id);
    if (!play.length) play = [song.layers.find((layer) => layer.role === 'pad' || layer.role === 'keys' || layer.role === 'drone')?.id || song.layers[0]?.id].filter(Boolean);
    before = play;
    // energy: how hard the section's played (feel), so a quiet intro is softer than the chorus
    return { name, part, bars, play, energy, ...(lifted ? { lift } : {}) };
  });
  const guitars = song.layers.filter((layer) => layer.role === 'guitar');
  if (guitars.length === 2) {
    const [quiet, loud] = [...guitars].sort((a, b) => INSTRUMENTS[a.instrument].edge - INSTRUMENTS[b.instrument].edge);
    const top = Math.max(...form.map(([, , , energy]) => energy));
    song.sections.forEach((section, i) => {
      section.play = section.play.filter((id) => id !== quiet.id && id !== loud.id);
      section.play.push(form[i][3] >= Math.min(LOUD, top) ? loud.id : quiet.id);
    });
  }
  addSolo(song, rng, form);
  // (and if someone takes or doubles the tune, it's handed round again for the new sections)
  passTune(song);
  addPrelude(song, mood);
}
// the forms are in 4/4 bars, so shorter bars (6/8 is two beats) get more of them, in whole turns of the
// part's progression near the bars asked for (a much longer one is cut short)
function sectionBars(song, part, fourFourBars) {
  const target = Math.max(2, Math.round((fourFourBars * 4) / METERS[song.meter].beats));
  const turn = partBars(song, part);
  return Math.max(1, Math.min(32, Math.round(turn > target * 1.5 ? target : Math.max(1, Math.round(target / turn)) * turn)));
}
// a mood with a prelude opens on its scenery alone, then the music swells in. never in a loop
function addPrelude(song, mood) {
  const scenery = song.layers.filter((layer) => layer.role === 'texture').map((layer) => layer.id);
  if (mood.prelude && !LOOPS[song.style] && scenery.length) {
    song.sections.unshift({ name: mood.prelude, part: song.sections[0].part, bars: Math.max(2, Math.round(24 / METERS[song.meter].beats)), play: scenery, energy: 0.2 });
  }
}

// a weave's players (see "weaving"): a counter melody for the second theme and bells to carry the tune
// in the trio and double it at the climax, joining if the band hasn't got them. an arp goes (with a
// counter melody it's clutter: the keys keep time instead), and a band that's grown too big lets its
// drone and scenery go (WEAVE_BAND)
function pickWeave(song, rng) {
  if (!weaves(song) || !song.layers.some((layer) => layer.role === 'melody')) return;
  for (const [role, pattern] of [['counter', 'counterpoint'], ['bells', 'double']]) {
    const layer = song.layers.find((one) => one.role === role) || addLayer(song, role, rng);
    layer.pattern = pattern;
    // (the composer puts doubling bells an octave over the tune whatever their own octave)
    if (role === 'bells') layer.octave = 0;
  }
  song.layers = song.layers.filter((layer) => layer.role !== 'arp');
  for (const role of ['drone', 'texture']) if (song.layers.length > WEAVE_BAND) song.layers = song.layers.filter((layer) => layer.role !== role);
  fitBand(song);
}

// a weave's sections: the form's, with its themes where it says (WEAVERS) and the band in by energy as
// in any song, the mood's openers from the first bar
function weaveArrangement(song, rng) {
  const mood = songMood(song);
  const form = rng.pick(WEAVES[song.style]).map(([name, part, bars, energy, who, lifted]) => [name, part, bars, mood.drama ? stretch(energy, mood.drama) : energy, who, lifted]);
  const lift = form.some((section) => section[5]) ? (makeRng(song.seed, song.mood, song.style, 'lift').chance(0.65) ? 2 : 1) : 0;
  const themes = {
    melody: song.layers.find((layer) => layer.role === 'melody'),
    counter: song.layers.find((layer) => layer.role === 'counter'),
    bells: song.layers.find((layer) => layer.role === 'bells' && carries(layer)),
  };
  const band = song.layers.filter((layer) => !Object.values(themes).includes(layer));
  const entry = {};
  for (const layer of band) entry[layer.id] = rng.range(...ROLE_ENTRY[layer.role]);
  const lowest = Math.min(...form.map(([, , , energy]) => energy));
  // (as many as any song of its style opens on, OPENING, the mood's own openers first)
  const wanted = mood.opens.map((role) => band.find((layer) => layer.role === role)).filter(Boolean);
  const openers = [...new Set([...wanted, ...band.filter((layer) => OPENERS.includes(layer.role))])].slice(0, OPENING[song.style]);
  for (const layer of openers) entry[layer.id] = lowest;
  let before = [];
  song.sections = form.map(([name, part, fourFourBars, energy, who, lifted]) => {
    const backing = band.filter((layer) => (WEAVE_FULL[who] ? !(who === 'trio' && layer.role === 'drums') : entry[layer.id] <= energy || (before.includes(layer.id) && entry[layer.id] <= energy + 0.2)));
    const play = [...backing, ...WEAVERS[who].map((role) => themes[role]).filter(Boolean)].map((layer) => layer.id);
    before = play;
    return { name, part, bars: sectionBars(song, part, fourFourBars), play, energy, ...(lifted ? { lift } : {}) };
  });
  addPrelude(song, mood);
}

// a solo (solo(), section.lead): a long line that doesn't repeat, over the theme's chords just before
// its last return. sometimes the counter melody takes it while the melody rests, and the bells and
// counter melody sit it out. a rock mood says how often (solo) and solos over its chorus (soloOver)
const SOLO_CHANCE = { tune: 0.6, ambient: 0.35, boss: 0.75, mini: 0.25, loop: 0.15, final: 0.85, cutscene: 0 };
function addSolo(song, rng, form) {
  const mood = songMood(song);
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const chance = song.style === 'tune' && mood.solo !== undefined ? mood.solo : SOLO_CHANCE[song.style];
  // (a song that builds has no solo: it'd stop the climb for a section)
  if (!melody || song.sections.length < 4 || builds(song) || !rng.chance(chance)) return;
  // the theme's last full time round (a fight's: its second theme), never the very start
  const part = (song.style !== 'ambient' && mood.soloOver) || 'A';
  let at = -1;
  for (let i = 2; i < song.sections.length; i++) if (song.sections[i].part === part && form[i][2] >= 8 && song.sections[i].play.includes(melody.id)) at = i;
  if (at < 0) return;
  const counter = song.layers.find((layer) => layer.role === 'counter');
  const lead = counter && rng.chance(0.4) ? counter : melody;
  const theme = song.sections[at];
  const play = theme.play.filter((id) => id !== melody.id && !['bells', 'counter'].includes(song.layers.find((layer) => layer.id === id).role));
  // (in the key of the section it's before: a final boss's solo in its second phase stays up there)
  song.sections.splice(at, 0, { name: song.style !== 'ambient' ? 'Solo' : 'Wander', part: theme.part, bars: theme.bars, play: [...play, lead.id], lead: lead.id, energy: theme.energy, ...(theme.lift ? { lift: theme.lift } : {}) });
}

// ---------- orchestration: the tune handed round ----------
//
// game themes (wizard101's, zelda's, toby fox's) pass the tune round a band, so it comes back in a new
// colour each time, which is how a loop stays listenable for an hour. so a layer can play the melody's
// own line instead of a part of its own (carries):
//   - takes the tune (a counter melody's pattern): the melody's line for that section on its own
//     instrument, an octave down if it's set lower. it and the melody take turns (passTune)
//   - doubles the tune (a bells pattern): the line an octave up, where the tune comes round biggest
// it's its own pick (pickOrchestra, own random numbers), so a mood without orchestra chances is as it was

// who carries the tune in each section: the melody, the other player, the melody... and both the last
// time the theme comes round (never a part C break). the doubling plays in the loudest sections and
// that last time. worked out from the sections, not dice, so a new arrangement hands it round the same way
function passTune(song) {
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const taker = song.layers.find((layer) => layer.role === 'counter' && carries(layer));
  const doubler = song.layers.find((layer) => layer.role === 'bells' && carries(layer));
  if (!melody || (!taker && !doubler)) return;
  const set = (section, layer, on) => {
    section.play = section.play.filter((id) => id !== layer.id);
    if (on) section.play.push(layer.id);
  };
  const sung = song.sections.filter((section) => !section.lead && (section.play.includes(melody.id) || (taker && section.play.includes(taker.id))));
  const build = builds(song);
  const energy = (section) => section.energy ?? 0.75;
  const top = Math.max(...sung.map(energy));
  const themes = sung.filter((section) => section.part !== 'C');
  const big = sung.indexOf(themes[themes.length - 1] || sung[sung.length - 1]);
  sung.forEach((section, i) => {
    // (a two section loop hands it over and back. a song that builds always ends on everyone together)
    const together = i === big && (sung.length >= 3 || build);
    if (taker) {
      set(section, melody, together || i % 2 === 0);
      set(section, taker, together || i % 2 === 1);
    }
    if (doubler) set(section, doubler, together || energy(section) >= top - 0.05);
  });
  // nobody carries the tune where there isn't one
  for (const section of song.sections) {
    if (sung.includes(section)) continue;
    if (doubler) set(section, doubler, false);
    if (taker && section.lead !== taker.id) set(section, taker, false);
  }
}

// a new player in the band, in its place in the score, dressed
function addLayer(song, role, rng) {
  let id = role;
  for (let n = 2; song.layers.some((one) => one.id === id); n++) id = `${role}-${n}`;
  const layer = { ...clone(LAYER_DEFAULTS), id, role };
  const at = song.layers.findIndex((one) => ROLE_ORDER.indexOf(one.role) > ROLE_ORDER.indexOf(role));
  song.layers.splice(at < 0 ? song.layers.length : at, 0, layer);
  dressLayer(song, layer, rng, true);
  return layer;
}

// whether the tune's handed round (pass) and doubled (double), from the mood's chances or the Orchestra
// remix's. a counter melody or bells already in the band take the job (keeping a real second melody if
// there's room for another player), or a new layer joins if the style has room
function pickOrchestra(song, rng, chances = songMood(song).orchestra) {
  const melody = song.layers.find((layer) => layer.role === 'melody');
  if (!chances || !melody) return;
  // (both rolled before anything's dressed, so whether it doubles never depends on whether it passed)
  const passing = rng.chance(chances.pass || 0);
  const doubling = rng.chance(chances.double || 0);
  const mood = songMood(song);
  const room = () => song.layers.length < Math.max(2, Math.min(7, MOST_LAYERS[song.style] + (mood.most || 0)));
  const join = (role, pattern, keep) => {
    const own = song.layers.find((layer) => layer.role === role && !carries(layer));
    let layer = own && !(keep.includes(own.pattern) && room()) ? own : null;
    if (!layer) {
      if (!room()) return null;
      layer = addLayer(song, role, rng);
      // a new player comes in where the melody does, and passTune sorts out the rest
      for (const section of song.sections) if (section.play.includes(melody.id) && !section.lead) section.play.push(layer.id);
    }
    layer.pattern = pattern;
    return layer;
  };
  const sung = song.sections.filter((section) => !section.lead && section.play.includes(melody.id)).length;
  if (passing && sung >= 2) {
    const taker = join('counter', 'tune', ['counterpoint']);
    if (taker) {
      // it carries the tune alone half the time, so it's nearly as loud as the melody. a bass instrument
      // (a bassoon) takes it an octave down, anything else now and then
      taker.volume = Math.max(0.2, melody.volume - 0.03);
      taker.octave = INSTRUMENTS[taker.instrument].family === 'bass' || rng.chance(0.25) ? -1 : 0;
    }
  }
  if (doubling) {
    const bells = join('bells', 'double', []);
    // an octave over the tune whatever its own octave was (the composer puts it there)
    if (bells) bells.octave = 0;
  }
  fitBand(song);
  passTune(song);
}

// ---------- doubling ----------
//
// a tune on one recording is one player, and a choir singing it sounded thin and fake. arrangers double
// a tune instead (a flute with the violins, a piano with itself an octave up, a choir in sections), so a
// layer's with is the instruments doubling it (synth.js plays them in its channel, a few cents and
// milliseconds apart). a choir on the tune always gets two more voices on every note; anything else
// gets a partner now and then (DOUBLE_CHANCE), only where the song is loud (DOUBLE_ENERGY). only
// recorded instruments double: a doubled synth was the problem.
// [instrument, octaves from the tune]
const DOUBLES = {
  'choir-oo': [['choir-ah', 0], ['chant-voice', -1], ['soprano', 0], ['strings', 0]],
  'choir-ah': [['choir-oo', 0], ['chant-voice', -1], ['soprano', 0], ['strings', 0]],
  'dream-voice': [['choir-oo', 0], ['vox-pad', 0]],
  soprano: [['choir-oo', 0], ['choir-ah', 0], ['strings', 0]],
  'chant-voice': [['choir-ah', 1], ['cello', 0], ['organ', 0]],
  humming: [['choir-oo', 0], ['cello', 0]],
  flute: [['violin', 0], ['clarinet', -1], ['oboe', 0], ['glock', 1]],
  violin: [['flute', 0], ['cello', -1], ['oboe', 0], ['strings', 0]],
  cello: [['violin', 1], ['horn', 0], ['bassoon', 0]],
  horn: [['cello', 0], ['trombone', 0], ['strings', 0]],
  trumpet: [['alto-sax', 0], ['trombone', -1], ['horn', 0]],
  trombone: [['horn', 0], ['tenor-sax', 0]],
  'alto-sax': [['trumpet', 0], ['tenor-sax', -1], ['mute-trumpet', 0]],
  'tenor-sax': [['trombone', 0], ['alto-sax', 1]],
  clarinet: [['flute', 1], ['oboe', 0], ['bassoon', -1]],
  oboe: [['flute', 0], ['clarinet', 0]],
  whistle: [['flute', 0], ['violin', 0]],
  'pan-flute': [['flute', 0], ['ocarina', 0]],
  ocarina: [['flute', 0], ['pan-flute', 0]],
  accordion: [['violin', 0], ['clarinet', 0]],
  piano: [['piano', 1], ['celesta', 1], ['strings', 0], ['vibes', 0]],
  'felt-keys': [['felt-keys', 1], ['bowed-vibes', 0], ['strings', 0]],
  'e-piano': [['vibes', 0], ['glock', 1]],
  'music-box': [['celesta', 0], ['harp', 0]],
  celesta: [['glock', 0], ['harp', 0]],
  marimba: [['xylophone', 1], ['vibes', 0]],
  vibes: [['e-piano', 0], ['glock', 1]],
  nylon: [['harp', 0], ['flute', 0]],
  erhu: [['violin', 0]],
  shakuhachi: [['flute', 0]],
  piccolo: [['flute', -1], ['violin', -1], ['glock', 0]],
};
const CHOIRS = { 'choir-oo': true, 'choir-ah': true, soprano: true, 'chant-voice': true, 'dream-voice': true };
const DOUBLE_CHANCE = { ambient: 0.25, tune: 0.4, loop: 0.3, mini: 0.35, boss: 0.45, final: 0.6, cutscene: 0.6 };
const DOUBLE_ENERGY = 0.7;
// a song that builds doubles more often, and only at the very top (builds)
const BUILD_DOUBLE_CHANCE = 0.8;
const BUILD_DOUBLE_ENERGY = 0.95;
// on its own random numbers, so everything picked before stays as it was
function pickDoubles(song, rng) {
  const mood = songMood(song);
  const build = builds(song);
  for (const layer of song.layers) {
    if (layer.role !== 'melody' || layer.hand) continue;
    const choir = !!CHOIRS[layer.instrument];
    const others = new Set(song.layers.filter((other) => other !== layer).map((other) => other.instrument));
    const worlds = new Set(song.layers.map((other) => INSTRUMENTS[other.instrument]?.world));
    const partners = (DOUBLES[layer.instrument] || []).filter(([id]) => {
      const inst = INSTRUMENTS[id];
      return inst?.samples && !others.has(id) && inst.edge <= maxEdge(mood, 'melody') + 1e-9 && !(APART[inst.world] && worlds.has(APART[inst.world]));
    });
    if (!partners.length || !rng.chance(choir ? 0.9 : build ? Math.max(BUILD_DOUBLE_CHANCE, mood.double ?? DOUBLE_CHANCE[song.style]) : mood.double ?? DOUBLE_CHANCE[song.style])) continue;
    const picked = [];
    for (let n = choir ? 2 : 1; n > 0 && partners.length; n--) picked.push(...partners.splice(Math.floor(rng.next() * partners.length), 1));
    layer.with = picked.map(([instrument, octave]) => ({ instrument, ...(octave ? { octave } : {}) }));
  }
}
// where a layer's doublers play (note.double): a choir's everywhere, anything else in the loud
// sections, unless the page says otherwise (layer.doubleAll)
function markDoubles(layer, notes, sections, from = DOUBLE_ENERGY) {
  if (!layer.with) return;
  const everywhere = layer.doubleAll ?? !!CHOIRS[layer.instrument];
  for (const note of notes) {
    const section = sections.find((one) => note.t >= one.start - 1e-6 && note.t < one.end - 1e-6);
    if (everywhere || (section?.energy ?? 0.75) >= from) note.double = true;
  }
}

// ---------- the sustain pedal ----------
//
// a pianist plays with the sustain pedal down, notes ringing into each other until the chord changes:
// a lot of c418's soft, blurred sound. so in a mood with pedal, a piano note (pedal on the instrument)
// rings until its chord changes, a bar or two seconds at most. a note struck again still stops the last
// (restrikes in synth.js), hand drawn notes are left as drawn, and a ringing note stops where a part
// moves a semitone from it: listening kept parts off the tune's semitones, and a pedal mustn't undo that
function pedal(song, sections, parts) {
  if (!songMood(song).pedal) return;
  const bar = METERS[song.meter].beats;
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const tune = melody ? parts[melody.id] || [] : [];
  for (const layer of song.layers) {
    if (!INSTRUMENTS[layer.instrument]?.pedal) continue;
    // (the tune's own ringing notes stop for any part, since everyone else listened to them as written)
    const against = layer === melody ? song.layers.flatMap((other) => (roleFamily(other.role) === 'tonal' ? parts[other.id] || [] : [])) : [...tune, ...(parts[layer.id] || [])];
    for (const note of parts[layer.id] || []) {
      if (note.added) continue;
      const section = sections.find((one) => note.t >= one.start - 1e-6 && note.t < one.end - 1e-6);
      const chord = section?.chords.find((one) => note.t >= one.t - 1e-6 && note.t < one.t + one.dur - 1e-6);
      if (!chord) continue;
      // (two seconds at most: by then a note is 20 db down, and a fast arp ringing a slow bar was
      // dozens of voices)
      let until = Math.min(chord.t + chord.dur, note.t + bar, note.t + (2 * song.tempo) / 60, section.end);
      // (a short note listening let rub isn't held at all: held, it's a clash)
      for (const other of against) {
        if (other === note || !rubs(other.midi, note.midi) || other.t >= until || other.t + other.dur <= note.t + 1e-6) continue;
        until = Math.min(until, other.t > note.t + note.dur - 1e-6 ? other.t : note.t + note.dur);
      }
      // (lifted: the length it was written, where the finger lifts, which the checks judge it by)
      if (until > note.t + note.dur) Object.assign(note, { lifted: note.dur, dur: until - note.t });
    }
  }
}

// ---------- a fuller ambient song ----------
//
// ambient songs were thin (half had no tune), so once the band's picked, an ambient song with no tune
// usually gets a lone line that comes and goes, the way c418's and aphex twin's have a few notes
// drifting over the pads, and one with no scenery gets some. its own random numbers, so everything
// picked before stays as it was
const LONE_TUNE = 0.7;
const MORE_SCENERY = 0.8;
function pickScenery(song, rng) {
  if (song.style !== 'ambient') return;
  const mood = songMood(song);
  // (scenery doesn't count towards the most layers: that's to keep the band from crowding)
  const room = () => song.layers.filter((layer) => layer.role !== 'texture').length < Math.max(2, Math.min(7, MOST_LAYERS.ambient + (mood.most || 0)));
  // (both rolled first, so whether it gets scenery never depends on whether it got a tune)
  const tune = rng.chance(LONE_TUNE);
  const scenery = rng.chance(MORE_SCENERY);
  const has = (role) => song.layers.some((layer) => layer.role === role);
  // a new player comes in once the song's past its quiet start (from energy), and stays in
  const join = (role, from) => {
    const layer = { ...clone(LAYER_DEFAULTS), id: role, role };
    const at = song.layers.findIndex((one) => ROLE_ORDER.indexOf(one.role) > ROLE_ORDER.indexOf(role));
    song.layers.splice(at < 0 ? song.layers.length : at, 0, layer);
    dressLayer(song, layer, rng, true);
    let before = false;
    for (const section of song.sections) {
      const energy = section.energy ?? 0.75;
      before = section.play.length > 0 && (energy >= from || (before && energy >= from - 0.2));
      if (before) section.play.push(role);
    }
    // a quiet song still hears it in its loudest section
    if (!song.sections.some((section) => section.play.includes(role))) [...song.sections].sort((a, b) => (b.energy ?? 0.75) - (a.energy ?? 0.75))[0].play.push(role);
  };
  if (tune && room() && !has('melody') && mood.palette.melody?.length && mood.layers?.melody !== 0) join('melody', 0.5);
  if (scenery && room() && !has('texture') && mood.textures.length) join('texture', 0);
  fitBand(song);
}

function pickSpace(song, rng) {
  const mood = songMood(song);
  const bias = mood.fx || {};
  song.fx = {
    reverb: clamp01(mood.space * rng.range(0.55, 0.95)),
    size: clamp01(mood.space * rng.range(0.6, 1.15)),
    tone: clamp01(mood.bright * rng.range(0.6, 1.3)),
    // (fx.echo: a mood that lives in its echoes, the cocteau twins or dub)
    echo: clamp01(rng.range(0.1, 0.45) * (0.4 + mood.space * 0.6) + (bias.echo || 0)),
    echoTime: rng.pick(ECHO_TIMES),
    echoRepeats: rng.range(0.2, 0.55),
    warmth: clamp01((1 - mood.bright) * rng.range(0.2, 0.7)),
    wobble: clamp01((bias.wobble || 0) * rng.range(0.6, 1.3) + (rng.chance(0.25) ? rng.range(0, 0.25) : 0)),
    drive: clamp01((bias.drive || 0) * rng.range(0.6, 1.3) + rng.range(0, 0.12)),
    volume: 0.8,
  };
}

// little random nudges to everything that's a number, plus the odd new seed or pattern
function mutateSong(song, rng) {
  const nudge = (value, amount) => clamp01(value + rng.range(-amount, amount));
  song.tempo = Math.round(song.tempo * rng.range(0.93, 1.07));
  song.colour = nudge(song.colour, 0.15);
  song.humanise = nudge(song.humanise, 0.1);
  for (const layer of song.layers) {
    if (rng.chance(0.3)) layer.seed = newToken(rng);
    // only the mood's patterns (no tribal beat in a cozy song), and never a layer carrying the tune
    if (rng.chance(0.2) && !carries(layer)) layer.pattern = rng.pick(moodPatterns(song, layer.role));
    layer.density = nudge(layer.density, 0.15);
    layer.volume = nudge(layer.volume, 0.06);
    layer.reverb = nudge(layer.reverb, 0.1);
    layer.tone.bright = Math.min(4, Math.max(0.25, layer.tone.bright * rng.range(0.8, 1.25)));
    layer.tone.attack = Math.min(4, Math.max(0.1, layer.tone.attack * rng.range(0.8, 1.25)));
  }
  for (const key of ['reverb', 'size', 'tone', 'echo', 'warmth']) song.fx[key] = nudge(song.fx[key], 0.08);
  fitBand(song);
}

// ---------- saved songs keep their composer ----------
//
// notes are written from the settings every time a song plays, so changing how this file writes them
// would change every saved song. a song remembers the composer that made it (song.composer, none being
// the first), and composeSong hands an older one to it, kept unchanged in kept/ (KEPT_COMPOSERS, loaded
// by the page). a change that makes saved songs sound different keeps music.js as it was first (README,
// "Adding things"). unstamped songs could be 1 or 1.5 (the morning of 22 october): they play as 1, the
// page marks ones saved after 1.5 as its (markMorningSongs), and the Song tab picks by hand.
// every composer there's been, oldest first: the last is today's
const COMPOSER_VERSIONS = [1, 1.5, 2, 3];
const COMPOSER = COMPOSER_VERSIONS[COMPOSER_VERSIONS.length - 1];

// ---------- cleaning ----------

// every song, made here or from a file or link, goes through this: anything missing is filled in and
// anything that isn't a setting thrown out, so a broken file can't break the page. keys that only some
// songs have are only there when they're set, so older songs save as they always did
function cleanSong(data) {
  const d = data && typeof data === 'object' ? data : {};
  const num = (value, low, high, fallback) => (Number.isFinite(+value) && value !== null && value !== '' ? Math.min(high, Math.max(low, +value)) : fallback);
  const text = (value, fallback, max) => (typeof value === 'string' && value.trim() ? value.slice(0, max) : fallback);
  const seed = text(d.seed, 'squimble', 60);
  // a retired mood opens as the one that replaced it, with its modifiers (RETIRED)
  const [moodId, oldMods] = RETIRED[d.mood] ? [RETIRED[d.mood][0], [...RETIRED[d.mood][1], ...(Array.isArray(d.mods) ? d.mods : [])]] : [d.mood, d.mods];
  const song = {
    name: text(d.name, seedTitle(seed), 40),
    seed,
    ...(d.own === true ? { own: true } : {}),
    ...(COMPOSER_VERSIONS.includes(d.composer) && d.composer !== 1 ? { composer: d.composer } : {}),
    mood: MOODS[moodId] ? moodId : 'calm',
    ...(MOODS[moodId] && d.flavour !== plainFlavour(moodId) && FLAVOURS[moodId]?.kinds[d.flavour] ? { flavour: d.flavour } : {}),
    // (an old song's blend is dropped, but it keeps everything the blend picked)
    ...(cleanMods(oldMods).length ? { mods: cleanMods(oldMods) } : {}),
    style: STYLES[d.style] ? d.style : 'ambient',
    key: Math.round(num(d.key, 0, 11, 0)),
    scale: SCALES[d.scale] ? d.scale : 'major',
    tempo: Math.round(num(d.tempo, 30, 220, 80)),
    meter: METERS[d.meter] ? d.meter : '4/4',
    swing: num(d.swing, 0, 1, 0),
    humanise: num(d.humanise, 0, 1, 0.35),
    colour: num(d.colour, 0, 1, 0.4),
    chordBars: CHORD_BARS.includes(+d.chordBars) ? +d.chordBars : 2,
    parts: {},
    layers: [],
    sections: [],
    fx: {},
  };
  for (const part of PARTS) song.parts[part] = text(d.parts?.[part], 'I', 200);
  const ids = new Set();
  for (const raw of Array.isArray(d.layers) ? d.layers.slice(0, 16) : []) {
    if (!raw || !ROLES[raw.role]) continue;
    const layer = { ...clone(LAYER_DEFAULTS), role: raw.role };
    let id = text(raw.id, raw.role, 24).replace(/[^\w-]/g, '') || raw.role;
    for (let n = 2; ids.has(id); n++) id = `${raw.role}-${n}`;
    ids.add(id);
    layer.id = id;
    layer.instrument = instrumentFits(raw.instrument, raw.role) ? raw.instrument : Object.keys(INSTRUMENTS).find((key) => instrumentFits(key, raw.role));
    // which recording it plays, only when it isn't the instrument's usual one
    if (INSTRUMENTS[layer.instrument].more?.[raw.recording]) layer.recording = raw.recording;
    // the instruments doubling it: recorded tonal ones, three at most
    const doubles = (Array.isArray(raw.with) ? raw.with : []).filter((one) => INSTRUMENTS[one?.instrument]?.samples && roleFamily(layer.role) === 'tonal' && !['kit', 'texture'].includes(INSTRUMENTS[one.instrument].family)).slice(0, 3);
    if (doubles.length) {
      layer.with = doubles.map((one) => ({
        instrument: one.instrument,
        ...(Math.round(num(one.octave, -2, 2, 0)) ? { octave: Math.round(num(one.octave, -2, 2, 0)) } : {}),
        ...(INSTRUMENTS[one.instrument].more?.[one.recording] ? { recording: one.recording } : {}),
      }));
      if (typeof raw.doubleAll === 'boolean') layer.doubleAll = raw.doubleAll;
    }
    layer.pattern = PATTERNS[raw.role][raw.pattern] ? raw.pattern : Object.keys(PATTERNS[raw.role])[0];
    // a layer that plays only notes added by hand (a texture has none to draw)
    if (raw.hand === true && roleFamily(raw.role) !== 'texture') layer.hand = true;
    layer.seed = text(String(raw.seed ?? ''), '0', 24);
    // a part given new notes of its own (partSeed), only when it has one
    const partSeeds = PARTS.filter((part) => raw.partSeeds?.[part] && typeof raw.partSeeds[part] === 'string');
    if (partSeeds.length) layer.partSeeds = Object.fromEntries(partSeeds.map((part) => [part, text(raw.partSeeds[part], '0', 24)]));
    layer.volume = num(raw.volume, 0, 1, layer.volume);
    layer.pan = num(raw.pan, -1, 1, 0);
    layer.octave = Math.round(num(raw.octave, -2, 2, 0));
    layer.density = num(raw.density, 0, 1, layer.density);
    layer.rate = RATES[raw.rate] ? raw.rate : 'medium';
    layer.span = Math.round(num(raw.span, 1, 3, 2));
    layer.reverb = num(raw.reverb, 0, 1, layer.reverb);
    layer.echo = num(raw.echo, 0, 1, layer.echo);
    layer.mute = raw.mute === true;
    layer.solo = raw.solo === true;
    const tone = raw.tone || {};
    layer.tone = {
      attack: num(tone.attack, 0.1, 4, 1), release: num(tone.release, 0.1, 4, 1), bright: num(tone.bright, 0.25, 4, 1),
      detune: num(tone.detune, 0, 50, 0), vibrato: num(tone.vibrato, 0, 50, 0),
    };
    for (const part of PARTS) {
      const edit = raw.edits?.[part];
      if (!edit) continue;
      // a note is [beat, midi, length, ...the note editor's extras], see packEdit
      const pitch = (midi) => Math.round(Math.min(127, Math.max(0, midi)));
      const add = (Array.isArray(edit.add) ? edit.add.slice(0, 2000) : [])
        .filter((note) => Array.isArray(note) && note.length >= 3 && note.every((n) => Number.isFinite(n)))
        .map((raw) => {
          const one = unpackEdit(raw);
          const slides = pitch(one.to) !== pitch(one.midi);
          return packEdit({
            t: Math.max(0, one.t), midi: pitch(one.midi), dur: Math.min(64, Math.max(0.05, one.dur)), to: pitch(one.to),
            glide: slides ? Math.min(64, Math.max(0.01, one.glide)) : 0, shake: Math.min(60, Math.max(0, one.shake)),
            curve: slides ? Math.round(Math.min(3, Math.max(0, one.curve))) : 0, swell: Math.sign(Math.round(one.swell)),
            vel: Math.round(Math.min(1, Math.max(0, one.vel)) * 100) / 100, mute: one.mute ? 1 : 0,
          });
        });
      const remove = (Array.isArray(edit.remove) ? edit.remove.slice(0, 4000) : []).filter((key) => typeof key === 'string' && /^[\d.]+:\d+$/.test(key));
      if (add.length || remove.length) layer.edits[part] = { add, remove };
    }
    song.layers.push(layer);
  }
  for (const raw of Array.isArray(d.sections) ? d.sections.slice(0, 64) : []) {
    if (!raw) continue;
    song.sections.push({
      name: text(raw.name, 'Part', 20),
      part: PARTS.includes(raw.part) ? raw.part : 'A',
      bars: Math.round(num(raw.bars, 1, 64, 8)),
      play: [...new Set(Array.isArray(raw.play) ? raw.play.filter((id) => ids.has(id)) : [])],
      // the layer playing a solo here (addSolo), only kept if it's one that can
      ...(ids.has(raw.lead) && SOLOISTS[song.layers.find((layer) => layer.id === raw.lead).role] ? { lead: raw.lead } : {}),
      // how hard it's played, 0 to 1 (feel)
      ...(typeof raw.energy === 'number' && Number.isFinite(raw.energy) ? { energy: num(raw.energy, 0, 1, 0.75) } : {}),
      // a key change: semitones up (LIFTED)
      ...(Number.isInteger(raw.lift) && raw.lift >= 1 && raw.lift <= 5 ? { lift: raw.lift } : {}),
    });
  }
  if (!song.sections.length) song.sections.push({ name: 'A', part: 'A', bars: 8, play: [...ids] });
  const fx = d.fx || {};
  for (const [key, fallback] of Object.entries(FX_DEFAULTS)) song.fx[key] = key === 'echoTime' ? (ECHO_TIMES.includes(+fx.echoTime) ? +fx.echoTime : fallback) : num(fx[key], 0, 1, fallback);
  return song;
}

// ---------- what's changed: short links ----------
//
// a song from a seed is mostly what the seed makes, so a link is the seed and only what's changed since
// (maker.js packs it). songChanges is that difference: the keys that differ, nested, lists patched place
// by place (with their new length if it changed), a key that's gone as null. withChanges puts them back
function songChanges(from, to) {
  if (JSON.stringify(from) === JSON.stringify(to)) return undefined;
  const nested = (thing) => thing && typeof thing === 'object';
  if (!nested(from) || !nested(to) || Array.isArray(from) !== Array.isArray(to)) return to;
  const out = {};
  for (const key of Object.keys(to)) {
    const one = songChanges(from[key], to[key]);
    if (one !== undefined) out[key] = one;
  }
  if (Array.isArray(to)) {
    if (to.length !== from.length) out.length = to.length;
  } else {
    for (const key of Object.keys(from)) if (!(key in to)) out[key] = null;
  }
  return out;
}
// (an object of changes patches what it's put on, anything else replaces it)
function withChanges(base, changes) {
  const nested = (thing) => thing && typeof thing === 'object';
  if (!nested(changes) || Array.isArray(changes) || !nested(base)) return changes === undefined ? clone(base) : clone(changes);
  const out = clone(base);
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'length' && Array.isArray(out)) continue;
    if (value === null) delete out[key];
    else out[key] = withChanges(out[key], value);
  }
  if (Array.isArray(out) && Number.isInteger(changes.length)) out.length = changes.length;
  return out;
}

// ---------- composing: settings to notes ----------

// a section's chords from its start, the part's progression going round as many times as fits
function sectionChords(song, section, start) {
  const bpb = METERS[song.meter].beats;
  let { slots } = parseProgression(song.parts[section.part]);
  if (!slots.length) {
    const home = diatonicChord(harmonySteps(song.scale), 0);
    slots = [{ chord: { ...home, fixed: false }, slots: 1 }];
  }
  const beats = section.bars * bpb;
  const chords = [];
  for (let t = 0, i = 0; t < beats - 1e-6; i++) {
    const slot = slots[i % slots.length];
    const dur = Math.min(slot.slots * song.chordBars * bpb, beats - t);
    const { chord } = slot;
    const tones = chord.fixed ? chord.tones : colourChord(chord.tones, chord.root, song.colour, makeRng(song.seed, 'colour', section.part, i % slots.length));
    const root = mod12(song.key + chord.root);
    chords.push({ t: start + t, dur, root, tones, pcs: new Set(tones.map((tone) => mod12(root + tone))), name: chordName(root, tones) });
    t += dur;
  }
  return chords;
}

// a song that ends comes home: its last chord is the home chord, not the IV or V that leads back round
// (the outro stopped mid thought). a loop or fight is left leading back into its start
function cadence(song, last) {
  if (!last || LOOPS[song.style]) return;
  const chord = last.chords[last.chords.length - 1];
  const home = diatonicChord(harmonySteps(song.scale), 0);
  const root = mod12(song.key + home.root);
  if (chord.root === root && chord.tones[1] === home.tones[1]) return;
  // coloured like any other chord, from its place, so it's the same every time
  const tones = colourChord(home.tones, home.root, song.colour, makeRng(song.seed, 'colour', 'home'));
  Object.assign(chord, { root, tones, pcs: new Set(tones.map((tone) => mod12(root + tone))), name: chordName(root, tones), home: true });
}

function composeSong(song) {
  // an older song plays with the composer it was made with, when the page has it
  const kept = (song.composer || 1) !== COMPOSER && typeof KEPT_COMPOSERS !== 'undefined' && KEPT_COMPOSERS[song.composer || 1];
  if (kept) return kept.composeSong(song);
  const meter = METERS[song.meter];
  const mood = songMood(song);
  const build = builds(song);
  const weave = weaves(song);
  const sections = [];
  const takes = {};
  let start = 0;
  for (const [index, section] of song.sections.entries()) {
    const beats = section.bars * meter.beats;
    takes[section.part] = (takes[section.part] ?? -1) + 1;
    sections.push({ ...section, index, take: takes[section.part], start, beats, end: start + beats, chords: sectionChords(song, section, start) });
    start += beats;
  }
  cadence(song, sections[sections.length - 1]);
  const scalePcs = new Set(SCALES[song.scale].steps.map((step) => mod12(song.key + step)));
  // melodies first, so counter melodies can answer them, then a layer taking the tune (the tune where
  // the melody rests)
  const order = (layer) => (layer.role === 'melody' ? 0 : layer.role === 'counter' && carries(layer) ? 1 : 2);
  const layers = [...song.layers].sort((a, b) => order(a) - order(b));
  const melodyLayer = song.layers.find((layer) => layer.role === 'melody');
  const melodyBySection = {};
  const grooves = {};
  for (const part of PARTS) grooves[part] = grooveFor(song, part);
  // one layer's notes for one section: its composer's (or its solo, or none if it's played by hand),
  // then its hand edits
  const write = (layer, section) => {
    const c = {
      song, layer, section, meter, scalePcs, mood, weave,
      groove: grooves[section.part],
      prev: sections[section.index - 1] || null,
      next: sections[section.index + 1] || null,
      bpb: meter.beats, sub: meter.sub, step: gridStep(song.meter),
      start: section.start, end: section.end, bars: section.bars,
      chords: section.chords,
      rng: makeRng(song.seed, partSeed(layer, section.part), layer.role, section.part),
      vary: makeRng(song.seed, partSeed(layer, section.part), section.part, 'take', section.take),
      // (a singer or didgeridoo sits round its own note, home: moved far, it sounds like someone else)
      center: (INSTRUMENTS[layer.instrument]?.home ?? ROLES[layer.role].center) + layer.octave * 12,
      steps: SCALES[song.scale].steps,
      melody: melodyBySection[section.index] || null,
      // the melody's line for this section, playing or not: what a layer taking or doubling the tune
      // plays. written afresh each time, since listen, ornament and feel change notes in place. take: as
      // it went some other time round its part (0, the first)
      line: (take = section.take) => (melodyLayer && melodyLayer !== layer ? write(melodyLayer, { ...section, take, lead: null }) : []),
    };
    c.tonic = near(song.key, c.center);
    // a solo is its own line, so the part's hand edits don't apply to it
    const leading = section.lead === layer.id;
    let made = (leading ? solo(c) : layer.hand ? [] : COMPOSERS[layer.role](c)).filter((note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6);
    // a singer (home) sings every note within nine semitones of their own, a stray an octave nearer
    const home = INSTRUMENTS[layer.instrument]?.home;
    if (home) {
      for (const note of made) {
        while (note.midi > home + 9) note.midi -= 12;
        while (note.midi < home - 9) note.midi += 12;
      }
    }
    // a voice with a range sings inside it (an octave further is a cartoon): the section's part moves by
    // whole octaves first, so its shape stays, then any stray note
    const range = INSTRUMENTS[layer.instrument]?.range;
    if (range && made.length) {
      const middle = made.reduce((sum, note) => sum + note.midi, 0) / made.length;
      const shift = 12 * Math.round(((range[0] + range[1]) / 2 - middle) / 12);
      for (const note of made) note.midi += shift;
      for (const note of made) {
        while (note.midi > range[1]) note.midi -= 12;
        while (note.midi < range[0]) note.midi += 12;
      }
    }
    if (!leading) made = applyEdits(made, layer.edits[section.part], section);
    return made;
  };
  // everyone writes their part, then the band listens (listen, on the grid), then plays it with feel
  const parts = {};
  for (const layer of layers) {
    const out = [];
    for (const section of sections) {
      if (!section.play.includes(layer.id)) continue;
      const made = write(layer, section);
      // the tune the band answers here: the melody's, or the layer that took it over
      if ((layer.role === 'melody' || order(layer) === 1) && !melodyBySection[section.index]) melodyBySection[section.index] = made;
      out.push(...made);
    }
    parts[layer.id] = out;
  }
  listen(song, sections, parts);
  ornament(song, sections, parts);
  pedal(song, sections, parts);
  liftKey(song, sections, parts);
  const notes = [];
  for (const layer of layers) {
    let out = parts[layer.id];
    if (layer.role === 'drone' || layer.role === 'texture') out = joinHeld(out);
    feel(out, song, layer, sections);
    markDoubles(layer, out, sections, build ? BUILD_DOUBLE_ENERGY : DOUBLE_ENERGY);
    for (const note of out) note.layer = layer.id;
    notes.push(...out);
  }
  notes.sort((a, b) => a.t - b.t);
  return { beats: start, bpb: meter.beats, sub: meter.sub, step: gridStep(song.meter), sections, notes };
}

// a key change (section.lift): every note in a lifted section moves up once the band's written,
// listened and ornamented it, so everything that fitted still fits, and its chords move too. tuned
// drums and the scenery's home note move with it, and a voice goes up with everyone (folding it an
// octave nearer broke the tune's shape at the climax). done before held drones join up (joinHeld). a
// note keeps the pitch it was written at (written) for the note editor, and a note from before that
// would ring on into the change is let go there
function liftKey(song, sections, parts) {
  for (const section of sections) {
    if (!section.lift) continue;
    const inside = (note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6;
    const before = sections[section.index - 1];
    for (const layer of song.layers) {
      if (before && (before.lift || 0) !== section.lift && layer.role !== 'drums') {
        for (const note of parts[layer.id] || []) {
          if (note.t < section.start - 1e-6 && note.t + note.dur > section.start + 1e-6) {
            note.dur = Math.max(0.05, section.start - note.t);
            if (note.lifted > note.dur) note.lifted = note.dur;
          }
        }
      }
      for (const note of (parts[layer.id] || []).filter(inside)) {
        if (layer.role === 'drums') {
          if (note.tune) note.tune *= 2 ** (section.lift / 12);
          continue;
        }
        note.written ??= note.midi;
        note.midi += section.lift;
      }
    }
    for (const chord of section.chords) {
      chord.root = mod12(chord.root + section.lift);
      chord.pcs = new Set(chord.tones.map((tone) => mod12(chord.root + tone)));
      chord.name = chordName(chord.root, chord.tones);
    }
  }
}

// ---------- listening ----------
//
// once every part's written, the band gives way where two parts would sound wrong together. the drums
// listen as they play instead (COMPOSERS.drums), and notes added by hand are left alone:
//   - the tune stays on top: keys, an arp or a counter melody that would start above the melody note
//     drop an octave, if that keeps them in range (pads and bells stay where they are)
//   - nobody rubs against the tune: a minor second (or ninth) against a melody note half a beat or
//     longer. pads and keys drop the chord's added note when that's what rubs; lines (an arp, bells, a
//     counter melody, a riff's line) move to the nearest chord note that doesn't
//   - in a solo the soloist is the tune, and where the melody's handed the tune over, the layer that
//     took it is. layers carrying the tune play its own notes, so they never give way to it
const ON_TOP = { keys: true, arp: true, counter: true };
const GIVE_WAY = { keys: 'drop', guitar: 'drop', pad: 'drop', arp: 'move', bells: 'move', counter: 'move' };
// two notes a minor second (or ninth, or more octaves) apart
const rubs = (a, b) => mod12(Math.max(a, b) - Math.min(a, b)) === 1;
function listen(song, sections, parts) {
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const taker = song.layers.find((layer) => layer.role === 'counter' && carries(layer));
  const inside = (section) => (note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6;
  // (in a weave, the second theme or the bells where they have it alone)
  const weave = weaves(song);
  const alone = weave ? song.layers.filter((layer) => (layer.role === 'counter' && layer.pattern === 'counterpoint') || (layer.role === 'bells' && carries(layer))) : [];
  const tuneOf = (section) => section.lead || (taker && melody && !section.play.includes(melody.id) && section.play.includes(taker.id) ? taker.id
    : weave && melody && !section.play.includes(melody.id) ? alone.find((layer) => section.play.includes(layer.id))?.id || melody.id : melody?.id);
  const tune = sections.flatMap((section) => (parts[tuneOf(section)] || []).filter(inside(section))).sort((a, b) => a.t - b.t);
  if (!tune.length) return;
  const soloing = (layer, note) => sections.some((section) => section.lead === layer.id && inside(section)(note));
  // the last melody note starting at or before t
  const lastBefore = (t) => {
    let low = 0;
    let high = tune.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tune[middle].t <= t + 1e-6) low = middle + 1;
      else high = middle;
    }
    return low - 1;
  };
  const chordOf = (t) => {
    const section = sections.find((one) => t < one.end - 1e-6) || sections[sections.length - 1];
    return section.chords.find((chord) => t < chord.t + chord.dur - 1e-6) || section.chords[section.chords.length - 1];
  };
  for (const layer of song.layers) {
    if (carries(layer) || (!GIVE_WAY[layer.role] && !parts[layer.id].some((note) => note.line))) continue;
    const floor = ROLES[layer.role].center + layer.octave * 12 - 12;
    parts[layer.id] = parts[layer.id].filter((note) => {
      // a riff's line (note.line) moves like any other line, so the guitar and bass never rub
      const rule = note.line ? 'move' : GIVE_WAY[layer.role];
      if (!rule || note.added || soloing(layer, note)) return true;
      const at = lastBefore(note.t);
      const lead = tune[at];
      const ceiling = ON_TOP[layer.role] && lead && note.t < lead.t + lead.dur - 1e-6 ? lead.midi : Infinity;
      // written: the pitch the composer wrote, which hand edits know the note by (applyEdits)
      while (note.midi > ceiling && note.midi - 12 >= floor) {
        note.written ??= note.midi;
        note.midi -= 12;
      }
      // the melody notes it's heard against, leaving out quick passing notes
      const heard = [];
      for (let i = Math.max(0, at); i < tune.length && tune[i].t < note.t + note.dur - 1e-6; i++) {
        if (tune[i].dur >= 0.5 && tune[i].t + tune[i].dur > note.t + 1e-6) heard.push(tune[i].midi);
      }
      const clashes = (midi) => heard.some((other) => rubs(midi, other));
      if (!clashes(note.midi)) return true;
      const chord = chordOf(note.t);
      if (rule === 'drop') return chord.tones.slice(0, 3).some((tone) => mod12(chord.root + tone) === mod12(note.midi));
      for (const step of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const midi = note.midi + step;
        // under the tune, or for a note stuck over a low tune, no further over it
        if (chord.pcs.has(mod12(midi)) && !clashes(midi) && (midi <= ceiling || midi < note.midi)) {
          note.written ??= note.midi;
          note.midi = midi;
          break;
        }
      }
      return true;
    });
  }
}

// ---------- ornaments ----------
//
// what a player adds to the written notes without thinking: most of the gap between real music and
// midi. each instrument says which ornaments its players use and how often (ornaments in synth.js), and
// the mood how much it likes them (ornate). they're bends on the written notes (note.bend, pins in
// beats, played by pitchMods in synth.js), so the tune and every rule above stay true:
//   slide    the note starts on the last one's pitch and slides on (joined notes, a fifth apart at most)
//   bend     bending up onto the note from bendBy semitones under (a guitar, a harmonica)
//   release  the other way: picked already bent, then let down onto the note
//   grace    a quick flick from the scale note above (a fiddler's cut)
//   trill    a mordent on a long note: the note, the one above, and back
//   fall, doit   the end of a phrase falling away, or flicking up (a sax or trumpet)
//   shake    a wide vibrato on a long note (note.shake, cents)
//   swell    a long note growing through a phrase, or dying at its end (note.swell)
//   stop     a double stop, a second note a third under (the only one that adds a note, marked stop)
// and slurs (slurs(), not dice): joined notes of a blown, bowed or sung line come straight out of the
// last without a fresh attack. the dice come from the note's place (part, bar in its phrase, beat,
// length), so a motif that comes back is ornamented the same way. hand drawn notes are left as drawn
const ORNAMENTED = { melody: true, counter: true, bass: true, guitar: true };
function ornament(song, sections, parts) {
  const amount = (songMood(song).ornate ?? 1) * (song.style === 'ambient' ? 0.6 : 1);
  if (amount <= 0) return;
  const spb = 60 / song.tempo;
  const beats = (seconds) => seconds / spb;
  const bpb = METERS[song.meter].beats;
  const scalePcs = new Set(SCALES[song.scale].steps.map((step) => mod12(song.key + step)));
  // how far the next scale note is above (or below, way -1) a pitch
  const scaleStep = (midi, way) => {
    for (let k = 1; k <= 3; k++) if (scalePcs.has(mod12(midi + k * way))) return k;
    return 2;
  };
  const placeOf = (note) => {
    const section = sections.find((one) => note.t < one.end - 1e-6) || sections[sections.length - 1];
    const bar = Math.floor((note.t - section.start) / bpb + 1e-9);
    return `${section.part}|${bar % 4}|${Math.round((note.t - section.start - bar * bpb) * 12)}|${Math.round(note.dur * 12)}`;
  };
  for (const layer of song.layers) {
    const inst = INSTRUMENTS[layer.instrument];
    if (!inst || !ORNAMENTED[layer.role] || !parts[layer.id]) continue;
    if (layer.role === 'melody' || layer.role === 'counter') slurs(inst, parts[layer.id]);
    const can = inst.ornaments;
    if (!can) continue;
    const roll = (what, note, p) => p > 0 && makeRng(song.seed, layer.seed, 'ornament', what, placeOf(note)).chance(Math.min(0.95, p * amount));
    const glide = beats(can.glide ?? 0.1);
    const notes = parts[layer.id].filter((note) => !note.added && !note.bend && !note.mute).sort((a, b) => a.t - b.t || a.midi - b.midi);
    if (layer.role === 'guitar') {
      // sliding a whole chord in from the last (power chord slides), when they're joined and close
      const chords = [];
      for (const note of notes) {
        if (chords.length && Math.abs(chords[chords.length - 1][0].t - note.t) < 0.05) chords[chords.length - 1].push(note);
        else chords.push([note]);
      }
      for (let i = 1; i < chords.length; i++) {
        const [before, now] = [chords[i - 1], chords[i]];
        const move = before[0].midi - now[0].midi;
        const joined = Math.abs(before[0].t + before[0].dur - now[0].t) < 0.15;
        if (now.length < 2 || !joined || !move || Math.abs(move) > 5 || !roll('slide', now[0], can.slide)) continue;
        for (const note of now) note.bend = [[0, move], [Math.min(glide, note.dur * 0.5), 0, 2]];
      }
      continue;
    }
    const stops = [];
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const before = notes[i - 1];
      const after = notes[i + 1];
      const joined = before && note.t - (before.t + before.dur) < Math.max(0.1, before.dur * 0.15) && note.t > before.t + 1e-6;
      const move = before ? before.midi - note.midi : 0;
      const ending = !after || after.t - (note.t + note.dur) >= 0.5;
      // one change of pitch a note: the first of these that comes up
      if (joined && move && Math.abs(move) <= 7 && note.dur >= 0.4 && roll(`slide${Math.sign(move)}`, note, can.slide)) {
        // (a slow glide, a trombone's or a singer's, is smooth; a quick one settles)
        note.bend = [[0, move], [Math.min(glide, note.dur * 0.5), 0, can.glide >= 0.15 ? 1 : 2]];
      } else if (layer.role === 'bass') {
        continue;
      } else if (note.dur >= 0.75 && roll('bend', note, can.bend)) {
        note.bend = [[0, -(can.bendBy ?? 2)], [Math.min(beats(0.14), note.dur * 0.4), 0, 1]];
      } else if (note.dur >= 0.75 && roll('release', note, can.release)) {
        const hold = Math.min(beats(0.12), note.dur * 0.25);
        note.bend = [[0, can.bendBy ?? 2], [hold, can.bendBy ?? 2], [hold + Math.min(beats(0.2), note.dur * 0.3), 0, 1]];
      } else if (note.dur >= 0.5 && roll('grace', note, can.grace)) {
        const up = scaleStep(note.midi, 1);
        const flick = Math.min(beats(0.06), note.dur * 0.2);
        note.bend = [[0, up], [flick, up], [flick + beats(0.012), 0]];
      } else if (note.dur >= 1.5 && roll('trill', note, can.trill)) {
        const up = scaleStep(note.midi, 1);
        const flick = Math.min(beats(0.07), note.dur * 0.1);
        const snap = beats(0.01);
        note.bend = [[0, 0], [flick, 0], [flick + snap, up], [flick * 2, up], [flick * 2 + snap, 0]];
      } else if (note.dur >= 0.5 && ending && roll('fall', note, can.fall)) {
        note.bend = [[Math.max(0, note.dur - beats(0.12)), 0], [note.dur + beats(0.15), -4, 3]];
      } else if (note.dur >= 0.5 && ending && roll('doit', note, can.doit)) {
        note.bend = [[Math.max(0, note.dur - beats(0.1)), 0], [note.dur + beats(0.12), 3, 3]];
      }
      if (note.dur >= 1.5 && roll('swell', note, can.swell)) note.swell = ending ? -1 : 1;
      if (note.dur >= 1 && roll('shake', note, can.shake)) note.shake = 18 + 8 * makeRng(song.seed, layer.seed, 'wide', placeOf(note)).next();
      // a double stop on a long note on the beat: a third under it in the scale
      if (note.dur >= 1 && Math.abs(note.t - Math.round(note.t)) < 1e-6 && roll('stop', note, can.stop)) {
        const third = note.midi - scaleStep(note.midi, -1) - scaleStep(note.midi - scaleStep(note.midi, -1), -1);
        stops.push({ t: note.t, dur: note.dur, midi: third, vel: note.vel * 0.75, stop: true, ...(note.bend ? { bend: note.bend } : {}) });
      }
    }
    parts[layer.id].push(...stops);
  }
}

// slurs (see ornament): every joined note of a held line after the first, unless it's the same pitch
// again. only instruments that hold a note (scooped, sung, held synth leads) can slur
const legato = (inst) => (inst.kind === 'sub' || inst.kind === 'choir') && inst.env[2] >= 0.6 && (inst.scoop || inst.kind === 'choir' || inst.family === 'lead');
function slurs(inst, notes) {
  if (!legato(inst)) return;
  const line = notes.filter((note) => !note.added && !note.stop).sort((a, b) => a.t - b.t);
  for (let i = 1; i < line.length; i++) {
    const [before, note] = [line[i - 1], line[i]];
    if (note.t - (before.t + before.dur) < 0.1 && note.t > before.t + 1e-6 && note.midi !== before.midi) note.slur = true;
  }
}

// a note's key for edits: where it starts in its section, and its pitch
const editKey = (relative, midi) => `${+relative.toFixed(3)}:${midi}`;

// a hand drawn note (layer.edits' add) as numbers and back: [beat, midi, length, to (midi it slides
// to), glide (beats), shake (cents), curve (CURVES in synth.js), swell (1 or -1), vel (0: the usual
// 0.75), mute (palm muted)], with defaults left off the end so a plain note is three numbers
const EDIT_FIELDS = ['t', 'midi', 'dur', 'to', 'glide', 'shake', 'curve', 'swell', 'vel', 'mute'];
function unpackEdit([t, midi, dur, to = midi, glide = 0, shake = 0, curve = 0, swell = 0, vel = 0, mute = 0]) {
  return { t, midi, dur, to, glide, shake, curve, swell, vel, mute };
}
function packEdit(one) {
  const out = EDIT_FIELDS.map((key) => (key === 'to' ? one.to ?? one.midi : one[key] ?? 0));
  let length = out.length;
  while (length > 3 && out[length - 1] === (EDIT_FIELDS[length - 1] === 'to' ? out[1] : 0)) length--;
  return out.slice(0, length);
}

function applyEdits(notes, edit, section) {
  if (!edit) return notes;
  const removed = new Set(edit.remove);
  const kept = notes.filter((note) => !removed.has(editKey(note.t - section.start, note.midi)));
  for (const raw of edit.add) {
    const { t, midi, dur, to, glide, shake, curve, swell, vel, mute } = unpackEdit(raw);
    if (t >= section.beats) continue;
    const length = Math.min(dur, section.beats - t);
    // a slide drawn by hand: from midi to to over glide beats, then held
    const slide = to !== midi ? { bend: [[0, 0], [Math.min(glide, length), to - midi, ...(curve ? [curve] : [])]] } : {};
    kept.push({ t: section.start + t, dur: length, midi, vel: vel || 0.75, added: true, ...slide, ...(shake ? { shake } : {}), ...(swell ? { swell } : {}), ...(mute ? { mute: true } : {}) });
  }
  return kept;
}

// drones and textures held across sections join into one long note, so they don't fade out and back in
function joinHeld(notes) {
  notes.sort((a, b) => a.t - b.t);
  const out = [];
  const last = {};
  for (const note of notes) {
    const before = last[note.midi];
    if (before && Math.abs(before.t + before.dur - note.t) < 1e-6) before.dur += note.dur;
    else {
      out.push(note);
      last[note.midi] = note;
    }
  }
  return out;
}

// swing and humanising. gt keeps the note's place on the grid (for edits and the editor), t is when it
// plays. every note on the same spot moves by the same amount (the pocket) so the band locks together,
// and each layer adds a little of its own (LOOSE): separate nudges smeared the kick, bass and chords
// into flams
const LOOSE = { melody: 1, counter: 1, bells: 1, arp: 0.5, keys: 0.6, guitar: 0.3, pad: 0.4, bass: 0.15, drums: 0.1, drone: 0, texture: 0 };
const pocket = (song, t) => makeRng(song.seed, 'pocket', Math.round(t * 12)).range(-1, 1) * song.humanise * 0.012;
// dynamics: a section is played as hard as its energy (0.75 as written), and the last bar before a
// louder one swells into it. the drums already play to the room (COMPOSERS.drums), so they're left alone
function loudness(sections, t, bpb) {
  const at = sections.find((section) => t < section.end - 1e-6) || sections[sections.length - 1];
  const energy = at.energy ?? 0.75;
  let k = 0.8 + 0.27 * energy;
  // a loud key change is the peak, played harder than anything before it
  if (at.lift && energy >= 0.9) k *= 1.06;
  const next = sections[at.index + 1];
  // (and the last bar before a loud key change swells up into it, however loud it already was)
  if (next && ((next.energy ?? 0.75) > energy + 0.15 || (next.lift && !at.lift && (next.energy ?? 0.75) >= 0.9)) && t >= at.end - bpb) k *= 1 + (0.12 * (t - (at.end - bpb))) / bpb;
  return k;
}

function feel(notes, song, layer, sections = null) {
  const rng = makeRng(song.seed, layer.seed, 'feel');
  // swing pushes every off beat later (to 0.5 + swing / 4). never in 6/8, which already lilts
  const swing = METERS[song.meter].sub === 2 ? song.swing : 0;
  const middle = 0.5 + swing * 0.25;
  const own = LOOSE[layer.role] * song.humanise;
  for (const note of notes) {
    note.gt = note.t;
    if (layer.role === 'drone' || layer.role === 'texture') continue;
    if (sections && layer.role !== 'drums') note.vel = clamp01(note.vel * loudness(sections, note.gt, METERS[song.meter].beats));
    const beat = Math.floor(note.t + 1e-9);
    const u = note.t - beat;
    let t = beat + (u < 0.5 ? (u / 0.5) * middle : middle + ((u - 0.5) / 0.5) * (1 - middle));
    t += pocket(song, note.gt) + rng.range(-1, 1) * own * 0.012;
    note.t = Math.max(0, t);
    // strengths vary for everyone, drums most: an even hi hat sounds like a machine
    note.vel = clamp01(note.vel * (1 + rng.range(-1, 1) * Math.max(own, song.humanise * 0.6) * 0.16));
  }
}

// ---------- the groove ----------
//
// the drums, a syncopated bass and the chord stabs all play one groove, so the kick and bass land
// together. a groove is a bar written out by hand like a drum machine chart:
//   k kick, s snare, h hat, o open hat, p perc (rim, shaker, tick, or a rock kit's ride), l low perc
//   (toms, taiko), y crash, c comping: where stabs, a syncopated bass and power chords go
// x a hit, - a soft (ghost) one, . nothing, a character a step (16ths, or 8ths in 6/8). lines left out
// are silent. the drum layer's pattern picks the list and its seed one from it. part A plays it as
// written, B lifted and C dropped (grooveFor)
const GROOVES = {
  '4/4': {
    groove: [
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.....x...' },
      { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x...x.....' },
      { k: 'x..x....x.x.....', s: '....x..-.-..x...', h: 'x-x-x-x-x-x-x-x-', c: '..x...x...x...x.' },
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x.....x...x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.......x.....x.' },
    ],
    halftime: [
      { k: 'x.......-.x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x..x......x.....', s: '........x.......', h: 'x...x...x...x...', p: '......-.......-.', c: 'x..x......x.....' },
    ],
    // brushes: a jazz ride (ding, ding-a ding) with the brush swishing on 2 and 4, for cozy and
    // wistful songs. it sounds best swung
    brush: [
      { k: 'x.......-.......', s: '....x.......x...', h: 'x...x.x.x...x.x.', c: 'x.....x.........' },
      { k: 'x...........-...', s: '....x.......x...', h: 'x...x.x.x...x.x.', p: '..........-.....', c: 'x.......x.......' },
    ],
    pulse: [
      { k: 'x.......x.......', p: '....-.......-...', c: 'x.......x.......' },
      { k: 'x.........x.....', p: '....-...-...-...', c: 'x.........x.....' },
    ],
    tribal: [
      { k: 'x.......x.......', l: 'x..x..x...x.x...', p: '..-...-...-...-.', c: 'x..x..x.........' },
      { k: 'x.....x.........', l: '..x.x..x..x.x.x.', p: 'x...x...x...x...', c: 'x.....x...x.....' },
    ],
    march: [
      { k: 'x.......x.......', s: 'x.xxx.x.x.xxx.x.', h: 'x...x...x...x...', c: 'x...x...x...x...' },
      { k: 'x...x...x...x...', s: 'x..x..x.x.x.x.x.', c: 'x.......x.......' },
    ],
    sparse: [
      { k: 'x...............', h: '-...-...-...-...', p: '..........-.....', c: 'x.......x.......' },
      { k: 'x.......-.......', h: '....-.......-...', c: 'x...............' },
    ],
    // four to the floor: a kick on every beat and the hats on the off beats, the club beat (crystal
    // castles). the stabs and bass sit off the beat, between the kicks
    four: [
      { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x-.-x-.-x-.-x-.-', o: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x...x...x...x..-', s: '....x.......x...', h: '-.x.-.x.-.x.-.x.', p: '.......-......-.', c: 'x..x..x...x..x..' },
    ],
    // a breakbeat: the kick skipping round a snare that's mostly on 2 and 4, with ghost notes. the
    // drum machine grooves under aphex twin's ambient, and dying light's chases
    break: [
      { k: 'x.x.......x.....', s: '....x..-.x..x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.x.......x.....' },
      { k: 'x.........xx....', s: '....x.......x...', h: 'x-x-x-x-x-x-x-x-', p: '......-.......-.', c: 'x.........x.....' },
    ],
    // rock: the kick on 1 and 3 with a push, the snare cracking on 2 and 4, eighth hats (the ride in
    // part B, RIDES). the comping is where power chords land
    rock: [
      { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.....x...' },
      { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.......' },
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x...', o: '..............x.', c: 'x.......x.....x.' },
      { k: 'x..x....x.x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x..x....x.......' },
    ],
    // punk: kick and snare taking turns every eighth (the skank beat of hardcore and thrash), or the
    // d-beat, the kick on 1, the and of 2, and 3. the guitar strums every eighth
    punk: [
      { k: 'x...x...x...x...', s: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', c: 'x.x.x.x.x.x.x.x.' },
      { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.....x.' },
    ],
    // double kick: sixteenths on the kick under the backbeat, or the gallop (an eighth and two
    // sixteenths), metal's engine
    double: [
      { k: 'xxxxxxxxxxxxxxxx', s: '....x.......x...', p: 'x...x...x...x...', c: 'x.......x.......' },
      { k: 'x.xxx.xxx.xxx.xx', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x...x...x...x...' },
      { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
    ],
    // a breakdown: half time, the kick lurching in a rhythm the guitar chugs along with, a crash or
    // the ride on every beat
    breakdown: [
      { k: 'x..x..x...x.x...', s: '........x.......', y: 'x...x...x...x...', c: 'x..x..x...x.x...' },
      { k: 'x.....x.....x...', s: '........x.......', p: 'x...x...x...x...', c: 'x.....x.....x...' },
    ],
    // wash: shoegaze's steady beat under a ride left ringing, or the floor tom rolling instead of hats
    wash: [
      { k: 'x.......x.......', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x.....x.x.......', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.....x.........' },
      { k: 'x.......x.......', s: '....x.......x...', l: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x...x...x...x...', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
    ],
    // swing: the ride's "ding, ding-a ding" (the hat line, which a jazz kit plays on its ride), the hi
    // hat's foot on two and four (the open hat line, a jazz kit's foot chick), a feathered kick and the
    // snare dropping in quietly. feel swings the eighths
    swing: [
      { k: '-.......-.......', s: '......-.......-.', h: 'x...x.x.x...x.x.', o: '....x.......x...', c: 'x.....x.........' },
      { k: '-...-...-...-...', s: '..........-....-', h: 'x...x.x.x...x.x.', o: '....x.......x...', c: '......x.....x...' },
    ],
    // bossa nova: the kick's long-short heartbeat, the rim click playing the clave (the snare line, the
    // latin kit's rim), and a shaker in sixteenths
    bossa: [
      { k: 'x.....x.x.....x.', s: 'x..x..x...x..x..', h: 'x-x-x-x-x-x-x-x-', c: 'x..x..x...x..x..' },
      { k: 'x..x....x..x....', s: '..x..x..x...x...', h: 'x-x-x-x-x-x-x-x-', p: '.......-......x.', l: '...........x....', c: 'x.....x...x.....' },
    ],
    // tala: the tabla's keherwa, eight strokes a bar, "dha ge na ti na ka dhi na" (k the bayan, s the
    // dayan's na, h ti, p ka, o the open tun)
    tala: [
      { k: 'x.x.........x...', s: 'x...x...x.....x.', h: '......x.........', p: '..........x.....', o: '............x...', c: 'x.......x.......' },
      { k: 'x.x.........x...', s: 'x...x...x.....x.', h: '..-...x...-...-.', p: '..........x.....', o: '............x...', c: 'x.......x.......' },
    ],
    // funk: a busy, syncopated kick, ghost notes on the snare round the backbeat, sixteenth hats (soft
    // ones between, so they're a groove rather than a hiss), the hat opening into the next bar
    funk: [
      { k: 'x.x...x..x..x...', s: '....x..-.-..x..-', h: 'x-x-x-x-x-x-x-x-', c: 'x..x..x...x.x...' },
      { k: 'x..x...xx.x.....', s: '....x.......x.-.', h: 'x-x-x-x-x-x-x-x-', o: '..............x.', c: 'x..x...x..x.....' },
    ],
    // one drop: reggae's beat, the kick and the snare together on the third beat and nothing on the
    // first. the comping is on the off beats, where the skank goes
    onedrop: [
      { k: '........x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', c: '..x...x...x...x.' },
      { k: '........x.......', s: '....-...x...-...', h: 'x.x.x.x.x.x.x.x.', o: '......x.......x.', c: '..x...x...x...x.' },
    ],
    // train: country's snare chugging along like a steam train, accents on two and four, the kick on
    // one and three (boom chick)
    train: [
      { k: 'x.......x.......', s: '-.-.x.-.-.-.x.-.', c: 'x...x...x...x...' },
      { k: 'x.......x.....x.', s: '-.-.x.-.-.-.x.-x', c: 'x...x...x...x...' },
    ],
    // shuffle: the blues' beat, a kick on one and three, the snare on two and four and the hats in
    // eighths, all swung into triplets by feel
    shuffle: [
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x...x...x...x...' },
      { k: 'x.....x.x.......', s: '....x..-....x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.....x.' },
    ],
    // boom bap: hip hop's, a lazy kick skipping round a snare cracking on two and four, eighth hats,
    // swung by the mood (j dilla, pete rock, nujabes)
    boombap: [
      { k: 'x.........x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.........x.....' },
      { k: 'x..x......x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', o: '..............x.', c: 'x..x......x.....' },
      { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', p: '.......-.......-', c: 'x.......x.x.....' },
    ],
    // trap: half time, the snare (a clap) on the third beat, the 808's kick skipping round it, and the
    // hats rolling in quick runs
    trap: [
      { k: 'x......x..x.....', s: '........x.......', h: 'x.x.x.xxx.x.x.xx', c: 'x......x..x.....' },
      { k: 'x.....x...x..x..', s: '........x.......', h: 'xxx.x.x.x.x.xxxx', o: '...........x....', c: 'x.....x...x.....' },
    ],
    // maqsum: egypt's beat, doum tek - tek doum - tek - (the low drum and the sharp one), the riq's
    // jingles running under it. and baladi, its heavier cousin, two doums to start
    maqsum: [
      { k: 'x.......x.......', s: '..x...x.....x...', h: 'x-x-x-x-x-x-x-x-', c: 'x.....x.x.......' },
      { k: 'x.x.....x.......', s: '......x.....x...', h: 'x-x-x-x-x-x-x-x-', o: '..............x.', c: 'x.x.....x.......' },
    ],
    // gallop: horses on the steppe, a long beat and two quick ones (da-da-dum) on the low drum, bells
    // on the beat
    gallop: [
      { k: 'x.......x.......', l: 'x.xxx.xxx.xxx.xx', h: 'x...x...x...x...', c: 'x...x...x...x...' },
      { k: 'x...x...x...x...', l: '..xx..xx..xx..xx', s: '....x.......x...', c: 'x...x...x...x...' },
    ],
  },
  '3/4': {
    groove: [
      { k: 'x...........', s: '....x...x...', h: 'x.x.x.x.x.x.', c: '....x...x...' },
      { k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' },
    ],
    halftime: [{ k: 'x...........', s: '........x...', h: 'x...x...x...', c: 'x...........' }],
    brush: [{ k: 'x...........', s: '....x...x...', h: 'x...x.x.x...', c: 'x...........' }],
    pulse: [{ k: 'x...........', p: '....-...-...', c: 'x...........' }],
    tribal: [{ k: 'x...........', l: 'x..x..x.x...', p: '..-...-...-.', c: 'x..x..x.....' }],
    march: [{ k: 'x...........', s: 'x.xxx.x.x.x.', h: 'x...x...x...', c: 'x...x...x...' }],
    sparse: [{ k: 'x...........', h: '-...-...-...', c: 'x...........' }],
    four: [{ k: 'x...x...x...', s: '........x...', h: '..x...x...x.', c: '..x...x...x.' }],
    break: [{ k: 'x.x.......x.', s: '....x..-.x..', h: 'x.x.x.x.x.x.', c: 'x.x.......x.' }],
    rock: [{ k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    punk: [{ k: 'x...x...x...', s: '..x...x...x.', h: 'x.x.x.x.x.x.', c: 'x.x.x.x.x.x.' }],
    double: [{ k: 'xxxxxxxxxxxx', s: '....x...x...', p: 'x...x...x...', c: 'x...........' }],
    breakdown: [{ k: 'x..x..x.....', s: '........x...', y: 'x...x...x...', c: 'x..x..x.....' }],
    wash: [{ k: 'x.......x...', s: '....x.......', p: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    // a jazz waltz, bossa in three, dadra (the tabla's six beat cycle: dha dhin na, dha tin na), and the rest
    swing: [{ k: '-...........', s: '......-.....', h: 'x...x.x.x...', o: '....x...x...', c: 'x...........' }],
    bossa: [{ k: 'x.....x.....', s: 'x..x..x.....', h: 'x-x-x-x-x-x-', c: 'x..x..x.....' }],
    tala: [{ k: 'x.x...x.....', s: 'x...x.x...x.', o: '..x.....x...', c: 'x.....x.....' }],
    funk: [{ k: 'x.x...x..x..', s: '....x..-.-..', h: 'x-x-x-x-x-x-', c: 'x..x..x.....' }],
    onedrop: [{ k: '....x.......', s: '....x.......', h: 'x.x.x.x.x.x.', c: '..x...x...x.' }],
    train: [{ k: 'x...........', s: '-.-.x.-.x.-.', c: 'x...x...x...' }],
    shuffle: [{ k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x...x...x...' }],
    boombap: [{ k: 'x.......x.x.', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    trap: [{ k: 'x.....x..x..', s: '......x.....', h: 'x.x.xxx.x.xx', c: 'x.....x.....' }],
    maqsum: [{ k: 'x...........', s: '....x...x.x.', h: 'x-x-x-x-x-x-', c: 'x...x...x...' }],
    gallop: [{ k: 'x...........', l: 'x.xxx.xxx.xx', h: 'x...x...x...', c: 'x...x...x...' }],
  },
  '6/8': {
    groove: [
      { k: 'x.....', s: '...x..', h: 'x--x--', c: 'x..x..' },
      { k: 'x.-...', s: '...x..', h: 'x--x--', c: 'x..x.x' },
    ],
    halftime: [{ k: 'x.....', s: '...-..', h: 'x-.x-.', c: 'x.....' }],
    brush: [{ k: 'x.....', s: '...x..', h: 'x.xx.x', c: 'x..x..' }],
    pulse: [{ k: 'x.....', p: '...-..', c: 'x.....' }],
    tribal: [{ k: 'x.....', l: 'x.xx.x', p: '.-..-.', c: 'x.xx.x' }],
    march: [{ k: 'x..x..', s: 'x-xx-x', h: 'x..x..', c: 'x..x..' }],
    sparse: [{ k: 'x.....', h: '-..-..', c: 'x.....' }],
    four: [{ k: 'x..x..', s: '...x..', h: '.xx.xx', c: '.x..x.' }],
    break: [{ k: 'x.x...', s: '...x.-', h: 'xxxxxx', c: 'x.x...' }],
    rock: [{ k: 'x.....', s: '...x..', h: 'xxxxxx', c: 'x..x..' }],
    punk: [{ k: 'x.x.x.', s: '.x.x.x', h: 'xxxxxx', c: 'xxxxxx' }],
    double: [{ k: 'xxxxxx', s: '...x..', p: 'x..x..', c: 'x..x..' }],
    breakdown: [{ k: 'x.x...', s: '...x..', y: 'x..x..', c: 'x.x...' }],
    wash: [{ k: 'x.....', s: '...x..', p: 'xxxxxx', c: 'x..x..' }],
    swing: [{ k: '-.....', s: '....-.', h: 'x.xx.x', o: '...x..', c: 'x.....' }],
    bossa: [{ k: 'x..x..', s: 'x.x..x', h: 'xxxxxx', c: 'x..x..' }],
    tala: [{ k: 'xx.x..', s: 'x.xx.x', o: '.x..x.', c: 'x..x..' }],
    funk: [{ k: 'x.x...', s: '...x.-', h: 'x-x-x-', c: 'x.x...' }],
    onedrop: [{ k: '...x..', s: '...x..', h: 'x.xx.x', c: '.x..x.' }],
    train: [{ k: 'x.....', s: '-.x-.x', c: 'x..x..' }],
    shuffle: [{ k: 'x..x..', s: '...x..', h: 'x.xx.x', c: 'x..x..' }],
    boombap: [{ k: 'x....x', s: '...x..', h: 'x.xx.x', c: 'x....x' }],
    trap: [{ k: 'x....x', s: '...x..', h: 'xxxxxx', c: 'x....x' }],
    maqsum: [{ k: 'x..x..', s: '..x..x', h: 'xxxxxx', c: 'x..x..' }],
    gallop: [{ k: 'x..x..', l: 'x.xx.x', c: 'x..x..' }],
  },
  // 5/4 as three beats then two, like take five
  '5/4': {
    groove: [{ k: 'x...........x.......', s: '........x.......x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.......x...x.......' }],
    halftime: [{ k: 'x...........x.......', s: '........x...........', h: 'x...x...x...x...x...', c: 'x...........x.......' }],
    brush: [{ k: 'x...................', s: '....x.......x.......', h: 'x...x.x.x...x.x.x...', c: 'x...........x.......' }],
    pulse: [{ k: 'x...........x.......', p: '........-.......-...', c: 'x...........x.......' }],
    tribal: [{ k: 'x...........x.......', l: 'x..x..x.....x..x....', p: '..-...-...-...-...-.', c: 'x..x..x.....x.......' }],
    march: [{ k: 'x...........x.......', s: 'x.xxx.x.x.x.x.xxx.x.', h: 'x...x...x...x...x...', c: 'x...x...x...x...x...' }],
    sparse: [{ k: 'x...................', h: '-...-...-...-...-...', c: 'x...................' }],
    four: [{ k: 'x...x...x...x...x...', s: '....x.......x.......', h: '..x...x...x...x...x.', c: '..x...x...x...x...x.' }],
    break: [{ k: 'x.x.......x...x.....', s: '....x..-.x......x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.x.......x...x.....' }],
    rock: [{ k: 'x.......x...x.......', s: '....x...........x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.......x...x.......' }],
    punk: [{ k: 'x...x...x...x...x...', s: '..x...x...x...x...x.', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.x.x.x.x.x.x.x.x.x.' }],
    double: [{ k: 'xxxxxxxxxxxxxxxxxxxx', s: '........x.......x...', p: 'x...x...x...x...x...', c: 'x...........x.......' }],
    breakdown: [{ k: 'x..x..x.....x..x....', s: '........x...........', y: 'x...x...x...x...x...', c: 'x..x..x.....x..x....' }],
    wash: [{ k: 'x.......x...x.......', s: '....x...........x...', p: 'x.x.x.x.x.x.x.x.x.x.', c: 'x...........x.......' }],
    swing: [{ k: '-...........-.......', s: '......-.........-...', h: 'x...x.x.x...x.x.x...', o: '....x.......x.......', c: 'x...........x.......' }],
    bossa: [{ k: 'x.....x.x.....x.x...', s: 'x..x..x...x..x..x...', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x..x..x...x..x..x...' }],
    // jhaptaal, the tabla's ten beat cycle: dhi na, dhi dhi na, ti na, dhi dhi na
    tala: [{ k: 'x...x.x.......x.x...', s: '..x.....x...x.....x.', h: '..........x.........', o: 'x...x.x.......x.x...', c: 'x.........x.........' }],
    funk: [{ k: 'x.x...x..x..x.x.....', s: '....x..-....x..-....', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x..x..x.....x..x....' }],
    onedrop: [{ k: '........x.......x...', s: '........x...........', h: 'x.x.x.x.x.x.x.x.x.x.', c: '..x...x...x...x...x.' }],
    train: [{ k: 'x.......x.......x...', s: '-.-.x.-.-.-.x.-.x.-.', c: 'x...x...x...x...x...' }],
    shuffle: [{ k: 'x.......x...x.......', s: '....x...........x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x...x...x...x...x...' }],
    boombap: [{ k: 'x.........x..x......', s: '....x.......x.......', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.........x.........' }],
    trap: [{ k: 'x......x..x.........', s: '........x.......x...', h: 'x.x.x.xxx.x.x.xxx.x.', c: 'x......x..x.........' }],
    maqsum: [{ k: 'x.......x.......x...', s: '..x...x.....x.....x.', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x.....x.x.......x...' }],
    gallop: [{ k: 'x...........x.......', l: 'x.xxx.xxx.xxx.xxx.xx', h: 'x...x...x...x...x...', c: 'x...x...x...x...x...' }],
  },
};
// the drum each groove line plays (KIT_SLOTS order in synth.js)
const GROOVE_SLOTS = { k: 0, s: 1, h: 2, o: 3, p: 4, l: 5, y: 6 };
// the grooves that get busier in B parts, and the ones whose fills and section crashes are loud
const LIFTS = { groove: true, halftime: true, march: true, four: true, break: true, rock: true, punk: true, double: true, funk: true, boombap: true };
// the quieter grooves that still fill into a new part (a jazz drummer's fill, a tihai on the tabla).
// the quietest (pulse, sparse) never do: a drum roll in the middle of a calm song made it jump
const FILLS = { brush: true, tribal: true, swing: true, tala: true, bossa: true, shuffle: true, train: true, onedrop: true, maqsum: true, gallop: true };
// the rock grooves. their drummer fills down the toms, crashes at the top of every phrase in a loud
// part, and (rock and punk) moves from the hats to the ride for the chorus
const ROCK = { rock: true, punk: true, double: true, breakdown: true, wash: true };
const RIDES = { rock: true, punk: true };

// a pitched drum (kick, tom, tick, rim, snare body) moved to the nearest home note or fifth, in hz, so
// it isn't a semitone off the bass
function tuneDrum(hz, key) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const [best] = [key, key + 7].map((pc) => near(pc, Math.round(midi))).sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi));
  return 440 * 2 ** ((best - 69) / 12);
}

// a part's groove as numbers (1 a hit, 0.5 a soft one). songs without drums still get one for their
// bass and stabs
function grooveFor(song, part) {
  const drums = song.layers.find((layer) => layer.role === 'drums');
  const kind = drums ? drums.pattern : song.style !== 'ambient' ? 'groove' : 'pulse';
  // a breakdown (metal, hardcore): part C goes half time and heavy instead of dropping quiet
  const breakdown = part === 'C' && song.style !== 'ambient' && !!songMood(song).breakdown;
  const written = makeRng(song.seed, drums ? drums.seed : '', 'groove').pick(GROOVES[song.meter][breakdown ? 'breakdown' : kind]);
  const steps = written.k.length;
  const perBeat = steps / METERS[song.meter].beats;
  const lines = {};
  for (const name of [...Object.keys(GROOVE_SLOTS), 'c']) lines[name] = [...(written[name] || '.'.repeat(steps))].map((char) => (char === 'x' ? 1 : char === '-' ? 0.5 : 0));
  if (!written.c) lines.c = lines.k.slice();
  if (part === 'B' && LIFTS[kind]) {
    // lifted (pop grooves only): soft hats in between and an open hat pushing into the next bar. a rock
    // drummer moves to the ride instead (perc, on a rock kit)
    if (RIDES[kind] && lines.h.some(Boolean)) {
      lines.p = lines.p.map((v, i) => Math.max(v, lines.h[i]));
      lines.h = lines.h.map(() => 0);
    } else if (perBeat === 4) lines.h = lines.h.map((v, i) => v || (i % 2 ? 0.5 : 0));
    const push = steps - Math.ceil(perBeat / 2);
    lines.o[push] = 1;
    lines.h[push] = 0;
  }
  if (part === 'C' && !breakdown) {
    // dropped: a rim click where the snare was, hats only on the beat, the kick only on the beat
    lines.p = lines.p.map((v, i) => Math.max(v, lines.s[i] ? 0.5 : 0));
    lines.s = lines.s.map(() => 0);
    lines.h = lines.h.map((v, i) => (i % perBeat === 0 ? v : 0));
    lines.k = lines.k.map((v, i) => (i % perBeat === 0 ? v : 0));
  }
  return { lines, steps, perBeat, grid: METERS[song.meter].beats / steps };
}

// ---------- the composers, one per role ----------
// each gets c (the section, its chords, its own random numbers, see composeSong()) and returns
// notes: { t, dur, midi, vel } with t in beats from the song's start

const chordAt = (c, t) => c.chords.find((chord) => t >= chord.t - 1e-6 && t < chord.t + chord.dur - 1e-6) || c.chords[c.chords.length - 1];
const nextChord = (c, chord) => c.chords[c.chords.indexOf(chord) + 1] || c.chords[0];

// scale degrees (0 is the key's home note near the layer's centre, 7 an octave up in a 7 note scale)
const degreeMidi = (c, degree) => {
  const n = c.steps.length;
  return c.tonic + 12 * Math.floor(degree / n) + c.steps[((degree % n) + n) % n];
};

// the nearest degree that's in the chord, if there is one close
function chordDegree(c, degree, chord) {
  for (let k = 0; k <= 4; k++) {
    if (chord.pcs.has(mod12(degreeMidi(c, degree + k)))) return degree + k;
    if (chord.pcs.has(mod12(degreeMidi(c, degree - k)))) return degree - k;
  }
  return degree;
}

// a scale note a semitone from a borrowed chord's note outside the scale moves onto the chord's note
function fitToChord(midi, chord, scalePcs) {
  for (const pc of chord.pcs) {
    if (scalePcs.has(pc)) continue;
    const gap = mod12(pc - midi);
    if (gap === 1) return midi + 1;
    if (gap === 11) return midi - 1;
  }
  return midi;
}

// strong beats are where a melody wants to be on a chord note: the start of the bar, and the middle
// of a 4/4 bar
const isStrong = (c, t) => {
  const inBar = (t - c.start) % c.bpb;
  return Math.abs(inBar - Math.round(inBar)) < 1e-6 && (Math.round(inBar) === 0 || (c.bpb === 4 && Math.round(inBar) === 2));
};

// rhythm cells, in beats: a bar of melody is a few of these end to end
const CELLS = {
  2: {
    // [1.5, 1.5, 1] and [0.75, 0.75, 0.5] are the tresillo (3 + 3 + 2), the push under countless
    // game and club riffs
    slow: [[2], [4], [3, 1], [1.5, 0.5, 2], [2, 2], [1, 3], [1.5, 1.5, 1]],
    mid: [[1, 1], [1.5, 0.5], [0.5, 0.5, 1], [1, 0.5, 0.5], [2], [0.75, 0.25, 1], [1], [0.75, 0.75, 0.5]],
    fast: [[0.5, 0.5], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [0.75, 0.25], [1], [0.5, 1, 0.5], [0.75, 0.75, 0.5]],
  },
  3: {
    slow: [[1], [2], [2 / 3, 1 / 3, 1], [1, 1]],
    mid: [[1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 3], [1], [1 / 3, 2 / 3]],
    fast: [[1 / 3, 1 / 3, 1 / 3], [1 / 6, 1 / 6, 1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 1 / 6, 1 / 6]],
  },
};

// a bar's rhythm: cells end to end until it's full, faster ones for busier layers. no rests inside a
// bar: the motif repeats, so random gaps came back every bar and the tune kept cutting out. a sparse
// tune is long notes, breathing at the ends of phrases. length: beats to fill (half a bar for a hook)
function makeBar(rng, c, density, length = c.bpb) {
  // (a flavour's rhythm, phrasing, where it has one for this meter)
  const cells = RHYTHMS[c.mood.phrasing?.rhythm]?.[c.sub] || CELLS[c.sub];
  const out = [];
  let t = 0;
  while (t < length - 1e-6) {
    const speed = rng.weighted({ slow: 1.2 - density, mid: 0.6, fast: Math.max(0, density - 0.35) * 1.5 });
    for (const cell of rng.pick(cells[speed])) {
      if (t >= length - 1e-6) break;
      const dur = Math.min(cell, length - t);
      out.push({ t, dur });
      t += dur;
    }
  }
  return out;
}

// where a time falls in the groove's bar, and how many steps until its next hit after step i
const stepInBar = (c, t) => Math.round(((t - c.start) % c.bpb) / c.groove.grid) % c.groove.steps;
function gapAfter(hits, i) {
  let gap = 1;
  while (gap < hits.length && !hits[(i + gap) % hits.length]) gap++;
  return gap;
}

// the groove's comping hits in a chord: [time, length to the next hit, strength], counted from the bar
// so half bar chords still land on the groove. sparse layers keep only the hits on the beat
function compHits(c, chord, density) {
  const { lines, perBeat, grid } = c.groove;
  const hits = lines.c.map((v, i) => v > 0 && (density >= 0.35 || i % perBeat === 0));
  if (!hits.some(Boolean)) hits[0] = true;
  const out = [];
  const end = chord.t + chord.dur;
  for (let t = chord.t; t < end - 1e-6; t += grid) {
    const i = stepInBar(c, t);
    if (hits[i]) out.push([t, Math.min(gapAfter(hits, i) * grid, end - t), i % perBeat === 0 ? 0.66 : 0.56]);
  }
  return out;
}

// ---------- melodies ----------
//
// a tune people remember is one idea coming back, so every melody grows from one motif, the way game
// composers (koji kondo, toby fox, c418) write themes:
//   - the motif is a rhythm and a shape (CONTOURS: a leap and steps back, an arch, a repeated note...),
//     made from the layer's seed, so it's the same tune in every part. part B sings it higher or has its
//     own, part C slows it or has its own. a short motif played twice in a bar is a hook
//   - a theme has a second idea with its own rhythm, and its four bar phrases pair up as question (ends
//     open) and answer (comes home). a long section is a whole a a b a tune
//   - later times round, its last phrase can go another way and a long note can get a passing note
//   - phrases can start with a pickup, strong beats land on chord notes, and it swells to the middle of
//     a phrase like a player
//   - a solo (solo()) is made the same way, from new ideas

// how far each note of a motif sits from its first, in scale steps: set up with the motif's random
// numbers, then the step for note i of n
const CONTOURS = {
  // a leap up, then steps back down into the gap it left
  leap: (rng) => { const up = rng.int(3, 5); return (i) => (i ? up - (i - 1) : 0); },
  // up and back down, highest around the middle
  arch: (rng) => { const top = rng.int(2, 4); return (i, n) => Math.round(top * Math.sin((Math.PI * i) / Math.max(2, n))); },
  // round one note and back to it, a turn
  turn: (rng) => { const way = rng.pick([1, -1]); return (i) => [0, way, 0, -way][i % 4]; },
  // a run up the scale, or one falling from above
  climb: () => (i) => Math.min(i, 5),
  fall: (rng) => { const top = rng.int(3, 5); return (i) => top - Math.min(i, top + 2); },
  // one note a few times, then away and back: a rhythm you could tap (toby fox's favourite)
  repeat: (rng) => { const move = rng.pick([1, 2, 3, -1, -2]); const hold = rng.int(2, 3); return (i, n) => (i < Math.min(hold, n - 1) || (i - Math.min(hold, n - 1)) % 2 ? 0 : move); },
  // rocking between two notes, like a call
  pendulum: (rng) => { const gap = rng.pick([2, 3, 4, -2, -3]); return (i) => (i % 2 ? gap : 0); },
  // the rest only where a flavour's phrasing asks, so no older song changed
  // up and down the chord, a bugle call: fanfares, marches, a royal court
  triad: (rng) => { const call = rng.pick([[0, 2, 4, 7, 4], [0, 4, 7, 4, 2], [4, 2, 0, 2, 4], [0, 2, 4, 2, 0]]); return (i) => call[i % call.length]; },
  // falling in pairs, each a step down from the last, a sigh: laments, requiems, regret
  sigh: (rng) => { const top = rng.int(2, 4); return (i) => top - Math.floor(i / 2) - (i % 2); },
  // rolling up and down by step, a swell on the sea: shanties, lagoons, lullabies
  wave: (rng) => { const span = rng.int(2, 3); return (i) => { const at = i % (span * 2); return at <= span ? at : span * 2 - at; }; },
  // one note called a few times, then a leap up and a step back: a shanty's call, a calypso hook
  call: (rng) => { const leap = rng.pick([3, 4, 5]); return (i, n) => (i === n - 2 ? leap : i === n - 1 ? leap - 1 : 0); },
  // out from one note, a step below then above, wider each time: bebop, flamenco, a fiddler's run
  zigzag: () => (i) => (i % 2 ? -1 : 1) * Math.ceil(i / 2),
  // a drop, then climbing back up into the gap: the blues, a villain, a stoner riff
  dive: (rng) => { const down = rng.int(3, 5); return (i) => (i ? i - 1 - down : 0); },
  // one note recited, moving only at the end: a chant, a hymn, a voice from the dark
  chant: (rng) => { const move = rng.pick([1, -1, 2]); return (i, n) => (i === n - 1 && n > 2 ? move : 0); },
};
// ambient tunes drift and circle more, tunes leap and repeat more (a flavour can say, shapes)
const CONTOUR_WEIGHTS = {
  ambient: { arch: 3, turn: 2, pendulum: 2, fall: 2, leap: 1.5, climb: 1, repeat: 0.5 },
  tune: { leap: 2.5, arch: 2, repeat: 2, climb: 1.5, turn: 1.5, pendulum: 1, fall: 1.5 },
};

// a flavour's rhythm (phrasing.rhythm), in place of CELLS: slow, mid and fast cells all of one kind, so
// a march is dotted and a lullaby even. by beat division (2, or 3 in 6/8); a missing one uses CELLS
const RHYTHMS = {
  // long short, long short: marches, fanfares, jigs, a sleigh ride
  dotted: {
    2: { slow: [[1.5, 0.5, 2], [3, 1], [1.5, 0.5]], mid: [[0.75, 0.25, 1], [0.75, 0.25], [1.5, 0.5], [0.75, 0.25, 0.75, 0.25]], fast: [[0.75, 0.25], [0.5, 0.25, 0.25], [0.75, 0.25, 0.5, 0.5]] },
    3: { slow: [[2 / 3, 1 / 3, 1], [1], [2]], mid: [[2 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1]], fast: [[1 / 3, 1 / 6, 1 / 6], [2 / 3, 1 / 3]] },
  },
  // every note the same length, rocking: lullabies, music boxes, nursery tunes
  even: {
    2: { slow: [[2], [1, 1], [4]], mid: [[1], [1, 1], [0.5, 0.5]], fast: [[0.5, 0.5], [1]] },
    3: { slow: [[1], [2]], mid: [[1], [1 / 3, 1 / 3, 1 / 3]], fast: [[1 / 3, 1 / 3, 1 / 3]] },
  },
  // long notes held, a slow breath: hymns, requiems, slow airs, a lone voice
  long: {
    2: { slow: [[4], [3, 1], [2, 2]], mid: [[2], [1.5, 0.5], [3, 1]], fast: [[1, 1], [2]] },
    3: { slow: [[2], [1]], mid: [[1], [2 / 3, 1 / 3, 1]], fast: [[1], [2 / 3, 1 / 3]] },
  },
  // pushed off the beat: calypso, city pop, ska, the tresillo
  syncopated: {
    2: { slow: [[1.5, 1.5, 1], [1.5, 0.5, 2]], mid: [[0.75, 0.75, 0.5], [0.5, 1, 0.5], [0.25, 0.5, 0.25], [1.5, 0.5]], fast: [[0.25, 0.5, 0.25], [0.5, 0.25, 0.25], [0.75, 0.75, 0.5]] },
  },
  // running notes: reels, bluegrass, clockwork, a gamelan racing
  running: {
    2: { slow: [[1, 1], [0.5, 0.5, 1]], mid: [[0.5, 0.5], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25]], fast: [[0.25, 0.25], [0.25, 0.25, 0.25, 0.25], [0.5, 0.25, 0.25]] },
    3: { slow: [[1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 3]], mid: [[1 / 3, 1 / 3, 1 / 3]], fast: [[1 / 6, 1 / 6, 1 / 3], [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 3]] },
  },
  // short long, a snap onto the note: hip hop, trap, funk, a sneak
  snap: {
    2: { slow: [[0.5, 1.5], [1, 3]], mid: [[0.25, 0.75], [0.5, 1.5], [0.25, 0.75, 1]], fast: [[0.25, 0.25, 0.5], [0.25, 0.75]] },
    3: { slow: [[1 / 3, 2 / 3], [1 / 3, 2 / 3, 1]], mid: [[1 / 3, 2 / 3]], fast: [[1 / 6, 1 / 3, 1 / 2]] },
  },
};

// a motif: a bar of { t, dur, step }. hook: half a bar played twice, the second time maybe a step away.
// contour and rhythm can be passed in to keep one from another motif. it wants two lengths of note (or
// one long one in a slow tune): all the same sounds like a scale exercise
function makeMotif(rng, c, density, hook, contour = null, rhythm = null) {
  const shape = contour || CONTOURS[rng.weighted(c.mood.phrasing?.shapes || CONTOUR_WEIGHTS[c.song.style === 'ambient' ? 'ambient' : 'tune'])](rng);
  if (!rhythm) {
    const length = hook ? c.bpb / 2 : c.bpb;
    for (let tries = 0; tries < 6; tries++) {
      rhythm = makeBar(rng, c, density, length);
      if ((rhythm.length === 1 && density < 0.5) || new Set(rhythm.map((n) => n.dur.toFixed(3))).size > 1) break;
    }
    if (hook) rhythm = [...rhythm, ...rhythm.map((n) => ({ t: n.t + length, dur: n.dur, again: true }))];
  }
  const half = rhythm.filter((n) => !n.again).length;
  const echo = rng.pick([0, 1, -1, 2]);
  const notes = rhythm.map((n, i) => ({ t: n.t, dur: n.dur, step: n.again ? shape(i - half, half) + echo : shape(i, half) }));
  return { notes, rhythm, contour: shape };
}

// where a phrase comes to rest: an answer on the chord's root, a question on its third or fifth
function landing(c, degree, chord, closed) {
  for (let k = 0; k <= 4; k++) {
    for (const d of [degree - k, degree + k]) {
      const pc = mod12(degreeMidi(c, d));
      if (closed ? pc === chord.root : chord.pcs.has(pc) && pc !== chord.root) return d;
    }
  }
  return chordDegree(c, degree, chord);
}

// how a phrase is built, bar by bar: m the motif, s the motif a step on (each s further), v its rhythm
// with new notes, i it upside down, b the second idea, e the ending (half an idea, then a long note).
// riffs repeat their hook with no ending until the section's last bar
const QUESTION_PLANS = [['m', 'm', 'v', 'e'], ['m', 's', 'b', 'e'], ['m', 'b', 'm', 'e'], ['m', 'v', 'b', 'e'], ['m', 's', 's', 'e'], ['m', 'i', 'b', 'e']];
const ANSWER_PLANS = [['m', 'm', 'b', 'e'], ['m', 's', 'v', 'e'], ['m', 'b', 's', 'e'], ['m', 'v', 'm', 'e'], ['m', 'i', 'm', 'e'], ['m', 's', 'm', 'e']];
const MIDDLE_PLANS = [['b', 'b', 's', 'e'], ['b', 's', 'b', 'e'], ['v', 'b', 'b', 'e'], ['i', 'i', 'b', 'e'], ['b', 'v', 'b', 'e']];
const RIFF_PLANS = [['m', 'm', 'm', 'm'], ['m', 'm', 's', 'm'], ['m', 's', 'm', 's'], ['m', 'm', 'm', 'v']];
const RIFF_MIDDLES = [['b', 'b', 'm', 'm'], ['b', 'm', 'b', 'm'], ['m', 'b', 'm', 'b']];

// how busy a layer's tune is, for its pattern: a long note melody is slow, a riff busy
const tuneDensity = (layer) => ({ long: layer.density * 0.3, riff: Math.max(0.75, layer.density), fragments: layer.density * 0.6 })[layer.pattern] ?? (layer.role === 'counter' ? layer.density * 0.8 : layer.density);

// the layer's motif, the same in every part (and quoted in its solos)
function themeMotif(c, density, riff) {
  const theme = makeRng(c.song.seed, c.layer.seed, 'motif', c.layer.role);
  const hook = c.bpb % 2 === 0 && theme.chance(riff ? 1 : c.mood.phrasing?.hook ?? (c.song.style !== 'ambient' ? 0.45 : 0.25));
  return { theme, hook, motif: makeMotif(theme, c, density, hook) };
}

// cells ({ t in the bar, dur, degree, settled, soft, breath }) to notes. strong beats and long notes go
// onto the nearest chord note the way the shape was heading (plain nearest flattened slow tunes into one
// note). swell and the height above anchor shape how loud it is
function sing(c, cells, barStart, low, high, swell = 0, anchor = 0) {
  const out = [];
  let raw = null;
  let played = null;
  for (const cell of cells) {
    const t = barStart + cell.t;
    const chord = chordAt(c, t);
    let { degree } = cell;
    if (!cell.settled && (isStrong(c, t) || cell.dur >= 1)) {
      const way = raw === null ? 0 : Math.sign(cell.degree - raw);
      const ahead = [0, 1, 2].map((k) => degree + way * k).find((d) => chord.pcs.has(mod12(degreeMidi(c, d))) && (!way || (d - played) * way > 0));
      degree = ahead ?? chordDegree(c, degree, chord);
    }
    raw = cell.degree;
    played = degree;
    if (degree > high + 2) degree -= c.steps.length;
    if (degree < low - 2) degree += c.steps.length;
    const gap = cell.breath ? Math.min(0.5, cell.dur * 0.25) : 0;
    const strength = (cell.soft ? 0.62 : isStrong(c, t) ? 0.85 : 0.68) + swell + Math.max(-0.04, Math.min(0.05, (degree - anchor) * 0.01));
    out.push({
      // nearly legato, but never longer than its cell (or two notes sound at once)
      t, dur: Math.max(Math.min(c.step, cell.dur * 0.97), (cell.dur - gap) * 0.97),
      midi: fitToChord(degreeMidi(c, degree), chord, c.scalePcs),
      vel: Math.min(0.95, strength + c.rng.range(-0.05, 0.05)),
    });
  }
  return out;
}

// a passing note: the longest note of a beat or more split in two, the second half a step away
function decorate(cells, rng, unit) {
  const long = cells.reduce((best, cell) => (cell.dur >= 1 && (!best || cell.dur > best.dur) ? cell : best), null);
  if (!long) return cells;
  const half = Math.max(unit, Math.round(long.dur / 2 / unit) * unit);
  return cells.flatMap((cell) => (cell === long ? [{ ...cell, dur: half }, { t: cell.t + half, dur: cell.dur - half, degree: cell.degree + rng.pick([1, -1]) }] : [cell]));
}

// a phrase's swell: louder towards its middle, softer as it comes to rest
const SWELL = [0, 0.03, 0.05, -0.03];

// a melody (or a counter melody's own tune). riff: a hook over and over. rests: every other two bar
// phrase empty, the last note ringing into it (c418's sparse piano). a singer's tune keeps near their
// own note (home)
const singerSpan = (c, low, high) => (INSTRUMENTS[c.layer.instrument]?.home ? [Math.max(low, -3), Math.min(high, 4)] : [low, high]);
function tune(c, { density, low: wide, high: tall, plan4, riff, rests }) {
  const [low, high] = singerSpan(c, wide, tall);
  const { song, layer, rng } = c;
  const { theme, hook, motif: themed } = themeMotif(c, density, riff);
  let motif = themed;
  let variant = makeMotif(theme, c, density, hook, null, motif.rhythm);
  const seq = theme.pick([1, -1, -1, 2]);
  let base = theme.int(0, 2);
  const pickup = !rests && density >= 0.4 && theme.chance(c.mood.phrasing?.pickup ?? (song.style !== 'ambient' ? 0.5 : 0.25));
  // the second idea: its own rhythm, slower than a busy motif and busier than a slow one
  const contrast = density > 0.55 ? density * 0.55 : Math.min(0.95, density + 0.3);
  let second = makeMotif(theme, c, contrast, false);
  // what this part does with it. A plays it as it is
  const treat = makeRng(song.seed, partSeed(layer, c.section.part), 'treat', c.section.part);
  const way = c.section.part === 'B' ? treat.weighted({ raise: 2, own: 2 }) : c.section.part === 'C' ? treat.weighted({ slow: 2, own: 1 }) : 'same';
  if (way === 'raise') base += treat.int(2, 3);
  if (way === 'own') motif = makeMotif(treat, c, density, hook);
  if (way === 'slow') motif = makeMotif(treat, c, density * 0.45, false, motif.contour);
  if (way === 'own' || way === 'slow') {
    variant = makeMotif(treat, c, density, false, null, motif.rhythm);
    second = makeMotif(treat, c, way === 'slow' ? density * 0.7 : contrast, false);
  }

  const phraseBars = rests ? 2 : c.bars >= 4 && (plan4 || riff || rng.chance(0.75)) ? 4 : Math.min(2, c.bars);
  const phrases = Math.ceil(c.bars / phraseBars);
  const question = rng.pick(riff ? RIFF_PLANS : QUESTION_PLANS);
  const answer = riff ? question : rng.pick(ANSWER_PLANS);
  const middle = rng.pick(riff ? RIFF_MIDDLES : MIDDLE_PLANS);
  const planFor = (phrase) => {
    // fragments: mostly the motif, the second idea every fourth time
    if (rests) return Math.floor(phrase / 2) % 4 === 2 ? ['b', 'e'] : ['m', 'e'];
    // two bar phrases take turns: the motif, new notes on its rhythm, the motif, the second idea
    if (phraseBars === 2) return [['m', 'e'], ['v', 'e'], ['m', 'e'], ['b', 'e']][phrase % 4];
    if (phraseBars < 2) return ['e'];
    if (phrase % 4 === 2 && phrases >= 4) return middle;
    return phrase % 2 ? answer : question;
  };
  // a later time round a part can change how its last phrase goes (c.vary is per time round)
  const lastPlan = c.section.take > 0 && c.vary.chance(0.5) ? c.vary.pick(riff ? RIFF_PLANS : ANSWER_PLANS).slice(4 - phraseBars) : null;
  // each phrase starts from an anchor, moved so the ideas' whole span stays inside the range
  const steps = [...motif.notes, ...variant.notes, ...second.notes].flatMap((n) => [n.step, -n.step]);
  const top = Math.max(0, ...steps) + Math.max(0, seq * 2);
  const bottom = Math.min(0, ...steps) + Math.min(0, seq * 2);
  const fit = (degree) => Math.max(low - bottom, Math.min(high - top, degree));
  const anchorAt = (bar) => chordDegree(c, fit(base), chordAt(c, c.start + bar * c.bpb));
  const unit = 1 / c.sub;

  const notes = [];
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const place = bar % phraseBars;
    const phrase = Math.floor(bar / phraseBars);
    if (rests && phrase % 2) continue;
    const lastPhrase = bar >= c.bars - phraseBars;
    const plan = (lastPhrase && lastPlan) || planFor(phrase);
    // the section's last bar always ends, even when the phrases don't divide it evenly
    const kind = bar === c.bars - 1 ? 'e' : plan[place];
    const anchor = anchorAt(bar - place);
    const climbs = plan.slice(0, place + 1).filter((k) => k === 's').length;
    let cells;
    if (kind === 'e') {
      // the first half of the phrase's idea, then one long note. only notes that finish by half way,
      // or a whole bar note spills into the next bar
      const idea = plan.includes('m') ? motif : second;
      const head = idea.notes.filter((n) => n.t + n.dur <= c.bpb / 2 + 1e-6);
      cells = head.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
      const from = head.length ? head[head.length - 1].t + head[head.length - 1].dur : 0;
      // questions and answers: the first of each pair of phrases ends open, the second comes home
      const closed = lastPhrase || (rests ? phrase / 2 : phrase) % 2 >= 1;
      const target = landing(c, cells.length ? cells[cells.length - 1].degree : anchor, chordAt(c, barStart + from), closed);
      // a pickup: the long note stops short, and a note or two step into the next phrase's first
      const into = bar + 1 < c.bars && pickup ? anchorAt(bar + 1) : null;
      const lead = into === null ? 0 : c.bpb - from >= 1 + 2 * unit && theme.chance(0.5) ? 2 : c.bpb - from >= 1 + unit ? 1 : 0;
      // with rests it rings into the empty bars, but not past the section's end
      const ring = rests && bar + 1 < c.bars;
      const until = ring ? c.bpb * 1.5 : c.bpb - lead * unit;
      cells.push({ t: from, dur: until - from, degree: target, settled: true, breath: !lead && !ring });
      const side = seq > 0 ? -1 : 1;
      for (let k = lead; k >= 1; k--) cells.push({ t: c.bpb - k * unit, dur: unit, degree: into + side * k, settled: true, soft: true });
    } else {
      const source = kind === 'v' ? variant : kind === 'b' ? second : motif;
      cells = source.notes.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + (kind === 'i' ? -n.step : n.step) + (kind === 's' ? climbs * seq : 0) }));
      // a passing note now and then, later times round, never in a phrase's first bar
      if (c.section.take > 0 && place > 0 && c.vary.chance(0.3)) cells = decorate(cells, c.vary, unit);
    }
    notes.push(...sing(c, cells, barStart, low, high, phraseBars === 4 ? SWELL[place] : 0, anchor));
  }
  return notes;
}

// ---------- solos ----------
//
// a solo is a long line that doesn't repeat (addSolo, section.lead), built four bars at a time from
// its own new motifs: an idea, the idea again a step away or with new notes, a new idea (often a run),
// then a long note to breathe on. it climbs to a peak two thirds in, comes down to land home, and half
// the time quotes the theme once
function solo(c) {
  const { song, layer } = c;
  const own = tuneDensity(layer);
  const density = song.style === 'ambient' ? Math.min(own, layer.density * 0.55) : Math.max(0.45, own);
  // a little higher than the tune goes, so the peak stands out (not for a singer, singerSpan)
  const [low, high] = singerSpan(c, -4, 9);
  const phrases = Math.ceil(c.bars / 4);
  const picks = makeRng(song.seed, layer.seed, 'solo', c.section.index);
  const quote = phrases > 1 && picks.chance(0.5) ? picks.int(0, phrases - 2) : -1;
  const notes = [];
  for (let phrase = 0; phrase < phrases; phrase++) {
    const r = makeRng(song.seed, layer.seed, 'solo', c.section.index, phrase);
    // how far up the climb this phrase is, 0 to 1 and back
    const p = (phrase + 0.5) / phrases;
    const lift = p <= 0.67 ? p / 0.67 : (1 - p) / 0.33;
    const busy = clamp01(density * (0.8 + 0.45 * lift));
    const idea = phrase === quote ? themeMotif(c, own, layer.pattern === 'riff').motif : makeMotif(r, c, busy, false);
    const shift = r.pick([1, -1, 2]);
    const again = r.chance(0.5) ? { notes: idea.notes.map((n) => ({ ...n, step: n.step + shift })) } : makeMotif(r, c, busy, false, null, idea.rhythm);
    const run = r.chance(0.45) ? (r.chance(0.5) ? CONTOURS.climb(r) : CONTOURS.fall(r)) : null;
    const next = makeMotif(r, c, Math.min(1, busy + 0.2), false, run);
    const span = [idea, again, next].flatMap((one) => one.notes.map((n) => n.step));
    const reach = Math.round(-1 + 5 * lift);
    const anchor = chordDegree(c, Math.max(low - Math.min(0, ...span), Math.min(high - Math.max(0, ...span), reach)), chordAt(c, c.start + phrase * 4 * c.bpb));
    for (let place = 0; place < 4 && phrase * 4 + place < c.bars; place++) {
      const bar = phrase * 4 + place;
      const barStart = c.start + bar * c.bpb;
      const final = bar === c.bars - 1;
      let cells;
      if (place === 3 || final) {
        // a breath: the first half of the last idea, then a long note. the very last comes home
        const head = next.notes.filter((n) => n.t + n.dur <= c.bpb / 2 + 1e-6);
        cells = head.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
        const from = head.length ? head[head.length - 1].t + head[head.length - 1].dur : 0;
        const target = landing(c, cells.length ? cells[cells.length - 1].degree : anchor, chordAt(c, barStart + from), final);
        cells.push({ t: from, dur: c.bpb - from, degree: target, settled: true, breath: true });
      } else cells = [idea, again, next][place].notes.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
      notes.push(...sing(c, cells, barStart, low, high, SWELL[place] + lift * 0.04, anchor));
    }
  }
  // a chord with no notes in the scale can't be reached in scale steps, so the last note goes to its root
  const last = notes[notes.length - 1];
  const chord = last && chordAt(c, last.t);
  if (chord && !chord.pcs.has(mod12(last.midi))) last.midi = near(chord.root, last.midi);
  return notes;
}

// a counter melody in harmony: the melody a third or a sixth below (the intervals that blend), on its
// longer notes
function harmonise(c, density) {
  const below = c.rng.chance(0.65) ? 2 : 5;
  return c.melody.filter((note) => note.dur >= c.step * 2 && c.rng.chance(0.4 + density * 0.6)).map((note) => {
    let midi = note.midi;
    for (let step = 0; step < below; step++) {
      midi--;
      while (!c.scalePcs.has(mod12(midi))) midi--;
    }
    while (midi > c.center + 9) midi -= 12;
    return { t: note.t, dur: note.dur, midi: fitToChord(midi, chordAt(c, note.t), c.scalePcs), vel: note.vel * 0.8 };
  });
}

// ---------- counterpoint: a second melody ----------
//
// a second melody that fits the first note for note, the way toby fox stacks two tunes:
//   - its rhythm is its own motif's, so it comes back when the tune does, but it holds where the tune's
//     busy and moves where the tune holds
//   - each note is the cheapest by the old rules of counterpoint: thirds and sixths under the tune
//     (CONSONANCE), never over it, steps over leaps, contrary motion, no parallel fifths or octaves,
//     chord notes on strong beats. ties go by pitch and place, so the same bar gets the same line
// how badly each interval under the tune clashes, in semitones (0 the unison or octave)
const CONSONANCE = [1.2, 7, 3, 0, 0, 2, 4.5, 0.8, 0, 0, 3, 6];
function counterpoint(c, density) {
  const melody = [...c.melody].sort((a, b) => a.t - b.t);
  const { motif } = themeMotif(c, density, false);
  // a slow rhythm of its own, for the bars where the tune's busy
  const held = makeMotif(makeRng(c.song.seed, c.layer.seed, 'held'), c, 0.1, false);
  const sounding = (t) => melody.find((note) => note.t <= t + 1e-6 && t < note.t + note.dur - 1e-6);
  const low = c.center - 9;
  const high = c.center + 8;
  const notes = [];
  let last = null;
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const busy = melody.filter((note) => note.t >= barStart - 1e-6 && note.t < barStart + c.bpb - 1e-6).length;
    const rhythm = busy >= Math.max(3, c.bpb) ? held.rhythm : motif.rhythm;
    for (const cell of rhythm) {
      const t = barStart + cell.t;
      const chord = chordAt(c, t);
      const strong = isStrong(c, t) || cell.dur >= 1;
      const tune = sounding(t);
      const tuneMove = tune && last?.tune ? Math.sign(tune.midi - last.tune.midi) : 0;
      let best = null;
      let bestCost = Infinity;
      // always at least an octave of room under the tune, even a low one
      const from = tune ? Math.min(low, tune.midi - 12) : low;
      const to = tune ? Math.min(high, tune.midi) : high;
      for (let midi = from; midi <= to; midi++) {
        const pc = mod12(midi);
        if (!c.scalePcs.has(pc) && !chord.pcs.has(pc)) continue;
        let cost = strong && !chord.pcs.has(pc) ? 3 : 0;
        if (tune) {
          const gap = tune.midi - midi;
          if (gap < 0) cost += 12;
          else if (gap > 0 && gap < 3) cost += 5;
          if (gap > 19) cost += 1.5;
          // a clash on a weak beat, moving by step, is a passing note, and half as bad
          cost += CONSONANCE[mod12(gap)] * (strong ? 1 : 0.5);
          const move = last ? Math.sign(midi - last.midi) : 0;
          if (tuneMove && move) cost += move === tuneMove ? 0.4 : -0.5;
          if (last?.tune && move && tuneMove) {
            const before = mod12(last.tune.midi - last.midi);
            if ((before === 0 || before === 7) && before === mod12(gap)) cost += 4;
          }
        }
        if (last) {
          const leap = Math.abs(midi - last.midi);
          cost += leap === 0 ? 0.7 : leap <= 2 ? 0 : leap <= 4 ? 0.4 : leap <= 7 ? 1.5 : 4;
        } else cost += Math.abs(midi - c.center) * 0.15;
        cost += ((midi * 7 + Math.round(cell.t * 12) * 13) % 10) / 33;
        if (cost < bestCost) {
          bestCost = cost;
          best = midi;
        }
      }
      notes.push({ t, dur: cell.dur * 0.95, midi: best, vel: strong ? 0.66 : 0.56 });
      last = { midi: best, tune };
    }
  }
  return notes;
}

// jazz comping rhythms, a bar each, [beat, length]: the charleston (one, and the and of two), an
// anticipation pushing into the next bar, and a couple of looser ones. by beats in the bar
const COMP_RHYTHMS = {
  4: [[[0, 0.6], [1.5, 0.6]], [[1.5, 0.5], [3, 0.6]], [[0.5, 0.5], [2.5, 0.8]], [[0, 0.4], [2.5, 0.5], [3.5, 0.4]]],
  3: [[[0, 0.6], [1.5, 0.6]], [[1, 0.5], [2, 0.5]], [[0, 0.5], [2.5, 0.4]]],
  5: [[[0, 0.6], [1.5, 0.6], [3, 0.6]], [[1.5, 0.5], [3.5, 0.6]]],
};
// where a bossa guitar plucks its chords in a bar (the thumb has the beats)
const BOSSA_HITS = { 4: [0.75, 1.5, 2.5, 3.25], 3: [0.75, 1.5, 2.5], 5: [0.75, 1.5, 2.5, 3.25, 4.5], 2: [0.67, 1.33] };

// the bells' chimes: [beats after the chord changes, which chord note counting down from the top]
const BELL_FIGURES = [
  [[0, 0], [0.5, 1], [1, 2]],
  [[0, 0], [1, 1]],
  [[0, 2], [0.5, 1], [1, 0]],
  [[0, 0], [1.5, 1], [2, 0]],
  [[0, 1], [0.5, 0], [1, 1], [1.5, 2]],
];

// ---------- guitars ----------
//
// a guitar plays chords in a guitar's shapes, low and slid along the neck as one shape (parallel, not
// voice led). a power chord is the root, fifth and octave: with no third, distortion growls rather
// than mushes, so the loud patterns play it. ringing, strummed and tremolo chords are the whole shape
// (an e shaped barre chord, with the chord's colour note on top)
function guitarShape(c, chord, full) {
  const root = near(chord.root, c.center);
  // the chord's own fifth (a diminished chord's is flat), or a plain fifth (a sus chord's)
  const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
  if (!full) return [root, root + fifth, root + 12];
  const shape = [root, root + fifth, root + 12, root + 12 + chord.tones[1], root + 12 + fifth];
  const colour = chord.tones.find((tone) => tone > 8);
  if (colour) shape.push(root + 12 + colour);
  return shape;
}

// a strum: the shape's notes a moment apart, low to high on the way down, and only the top strings,
// high to low, on the way back up. mute: palm muted
function strum(notes, shape, t, dur, vel, { up = false, mute = false, spread = 0.01 } = {}) {
  const strings = up ? shape.slice(-3).reverse() : shape;
  strings.forEach((midi, i) => notes.push({ t: t + i * spread, dur: Math.max(0.05, dur - i * spread), midi, vel: vel - i * 0.02, ...(mute ? { mute } : {}) }));
}

// a strumming hand, an eighth (a third of a beat in 6/8) a character: D down, U up, . a miss
const STRUMS = { '4/4': 'D.DU.UDU', '3/4': 'D.DUDU', '6/8': 'D.UD.U', '5/4': 'D.DU.UDUDU' };

// riffs, written like grooves, a character a 16th of 4/4: m a palm muted chug on the low root, x an
// open power chord, n the next note of the riff's line. fast ones blur above 150 bpm, and slow ones
// (sabbath's) are for slow songs
const RIFFS = [
  { cells: 'm.m.n.m.m.n.m.m.' },
  { cells: 'x.m.m.n.x.m.n.n.' },
  { cells: 'x.....m.m.m.n.n.' },
  { cells: 'x.m.n.m.m.m.n.m.' },
  // the gallop, an eighth and two sixteenths (iron maiden), thrash, and pantera's stop and start
  { cells: 'x.mmm.mmm.mmn.n.', fast: true },
  { cells: 'mmmmn.mmmmn.x.x.', fast: true },
  { cells: 'x..m.mx..m.mn.n.', fast: true },
  { cells: 'x.......n...n.n.', slow: true },
  { cells: 'x...........n.n.', slow: true },
  { cells: 'x.....n.....x...', slow: true },
  { cells: 'x.......x...n.m.', slow: true },
];
// a riff's cells for the song's bar (6/8 takes every other character, other bars repeat or cut it)
function riffCells(cells, c) {
  let line = c.sub === 3 ? [...cells].filter((_, i) => i % 2 === 0).join('') : cells;
  const steps = Math.round(c.bpb / c.step);
  while (line.length < steps) line += line;
  return line.slice(0, steps);
}

// the song's riff (the chug pattern), the same every part and following the chords: its line walks the
// scale up from each chord's root, turning round in every fourth bar, and is marked line so listening
// moves it like any line. from the layer's seed, so a bass doubling it (bass: an octave down, never a
// chord) plays exactly the guitar's. in a breakdown it chugs on the kick
function riff(c, layer, bass) {
  const { song } = c;
  const r = makeRng(song.seed, layer.seed, 'riff');
  const pool = RIFFS.filter((one) => (song.tempo < 96 ? one.slow : !one.slow && !(one.fast && song.tempo > 150)));
  const cells = riffCells(r.pick(pool).cells, c);
  const from = r.int(0, 1);
  const way = r.pick([-1, -1, 1]);
  const breakdown = c.section.part === 'C' && song.style !== 'ambient' && !!songMood(song).breakdown;
  // the riff's grid is the groove's (16ths, or 8ths in 6/8)
  const grid = c.bpb / cells.length;
  const plan = [...cells].map((ch, i) => (breakdown ? (c.groove.lines.k[i] > 0 ? (i === 0 ? 'x' : 'm') : '.') : ch));
  const hits = plan.map((ch) => ch !== '.');
  const notes = [];
  const add = (t, dur, midis, vel, flags = {}) => { for (const midi of midis) notes.push({ t, dur, midi, vel, ...flags }); };
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const turn = bar % 4 === 3 ? -1 : 1;
    let n = 0;
    for (let i = 0; i < plan.length; i++) {
      if (!hits[i]) continue;
      const t = barStart + i * grid;
      const chord = chordAt(c, t);
      const root = near(chord.root, c.center);
      const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
      const length = gapAfter(hits, i) * grid;
      if (plan[i] === 'm') add(t, Math.min(length, grid * 2) * 0.9, [root], 0.72, bass ? {} : { mute: true });
      else if (plan[i] === 'x') add(t, length * 0.95, bass ? [root] : [root, root + fifth, root + 12], 0.9);
      else {
        const ladder = [];
        for (let midi = root + 1; midi <= root + 12; midi++) if (c.scalePcs.has(mod12(midi)) || midi === root + 12) ladder.push(midi);
        // bounce inside the ladder: 0 1 2 ... top ... 2 1 0 1 ...
        const span = Math.max(1, ladder.length - 1);
        const at = ladder.length - 1 - from + way * turn * n++;
        const folded = ((at % (2 * span)) + 2 * span) % (2 * span);
        const midi = ladder[folded > span ? 2 * span - folded : folded];
        add(t, length * 0.95, [midi], 0.84, { line: true });
      }
    }
  }
  return notes;
}

// ---------- the bass hook ----------
//
// a bass line that's a tune of its own (toby fox's hip shop, funk, motown): a short lick round the
// chord's notes on the drums' rhythm, the same every bar so it's a hook, leading into each new chord
// from a semitone away and running up into every fourth bar. a lick is chord notes in hit order: r root,
// o octave, f fifth, t third, s seventh (a sixth on a plain major chord), l the fifth underneath
const LICKS = ['r r o s', 'r o f s', 'r f o f', 'r o r f', 'r t f o', 'r l r o', 'r r f t', 'r o s f', 'r f s o'];
function bassHook(c) {
  const { lines, grid, perBeat, steps } = c.groove;
  // the lick, the way in and the fill are picked once a part, so the hook comes back with it
  const r = makeRng(c.song.seed, partSeed(c.layer, c.section.part), 'hook', c.section.part);
  const lick = r.pick(LICKS).split(' ');
  const below = r.chance(0.6);
  const fills = c.bars >= 4 && r.chance(0.7);
  // the groove's kick and comping hits (only the kick when it's quiet) and always the first beat, with
  // at least three notes a bar
  const hits = lines.k.map((v, i) => i === 0 || v > 0 || (c.layer.density >= 0.4 && lines.c[i] > 0));
  if (hits.filter(Boolean).length < 3) hits[Math.max(1, Math.round(steps / 2) - Math.ceil(perBeat / 2))] = true;
  const interval = (name, chord) => {
    const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
    const seventh = chord.tones.includes(10) ? 10 : chord.tones[1] === 4 ? 9 : 10;
    return { r: 0, o: 12, f: fifth, t: chord.tones[1], s: seventh, l: fifth - 12 }[name] ?? 0;
  };
  const notes = [];
  const add = (t, dur, midi, vel) => notes.push({ t, dur, midi, vel });
  for (const chord of c.chords) {
    const root = near(chord.root, c.center);
    const next = nextChord(c, chord);
    const end = chord.t + chord.dur;
    for (let t = chord.t; t < end - 1e-6; t += grid) {
      const i = stepInBar(c, t);
      if (!hits[i] && t > chord.t + 1e-6) continue;
      const bar = Math.floor((t - c.start) / c.bpb + 1e-9);
      // the last beat of every fourth bar is the fill's (below)
      if (fills && bar % 4 === 3 && t >= c.start + (bar + 1) * c.bpb - 1 - 1e-6) continue;
      const gap = Math.min(gapAfter(hits, i) * grid, end - t);
      const name = lick[hits.slice(0, i).filter(Boolean).length % lick.length];
      // a new chord always gets its root. the last note before the next chord leads into it
      let midi = root + interval(name, chord);
      if (t <= chord.t + 1e-6) midi = root;
      else if (t + gap >= end - 1e-6 && next !== chord) midi = near(next.root, c.center) + (below ? -1 : 1);
      add(t, gap * (name === 'o' ? 0.55 : 0.8), midi, i % perBeat === 0 ? 0.85 : name === 'o' ? 0.64 : 0.72);
    }
  }
  // the fill: the fourth bar's last beat a run up the scale, landing on the next chord's root
  if (fills) {
    for (let bar = 3; bar < c.bars; bar += 4) {
      const from = c.start + (bar + 1) * c.bpb - 1;
      const coming = from + 1 < c.end - 1e-6 ? chordAt(c, from + 1) : nextChord(c, c.chords[c.chords.length - 1]);
      const target = near(coming.root, c.center);
      const run = [];
      for (let midi = target - 1; run.length < perBeat && midi > target - 12; midi--) if (c.scalePcs.has(mod12(midi))) run.unshift(midi);
      run.forEach((midi, k) => add(from + k * grid, grid * 0.8, midi, k === 0 ? 0.78 : 0.66));
    }
  }
  return notes;
}

const COMPOSERS = {
  melody(c) {
    const { pattern } = c.layer;
    const density = tuneDensity(c.layer);
    if (pattern === 'long') return tune(c, { density, low: -3, high: 7, plan4: true });
    // riff: a hook played bar after bar, with only small changes, like a chiptune or club lead
    if (pattern === 'riff') return tune(c, { density, low: -4, high: 7, riff: true });
    // fragments: two bars of tune, then two of space with the last note ringing (minecraft's piano)
    if (pattern === 'fragments') return tune(c, { density, low: -3, high: 7, rests: true });
    const notes = tune(c, { density, low: -4, high: 7 });
    if (pattern !== 'calls') return notes;
    // calls: a bar of tune, its last note held through half the next bar, then room for an answer
    const barOf = (note) => Math.floor((note.t - c.start) / c.bpb + 1e-9);
    const kept = notes.filter((note) => barOf(note) % 2 === 0);
    for (let i = 0; i < kept.length; i++) {
      const next = kept[i + 1];
      if (next && barOf(next) === barOf(kept[i])) continue;
      const until = Math.min(c.end, c.start + (barOf(kept[i]) + 1.5) * c.bpb);
      kept[i].dur = Math.max(kept[i].dur, until - kept[i].t);
    }
    return kept;
  },

  counter(c) {
    const { pattern, density } = c.layer;
    // takes the tune (orchestration): the melody's line on this instrument, ornamented as its own
    // (not marked as added by hand). with no melody, a tune of its own
    if (pattern === 'tune') {
      const line = c.line();
      if (line.length) return line.map(({ added, ...note }) => ({ ...note, midi: note.midi + c.layer.octave * 12 }));
      return tune(c, { density: tuneDensity(c.layer), low: -4, high: 6 });
    }
    if (pattern === 'harmony' && c.melody) return harmonise(c, density);
    // in a weave the second theme is written against the tune as it goes the first time round its part,
    // even where the tune rests, so it's the same theme alone as when they meet (counterpoint picks a
    // note at a time, so a later time round's few new notes in the tune sent it somewhere else). the
    // band's listening smooths any rub with those new notes
    if (pattern === 'counterpoint' && c.weave) {
      const line = c.line(0);
      if (line.length) return counterpoint({ ...c, melody: line }, tuneDensity(c.layer));
    }
    // a second melody against the first (counterpoint), when there's a first to play against
    if (pattern === 'counterpoint' && c.melody?.length) return counterpoint(c, tuneDensity(c.layer));
    const notes = tune(c, { density: tuneDensity(c.layer), low: -4, high: 6 });
    if (pattern === 'free' || !c.melody) return notes;
    // answers: whole bars where the melody rests or holds a note. with nowhere to answer, it harmonises
    const starts = {};
    for (const note of c.melody) {
      const bar = Math.floor((note.t - c.start) / c.bpb + 1e-9);
      starts[bar] = (starts[bar] || 0) + 1;
    }
    const open = (bar) => (starts[bar] || 0) <= 1;
    const answers = notes.filter((note) => open(Math.floor((note.t - c.start) / c.bpb + 1e-9)));
    return answers.length ? answers : harmonise(c, density);
  },

  arp(c) {
    const { pattern, density, span, rate } = c.layer;
    const step = rateStep(rate, c.sub);
    const notes = [];
    let previous = null;
    let index = 0;
    // its rests and random order are picked once a part, so it repeats a shape you can follow
    const shape = makeRng(c.song.seed, partSeed(c.layer, c.section.part), 'shape', c.section.part);
    const rests = Array.from({ length: Math.round(c.bpb / step) }, (_, i) => i > 0 && shape.chance((1 - density) * 0.45));
    const order = Array.from({ length: 16 }, () => shape.int(0, 63));
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones.filter((tone) => tone < 12), c.center, previous);
      previous = voiced;
      let pool = [];
      for (let octave = 0; octave < span; octave++) pool.push(...voiced.map((midi) => midi + octave * 12));
      if (pattern === 'down') pool.reverse();
      if (pattern === 'updown') pool = [...pool, ...pool.slice(1, -1).reverse()];
      if (pattern === 'converge') pool = pool.map((_, i) => (i % 2 ? pool[pool.length - 1 - (i >> 1)] : pool[i >> 1]));
      // twinkle: a high note ringing between the others, emo's fingerpicked clean guitar
      if (pattern === 'twinkle' && pool.length > 1) pool = pool.slice(0, -1).flatMap((midi) => [midi, pool[pool.length - 1]]);
      // roll: a banjo's forward roll (t i m t i m t m), turning over against the beat
      if (pattern === 'roll' && pool.length > 2) {
        const [low, mid, top] = [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]];
        pool = [low, mid, top, low, mid, top, low, top];
      }
      for (let t = chord.t; t < chord.t + chord.dur - 1e-6; t += step) {
        const midi = pool[(pattern === 'random' ? order[index % order.length] : index) % pool.length];
        index++;
        // (a roll never rests: a banjo player's fingers keep going)
        if (pattern !== 'roll' && rests[Math.round(((t - c.start) % c.bpb) / step) % rests.length]) continue;
        const onBeat = Math.abs((t - c.start) % 1) < 1e-6;
        notes.push({ t, dur: step * (pattern === 'twinkle' ? 2 : 0.75), midi, vel: onBeat ? 0.78 : 0.6 });
      }
    }
    return notes;
  },

  bells(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'double') {
      // doubles the tune (orchestration): the melody's line an octave up. at a quick tempo only notes
      // of half a beat or more (the shape, not every run), none ringing over two beats
      const line = c.line();
      const quick = c.song.tempo >= 130;
      // (alone, in a weave's intrada and trio, they're the tune, so they play it full)
      const level = c.weave && !c.melody ? 0.95 : 0.75;
      return line.filter((note) => !quick || note.dur >= 0.5 - 1e-6).map((note) => ({ t: note.t, dur: Math.min(note.dur, 2), midi: note.midi + 12 + c.layer.octave * 12, vel: note.vel * level }));
    }
    if (pattern === 'phasing') {
      // a few notes, each on its own loop length (eno's tape loops), counted from the song's start so
      // they drift across sections. two to four bars give or take a beat, always on a whole beat
      const rng = makeRng(c.song.seed, c.layer.seed, 'loops');
      const count = 2 + Math.round(density * 2);
      const pool = [0, 4, 2, 7, 5, 9];
      const notes = [];
      for (let i = 0; i < count; i++) {
        const degree = pool[(i * 2 + rng.int(0, 5)) % pool.length];
        const period = rng.pick([2, 3, 4]) * c.bpb + rng.pick([0, 0, 1, 2]);
        const phase = rng.int(0, c.bpb * 2 - 1);
        const dur = rng.range(2, 4);
        const first = phase + Math.ceil((c.start - phase) / period) * period;
        for (let t = first; t < c.end - 1e-6; t += period) {
          notes.push({ t, dur, midi: fitToChord(degreeMidi(c, degree), chordAt(c, t), c.scalePcs), vel: rng.range(0.45, 0.7) });
        }
      }
      return notes;
    }
    // chimes (saved as "sparkle"): one short figure of the chord's notes, rung as the chord changes (and
    // every two bars through long chords), every time when busy, every other time when not
    const shape = makeRng(c.song.seed, partSeed(c.layer, c.section.part), 'chimes', c.section.part);
    const figure = shape.pick(BELL_FIGURES);
    const every = density > 0.55 ? 1 : 2;
    const notes = [];
    let previous = null;
    let ring = 0;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones.filter((tone) => tone < 12), c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      for (let at = chord.t; at < end - 1e-6; at += c.bpb * 2, ring++) {
        if (ring % every) continue;
        for (const [after, index] of figure) {
          if (at + after >= end - 1e-6) continue;
          notes.push({ t: at + after, dur: Math.min(2.5, end - at - after), midi: voiced[Math.max(0, voiced.length - 1 - index)], vel: after === 0 ? 0.62 : 0.5 });
        }
      }
    }
    return notes;
  },

  keys(c) {
    const { pattern, density } = c.layer;
    const notes = [];
    let previous = null;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones, c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      if (pattern === 'broken') {
        // alberti bass: low, high, middle, high, the classical left hand
        const order = voiced.length >= 3 ? [0, voiced.length - 1, 1, voiced.length - 1] : [0, 1];
        const step = rateStep(c.layer.rate, c.sub);
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) notes.push({ t, dur: step * 1.6, midi: voiced[order[i % order.length]], vel: i % order.length === 0 ? 0.72 : 0.55 });
      } else if (pattern === 'strum') {
        // the chord at the start of each bar, its notes a moment apart like a guitar
        for (let t = chord.t; t < end - 1e-6; t += c.bpb) {
          voiced.forEach((midi, i) => notes.push({ t: t + i * 0.035, dur: Math.min(c.bpb, end - t) * 0.95, midi, vel: 0.62 - i * 0.03 }));
        }
      } else if (pattern === 'waltz') {
        // oom-pah: the root down low on the first beat, the chord on the others
        const root = near(chord.root, c.center - 12);
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const beat = Math.round((t - c.start) % c.bpb);
          if (beat === 0 || (c.bpb === 4 && beat === 2)) notes.push({ t, dur: 0.9, midi: root, vel: 0.75 });
          else for (const midi of voiced) notes.push({ t, dur: 0.45, midi, vel: 0.5 });
        }
      } else if (pattern === 'comp') {
        // jazz comping: rootless voicings (third, seventh, ninth: the root's the bass's), in rhythms
        // that change bar to bar and come round every four (COMP_RHYTHMS)
        const third = chord.tones.find((tone) => tone === 3 || tone === 4) ?? chord.tones[1];
        const seventh = chord.tones.find((tone) => tone >= 9 && tone <= 11) ?? (third === 4 ? 9 : 10);
        const rootless = voiceChord(chord.root, [third, seventh, 14], c.center, previous);
        for (let bar = Math.floor((chord.t - c.start) / c.bpb); c.start + bar * c.bpb < end - 1e-6; bar++) {
          const rhythms = COMP_RHYTHMS[c.bpb] || [[[0, 0.6], [c.bpb / 2, 0.6]]];
          const hits = makeRng(c.song.seed, partSeed(c.layer, c.section.part), 'comp', c.section.part, bar % 4).pick(rhythms);
          for (const [at, dur] of hits) {
            const t = c.start + bar * c.bpb + at;
            if (t < chord.t - 1e-6 || t >= end - 1e-6) continue;
            rootless.forEach((midi, i) => notes.push({ t, dur, midi, vel: 0.58 - i * 0.03 }));
          }
        }
      } else if (pattern === 'skank') {
        // a reggae skank: the chord chopped short on every off beat, never on the beat
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          for (let k = 1; k < c.sub; k++) {
            const at = t + k / c.sub;
            if (at < end - 1e-6) voiced.forEach((midi, i) => notes.push({ t: at + i * 0.008, dur: 0.18, midi, vel: 0.62 - i * 0.02 }));
          }
        }
      } else if (pattern === 'bossa') {
        // bossa nova guitar: the thumb on the root and fifth, the fingers plucking the chord between
        const root = near(chord.root, c.center - 12);
        for (let bar = Math.floor((chord.t - c.start) / c.bpb); c.start + bar * c.bpb < end - 1e-6; bar++) {
          const barStart = c.start + bar * c.bpb;
          for (let beat = 0; beat < c.bpb; beat += 2) {
            const t = barStart + beat;
            if (t >= chord.t - 1e-6 && t < end - 1e-6) notes.push({ t, dur: 1.5, midi: beat % 4 ? root + 7 : root, vel: 0.62 });
          }
          for (const at of BOSSA_HITS[c.bpb] || [0.75, 1.5]) {
            const t = barStart + at;
            if (t >= chord.t - 1e-6 && t < end - 1e-6) voiced.forEach((midi, i) => notes.push({ t: t + i * 0.01, dur: 0.45, midi, vel: 0.5 - i * 0.02 }));
          }
        }
      } else {
        // block: the chord on the groove's comping rhythm
        for (const [t, dur, vel] of compHits(c, chord, density)) for (const midi of voiced) notes.push({ t, dur: dur * 0.8, midi, vel });
      }
    }
    return notes;
  },

  // the guitar (guitarShape, and riff for the chugging pattern)
  guitar(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'chug') return riff(c, c.layer, false);
    const notes = [];
    const unit = 1 / c.sub;
    // (funk and boom chick play the whole chord too: a clean or acoustic guitar has no growl to avoid)
    const full = pattern === 'ring' || pattern === 'tremolo' || pattern === 'strum' || pattern === 'funk' || pattern === 'boomchick';
    const onBeat = (t) => Math.abs((t - c.start) % 1) < 1e-6;
    // eighths chug palm muted in the verse (part A) and ring in the chorus, the chord changes and
    // comping hits left open as accents
    const muted = c.section.part === 'A' && !c.section.lead;
    const comps = new Set();
    for (const chord of c.chords) for (const [t] of compHits(c, chord, 1)) comps.add(t.toFixed(3));
    for (const chord of c.chords) {
      const shape = guitarShape(c, chord, full);
      const end = chord.t + chord.dur;
      if (pattern === 'eighths') {
        for (let t = chord.t; t < end - 1e-6; t += unit) {
          const open = !muted || t === chord.t || comps.has(t.toFixed(3));
          strum(notes, shape, t, Math.min(unit, end - t) * (open ? 0.95 : 0.6), onBeat(t) ? 0.8 : 0.7, { mute: !open });
        }
      } else if (pattern === 'ring') {
        // struck once a bar and left to ring: a wall rather than a rhythm
        for (let t = chord.t; t < end - 1e-6; t += c.bpb) strum(notes, shape, t, Math.min(c.bpb, end - t), 0.75, { spread: 0.02 });
      } else if (pattern === 'tremolo') {
        // picked as fast as a hand goes (ten a second at most) on the lowest four strings: a shimmer,
        // not running notes, so MAX_RATE doesn't apply
        let step = 1 / (c.sub * 2);
        while (c.song.tempo / 60 / step > 10) step *= 2;
        for (let t = chord.t; t < end - 1e-6; t += step) for (const midi of shape.slice(0, 4)) notes.push({ t, dur: Math.min(step * 1.1, end - t), midi, vel: onBeat(t) ? 0.6 : 0.5 });
      } else if (pattern === 'strum') {
        // the strumming hand (STRUMS), each stroke ringing to the next. quiet: down on the beat only
        const hand = [...(STRUMS[c.song.meter] || 'D.')].map((stroke, i) => (density < 0.35 && i % c.sub ? '.' : stroke));
        const strokes = hand.map((stroke) => stroke !== '.');
        for (let t = chord.t; t < end - 1e-6; t += unit) {
          const i = Math.round(((t - c.start) % c.bpb) / unit) % hand.length;
          if (!strokes[i]) continue;
          strum(notes, shape, t, Math.min(gapAfter(strokes, i) * unit, end - t) * 0.95, hand[i] === 'D' ? 0.7 : 0.56, { up: hand[i] === 'U' });
        }
      } else if (pattern === 'funk') {
        // funk scratching: sixteenths muted to a "chk", the top strings ringing short on the comping hits
        const top = shape.slice(-3);
        const { lines, grid } = c.groove;
        for (let t = chord.t; t < end - 1e-6; t += grid) {
          const i = stepInBar(c, t);
          if (lines.c[i] > 0) strum(notes, top, t, Math.min(grid * 1.6, end - t), 0.72, { up: i % 2 === 1, spread: 0.006 });
          else if (density >= 0.3 || i % 2 === 0) strum(notes, top, t, grid * 0.5, 0.32, { up: i % 2 === 1, mute: true, spread: 0.004 });
        }
      } else if (pattern === 'boomchick') {
        // country's boom chick: a bass note (root, then fifth), then the top strings
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const beat = Math.round((t - c.start) % c.bpb);
          const dur = Math.min(1, end - t) * 0.9;
          if (beat % 2 === 0) notes.push({ t, dur, midi: beat === 0 || c.bpb < 4 ? shape[0] : shape[1] - 12, vel: 0.78 });
          else strum(notes, shape.slice(2), t, dur * 0.6, 0.6, { spread: 0.012 });
        }
      } else {
        // power chords on the groove's comping hits, each left to ring until the next
        for (const [t, dur, vel] of compHits(c, chord, density)) strum(notes, shape, t, dur * 0.95, vel + 0.18);
      }
    }
    return notes;
  },

  pad(c) {
    const { pattern, density } = c.layer;
    const notes = [];
    let previous = null;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones, c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      const hits = [];
      if (pattern === 'swell') for (let t = chord.t; t < end - 1e-6; t += c.bpb) hits.push([t, Math.min(c.bpb, end - t), 0.6]);
      else if (pattern === 'pulse') {
        // the chord over and over, a steady pulse under everything
        const step = rateStep(c.layer.rate, c.sub);
        for (let t = chord.t; t < end - 1e-6; t += step) hits.push([t, step * 0.55, Math.abs((t - c.start) % 1) < 1e-6 ? 0.62 : 0.48]);
      } else if (pattern === 'stabs') {
        for (const [t, dur, vel] of compHits(c, chord, density)) hits.push([t, Math.min(dur * 0.6, 0.75), vel]);
      } else if (pattern === 'pump') {
        // the chord every beat, ducking under the kick and swelling back (pump in synth.js)
        for (let t = chord.t; t < end - 1e-6; t += 1) hits.push([t, Math.min(1, end - t), 0.62, true]);
      } else hits.push([chord.t, chord.dur, 0.6]);
      for (const [t, dur, vel, pump] of hits) for (const midi of voiced) notes.push({ t, dur, midi, vel, ...(pump ? { pump } : {}) });
    }
    return notes;
  },

  drone(c) {
    const { pattern } = c.layer;
    const whole = (intervals, from = c.tonic) => intervals.map((interval) => ({ t: c.start, dur: c.end - c.start, midi: from + interval, vel: 0.7 }));
    // a singer or a didgeridoo holds the home note alone
    if (INSTRUMENTS[c.layer.instrument]?.home) return whole([0]);
    if (pattern === 'fifths') return whole([0, 7, 12, 19]);
    if (pattern === 'cluster') return whole(c.rng.pick([[0, 1, 7], [0, 6, 7], [0, 1, 5], [0, 3, 6], [0, 11, 13]]));
    if (pattern === 'follow') return c.chords.flatMap((chord) => [0, 7].map((interval) => ({ t: chord.t, dur: chord.dur, midi: near(chord.root, c.center) + interval, vel: 0.7 })));
    if (pattern === 'cycle') {
      // a tanpura's four strings plucked round and round (fifth, home twice an octave up, low home),
      // each ringing until it's plucked again
      const strings = [-5, 12, 12, 0];
      const step = c.song.tempo > 100 ? 2 : 1;
      const notes = [];
      for (let t = c.start, i = 0; t < c.end - 1e-6; t += step, i++) notes.push({ t, dur: Math.min(step * strings.length * 0.98, c.end - t), midi: c.tonic + strings[i % strings.length], vel: i % strings.length === 0 ? 0.7 : 0.6 });
      return notes;
    }
    return whole([0, 7]);
  },

  bass(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'hook') return bassHook(c);
    // doubling the chugging guitar's riff an octave down (or a riff of its own)
    if (pattern === 'riff') {
      const guitar = c.song.layers.find((layer) => layer.role === 'guitar' && layer.pattern === 'chug');
      return riff({ ...c, center: ROLES.guitar.center - 12 }, guitar || c.layer, true);
    }
    const notes = [];
    const add = (t, dur, midi, vel) => notes.push({ t, dur, midi, vel });
    for (const chord of c.chords) {
      const root = near(chord.root, c.center);
      const fifth = root + 7 > c.center + 9 ? root - 5 : root + 7;
      const end = chord.t + chord.dur;
      if (pattern === 'held') add(chord.t, chord.dur * 0.98, root, 0.8);
      else if (pattern === 'pulse' || pattern === 'octave') {
        const step = rateStep(c.layer.rate, c.sub);
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) add(t, step * 0.8, pattern === 'octave' && i % 2 ? root + 12 : root, i % 2 ? 0.62 : 0.8);
      } else if (pattern === 'rootfifth') {
        for (let bar = chord.t; bar < end - 1e-6; bar += c.bpb) {
          const length = Math.min(c.bpb, end - bar);
          if (c.bpb === 3) {
            add(bar, 0.9, root, 0.82);
            if (length > 1) add(bar + 1, 0.9, fifth, 0.6);
            if (length > 2) add(bar + 2, 0.9, fifth, 0.6);
          } else {
            const half = Math.ceil(c.bpb / 2);
            add(bar, Math.min(half, length) * 0.92, root, 0.82);
            if (length > half) add(bar + half, (length - half) * 0.92, fifth, 0.68);
          }
        }
      } else if (pattern === 'boogie') {
        // the blues' boogie: root, third, fifth, sixth, flat seventh and back down, an eighth a note
        const third = chord.tones.includes(3) && !chord.tones.includes(4) ? 3 : 4;
        const walk = [0, third, 7, 9, 10, 9, 7, third];
        const step = 1 / c.sub;
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) add(t, step * 0.85, root + walk[i % walk.length], i % 2 ? 0.62 : 0.8);
      } else if (pattern === 'walking') {
        // a note a beat, arriving on the next chord's root from a semitone away
        const target = near(nextChord(c, chord).root, c.center);
        let midi = root;
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const lastBeat = t + 1 >= end - 1e-6;
          if (t > chord.t) {
            if (lastBeat && c.rng.chance(0.75)) midi = target + (c.rng.chance(0.5) ? 1 : -1);
            else {
              const direction = target >= midi ? 1 : -1;
              midi += direction;
              while (!c.scalePcs.has(mod12(midi)) && !chord.pcs.has(mod12(midi))) midi += direction;
            }
          }
          add(t, 0.92, midi, t === chord.t ? 0.82 : 0.66);
        }
      } else {
        // synco: on the groove's kick (and comping hits when busy). which hits leap is picked once a part
        const { lines, steps, grid } = c.groove;
        const hits = lines.k.map((v, i) => i === 0 || v === 1 || (density > 0.6 && lines.c[i] > 0));
        const leaps = makeRng(c.song.seed, partSeed(c.layer, c.section.part), 'leaps', c.section.part);
        const shape = hits.map((_, i) => (i === 0 ? 0 : leaps.weighted([[0, 4], [12, 1.5], [7, 1.5]])));
        for (let t = chord.t; t < end - 1e-6; t += grid) {
          const i = stepInBar(c, t);
          // a new chord always gets its root, even off the kick
          if (!hits[i] && t > chord.t + 1e-6) continue;
          add(t, Math.min(gapAfter(hits, i) * grid, end - t) * 0.85, t > chord.t + 1e-6 && shape[i] === 7 ? fifth : root + (t > chord.t + 1e-6 ? shape[i] : 0), i === 0 ? 0.85 : 0.68);
        }
      }
    }
    return notes;
  },

  // drums: the note is which drum (KIT_SLOTS in synth.js). the part's groove (grooveFor), the same every
  // bar, busy adding ghost notes. the drummer listens: pitched drums are in key (tuneDrum, note.tune),
  // and with few others playing (an intro, a break) it plays softer and leaves the ghosts out
  drums(c) {
    const { pattern, density } = c.layer;
    const { lines, steps, perBeat, grid } = c.groove;
    const notes = [];
    const kit = INSTRUMENTS[c.layer.instrument]?.slots || [];
    const tunes = kit.map((slot) => slot.tune && tuneDrum(slot.tune, c.song.key));
    // a real crash where the kit has one, its open hat where it doesn't
    const crash = kit[6] ? 6 : 3;
    const others = c.song.layers.filter((layer) => layer.role !== 'drums' && layer.role !== 'texture');
    const fullness = others.length ? others.filter((layer) => c.section.play.includes(layer.id)).length / others.length : 1;
    const level = 0.7 + 0.3 * fullness;
    const ghosts = density >= 0.35 && fullness >= 0.5;
    const hit = (t, slot, vel) => notes.push({ t, dur: grid, midi: slot, vel: vel * level, ...(tunes[slot] ? { tune: tunes[slot] } : {}) });
    // a fill into a different part: the last beat on the snare (or toms), growing. pulse and sparse
    // never fill: a roll in a calm song made it jump
    const fill = (LIFTS[pattern] || ROCK[pattern] || FILLS[pattern]) && c.next && c.next.part !== c.section.part && c.vary.chance(0.75);
    // a rock drummer fills down the toms: the snare for the first half of the beat, the floor tom after
    const fillDrum = (i) => (pattern === 'tribal' || pattern === 'tala' || (ROCK[pattern] && i - (steps - perBeat) >= perBeat / 2) ? 5 : 1);
    // a song that builds rolls through the last bar before its climax and crashes on it (builds), and
    // the same into a loud key change. a quiet lifted section (an epilogue) just plays
    const energy = (section) => section?.energy ?? 0.75;
    const top = builds(c.song) ? Math.max(...c.song.sections.map(energy)) - 0.01 : Infinity;
    const lifted = (section) => !!section?.lift && energy(section) >= 0.9;
    const surge = c.next && ((energy(c.next) >= top && energy(c.section) < top) || (lifted(c.next) && !lifted(c.section)));
    const peak = c.prev && ((energy(c.section) >= top && energy(c.prev) < top) || (lifted(c.section) && !lifted(c.prev)));
    const crashed = ((LIFTS[pattern] || ROCK[pattern]) && c.prev && c.prev.part !== c.section.part && c.prev.play.includes(c.layer.id)) || peak;
    // a weave crashes into each loud section, as an orchestra's cymbal (or gong, or bell tree) marks one
    const struck = c.weave && energy(c.section) >= 0.85 && (!c.prev || energy(c.prev) < energy(c.section) - 0.1 + 1e-9);
    if (crashed || struck) hit(c.start, crash, 0.8);
    // a crash every four bars in a loud rock part, every other bar in a loud lifted section
    const phrases = (ROCK[pattern] && kit[6] && (c.section.part === 'B' || c.section.lead)) || (lifted(c.section) && (LIFTS[pattern] || ROCK[pattern] || FILLS[pattern]));
    const every = lifted(c.section) ? 2 : 4;
    // a gamelan's big gong closes every cycle (gong: bars a cycle, on the kit)
    const gong = INSTRUMENTS[c.layer.instrument]?.gong;
    for (let n = 0; n < c.bars; n++) {
      const bar = c.start + n * c.bpb;
      if (phrases && n % every === 0 && !(n === 0 && crashed)) hit(bar, crash, 0.72);
      if (gong && kit[6] && n % gong === 0) hit(bar, 6, 0.75);
      const last = n === c.bars - 1;
      const fillFrom = surge && last ? 0 : fill && last ? steps - perBeat : steps;
      for (let i = 0; i < steps; i++) {
        const t = bar + i * grid;
        const onBeat = i % perBeat === 0;
        if (i >= fillFrom) {
          if (i === fillFrom && lines.k[i]) hit(t, 0, 0.85);
          if (perBeat === 4 && i % 2 && density < 0.5) continue;
          // (a roll grows over the whole bar, a fill over its beat)
          hit(t, surge && last ? 1 : fillDrum(i), surge && last ? 0.3 + 0.6 * ((i + 1) / steps) : 0.4 + 0.5 * ((i - fillFrom + 1) / perBeat));
          continue;
        }
        for (const [name, slot] of Object.entries(GROOVE_SLOTS)) {
          const v = lines[name][i];
          if (!v || (v < 1 && !ghosts)) continue;
          const loud = name === 'h' ? 0.6 : name === 'p' ? 0.55 : name === 'y' ? 0.7 : 0.88;
          hit(t, slot === 6 ? crash : slot, (v < 1 ? 0.3 : loud) * (onBeat ? 1 : 0.85));
        }
        // (not in rock: sixteenth hats at punk tempos were a hiss)
        if (ghosts && density > 0.72 && perBeat === 4 && i % 2 && !lines.h[i] && lines.h.some((v) => v) && !ROCK[pattern]) hit(t, 2, 0.24);
      }
    }
    return notes;
  },

  // the note is the song's home note, which the hum and the crickets sing (TEXTURES in synth.js)
  texture(c) {
    return [{ t: c.start, dur: c.end - c.start, midi: near(c.song.key, 60), vel: 1 }];
  },
};
