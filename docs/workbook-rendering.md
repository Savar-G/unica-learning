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
the QR code, each question and each slot with a size limit. The render fails, naming the page and question, when:

- the template has no layout for a page's type,
- content overflows a slot, a question box or the page,
- a question is missing from the page or lies outside it,
- the page number is not printed as the page's number,
- the QR code is missing, smaller than 0.6 inches or off the page.

Nothing is clipped silently. `saveRenderedWorkbook` stores the PDF and the images in the private bucket
`workbook-pages`, then writes the workbook through the workbook store; if an upload or the write fails, it removes the
files it stored.

The template today is the fixed test template (`src/lib/workbook-template-fixed.ts`: cover and practice pages, Geist
and Geist Mono embedded). The real templates come from the workbook DESIGN.md (#305, #310).

Two stored pages of the sample (workbook 2), at full size. On the left, the red boxes are the stored question boxes
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
with real Chromium wherever one is found: it decodes each page's QR code from the image and counts the PDF pages. Set
`RENDER_OUT=<folder>` to keep the files and look at them.

## Where it runs: a Vercel function

Rendering runs in a Vercel function (Node, `sfo1`), the same as the report job. The serverless Chromium needs no
other service. Measured on a preview deploy on 2026-10-29 with `/api/workbook-render-check`:

| Book | Render time | PDF | Page images |
|---|---|---|---|
| Sample, 3 pages, first call (cold) | 3.6 s (4.5 s request) | 93 KB | 197 KB |
| Sample, 3 pages, warm | 1.1 s | 93 KB | 197 KB |
| 30 pages | 7.2 to 7.5 s | 559 KB | 2.3 MB |
| 60 pages | 14.9 s | 1.07 MB | 4.65 MB |

That is about 0.25 s a page once Chromium is running. The function's traced files are 75 MB (the compressed Chromium
is 67 MB of it), under Vercel's 250 MB limit. The check route allows 60 s (`maxDuration`). Files go straight to
Storage, so Vercel's 4.5 MB response limit does not apply. A two-week workbook (about 10 to 30 pages) renders in under
10 seconds.

On a Mac (Chrome 155, Apple silicon), the sample renders in 0.6 to 1.2 s and 30 pages in 3.0 s.

### When to move it to a worker

Move rendering to a worker (a GitHub Actions job, like the retention worker, or a container) when any of these holds:

- a real workbook's render takes more than 30 s, half the 60 s limit (about 120 pages at today's speed),
- a render fails for memory or the function's traced files pass 200 MB,
- the generator (#311) needs render and AI calls in the same request and they together near the limit.

Check with `/api/workbook-render-check?pages=<3 to 60>` and `Authorization: Bearer <CRON_SECRET>` (on a preview, use
`npx vercel@latest curl`). It renders the sample with placeholder ids, stores nothing and answers with the time and
sizes.

## The sample workbook

`node scripts/load-workbook-sample.mjs --child <id>` renders and stores a new sample for a test family.
`node scripts/load-workbook-sample.mjs --rerender <workbook id>` renders a stored workbook of a test family again,
keeping its id, page tokens, content and status. Both stored samples were rendered this way on 2026-10-29.
