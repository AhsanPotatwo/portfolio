# Ahsan — portfolio website

A Personal portfolio site! designed in Figma, then built by hand in HTML, CSS and vanilla JavaScript.
 
**Live:** https://ahsanpotatwo.github.io/portfolio/
 
## About
 
I designed the interface in Figma first and implemented it from that design rather than starting
from a template. The layout is responsive down to mobile, and the build deliberately has no
framework or bundler — for a site this size, plain HTML and CSS load faster and are simpler to
maintain than the alternative. I plan to show off more complex skills through the (WIP) projects
page at the bottom
 
## Built with
 
- HTML5, CSS3 (custom properties, Flexbox, CSS Grid)
- Vanilla JavaScript
- Figma (UI design)
- GitHub Pages (hosting)
## Notes on the implementation
 
- **Responsive layout** - CSS Grid for the skills and project sections, `clamp()` for fluid
  typography, with the navigation collapsing to a menu below 820px.
- **No dependencies** - no build step, no `node_modules`. Clone it and open `index.html`.
- **Accessibility** - semantic HTML, keyboard-navigable, visible focus states, and animation
  disabled automatically under `prefers-reduced-motion`.
- **Assets** - icons exported from the Figma file as SVG and served locally.
## Running locally
 
Clone the repo and open `index.html` in a browser, or serve it:
 
```bash
npx serve .
```
 
Then visit `http://localhost:3000`.
 
## Contact
 
- Email: ahsansid10@hotmail.com
- LinkedIn: https://www.linkedin.com/in/ahsan-siddiqui-85332133b/
