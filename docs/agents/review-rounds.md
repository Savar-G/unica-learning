# Review rounds

For the agent that writes the briefs (the orchestrator). Use it when one agent builds a ticket and a different agent reviews it. The delegates also follow [the delegate brief](delegate-brief.md): name that file in each brief.

## Order of the reviews

1. **Codex reviews one time**, on the local branch, before a pull request exists. The review is complete (see "Review briefs").
2. **Fix every finding** that is not declined. A finding in code that the branch did not change, and that is not part of the ticket, becomes a proposed ticket, not a change here. Check each fix and run the full done gate yourself.
3. **Open the pull request.** CodeRabbit reviews it and CI runs.
4. **Fix the CodeRabbit findings**, reply to each declined one with the reason, and push once. CodeRabbit reviews a push by itself; ask with the comment `@coderabbitai review` when it does not.
5. **Merge** when CI passes, CodeRabbit has completed its review of the current head commit, and that review and the earlier ones have no open finding that can save wrong data, accept a wrong page, or expose private data. A review that is pending or that read an earlier commit does not count. Follow the merge rule in `AGENTS.md`.

Do not start another Codex round unless Savar asks. Why: on UNI-150, Codex reviewed six times and gave 10/10, and then Greptile found two bugs in its first review. A second reviewer finds more than another round by the first one.

## Before the build brief

1. **Write a rule table and put it in the ticket.** Give each rule one row: `ID | rule | source | must pass | must stop | test`. Include the existing rules that the change depends on. The build, review and fix briefs all use this table. A row with no test is not done.
2. **Give each rule a source.** Quote the ticket or Savar. Mark your own choices `orchestrator`. Run each `orchestrator` row on saved real data before the build, or ask Savar. Do not write "always", "any" or "never" until you have tried zero, one and two items.
3. **When a rule changes, read the whole table again.** Look for a row that now conflicts. Change the row first, then write the brief. Do not change a rule only in a brief.
4. **Follow each value from the input to the decision.** List each step that fills, computes, normalises or overwrites it. A check that compares what the readers or the user gave must use the value from before that step, or a saved note of the change. A check on the result uses the value after it. Write in the rule table which one each check uses.
5. **List each state with each output.** For each status, write what the record, the report, the import and the screen show. Test the full grid, not one cell.
6. **List the outside limits.** Examples: text that Postgres refuses, the 1,000-row cap on a query, the file size limit, special characters in a filter, paths that ignore case, links. Refuse bad input before the first write.
7. **Ask which rule is missing.** Check the table against each field that identifies a record and each place where a result is stored. For each one, ask: can a wrong value pass with no person looking at it?
8. **Do your own steps before the first review.** If the change has a migration, apply it as `AGENTS.md` and `docs/supabase-ops.md` say, and update the generated files first. If it has none, skip this step. The review must not start with a test failure that this branch causes.

## Fix briefs

- **Name the class, not only the case.** For each finding, write one sentence that says what kind of mistake it is. The fixer searches the code for each other place with that mistake and reports the list: place, affected or not, why. The fixer changes another place only when the change is needed and cannot turn a stop into a continue or an error into "file missing"; otherwise it only reports the place. Why: two sweeps in PR #1264 and PR #1266 made a damaged file look like a missing one, and a person's work could be overwritten.
- **Test the class.** Use a table test or a `fast-check` property. The reviewer's reproduction is one row of it.
- **Second finding in one class: stop adding case-by-case code.** Choose one of these, in this order: remove the feature, use one shared helper, change the data so that the mistake is not possible. The reproduction still becomes a test row, and the class gets a property test. Why: a third case patch usually leaves a fourth case.
- **Keep the reproductions.** Put them in a private folder outside git that stays after a restart (not `/tmp` or `/private/tmp`). The fixer runs the reproductions from every earlier round.

## Review briefs

- **The first review covers everything.** The reviewer gives a verdict for each row of the rule table and for each cell of the state grid, and reports all findings together. Tell the reviewer to search for other places with the same mistake as each finding.
- **Turn each observation into a decision.** If a report contains a wrong result outside its numbered findings, add a row to the table or record why not. Do not leave it in the report.
- **Give each finding an effect:** `data`, `status`, `import`, `privacy` or `help text`. The first four can block. `help text` blocks only if a person who follows it would save wrong data.
- **The reviewer also looks for a missing rule**, not only for code that breaks a listed rule.
- **List the decisions** that the reviewer must not raise again, with the reason for each.

## When findings do not stop

If CodeRabbit's second review still has a finding that must be fixed, do not send another case-by-case fix brief. Count the findings by class. Then choose: redesign that part, make the ticket smaller, or accept the remaining `help text` findings. Tell Savar the choice and the count.

In the pull request details, add one line per review: reviewer, score, number of findings, and the classes. This shows a repeated class early.

## What caused this page

In November 2026, six reference-kit tickets took 28 review reports. The same mistakes came back:

| Class | Where it came back | Guard |
|---|---|---|
| A location is taken from a different record or an old index | UNI-148, 149, rounds 1 to 5 and Greptile on UNI-150 | Feature made smaller, property test |
| Code replaces a reader's value before the check sees it | UNI-148, 149, 150 | Table test on raw reader answers |
| A text tells a person to act on a page that needs no action | UNI-150 rounds 1, 2, 3 | Full status grid test |
| Different math becomes equal after normalising | UNI-132, 149 | Property tests on the normalisers (`compare.test.ts`) |
| A listed rule has no test | UNI-150: unknown reader family, import combinations | One test per stop rule |
| A needed rule was not in the table | UNI-150: page identity, answers in worked examples | Rule 7 |
| A write starts before all input is checked | UNI-133 rounds 1 to 4 | Refuse-first table test |
| A query stops at 1,000 rows | UNI-133, 149 | Rule 6 |
