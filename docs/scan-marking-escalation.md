# Scan marking: the second look (#957)

Decision 2026-11-13 (Cedric): the answers scan marking leaves unsure get one more read by a stronger model before any reaches our team.

## How it works

1. **First read:** `MARKING_MODEL` (Sonnet 5.5, prompt v9) reads the page as before.
2. **Second look:** if any AI-marked item is still pending, `runScanMarking` sends **only those items** once to `MARKING_ESCALATION_MODEL` (`anthropic/claude-opus-5.5`).
   - **Route:** the same production route, Anthropic then Azure global, never Google (`markingEscalationClient`).
   - **Request:** the same whole-page request, plus one rule (`SECOND_LOOK`): a struck-through value with one clear value beside it is a correction, so the clear value is read. Every other "uncertain" rule stays.
3. **Result:** a mark the second look gives (`scored`) replaces the pending item. An unsure answer, a refusal or any failure keeps the first read, and the item goes to our team as before.
4. **Limits:** one attempt, no retry. The call is admitted with `role: "escalation"` and settled as a dispatch of the same job, so the #868 rules hold: two counted dispatches, eight in all, and the monthly cap and its hold.
5. **What is recorded:** `scan_marking_jobs.escalation` holds `{model, prompt, items}`. `apply` sets each decided item's `model` and `prompt` from it; every other item keeps the job's first-read model.

## Switches

- **`SCAN_MARKING_ESCALATION`:** the second look runs only when it is exactly `on`; unset, there is no second look.
- **Price row:** the database admits `anthropic/claude-opus-5.5` only on a call with `role: "escalation"` and only while its row in `scan_marking_prices` is enabled. It was enabled on 2026-11-14 with this gate's evidence. Its worst-case hold is 8,081,920 micros, twice the Sonnet row, matching the price.

## Safety gate (D-267), 2026-11-14

Script: `scripts/scan-marking-escalation-eval.mjs`. Raw results: `docs/scan-marking-escalation-results-20261114.json`. All inputs are made-up Robin data, and the model call is the one production makes: Opus 5.5 with the second-look rule, on the production route, one attempt.

| Part | What was asked | Asked | Marked by Opus | Wrong marks | Wrong answer marked right |
|---|---|---|---|---|---|
| (a) robin16 | items Sonnet left unsure in the paid iPhone run (7 photos) | 10 | 3 (all correct) | 0 | 0 |
| (b) fixed40 | items Sonnet left unsure in the v9 synthetic run: blurred control photos whose truth is unreadable | 73 | 0 (all stayed unsure) | 0 | 0 |
| (c) stress | every AI-marked item of 21 accepted real photos not marked in (a) | 149 | 133 (all correct: 84 right, 33 wrong, 16 blank) | 0 | 0 |

- **Result:** all three parts pass, with 0 marked right wrongly and 0 wrong marks.
- **Cost:** USD 1.00 for 38 calls, with no failed or unpriced call.
- **Combined (a) totals:** after the second look the 7 photos have 51 definite marks and 1 wrong. That one is the first read's known wrong mark (1/113 in the iPhone run); the second look did not touch it.
- **The key result is (b):** on blurred answers, the case where a stronger model might be tempted to guess, Opus never became certain.

### Limits of this evidence

- **iPhone only:** Android is still untested.
- **What resolved:** (a) has only 10 unsure items, and the second look settled 3. The remaining 7 (mostly unreadable answers under glare or shadow) still go to our team.
- **What was not tested here:** the crossed-out corrections. Neither of Cedric's two Day 4 team items (page 27 Q6, a crossed-out 6 corrected to 7; page 27 Q12, a blank read as unreadable) is in this evidence set. They are the cases to watch on the next real scan with the switch on.
