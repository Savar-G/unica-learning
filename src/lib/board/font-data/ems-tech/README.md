# EMS Tech: stroke font data for Maya's board

`glyphs.ts` holds glyph path data taken from EMS Tech, a single-line SVG font. It is Font Software under the
SIL Open Font License 1.1 (`OFL.txt`, copied unchanged from the source folder). Keep this folder's notices with the data.

## Source

- File: `fonts/EMS/EMSTech.svg` in https://gitlab.com/oskay/svg-fonts (Evil Mad Scientist's SVG font collection)
- Commit: `8c71f2d9e1a5292047bb88e5595a766241b82cc6` (2024-07-12), downloaded 2026-10-29
- SHA-256 of the SVG file: `6da30b0e44022a07043204f6936ba929a3cf756609921a48ce1a7309a5270775`
- Licence file: `fonts/EMS/OFL.txt` in the same repository

## Credits and copyright, as the font and its sources state them

From the SVG font's metadata:

```
Font name:               EMS Tech
License:                 SIL Open Font License http://scripts.sil.org/OFL
Created by:              Sheldon B. Michaels
SVG font conversion by:  Windell H. Oskay
A derivative of:         Architects Daughter
Designer:                Kimberly Geswein, Kimberly Geswein Fonts
Link:                    http://www.kimberlygeswein.com/
Google font page:        https://fonts.google.com/specimen/Architects+Daughter
```

The original font's licence (https://github.com/google/fonts/blob/main/ofl/architectsdaughter/OFL.txt) starts:
"Copyright (c) 2010, Kimberly Geswein (kimberlygeswein.com)". No Reserved Font Name is declared.

## What we changed

`scripts/board-fonts.mjs` copies the path data of 79 characters (digits, + - × ÷ = and punctuation, a-z, A-Z) without
change. `src/lib/board/fonts.ts` then scales each glyph into the board's cell, centres it, keeps it inside the cell and
draws each stroke from its top end. The board draws its own minus sign and check mark instead of the font's.

## Licence check (2026-10-29)

The OFL 1.1 allows the font to be used, changed, bundled and embedded in software, including commercial software, as
long as the font is not sold on its own, the copyright notice and licence go with it, and changed versions stay under the
OFL. Shipping this data inside the Unica Learning site meets those terms.
