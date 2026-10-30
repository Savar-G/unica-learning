# Relief SingleLine: stroke font data for Maya's board

`glyphs.ts` holds glyph path data taken from Relief SingleLine, a single-line SVG font. It is Font Software under the
SIL Open Font License 1.1 (`OFL.txt` and `AUTHORS.txt`, copied unchanged from the source repository). Keep this
folder's notices with the data.

## Source

- File: `fonts/open_svg/ReliefSingleLineSVG-Regular.svg` in https://github.com/isdat-type/Relief-SingleLine
- Commit: `01dfc5779ec1e9e4b288d96c6c96c23bfccbaf9d` (2025-02-18), downloaded 2026-10-29
- SHA-256 of the SVG file: `75f05a5b64ed6039c9816628ee051d98e16c19148a8268c63f5eccf8382479e2`

## Credits and copyright

`OFL.txt`: "Copyright 2022 The Relief SingleLine Project Authors (https://github.com/isdat-type/Relief-SingleLine)".
The SVG font's metadata says "Copyright 2021 The Relief SingleLine Project Authors". The authors are listed in
`AUTHORS.txt`: François Chastanet (isdaT Graphic Design Department), with students Noëlie Dayma and Élisa Garzelli.
No Reserved Font Name is declared.

## What we changed

`scripts/board-fonts.mjs` copies the path data of 79 characters (digits, + - × ÷ = and punctuation, a-z, A-Z) without
change. `src/lib/board/fonts.ts` then follows the curves as short straight steps, scales each glyph into the board's
cell, centres it, keeps it inside the cell and draws each stroke from its top end. The board draws its own minus sign
and check mark instead of the font's.

## Licence check (2026-10-29)

The OFL 1.1 allows the font to be used, changed, bundled and embedded in software, including commercial software, as
long as the font is not sold on its own, the copyright notice and licence go with it, and changed versions stay under the
OFL. Shipping this data inside the Unica Learning site meets those terms.
