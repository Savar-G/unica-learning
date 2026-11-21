# Maya regrouping release protocol

Use this protocol to measure the subtraction lesson from question selection through independent work. The release ticket is [#1158](https://github.com/Savar-G/unica-learning/issues/1158). Record the build, configuration, and study plan before using this protocol with children.

## Educator review

1. Run the same lesson through chat and voice. Use a worked example when the printed answer is protected.
2. Check the exchange of 5 tens and 2 ones for 4 tens and 12 ones. Both representations must equal 52.
3. Check the link from the exchanged block to the written place values. Look for instructions that give the result without explaining the exchange.
4. Test the reversal error that gives 6 for 2 minus 8. Check that feedback addresses the order of subtraction and offers the exchange. A correct result with an incorrect explanation must receive separate scores.
5. Check that Maya can explain the exchange to a learner who needs it and skip the demonstration when a child shows the prerequisite.
6. Check that accepting optional practice opens a new question. Check that declining ends the lesson.
7. Record each failure with its question ID, mode, step, and affected skill or access requirement. Include the build and device.

## Learning evaluation

Use comparable regrouping questions in the current and rebuilt experiences. Before recruitment, record the target population, participant count and rationale, task forms, allocation, scoring rubric, retention interval and comparison threshold. Use a separate question form for the prerequisite check, immediate transfer, and delayed retention. Balance the task forms between groups or alternate the order in matched sessions. Use the same access and support rules for both groups.

1. Confirm the existing family and research consent requirements. Explain that the child can stop at any time. Use the project privacy rules for observation, identifiers, access, and deletion.
2. Check place-value knowledge before teaching. Ask the child to show an equivalent representation of a two-digit number. Record the result and any help.
3. Observe the worked example and guided exchange. Use the product lesson for both modes. Record extra help from an observer if it occurs.
4. Offer the related independent question. The first transfer form can use 63 minus 27. Ask what changed when the child exchanged a ten. Score the written or spoken explanation and result separately.
5. At the recorded retention interval, use a fresh form. Require no lesson or hint before the first response. Record any intervening practice the family reports.
6. Keep the first independent response separate from later helped work. Record no response, refusal to continue, and unavailable follow-up as separate outcomes.

For each measure, include the number eligible, offered the task, assessed without help, assessed with help, and missing. Report independent correct results, correct exchange explanations, and reversal errors at each stage. Report task completion, satisfaction, and elapsed time separately. If the comparison does not reach the recorded independent-transfer threshold or the delayed result does not support a retention claim, record that result. Educator observations and simulated children can identify regressions in the experience.

## Engineering evidence

Use the exact candidate build and the current baseline. Include desktop, tablet, and phone. Test keyboard and touch, paper mode, transcript and navigation disclosure, and reduced motion. Check family consent, plan and usage limits, deletion, printed question identity, and old saved sessions. Read the actual loaded settings and record the enabled cohort and lesson kinds.

Use real device playback and first visible board output. Record end of child speech, the first useful response, first shown board action, and playback stop after clear intentional interruption. Include negative controls for background speech and a pause between “four” and “teen.” Confirm that uncertain input can be corrected without credit. Test board input during speech and reconnect after one completed action. Check the remaining hosted stream and recovery cases from [#1123](https://github.com/Savar-G/unica-learning/issues/1123) and [#1107](https://github.com/Savar-G/unica-learning/issues/1107) wherever the release uses that path.

Report attempted turns, failures, timeouts, retries, and completed turns. For completed turns, report the median and p95 by device, mode, and routine or complex turn. Report the failed turns with the same grouping. The routine targets are below 1 second at the median and below 2 seconds at p95 for the first useful audible response. The intentional interruption target is below 300 milliseconds at p95. A result also fails if it cuts off child speech, counts filler, skips a board action, or weakens math checks. Use the baseline to set the separate complex-turn budget.

Run the repository tests, voice worker tests, affected text tests, source lint, and build. Record the result of the branch checks and the separate actual-device checks. Follow the existing schedule and authorization for paid practice.

## Cohort and rollback

Record the exact build, setting, authorized test families, eligible lesson kind, and rollback build before enabling a cohort. Verify the enabled and disabled paths with owned test families. Verify that a lesson already in progress keeps its compatible engine when the setting changes. Use the real family entry point for the family check.

Keep the candidate off for wider use while required evidence is missing or a release hold applies. A loss of confirmed work, duplicate credit, unauthorized access, protected answer disclosure, stale output after cancellation, or failed saved-session recovery blocks expansion. Disable enrollment in new candidate lessons and use the recorded rollback build if a release exposes one of these failures. Check that supported sessions can resume and that failed and interrupted turns remain visible in the report after rollback.

Record evidence dates, counts, result locations, known limits, and the rollout decision in #1158.
