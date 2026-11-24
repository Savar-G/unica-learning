# ADR 0006: The generator and the scan code share only the contract module

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.4 (choice 6) and 8.3; architecture spec 9.3, 10.3, 10.5, 11.1, 11.2 and 17 (Workbook generator v2)

## Context

The output of the generator is the input of the scanner. Today the scanner has QR and corner-mark positions in its code. Marking reads only some kinds of answer.

## Decision

- The engine and the scan code both import one contract module. They share nothing else.
- The contract module holds regions, captures, answer kinds, the layout registry and the teaching context. The module table describes its interface as types only (10.3). `exactNumber` also moves into this module (17).
- One answer-kind registry defines, for each kind, the stored answer, the accepted forms, the region layout and `matchAnswer(reading, answer)`. A shape uses only a registered kind.
- One layout registry is keyed by layout version and page side. v1 books stay on version 1. v2 templates are version 2.
- A contract writer (an adapter) writes the page, question and contract records that the readers of today accept.

## Options rejected

- **QR and corner-mark positions in the scanner code.** The scanner expects the two QR codes of a two-page photo 0.9 to 1.3 page widths apart. Codes on the outer sides are about 1.77 apart, so the second page would be dropped with no error.
- **Regions measured from the rendered web page.** The spec does not record a reason. [ADR 0005](0005-geometry-is-fixed-data-drawn-by-typst.md) gives the geometry rule.
- **Marking that gets answer areas from a template.** The print contract records the answer area and its reach, so marking does not guess.
- **Answer kinds that marking cannot read.** Marking today gives no AI read for remainders, times, quantities with units and compound answers. The freeze refuses a sheet with such an item.
- **More shared code than the contract module.** The spec does not record a reason.

## Consequence

- `workbook_item_answers` is the one authority for answers. The question package of a v2 book is a copy from the same write, for readers that are not moved yet.
- Regions come from the rectangles of the page model, converted from points to image pixels. Marking reads the reach rectangle from the contract when the reach work is done.
- Answer kinds and layout versions are in the contract module, which both sides import.
- Scanning and marking need changes for a v2 book. The list in 10.5 is not claimed complete. The scan conformance suite (11.1) is the gate, for each layout version.
- v1 books must still scan.
