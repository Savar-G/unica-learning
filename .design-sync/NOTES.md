# Design sync notes (Unica Learning)

## How this repo syncs
- The design system lives in `src/ds/` (components) and `src/ds/styles/` (base.css + warm.css). The live site imports the same files, so the site and Claude Design never drift.
- `npm run build:ds` builds `dist/ds/` (esbuild ESM + concatenated CSS + tsc declarations). Run it before the converter; the converter's `--entry` is `./dist/ds/index.js`, `--node-modules ./node_modules`.
- Fonts: `src/ds/fonts/` holds latin-subset woff2 for Geist, Geist Mono, Caveat and Gochi Hand (OFL, from Google Fonts) via `cfg.extraFonts`. The site itself loads the same families through next/font; `warm.css` uses `var(--font-geist, "Geist")` so both paths resolve.
- Groups come from `cfg.docsMap` stubs in `.design-sync/groups/*.md` (frontmatter `category` only, empty body, so the prompt still gets synthesized Props + Examples).
- Playwright: the cached Chromium is build 1217 → `playwright@1.59.0` in `.ds-sync/`.

## Gotchas
- Site-only animation hooks: components default to their finished state (`is-in`). The site passes `animate` to `Hero`, `Highlight`, `ProgressReport`, `Mailer` and `PhoneScan` so the scroll observer can animate them. Never make a component hide content by default.
- The hero entrance is a CSS animation gated by `.hero-c.enter` (set by `animate`); without the gate, captures catch it mid-fade.
- `[data-look="warm"] :is(.page, .cover, .report) { color }` sets ink on drawn pieces; covers on sky/leaf need `.cover.on-dark` (added after it).
- Founder tile styles target `.who` (not `.duo .who`) so `FounderCard` renders standalone.
- Wide components need `cardMode`: column for most, single + viewport for `Hero` (1280x1360), `StepGrid` (1200x1150) and `FeatureGrid` (1200x560).
- Headless screenshots of the site occasionally capture before scroll reveals finish; re-run before concluding a section is blank.

## Known render warns
- None open at the 2026-10-05 sync (30/30 clean, 0 bad, 0 thin).

## Re-sync risks
- `src/ds/photos.ts` points at content-hashed image URLs on the production site (`/_next/static/immutable/media/...`). They change if a photo file changes or the deploy is removed; re-run the URL harvest (curl the live HTML, grep `immutable/media`) and update the file.
- Preview sizes (`cardMode`/viewport) were tuned for the 2026-10-05 layout; a big layout change may need new viewports.
- The brand is "Unica Learning" (D-056). A future rename touches `UnicaRoot`, `Logo`/`WorkbookCover` defaults, `globalName`, and conventions.md.
- `base.css` still carries the retired Primer look's rules (serif, hairline grid). They are inert under `data-look="warm"` but ship in `_ds_bundle.css`.
