# Squimble Quest sounds

Every sound in the game is in `sounds.json` in this folder, one per line. Audio files (mp3, wav or ogg) that sounds use go in `files/`. Sounds are made and changed in the game's **sound editor**, a little synthesiser, so you never have to edit `sounds.json` by hand.

## Opening the sound editor

Open the map editor (**`** or **Ctrl + D**, then **B**) and go to the **Sounds** tab. Then:

- **New** in the inspector makes a new sound.
- **Edit** in the inspector, or right click a sound in the palette, changes that sound.
- A sound block's settings (right click it on the map) have **Edit sound** too.

## Using it

| Part | What it does |
|---|---|
| **Name** (top) | What the sound's called. Sound blocks use this name, so **renaming a sound breaks the blocks that use it**. Saving an existing sound under a new name makes a copy and leaves the old one alone |
| **Undo** / **Cancel** / **Save** | Undo goes back before the last big change (a **Make one** button, **Random**, **Mutate**, a wave or a file). **Save** (or **Enter**) puts it in the game straight away. **Cancel** (or **Escape**) leaves the sound as it was |
| The pictures (top left) | **wave** is a close-up of the actual sound just after it gets loud: square looks square, filters round the corners off, crunch makes it steppy. **whole sound** is the whole thing from start to end, so you can see how it fades, repeats and stops. A white line moves along it while it plays. Underneath is the note, the pitch and how long it is |
| **▶ Play** / **■ Stop** / **↻ Loop** | Play it. With **Loop** on it plays over and over, and **changing anything restarts it straight away**, so you can drag a slider and hear what it does |
| The piano | Plays the sound at that note. Everything (slides, jumps, vibrato) moves with it, so you can try a sound higher or lower without changing it |
| **Make one** buttons | Each makes up a random sound of that kind: **Coin**, **Laser**, **Explosion**, **Power-up**, **Hit**, **Jump**, **Blip**, **Bell** and **Hum** (made to loop smoothly). Press one a few times until you like it, then tweak it. **Random** makes anything at all, and **Mutate** changes the current sound a little bit, for a sound that's similar but different |
| **Wave** buttons | The kind of sound. **sine** is smooth like a whistle, **triangle** soft like a flute, **square** buzzy like old games, **saw** harsh (lasers, engines), **organ** warm and full (good for hums), **noise** is hiss (hits, explosions, wind), and **file** is an audio file (see below) |
| Sliders | Drag one, or click anywhere along it. Scroll the mouse wheel over one to nudge it, and right click to put it back to normal. Hover over one for a tip along the bottom. Greyed out sliders don't do anything with the other settings as they are (pulse width is only for square waves, for example) |

### The sliders

- **Pitch**
  - **Pitch**: how high it is. 440 Hz is the A above middle C (the note is shown next to it), and doubling it goes up an octave.
  - **Slide** / **Slide speed-up**: makes the pitch rise or fall while it plays (up for jumps and power-ups, down for lasers), and makes that slide speed up or slow down.
  - **Vibrato** / **Vibrato speed**: wobbles the pitch up and down.
  - **Jump** / **Jump at**: jumps the pitch up or down by some notes partway through, like the two notes of a coin.
- **Volume shape**
  - **Fade in**, **Hold**, **Fade out**: how long it takes to get loud, how long it stays loud, and how long it takes to go quiet. A long fade out rings like a bell.
  - **Punch**: makes the very start of the hold extra loud, for a snappy hit.
  - **Repeats** / **Gap**: plays it this many times in a row, with this much silence between (alarms, footsteps).
- **Tone**
  - **Pulse width** / **Pulse sweep**: square waves only. Thinner widths sound more nasal, and sweeping it makes it sound like it's moving.
  - **Low-pass** / **Low-pass sweep** / **Resonance**: cuts out the high sounds so it's duller (100 is off), sweeps that while it plays (a "wah"), and makes it ring at the edge for a squelchy synth sound.
  - **High-pass** / **High-pass sweep**: cuts out the low sounds so it's thinner, like a little radio (0 is off).
- **Effects**
  - **Flanger** / **Flanger sweep**: mixes in a slightly late copy for a hollow, metallic, whooshy sound.
  - **Crunch**: makes it lower quality on purpose, for crunchy retro sounds.
  - **Volume**: how loud it is.
  - **Heard from**: how many tiles away it can be heard in the game. It's loudest right on top of it and fades away to nothing at this distance.

### Smooth loops

Sound blocks set to **constantly nearby** loop their sound with no gaps or clicks, whatever the sound is. For a steady hum that never changes, set **Fade in** and **Fade out** to 0 and use **Hold** for its length; any fades, slides or repeats happen every time round, which is good for things like a pulsing machine or a siren. Turn **Loop** on in the sound editor to hear exactly how it'll loop.

## Audio files

Click **file** (or **Choose file...**) and pick an mp3, wav or ogg. The sound then plays the file, held for as long as the file is, and everything else goes back to normal so it starts off sounding just like the file. After that every slider works on it: **Pitch** becomes its speed (100% is normal), and the fades, slides, filters and effects all still work. Files longer than 5 seconds only use their first 5 seconds.

The game can only load files from `files/` in this folder, so a file you choose stays in the browser until you export it.

## Keeping your sounds

Saved sounds work straight away, but only until the page reloads. To keep them, click **Export** in the inspector (next to **New**, on the **Sounds** tab). It downloads:

- `sounds.json`: put it in this folder, replacing the old one.
- any audio files you've chosen since the page loaded that a sound uses: put them in `files/`.

The message at the top says where each one goes. Exporting without changing anything gives exactly the same `sounds.json`.

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

There's no renaming or deleting in the editor, since sound blocks on maps use the names. Do those here by hand, and fix any blocks using the old name (they show red in the editor).
