# Sounds

One file per sound (`coin.json` is the coin), listed in `index.json`. NPC voices work the same way in `voices/`, and a name can only be used once across both. Audio files (mp3, wav, ogg) go in `files/`.

Sounds are made in the sound editor, a little synthesiser, so you shouldn't need to edit these files by hand.

## The sound editor

Map editor (**B**), then the Sounds or Voices tab: **New**, or right click one to edit it. Hover over anything for a tip.

- **Make one** buttons make a random sound of a kind (arcade, tunes, drums, choir, combat, magic, sci-fi, things, motors, squishy, birds, beasts, breath, nature, voices). Press until you like one, then adjust it on the **Character** tab.
- The other tabs (Pitch, Volume, Tone & effects, Voice) are the raw synth settings. Right click a slider to reset it.
- **Loop** replays it on every change so you can hear sliders as you drag. The piano plays it at other notes.
- **file** plays an audio file instead, and all the effects still work on it (only the first 5 seconds are used).

## Voices

Any sound can talk: it's played once per syllable, like the babble in old games. Pick one from the Voices make-one buttons, type in the **Say** box to hear it, then give it to an NPC by clicking them with the voice picked, or by right clicking the NPC. NPCs use voices by name, so changing a voice changes every NPC using it.

## Keeping sounds

**Export** downloads every new or changed sound and any new audio files. Put sounds here, voices in `voices/`, audio in `files/`, and add new names to `index.json`.

Renaming or deleting is by hand (the file and `index.json`). Sound blocks using a missing sound show red in the editor.

## Things to know

- Browsers block sound until the page is clicked.
- Names are saved lowercase with dashes ("My Sound" becomes `my-sound`).
- Long sounds can stutter in the editor while dragging, since the picture is redrawn from the real sound.
- Loops repeat their random parts exactly, so a longer **Hold** hides the repeat.
- Files only store non-default settings, so changing a default in `SOUND_SETTINGS` (sound.js) changes every sound that left it out.

## File format

```json
{ "pitch": 988, "jump": 5, "jumpAt": 60, "attack": 0, "sustain": 60, "punch": 50, "decay": 220 }
```

Keys are from `SOUND_SETTINGS` in `js/squimble-quest/sound.js` (`attack`, `sustain`, `decay` are fade in, hold, fade out). An audio file one looks like `{ "wave": "file", "file": "door.mp3", "sustain": 900 }`.
