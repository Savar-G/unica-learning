# Parent workbook access

Parents cannot download a full workbook PDF. The Workbooks screen and its Admin sample have no Print a page again section or PDF control. The old parent PDF endpoint returns 410 without a family read, signer or redirect. The parent signer modules are removed. Admin printing and the child's shipped PNG access remain unchanged.

The same screen now offers each delivered book's whole answer key. The direct key page checks sign-in and the dashboard release gate itself. Its reader checks the exact parent, child, shipped book and receipt before loading any questions. It checks the effective receipt again after loading. The shared delivery rule applies the greatest correction audit and refuses a missing, retracted, invalid or future receipt. Neither shipping nor a predicted arrival releases a key.

The projection uses the frozen stored package answers and every keyed region in reading order. Pages and questions stay in printed number order. It keeps typed fractions, remainders, quantities, clock times, choices and accepted equivalent forms. Part numbers keep their original place when another part has no fixed answer. Equation answers are labelled as examples. A drawing or other open task has a plain message. An unreadable legacy question stays visible with an unavailable-answer message. A readable legacy package does not need a new print contract. An empty book has an explicit empty state.

No marking read is needed. The page sends answer values and page/day/question labels only. Tests reject worksheet text, page images, file paths, raw packages, steps, private profile details and validation reasons in the output. No book is regenerated. No model or provider is called.

The Admin explorer uses the actual Workbooks and answer-key components. The complete key sample comes from the existing synthetic stored-workbook data through the same projection. Its other states show multiple answers, example answers, open work, unavailable content, an empty key and an ended plan. There are 11 Workbooks and key scenarios, recorded from the shipping catalog in `scenarios.json`. The complete explorer has 11 views and 97 scenarios.

## Falsifiers and local checks

Before checks, the recorded failure conditions were an active parent PDF control/API, an answer read without a current matching delivery, cross-family or foreign child/book access, lost printed ordering, a missing answer region, leaked worksheet/package/private data, or changed Admin/desk behavior.

Public-interface tests were written first. The old Workbooks screen failed because it still offered the PDF control and had no delivered-key link. The new reader suite initially had no module to import. The fixtures then passed the existing stored-package checker, so the final format tests exercise actual stored question shapes.

The focused check passes 319 tests in 10 files. Source lint and the production build pass. The build checks the new route and all test types. The one full suite, with four workers, stopped at the 300-second bound (exit 124, elapsed 300.1 seconds). It produced no final test totals. This is incomplete global verification. No second full suite ran. See `verification.json` for commands and exits.

The reader checks proved identity and delivery refusal, old-book access, correction/retraction handling, all unmarked pages, printed ordering, representative stored formats, version 1 keys, accepted forms, open work and safe legacy/empty output. They passed through fake/in-memory stores and a fake PostgREST session, not hosted services.

The route checks proved independent sign-in/release gates and the real pure desk lock. The PDF tombstone made no auth, family, storage or signer call. The Admin checks rendered the real components. These checks do not prove live cookies, Storage, browser layout or interaction.

## Root work and limits

Root owns browser checks, live authorization, independent review, PR and coordinated merge. No release flag changed. The worker made no hosted write and changed no migration or generated database type. Root's already-applied restrictive Storage policy is preserved from the base commit.

The existing policy in `supabase/migrations/20261030_workbooks_parent_shipped_only.sql` still permits parents to read raw question packages for their shipped books before delivery. The new web route enforces delivery, but it cannot revoke that existing database access. A database-wide answer-release guarantee needs a separate desk-safe read design and migration. This is a concrete release limit for root, not a hosted claim from this worker.

No #675 explanations, reduced #565 history/marking UI, voice change, #542 controller change, paid call, email, Stripe action, push, PR or merge is included. No browser process or development server was started by the worker.

The raw-question release limit above records the first implementation. The source repair and its new local evidence are in `delivery-repair.md`; hosted application and verification remain with root.
