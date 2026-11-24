# Topic Method Records

One record for each topic of a reference level: how the topic is taught. Code computes the facts from the page records (`docs/reference-records.md`). A model writes a short summary from those records only. Two people approve the exact content. The tool does not invent a method. Code: `src/lib/reference-method/`.

All folders are private and outside every git checkout (`assertOutsideRepo`, folders `0700`, files `0600`, no write through a symlink). Never copy a real record into this repository.

## Commands

```bash
npm run reference:method -- draft   --records <final> --methods <folder> --source <key> --level <L> --topic <n> [--model <id>] [--include-machine-read] [--keep-summary | --replace]
npm run reference:method -- approve --records <final> --methods <folder> --source <key> --level <L> --topic <n> --by <name> [--by <name>]
npm run reference:method -- gaps    --records <final> --source <key> --level <L> [--methods <folder>] [--include-machine-read]
npm run reference:method -- import  --records <final> --methods <folder> [--dry-run] [--replace]
```

`--records` is the `final` folder of the photo kit: the page records, `status.json`, and the contents record of the level. One methods folder goes with one records folder, because the import checks every record in it. Each command checks all input before it writes, and exits with 1 and a `problem:` line when it stops.

## Identity

Source, level (upper case) and topic number (from the contents chart) identify a record. `identity.ts` makes the file name (`<source>-<level>-topic-<n>.json`), the ref and the table key from them. A record id in another spelling (`z` for `Z`, `012a` for `12a`) stops the command.

## Which pages belong to a topic

- With a printed sheet range, the pages in the range. Every other sheet side of the range is listed in `pages_without_photo`: it has no record, because there is no photo or nobody could read it.
- With no printed range, the pages that print the title (with its number). `sheet_range` and `pages_without_photo` are `not_stated`, and pages that fit no topic are in `unplaced_pages`.
- The command stops when a page points at two topics (the title of one, the range of another), when ranges overlap, when two topics have one title and no range, and when only one reader read the topic number. A page in the range whose title is in no topic is used and marked `printed_title_differs`.

## Facts

- A value in `single_read`, an `unclear` value and a `not_stated` value never become a fact. A `machine_read` page is listed and gives no facts. A `machine_read` contents record stops the command. With `--include-machine-read` both are used, and each fact from them lists its records in `machine_read`.
- **Step**: expression kind, operation, digits of each number as printed, carries, borrows, remainder and form, from `compute.ts`. Code does not tell the step of notation, a decimal, a negative number, an unclear value or a question it cannot compute. Those questions of one page share the step `page <ref>` with features `not_stated`.
- **Shown on**: a step is shown on a page with an example of the same step, or with a teaching scaffold that applies to its questions. `answer_boxes` and `other` do not teach. For the step `page <ref>`, an example on that page that code cannot match, or teaching scaffolds on all its questions, count.
- **Gap**: a step that is shown on no page (`no_method`, or `step_not_known` for `page <ref>`). `check_pages` names pages with an example or scaffold that code could not match, so a person can look.
- `not_known_after` and `not_known_between` name the pages that could change a "last page" or a format change.

## Summary

Each sentence has `kind` (`introduces`, `procedure`, `progression`), `text`, `cites` and optional `guess: true`. A procedure can also have `steps`: the ids of the steps it is about. Code refuses:

- no citation, or a cited page with no photo or no facts, on a sentence that is not a guess; a cited page outside the topic on any sentence;
- a sheet or page named in the text (also inside a range) that is not cited;
- a number in the text that is in none of its cited records or facts;
- a procedure about a step that no cited page shows. Without `steps`, it is about every step of its cited pages.

**How numbers are compared**: every number in the text, after the sheet and page names are taken out, must equal a number in the trusted text of a cited record, in the facts of a cited page, or in the topic line of the cited contents record. `1,000` equals `1000`, `007` equals `7` and `2.50` equals `2.5`. Words from "two" to "ninety-nine", "hundred" and "thousand" count as numbers. Question numbers, step numbers, `applies_to` and score bands do not count as evidence.

**Limits**: "zero", "one" and ordinals in words are not checked. A sign is not part of a number. `3/4` is checked as 3 and 4. "two hundred" is checked as 2 and 100. `1,234` is one number, never a list of 1 and 234. Number words in other languages are not read. "The next sheet" or "the back of it" is not seen as a page name. Code checks that a number is in the cited record, not that the sentence says the right thing about it, and it cannot see a procedure inside a sentence of another kind: the approvers read for that.

## Drafts, edits and approvals

- The model runs through the `claude` command with no tools, an empty temporary folder, and the records and facts as text. One retry with the validation errors, then the command stops and writes nothing. No model runs when no page gives facts.
- A person edits `summary` in the file. A new draft refuses to write over a changed summary, an approval or a file that is not valid any more, unless `--replace` is given. `--keep-summary` computes the facts again, checks the kept summary and writes it back. A file that changes while the command runs is never overwritten.
- An approval stores the name, the time and the SHA-256 of the record without `status` and `approvals`. Two different names (letter case, spaces and invisible characters do not make a difference) for the exact content give `approved`. Every other state is `drafted`. The status in a file is never trusted: it is computed from the approvals each time. Names are not checked against a list of people.
- The record holds the digest and status of each page record. `approve` and `import` compute the facts again and stop when a page record, a status, the contents record or a fact changed. Run `draft --keep-summary` and approve again. `gaps --methods` shows the status against the page records of now: a record that is out of date is `drafted`.

## Table

`bank_reference_topic_methods`: one row for each source, level and topic, with the record, its status and its digest. Same access rule as `bank_reference_images` (row level security, no policies, service role only). A check keeps the columns equal to the record.

The import refuses all bad input before the first write (also damaged text, a file name of another topic and changed facts). Without `--replace` a different stored row stays and is listed as `skipped_different`. With `--replace` it is updated only if it did not change since it was read; `status_lowered` names an approved row that becomes drafted. It never deletes a row, and it does not change a row when page records change later: import the new draft.
