# Topic Method Records

One record for each topic of a reference level: how the topic is taught. Code computes the facts from the page records (`docs/reference-records.md`). A model writes a short summary from those records only. Two people approve the exact content. The tool does not invent a method. Code: `src/lib/reference-method/`.

All folders are private and outside every git checkout (`assertOutsideRepo`, folders `0700`, files `0600`). The `--methods` folder must not be a symlink, pass through one, be the `--records` folder, or be inside it or around it. Never copy a real record into this repository.

## Commands

```bash
npm run reference:method -- draft   --records <final> --methods <folder> --source <key> --level <L> --topic <n> [--model <id>] [--include-machine-read] [--keep-summary | --replace]
npm run reference:method -- show    --records <final> --methods <folder> --source <key> --level <L> --topic <n>
npm run reference:method -- approve --records <final> --methods <folder> --source <key> --level <L> --topic <n> --by <name> --digest <sha256>
npm run reference:method -- gaps    --records <final> --source <key> --level <L> [--include-machine-read]
npm run reference:method -- import  --records <final> --methods <folder> [--dry-run] [--replace]
```

`--records` is the `final` folder of the photo kit: the page records, each in the file of its `source_ref`, `status.json`, and the contents record of the level. One methods folder goes with one records folder, because the import checks every record in it. Each command checks all input before it writes, and exits with 1 and a `problem:` line when it stops.

## Identity

Source, level (upper case) and topic number (from the contents chart) identify a record. `identity.ts` makes the file name (`<source>-<level>-topic-<n>.json`), the ref and the table key from them. A record id in another spelling (`z` for `Z`, `012a` for `12a`) stops the command. Every sheet number, topic number and range is a whole number from 1 to 2147483647 (the integer column of the table).

## Which pages belong to a topic

- With a printed sheet range, the pages in the range. Every other sheet side of the range is listed in `pages_without_photo`: it has no record, because there is no photo or nobody could read it.
- With no printed range, the pages that print the title. `No.1`, `#1`, `(1)` and `1` at the end of a title are one number. `sheet_range` and `pages_without_photo` are `not_stated`, and pages that fit no topic are in `unplaced_pages`.
- The title of a `machine_read` page decides nothing, unless `--include-machine-read` is given.
- The command stops when a page points at two topics (the title of one, the range of another), when a page prints the title of the topic and is in no range of the chart (unless another topic of this title has no range), when ranges overlap, when two topics have one title and no range, and when only one reader read the topic number. A page in the range whose title is in no topic is used and marked `printed_title_differs`.

## Facts

- A value in `single_read`, an `unclear` value and a `not_stated` value never become a fact. A `machine_read` page is listed and gives no facts. A `machine_read` contents record stops the command. With `--include-machine-read` both are used, and each fact and each placement that rests on them lists them in `machine_read`. A `machine_read` contents record is in the list of every fact.
- **Step**: expression kind, operation, digits of each printed number, carries, borrows, remainder and form, from `compute.ts`. A blank stays a blank (`_x1=2`: a blank, a number with one digit, a printed result with two). Code does not tell the step of notation, a decimal, a negative number, an unclear value or a question it cannot compute. Those questions of one page share the step `page <ref>`. `partly_known` keeps their expression kind, operation and form.
- **Method**: only a worked example of the same step. Its parts and its steps must be trusted, and it must show an answer, or steps that can belong to this step only and print more than setup lines (a setup line is the question written again, and an empty box or line prints nothing). The step `page <ref>` never has a method.
- **Gap**: a step with no method (`no_method`, or `step_not_known` for `page <ref>`). `hints` names what a person can look at on its pages: captions, number strips, arrows and every other scaffold except answer boxes, examples that code cannot match, and fields that are not known. A hint never closes a gap.
- A format change compares the order of the formats on the pages. `not_known_after` and `not_known_between` name the pages that could change a "last page" or a format change.

## Summary

Each sentence has `kind` (`introduces`, `procedure`, `progression`), `text`, `cites`, optional `guess: true`, and on every procedure `steps`: the ids of the steps it is about. The text has one syntax (`sentence-text.ts`), and code refuses every other text, also in a guess:

- A page is `[12a]`: the sheet and side of one page of this level. The text names exactly the pages in `cites` (the contents record has no token). `[12a-13a]`, and a dash, "to", "through" or "until" between two tokens, are refused.
- Math is between backticks: `` `43 x 2` ``, `` `3/4` ``, `` `7 R1` ``. After the kit's notation normaliser it must be a whole printed text or expression of one cited page, or whole sides of its equals signs. A part of an expression is refused, so signs, order, fractions and remainders match. Not evidence: the expression that a reader made of a word problem, titles, question numbers, descriptions and notes of a reader, answers that the page does not print, and once-read fields. A guess is not compared with the pages.
- Outside the tokens: English letters, spaces and simple punctuation only. No digit of any script, no number word from "two" to "ninety-nine", no "hundred" or "thousand", and no page, sheet or question followed by a number. A token has a space or punctuation around it.

Counts and digit facts are never in a sentence: code has them in the facts, and `show` prints them beside the sentences. This is simpler than fact tokens, and no sentence can contradict a fact.

Code also refuses: no citation, or a cited page with no photo or no facts, on a sentence that is not a guess; a cited page outside the topic; a procedure with a step that has no worked example on a cited page (a guess may have one).

**Limits**: "one", "zero", "half", "dozen", "million", ordinals ("tenth"), Roman numerals and number words in other languages are not refused. "Between [12a] and [13b]" names two pages only. Code checks that the page prints the math, not that the sentence says the right thing about it, and it cannot see a procedure inside a sentence of another kind. The approvers read for that.

## Drafts, edits and approvals

- The model runs through the `claude` command with no tools, an empty temporary folder, and the records and facts as text. One retry with the validation errors, then the command stops and writes nothing. No model runs when no page gives facts. The draft stops when a page record changes while the model runs.
- A person edits `summary` in the file. A new draft refuses to write over a changed summary, an approval or a file that is not valid any more, unless `--replace` is given. `--keep-summary` computes the facts again, checks the kept summary and writes it back.
- `draft` and `approve` hold a lock on the topic (`.<file name>.lock` in the methods folder) and compare the file with what they read just before they write. A command that finds a lock stops, names its time and says how to remove it. A killed process leaves its lock: make sure that the process does not run, then remove the file. Do not save the file by hand while a command runs on it: an edit in the last moment before the write can be lost.
- `show` prints the whole record in plain words: facts, gaps, hints, sentences, and for each procedure the exact example that it rests on. Its last line is the digest: the SHA-256 of the record without `status` and `approvals`. `approve` needs this digest and refuses another one, so each person approves what they read. One run adds one approval.
- Two different people for the exact content give `approved`. Every other state is `drafted`. Names are compared without invisible characters, letter case, extra spaces and wide letters; they are not checked against a list of people. An approval time is a UTC instant (`2026-01-02T03:04:05.000Z`). The status in a file is never trusted: it is computed from the approvals each time.
- The record holds the digest and status of each page record. `show`, `approve` and `import` compute the facts again and stop when a page record, a status, the contents record or a fact changed. Run `draft --keep-summary`, read it and approve again.

## Table

`bank_reference_topic_methods`: one row for each source, level and topic, with the record, its status and its digest. Same access rule as `bank_reference_images` (row level security, no policies, service role only). A check keeps the columns equal to the record.

The import refuses all bad input before the first write (also damaged text, a file name of another topic and changed facts), and reads all input again just before the first write. Without `--replace` a different stored row stays and is listed as `skipped_different`. With `--replace` it is updated only if its `updated_at` is still the one that was read; every update gives a later one. `status_lowered` names, before the first write, an approved row that becomes drafted. When the answer to a write is lost, the import reads the row again, says what the table holds, counts no write, and stops. With `--replace` it also stops when another run inserted a different row first. It never deletes a row, and it does not change a row when page records change later: import the new draft.
