# Squimble Quest: notes for Claude

- Architecture, rules and known issues: `README.md` in this folder. The file list is at the top of `sketch.js`.
- Big files: `editor.js`, `warpgraph.js`, `tileeditor.js`, `formbox.js`, `inventory.js`, `tilemap.js`, `sound.js`, `soundeditor.js`. Grep for the symbol you need and read only that range.
- Files in `assets/squimble-quest/` (`maps/*.json`, `tiles/tiles.json`, `items/items.json`, `sounds/sounds.json`) are data. Don't read whole map files: the format is at the top of `mapfile.js`, and `default.json` is just a blank 80 × 50 grid.
- `assets/squimble-quest/maps/README.md` and `tiles/README.md` are user guides to the editor. Only read them when changing editor behaviour or a file format.
- Write concise comments, in the style the README describes.
