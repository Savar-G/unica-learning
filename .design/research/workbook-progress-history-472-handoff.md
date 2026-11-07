HANDOFF_READY

This change implements only the bounded retained-history reader and public preview composition for #472. It does not complete #472. The source commit is `333fb6c5d610372ebd7ee60ef06485adea17aedd`. The next local commit adds only this report. Resolve that report commit with `git rev-parse HEAD`.

The computer is `Savars-MacBook-Pro-5.local`. The assigned path is `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-470cdf68`. Its physical path is `/Volumes/Lexar/Dev.noindex/t3-worktrees/pagewise-landing-page/t3-470cdf68`. The branch is `site/workbook-progress-history-472`. The initial clean HEAD was `550fdcf1619c0e515e8ac33e2a65869d8c937af7`. The explicitly permitted fast-forward reached `383685fb2877efd8ad1d862f5aefa95f8c83884b` before implementation. No newer main was imported. No other checkout or agent was created. The PC was unavailable, as stated in the task.

The approved foundation includes merged PR #697 at `89963c956d5eee2b87d18c58e9c35181b9aeef7f`, the core repair at `14cd5144cf2f6834193d1b71133a8fe8eaa10980`, and the preview repair at `7f1fd64e4bca9faaf062c1ecc8e5daecb34f3c6a`. Those approvals were task inputs. This change does not grant a new independent approval. The actual implementation model is `gpt-6.1-sol`, high reasoning effort, on the assigned Unify Codex account. The required legacy co-author trailer names Claude Opus 5.5. That trailer is not the implementation model.

Only these new files belong to this change:

- `src/lib/workbook-progress-history.ts`.
- `src/lib/workbook-progress-history-store.ts`.
- `src/lib/workbook-progress-history.test.ts`.
- `src/lib/workbook-progress-history-store.test.ts`.
- `src/lib/workbook-progress-history.fixture.ts`, the one permitted synthetic fixture helper.
- `.design/research/workbook-progress-history-472-handoff.md`.

No existing source, test, approved core, preview, planner, generator, curriculum, package, renderer, instruction, decision, configuration, type or migration changed. The source commit contains five new files and 1,077 lines. This report is separate.

The public reader is `readWorkbookProgressHistory(store, input, limits)`. Its input version is 1. The public composition is `previewNextWorkbookPlanFromHistory(store, input, planning, limits)`. The composition calls the approved `previewNextWorkbookPlan` only when correction completeness is explicitly validated. That preview calls the approved core and the actual public planner. Raw facts can remain readable while a definitive plan is refused. It returns the retained evidence and the actual preview result. A failed source read returns no successful preview or private evidence.

`WorkbookProgressHistoryStore` is an explicit read-only seam. It supplies a scope/revision/count fence and exclusive-cursor pages of canonical items, parent changes, and relevant workbook learning events. `workbookProgressHistoryStore(db)` implements that seam with the current generated Supabase schema. Both implementation modules are server-only. The adapter accepts an existing typed client. It does not obtain credentials or create a session.

The caller MUST authorize the live parent or admin before using the store. Service-role credentials do not authorize the caller. The caller must authenticate the exact parent, child, shipped books, frozen revisions, curriculum, approved selected step, complete required sample, and frozen package/context catalog. A reference string alone proves none of these facts. The catalog must include the instruction pages and questions needed to validate every retained record in the selected books. A missing catalog entry causes refusal. Catalog days are explicit integers from 1 through 10. Legacy or extra pages without a provable printed day are unsupported.

The caller supplies `snapshot.priorMastery` and a matching explicit proof reference. The caller also supplies the complete issued-decision list for the selected step through the cutoff, plus its proof reference. An empty list still requires that proof. The reader does not read a current profile or substitute an empty issue list. The caller must validate the ordinary planning input, including assessment or selected-scope profile facts, other-skill prior mastery, saved reviews and misses. Do not pass an all-days current profile as proof for this selected scope.

The input pins every book, printed revision and allowed printed day. A `day7` selection names the current book and refuses any of its Days 8 through 10 in the consumed scope. Older selected books can include those days explicitly. `later-book` and `backstop` selections require an explicit trusted reference. They can include retained Days 8 through 10. This reader verifies a declared scope. It does not prove a Day 7 trigger, delivery receipt, backstop time, or queue admission.

The required sample is a separate list of item identities. The reader obtains each expected item from the trusted frozen package and teaching context through public `expectedItems`. It does not build the sample from existing mark rows. An unscanned required item remains in `snapshot.requiredSample` with a null result version. Empty complete source history can therefore produce an insufficient-evidence preview. Unknown scope, a failed source, an absent count, and a safety limit produce `availability: unavailable` instead.

The source and normalization map is as follows:

| Persisted source | Read fields and normalization |
| --- | --- |
| `scan_marking_items` | Read canonical ID, parent, child, book, printed revision, page, item, expected item, observation, result version, original-event intent, published event ID, evidence time, model and prompt. Validate the expected item against public eligibility from the frozen package/context. Validate every observation and exact identity. Do not read owner-photo leases. |
| `scan_mark_changes` | Read ID, item-row ID, parent, child, actor, from/to versions, changed time, full `previous` marking row and `current` observation. Join the canonical item only to restrict book/revision. Reconstruct the first retained reading from the earliest full previous row. Check every contiguous parent change through the current row, including changes after the cutoff. Preserve reading text, typed regions, certainty, help and photo reference. |
| `learning_events` | Read ID, idempotency key, family, source, exact workbook question, event time, result, hints, evidence kind/ID and recorded skill fields. Paginate all permitted events for the pinned books. Validate question/skill identity against the frozen catalog. Resolve published marking IDs against the actual event and retained original-event intent. Match relevant call help by exact book/page/question and time. No correction event enum is invented. Assessment proof remains caller-supplied. |
| `scan_marking_revisions` | Read only parent, child and canonical marking revision. Read it before and after each scope fence. Compare the start and final fence around pagination and normalization. |
| `parents`, `children`, `family_deletions`, `child_deletions` | Read only identity and deletion/freeze fields. A missing family/child, parent freeze, family deletion or child deletion refuses. Repeat these checks in the final fence. |
| `workbooks`, `workbook_pages` | Recheck exact ownership, shipped status, printed revision and manifest. Check catalog page identity, printed number and frozen print-contract day. Do not load images, PDF paths, QR tokens, page content, costs, jobs or runs. |

The successful result contains scoped normalized originals, explicit used versions, the frozen required sample, held originals, held post-cutoff parent changes, and source/cutoff/count proof. `availability: complete` means the permitted source queries completed under matching observed fences. It does not mean the required sample is resolved, that corrections are known, or that a snapshot was saved. The approved core supplies the sample status and decision.

The pure core uses a string field named `provenance.eventId`. For a published original, the reader uses the actual `learning_events.id`. For an original pending/unscored record without that event, the reader uses a labeled actual row reference: `scan_mark_changes:<id>:previous` or `scan_marking_items:<id>:<version>`. Parent adjudications use `scan_mark_changes:<id>`. `proof.references` discloses the table source and result version of each reference. These audit references do not assert that a learning-event row exists. A stored publication reference that cannot be resolved refuses with `missing-source-reference`.

The normalizer accepts the retained initial version 1 or the first automatic reading at version 2. It requires a complete parent journal for higher versions. It does not invent the preceding automatic pending observation. If the first retained automatic reading is after the requested cutoff, or if an automatic retake removed an earlier reading, it returns `unproved-past-state`. The current schema does not provide a complete automatic original-version journal. Supporting every past automatic state needs later storage work. No schema change was authorized here.

Parent original adjudication and a child's later fix remain separate. Parent changes can change the effective original judgment at the cutoff. They do not replace the retained first reading. A post-cutoff parent judgment appears only in `heldChanges`. It cannot change the current preview. Postgres microseconds round forward to integer milliseconds. The proof declares `timeNormalization: ceil-millisecond`. This prevents a judgment one microsecond after a millisecond cutoff from entering that cutoff.

The recorded `evidence_at` value is recognition time. It is not the time the child wrote the answer. A matching help call before the retained mark therefore blocks a claim of independence but leaves its order relative to the paper answer unknown. The reader keeps an existing explicit `math-help` value. Otherwise it uses `unknown` when such a call exists. It preserves that state through parent changes. `proof.helpEvents` records the actual call-event IDs. `proof.helpTiming` states the missing answer-time capability. A later successful Maya call never supplies a second try or removes a miss.

The merged source here has no #471 second-try reader. The caller can supply separately validated, complete correction evidence through the explicit proof seam. Otherwise `proof.corrections` is `unavailable`. Empty internal second-try arrays in that case are not proof that the child made no corrections. Causes also remain `unavailable` unless trusted recorded proof is supplied. Numerical text such as `56` establishes no cause. The approved core validates supplied version-bound causes and corrections. Other-step retained records remain held evidence. This slice computes no other-step progress, correction state, cause classification or review schedule.

Pagination uses an exclusive ID cursor with ascending order. The default batch is 100. The reader continues to a proven empty tail even when the server caps a response below that batch. Exact remaining counts must decrease by the retained page size. Empty positive pages, missing counts, repeated/backward cursors, duplicate/conflicting canonical rows, orphan journals, inconsistent versions, foreign scope and source failures refuse the entire read. A valid shorter positive page does not imply completion.

The default safety limits are 20,000 total source rows and 1,000 pagination requests. Configurable upper bounds are 100,000 rows, 5,000 pagination requests and a batch of 500. The input allows at most 20 books and 2,000 catalog pages per book, with at most 100,000 catalog items. Each store fence also has a fixed bounded query count from those limits. Its page checks use groups of 100. `proof.counts.requests` counts pagination requests only. Reaching a limit returns unavailable. It never returns partial progress.

The fences detect observed canonical marking revision and exact collection-count changes, including a late event insertion. They also recheck family/child/book/page scope. This is an optimistic read, not a transaction or a write lock. It cannot prevent a write after the last check. The later saved-snapshot/issuance boundary must bind and revalidate the evidence it uses. This change creates no #476 snapshot, queue, issuance ledger, or writer.

The test falsifiers were stated before execution: lost old reading `56`; missing item/journal/event pages; an unchanged successful preview after a dropped page; incorrect teaching target or Fix it avoidance; post-cutoff judgment use; a failed source treated as empty; or success after a scope/version/fence change.

The main positive fixture has 126 canonical items: 123 selected originals across two books, plus retained current-book Days 8, 9 and 10. It has 105 parent journal rows and 126 marking events. The first mark time is `2026-01-01T12:00:00.000Z`. The cutoff is `2026-11-07T12:00:00.000Z`. The selected result has 100 independent first-right answers out of 123. The actual public preview repeats step 2 with new numbers. Its actual Fix it avoids the original question and published event of the older book's wrong item. The retained reading remains `56`, well beyond 90 days. The actual-client fixture also succeeds with a synthetic server cap of 37.

An explicit later-book preview includes all 126 originals. A separate test reads the same retained history before and after the nominal 90-day photo lifetime. Repeated photo evidence IDs create no extra canonical attempt. Duplicate canonical rows refuse. These are reader tests. They do not test upload admission, physical photo expiry, handwriting recognition, or hosted cascade deletion.

Additional public tests cover a 105-change chain for one item, parent changes before/after cutoff, true parent-pending resolution, uncertain original resolution, known versus unavailable correction proof, earlier help, later Maya success, explicit issued repeats, stale/conflicting journals, malformed held evidence, microsecond cutoff, repeated/backward cursors, missing/truncated pages, bounds, foreign parent/child/book/revision/page, and scope/freeze/deletion changes during reads. Two independent read paths run concurrently in one test. No actual image, Storage, Auth, provider or service call occurs.

Binding negative controls remove a later items, journal or events page. The controls fail the same actual preview assertion that the complete source passes. The typed-adapter controls also drop the second response page. Row/request-limit controls return no preview. These checks do not rely only on a mock request counter.

Final selected checks ran on source commit `333fb6c5d610372ebd7ee60ef06485adea17aedd` without a full gate:

```sh
node /tmp/run-progress-history-472-focused.mjs src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts src/lib/workbook-progress.test.ts src/lib/workbook-progress-plan.test.ts > /tmp/progress-history-472-focused.log 2>&1
```

Result: 4 selected files, 240 tests, 240 passes, exit 0. The exact filtered task array is `/tmp/progress-history-472-tests.json`. The final machine recount returned `{"files":4,"count":240,"states":{"pass":240}}`. This is one current selection. It is not a sum of prior reports. No skipped or unrun test is counted as passing.

```sh
node /tmp/run-progress-history-472-scoped.mjs src/lib/workbook-progress-history.ts src/lib/workbook-progress-history-store.ts src/lib/workbook-progress-history.fixture.ts src/lib/workbook-progress-history.test.ts src/lib/workbook-progress-history-store.test.ts > /tmp/progress-history-472-scoped.log 2>&1
```

Result: scoped ESLint, zero errors and zero warnings; scoped TypeScript, zero diagnostics; exit 0. The log contains a React package auto-detection notice because this checkout has no installed React package. That notice is separate from source warnings.

The runner uses this checkout as root, explicit source aliases and test includes, `maxWorkers:1`, `run:true`, `watch:false`, `cache:false`, `configFile:false` and `envDir:false`. It closes Vitest in `finally`. It borrows installed tools only from `/Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-e10c57ae/node_modules`. It reads no peer source or configuration. No install or symlink was made. The scoped runner reads this checkout's TypeScript settings, uses five explicit source roots and their imports, disables emit/incremental/plugins, and resolves installed package types from the permitted tool directory.

Verified tools: Node `v22.23.1`, Vitest `4.1.11`, TypeScript `5.9.3`, ESLint `9.39.5`, Supabase client `2.117.2`. Committed tests do not load historical Git objects. The test calls use public module interfaces. Persisted JSON gets runtime validation. Supabase queries use the current generated schema without query type overrides.

The first test run exposed an extra approval-reference field in a synthetic teaching step. The fixture was corrected. A foreign-book test initially filtered its malformed row out before the reader could inspect it. It was corrected to inject the foreign row in the returned scoped response. Scoped types then exposed test-helper union inference and a synthetic difficulty value. Those were corrected. Final selected tests and scoped checks pass.

Proof by subsystem:

- Canonical source reading proves full keyset pagination, retained original text, parent journal reconstruction, source references and bounded refusal in the synthetic cases. It does not prove hosted permissions or recognition accuracy.
- Cutoff selection proves actual Day 7 exclusion, explicit later-book inclusion and no post-cutoff effective judgment in the tested cases. It does not create a saved snapshot or trigger.
- Public composition proves the actual planner target/action and original question/event avoidance for Fix it. It does not generate or render replacement pages.
- Help and correction handling proves conservative help preservation and no inferred fix from a Maya success. It passes through validated caller correction/cause proof and exposes unavailable sources.
- Ownership and concurrency checks prove refusal for the tested final scope/revision/count changes. They do not supply a database transaction or a lock.
- Scoped types and lint prove the five roots and their imported types satisfy these checks. They do not prove the application build or full done gate.

Root work remains: live caller authorization and a trusted frozen package/sample loader; actual issuance/prior-mastery storage; a complete automatic version ledger if every historical pending state is required; merged second-try proof reading; any source that proves help occurred before the paper answer; saved preview/snapshot inputs; Admin UI through the design workflow; #473 review scheduling; #476 snapshot/queue work; hosted RLS, retention and deletion checks; independent review; and the later full test/lint/build/browser gate. Unsupported legacy contexts, incompatible curriculum versions and unprovable history must remain refusals.

No UI, API, writer, real Auth/session, service/provider/model/image/Storage call, credential/environment read, customer-book action, email, charge, flag, deletion, full suite, application build, Chromium, server, push, PR, watch or issue closure ran. Commit hooks were disabled to prevent unrelated checks. Every owned check process exited. Vitest contexts closed. The source commit and this report remain local.


## Root repair round 2

The independent review of cc892638 found three P2 defects. Its report remains SPEC FAIL for that prior pin. Root repaired only the new history implementation, fixture and public tests. Existing core, preview, planner and print sources remain unchanged.

- F1: unavailable correction proof no longer produces a definitive plan. readWorkbookProgressHistory can still return the retained facts with corrections unavailable. previewNextWorkbookPlanFromHistory returns the bounded corrections-unavailable refusal before any plan is returned. The synthetic fixture now explicitly attests complete empty corrections for positive plan cases. Unknown, validated-empty and validated-fixed cases are separate. A real caller must supply actual complete proof; this test attestation is not a new production source.
- F2: held selected-step records use the core's no-sample validation path. They do not become one-item passing samples or trigger an isolated mastery-gap decision. Eight right/wrong, prior-zero/prior-one and outside-day/outside-sample controls retain the selected plan. A separate real selected mastery-gap control still refuses. Malformed held records still refuse.
- F3: the server adapter uses Node isDeepStrictEqual for manifest structure. Object key order does not change equality. Array order still matters. The actual-client test compares the full preview before and after recursive object-key reversal; another test refuses changed array order.

Final root selection: four files, 252 tests passed, exit 0. The exact same test selection ran against both prior implementation modules loaded from cc892638 in memory: four failures and 248 passes, exit 1. Two failures isolate F2, one F1 and one F3. No tracked source was replaced by that control. The earlier intermediate 251-test selection is not the final count.

The five owned TypeScript roots pass scoped lint with zero errors or warnings and scoped TypeScript with zero diagnostics. The React auto-detection notice is a tool notice from the isolated checkout without installed React, not a source warning. No install or symlink was made. No full suite, build, browser, hosted call or production action ran.

Exact task arrays, logs and exits are under overnight-20261107/472-history-r2-prior.*, 472-history-r2-fixed.* and 472-history-r2-scoped.*. Root runners run-472-history-r2-prior.mjs and run-472-history-r2-fixed.mjs retain the explicit source roots, source aliases and no-env configuration. A new independent recheck is still required. Whole #472 remains incomplete.


## Root repair round 3

The R2 independent recheck closed F1 and F3. It found one F2 regression: the core no-sample validation cannot see the held item's teaching-context version. Unsupported versions 0 and 2 were accepted for held items while selected items refused them.

Root now validates every non-null catalog context version before accepting the catalog entry. Only version 1 is supported. The held validation still uses requiredSample null, so a valid right answer does not create an isolated mastery decision. No core, preview, planner or print source changed.

New public controls cover held outside-days and outside-sample records, right and wrong results, prior prefix zero and context versions 0/1/2. Selected records use the same 0/1/2 rule. The actual selected mastery-gap guard, F1 correction refusal and F3 structural comparison controls remain.

The final four-file selection passes 267 tests, exit 0. Before the source correction, that same selection failed eight unsupported-context assertions while 259 passed, exit 1. Scoped five-root lint has zero errors/warnings and TypeScript has zero diagnostics. The synthetic React package notice is unchanged.

Round 3 has dedicated task arrays/logs/exits under overnight-20261107/472-history-r3-prior.*, -fixed.* and -scoped.*. The first R3 invocation reused the R2 task-array destination. Its output was preserved as the R3 prior array. An exact pinned 6b465b41 in-memory replay then restored the R2 252-pass task array, with its own 472-history-r2-replay.log/exit. No tracked source was replaced. Historical reports keep their original failed verdicts. A new narrow independent F2 recheck remains required.
