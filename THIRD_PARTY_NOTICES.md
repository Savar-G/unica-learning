# Third-party notices

Software and fonts that the workbook renderer (#309, `docs/workbook-rendering.md`) runs or embeds in what it makes.
The render function's deployment carries this file and the packages' own licence files
(`outputFileTracingIncludes` in `next.config.ts`).

| Part | Used for | Licence |
|---|---|---|
| Chromium (the browser inside `@sparticuz/chromium`) | Lays out and prints workbook pages on Vercel | BSD 3-Clause, with the notices of its third-party parts: https://chromium.googlesource.com/chromium/src/+/main/LICENSE and https://source.chromium.org/chromium/chromium/src/+/main:third_party/ |
| `@sparticuz/chromium` | Packs Chromium for serverless functions | MIT (`node_modules/@sparticuz/chromium/LICENSE`) |
| `puppeteer-core` | Drives Chromium | Apache 2.0 (https://github.com/puppeteer/puppeteer/blob/main/LICENSE) |
| `qrcode` | Makes each page's QR code | MIT (`node_modules/qrcode/license`) |
| `jsqr` | Reads each page's QR code back from its image | Apache 2.0 (`node_modules/jsqr/LICENSE`) |
| `sharp` (and libvips) | Crops page images to read the QR code | Apache 2.0 (`node_modules/sharp/LICENSE`); libvips LGPL 3.0 or later |
| Geist and Geist Mono (`src/ds/fonts`) | Embedded in the workbook PDF and page images | SIL Open Font License 1.1 (https://github.com/vercel/geist-font/blob/main/OFL.txt) |
