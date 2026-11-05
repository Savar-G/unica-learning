# Scan photo set (#537)

A fixed set of synthetic phone photos of printed workbook pages, each with a truth file, for the paid marking evaluation (S4, #457: the same photos and rules through Sonnet and Haiku). Background: section 4 of `.design/research/marking-audit-2026-11-04.md`.

## What it does not prove

The handwriting is drawn by code from one single-line stroke font, with seeded jitter, slant, size and pressure. It is not a child's handwriting. A model that reads this set well may still read real children's writing badly. Use the set to check the marking workflow and to compare models on identical photos. Never report its results as accuracy on real child handwriting. Every truth file says so in its `note`.

The camera effects are also made by code (a perspective warp, light, shadow, blur, noise, JPEG). They do not model a curled page, glare, motion blur or a real phone's processing. The tool picks clear paper for a correction from pixels and regions only, so a correction can still sit near printed text.

A small human set (Savar and Cedric fill about 10 printed pages, messy on purpose) is still needed before any claim about real handwriting.

## Data

No child data. The pages come from fake books (the workbook sample tool with a fake AI and made-up sample profiles), rendered with a fixed child id. No AI is called and nothing is written to the database or to Storage.

## Run it

```sh
npm run scan:photo-set -- --out /tmp/ui-review/scan-photo-set
```

Options: `--seed 537` (default), `--levels U4,U16` (default), `--pages 20` (pages per level, default 20), `--books <folder>` (fake books made elsewhere).

1. **Fake books.** Without `--books`, it runs the workbook sample tool (`--fake --no-store --check-only`, days 1, 3, 5, 8 and 10) with the fixed book id `5ca70000-0000-4000-8000-000000000537` into `<out>/books`. This takes about 5 minutes once. Later runs reuse the books.
2. **Render.** Each level's day pages are rendered once with the real template and the production print engine (Chromium). The render captures each page's print contract (#536): the four scan marks and every question's answer regions. The render is kept in `<out>/books/rendered` and reused. Chromium's anti-aliasing can differ by a few pixels between two renders (measured: 1,000 to 3,400 changed bytes of 6.3 million on some pages), so a fresh render can change the photos.
3. **Pick pages.** Each level's pages with at least two write-number questions whose answer is a whole number are shuffled by the seed, and `--pages` of them are taken. With the defaults: 20 U4 pages and 20 U16 pages, so 40 photos and 80 model calls for two models (about USD 1.60 at the USD 0.02 target price; the real price is not measured).
4. **Photos.** `src/lib/scan-photo-set.ts` writes answers and applies one camera effect per photo.

## What a photo holds

- **Answers.** Only write-number questions with a whole-number answer get ink. Each one gets a case: right, wrong (often one of the package's known mistakes), blank, crossed out then right, crossed out then wrong, messy right or messy wrong. A correction goes in the box when the box is wide, else beside it on clear paper, away from every other question's regions. Every other question stays as printed (`scope: "not-drawn"`, expected mark `not-marked`). A question with a work space gets a number written there as a decoy, never the answer. Printed worked examples with their answers are natural decoys too.
- **Camera.** Every photo has a small rotation, a little perspective, uneven light, slight blur, sensor noise and JPEG compression. On top of that, one effect per photo, spread evenly over each level: plain, rotation (8 to 14 degrees), perspective (strong keystone), shadow, blur, low light, cut off (a quarter to a third of the page out of frame) or wrong page (the photo is sent as another page of the same book).

## Truth files

`truth/<id>.json`, one per photo:

- `source`: the workbook id, page, printed page ID, day, page of the day and the clean page image's SHA-256.
- `submittedAs`: the page the photo is sent as. It differs from `source.page` only for a wrong-page photo.
- `expectedPhoto`: `mark`, `cut-off` (a scan mark is outside the photo: expect a retake) or `wrong-page` (expect a refusal).
- `photo`: size, the page's corners and the four scan marks in photo pixels (with `visible`), the camera settings and the JPEG quality.
- `questions`: per question, its number, package id, format, answer key, case, what was written (each text, crossed out or not, its placement, each glyph's box and the ink box, in page image pixels), the final text, the expected mark (`right`, `wrong`, `blank`, `not-visible`, `not-marked`) and each region's box and corners in the photo.
- `decoys`: numbers written in work spaces.

The expected marks describe the page shown. For a photo the marking should refuse (`cut-off`, `wrong-page`), the item marks say what can be seen, for an evaluation that checks whether a model marks it anyway. A box whose box or ink leaves the frame is `not-visible`.

## Other files

- `photos/<id>.jpg` (1500 x 2000) and `pages/<id>.png` (the clean page).
- `manifest.json`: seed, book id, levels, counts by effect, case and expected mark, and every file's SHA-256. `SHA256SUMS` lists the same hashes for `shasum -a 256 -c SHA256SUMS`.
- `index.html`: every photo with its truth table, for a person to check.
- `contact-U4.png`, `contact-U16.png`: all photos of a level with their effect and counts.
- `crops.png`: written answers up close, cropped from the photos, each with its case, text and key.

The set is about 21 MB, and the kept books and render about 17 MB more. Keep them out of git; `/tmp/ui-review/scan-photo-set` is the usual folder.

## Same seed, same files

With the same seed and the same kept books and render, two runs give byte-identical files (photos, truth files, pages, sheets, index and manifest). Check with `shasum -a 256 -c SHA256SUMS` in the other folder, or compare the `set hash` line the tool prints. The tests in `src/lib/scan-photo-set.test.ts` check, through the module's public interface, that the same seed gives the same bytes, that ink lies only where the truth names it and in each named glyph, that blank boxes stay blank, that each expected mark follows from the final text and the key, that corrections stay off other regions, and that the scan marks in the truth sit on the marks in the photo.
