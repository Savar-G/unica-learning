# Answer part order repair

Spec finding S1 rejected bf1a18ce because the key used the stored region array as the printed part order. The print template uses sequence terms, ordering references and the explicit choice-before-box layout for Mixed set.

Commit c0e0082e corrects the answer projection. It reads the stored teaching layout when present. Legacy tick-and-number and spot-the-error packages use their corresponding layout. Sequence and ordering checks provide their own region references. Other answer positions retain the stored order. Empty answer positions still consume their part number. The projection does not change a stored answer or print a book again.

Three new public-interface tests compare the actual workbook template's measured region positions with the answer-key result. The valid stored fixtures reverse the region array for Mixed set, sequence and ordering items. All three failed before the repair. All 22 answer-key tests passed after it. The tests also retain the existing empty-part and version 1 controls.

The earlier complete suite failed one unchanged real Chromium fit test. After the generator reported PRINT_IDLE, the same isolated test passed in the merged scan-history checkout at 66eb4bff: one passed, 81 excluded by the name filter, exit 0, duration 22.35 seconds. This is a baseline control, not a complete-suite result. The answer-key branch then integrated actual main de9404ee without conflicts. Generator, template, renderer and print-contract files match main exactly. No print assertion, limit or browser option changed.

Complete-suite and independent repair-review results remain pending. All prior hosted role, Storage and browser evidence remains recorded in root-verification.md. No family switch or paid call changed.

## Second repair after independent rejection

The independent recheck rejected 25b1d4a7. Stored word-problems context must retain direct region order. A long text box in an ordinary split layout prints after inline answers. Three new binding tests failed on that source. The first complete gate on 25b1d4a7 nevertheless passed: 463 files, 16,900 tests passed and one optional skip, exit 0 in 519.23 seconds. Lint and build passed too. Those results do not close the Spec finding.

The second repair keeps the direct word-problems order. Split layouts use the first sequence and ordering references, followed by remaining inline answers and then full-width answers. Long text and the three likelihood choices use the same boundary as the print template. Null answer positions still consume their printed part. A wider local slot check also found that Warm-up omits full-width answers and Math in the world prints multiple boxes directly. These rules now have explicit regression cases. Solve it two ways retains only its printed boxes.

Challenge has two print layouts with opposite answer-group order. When both inline and full-width answer groups exist, the key reads their frozen region positions. It requires complete, matching, separated groups. Missing or conflicting positions show the existing unavailable-question message. The same refusal applies to an unknown legacy layout with both groups. The key never guesses this order or creates a print contract. Legacy single-row answers and the explicit legacy sequence, ordering and Mixed set controls still work without measurements.

The final focused run passed 38 tests. Its 19 layout cases compare the real public workbook template with the answer key. They include the original three failures, stored word-problems context, 8/9-character text boundaries, the likelihood row, Warm-up, direct Math in the world and two-ways layouts, both Challenge layouts with frozen positions, and an unknown legacy mixed-row layout. Removing the saved positions from the ambiguous layouts gives the unavailable state with zero assigned parts. The earlier invalid hands-on/choice test fixture was rejected by the real stored reader; it was corrected to a valid tick-and-number fixture before the final result.

The print implementation, generator and stored print contract still match integrated main de9404ee. No renderer, timeout, package check, stored answer, hosted policy or family switch changed in this repair. Final full-gate and fresh independent recheck results remain pending.
