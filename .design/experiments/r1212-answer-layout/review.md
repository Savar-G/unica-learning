# #1212 answer box layout: before and after

Synthetic pages only (made-up questions, no real child or family). Regenerate with:

```sh
node scripts/render-workbook-answer-layout.mjs <folder> --levels 6,12   # the pages below, one PNG each
node scripts/render-workbook-templates.mjs <folder> U6 U12 --all        # whole 84-page sample books
```

"Before" is `main` at `dcaaab8a`, "after" is this branch. Pages are 1275 by 1650 pixels (letter, 150 dpi), Chromium, measured layout.

| Item | Page | Before | After |
|---|---|---|---|
| 1. Show your work: answer box at the bottom right of a card, no label | Show what you know, U6 | 01-show-your-work-test-card-U6-before.png | 01-show-your-work-test-card-U6-after.png |
| 2. Every answer box lines up (a long word answer sat at the left of its row) | Practice, U12 | 02-aligned-boxes-before.png | 02-aligned-boxes-after.png |
| 3. Yes/no and true/false on the right, no "How do you know?" label in the box | Challenge, U12 | 03-yes-no-challenge-before.png | 03-yes-no-challenge-after.png |
| 4. Comparison with the box between the numbers | Quick check, U12 | 04-comparison-before.png | 04-comparison-after.png |
| 5. Five-skill check header without "No hints." | Friday 5, U12 | 05-five-skill-check-before.png | 05-five-skill-check-after.png |

A Challenge card with a calculation already printed its box at the bottom right with no label on the measured layout in `main`; the cards in item 3 show it.

## Whole books

`full-book-U6-*.png` and `full-book-U12-*.png` are contact sheets of the 84-page sample books (saved legacy layout), before and after.
Page by page, 157 of 168 pages are pixel-identical. The 11 that differ are the 4 Friday 5 pages (the header note) and 7 pages with a one-pixel-row difference
that also appears when the same code is rendered twice (Chromium anti-aliasing).

The same books forced onto the measured layout: sample content is not built for it, so many pages fail the strict fit check on both sides. The set of failing pages is
identical before and after, except U6 page 76 (Show what you know), which fails before and passes after. Passing pages differ only by Friday 5's header note and
one-pixel-row noise.
