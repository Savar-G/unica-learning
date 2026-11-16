# Product brand consistency audit

Issue: https://github.com/Savar-G/unica-learning/issues/1112

Status: audit and implementation plan complete; visual implementation blocked by missing required `/design` workflow. This is the explicitly authorized fallback, not completion of #1112.

## Baseline and ownership

Fresh `origin/main` at preparation: `4426ab082b3366679070166bcf50fc631c2efb92`.
This existing delegated checkout was clean before switching to `site/product-brand-consistency` from that commit. No other checkout was switched or created. Issue assignment remains `cedrictanafranca`.

The open PR list on 2026-11-15 Pacific contained #1120, #1119, #1118, #1047, #995, #928, #828, #760 and #667; none owns this consistency pass. Old dashboard and page-results worktrees still exist, but no matching PR is open. Related page-results #1100 and scan-retake #1069 are merged. This is a Git/PR ownership check, not proof that another agent has no uncommitted work.

## Design references

Read current main's `AGENTS.md`, `docs/agents/delegate-brief.md`, `DESIGN.md`, the relevant decision history, and existing `src/ds` primitives/styles/fonts. `source-evidence.json` pins source hashes and line-numbered excerpts; regenerate it with `python3 .design/experiments/r1112-brand-consistency/audit.py`.

`DESIGN.md`, Visual language, specifies Geist headlines and body, light 300 sentence-case headlines with tight tracking, Geist Mono labels and an orange square marker. D-034 records that look. Existing implementations of it are `UnicaRoot`, `Eyebrow`, `Button`, `src/ds/styles/warm.css` and `support.css`. Warm headlines use weight 300 and tracking -0.035em; h3 uses 500. Controls use 6 px corners and weight 500. Use support-page sizes for product headings rather than copying the marketing hero's size.

The specific approved page-results contract in `DESIGN.md`, Parent problem explanations, also applies: keep the orange white-text action, amber numbered question markers, green correct ticks, photo overview, saved question progress and independent Previous/Next. Its existing evidence in `r-page-results` belongs to that implementation and is not new evidence for #1112. Do not replace these approved semantic treatments indiscriminately with generic dark buttons.

## Required workflow search

Project `AGENTS.md` says: "All design work goes through /design. Mockup rounds live in .design/experiments/r<n>/, with a manifest.json."

Searched tracked current-main paths plus local project `.claude`, `.agents`, `.codex`, global `~/.claude/commands`, `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.codex-unify/skills` and cached plugin skills. Also inspected the original main checkout's `.claude` directory and the physical-comparison checkout's `.claude` directory. Neither has the workflow. Current main has no tracked provider skill/command directory containing it. Global Claude commands contains only `prompt.md`.

Global skills include `design-consultation`, `design-html`, `design-review`, `design-shotgun`, `design-taste-frontend`, `frontend-design`, `high-end-visual-design` and `emil-design-eng`. None is the project's `/design` workflow. `gstack/design/` contains a CLI implementation (`src`, `dist`, tests), not a `/design` SKILL.md; its callers use gstack's own artifact system. These are not silently substituted. Existing `.design/state.json` records earlier project gates and artifacts, not the missing command's instructions.

No visual proposal, CSS, component or product behavior changed. Resume by locating the original workflow source, reading it, then executing the scoped plan below. No new design system or flow is proposed.

## Route and state inventory

All routes below are under `src/app/(product)/account/(dashboard)` except the shared shell. States are source inventory and required QA coverage, not claims that they were rendered.

| Route / area | Components and styles | States and behavior to retain | Finding / intended change |
| --- | --- | --- | --- |
| Shared account layout, all tabs | `parent-shell.tsx/.css`, `support-page.tsx`, `src/lib/parent-shell.ts` | Selected child, stage-dependent tabs, sidebar, mobile bottom navigation and More sheet, desk/PIN entry, feedback, no children | Shell lines 3–6 explicitly replace Mono with Geist, including nested theme roots. Restore DS Mono inheritance. `.pd-top-name` and `.pd-name-row h1` force 700; use the existing light heading hierarchy. Preserve desktop visually hidden Overview h1 and mobile desk placement. |
| `/account?child=<id>` Overview | `parent-dashboard-home.tsx`, `parent-overview.tsx/.css`, `parent-option-a.css` | Pretest, continue/wait, report redirect, phone sign-in link, first book in mail, preparation, current book, today, scans, highlights, unavailable overview fallback, closed plan | Shared `.pa h2` is 700 at 18 px; counts use 700. Reduce heading weight first; keep compact product sizes and hierarchy. Review counts separately from headings. |
| `/account/progress/[child]` | `parent-progress.tsx/.css`, `parent-progress-panels.tsx`, `parent-option-a.css` | No marked pages, unavailable read, weekly/monthly selection, chart/topics, no invented zeros | Progress h1 forces 700; metric `.pp-v` is 700. Remove heading override and review metric emphasis. Preserve chart labels, calculations and selection. |
| `/account/scan` | `scan-pages.tsx/.css`, `scan-tab.css`, `scan-preview.tsx`, `scan-marking-results.tsx`, `scan-history.tsx`, `scan-problem-explanation.tsx` | Desktop QR/email/phone handoff; camera/file input; empty; saved/checking/busy/refused; page mismatch; cut-off photo; retake; automatic-send hold; Undo and recovery; manual retry; marking; budget held; team waiting; completed; history loading/failed/unavailable/filter/pagination | Already uses shared tokens in much of flow. Fix inherited Mono first. Audit 500-weight section headings individually and semantic status weights separately. Preserve retake targets, camera versus file source, per-page hold and sticky Undo. Never restore removed parent mark-changing controls. |
| `/account/scan/results/[id]` overview | `scan-page-results.tsx/.css`, route page | Marked, unmarked, unfinished, team waiting, photo expired, unaligned photo, budget held, signed-out/session-ended | `.spr` duplicates font stack and local colours; h1 is 600, h2 500. Reuse shared type/ink/line tokens while preserving approved orange action and amber/green result meanings. Do not invent marker regions or rerender stored books. |
| Same route, together / all done | `scan-page-results.tsx/.css`, `src/lib/scan-page-results.ts` | Step-by-step/show-all, partial reveal, saved per-question progress, whole-photo/zoom toggle, unsupported answer, loading/busy/retry/cap/closed/stale, all done, return to results | Align heading/control typography and focus treatment only. Previous/Next remain available without step revelation; only the first question's Previous is disabled. Preserve announcements and focus after screen changes. |
| `/account/workbooks/[child]` and `/book/[workbook]` | `parent-workbooks.tsx/.css`, `workbook-days.tsx/.css`, `workbook-book-list.tsx` | No book, in mail, current book/day links, delivered, tracking, older books, photo history loading/empty/failed/team/completed | Workbook cover h2 forces 700; labels use sans 600 and uppercase; multiple 10–20 px card/control radii diverge from DS. Use mono for true labels; keep printed page/cover identity and all delivery facts. |
| `/account/workbooks/[child]/answers/[workbook]` | `parent-workbook-answers.tsx`, `parent-workbooks.css` | Answer keys, per-day questions, missing/available content | Existing h3 uses DS sans 500. Check inherited labels/card borders without changing keys, ordering or access. |
| `/account/notes/[child]`, `/[session]` | `parent-maya-notes.tsx/.css`, note route pages | No notes, usage/week summary, latest/list/session, chat versus call, pagination, transcript, missing note | Mostly shared type already. Facts use Mono but shell suppresses it. Preserve family-local dates, outcome wording and transcript content. Review 10/12 px card radii against the existing DS context, not a blanket global replacement. |
| `/account/settings` and linked plan/settings pages | `parent-account-settings.tsx`, `account-billing-section.tsx`, `account-child-details.tsx/.css`, `parent-shell.css`, shared account styles | Card updated/unchanged/unconfirmed/failed, invoices, multiple plans, details editing/errors, child add/delete, sign-out/family delete, referrals; closed families can manage/cancel/leave | Account largely inherits `SupportPage`; restoring shell Mono affects eyebrows/facts. Keep action prominence and status hierarchy. No billing actions, provider calls, delivery changes or plan-gate edits during QA. |

## Reviewable implementation sequence

1. Restore the required `/design` source and read its gates. Record its exact path in the manifest. Read installed Next docs before any route/component implementation and apply TypeScript skill. Recheck ownership and current-main drift before resuming.
2. Shell slice: remove the `--mono: var(--sans)` override instead of adding compensating page rules. Set child-name/page headings to the DS light weight while preserving name layout, wrapping, responsive navigation and focus order. Verify shell and layout regressions.
3. Shared dashboard slice: revise `parent-option-a.css` at the shared heading/button/card definitions. Reuse warm tokens instead of spreading new literal colours. Avoid global h1/h2 rules outside the parent product. Check Overview and Progress normal/empty/unavailable together. Do not change report styles.
4. Scan slice: align existing stack/sheet/history headings and labels; retain semantic messages and orange scan affordances. Exercise retake/retry/Undo with synthetic uploads and fake endpoints. Keep timer and send logic untouched.
5. Results slice: use `--sans`, `--mono`, ink/line/soft tokens and shared control dimensions as applicable. Preserve approved orange CTA semantics. Keep all callbacks/reducer state and explanation eligibility untouched. Review team-waiting and unsupported explanations independently from incorrect answers.
6. Workbooks/notes/Account slice: remove only demonstrated typographic overrides; bring genuine metadata labels into the existing mono eyebrow/facts hierarchy. Keep compact product sizes. Confirm tracking, answer keys, transcript access, all setting links and closed-family management paths.
7. Add a minimal direct `DESIGN.md` reference only if new component instructions lack one; current `CLAUDE.md` already imports `AGENTS.md` and the latter identifies the source. Do not replace instructions.
8. Self-review standards and #1112 separately; independent review remains with parent. Ship no change until the validation and evidence matrix below is complete. Open/update an implementation PR, leave merge to Savar.

## Validation queued for implementation

The workbook lane owns the machine-wide heavy-job slot. No tests/build were run by this audit. No node_modules is installed in this checkout; resolve dependencies locally before implementation without changing the lockfile or production configuration. Parent's separate workbook build result is not evidence for this branch.

Run meaningful existing regressions for shell/layout, Overview/home, Progress, Scan pages/history/preview, marking results, page results, explanations, workbooks, Maya note routes and Account/settings. Inspect machine processes before starting a heavy job; use at most two Vitest workers machine-wide. Run one final `npm test -- --maxWorkers=2`, then `npx eslint src`, then `npm run build`, one job at a time after the parent releases the slot. No paid model calls or deployments.

Browser work is pending. Current runtime instructions require shared T3 preview browser first (`preview_status`); use its documented fallback only if unavailable/unsupported or two failures. Use local synthetic fixtures and intercepted explanation responses. No production admin pages, real accounts, billing actions or customer photos. Close owned tabs and servers.

Capture 375, 768 and 1440 px evidence for each surface, including empty/unavailable states; Scan upload/checking/refused/retake/Undo/team/completed; results overview/together/loading/retry/unsupported/stale/photo-expired/team/all-done; Account return notices without an external billing action. Check keyboard traversal, visible focus, dialogs/sheets, heading hierarchy, 44 px targets, long names, reduced motion and contrast. Orange white-text actions need measured contrast review against the specific approved treatment; no contrast pass is claimed from hex inspection alone. Record screenshots, actual assertions and failures in manifest. Reuse existing synthetic fixtures in `r-page-results` only after validating they match current main, and never commit a temporary QA route.

## Checks actually performed

- Fresh fetch, clean initial checkout, scoped branch based on pinned main; issue/PR ownership inspection.
- Read source/design history, route links, states and actual CSS declarations. No computed-style claims.
- Reproducible static evidence collection across 59 pinned source files; deterministic rerun and source-path validation.
- Documentation-only diff review. Independent review pending parent.
- No screenshot, keyboard, responsive, contrast, runtime, regression, lint or build pass is claimed. No product files changed; no tabs or servers opened; no deployments or paid calls.
