# Ahsan's portfolio

My portfolio site. Designed in Figma, built with plain HTML, CSS and JavaScript (no framework or build step).

**Live:** https://ahsanpotatwo.github.io/portfolio/

Each project has its own page you can play with in the browser: Wizard Battles, CLI Battleships, Pantry Wizard, Squimble Quest (+ its music maker and sound studio), Oscilloscope Playground, Earth Loading Screens, Distant Cousins and Catpi Corner.

## Running it

Open `index.html`, or serve the folder (some pages fetch files, so they need a server):

```bash
npx serve .
```

## Server

`server/` is a Cloudflare Worker that runs online Wizard Battles (Play a friend). Each room is a Durable Object that holds the duel and rolls the dice, using the same `rules.js` as the page.

```bash
cd server
npm install
npm run dev      # local server on :8787, the page uses it when opened from localhost
npm test         # plays a battle through it
npm run deploy
```

## Contact

- Email: ahsansid10@hotmail.com
- LinkedIn: https://www.linkedin.com/in/ahsan-siddiqui-85332133b/
