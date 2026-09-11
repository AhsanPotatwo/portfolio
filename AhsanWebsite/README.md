# Ahsan — portfolio website

A static website built from the Figma design *"Website UI design"* (node `58:7`).
Plain HTML, CSS and a small amount of JavaScript — no build step, no dependencies, no framework.

```
ahsan-portfolio/
├── index.html            all page content
├── css/styles.css        all styling
├── js/main.js            mobile menu, nav highlighting, reveal on scroll
├── download-assets.sh    one-off script: saves the icons locally
└── README.md
```

---

## 1. Run it

**The quickest way**

Double-click `index.html`. It opens in your browser and works.

**The better way (a local server)**

Some things — fonts, caching, and anything you add later like `fetch()` — behave more like the real
web when the page is served over HTTP rather than opened as a file. Open a terminal in this folder
and run whichever of these you already have:

```bash
# Python 3 (installed by default on macOS and most Linux)
python3 -m http.server 5500

# or Node.js
npx serve .

# or PHP
php -S localhost:5500
```

Then open <http://localhost:5500> in your browser.

If you use VS Code, the **Live Server** extension does the same thing: right-click `index.html` →
*Open with Live Server*. It also reloads the page every time you save.

---

## 2. Important: save the icons (do this soon)

All the technology icons currently load straight from Figma's export server, and **those links
expire about 7 days after the design was exported.** Run this once to copy them into the project so
the site keeps working forever:

```bash
bash download-assets.sh
```

It downloads every icon into a new `assets/` folder and rewrites `index.html` to point at the local
copies. It needs `curl` and `python3`, both of which macOS and Linux already have. On Windows, run
it from Git Bash or WSL.

If a download fails, the link has already expired — re-open the Figma file and export that icon
again, or drop a replacement SVG into `assets/` with the same filename.

---

## 3. Things you'll want to change

| What | Where |
|---|---|
| Your real email address | `index.html` — search for `hello@example.com` (3 places) |
| LinkedIn and GitHub links | `index.html` — the `href`s on the social links (4 places) |
| Your CV | put `resume.pdf` in the folder, then set the "My resume" button's `href="resume.pdf"` |
| Profile photo | replace the `.avatar` block's placeholder with `<img src="assets/me.jpg" alt="Ahsan">` and give it `border-radius:50%` |
| Projects | each `<li class="project-card">Coming soon...</li>` is one card — swap the text for a title, description and link |
| Colours | the `:root` block at the top of `css/styles.css` — every colour in the design is a variable there |

The layout is responsive: three columns of project cards on desktop, two on tablets, one on phones,
and the navigation collapses into a menu button below 820px.

---

## 4. Put it online (free)

**GitHub Pages**

```bash
git init
git add .
git commit -m "Portfolio site"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then on GitHub: *Settings → Pages → Source: `main` / root*. Your site appears at
`https://<your-username>.github.io/<repo-name>/` within a minute or two.

**Netlify or Vercel** — drag the whole folder onto <https://app.netlify.com/drop>, or run
`npx vercel` in the folder. Both give you a live URL immediately. There's no build command to set;
it's a static site.

---

## Notes on the implementation

- Fonts are Quicksand, Courier Prime and Fira Mono, loaded from Google Fonts to match the design.
- The design has no Contact section, but the nav links to one, so I added a short "Get in touch"
  block at the bottom using the same styling. Delete the `<section class="contact">` if you'd
  rather not have it.
- The thin rules in the design (the line under the hero, the nav underline, the timeline spines)
  are CSS gradients rather than images, so they scale cleanly at any width.
- Animation is deliberately light: one fade-up per section, and it's disabled automatically for
  anyone who has "reduce motion" turned on.
