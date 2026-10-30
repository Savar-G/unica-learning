# Workbook rendering

How a workbook's content becomes its print PDF and page images (#309, spec #296).

## What renders

`renderWorkbook` (`src/lib/workbook-render.ts`) takes a workbook draft (pages and question packages, no files or boxes)
and a template, and returns:

- the print PDF (US Letter, one sheet per page),
- one PNG per page at 150 dots per inch (1275 by 1650 pixels),
- each question's box on its page image, measured from the laid-out page,
- each page's QR link, `https://unicalearning.com/tutor/p/<token>` (the desk route, #301).

The template writes each page as HTML and marks what the renderer measures (`mark` in the module): the page number,
each question, inside each question its content (the text and numbers the child reads) and its answer space (which
may lie inside the content), and each slot with a size limit. The renderer makes each page's QR code itself, already marked, and the
template only places it. The render fails, naming the page and question, when:

- the template has no layout for a page's type,
- content overflows a slot, a question box or the page,
- a question is missing from the page, lies outside it or is hidden,
- a question's content does not print in full, or lies outside the question,
- a question has no answer space inside it of at least half an inch each way,
- the page number is not printed on the page as the page's number,
- the QR code is missing, hidden, smaller than 0.6 inches or off the page,
- the QR code read back from the page image is not the page's link (a blank, covered or wrong code),
- the template marks a part twice, or the PDF does not have one page per page.

"Hidden" means not laid out or hidden by CSS: `display`, `visibility`, `content-visibility` or opacity 0. "Printed"
is checked on the text itself, line by line, not only on its outer box. Each line of the page number and of each
question's content must:

- show by CSS: visible, a colour that is not transparent, and no `filter`, `clip-path` or mask up to its marked element,
- be at least 6 points (8 CSS pixels) high,
- lie at least 85% inside every box that clips it, up to the page,
- leave its own ink: the engine takes each page image again with the glyphs of marked elements made transparent, and
  at least 2% of the line's pixels must change by 64 of 255 or more.

So text that is hidden, transparent, tiny, shrunk, clipped, blurred, white on white or covered inside a visible box
fails. Very light text (less than 64 of 255 from its background) fails too. Text partly covered by a pattern can still
pass. Nothing is clipped silently.

Storing:

- `saveRenderedWorkbook` (a new workbook) stores the PDF and the images in the private bucket `workbook-pages`, then
  writes the workbook through the workbook store. If an upload fails or the store refuses, it removes every file of the
  render, the failed upload too (Storage may have kept it after its answer was lost). If the write's answer is lost, the
  files stay, because the workbook may be stored: read the workbook to know.
- `replaceRendering` (a stored workbook rendered again) stores the new files, then swaps the workbook to them in one
  database transaction (`save_workbook_rendering`: the workbook row, its page tokens, content, status and learning
  events stay), then removes the old files. If an upload fails or the store refuses the swap, the new files go and the
  old rendering stays. If the swap's answer is lost, it reads the workbook. When the read names the new rendering, the
  swap happened and the old files go. Otherwise every file stays and it throws: the swap may still be pending in the
  database and commit later, so a read of the old rendering does not prove the new files are unused. It never removes
  a file the stored workbook can still name.
- Each stored render gets a random key in its file names (`page-2-<key>.png`), so a retry never meets the files of a
  failed attempt. A file no workbook names (for example the unused rendering after a lost answer) stays in the
  family's folder and is deleted with the family.

The template today is the fixed test template (`src/lib/workbook-template-fixed.ts`: cover and practice pages, Geist
and Geist Mono embedded). The real templates come from the workbook DESIGN.md (#305, #310).

Two stored pages of the sample (workbook 2), at full size. On the first, the red boxes are the stored question boxes
drawn over the stored image:

![Page 2 with its stored question boxes](workbook-rendering/sample-page-2-boxes.png)
![Page 3](workbook-rendering/sample-page-3.png)

## The print engine

`src/lib/print-engine-chromium.ts` drives headless Chromium with `puppeteer-core`. It is a print engine, not a browser
check, so the Aside rule does not apply. Which Chromium:

- `CHROMIUM_PATH` when set,
- on Linux (a Vercel function), the serverless build `@sparticuz/chromium`,
- on a Mac, the installed Google Chrome or Chromium.

Tests use the fake engine (`src/lib/print-engine-fake.ts`). `src/lib/print-engine-chromium.test.ts` renders the sample
with real Chromium wherever one is found: it decodes each page's QR code from the image, counts the PDF pages, and
checks that a hidden page number, a hidden question, a blank QR code, a transparent page number, a missing answer space,
and question content that is hidden, white, tiny, shrunk, clipped, covered or blurred inside a visible box fail, while
content set at a tight line height prints. Set `RENDER_OUT=<folder>` to keep the
files and look at them.

The engine reads each page's QR code with jsQR from the page image, cropped to the QR element and a quarter inch around
it, so the check costs little.

Licences of the engine's parts and of the embedded fonts: `THIRD_PARTY_NOTICES.md`.

## Where it runs: a Vercel function

Rendering runs in a Vercel function (Node, `sfo1`), the same as the report job. The serverless Chromium needs no
other service. Measured on a preview deploy on 2026-10-29 with `/api/workbook-render-check`:

| Book | Render time | PDF | Page images |
|---|---|---|---|
| Sample, 3 pages, first call (cold) | 3.6 s (4.5 s request) | 93 KB | 197 KB |
| Sample, 3 pages, warm | 1.1 s | 93 KB | 197 KB |
| 30 pages | 7.2 to 7.5 s | 559 KB | 2.3 MB |
| 60 pages | 14.9 s | 1.07 MB | 4.65 MB |

That is about 0.25 s a page once Chromium is running. Reading each page's QR code back from its image (added after
review, measured on 2026-10-30) adds about 0.05 s a page: the sample in 1.3 s warm (4.1 s cold), 30 pages in 8.9 s. The function's traced files are 75 MB (the compressed Chromium
is 67 MB of it), under Vercel's 250 MB limit. The check route allows 60 s (`maxDuration`). Files go straight to
Storage, so Vercel's 4.5 MB response limit does not apply. A two-week workbook (about 10 to 30 pages) renders in under
10 seconds.

On a Mac (Chrome 155, Apple silicon), the sample renders in 0.6 to 1.2 s and 30 pages in 3.0 s. The check that each line of text
leaves its own ink (a second image of each page, added after the second review on 2026-10-30) adds about 0.06 s a page
there (the sample's engine time went from about 0.37 s to 0.54 s); it has not been measured on Vercel yet.

### When to move it to a worker

Move rendering to a worker (a GitHub Actions job, like the retention worker, or a container) when any of these holds:

- a real workbook's render takes more than 30 s, half the 60 s limit (about 120 pages at today's speed),
- a render fails for memory or the function's traced files pass 200 MB,
- the generator (#311) needs render and AI calls in the same request and they together near the limit.

Check with `/api/workbook-render-check?pages=<3 to 60>` and `Authorization: Bearer <CRON_SECRET>` (on a preview, use
`npx vercel@latest curl`). It renders the sample with placeholder ids, stores nothing and answers with the time and
sizes. It is off in production unless the variable `RENDER_CHECK` is `on`, and each function instance runs one check
at a time (a second call while one runs gets 429).

## The sample workbook

`node scripts/load-workbook-sample.mjs --child <id>` renders and stores a new sample for a test family.
`node scripts/load-workbook-sample.mjs --rerender <workbook id>` renders a stored workbook of a test family again with
`replaceRendering`, keeping its id, page tokens, content, status and learning events. Both stored samples were last
rendered on 2026-10-29; the renderer's output for them has not changed since.
