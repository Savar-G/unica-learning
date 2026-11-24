# ADR 0002: No AI when a book is made

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 1, 2.4 (choice 2), 5.5, 6.1, 6.2, 6.3 and 12.2; architecture spec 9.2, 10.1, 10.2, 10.4, 11.3 and 17 (Workbook generator v2)

## Context

The goal of v2 is to make workbooks without constant small corrections, and to make them as standard as possible for quality, speed and cost. In v1, the time goes to AI calls and browser prints. The v1 generator and its repair loops are the main source of the corrections.

## Decision

- No AI runs when a book is made. Code selects the questions, picks the numbers and computes the answers.
- Word problems come from approved text. Each one is a defined question with number slots and theme placeholders. Code fills the placeholders from one approved scenario.
- At launch, code uses only the default theme.
- Code computes each answer twice. Two independent pieces of code must agree. If they disagree, the book stops.
- AI drafts content at bank time only. Drafts enter through the bank import command. People approve each item before a freeze.

## Options rejected

- **An AI rewrite of word problems for each book.** Approved text needs no safety review, solver or reading-level check for each book. A book cannot fail because of a model or its limits.
- **The v1 method: AI writes pages, with attempts and repair loops.** The generator and its repair loops are the main source of the corrections.
- **Separate lists of theme words.** Separate lists can make a story that does not make sense. A scenario is a whole set of place, container, thing, verb, unit and quantity limits.

## Consequence

- Each printed word comes from approved text. No person reviews each book for safety.
- Three checks run on each book: source, layout and level. A book that fails stops with a list of problems.
- A book uses no AI, so the target is a build on Vercel. Then the service works when the Mac is offline. The first slice must prove this. The Mac worker stays only as a fallback.
- Variety is limited to what the bank holds. When a row has no unseen item, code uses the items that the child saw longest ago, in a new order. Where the item allows it, code swaps the form. The builder does not fail a book for this.
- New wording needs a bank change, an approval and a freeze.
