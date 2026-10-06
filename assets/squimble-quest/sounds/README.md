# Squimble Quest sounds

Every sound in the game is in `sounds.json` in this folder, one per line. Audio files (mp3, wav or ogg) that sounds use go in `files/`. Sounds are made and changed in the game's **sound editor**, a little synthesiser, so you never have to edit `sounds.json` by hand.

## Opening the sound editor

Open the map editor (**`** or **Ctrl + D**, then **B**) and go to the **Sounds** tab (or **Voices**, for npc voices). Then:

- **New** in the inspector makes a new sound (or voice).
- **Edit** in the inspector, or right click one in the palette, changes it.
- A sound block's settings (right click it on the map) have **Edit sound** too, and an npc's have **Edit voice** and **New voice**.

## Sounds and voices

There are two kinds: **sounds**, for sound blocks, and **voices**, for npcs to talk with. They're made the same way in the same editor; the **Sound** / **Voice** buttons next to the name say which it is. Sounds show in the map editor's **Sounds** tab and are the only ones sound blocks can play, and voices show in the **Voices** tab and are the only ones npcs can use. Both are saved in `sounds.json`, so a name can only be used once across both.

## Using it

**Hover over anything** (a slider, a wave, a button) and a tip along the bottom says what it does.

| Part | What it does |
|---|---|
| **Name** (top) | What the sound's called. Sound blocks and npcs use this name, so **renaming a sound breaks the things that use it**. Saving an existing sound under a new name makes a copy and leaves the old one alone. If the name gets tidied when it saves, it says so next to the box |
| **Sound** / **Voice** (top) | Whether it's a sound (for sound blocks) or a voice (for npcs). Changing an existing one moves it to the other tab, and anything using it as the old kind goes silent |
| **Undo** / **Cancel** / **Save** | Undo goes back one change at a time, including slider drags (a whole drag is one Undo). **Save** (or **Enter**) puts it in the game straight away. **Cancel** (or **Escape**) leaves the sound as it was; if you've changed it, it asks first and the second press closes |
| The pictures (top left) | **wave** is a close-up of the actual sound just after it gets loud: square looks square, filters round the corners off, crunch makes it steppy. **whole sound** is the whole thing from start to end, so you can see how it fades, repeats and stops (while it's talking, it shows the talking). A white line moves along it while it plays. Underneath is the note, the pitch and how long it is |
| **▶ Play** / **■ Stop** / **↻ Loop** | Play it. With **Loop** on it plays over and over, and **changing anything restarts it straight away**, so you can drag a slider and hear what it does |
| The piano | Plays the sound at that note. Everything (slides, jumps, vibrato) moves with it, so you can try a sound higher or lower without changing it |
| **Make one** buttons | Each makes up a random sound of that kind (see [Make one](#make-one) below for them all). Pick a kind with the little tabs first, then press a button a few times until you like it, and change it in the **Character** tab. **Random** makes anything at all, and **Mutate** nudges the settings that are on a little, for a sound that's similar but different |
| **Wave** buttons | The kind of sound (see below). **file** is an audio file |
| Tabs | The sliders are in five tabs: **Character** (see below), **Pitch**, **Volume**, **Tone & effects** and **Voice**. A tab with a **•** has settings that aren't normal, so you can see where a sound's character comes from. Picking the voice wave opens the Voice tab |
| Sliders | Drag one, or click anywhere along it. Scroll the mouse wheel over one to nudge it, and right click to put it back to normal. Greyed out sliders don't do anything with the other settings as they are (pulse width is only for square waves, for example) |

### Make one

The buttons come in kinds, picked with the little tabs above them:

| Kind | Buttons | Its Character sliders |
|---|---|---|
| **Arcade** | shiny, grab, boost, hop, thwack, ouch, pew, kaboom, bleep, choose, go back, nope, treasure, level ding, womp womp | Pitch, Length, Retro |
| **Tunes** | yep, nah, letter, tuck away, found it, hooray, oh no, hidden path, danger, safe spot, solved, sleepy, shop bell, music box, quest start | Instrument, Tune number, Notes, Mood, Shape, Speed, Key, Finale, Brightness, Space |
| **Drums** | kick, snare, closed hat, open hat, clap, tom, rimshot, cowbell, shaker, crash, boom, woodblock, bongo, chip snare, tambourine | Tuning, Ring, Snap, Room, Crunch |
| **Choir** | heavenly, dread, cloister, pixie chorus, tin choir, phantoms, triumph, the deep, temple, sunrise, hymn, awe, mystery | Pitch, Singers, Harmony, Spread, Sing, Air, Swell, Length, Wobble, Space |
| **Combat** | swish, big swing, slice, steel on steel, deflect, shield bash, wallop, thud, bowstring, arrow past, jab, crunch, smash, plate armour, sidestep | Pitch, Length, Weight, Room |
| **Magic** | twinkle, mend, incant, flame bolt, frost, jolt, blink, rift, ward, hex, gather power, vanish, clue, glint, barrier | Pitch, Length, Sparkle, Echo |
| **Sci-fi** | depth ping, blip scan, lock-on, homing signal, scan beam, projector, mainframe, uplink, corrupt, skip, dead channel, first contact, boot up, shut down, tractor beam | Pitch, Length, Glitch, Space |
| **Things** | steps, knuckles, pan bang, tink, old hinge, tick tock, doorbell, pocket change, bangers, sploosh, wail, beep beep, lub-dub, page flip, drawer | Pitch, Length, Hardness, Room |
| **Motors** | big engine, ticking over, whirr, drill, buzzsaw, fan, chopper, steady hum, genny, rev up, wind down, robot arm, tiny gears, crank | Machine, Speed, Size, Strain, Rattle, Spin, Spin time |
| **Squishy** | goo step, squelch, splotch, pop, fizz, cauldron, glug, slurp, plunger, bog, plink, wobble, spring, burp, ooze | Blob size, Gloop, Squeeze, Slop |
| **Birds** | peep, hedge chatter, dawn song, redbreast, golden trill, brook song, chick, squawker, gull, quacker, hawk, rook, night hoot, two-note, cooer | Beak, Size, Chirps, Chirp length, Pause, Swoop, Curve, Warble, Warble speed, Scratch, Song slope |
| **Beasts** | bark, mew, oink, squeak, moon howl, drakeling, wyrm roar, lurker, shambler, grumpy slime, star kitten, cicada, sky whale, wisp, tin pup | Body, Pitch, Bulk, Cries, Cry length, Slide, Hump, Snarl, Huff, Quiver, Jaw |
| **Breath** | breathe in, breathe out, weary, shock, sniffle, out of puff, calm down, hup!, ahem, zzz, dozing giant, scuba, space suit, cold breath | Way (in, out, or in and out), Puffs, Length, Push, Chest, Wheeze, Shiver, Rumble, Mask |
| **Nature** | chirrup, croak, bumble, midges, breeze, whiteout, drizzle, downpour, thunderclap, hearth, brook, falls, tide, rustle, cave drip | Nearness, Restless, Length |
| **Voices** | see [Voices and talking](#voices-and-talking) | Age, Size, Mood, Gravel |

**The Character tab** has sliders for the kind the sound was made from, so you can change it the way that kind of thing would change: play a tune on a different instrument, give a bird more warble, a beast more snarl, a cauldron more squeeze, or make a voice older. Moving one makes the sound again with the same random numbers, so it's the same sound with just that changed, and the other tabs' sliders move to match. Anything you've changed in the other tabs since stays how you set it. For Tunes, Choir, Birds, Beasts, Breath and Motors the Character sliders are the whole sound (a rook is a bird with a rough beak, low size and lots of scratch), so they go a long way. For the other kinds they change whatever the button made, and in the middle (or at 0) they leave it alone.

Every button comes out at about the same loudness, so flicking through them doesn't jump between whispers and blasts. Turning a Character slider keeps it at that level; **Volume** is still yours to change.

The Character sliders only last while the editor is open. A saved sound keeps how it sounds, but opens again with an empty Character tab. **Random** and choosing a file empty it too.

### The waves

| Wave | Sounds like |
|---|---|
| **sine** | Smooth and pure, like a whistle. Bells, birds, soft beeps |
| **triangle** | Soft and a bit hollow, like a flute |
| **square** | Buzzy, the classic old video game sound |
| **saw** | Harsh and bright. Lasers, engines, buzzing |
| **breaker** | Like a brighter, glassier triangle |
| **organ** | Warm and full. Hums |
| **whistle** | A sine with a faint high buzz. Breathy, hollow, birds |
| **tan** | Wild and distorted. Alarms, broken machines |
| **metal** | A metallic, clangy buzz (old consoles' short noise). Still plays notes |
| **voice** | A voice saying a vowel. Shape it in the Voice tab |
| **string** | A plucked string: harps, guitars, music boxes. Each repeat plucks it again, and a long fade out lets it ring |
| **noise** | Random hiss. Hits, explosions, footsteps |
| **soft noise** | Softer, deeper hiss. Wind, rain, rivers, the sea, fire |
| **bit noise** | Crunchy 1 bit noise like old consoles. Glitches, retro explosions |
| **file** | An audio file (see below) |

For the noises, **Pitch** is how high the hiss is rather than a note.

### The sliders

- **Pitch** tab
  - **Pitch**: how high it is. 440 Hz is the A above middle C (the note is shown next to it), and doubling it goes up an octave.
  - **Slide** / **Slide speed-up**: makes the pitch rise or fall while it plays (up for jumps and power-ups, down for lasers), and makes that slide speed up or slow down. Slide one way and speed up the other way for a chirp that turns round.
  - **Drop** / **Drop time**: starts that many notes higher and falls fast to the pitch, then stays. The thump of a kick drum, a punch, a zap.
  - **Vibrato** / **Vibrato speed**: wobbles the pitch up and down. Big and slow is a siren, small and fast is a trill.
  - **Wander** / **Wander speed**: lets the pitch drift around at random. Slow for wind gusts and engines, fast (over 100) for rough, gravelly, raspy sounds.
  - **Growl**: makes every other wave quieter, which adds a rough note an octave lower, like vocal fry. A little for a gravelly voice, lots for growling beasts, dragons and snores.
  - **Jump** / **Jump at**, **Second jump** / **Second jump at**: jumps the pitch up or down partway through, like the two notes of a coin. The second jump goes on top of the first, so 4 then 3 plays a happy chord one note at a time.
  - **Jumps repeat**: goes back to the start pitch and does the jumps again, round and round (an arpeggio). Short is sparkly magic.
  - **Each repeat**: moves the pitch up or down this many notes on every repeat, for a falling birdsong, a cuckoo's lower second note or a fanfare that climbs. Only does something with **Repeats** over 1.
  - **Repeat scatter**: puts every repeat after the first on a random note, for coins clinking, bubbles and breaking glass.
  - **Tune** / **Scale** / **Shape** / **Last note**: turns the repeats into a little tune, one note each. Every **Tune** number is a different tune (0 is off), **Scale** picks its notes (major, minor, pentatonic, dreamy, spooky, whole tone), **Shape** which way it goes (climbs, falls, arches, wanders, calls), and **Last note** holds the final note for longer so it sounds finished.
- **Volume** tab
  - **Fade in**, **Hold**, **Fade out**: how long it takes to get loud, how long it stays loud, and how long it takes to go quiet. A long fade out rings like a bell.
  - **Punch**: makes the very start of the hold extra loud, for a snappy hit.
  - **Repeats** / **Gap**: plays it this many times in a row, with this much silence between (alarms, footsteps, birdsong).
  - **Scatter**: makes the repeats come at uneven times and loudnesses instead of like a clock, for bubbles, rain on a roof, or tapping.
  - **Volume** and **Heard from**: how loud it is (over 100% boosts quiet sounds like soft noise), and how many tiles away it can be heard in the game. It's loudest right on top of it and fades away to nothing at this distance.
  - **Doppler**: how much moving bends its pitch in the game. Something coming towards you (or you towards it) is higher, and going away lower, like a car going past. 100% is normal, 0% turns it off (for menu sounds or music), and more exaggerates it. It only happens in the game, never in the editor's preview. See the [sound test map](../maps/README.md#the-sound-test-map).
  - **Tremolo** / **Tremolo speed**: wobbles the volume. Fast for engines, helicopters, crickets and frogs, slow for pulsing.
  - **Hiss**: mixes noise in with the wave, for a breathy flute, a snare drum's rattle, or steam.
  - **Crackle** / **Pop length** / **Crackle depth**: chops it into random pops that die away. A few a second for firecrackers, lots for fire, rain, bubbling water and gravel. Short pops click, long ones rumble. Depth is how much it chops: 100% leaves only the pops, lower keeps the sound going underneath (a fire's roar under its crackles).
- **Tone & effects** tab
  - **Low-pass** / **Low-pass sweep** / **Resonance**: cuts out the high sounds so it's duller (100 is off), sweeps that while it plays (a "wah"), and makes it ring at the edge for a squelchy synth sound or whistling wind.
  - **High-pass** / **High-pass sweep**: cuts out the low sounds so it's thinner, like a little radio (0 is off).
  - **Pulse width** / **Pulse sweep**: square waves only. Thinner widths sound more nasal, and sweeping it makes it sound like it's moving.
  - **FM** / **FM ratio**: a hidden second wave bends this one, for bells, metal, glass, robots and aliens. Whole number ratios sound musical, in-between ones clang.
  - **Voices** / **Spread** / **Chord**: plays several copies of the wave at once, each a little out of tune and drifting on its own, for choirs, strings, swarms and big synths. **Chord** shares them out over the notes of a chord. Only waves with a shape (not the noises, string or file).
  - **Flanger** / **Flanger sweep**: mixes in a slightly late copy for a hollow, metallic, whooshy sound.
  - **Echo** / **Echo amount**: plays it again later, over and over. Short for a small room or a pipe, long for a cave. The sound gets longer to fit the echoes.
  - **Reverb** / **Room size**: the sound of a space around it, from a cupboard to a cathedral. The sound gets longer to fit it too, and it carries on round a loop's join.
  - **Crunch**: makes it lower quality on purpose, for crunchy retro sounds, robots and old radios.
- **Voice** tab
  - **Vowel**: which vowel the voice wave says (ah, eh, ee, oh, oo, or in between).
  - **Vowel slide**: moves through the vowels while it plays, like "wah". Good for babies, cats and aliens.
  - **Mouth size**: how big the mouth and throat are, separate from the pitch. 100 is a man, 85 a woman, 70 a child, 55 a baby, over 120 a giant.
  - **Breath**: air in the voice. A little sounds natural, more sounds old or shy, lots is a whisper or a ghost, and 100% is just air (breathing).
  - **Talk speed**: how fast it talks, in letters a second.
  - **Expression**: how much the pitch goes up and down between syllables. 0 is a flat robot, high is excited.
  - **Say** box: type something and press **▶ Say** (or **Enter**) to hear the sound saying it.

### Voices and talking

Any sound can **talk**: it's played once per syllable of the words, with each syllable's vowel and pitch, like the babble in old games. Questions go up at the end, and the same word always sounds the same. The **voice** wave sounds most like a person; a **blip** talking sounds like a classic retro game.

To make a voice, open the **Voices** kind of **Make one** buttons: **Man**, **Woman**, **Old man**, **Old woman**, **Teen**, **Child**, **Baby**, **Gruff**, **Innocent**, **Goblin**, **Fairy**, **Alien**, **Robot**, **Monster** and **Ghost**. Each press says what's in the Say box, so you can press until one sounds right. Then use the **Character** tab's **Age**, **Size**, **Mood** and **Gravel** for quick changes (they say the words again when you let go), or tweak it in the **Voice** tab. What makes the difference:

| To sound... | Change |
|---|---|
| Older | Lower **Talk speed**, more **Breath**, a little **Vibrato** (about 0.5 notes at 6 /s) and a fast **Wander** (about 0.5 notes at 300 /s) |
| Younger, or like a child or baby | Higher **Pitch**, smaller **Mouth size**, more **Expression** |
| Bigger or gruffer | Lower **Pitch**, bigger **Mouth size**, a fast **Wander** of 1 to 2 notes for gravel, and a bit of **Crunch** |
| Gentle or innocent | More **Breath**, a slower **Fade in** |
| Alien | **FM**, **Vowel slide**, lots of **Vibrato** and **Expression**, an odd **Mouth size** for the pitch |
| Robot | **Expression** 0, lots of **Crunch** |

Then save it (as a **Voice**) and give it to npcs. In the map editor, either:

- pick the voice in the **Voices** tab and click an npc on the map (they say their first line with it), or
- right click an npc on the map and pick its **Voice**. **▶ Say** plays its first line with the voice picked, **Edit voice** opens that voice, and **New voice** makes a new one that the npc gets when you save it.

Each npc on a map can have its own voice (it's saved in the map file, so **Export** the map too). One left on **its own** uses its kind's voice from `voice: 'its-name'` in `defineNpc()` in `js/squimble-quest/npcs.js`. Npcs use the voice by name, so **changing a voice changes every npc that uses it**: make "Man voice 1", give it to five npcs, then tweak it once.

When you talk to them, they say each line as it types out, at the voice's **Talk speed**. Pressing **E** to finish a line early cuts the voice off.

### Smooth loops

Sound blocks set to **constantly nearby** loop their sound with no gaps or clicks, whatever the sound is. For a steady hum that never changes, set **Fade in** and **Fade out** to 0 and use **Hold** for its length; any fades, slides or repeats happen every time round, which is good for things like a pulsing machine or a siren. The make one buttons that say "loops" in their tip are made like that already (most of Nature, and things like big engine, whirr, fan, steady hum, wail, rift, ward, dead channel and cauldron). A Motors sound loops like that when its **Spin** is 0. Turn **Loop** on in the sound editor to hear exactly how it'll loop.

## Audio files

Click **file** (or **Choose file...**) and pick an mp3, wav or ogg. The sound then plays the file, held for as long as the file is, and everything else goes back to normal so it starts off sounding just like the file. After that every slider works on it: **Pitch** becomes its speed (100% is normal), and the fades, slides, filters and effects all still work. Files longer than 5 seconds only use their first 5 seconds.

The game can only load files from `files/` in this folder, so a file you choose stays in the browser until you export it.

## Keeping your sounds

Saved sounds work straight away, but only until the page reloads. To keep them, click **Export** in the inspector (next to **New**, on the **Sounds** tab). It downloads:

- `sounds.json`: put it in this folder, replacing the old one.
- any audio files you've chosen since the page loaded that a sound uses: put them in `files/`.

The message at the top says where each one goes. Exporting without changing anything gives exactly the same `sounds.json`.

## Things to know

Quirks you might run into, so they don't look like bugs:

- **No sound until you click.** Browsers don't let a page make sound until it's been clicked, so nothing plays before you click into the game. If a looping sound block is next to where you start, it begins once you click (the browser console might show a warning about it, which is harmless).
- **Names get tidied.** The name box shows what you type, but the sound is saved under a tidied name: lowercase, with dashes for spaces, so "My Sound" is saved as `my-sound`. Names can be up to 20 letters.
- **Undo starts fresh.** The undo history is cleared each time the editor opens, and every nudge of the scroll wheel is its own Undo.
- **A little blip with Loop on.** While Loop is on, every change restarts the sound, so you'll hear a tiny blip each time you move a slider. That's the restart, not a problem with the loop. Turn Loop off and press **Play** to hear it cleanly.
- **Long sounds and dragging.** The pictures are made from the real sound, so a long sound (several seconds, like the nature loops, or lots of repeats) gets worked out again every time a slider moves, and the editor can stutter while you drag.
- **Punch can click.** Lots of punch after a long fade in makes a jump in volume you can hear as a click.
- **Noise brightness tops out.** The noises don't get any brighter above about 1400 Hz.
- **Too loud gets harsh.** Lots of resonance, flanger, echo, punch or volume can go past full volume, which gets cut off and sounds harsh (sometimes that's the sound you want). A long held sound with lots of echo builds up the most.
- **Loops repeat exactly.** The random parts (crackle, wander, noise) are the same every time round a loop, so a short rain or fire loop can sound like it repeats. A longer **Hold** hides it. A loop's echoes don't carry over from the end to the start either, so long echoes on a loop sound like they restart.
- **Talking is babble.** Syllables are guessed from the spelling, so odd words come out a bit wrong, and each syllable is cut off when the next starts (a long **Fade out** doesn't get used while talking).
- **Step blocks repeat.** A sound block set to play when stepped on plays every time you step onto it, even walking back and forth over it.
- **The same loop twice is louder.** Two looping sound blocks with the same sound near each other play it twice. For a big area (a river), use one block with a bigger **Heard from**.
- **Audio file names.** Keep them simple (letters, numbers, `-` and `_`). Two different files with the same name replace each other. A file that fails to load (it's not in `files/`, say) isn't tried again until you reload the page.
- **Changing the code's normal values changes sounds.** `sounds.json` only stores settings that aren't normal, so if the normal value of a setting changes in `sound.js`, every sound that left it out changes too.

## The file format

```json
{
  "format": "squimble-quest-sounds",
  "version": 1,
  "sounds": [
    { "name": "coin", "pitch": 988, "jump": 5, "jumpAt": 60, "attack": 0, "sustain": 60, "punch": 50, "decay": 220 },
    { "name": "door", "wave": "file", "file": "door.mp3", "sustain": 900 }
  ]
}
```

Each sound only lists the settings that aren't the normal value. The names are the sliders' settings in `SOUND_SETTINGS` in `js/squimble-quest/sound.js` (`attack`, `sustain` and `decay` are fade in, hold and fade out). Anything out of range is pulled back into range when it loads, and a wave that doesn't exist becomes a square, with a warning in the browser console (F12).

Voices are the lines with `"kind": "voice"`, after the sounds.

There's no renaming or deleting in the editor, since sound blocks and npcs on maps use the names. Do those here by hand, and fix anything using the old name: sound blocks (they show red in the editor), npcs' voices (right click them; a missing voice shows as "(missing)"), and any `voice` in `npcs.js`.
