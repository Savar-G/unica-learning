# Wave A lines: approval page for Savar

Wave A teaches three kinds of question: evaluate (#734), missing number (#732) and claims (#737). These lines are in PR #892. The 2026-11-11 approval covered Waves B and C only, Savar approved them on 2026-11-12 (D-339), together with the 10 rewordings below.

**Approved by Savar, 2026-11-12 (D-339).** Recommendation was: approve. An independent Opus review (2026-11-12) checked every Wave A line against `NEVER_SAY`, the no-answer rule (D-326), the `DESIGN.md` copy rules and the existing line list. It found no P1 and no P2 line. The only lines that said a claim word for the child (`answer.give.claim`) are now removed.

## Counts

| Kind | Wordings | Review result |
|---|---|---|
| Evaluate (#734) | 46 | 2 P3 (style) |
| Missing number (#732) | 90 | none |
| Claims (#737) | 75 | none open (5 removed) |
| **Total** | **211** | **no P1, no P2** |

The full list, one row per wording, is in `docs/maya-wave-lines.md` ("pending Savar (Wave A)").

## Sample lines (slots filled as code fills them)

**Evaluate**
- "Multiply before you add. So start with 7 × 640. What is it?"
- "Now we have 4480 + 210. What is it?"
- "We have 8 × ? = 6960. The missing number is 6960 ÷ 8. What is it?"

**Missing number**
- "30 times the missing number makes 1620. So work out 1620 ÷ 30. Take 1 zero off both numbers. That makes 162 ÷ 3."
- "The missing number is 1416 ÷ 236. 236 is close to 200. About how many 200s make 1416?"
- "236 × 7 = 1652. That is too big. Try a smaller number."

**Claims**
- "What is 360 × 4? Then we compare it with 1436."
- "We found 1440. The page says 1436. Circle yes or no."
- "Yes! 360 × 4 = 1440. So you circle yes." (said only after the child says yes)

## Every line the review flagged

| Line | Reason | Status |
|---|---|---|
| `answer.give.claim` #0 to #4 ("...So the answer is yes. Please circle yes.") | Says the claim word for the child. Nothing offered it after D-326, but the lines were still there. | Removed |
| `part.lead.first` #2 "Start: multiply." and #4 "Begin: multiply." | Choppy (P3). | Open, optional |
| `compare.claim` #0 to #4 ("1440 is greater than 1436.") | States the comparison that decides the word, at the top help (H2). It never says the word, so it passes D-326. | Your call: keep or hold back |
| `trial.right#4` "Nice." and `answer.claim#3` "Well done!" | Never said: the cheer filter (D-310) drops them. | No action |

## Also for you in the same decision

The line review also reworded 10 Wave B and C lines (P2) and two `check.fix` wordings from D-329. They are listed at the end of `docs/maya-wave-lines.md` ("Changes after the line review"). One question is open: the `about.no_secret` lines end with "A grown-up you trust can help.", which the free-talk rule `NOT_OK_TALK` counts as advice. Keep the lines, or change the rule?
