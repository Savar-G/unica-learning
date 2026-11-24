# ADR 0004: A book is a pure function, and every book can be replayed

- Status: Accepted. Decided, not built yet.
- Date: 2026-11-24
- Source: product spec 2.4 (choice 4), 6.1 and 18; architecture spec 9.3, 10.1 (rules 1 and 5), 10.3, 10.7, 11.1, 11.3, 15 (step B7) and 17 (Workbook generator v2)

## Context

A team member must be able to rebuild a production book and find the cause of a fault. A retry must not publish a second book. Engine tests must be fast.

## Decision

- `buildBook(input)` returns the PDF, page images, page models, items, issued sheets, print contract and a list of problems.
- It uses no AI, network, database, clock or random source. It allocates nothing: ids, QR tokens, dates and seeds arrive in the input.
- The same input and engine version give the same bytes.
- The engine imports nothing from the app. Adapters do all reading and writing.
- The book job first allocates the ids, QR tokens and dates. It saves them with the input hash before the build, so a retry uses them again.
- `replay <workbook_id>` rebuilds a production book from its stored input, with the same engine, renderer, fonts and snapshot. If one of these is different or not available, replay reports which one. The spec does not say where old engine, renderer and font versions are kept. Decide it before the replay command is built.

## Options rejected

- **An engine that reads the database, the clock or a random source.** Rule 1 forbids it. The spec does not record a reason apart from the result that the rule gives: the same input gives the same bytes.
- **Store only the seed of each answer.** The numbers and the answer are stored, so old rows stay true when code changes.
- **The v1 attempts, resume and replay for AI page writing.** No AI runs when a book is made.

## Consequence

- Each workbook records its generator, snapshot, engine version, renderer version, font hashes and input hash. The full build input is in private Storage.
- One database function writes the workbook under the input hash. The same key again returns the existing revision.
- One command makes a reported bug into a failing fixture.
- Content fit is proved at the freeze. A layout failure in a book is thus an engine fault, and replay reproduces it.
- Engine tests need no browser, network or database. The target for the engine suite is under 15 s on CI hardware.
- A test builds the same book in two fresh processes. The results must match.
- A release does not change a book that is already built.
