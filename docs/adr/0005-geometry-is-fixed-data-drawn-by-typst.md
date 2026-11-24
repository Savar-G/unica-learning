# ADR 0005: Geometry is fixed data, and Typst draws it

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.4 (choice 5), 8.2, 8.3 and 8.4; architecture spec 10.1 (rules 2 and 3), 10.2, 10.3, 11.1 to 11.4, 15 (step S0) and 17 (Workbook generator v2)

## Context

Marking must know where each answer is on the page. In v1, a browser lays out the page, and the answer regions are measured after the render. The final render and the fit prints of v1 take about 16 s.

## Decision

- A page template is a fixed list of rectangles in points: slots, answer areas, reach boxes, scan marks, the QR box and captures.
- The typesetter does not place one of these by flow. An answer area is a fixed rectangle in an aligned column. It does not follow the end of the question text.
- Typst draws the page model. The Typst files hold no coordinates.
- Only the render module calls Typst. It uses only fonts in the repo. A missing font stops the build. A Typst warning is a failure.
- Fit is proved at the freeze and asserted in every book. It is never repaired: there is no shrink, omit or retry loop.
- Chromium leaves the book path when the first slice passes.

## Options rejected

- **Chromium on the book path.** Typst is faster in the measured test: 84 pages compile in 26 to 40 ms, the PDF takes 5 ms and 84 page images take 1.6 s. Repeat runs give identical bytes.
- **Answer areas that follow the question text.** The spec does not record a direct reason. It states that the print contract stores each answer area, so marking knows where to look (product spec 8.4).
- **Shrink, omit and retry loops for fit.** Rule 3 does not record a reason. Architecture spec 17 names the v1 generator and its repair loops as the main source of constant small corrections.
- **A new layout for each page.** The spec does not record a reason.

## Consequence

- Template tests compare the rectangles of the model with the positions that Typst reports.
- A failed fit names the check, sheet, page and slot.
- The freeze checks fit for every combination, with the widest numbers and sampled seeds for figures. The layout check of each book fails if there is ink in an answer area, reach box, the spine zone or a margin. The printed border of the area is permitted.
- Golden books list the pages that a code change altered. A person reads only those pages.
- The method to call Typst is not chosen yet. The default is the pinned `typst` program. The alternative is the Node binding and a rasterizer. The first slice tries both on Vercel.
- The first slice tests the five rules of architecture spec 10.1. If it breaks one, the architecture is reviewed again.
