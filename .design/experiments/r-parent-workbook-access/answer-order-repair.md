# Answer part order repair

Spec finding S1 rejected bf1a18ce because the key used the stored region array as the printed part order. The print template uses sequence terms, ordering references and the explicit choice-before-box layout for Mixed set.

Commit c0e0082e corrects the answer projection. It reads the stored teaching layout when present. Legacy tick-and-number and spot-the-error packages use their corresponding layout. Sequence and ordering checks provide their own region references. Other answer positions retain the stored order. Empty answer positions still consume their part number. The projection does not change a stored answer or print a book again.

Three new public-interface tests compare the actual workbook template's measured region positions with the answer-key result. The valid stored fixtures reverse the region array for Mixed set, sequence and ordering items. All three failed before the repair. All 22 answer-key tests passed after it. The tests also retain the existing empty-part and version 1 controls.

The earlier complete suite failed one unchanged real Chromium fit test. After the generator reported PRINT_IDLE, the same isolated test passed in the merged scan-history checkout at 66eb4bff: one passed, 81 excluded by the name filter, exit 0, duration 22.35 seconds. This is a baseline control, not a complete-suite result. The answer-key branch then integrated actual main de9404ee without conflicts. Generator, template, renderer and print-contract files match main exactly. No print assertion, limit or browser option changed.

Complete-suite and independent repair-review results remain pending. All prior hosted role, Storage and browser evidence remains recorded in root-verification.md. No family switch or paid call changed.
