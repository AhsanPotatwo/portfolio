# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hiring teams screening for junior/graduate full stack roles: recruiters doing a fast first pass, then hiring managers and engineers who dig into projects and code. They arrive from a CV, LinkedIn or GitHub link and decide in minutes whether Ahsan is worth an interview.

Secondary: prospective freelance clients (small businesses wanting a website) looking for proof he can deliver.

## Product Purpose

Personal portfolio for Ahsan Siddiqui, a Manchester-based full stack developer (BSc Computer Science, 2:1, Manchester Metropolitan University). It exists to get him hired: show who he is, what he has built, and make it easy to read the resume and get in touch. Success is a hiring team leaving convinced enough to contact him or shortlist him.

## Positioning

Range plus craft. He builds real, playable things across many stacks (p5.js games, a .NET MAUI mobile app, one game written in Python, C and Rust) and designs them himself in Figma before hand-building them. Every project page lets the visitor play or try the work in the browser rather than just read about it. The portfolio site itself is evidence: designed in Figma, built by hand with no framework.

## Operating Context

- Hosted on GitHub Pages at https://ahsanpotatwo.github.io/portfolio/.
- Visitors browse on desktop and phone; layout must hold down to mobile.
- Single home page (`index.html`: hero, about, skills & experience timeline, projects grid, contact) plus one page per project, each with its own stylesheet and scripts.
- Resume PDF opens in an in-page viewer with download fallback; the original Figma designs open in an in-page design viewer.

## Capabilities and Constraints

- Static HTML, CSS and vanilla JavaScript; no framework, bundler, build step or npm dependencies. Clone and open. p5.js is the only library, used by the game projects.
- Project pages:
  - **Wizard Battles**: turn-based p5.js game built as a psychology dissertation project measuring risk-taking behaviour.
  - **CLI Battleships**: one battleships game in Python, C and Rust comparing OOP, procedural and functional styles; playable in the browser.
  - **Pantry Wizard**: .NET MAUI mobile app for tracking pantry contents (camera, vibration, text-to-speech, GPS), with a web recreation to try.
  - **Squimble Quest**: top-down p5.js RPG with quests, combat and an in-game map/tile editor. Work in progress; needs a local server for map `fetch`.
- Projects grid has placeholder "More coming soon" slots; more projects are planned.

## Brand Commitments

- **Wizard persona is core identity and must be kept**: "Full Stack Wizard", the crystal orb, Pantry Wizard and Wizard Battles naming, and the playful, warm voice ("Made by pondering my crystal orb").
- Brand mark is `[Ahsan]` in brackets.
- Figma-first: surfaces are designed in Figma before being built. Figma file: https://www.figma.com/design/8I7CBDkn3dz2HJuaapmHwE/Portfolio-website-design

## Evidence on Hand

- Resume: `assets/AhsanResume.pdf`. Profile photo: `assets/profile.jpg`.
- Original UI designs: `assets/Home Page UI design.png`, `assets/Wizard Battles Page Design.png`.
- Experience (as stated in `index.html`): Full stack developer at Global PPC Ltd (Feb–Oct 2025; ~40% page-load reduction across 3 client projects), freelance web developer (Jun 2025–present; 4 client sites, 100% on-time).
- Playable/live demos on each project page; source on GitHub (https://github.com/AhsanPotatwo).
- No testimonials, client names, or screenshots of freelance client sites exist. Do not invent any.

## Product Principles

1. **Show, don't claim.** Playable demos and real artefacts beat adjectives; every claim should point to something a visitor can try or open.
2. **Range is the story.** Present the spread across languages, platforms and genres as a deliberate strength, not a scattered list.
3. **Respect the screener's minute.** A recruiter must get name, role, availability, resume and contact without hunting; depth is there for those who dig.
4. **The wizard stays, clarity leads.** The persona is the signature, but never at the cost of a hiring team understanding what he does.
5. **The site is a work sample.** Hand-built, dependency-free, accessible and fast, because reviewers will judge the craft of the portfolio itself.

## Accessibility & Inclusion

Semantic HTML, keyboard navigation, visible focus states, a skip link, and all motion disabled under `prefers-reduced-motion`. Decorative effects are `aria-hidden`. Keep these as the baseline on every page.
