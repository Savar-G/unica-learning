# V2 author changes

All 7,999 v2 templates remain. The raw v2 original is unchanged. V1 history remains in the .v1 files. The input limits remain unchanged.

Each field below links to a complete before and after value in `author-changes.json`.

## 6.12-trapezoid-area step 3 template 1 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'%g' % area"
```
After:
```json
"str(area)"
```

## 6.12-trapezoid-area step 3 template 2 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'%g' % area + ' m²'"
```
After:
```json
"str(area) + ' m²'"
```

## 7.4-lowest-terms step 3 step fields: numbers

Use separate named quantity ranges.

Before:
```json
{"operand1": {"min": 1, "max": 100}, "operand2": {"min": 1, "max": 100}, "result": {"min": 1, "max": 100}, "denominator": {"min": 3, "max": 6}, "numerator": {"min": 1, "max": 50}, "factor": {"min": 2, "max": 5}, "flip": {"min": 0, "max": 1}, "error": {"min": 1, "max": 5}, "denominator_low": {"min": 3, "max": 4}, "numerator_low": {"min": 1, "max": 17}, "factor_low": {"min": 2, "max": 3}, "denominator_high": {"min": 5, "max": 6}, "numerator_high": {"min": 34, "max": 50}, "factor_high": {"min": 4, "max": 5}, "pt": {"min": 30202, "max": 260903, "values": [30202, 30203, 30204, 30205, 30206, 30207, 30208, 30209, 50202, 50203, 50204, 50205, 50206, 50207, 50208, 50209, 40302, 40303, 40304, 40305, 40306, 40307, 40308, 40309, 50302, 50303, 50304, 50305, 50306, 50307, 50308, 50309, 70302, 70303, 70304, 70305, 70306, 70307, 70308, 70309, 80302, 80303, 80304, 80305, 80306, 80307, 80308, 80309, 50402, 50403, 50404, 50405, 50406, 50407, 50408, 50409, 70402, 70403, 70404, 70405, 70406, 70407, 70408, 70409, 90402, 90403, 90404, 90405, 90406, 90407, 90408, 90409, 110402, 110403, 110404, 110405, 110406, 110407, 110408, 110409, 60502, 60503, 60504, 60505, 60506, 60507, 60508, 60509, 70502, 70503, 70504, 70505, 70506, 70507, 70508, 70509, 80502, 80503, 80504, 80505, 80506, 80507, 80508, 80509, 90502, 90503, 90504, 90505, 90506, 90507, 90508, 90509, 110502, 110503, 110504, 110505, 110506, 110507, 110508, 110509, 120502, 120503, 120504, 120505, 120506, 120507, 120508, 130502, 130503, 130504, 130505, 130506, 130507, 140502, 140503, 140504, 140505, 140506, 140507, 70602, 70603, 70604, 70605, 70606, 70607, 70608, 70609, 110602, 110603, 110604, 110605, 110606, 110607, 110608, 110609, 130602, 130603, 130604, 130605, 130606, 130607, 170602, 170603, 170604, 170605, 80702, 80703, 80704, 80705, 80706, 80707, 80708, 80709, 90702, 90703, 90704, 90705, 90706, 90707, 90708, 90709, 100702, 100703, 100704, 100705, 100706, 100707, 100708, 100709, 110702, 110703, 110704, 110705, 110706, 110707, 110708, 110709, 120702, 120703, 120704, 120705, 120706, 120707, 120708, 130702, 130703, 130704, 130705, 130706, 130707, 150702, 150703, 150704, 150705, 150706, 160702, 160703, 160704, 160705, 160706, 170702, 170703, 170704, 170705, 180702, 180703, 180704, 180705, 190702, 190703, 190704, 190705, 200702, 200703, 200704, 200705, 90802, 90803, 90804, 90805, 90806, 90807, 90808, 90809, 110802, 110803, 110804, 110805, 110806, 110807, 110808, 110809, 130802, 130803, 130804, 130805, 130806, 130807, 150802, 150803, 150804, 150805, 150806, 170802, 170803, 170804, 170805, 190802, 190803, 190804, 190805, 210802, 210803, 210804, 230802, 230803, 230804, 100902, 100903, 100904, 100905, 100906, 100907, 100908, 100909, 110902, 110903, 110904, 110905, 110906, 110907, 110908, 110909, 130902, 130903, 130904, 130905, 130906, 130907, 140902, 140903, 140904, 140905, 140906, 140907, 160902, 160903, 160904, 160905, 160906, 170902, 170903, 170904, 170905, 190902, 190903, 190904, 190905, 200902, 200903, 200904, 200905, 220902, 220903, 220904, 230902, 230903, 230904, 250902, 250903, 250904, 260902, 260903]}, "pth": {"min": 70504, "max": 250904, "values": [70504, 70505, 70506, 70507, 70508, 70509, 80504, 80505, 80506, 80507, 80508, 80509, 90504, 90505, 90506, 90507, 90508, 90509, 110504, 110505, 110506, 110507, 110508, 110509, 120504, 120505, 120506, 120507, 120508, 130504, 130505, 130506, 130507, 140504, 140505, 140506, 140507, 70604, 70605, 70606, 70607, 70608, 70609, 110604, 110605, 110606, 110607, 110608, 110609, 130604, 130605, 130606, 130607, 170604, 170605, 80704, 80705, 80706, 80707, 80708, 80709, 90704, 90705, 90706, 90707, 90708, 90709, 100704, 100705, 100706, 100707, 100708, 100709, 110704, 110705, 110706, 110707, 110708, 110709, 120704, 120705, 120706, 120707, 120708, 130704, 130705, 130706, 130707, 150704, 150705, 150706, 160704, 160705, 160706, 170704, 170705, 180704, 180705, 190704, 190705, 200704, 200705, 70804, 70805, 70806, 70807, 70808, 70809, 90804, 90805, 90806, 90807, 90808, 90809, 110804, 110805, 110806, 110807, 110808, 110809, 130804, 130805, 130806, 130807, 150804, 150805, 150806, 170804, 170805, 190804, 190805, 210804, 230804, 70904, 70905, 70906, 70907, 70908, 70909, 80904, 80905, 80906, 80907, 80908, 80909, 100904, 100905, 100906, 100907, 100908, 100909, 110904, 110905, 110906, 110907, 110908, 110909, 130904, 130905, 130906, 130907, 140904, 140905, 140906, 140907, 160904, 160905, 160906, 170904, 170905, 190904, 190905, 200904, 200905, 220904, 230904, 250904]}, "pos": {"min": 0, "max": 2}}
```
After:
```json
{"operand1": {"min": 1, "max": 100}, "operand2": {"min": 1, "max": 100}, "result": {"min": 1, "max": 100}, "denominator": {"min": 3, "max": 6}, "numerator": {"min": 1, "max": 50}, "factor": {"min": 2, "max": 5}, "flip": {"min": 0, "max": 1}, "error": {"min": 1, "max": 5}, "denominator_low": {"min": 3, "max": 4}, "numerator_low": {"min": 1, "max": 17}, "factor_low": {"min": 2, "max": 3}, "denominator_high": {"min": 5, "max": 6}, "numerator_high": {"min": 34, "max": 50}, "factor_high": {"min": 4, "max": 5}, "pos": {"min": 0, "max": 2}, "reduced_numerator": {"min": 3, "max": 26}, "reduced_denominator": {"min": 2, "max": 9}, "expansion": {"min": 2, "max": 9}, "hard_numerator": {"min": 7, "max": 25}, "hard_denominator": {"min": 5, "max": 9}, "hard_expansion": {"min": 4, "max": 9}}
```

## 7.4-lowest-terms step 3 template 1 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
""
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```

## 7.4-lowest-terms step 3 template 1 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g"}
```
After:
```json
{"n": "a * g", "d": "b * g"}
```

## 7.4-lowest-terms step 3 template 1 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pt"}
```
After:
```json
{"a": "reduced_numerator", "b": "reduced_denominator", "g": "expansion"}
```

## 7.4-lowest-terms step 3 template 2 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
""
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```

## 7.4-lowest-terms step 3 template 2 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g", "x": "a if flip == 0 else n", "y": "b if flip == 0 else d"}
```
After:
```json
{"n": "a * g", "d": "b * g", "x": "a if flip == 0 else n", "y": "b if flip == 0 else d"}
```

## 7.4-lowest-terms step 3 template 2 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pt", "flip": "flip"}
```
After:
```json
{"a": "reduced_numerator", "b": "reduced_denominator", "g": "expansion", "flip": "flip"}
```

## 7.4-lowest-terms step 3 template 3 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
""
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```

## 7.4-lowest-terms step 3 template 3 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g"}
```
After:
```json
{"n": "a * g", "d": "b * g"}
```

## 7.4-lowest-terms step 3 template 3 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pt"}
```
After:
```json
{"a": "reduced_numerator", "b": "reduced_denominator", "g": "expansion"}
```

## 7.4-lowest-terms step 3 template 4 answer

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'ABC'[pos] + ') ' + c1"
```
After:
```json
"safe_1 + ') ' + c1"
```

## 7.4-lowest-terms step 3 template 4 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"c1 != w1 and c1 != w2 and w1 != w2"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and c1 != w1 and c1 != w2 and w1 != w2"
```

## 7.4-lowest-terms step 3 template 4 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g", "c1": "str(a) + '/' + str(b)", "w1": "str(n) + '/' + str(b)", "w2": "str(b) + '/' + str(a)", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else (c1 if pos == 1 else w2)", "oC": "w2 if pos < 2 else c1"}
```
After:
```json
{"n": "a * g", "d": "b * g", "c1": "str(a) + '/' + str(b)", "w1": "str(n) + '/' + str(b)", "w2": "str(b) + '/' + str(a)", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else c1 if pos == 1 else w2", "oC": "w2 if pos < 2 else c1", "safe_1": "'A' if pos == 0 else ('B' if pos == 1 else ('C'))"}
```

## 7.4-lowest-terms step 3 template 4 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pt", "pos": "pos"}
```
After:
```json
{"a": "reduced_numerator", "b": "reduced_denominator", "g": "expansion", "pos": "pos"}
```

## 7.4-lowest-terms step 3 template 5 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
""
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28"
```

## 7.4-lowest-terms step 3 template 5 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g"}
```
After:
```json
{"n": "a * g", "d": "b * g"}
```

## 7.4-lowest-terms step 3 template 5 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pth"}
```
After:
```json
{"a": "hard_numerator", "b": "hard_denominator", "g": "hard_expansion"}
```

## 7.4-lowest-terms step 3 template 6 check

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
""
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28"
```

## 7.4-lowest-terms step 3 template 6 derived

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "p // 10000", "b": "p // 100 % 100", "g": "p % 100", "n": "a * g", "d": "b * g"}
```
After:
```json
{"n": "a * g", "d": "b * g"}
```

## 7.4-lowest-terms step 3 template 6 slots

Replace packed coprime tuples with separate numerator, denominator and expansion ranges. Keep reduced fractions and the harder number range. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"p": "pth"}
```
After:
```json
{"a": "hard_numerator", "b": "hard_denominator", "g": "hard_expansion"}
```

## 7.4-compare-forms step 2 template 5 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"s[0][1] + ', ' + s[1][1] + ', ' + s[2][1]"
```
After:
```json
"position_0 + ', ' + position_1 + ', ' + position_2"
```

## 7.4-compare-forms step 2 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "s": "sorted([(a, sa), (v, sf), (pc, sp)])"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "ordered": "sorted([a, v, pc])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp"}
```

## 7.4-compare-forms step 2 template 6 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"'ABC'[pos] + ') ' + c1"
```
After:
```json
"safe_1 + ') ' + c1"
```

## 7.4-compare-forms step 2 template 6 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "s": "sorted([(a, sa), (v, sf), (pc, sp)])", "c1": "s[2][1]", "w1": "s[1][1]", "w2": "s[0][1]", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else (c1 if pos == 1 else w2)", "oC": "w2 if pos < 2 else c1"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "ordered": "sorted([a, v, pc])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp", "c1": "position_2", "w1": "position_1", "w2": "position_0", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else c1 if pos == 1 else w2", "oC": "w2 if pos < 2 else c1", "safe_1": "'A' if pos == 0 else ('B' if pos == 1 else ('C'))"}
```

## 7.4-compare-forms step 3 template 1 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"s[0][1] + ', ' + s[1][1] + ', ' + s[2][1] + ', ' + s[3][1]"
```
After:
```json
"position_0 + ', ' + position_1 + ', ' + position_2 + ', ' + position_3"
```

## 7.4-compare-forms step 3 template 1 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "(str(int(b)) if b == int(b) else str(round(b, 6)))", "s": "sorted([(a, sa), (v, sf), (pc, sp), (b, sb)])"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "str(int(b)) if b == int(b) else str(round(b, 6))", "ordered": "sorted([a, v, pc, b])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp if pc == ordered[0] else sb", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp if pc == ordered[1] else sb", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp if pc == ordered[2] else sb", "position_3": "sa if a == ordered[3] else sf if v == ordered[3] else sp if pc == ordered[3] else sb"}
```

## 7.4-compare-forms step 3 template 2 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"s[3][1] + ', ' + s[2][1] + ', ' + s[1][1] + ', ' + s[0][1]"
```
After:
```json
"position_3 + ', ' + position_2 + ', ' + position_1 + ', ' + position_0"
```

## 7.4-compare-forms step 3 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "(str(int(b)) if b == int(b) else str(round(b, 6)))", "s": "sorted([(a, sa), (v, sf), (pc, sp), (b, sb)])"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "str(int(b)) if b == int(b) else str(round(b, 6))", "ordered": "sorted([a, v, pc, b])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp if pc == ordered[0] else sb", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp if pc == ordered[1] else sb", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp if pc == ordered[2] else sb", "position_3": "sa if a == ordered[3] else sf if v == ordered[3] else sp if pc == ordered[3] else sb"}
```

## 7.4-compare-forms step 3 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"s[0][1]"
```
After:
```json
"position_0"
```

## 7.4-compare-forms step 3 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "(str(int(b)) if b == int(b) else str(round(b, 6)))", "s": "sorted([(a, sa), (v, sf), (pc, sp), (b, sb)])"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "b": "m / 100", "sb": "str(int(b)) if b == int(b) else str(round(b, 6))", "ordered": "sorted([a, v, pc, b])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp if pc == ordered[0] else sb", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp if pc == ordered[1] else sb", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp if pc == ordered[2] else sb", "position_3": "sa if a == ordered[3] else sf if v == ordered[3] else sp if pc == ordered[3] else sb"}
```

## 7.4-compare-forms step 3 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "s": "sorted([(a, sa), (v, sf), (pc, sp)])", "x": "s[0][1] if flip == 0 else s[1][1]", "y": "s[1][1] if flip == 0 else s[0][1]", "z": "s[2][1]"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "ordered": "sorted([a, v, pc])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp", "x": "position_0 if flip == 0 else position_1", "y": "position_1 if flip == 0 else position_0", "z": "position_2"}
```

## 7.4-compare-forms step 3 template 5 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
"'ABC'[pos] + ') ' + c1"
```
After:
```json
"safe_1 + ') ' + c1"
```

## 7.4-compare-forms step 3 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions. Sort numeric values, then select the corresponding text at each position. Avoid tuple comparison and nested indexing.

Before:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "(str(int(a)) if a == int(a) else str(round(a, 6)))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "s": "sorted([(a, sa), (v, sf), (pc, sp)])", "c1": "s[0][1] + ', ' + s[1][1] + ', ' + s[2][1]", "w1": "s[2][1] + ', ' + s[1][1] + ', ' + s[0][1]", "w2": "s[0][1] + ', ' + s[2][1] + ', ' + s[1][1]", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else (c1 if pos == 1 else w2)", "oC": "w2 if pos < 2 else c1"}
```
After:
```json
{"n": "1 + r % (d - 1)", "a": "k / 100", "sa": "str(int(a)) if a == int(a) else str(round(a, 6))", "v": "n / d", "sf": "str(n) + '/' + str(d)", "pc": "p / 100", "sp": "str(p) + '%'", "ordered": "sorted([a, v, pc])", "position_0": "sa if a == ordered[0] else sf if v == ordered[0] else sp", "position_1": "sa if a == ordered[1] else sf if v == ordered[1] else sp", "position_2": "sa if a == ordered[2] else sf if v == ordered[2] else sp", "c1": "position_0 + ', ' + position_1 + ', ' + position_2", "w1": "position_2 + ', ' + position_1 + ', ' + position_0", "w2": "position_0 + ', ' + position_2 + ', ' + position_1", "oA": "c1 if pos == 0 else w1", "oB": "w1 if pos == 0 else c1 if pos == 1 else w2", "oC": "w2 if pos < 2 else c1", "safe_1": "'A' if pos == 0 else ('B' if pos == 1 else ('C'))"}
```

## 7.13-sales-tax-tip step 2 step fields: numbers

Remove unused cents lists. All six templates already use j or j4m and derive each price and tax separately.

Before:
```json
{"operand1": {"min": 1, "max": 80}, "operand2": {"min": 1, "max": 80}, "result": {"min": 1, "max": 80}, "decimal_places": {"min": 0, "max": 2}, "price": {"min": 10, "max": 200, "values": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]}, "percent": {"min": 5, "max": 12, "values": [5, 7, 12]}, "flip": {"min": 0, "max": 1}, "error": {"min": 1, "max": 5}, "price_low": {"min": 10, "max": 100, "values": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}, "percent_low": {"min": 5, "max": 5, "values": [5]}, "price_high": {"min": 110, "max": 200, "values": [110, 120, 130, 140, 150, 160, 170, 180, 190, 200]}, "percent_high": {"min": 7, "max": 12, "values": [7, 12]}, "C": {"min": 500, "max": 15000, "values": [500, 525, 550, 575, 600, 625, 650, 675, 700, 725, 750, 775, 800, 825, 850, 875, 900, 925, 950, 975, 1000, 1025, 1050, 1075, 1100, 1125, 1150, 1175, 1200, 1225, 1250, 1275, 1300, 1325, 1350, 1375, 1400, 1425, 1450, 1475, 1500, 1525, 1550, 1575, 1600, 1625, 1650, 1675, 1700, 1725, 1750, 1775, 1800, 1825, 1850, 1875, 1900, 1925, 1950, 1975, 2000, 2025, 2050, 2075, 2100, 2125, 2150, 2175, 2200, 2225, 2250, 2275, 2300, 2325, 2350, 2375, 2400, 2425, 2450, 2475, 2500, 2525, 2550, 2575, 2600, 2625, 2650, 2675, 2700, 2725, 2750, 2775, 2800, 2825, 2850, 2875, 2900, 2925, 2950, 2975, 3000, 3025, 3050, 3075, 3100, 3125, 3150, 3175, 3200, 3225, 3250, 3275, 3300, 3325, 3350, 3375, 3400, 3425, 3450, 3475, 3500, 3525, 3550, 3575, 3600, 3625, 3650, 3675, 3700, 3725, 3750, 3775, 3800, 3825, 3850, 3875, 3900, 3925, 3950, 3975, 4000, 4025, 4050, 4075, 4100, 4125, 4150, 4175, 4200, 4225, 4250, 4275, 4300, 4325, 4350, 4375, 4400, 4425, 4450, 4475, 4500, 4525, 4550, 4575, 4600, 4625, 4650, 4675, 4700, 4725, 4750, 4775, 4800, 4825, 4850, 4875, 4900, 4925, 4950, 4975, 5000, 5025, 5050, 5075, 5100, 5125, 5150, 5175, 5200, 5225, 5250, 5275, 5300, 5325, 5350, 5375, 5400, 5425, 5450, 5475, 5500, 5525, 5550, 5575, 5600, 5625, 5650, 5675, 5700, 5725, 5750, 5775, 5800, 5825, 5850, 5875, 5900, 5925, 5950, 5975, 6000, 6025, 6050, 6075, 6100, 6125, 6150, 6175, 6200, 6225, 6250, 6275, 6300, 6325, 6350, 6375, 6400, 6425, 6450, 6475, 6500, 6525, 6550, 6575, 6600, 6625, 6650, 6675, 6700, 6725, 6750, 6775, 6800, 6825, 6850, 6875, 6900, 6925, 6950, 6975, 7000, 7025, 7050, 7075, 7100, 7125, 7150, 7175, 7200, 7225, 7250, 7275, 7300, 7325, 7350, 7375, 7400, 7425, 7450, 7475, 7500, 7525, 7550, 7575, 7600, 7625, 7650, 7675, 7700, 7725, 7750, 7775, 7800, 7825, 7850, 7875, 7900, 7925, 7950, 7975, 8000, 8025, 8050, 8075, 8100, 8125, 8150, 8175, 8200, 8225, 8250, 8275, 8300, 8325, 8350, 8375, 8400, 8425, 8450, 8475, 8500, 8525, 8550, 8575, 8600, 8625, 8650, 8675, 8700, 8725, 8750, 8775, 8800, 8825, 8850, 8875, 8900, 8925, 8950, 8975, 9000, 9025, 9050, 9075, 9100, 9125, 9150, 9175, 9200, 9225, 9250, 9275, 9300, 9325, 9350, 9375, 9400, 9425, 9450, 9475, 9500, 9525, 9550, 9575, 9600, 9625, 9650, 9675, 9700, 9725, 9750, 9775, 9800, 9825, 9850, 9875, 9900, 9925, 9950, 9975, 10000, 10025, 10050, 10075, 10100, 10125, 10150, 10175, 10200, 10225, 10250, 10275, 10300, 10325, 10350, 10375, 10400, 10425, 10450, 10475, 10500, 10525, 10550, 10575, 10600, 10625, 10650, 10675, 10700, 10725, 10750, 10775, 10800, 10825, 10850, 10875, 10900, 10925, 10950, 10975, 11000, 11025, 11050, 11075, 11100, 11125, 11150, 11175, 11200, 11225, 11250, 11275, 11300, 11325, 11350, 11375, 11400, 11425, 11450, 11475, 11500, 11525, 11550, 11575, 11600, 11625, 11650, 11675, 11700, 11725, 11750, 11775, 11800, 11825, 11850, 11875, 11900, 11925, 11950, 11975, 12000, 12025, 12050, 12075, 12100, 12125, 12150, 12175, 12200, 12225, 12250, 12275, 12300, 12325, 12350, 12375, 12400, 12425, 12450, 12475, 12500, 12525, 12550, 12575, 12600, 12625, 12650, 12675, 12700, 12725, 12750, 12775, 12800, 12825, 12850, 12875, 12900, 12925, 12950, 12975, 13000, 13025, 13050, 13075, 13100, 13125, 13150, 13175, 13200, 13225, 13250, 13275, 13300, 13325, 13350, 13375, 13400, 13425, 13450, 13475, 13500, 13525, 13550, 13575, 13600, 13625, 13650, 13675, 13700, 13725, 13750, 13775, 13800, 13825, 13850, 13875, 13900, 13925, 13950, 13975, 14000, 14025, 14050, 14075, 14100, 14125, 14150, 14175, 14200, 14225, 14250, 14275, 14300, 14325, 14350, 14375, 14400, 14425, 14450, 14475, 14500, 14525, 14550, 14575, 14600, 14625, 14650, 14675, 14700, 14725, 14750, 14775, 14800, 14825, 14850, 14875, 14900, 14925, 14950, 14975, 15000]}, "j4": {"min": 500, "max": 15000, "values": [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000, 3100, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 4000, 4100, 4200, 4300, 4400, 4500, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000, 6100, 6200, 6300, 6400, 6500, 6600, 6700, 6800, 6900, 7000, 7100, 7200, 7300, 7400, 7500, 7600, 7700, 7800, 7900, 8000, 8100, 8200, 8300, 8400, 8500, 8600, 8700, 8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800, 9900, 10000, 10100, 10200, 10300, 10400, 10500, 10600, 10700, 10800, 10900, 11000, 11100, 11200, 11300, 11400, 11500, 11600, 11700, 11800, 11900, 12000, 12100, 12200, 12300, 12400, 12500, 12600, 12700, 12800, 12900, 13000, 13100, 13200, 13300, 13400, 13500, 13600, 13700, 13800, 13900, 14000, 14100, 14200, 14300, 14400, 14500, 14600, 14700, 14800, 14900, 15000]}, "j": {"min": 20, "max": 600}, "j4m": {"min": 20, "max": 600, "values": [20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 148, 152, 156, 160, 164, 168, 172, 176, 180, 184, 188, 192, 196, 200, 204, 208, 212, 216, 220, 224, 228, 232, 236, 240, 244, 248, 252, 256, 260, 264, 268, 272, 276, 280, 284, 288, 292, 296, 300, 304, 308, 312, 316, 320, 324, 328, 332, 336, 340, 344, 348, 352, 356, 360, 364, 368, 372, 376, 380, 384, 388, 392, 396, 400, 404, 408, 412, 416, 420, 424, 428, 432, 436, 440, 444, 448, 452, 456, 460, 464, 468, 472, 476, 480, 484, 488, 492, 496, 500, 504, 508, 512, 516, 520, 524, 528, 532, 536, 540, 544, 548, 552, 556, 560, 564, 568, 572, 576, 580, 584, 588, 592, 596, 600]}}
```
After:
```json
{"operand1": {"min": 1, "max": 80}, "operand2": {"min": 1, "max": 80}, "result": {"min": 1, "max": 80}, "decimal_places": {"min": 0, "max": 2}, "price": {"min": 10, "max": 200, "values": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]}, "percent": {"min": 5, "max": 12, "values": [5, 7, 12]}, "flip": {"min": 0, "max": 1}, "error": {"min": 1, "max": 5}, "price_low": {"min": 10, "max": 100, "values": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}, "percent_low": {"min": 5, "max": 5, "values": [5]}, "price_high": {"min": 110, "max": 200, "values": [110, 120, 130, 140, 150, 160, 170, 180, 190, 200]}, "percent_high": {"min": 7, "max": 12, "values": [7, 12]}, "j": {"min": 20, "max": 600}, "j4m": {"min": 20, "max": 600, "values": [20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 148, 152, 156, 160, 164, 168, 172, 176, 180, 184, 188, 192, 196, 200, 204, 208, 212, 216, 220, 224, 228, 232, 236, 240, 244, 248, 252, 256, 260, 264, 268, 272, 276, 280, 284, 288, 292, 296, 300, 304, 308, 312, 316, 320, 324, 328, 332, 336, 340, 344, 348, 352, 356, 360, 364, 368, 372, 376, 380, 384, 388, 392, 396, 400, 404, 408, 412, 416, 420, 424, 428, 432, 436, 440, 444, 448, 452, 456, 460, 464, 468, 472, 476, 480, 484, 488, 492, 496, 500, 504, 508, 512, 516, 520, 524, 528, 532, 536, 540, 544, 548, 552, 556, 560, 564, 568, 572, 576, 580, 584, 588, 592, 596, 600]}}
```

## 8.14-multi-buy-offers step 1 template 1 check

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2"
```
After:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2 and q >= 3.2 and q <= 14"
```

## 8.14-multi-buy-offers step 1 template 1 slots

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"n": "items", "m": "items", "p": "price", "q": "price", "flip": "flip"}
```
After:
```json
{"n": "items", "m": "items", "p": "price", "flip": "flip"}
```

## 8.14-multi-buy-offers step 1 template 2 check

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2"
```
After:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2 and q >= 3.2 and q <= 14"
```

## 8.14-multi-buy-offers step 1 template 2 slots

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"n": "items", "m": "items", "p": "price", "q": "price", "flip": "flip"}
```
After:
```json
{"n": "items", "m": "items", "p": "price", "flip": "flip"}
```

## 8.14-multi-buy-offers step 1 template 4 check

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2"
```
After:
```json
"n!=m and p/n!=q/m and n >= 2 and m >= 2 and q >= 3.2 and q <= 14"
```

## 8.14-multi-buy-offers step 1 template 4 slots

Keep the second offer price derived from the first. Do not sample and then overwrite q. Bound both printed prices. Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"n": "items", "m": "items", "p": "price", "q": "price", "flip": "flip"}
```
After:
```json
{"n": "items", "m": "items", "p": "price", "flip": "flip"}
```

## 9.2-power-parts step 1 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"prod": "(str(b) + ' × ') * (e - 1) + str(b)", "pw": "str(b) + ('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]"}
```
After:
```json
{"safe_1": "str(b) + ' × '", "safe_2": "e - 1", "prod": "safe_1 + (safe_1 if safe_2 >= 2 else '') + (safe_1 if safe_2 >= 3 else '') + (safe_1 if safe_2 >= 4 else '') + (safe_1 if safe_2 >= 5 else '') + (safe_1 if safe_2 >= 6 else '') + (safe_1 if safe_2 >= 7 else '') + str(b)", "safe_3": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_4": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "pw": "str(b) + ('' if e < 10 else safe_3) + safe_4"}
```

## 9.2-power-parts step 1 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "shown": "((str(b) + ' × ') * (e - 1) + str(b)) if flip == 0 else (str(b) + ' × ' + str(e))"}
```
After:
```json
{"safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(b) + ' × '", "safe_4": "e - 1", "shown": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(b) if flip == 0 else str(b) + ' × ' + str(e)"}
```

## 9.2-power-parts step 2 template 1 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "prod": "(str(b) + ' × ') * (e - 1) + str(b)"}
```
After:
```json
{"safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(b) + ' × '", "safe_4": "e - 1", "prod": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(b)"}
```

## 9.2-power-parts step 2 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "shown": "((str(b) + ' × ') * (e - 1) + str(b)) if flip == 0 else (str(b) + ' × ' + str(e))"}
```
After:
```json
{"safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(b) + ' × '", "safe_4": "e - 1", "shown": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(b) if flip == 0 else str(b) + ' × ' + str(e)"}
```

## 9.2-power-parts step 2 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('A) ' + str(xr)) if pos == 0 else (('B) ' + str(xr)) if pos == 1 else ('C) ' + str(xr)))"
```
After:
```json
"'A) ' + str(xr) if pos == 0 else 'B) ' + str(xr) if pos == 1 else 'C) ' + str(xr)"
```

## 9.2-power-parts step 2 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"prod": "(str(b) + ' × ') * (e - 1) + str(b)", "xr": "str(b) + ('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "xw1": "str(e) + ('' if (b) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(b) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(b) % 10]", "xw2": "str(b * e)", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"safe_1": "str(b) + ' × '", "safe_2": "e - 1", "prod": "safe_1 + (safe_1 if safe_2 >= 2 else '') + (safe_1 if safe_2 >= 3 else '') + (safe_1 if safe_2 >= 4 else '') + (safe_1 if safe_2 >= 5 else '') + (safe_1 if safe_2 >= 6 else '') + (safe_1 if safe_2 >= 7 else '') + str(b)", "safe_3": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_4": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "xr": "str(b) + ('' if e < 10 else safe_3) + safe_4", "safe_5": "'⁰' if b // 10 == 0 else ('¹' if b // 10 == 1 else ('²' if b // 10 == 2 else ('³' if b // 10 == 3 else ('⁴' if b // 10 == 4 else ('⁵' if b // 10 == 5 else ('⁶' if b // 10 == 6 else ('⁷' if b // 10 == 7 else ('⁸' if b // 10 == 8 else ('⁹')))))))))", "safe_6": "'⁰' if b % 10 == 0 else ('¹' if b % 10 == 1 else ('²' if b % 10 == 2 else ('³' if b % 10 == 3 else ('⁴' if b % 10 == 4 else ('⁵' if b % 10 == 5 else ('⁶' if b % 10 == 6 else ('⁷' if b % 10 == 7 else ('⁸' if b % 10 == 8 else ('⁹')))))))))", "xw1": "str(e) + ('' if b < 10 else safe_5) + safe_6", "xw2": "str(b * e)", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else xw1 if pos == 0 else xw2", "oc": "xr if pos == 2 else xw2"}
```

## 9.2-power-parts step 2 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "shown": "((str(b) + ' × ') * (e - 1) + str(b)) if flip == 0 else ((str(b) + ' × ') * e + str(b))"}
```
After:
```json
{"safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(b) + ' × '", "safe_4": "e - 1", "safe_5": "str(b) + ' × '", "safe_6": "e", "shown": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(b) if flip == 0 else safe_5 + (safe_5 if safe_6 >= 2 else '') + (safe_5 if safe_6 >= 3 else '') + (safe_5 if safe_6 >= 4 else '') + (safe_5 if safe_6 >= 5 else '') + (safe_5 if safe_6 >= 6 else '') + (safe_5 if safe_6 >= 7 else '') + str(b)"}
```

## 9.2-power-parts step 2 template 6 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"str(b) + ('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10] + ' × ' + str(c) + ('' if (f) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(f) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(f) % 10]"
```
After:
```json
"str(b) + ('' if e < 10 else safe_5) + safe_6 + ' × ' + str(c) + ('' if f < 10 else safe_7) + safe_8"
```

## 9.2-power-parts step 2 template 6 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"prod": "(str(b) + ' × ') * e + (str(c) + ' × ') * (f - 1) + str(c)"}
```
After:
```json
{"safe_1": "str(b) + ' × '", "safe_2": "e", "safe_3": "str(c) + ' × '", "safe_4": "f - 1", "prod": "safe_1 + (safe_1 if safe_2 >= 2 else '') + (safe_1 if safe_2 >= 3 else '') + (safe_1 if safe_2 >= 4 else '') + (safe_1 if safe_2 >= 5 else '') + (safe_1 if safe_2 >= 6 else '') + (safe_1 if safe_2 >= 7 else '') + (safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '')) + str(c)", "safe_5": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_6": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "safe_7": "'⁰' if f // 10 == 0 else ('¹' if f // 10 == 1 else ('²' if f // 10 == 2 else ('³' if f // 10 == 3 else ('⁴' if f // 10 == 4 else ('⁵' if f // 10 == 5 else ('⁶' if f // 10 == 6 else ('⁷' if f // 10 == 7 else ('⁸' if f // 10 == 8 else ('⁹')))))))))", "safe_8": "'⁰' if f % 10 == 0 else ('¹' if f % 10 == 1 else ('²' if f % 10 == 2 else ('³' if f % 10 == 3 else ('⁴' if f % 10 == 4 else ('⁵' if f % 10 == 5 else ('⁶' if f % 10 == 6 else ('⁷' if f % 10 == 7 else ('⁸' if f % 10 == 8 else ('⁹')))))))))"}
```

## 9.2-power-parts step 3 template 1 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "prod": "(str(L) + ' × ') * (e - 1) + str(L)"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(L) + ' × '", "safe_4": "e - 1", "prod": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(L)"}
```

## 9.2-power-parts step 3 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "shown": "((str(L) + ' × ') * (e - 1) + str(L)) if flip == 0 else (str(e) + L)"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "str(L) + ' × '", "safe_4": "e - 1", "shown": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + str(L) if flip == 0 else str(e) + L"}
```

## 9.2-power-parts step 3 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "cl": "str(c) + L", "prod": "(cl + ' × ') * (e - 1) + cl"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "cl": "str(c) + L", "safe_3": "cl + ' × '", "safe_4": "e - 1", "prod": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + cl"}
```

## 9.2-power-parts step 3 template 4 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('A) ' + str(r)) if pos == 0 else (('B) ' + str(r)) if pos == 1 else ('C) ' + str(r)))"
```
After:
```json
"'A) ' + str(r) if pos == 0 else 'B) ' + str(r) if pos == 1 else 'C) ' + str(r)"
```

## 9.2-power-parts step 3 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "cl": "str(c) + L", "r": "(cl + ' × ') * (e - 1) + cl", "w1": "str(c) + ' × ' + (L + ' × ') * (e - 1) + L", "w2": "str(c * e) + L", "oa": "r if pos == 0 else w1", "ob": "r if pos == 1 else (w1 if pos == 0 else w2)", "oc": "r if pos == 2 else w2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "cl": "str(c) + L", "safe_3": "cl + ' × '", "safe_4": "e - 1", "r": "safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '') + cl", "safe_5": "L + ' × '", "safe_6": "e - 1", "w1": "str(c) + ' × ' + (safe_5 + (safe_5 if safe_6 >= 2 else '') + (safe_5 if safe_6 >= 3 else '') + (safe_5 if safe_6 >= 4 else '') + (safe_5 if safe_6 >= 5 else '') + (safe_5 if safe_6 >= 6 else '') + (safe_5 if safe_6 >= 7 else '')) + L", "w2": "str(c * e) + L", "oa": "r if pos == 0 else w1", "ob": "r if pos == 1 else w1 if pos == 0 else w2", "oc": "r if pos == 2 else w2"}
```

## 9.2-power-parts step 3 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "es": "('' if (e) < 10 else '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) // 10]) + '⁰¹²³⁴⁵⁶⁷⁸⁹'[(e) % 10]", "prod": "str(c) + ' × ' + (L + ' × ') * (e - 1) + L"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "safe_1": "'⁰' if e // 10 == 0 else ('¹' if e // 10 == 1 else ('²' if e // 10 == 2 else ('³' if e // 10 == 3 else ('⁴' if e // 10 == 4 else ('⁵' if e // 10 == 5 else ('⁶' if e // 10 == 6 else ('⁷' if e // 10 == 7 else ('⁸' if e // 10 == 8 else ('⁹')))))))))", "safe_2": "'⁰' if e % 10 == 0 else ('¹' if e % 10 == 1 else ('²' if e % 10 == 2 else ('³' if e % 10 == 3 else ('⁴' if e % 10 == 4 else ('⁵' if e % 10 == 5 else ('⁶' if e % 10 == 6 else ('⁷' if e % 10 == 7 else ('⁸' if e % 10 == 8 else ('⁹')))))))))", "es": "('' if e < 10 else safe_1) + safe_2", "safe_3": "L + ' × '", "safe_4": "e - 1", "prod": "str(c) + ' × ' + (safe_3 + (safe_3 if safe_4 >= 2 else '') + (safe_3 if safe_4 >= 3 else '') + (safe_3 if safe_4 >= 4 else '') + (safe_3 if safe_4 >= 5 else '') + (safe_3 if safe_4 >= 6 else '') + (safe_3 if safe_4 >= 7 else '')) + L"}
```

## 9.2-evaluate-power step 1 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"prod": "(str(b) + ' × ') * (e - 1) + str(b)"}
```
After:
```json
{"safe_1": "str(b) + ' × '", "safe_2": "e - 1", "prod": "safe_1 + (safe_1 if safe_2 >= 2 else '') + (safe_1 if safe_2 >= 3 else '') + (safe_1 if safe_2 >= 4 else '') + (safe_1 if safe_2 >= 5 else '') + (safe_1 if safe_2 >= 6 else '') + (safe_1 if safe_2 >= 7 else '') + str(b)"}
```

## 9.2-evaluate-power step 2 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"prod": "('(' + str(b) + ') × ') * (e - 1) + '(' + str(b) + ')'"}
```
After:
```json
{"safe_1": "'(' + str(b) + ') × '", "safe_2": "e - 1", "prod": "safe_1 + (safe_1 if safe_2 >= 2 else '') + (safe_1 if safe_2 >= 3 else '') + (safe_1 if safe_2 >= 4 else '') + (safe_1 if safe_2 >= 5 else '') + (safe_1 if safe_2 >= 6 else '') + (safe_1 if safe_2 >= 7 else '') + '(' + str(b) + ')'"}
```

## 9.1-add-subtract step 1 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('-' if b < a else '') + '%.2f' % (abs(b - a) / 100)"
```
After:
```json
"('-' if b < a else '') + safe_6"
```

## 9.1-add-subtract step 1 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"A": "'%.2f' % (a / 100)", "B": "'%.2f' % (b / 100)"}
```
After:
```json
{"safe_1": "int(round((a / 100) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "A": "safe_2", "safe_3": "int(round((b / 100) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "B": "safe_4", "safe_5": "int(round((abs(b - a) / 100) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.1-multiply-divide step 2 template 6 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('-' if v < 0 else '') + '$' + '%.2f' % abs(v)"
```
After:
```json
"('-' if v < 0 else '') + '$' + safe_6"
```

## 9.1-multiply-divide step 2 template 6 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"D": "'%.2f' % (h / 100)", "E": "'%.2f' % (g / 10)", "v": "round(-h * n / 100 + g / 10, 2)"}
```
After:
```json
{"safe_1": "int(round((h / 100) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "D": "safe_2", "safe_3": "int(round((g / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "E": "safe_4", "v": "round(-h * n / 100 + g / 10, 2)", "safe_5": "int(round((abs(v)) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.1-order-of-operations step 3 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (t / 10 + a / d * n)"
```
After:
```json
"'$' + safe_2"
```

## 9.1-order-of-operations step 3 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"a": "1 + n0 % (d - 1)"}
```
After:
```json
{"a": "1 + n0 % (d - 1)", "safe_1": "int(round((t / 10 + a / d * n) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)"}
```

## 9.1-word-problems step 1 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % ((c - s) / 100)"
```
After:
```json
"'$' + safe_6"
```

## 9.1-word-problems step 1 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"D": "'%.2f' % (c / 100)", "S": "'%.2f' % (s / 100)"}
```
After:
```json
{"safe_1": "int(round((c / 100) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "D": "safe_2", "safe_3": "int(round((s / 100) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "S": "safe_4", "safe_5": "int(round(((c - s) / 100) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.1-word-problems step 3 template 5 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (50 - n * q * 25 / 100)"
```
After:
```json
"'$' + safe_4"
```

## 9.1-word-problems step 3 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"P": "'%.2f' % (q * 25 / 100)"}
```
After:
```json
{"safe_1": "int(round((q * 25 / 100) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "P": "safe_2", "safe_3": "int(round((50 - n * q * 25 / 100) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)"}
```

## 9.8-budget step 3 template 4 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (g * u4 / 4 + hall)"
```
After:
```json
"'$' + safe_4"
```

## 9.8-budget step 3 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"P": "'%.2f' % (u4 / 4)"}
```
After:
```json
{"safe_1": "int(round((u4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "P": "safe_2", "safe_3": "int(round((g * u4 / 4 + hall) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)"}
```

## 9.8-bank-record step 2 template 1 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (bal4 + c4 / 4 - fee4 / 4)"
```
After:
```json
"'$' + safe_6"
```

## 9.8-bank-record step 2 template 1 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal4 + c4 / 4)", "F": "'%.2f' % (fee4 / 4)"}
```
After:
```json
{"safe_1": "int(round((bal4 + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((fee4 / 4) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "F": "safe_4", "safe_5": "int(round((bal4 + c4 / 4 - fee4 / 4) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.8-bank-record step 2 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal4 + c4 / 4)", "shown": "('%.2f' % (bal4 + c4 / 4 + dep)) if flip == 0 else ('%.2f' % (bal4 + c4 / 4 - dep))"}
```
After:
```json
{"safe_1": "int(round((bal4 + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((bal4 + c4 / 4 + dep) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "safe_5": "int(round((bal4 + c4 / 4 - dep) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "shown": "safe_4 if flip == 0 else safe_6"}
```

## 9.8-bank-record step 2 template 3 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (bal4 + c4 / 4 + dep - fee4 / 4)"
```
After:
```json
"'$' + safe_6"
```

## 9.8-bank-record step 2 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal4 + c4 / 4)", "F": "'%.2f' % (fee4 / 4)"}
```
After:
```json
{"safe_1": "int(round((bal4 + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((fee4 / 4) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "F": "safe_4", "safe_5": "int(round((bal4 + c4 / 4 + dep - fee4 / 4) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.8-bank-record step 2 template 4 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (bal4 + c4 / 4 - 7.5 + dep)"
```
After:
```json
"'$' + safe_4"
```

## 9.8-bank-record step 2 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal4 + c4 / 4)"}
```
After:
```json
{"safe_1": "int(round((bal4 + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((bal4 + c4 / 4 - 7.5 + dep) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)"}
```

## 9.8-bank-record step 2 template 5 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"'$' + '%.2f' % (bal_h + c4 / 4 - 2 * fee4 / 4 + dep)"
```
After:
```json
"'$' + safe_6"
```

## 9.8-bank-record step 2 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal_h + c4 / 4)", "F": "'%.2f' % (fee4 / 4)"}
```
After:
```json
{"safe_1": "int(round((bal_h + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((fee4 / 4) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "F": "safe_4", "safe_5": "int(round((bal_h + c4 / 4 - 2 * fee4 / 4 + dep) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)"}
```

## 9.8-bank-record step 2 template 6 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('A) ' + str(xr)) if pos == 0 else (('B) ' + str(xr)) if pos == 1 else ('C) ' + str(xr)))"
```
After:
```json
"'A) ' + str(xr) if pos == 0 else 'B) ' + str(xr) if pos == 1 else 'C) ' + str(xr)"
```

## 9.8-bank-record step 2 template 6 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"B": "'%.2f' % (bal_h + c4 / 4)", "F": "'%.2f' % (fee4 / 4)", "xr": "'$' + '%.2f' % (bal_h + c4 / 4 - fee4 / 4)", "xw1": "'$' + '%.2f' % (bal_h + c4 / 4 + fee4 / 4)", "xw2": "'$' + '%.2f' % (bal_h - c4 / 4 - fee4 / 4)", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"safe_1": "int(round((bal_h + c4 / 4) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "B": "safe_2", "safe_3": "int(round((fee4 / 4) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "F": "safe_4", "safe_5": "int(round((bal_h + c4 / 4 - fee4 / 4) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "xr": "'$' + safe_6", "safe_7": "int(round((bal_h + c4 / 4 + fee4 / 4) * 100))", "safe_8": "('-' if safe_7 < 0 else '') + str(abs(safe_7) // 100) + '.' + ('0' if abs(safe_7) % 100 < 10 else '') + str(abs(safe_7) % 100)", "xw1": "'$' + safe_8", "safe_9": "int(round((bal_h - c4 / 4 - fee4 / 4) * 100))", "safe_10": "('-' if safe_9 < 0 else '') + str(abs(safe_9) // 100) + '.' + ('0' if abs(safe_9) % 100 < 10 else '') + str(abs(safe_9) % 100)", "xw2": "'$' + safe_10", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else xw1 if pos == 0 else xw2", "oc": "xr if pos == 2 else xw2"}
```

## 9.5-rational-coefficients step 2 template 1 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2"}
```

## 9.5-rational-coefficients step 2 template 2 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2", "shown": "(s) if flip == 0 else (s + 1)"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2", "shown": "s if flip == 0 else s + 1"}
```

## 9.5-rational-coefficients step 2 template 3 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2"}
```

## 9.5-rational-coefficients step 2 template 4 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2"}
```

## 9.5-rational-coefficients step 2 template 5 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2"}
```

## 9.5-rational-coefficients step 2 template 6 answer

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
"('A) ' + str(xr)) if pos == 0 else (('B) ' + str(xr)) if pos == 1 else ('C) ' + str(xr)))"
```
After:
```json
"'A) ' + str(xr) if pos == 0 else 'B) ' + str(xr) if pos == 1 else 'C) ' + str(xr)"
```

## 9.5-rational-coefficients step 2 template 6 derived

Replace unsupported percent string formatting, string repetition or string indexing with explicit derived values and supported expressions.

Before:
```json
{"L": "['n', 'x', 'k'][L_i]", "pp": "'%.2f' % (a / 10)", "rr": "'%.2f' % ((a * s + b) / 10)", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "bb": "'%.2f' % (b / 10)", "s2": "s2", "xr": "s", "xw1": "s + 1", "xw2": "s - 1", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'x', 'k'][L_i]", "safe_1": "int(round((a / 10) * 100))", "safe_2": "('-' if safe_1 < 0 else '') + str(abs(safe_1) // 100) + '.' + ('0' if abs(safe_1) % 100 < 10 else '') + str(abs(safe_1) % 100)", "pp": "safe_2", "safe_3": "int(round(((a * s + b) / 10) * 100))", "safe_4": "('-' if safe_3 < 0 else '') + str(abs(safe_3) // 100) + '.' + ('0' if abs(safe_3) % 100 < 10 else '') + str(abs(safe_3) % 100)", "rr": "safe_4", "r10": "a * s + b", "E": "str(round(a / 10, 1)) + L + ' + ' + str(round(b / 10, 1)) + ' = ' + str(round((a * s + b) / 10, 1))", "E2": "str(round(a2 / 10, 1)) + L + ' + ' + str(round(b2 / 10, 1)) + ' = ' + str(round((a2 * s2 + b2) / 10, 1))", "r": "round((a * s + b) / 10, 1)", "safe_5": "int(round((b / 10) * 100))", "safe_6": "('-' if safe_5 < 0 else '') + str(abs(safe_5) // 100) + '.' + ('0' if abs(safe_5) % 100 < 10 else '') + str(abs(safe_5) % 100)", "bb": "safe_6", "s2": "s2", "xr": "s", "xw1": "s + 1", "xw2": "s - 1", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else xw1 if pos == 0 else xw2", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-vocabulary step 3 template 2 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a": "(1 - 2 * s1) * a0", "b": "(1 - 2 * s2) * b0", "c": "(1 - 2 * s3) * c0", "P3": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²' + (' + ' if (b) > 0 else ' - ') + ('' if abs(b) == 1 else str(abs(b))) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "P2": "('' if (b) == 1 else '-' if (b) == -1 else str(b)) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "PR": "str(c) + (' + ' if (b) > 0 else ' - ') + ('' if abs(b) == 1 else str(abs(b))) + L + (' + ' if (a) > 0 else ' - ') + ('' if abs(a) == 1 else str(abs(a))) + L + '²'", "f0": "str(c)", "f1": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L", "f2": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²'", "f3": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "f4": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²' + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "f5": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²' + (' + ' if (b) > 0 else ' - ') + ('' if abs(b) == 1 else str(abs(b))) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "g3": "str(c) + (' + ' if (a) > 0 else ' - ') + ('' if abs(a) == 1 else str(abs(a))) + L", "g4": "str(c) + (' + ' if (a) > 0 else ' - ') + ('' if abs(a) == 1 else str(abs(a))) + L + '²'", "PT": "[f0, f1, f2, f3, f4, f5][ty]", "PS": "[f0, f1, f2, g3, g4, PR][ty]", "nt": "[1, 1, 1, 2, 2, 3][ty]", "dg": "[0, 1, 2, 1, 2, 2][ty]", "nm": "['monomial', 'binomial', 'trinomial'][nt - 1]", "nm1": "['monomial', 'binomial', 'trinomial'][nt % 3]", "nm2": "['monomial', 'binomial', 'trinomial'][(nt + 1) % 3]", "xr": "nm", "xw1": "nm1", "xw2": "nm2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "a": "(1 - 2 * s1) * a0", "b": "(1 - 2 * s2) * b0", "c": "(1 - 2 * s3) * c0", "f0": "str(c)", "f1": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L", "f2": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²'", "f3": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "f4": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²' + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "f5": "('' if (a) == 1 else '-' if (a) == -1 else str(a)) + L + '²' + (' + ' if (b) > 0 else ' - ') + ('' if abs(b) == 1 else str(abs(b))) + L + (' + ' + str(c) if (c) > 0 else ' - ' + str(abs(c)))", "PT": "[f0, f1, f2, f3, f4, f5][ty]", "nt": "[1, 1, 1, 2, 2, 3][ty]", "nm": "['monomial', 'binomial', 'trinomial'][nt - 1]", "nm1": "['monomial', 'binomial', 'trinomial'][nt % 3]", "nm2": "['monomial', 'binomial', 'trinomial'][(nt + 1) % 3]", "xr": "nm", "xw1": "nm1", "xw2": "nm2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-like-terms step 3 template 6 answer

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
"('A) ' + str(xr)) if pos == 0 else (('B) ' + str(xr)) if pos == 1 else ('C) ' + str(xr)))"
```
After:
```json
"'A) ' + str(cnt) if pos == 0 else 'B) ' + str(cnt) if pos == 1 else 'C) ' + str(cnt)"
```

## 9.3-like-terms step 3 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "k0": "c0 if c0 != 0 else 1", "X0": "(str(k0) if t0 == 0 else ('' if (k0) == 1 else '-' if (k0) == -1 else str(k0)) + L + ('²' if t0 == 2 else ''))", "k1": "c1 if c1 != 0 else 1", "u1": "t0 if f1 == 1 else (t0 + 2) % 3", "X1": "(str(k1) if u1 == 0 else ('' if (k1) == 1 else '-' if (k1) == -1 else str(k1)) + L + ('²' if u1 == 2 else ''))", "k2": "c2 if c2 != 0 else 1", "u2": "t0 if f2 == 1 else (t0 + 1) % 3", "X2": "(str(k2) if u2 == 0 else ('' if (k2) == 1 else '-' if (k2) == -1 else str(k2)) + L + ('²' if u2 == 2 else ''))", "k3": "c3 if c3 != 0 else 1", "u3": "t0 if f3 == 1 else (t0 + 2) % 3", "X3": "(str(k3) if u3 == 0 else ('' if (k3) == 1 else '-' if (k3) == -1 else str(k3)) + L + ('²' if u3 == 2 else ''))", "k4": "c4 if c4 != 0 else 1", "u4": "t0 if f4 == 1 else (t0 + 1) % 3", "X4": "(str(k4) if u4 == 0 else ('' if (k4) == 1 else '-' if (k4) == -1 else str(k4)) + L + ('²' if u4 == 2 else ''))", "k5": "c5 if c5 != 0 else 1", "u5": "t0 if f5 == 1 else (t0 + 2) % 3", "X5": "(str(k5) if u5 == 0 else ('' if (k5) == 1 else '-' if (k5) == -1 else str(k5)) + L + ('²' if u5 == 2 else ''))", "cnt": "f1 + f2 + f3 + f4 + f5", "xr": "cnt", "xw1": "cnt + 1", "xw2": "cnt + 2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "k0": "c0 if c0 != 0 else 1", "X0": "(str(k0) if t0 == 0 else ('' if (k0) == 1 else '-' if (k0) == -1 else str(k0)) + L + ('²' if t0 == 2 else ''))", "k1": "c1 if c1 != 0 else 1", "u1": "t0 if f1 == 1 else (t0 + 2) % 3", "X1": "(str(k1) if u1 == 0 else ('' if (k1) == 1 else '-' if (k1) == -1 else str(k1)) + L + ('²' if u1 == 2 else ''))", "k2": "c2 if c2 != 0 else 1", "u2": "t0 if f2 == 1 else (t0 + 1) % 3", "X2": "(str(k2) if u2 == 0 else ('' if (k2) == 1 else '-' if (k2) == -1 else str(k2)) + L + ('²' if u2 == 2 else ''))", "k3": "c3 if c3 != 0 else 1", "u3": "t0 if f3 == 1 else (t0 + 2) % 3", "X3": "(str(k3) if u3 == 0 else ('' if (k3) == 1 else '-' if (k3) == -1 else str(k3)) + L + ('²' if u3 == 2 else ''))", "k4": "c4 if c4 != 0 else 1", "u4": "t0 if f4 == 1 else (t0 + 1) % 3", "X4": "(str(k4) if u4 == 0 else ('' if (k4) == 1 else '-' if (k4) == -1 else str(k4)) + L + ('²' if u4 == 2 else ''))", "k5": "c5 if c5 != 0 else 1", "u5": "t0 if f5 == 1 else (t0 + 2) % 3", "X5": "(str(k5) if u5 == 0 else ('' if (k5) == 1 else '-' if (k5) == -1 else str(k5)) + L + ('²' if u5 == 2 else ''))", "cnt": "f1 + f2 + f3 + f4 + f5", "xw1": "cnt + 1", "xw2": "cnt + 2", "oa": "cnt if pos == 0 else xw1", "ob": "cnt if pos == 1 else xw1 if pos == 0 else xw2", "oc": "cnt if pos == 2 else xw2"}
```

## 9.3-like-terms step 3 template 6 check

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
"xr != xw1 and xr != xw2 and xw1 != xw2 and (cnt + 2 <= 5) and X1 != X2 and X1 != X3 and X1 != X4 and X1 != X5 and X2 != X3 and X2 != X4 and X2 != X5 and X3 != X4 and X3 != X5 and X4 != X5"
```
After:
```json
"cnt != xw1 and cnt != xw2 and (xw1 != xw2) and (cnt + 2 <= 5) and (X1 != X2) and (X1 != X3) and (X1 != X4) and (X1 != X5) and (X2 != X3) and (X2 != X4) and (X2 != X5) and (X3 != X4) and (X3 != X5) and (X4 != X5)"
```

## 9.3-add step 1 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "p3": "('' if (ma3) == 1 else '-' if (ma3) == -1 else str(ma3)) + L + (' + ' + str(mc3) if (mc3) > 0 else ' - ' + str(abs(mc3)))", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W1": "('' if (ma1 * ma2) == 1 else '-' if (ma1 * ma2) == -1 else str(ma1 * ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W2": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 * mc2) if (mc1 * mc2) > 0 else ' - ' + str(abs(mc1 * mc2)))", "HD": "'(' + p1 + ') + (' + p2 + ') + (' + p3 + ')'", "HR": "('' if (ma1 + ma2 + ma3) == 1 else '-' if (ma1 + ma2 + ma3) == -1 else str(ma1 + ma2 + ma3)) + L + (' + ' + str(mc1 + mc2 + mc3) if (mc1 + mc2 + mc3) > 0 else ' - ' + str(abs(mc1 + mc2 + mc3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W1": "('' if (ma1 * ma2) == 1 else '-' if (ma1 * ma2) == -1 else str(ma1 * ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W2": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 * mc2) if (mc1 * mc2) > 0 else ' - ' + str(abs(mc1 * mc2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-add step 2 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "p2r": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p3": "('' if (a3) == 1 else '-' if (a3) == -1 else str(a3)) + L + '²' + (' + ' if (b3) > 0 else ' - ') + ('' if abs(b3) == 1 else str(abs(b3))) + L + (' + ' + str(c3) if (c3) > 0 else ' - ' + str(abs(c3)))", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W1": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 * b2) > 0 else ' - ') + ('' if abs(b1 * b2) == 1 else str(abs(b1 * b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "HD": "'(' + p1 + ') + (' + p2 + ') + (' + p3 + ')'", "HR": "('' if (a1 + a2 + a3) == 1 else '-' if (a1 + a2 + a3) == -1 else str(a1 + a2 + a3)) + L + '²' + (' + ' if (b1 + b2 + b3) > 0 else ' - ') + ('' if abs(b1 + b2 + b3) == 1 else str(abs(b1 + b2 + b3))) + L + (' + ' + str(c1 + c2 + c3) if (c1 + c2 + c3) > 0 else ' - ' + str(abs(c1 + c2 + c3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W1": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 * b2) > 0 else ' - ') + ('' if abs(b1 * b2) == 1 else str(abs(b1 * b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-add step 3 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (b2) == 1 else '-' if (b2) == -1 else str(b2)) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "p3": "('' if (a3) == 1 else '-' if (a3) == -1 else str(a3)) + L + '²' + (' + ' if (b3) > 0 else ' - ') + ('' if abs(b3) == 1 else str(abs(b3))) + L", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 * c2) if (c1 * c2) > 0 else ' - ' + str(abs(c1 * c2)))", "HD": "'(' + p1 + ') + (' + p2 + ') + (' + p3 + ')'", "HR": "('' if (a1 + a3) == 1 else '-' if (a1 + a3) == -1 else str(a1 + a3)) + L + '²' + (' + ' if (b2 + b3) > 0 else ' - ') + ('' if abs(b2 + b3) == 1 else str(abs(b2 + b3))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (b2) == 1 else '-' if (b2) == -1 else str(b2)) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "D": "'(' + p1 + ') + (' + p2 + ')'", "R": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c1 * c2) if (c1 * c2) > 0 else ' - ' + str(abs(c1 * c2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-add step 4 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "p3": "('' if (ma3) == 1 else '-' if (ma3) == -1 else str(ma3)) + L + (' + ' + str(mc3) if (mc3) > 0 else ' - ' + str(abs(mc3)))", "D": "'(' + p1 + ') + (' + p2 + ') + (' + p3 + ')'", "R": "('' if (ma1 + ma2 + ma3) == 1 else '-' if (ma1 + ma2 + ma3) == -1 else str(ma1 + ma2 + ma3)) + L + (' + ' + str(mc1 + mc2 + mc3) if (mc1 + mc2 + mc3) > 0 else ' - ' + str(abs(mc1 + mc2 + mc3)))", "W1": "('' if (ma1 + ma2 + ma3) == 1 else '-' if (ma1 + ma2 + ma3) == -1 else str(ma1 + ma2 + ma3)) + L + (' + ' + str(mc1 * mc2 * mc3) if (mc1 * mc2 * mc3) > 0 else ' - ' + str(abs(mc1 * mc2 * mc3)))", "W2": "('' if (ma1 * ma2 * ma3) == 1 else '-' if (ma1 * ma2 * ma3) == -1 else str(ma1 * ma2 * ma3)) + L + (' + ' + str(mc1 + mc2 + mc3) if (mc1 + mc2 + mc3) > 0 else ' - ' + str(abs(mc1 + mc2 + mc3)))", "HD": "'2(' + p1 + ' + ' + p2 + ')'", "HR": "('' if (2 * (ma1 + ma2)) == 1 else '-' if (2 * (ma1 + ma2)) == -1 else str(2 * (ma1 + ma2))) + L + (' + ' + str(2 * (mc1 + mc2)) if (2 * (mc1 + mc2)) > 0 else ' - ' + str(abs(2 * (mc1 + mc2))))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "p3": "('' if (ma3) == 1 else '-' if (ma3) == -1 else str(ma3)) + L + (' + ' + str(mc3) if (mc3) > 0 else ' - ' + str(abs(mc3)))", "D": "'(' + p1 + ') + (' + p2 + ') + (' + p3 + ')'", "R": "('' if (ma1 + ma2 + ma3) == 1 else '-' if (ma1 + ma2 + ma3) == -1 else str(ma1 + ma2 + ma3)) + L + (' + ' + str(mc1 + mc2 + mc3) if (mc1 + mc2 + mc3) > 0 else ' - ' + str(abs(mc1 + mc2 + mc3)))", "W1": "('' if (ma1 + ma2 + ma3) == 1 else '-' if (ma1 + ma2 + ma3) == -1 else str(ma1 + ma2 + ma3)) + L + (' + ' + str(mc1 * mc2 * mc3) if (mc1 * mc2 * mc3) > 0 else ' - ' + str(abs(mc1 * mc2 * mc3)))", "W2": "('' if (ma1 * ma2 * ma3) == 1 else '-' if (ma1 * ma2 * ma3) == -1 else str(ma1 * ma2 * ma3)) + L + (' + ' + str(mc1 + mc2 + mc3) if (mc1 + mc2 + mc3) > 0 else ' - ' + str(abs(mc1 + mc2 + mc3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-subtract step 1 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "p3": "('' if (ma3) == 1 else '-' if (ma3) == -1 else str(ma3)) + L + (' + ' + str(mc3) if (mc3) > 0 else ' - ' + str(abs(mc3)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (ma1 - ma2) == 1 else '-' if (ma1 - ma2) == -1 else str(ma1 - ma2)) + L + (' + ' + str(mc1 - mc2) if (mc1 - mc2) > 0 else ' - ' + str(abs(mc1 - mc2)))", "W1": "('' if (ma1 - ma2) == 1 else '-' if (ma1 - ma2) == -1 else str(ma1 - ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W2": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 - mc2) if (mc1 - mc2) > 0 else ' - ' + str(abs(mc1 - mc2)))", "HD": "'(' + p1 + ') - (' + p2 + ') - (' + p3 + ')'", "HR": "('' if (ma1 - ma2 - ma3) == 1 else '-' if (ma1 - ma2 - ma3) == -1 else str(ma1 - ma2 - ma3)) + L + (' + ' + str(mc1 - mc2 - mc3) if (mc1 - mc2 - mc3) > 0 else ' - ' + str(abs(mc1 - mc2 - mc3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "p1": "('' if (ma1) == 1 else '-' if (ma1) == -1 else str(ma1)) + L + (' + ' + str(mc1) if (mc1) > 0 else ' - ' + str(abs(mc1)))", "p2": "('' if (ma2) == 1 else '-' if (ma2) == -1 else str(ma2)) + L + (' + ' + str(mc2) if (mc2) > 0 else ' - ' + str(abs(mc2)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (ma1 - ma2) == 1 else '-' if (ma1 - ma2) == -1 else str(ma1 - ma2)) + L + (' + ' + str(mc1 - mc2) if (mc1 - mc2) > 0 else ' - ' + str(abs(mc1 - mc2)))", "W1": "('' if (ma1 - ma2) == 1 else '-' if (ma1 - ma2) == -1 else str(ma1 - ma2)) + L + (' + ' + str(mc1 + mc2) if (mc1 + mc2) > 0 else ' - ' + str(abs(mc1 + mc2)))", "W2": "('' if (ma1 + ma2) == 1 else '-' if (ma1 + ma2) == -1 else str(ma1 + ma2)) + L + (' + ' + str(mc1 - mc2) if (mc1 - mc2) > 0 else ' - ' + str(abs(mc1 - mc2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-subtract step 2 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p3": "('' if (a3) == 1 else '-' if (a3) == -1 else str(a3)) + L + '²' + (' + ' if (b3) > 0 else ' - ') + ('' if abs(b3) == 1 else str(abs(b3))) + L + (' + ' + str(c3) if (c3) > 0 else ' - ' + str(abs(c3)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W1": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "HD": "'(' + p1 + ') - (' + p2 + ') - (' + p3 + ')'", "HR": "('' if (a1 - a2 - a3) == 1 else '-' if (a1 - a2 - a3) == -1 else str(a1 - a2 - a3)) + L + '²' + (' + ' if (b1 - b2 - b3) > 0 else ' - ') + ('' if abs(b1 - b2 - b3) == 1 else str(abs(b1 - b2 - b3))) + L + (' + ' + str(c1 - c2 - c3) if (c1 - c2 - c3) > 0 else ' - ' + str(abs(c1 - c2 - c3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W1": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 9.3-subtract step 3 template 6 derived

Remove unused derived values and inline short intermediate expressions to keep the stored question source within its existing 24-assignment limit. Keep the maths, text, format and difficulty.

Before:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "cs2": "(' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "bs2": "(' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "a3": "ma3 if ma3 != 0 else 1", "b3": "mb3 if mb3 != 0 else 1", "c3": "mc3 if mc3 != 0 else 1", "p3": "('' if (a3) == 1 else '-' if (a3) == -1 else str(a3)) + L + '²' + (' + ' if (b3) > 0 else ' - ') + ('' if abs(b3) == 1 else str(abs(b3))) + L + (' + ' + str(c3) if (c3) > 0 else ' - ' + str(abs(c3)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W1": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "HD": "'(' + p1 + ') - (' + p2 + ') - (' + p3 + ')'", "HR": "('' if (a1 - a2 - a3) == 1 else '-' if (a1 - a2 - a3) == -1 else str(a1 - a2 - a3)) + L + '²' + (' + ' if (b1 - b2 - b3) > 0 else ' - ') + ('' if abs(b1 - b2 - b3) == 1 else str(abs(b1 - b2 - b3))) + L + (' + ' + str(c1 - c2 - c3) if (c1 - c2 - c3) > 0 else ' - ' + str(abs(c1 - c2 - c3)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```
After:
```json
{"L": "['n', 'k', 'm'][L_i]", "a1": "ma1 if ma1 != 0 else 1", "b1": "mb1 if mb1 != 0 else 1", "c1": "mc1 if mc1 != 0 else 1", "a2": "ma2 if ma2 != 0 else 1", "b2": "mb2 if mb2 != 0 else 1", "c2": "mc2 if mc2 != 0 else 1", "p1": "('' if (a1) == 1 else '-' if (a1) == -1 else str(a1)) + L + '²' + (' + ' if (b1) > 0 else ' - ') + ('' if abs(b1) == 1 else str(abs(b1))) + L + (' + ' + str(c1) if (c1) > 0 else ' - ' + str(abs(c1)))", "p2": "('' if (a2) == 1 else '-' if (a2) == -1 else str(a2)) + L + '²' + (' + ' if (b2) > 0 else ' - ') + ('' if abs(b2) == 1 else str(abs(b2))) + L + (' + ' + str(c2) if (c2) > 0 else ' - ' + str(abs(c2)))", "D": "'(' + p1 + ') - (' + p2 + ')'", "R": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "W1": "('' if (a1 - a2) == 1 else '-' if (a1 - a2) == -1 else str(a1 - a2)) + L + '²' + (' + ' if (b1 + b2) > 0 else ' - ') + ('' if abs(b1 + b2) == 1 else str(abs(b1 + b2))) + L + (' + ' + str(c1 + c2) if (c1 + c2) > 0 else ' - ' + str(abs(c1 + c2)))", "W2": "('' if (a1 + a2) == 1 else '-' if (a1 + a2) == -1 else str(a1 + a2)) + L + '²' + (' + ' if (b1 - b2) > 0 else ' - ') + ('' if abs(b1 - b2) == 1 else str(abs(b1 - b2))) + L + (' + ' + str(c1 - c2) if (c1 - c2) > 0 else ' - ' + str(abs(c1 - c2)))", "xr": "R", "xw1": "W1", "xw2": "W2", "oa": "xr if pos == 0 else xw1", "ob": "xr if pos == 1 else (xw1 if pos == 0 else xw2)", "oc": "xr if pos == 2 else xw2"}
```

## 7.4-lowest-terms step 3 template 1 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a < 3 * b and a > b"
```

## 7.4-lowest-terms step 3 template 2 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a < 3 * b and a > b"
```

## 7.4-lowest-terms step 3 template 3 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a < 3 * b and a > b"
```

## 7.4-lowest-terms step 3 template 4 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and c1 != w1 and c1 != w2 and w1 != w2"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and c1 != w1 and c1 != w2 and w1 != w2 and a < 3 * b and a > b"
```

## 7.4-lowest-terms step 3 template 5 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28 and a < 3 * b"
```

## 7.4-lowest-terms step 3 template 6 check

Preserve exactly the original accepted fraction triples. The easier pool is improper and below 3. The hard pool also permits proper fractions with larger numerators.

Before:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28"
```
After:
```json
"gcd(a, b) == 1 and a * g <= 100 and b * g <= 100 and a * g >= 28 and a < 3 * b"
```

## 6.12-trapezoid-area step 3 template 2 answer

Keep the original general-number format for area units. An integer area must print 33 m², not 33.0 m², so the strict solve check reads the same key.

Before:
```json
"str(area) + ' m²'"
```
After:
```json
"str(int(area) if area == int(area) else area) + ' m²'"
```

## 8.10-model step 1 template 4 format

Quality fallback from the U26 matched full-book comparison at base 6d20e5ab. The v2 story adds a large two-method work area. V2 drops 20 planned questions versus 15 for v1, and minimum fullness falls from 62.5% to 57.9%. Use the hard v1 hypotenuse question with v2 derived Pythagorean triples. Keep the hard difficulty and all four templates.

Before:
```json
"story"
```
After:
```json
"choose"
```

## 8.10-model step 1 template 4 text

Quality fallback from the U26 matched full-book comparison at base 6d20e5ab. The v2 story adds a large two-method work area. V2 drops 20 planned questions versus 15 for v1, and minimum fullness falls from 62.5% to 57.9%. Use the hard v1 hypotenuse question with v2 derived Pythagorean triples. Keep the hard difficulty and all four templates.

Before:
```json
"{name} walks along the two sides of a right triangle that meet at the square corner. The three sides measure {x}, {y} and {z} m. How far does {name} walk in all?"
```
After:
```json
"Which side is across from the right angle in a right triangle with sides {x}, {y} and {z}? Write its length."
```

## 8.10-model step 1 template 4 answer

Quality fallback from the U26 matched full-book comparison at base 6d20e5ab. The v2 story adds a large two-method work area. V2 drops 20 planned questions versus 15 for v1, and minimum fullness falls from 62.5% to 57.9%. Use the hard v1 hypotenuse question with v2 derived Pythagorean triples. Keep the hard difficulty and all four templates.

Before:
```json
"p + q"
```
After:
```json
"h"
```

## 8.10-model step 1 step fields numbers

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "side": {
    "min": 3,
    "max": 41
  },
  "flip": {
    "min": 0,
    "max": 1
  }
}
```
After:
```json
{
  "side": {
    "min": 3,
    "max": 41
  },
  "flip": {
    "min": 0,
    "max": 1
  },
  "leg": {
    "min": 3,
    "max": 40,
    "values": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      12,
      15,
      16,
      18,
      20,
      21,
      24,
      28,
      30,
      32,
      35,
      36,
      40
    ]
  }
}
```

## 8.10-model step 1 template 1 slots

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m0": "side",
  "n0": "side",
  "o": "side"
}
```
After:
```json
{
  "m0": "leg",
  "n0": "leg",
  "o": "side"
}
```

## 8.10-model step 1 template 1 derived

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m": "m0 % 4 + 2",
  "n": "n0 % (m - 1) + 1",
  "p": "m * m - n * n",
  "q": "2 * m * n",
  "h": "m * m + n * n",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```
After:
```json
{
  "p": "m0",
  "q": "n0",
  "h": "isqrt(p * p + q * q)",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```

## 8.10-model step 1 template 1 check

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
null
```
After:
```json
"h <= 41 and h * h == p * p + q * q"
```

## 8.10-model step 1 template 2 slots

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m0": "side",
  "n0": "side",
  "o": "side",
  "flip": "flip"
}
```
After:
```json
{
  "m0": "leg",
  "n0": "leg",
  "o": "side",
  "flip": "flip"
}
```

## 8.10-model step 1 template 2 derived

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m": "m0 % 4 + 2",
  "n": "n0 % (m - 1) + 1",
  "p": "m * m - n * n",
  "q": "2 * m * n",
  "h": "m * m + n * n",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]",
  "shown": "h if flip == 0 else min(p, q)"
}
```
After:
```json
{
  "p": "m0",
  "q": "n0",
  "h": "isqrt(p * p + q * q)",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]",
  "shown": "h if flip == 0 else min(p, q)"
}
```

## 8.10-model step 1 template 2 check

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
null
```
After:
```json
"h <= 41 and h * h == p * p + q * q"
```

## 8.10-model step 1 template 3 slots

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m0": "side",
  "n0": "side",
  "o": "side"
}
```
After:
```json
{
  "m0": "leg",
  "n0": "leg",
  "o": "side"
}
```

## 8.10-model step 1 template 3 derived

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m": "m0 % 4 + 2",
  "n": "n0 % (m - 1) + 1",
  "p": "m * m - n * n",
  "q": "2 * m * n",
  "h": "m * m + n * n",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```
After:
```json
{
  "p": "m0",
  "q": "n0",
  "h": "isqrt(p * p + q * q)",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```

## 8.10-model step 1 template 3 check

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
null
```
After:
```json
"h <= 41 and h * h == p * p + q * q"
```

## 8.10-model step 1 template 4 slots

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m0": "side",
  "n0": "side",
  "o": "side"
}
```
After:
```json
{
  "m0": "leg",
  "n0": "leg",
  "o": "side"
}
```

## 8.10-model step 1 template 4 derived

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
{
  "m": "m0 % 4 + 2",
  "n": "n0 % (m - 1) + 1",
  "p": "m * m - n * n",
  "q": "2 * m * n",
  "h": "m * m + n * n",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```
After:
```json
{
  "p": "m0",
  "q": "n0",
  "h": "isqrt(p * p + q * q)",
  "x": "(p, h, q)[o % 3]",
  "y": "(h, q, p)[o % 3]",
  "z": "(q, p, h)[o % 3]"
}
```

## 8.10-model step 1 template 4 check

The full U26 comparison exhausts the small right-triangle pool and substitutes shorter root questions on extra practice. Sample each leg from its own bounded list and derive the hypotenuse. The accepted pool contains all integer right triangles with sides from 3 to 41. This keeps v2 correct triangle dimensions and increases valid task coverage.

Before:
```json
null
```
After:
```json
"h <= 41 and h * h == p * p + q * q"
```

## 4.3-same-numerator step 2 template 1 slots

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "n": "numerator",
  "u1": "u1",
  "u2": "u2",
  "u3": "u3"
}
```
After:
```json
{
  "n": "numerator",
  "a": "denominator",
  "b": "denominator"
}
```

## 4.3-same-numerator step 2 template 1 derived

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "a0": "n + 1 + u1 % 5",
  "b0": "n + 6 + u2 % (7 - n)",
  "a": "a0 if u3 % 2 == 0 else b0",
  "b": "b0 if u3 % 2 == 0 else a0"
}
```
After:
```json
{}
```

## 4.3-same-numerator step 2 template 1 check

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
null
```
After:
```json
"a != b and n < a and n < b"
```

## 4.3-same-numerator step 2 template 3 slots

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "n": "numerator",
  "u1": "u1",
  "u2": "u2",
  "u3": "u3"
}
```
After:
```json
{
  "n": "numerator",
  "a": "denominator",
  "b": "denominator"
}
```

## 4.3-same-numerator step 2 template 3 derived

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "a0": "n + 1 + u1 % 5",
  "b0": "n + 6 + u2 % (7 - n)",
  "a": "a0 if u3 % 2 == 0 else b0",
  "b": "b0 if u3 % 2 == 0 else a0"
}
```
After:
```json
{}
```

## 4.3-same-numerator step 2 template 3 check

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
null
```
After:
```json
"a != b and n < a and n < b"
```

## 4.3-same-numerator step 2 template 4 slots

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "n": "numerator",
  "u1": "u1",
  "u2": "u2",
  "u3": "u3"
}
```
After:
```json
{
  "n": "numerator",
  "a": "denominator",
  "b": "denominator"
}
```

## 4.3-same-numerator step 2 template 4 derived

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
{
  "a0": "n + 1 + u1 % 5",
  "b0": "n + 6 + u2 % (7 - n)",
  "a": "a0 if u3 % 2 == 0 else b0",
  "b": "b0 if u3 % 2 == 0 else a0"
}
```
After:
```json
{}
```

## 4.3-same-numerator step 2 template 4 check

Quality domain fallback trial from the U14 full comparison at base 6d20e5ab. The narrower v2 denominator pairs change the review choices and lower minimum fullness from 47.0% to 45.7%. Restore the accepted v1 denominator sampling for easy comparison, medium story and true-false questions. Keep every v2 question, answer, format, difficulty and the corrected hard ordering key.

Before:
```json
null
```
After:
```json
"a != b and n < a and n < b"
```

## 3.1-estimate-quantity step 3 template 2 text

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
"{ask} Which is the more sensible guess: {p} or {q}?"
```
After:
```json
"{ask} Which guess is sensible: {p} or {q}?"
```

## 3.1-estimate-quantity step 3 template 2 derived

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'How many pencils fit in a pencil case?' if i == 0 else ('How many pages are in a picture book?' if i == 1 else ('How many grapes are in a small bunch?' if i == 2 else ('How many books fit on a classroom shelf?' if i == 3 else 'How many children are in a classroom?')))",
  "bad": "b * 10",
  "p": "b if flip == 0 else bad",
  "q": "bad if flip == 0 else b"
}
```
After:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'Pencils in a pencil case.' if i == 0 else ('Pages in a picture book.' if i == 1 else ('Grapes in a small bunch.' if i == 2 else ('Books on a classroom shelf.' if i == 3 else 'Children in a classroom.')))",
  "bad": "b * 10",
  "p": "b if flip == 0 else bad",
  "q": "bad if flip == 0 else b"
}
```

## 3.1-estimate-quantity step 3 template 4 text

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
"{ask} Which is the most sensible guess: {p}, {q} or {r}?"
```
After:
```json
"{ask} Which guess is sensible: {p}, {q} or {r}?"
```

## 3.1-estimate-quantity step 3 template 4 derived

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'How many pencils fit in a pencil case?' if i == 0 else ('How many pages are in a picture book?' if i == 1 else ('How many grapes are in a small bunch?' if i == 2 else ('How many books fit on a classroom shelf?' if i == 3 else 'How many children are in a classroom?')))",
  "bad": "b * 10",
  "t10": "b * 10",
  "h100": "b * 100",
  "p": "b if pos == 0 else (h100 if pos == 1 else t10)",
  "q": "t10 if pos == 0 else (b if pos == 1 else h100)",
  "r": "h100 if pos == 0 else (t10 if pos == 1 else b)"
}
```
After:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'Pencils in a pencil case.' if i == 0 else ('Pages in a picture book.' if i == 1 else ('Grapes in a small bunch.' if i == 2 else ('Books on a classroom shelf.' if i == 3 else 'Children in a classroom.')))",
  "bad": "b * 10",
  "t10": "b * 10",
  "h100": "b * 100",
  "p": "b if pos == 0 else (h100 if pos == 1 else t10)",
  "q": "t10 if pos == 0 else (b if pos == 1 else h100)",
  "r": "h100 if pos == 0 else (t10 if pos == 1 else b)"
}
```

## 3.1-estimate-quantity step 3 template 6 text

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
"{ask} Which guess is the least sensible: {p}, {q} or {r}?"
```
After:
```json
"{ask} Which guess is least sensible: {p}, {q} or {r}?"
```

## 3.1-estimate-quantity step 3 template 6 derived

The matched U10 full book reaches the page minimum counts but takes 30.8 estimated minutes on Day 10. Shorten the repeated estimate prompt while keeping all contexts, numbers, answer expressions, formats and difficulty tags. Each question still asks for the same sensible or least sensible estimate.

Before:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'How many pencils fit in a pencil case?' if i == 0 else ('How many pages are in a picture book?' if i == 1 else ('How many grapes are in a small bunch?' if i == 2 else ('How many books fit on a classroom shelf?' if i == 3 else 'How many children are in a classroom?')))",
  "bad": "b * 10",
  "t10": "b * 10",
  "h100": "b * 100",
  "p": "b if pos == 0 else (h100 if pos == 1 else t10)",
  "q": "t10 if pos == 0 else (b if pos == 1 else h100)",
  "r": "h100 if pos == 0 else (t10 if pos == 1 else b)"
}
```
After:
```json
{
  "i": "x % 5",
  "v": "x // 5 % 8",
  "b": "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
  "what": "'pencils fit in a pencil case' if i == 0 else ('pages are in a picture book' if i == 1 else ('grapes are in a small bunch' if i == 2 else ('books fit on a classroom shelf' if i == 3 else 'children are in a classroom')))",
  "ask": "'Pencils in a pencil case.' if i == 0 else ('Pages in a picture book.' if i == 1 else ('Grapes in a small bunch.' if i == 2 else ('Books on a classroom shelf.' if i == 3 else 'Children in a classroom.')))",
  "bad": "b * 10",
  "t10": "b * 10",
  "h100": "b * 100",
  "p": "b if pos == 0 else (h100 if pos == 1 else t10)",
  "q": "t10 if pos == 0 else (b if pos == 1 else h100)",
  "r": "h100 if pos == 0 else (t10 if pos == 1 else b)"
}
```

## 3.6-increasing-pattern step 1 template 1 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"Start at {a}. Add {d} each time. What is the next number?"
```
After:
```json
"Start at {a}. Add {d}. What comes next?"
```

## 3.6-increasing-pattern step 1 template 3 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"Start at {a}, add {d} each time. Number {n} in the pattern is __ (The start is number 1.)"
```
After:
```json
"Number 1 is {a}. Add {d} each time. Number {n} is __."
```

## 3.6-increasing-pattern step 1 template 4 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"True or false: start at {a}, add {d} each time. Number {n} in the pattern is {shown}. (The start is number 1.)"
```
After:
```json
"Number 1 is {a}. Add {d} each time. True or false: number {n} is {shown}."
```

## 3.6-decreasing-pattern step 1 template 1 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"Start at {a}. Take away {d} each time. What is the next number?"
```
After:
```json
"Start at {a}. Take away {d}. What comes next?"
```

## 3.6-decreasing-pattern step 1 template 3 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"Start at {a}, take away {d} each time. Number {n} in the pattern is __ (The start is number 1.)"
```
After:
```json
"Number 1 is {a}. Take away {d} each time. Number {n} is __."
```

## 3.6-decreasing-pattern step 1 template 4 text

The U10 full-book estimate remains 30.2 minutes after shortening estimation prompts. State the first pattern position directly and remove repeated wording. Keep the start, increment, target position, answer, format and difficulty. This preserves the one-based pattern rule and reduces reading time.

Before:
```json
"True or false: start at {a}, take away {d} each time. Number {n} in the pattern is {shown}. (The start is number 1.)"
```
After:
```json
"Number 1 is {a}. Take away {d} each time. True or false: number {n} is {shown}."
```

## 4.4-add-within-10000 step 5 template 2 difficulty

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"medium"
```
After:
```json
"easy"
```

## 4.4-add-within-10000 step 5 template 3 difficulty

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"easy"
```
After:
```json
"medium"
```

## 4.4-add-within-10000 step 5 template 3 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{name} has {a} {things}. {name} gets {b} more. How many {things} does {name} have now?"
```
After:
```json
"{name} has {a} {things}. {They} gets {b} more. How many {things} does {name} have now?"
```

## 4.4-add-within-10000 step 5 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{name} had some {things}. After getting {b} more, {name} had {s}. How many did {name} have at first?"
```
After:
```json
"{name} counts {a} {things} on Monday and {b} {things} on Friday. How many {things} in all?"
```

## 4.4-add-within-10000 step 5 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"a"
```
After:
```json
"a + b"
```

## 4.4-add-within-10000 step 5 template 5 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "u1": "u1",
  "u2": "u2",
  "u3": "u3",
  "u5": "u5",
  "u6": "u6",
  "u7": "u7",
  "flip": "flip"
}
```
After:
```json
{
  "u1": "u1",
  "u2": "u2",
  "u3": "u3",
  "u4": "u4",
  "u5": "u5",
  "u6": "u6",
  "u7": "u7",
  "u8": "u8",
  "flip": "flip"
}
```

## 4.4-add-within-10000 step 5 template 5 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "A": "3000 + u1 * 250 + u2 * 25 + u3 * 2",
  "B": "2000 + u5 * 250 + u6 * 25 + u7 * 2",
  "a": "A",
  "b": "B",
  "s": "A + B",
  "tot": "s",
  "shown": "s if flip == 0 else s + 10",
  "sh": "shown",
  "w": "s - 10 * 10 ** (u1 % 3)"
}
```
After:
```json
{
  "A": "1000 + u1 * 400 + u2 * 40 + u3 * 4 + u4",
  "B": "1000 + u5 * 300 + u6 * 30 + u7 * 3 + u8",
  "a": "A",
  "b": "B",
  "s": "A + B",
  "tot": "s",
  "shown": "s if flip == 0 else s + 10",
  "sh": "shown"
}
```

## 4.4-add-within-10000 step 5 template 5 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"A + B <= 9999"
```

## 4.4-subtract-within-10000 step 5 template 1 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{ak} - {b} = __"
```
After:
```json
"{a} - {b} = __"
```

## 4.4-subtract-within-10000 step 5 template 1 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10",
  "ak": "'10 000'"
}
```
After:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10"
}
```

## 4.4-subtract-within-10000 step 5 template 2 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"Missing number: {ak} - __ = {d}"
```
After:
```json
"Missing number: {a} - __ = {d}"
```

## 4.4-subtract-within-10000 step 5 template 2 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10",
  "ak": "'10 000'"
}
```
After:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10"
}
```

## 4.4-subtract-within-10000 step 5 template 3 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{name} has {ak} {things} and gives {b} away. How many {things} are left?"
```
After:
```json
"{name} has {a} {things} and gives {b} away. How many {things} are left?"
```

## 4.4-subtract-within-10000 step 5 template 3 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10",
  "ak": "'10 000'"
}
```
After:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10"
}
```

## 4.4-subtract-within-10000 step 5 template 4 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"True or false: {ak} - {b} = {shown}."
```
After:
```json
"True or false: {a} - {b} = {shown}."
```

## 4.4-subtract-within-10000 step 5 template 4 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10",
  "ak": "'10 000'"
}
```
After:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10"
}
```

## 4.4-subtract-within-10000 step 5 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{name} has 10 000 {things}. {name} gives away {b} and then {c} more. How many are left?"
```
After:
```json
"A {container} holds {a} {things}. {name} takes out {b}. How many {things} are left in the {container}?"
```

## 4.4-subtract-within-10000 step 5 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"10000 - b - c"
```
After:
```json
"a - b"
```

## 4.4-subtract-within-10000 step 5 template 5 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "b0": "template_b0",
  "c0": "template_c0"
}
```
After:
```json
{
  "u1": "u1",
  "u2": "u2",
  "u3": "u3",
  "u4": "u4",
  "flip": "flip"
}
```

## 4.4-subtract-within-10000 step 5 template 5 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "b": "1 + b0 % 5000",
  "c": "1 + c0 % 4000"
}
```
After:
```json
{
  "A": "10000",
  "B": "1 + (u1 * 1000 + u2 * 100 + u3 * 10 + u4) % 9999",
  "a": "A",
  "b": "B",
  "d": "A - B",
  "shown": "d if flip == 0 else d + 10"
}
```

## 4.9-table-pattern step 3 template 2 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"{name} puts {m} {things} in each {container} and fills {p} of them. How many {things} in all?"
```
After:
```json
"{name} puts {m} {things} in each {container}. How many {things} in {p} {container}s?"
```

## 4.9-table-pattern step 3 template 5 format

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"bare"
```
After:
```json
"explain"
```

## 4.9-table-pattern step 3 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"The rule is multiply the position by {r}. How much bigger is the value at position {p} than the value at position {q}?"
```
After:
```json
"The rule is multiply by {m}. Why is the value at position {p} bigger than the value at position 1?"
```

## 4.9-table-pattern step 3 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"r * (p - q)"
```
After:
```json
"'Each position gives ' + str(m) + ' more'"
```

## 4.9-table-pattern step 3 template 5 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "r": "template_r",
  "p": "template_p",
  "q": "template_q"
}
```
After:
```json
{
  "m": "multiplier",
  "p": "position"
}
```

## 4.9-table-pattern step 3 template 5 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"p > 1"
```

## 5.1-place-value-million step 1 template 4 format

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"bare"
```
After:
```json
"true-false"
```

## 5.1-place-value-million step 1 template 4 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"Write the number with {a} in the ten thousands place, {b} in the hundreds place and {c} in the ones place. Every other place is 0."
```
After:
```json
"True or false: in {n}, the digit in the ten thousands place is bigger than the digit in the hundreds place."
```

## 5.1-place-value-million step 1 template 4 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"a * 10000 + b * 100 + c"
```
After:
```json
"'true' if n // 10000 % 10 > n // 100 % 10 else 'false'"
```

## 5.1-place-value-million step 1 template 4 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "a": "template_a",
  "b": "template_b",
  "c": "template_c"
}
```
After:
```json
{
  "n0": "value"
}
```

## 5.1-place-value-million step 1 template 4 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
{
  "n": "n0"
}
```

## 5.1-place-value-million step 1 template 4 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"'0' not in str(n)"
```

## 5.1-place-value-million step 1 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"True or false: in {n}, the digit in the ten thousands place is bigger than the digit in the hundreds place."
```
After:
```json
"True or false: in {n}, the digit in the thousands place is bigger than the digit in the hundreds place."
```

## 5.1-place-value-million step 1 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"'true' if n // 10000 % 10 > n // 100 % 10 else 'false'"
```
After:
```json
"'true' if n // 1000 % 10 > n // 100 % 10 else 'false'"
```

## 5.1-place-value-million step 2 template 4 format

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"bare"
```
After:
```json
"true-false"
```

## 5.1-place-value-million step 2 template 4 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"Write the number with {a} in the hundred thousands place, {b} in the thousands place and {c} in the tens place. Every other place is 0."
```
After:
```json
"True or false: in {n}, the digit in the ten thousands place is bigger than the digit in the thousands place."
```

## 5.1-place-value-million step 2 template 4 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"a * 100000 + b * 1000 + c * 10"
```
After:
```json
"'true' if n // 10000 % 10 > n // 1000 % 10 else 'false'"
```

## 5.1-place-value-million step 2 template 4 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "a": "template_a",
  "b": "template_b",
  "c": "template_c"
}
```
After:
```json
{
  "n0": "value"
}
```

## 5.1-place-value-million step 2 template 4 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
{
  "n": "n0"
}
```

## 5.1-place-value-million step 2 template 4 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"'0' not in str(n)"
```

## 5.1-place-value-million step 2 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"True or false: in {n}, the digit in the ten thousands place is bigger than the digit in the thousands place."
```
After:
```json
"True or false: in {n}, the digit in the thousands place is bigger than the digit in the hundreds place."
```

## 5.1-place-value-million step 2 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"'true' if n // 10000 % 10 > n // 1000 % 10 else 'false'"
```
After:
```json
"'true' if n // 1000 % 10 > n // 100 % 10 else 'false'"
```

## 5.9-multiply-tens step 1 template 1 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"b0 >= 10 and a0 >= 2"
```
After:
```json
"b0 >= 10"
```

## 5.9-multiply-tens step 1 template 2 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"b0 >= 10 and a >= 2 and b >= 2"
```
After:
```json
"b0 >= 10"
```

## 5.9-multiply-tens step 1 template 3 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"b0 >= 10 and a0 >= 2"
```
After:
```json
"b0 >= 10"
```

## 5.9-multiply-tens step 1 template 4 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"b0 >= 10 and a0 >= 2"
```
After:
```json
"b0 >= 10"
```

## 5.9-multiply-tens step 1 template 5 format

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"story"
```
After:
```json
"true-false"
```

## 5.9-multiply-tens step 1 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"A school orders {a} boxes of {b} pencils in the fall and {c} boxes of {b} pencils in the spring. How many pencils is that in all?"
```
After:
```json
"True or false: {a} × {b} = {c}."
```

## 5.9-multiply-tens step 1 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"(a + c) * b"
```
After:
```json
"'true' if f == 0 else 'false'"
```

## 5.9-multiply-tens step 1 template 5 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "a": "template_a",
  "c": "template_c",
  "b1": "template_b1"
}
```
After:
```json
{
  "a0": "operand1",
  "b0": "operand2",
  "f": "flip"
}
```

## 5.9-multiply-tens step 1 template 5 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "b": "b1 * 10"
}
```
After:
```json
{
  "a": "a0",
  "b": "b0 // 10 * 10",
  "c": "a * b if f == 0 else a * b + a"
}
```

## 5.9-multiply-tens step 1 template 5 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"b0 >= 10"
```

## 5.9-multiply-tens step 2 template 2 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"a0 >= 10 and b0 >= 10 and a >= 2 and b >= 2"
```
After:
```json
"a0 >= 10 and b0 >= 10"
```

## 5.9-multiply-tens step 2 template 5 format

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"story"
```
After:
```json
"true-false"
```

## 5.9-multiply-tens step 2 template 5 text

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"A stadium has {a} rows of {b} seats in the lower bowl and {c} rows of {d} seats in the upper bowl. How many seats is that in all?"
```
After:
```json
"True or false: {a} × {b} = {c}."
```

## 5.9-multiply-tens step 2 template 5 answer

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
"a * b + c * d"
```
After:
```json
"'true' if f == 0 else 'false'"
```

## 5.9-multiply-tens step 2 template 5 slots

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "a1": "template_a1",
  "b1": "template_b1",
  "c1": "template_c1",
  "d1": "template_d1"
}
```
After:
```json
{
  "a0": "operand1",
  "b0": "operand2",
  "f": "flip"
}
```

## 5.9-multiply-tens step 2 template 5 derived

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
{
  "a": "a1 * 10",
  "b": "b1 * 10",
  "c": "c1 * 10",
  "d": "d1 * 10"
}
```
After:
```json
{
  "a": "a0 // 10 * 10",
  "b": "b0 // 10 * 10",
  "c": "a * b if f == 0 else a * b + a"
}
```

## 5.9-multiply-tens step 2 template 5 check

Quality fallback from matched U16 runs at base 6d20e5ab. V2 lowered selected-day mean fullness from 73.04% to 72.36%. Keep the v1 content for this affected step. Retain all template positions and easy/hard coverage. In the two place-value steps, retain a distinct medium v2 comparison of thousands and hundreds beside the restored hard comparison. The combined seven-step fallback passes the selected-day comparison at 73.06%, with no failures, omissions or variety errors. Full-book and real checks remain required.

Before:
```json
undefined
```
After:
```json
"a0 >= 10 and b0 >= 10"
```

## 8.2-square-root step 1 template 4 text

Shorten the prompt to fit the three-line card or practice row. Keep every mathematical quantity, unit, answer, format and difficulty. The public U26 diagnostic removed a valid Challenge because another card used four lines; the shortened prompt retains that card.

Before:
```json
"True or false: a square with sides of {s} m has an area bigger than {a} m²."
```
After:
```json
"Square side {s} m. True or false: its area > {a} m²."
```

## 8.2-cube-root step 1 template 4 text

Shorten the prompt to fit the three-line card or practice row. Keep every mathematical quantity, unit, answer, format and difficulty. The public U26 diagnostic removed a valid Challenge because another card used four lines; the shortened prompt retains that card.

Before:
```json
"True or false: a cube with edges of {e} cm has a volume bigger than {v} cm³."
```
After:
```json
"Cube edge {e} cm. True or false: its volume > {v} cm³."
```

## 8.10-model step 1 template 3 text

Shorten the prompt to fit the three-line card or practice row. Keep every mathematical quantity, unit, answer, format and difficulty. The public U26 diagnostic removed a valid Challenge because another card used four lines; the shortened prompt retains that card.

Before:
```json
"{name} cuts a right triangle from paper with sides {x}, {y} and {z} cm. Which side is the shortest? Write its length."
```
After:
```json
"{name}'s paper right triangle: {x}, {y}, {z} cm. Shortest side length?"
```

## 8.10-model step 1 template 4 format

Restore the original v2 walk calculation after shortening its prompt. Keep the valid triangle dimensions, original story format, p + q answer and hard difficulty. The interim v1 hypotenuse fallback is no longer active.

Before:
```json
"choose"
```
After:
```json
"story"
```

## 8.10-model step 1 template 4 text

Restore the original v2 walk calculation after shortening its prompt. Keep the valid triangle dimensions, original story format, p + q answer and hard difficulty. The interim v1 hypotenuse fallback is no longer active.

Before:
```json
"Which side is across from the right angle in a right triangle with sides {x}, {y} and {z}? Write its length."
```
After:
```json
"A right-angle walk has legs {p} m and {q} m. Total distance?"
```

## 8.10-model step 1 template 4 answer

Restore the original v2 walk calculation after shortening its prompt. Keep the valid triangle dimensions, original story format, p + q answer and hard difficulty. The interim v1 hypotenuse fallback is no longer active.

Before:
```json
"h"
```
After:
```json
"p + q"
```

## 5.9-distributive step 2 template 1 check

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"a0 >= 100 and a % 10 != 0 and a // 100 >= 2"
```
After:
```json
"a0 >= 100"
```

## 5.9-distributive step 2 template 2 check

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"a0 >= 100 and a >= 2 and b >= 2 and a % 10 != 0 and a // 100 >= 2"
```
After:
```json
"a0 >= 100"
```

## 5.9-distributive step 2 template 3 check

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"a0 >= 100 and a % 10 != 0 and a // 100 >= 2"
```
After:
```json
"a0 >= 100"
```

## 5.9-distributive step 2 template 4 check

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"a0 >= 100 and a % 10 != 0 and a // 100 >= 2"
```
After:
```json
"a0 >= 100"
```

## 5.9-distributive step 2 template 5 format

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"story"
```
After:
```json
"true-false"
```

## 5.9-distributive step 2 template 5 text

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"A school buys {a} boxes of {n} pencils and gives away {g}. How many pencils are left?"
```
After:
```json
"True or false: {a} × {b} = {c}."
```

## 5.9-distributive step 2 template 5 answer

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"n * a - g"
```
After:
```json
"'true' if f == 0 else 'false'"
```

## 5.9-distributive step 2 template 5 slots

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{
  "a": "template_a",
  "x": "template_x",
  "y": "template_y",
  "g0": "template_g0"
}
```
After:
```json
{
  "a0": "operand1",
  "b0": "operand2",
  "f": "flip"
}
```

## 5.9-distributive step 2 template 5 derived

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{
  "n": "x * 100 + y",
  "g": "1 + g0 % min(200, n * a - 1)"
}
```
After:
```json
{
  "a": "a0 // 100 * 100 + a0 % 10",
  "b": "b0",
  "c": "a * b if f == 0 else a * b + a"
}
```

## 5.9-distributive step 2 template 5 check

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
(absent)
```
After:
```json
"a0 >= 100"
```

## 5.10-pattern-rule step 1 template 1 derived

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{}
```
After:
```json
(absent)
```

## 5.10-pattern-rule step 1 template 2 derived

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{}
```
After:
```json
(absent)
```

## 5.10-pattern-rule step 1 template 4 format

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"bare"
```
After:
```json
"true-false"
```

## 5.10-pattern-rule step 1 template 4 text

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"A pattern adds the same number each time. Its 2nd term is {t2} and its 5th term is {t5}. What number does it add each time?"
```
After:
```json
"True or false: starting at {s} and adding {d}, the 3rd term is {t}."
```

## 5.10-pattern-rule step 1 template 4 answer

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
"d"
```
After:
```json
"'true' if f == 0 else 'false'"
```

## 5.10-pattern-rule step 1 template 4 slots

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{
  "s": "template_s",
  "d": "template_d"
}
```
After:
```json
{
  "s": "start",
  "d": "step",
  "f": "flip"
}
```

## 5.10-pattern-rule step 1 template 4 derived

Retain the v1 content for this step after the matched full U16 comparison. The prior candidate reduced mean fullness from 74.734% to 74.585%. These two step fallbacks restore mean fullness to 74.773%, with the same minimum fullness and no failures, omissions, fit errors or variety errors. The selected-day comparison also passes. Keep every template position.

Before:
```json
{
  "t2": "s + d",
  "t5": "s + 4 * d"
}
```
After:
```json
{
  "t": "s + 2 * d if f == 0 else s + 2 * d + 1 + d % 4"
}
```

## 4.5-multiply-1-digit step 1 template 5 text

Shorten the hard multiplication-plus-loose-items story so it fits the test card. On base 5151b73f, U14 selected Day 10 fell back to a medium comparison with small numbers and failed the progression check. The shorter story keeps a * b + c, its quantities, format and hard difficulty; the selected-day run has no fit or progression errors.

Before:
```json
"{name} buys {b} packs with {a} {things} in each pack, plus {c} loose {things}. How many {things} in all?"
```
After:
```json
"{name} buys {b} packs of {a} {things}, plus {c} loose ones. How many?"
```

## 5.1-place-value-million step 3 template 4 format

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
"bare"
```
After:
```json
"true-false"
```

## 5.1-place-value-million step 3 template 4 text

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
"In {n}, the digit in the thousands place is 0. If that 0 were changed to {k}, how much bigger would the number become?"
```
After:
```json
"True or false: in {n}, the digit in the hundreds place is bigger than the digit in the tens place."
```

## 5.1-place-value-million step 3 template 4 answer

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
"k * 1000"
```
After:
```json
"'true' if n // 100 % 10 > n // 10 % 10 else 'false'"
```

## 5.1-place-value-million step 3 template 4 slots

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
{
  "a": "template_a",
  "b": "template_b",
  "c": "template_c",
  "d": "template_d",
  "e": "template_e",
  "k": "template_k"
}
```
After:
```json
{
  "n0": "value"
}
```

## 5.1-place-value-million step 3 template 4 derived

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
{
  "n": "a * 100000 + b * 10000 + c * 100 + d * 10 + e"
}
```
After:
```json
{
  "n": "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)"
}
```

## 5.1-place-value-million step 3 template 5 text

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
"True or false: in {n}, the digit in the hundreds place is bigger than the digit in the tens place."
```
After:
```json
"True or false: in {n}, the digit in the ten thousands place is bigger than the digit in the hundreds place."
```

## 5.1-place-value-million step 3 template 5 answer

Retain the v1 hard comparison at this step after the matched full U16 comparison on base 5151b73f. The prior candidate reduced mean fullness from 73.857% to 73.767%. This fallback restores it to 74.032%, with the same minimum fullness and zero failures, omissions, fit errors and variety errors. The selected-day comparison also passes. Keep all five template positions; the distinct medium comparison uses the ten thousands and hundreds places.

Before:
```json
"'true' if n // 100 % 10 > n // 10 % 10 else 'false'"
```
After:
```json
"'true' if n // 10000 % 10 > n // 100 % 10 else 'false'"
```

## 3.1-estimate-quantity step 2 template 4 slots

The matched U10 selected-day comparison reduced minimum fullness from 50.64% to 49.18% with v2 estimate templates. Restore this step from patched v1. Trial r37 passes both the selected-day and full-book comparisons with no worse failures, omissions, fullness, render errors or variety. Keep all six template positions and easy and hard coverage.

Before:
```json
{
  "g": "group_size",
  "n": "groups",
  "f": "template_f"
}
```
After:
```json
{
  "g": "group_size",
  "n": "groups",
  "f": "template_flip"
}
```

## 3.1-estimate-quantity step 2 template 6 difficulty

The matched U10 selected-day comparison reduced minimum fullness from 50.64% to 49.18% with v2 estimate templates. Restore this step from patched v1. Trial r37 passes both the selected-day and full-book comparisons with no worse failures, omissions, fullness, render errors or variety. Keep all six template positions and easy and hard coverage.

Before:
```json
"medium"
```
After:
```json
"hard"
```

## 3.1-estimate-quantity step 2 template 6 text

The matched U10 selected-day comparison reduced minimum fullness from 50.64% to 49.18% with v2 estimate templates. Restore this step from patched v1. Trial r37 passes both the selected-day and full-book comparisons with no worse failures, omissions, fullness, render errors or variety. Keep all six template positions and easy and hard coverage.

Before:
```json
"A pile looks like about {k} groups of {g}. Explain in one sentence: how do you estimate how many are in the pile?"
```
After:
```json
"Explain in one sentence: how can a group of {g} help you estimate a big pile?"
```

## 3.1-estimate-quantity step 2 template 6 slots

The matched U10 selected-day comparison reduced minimum fullness from 50.64% to 49.18% with v2 estimate templates. Restore this step from patched v1. Trial r37 passes both the selected-day and full-book comparisons with no worse failures, omissions, fullness, render errors or variety. Keep all six template positions and easy and hard coverage.

Before:
```json
{
  "g": "group_size",
  "k": "groups"
}
```
After:
```json
{
  "g": "group_size"
}
```

## 4.3-benchmarks step 1 template 5 text

The full U14 comparison could not print this hard story as a choice and fell back to an easier builder on Day 9. Use explicit A/B/C choices with the same sum-of-slices comparison. Permit equal pizzas for the greater-than-one case. The shorter prompt retains the story format and hard difficulty. Trial r50 passes the full U14 comparison with zero failed questions, omissions, fit failures or render errors.

Before:
```json
"A pizza is cut into {d} equal slices. {name} eats {a} of the slices and a friend eats {b} of the slices. Did they eat less than, exactly or more than one whole pizza?"
```
After:
```json
"Each pizza has {d} equal slices. {name} and a friend eat {a} and {b} slices. Choose: A) less than 1 pizza B) 1 pizza C) more than 1 pizza."
```

## 4.3-benchmarks step 1 template 5 answer

The full U14 comparison could not print this hard story as a choice and fell back to an easier builder on Day 9. Use explicit A/B/C choices with the same sum-of-slices comparison. Permit equal pizzas for the greater-than-one case. The shorter prompt retains the story format and hard difficulty. Trial r50 passes the full U14 comparison with zero failed questions, omissions, fit failures or render errors.

Before:
```json
"['less than one whole', 'exactly one whole', 'more than one whole'][k]"
```
After:
```json
"'A' if k == 0 else ('B' if k == 1 else 'C')"
```

## 3.1-place-value-1000 step 1 template 4 text

Retain the v1 medium choice template at position 4 after the matched selected-day U10 comparison lost mean fullness (72.2534% to 71.9931%). Keep the v2 hard place-value calculation. The restored choice passes both selected-day and full-book comparisons.

Before:
```json
"{q} in {n}: the {p1} digit or the {p2} digit?"
```
After:
```json
"Which is worth more in {n}: the hundreds digit or the tens digit?"
```

## 3.1-place-value-1000 step 1 template 4 answer

Retain the v1 medium choice template at position 4 after the matched selected-day U10 comparison lost mean fullness (72.2534% to 71.9931%). Keep the v2 hard place-value calculation. The restored choice passes both selected-day and full-book comparisons.

Before:
```json
"ans"
```
After:
```json
"'the hundreds digit'"
```

## 3.1-place-value-1000 step 1 template 4 slots

Retain the v1 medium choice template at position 4 after the matched selected-day U10 comparison lost mean fullness (72.2534% to 71.9931%). Keep the v2 hard place-value calculation. The restored choice passes both selected-day and full-book comparisons.

Before:
```json
{
  "n0": "number",
  "sv": "template_sv",
  "sw": "template_sw"
}
```
After:
```json
{
  "n0": "number"
}
```

## 3.1-place-value-1000 step 1 template 4 derived

Retain the v1 medium choice template at position 4 after the matched selected-day U10 comparison lost mean fullness (72.2534% to 71.9931%). Keep the v2 hard place-value calculation. The restored choice passes both selected-day and full-book comparisons.

Before:
```json
{
  "nh": "n0 // 100",
  "nt": "1 + n0 // 10 % 9",
  "no": "1 + n0 % 9",
  "n": "100 * nh + 10 * nt + no",
  "q": "'Which is worth more' if sv == 0 else 'Which is worth less'",
  "p1": "'hundreds' if sw == 0 else 'tens'",
  "p2": "'tens' if sw == 0 else 'hundreds'",
  "ans": "'the hundreds digit' if sv == 0 else 'the tens digit'"
}
```
After:
```json
{
  "nh": "n0 // 100",
  "nt": "1 + n0 // 10 % 9",
  "no": "1 + n0 % 9",
  "n": "100 * nh + 10 * nt + no"
}
```

## 8.1-identify-perfect step 3 template 1 slots

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
{
  "k": "number"
}
```
After:
```json
{
  "a": "number"
}
```

## 8.1-identify-perfect step 3 template 1 derived

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
{
  "r": "k % 10 + 1",
  "m": "(k // 10) % 4",
  "a": "r * r if m == 0 else (r ** 3 if m == 1 else ((k % 3 + 1) ** 6 if m == 2 else k))"
}
```
After:
```json
(absent)
```

## 8.2-cube-root step 3 template 3 answer

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
"'√' + str(A) if p > q else '∛' + str(v)"
```
After:
```json
"'the square root' if p > q else 'the cube root'"
```

## 8.2-cube-root step 3 template 3 check

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
"p != q and p >= 3 and q >= 3"
```
After:
```json
"p != q"
```

## 8.2-cube-root step 3 template 4 text

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
"A cube-shaped bin holds {V} cm³. What is the total area of its six faces, in cm²?"
```
After:
```json
"A cube-shaped {container} has edges of {e} cm. What is the total area of its six faces in cm²?"
```

## 8.2-cube-root step 3 template 4 answer

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
"6 * e * e"
```
After:
```json
"6*e*e"
```

## 8.2-cube-root step 3 template 4 slots

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
{
  "e": "template_e"
}
```
After:
```json
{
  "e": "edge"
}
```

## 8.2-cube-root step 3 template 4 derived

Retain v1 template content and its named number domains after the matched U26 comparisons lost review questions and mean fullness. These two steps pass the selected-day and full-book comparisons together. Keep every v2 template position, easy coverage and hard coverage. Do not restore invalid v1 triangle dimensions.

Before:
```json
{
  "V": "e * e * e"
}
```
After:
```json
(absent)
```

## 8.4-rates step 3 template 1 text

Shorten the easy rate comparison while keeping the two distances, the two different times, the answer and the difficulty. The previous wording caused one extra Day 3 room omission in the full U26 book. This wording restores that review question and passes the selected-day and full-book comparisons.

Before:
```json
"Car A goes {d1} km in {k1} h. Car B goes {d2} km in {j1} h. Which is faster? Write A or B."
```
After:
```json
"Which is faster? A: {d1} km in {k1} h. B: {d2} km in {j1} h."
```

## 1.1-subitize-to-10 step 1 template 5 text

Replace an unprinted picture reference with a short description of the same quantities and operation. Keep the story format, hard difficulty, ranges, derived values and answer. The public Challenge test previously selected medium templates. This first rewrite still triggered the picture admission rule; the next entries record its correction.

Before:
```json
"(picture: a die showing {a} and a die showing {b}) How many dots in all?"
```
After:
```json
"One die shows {a} dots. Another shows {b} dots. How many dots in all?"
```

## 1.1-subitize-to-10 step 2 template 5 text

Replace an unprinted picture reference with a short description of the same quantities and operation. Keep the story format, hard difficulty, ranges, derived values and answer. The public Challenge test previously selected medium templates. This first rewrite still triggered the picture admission rule; the next entries record its correction.

Before:
```json
"(picture: ten-frame with {m} dots) How many empty squares are there?"
```
After:
```json
"A ten-frame has 10 squares. {m} squares have dots. How many squares are empty?"
```

## 1.1-subitize-to-10 step 3 template 5 text

Replace an unprinted picture reference with a short description of the same quantities and operation. Keep the story format, hard difficulty, ranges, derived values and answer. The public Challenge test previously selected medium templates. This first rewrite still triggered the picture admission rule; the next entries record its correction.

Before:
```json
"(picture: {w} dots, {p} of them circled) {name} says {claim} are not circled. Is that right? If not, write the right number."
```
After:
```json
"{name} has {w} counters and covers {p}. {name} says {claim} are uncovered. Is that right? If not, write the right number."
```

## 1.1-subitize-to-10 step 1 template 5 text

Use numbers, full spaces and beads in the text-only version. The first rewrite still named dots or counters, which the public picture admission rule rejects. Keep every mathematical quantity, answer, story format and hard difficulty.

Before:
```json
"One die shows {a} dots. Another shows {b} dots. How many dots in all?"
```
After:
```json
"One die has the number {a}. Another has the number {b}. What is the total?"
```

## 1.1-subitize-to-10 step 2 template 5 text

Use numbers, full spaces and beads in the text-only version. The first rewrite still named dots or counters, which the public picture admission rule rejects. Keep every mathematical quantity, answer, story format and hard difficulty.

Before:
```json
"A ten-frame has 10 squares. {m} squares have dots. How many squares are empty?"
```
After:
```json
"A ten-frame has 10 spaces. {m} spaces are full. How many spaces are empty?"
```

## 1.1-subitize-to-10 step 3 template 5 text

Use numbers, full spaces and beads in the text-only version. The first rewrite still named dots or counters, which the public picture admission rule rejects. Keep every mathematical quantity, answer, story format and hard difficulty.

Before:
```json
"{name} has {w} counters and covers {p}. {name} says {claim} are uncovered. Is that right? If not, write the right number."
```
After:
```json
"{name} has {w} beads and covers {p}. {name} says {claim} are uncovered. Is that right? If not, write the right number."
```

## 1.1-subitize-to-10 step 1 template 5 format

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"story"
```
After:
```json
"true-false"
```

## 1.1-subitize-to-10 step 1 template 5 text

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"One die has the number {a}. Another has the number {b}. What is the total?"
```
After:
```json
"{name} counts {n} {things} and says {shown}. Is {name} right? Write true or false."
```

## 1.1-subitize-to-10 step 1 template 5 answer

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"a + b"
```
After:
```json
"'true' if flip == 0 else 'false'"
```

## 1.1-subitize-to-10 step 1 template 5 slots

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
{
  "m": "count"
}
```
After:
```json
{
  "n": "count",
  "flip": "flip"
}
```

## 1.1-subitize-to-10 step 1 template 5 derived

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
{
  "a": "m - 4",
  "b": "1 + m % 4"
}
```
After:
```json
{
  "shown": "(n) if flip == 0 else ((n) + 1 if (n) < 8 else (n) - 1)"
}
```

## 1.1-subitize-to-10 step 1 template 5 check

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
(absent)
```
After:
```json
"n >= 2"
```

## 1.1-subitize-to-10 step 2 template 5 format

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"story"
```
After:
```json
"true-false"
```

## 1.1-subitize-to-10 step 2 template 5 text

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"A ten-frame has 10 spaces. {m} spaces are full. How many spaces are empty?"
```
After:
```json
"{name} counts {n} {things} and says {shown}. Is {name} right? Write true or false."
```

## 1.1-subitize-to-10 step 2 template 5 answer

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"10 - m"
```
After:
```json
"'true' if flip == 0 else 'false'"
```

## 1.1-subitize-to-10 step 2 template 5 slots

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
{
  "m": "count"
}
```
After:
```json
{
  "n": "count",
  "flip": "flip"
}
```

## 1.1-subitize-to-10 step 2 template 5 derived

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
(absent)
```
After:
```json
{
  "shown": "(n) if flip == 0 else ((n) + 1 if (n) < 10 else (n) - 1)"
}
```

## 1.1-subitize-to-10 step 2 template 5 check

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
(absent)
```
After:
```json
"n >= 2"
```

## 1.1-subitize-to-10 step 3 template 5 text

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"{name} has {w} beads and covers {p}. {name} says {claim} are uncovered. Is that right? If not, write the right number."
```
After:
```json
"{name} picks {w} {foods}. {name} eats {p} of them. How many {foods} are left?"
```

## 1.1-subitize-to-10 step 3 template 5 answer

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"'yes' if f == 0 else str(right)"
```
After:
```json
"w - p"
```

## 1.1-subitize-to-10 step 3 template 5 slots

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
{
  "w": "whole",
  "p": "part",
  "f": "flip"
}
```
After:
```json
{
  "w": "whole",
  "p": "part"
}
```

## 1.1-subitize-to-10 step 3 template 5 derived

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
{
  "right": "w - p",
  "wrong": "w - p + 1",
  "claim": "right if f == 0 else wrong"
}
```
After:
```json
(absent)
```

## 1.1-subitize-to-10 step 3 template 5 check

The text-only hard v2 stories fill, but the matched U4 comparison reduced mean fullness from 81.9172% to 81.0021%. Retaining v1 hard content in steps 2 and 3 still gave 81.9046%. Retain the v1 hard template at position 5 in all three steps. This restores nine hard Challenge cards and passes every U4 regression metric. Keep the other v2 templates.

Before:
```json
"p < w and w >= 3"
```
After:
```json
"1 <= p < w and w >= 3 and w >= 2"
```

## 9.2-power-parts step 2 template 3 check

Exclude equal-valued swapped powers such as 4² and 2⁴. The question must have exactly one option with the value of its repeated product. Keep its format, difficulty and number ranges.

Before:
```json
"b != e"
```
After:
```json
"b != e and b ** e != e ** b"
```

## K3-make-10 step 3 template all mistakes

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
[
  {
    "answer": "4",
    "why": "repeats the number",
    "kind": "conceptual",
    "misconception": "known-as-unknown"
  }
]
```
After:
```json
[
  {
    "answer": "4",
    "why": "repeats the number",
    "kind": "careless",
    "misconception": null
  }
]
```

## K3-make-10 step 3 template 1 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"__ and {p} make {w}."
```
After:
```json
"{p} and __ make {w}."
```

## K3-make-10 step 3 template 4 format

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"story"
```
After:
```json
"missing"
```

## K3-make-10 step 3 template 4 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"{name} has some {things}, gets {p} more, and has {w} in all. How many did {name} start with?"
```
After:
```json
"__ and {p} make {w}."
```

## K3-make-10 step 3 template 4 check

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"p < w and p >= 2"
```
After:
```json
"p <= w"
```

## K3-make-10 step 3 template 5 format

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"choose"
```
After:
```json
"story"
```

## K3-make-10 step 3 template 5 difficulty

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"medium"
```
After:
```json
"hard"
```

## K3-make-10 step 3 template 5 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"__ and {p} make {w}. Which is right? A) {x}  B) {y}"
```
After:
```json
"{name} has {p} {things} and wants {w}. How many more?"
```

## K3-make-10 step 3 template 5 answer

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"'A' if f == 0 else 'B'"
```
After:
```json
"w - p"
```

## K3-make-10 step 3 template 5 slots

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
{
  "p": "part",
  "w": "whole",
  "f": "flip"
}
```
After:
```json
{
  "p": "part",
  "w": "whole"
}
```

## K3-make-10 step 3 template 5 derived

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
{
  "r": "w - p",
  "v": "r + 1 if r < w else r - 1",
  "x": "r if f == 0 else v",
  "y": "v if f == 0 else r"
}
```
After:
```json
(absent)
```

## K3-make-10 step 3 template 5 check

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"p <= w"
```
After:
```json
"p < w"
```

## 1.1-subitize-to-10 step 1 template 3 format

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"picture"
```
After:
```json
"story"
```

## 1.1-subitize-to-10 step 1 template 3 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"(picture: {n} dots in two rows) How many dots?"
```
After:
```json
"{name} has {n} {things}. {name} gets 1 more. How many {things} now?"
```

## 1.1-subitize-to-10 step 1 template 3 answer

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"n"
```
After:
```json
"n + 1"
```

## 1.1-subitize-to-10 step 1 template 3 check

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"n >= 2"
```
After:
```json
"n + 1 <= 9 and n >= 2"
```

## 1.1-subitize-to-10 step 2 template 3 format

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"picture"
```
After:
```json
"story"
```

## 1.1-subitize-to-10 step 2 template 3 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"(picture: a ten-frame with {n} dots) How many dots?"
```
After:
```json
"{name} has {n} {things}. {name} gets 1 more. How many {things} now?"
```

## 1.1-subitize-to-10 step 2 template 3 answer

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"n"
```
After:
```json
"n + 1"
```

## 1.1-subitize-to-10 step 2 template 3 check

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"n >= 2"
```
After:
```json
"n + 1 <= 11 and n >= 2"
```

## 1.1-subitize-to-10 step 3 template 3 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"{name} has {w} {things}. {p} of them {be} red and the rest are blue. How many are blue?"
```
After:
```json
"{name} has {w} {things}. {p} are red and the rest are blue. How many are blue?"
```

## 1.1-subitize-to-10 step 3 template 3 derived

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
{
  "be": "'is' if p == 1 else 'are'"
}
```
After:
```json
(absent)
```

## 1.2-decompose-within-10 step 1 template 1 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"{w} = {p} + __"
```
After:
```json
"{w} is {p} and __"
```

## 1.2-decompose-within-10 step 1 template 2 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"True or false: {w} = {p} + {q}."
```
After:
```json
"True or false: {p} and {q} make {w}."
```

## 1.2-decompose-within-10 step 1 template 4 text

On base 24751f16, the matched U4 v2 sample reduced minimum fullness from 63.0372% to 60.5730% and mean fullness from 85.1544% to 84.1313%. Retain the v1 make-10 step 3, the medium story at subitize templates 3, and the missing/true-false/choice content at decompose step 1 templates 1, 2 and 4. This group restores minimum fullness to 67.0487% and mean to 85.3161%, with zero failures, omissions, render errors or variety issues. Keep the remaining v2 content, every template position and easy/hard coverage.

Before:
```json
"{w} = __ + {p}. Which goes in the blank: {x} or {y}?"
```
After:
```json
"{w} is {p} and which number: {x} or {y}?"
```

## Unica Challenge templates (2026-11-03)

Savar approved writing hard Challenge templates for the U16 day steps that had too few, so that every U16 day prints 3 Challenge cards that are harder than its practice (D-228; Codex at 24751f16, B3). Cedric's data is unchanged: the templates live in `src/lib/workbook-curriculum/house-templates.ts` and are appended to their steps when the curriculum loads. Each has a number answer, takes two steps, and keeps its numbers in the step's range (top half for Show what you know). None repeats a v2 hard template.

| Skill | Step | Format | Template | Answer |
|---|---:|---|---|---|
| 5.1-place-value-million | 1 | missing | `{n} + 1000 + 100 = __` | `n + 1100` |
| 5.1-place-value-million | 1 | bare | `In {n}, what is the value of the thousands digit plus the value of the tens digit?` | `n // 1000 % 10 * 1000 + n // 10 % 10 * 10` |
| 5.1-place-value-million | 1 | story | `{name}'s bike lock code is {n}. {They} adds 1000 to it, then takes 10 off. What is the new code?` | `n + 990` |
| 5.1-place-value-million | 2 | missing | `{n} + 10000 + 1000 = __` | `n + 11000` |
| 5.1-place-value-million | 2 | bare | `What is the value of the ten thousands digit of {n} plus the value of its hundreds digit?` | `n // 10000 % 10 * 10000 + n // 100 % 10 * 100` |
| 5.1-place-value-million | 2 | story | `{name}'s town has {n} people. {add} people move in and 1000 people move away. How many people live in the town now?` | `n + add - 1000` |
| 5.1-place-value-million | 3 | missing | `{n} + 100 + 10 = __` | `n + 110` |
| 5.1-place-value-million | 3 | bare | `In {n}, what is the value of the hundred thousands digit plus the value of the thousands digit?` | `n // 100000 % 10 * 100000 + n // 1000 % 10 * 1000` |
| 5.1-place-value-million | 3 | story | `{name}'s school collects {n} cans for recycling. It collects {add} more and sends 100 away. How many cans does the school have now?` | `n + add - 100` |
| 5.9-multiply-tens | 1 | bare | `What is {a} × {b} + {a} × {c}?` | `a * (b + c)` |
| 5.9-multiply-tens | 1 | missing | `{a} × __ = {p} - {q}` | `b` |
| 5.9-multiply-tens | 1 | story | `{name}'s shop has {a} boxes with {b} {things} in each. It sells {c} {things}. How many {things} are left?` | `a * b - c` |
| 5.9-multiply-tens | 2 | bare | `What is {a} × {b} - {c}?` | `a * b - c` |
| 5.9-multiply-tens | 2 | missing | `__ × {a} = {p} + {q}` | `b` |
| 5.9-multiply-tens | 2 | story | `{name}'s school orders {a} boxes with {b} {things} in each. It gives away {c} {things}. How many {things} does the school have now?` | `a * b - c` |
| 5.9-multiply-tens | 3 | bare | `What is {a} × {b} + {c}?` | `a * b + c` |
| 5.9-multiply-tens | 3 | missing | `{p} - __ = {a} × {b}` | `c` |
| 5.9-multiply-tens | 3 | story | `{name}'s school sends {k} full buses of {a} people to a game, and {c} people leave early. How many people are still at the game?` | `a * k - c` |
| 5.9-multiply-tens | 3 | story | `A game gives {a} points for each level. {name} plays {k} levels, then loses {c} points. How many points does {name} have now?` | `a * k - c` |
| 5.9-distributive | 1 | bare | `What is {a} × {b} - {c}?` | `a * b - c` |
| 5.9-distributive | 1 | missing | `{a} × __ = {p} + {q}` | `b` |
| 5.9-distributive | 2 | bare | `What is {a} × {b} + {c}?` | `a * b + c` |
| 5.9-distributive | 2 | missing | `__ × {b} = {p} - {q}` | `a` |
| 5.9-distributive | 2 | story | `{name}'s farm packs {a} eggs each day for {b} days. It sells {c} eggs. How many eggs does the farm have now?` | `a * b - c` |
| 5.10-pattern-rule | 1 | bare | `A pattern starts at {s} and adds {d} each time. What is its 8th term plus its 2nd term?` | `2 * s + 8 * d` |
| 5.10-pattern-rule | 1 | missing | `A pattern starts at {s} and adds __ each time. Its 9th term is {t}.` | `d` |
| 5.10-pattern-rule | 1 | story | `{name} has {s} {things} and gets {d} more each day. How many {things} does {name} have after 8 days?` | `s + 8 * d` |

Code's two-step Challenge cards for U4 (Savar: the last fill of a short U4 Challenge) are made from each U4 number step's own range by `twoStepTemplates` in the same file, not stored here; likelihood steps get three cards that reason from a bag's cubes.

## Unica's shorter U4 wording (2026-11-04)

Savar confirmed 8 to 10 practice questions a page, so the wordiest templates a U4 book prints are shorter there (option A, Codex at e6d79b6a's B4 follow-up). Only the printed words change, and only in a U4 book: each keeps its slots, answer, difficulty and what it asks; the Kindergarten books keep Cedric's words. The rewrites live in `LEVEL_REWRITES` in `src/lib/workbook-curriculum/house-templates.ts`, and a test checks each still matches Cedric's text.

| Skill | Step | Template | Cedric's text | U4 text |
|---|---:|---:|---|---|
| K3-part-part-whole | 3 | 5 | `Out of {w} {things}, {name} puts {p} in a {container}. {name} says the rest is {claim}. Is that right? If not, say how many.` | `{w} {things}, {p} in a {container}. {name}: the rest is {claim}. Right? If not, fix it.` |
| K1-count-scattered | 3 | 4 | `{name} counts {c} {things} in a circle and says {a}. Is that right? If not, say the right number.` | `{c} {things} in a circle. {name} counts {a}. Right? If not, fix it.` |
| K1-write-numerals | 3 | 4 | `{name} wrote {a} for the number {n}. Is that right? If not, write the right number.` | `{name} writes {a} for {n}. Right? If not, fix it.` |
| K5-two-more-less | 3 | 5 | `{name} says 2 more than {s} is {claim}. Is that right? If not, say the right number.` | `{name} says 2 more than {s} is {claim}. Right? If not, fix it.` |
| K5-two-more-less | 3 | 3 | `{name} has {s} {things}. {name} gets 2 more. How many {things} does {name} have now?` | `{name} has {s} {things} and gets 2 more. How many {things} now?` |
| 1.1-subitize-to-10 | 3 | 3 | `{name} has {w} {things}. {p} are red and the rest are blue. How many are blue?` | `{name} has {w} {things}. {p} are red, the rest blue. How many blue?` |
| 1.10-likelihood-words | 1 | 4 | `{name} thinks about this: {ev}. Circle never, sometimes or always.` | `Think: {ev}. Circle never, sometimes or always.` |
| 1.10-likelihood-words | 1 | 1 | `{name} says {animals} can drive a car. Circle never, sometimes or always.` | `Can {animals} drive a car? Circle never, sometimes or always.` |
| 1.1-count-to-20 | 3 | 2 | `{name} counts down from {s} at the rink. What does {name} say next?` | `{name} counts down from {s}. What comes next?` |
| 1.2-decompose-within-10 | 1 | 3 | `{name} has {w} {things}. {p} of them {be} red and the rest are blue. How many are blue?` | `{w} {things}: {p} red, the rest blue. How many are blue?` |
| 1.2-decompose-within-10 | 2 | 3 | `{name} has {w} {things}. {p} of them {be} red and the rest are blue. How many are blue?` | `{w} {things}: {p} red, the rest blue. How many are blue?` |
| 1.2-decompose-within-10 | 3 | 3 | `{name} has {w} {things}. {p} of them {be} red and the rest are blue. How many are blue?` | `{w} {things}: {p} red, the rest blue. How many are blue?` |
| 1.2-decompose-within-10 | 1 | 5 | `{name} says {w} is {a} and {claim}. Is that right? If not, write what goes with {a}.` | `{name} says {w} is {a} and {claim}. Right? If not, fix it.` |
| 1.2-decompose-within-10 | 2 | 5 | `{name} says {w} is {a} and {claim}. Is that right? If not, write what goes with {a}.` | `{name} says {w} is {a} and {claim}. Right? If not, fix it.` |
| 1.1-subitize-to-10 | 1 | 2 | `True or false: if you count {n} {things}, the last number you say is {shown}.` | `True or false: counting {n} {things}, you end on {shown}.` |
| 1.1-subitize-to-10 | 2 | 2 | `True or false: if you count {n} {things}, the last number you say is {shown}.` | `True or false: counting {n} {things}, you end on {shown}.` |
| 1.1-subitize-to-10 | 1 | 3 | `{name} has {n} {things}. {name} gets 1 more. How many {things} now?` | `{name} has {n} {things} and gets 1 more. How many {things} now?` |
| 1.1-subitize-to-10 | 2 | 3 | `{name} has {n} {things}. {name} gets 1 more. How many {things} now?` | `{name} has {n} {things} and gets 1 more. How many {things} now?` |
| 1.1-count-to-20 | 1 | 2 | `{name} counts {things}. {name} says {s}. What does {name} say next?` | `{name} counts {things} and says {s}. What comes next?` |
| 1.1-count-to-20 | 2 | 2 | `{name} counts {things}. {name} says {s}. What does {name} say next?` | `{name} counts {things} and says {s}. What comes next?` |
| 1.1-count-to-20 | 1 | 4 | `Which number comes right after {s}: {x} or {y}?` | `What comes after {s}: {x} or {y}?` |
| 1.1-count-to-20 | 2 | 4 | `Which number comes right after {s}: {x} or {y}?` | `What comes after {s}: {x} or {y}?` |
| 1.1-count-to-20 | 3 | 4 | `Which number comes right before {s}: {x} or {y}?` | `What comes before {s}: {x} or {y}?` |

## Workbook floor and seeded selection wording (2026-11-04)

These level-specific rewrites keep the source templates, answers, ranges and difficulty. The original source text stays unchanged for other levels. U4 uses the short part-part-whole form before checking whether a template can print. It keeps the same two parts, whole and missing position. The runtime source is `LEVEL_REWRITES` in `src/lib/workbook-curriculum/house-templates.ts`. The floor stays at 8. Answer boxes keep their size. Story text stays code-only.

### 5.1-place-value-million step 3 template 2

Before: "What is the value of the digit in the hundreds place of {n}?"

After: "{n}: value of the hundreds digit?"

Reason: Keep the hundreds-place value task, range and difficulty. Remove repeated words so a third question on the page own step fits before the planner takes earlier review work.

### K3-part-part-whole step 3 template 1

Before: "(picture: part {sa}, part {sb}, whole {sc}) Find the missing number."

After: "Parts {sa}, {sb}. Whole {sc}."

Reason: Print the same parts, whole and missing position as a short number question instead of an unsupported picture note. Keep every value, answer and difficulty. This gives U4 capacity selection a shorter form of the same task.

### 1.1-count-to-20 step 1 template 1

Before: "Count on: {s}, __, __. What are the next two numbers?"

After: "Count on: {s}, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 2 template 1

Before: "Count on: {s}, __, __. What are the next two numbers?"

After: "Count on: {s}, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 1 template 5

Before: "Count on: {s}, __, __, __, __. Write the next four numbers."

After: "Count on: {s}, __, __, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 2 template 5

Before: "Count on: {s}, __, __, __, __. Write the next four numbers."

After: "Count on: {s}, __, __, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 3 template 1

Before: "Count back: {s}, __, __. What are the next two numbers?"

After: "Count back: {s}, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 3 template 5

Before: "Count back: {s}, __, __, __, __. Write the next four numbers."

After: "Count back: {s}, __, __, __, __."

Reason: The printed sequence already shows every answer blank. Keep the direction, start, number of terms and answers. Remove the repeated instruction so eight questions fit.

### 1.1-count-to-20 step 1 template 2

Before: "{name} counts {things} and says {s}. What comes next?"

After: "{name} counts {things}: {s}. What comes next?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-count-to-20 step 2 template 2

Before: "{name} counts {things} and says {s}. What comes next?"

After: "{name} counts {things}: {s}. What comes next?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-count-to-20 step 3 template 2

Before: "{name} counts down from {s}. What comes next?"

After: "{name} counts back: {s}. What comes next?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-count-to-20 step 1 template 4

Before: "What comes after {s}: {x} or {y}?"

After: "After {s}: {x} or {y}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-count-to-20 step 2 template 4

Before: "What comes after {s}: {x} or {y}?"

After: "After {s}: {x} or {y}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-count-to-20 step 3 template 4

Before: "What comes before {s}: {x} or {y}?"

After: "Before {s}: {x} or {y}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.1-subitize-to-10 step 3 template 3

Before: "{name} has {w} {things}. {p} are red, the rest blue. How many blue?"

After: "{w} {things}: {p} red, the rest blue. How many blue?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.10-likelihood-words step 1 template 1

Before: "Can {animals} drive a car? Circle never, sometimes or always."

After: "Can {animals} drive a car?"

Reason: Keep the event and its likelihood. The answer region already prints all three choices. Remove the repeated direction so eight questions fit at the U4 type size.

### 1.10-likelihood-words step 1 template 3

Before: "The sun will rise tomorrow. Circle never, sometimes or always."

After: "The sun will rise tomorrow. How often?"

Reason: Keep the event and its likelihood. The answer region already prints all three choices. Remove the repeated direction so eight questions fit at the U4 type size.

### 1.10-likelihood-words step 1 template 4

Before: "Think: {ev}. Circle never, sometimes or always."

After: "{ev}. How often?"

Reason: Keep the event and its likelihood. The answer region already prints all three choices. Remove the repeated direction so eight questions fit at the U4 type size.

### 1.10-likelihood-words step 1 template 5

Before: "{st}. Is that never, sometimes or always?"

After: "{st}. How often?"

Reason: Keep the event and its likelihood. The answer region already prints all three choices. Remove the repeated direction so eight questions fit at the U4 type size.

### K3-part-part-whole step 3 template 5

Before: "{w} {things}, {p} in a {container}. {name}: the rest is {claim}. Right? If not, fix it."

After: "{w} {things}. {p} put away. {claim} left out? Fix if wrong."

Reason: Keep the whole, the part put away and the claim to check. Ask about the things left out, so putting things away does not imply loss of ownership. Remove the repeated name and container detail.

### K3-make-10 step 3 template 5

Before: "{name} has {p} {things} and wants {w}. How many more?"

After: "{p} {things}. How many more make {w}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K5-two-more-less step 3 template 5

Before: "{name} says 2 more than {s} is {claim}. Right? If not, fix it."

After: "2 more than {s} is {claim}. Right? Fix if wrong."

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K1-write-numerals step 3 template 4

Before: "{name} writes {a} for {n}. Right? If not, fix it."

After: "{name} writes {a} for {n}. Right? Fix if wrong."

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.2-decompose-within-10 step 1 template 5

Before: "{name} says {w} is {a} and {claim}. Right? If not, fix it."

After: "{w} is {a} and {claim}. Right? Fix if wrong."

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### 1.2-decompose-within-10 step 2 template 5

Before: "{name} says {w} is {a} and {claim}. Right? If not, fix it."

After: "{w} is {a} and {claim}. Right? Fix if wrong."

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K5-two-more-less step 3 template 1

Before: "What is 2 more than {s}?"

After: "2 more than {s}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K1-number-sequence step 3 template 1

Before: "What comes just after {n}?"

After: "What comes after {n}?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K1-number-sequence step 3 template 4

Before: "What comes just before {n}? A) {x}  B) {y}"

After: "Before {n}? A) {x} B) {y}"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### K1-number-sequence step 3 template 5

Before: "{name} counts up and says {n}, then {m}. Which number did {name} skip?"

After: "{name} counts up: {n}, then {m}. What was skipped?"

Reason: Keep the numbers, answer, difficulty and task. Remove repeated names or words so eight questions fit at the U4 type size. Other levels keep their source text.

### U4 mixed-box page instruction

Before: "Fill in the missing numbers and write the answers in the boxes."

After: "Fill in the boxes."

Reason: Keep the instruction for both missing-number boxes and answer boxes. The shorter U4 instruction leaves room for the separate circle instruction and eight practice questions. Other levels keep their instruction. This changes code-owned page text in `workbook-generator.ts`, outside Cedric's template data.

## C2: printable mistake lines

These were the first C2 candidates. The review rejected shared corrections. Use the active data and the C2-R2 verification report below.

Add one Watch out pair to each active step mistake with a misconception id. The wrong move and fix are code-owned text. Pairs use plain words, contain at most 150 characters including the joining space, and need no illustration. Keep all existing answers, story text, default lines and template fields. Exact before and after mistake arrays are in `author-changes.json`.

| Skill | Step | Misconception | New wrong line | New fix line |
|---|---|---|---|---|
| K1-rote-count-10 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-rote-count-10 | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-rote-count-10 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| K1-count-objects | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-objects | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-objects | 3 | list-not-total | Give all the numbers you said. | Give the last number to say how many. |
| K1-how-many | 1 | next-not-asked | Say the next number after the count. | The last number you counted says how many. |
| K1-how-many | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-how-many | 3 | count-order | A new start makes a new total. | Count each thing once. The total stays the same. |
| K1-count-scattered | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-scattered | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-scattered | 3 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-conservation | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K1-conservation | 2 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K1-recognize-numerals | 1 | mirror-numeral | Turn a number around to name it. | Look at which way the number faces. |
| K1-recognize-numerals | 2 | mirror-numeral | Turn a number around to name it. | Look at which way the number faces. |
| K1-recognize-numerals | 3 | zero-is-number | Leave out 0 when there are none. | Use 0 to show none. |
| K1-write-numerals | 1 | mirror-numeral | Turn a number around to name it. | Look at which way the number faces. |
| K1-write-numerals | 2 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| K1-write-numerals | 3 | mirror-numeral | Turn a number around to name it. | Look at which way the number faces. |
| K1-match-set-numeral | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-match-set-numeral | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-out | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-count-out | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K1-number-sequence | 1 | A2 | Use the number before the blank again. | Follow the same rule into the blank. |
| K1-number-sequence | 2 | before-after | Use the number before for the number after. | Before is one less. After is one more. |
| K1-number-sequence | 3 | A2 | Use the number before the blank again. | Follow the same rule into the blank. |
| K1-order-numerals | 1 | number-order | Keep the numbers in the order given. | Put the numbers in the order asked for. |
| K1-order-numerals | 2 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K1-order-numerals | 3 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K4-spot-pattern | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-spot-pattern | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-spot-pattern | 3 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-extend-repeating | 1 | A2 | Use the number before the blank again. | Follow the same rule into the blank. |
| K4-extend-repeating | 2 | A2 | Use the number before the blank again. | Follow the same rule into the blank. |
| K4-extend-repeating | 3 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-missing-element | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-missing-element | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-missing-element | 3 | one-part | Check only one part. | Check every part, not just one. |
| K4-identify-core | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-identify-core | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-identify-core | 3 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-create-pattern | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-create-pattern | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-create-pattern | 3 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K4-represent-pattern | 3 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| K10-likelihood-words | 1 | likelihood-reversed | Something that can happen must happen often. | Some things happen more often than others. |
| K10-likelihood-words | 2 | wish-not-chance | What you want happens most often. | Think about what happens, not what you want. |
| K10-which-more-likely | 1 | wish-not-chance | What you want happens most often. | Think about what happens, not what you want. |
| K10-which-more-likely | 2 | wish-not-chance | What you want happens most often. | Think about what happens, not what you want. |
| K2-subitize-to-5 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K2-subitize-to-5 | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K2-subitize-to-5 | 3 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| K2-five-frame | 1 | frame-total | Fill every space when counting. | Use only as many spaces as the number says. |
| K2-five-frame | 2 | frame-total | Fill every space when counting. | Use only as many spaces as the number says. |
| K2-five-frame | 3 | frame-total | Fill every space when counting. | Use only as many spaces as the number says. |
| K2-subitize-parts | 1 | parts-joined | Write 2 and 3 together as 23. | Add the two parts: 2 + 3 = 5. |
| K2-subitize-parts | 2 | parts-joined | Write 2 and 3 together as 23. | Add the two parts: 2 + 3 = 5. |
| K2-subitize-parts | 3 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K2-make-5 | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K2-make-5 | 3 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K2-ways-to-make-5 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K2-ways-to-make-5 | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K2-ways-to-make-5 | 3 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K2-match-to-compare | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K2-match-to-compare | 2 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K2-match-to-compare | 3 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K2-compare-quantities | 2 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| K2-compare-quantities | 3 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K2-compare-numbers | 2 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K2-compare-numbers | 3 | zero-is-number | Leave out 0 when there are none. | Use 0 to show none. |
| K7-baseline | 1 | baseline | Compare lengths from different starts. | Put both starts in the same place. |
| K7-baseline | 2 | baseline | Compare lengths from different starts. | Put both starts in the same place. |
| K7-compare-length | 1 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K7-compare-mass-capacity | 1 | bigger-heavier | The bigger thing must weigh more. | Compare how much each thing weighs. |
| K7-compare-mass-capacity | 2 | balance-up | The side that goes up weighs more. | The side that goes down weighs more. |
| K7-compare-capacity | 1 | full-not-capacity | The fuller one must hold more. | Compare how much each can hold when full. |
| K8-positional-words | 1 | position-words | Top and bottom mean the same place. | Top is above. Bottom is below. |
| K8-positional-words | 2 | position-words | Top and bottom mean the same place. | Top is above. Bottom is below. |
| K8-describe-2d | 1 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| K8-describe-2d | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| K8-describe-3d | 1 | roll-slide | A shape can move in only one way. | Some shapes can both roll and slide. |
| K8-describe-3d | 2 | roll-slide | A shape can move in only one way. | Some shapes can both roll and slide. |
| K8-describe-3d | 3 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| K8-same-shape | 1 | shape-same-kind | A bigger shape needs a different name. | Size does not change the kind of shape. |
| K8-same-shape | 2 | shape-same-kind | A bigger shape needs a different name. | Size does not change the kind of shape. |
| K8-same-shape | 3 | shape-same-kind | A bigger shape needs a different name. | Size does not change the kind of shape. |
| K8-create-2d | 2 | one-part | Check only one part. | Check every part, not just one. |
| K8-shape-attributes | 1 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| K8-shape-attributes | 2 | roll-slide | A shape can move in only one way. | Some shapes can both roll and slide. |
| K3-ten-frame | 3 | frame-total | Fill every space when counting. | Use only as many spaces as the number says. |
| K3-benchmarks-5-10 | 1 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K3-benchmarks-5-10 | 2 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| K3-benchmarks-5-10 | 3 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| K3-decompose-to-10 | 3 | one-part | Check only one part. | Check every part, not just one. |
| K3-make-10 | 1 | frame-total | Fill every space when counting. | Use only as many spaces as the number says. |
| K3-part-part-whole | 1 | parts-joined | Write 2 and 3 together as 23. | Add the two parts: 2 + 3 = 5. |
| K5-one-more-less | 2 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K5-one-more-less | 3 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K5-two-more-less | 1 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| K5-two-more-less | 2 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| K5-two-more-less | 3 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| K5-add-on-change | 1 | one-part | Check only one part. | Check every part, not just one. |
| K5-add-on-change | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K5-add-on-change | 3 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K5-take-away-change | 1 | operation-swap | Add when you need to take away. | Check whether the amount grows or gets smaller. |
| K5-take-away-change | 2 | story-roles | Give a known part as the answer. | Check which part you need to find. |
| K5-take-away-change | 3 | operation-swap | Add when you need to take away. | Check whether the amount grows or gets smaller. |
| K5-build-and-change | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K5-build-and-change | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| K6-equal-sets | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| K6-equal-sets | 2 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| K6-equal-sets | 3 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| K6-balance | 1 | balance-up | The side that goes up weighs more. | The side that goes down weighs more. |
| K6-balance | 2 | balance-up | The side that goes up weighs more. | The side that goes down weighs more. |
| K6-make-equal | 1 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| K6-make-equal | 2 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| K9-make-graph | 1 | baseline | Compare lengths from different starts. | Put both starts in the same place. |
| K9-make-graph | 3 | one-part | Check only one part. | Check every part, not just one. |
| K9-count-in-graph | 2 | wrong-row | Read a different row from the one asked for. | Find the right label first, then count that row. |
| K9-count-in-graph | 3 | one-part | Check only one part. | Check every part, not just one. |
| K9-read-concrete-graph | 1 | wrong-row | Read a different row from the one asked for. | Find the right label first, then count that row. |
| K9-read-concrete-graph | 3 | wrong-row | Read a different row from the one asked for. | Find the right label first, then count that row. |
| K11-describe-coins | 1 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| K11-describe-coins | 2 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| K11-coin-attributes | 1 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| K11-coin-attributes | 2 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| K11-coin-attributes | 3 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| K11-role-play-purchase | 1 | parts-joined | Write 2 and 3 together as 23. | Add the two parts: 2 + 3 = 5. |
| K11-role-play-purchase | 2 | parts-joined | Write 2 and 3 together as 23. | Add the two parts: 2 + 3 = 5. |
| K11-role-play-purchase | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| K11-wants-needs | 1 | want-need | Wanting something makes it a need. | A need is something you must have to live. |
| K11-wants-needs | 2 | want-need | Wanting something makes it a need. | A need is something you must have to live. |
| 1.1-count-to-20 | 1 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 1.1-count-to-20 | 2 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 1.1-count-to-20 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.1-count-to-20 | 4 | before-after | Use the number before for the number after. | Before is one less. After is one more. |
| 1.1-read-write-20 | 1 | mirror-writing | Turn the number the other way. | Copy the number facing the same way. |
| 1.1-read-write-20 | 2 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 1.1-read-write-20 | 3 | teen-ty-confusion | Read sixteen as sixty. | Sixteen is 16. Sixty is 60. |
| 1.1-count-objects-20 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.1-count-objects-20 | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.1-count-objects-20 | 2 | one-part | Check only one part. | Check every part, not just one. |
| 1.1-count-objects-20 | 3 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.1-subitize-to-10 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.1-subitize-to-10 | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.1-subitize-to-10 | 3 | parts-side-by-side | Write the parts side by side. | Add the parts to find the total. |
| 1.1-count-on-back | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.1-count-on-back | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.1-count-on-back | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.1-count-on-back | 4 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 1.1-one-more-less-20 | 1 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| 1.1-skip-count-2-5 | 1 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 1.1-skip-count-2-5 | 2 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 1.1-skip-count-2-5 | 3 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 1.1-skip-count-2-5 | 4 | count-objects | Count groups but leave out their parts. | Count how many are in each group too. |
| 1.1-ten-and-ones | 1 | parts-side-by-side | Write the parts side by side. | Add the parts to find the total. |
| 1.1-number-line-20 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.1-compare-order-20 | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 1.2-decompose-within-10 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.2-decompose-within-10 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.2-ways-to-make-10 | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.2-partners-of-10 | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.2-partners-of-10 | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.2-benchmarks-10-20 | 1 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| 1.2-benchmarks-10-20 | 2 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| 1.10-likelihood-words | 2 | chance-reversed | Pick what happens less often as more often. | Compare what happens most often. |
| 1.3-meaning-of-addition | 1 | parts-side-by-side | Write the parts side by side. | Add the parts to find the total. |
| 1.3-meaning-of-addition | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.3-meaning-of-subtraction | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-meaning-of-subtraction | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-meaning-of-subtraction | 3 | subtract-order | Swap the numbers when taking away. | Start with the amount given, then take away. |
| 1.3-add-within-10 | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-add-within-10 | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-add-within-10 | 3 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 1.3-subtract-within-10 | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-subtract-within-10 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-subtract-within-10 | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-subtract-within-10 | 4 | zero-in-subtraction | Taking all away leaves the start number. | Taking all away leaves 0. |
| 1.3-count-on-back | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-count-on-back | 2 | count-on-smaller | Start with the smaller number and lose count. | Start with the bigger number. Count on the smaller. |
| 1.3-count-on-back | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-teen-add-subtract | 1 | parts-side-by-side | Write the parts side by side. | Add the parts to find the total. |
| 1.3-teen-add-subtract | 2 | ones-in-tens | Add ones to the tens. | Add ones to ones. Add tens to tens. |
| 1.3-teen-add-subtract | 3 | ten-dropped | Leave out the ten in a teen number. | Keep the ten and add the ones. |
| 1.3-make-10-to-add | 1 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 1.3-make-10-to-add | 2 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 1.3-make-10-to-add | 3 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 1.3-add-within-20 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-add-within-20 | 2 | near-double | Use the double and stop. | Check if you need one more or one less. |
| 1.3-add-within-20 | 3 | near-double | Use the double and stop. | Check if you need one more or one less. |
| 1.3-add-within-20 | 4 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 1.3-fact-families | 1 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.3-fact-families | 2 | subtract-order | Swap the numbers when taking away. | Start with the amount given, then take away. |
| 1.3-fact-families | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-subtract-within-20 | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.3-word-problems-10 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-10 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-10 | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.3-word-problems-10 | 4 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-10 | 5 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-10 | 6 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-20 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-20 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.3-word-problems-20 | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.5-describe-change | 1 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 1.5-describe-change | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.5-change-to-make-10 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.5-change-to-make-10 | 2 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 1.5-change-unknown | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.5-change-unknown | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 1.4-sorting-rule | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 1.4-extend-repeating | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 1.4-extend-repeating | 2 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 1.4-describe-core | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 1.4-describe-core | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 1.4-translate-pattern | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 1.4-translate-pattern | 2 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 1.4-predict-element | 1 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 1.4-predict-element | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 1.6-equal-or-not | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 1.6-equal-or-not | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.6-record-equal-not-equal | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 1.6-record-equal-not-equal | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.6-equal-sums | 1 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.6-equal-sums | 2 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 1.6-balance-sides | 1 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.6-balance-sides | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 1.7-non-standard-units | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.7-non-standard-units | 2 | measure-gaps | Leave spaces between the units. | Put each unit next to the last, with no gaps. |
| 1.7-non-standard-units | 3 | M1 | Measure from 1 and read the end as the length. | Measure from 0, or subtract the start from the end. |
| 1.7-iterate-one-unit | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 1.7-iterate-one-unit | 2 | unit-size | A bigger unit needs a bigger count. | Bigger units need a smaller count for the same length. |
| 1.7-uniform-units | 1 | uneven-units | Compare counts made with different size units. | Use units of the same size for both lengths. |
| 1.7-unit-size | 1 | unit-size | A bigger unit needs a bigger count. | Bigger units need a smaller count for the same length. |
| 1.7-order-by-measure | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 1.7-order-by-measure | 2 | order-pair | Use only one clue to order three things. | Check each clue before you put them in order. |
| 1.8-name-shapes | 1 | square-rectangle | Every rectangle is a square. | A square has four equal sides. |
| 1.8-name-shapes | 2 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 1.8-count-sides | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.8-count-sides | 2 | one-part | Check only one part. | Check every part, not just one. |
| 1.8-positional-words | 1 | position-words | Top and bottom mean the same place. | Top is above. Bottom is below. |
| 1.8-positional-words | 2 | position-words | Top and bottom mean the same place. | Top is above. Bottom is below. |
| 1.9-make-concrete-graph | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.9-make-concrete-graph | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.9-read-concrete-graph | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 1.9-read-concrete-graph | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 1.11-coin-values | 1 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| 1.11-coin-values | 2 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| 1.11-count-one-coin-type | 1 | count-objects | Count groups but leave out their parts. | Count how many are in each group too. |
| 1.11-count-one-coin-type | 2 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 2.1-count-by-ones-100 | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 2.1-count-by-ones-100 | 2 | N3 | After 39 comes 310. | After 39 comes 40. Make a new ten. |
| 2.1-count-by-ones-100 | 3 | decade-back | After 41 comes 30 when counting back. | After 41 comes 40, then 39. |
| 2.1-read-write-100 | 1 | teen-ty | Read fourteen as forty. | Fourteen is 14. Forty is 40. |
| 2.1-read-write-100 | 2 | N1 | Write forty-six as 406. | Four tens and six ones is 46. |
| 2.1-read-write-100 | 3 | N1 | Read 67 as six-seven. | Use the tens word, then the ones: sixty-seven. |
| 2.1-count-to-100 | 1 | tens-as-ones | Change the ones when counting by tens. | Add or take away a ten each time. |
| 2.1-count-to-100 | 2 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 2.1-count-to-100 | 3 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 2.1-count-tens-ones | 1 | count-objects | Count groups but leave out their parts. | Count how many are in each group too. |
| 2.1-count-tens-ones | 2 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 2.1-count-tens-ones | 3 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 2.1-place-value-tens-ones | 1 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 2.1-place-value-tens-ones | 2 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.1-place-value-tens-ones | 3 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.1-decompose-tens-ones | 1 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 2.1-decompose-tens-ones | 2 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 2.1-decompose-tens-ones | 3 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 2.1-decompose-tens-ones | 4 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 2.1-ten-more-less | 1 | tens-as-ones | Change the ones when counting by tens. | Add or take away a ten each time. |
| 2.1-ten-more-less | 2 | tens-as-ones | Change the ones when counting by tens. | Add or take away a ten each time. |
| 2.1-ten-more-less | 3 | N3 | After 39 comes 310. | After 39 comes 40. Make a new ten. |
| 2.1-number-line-100 | 2 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 2.1-number-line-100 | 3 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 2.1-compare-order-100 | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 2.1-compare-order-100 | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 2.1-compare-order-100 | 3 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 2.1-even-odd | 1 | pair-leftover | Leave out the one that has no partner. | One left over makes the number odd. |
| 2.1-even-odd | 2 | even-odd | Use the tens digit to check even or odd. | Use the ones digit to check even or odd. |
| 2.2-benchmarks-25-50-100 | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 2.2-personal-referents | 2 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| 2.5-repeating-core | 1 | pattern-core | Use a part that does not repeat. | Find the smallest part that repeats in the same order. |
| 2.5-repeating-core | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 2.5-complex-repeating | 2 | pattern-circular | Stop the rule at the end of one repeat. | Start the same part again. |
| 2.5-complex-repeating | 3 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 2.5-increasing-pattern | 1 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 2.5-increasing-pattern | 2 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 2.5-increasing-pattern | 3 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 2.5-make-increasing | 3 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 2.10-make-pictograph | 1 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 2.10-make-pictograph | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 2.10-read-pictograph | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-facts-to-10 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-facts-to-10 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 2.3-near-doubles | 1 | near-double | Use the double and stop. | Check if you need one more or one less. |
| 2.3-near-doubles | 2 | near-double | Use the double and stop. | Check if you need one more or one less. |
| 2.3-near-doubles | 3 | near-double | Use the double and stop. | Check if you need one more or one less. |
| 2.3-bridge-10-add | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.3-bridge-10-add | 2 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 2.3-bridge-10-add | 4 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 2.3-bridge-10-subtract | 2 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 2.3-bridge-10-subtract | 4 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-fact-strategies-20 | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-fact-strategies-20 | 3 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 2.3-fact-strategies-20 | 4 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-think-addition | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.3-think-addition | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 2.3-think-addition | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.3-three-addends | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.3-three-addends | 2 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.3-three-addends | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.6-write-change | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.6-write-change | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.6-write-change | 3 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 2.6-missing-addend | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.6-missing-addend | 2 | A4 | Guess the missing number from one side. | Make both sides of = have the same value. |
| 2.6-missing-addend | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.6-change-to-100 | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.6-change-to-100 | 2 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 2.6-change-to-100 | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.7-equal-sign | 1 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 2.7-equal-sign | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 2.7-equal-sign | 3 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 2.7-greater-less-symbols | 1 | symbol-direction | Point the open side at the smaller number. | The open side faces the greater number. |
| 2.7-greater-less-symbols | 3 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 2.7-true-false-equations | 2 | A1 | The equals sign means the answer comes next. | Both sides of = must have the same value. |
| 2.9-name-2d-shapes | 1 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 2.9-name-2d-shapes | 2 | M4 | Turning a shape changes its name. | Count its sides and corners, even after a turn. |
| 2.9-compare-2d | 1 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 2.9-compare-2d | 2 | square-rectangle | Every rectangle is a square. | A square has four equal sides. |
| 2.9-compare-2d | 3 | square-rectangle | Every rectangle is a square. | A square has four equal sides. |
| 2.9-two-attributes | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 2.9-faces-of-3d | 1 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 2.9-faces-of-3d | 2 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 2.11-compare-likelihood | 2 | chance-reversed | Pick what happens less often as more often. | Compare what happens most often. |
| 2.4-add-subtract-tens | 1 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 2.4-add-subtract-tens | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-add-subtract-tens | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-add-tens-to-number | 2 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.4-add-tens-to-number | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-ones-to-two-digit | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.4-ones-to-two-digit | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 2.4-ones-to-two-digit | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-ones-to-two-digit | 4 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 2.4-next-ten | 1 | complement | Use the ones digit as the amount to the next ten. | Find how many more ones make 10. |
| 2.4-next-ten | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.4-split-tens-ones | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.4-split-tens-ones | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 2.4-split-tens-ones | 4 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 2.4-friendly-numbers | 1 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 2.4-friendly-numbers | 2 | compensation-direction | Change one number and keep the same answer. | Keep track of the amount you added or took away. |
| 2.4-friendly-numbers | 3 | compensation-direction | Change one number and keep the same answer. | Keep track of the amount you added or took away. |
| 2.4-add-within-100 | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 2.4-add-within-100 | 3 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 2.4-add-up-difference | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 2.4-add-up-difference | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 2.4-add-up-difference | 3 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 2.4-subtract-within-100 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-subtract-within-100 | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 2.4-subtract-within-100 | 3 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 2.4-subtract-within-100 | 4 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 2.4-estimate-100 | 1 | round-down | Round down every time. | Compare with the halfway point before rounding. |
| 2.4-estimate-100 | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-compare-problems-100 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-compare-problems-100 | 2 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 2.4-compare-problems-100 | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-word-problems-100 | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 2.4-word-problems-100 | 2 | start-as-total | Treat the start amount as the final amount. | Follow each change to find the final amount. |
| 2.4-word-problems-100 | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 2.4-word-problems-100 | 4 | story-total | Use the total as the amount taken away. | Check which amount is the whole and which is a part. |
| 2.8-ruler-from-zero | 1 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 2.8-measure-cm-m | 1 | M1 | Measure from 1 and read the end as the length. | Measure from 0, or subtract the start from the end. |
| 2.8-measure-cm-m | 2 | M1 | Measure from 1 and read the end as the length. | Measure from 0, or subtract the start from the end. |
| 2.8-measure-cm-m | 3 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 2.8-choose-unit | 1 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 2.8-choose-unit | 2 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 2.8-estimate-length | 1 | referent-size | Guess a length with nothing to compare it to. | Compare with a length you know, such as 1 cm. |
| 2.8-compare-lengths | 1 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| 2.8-compare-lengths | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 2.8-compare-lengths | 3 | M1 | Measure from 1 and read the end as the length. | Measure from 0, or subtract the start from the end. |
| 2.12-count-mixed-coins | 1 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 2.12-count-mixed-coins | 2 | coin-name | Name a coin by its size alone. | Look at the marks and value on the coin. |
| 2.12-count-mixed-coins | 3 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 3.1-place-value-1000 | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 3.1-place-value-1000 | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 3.1-place-value-1000 | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 3.1-place-value-1000 | 3 | N1 | Write 4 hundreds, 13 tens and 2 ones as 4,132. | Trade 10 tens for 1 hundred: 532. |
| 3.1-place-value-1000 | 3 | N2 | Keep only 3 tens from 13 tens. | 13 tens is 1 hundred and 3 tens. Keep the extra hundred. |
| 3.1-place-value-1000 | 4 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 3.1-place-value-1000 | 4 | N1 | Write six hundred eight as 6,008. | Six hundreds and 8 ones is 608. Keep 0 in the tens place. |
| 3.1-compare-order-1000 | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 3.1-compare-order-1000 | 1 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| 3.1-compare-order-1000 | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 3.1-compare-order-1000 | 2 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| 3.1-compare-order-1000 | 3 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 3.1-compare-order-1000 | 3 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| 3.1-compare-order-1000 | 3 | order-adjacent | Swap two numbers without checking their size. | Compare each number with the one next to it. |
| 3.1-compare-order-1000 | 4 | bounds-error | Pick a number outside the given range. | Check both ends of the range. |
| 3.1-compare-order-1000 | 4 | bounds-error | Pick a number outside the given range. | Check both ends of the range. |
| 3.1-count-1000 | 2 | tens-as-ones | Change the ones when counting by tens. | Add or take away a ten each time. |
| 3.1-count-1000 | 3 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.1-count-1000 | 4 | tens-as-ones | Change the ones when counting by tens. | Add or take away a ten each time. |
| 3.1-count-1000 | 5 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.1-estimate-quantity | 1 | one-part | Check only one part. | Check every part, not just one. |
| 3.1-estimate-quantity | 2 | annexing-zeros | Add or remove zeros without checking the size. | Check the number of tens, hundreds or thousands. |
| 3.1-estimate-quantity | 2 | one-part | Check only one part. | Check every part, not just one. |
| 3.3-add-within-1000 | 3 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 3.3-add-within-1000 | 3 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 3.3-add-within-1000 | 4 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.3-add-within-1000 | 5 | compensation-dir | Keep the extra amount added to make a round number. | Take that extra amount off the total. |
| 3.3-add-within-1000 | 5 | compensation-dir | Keep the extra amount added to make a round number. | Take that extra amount off the total. |
| 3.3-subtract-within-1000 | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.3-subtract-within-1000 | 2 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.3-subtract-within-1000 | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.3-subtract-within-1000 | 3 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.3-subtract-within-1000 | 4 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 3.3-subtract-within-1000 | 4 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.3-subtract-within-1000 | 5 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.3-subtract-within-1000 | 5 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.3-subtract-within-1000 | 5 | inverse-op | Repeat the same subtraction to check it. | Add the difference to the amount taken away. |
| 3.3-word-problems-1000 | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.3-word-problems-1000 | 3 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 3.3-word-problems-1000 | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.3-word-problems-1000 | 4 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 3.4-recall-addition-20 | 2 | compensation-dir | Keep the extra amount added to make a round number. | Take that extra amount off the total. |
| 3.4-recall-addition-20 | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.4-recall-addition-20 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.4-recall-addition-20 | 3 | compensation-dir | Keep the extra amount added to make a round number. | Take that extra amount off the total. |
| 3.4-subtraction-facts-20 | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.4-subtraction-facts-20 | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.4-subtraction-facts-20 | 3 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.4-subtraction-facts-20 | 4 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.4-subtraction-facts-20 | 4 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.6-increasing-pattern | 1 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.6-increasing-pattern | 2 | pattern-start-step | Use the starting number as the step size. | Find the change between two neighbours. |
| 3.6-increasing-pattern | 2 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.6-increasing-pattern | 3 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.6-increasing-pattern | 4 | next-not-asked | Say the next number after the count. | The last number you counted says how many. |
| 3.6-decreasing-pattern | 1 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.6-decreasing-pattern | 1 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 3.6-decreasing-pattern | 2 | skip-by-one | Move one place for two more or two less. | Move two places, one at a time. |
| 3.6-decreasing-pattern | 2 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 3.6-decreasing-pattern | 3 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 3.6-growth-amount | 1 | pattern-start-step | Use the starting number as the step size. | Find the change between two neighbours. |
| 3.6-growth-amount | 1 | next-not-asked | Say the next number after the count. | The last number you counted says how many. |
| 3.6-growth-amount | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 3.6-growth-amount | 2 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 3.6-growth-amount | 3 | pattern-first-step | Use the first change for every later step. | Check whether the change itself grows. |
| 3.6-growth-amount | 3 | pattern-multiply | Multiply by a term instead of following the rule. | Find the change from one term to the next. |
| 3.13-simulated-likelihood | 1 | chance-reversed | Pick what happens less often as more often. | Compare what happens most often. |
| 3.13-simulated-likelihood | 2 | likelihood-reversed | Something that can happen must happen often. | Some things happen more often than others. |
| 3.13-simulated-likelihood | 2 | likelihood-order | Pick a middle count as the smallest. | Compare every count before choosing the smallest. |
| 3.13-simulated-likelihood | 3 | chance-reversed | Pick what happens less often as more often. | Compare what happens most often. |
| 3.13-simulated-likelihood | 3 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| 3.13-simulated-likelihood | 4 | impossible-possible | Something that can never happen may happen. | Use never for something that cannot happen. |
| 3.13-simulated-likelihood | 4 | opposite-extreme | Use always when an event cannot happen. | Never means it cannot happen. Always means every time. |
| 3.13-independent-trials | 1 | coin-due-certain | A run of heads makes tails come next. | Each fair toss still has two equal outcomes. |
| 3.13-independent-trials | 1 | coin-repeat-certain | A run of heads makes heads come next. | Each fair toss still has two equal outcomes. |
| 3.13-independent-trials | 2 | coin-due-certain | A run of heads makes tails come next. | Each fair toss still has two equal outcomes. |
| 3.13-independent-trials | 2 | coin-repeat-certain | A run of heads makes heads come next. | Each fair toss still has two equal outcomes. |
| 3.13-independent-trials | 3 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.5-equal-groups | 1 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 3.5-equal-groups | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.5-equal-groups | 2 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 3.5-equal-groups | 2 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.5-equal-groups | 3 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 3.5-equal-groups | 4 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.5-equal-groups | 5 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 3.5-grouping-division | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.5-grouping-division | 2 | next-not-asked | Say the next number after the count. | The last number you counted says how many. |
| 3.5-relate-multiply-divide | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.5-relate-multiply-divide | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.5-relate-multiply-divide | 3 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 3.8-unknown-result-change | 1 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 3.8-unknown-result-change | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-result-change | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.8-unknown-result-change | 2 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.8-unknown-result-change | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.8-unknown-result-change | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-result-change | 4 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.8-unknown-start | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-start | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.8-unknown-start | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-start | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 3.8-unknown-start | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-start | 3 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 3.8-unknown-start | 4 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-unknown-start | 4 | start-as-total | Treat the start amount as the final amount. | Follow each change to find the final amount. |
| 3.8-unknown-start | 4 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 3.8-balance-equations | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 3.8-balance-equations | 1 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 3.8-balance-equations | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-balance-equations | 4 | first-number | Compare just the first number on each side. | Work out both sides before comparing. |
| 3.8-write-equation | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 3.8-write-equation | 2 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 3.8-write-equation | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.8-write-equation | 3 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 3.7-describe-rule | 1 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 3.7-describe-rule | 1 | rule-swap | Swap the starting number and the step size. | Write the start first, then use the step each time. |
| 3.7-describe-rule | 2 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 3.7-describe-rule | 2 | rule-swap | Swap the starting number and the step size. | Write the start first, then use the step each time. |
| 3.7-describe-rule | 3 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 3.7-describe-rule | 3 | rule-swap | Swap the starting number and the step size. | Write the start first, then use the step each time. |
| 3.7-use-rule | 1 | next-not-asked | Say the next number after the count. | The last number you counted says how many. |
| 3.7-use-rule | 1 | pattern-start-step | Use the starting number as the step size. | Find the change between two neighbours. |
| 3.7-use-rule | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 3.7-use-rule | 2 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 3.7-use-rule | 3 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 3.7-use-rule | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 3.12-read-bar-graph | 2 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 3.12-read-bar-graph | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 3.12-read-bar-graph | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.12-read-bar-graph | 3 | digit-reversal | Put the ones before the tens. | Put the tens first, then the ones. |
| 3.12-read-bar-graph | 5 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.12-read-bar-graph | 5 | wrong-row | Read a different row from the one asked for. | Find the right label first, then count that row. |
| 3.12-tally | 3 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 3.14-coins-bills-100 | 1 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 3.14-coins-bills-100 | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.14-coins-bills-100 | 2 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 3.14-coins-bills-100 | 2 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.14-coins-bills-100 | 3 | money-join | Count 3 quarters as 3 dollars. | Count by each coin's value: 3 quarters is 75 cents. |
| 3.14-coins-bills-100 | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.14-coins-bills-100 | 4 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 3.14-coins-bills-100 | 4 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.14-make-amount-ways | 1 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 3.14-earning-payment | 3 | one-part | Check only one part. | Check every part, not just one. |
| 3.14-earning-payment | 4 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 3.2-equal-parts | 1 | denominator-meaning | Equal fractions can have parts of any size. | Each part of the whole must be the same size. |
| 3.2-equal-parts | 1 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 3.2-equal-parts | 2 | denominator-meaning | Equal fractions can have parts of any size. | Each part of the whole must be the same size. |
| 3.2-equal-parts | 3 | looks-different | Spread them out to make more. | Moving things does not change how many. |
| 3.2-name-fraction-region | 1 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.2-name-fraction-region | 1 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 3.2-name-fraction-region | 2 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.2-name-fraction-region | 2 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 3.2-name-fraction-region | 3 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.2-name-fraction-region | 4 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 3.2-fraction-of-set | 1 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.2-fraction-of-set | 1 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 3.2-fraction-of-set | 3 | one-part | Check only one part. | Check every part, not just one. |
| 3.2-fraction-number-line | 1 | denominator-meaning | Equal fractions can have parts of any size. | Each part of the whole must be the same size. |
| 3.2-fraction-number-line | 1 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.2-fraction-number-line | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 3.2-fraction-number-line | 2 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 3.2-fraction-number-line | 4 | benchmark-size | Compare fractions using just the top number. | Compare the size of each part too. |
| 3.2-fraction-number-line | 4 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| 3.2-fraction-whole | 1 | one-part | Check only one part. | Check every part, not just one. |
| 3.2-fraction-whole | 2 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.2-fraction-whole | 3 | fraction-other-part | Count parts that were not asked for. | Count the chosen parts on top and all equal parts on the bottom. |
| 3.9-metric-units | 1 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 3.9-metric-units | 1 | unit-kind | Use a mass unit for a length. | Check what you measure before choosing the unit. |
| 3.9-metric-units | 2 | referent-size | Guess a length with nothing to compare it to. | Compare with a length you know, such as 1 cm. |
| 3.9-metric-units | 2 | unit-kind | Use a mass unit for a length. | Check what you measure before choosing the unit. |
| 3.9-metric-units | 3 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 3.9-metric-units | 3 | unit-kind | Use a mass unit for a length. | Check what you measure before choosing the unit. |
| 3.9-metric-units | 4 | one-part | Check only one part. | Check every part, not just one. |
| 3.9-convert-m-cm | 1 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 3.9-convert-m-cm | 1 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 3.9-convert-m-cm | 1 | count-unchanged | Keep the number when changing the unit. | Smaller units need a bigger count for the same amount. |
| 3.9-convert-m-cm | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 3.9-convert-m-cm | 2 | count-unchanged | Keep the number when changing the unit. | Smaller units need a bigger count for the same amount. |
| 3.9-convert-m-cm | 4 | same-size | Things that look alike have the same total. | Count how many, even if they look different. |
| 3.9-area-square-units | 1 | area-add | Add side lengths to find area. | Multiply length by width for a rectangle's area. |
| 3.9-area-square-units | 2 | one-part | Check only one part. | Check every part, not just one. |
| 3.9-area-square-units | 3 | area-add | Add side lengths to find area. | Multiply length by width for a rectangle's area. |
| 3.9-area-square-units | 4 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 3.9-area-square-units | 4 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 3.9-area-square-units | 4 | difference-whole | Give one whole amount for how many more. | Find how much more makes the smaller amount match the bigger. |
| 3.9-perimeter-concept | 1 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.9-perimeter-concept | 2 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.9-perimeter-concept | 3 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.9-perimeter-concept | 4 | leaves-out-addend | Leave out one amount when adding. | Add every amount once. |
| 3.10-time-units | 1 | more-less | Put the biggest first every time. | Check whether the smallest or biggest goes first. |
| 3.10-time-units | 1 | order-adjacent | Swap two numbers without checking their size. | Compare each number with the one next to it. |
| 3.10-time-units | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 3.10-time-units | 3 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 3.10-time-units | 3 | unit-choice | Choose a unit too large or too small for the size. | Compare with a unit you know before choosing. |
| 3.10-convert-time | 1 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 3.10-convert-time | 2 | clock-hundred | Use 100 minutes for an hour. | Use 60 minutes for an hour. |
| 3.11-faces-edges-vertices | 1 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 3.11-faces-edges-vertices | 1 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 3.11-faces-edges-vertices | 2 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 3.11-faces-edges-vertices | 2 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 3.11-faces-edges-vertices | 3 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 3.11-faces-edges-vertices | 3 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 3.11-name-3d | 1 | side-view | Name a solid from just one flat shape. | Check whether to name the whole solid or one flat face. |
| 3.11-name-3d | 1 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 3.11-name-3d | 2 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 3.11-name-3d | 3 | side-view | Name a solid from just one flat shape. | Check whether to name the whole solid or one flat face. |
| 3.11-name-3d | 3 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 3.11-name-3d | 4 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 3.11-nets | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 3.11-nets | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 3.11-nets | 2 | shape-name | Name a shape by how familiar it looks. | Check its sides and corners. |
| 3.11-nets | 2 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 3.11-nets | 3 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 3.11-nets | 3 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 3.11-nets | 3 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 4.1-place-value-10000 | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 4.1-place-value-10000 | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 4.1-compare-order-10000 | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 4.1-compare-order-10000 | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 4.1-expanded-form | 1 | N1 | Write 4,000 + 300 + 20 + 5 as 4,000,325. | Combine matching places: 4,325. |
| 4.1-expanded-form | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 4.1-expanded-form | 3 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 4.1-multiples | 3 | factor-multiple | List factors when asked for multiples. | Multiply the number by 1, 2, 3 and so on. |
| 4.7-addition-facts-fluency | 2 | count-start | Count the start number as the first move. | Say the next number for the first move. |
| 4.7-addition-facts-fluency | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 4.4-add-within-10000 | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.4-add-within-10000 | 3 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.4-add-within-10000 | 4 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.4-add-within-10000 | 5 | operation | Add every number you see. | Check whether to add or take away. |
| 4.4-subtract-within-10000 | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 4.4-subtract-within-10000 | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 4.4-subtract-within-10000 | 4 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 4.4-subtract-within-10000 | 5 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 4.8-division-facts | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 4.9-table-pattern | 1 | rule-start | Use the start number as the change. | Find how much changes at each step. |
| 4.9-table-pattern | 2 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 4.9-table-pattern | 3 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 4.9-extend-table | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 4.9-extend-table | 3 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 4.13-regular-irregular | 1 | regular-all | Equal sides alone make a shape regular. | A regular polygon has equal sides and equal angles. |
| 4.13-regular-irregular | 2 | regular-all | Equal sides alone make a shape regular. | A regular polygon has equal sides and equal angles. |
| 4.15-line-symmetry | 1 | symmetry-lines | Two equal halves always give a line of symmetry. | Both halves must match exactly when folded. |
| 4.15-line-symmetry | 2 | symmetry-lines | Two equal halves always give a line of symmetry. | Both halves must match exactly when folded. |
| 4.5-multiply-1-digit | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 4.5-multiply-1-digit | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.5-multiply-1-digit | 3 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.5-multiply-1-digit | 4 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.5-divide-1-digit | 1 | division-digitwise | Share the tens and leave the ones. | Share every place, including any amount left over. |
| 4.5-divide-1-digit | 2 | division-digitwise | Share the tens and leave the ones. | Share every place, including any amount left over. |
| 4.5-divide-1-digit | 3 | remainder-size | Leave a remainder as big as the divisor. | Share again until the remainder is less than the divisor. |
| 4.5-divide-1-digit | 4 | division-digitwise | Share the tens and leave the ones. | Share every place, including any amount left over. |
| 4.5-divide-1-digit | 5 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 4.5-word-problems | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 4.5-word-problems | 2 | remainder-ignore | Drop the remainder without reading the question. | Check whether the leftover amount needs another group. |
| 4.3-same-numerator | 1 | F1 | A larger bottom number makes a larger fraction. | For equal tops, more equal parts means smaller parts. |
| 4.3-same-numerator | 2 | F1 | A larger bottom number makes a larger fraction. | For equal tops, more equal parts means smaller parts. |
| 4.3-same-numerator | 3 | F1 | A larger bottom number makes a larger fraction. | For equal tops, more equal parts means smaller parts. |
| 4.3-benchmarks | 1 | numerator-only | Compare fractions using only the tops. | Compare each top with its bottom too. |
| 4.10-relationship | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 4.10-relationship | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 4.10-relationship | 3 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 4.10-equal-products | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 4.10-equal-products | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 4.10-equal-products | 3 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 4.11-add-subtract-unknown | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.11-add-subtract-unknown | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.11-add-subtract-unknown | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.11-multiply-divide-unknown | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.11-multiply-divide-unknown | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.11-multiply-divide-unknown | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.12-read-analog | 1 | M7 | Read the hour and minute hands in the same way. | Count minutes by 5. Check which hour the short hand has passed. |
| 4.12-read-analog | 2 | M7 | Read the hour and minute hands in the same way. | Count minutes by 5. Check which hour the short hand has passed. |
| 4.12-read-analog | 3 | M7 | Read the hour and minute hands in the same way. | Count minutes by 5. Check which hour the short hand has passed. |
| 4.12-24-hour | 1 | clock-24 | Add 10 for an afternoon hour. | Add 12 from 1 p.m. to 11 p.m. |
| 4.12-24-hour | 2 | clock-24 | Add 10 for an afternoon hour. | Add 12 from 1 p.m. to 11 p.m. |
| 4.12-24-hour | 3 | clock-24 | Add 10 for an afternoon hour. | Add 12 from 1 p.m. to 11 p.m. |
| 4.14-perimeter | 1 | M2 | Add only two sides to find perimeter. | Add all the outside side lengths. |
| 4.14-perimeter | 3 | M2 | Add only two sides to find perimeter. | Add all the outside side lengths. |
| 4.14-missing-side | 1 | missing-side-half | Take one known side from a rectangle's perimeter. | Find half the perimeter, then take off the known side. |
| 4.14-missing-side | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 4.14-missing-side | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 4.2-tenths | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-tenths | 2 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 4.2-tenths | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-hundredths | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-hundredths | 2 | tenth-hundredth | Treat a hundredth as a tenth. | Ten hundredths make one tenth. |
| 4.2-hundredths | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-decimal-place-value | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-decimal-place-value | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-decimal-place-value | 3 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 4.2-fraction-decimal | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-fraction-decimal | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-fraction-decimal | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.2-fraction-decimal | 4 | tenth-hundredth | Treat a hundredth as a tenth. | Ten hundredths make one tenth. |
| 4.2-compare-decimals | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 4.2-compare-decimals | 2 | F6 | A longer decimal must be bigger. | Compare matching places from left to right. |
| 4.2-compare-decimals | 3 | F6 | A longer decimal must be bigger. | Compare matching places from left to right. |
| 4.6-add-decimals | 1 | decimal-whole-parts | Add the parts on each side of the point separately. | Line up equal places and regroup when needed. |
| 4.6-add-decimals | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.6-add-decimals | 3 | O8 | Line up the right edges of decimals. | Line up the decimal points. |
| 4.6-add-decimals | 4 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 4.6-subtract-decimals | 2 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 4.6-subtract-decimals | 3 | O8 | Line up the right edges of decimals. | Line up the decimal points. |
| 4.6-subtract-decimals | 4 | O8 | Line up the right edges of decimals. | Line up the decimal points. |
| 4.18-money-notation | 1 | coin-count | Count the coins as ones. | Count by the value of each coin. |
| 4.18-money-notation | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.18-money-notation | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 4.18-make-change-100 | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 4.18-make-change-100 | 2 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 4.18-make-change-100 | 3 | O2 | Skip a zero and take the smaller digit away. | Trade from the next nonzero place, through each zero. |
| 4.18-financial-decisions | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 4.18-financial-decisions | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 4.16-many-to-one | 1 | D1 | Count each symbol as one. | Use the value given by the key. |
| 4.16-many-to-one | 2 | half-symbol | Count half a symbol as a whole symbol. | Use half the value in the key. |
| 4.16-many-to-one | 3 | D1 | Count each symbol as one. | Use the value given by the key. |
| 4.16-compare-data | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 4.16-compare-data | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 4.16-compare-data | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 4.17-predict-outcome | 2 | chance-reversed | Pick what happens less often as more often. | Compare what happens most often. |
| 4.17-predict-outcome | 3 | likelihood-reversed | Something that can happen must happen often. | Some things happen more often than others. |
| 4.17-record-trials | 1 | tally-bundle | Count each bundle as one. | Each full tally bundle counts as 5. |
| 4.17-record-trials | 3 | D5 | The results must match the expected share exactly. | Small sets of trials can give different results. |
| 5.1-place-value-million | 1 | place-shift | Read a digit one place too low. | Each place to the left is worth 10 times as much. |
| 5.1-place-value-million | 2 | place-shift | Read a digit one place too low. | Each place to the left is worth 10 times as much. |
| 5.1-place-value-million | 3 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.1-read-write | 1 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.1-read-write | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.1-read-write | 3 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.1-compare-order-million | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 5.1-compare-order-million | 2 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 5.5-add-million | 1 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 5.5-add-million | 2 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 5.5-subtract-million | 1 | smaller-from-larger | Take the smaller digit from the bigger in each place. | Keep the order. Regroup when the top digit is smaller. |
| 5.5-subtract-million | 2 | regroup-forget | Trade a ten but keep it in the tens too. | Take 1 from the tens when you trade it for 10 ones. |
| 5.8-extend-facts | 1 | fact-scale-zeros | Use the basic fact but leave out the scale. | Check each factor's place value. |
| 5.8-extend-facts | 2 | fact-scale-zeros | Use the basic fact but leave out the scale. | Check each factor's place value. |
| 5.9-recall-facts | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 5.9-recall-facts | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 5.9-multiply-tens | 1 | annexing-zeros | Add or remove zeros without checking the size. | Check the number of tens, hundreds or thousands. |
| 5.9-multiply-tens | 2 | annexing-zeros | Add or remove zeros without checking the size. | Check the number of tens, hundreds or thousands. |
| 5.9-multiply-tens | 3 | annexing-zeros | Add or remove zeros without checking the size. | Check the number of tens, hundreds or thousands. |
| 5.9-distributive | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 5.9-distributive | 2 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 5.10-pattern-rule | 1 | pattern-start-step | Use the starting number as the step size. | Find the change between two neighbours. |
| 5.10-pattern-rule | 2 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 5.10-nth-term | 1 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 5.10-nth-term | 2 | pattern-step-count | Count the start as a step. | Count only the moves from the start. |
| 5.10-rule-with-variable | 1 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 5.10-rule-with-variable | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 5.10-rule-with-variable | 3 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 5.12-area-rectangle | 1 | area-add | Add side lengths to find area. | Multiply length by width for a rectangle's area. |
| 5.12-area-rectangle | 2 | area-add | Add side lengths to find area. | Multiply length by width for a rectangle's area. |
| 5.12-missing-side | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 5.12-missing-side | 2 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 5.17-double-bar-graph | 1 | D1 | Count each symbol as one. | Use the value given by the key. |
| 5.17-double-bar-graph | 2 | difference-as-sum | Add when asked how many more. | Subtract to find the difference. |
| 5.17-scale | 1 | symbol-count | Count symbols and ignore the key. | Multiply the symbol count by the key value. |
| 5.17-scale | 2 | half-symbol | Count half a symbol as a whole symbol. | Use half the value in the key. |
| 5.6-multiply-2-digit | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 5.6-multiply-2-digit | 2 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 5.6-multiply-2-digit | 2 | carry-dropped | Leave out a carried amount. | Add the carried amount in the next place. |
| 5.6-multiply-2-digit | 3 | partial-shift | Put all partial products in the same place. | A tens product starts in the tens place. |
| 5.6-divide-remainder | 1 | remainder-too-big | Leave a remainder larger than the divisor. | Keep dividing until the remainder is less than the divisor. |
| 5.6-divide-remainder | 2 | quotient-zero | Leave out a zero in the answer to a division. | Write 0 when a place has no groups. |
| 5.6-interpret-remainder | 1 | remainder-ignore | Drop the remainder without reading the question. | Check whether the leftover amount needs another group. |
| 5.6-interpret-remainder | 2 | remainder-context | Round the division result without checking its use. | Check whether to use full groups, an extra group or a part. |
| 5.6-divide-2-digit | 2 | remainder-too-big | Leave a remainder larger than the divisor. | Keep dividing until the remainder is less than the divisor. |
| 5.3-equivalent-fractions | 1 | fraction-add | Add the same amount to the top and bottom. | Multiply both by the same number instead. |
| 5.3-equivalent-fractions | 2 | fraction-add | Add the same amount to the top and bottom. | Multiply both by the same number instead. |
| 5.3-equivalent-fractions | 3 | fraction-one-side | Change just the top or bottom of a fraction. | Multiply or divide both by the same number. |
| 5.3-same-amount | 1 | numerator-only | Compare fractions using only the tops. | Compare each top with its bottom too. |
| 5.3-missing-term | 1 | fraction-add | Add the same amount to the top and bottom. | Multiply both by the same number instead. |
| 5.3-missing-term | 2 | fraction-subtract | Subtract the same amount from the top and bottom. | Divide both by the same factor instead. |
| 5.3-missing-term | 3 | fraction-one-side | Change just the top or bottom of a fraction. | Multiply or divide both by the same number. |
| 5.11-evaluate-expression | 1 | joins-digits | Write the factor beside the value. | A number beside a letter means multiply. |
| 5.11-evaluate-expression | 2 | joins-digits | Write the factor beside the value. | A number beside a letter means multiply. |
| 5.11-solve-one-step | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 5.11-solve-one-step | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 5.11-write-equation | 1 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 5.11-write-equation | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 5.13-same-area-different-perimeter | 1 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 5.13-same-area-different-perimeter | 2 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 5.13-same-area-different-perimeter | 3 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 5.13-compare-area-perimeter | 1 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 5.13-compare-area-perimeter | 2 | area-perimeter-link | Equal perimeters must give equal areas. | Check area and perimeter separately. |
| 5.14-elapsed-time | 1 | clock-no-regroup | Use 100 minutes when changing hours. | Trade each hour for 60 minutes. |
| 5.14-elapsed-time | 2 | clock-no-regroup | Use 100 minutes when changing hours. | Trade each hour for 60 minutes. |
| 5.14-elapsed-time | 2 | minutes-reversed | Reverse the minutes and ignore the hours. | Count forward from the start time to the end time. |
| 5.14-end-time | 1 | clock-no-regroup | Use 100 minutes when changing hours. | Trade each hour for 60 minutes. |
| 5.14-end-time | 2 | clock-no-regroup | Use 100 minutes when changing hours. | Trade each hour for 60 minutes. |
| 5.18-probability-fraction | 1 | denominator-other | Compare the chosen outcome with the other outcome. | Compare it with all outcomes. |
| 5.18-probability-fraction | 2 | one-part | Check only one part. | Check every part, not just one. |
| 5.18-experiment | 1 | sure-of-possible | An event that can happen must happen every time. | It may happen sometimes, even if it can happen again. |
| 5.18-experiment | 2 | one-to-one | Skip or repeat a number. | Say each number once, in order. |
| 5.18-experiment | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 5.2-thousandths | 1 | place-shift | Read a digit one place too low. | Each place to the left is worth 10 times as much. |
| 5.2-thousandths | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.2-thousandths | 3 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 5.2-decimal-place-value | 1 | place-shift | Read a digit one place too low. | Each place to the left is worth 10 times as much. |
| 5.2-decimal-place-value | 2 | place-shift | Read a digit one place too low. | Each place to the left is worth 10 times as much. |
| 5.2-between-decimals | 1 | decimals-dense | No decimal fits between two neighbouring tenths. | Use hundredths: 0.45 is between 0.4 and 0.5. |
| 5.2-between-decimals | 2 | decimals-dense | No decimal fits between two neighbouring tenths. | Use hundredths: 0.45 is between 0.4 and 0.5. |
| 5.4-fraction-to-decimal | 1 | fraction-digits-decimal | Write the fraction's digits as decimal digits. | Divide the top by the bottom. |
| 5.4-fraction-to-decimal | 2 | fraction-digits-decimal | Write the fraction's digits as decimal digits. | Divide the top by the bottom. |
| 5.4-compare-decimals | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 5.4-compare-decimals | 2 | longer-is-larger | More decimal digits means a greater value. | Add ending zeros to compare the same places. |
| 5.4-compare-fractions | 1 | benchmark-size | Compare fractions using just the top number. | Compare the size of each part too. |
| 5.7-add-thousandths | 1 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 5.7-add-thousandths | 2 | align-point | Line up decimal numbers by their last digits. | Line up the decimal points and matching places. |
| 5.7-subtract-thousandths | 1 | smaller-from-larger | Take the smaller digit from the bigger in each place. | Keep the order. Regroup when the top digit is smaller. |
| 5.7-subtract-thousandths | 2 | align-point | Line up decimal numbers by their last digits. | Line up the decimal points and matching places. |
| 5.19-budget | 2 | fee-sign | Treat income and expenses as the same kind of change. | Income adds money. Expenses take money away. |
| 5.19-budget | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 5.15-classify-prisms-pyramids | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 5.15-classify-prisms-pyramids | 2 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 5.15-classify-prisms-pyramids | 3 | face-for-solid | Use the name of a face for a solid. | Name the whole solid, not just one face. |
| 5.15-count-parts | 1 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 5.15-count-parts | 2 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 5.15-count-parts | 3 | side-view | Name a solid from just one flat shape. | Check whether to name the whole solid or one flat face. |
| 5.15-quadrilaterals | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 5.15-quadrilaterals | 2 | names-exclusive | A shape can have only one name. | A shape can belong to more than one group. |
| 5.16-translation | 1 | one-part | Check only one part. | Check every part, not just one. |
| 5.16-translation | 2 | transformation-name | Use slide, flip and turn as the same move. | A slide moves, a flip reflects and a turn rotates. |
| 5.16-translation | 3 | move-distance-swap | Swap the across and up moves. | Do each move in its named direction. |
| 5.16-reflection | 1 | transformation-name | Use slide, flip and turn as the same move. | A slide moves, a flip reflects and a turn rotates. |
| 5.16-reflection | 2 | reflection-distance | Keep the point on the same side of the mirror line. | Put it the same distance on the other side. |
| 6.1-place-value | 1 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 6.1-place-value | 2 | zero-placeholder | Leave out a zero that holds an empty place. | Keep 0 in an empty place so the other digits keep their values. |
| 6.1-large-numbers | 1 | N1 | Write 4 million 250 thousand as 4,000,250,000. | Keep each digit in its place: 4,250,000. |
| 6.1-large-numbers | 2 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 6.1-large-numbers | 3 | N2 | Read a digit as its value in every place. | The place gives its value: the 3 in 30 is 30. |
| 6.1-large-numbers | 4 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 6.1-compare-order | 1 | digit-compare | Compare only the first digit you see. | Compare the tens first, then the ones. |
| 6.1-compare-order | 2 | F6 | A longer decimal must be bigger. | Compare matching places from left to right. |
| 6.2-fact-strategies | 1 | compensation | Make 10, then add all of the other number. | Take off what you used to make 10 first. |
| 6.2-fact-strategies | 2 | O5 | Write partial products side by side. | Add the partial products by place value. |
| 6.2-fact-strategies | 3 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 6.3-order-of-operations | 1 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 6.3-order-of-operations | 2 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 6.3-order-of-operations | 3 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 6.3-order-of-operations | 4 | remainder-zero | Drop the part left over in division. | Keep the remainder or write it as a fraction or decimal. |
| 6.3-word-expressions | 1 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 6.3-word-expressions | 2 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 6.3-word-expressions | 3 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 6.4-prime-composite | 1 | prime-composite | Call a number prime without checking its factors. | A prime number has exactly two factors, 1 and itself. |
| 6.4-prime-composite | 2 | N5 | Every odd number is prime. | Check all factors: 9 is odd but 3 × 3 = 9. |
| 6.4-divisibility | 1 | divisibility | Use the same divisibility test for every divisor. | Use the test for the divisor in the question. |
| 6.4-divisibility | 2 | divisibility | Use the same divisibility test for every divisor. | Use the test for the divisor in the question. |
| 6.4-divisibility | 3 | divisibility | Use the same divisibility test for every divisor. | Use the test for the divisor in the question. |
| 6.4-factors | 1 | factor-incomplete | Stop after finding one factor pair. | Check all factor pairs. |
| 6.4-factors | 2 | factor-multiple | List factors when asked for multiples. | Multiply the number by 1, 2, 3 and so on. |
| 6.4-factors | 3 | prime-composite | Call a number prime without checking its factors. | A prime number has exactly two factors, 1 and itself. |
| 6.4-factors | 4 | factor-incomplete | Stop after finding one factor pair. | Check all factor pairs. |
| 6.4-gcf | 1 | common-not-greatest | Pick the first common factor. | Choose the greatest factor shared by both numbers. |
| 6.4-gcf | 2 | gcf-lcm | Use multiples to find the greatest common factor. | List shared factors and choose the greatest. |
| 6.4-gcf | 3 | common-not-greatest | Pick the first common factor. | Choose the greatest factor shared by both numbers. |
| 6.4-lcm | 1 | lcm-product | The product is always the least common multiple. | Check for a smaller multiple shared by both numbers. |
| 6.4-lcm | 2 | lcm-product | The product is always the least common multiple. | Check for a smaller multiple shared by both numbers. |
| 6.4-lcm | 3 | lcm-product | The product is always the least common multiple. | Check for a smaller multiple shared by both numbers. |
| 6.4-gcf-lcm-problems | 1 | gcf-lcm | Use multiples to find the greatest common factor. | List shared factors and choose the greatest. |
| 6.4-gcf-lcm-problems | 2 | gcf-lcm | Use multiples to find the greatest common factor. | List shared factors and choose the greatest. |
| 6.13-classify-angles | 1 | M5 | Longer arms make a bigger angle. | The opening between the arms gives the angle. |
| 6.13-classify-angles | 2 | angle-names | Use the wrong name for the angle's size. | Acute is under 90 degrees. Obtuse is between 90 and 180. |
| 6.13-classify-angles | 3 | angle-names | Use the wrong name for the angle's size. | Acute is under 90 degrees. Obtuse is between 90 and 180. |
| 6.13-measure-angles | 1 | benchmark-near | Use 90 degrees for every angle near a right angle. | Check whether the opening is greater or less than 90. |
| 6.13-measure-angles | 2 | M6 | Read the scale that starts at the other end. | Use the scale that starts at 0 on the first arm. |
| 6.13-measure-angles | 3 | angle-sum | Use the same total for every set of angles. | Find the correct total before taking off known angles. |
| 6.13-angle-sums | 1 | full-turn | Use 360 degrees for a straight angle. | A straight angle is 180 degrees. A full turn is 360. |
| 6.13-angle-sums | 2 | angle-sum | Use the same total for every set of angles. | Find the correct total before taking off known angles. |
| 6.13-angle-sums | 3 | angle-sum | Use the same total for every set of angles. | Find the correct total before taking off known angles. |
| 6.13-angle-sums | 4 | angle-sum | Use the same total for every set of angles. | Find the correct total before taking off known angles. |
| 6.11-complex-perimeter | 1 | M2 | Add only two sides to find perimeter. | Add all the outside side lengths. |
| 6.11-complex-perimeter | 2 | M2 | Add only two sides to find perimeter. | Add all the outside side lengths. |
| 6.11-complex-perimeter | 3 | M2 | Add only two sides to find perimeter. | Add all the outside side lengths. |
| 6.18-theoretical | 1 | D4 | Use the other outcomes as the denominator. | Use all outcomes as the denominator. |
| 6.18-theoretical | 2 | D4 | Use the other outcomes as the denominator. | Use all outcomes as the denominator. |
| 6.18-theoretical | 3 | D4 | Use the other outcomes as the denominator. | Use all outcomes as the denominator. |
| 6.18-experimental | 1 | D4 | Use the other outcomes as the denominator. | Use all outcomes as the denominator. |
| 6.18-experimental | 2 | theory-as-data | Use the expected share as the observed share. | Use the actual trial count for experimental probability. |
| 6.18-experimental | 3 | frequency-copy | Copy a trial count for a larger set of trials. | Find the observed share, then scale it to the new total. |
| 6.18-compare | 1 | D5 | The results must match the expected share exactly. | Small sets of trials can give different results. |
| 6.18-compare | 2 | D5 | The results must match the expected share exactly. | Small sets of trials can give different results. |
| 6.5-improper-to-mixed | 1 | remainder-swap | Swap the whole number and remainder. | The quotient is the whole number. The remainder is the top. |
| 6.5-improper-to-mixed | 2 | remainder-swap | Swap the whole number and remainder. | The quotient is the whole number. The remainder is the top. |
| 6.5-improper-to-mixed | 3 | mixed-denominator | Use the quotient as the bottom of the fraction. | Keep the original denominator in the mixed number. |
| 6.5-mixed-to-improper | 1 | F8 | Read a mixed number's digits side by side. | Add the whole number and the fraction. |
| 6.5-mixed-to-improper | 2 | mixed-convert | Add the whole number to the numerator. | Multiply the whole number by the denominator, then add the top. |
| 6.5-mixed-to-improper | 3 | mixed-convert | Add the whole number to the numerator. | Multiply the whole number by the denominator, then add the top. |
| 6.5-compare-order | 1 | numerator-only | Compare fractions using only the tops. | Compare each top with its bottom too. |
| 6.5-compare-order | 2 | numerator-only | Compare fractions using only the tops. | Compare each top with its bottom too. |
| 6.5-compare-order | 3 | fraction-order | Compare just two fractions in the list. | Put every fraction in order using equal-sized parts. |
| 6.8-multiply-decimal | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-multiply-decimal | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-multiply-decimal | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-multiply-decimal | 4 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 6.8-divide-decimal | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-divide-decimal | 2 | O6 | Drop the zero in a division answer. | Keep each place, including a place with no groups. |
| 6.8-divide-decimal | 3 | remainder-zero | Drop the part left over in division. | Keep the remainder or write it as a fraction or decimal. |
| 6.8-divide-decimal | 4 | O6 | Drop the zero in a division answer. | Keep each place, including a place with no groups. |
| 6.8-decimal-word-problems | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-decimal-word-problems | 2 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 6.8-decimal-word-problems | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.8-decimal-word-problems | 4 | smaller-from-larger | Take the smaller digit from the bigger in each place. | Keep the order. Regroup when the top digit is smaller. |
| 6.10-preserve-equality | 1 | one-side-only | Change just one side of an equation. | Do the same operation to both sides. |
| 6.10-preserve-equality | 2 | one-side-only | Change just one side of an equation. | Do the same operation to both sides. |
| 6.10-solve-one-step | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 6.10-solve-one-step | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 6.10-solve-one-step | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 6.10-solve-one-step | 4 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 6.10-combine-like-terms | 1 | coefficient-product | Multiply the coefficients when adding like terms. | Add the coefficients and keep the variable part. |
| 6.10-combine-like-terms | 2 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 6.10-write-equation | 1 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 6.10-write-equation | 2 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 6.10-write-equation | 3 | operation | Add every number you see. | Check whether to add or take away. |
| 6.10-write-equation | 4 | unknown-divisor | Swap the amount shared and the number of groups. | Check whether the unknown is a group size or a group count. |
| 6.12-triangle-area | 1 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.12-triangle-area | 2 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.12-triangle-area | 3 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.12-triangle-area | 4 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.12-parallelogram-area | 1 | slant-height | Use a slanted side as the height. | Use the height at right angles to the base. |
| 6.12-parallelogram-area | 2 | slant-height | Use a slanted side as the height. | Use the height at right angles to the base. |
| 6.12-parallelogram-area | 3 | area-add | Add side lengths to find area. | Multiply length by width for a rectangle's area. |
| 6.12-trapezoid-area | 1 | half-area | Leave out the half in a trapezoid's area. | Add the parallel sides, multiply by height, then halve. |
| 6.12-trapezoid-area | 2 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 6.12-trapezoid-area | 3 | half-area | Leave out the half in a trapezoid's area. | Add the parallel sides, multiply by height, then halve. |
| 6.12-missing-dimension | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 6.12-missing-dimension | 2 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.12-missing-dimension | 3 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 6.15-classify-by-sides | 1 | triangle-type | Name a triangle without checking equal sides. | Scalene has no equal sides. Isosceles has at least two. |
| 6.15-classify-by-sides | 2 | triangle-type | Name a triangle without checking equal sides. | Scalene has no equal sides. Isosceles has at least two. |
| 6.15-classify-by-sides | 3 | M4 | Turning a shape changes its name. | Count its sides and corners, even after a turn. |
| 6.15-classify-by-angles | 1 | M5 | Longer arms make a bigger angle. | The opening between the arms gives the angle. |
| 6.15-classify-by-angles | 2 | angle-names | Use the wrong name for the angle's size. | Acute is under 90 degrees. Obtuse is between 90 and 180. |
| 6.15-classify-by-angles | 3 | triangle-type | Name a triangle without checking equal sides. | Scalene has no equal sides. Isosceles has at least two. |
| 6.16-plot-points | 1 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 6.16-plot-points | 2 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 6.16-plot-points | 3 | graph-misread | Read a value without checking the scale. | Check the value of each interval first. |
| 6.16-translate-point | 1 | move-distance-swap | Swap the across and up moves. | Do each move in its named direction. |
| 6.16-translate-point | 2 | move-distance-swap | Swap the across and up moves. | Do each move in its named direction. |
| 6.16-translate-point | 3 | move-distance-swap | Swap the across and up moves. | Do each move in its named direction. |
| 6.16-combine-transformations | 1 | reflection-distance | Keep the point on the same side of the mirror line. | Put it the same distance on the other side. |
| 6.16-combine-transformations | 2 | transformation-name | Use slide, flip and turn as the same move. | A slide moves, a flip reflects and a turn rotates. |
| 6.6-write-ratio | 1 | ratio-order | Swap the order of parts in a ratio. | Keep the same order as the named quantities. |
| 6.6-write-ratio | 2 | ratio-whole | Mix up part-to-part and part-to-whole ratios. | Check which quantities are named. Add the parts only to find the whole. |
| 6.6-write-ratio | 3 | ratio-whole | Mix up part-to-part and part-to-whole ratios. | Check which quantities are named. Add the parts only to find the whole. |
| 6.6-equivalent-ratios | 1 | F9 | Add the same amount to both parts of a ratio. | Multiply both parts by the same factor. |
| 6.6-equivalent-ratios | 2 | common-not-greatest | Pick the first common factor. | Choose the greatest factor shared by both numbers. |
| 6.6-equivalent-ratios | 3 | F9 | Add the same amount to both parts of a ratio. | Multiply both parts by the same factor. |
| 6.6-ratio-to-fraction | 1 | ratio-whole | Mix up part-to-part and part-to-whole ratios. | Check which quantities are named. Add the parts only to find the whole. |
| 6.6-ratio-to-fraction | 3 | ratio-whole | Mix up part-to-part and part-to-whole ratios. | Check which quantities are named. Add the parts only to find the whole. |
| 6.7-percent-meaning | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 6.7-percent-meaning | 2 | F10 | Convert a percent using the wrong place value. | Divide the percent by 100 to get its decimal. |
| 6.7-percent-meaning | 3 | F7 | Write fraction digits side by side as a decimal. | Divide the numerator by the denominator. |
| 6.7-percent-of | 1 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 6.7-percent-of | 2 | F10 | Convert a percent using the wrong place value. | Divide the percent by 100 to get its decimal. |
| 6.7-percent-of | 3 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 6.7-percent-of | 4 | percent-as-count | Use the percent as the count. | Find that percent of the total count. |
| 6.7-discount | 1 | discount-price | Give the discount as the sale price. | Subtract the discount from the original price. |
| 6.7-discount | 2 | discount-price | Give the discount as the sale price. | Subtract the discount from the original price. |
| 6.7-missing-whole | 1 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 6.7-missing-whole | 2 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 6.7-missing-whole | 3 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 6.7-missing-whole | 4 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 6.19-saving-plan | 1 | remainder-ignore | Drop the remainder without reading the question. | Check whether the leftover amount needs another group. |
| 6.19-saving-plan | 2 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 6.19-saving-plan | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 6.19-consumer-choice | 1 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 6.9-evaluate-rule | 1 | add-before-multiply | Add before multiplying in an expression with no brackets. | Do the multiplication first. |
| 6.9-evaluate-rule | 2 | A3 | Put a coefficient beside a value as digits. | Multiply the coefficient by the value. |
| 6.9-evaluate-rule | 3 | sub-before-multiply | Subtract before multiplying in an expression with no brackets. | Do the multiplication first. |
| 6.9-find-rule | 1 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 6.9-find-rule | 2 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 6.9-find-rule | 3 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 6.9-graph-relation | 1 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 6.9-graph-relation | 2 | A5 | Use only the step size in a rule. | Include the starting value too. |
| 6.9-graph-relation | 3 | pattern-direction | Count on when asked to count back. | Check the direction before you start. |
| 6.9-write-expression | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 6.9-write-expression | 2 | A3 | Put a coefficient beside a value as digits. | Multiply the coefficient by the value. |
| 6.9-write-expression | 3 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 6.14-volume-cubes | 1 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 6.14-volume-cubes | 2 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 6.14-volume-cubes | 3 | volume-not-area | Use square units for volume. | Area uses square units. Volume uses cubic units. |
| 6.14-volume-prism | 1 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 6.14-volume-prism | 2 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 6.14-volume-prism | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 6.14-capacity-units | 1 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 6.14-capacity-units | 2 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 6.14-capacity-units | 3 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 6.17-read-line-graph | 1 | wrong-row | Read a different row from the one asked for. | Find the right label first, then count that row. |
| 6.17-read-line-graph | 2 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 6.17-read-line-graph | 3 | graph-misread | Read a value without checking the scale. | Check the value of each interval first. |
| 6.17-make-line-graph | 1 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 6.17-make-line-graph | 2 | graph-misread | Read a value without checking the scale. | Check the value of each interval first. |
| 7.1-fact-strategies | 1 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.1-fact-strategies | 2 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.1-fact-strategies | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.1-divide-strategies | 1 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.1-divide-strategies | 2 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.1-divide-strategies | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 7.2-integer-meaning | 1 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 7.2-integer-meaning | 2 | opposite-same | A number is always its own opposite. | Opposites have the same distance from 0 on different sides. |
| 7.2-integer-meaning | 3 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 7.2-compare-integers | 1 | N6 | The negative number with bigger digits is greater. | Among negative numbers, the one nearer 0 is greater. |
| 7.2-compare-integers | 2 | absolute-order | Order numbers by their size without the signs. | Negative numbers come before 0 and positive numbers. |
| 7.2-compare-integers | 3 | N6 | The negative number with bigger digits is greater. | Among negative numbers, the one nearer 0 is greater. |
| 7.2-add-integers | 1 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-add-integers | 2 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-add-integers | 3 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-subtract-integers | 1 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 7.2-subtract-integers | 2 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-subtract-integers | 3 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-add-subtract-several | 1 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-add-subtract-several | 2 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-add-subtract-several | 3 | O9 | Ignore the signs when adding integers. | Same signs: add sizes. Different signs: subtract sizes. Check the sign. |
| 7.2-multiply-integers | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.2-multiply-integers | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.2-multiply-integers | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.2-multiply-divide-integers | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.2-multiply-divide-integers | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.2-integer-order-of-operations | 1 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 7.2-integer-order-of-operations | 2 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 7.2-integer-order-of-operations | 3 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 7.2-integer-contexts | 1 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 7.2-integer-contexts | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 7.2-integer-contexts | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 7.4-fraction-to-decimal | 1 | division-reversed | Divide the bottom of a fraction by the top. | Divide the top by the bottom. |
| 7.4-fraction-to-decimal | 2 | division-reversed | Divide the bottom of a fraction by the top. | Divide the top by the bottom. |
| 7.4-fraction-to-decimal | 3 | F8 | Read a mixed number's digits side by side. | Add the whole number and the fraction. |
| 7.4-lowest-terms | 1 | fraction-one-side | Change just the top or bottom of a fraction. | Multiply or divide both by the same number. |
| 7.4-lowest-terms | 2 | common-not-greatest | Pick the first common factor. | Choose the greatest factor shared by both numbers. |
| 7.4-lowest-terms | 3 | common-not-greatest | Pick the first common factor. | Choose the greatest factor shared by both numbers. |
| 7.4-decimal-to-fraction | 1 | F7 | Write fraction digits side by side as a decimal. | Divide the numerator by the denominator. |
| 7.4-decimal-to-fraction | 2 | decimal-denominator | Use 10 for every decimal fraction's denominator. | Use 10 for tenths, 100 for hundredths and 1,000 for thousandths. |
| 7.4-decimal-to-fraction | 3 | decimal-denominator | Use 10 for every decimal fraction's denominator. | Use 10 for tenths, 100 for hundredths and 1,000 for thousandths. |
| 7.4-fraction-decimal-percent | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.4-fraction-decimal-percent | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.4-terminating-repeating | 1 | decimal-repeat | A rounded decimal is the exact fraction value. | Check whether division ends or a digit pattern repeats. |
| 7.4-terminating-repeating | 2 | decimal-repeat | A rounded decimal is the exact fraction value. | Check whether division ends or a digit pattern repeats. |
| 7.4-terminating-repeating | 3 | decimal-repeat | A rounded decimal is the exact fraction value. | Check whether division ends or a digit pattern repeats. |
| 7.4-number-line | 1 | benchmark-far | Pick a number far from the amount. | Compare with 5 and 10 to find the nearer one. |
| 7.4-number-line | 2 | F5 | Count marks instead of spaces on a number line. | Count the equal intervals from the start. |
| 7.4-number-line | 3 | benchmark-size | Compare fractions using just the top number. | Compare the size of each part too. |
| 7.4-compare-forms | 1 | F6 | A longer decimal must be bigger. | Compare matching places from left to right. |
| 7.4-compare-forms | 2 | form-compare | Compare percent, decimal and fraction digits directly. | Change them to the same form first. |
| 7.4-compare-forms | 3 | form-compare | Compare percent, decimal and fraction digits directly. | Change them to the same form first. |
| 7.4-ratio-percent | 1 | count-as-percent | Use the count as the percent. | Divide the count by the total and multiply by 100. |
| 7.4-ratio-percent | 2 | F10 | Convert a percent using the wrong place value. | Divide the percent by 100 to get its decimal. |
| 7.4-ratio-percent | 3 | ratio-part-as-whole | Treat one part of a ratio as the whole. | Add the parts before finding a fraction of the whole. |
| 7.3-add-subtract-decimals | 1 | O3 | Drop the ten made by adding the ones. | Add that ten to the next column. |
| 7.3-add-subtract-decimals | 2 | O8 | Line up the right edges of decimals. | Line up the decimal points. |
| 7.3-add-subtract-decimals | 3 | O1 | Always take the smaller digit from the bigger. | Keep the order. Trade a ten if you need more ones. |
| 7.3-powers-of-ten | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-powers-of-ten | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-powers-of-ten | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-multiply-decimals | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-multiply-decimals | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-multiply-decimals | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-divide-decimals | 1 | divisor-point-only | Move the decimal point in just the divisor. | Multiply both numbers by the same power of 10. |
| 7.3-divide-decimals | 2 | divisor-point-only | Move the decimal point in just the divisor. | Multiply both numbers by the same power of 10. |
| 7.3-divide-decimals | 3 | divisor-point-only | Move the decimal point in just the divisor. | Multiply both numbers by the same power of 10. |
| 7.3-estimate-product | 1 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 7.3-estimate-product | 2 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 7.3-estimate-product | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.3-estimate-quotient | 1 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 7.3-estimate-quotient | 2 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 7.3-estimate-quotient | 3 | O4 | Multiplication must make a number bigger. | Multiplying a positive number by less than 1 makes it smaller. |
| 7.3-decimal-order-of-operations | 1 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 7.3-decimal-order-of-operations | 2 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 7.3-decimal-order-of-operations | 3 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 7.3-decimal-word-problems | 1 | add-not-multiply | Add the group count to the group size. | Add the group size once for each group. |
| 7.3-decimal-word-problems | 2 | cost-not-change | Give the cost as the change. | Subtract the cost from the amount paid. |
| 7.3-decimal-word-problems | 3 | rate-inverse | Divide in the reverse order for a rate. | Put the quantity you need on top and the per unit below. |
| 7.9-origin-axes | 1 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 7.9-origin-axes | 2 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 7.9-quadrants | 1 | quadrant-sign | Ignore which coordinate has each sign. | Check the x sign and y sign separately. |
| 7.9-quadrants | 2 | quadrant-sign | Ignore which coordinate has each sign. | Check the x sign and y sign separately. |
| 7.9-quadrants | 3 | quadrant-sign | Ignore which coordinate has each sign. | Check the x sign and y sign separately. |
| 7.9-plot-integer-points | 1 | quadrant-sign | Ignore which coordinate has each sign. | Check the x sign and y sign separately. |
| 7.9-plot-integer-points | 2 | N4 | Count each gap on a number line as 1. | Find the value of each gap first. |
| 7.9-shape-vertices | 1 | coordinate-swap | Write y before x. | Coordinates are written (x, y). |
| 7.9-shape-vertices | 3 | M3 | Use base times height as a triangle's area. | Halve base times perpendicular height. |
| 7.7-radius-diameter | 1 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-radius-diameter | 2 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-radius-diameter | 3 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-circumference | 1 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-circumference | 2 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-circumference | 3 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 7.7-diameter-from-circumference | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.7-diameter-from-circumference | 2 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-diameter-from-circumference | 3 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-area | 1 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 7.7-area | 2 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-area | 3 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 7.7-circle-problems | 1 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-circle-problems | 2 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.7-circle-problems | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 7.11-read-circle-graph | 1 | F7 | Write fraction digits side by side as a decimal. | Divide the numerator by the denominator. |
| 7.11-read-circle-graph | 2 | percent-as-count | Use the percent as the count. | Find that percent of the total count. |
| 7.11-read-circle-graph | 3 | count-as-percent | Use the count as the percent. | Divide the count by the total and multiply by 100. |
| 7.11-make-circle-graph | 1 | count-as-percent | Use the count as the percent. | Divide the count by the total and multiply by 100. |
| 7.11-make-circle-graph | 2 | percent-as-degrees | Use the percent as the angle in degrees. | Multiply the percent as a decimal by 360 degrees. |
| 7.11-make-circle-graph | 3 | count-as-percent | Use the count as the percent. | Divide the count by the total and multiply by 100. |
| 7.12-two-events-outcomes | 1 | outcomes-incomplete | Leave out outcomes that have a different order. | List every ordered outcome once. |
| 7.12-two-events-outcomes | 2 | outcomes-add | Add the outcome counts for two events. | For independent events, multiply the outcome counts. |
| 7.12-experimental-two-events | 1 | theory-as-data | Use the expected share as the observed share. | Use the actual trial count for experimental probability. |
| 7.12-experimental-two-events | 2 | frequency-copy | Copy a trial count for a larger set of trials. | Find the observed share, then scale it to the new total. |
| 7.12-experimental-two-events | 3 | D5 | The results must match the expected share exactly. | Small sets of trials can give different results. |
| 7.6-model-equality | 1 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-model-equality | 2 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-model-equality | 3 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 7.6-solve-two-step | 1 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-solve-two-step | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.6-solve-two-step | 3 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-verify | 1 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 7.6-verify | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.6-division-form | 1 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-division-form | 2 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.6-division-form | 3 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-model-problem | 1 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.6-model-problem | 2 | equation-roles | Put the total where the change belongs. | Check the start, the change and the total. |
| 7.6-model-problem | 3 | A6 | Stop before undoing every operation in an equation. | Undo each operation, doing the same to both sides. |
| 7.5-evaluate-relation | 1 | A3 | Put a coefficient beside a value as digits. | Multiply the coefficient by the value. |
| 7.5-evaluate-relation | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.5-evaluate-relation | 3 | O7 | Do all operations from left to right. | Use brackets, powers, multiply or divide, then add or subtract. |
| 7.5-table-of-values | 1 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 7.5-table-of-values | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.5-table-of-values | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.5-table-to-relation | 1 | A5 | Use only the step size in a rule. | Include the starting value too. |
| 7.5-table-to-relation | 2 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 7.5-relation-in-context | 1 | step-as-addend | Add the input instead of multiplying by the rate. | Multiply the rate by the input, then add the start. |
| 7.5-relation-in-context | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 7.5-plot-relation | 1 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 7.5-plot-relation | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.5-graph-relation | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.5-graph-relation | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 7.5-relation-from-graph | 1 | A5 | Use only the step size in a rule. | Include the starting value too. |
| 7.5-relation-from-graph | 2 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 7.8-prism-volume | 1 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 7.8-prism-volume | 2 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 7.8-cylinder-volume | 1 | M9 | Add lengths to find volume. | For a rectangular prism, multiply length, width and height. |
| 7.8-cylinder-volume | 2 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 7.8-cylinder-volume | 3 | M10 | Use the radius as the diameter. | The diameter is twice the radius. |
| 7.8-volume-problems | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 7.8-volume-problems | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 7.8-volume-problems | 3 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 7.10-transform-four-quadrants | 1 | transform-sign | Change a coordinate in the wrong direction. | Check each horizontal and vertical move with its sign. |
| 7.10-transform-four-quadrants | 2 | transform-sign | Change a coordinate in the wrong direction. | Check each horizontal and vertical move with its sign. |
| 7.10-transform-four-quadrants | 3 | transformation-name | Use slide, flip and turn as the same move. | A slide moves, a flip reflects and a turn rotates. |
| 7.10-combine | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 7.10-combine | 2 | transform-sign | Change a coordinate in the wrong direction. | Check each horizontal and vertical move with its sign. |
| 7.10-describe | 1 | transform-sign | Change a coordinate in the wrong direction. | Check each horizontal and vertical move with its sign. |
| 7.10-describe | 2 | transform-name | Name a move from just one changed sign. | Check both coordinates and the axis or centre of the move. |
| 7.13-sales-tax-tip | 1 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 7.13-sales-tax-tip | 2 | amount-not-total | Give only the change in an amount. | Apply the change to the original amount to find the total. |
| 7.13-sales-tax-tip | 3 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 7.13-sale-price | 1 | discount-price | Give the discount as the sale price. | Subtract the discount from the original price. |
| 7.13-sale-price | 2 | discount-price | Give the discount as the sale price. | Subtract the discount from the original price. |
| 7.13-total-cost | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 7.13-total-cost | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.1-squares-cubes | 1 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 8.1-squares-cubes | 2 | cube-as-square | Use two factors for a cube. | A cube uses three equal factors: 3³ = 3 × 3 × 3 = 27. |
| 8.1-squares-cubes | 3 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 8.1-identify-perfect | 1 | square-neighbour | A number near a perfect square is also a square. | It must equal a whole number multiplied by itself. |
| 8.1-identify-perfect | 3 | cube-neighbour | A number near a perfect cube is also a cube. | It must equal three equal whole-number factors multiplied. |
| 8.1-prime-factorization | 1 | tree-incomplete | Stop a factor tree with a composite factor. | Keep splitting until every factor is prime. |
| 8.1-prime-factorization | 2 | tree-incomplete | Stop a factor tree with a composite factor. | Keep splitting until every factor is prime. |
| 8.1-prime-factorization | 3 | prime-composite | Call a number prime without checking its factors. | A prime number has exactly two factors, 1 and itself. |
| 8.1-perfect-by-factors | 1 | pair-one-prime | One pair of prime factors makes a perfect square. | Every prime factor needs a partner for a square. |
| 8.1-perfect-by-factors | 2 | pair-one-prime | One pair of prime factors makes a perfect square. | Every prime factor needs a partner for a square. |
| 8.1-perfect-by-factors | 3 | pair-one-prime | One pair of prime factors makes a perfect square. | Every prime factor needs a partner for a square. |
| 8.7-parts | 1 | coefficient-name | Call the coefficient the constant. | A coefficient multiplies a variable. A constant has no variable. |
| 8.7-parts | 2 | coefficient-name | Call the coefficient the constant. | A coefficient multiplies a variable. A constant has no variable. |
| 8.7-parts | 3 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 8.7-write-expression | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 8.7-write-expression | 2 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 8.7-write-expression | 3 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 8.7-evaluate | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.7-evaluate | 2 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 8.7-combine-terms | 1 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 8.7-combine-terms | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 8.7-combine-terms | 3 | variable-one | Use a variable's value in only one term. | Replace every copy of the variable with its given value. |
| 8.7-substitute-formula | 1 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.7-substitute-formula | 2 | half-area | Leave out the half in a trapezoid's area. | Add the parallel sides, multiply by height, then halve. |
| 8.7-substitute-formula | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.8-one-step-integers | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 8.8-one-step-integers | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.8-model-balance | 1 | balance-one-side | Change one side of an equation only. | Do the same operation to both sides. |
| 8.8-model-balance | 2 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.8-solve-two-step-integers | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.8-solve-two-step-integers | 2 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.8-solve-two-step-integers | 3 | undo-order | Undo the operations in their original order. | Undo operations in reverse order on both sides. |
| 8.8-verify | 1 | check-one-side | Work out one side and accept the solution. | Substitute the value and compare both sides. |
| 8.8-verify | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.8-verify | 3 | check-one-side | Work out one side and accept the solution. | Substitute the value and compare both sides. |
| 8.8-word-problems | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.8-word-problems | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.8-word-problems | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.4-rates | 1 | rate-ratio-kind | Treat a rate as a ratio of the same units. | A rate compares quantities with different units. |
| 8.4-rates | 2 | rate-inverse | Divide in the reverse order for a rate. | Put the quantity you need on top and the per unit below. |
| 8.4-rates | 3 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 8.4-three-term-ratio | 1 | ratio-order | Swap the order of parts in a ratio. | Keep the same order as the named quantities. |
| 8.4-three-term-ratio | 2 | ratio-simplify-partial | Stop while all ratio parts still share a factor. | Divide all parts by their greatest common factor. |
| 8.4-three-term-ratio | 3 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 8.4-ratio-share | 1 | share-equal | Use equal shares for an unequal ratio. | Find one ratio part, then multiply by each part count. |
| 8.4-ratio-share | 2 | share-equal | Use equal shares for an unequal ratio. | Find one ratio part, then multiply by each part count. |
| 8.4-solve-proportion | 1 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 8.4-solve-proportion | 2 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 8.4-solve-proportion | 3 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 8.4-proportion-problems | 1 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 8.4-proportion-problems | 2 | operation | Add every number you see. | Check whether to add or take away. |
| 8.4-proportion-problems | 3 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 8.11-views | 1 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 8.11-views | 2 | view-swap | Use a different side as the requested view. | Check which direction you look from. |
| 8.11-views | 3 | view-swap | Use a different side as the requested view. | Check which direction you look from. |
| 8.11-nets | 1 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 8.11-nets | 2 | faces-corners | Count a corner as a face. | A face is flat. A corner is where edges meet. |
| 8.11-nets | 3 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 8.2-square-root | 1 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.2-square-root | 2 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.2-square-root | 3 | fraction-one-side | Change just the top or bottom of a fraction. | Multiply or divide both by the same number. |
| 8.2-cube-root | 1 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.2-cube-root | 2 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.2-cube-root | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.2-estimate-root | 1 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.2-estimate-root | 2 | root-estimate | Choose a square root by a guess alone. | Compare the number with the squares of neighbouring whole numbers. |
| 8.2-estimate-root | 3 | root-half | Halve the area to find a square's side. | Find the number that multiplies by itself to give the area. |
| 8.10-model | 1 | hypotenuse-leg-swap | Pick a leg as the hypotenuse. | The hypotenuse is opposite the right angle and is the longest side. |
| 8.10-model | 2 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-model | 3 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-hypotenuse | 1 | pythagoras-no-root | Give the squared length as the side length. | Take the square root after finding the squared length. |
| 8.10-hypotenuse | 2 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-hypotenuse | 3 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-leg | 1 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-leg | 2 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-leg | 3 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-is-right-triangle | 1 | pythagoras-near | Close side lengths make a right triangle. | The two smaller squares must add exactly to the largest square. |
| 8.10-is-right-triangle | 2 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-is-right-triangle | 3 | pythagoras-near | Close side lengths make a right triangle. | The two smaller squares must add exactly to the largest square. |
| 8.10-word-problems | 1 | pythagoras-no-root | Give the squared length as the side length. | Take the square root after finding the squared length. |
| 8.10-word-problems | 2 | pythagoras-add | Add the side lengths in Pythagoras' rule. | Use squares: a² + b² = c², where c is the hypotenuse. |
| 8.10-word-problems | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.5-add-subtract-fractions | 1 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-add-subtract-fractions | 2 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-add-subtract-fractions | 3 | benchmark-half | Estimate every fraction as 1/2. | Compare each fraction with 0, 1/2 and 1 first. |
| 8.5-add-subtract-unlike | 1 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-add-subtract-unlike | 2 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-add-subtract-unlike | 3 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-subtract-regroup | 2 | regroup-whole-fraction | Trade a whole but keep it in the whole-number part. | Reduce the whole-number part by 1 when you trade it for parts. |
| 8.5-multiply-fractions | 1 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.5-multiply-fractions | 2 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 8.5-multiply-fractions | 3 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 8.5-divide-fractions | 2 | divide-flip-wrong | Flip the first fraction in division. | Keep the first fraction. Multiply by the reciprocal of the second. |
| 8.5-divide-fractions | 3 | divide-flip-wrong | Flip the first fraction in division. | Keep the first fraction. Multiply by the reciprocal of the second. |
| 8.5-fraction-order-of-operations | 1 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 8.5-fraction-order-of-operations | 2 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 8.5-fraction-order-of-operations | 3 | brackets-ignored | Ignore the brackets and multiply first. | Work inside the brackets first. |
| 8.5-fraction-word-problems | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.3-convert-percents | 1 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-convert-percents | 2 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-convert-percents | 3 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-of-another | 1 | percent-inverse | Reverse the part and whole when finding a percent. | Divide the part by the whole, then multiply by 100. |
| 8.3-percent-of-another | 2 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-over-100 | 1 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-over-100 | 2 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-over-100 | 3 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 8.3-percent-under-1 | 1 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-under-1 | 2 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-under-1 | 3 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-decimal-percent-of | 1 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-decimal-percent-of | 2 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 8.3-decimal-percent-of | 3 | percent-decimal-shift | Move the point only one place for a percent. | Divide by 100 from percent to decimal; multiply by 100 to reverse. |
| 8.3-percent-change | 1 | amount-not-total | Give only the change in an amount. | Apply the change to the original amount to find the total. |
| 8.3-percent-change | 2 | amount-not-total | Give only the change in an amount. | Apply the change to the original amount to find the total. |
| 8.3-percent-change | 3 | amount-not-total | Give only the change in an amount. | Apply the change to the original amount to find the total. |
| 8.3-find-original | 1 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 8.3-find-original | 2 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 8.3-find-original | 3 | percent-of-part | Take the percent of the part to find the whole. | Divide the part by the percent written as a decimal. |
| 8.6-evaluate-relation | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.6-evaluate-relation | 2 | constant-sign | Drop the sign of a constant. | Keep the sign attached to the constant. |
| 8.6-table-of-values | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.6-table-of-values | 2 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 8.6-table-to-relation | 1 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 8.6-table-to-relation | 2 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 8.6-scale-axes | 1 | scale-tick-one | Treat every axis interval as 1. | Divide the change in values by the number of intervals. |
| 8.6-scale-axes | 2 | scale-tick-one | Treat every axis interval as 1. | Divide the change in values by the number of intervals. |
| 8.6-scale-axes | 3 | scale-tick-one | Treat every axis interval as 1. | Divide the change in values by the number of intervals. |
| 8.6-graph-relation | 1 | quadrant-sign | Ignore which coordinate has each sign. | Check the x sign and y sign separately. |
| 8.6-graph-relation | 2 | scale-tick-one | Treat every axis interval as 1. | Divide the change in values by the number of intervals. |
| 8.6-discrete-points | 1 | discrete-join | Join every set of data points. | Join only when values between the points have meaning. |
| 8.6-discrete-points | 2 | discrete-join | Join every set of data points. | Join only when values between the points have meaning. |
| 8.6-discrete-points | 3 | discrete-join | Join every set of data points. | Join only when values between the points have meaning. |
| 8.6-read-graph | 1 | coordinate-swap | Write y before x. | Coordinates are written (x, y). |
| 8.6-read-graph | 2 | check-one-side | Work out one side and accept the solution. | Substitute the value and compare both sides. |
| 8.6-read-graph | 3 | scale-tick-one | Treat every axis interval as 1. | Divide the change in values by the number of intervals. |
| 8.6-relation-from-graph | 1 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 8.6-relation-from-graph | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 8.6-relation-from-graph | 3 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 8.6-relation-in-context | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.6-relation-in-context | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 8.6-solve-for-input | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 8.6-solve-for-input | 2 | input-output-swap | Put the output value in place of the input. | Set the output equal to its given value, then solve for the input. |
| 8.6-solve-for-input | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.9-surface-area | 1 | visible-parts | Count only the faces you can see. | Include the faces on the back and underneath. |
| 8.9-surface-area | 2 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 8.9-surface-area | 3 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 8.9-surface-area-cylinder | 1 | radius-diameter | Put the diameter into a formula that needs the radius. | Halve the diameter to find the radius first. |
| 8.9-surface-area-cylinder | 2 | missing-base | Leave out a base when counting faces. | Count the bases as well as the side faces. |
| 8.9-surface-area-cylinder | 3 | radius-diameter | Put the diameter into a formula that needs the radius. | Halve the diameter to find the radius first. |
| 8.9-sa-or-volume | 1 | volume-not-area | Use square units for volume. | Area uses square units. Volume uses cubic units. |
| 8.9-sa-or-volume | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 8.9-sa-or-volume | 3 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 8.9-sa-or-volume | 4 | volume-not-area | Use square units for volume. | Area uses square units. Volume uses cubic units. |
| 8.12-mean | 1 | sum-for-mean | Give the sum as the mean. | Divide the sum by the number of values. |
| 8.12-mean | 3 | average-kind | Use the same average for every set of data. | Choose mean, median or mode to suit the data and question. |
| 8.12-missing-value-from-mean | 1 | missing-mean-total | Add the mean and the number of values. | Multiply them to get the total, then subtract known values. |
| 8.12-missing-value-from-mean | 2 | missing-mean-total | Add the mean and the number of values. | Multiply them to get the total, then subtract known values. |
| 8.12-missing-value-from-mean | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.12-median | 1 | median-unsorted | Take the middle value before sorting. | Put every value in order, including repeats, then find the middle. |
| 8.12-median | 3 | median-unsorted | Take the middle value before sorting. | Put every value in order, including repeats, then find the middle. |
| 8.12-range | 1 | range-kind | Use the largest value as the range. | Subtract the least value from the greatest. |
| 8.12-range | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 8.12-mode | 1 | mode-largest | Use the largest value as the mode. | The mode is the value that occurs most often. |
| 8.12-mode | 2 | mode-largest | Use the largest value as the mode. | The mode is the value that occurs most often. |
| 8.12-outlier | 2 | outlier-affects-median | An extreme value always changes the median a lot. | Check the middle value; the mean reacts more to extreme values. |
| 8.12-outlier | 3 | outlier-affects-median | An extreme value always changes the median a lot. | Check the middle value; the mean reacts more to extreme values. |
| 8.12-choose-measure | 1 | average-kind | Use the same average for every set of data. | Choose mean, median or mode to suit the data and question. |
| 8.12-choose-measure | 2 | average-kind | Use the same average for every set of data. | Choose mean, median or mode to suit the data and question. |
| 8.12-choose-measure | 3 | average-kind | Use the same average for every set of data. | Choose mean, median or mode to suit the data and question. |
| 8.13-sample-space | 1 | independent-dependent | Call two events independent without checking. | Check whether the first event changes the second event's outcomes. |
| 8.13-sample-space | 2 | outcomes-add | Add the outcome counts for two events. | For independent events, multiply the outcome counts. |
| 8.13-sample-space | 3 | outcomes-add | Add the outcome counts for two events. | For independent events, multiply the outcome counts. |
| 8.13-theoretical-two-events | 1 | probability-add | Add probabilities for two independent events both happening. | Multiply their probabilities. |
| 8.13-theoretical-two-events | 2 | probability-add | Add probabilities for two independent events both happening. | Multiply their probabilities. |
| 8.13-theoretical-two-events | 3 | probability-add | Add probabilities for two independent events both happening. | Multiply their probabilities. |
| 8.13-compare-experimental | 2 | fair-outcome-count | Any difference in trial counts proves a game unfair. | Compare each player's theoretical winning share. |
| 8.13-compare-experimental | 3 | fair-outcome-count | Any difference in trial counts proves a game unfair. | Compare each player's theoretical winning share. |
| 8.14-unit-price | 1 | rate-inverse | Divide in the reverse order for a rate. | Put the quantity you need on top and the per unit below. |
| 8.14-unit-price | 2 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 8.14-unit-price | 3 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 8.14-multi-buy-offers | 1 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 8.14-multi-buy-offers | 2 | free-offer | Buy 2, get 1 free means half price. | One of three is free, so the saving is one third. |
| 8.14-multi-buy-offers | 3 | total-not-unit | The lower total price must be the better value. | Compare prices for the same amount. |
| 8.14-coupons | 2 | percent-successive-add | Add successive percent changes. | Apply each percent to the amount after the last change. |
| 8.14-coupons | 3 | method-step | Stop after the first step. | Check whether another step is needed. |
| 8.14-compare-services | 1 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 8.14-compare-services | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 8.14-compare-services | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 9.2-power-parts | 1 | power-swap | Swap the base and exponent. | The base is repeated as a factor; the exponent counts the factors. |
| 9.2-power-parts | 2 | power-as-sum | Use the exponent as a multiplier. | Use the base as a factor as many times as the exponent says. |
| 9.2-power-parts | 3 | power-product | Raise only one factor of a product to a power. | Apply the power to every factor inside the brackets. |
| 9.2-evaluate-power | 1 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 9.2-evaluate-power | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.2-evaluate-power | 3 | power-sign | Include a minus sign in a power without checking brackets. | In -5² the power comes first: -(5 × 5) = -25. |
| 9.2-evaluate-power | 4 | power-multiply | Multiply by the exponent instead of using equal factors. | A power tells how many times the base is a factor. |
| 9.2-zero-one-exponent | 1 | exponent-one | A power of 1 gives a value of 1. | A power of 1 keeps the base: a¹ = a. |
| 9.2-zero-one-exponent | 2 | zero-exponent | A power of 0 gives 0. | For a nonzero base, a⁰ = 1. |
| 9.2-zero-one-exponent | 3 | zero-exponent | A power of 0 gives 0. | For a nonzero base, a⁰ = 1. |
| 9.2-product-quotient-laws | 1 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-product-quotient-laws | 2 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-product-quotient-laws | 3 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-product-quotient-laws | 5 | base-multiply | Combine different bases by adding exponents. | Add exponents in a product only when the bases match. |
| 9.2-power-laws | 1 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-power-laws | 2 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-power-laws | 3 | power-product | Raise only one factor of a product to a power. | Apply the power to every factor inside the brackets. |
| 9.2-power-laws | 4 | power-product | Raise only one factor of a product to a power. | Apply the power to every factor inside the brackets. |
| 9.2-simplify-evaluate | 1 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-simplify-evaluate | 2 | exponent-multiply | Use the wrong operation on exponents. | Same base: add for products, subtract for quotients, multiply for a power of a power. |
| 9.2-simplify-evaluate | 3 | power-product | Raise only one factor of a product to a power. | Apply the power to every factor inside the brackets. |
| 9.2-simplify-evaluate | 4 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.1-compare-order | 1 | absolute-order | Order numbers by their size without the signs. | Negative numbers come before 0 and positive numbers. |
| 9.1-compare-order | 2 | form-compare | Compare percent, decimal and fraction digits directly. | Change them to the same form first. |
| 9.1-compare-order | 3 | absolute-order | Order numbers by their size without the signs. | Negative numbers come before 0 and positive numbers. |
| 9.1-compare-order | 4 | bounds-error | Pick a number outside the given range. | Check both ends of the range. |
| 9.1-add-subtract | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.1-add-subtract | 2 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 9.1-add-subtract | 3 | fraction-add-across | Add or subtract the denominators too. | Use a common denominator and keep it while combining the tops. |
| 9.1-add-subtract | 4 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.1-multiply-divide | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.1-multiply-divide | 2 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 9.1-multiply-divide | 3 | divide-no-flip | Multiply fractions without changing the divisor. | Divide by multiplying by the reciprocal of the second fraction. |
| 9.1-multiply-divide | 4 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 9.1-order-of-operations | 1 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 9.1-order-of-operations | 2 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 9.1-order-of-operations | 3 | power-sign | Include a minus sign in a power without checking brackets. | In -5² the power comes first: -(5 × 5) = -25. |
| 9.1-word-problems | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.1-word-problems | 2 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 9.1-word-problems | 3 | group-translation | Put a separate amount into every group. | Check which amount is grouped before using brackets. |
| 9.1-word-problems | 4 | ratio-part-as-whole | Treat one part of a ratio as the whole. | Add the parts before finding a fraction of the whole. |
| 9.6-metric-conversions | 1 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-metric-conversions | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-metric-conversions | 3 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-metric-conversions | 4 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-scale-factor | 1 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-scale-factor | 2 | scale-flip | Reverse the old and new lengths in a scale factor. | Divide the new length by the old length. |
| 9.6-scale-factor | 3 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-scale-factor | 4 | scale-one-side | Check or scale only one dimension. | Use the same scale factor for every matching length. |
| 9.6-draw-scale-diagram | 1 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-draw-scale-diagram | 2 | scale-flip | Reverse the old and new lengths in a scale factor. | Divide the new length by the old length. |
| 9.6-draw-scale-diagram | 3 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-draw-scale-diagram | 4 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-use-scale | 1 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 9.6-use-scale | 2 | scale-flip | Reverse the old and new lengths in a scale factor. | Divide the new length by the old length. |
| 9.6-use-scale | 3 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-use-scale | 4 | scale-flip | Reverse the old and new lengths in a scale factor. | Divide the new length by the old length. |
| 9.6-similar-shapes | 1 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 9.6-similar-shapes | 2 | scale-one-side | Check or scale only one dimension. | Use the same scale factor for every matching length. |
| 9.6-similar-shapes | 3 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 9.6-similar-shapes | 4 | one-attribute | Check only one feature of a group. | Check every feature in the sorting rule. |
| 9.6-similar-missing-side | 1 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-similar-missing-side | 2 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-similar-missing-side | 3 | scale-additive | Add the same amount to each length or ratio part. | Multiply each by the same scale factor. |
| 9.6-similar-missing-side | 4 | scale-one-side | Check or scale only one dimension. | Use the same scale factor for every matching length. |
| 9.6-indirect-measurement | 1 | ratio-order | Swap the order of parts in a ratio. | Keep the same order as the named quantities. |
| 9.6-indirect-measurement | 2 | unit-convert | Change units with no scale factor. | Use the unit link: 1 m = 100 cm. |
| 9.6-indirect-measurement | 3 | scale-one-side | Check or scale only one dimension. | Use the same scale factor for every matching length. |
| 9.3-vocabulary | 1 | constant-sign | Drop the sign of a constant. | Keep the sign attached to the constant. |
| 9.3-vocabulary | 2 | degree-terms | Count terms or coefficients as the degree. | The degree is the greatest sum of variable exponents in one term. |
| 9.3-vocabulary | 3 | degree-terms | Count terms or coefficients as the degree. | The degree is the greatest sum of variable exponents in one term. |
| 9.3-algebra-tiles | 1 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-algebra-tiles | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.3-algebra-tiles | 3 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.3-algebra-tiles | 4 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.3-like-terms | 1 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-like-terms | 2 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-like-terms | 3 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-like-terms | 4 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-add | 1 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-add | 2 | add-exponents | Add exponents when adding like terms. | Add coefficients. Keep the variable part unchanged. |
| 9.3-add | 3 | like-terms | Terms with the same coefficient are like terms. | Like terms have the same variable part and powers. |
| 9.3-add | 4 | constant-sign | Drop the sign of a constant. | Keep the sign attached to the constant. |
| 9.3-subtract | 1 | sign-distribute | Change only the first sign after a minus before brackets. | Change every sign inside those brackets. |
| 9.3-subtract | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.3-subtract | 3 | sign-distribute | Change only the first sign after a minus before brackets. | Change every sign inside those brackets. |
| 9.3-subtract | 4 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.3-multiply-monomial | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.3-multiply-monomial | 2 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.3-multiply-monomial | 3 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.3-multiply-monomial | 4 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.3-divide-monomial | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.3-divide-monomial | 2 | monomial-variable | Divide coefficients but leave variables unchanged. | Divide each variable part too, using exponent laws. |
| 9.3-divide-monomial | 3 | monomial-variable | Divide coefficients but leave variables unchanged. | Divide each variable part too, using exponent laws. |
| 9.3-divide-monomial | 4 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.7-population-sample | 1 | sample-population | Use the whole population as the sample. | The sample is the part studied; the population is the whole group. |
| 9.7-population-sample | 2 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 9.7-population-sample | 3 | sample-population | Use the whole population as the sample. | The sample is the part studied; the population is the whole group. |
| 9.7-sampling-methods | 1 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.7-sampling-methods | 2 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.7-sampling-methods | 3 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.7-bias | 1 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.7-bias | 2 | question-bias | Keep wording that suggests the desired answer. | Use neutral wording that does not suggest an answer. |
| 9.7-bias | 3 | question-bias | Keep wording that suggests the desired answer. | Use neutral wording that does not suggest an answer. |
| 9.7-misleading-stats | 1 | graph-misread | Read a value without checking the scale. | Check the value of each interval first. |
| 9.7-misleading-stats | 2 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.7-misleading-stats | 3 | average-kind | Use the same average for every set of data. | Choose mean, median or mode to suit the data and question. |
| 9.7-sample-to-population | 1 | decimal-point | Put a decimal digit in any place. | Check tenths, hundredths and thousandths from the point. |
| 9.7-sample-to-population | 2 | percent-as-count | Use the percent as the count. | Find that percent of the total count. |
| 9.7-sample-to-population | 3 | frequency-copy | Copy a trial count for a larger set of trials. | Find the observed share, then scale it to the new total. |
| 9.7-sample-to-population | 4 | sample-bias | A convenient sample must represent everyone. | Check whether every group has a fair chance to be included. |
| 9.8-budget | 1 | operation | Add every number you see. | Check whether to add or take away. |
| 9.8-budget | 2 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 9.8-budget | 3 | product-as-sum | Add a factor and a value instead of multiplying. | Multiply the factors to find the product. |
| 9.8-budget | 4 | fee-sign | Treat income and expenses as the same kind of change. | Income adds money. Expenses take money away. |
| 9.8-bank-record | 1 | fee-sign | Treat income and expenses as the same kind of change. | Income adds money. Expenses take money away. |
| 9.8-bank-record | 2 | fee-sign | Treat income and expenses as the same kind of change. | Income adds money. Expenses take money away. |
| 9.8-bank-record | 3 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.8-simple-interest | 1 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 9.8-simple-interest | 2 | interest-time | Find one year's interest for a different time period. | Use I = Prt with the time in years. |
| 9.8-simple-interest | 3 | interest-time | Find one year's interest for a different time period. | Use I = Prt with the time in years. |
| 9.8-simple-interest | 4 | interest-time | Find one year's interest for a different time period. | Use I = Prt with the time in years. |
| 9.8-planned-purchase | 1 | inverse-operation | Add the total to a known part. | Take the known part from the total. |
| 9.8-planned-purchase | 2 | percent-as-amount | Use the percent number as the amount. | Divide the percent by 100, then multiply by the whole. |
| 9.8-planned-purchase | 3 | total-for-interest | Give the whole payment as the interest. | Subtract the original amount from the total paid. |
| 9.4-table-of-values | 1 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.4-table-of-values | 2 | fraction-flip | Put all the parts on top. | The top counts chosen parts. The bottom counts all parts. |
| 9.4-table-of-values | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.4-write-relation | 1 | add-before-multiply | Add before multiplying in an expression with no brackets. | Do the multiplication first. |
| 9.4-write-relation | 2 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 9.4-write-relation | 3 | constant-sign | Drop the sign of a constant. | Keep the sign attached to the constant. |
| 9.4-graph-line | 1 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.4-graph-line | 2 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.4-graph-line | 3 | rule-one-row | Use a rule that fits just one row. | Test the rule on every given row. |
| 9.4-horizontal-vertical | 1 | line-orientation | Swap horizontal and vertical lines. | Horizontal lines keep y fixed. Vertical lines keep x fixed. |
| 9.4-horizontal-vertical | 2 | line-orientation | Swap horizontal and vertical lines. | Horizontal lines keep y fixed. Vertical lines keep x fixed. |
| 9.4-horizontal-vertical | 3 | coordinates-swap | Write the up value before the across value. | Write x first, then y: across, then up. |
| 9.4-horizontal-vertical | 4 | line-orientation | Swap horizontal and vertical lines. | Horizontal lines keep y fixed. Vertical lines keep x fixed. |
| 9.4-analyze-graph | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 9.4-analyze-graph | 2 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 9.4-analyze-graph | 3 | change-order | An increasing set of values must be linear. | For equal input steps, check that every output change is the same. |
| 9.4-analyze-graph | 4 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 9.4-interpolate | 1 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 9.4-interpolate | 2 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 9.4-interpolate | 3 | graph-value | Use one value when asked for the change. | Subtract the starting value from the ending value. |
| 9.4-extrapolate | 1 | pattern-start-step | Use the starting number as the step size. | Find the change between two neighbours. |
| 9.4-extrapolate | 2 | rule-from-change | Use a rule without checking every value. | Check both the start and the change from one value to the next. |
| 9.5-model-pictorially | 1 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-model-pictorially | 2 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-distribute | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-distribute | 2 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-distribute | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-distribute | 4 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-collect-like-terms | 1 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.5-collect-like-terms | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-collect-like-terms | 3 | opposite-sign | Give the right size with the wrong sign. | Check the direction and whether the result is above or below 0. |
| 9.5-collect-like-terms | 4 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-variables-both-sides | 1 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-variables-both-sides | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-variables-both-sides | 3 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-variables-both-sides | 4 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-rational-coefficients | 1 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-rational-coefficients | 2 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-rational-coefficients | 3 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-rational-coefficients | 4 | balance-opposite | Change sides without keeping their values equal. | Use inverse steps and do the same operation to both sides. |
| 9.5-multi-step | 1 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-multi-step | 2 | sign-rule | Ignore the signs when multiplying or dividing. | Same signs give positive. Different signs give negative. |
| 9.5-multi-step | 3 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-word-problems | 1 | known-as-unknown | Give the number you already know. | Find the missing part, not the part given. |
| 9.5-word-problems | 2 | distribute-one | Multiply only one part of the number. | Multiply every part, then add the results. |
| 9.5-word-problems | 3 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |
| 9.5-word-problems | 4 | ignores-given | Stop without using a needed amount. | Check all the amounts and finish each needed step. |

## C2-R2: step-specific independent verification

Each pair below was written for its own step. A separate subscription model checked the complete context and exact text. Rejected pairs were revised at most twice. The final rejected pairs were removed. The JSON verification report records every attempt and reason. Original question fields and answer keys stay unchanged.

| Skill | Step | Mistake | Final wrong / fix or removal reason | Verifier |
|---|---|---|---|---|
| K1-rote-count-10 | 1 | 1 | Counts 1, 2, 4 and skips 3. / Say every number in order with none missed: 1, 2, 3, 4, 5. After 3 comes 4, then 5. | claude-opus-5-5 |
| K1-rote-count-10 | 2 | 1 | Counts 7, 8, 9 and stops, or keeps going to 11. / Keep counting until 10 and stop there: 7, 8, 9, 10. | claude-opus-5-5 |
| K1-rote-count-10 | 3 | 1 | DROPPED: Source is inconsistent. The example starts at 3 (3, 4, 5, then two blanks, answer 6, 7). The mistake answer 4, 4, 5 doesn't fit those blanks or that start. Saying the start twice would give 3, 3, 4. A pair would need a different example or answer. | none |
| K1-count-objects | 1 | 1 | Counts one of the 3 apples twice and says 4. / Touch each apple once and say one number for it: 1, 2, 3. The total is 3. | claude-opus-5-5 |
| K1-count-objects | 2 | 1 | Counts 8 objects in a row but misses the last one and says 7. / Count every object once, right to the very last one. The 8th object makes 8. | claude-opus-5-5 |
| K1-count-objects | 3 | 1 | Says 1, 2, 3, 4, 5, 6, 7 when asked how many flowers. / The last number you say tells how many. Say just 7 for 7 flowers. | claude-opus-5-5 |
| K1-how-many | 1 | 1 | Picks 5 for 4 ducks by saying the next number after 4. / Stop at the last duck counted: 1, 2, 3, 4. The answer is 4, not the next number. | claude-opus-5-5 |
| K1-how-many | 2 | 1 | Counts 8 apples as 7 or 9 by missing one or counting one twice. / Touch each apple once, from 1 to 8. The last number said is 8. | claude-opus-5-5 |
| K1-how-many | 3 | 1 | Says a new total after counting the same 5 from the other end. / The total is still 5. Counting each one once gives 5 from any start. | claude-opus-5-5 |
| K1-count-scattered | 1 | 1 | Counts one of the 4 shells twice and says 5. / Cross off each shell as you count it so none is counted again. The total is 4. | claude-opus-5-5 |
| K1-count-scattered | 2 | 1 | DROPPED: The count is correct (8 buttons, mistake 7) and the wrong statement matches 'loses track without marking'. Length is 149 chars, within the limit. But the problem is a picture of buttons, and the fix says to 'Move each one aside as you count it'. A child can't move objects in a picture, so the fix can't be used here. A usable fix would match the stated cause: touch or cross off each button as you count it. | none |
| K1-count-scattered | 3 | 1 | Counts the star stone again at the end of the circle and says 8. / Stop at the star. It was counted first as 1, so the total for 7 stones is 7. | claude-opus-5-5 |
| K1-conservation | 1 | 1 | Says no because the spread-out 4 cubes look like more. / Moving cubes apart adds or removes none, so it is still 4. The answer is yes. | claude-opus-5-5 |
| K1-conservation | 2 | 1 | Says no since 5 beads in a circle look smaller than in a line. / Shape doesn't change the count. Nothing was added or removed, so both are 5. | claude-opus-5-5 |
| K1-recognize-numerals | 1 | 1 | Reads the numeral 3 as 4 and picks the group of 4. / 3 is made of curves, 4 has straight lines. Count each group and pick the one with 3. | claude-opus-5-5 |
| K1-recognize-numerals | 2 | 1 | Turns the 9 upside down, reads it as 6, and picks 6 stars. / Keep the numeral upright: 9 has its loop on top and tail down. Pick 9 stars. | claude-opus-5-5 |
| K1-recognize-numerals | 3 | 1 | Picks the box with 1 apple for 0, thinking a number needs something. / 0 means none. The box with 0 apples is the empty box. | claude-opus-5-5 |
| K1-write-numerals | 1 | 1 | Writes the 3 backwards, with the bumps facing left. / Start at the top, curve around to the right, then curve right again. The bumps face right. | claude-opus-5-5 |
| K1-write-numerals | 2 | 1 | DROPPED: The source is inconsistent. The example asks the child to trace a dotted 8 (answer 8), but the stated mistake is writing 10 as 01, which can't happen on that example. The fix also says to write the 1 and then the 0, but the task is tracing over dots, so it doesn't give the right method for this step. 10 is within the 6-10 range, but the mismatch between example and mistake means rejection. | none |
| K1-write-numerals | 3 | 1 | Writes the 4 flipped, facing the wrong way. / In a 4, the tall straight line is on the right and the slanted line is on the left. | claude-opus-5-5 |
| K1-match-set-numeral | 1 | 1 | For 3 hats I picked 4 because I kept counting past the last hat. / Say one number per hat, 1, 2, 3, then stop. The last number said is 3. | claude-opus-5-5 |
| K1-match-set-numeral | 2 | 1 | For 8 beads I picked 9 because I miscounted the set. / Count each bead once, 1 to 8, and no more. The last number said is 8. | claude-opus-5-5 |
| K1-count-out | 1 | 1 | I made 4 items for a box showing 3 because I kept going past 3. / Count as you make each one, 1, 2, 3, then stop at 3. | claude-opus-5-5 |
| K1-count-out | 2 | 1 | For 8 stars I made 7 or 9 because I lost count while making them. / Say each number as you make a star, 1 to 8, and stop at 8. Then recount. | claude-opus-5-5 |
| K1-number-sequence | 1 | 1 | In 1 2 __ 4 5 I wrote 2, copying the number before the gap. / Count on: 2, then 3, then 4. The gap is 3. | claude-opus-5-5 |
| K1-number-sequence | 2 | 1 | I said the number just after 6 is 5. / After means the next number counting up: 6, 7. Just after 6 is 7. | claude-opus-5-5 |
| K1-number-sequence | 3 | 1 | In 1 __ 3 __ 5, puts 2 in both gaps, copying the 2 just written. / Count up by 1 from 3: the second gap is 4, so the answer is 2, 4. | claude-opus-5-5 |
| K1-order-numerals | 1 | 1 | I put 3 1 2 in order as 3, 1, 2, the same order shown. / Order starts with the smallest: 1, then 2, then 3. | claude-opus-5-5 |
| K1-order-numerals | 2 | 1 | I put 9, 7, 8 in order as 9, 8, 7, biggest first. / Counting order goes smallest to biggest: 7, 8, 9. | claude-opus-5-5 |
| K1-order-numerals | 3 | 1 | I put 10, 0, 5 in order as 10, 5, 0, starting with the biggest. / Counting order starts with the smallest, 0, then 5, then 10. | claude-opus-5-5 |
| K4-spot-pattern | 1 | 1 | I said red blue red blue red blue isn't a pattern because it isn't fancy. / A pattern is a part that repeats. Red blue repeats 3 times, so yes. | claude-opus-5-5 |
| K4-spot-pattern | 2 | 1 | I said sun cloud rain sun rain is a pattern because the start matches. / Check the whole row. After sun comes rain, not cloud, so it breaks: no. | claude-opus-5-5 |
| K4-spot-pattern | 3 | 1 | I said no to red white red white red white because it looks long and busy. / Ignore size. Red white repeats again and again, so yes. | claude-opus-5-5 |
| K4-extend-repeating | 1 | 1 | After red blue red blue I picked blue, repeating the last one. / The core is red blue, so after blue it starts again with red. | claude-opus-5-5 |
| K4-extend-repeating | 2 | 1 | After star star moon star star moon star star I picked star, repeating the last. / The core is star star moon. Two stars are done, so moon is next. | claude-opus-5-5 |
| K4-extend-repeating | 3 | 1 | After red blue blue red blue blue I started with blue, not the core's start. / The core red blue blue just ended, so begin again: red, blue, blue. | claude-opus-5-5 |
| K4-missing-element | 1 | 1 | In red blue red __ red blue I put red, the one before the blank. / Red and blue take turns. After red comes blue, so the blank is blue. | claude-opus-5-5 |
| K4-missing-element | 2 | 1 | In sun moon star sun __ star I put sun, the first of the core again. / The core is sun moon star. Sun just came, so moon is next. | claude-opus-5-5 |
| K4-missing-element | 3 | 1 | In red blue green red __ green red blue __ I filled only one blank. / Fill both. The core red blue green repeats, so the blanks are blue and green. | claude-opus-5-5 |
| K4-identify-core | 1 | 1 | For red blue red blue red blue I circled the whole row as the part that repeats. / The core is the smallest part that repeats: red blue, 3 times. | claude-opus-5-5 |
| K4-identify-core | 2 | 1 | Says the core is sun moon, leaving out one sun. / The whole repeating part is sun sun moon, then it starts again. | claude-opus-5-5 |
| K4-identify-core | 3 | 1 | In A B C A B C A B, says the core is A B, the end of the row. / Start at the front: A B C repeats, so it is the core. The end A B is unfinished. | claude-opus-5-5 |
| K4-create-pattern | 1 | 1 | Fills 6 boxes in a random order, like red red blue red blue blue. / Alternate: red blue red blue red blue. | claude-opus-5-5 |
| K4-create-pattern | 2 | 1 | Makes red blue red blue, dropping a red so the core is only 2 long. / Repeat red red blue twice: red red blue red red blue. | claude-opus-5-5 |
| K4-create-pattern | 3 | 1 | Repeats only red and blue, leaving out green. / Use all 3 in order, 3 times: red blue green red blue green red blue green. | claude-opus-5-5 |
| K4-represent-pattern | 3 | 1 | Writes circle square square circle, which changes the pattern. / Swap each one: red = circle, blue = square, giving circle square circle square. | claude-opus-5-5 |
| K10-likelihood-words | 1 | 1 | DROPPED: wrong is not printable; fix is not printable | none |
| K10-likelihood-words | 2 | 1 | DROPPED: wrong is not printable; fix is not printable | none |
| K10-which-more-likely | 1 | 1 | Circles snow in the desert because it sounds fun. / Pick what happens more often: rain forests get rain a lot, deserts rarely get snow. | claude-opus-5-5 |
| K10-which-more-likely | 2 | 1 | Picks a hot day in January because it sounds more exciting. / Pick what happens more often in January: a cold day. | claude-opus-5-5 |
| K2-subitize-to-5 | 1 | 1 | Counts 2 items one by one, slips, and says 3. / Look at the small group at once and see 1 and 1, which is 2. | claude-opus-5-5 |
| K2-subitize-to-5 | 2 | 1 | Counts a middle spot on a die showing 4 and says 5. / A 4 has four corner spots and none in the middle: 2 and 2 make 4. | claude-opus-5-5 |
| K2-subitize-to-5 | 3 | 1 | Picks the card of spots because it looks like the die, not because it shows 3. / Match the amount, not the look: 3 fingers show 3. | claude-opus-5-5 |
| K2-five-frame | 1 | 1 | Fills all 5 squares when asked for 3. / Fill only 3 squares and leave 2 empty. | claude-opus-5-5 |
| K2-five-frame | 2 | 1 | Says 5 for a frame with 4 filled squares, counting the empty one too. / Count only the filled squares: 4 filled, and the 1 empty square doesn't count. | claude-opus-5-5 |
| K2-five-frame | 3 | 1 | Says 3 empty, which is the number filled, not the empty ones. / The frame has 5 squares and 3 are filled, so 5 − 3 = 2 are empty. | claude-opus-5-5 |
| K2-subitize-parts | 1 | 1 | Writes 2 and 1 side by side as 21, making one number. / Write two separate numbers: 2 and 1. They make 3 in all, not 21. | claude-opus-5-5 |
| K2-subitize-parts | 2 | 1 | Writes 4 and 3 side by side as 43 instead of joining them. / Put the groups together: 4 + 3 = 7 in all. | claude-opus-5-5 |
| K2-subitize-parts | 3 | 1 | Writes 7, the whole group, in the blank instead of the part left over. / 7 is the total. 5 are in the circle, so the rest is 7 − 5 = 2: 5 and 2. | claude-opus-5-5 |
| K2-make-5 | 2 | 1 | Writes 3 again in the blank, the number already given. / Find how many more to reach 5: 3 and 2 make 5. | claude-opus-5-5 |
| K2-make-5 | 3 | 1 | Writes 4 for '__ and 4 make 5' by copying the 4 already shown. / Find what goes with 4 to make 5: 4 and 1 make 5, so the missing part is 1. | claude-opus-5-5 |
| K2-ways-to-make-5 | 1 | 1 | Makes 2 red and 2 blue, so only 4 of the 5 squares get used. / Use all 5: 2 red, then the rest is 3 blue, since 2 and 3 make 5. | claude-opus-5-5 |
| K2-ways-to-make-5 | 2 | 1 | Writes 3 and 3 by repeating the 3 from the pair. / 3 and what make 5? 3 and 2 make 5, so the blank is 2. | claude-opus-5-5 |
| K2-ways-to-make-5 | 3 | 1 | DROPPED: The blank needs a number, and the key is 5. The wrong answer 'No change' is not a number, so it can't be a wrong fill-in. If it means the total stays the same, it is right, not wrong. That clashes with the stated cause, 'thinks it is a new fact'. No one wrong move fits all three. | none |
| K2-match-to-compare | 1 | 1 | Stops matching early and circles just 1 extra bowl. / Match all 3 cats to bowls, then circle every bowl left over: 2 extra. | claude-opus-5-5 |
| K2-match-to-compare | 2 | 1 | Says yes, because one row looks longer. / Match each bee to a flower: 4 and 4 pair up with none left, so no. | claude-opus-5-5 |
| K2-match-to-compare | 3 | 1 | DROPPED: The wrong answer is blank, so no wrong outcome is given. The stated cause is picking whichever group looks longer. A row of 9 is the longer group and is also the key answer, 'the dots'. So the example doesn't show a wrong result, and no sound pair can be written without changing it. | none |
| K2-compare-quantities | 2 | 1 | Says 6 ducks has more, choosing one group when both have 6. / 6 ducks and 6 frogs match with none left over, so the answer is same. | claude-opus-5-5 |
| K2-compare-quantities | 3 | 1 | Says 6 has more because the spread-out group takes up more room. / Count each: 8 is more than 6, so the close-together group has more. | claude-opus-5-5 |
| K2-compare-numbers | 2 | 1 | Circles 7 for less because it is the larger number. / Less means smaller: 4 is less than 7, so circle 4. | claude-opus-5-5 |
| K2-compare-numbers | 3 | 1 | Picks 1 as less, treating 0 as not a number to compare. / 0 is a number meaning none, and 0 is less than 1, so circle 0. | claude-opus-5-5 |
| K7-baseline | 1 | 1 | Picks the line-up where one pencil sticks out, thinking it is longer. / Fair means both pencils start at the same line, so pick the first. | claude-opus-5-5 |
| K7-baseline | 2 | 1 | Says nothing is wrong, missing that one pencil starts further right. / Both pencils must start at the same place. They don't, so it is unfair. | claude-opus-5-5 |
| K7-compare-length | 1 | 1 | Circles the short pencil when asked for the longer one. / Longer means reaches further from the start, so circle the long pencil. | claude-opus-5-5 |
| K7-compare-mass-capacity | 1 | 1 | Picks the feather, thinking the bigger-looking one is heavier. / Heavier means weighs more, not looks bigger. A rock weighs more than a feather. | claude-opus-5-5 |
| K7-compare-mass-capacity | 2 | 1 | Says the right is heavier because it is the side that goes up. / The heavier side goes down. The left is lower, so the left is heavier. | claude-opus-5-5 |
| K7-compare-capacity | 1 | 1 | Picks the cup as holding more because it looks full. / How full it is now doesn't matter. The big bucket has more room inside, so it holds more. | claude-opus-5-5 |
| K8-positional-words | 1 | 1 | Says the cat is under the box, mixing up top and bottom. / On means on top. The cat is on top of the box, so circle on. | claude-opus-5-5 |
| K8-positional-words | 2 | 1 | Says the girl is behind the tree, reversing front and back. / The tree is behind her, so she is in front of the tree. | claude-opus-5-5 |
| K8-describe-2d | 1 | 1 | Says a circle has straight sides because straight sides are common. / A circle's edge bends all the way round with no straight parts, so curved. | claude-opus-5-5 |
| K8-describe-2d | 2 | 1 | Saying a triangle has 4 corners because one corner got counted twice. / Count each corner once as you go around: a triangle has 3 corners. | claude-opus-5-5 |
| K8-describe-3d | 1 | 1 | Saying a can lying on its side does not roll. / A can rolls on its curved side, so on its side it rolls. It only stays put standing on a flat end. | claude-opus-5-5 |
| K8-describe-3d | 2 | 1 | Saying a can cannot be stacked because it is round. / A can has flat ends, so it stacks on its flat end. Only its curved side rolls. | claude-opus-5-5 |
| K8-describe-3d | 3 | 1 | Picking can for a soccer ball by guessing. / Check the shape: a soccer ball is round all over, like a ball. A can has flat ends. | claude-opus-5-5 |
| K8-same-shape | 1 | 1 | Saying a big and a small triangle are different kinds because of size. / Size does not change the kind. Both have 3 sides, so both are triangles. | claude-opus-5-5 |
| K8-same-shape | 2 | 1 | Saying a triangle pointing down is a different kind from one pointing up. / Turning does not change the kind. Both have 3 sides and 3 corners. | claude-opus-5-5 |
| K8-same-shape | 3 | 1 | Choosing the biggest shape as the odd one out. / Compare kinds, not size. In triangle, triangle, square, triangle, the square is odd: 4 sides, not 3. | claude-opus-5-5 |
| K8-create-2d | 2 | 1 | DROPPED: The task 'Make an animal from shapes' is open and never requires different kinds of shapes. The 4-6 piece rule could be broken by one piece or by one kind of shape, and the source doesn't say which. The wrong answer is blank. Since an animal made from one kind of shape is valid here, no sound pair exists. | none |
| K8-shape-attributes | 1 | 1 | Choosing the circle as a shape with corners. / A circle has 0 corners. The triangle (3) and square (4) have corners, so choose those. | claude-opus-5-5 |
| K8-shape-attributes | 2 | 1 | Choosing the box as an object that rolls. / A box has flat faces and slides. The ball and can have curved surfaces, so they roll. | claude-opus-5-5 |
| K3-ten-frame | 3 | 1 | Saying 5 for a frame with a full top row of 5 and 3 more below. / Count both rows: 5 in the top row plus 3 in the bottom row is 5 + 3 = 8. | claude-opus-5-5 |
| K3-benchmarks-5-10 | 1 | 1 | Saying 3 is more than 5. / Counting up, 3 comes before 5 (3, 4, 5), so 3 is less than 5. | claude-opus-5-5 |
| K3-benchmarks-5-10 | 2 | 1 | Saying 9 is close to 0. / 9 is 1 away from 10 but 9 away from 0, so 9 is close to 10. | claude-opus-5-5 |
| K3-benchmarks-5-10 | 3 | 1 | Putting 5 in the more than 5 group. / 5 is not more than 5. It is equal to 5, so it goes in the is 5 group. | claude-opus-5-5 |
| K3-decompose-to-10 | 3 | 1 | DROPPED: The prompt is 'Show 6 in two ways: 5 and 1, 4 and __', so the blank follows '4 and'. A child cannot repeat '5 and 1' there, and the correct answer is 2. The wrong answer is blank, and the stated mistake doesn't fit the prompt. Putting 1 in the blank would make 4 and 1, which is 5, a different error. | none |
| K3-make-10 | 1 | 1 | Answering 8 for how many more to reach 10, giving the 8 already filled. / 8 are already filled, so find what is left: 10 - 8 = 2 more. | claude-opus-5-5 |
| K3-part-part-whole | 1 | 1 | Writing the parts 4 and 3 side by side as 43 for the whole. / Join the parts by adding: 4 + 3 = 7. | claude-opus-5-5 |
| K5-one-more-less | 2 | 1 | Saying one less than 7 is 8, going up instead of down. / One less means take 1 away: 7 - 1 = 6. | claude-opus-5-5 |
| K5-one-more-less | 3 | 1 | Saying one more than 9 is 8, taking one away instead of adding. / One more means add 1: 9 + 1 = 10. | claude-opus-5-5 |
| K5-two-more-less | 1 | 1 | Saying two more than 3 is 4, adding only one. / Add 2, not 1: count on 4, 5, so 3 + 2 = 5. | claude-opus-5-5 |
| K5-two-more-less | 2 | 1 | Two less than 6 is 5, taking away only 1. / Take away 2: count back two from 6 (5, 4). Two less than 6 is 4. | claude-opus-5-5 |
| K5-two-more-less | 3 | 1 | 2 less than 9 is 11, adding 2 instead of taking away. / Less means take away. 9 take away 2 is 7. | claude-opus-5-5 |
| K5-add-on-change | 1 | 1 | 3 birds are there and 2 fly in, so it says 2 now, counting only the new ones. / Count all: the 3 birds already there plus the 2 new ones is 5. | claude-opus-5-5 |
| K5-add-on-change | 2 | 1 | 6 apples and 3 more, and it says 3 now, which is just the added amount. / Join the start and the added: 6 + 3 = 9 now. | claude-opus-5-5 |
| K5-add-on-change | 3 | 1 | 5 kids, 4 more get on, and it says 4, the number who got on. / Add them to the 5 already there: 5 + 4 = 9 now. | claude-opus-5-5 |
| K5-take-away-change | 1 | 1 | 5 apples, 2 are eaten, and it adds 5 + 2 = 7. / Eaten means fewer left. 5 take away 2 leaves 3. | claude-opus-5-5 |
| K5-take-away-change | 2 | 1 | 9 cars, 4 drive away, and it says 4 are left, the number that left. / Take away 4 from 9: 9 − 4 = 5 left. | claude-opus-5-5 |
| K5-take-away-change | 3 | 1 | 10 apples, 3 are eaten, and it adds to get 13. / Eaten means take away: 10 − 3 = 7 left, fewer than the 10 start. | claude-opus-5-5 |
| K5-build-and-change | 1 | 1 | A tower of 4 to reach 6 needs 6 more cubes, giving the target. / Find the gap from 4 up to 6: count 5, 6. That is 2 more cubes. | claude-opus-5-5 |
| K5-build-and-change | 2 | 1 | Tower of 7 down to 4, and it says take away 4, the target. / Take away the extra: 7 − 4 = 3 cubes. | claude-opus-5-5 |
| K6-equal-sets | 1 | 1 | Says 3 cups and 3 plates are not equal because they are different things. / Equal compares how many, not the kind. 3 and 3 pair up exactly, so equal. | claude-opus-5-5 |
| K6-equal-sets | 2 | 1 | Says 7 stars and 8 hearts are equal because the sets look alike. / Count each set: 7 and 8. One heart has no partner, so not equal. | claude-opus-5-5 |
| K6-equal-sets | 3 | 1 | Says 6 equals 7 because the numbers are close. / Equal means exactly the same number. 6 and 7 are different, so not equal. | claude-opus-5-5 |
| K6-balance | 1 | 1 | Says not equal for a level balance with 3 cubes on each side. / Level means both sides hold the same amount. 3 and 3 are the same, so equal. | claude-opus-5-5 |
| K6-balance | 2 | 1 | Picks the right side as holding more because it is the side that is up. / The heavier side goes down. Left has 6 and right has 4, so left holds more. | claude-opus-5-5 |
| K6-make-equal | 1 | 1 | Left has 3, right has 5, and it adds 5 to the left, the size of the bigger set. / Add the difference: 5 − 3 = 2 on the left makes both 5. | claude-opus-5-5 |
| K6-make-equal | 2 | 1 | Left has 6, right has 4, and it crosses out 4 from the left. / Cross out the difference: 6 − 4 = 2 from the left, leaving 4 each. | claude-opus-5-5 |
| K9-make-graph | 1 | 1 | Starts the red column and the blue column at different places. / Start both columns on one line, then add 3 squares and 2 squares. | claude-opus-5-5 |
| K9-make-graph | 3 | 1 | Shows only the 5 cats and leaves out the 3 birds. / Sort into both types, then show both: 5 squares for cats and 3 squares for birds. | claude-opus-5-5 |
| K9-count-in-graph | 2 | 1 | Asked how many blue, it says 4, reading the red column. / Look at the blue column, not red. Blue is 6. | claude-opus-5-5 |
| K9-count-in-graph | 3 | 1 | Says 4 for red 4 and blue 3, counting only the red column. / Add both columns: 4 + 3 = 7 in all. | claude-opus-5-5 |
| K9-read-concrete-graph | 1 | 1 | Picks dogs as having more just because it is the right-hand column. / Compare the counts: cats 5 is more than dogs 3, so cats has more. | claude-opus-5-5 |
| K9-read-concrete-graph | 3 | 1 | Picks green because 5 is the middle count of 4, 5 and 7. / Most means the greatest count. 7 is more than 5 and 4, so blue has the most. | claude-opus-5-5 |
| K11-describe-coins | 1 | 1 | DROPPED: The stated wrong answer is blank, and 'Guesses by size' doesn't say which coin was picked. The example also depends on an unseen figure of two coins. A standalone wrong/fix pair can't be checked. The misconception id 'coin-name' also doesn't fit a colour question. | none |
| K11-describe-coins | 2 | 1 | Says the toonie has the loon, mixing up the loon and the polar bear. / The loonie has the loon. The toonie has the polar bear. | claude-opus-5-5 |
| K11-coin-attributes | 1 | 1 | Calls the coin with the loon a toonie because it seems bigger. / Check the design, not size: a loon means loonie. The toonie has a polar bear. | claude-opus-5-5 |
| K11-coin-attributes | 2 | 1 | Names the nickel, thinking the bigger coin is worth more. / Name it by its ship: the dime is smallest but worth 10¢, more than the nickel's 5¢. | claude-opus-5-5 |
| K11-coin-attributes | 3 | 1 | Picks quarter because both coins seem big. / Use the design: a polar bear and two tones mean toonie. The quarter has a caribou. | claude-opus-5-5 |
| K11-role-play-purchase | 1 | 1 | Writes $2 and $1 side by side as $21. / Add the prices: $2 + $1 = $3. | claude-opus-5-5 |
| K11-role-play-purchase | 2 | 1 | Writes $3 and $4 side by side as $34. / Add the prices: $3 + $4 = $7. | claude-opus-5-5 |
| K11-role-play-purchase | 3 | 1 | Adds only two of the three prices, $2 + $3 = $5, and leaves out $1. / Add all three prices: $2 + $1 + $3 = $6. | claude-opus-5-5 |
| K11-wants-needs | 1 | 1 | Calls bread a want because it is wanted a lot. / Bread is food you must have to live, so it is a need, however much you want it. | claude-opus-5-5 |
| K11-wants-needs | 2 | 1 | Calls a new bike a need because it is useful. / A need is required to live. A bike is useful but not required, so it is a want. | claude-opus-5-5 |
| 1.1-count-to-20 | 1 | 1 | Writes 11 as 101, like saying 'ten, one'. / Eleven is 1 ten and 1 one, so write it with two digits: 11. | claude-opus-5-5 |
| 1.1-count-to-20 | 2 | 1 | Writes 15 as 51 because 'five' is said first in 'fifteen'. / Fifteen is 1 ten and 5 ones, so the 1 goes first: 15. | claude-opus-5-5 |
| 1.1-count-to-20 | 3 | 1 | Starts the blanks with 17, repeating the start number. / Count back from the last number, 16: next is 15, then 14. | claude-opus-5-5 |
| 1.1-count-to-20 | 4 | 1 | Gives 15, the number after 14, for just before 14. / Just before means one less: 13 comes right before 14. | claude-opus-5-5 |
| 1.1-read-write-20 | 1 | 1 | Writes 6 for nine by flipping the 9 upside down. / Nine has its loop on top with a tail going down. A 6 has the loop at the bottom. | claude-opus-5-5 |
| 1.1-read-write-20 | 2 | 1 | Writes ten and four as 41, putting the 4 first because it is said first. / Ten and four is 1 ten and 4 ones: the 1 goes first, so 14. | claude-opus-5-5 |
| 1.1-read-write-20 | 3 | 1 | Picks 20 for 'twelve' because twelve and twenty sound alike. / Twelve is 1 ten and 2 ones, so 12. Twenty is 2 tens, so 20. | claude-opus-5-5 |
| 1.1-count-objects-20 | 1 | 1 | Counting 8 apples in a row as 9 by counting one apple twice. / Touch each apple once, saying one number for each. The last number said is 8. | claude-opus-5-5 |
| 1.1-count-objects-20 | 2 | 1 | Counting 10 buttons and 6 buttons as 15 by missing one. / Count on from 10: 11, 12, 13, 14, 15, 16. All 6 get a number, so the total is 16. | claude-opus-5-5 |
| 1.1-count-objects-20 | 2 | 2 | Saying 10 for rows of 10 and 6 buttons by counting only the first row. / Count both rows: 10 and 6 more makes 16. | claude-opus-5-5 |
| 1.1-count-objects-20 | 3 | 1 | Getting 18 or 16 for 17 scattered stars by losing track. / Tick each star once as you count it, so none is missed or repeated. The total is 17. | claude-opus-5-5 |
| 1.1-subitize-to-10 | 1 | 1 | Saying 7 for two rows of 3 by counting the middle one twice. / See two groups of 3. 3 and 3 make 6. | claude-opus-5-5 |
| 1.1-subitize-to-10 | 2 | 1 | Saying 6 or 8 for a full row of 5 with 2 below, by counting empty squares or missing one. / Count only filled spaces: 5 and 2 more is 7. | claude-opus-5-5 |
| 1.1-subitize-to-10 | 3 | 1 | Writing 3 red and 4 blue as 34 by putting the parts side by side. / Add the parts: 3 + 4 = 7 in all. | claude-opus-5-5 |
| 1.1-count-on-back | 1 | 1 | Counting on 3 from 6 as 6, 7, 8 by counting the start as 1. / Don't count 6. Say the next 3 numbers: 7, 8, 9. Land on 9. | claude-opus-5-5 |
| 1.1-count-on-back | 2 | 1 | Counting on 4 from 9 as 9, 10, 11, 12 by counting the start number. / Don't count 9. Say the next 4 numbers: 10, 11, 12, 13. Land on 13. | claude-opus-5-5 |
| 1.1-count-on-back | 3 | 1 | Counting back 3 from 14 as 14, 13, 12 by counting the start number. / Don't count 14. Say the next 3 numbers down: 13, 12, 11. Land on 11. | claude-opus-5-5 |
| 1.1-count-on-back | 4 | 1 | Counting on 4 from 16 to 20 when the question says back. / Back means go down: 15, 14, 13, 12. Land on 12. | claude-opus-5-5 |
| 1.1-one-more-less-20 | 1 | 1 | Giving 6 for 1 more than 7, which is really 1 less. / 1 more is the next number up: 7, then 8. | claude-opus-5-5 |
| 1.1-skip-count-2-5 | 1 | 1 | Filling 2, 4, 6, 7, 8 by counting by 1s. / Count by 2s, adding 2 each time: 6 + 2 = 8, then 8 + 2 = 10. | claude-opus-5-5 |
| 1.1-skip-count-2-5 | 2 | 1 | DROPPED: Source is inconsistent. For '5, 10, __, __' the key is 15, 20. Switching to counting by 1 after 10 would give 11, 12, not 16, 17. The wrong answer 16, 17 doesn't match its 'why', so no sound pair can be written without changing the source. | none |
| 1.1-skip-count-2-5 | 3 | 1 | Naming 5, 10, 15, 16 as the 5s numbers by switching to 1s. / Keep adding 5: 5, 10, 15, 20. After 15 comes 20, not 16. | claude-opus-5-5 |
| 1.1-skip-count-2-5 | 4 | 1 | Saying 4 fingers on 4 hands by counting the hands, not the fingers. / Each hand has 5 fingers, so count by 5s four times: 5, 10, 15, 20. | claude-opus-5-5 |
| 1.1-ten-and-ones | 1 | 1 | Writing 10 and 4 more as 104 by putting 10 and 4 side by side. / 10 and 4 more is 10 + 4 = 14: one ten and 4 ones. | claude-opus-5-5 |
| 1.1-number-line-20 | 3 | 1 | Jumping 3 from 8 and landing on 10 by counting the start tick as 1. / Don't count 8. Make 3 jumps: 9, 10, 11. Land on 11. | claude-opus-5-5 |
| 1.1-compare-order-20 | 2 | 1 | Picking 13 as more than 18 after seeing both start with 1 and stopping. / Both have 1 ten, so compare the ones: 8 is more than 3, so 18 is more. | claude-opus-5-5 |
| 1.2-decompose-within-10 | 1 | 1 | Writing 10 for 7 = 3 + __ by adding 7 and 3. / 7 is the total. What goes with 3 to make 7? 3 + 4 = 7, so 4. | claude-opus-5-5 |
| 1.2-decompose-within-10 | 2 | 1 | Adds 4 and 9 to get 13 for 9 = 4 + __. / 9 is the total. Find what joins 4 to make 9: 9 − 4 = 5. | claude-opus-5-5 |
| 1.2-ways-to-make-10 | 2 | 1 | Adds 3 and 10 to get 13 for 3 + __ = 10. / 10 is the total. Find what joins 3 to make 10: 3 + 7 = 10. | claude-opus-5-5 |
| 1.2-partners-of-10 | 1 | 1 | Adds 7 and 10 to get 17 for 7 and __ make 10. / 10 is the total. Count up from 7 to 10: that is 3 more. | claude-opus-5-5 |
| 1.2-partners-of-10 | 2 | 1 | Adds 2 and 10 to get 12 for __ + 2 = 10. / 10 is the total. Ask what joins 2 to make 10: 10 − 2 = 8, and 8 + 2 = 10. | claude-opus-5-5 |
| 1.2-benchmarks-10-20 | 1 | 1 | Says 8 is closer to 0, the end that is 8 steps away. / 8 is 2 away from 10 but 8 away from 0, so it is closer to 10. | claude-opus-5-5 |
| 1.2-benchmarks-10-20 | 2 | 1 | Says 17 is closer to 10, which is 7 away. / 17 is 3 away from 20 and 7 away from 10, so it is closer to 20. | claude-opus-5-5 |
| 1.10-likelihood-words | 2 | 1 | Picks a heat wave as more likely than snow in winter. / Snow sometimes happens in winter. A heat wave almost never does, so snow is more likely. | claude-opus-5-5 |
| 1.3-meaning-of-addition | 1 | 1 | Writes 3 ducks and 2 more ducks side by side as 32. / Joining 3 and 2 more means adding: 3 + 2 = 5. | claude-opus-5-5 |
| 1.3-meaning-of-addition | 2 | 2 | Writes 4 = 8 + 4, with the total 8 as a part. / Put the parts 4 and 4 first, then the total after =: 4 + 4 = 8. | claude-opus-5-5 |
| 1.3-meaning-of-subtraction | 1 | 1 | Adds 7 and 3 to get 10 when 3 of 7 birds fly away. / Flying away means take away: 7 − 3 = 4 left. | claude-opus-5-5 |
| 1.3-meaning-of-subtraction | 2 | 1 | Adds 8 and 5 to get 13 balls out. / 8 is the whole. Take away the part in the box: 8 − 5 = 3 out. | claude-opus-5-5 |
| 1.3-meaning-of-subtraction | 3 | 1 | Writes 2 − 9 = 7, with the part taken away first. / Start with the whole, 9, then take away 2: 9 − 2 = 7. | claude-opus-5-5 |
| 1.3-add-within-10 | 1 | 1 | Counts 6 as the first step (6, 7) and stops at 7. / Start at 6, then count on 2 more: 7, 8. So 6 + 2 = 8. | claude-opus-5-5 |
| 1.3-add-within-10 | 2 | 1 | Counts 4 as the first step (4, 5, 6, 7, 8) and says 8. / Say 4, then count on 5 more: 5, 6, 7, 8, 9. So 4 + 5 = 9. | claude-opus-5-5 |
| 1.3-add-within-10 | 3 | 1 | Re-counts 7 + 2 and gets a different answer than 9. / Swapping the parts keeps the same total, so 7 + 2 = 9 too. | claude-opus-5-5 |
| 1.3-subtract-within-10 | 1 | 1 | Counts 8 as the first step back (8, 7) and says 7. / Start at 8 and count back 2: 7, 6. So 8 − 2 = 6. | claude-opus-5-5 |
| 1.3-subtract-within-10 | 2 | 1 | Adds 10 and 6 to get 16 for 10 − 6. / The sign means take away: 10 − 6 = 4. | claude-opus-5-5 |
| 1.3-subtract-within-10 | 3 | 1 | Adds 9 and 6 to get 15 for 9 − 6. / Ask what joins 6 to make 9: 6 + 3 = 9, so 9 − 6 = 3. | claude-opus-5-5 |
| 1.3-subtract-within-10 | 4 | 1 | Says 6 − 6 = 6, as if taking away changes nothing. / Taking away all 6 leaves none, so 6 − 6 = 0. | claude-opus-5-5 |
| 1.3-count-on-back | 1 | 1 | Counts 7 as the first step (7, 8, 9) and says 9. / Start at 7 and count on 3 more: 8, 9, 10. So 7 + 3 = 10. | claude-opus-5-5 |
| 1.3-count-on-back | 2 | 1 | For 2 + 9, I start at 2 and count on 9 more, and lose track. / Start at the bigger number, 9, and count on just 2: 10, 11. So 2 + 9 = 11. | claude-opus-5-5 |
| 1.3-count-on-back | 3 | 1 | 13 - 3: I say 13 as the first count back, then 12, 11, and get 11. / Start at 13 but don't count it. Count back 3: 12, 11, 10. So 13 - 3 = 10. | claude-opus-5-5 |
| 1.3-teen-add-subtract | 1 | 1 | 10 + 6 = 106, because I write the 10 and the 6 side by side. / 10 is 1 ten. Add 6 ones: 1 ten and 6 ones makes 16, so 10 + 6 = 16. | claude-opus-5-5 |
| 1.3-teen-add-subtract | 2 | 1 | 13 + 4 = 53, because I added the 4 to the 1 ten. / Add 4 to the 3 ones: 3 + 4 = 7. Keep the 1 ten, so 13 + 4 = 17. | claude-opus-5-5 |
| 1.3-teen-add-subtract | 3 | 1 | 17 - 5 = 2, because I take 5 from the 7 ones and forget the ten. / 7 ones - 5 = 2 ones, but the 1 ten stays. 10 + 2 = 12, so 17 - 5 = 12. | claude-opus-5-5 |
| 1.3-make-10-to-add | 1 | 1 | 9 + 5: I make 10 from the 9, then add all 5, so 10 + 5 = 15. / 1 moved to the 9 comes from the 5, leaving 4. So 9 + 5 = 10 + 4 = 14. | claude-opus-5-5 |
| 1.3-make-10-to-add | 2 | 1 | 8 + 5: I add 2 to make 10, then add all 5 again, so 10 + 5 = 15. / Split 5 into 2 and 3. 8 + 2 = 10, then add only the 3 left: 10 + 3 = 13. | claude-opus-5-5 |
| 1.3-make-10-to-add | 3 | 1 | 7 + 6: I make 10 from the 7, then still add all 6 to get 16. / Take 3 from the 6 to make 10 with 7. 6 - 3 leaves 3, so 10 + 3 = 13. | claude-opus-5-5 |
| 1.3-add-within-20 | 1 | 1 | 15 is 8 and __: I add 15 + 8 and get 23. / 15 is the whole and 8 is one part. Find the other part: 15 - 8 = 7. | claude-opus-5-5 |
| 1.3-add-within-20 | 2 | 1 | 6 + 7: I use the double 6 + 6 = 12 and stop there. / 7 is 1 more than 6, so add 1 to the double: 6 + 6 = 12, then 12 + 1 = 13. | claude-opus-5-5 |
| 1.3-add-within-20 | 3 | 1 | 8 + 9 = 16, because I stop at the double 8 + 8. / 9 is 1 more than 8, so add 1 to the double: 16 + 1 = 17. So 8 + 9 = 17. | claude-opus-5-5 |
| 1.3-add-within-20 | 4 | 1 | 4 + 6 + 5 = 10, because I add 4 + 6 and leave out the 5. / Make 10 with 4 + 6, then add the last number too: 10 + 5 = 15. | claude-opus-5-5 |
| 1.3-fact-families | 1 | 1 | 3 + 8 = 5, because I put the total 8 as an addend and 5 as the sum. / The total 8 goes after the equals sign: 3 + 5 = 8 and 5 + 3 = 8. | claude-opus-5-5 |
| 1.3-fact-families | 2 | 1 | 4 - 10 = 6, because I start the subtraction with a part. / Start with the total, 10: 10 - 4 = 6 and 10 - 6 = 4. | claude-opus-5-5 |
| 1.3-fact-families | 3 | 1 | 14 - 9 = 23, because I add 14 + 9. / The sign is minus, so take 9 from 14: 14 - 9 = 5, since 9 + 5 = 14. | claude-opus-5-5 |
| 1.3-subtract-within-20 | 1 | 1 | 15 - 3: I count 15 as the first step back, so I land on 13. / Don't count 15. Count back 3 from 15: 14, 13, 12. So 15 - 3 = 12. | claude-opus-5-5 |
| 1.3-word-problems-10 | 1 | 1 | 4 and 3 more: I subtract 4 - 3 and get 1. / Finding 3 more joins amounts together, so add: 4 + 3 = 7. | claude-opus-5-5 |
| 1.3-word-problems-10 | 2 | 1 | For 9 take away 4, I add and get 9 + 4 = 13. / Take away means subtract: 9 - 4 = 5 left. | claude-opus-5-5 |
| 1.3-word-problems-10 | 3 | 1 | Had 5, now 8: I add 5 + 8 and get 13. / Find the change from 5 to 8: count up 6, 7, 8 is 3 steps, so 8 - 5 = 3. | claude-opus-5-5 |
| 1.3-word-problems-10 | 4 | 1 | 8 in all, 5 red: I add 8 + 5 = 13 to find the blue ones. / 8 is the whole and 5 is one part. The other part is 8 - 5 = 3 blue. | claude-opus-5-5 |
| 1.3-word-problems-10 | 5 | 1 | Adds 7 + 4 = 11 to find how many more Sam has. / "How many more" compares the two amounts, so subtract: 7 - 4 = 3. | claude-opus-5-5 |
| 1.3-word-problems-10 | 6 | 1 | Adds 6 + 2 = 8 when 2 kids go home. / Kids going home means fewer are left, so take away: 6 - 2 = 4. | claude-opus-5-5 |
| 1.3-word-problems-20 | 1 | 1 | Subtracts 12 - 5 = 7 when Max gets 5 more. / Getting more means joining, so add: 12 + 5 = 17. | claude-opus-5-5 |
| 1.3-word-problems-20 | 2 | 1 | Adds 13 + 8 = 21 to find how many more Sam has. / To compare, find the difference by subtracting: 13 - 8 = 5. | claude-opus-5-5 |
| 1.3-word-problems-20 | 3 | 1 | Adds 4 + 11 = 15, but 11 is the total after getting 4 more. / The total is 11 and 4 was added, so take away: 11 - 4 = 7 at the start. | claude-opus-5-5 |
| 1.5-describe-change | 1 | 1 | Writes the new total 8 instead of how many were added to get from 5 to 8. / Find the change: 8 - 5 = 3 added. | claude-opus-5-5 |
| 1.5-describe-change | 2 | 1 | Adds 12 + 9 = 21 when the amount went down from 12 to 9. / Going down means took away. Find the gap: 12 - 9 = 3. | claude-opus-5-5 |
| 1.5-change-to-make-10 | 1 | 1 | Adds 6 + 10 = 16 instead of finding what joins 6 to make 10. / Ask 6 + __ = 10. The gap is 10 - 6 = 4. | claude-opus-5-5 |
| 1.5-change-to-make-10 | 2 | 1 | Gives the target 7 as the amount to take away from 10. / 7 is what is left. Take away the gap: 10 - 7 = 3. | claude-opus-5-5 |
| 1.5-change-unknown | 1 | 1 | Adds 9 + 15 = 24 to fill the blank in 9 + __ = 15. / 15 is the total, so subtract the part you know: 15 - 9 = 6. | claude-opus-5-5 |
| 1.5-change-unknown | 2 | 1 | Adds 17 + 12 = 29 to fill the blank in 17 - __ = 12. / The blank is what is taken from 17 to leave 12: 17 - 12 = 5. | claude-opus-5-5 |
| 1.4-sorting-rule | 1 | 1 | DROPPED: The wrong statement is accurate: it matches the mistake answer 'size' and why 'picks a thing that also varies'. The fix is the problem. It brings in 'green', which is not in this step (the groups are only red and blue). It also never says the answer is 'colour'. It only says to pick the rule that red, blue and green belong to, which is indirect for a young child. The correction does not stand on its own and adds content that is not in the source. | none |
| 1.4-extend-repeating | 1 | 1 | Writes red, red, blue, as if a new core starts after the last red. / The last red begins a red pair, so add red to finish it, then blue, blue. | claude-opus-5-5 |
| 1.4-extend-repeating | 2 | 1 | Picks big circle by copying only one feature, not the whole core. / Core is big circle, small circle, square; after small circle comes square. | claude-opus-5-5 |
| 1.4-describe-core | 1 | 1 | Picks star moon star as the repeating part, which goes too far. / The repeating part stops before it starts again: star moon. | claude-opus-5-5 |
| 1.4-describe-core | 2 | 1 | Writes A B, missing that dog comes twice in a row. / The core is dog dog cat, so write A A B. | claude-opus-5-5 |
| 1.4-translate-pattern | 1 | 1 | Picks circle, circle, square, square since it has two of each. / Match the order: it switches every item, so circle, square, circle, square. | claude-opus-5-5 |
| 1.4-translate-pattern | 2 | 1 | Picks sun, cloud repeating, which is A B, not A A B. / A A B is sun, sun, cloud, so repeat that: sun, sun, cloud, sun, sun, cloud. | claude-opus-5-5 |
| 1.4-predict-element | 1 | 1 | Says the 7th shape is square, miscounting along the pattern. / Odd places are circle and even places are square, so the 7th is circle. | claude-opus-5-5 |
| 1.4-predict-element | 2 | 1 | Says A for the 12th letter by counting one past the end of the last set of 3. / 12 is 4 full sets of 3, so it ends a set: the 12th is C. | claude-opus-5-5 |
| 1.6-equal-or-not | 1 | 1 | 4 apples and 4 pears are not equal because the fruits are different. / Equal means the same number; both groups have 4, so they are equal. | claude-opus-5-5 |
| 1.6-equal-or-not | 2 | 1 | 3 + 4 is not equal to 5 + 2 because the numbers are different. / Add each side: 3 + 4 = 7 and 5 + 2 = 7, so they are equal. | claude-opus-5-5 |
| 1.6-record-equal-not-equal | 1 | 1 | 7 ≠ 7 because the two sevens sit apart. / The same number is equal, so 7 = 7, wherever each one sits. | claude-opus-5-5 |
| 1.6-record-equal-not-equal | 2 | 1 | 4 + 3 = 8, reading = as 'answer next' without adding first. / Add first: 4 + 3 = 7, and 7 is not 8, so write 4 + 3 ≠ 8. | claude-opus-5-5 |
| 1.6-equal-sums | 1 | 1 | 6 + 4 = 7 + 10, writing the total in the blank. / Both sides must total 10, so 7 + __ = 10 and the blank is 3. | claude-opus-5-5 |
| 1.6-equal-sums | 2 | 1 | 9 + 3 = 8 + 4 is false because the sums look different. / Add each side: 9 + 3 = 12 and 8 + 4 = 12, so it is true. | claude-opus-5-5 |
| 1.6-balance-sides | 1 | 1 | 5 = 2 + 7, adding the 5 and the 2 together. / Ask what added to 2 makes 5: 2 + 3 = 5, so the blank is 3. | claude-opus-5-5 |
| 1.6-balance-sides | 2 | 1 | 4 + 5 = 3 + 9, writing the left total in the blank. / The right side must also total 9, so 3 + 6 = 9 and the blank is 6. | claude-opus-5-5 |
| 1.7-non-standard-units | 1 | 1 | Says 5 or 7 clips by skipping or double counting a clip. / Count each clip once, 1 to 6, so the pencil is 6 clips long. | claude-opus-5-5 |
| 1.7-non-standard-units | 2 | 1 | Calls the measure fair because the cubes are counted only. / Cubes must touch with no gap; a gap after the 3rd cube makes it not fair. | claude-opus-5-5 |
| 1.7-non-standard-units | 3 | 1 | DROPPED: Rejected. The task is to circle the crayon that starts at the line. The fix says to pick the crayon 'whose end sits on the line', but a crayon has two ends. A child could look at the far end, which is the wrong end. The fix should say the crayon's starting end lines up with the line. The evidence is also too thin: the mistake answer is empty, and nothing shows the crayon with more cubes isn't also the one that starts at the line. So the wrong statement can't be confirmed as wrong in this step. | none |
| 1.7-iterate-one-unit | 1 | 1 | Says 6 cubes long by counting the start line as a mark. / Count only the 5 marks made after each move, so it is 5 cubes long. | claude-opus-5-5 |
| 1.7-iterate-one-unit | 2 | 1 | Says 8 moves by counting the squares, not the moves. / Each move covers 2 squares, so 8 squares take 4 moves. | claude-opus-5-5 |
| 1.7-uniform-units | 1 | 1 | Says hand spans are fairer because hands are bigger. / A fair unit is the same size every time; paper clips match, hand spans vary. | claude-opus-5-5 |
| 1.7-unit-size | 1 | 1 | Thinks 8 cubes means cubes are the bigger unit, since 8 is more. / It takes more cubes for the same length, so cubes are the smaller unit. | claude-opus-5-5 |
| 1.7-order-by-measure | 1 | 1 | Adds 9 + 6 = 15 to find how much longer the pen is. / Find the difference: 9 − 6 = 3, so the pen is 3 cubes longer. | claude-opus-5-5 |
| 1.7-order-by-measure | 2 | 1 | Says the pen is longest using only the clue pen > crayon. / Use both clues: ruler > pen > crayon, so the ruler is longest. | claude-opus-5-5 |
| 1.8-name-shapes | 1 | 1 | DROPPED: The source is inconsistent. The example shape is a triangle with the options circle, triangle or square, and the answer is triangle. The listed mistake, square for a rectangle, can't happen here because there is no rectangle and no rectangle option. The mistake answer is also blank. I can't change the example to make a pair fit. | none |
| 1.8-name-shapes | 2 | 1 | Calls a can a circle, naming its flat face. / A can is a cylinder; a circle is a flat shape, not the whole 3D object. | claude-opus-5-5 |
| 1.8-count-sides | 1 | 1 | Says a triangle has 4 sides by counting one side twice. / Count each side once, starting and stopping at the same corner: 3 sides. | claude-opus-5-5 |
| 1.8-count-sides | 2 | 1 | Says a rectangle has 2 corners by counting only the top ones. / A rectangle has 4 corners: 2 on the top and 2 on the bottom. | claude-opus-5-5 |
| 1.8-positional-words | 1 | 1 | Picks beside for a ball with a box on each side. / Between means in the middle of two things, so the ball is between the boxes. | claude-opus-5-5 |
| 1.8-positional-words | 2 | 1 | Says the sun is below the house when the sun is higher up. / Above means higher up, so a sun over a house is above it. | claude-opus-5-5 |
| 1.9-make-concrete-graph | 1 | 1 | Says the row needs 5 boxes for 4 apples, adding one extra box. / Use one box for each apple: 4 apples need 4 boxes. | claude-opus-5-5 |
| 1.9-make-concrete-graph | 2 | 1 | Adds 3 + 5 to get 8 for how many more cats than dogs. / How many more means find the difference: 5 − 3 = 2. | claude-opus-5-5 |
| 1.9-read-concrete-graph | 1 | 1 | Counts 5 for a row of 6 items by missing one. / Count each item once, in order, and skip none: the row has 6. | claude-opus-5-5 |
| 1.9-read-concrete-graph | 2 | 1 | Adds 6 + 4 to get 10 for how many more like apples than pears. / How many more means subtract: 6 − 4 = 2. | claude-opus-5-5 |
| 1.11-coin-values | 1 | 1 | Says a dime is 5 cents because the dime is the smaller coin. / A dime is 10 cents and a nickel is 5; coin size doesn't show value. | claude-opus-5-5 |
| 1.11-coin-values | 2 | 1 | Treats a toonie as 1 dollar, the same as a loonie. / A loonie is 1 dollar and a toonie is 2 dollars, so a toonie is worth 2 loonies. | claude-opus-5-5 |
| 1.11-count-one-coin-type | 1 | 1 | Says 4 dimes are 4 cents by counting the coins, not their value. / Each dime is 10 cents, so count by 10s: 10, 20, 30, 40 cents. | claude-opus-5-5 |
| 1.11-count-one-coin-type | 2 | 1 | Says 5 toonies are 5 dollars by counting coins only. / Each toonie is 2 dollars, so count by 2s: 2, 4, 6, 8, 10 dollars. | claude-opus-5-5 |
| 2.1-count-by-ones-100 | 1 | 1 | Writes 53 again after 52, 53, repeating a number. / Each next number is 1 more: 53 + 1 = 54, then 55. | claude-opus-5-5 |
| 2.1-count-by-ones-100 | 2 | 1 | Writes 310 after 39, saying 'thirty-ten' instead of forty. / After 39 the tens digit goes up: 39 + 1 = 40, then 41. | claude-opus-5-5 |
| 2.1-count-by-ones-100 | 3 | 1 | After 41, writes 30, jumping to the ten before instead of back 1. / Back 1 from 41 is 40, then back 1 from 40 is 39. | claude-opus-5-5 |
| 2.1-read-write-100 | 1 | 1 | Writes 14 for forty, mixing it up with fourteen. / Forty is 4 tens, so it is 40. Fourteen is 14, 1 ten and 4 ones. | claude-opus-5-5 |
| 2.1-read-write-100 | 2 | 1 | Writes forty-six as 406 by writing 40 and then 6. / Forty is 4 tens, so put 4 in the tens place and 6 in the ones place: 46. | claude-opus-5-5 |
| 2.1-read-write-100 | 3 | 1 | Writes 67 as six-seven by saying each digit. / The 6 is in the tens place, so it is sixty: write sixty-seven. | claude-opus-5-5 |
| 2.1-count-to-100 | 1 | 1 | DROPPED: Source is inconsistent. Counting by 10s from 23, 33, 43 gives 53, 63. Changing the ones digit of 43 would give numbers like 44 or 45, not 24, 34. The wrong answer 24, 34 doesn't follow from the stated mistake, and it is lower than 43, so no sound pair fits. | none |
| 2.1-count-to-100 | 2 | 1 | DROPPED: Source is inconsistent. Counting by 1 after 45 gives 46, 47, not 36, 37. The wrong answer 36, 37 follows 35, not 45, so it doesn't match the stated mistake and no sound pair fits. | none |
| 2.1-count-to-100 | 3 | 1 | Writes 70, 80, counting up by 10s from 60 instead of down from 40. / The numbers go down by 10, so 40 − 10 = 30, then 30 − 10 = 20. | claude-opus-5-5 |
| 2.1-count-tens-ones | 1 | 1 | 3 rods of ten and 6 loose cubes: 3 + 6 = 9 cubes. / Each rod is 10 cubes, so count 30 + 6 = 36 cubes. | claude-opus-5-5 |
| 2.1-count-tens-ones | 2 | 1 | 4 groups of ten and 3 left is written 34. / Tens go first, then ones: 4 tens and 3 ones is 43. | claude-opus-5-5 |
| 2.1-count-tens-ones | 3 | 1 | 7 tens and 4 left is 70 (ones forgotten) or 47 (digits flipped). / Count the 4 left too, with tens first: 70 + 4 = 74. | claude-opus-5-5 |
| 2.1-place-value-tens-ones | 1 | 1 | 58 is 8 tens and 5 ones. / The 5 is in the tens place and the 8 in the ones place: 5 tens and 8 ones. | claude-opus-5-5 |
| 2.1-place-value-tens-ones | 2 | 1 | The 4 in 49 is worth 4. / The 4 is in the tens place, so it is worth 4 tens, which is 40. | claude-opus-5-5 |
| 2.1-place-value-tens-ones | 3 | 1 | The 5 in 52 and the 5 in 25 are worth the same because both are 5. / In 52 the 5 is tens, worth 50. In 25 it is ones, worth 5. So the 5 in 52 is more. | claude-opus-5-5 |
| 2.1-decompose-tens-ones | 1 | 1 | 34 = 4 tens and 3 ones. / The first digit 3 is the tens and the 4 is the ones: 34 = 3 tens and 4 ones. | claude-opus-5-5 |
| 2.1-decompose-tens-ones | 2 | 1 | 34 = 2 tens and 4 ones. / Trading one ten adds 10 ones: 4 + 10 = 14, so 34 = 2 tens and 14 ones. | claude-opus-5-5 |
| 2.1-decompose-tens-ones | 3 | 1 | 46 = 3 tens and 6 ones. / Trading one ten adds 10 ones: 6 + 10 = 16, so 3 tens and 16 ones makes 46. | claude-opus-5-5 |
| 2.1-decompose-tens-ones | 4 | 1 | 63 = 6 tens and 23 ones. / 23 ones holds 2 tens, so take them from 6 tens: 6 − 2 = 4. So 63 = 4 tens and 23 ones. | claude-opus-5-5 |
| 2.1-ten-more-less | 1 | 1 | 10 more than 34 is 35. / 10 more means 1 more ten, so the tens digit goes up by 1: 34 becomes 44. | claude-opus-5-5 |
| 2.1-ten-more-less | 2 | 1 | 10 less than 63 is 62. / 10 less means 1 fewer ten, so the tens digit goes down by 1: 63 becomes 53. | claude-opus-5-5 |
| 2.1-ten-more-less | 3 | 1 | 10 more than 90 is 910, from putting the 9 and the 10 side by side. / Add instead: 9 tens + 1 ten = 10 tens, so 90 + 10 = 100. | claude-opus-5-5 |
| 2.1-number-line-100 | 2 | 1 | DROPPED: The fix's reasoning is unsafe. It says the labels are 5 apart, so each tick is 5, but that doesn't follow. In this step, ticks can go up by 5 or by 1 with only some labelled. A line labelled 40, 45, 50 with ticks by 1 has four unlabelled ticks between labels, so one tick after 45 really would be 46. The fix should tell the child to count the ticks (spaces) between two labels to find each tick's value, and it doesn't. The source is also unclear: if each tick is 5, the point one tick after 45 sits exactly on the labelled 50, so the item doesn't really test reading an unlabelled point. With that ambiguity, the evidence isn't enough to show that 46 is actually wrong. Length is fine (140 characters). | none |
| 2.1-number-line-100 | 3 | 1 | 25 goes near 50 because its digits 2 and 5 look big. / 25 is half of 50, so it goes halfway between 0 and 50. | claude-opus-5-5 |
| 2.1-compare-order-100 | 1 | 1 | 47 is greater than 62 because 7 is more than 2. / Compare the tens first: 6 tens is more than 4 tens, so 62 is greater. | claude-opus-5-5 |
| 2.1-compare-order-100 | 2 | 1 | The tens match, so 56, the first number, is less. / When tens match, compare the ones: 3 is less than 6, so 53 is less. | claude-opus-5-5 |
| 2.1-compare-order-100 | 3 | 1 | DROPPED: Source inconsistent: ordering 51, 15, 49 by first digit only gives 15 (1), 49 (4), 51 (5), which is the correct answer 15, 49, 51. The stated wrong answer 15, 51, 49 does not come from that rule, so no sound pair can be written. | none |
| 2.1-even-odd | 1 | 1 | 7 shoes make 3 pairs, so 7 is even. / 3 pairs use 6 shoes and 1 is left over, so 7 is odd. | claude-opus-5-5 |
| 2.1-even-odd | 2 | 1 | 58 is odd because its tens digit 5 is odd. / Check the ones digit: 8 is even, so 58 is even. | claude-opus-5-5 |
| 2.2-benchmarks-25-50-100 | 2 | 1 | 30 beans is less than 25. / Compare the numbers: 25 + 5 = 30, so 30 is past 25 and is more than 25. | claude-opus-5-5 |
| 2.2-personal-referents | 2 | 1 | 45 is closest to 100, the biggest number offered. / 45 is 5 below 50 but 55 below 100, so it is closest to 50. Then count by tens: 10, 20, 30, 40, 45. | claude-opus-5-5 |
| 2.5-repeating-core | 1 | 1 | The core is red circle, blue circle. / Keep going until the pattern starts again. Red square comes next, so the core has 3 items. | claude-opus-5-5 |
| 2.5-repeating-core | 2 | 1 | The 8th is A, a guess without counting round the core. / The core A B B has 3 items. 8 is 2 past 6, so the 8th is the 2nd item, B. | claude-opus-5-5 |
| 2.5-complex-repeating | 2 | 1 | After bottom-left, the next corner is top-right. / The 4 corners loop, so after bottom-left it goes back to the start, top-left. | claude-opus-5-5 |
| 2.5-complex-repeating | 3 | 1 | Counting by 4s up to 10 lands on triangle, the end of the core. / 4 and 8 end whole cores. 10 is 2 past 8, so it is the 2nd item: circle. | claude-opus-5-5 |
| 2.5-increasing-pattern | 1 | 1 | 2, 4, 6, 8, 9, 10 adds 1 each time. / The jumps are 2 (2 to 4 to 6 to 8), so 8 + 2 = 10 and 10 + 2 = 12. | claude-opus-5-5 |
| 2.5-increasing-pattern | 2 | 1 | 10, 20, 21, 40, 50 adds 1 to 20. / The step is 10 (10 to 20), so 20 + 10 = 30, and 30 + 10 = 40 fits. | claude-opus-5-5 |
| 2.5-increasing-pattern | 3 | 1 | The rule is add 7 because the pattern starts at 7. / Find the jump between neighbours: 12 - 7 = 5, so add 5. Then 22 + 5 = 27. | claude-opus-5-5 |
| 2.5-make-increasing | 3 | 1 | It goes up by 4 because the first number is 4. / Find the jump: 9 - 4 = 5 and 14 - 9 = 5, so it goes up by 5 each time. | claude-opus-5-5 |
| 2.10-make-pictograph | 1 | 1 | DROPPED: Source inconsistent: the cat tally |||| is 4, so 4 is correct. The stated wrong answer 3 is the dog tally, but the stated why (one picture for the whole group) would give 1, not 3. No sound pair fits both. | none |
| 2.10-make-pictograph | 2 | 1 | DROPPED: The mistake answer is blank, so there is no specific wrong answer to describe. The why, 'Rows do not match the counts', is too vague to show what the wrong move was or to write a matching correction. | none |
| 2.10-read-pictograph | 2 | 1 | 9 + 6 = 15 more dogs. / 'How many more' compares the two rows, so subtract: 9 - 6 = 3 more dogs. | claude-opus-5-5 |
| 2.3-facts-to-10 | 2 | 1 | __ + 4 = 9, so 9 + 4 = 13. / 9 is the total, so take away the known part: 9 - 4 = 5. Check: 5 + 4 = 9. | claude-opus-5-5 |
| 2.3-facts-to-10 | 3 | 1 | Counting back 3 from 7 as 7, 6, 5 gives 5. / Do not count the 7. Count back 3 steps: 6, 5, 4. So 7 - 3 = 4. | claude-opus-5-5 |
| 2.3-near-doubles | 1 | 1 | Two 6s make 12, so the answer is 12. / Double 6 is 12, then add the extra 1: 12 + 1 = 13. | claude-opus-5-5 |
| 2.3-near-doubles | 2 | 1 | 6 + 7 = 12, using only double 6. / 7 is 1 more than 6, so add 1 to double 6: 12 + 1 = 13. | claude-opus-5-5 |
| 2.3-near-doubles | 3 | 1 | Double 8 is 16, and 1 more makes 17. / 8 is exactly in the middle of 7 and 9, so double 8 is the answer: 7 + 9 = 16. | claude-opus-5-5 |
| 2.3-bridge-10-add | 1 | 1 | 5 + 8: 8 + 2 = 10, so the answer is 10. / Split 5 into 2 and 3. After 8 + 2 = 10, add the 3 left over: 10 + 3 = 13. | claude-opus-5-5 |
| 2.3-bridge-10-add | 2 | 1 | 17 + 3 = 20, then 1 more gives 21. / Split 6 into 3 and 3. After 17 + 3 = 20, add the other 3: 20 + 3 = 23. | claude-opus-5-5 |
| 2.3-bridge-10-add | 4 | 1 | 46 + 7: counts on 7 ones one at a time and loses count. / Split 7 into 4 + 3: 46 + 4 = 50, then 50 + 3 = 53. | claude-opus-5-5 |
| 2.3-bridge-10-subtract | 2 | 1 | 13 - 5 = 13 - 3 - 2 gives 10 by taking away only the 3. / Take away both parts: 13 - 3 = 10, then 10 - 2 = 8. | claude-opus-5-5 |
| 2.3-bridge-10-subtract | 4 | 1 | Does 15 + 8 = 23 when 8 of the 15 get off. / Some go away, so take away: 15 - 8 = 7. | claude-opus-5-5 |
| 2.3-fact-strategies-20 | 2 | 1 | Adds 15 + 8 = 23 instead of subtracting. / 8 + 7 = 15, so taking 8 from 15 leaves the other part: 15 - 8 = 7. | claude-opus-5-5 |
| 2.3-fact-strategies-20 | 3 | 1 | 9 + 7: moves 1 to make 10, then adds all 7 to get 17. / The 1 came from the 7, so only 6 is left: 10 + 6 = 16. | claude-opus-5-5 |
| 2.3-fact-strategies-20 | 4 | 1 | Adds 14 + 8 = 22 to find the missing number in __ + 8 = 14. / 14 is the total, so subtract: 14 - 8 = 6, and 6 + 8 = 14. | claude-opus-5-5 |
| 2.3-think-addition | 1 | 1 | Adds 8 + 5 = 13 instead of finding what goes with 5 to make 8. / Count up from 5 to 8: 6, 7, 8 is 3 steps, so 5 + 3 = 8. | claude-opus-5-5 |
| 2.3-think-addition | 2 | 1 | Counts 9, 10, 11, 12, 13, 14 as 6 steps, counting the 9 itself. / Start after 9: 10, 11, 12, 13, 14 is 5 steps, so 9 + 5 = 14. | claude-opus-5-5 |
| 2.3-think-addition | 3 | 1 | Gives only the jump from 10 to 16, which is 6, for 16 - 8. / Add both jumps: 8 to 10 is 2, 10 to 16 is 6, and 2 + 6 = 8. | claude-opus-5-5 |
| 2.3-three-addends | 1 | 1 | Stops after 3 + 7 = 10 and leaves out the 4. / Add the 4 to the ten: 10 + 4 = 14. | claude-opus-5-5 |
| 2.3-three-addends | 2 | 1 | Adds 6 + 6 = 12 and leaves out the 3. / Add the 3 to the double: 12 + 3 = 15. | claude-opus-5-5 |
| 2.3-three-addends | 3 | 1 | Adds 7 + 6 = 13 and never adds the 3. / 7 + 3 = 10 first, then add the 6 left over: 10 + 6 = 16. | claude-opus-5-5 |
| 2.6-write-change | 1 | 1 | Writes 12 - 5 = 17 when 5 more join 12. / More joining means add: 12 + 5 = 17. | claude-opus-5-5 |
| 2.6-write-change | 2 | 1 | Writes 9 + 4 = 13 when 4 of the 9 go away. / Going away means take away: 9 - 4 = 5. | claude-opus-5-5 |
| 2.6-write-change | 3 | 1 | Writes 6 + 10 = 16, using 10 as the number added on. / 10 is the total, so it goes after the equals sign: 6 + n = 10. | claude-opus-5-5 |
| 2.6-missing-addend | 1 | 1 | Adds 8 + 15 = 23 to find n in 8 + n = 15. / 15 is the total, so subtract: 15 - 8 = 7, and 8 + 7 = 15. | claude-opus-5-5 |
| 2.6-missing-addend | 2 | 1 | Does 9 - 6 = 3 for n - 6 = 9. / n is the start; 6 was taken away to leave 9, so add back: 9 + 6 = 15. | claude-opus-5-5 |
| 2.6-missing-addend | 3 | 1 | Adds 8 + 15 = 23 when 8 is the start and 15 is the new total. / Find how many more to get from 8 to 15: 15 - 8 = 7. | claude-opus-5-5 |
| 2.6-change-to-100 | 1 | 1 | Says 34 to 54 is 2 more, using the tens digits 5 - 3 as ones. / The 3 and 5 are tens: 2 tens is 20, so 34 + 20 = 54, which is 20 more. | claude-opus-5-5 |
| 2.6-change-to-100 | 2 | 1 | Says 42 to 47 is 7 more, using the ones digit of 47. / Find the gap in ones: 47 - 42 = 5, or count 43, 44, 45, 46, 47: 5 more. | claude-opus-5-5 |
| 2.6-change-to-100 | 3 | 1 | 34 to 57: says 20 more, the tens change only. / Add the ones change too: 4 to 7 is 3 more, so 20 + 3 = 23 more. | claude-opus-5-5 |
| 2.7-equal-sign | 1 | 1 | 5 + 4 = __ + 2: writes 9, the left sum, in the blank. / Both sides must be equal. 5 + 4 is 9, so __ + 2 = 9 and the blank is 7. | claude-opus-5-5 |
| 2.7-equal-sign | 2 | 1 | __ + 6 = 7 + 5: writes 12, the right total, in the blank. / The left side must also make 12. __ + 6 = 12, so the blank is 6. | claude-opus-5-5 |
| 2.7-equal-sign | 3 | 1 | 2 + 3 + 4 = 5 + __: writes 9, the left sum, in the blank. / The left side is 9. 5 + __ must also be 9, so the blank is 4. | claude-opus-5-5 |
| 2.7-greater-less-symbols | 1 | 1 | Writes 47 > 52, opening the symbol toward the smaller number. / The open side faces the bigger number, 52, so 47 < 52. | claude-opus-5-5 |
| 2.7-greater-less-symbols | 3 | 1 | Compares only 30 and 20 and writes 20 + 30 > 40 + 20. / Add each side first: 50 and 60. 50 is less than 60, so use <. | claude-opus-5-5 |
| 2.7-true-false-equations | 2 | 1 | Says 6 + 4 = 5 + 5 is false since the right side isn't one answer. / Both sides equal 10, and = means same value, so it is true. | claude-opus-5-5 |
| 2.9-name-2d-shapes | 1 | 1 | DROPPED: Source is inconsistent. The choices are square, circle and triangle, and the answer is triangle. The stated wrong answer, rectangle, is not one of the choices, so no learner could pick it here. A pair would not match the example. | none |
| 2.9-name-2d-shapes | 2 | 1 | Calls a square turned like a diamond a different shape. / Turning keeps 4 equal sides and 4 square corners, so it is still a square. | claude-opus-5-5 |
| 2.9-compare-2d | 1 | 1 | Says a rectangle has 2 sides by counting only the 2 long ones. / Count the short sides too: 2 long + 2 short = 4 sides, and 4 corners. | claude-opus-5-5 |
| 2.9-compare-2d | 2 | 1 | Says a square and a rectangle are just different shapes. / A square is a special rectangle: both have 4 sides and 4 corners. | claude-opus-5-5 |
| 2.9-compare-2d | 3 | 1 | Calls a square-cornered shape 4 points wide, 2 high, a square. / Gaps count: 3 wide, 1 high. Sides differ, so it's a rectangle. | claude-opus-5-5 |
| 2.9-two-attributes | 1 | 1 | Picks both red circles by checking only red. / Match big AND red. Only the big red circle is both, so pick just that one. | claude-opus-5-5 |
| 2.9-faces-of-3d | 1 | 1 | Says a can's flat face is a square, thinking only of cubes. / A can's flat ends are round, so they are circles. | claude-opus-5-5 |
| 2.9-faces-of-3d | 2 | 1 | Says a box has triangle faces, as if every solid has them. / A box's faces all have 4 sides: rectangles, sometimes squares. No triangles. | claude-opus-5-5 |
| 2.11-compare-likelihood | 2 | 1 | Picks blue as more likely because it is the odd one out. / More of a kind is more likely: 5 red beats 1 blue, so red. | claude-opus-5-5 |
| 2.4-add-subtract-tens | 1 | 1 | 40 + 30 = 7: adds 4 + 3 and leaves off the zero. / 4 tens + 3 tens = 7 tens, which is 70. Write the 0 in the ones place. | claude-opus-5-5 |
| 2.4-add-subtract-tens | 2 | 1 | 70 - 20 = 90: adds the numbers instead of taking away. / The minus sign means take away: 7 tens - 2 tens = 5 tens, or 50. | claude-opus-5-5 |
| 2.4-add-subtract-tens | 3 | 1 | 30 + __ = 80: writes 110 by adding 30 and 80. / Find what goes with 30 to make 80: 80 - 30 = 50, and 30 + 50 = 80. | claude-opus-5-5 |
| 2.4-add-tens-to-number | 2 | 1 | 85 - 40 = 81: takes 4 from the ones, not 4 tens. / Take 4 tens from 8 tens: 4 tens left, ones stay 5, so 45. | claude-opus-5-5 |
| 2.4-add-tens-to-number | 3 | 1 | Adds 76 + 30 = 106 to find the unknown in __ + 30 = 76. / The 30 was added to get 76, so subtract: 76 - 30 = 46. Check: 46 + 30 = 76. | claude-opus-5-5 |
| 2.4-ones-to-two-digit | 1 | 1 | Adds 5 to the tens digit: 3 + 5 = 8, keeps the 4, and writes 84. / Add 5 to the ones: 4 + 5 = 9. The 3 tens stay the same, so 34 + 5 = 39. | claude-opus-5-5 |
| 2.4-ones-to-two-digit | 2 | 1 | Writes the 3 tens beside the ones sum 8 + 5 = 13, making 313. / Use the split: 38 + 2 = 40, then 40 + 3 = 43. | claude-opus-5-5 |
| 2.4-ones-to-two-digit | 3 | 1 | Adds 47 + 5 = 52 when the problem says to subtract 5. / Take 5 away from the ones: 7 - 5 = 2. The 4 tens stay, so 47 - 5 = 42. | claude-opus-5-5 |
| 2.4-ones-to-two-digit | 4 | 1 | Does 7 - 2 = 5 in the ones place, keeps the 4 tens, and writes 45. / Split 7 into 2 and 5: 42 - 2 = 40, then 40 - 5 = 35. | claude-opus-5-5 |
| 2.4-next-ten | 1 | 1 | Gives the ones digit 7 as the jump from 17 to 20. / Count up from 17 to 20: 18, 19, 20 is 3 steps. So 17 + 3 = 20. | claude-opus-5-5 |
| 2.4-next-ten | 3 | 1 | Stops at 50 and answers 3 for 47 + __ = 60. / 3 reaches 50, but 60 is 10 more. Add both jumps: 3 + 10 = 13. | claude-opus-5-5 |
| 2.4-split-tens-ones | 1 | 1 | Adds only the tens, 20 + 40 = 60, and leaves out 3 + 5. / Add the ones too: 3 + 5 = 8. Then 60 + 8 = 68. | claude-opus-5-5 |
| 2.4-split-tens-ones | 2 | 1 | Writes 70 and 15 side by side as 715. / Add the two parts: 70 + 15 = 85. | claude-opus-5-5 |
| 2.4-split-tens-ones | 4 | 1 | DROPPED: The maths is right (63 + 29: 60 + 20 = 80, 3 + 9 = 12, total 92) and the fix is correct and fits the length limit. But the mistake's answer field is empty, so the wrong statement can't be checked against it. Following the wrong statement gives 80 + 120 = 200, which the source never records and the pair never states. The step also asks the child to find a hidden mistake in worked steps, yet the example shown is fully correct. Rejected because the source is incomplete. | none |
| 2.4-friendly-numbers | 1 | 1 | Finds 30 + 34 = 64 and forgets to take 1 back. / 30 is 1 more than 29, so take 1 off: 64 - 1 = 63. | claude-opus-5-5 |
| 2.4-friendly-numbers | 2 | 1 | Changes 48 to 50 but leaves 37 alone, so 50 + 37 = 87. / 48 gains 2, so 37 must lose 2: 50 + 35 = 85. | claude-opus-5-5 |
| 2.4-friendly-numbers | 3 | 1 | Adds 1 to 39 and also adds 1 to 52, so 40 + 53 = 93. / Give 1 to 39 and take 1 from 52: 40 + 51 = 91. | claude-opus-5-5 |
| 2.4-add-within-100 | 2 | 1 | Writes 5 from 8 + 7 = 15 but forgets the extra ten, so 38 + 27 = 55. / Add the ten: 8 + 7 = 15, so tens are 3 + 2 + 1 = 6. That gives 65. | claude-opus-5-5 |
| 2.4-add-within-100 | 3 | 1 | Adds tens 5 + 4 = 9 and writes the 10 from 9 + 1 beside it as 910. / 9 + 1 = 10 is 1 ten, so tens are 5 + 4 + 1 = 10 tens, which is 100. | claude-opus-5-5 |
| 2.4-add-up-difference | 1 | 1 | Counts only 47 to 50 and says 3, skipping 50 to 52. / Add both jumps: 47 to 50 is 3, 50 to 52 is 2, so 3 + 2 = 5. | claude-opus-5-5 |
| 2.4-add-up-difference | 2 | 1 | Takes smaller digit from larger in each place: 8 - 4 = 4, 6 - 3 = 3, so 43. / Add up from 46: 4 to 50, 30 to 80, 3 to 83. 4 + 30 + 3 = 37. | claude-opus-5-5 |
| 2.4-add-up-difference | 3 | 1 | Takes 0 from 7 and 0 from 3 in each place, ignoring the 1 in 100, to get 37. / Add up from 37: 3 to reach 40, then 60 to reach 100. 3 + 60 = 63. | claude-opus-5-5 |
| 2.4-subtract-within-100 | 1 | 1 | Adds 68 + 25 = 93 instead of subtracting. / Subtract each part: 68 - 20 = 48, then 48 - 5 = 43. | claude-opus-5-5 |
| 2.4-subtract-within-100 | 2 | 1 | Does 7 - 2 = 5 in the ones because 2 < 7, then 5 - 2 = 3 tens: 35. / Trade a ten: 52 is 4 tens 12 ones. 12 - 7 = 5, 4 - 2 = 2, so 25. | claude-opus-5-5 |
| 2.4-subtract-within-100 | 3 | 1 | Subtracts 6 - 0 = 6 ones and 7 - 2 = 5 tens, so 70 - 26 = 56. / 70 has no ones, so trade a ten: 10 - 6 = 4 ones, 6 - 2 = 4 tens. 44. | claude-opus-5-5 |
| 2.4-subtract-within-100 | 4 | 1 | Trades for ones (10 - 3 = 7) but keeps 10 tens: 10 - 4 = 6, so 67. / The trade leaves 9 tens: 9 - 4 = 5 tens and 7 ones. 100 - 43 = 57. | claude-opus-5-5 |
| 2.4-estimate-100 | 1 | 1 | Rounds 38 down to 30 just because it is not a ten. / Check the ones digit: 8 is 5 or more, so round up. 38 is 2 from 40 but 8 from 30, so 40. | claude-opus-5-5 |
| 2.4-estimate-100 | 3 | 1 | Adds the rounded numbers, 80 + 40 = 120, to estimate 83 - 38. / The sign is minus, so subtract the rounded numbers: 80 - 40 = 40. About 40. | claude-opus-5-5 |
| 2.4-compare-problems-100 | 1 | 1 | Adds 23 + 15 = 38 when asked how many more one has than the other. / 'How many more' compares two amounts, so find the difference: 23 - 15 = 8. | claude-opus-5-5 |
| 2.4-compare-problems-100 | 2 | 1 | DROPPED: Source is inconsistent. The example is 74 - 49 = 25, so the larger number is 74, not the stated wrong answer 75. The reason 'gives the larger number' does not match 75, and 75 does not match another clear error, so no sound pair can be written. | none |
| 2.4-compare-problems-100 | 3 | 1 | Subtracts 36 - 14 = 22 when one amount is 14 more than 36. / '14 more than 36' means add to 36: 36 + 14 = 50. | claude-opus-5-5 |
| 2.4-word-problems-100 | 1 | 1 | Subtracts 34 - 25 = 9 when 25 more are added to 34. / '25 more come' means join the amounts: 34 + 25 = 59. | claude-opus-5-5 |
| 2.4-word-problems-100 | 2 | 1 | Adds 42 + 15 = 57, treating the final total of 42 as if it were the start. / 42 is the total after 15 more came, so undo it: 42 - 15 = 27 at first. | claude-opus-5-5 |
| 2.4-word-problems-100 | 3 | 1 | Stops after 34 + 28 = 62 and never takes away the 16 that pop. / 62 is only the total before popping. Subtract the 16: 62 - 16 = 46 left. | claude-opus-5-5 |
| 2.4-word-problems-100 | 4 | 1 | Finds 28 + 35 = 63 pages read and gives that as the pages left. / 63 is pages read. Pages left = pages in book minus read: 80 - 63 = 17. | claude-opus-5-5 |
| 2.8-ruler-from-zero | 1 | 1 | Counts the 0 mark as 1, so an object from 0 to 12 is counted as 13. / Length is the gaps, not the marks. It starts at 0, so the end mark 12 means 12 cm. | claude-opus-5-5 |
| 2.8-measure-cm-m | 1 | 1 | Reads the end mark, 9, as the length of a pencil that starts at 2. / It starts at 2, not 0, so subtract: 9 - 2 = 7 cm. | claude-opus-5-5 |
| 2.8-measure-cm-m | 2 | 1 | Says 15 cm, the end mark, for something that starts at 6. / Length is end minus start: 15 - 6 = 9 cm. | claude-opus-5-5 |
| 2.8-measure-cm-m | 3 | 1 | Writes cm for a 2 m door and a 5 m fence. / Big objects measured on a tape use metres, so write 2 m and 5 m. | claude-opus-5-5 |
| 2.8-choose-unit | 1 | 1 | Picks m for a crayon, a unit far too big for it. / A crayon is small, only a few finger widths long, so measure it in cm. | claude-opus-5-5 |
| 2.8-choose-unit | 2 | 1 | Picks cm for a kitchen table, which is more than a metre long. / Since a table is over 1 m long, measure it in m, not tiny cm. | claude-opus-5-5 |
| 2.8-estimate-length | 1 | 1 | Guesses 30 cm for 3 fingers wide without using a finger as 1 cm. / A finger is about 1 cm wide, so 3 fingers is about 3 cm. | claude-opus-5-5 |
| 2.8-compare-lengths | 1 | 1 | Says the 9 cm crayon is longer than the 12 cm pencil. / The bigger length is longer: 12 cm is more than 9 cm, so the pencil is longer. | claude-opus-5-5 |
| 2.8-compare-lengths | 2 | 1 | Adds 18 + 11 = 29 to find how much longer one rope is. / 'How much longer' is a difference, so subtract: 18 - 11 = 7 m. | claude-opus-5-5 |
| 2.8-compare-lengths | 3 | 1 | Subtracts the end marks, 15 − 10 = 5 cm. / The pen starts at 2, so it is 15 − 2 = 13 cm long. Then 13 − 10 = 3 cm longer. | claude-opus-5-5 |
| 2.12-count-mixed-coins | 1 | 1 | Counts the coins: 2 dimes and 1 nickel is 3. / Count by 10s then 5: 10, 20, 25 cents. | claude-opus-5-5 |
| 2.12-count-mixed-coins | 2 | 1 | Counts the quarter as 10 cents: 10 + 20 + 5 = 35. / A quarter is 25 cents: 25 + 10 + 10 + 5 = 50 cents. | claude-opus-5-5 |
| 2.12-count-mixed-coins | 3 | 1 | DROPPED: fix needs commas for thousands; pair exceeds 150 characters | none |
| 3.1-place-value-1000 | 1 | 1 | Says the 4 in 472 is worth 4, just the digit. / The 4 is in the hundreds place, so it is worth 4 hundreds, which is 400. | claude-opus-5-5 |
| 3.1-place-value-1000 | 1 | 2 | Says the 4 in 472 is worth 40, as if it were in the tens place. / 472 is 4 hundreds, 7 tens, 2 ones. The 4 is in the hundreds place, so 400. | claude-opus-5-5 |
| 3.1-place-value-1000 | 2 | 1 | Writes 305 as 30 + 5, dropping the zero. / The 3 is in the hundreds place, so it is 300. There are 0 tens, then 5: 300 + 5. | claude-opus-5-5 |
| 3.1-place-value-1000 | 3 | 1 | Writes 4 hundreds, 13 tens and 2 ones side by side as 4,132. / Trade 10 tens for 1 hundred: 5 hundreds, 3 tens, 2 ones = 532. | claude-opus-5-5 |
| 3.1-place-value-1000 | 3 | 2 | Writes 432 by keeping the 3 of 13 tens and dropping a hundred. / 10 of the 13 tens make 1 hundred: 5 hundreds, 3 tens, 2 ones = 532. | claude-opus-5-5 |
| 3.1-place-value-1000 | 4 | 1 | Writes six hundred eight as 68, leaving out the zero. / Write 0 for the tens: 6 hundreds, 0 tens, 8 ones is 608. | claude-opus-5-5 |
| 3.1-place-value-1000 | 4 | 2 | Writes six hundred eight as 6,008 by putting 600 and 8 side by side. / Add them: 600 + 8 = 608, which is 6 hundreds, 0 tens, 8 ones. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 1 | 1 | Compares the tens, 8 and 1, to say 482 > 517. / Compare hundreds first: 4 hundreds is less than 5 hundreds, so 482 < 517. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 1 | 2 | Says 482 = 517 because the numbers are close in size. / Close is not equal. 482 has 4 hundreds and 517 has 5, so 482 < 517. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 2 | 1 | Compares the ones first, 7 is more than 0, so 607 > 670. / Hundreds match, so compare tens next: 0 tens is less than 7 tens, so 607 < 670. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 2 | 2 | Says 607 = 670 because both use the digits 6, 0 and 7. / Place matters: 607 has 0 tens, 670 has 7 tens, so 607 < 670. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 3 | 1 | DROPPED: wrong needs commas for thousands; fix needs commas for thousands | none |
| 3.1-compare-order-1000 | 3 | 2 | DROPPED: wrong needs commas for thousands; fix needs commas for thousands | none |
| 3.1-compare-order-1000 | 3 | 3 | DROPPED: wrong needs commas for thousands; fix needs commas for thousands | none |
| 3.1-compare-order-1000 | 4 | 1 | Picks 605 as between 650 and 700, but it is below 650. / Between means more than 650 and less than 700. 683 fits, but 605 < 650. | claude-opus-5-5 |
| 3.1-compare-order-1000 | 4 | 2 | Picks 710 as between 650 and 700, but it is above 700. / Between means more than 650 and less than 700. Only 683 fits; 710 > 700. | claude-opus-5-5 |
| 3.1-count-1000 | 2 | 1 | DROPPED: wrong needs commas for thousands | none |
| 3.1-count-1000 | 3 | 3 | DROPPED: Source is inconsistent. The jump is 25 (180, 205, 230), so the answer is 255. Counting on by 1 from 230 would give 231, not 256. 256 is just 255 + 1, so it does not match the stated reason. | none |
| 3.1-count-1000 | 4 | 1 | DROPPED: wrong needs commas for thousands | none |
| 3.1-count-1000 | 5 | 1 | DROPPED: Source is inconsistent. The blanks follow 40, so adding 1 each time would give 41, 42, not 37, 38. The wrong answer 37, 38 continues from 36, so it does not match the stated reason. | none |
| 3.1-estimate-quantity | 1 | 2 | Saying 25 beads uses only one box, though the jar holds about 4 boxes. / Use all 4 boxes: 25 + 25 + 25 + 25 = 100, so about 100 beads. | claude-opus-5-5 |
| 3.1-estimate-quantity | 2 | 2 | Writing 60 for 6 pages of about 100 words has too few zeros. / 6 groups of 100 is 6 hundreds, which is 600, so about 600 words. | claude-opus-5-5 |
| 3.1-estimate-quantity | 2 | 3 | Saying 100 words counts only one page out of the 6 pages. / Count all 6 pages of about 100: 100 × 6 = 600, so about 600 words. | claude-opus-5-5 |
| 3.3-add-within-1000 | 3 | 2 | In 465 + 278, adding tens as 6 + 7 = 13 forgets the ten traded from 5 + 8 = 13. / Add the traded ten too: 6 + 7 + 1 = 14 tens. Then the total is 743. | claude-opus-5-5 |
| 3.3-add-within-1000 | 3 | 3 | In 465 + 278, adding hundreds as 4 + 2 = 6 forgets the traded hundred. / The 14 tens trade 1 hundred: 4 + 2 + 1 = 7 hundreds, so 743. | claude-opus-5-5 |
| 3.3-add-within-1000 | 4 | 1 | 256 + 389 = 645 adds only two of the three numbers. / Add the third number too: 645 + 147 = 792. | claude-opus-5-5 |
| 3.3-add-within-1000 | 5 | 1 | Changing 198 to 200 and answering 245 forgets to fix the answer. / 200 is 2 more than 198, so take 2 off: 245 − 2 = 243. | claude-opus-5-5 |
| 3.3-add-within-1000 | 5 | 2 | After 200 + 45 = 245, adding the 2 to get 247 goes the wrong way. / 200 is 2 more than 198, so the answer is 2 less: 245 − 2 = 243. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 2 | 1 | In 562 − 238, doing 8 − 2 = 6 in the ones flips the digits to avoid a trade. / 2 is less than 8, so trade a ten: 12 − 8 = 4, tens 5 − 3 = 2, so 324. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 2 | 2 | In 562 − 238, trading a ten but still doing 6 − 3 in the tens gives 334. / After the trade the tens are 5, not 6. So 5 − 3 = 2, giving 324. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 3 | 1 | Taking the smaller digit from the larger in each column gives 455. / Trade: 14 − 9 = 5, 12 − 8 = 4, 6 − 3 = 3, so 734 − 389 = 345. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 3 | 2 | In 734 − 389, after trading for the ones, the tens stay 3 and give 355. / The tens become 2 after the trade. Trade again: 12 − 8 = 4, so 345. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 4 | 1 | Taking the smaller digit from the larger in each column gives 365. / Trade across the zero: 13 − 8 = 5, 9 − 6 = 3, 3 − 1 = 2, so 235. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 4 | 2 | Keeping 10 tens after trading a ten to the ones gives 10 − 6 = 4, so 245. / After that trade only 9 tens are left, so 9 − 6 = 3 and 403 − 168 = 235. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 5 | 1 | Smaller digit from larger in each column gives 375. / Trade: 12 − 7 = 5, 10 − 8 = 2, 4 − 2 = 2, so 225. Check: 225 + 287 = 512. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 5 | 2 | In 512 − 287, keeping the tens as 1 after trading a ten gives 235. / The tens become 0 after the trade, so trade a hundred: 10 − 8 = 2. Answer 225. | claude-opus-5-5 |
| 3.3-subtract-within-1000 | 5 | 3 | Checks 512 - 287 = 225 by doing the subtraction again. / Add back: 225 + 287 = 512, which matches the start number. | claude-opus-5-5 |
| 3.3-word-problems-1000 | 2 | 1 | 312 - 189 by subtracting smaller digit from larger in each place gives 277. / Regroup 312 as 2 hundreds, 10 tens, 12 ones: 12-9=3, 10-8=2, 2-1=1: 123. | claude-opus-5-5 |
| 3.3-word-problems-1000 | 3 | 2 | Answers 425, one of the amounts, for how many more. / How many more is the difference: 425 - 298 = 127. | claude-opus-5-5 |
| 3.3-word-problems-1000 | 3 | 3 | 425 - 298: takes the smaller digit from the larger in each place, 273. / Regroup 425 as 3 hundreds, 11 tens, 15 ones: 15-8=7, 11-9=2, 3-2=1, so 127. | claude-opus-5-5 |
| 3.3-word-problems-1000 | 4 | 2 | Stops at 520 - 245 = 275 and ignores the 130 more. / Do the second step too: 275 + 130 = 405. | claude-opus-5-5 |
| 3.4-recall-addition-20 | 2 | 1 | 9 + 6: makes ten with 9 + 1, then adds all 6 to get 16. / Give 1 of the 6 to make ten, leaving 5: 10 + 5 = 15. | claude-opus-5-5 |
| 3.4-recall-addition-20 | 2 | 2 | For 9 + 6, counts 9 as the first count on and stops at 14. / Start after 9: 10, 11, 12, 13, 14, 15 is six counts on, so 15. | claude-opus-5-5 |
| 3.4-recall-addition-20 | 3 | 1 | For 8 + 5, counts 8 as the first count on and stops at 12. / Start after 8: 9, 10, 11, 12, 13 is five counts on, so 13. | claude-opus-5-5 |
| 3.4-recall-addition-20 | 3 | 2 | 8 + 5: makes ten with 8 + 2, then adds all 5 to get 15. / Split 5 into 2 and 3. 8 + 2 = 10, then add the 3 left: 13. | claude-opus-5-5 |
| 3.4-subtraction-facts-20 | 1 | 2 | For 14 - 8, copies the 8 from the fact and answers 8. / 6 + 8 = 14, so taking 8 from 14 leaves the other part, 6. | claude-opus-5-5 |
| 3.4-subtraction-facts-20 | 2 | 1 | For 15 - 7, counts 15 as the first count back and lands on 9. / Start after 15: 14, 13, 12, 11, 10, 9, 8 is seven back, so 8. | claude-opus-5-5 |
| 3.4-subtraction-facts-20 | 3 | 1 | For 13 - 5, counts 13 as the first count back and lands on 9. / Start after 13: 12, 11, 10, 9, 8 is five back, so 8. | claude-opus-5-5 |
| 3.4-subtraction-facts-20 | 4 | 1 | For 9 + __ = 17, adds 9 + 17 to get 26. / The missing part goes with 9 to make 17, so find 17 - 9 = 8. | claude-opus-5-5 |
| 3.4-subtraction-facts-20 | 4 | 2 | For 9 + __ = 17, writes the 9 that is already there. / Find the other part: 9 + 8 = 17, so the missing number is 8. | claude-opus-5-5 |
| 3.6-increasing-pattern | 1 | 1 | For 5, 10, 15, counts on by 1 and writes 16. / The jump is 5 (10 - 5), so 15 + 5 = 20. | claude-opus-5-5 |
| 3.6-increasing-pattern | 2 | 1 | For 7, 11, 15, adds the first number 7 to 15 and gets 22. / The jump is 4 (11 - 7), not 7. Add 4 to 15 to get 19. | claude-opus-5-5 |
| 3.6-increasing-pattern | 2 | 2 | For 7, 11, 15, counts on by 1 and writes 16. / The jump is 4 (11 - 7), so 15 + 4 = 19. | claude-opus-5-5 |
| 3.6-increasing-pattern | 3 | 1 | For 12, 18, __, 30, counts on by 1 from 18 and writes 19. / The jump is 6 (18 - 12), so 18 + 6 = 24, and 24 + 6 = 30. | claude-opus-5-5 |
| 3.6-increasing-pattern | 4 | 1 | Gives 12, which is step 4, when asked for step 5. / Each step adds 3 squares: step 4 is 12, so step 5 is 12 + 3 = 15. | claude-opus-5-5 |
| 3.6-decreasing-pattern | 1 | 1 | For 50, 45, 40, counts back by 1 and writes 39. / The jump down is 5 (45 - 40), so 40 - 5 = 35. | claude-opus-5-5 |
| 3.6-decreasing-pattern | 1 | 2 | Writes 45 after 40, going back up. / The pattern drops 5 each time, so the next term is 40 − 5 = 35. | claude-opus-5-5 |
| 3.6-decreasing-pattern | 2 | 1 | Counts back 1 from 84 to get 83. / The jump is 100 − 92 = 8, not 1, so the next term is 84 − 8 = 76. | claude-opus-5-5 |
| 3.6-decreasing-pattern | 2 | 2 | Writes 92 after 84, which goes back up. / The terms go down by 8 each time (100, 92, 84), so the next is 84 − 8 = 76. | claude-opus-5-5 |
| 3.6-decreasing-pattern | 3 | 1 | DROPPED: fix needs commas for thousands | none |
| 3.6-growth-amount | 1 | 1 | Says the jump is 4, just because 4 is the first number. / The jump is the gap between neighbours: 9 − 4 = 5, and 14 − 9 = 5. | claude-opus-5-5 |
| 3.6-growth-amount | 1 | 2 | Gives 24, the next term, instead of the jump. / The question asks for the jump: 9 − 4 = 5. (19 + 5 = 24 is the next term.) | claude-opus-5-5 |
| 3.6-growth-amount | 2 | 1 | Works out 83 − 71 = 12 and calls that the jump. / 83 to 71 is two steps. One step is 83 − 77 = 6, so down by 6. | claude-opus-5-5 |
| 3.6-growth-amount | 2 | 2 | Says up by 6 even though the numbers get smaller. / 83, 77, 71 get smaller each time, so the pattern goes down by 6. | claude-opus-5-5 |
| 3.6-growth-amount | 3 | 1 | Adds the first jump 3 to 24 to get 27. / Each term doubles (6, 12, 24), so the next is 24 × 2 = 48. | claude-opus-5-5 |
| 3.6-growth-amount | 3 | 2 | Multiplies 24 by the first term 3 to get 72. / The terms double, so multiply by 2, not 3: 24 × 2 = 48. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 1 | 1 | Picks blue, which has only 1 part out of 4. / Red has 3 parts out of 4, more than blue's 1, so red is more likely. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 2 | 1 | Says yellow is most likely and red is least likely. / The most in the bag is most likely: red, 6. The fewest is least likely: yellow, 1. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 2 | 2 | Picks green (2) as least likely. / Least likely has the fewest in the bag. Yellow has 1, which is fewer than green's 2. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 3 | 1 | Picks less than 3, which has only 2 faces (1 and 2). / More than 2 has 4 faces (3, 4, 5, 6), so it is more likely. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 3 | 2 | DROPPED: The source contradicts itself. The choices are 'less than 3' and 'more than 2', so only one mentions 3. The mistake's 'why' (sees 3 in both) and the pair's wrong statement ('both choices mention 3') don't match this problem. The fix's face counts (2 vs 4) are correct, but the wrong side misdescribes the step. | none |
| 3.13-simulated-likelihood | 4 | 1 | Says a 7 sometimes happens on a 1-6 die, just rarely. / A 1-6 die has no 7 face, so a 7 never happens. Pick the chance word that means never. | claude-opus-5-5 |
| 3.13-simulated-likelihood | 4 | 2 | Says rolling a 7 always happens, mixing up never and always. / A 1-6 die has no 7 face, so it never happens. Pick the word for never. | claude-opus-5-5 |
| 3.13-independent-trials | 1 | 1 | Thinks tails is due after 3 heads in a row. / A coin has no memory. The next flip is still equally likely to be heads or tails. | claude-opus-5-5 |
| 3.13-independent-trials | 1 | 2 | Thinks 3 heads in a row means heads will keep coming. / Earlier flips don't change the next one. Heads and tails are still equally likely. | claude-opus-5-5 |
| 3.13-independent-trials | 2 | 1 | Thinks blue is more likely after 4 reds in a row. / A spinner has no memory. Half red, half blue gives equal chances on every spin. | claude-opus-5-5 |
| 3.13-independent-trials | 2 | 2 | Says red is more likely next because it landed red 4 times. / Past spins don't change it: half red, half blue means equal chances each spin. | claude-opus-5-5 |
| 3.13-independent-trials | 3 | 1 | Gives 12 tails by copying the heads count. / Tails are the rest of the 20 tosses: 20 − 12 = 8. | claude-opus-5-5 |
| 3.5-equal-groups | 1 | 1 | Adds the 4 groups and the 3 in each group to get 7. / Add the group size 4 times: 3 + 3 + 3 + 3 = 12. | claude-opus-5-5 |
| 3.5-equal-groups | 1 | 2 | Adds only three 3s, 3 + 3 + 3 = 9, for 4 groups. / Four groups means four 3s: 3 + 3 + 3 + 3 = 12. | claude-opus-5-5 |
| 3.5-equal-groups | 2 | 1 | Adds the 3 rows and the 5 in each row to get 8. / Add 5 for each row: 5 + 5 + 5 = 15. | claude-opus-5-5 |
| 3.5-equal-groups | 2 | 2 | Adds only two rows of 5, 5 + 5 = 10, for 3 rows. / Use all 3 rows: 5 + 5 + 5 = 15. | claude-opus-5-5 |
| 3.5-equal-groups | 3 | 1 | Adds 5 + 2 = 7 instead of multiplying. / 5 × 2 means 5 groups of 2: 2 + 2 + 2 + 2 + 2 = 10. | claude-opus-5-5 |
| 3.5-equal-groups | 4 | 2 | Counts only 5 bags of 4 apples, giving 20. / Use all 6 bags: 6 × 4 = 24 apples. | claude-opus-5-5 |
| 3.5-equal-groups | 5 | 1 | Adds the 4 jumps and the jump size 3 to get 7. / 4 jumps of 3 is 3 + 3 + 3 + 3 = 12, so 4 × 3 = 12. | claude-opus-5-5 |
| 3.5-grouping-division | 2 | 1 | Counts every number landed on, including the start 24, to get 5. / Count jumps, not stops: 24, 18, 12, 6, 0 is 4 jumps. | claude-opus-5-5 |
| 3.5-grouping-division | 2 | 2 | Gives 18, where the first jump lands, not the number of jumps. / Keep jumping back by 6 to 0 and count: 18, 12, 6, 0 is 4 jumps. | claude-opus-5-5 |
| 3.5-relate-multiply-divide | 1 | 2 | Copies the 3 from the fact as the answer to 12 ÷ 3. / 12 ÷ 3 asks what times 3 makes 12: 3 × 4 = 12, so 4. | claude-opus-5-5 |
| 3.5-relate-multiply-divide | 2 | 2 | Multiplies 30 × 5 = 150 instead of dividing 30 ÷ 5. / Find what times 5 makes 30: 5 × 6 = 30, so 30 ÷ 5 = 6. | claude-opus-5-5 |
| 3.5-relate-multiply-divide | 3 | 1 | Adds 7 + 3 = 10 for 7 teams of 3 players. / Equal teams mean multiply: 7 × 3 = 21 players. | claude-opus-5-5 |
| 3.8-unknown-result-change | 1 | 2 | Forgets the traded ten, so 45 + 27 comes out as 62. / 5 + 7 = 12, so carry a ten: 4 tens + 2 tens + 1 ten = 7 tens, 72. | claude-opus-5-5 |
| 3.8-unknown-result-change | 2 | 1 | Adds 38 + 55 = 93 instead of finding what to add to 38. / Find the gap from 38 up to 55: 55 − 38 = 17. | claude-opus-5-5 |
| 3.8-unknown-result-change | 2 | 2 | In 55 − 38, takes the smaller digit from the larger in each column: 23. / 5 can't take 8, so trade a ten: 15 − 8 = 7, 4 − 3 = 1, so 17. | claude-opus-5-5 |
| 3.8-unknown-result-change | 2 | 3 | Trades for 15 − 8 = 7 but then still does 5 − 3 = 2, giving 27. / The tens became 4 after trading, so 4 − 3 = 1 and 55 − 38 = 17. | claude-opus-5-5 |
| 3.8-unknown-result-change | 3 | 1 | In 64 − 29, takes the smaller digit from the larger in each column: 45. / 4 can't take 9, so trade: 14 − 9 = 5, 5 − 2 = 3, so 35. | claude-opus-5-5 |
| 3.8-unknown-result-change | 3 | 2 | Adds 64 + 29 = 93 instead of finding the part taken away. / The change is what leaves 29 from 64: 64 − 29 = 35. | claude-opus-5-5 |
| 3.8-unknown-result-change | 4 | 2 | Takes smaller digit from larger in each column: 41 − 26 = 25. / Ones: 1 < 6, so trade a ten: 11 − 6 = 5. Tens: 3 − 2 = 1. So 15 cards. | claude-opus-5-5 |
| 3.8-unknown-start | 1 | 1 | Solves ? + 8 = 15 by adding 15 + 8 to get 23. / The missing number plus 8 makes 15, so undo the add by taking away: 15 − 8 = 7. | claude-opus-5-5 |
| 3.8-unknown-start | 1 | 2 | Writes ? = 8 in ? + 8 = 15 by copying the 8 already shown. / ? plus 8 must make 15, so ? = 15 − 8 = 7. Check: 7 + 8 = 15. | claude-opus-5-5 |
| 3.8-unknown-start | 2 | 1 | Solves ? − 7 = 6 by subtracting 7 − 6 to get 1. / Taking 7 away left 6, so add 7 back to find the start: 6 + 7 = 13. | claude-opus-5-5 |
| 3.8-unknown-start | 2 | 2 | Writes 6 for ? − 7 = 6 by copying the 6 from the equation. / 6 is what is left after taking away 7. The start is bigger: 6 + 7 = 13. | claude-opus-5-5 |
| 3.8-unknown-start | 3 | 1 | Solves ? − 35 = 48 by subtracting 48 − 35 to get 13. / The start is bigger than 48. Add 35 back: 48 + 35 = 83. | claude-opus-5-5 |
| 3.8-unknown-start | 3 | 2 | Adds 48 + 35 but forgets the carried ten from 8 + 5 = 13 ones, getting 73. / 8 + 5 = 13 ones: write 3, carry 1 ten. Tens: 4 + 3 + 1 = 8. So 83. | claude-opus-5-5 |
| 3.8-unknown-start | 4 | 1 | Subtracts $57 − $24 to get $33 even though the amount at the start is unknown. / $24 was spent and $57 remains, so the start was more: $57 + $24 = $81. | claude-opus-5-5 |
| 3.8-unknown-start | 4 | 2 | Gives $57, the amount left after spending $24, as the amount at the start. / $57 is what remains. Add back the $24 spent: $57 + $24 = $81 at the start. | claude-opus-5-5 |
| 3.8-unknown-start | 4 | 3 | Adds $57 + $24 but forgets the carried ten from 7 + 4 = 11 ones, getting $71. / 7 + 4 = 11 ones: write 1, carry 1 ten. Tens: 5 + 2 + 1 = 8. So $81. | claude-opus-5-5 |
| 3.8-balance-equations | 1 | 1 | Says 35 + 20 = 40 + 15 is false because the numbers on each side differ. / Add each side: 35 + 20 = 55 and 40 + 15 = 55. Same total, so true. | claude-opus-5-5 |
| 3.8-balance-equations | 1 | 2 | Says 55, treating = as 'write the answer' after 35 + 20. / = means both sides are equal. 35 + 20 = 55 and 40 + 15 = 55, so it is true. | claude-opus-5-5 |
| 3.8-balance-equations | 3 | 2 | Takes away 10 from 50 to get 40 for 80 − 30 = ? − 10. / 80 − 30 = 50, so ? − 10 = 50. Add the 10 back: 50 + 10 = 60. | claude-opus-5-5 |
| 3.8-balance-equations | 4 | 2 | Compares only 38 and 40, so says the missing number is 2. / The whole left side counts: 38 + 27 = 65. Then 40 + ? = 65, so ? = 25. | claude-opus-5-5 |
| 3.8-write-equation | 1 | 2 | Writes 12 − ? = 5 but adds 12 + 5 to get 17. / 12 − ? = 5: 12 take away ? leaves 5, so ? = 12 − 5 = 7. | claude-opus-5-5 |
| 3.8-write-equation | 2 | 1 | Writes ? − 9 = 23 when 9 are added to an unknown start to make 23. / Adding 9 gives 23, so write ? + 9 = 23. Then ? = 23 − 9 = 14. | claude-opus-5-5 |
| 3.8-write-equation | 3 | 2 | Finds 96 − 38 by taking the smaller digit from the larger in each column: 62. / Trade a ten: 16 − 8 = 8 ones, then 8 − 3 = 5 tens. So ? = 58. | claude-opus-5-5 |
| 3.8-write-equation | 3 | 3 | Trades a ten for the ones in 96 − 38 but still uses 9 tens, getting 68. / After trading, 9 tens become 8 tens. Tens: 8 − 3 = 5. Ones: 16 − 8 = 8. So 58. | claude-opus-5-5 |
| 3.7-describe-rule | 1 | 1 | Picks add 2 for 2, 6, 10, 14 because the first number is 2. / The step is the gap between neighbours: 6 − 2 = 4, so start at 2, add 4. | claude-opus-5-5 |
| 3.7-describe-rule | 1 | 2 | Picks start at 4, add 2 for 2, 6, 10, 14, swapping the start and the step. / The list begins at 2, so that is the start. Each gap is 4, so add 4. | claude-opus-5-5 |
| 3.7-describe-rule | 2 | 1 | Writes 'start at 30, add 3' for 30, 27, 24, 21. / The numbers get smaller by 3 each time, so write 'start at 30, take away 3 each time'. | claude-opus-5-5 |
| 3.7-describe-rule | 2 | 2 | Says 'start at 3, take away 30' for 30, 27, 24, 21. / The start is the first number, 30. The gap is 30 − 27 = 3: 'start at 30, take away 3'. | claude-opus-5-5 |
| 3.7-describe-rule | 3 | 1 | Says 'start at 4, add 4' for towers of 4, 7 and 10 blocks. / The first tower is the start. The step is the gap: 7 − 4 = 3, so 'start at 4, add 3'. | claude-opus-5-5 |
| 3.7-describe-rule | 3 | 2 | Writes 'start at 3, add 4' for towers of 4, 7 and 10 blocks. / The start is the first tower, 4. The step is the gap, 7 − 4 = 3. So 'start at 4, add 3'. | claude-opus-5-5 |
| 3.7-use-rule | 1 | 1 | Lists 11, 17, 23, 29, 35 for 'start at 5, add 6', leaving out the start 5. / The first 5 terms include the start: 5, 11, 17, 23, 29. | claude-opus-5-5 |
| 3.7-use-rule | 1 | 2 | Writes 5, 10, 15, 20, 25 by adding the start, 5, each time. / Add the step, 6, each time: 5, 11, 17, 23, 29. | claude-opus-5-5 |
| 3.7-use-rule | 2 | 1 | Adds 2 ten times to the start 3 and gets 23 for the 10th term. / The 3 is already term 1, so add 2 only nine times: 3 + 9 × 2 = 21. | claude-opus-5-5 |
| 3.7-use-rule | 2 | 2 | Finds the 10th term as 10 × 2 = 20, ignoring the start 3. / Begin at 3, then add 9 twos: 3 + 18 = 21. | claude-opus-5-5 |
| 3.7-use-rule | 3 | 1 | Adds 3 six times from 5 tiles and gets 23 for figure 6. / Figure 1 is the start, so add 3 only five times: 5 + 5 × 3 = 20. | claude-opus-5-5 |
| 3.7-use-rule | 3 | 2 | Works out 6 × 3 = 18 for figure 6 and never adds the 5 tiles in figure 1. / Start with 5 tiles, then add 5 steps of 3: 5 + 15 = 20. | claude-opus-5-5 |
| 3.12-read-bar-graph | 2 | 2 | Answers 14 for 'how many more chose dogs', giving only the dogs amount. / 'How many more' asks for the difference: 14 − 9 = 5. | claude-opus-5-5 |
| 3.12-read-bar-graph | 2 | 3 | Gets 15 for 14 − 9 by doing 9 − 4 in the ones and 1 − 0 in the tens. / 4 ones is less than 9, so regroup: 14 is 10 and 4, and 14 − 9 = 5. | claude-opus-5-5 |
| 3.12-read-bar-graph | 3 | 1 | Adds only red and blue, 12 + 9 = 21, and skips green 15. / 'In all' needs all three numbers: 12 + 9 + 15 = 36. | claude-opus-5-5 |
| 3.12-read-bar-graph | 3 | 3 | Writes 63 as the total by flipping the digits of 36. / 12 + 9 + 15 = 36, which is 3 tens and 6 ones, so the tens digit comes first. | claude-opus-5-5 |
| 3.12-read-bar-graph | 5 | 1 | Ticks 4 squares for blue, counting the base line as square 1. / Count only squares, starting just above the base line. Blue is 3, so tick 3 squares. | claude-opus-5-5 |
| 3.12-read-bar-graph | 5 | 2 | Ticks 5 squares for blue, which is the green value. / Read the blue row of the table: blue is 3, so tick 3 squares. | claude-opus-5-5 |
| 3.12-tally | 3 | 2 | Counts only 2 cats in cat, dog, cat, fish, cat, dog. / Check each item once. Cats are 1st, 3rd and 5th, so there are 3. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 1 | 1 | Says 6 cents by counting the 6 coins instead of adding their values. / Add values: 75 + 20 + 5 = 100 cents, which is $1.00. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 1 | 2 | Adds 3 quarters and 2 dimes to get $0.95, leaving out the nickel. / Add the nickel too: 75 + 20 + 5 = 100 cents, which is $1.00. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 2 | 1 | Says 4 bills by counting the bills instead of adding their values. / Add the values: 20 + 10 + 5 + 5 = 40, so the total is $40. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 2 | 2 | Adding $20 + $10 + $5 and skipping the second $5, to get $35. / Add all four bills: 20 + 10 + 5 + 5 = $40. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 3 | 1 | Counting 3 quarters as $3, so the total comes to $31. / A quarter is 25¢, so 3 quarters is 75¢. $28 + $0.75 = $28.75. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 3 | 2 | Adding only the bills, toonie and loonie to get $28, and skipping the quarters. / Add the 3 quarters too: they are 75¢, so $28 + $0.75 = $28.75. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 4 | 1 | Counting each toonie as $1, so 2 toonies add $2 and the total is $97. / A toonie is $2, so 2 toonies add $4: 50 + 40 + 5 + 4 = $99. | claude-opus-5-5 |
| 3.14-coins-bills-100 | 4 | 2 | Adding $50, $40 and $5 for $95 and leaving out the 2 toonies. / Add the toonies too: each is $2, so 2 toonies are $4. $95 + $4 = $99. | claude-opus-5-5 |
| 3.14-make-amount-ways | 1 | 1 | Using 10 nickels for $1 because 10 dimes make $1. / A nickel is 5¢, so 10 nickels is only 50¢. $1 needs 20 nickels. | claude-opus-5-5 |
| 3.14-earning-payment | 3 | 2 | Answering $5 for 4 weeks of earning, counting only one week. / Earn $5 each week for 4 weeks: 5 + 5 + 5 + 5 = 4 × $5 = $20. | claude-opus-5-5 |
| 3.14-earning-payment | 4 | 2 | Adding $12 + $15 = $27 and stopping, without subtracting the $20 price. / After earning $27, subtract the $20 book: 27 − 20 = $7 left. | claude-opus-5-5 |
| 3.2-equal-parts | 1 | 1 | DROPPED: The example square is described as cut into 4 equal parts, so the right answer is yes. The stated wrong answer is also yes, so the final answer is right and only the reasoning is flawed. The answer key 'yes or no' is also not a single definite answer. | none |
| 3.2-equal-parts | 1 | 2 | DROPPED: The source doesn't give enough to check this. The answer is 'yes or no', so no correct answer is committed. The picture is only described as '4 equal parts', not as different shapes, so the mistake ('no, because the parts are different shapes') may not fit the picture. The fix also falls short: it says each part 'covers 1/4 of the square' based on an unseen figure, copying the question instead of giving the child a way to check (compare how much space each part covers). 'Not same shape' could be read as 'equal parts must be different shapes'; 'not necessarily the same shape' would be accurate. | none |
| 3.2-equal-parts | 2 | 1 | DROPPED: The source is inconsistent. The task asks for the rectangle cut into 4 equal parts, but the wrong answer has 3 pieces, which cannot come from counting 4 parts. The step also depends on figures that aren't shown. | none |
| 3.2-equal-parts | 3 | 1 | Saying triangle pieces can't be fourths since they look different. / Both diagonals make 4 same-size triangles, so each is 1/4. | claude-opus-5-5 |
| 3.2-name-fraction-region | 1 | 1 | Writing 1/3, using the 3 other parts as the bottom number. / The bottom is all the equal parts, 4, so 1 of 4 is 1/4. | claude-opus-5-5 |
| 3.2-name-fraction-region | 1 | 2 | Writing 4/1 with the total of 4 parts on top. / The part you name goes on top and the total goes on the bottom: 1/4. | claude-opus-5-5 |
| 3.2-name-fraction-region | 2 | 1 | Writing 3/5, using the 5 parts not named as the bottom number. / The bottom is all 8 equal parts, not just the other 5, so it is 3/8. | claude-opus-5-5 |
| 3.2-name-fraction-region | 2 | 2 | Writing 8/3 with the total of 8 parts on top. / The 3 named parts go on top, and the 8 equal parts in all go on the bottom: 3/8. | claude-opus-5-5 |
| 3.2-name-fraction-region | 3 | 1 | Choosing 1 of 3 parts filled for 2/3 by counting the 2 empty parts. / 2/3 means 2 of 3 equal parts are filled. Count the filled ones, not the empty. | claude-opus-5-5 |
| 3.2-name-fraction-region | 4 | 1 | Writing "five sixths" as 6/5, with the total parts on top. / Five is how many parts, so it goes on top. Sixths goes on the bottom: 5/6. | claude-opus-5-5 |
| 3.2-fraction-of-set | 1 | 1 | Writing 2/3 for 2 red out of 5 balloons, using the 3 not red as the bottom. / The bottom is all 5 balloons in the set, so 2 red of 5 is 2/5. | claude-opus-5-5 |
| 3.2-fraction-of-set | 1 | 2 | Writing 5/2 for 2 red out of 5 balloons, with the total on top. / The 2 red balloons go on top and all 5 balloons go on the bottom: 2/5. | claude-opus-5-5 |
| 3.2-fraction-of-set | 3 | 1 | 2/3 of 15 = 5, stopping after 15 ÷ 3 = 5, which is only 1/3 of 15. / Each third of 15 is 5, and 2/3 needs 2 thirds: 2 × 5 = 10. | claude-opus-5-5 |
| 3.2-fraction-number-line | 1 | 1 | A line split into 4 equal parts has 5 marks, so the third mark is 3/5. / The bottom number is the 4 equal parts, not the marks. Third mark is 3/4. | claude-opus-5-5 |
| 3.2-fraction-number-line | 1 | 2 | Counts 0 as the first mark, so the third mark is only 2/4. / 0 is the start. Count fourths after it: 1/4, 2/4, 3/4. Third mark is 3/4. | claude-opus-5-5 |
| 3.2-fraction-number-line | 2 | 1 | Counts 0 as mark 1, so 2/3 goes at the first mark after 0, which is 1/3. / Start at 0 and count 2 thirds: 1/3, 2/3. Mark the second mark after 0. | claude-opus-5-5 |
| 3.2-fraction-number-line | 2 | 2 | Flips 2/3 to 3/2 and marks it past 1. / Top 2 = parts counted, bottom 3 = parts in the whole. Count 2 thirds from 0, before 1. | claude-opus-5-5 |
| 3.2-fraction-number-line | 4 | 1 | Picks 1/3 as closer to 1 because its top number is 1. / Same thirds: 2/3 is 1 third from 1, but 1/3 is 2 thirds away. 2/3 is closer. | claude-opus-5-5 |
| 3.2-fraction-number-line | 4 | 2 | Says 2/3 and 1/3 are the same distance from 1. / 2/3 is 1 third from 1, but 1/3 is 2 thirds from 1. So 2/3 is closer. | claude-opus-5-5 |
| 3.2-fraction-whole | 1 | 1 | Says 1 fifth makes 1 whole, counting only one part. / A whole is split into 5 equal fifths, and all 5 are needed to make 1. | claude-opus-5-5 |
| 3.2-fraction-whole | 2 | 1 | Says 3/8 is left, but 3/8 is the part eaten. / Left = 8 - 3 = 5 slices out of 8, so 5/8. | claude-opus-5-5 |
| 3.2-fraction-whole | 3 | 1 | Says 3/4 is left, but 1 + 2 = 3 pieces is the part eaten. / 3 of 4 pieces are gone, so 4 - 3 = 1 piece is left: 1/4. | claude-opus-5-5 |
| 3.9-metric-units | 1 | 1 | Picks km for the length of a table, a unit far too big. / A table is about 1 or 2 steps long. km is for long trips, so use m. | claude-opus-5-5 |
| 3.9-metric-units | 1 | 2 | Picks g for the length of a table, but g measures mass. / Length uses cm, m or km. A table is about 1 m long, so pick m. | claude-opus-5-5 |
| 3.9-metric-units | 2 | 1 | Picks g for a bag of flour, as if 1 g were big. / 1 g is very light, like a small paper clip. A bag of flour is about 1 kg. | claude-opus-5-5 |
| 3.9-metric-units | 2 | 2 | Picks mL for a bag of flour, but mL measures capacity. / Flour is weighed, so use a mass unit: g or kg. A bag is about 1 kg. | claude-opus-5-5 |
| 3.9-metric-units | 3 | 1 | Says a door is about 2 cm tall, a unit that is too small. / 2 cm is about a finger's width. A door is about 2 m tall. | claude-opus-5-5 |
| 3.9-metric-units | 3 | 2 | Says a door is 2 kg tall, using a mass unit for height. / Height is a length, so use cm, m or km. A door is about 2 m tall. | claude-opus-5-5 |
| 3.9-metric-units | 4 | 2 | Gives 100 mL, the size of one cup only. / The jug holds 10 cups, so 10 × 100 mL = 1,000 mL, which is 1 L. | claude-opus-5-5 |
| 3.9-convert-m-cm | 1 | 1 | Uses 1 m = 10 cm, so 3 m = 30 cm. / 1 m = 100 cm, so 3 m = 3 × 100 = 300 cm. | claude-opus-5-5 |
| 3.9-convert-m-cm | 1 | 2 | Uses 1 m = 1,000 cm, so 3 m = 3,000 cm. / 1 m = 100 cm, not 1,000 cm. So 3 m = 3 × 100 = 300 cm. | claude-opus-5-5 |
| 3.9-convert-m-cm | 1 | 3 | Keeps the 3 when m changes to cm, so 3 m = 3 cm. / A cm is much smaller than a m, so the number gets bigger: 3 × 100 = 300 cm. | claude-opus-5-5 |
| 3.9-convert-m-cm | 2 | 1 | Thinks 10 cm make 1 m, so 500 cm becomes 50 m. / 1 m is 100 cm, so 500 cm is 5 hundreds: 5 m. | claude-opus-5-5 |
| 3.9-convert-m-cm | 2 | 2 | Keeps the number 500 when changing 500 cm to metres, giving 500 m. / 100 cm make 1 m, so the number gets smaller: 500 ÷ 100 = 5 m. | claude-opus-5-5 |
| 3.9-convert-m-cm | 4 | 2 | Says 1 m 20 cm and 125 cm are equal. / 1 m 20 cm is 120 cm. 125 cm is 5 cm more, so 125 cm is longer. | claude-opus-5-5 |
| 3.9-area-square-units | 1 | 1 | Adds the sides, 4 + 3 = 7, for a 4 by 3 rectangle. / Area counts squares inside: 3 rows of 4 squares is 12 square units. | claude-opus-5-5 |
| 3.9-area-square-units | 2 | 2 | Counts only the bottom row of 5 squares in the L-shape. / Count every part: 5 in the row plus 3 on top is 8 square units. | claude-opus-5-5 |
| 3.9-area-square-units | 3 | 1 | Adds 5 + 6 = 11 for 5 rows of 6 squares. / Rows of equal size need multiplying: 5 × 6 = 30 square units. | claude-opus-5-5 |
| 3.9-area-square-units | 4 | 1 | Picks B by 1 because its longest side, 6, is bigger than 5. / Compare whole areas: 4 × 5 = 20, 3 × 6 = 18, so A is bigger by 2. | claude-opus-5-5 |
| 3.9-area-square-units | 4 | 2 | Says 4 by 5 and 3 by 6 have equal area because both have perimeter 18. / Area is 4 × 5 = 20 and 3 × 6 = 18, so A is bigger by 2. | claude-opus-5-5 |
| 3.9-area-square-units | 4 | 3 | Answers A, by 20, which is just the area of A. / Find both areas, 20 and 18, then subtract: 20 − 18 = 2, so A by 2. | claude-opus-5-5 |
| 3.9-perimeter-concept | 1 | 2 | Adds only two sides, 3 + 2 = 5, for a 3 by 2 rectangle. / Perimeter goes around all four sides: 3 + 2 + 3 + 2 = 10 units. | claude-opus-5-5 |
| 3.9-perimeter-concept | 2 | 1 | Adds only 5 + 7 = 12 and leaves out a side of the triangle. / A triangle has three sides, so add all: 5 + 7 + 9 = 21 cm. | claude-opus-5-5 |
| 3.9-perimeter-concept | 3 | 1 | Adds only 12 + 8 = 20 for a 12 m by 8 m rectangle. / A rectangle has four sides: 12 + 8 + 12 + 8 = 40 m. | claude-opus-5-5 |
| 3.9-perimeter-concept | 4 | 1 | Adds only 125 + 60 = 185 m, which is two of the four sides. / Use two long and two short sides: 125 + 60 + 125 + 60 = 370 m. | claude-opus-5-5 |
| 3.10-time-units | 1 | 1 | Lists day, hour, minute, second, which is largest to smallest. / Start with the smallest unit: second, minute, hour, day. | claude-opus-5-5 |
| 3.10-time-units | 1 | 2 | Puts day before hour, swapping two neighbouring units. / An hour is shorter than a day (24 hours), so: second, minute, hour, day. | claude-opus-5-5 |
| 3.10-time-units | 2 | 2 | Uses 60 for hours in a day, which is the minutes in an hour. / A day has 24 hours. The 60 belongs to minutes in an hour. | claude-opus-5-5 |
| 3.10-time-units | 3 | 1 | Picks hours for brushing teeth, a unit far too large. / Brushing is short, so use minutes. 2 hours would be much too long. | claude-opus-5-5 |
| 3.10-time-units | 3 | 2 | Picks seconds for brushing teeth, a unit too small. / 2 seconds is too quick to brush teeth. Minutes is the sensible unit. | claude-opus-5-5 |
| 3.10-convert-time | 1 | 2 | Thinks a week has 10 days, so 3 weeks is 30 days. / A week has 7 days, so 3 weeks is 3 × 7 = 21 days. | claude-opus-5-5 |
| 3.10-convert-time | 2 | 1 | Treats 1 hour as 100 minutes, so 2 hours becomes 200 minutes. / 1 hour is 60 minutes, so 2 hours is 60 + 60 = 120 minutes. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 1 | 1 | A cube has 3 faces, counting only the faces you can see. / It has 6 faces: top, bottom, front, back, left and right, including the hidden ones. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 1 | 2 | A cube has 8 faces, because there are 8 corners. / Faces are the flat squares: top, bottom and 4 sides make 6. The 8 counts corners. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 2 | 1 | A cube has 12 vertices and 8 edges. / Edges are the 12 lines where faces meet. Vertices are the 8 corners. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 2 | 2 | A cube has 9 edges and 7 vertices, counting only those you can see. / Count the hidden ones too: a cube has 12 edges and 8 vertices. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 3 | 1 | A square pyramid has 4 faces, counting only the triangle sides. / Add the square base: 4 triangles + 1 base = 5 faces. | claude-opus-5-5 |
| 3.11-faces-edges-vertices | 3 | 2 | A square pyramid has 5 edges and 8 vertices. / Edges: 4 on the base plus 4 up the sides is 8. Vertices: 4 base corners plus the top is 5. | claude-opus-5-5 |
| 3.11-name-3d | 1 | 1 | A can is a rectangle, because its side looks like one. / A rectangle is flat. A can is a solid with 2 circle faces and a curved side: a cylinder. | claude-opus-5-5 |
| 3.11-name-3d | 1 | 2 | A can is a cone. / A cone has 1 circle face and a point. A can has 2 circle faces and a curved side, so it is a cylinder. | claude-opus-5-5 |
| 3.11-name-3d | 2 | 1 | 2 flat circle faces and 1 curved surface is a cone. / A cone has 1 circle face and a point. 2 circle faces and a curved side make a cylinder. | claude-opus-5-5 |
| 3.11-name-3d | 3 | 1 | A die is shaped like a square, the shape of one face. / A square is flat. A die is a solid with 6 square faces, so it is a cube. | claude-opus-5-5 |
| 3.11-name-3d | 3 | 2 | DROPPED: The stated wrong answer is not actually wrong. A die is a cube, and a cube is a special rectangular prism (6 rectangular faces, all squares), so 'rectangular prism' is a true but less exact name. The mistake cannot be written as a false statement without changing the key. | none |
| 3.11-name-3d | 4 | 1 | A cube and a rectangular prism are different shapes, so nothing is the same. / Both have 6 faces, 12 edges and 8 vertices, so they match. | claude-opus-5-5 |
| 3.11-nets | 1 | 1 | A straight row of 6 squares folds into a cube. / Six squares isn't enough; a row overlaps when folded. A cross of 6 folds with no overlap. | claude-opus-5-5 |
| 3.11-nets | 1 | 2 | A 2 by 3 block of 6 squares folds into a cube. / Six squares isn't enough; the block overlaps when folded. A cross of 6 has no overlap. | claude-opus-5-5 |
| 3.11-nets | 2 | 1 | 2 triangles and 3 rectangles fold into a triangular pyramid. / A pyramid's sides are all triangles; 3 rectangles make it a triangular prism. | claude-opus-5-5 |
| 3.11-nets | 2 | 2 | 2 triangles and 3 rectangles make a rectangular prism. / The 2 triangle ends make it a triangular prism; a rectangular prism needs 6 rectangles. | claude-opus-5-5 |
| 3.11-nets | 3 | 1 | A cube skeleton needs 8 straws and 12 balls. / Straws are edges: 12. Balls are vertices, the corners: 8. | claude-opus-5-5 |
| 3.11-nets | 3 | 2 | A cube skeleton needs 6 balls, one for each face. / Balls go at the corners, not the faces. A cube has 8 corners, so it needs 8 balls. | claude-opus-5-5 |
| 3.11-nets | 3 | 3 | 9 straws, 7 balls, counting only the front parts of a cube. / Count all: 12 edges (4 top, 4 bottom, 4 upright), 8 corners (4 top, 4 bottom). | claude-opus-5-5 |
| 4.1-place-value-10000 | 1 | 1 | DROPPED: The wrong answer '6 or 60' does not match the stated reason 'reads the digit, not its place'. Only 6 is the bare digit. 60 is a different error, using the tens place. One pair cannot describe both, so no sound single pair can be written without changing the source. | none |
| 4.1-place-value-10000 | 2 | 1 | Says the 7 in 4,708 is worth 70, skipping the zero place. / The 7 is in the hundreds place, so it is worth 700; the 0 holds the tens. | claude-opus-5-5 |
| 4.1-compare-order-10000 | 1 | 1 | Compares last digits first: 3 < 8, so says 4,723 < 4,698. / Compare from the left: thousands tie, 7 hundreds > 6 hundreds, so 4,723 > 4,698. | claude-opus-5-5 |
| 4.1-compare-order-10000 | 2 | 1 | DROPPED: fix needs commas for thousands; pair exceeds 150 characters | none |
| 4.1-expanded-form | 1 | 1 | Joins the parts side by side as 4,000,325 instead of adding them. / Add the parts: 4,000 + 300 + 20 + 5 = 4,325. | claude-opus-5-5 |
| 4.1-expanded-form | 2 | 1 | Leaves out the zero, writing 542 for 5,000 + 40 + 2. / No hundreds, so put 0 there: 5 thousands, 0 hundreds, 4 tens, 2 ones is 5,042. | claude-opus-5-5 |
| 4.1-expanded-form | 3 | 1 | Writes the 9 in 6,090 as 900, in the hundreds place. / The 9 is in the tens place, so it is 90: 6,000 + 90. | claude-opus-5-5 |
| 4.1-multiples | 3 | 1 | Lists the factors of 7 (1, 7) instead of its multiples. / Multiples come from counting by 7s: 7, 14, 21, 28, 35. | claude-opus-5-5 |
| 4.7-addition-facts-fluency | 2 | 1 | Counts back 8 from 15 and slips by one, getting 6 or 8. / Add up instead: 8 + 7 = 15, so 15 - 8 = 7. | claude-opus-5-5 |
| 4.7-addition-facts-fluency | 3 | 1 | Adds 13 + 7 = 20 instead of taking 7 away from 13. / The sign is minus, so take away: 13 - 7 = 6. Check: 7 + 6 = 13. | claude-opus-5-5 |
| 4.4-add-within-10000 | 2 | 1 | DROPPED: Source inconsistent: 2,436 + 1,215 = 3,651 with one carry (6 + 5 = 11). Dropping that carry gives 3,641, not the stated wrong answer 3,541, whose hundreds digit is wrong. The stated why does not produce the stated wrong answer. | none |
| 4.4-add-within-10000 | 3 | 1 | Forgets every carry, writing only the ones digit of each sum: 5,313. / Carry each ten: 8+5=13, 7+4+1=12, 6+7+1=14, 3+2+1=6, so 6,423. | claude-opus-5-5 |
| 4.4-add-within-10000 | 4 | 1 | Drops the carry after the tens make 10, so 4,906 + 3,095 gives 7,901. / Carry again: 0+9+1=10, 9+0+1=10, 4+3+1=8, so the sum is 8,001. | claude-opus-5-5 |
| 4.4-add-within-10000 | 5 | 1 | Subtracts 3,465 - 2,758 when the question asks how many cans in all. / "In all" means join the amounts: 3,465 + 2,758 = 6,223. | claude-opus-5-5 |
| 4.4-subtract-within-10000 | 2 | 1 | DROPPED: Source inconsistent: the step is 'Trade once' (one borrow), but 6,543 - 2,718 needs two trades (ones: 3 < 8, hundreds: 5 < 7). The answer 3,825 and the wrong answer 4,235 (smaller digit from bigger in each place) are computed correctly, but the example does not match the step rules. | none |
| 4.4-subtract-within-10000 | 3 | 1 | Takes the smaller digit from the bigger in each place, giving 4,263. / Trade: 15 - 8 = 7, 9 - 6 = 3, 11 - 4 = 7, 6 - 3 = 3, so 3,737. | claude-opus-5-5 |
| 4.4-subtract-within-10000 | 4 | 1 | Skips trading across the zeros, leaving 5 - 2 = 3 thousands (3,654). / Regroup 5,000 as 4 thousands, 9 hundreds, 9 tens, 10 ones: 2,654. | claude-opus-5-5 |
| 4.4-subtract-within-10000 | 5 | 1 | Trades only once, treating each place as 10 minus its digit: 7,654. / Trade in every place: 9 - 3, 9 - 4, 9 - 5, 10 - 6 gives 6,544. | claude-opus-5-5 |
| 4.8-division-facts | 1 | 1 | Subtracts 20 - 5 = 15 or multiplies 20 × 5 = 100 instead of dividing. / Sharing 20 equally into 5 groups gives 4 in each, since 5 × 4 = 20. | claude-opus-5-5 |
| 4.9-table-pattern | 1 | 1 | Says the rule is add 5 because the first output is 5. / Check the change between outputs: 5, 8, 11, 14 goes up by 3 each time, so add 3. | claude-opus-5-5 |
| 4.9-table-pattern | 2 | 1 | Sees a change of 5 but says add 5, even though the numbers get smaller. / The numbers go down: 50, 45, 40, 35, so the rule is subtract 5 each time. | claude-opus-5-5 |
| 4.9-table-pattern | 3 | 1 | Gives 'add 3 each time' for 3, 6, 9, 12, ignoring position. / Multiply position by 3: 1×3=3, 2×3=6, 4×3=12. | claude-opus-5-5 |
| 4.9-extend-table | 2 | 1 | Adds 3 eight times from 4, getting 28. / Position 8 is 7 steps on: 4 + 7 × 3 = 25. | claude-opus-5-5 |
| 4.9-extend-table | 3 | 1 | Counts 60 as day 0, so 20 is day 4. / 60 is day 1, so 60, 50, 40, 30, 20 is 5 values: day 5. | claude-opus-5-5 |
| 4.13-regular-irregular | 1 | 1 | Says a rectangle is regular because opposite sides match. / Regular needs every side equal and every angle equal; rectangle sides can differ. | claude-opus-5-5 |
| 4.13-regular-irregular | 2 | 1 | Says a rhombus is regular because its 4 sides are equal. / Angles must be equal too; these are not, so it is not regular. | claude-opus-5-5 |
| 4.15-line-symmetry | 1 | 1 | Says a rectangle's diagonal is a line of symmetry as the halves look alike. / Folding on it must match exactly; corners stick out, so no. | claude-opus-5-5 |
| 4.15-line-symmetry | 2 | 1 | Counts only the 2 lines through midpoints of opposite sides of a square. / Add the 2 diagonals, which also fold it exactly: 2 + 2 = 4. | claude-opus-5-5 |
| 4.5-multiply-1-digit | 1 | 1 | Does 21 × 4 = 24 by multiplying only the ones. / Multiply both digits: 20 × 4 = 80, 1 × 4 = 4, so 84. | claude-opus-5-5 |
| 4.5-multiply-1-digit | 2 | 1 | In 36 × 4, ignores the 2 tens carried from 24, so 124. / Add them to 3 × 4 = 12 tens: 14 tens, so 144. | claude-opus-5-5 |
| 4.5-multiply-1-digit | 3 | 1 | In 74 × 6, ignores the 2 tens carried from 24: 42 tens, so 424. / Add it: 42 + 2 = 44 tens, so 444. | claude-opus-5-5 |
| 4.5-multiply-1-digit | 4 | 1 | In 348 × 6, drops the 2 carried into the hundreds: 18, so 1,888. / Add it: 18 + 2 = 20 hundreds, so 2,088. | claude-opus-5-5 |
| 4.5-divide-1-digit | 1 | 1 | Shares only the tens in 86 ÷ 2: 4, with 6 left over. / Share the 6 ones too: 6 ÷ 2 = 3, so 43. | claude-opus-5-5 |
| 4.5-divide-1-digit | 2 | 1 | DROPPED: 72 ÷ 3 = 24. The listed wrong answers ("2 R 6 or 14") don't match the stated cause, "does not trade". Skipping the trade gives 2 tens shared and 1 ten plus 2 ones (12) left over, so 2 R 12. "2 R 6" fails the check 2×3+6 = 12, not 72. "14" would need 12 ÷ 3 = 4, which already uses the trade. The source lists two unrelated wrong answers, so no single sound wrong/fix pair can be written without changing the source. | none |
| 4.5-divide-1-digit | 3 | 1 | Writes 9 R 12 for 47 ÷ 5, a remainder bigger than 5. / 5 × 9 = 45, 47 − 45 = 2. Remainder must be less than 5: 9 R 2. | claude-opus-5-5 |
| 4.5-divide-1-digit | 4 | 1 | Divides 7, 5, 6 separately and drops leftovers, so 756 ÷ 3 = 212. / 7÷3 = 2 r1; 15÷3 = 5; 6÷3 = 2. Carry leftovers: 252. | claude-opus-5-5 |
| 4.5-divide-1-digit | 5 | 1 | Skips the 0 in 825 ÷ 4 when 2 tens can't be shared, writing 26 R 1. / Put 0 in tens: 8÷4 = 2, 2÷4 = 0, 25÷4 = 6 R 1, so 206 R 1. | claude-opus-5-5 |
| 4.5-word-problems | 1 | 1 | Adds 8 + 6 = 14 for 6 equal groups of 8. / Equal groups means multiply: 6 × 8 = 48. | claude-opus-5-5 |
| 4.5-word-problems | 2 | 1 | Gives 7 for 47 ÷ 6 = 7 R 5 by ignoring the leftover 5. / The 5 left still need a group of 6, so round up: 7 + 1 = 8. | claude-opus-5-5 |
| 4.3-same-numerator | 1 | 1 | Picks 1/8 as bigger because 8 is bigger than 4. / Same top number: more equal parts mean smaller parts, so 1/4 is bigger. | claude-opus-5-5 |
| 4.3-same-numerator | 2 | 1 | Picks 3/8 as more because 8 is bigger than 5. / Both have 3 parts, but eighths are smaller than fifths, so 3/5 is more. | claude-opus-5-5 |
| 4.3-same-numerator | 3 | 1 | Puts 2/3 first because 3 is the smallest denominator. / Same numerator: bigger denominator means smaller parts, so 2/9 is least, then 2/5, 2/3. | claude-opus-5-5 |
| 4.3-benchmarks | 1 | 1 | Says 7/8 > 1 because 7 and 8 look like big numbers. / 7/8 is 7 of 8 equal parts, one part short of 1 whole, so 7/8 < 1. | claude-opus-5-5 |
| 4.10-relationship | 1 | 1 | Writes 15 + 6 = n when 6 are given away from 15. / Giving away means taking away, so start at 15 and subtract 6: 15 - 6 = n. | claude-opus-5-5 |
| 4.10-relationship | 2 | 1 | Writes 5 + 8 = p for 5 equal groups of 8. / Equal groups mean multiply: 5 groups of 8 is 5 × 8 = p. | claude-opus-5-5 |
| 4.10-relationship | 3 | 1 | Writes 4 ÷ 36 = c, with the number of groups first. / The total gets divided: 36 ÷ 4 = c, or 4 × c = 36. | claude-opus-5-5 |
| 4.10-equal-products | 1 | 1 | Puts 2, a number from the other side, in the blank of 6 × 2 = 4 × __. / 6 × 2 = 12, so find what times 4 makes 12: 4 × 3 = 12. | claude-opus-5-5 |
| 4.10-equal-products | 2 | 1 | Puts 3, a number from the other side, in the blank of 8 × 3 = 4 × __. / 8 × 3 = 24, so find what times 4 makes 24: 4 × 6 = 24. | claude-opus-5-5 |
| 4.10-equal-products | 3 | 1 | Writes 30, the product of 3 × 10, as the blank in __ × 5 = 3 × 10. / 3 × 10 = 30, so the blank times 5 must make 30: 30 ÷ 5 = 6. | claude-opus-5-5 |
| 4.11-add-subtract-unknown | 1 | 1 | Adds 250 + 700 = 950 to find n in 250 + n = 700. / 700 is the total, so subtract the known part: n = 700 - 250 = 450. | claude-opus-5-5 |
| 4.11-add-subtract-unknown | 2 | 1 | Subtracts 430 - 270 = 160 to find n in n - 270 = 430. / n is the start before 270 was taken away, so add back: 430 + 270 = 700. | claude-opus-5-5 |
| 4.11-add-subtract-unknown | 3 | 1 | Adds 1,250 + 4,000 = 5,250 to find n in n + 1,250 = 4,000. / 4,000 is the total, so subtract the known part: 4,000 - 1,250 = 2,750. | claude-opus-5-5 |
| 4.11-multiply-divide-unknown | 1 | 1 | Adds or subtracts (42 + 6 = 48 or 42 - 6 = 36) instead of dividing. / Find the missing factor by dividing: n × 6 = 42, so n = 42 ÷ 6 = 7. | claude-opus-5-5 |
| 4.11-multiply-divide-unknown | 2 | 1 | Divides 8 ÷ 4 = 2 to find n in n ÷ 4 = 8. / n is the amount before sharing into 4 groups of 8, so multiply: 8 × 4 = 32. | claude-opus-5-5 |
| 4.11-multiply-divide-unknown | 3 | 1 | Multiplies 96 × 4 = 384 to find n in n × 4 = 96. / n is a missing factor, so divide the product: 96 ÷ 4 = 24. | claude-opus-5-5 |
| 4.12-read-analog | 1 | 1 | DROPPED: The source contradicts itself. The picture puts the hour hand 'just past the 7', but at 7:45 the hour hand is three quarters of the way to 8. The pair's wrong statement also clashes with the step: it says the child misreads because 'the hour hand is near 8', while the stated picture has the hand just past 7. The mistake field is garbled too (answer '8', with '45 or 7:09' pushed into 'why'). The fix's method is right (hour hand hasn't reached 8 so use 7; minute hand on 9 means 45, giving 7:45), but because the source is inconsistent, this is rejected. | none |
| 4.12-read-analog | 2 | 1 | Reads the minute hand on 8 as 8 minutes, giving 2:08. / Each number is 5 minutes, so 8 × 5 = 40 minutes: 2:40. | claude-opus-5-5 |
| 4.12-read-analog | 3 | 1 | Reads the 4 as 4 minutes and adds 2 marks, giving 6:06. / The 4 means 4 × 5 = 20 minutes, plus 2 small marks is 22: 6:22. | claude-opus-5-5 |
| 4.12-24-hour | 1 | 1 | Adds 10 to 3 p.m. to get 13:00. / Add 12 for p.m. hours: 3 + 12 = 15, so 15:00. | claude-opus-5-5 |
| 4.12-24-hour | 2 | 1 | Adds 12 to the a.m. hour 7, making 19:45. / Morning hours stay the same, so 7:45 a.m. is 07:45. | claude-opus-5-5 |
| 4.12-24-hour | 3 | 1 | Subtracts 10 from 18 to get 8:20 p.m. / Subtract 12: 18 - 12 = 6, so 18:20 is 6:20 p.m. | claude-opus-5-5 |
| 4.14-perimeter | 1 | 1 | A rectangle 60 cm by 40 cm has perimeter 60 + 40 = 100 cm. / Add all 4 sides: 60 + 40 + 60 + 40 = 200 cm. | claude-opus-5-5 |
| 4.14-perimeter | 3 | 1 | Length 12 cm, width 7 cm: 12 + 7 = 19 cm, adding only the labelled sides. / Opposite sides match, so 4 sides: 12 + 7 + 12 + 7 = 38 cm. | claude-opus-5-5 |
| 4.14-missing-side | 1 | 1 | Perimeter 26 cm, length 8 cm: 26 − 8 = 18 cm is the width. / Take away both lengths: 26 − 8 − 8 = 10, then share between 2 widths: 5 cm. | claude-opus-5-5 |
| 4.14-missing-side | 2 | 1 | Regular hexagon, perimeter 48 cm: 48 − 6 = 42 cm for each side. / 6 equal sides share 48 cm, so divide: 48 ÷ 6 = 8 cm. | claude-opus-5-5 |
| 4.14-missing-side | 3 | 1 | DROPPED: Source is inconsistent. The step rules say the shape has 5-6 sides, but the example has 3 known sides plus 1 unknown, which is only 4 sides. The maths itself (8+6+7=21, 30-21=9 cm) is correct, but I can't change the example to fit the rules. | none |
| 4.2-tenths | 1 | 1 | 3 out of 10 equal parts is written as 0.03. / 3 tenths = 3/10, with the 3 in the tenths place right after the point: 0.3. | claude-opus-5-5 |
| 4.2-tenths | 2 | 1 | Counting marks instead of spaces, so a point 7 spaces from 0 is read as 0.6 or 0.8. / Count the spaces from 0. Each space is 0.1, so 7 spaces is 0.7. | claude-opus-5-5 |
| 4.2-tenths | 3 | 1 | 1 whole and 4 tenths is written as 1.04. / Tenths go in the first place after the point: 1 + 0.4 = 1.4. | claude-opus-5-5 |
| 4.2-hundredths | 1 | 1 | 27 out of 100 equal squares is written as 2.7. / Hundredths fill two places after the point: 27/100 = 0.27. | claude-opus-5-5 |
| 4.2-hundredths | 2 | 1 | 3 full rows and 4 more squares is read as 3 + 4 = 7 tenths, 0.7. / Rows are tenths, single squares are hundredths: 0.3 + 0.04 = 0.34. | claude-opus-5-5 |
| 4.2-hundredths | 3 | 1 | DROPPED: Source data is broken. The mistake answer is empty, and the 'why' field holds answers ('0.4 or 0.04') instead of a reason. The example (0.2 + 4 hundredths = 0.24) is correct, but I can't check a pair against the supplied wrong answer and reason. | none |
| 4.2-decimal-place-value | 1 | 1 | In 0.63, the 6 is worth 0.06. / The 6 is in the tenths place, right after the point: 6 tenths = 0.6. | claude-opus-5-5 |
| 4.2-decimal-place-value | 2 | 1 | In 4.58, the 5 is worth 5, ignoring the point. / The 5 is after the point, in the tenths place: 5 tenths = 0.5. | claude-opus-5-5 |
| 4.2-decimal-place-value | 3 | 1 | In 3.07, the 7 is worth 0.7, skipping the 0. / The 0 holds the tenths place, so the 7 is in the hundredths: 0.07. | claude-opus-5-5 |
| 4.2-fraction-decimal | 1 | 1 | DROPPED: Source data is broken. The mistake answer is empty, and the 'why' field holds answers ('0.07 or 7.10') instead of a reason. The example (7/10 = 0.7) is correct, but I can't check a pair against the supplied wrong answer and reason. | none |
| 4.2-fraction-decimal | 2 | 1 | DROPPED: Source data is broken. The mistake answer is empty, and the 'why' field holds answers ('0.043 or 4.3') instead of a reason. The example (43/100 = 0.43) is correct, but I can't check a pair against the supplied wrong answer and reason. | none |
| 4.2-fraction-decimal | 3 | 1 | 2 and 3/10 is written as 2.03. / Tenths take the first place after the point: 2 + 0.3 = 2.3. | claude-opus-5-5 |
| 4.2-fraction-decimal | 4 | 1 | 0.4 written as hundredths is 4/100. / 0.4 is 4 tenths, which is 40 hundredths: 40/100 = 0.40. | claude-opus-5-5 |
| 4.2-compare-decimals | 1 | 1 | 0.47 > 0.52 because 7 is more than 2. / Compare tenths first: 4 tenths is less than 5 tenths, so 0.47 < 0.52. | claude-opus-5-5 |
| 4.2-compare-decimals | 2 | 1 | 0.5 < 0.47 because 47 is more than 5. / Write 0.5 as 0.50, then 50 hundredths > 47 hundredths, so 0.5 > 0.47. | claude-opus-5-5 |
| 4.2-compare-decimals | 3 | 1 | Puts 2.5 before 2.15 because 5 is less than 15. / Write 2.5 as 2.50. 50 hundredths is more than 15, so 2.15 comes before 2.5. | claude-opus-5-5 |
| 4.6-add-decimals | 1 | 1 | Adds wholes and decimals separately: 2+1=3 and 6+5=11, writes 3.11. / 11 tenths is 1 whole and 1 tenth, so 3 + 1 = 4 wholes and 1 tenth: 4.1. | claude-opus-5-5 |
| 4.6-add-decimals | 2 | 1 | Leaves out the carry in 0.36 + 0.27, getting 0.53. / 6 + 7 = 13 hundredths: write 3, carry 1 tenth. 3 + 2 + 1 = 6 tenths: 0.63. | claude-opus-5-5 |
| 4.6-add-decimals | 3 | 1 | Adds the 5 tenths in 2.5 to the 8 hundredths in 1.38, giving 3.43. / Line up points: 2.50 + 1.38. Add 0+8, 5+3, 2+1 to get 3.88. | claude-opus-5-5 |
| 4.6-add-decimals | 4 | 1 | Leaves 10 tenths in the tenths place in 4.75 + 3.25, writing 7.100. / 10 tenths is 1 whole, so carry it: 4 + 3 + 1 = 8, giving 8.00. | claude-opus-5-5 |
| 4.6-subtract-decimals | 2 | 1 | After trading for 12 - 7 = 5, flips tenths 3 - 6 to 6 - 3 = 3: 3.35. / 3 < 6, so trade again from ones: 13 - 6 = 7, 4 - 2 = 2: 2.75. | claude-opus-5-5 |
| 4.6-subtract-decimals | 3 | 1 | Reads 6.5 as 6.05: 5 - 4 = 1, then 0 - 3 flipped to 3, so 4.31. / Write 6.50, then trade: 10 - 4 = 6, 4 - 3 = 1, 6 - 2 = 4: 4.16. | claude-opus-5-5 |
| 4.6-subtract-decimals | 4 | 1 | Lines 5 up under the 6 of 2.36, so it acts as 0.05 and gives 2.31. / The 5 is wholes: write 5.00 and subtract, 5.00 - 2.36 = 2.64. | claude-opus-5-5 |
| 4.18-money-notation | 1 | 1 | Writes 2 dimes as 2 cents, so the total is $22.02. / A dime is 10 cents, so 2 dimes is 20 cents. $20 + $2 + $0.20 = $22.20. | claude-opus-5-5 |
| 4.18-money-notation | 2 | 1 | Moves the point one place, so 275 cents becomes $27.50. / 100 cents = $1, so move the point two places left: 275 cents = $2.75. | claude-opus-5-5 |
| 4.18-money-notation | 3 | 1 | Writes 50 cents as $0.05, so the total is $48.05. / 2 quarters = 50 cents = $0.50. $40 + $5 + $3 + $0.50 = $48.50. | claude-opus-5-5 |
| 4.18-make-change-100 | 1 | 1 | Does $10 - $6 = $4 and just adds on the 45 cents, giving $4.45. / Count up from $6.45: 55 cents to $7, then $3 to $10. 55 cents + $3 = $3.55. | claude-opus-5-5 |
| 4.18-make-change-100 | 2 | 1 | Does 20 - 13 = 7 and forgets the dollar traded for cents: $7.15. / Count up: 15 cents to $14, then $6 to $20. Change is $6.15. | claude-opus-5-5 |
| 4.18-make-change-100 | 3 | 1 | Does 100 - 63 = 37, forgetting the dollar traded for cents: $37.60. / Count up: 60 cents to $64, then $36 to $100. Change is $36.60. | claude-opus-5-5 |
| 4.18-financial-decisions | 2 | 1 | Multiplies 4 × 28 = 112 weeks. / Find how many 4s fit into 28: 28 ÷ 4 = 7 weeks. | claude-opus-5-5 |
| 4.18-financial-decisions | 3 | 1 | Only subtracts the $10 saved, 30 - 10 = $20, ignoring the $5 given. / Take away both: $5 + $10 = $15 used, so $30 - $15 = $15 spent. | claude-opus-5-5 |
| 4.16-many-to-one | 1 | 1 | Counts the 5 symbols and says 5 books. / Each symbol is worth 2 books, so 5 symbols is 5 × 2 = 10 books. | claude-opus-5-5 |
| 4.16-many-to-one | 2 | 1 | Counts half a symbol as 1, so 3 and a half symbols is 30 + 1 = 31. / Half a symbol is half of 10, which is 5. 3 symbols is 30, plus 5 is 35. | claude-opus-5-5 |
| 4.16-many-to-one | 3 | 1 | Reads a value halfway between 20 and 30 as the labelled mark 30. / Halfway is half of the 10 gap: 20 + 5 = 25. | claude-opus-5-5 |
| 4.16-compare-data | 1 | 1 | Adds 35 + 20 = 55 for how many more. / How many more is a difference: 35 - 20 = 15 more votes for soccer. | claude-opus-5-5 |
| 4.16-compare-data | 2 | 1 | Subtracts 25 − 15 to get 10 as the total. / Total means add: 15 + 25 = 40. Subtract only to find how many fewer, 10. | claude-opus-5-5 |
| 4.16-compare-data | 3 | 1 | Adds only two of the three amounts, 20 + 35 = 55. / The total uses all three amounts: 20 + 35 + 15 = 70. | claude-opus-5-5 |
| 4.17-predict-outcome | 2 | 1 | Says blue is more likely when it covers only 1 of 4 sections. / Red covers 3 of 4 equal sections, so red is more likely than blue. | claude-opus-5-5 |
| 4.17-predict-outcome | 3 | 1 | Picks yellow, with only 1 marble, as the most likely. / The most likely has the most marbles: red has 5, more than any other. | claude-opus-5-5 |
| 4.17-record-trials | 1 | 1 | Counts each bundle of five as 1, so 3 bundles + 2 = 5. / Each bundle is worth 5: 3 × 5 = 15, then add 2 more to get 17. | claude-opus-5-5 |
| 4.17-record-trials | 3 | 1 | Says 20 spins must give exactly 15 red, so 14 is wrong. / About 15 red is expected (3/4 of 20). 14 is close and results vary, so yes. | claude-opus-5-5 |
| 5.1-place-value-million | 1 | 1 | Gives the 6 in 46,251 a value of 600, one place too low. / The 6 is in the thousands place (4 is ten thousands), so it is worth 6,000. | claude-opus-5-5 |
| 5.1-place-value-million | 2 | 1 | The 7 in 472,315 is worth 7,000. / The 7 is in the ten thousands place, next to the 4 in the hundred thousands place, so it is worth 70,000. | claude-opus-5-5 |
| 5.1-place-value-million | 3 | 1 | DROPPED: The answer is right (the 5 is worth 5,000), and 500 does match skipping the hundreds zero. But 305,027 has two zeros (ten thousands and hundreds), and both the wrong and fix sides just say 'the 0'. The zero between the 3 and the 5 is in the ten thousands place, so a child could read 'The 0 holds the hundreds place' as being about that zero, which would be wrong. The fix needs to say which zero it means. Also, the wrong side ('Skips the 0...') describes an action instead of stating a wrong claim the child might make. | none |
| 5.1-read-write | 1 | 1 | Writes thirty-two thousand, five hundred as 3,250 or 320,500. / Write 32 for the thousands, then 500 in the last three places: 32,500. | claude-opus-5-5 |
| 5.1-read-write | 2 | 1 | Writes two hundred six thousand, forty as 2,006,040 or 20,640. / Thousands part is 206, and the last three places are 040: 206,040. | claude-opus-5-5 |
| 5.1-read-write | 3 | 1 | Writes the 3 in 403,517 as 30,000. / The 0 holds ten thousands, so 3 is in thousands: 400,000 + 3,000 + 500 + 10 + 7. | claude-opus-5-5 |
| 5.1-compare-order-million | 1 | 1 | Compares only the last three digits, 109 and 990, and says <. / Compare from the left: the first difference is thousands, 2 > 1, so >. | claude-opus-5-5 |
| 5.1-compare-order-million | 2 | 1 | Puts 98,760 last because its first digit 9 beats the 1s. / Fewer digits means smaller: 98,760 has 5 digits, so it comes first. | claude-opus-5-5 |
| 5.5-add-million | 1 | 1 | Drops the carried 1 from 5 + 8 = 13, getting 46,573. / Add that 1 to the tens: 1 + 6 + 1 = 8, giving 46,583. | claude-opus-5-5 |
| 5.5-add-million | 2 | 1 | Ignores every carry, writing 7 + 6 = 13 as just 3, to get 303,733. / Carry each time: 7+6=13, then 5+8+1=14, and on, giving 413,843. | claude-opus-5-5 |
| 5.5-subtract-million | 1 | 1 | Takes 2 from 8 in the ones, getting 6, instead of trading. / Trade a ten: 12 − 8 = 4, then 6 − 3 = 3 in the tens, so 24,234. | claude-opus-5-5 |
| 5.5-subtract-million | 2 | 1 | Leaves the 5 unchanged after borrowing across the zeros, giving 362,582. / The 5 becomes 4, the zeros become 9s and the last 10: 262,582. | claude-opus-5-5 |
| 5.8-extend-facts | 1 | 1 | Writes 800 + 700 as 15 or 150, dropping the zeros from the hundreds. / 8 + 7 = 15 hundreds, which is 1,500. | claude-opus-5-5 |
| 5.8-extend-facts | 2 | 1 | Works out 13 − 5 = 8 and drops the thousands, answering 8. / 13 thousand − 5 thousand = 8 thousand, so 8,000. | claude-opus-5-5 |
| 5.9-recall-facts | 1 | 1 | 8 × 6 = 14, because I added 8 + 6. / × means 8 groups of 6, so 8 × 6 = 48. | claude-opus-5-5 |
| 5.9-recall-facts | 2 | 1 | 36 ÷ 4 = 32, because I took 4 away from 36. / Divide means 4 × ? = 36. Since 4 × 9 = 36, 36 ÷ 4 = 9. | claude-opus-5-5 |
| 5.9-multiply-tens | 1 | 1 | DROPPED: wrong needs commas for thousands | none |
| 5.9-multiply-tens | 2 | 1 | 20 × 40 = 80, adding only one zero. / 2 × 4 = 8, then add two zeros, one from each factor: 800. | claude-opus-5-5 |
| 5.9-multiply-tens | 3 | 1 | 50 × 60 = 300, because I dropped the zero in 5 × 6 = 30. / 5 × 6 = 30, then add two more zeros: 3,000. | claude-opus-5-5 |
| 5.9-distributive | 1 | 1 | DROPPED: wrong needs commas for thousands | none |
| 5.9-distributive | 2 | 1 | DROPPED: wrong needs commas for thousands | none |
| 5.10-pattern-rule | 1 | 1 | For 4, 9, 14, 19 the rule is add 4, because the first term is 4. / Find the jump between terms: 9 − 4 = 5. Start at 4, add 5. | claude-opus-5-5 |
| 5.10-pattern-rule | 2 | 1 | 96, 48, 24, 12 is subtract 48, from checking only 96 to 48. / Check every jump: 48 to 24 is not 48 less. Each term is half, so divide by 2. | claude-opus-5-5 |
| 5.10-nth-term | 1 | 1 | Start 7, add 6: the 5th term is 37, from adding 6 five times. / The 7 is term 1, so term 5 needs 4 adds: 7 + 24 = 31. | claude-opus-5-5 |
| 5.10-nth-term | 2 | 1 | Start 3, add 5: the 10th term is 53, from using 10 jumps. / The 3 is term 1, so term 10 needs 9 jumps: 3 + 9 × 5 = 48. | claude-opus-5-5 |
| 5.10-rule-with-variable | 1 | 1 | Rule 5 × n with n = 4 gives 9, because I added 5 + 4. / 5 × n means 5 times n, so put in 4: 5 × 4 = 20. | claude-opus-5-5 |
| 5.10-rule-with-variable | 2 | 1 | Rule n − 3 for n = 5, 6, 7 gives 8, 9, 10, from adding 3. / Take 3 away from each n: 5 − 3 = 2, 6 − 3 = 3, 7 − 3 = 4. | claude-opus-5-5 |
| 5.10-rule-with-variable | 3 | 1 | 7, 8, 9 for n = 1, 2, 3 is 7 × n, from checking only row 1. / Test every row: 7 × 2 = 14, not 8. Each output is n + 6. | claude-opus-5-5 |
| 5.12-area-rectangle | 1 | 1 | A 6 by 4 rectangle has area 20, from adding 6 + 4 + 6 + 4. / Area is the squares inside: 4 rows of 6, so 6 × 4 = 24 square units. | claude-opus-5-5 |
| 5.12-area-rectangle | 2 | 1 | A 12 m by 7 m garden has area 38 m, from adding the sides around. / Area is length × width: 12 × 7 = 84 square metres. | claude-opus-5-5 |
| 5.12-missing-side | 1 | 1 | Area 48 cm², width 6 cm: length is 48 − 6 = 42. / Area = length × width, so divide: 48 ÷ 6 = 8 cm. | claude-opus-5-5 |
| 5.12-missing-side | 2 | 1 | A square with area 64 cm² has side 32 or 16, from halving or quartering 64. / Side × side = 64. Since 8 × 8 = 64, the side is 8 cm. | claude-opus-5-5 |
| 5.17-double-bar-graph | 1 | 1 | A column up to 10 on a scale of 2s is 5, from counting 5 squares. / Each square is worth 2, so 5 squares × 2 = 10 boys. | claude-opus-5-5 |
| 5.17-double-bar-graph | 2 | 1 | Girls 14, boys 8: 'how many more' is 14 + 8 = 22. / 'How many more' compares the two, so subtract: 14 − 8 = 6. | claude-opus-5-5 |
| 5.17-scale | 1 | 1 | Each star = 20 people, so 5 stars = 5 people, just the number of stars. / Multiply the number of stars by what each is worth: 5 × 20 = 100 people. | claude-opus-5-5 |
| 5.17-scale | 2 | 1 | 3 and a half stars = 61 or 60, treating the half star as worth 1 or 0. / A half star is half of 20, which is 10, so 3 × 20 + 10 = 70. | claude-opus-5-5 |
| 5.6-multiply-2-digit | 1 | 1 | 23 × 14 = 92 + 23 = 115, using the 1 in 14 as one instead of ten. / The 1 is 10, so add 23 × 10 = 230 to 23 × 4 = 92: 92 + 230 = 322. | claude-opus-5-5 |
| 5.6-multiply-2-digit | 2 | 1 | Gives 282 as the answer, which is only 47 × 6, and leaves out the 47 × 30 row. / Add the tens row: 47 × 30 = 1,410. Then 282 + 1,410 = 1,692. | claude-opus-5-5 |
| 5.6-multiply-2-digit | 2 | 2 | Drops the carried 2 in 47 × 30, so the row is 1,210 and the total is 1,492. / Add the 2: 4 × 3 + 2 = 14, so the row is 1,410 and the total 1,692. | claude-opus-5-5 |
| 5.6-multiply-2-digit | 3 | 1 | Adds 428 and 642 with no place shift, getting 1,070. / The 3 is 30, so the second row is 214 × 30 = 6,420. Then 428 + 6,420 = 6,848. | claude-opus-5-5 |
| 5.6-divide-remainder | 1 | 1 | 187 ÷ 4 = 45 R 7, with a remainder bigger than the divisor. / Remainder must be under 4. Take out one more 4: 46 R 3, and 4 × 46 + 3 = 187. | claude-opus-5-5 |
| 5.6-divide-remainder | 2 | 1 | 835 ÷ 8 = 14, leaving out the 0 in the tens place of the quotient. / 8 doesn't go into 3 tens, so write 0 in the tens place: 104 R 3. | claude-opus-5-5 |
| 5.6-interpret-remainder | 1 | 1 | 29 ÷ 6 = 4 R 5, so 4 vans, ignoring the 5 left over. / The 5 left over still need a van, so round up: 4 + 1 = 5 vans. | claude-opus-5-5 |
| 5.6-interpret-remainder | 2 | 1 | 45 ÷ 7 = 6 R 3, so the answer is 7 toys by rounding up. / The $3 left can't buy a whole toy, so round down: 6 toys. | claude-opus-5-5 |
| 5.6-divide-2-digit | 2 | 1 | 252 ÷ 21 = 11 R 21, stopping with a remainder equal to the divisor. / Another 21 fits in the 21 left, so 11 becomes 12 and 21 × 12 = 252 with 0 left. | claude-opus-5-5 |
| 5.3-equivalent-fractions | 1 | 1 | 1/2 = 3/4, adding 2 to the top and the bottom. / Multiply both by 2: 1 × 2 = 2 and 2 × 2 = 4, so 1/2 = 2/4. | claude-opus-5-5 |
| 5.3-equivalent-fractions | 2 | 1 | 3/5 = 18/20, adding 15 to both parts because 5 + 15 = 20. / Multiply instead: 5 × 4 = 20, so 3 × 4 = 12 and 3/5 = 12/20. | claude-opus-5-5 |
| 5.3-equivalent-fractions | 3 | 1 | DROPPED: Source is inconsistent. In 12/18 = __/3 the bottom is already given as 3 (18 ÷ 6), so the blank is the top and the right answer is 12 ÷ 6 = 2. The stated wrong answers 6 and 9 are 12 ÷ 2 and 18 ÷ 2, which is dividing both parts by 2 and getting 6/9. That is not 'changes only one part'. Also 9 can't be a top that comes from changing one side. No sound pair fits the stated mistake. | none |
| 5.3-same-amount | 1 | 1 | 2/4 is bigger than 1/2 because 2 > 1, comparing only the tops. / Check the part size too: fourths are half as big as halves, so 2 fourths equal 1 half. | claude-opus-5-5 |
| 5.3-missing-term | 1 | 1 | 4/9 = 31/36, adding 27 to both because 9 + 27 = 36. / Multiply: 9 × 4 = 36, so 4 × 4 = 16 and 4/9 = 16/36. | claude-opus-5-5 |
| 5.3-missing-term | 2 | 1 | Finds the missing bottom number 28 by subtracting 4 from 32. / The top went up by ×4 (5 × 4 = 20), so divide 32 by 4: 32 ÷ 4 = 8. | claude-opus-5-5 |
| 5.3-missing-term | 3 | 1 | Halves only the top, 18 ÷ 2 = 9, and writes 9 in the bottom blank. / Top 18 to 3 is ÷ 6, so divide the bottom by 6 too: 24 ÷ 6 = 4. | claude-opus-5-5 |
| 5.11-evaluate-expression | 1 | 1 | n + 17 with n = 8 becomes 817, writing the 8 beside the 17. / Put 8 in place of n and add: 8 + 17 = 25. | claude-opus-5-5 |
| 5.11-evaluate-expression | 2 | 1 | 7 × n with n = 5 becomes 75, writing the 7 beside the 5. / Put 5 in place of n and multiply: 7 × 5 = 35. | claude-opus-5-5 |
| 5.11-solve-one-step | 1 | 1 | n + 24 = 61, so n = 61 + 24 = 85. / Undo + 24 by subtracting: 61 − 24 = 37, so n = 37. | claude-opus-5-5 |
| 5.11-solve-one-step | 2 | 1 | 6 × n = 54, so n = 54 − 6 = 48. / Undo × 6 by dividing: 54 ÷ 6 = 9, so n = 9. | claude-opus-5-5 |
| 5.11-write-equation | 1 | 1 | Writes n = 45 + 18, solving (and adding) instead of writing the equation. / Show the parts: start n, add 18, gives 45, so n + 18 = 45. | claude-opus-5-5 |
| 5.11-write-equation | 2 | 1 | Writes n = 52 − 4 = 48 for 4 equal shares of 52. / Equal shares means 4 × n = 52, so n = 52 ÷ 4 = 13. | claude-opus-5-5 |
| 5.13-same-area-different-perimeter | 1 | 1 | 2 by 5 has perimeter 14, so it is picked, but its area is 10. / Check both: 3 by 4 has area 12 and perimeter 14. | claude-opus-5-5 |
| 5.13-same-area-different-perimeter | 2 | 1 | Picks 2 by 5 without multiplying; its area is 10, not 12. / Multiply sides: 1×12 and 3×4 both make 12, so tick those. | claude-opus-5-5 |
| 5.13-same-area-different-perimeter | 3 | 1 | Picks 1 by 16 since long and thin seems smallest. / Perimeters: 1 by 16 is 34, 2 by 8 is 20, 4 by 4 is 16. Smallest is 4 by 4. | claude-opus-5-5 |
| 5.13-compare-area-perimeter | 1 | 1 | Thinks 2 by 6 and 3 by 4, both area 12, have equal perimeter. / Add sides: 2 by 6 is 16, 3 by 4 is 14, so 2 by 6 is bigger. | claude-opus-5-5 |
| 5.13-compare-area-perimeter | 2 | 1 | DROPPED: Source is inconsistent. A 3 by 8 rectangle has perimeter 22, but the choices have perimeters 20 (4 by 6), 24 (4 by 8) and 20 (5 by 5). None matches 22, so no choice is a same-perimeter pick. The stated mistake can't happen with these options. | none |
| 5.14-elapsed-time | 1 | 1 | Gets 2 h 70 min by doing 100 − 30 for the minutes. / An hour has 60 min: 2:30 to 3:00 is 30 min, 3:00 to 5:00 is 2 h, so 2 h 30 min. | claude-opus-5-5 |
| 5.14-elapsed-time | 2 | 1 | Writes 1 h 75 min, with the minutes part over 60. / 3:45 to 5:00 is 1 h 15 min, plus 20 min to 5:20 is 1 h 35 min. | claude-opus-5-5 |
| 5.14-elapsed-time | 2 | 2 | Does 45 − 20 = 25 min and 5 − 3 = 2 h, so 2 h 25 min. / 20 is less than 45, so 3:45 to 5:00 is 1 h 15 min, plus 20 is 1 h 35 min. | claude-opus-5-5 |
| 5.14-end-time | 1 | 1 | DROPPED: Source data is inconsistent. The stated mistake answer is '11', and the 'why' begins '60: stops at 60 minutes', which looks like '11:60' cut at the colon. An answer of 11 can't 'stop at 60 minutes', so the pair's wrong statement (11:60) doesn't match the stated mistake answer. The pair's maths is correct (9:30 + 2 h 30 min = 11 h 60 min = 12:00), but it can't be verified against a corrupted mistake field. | none |
| 5.14-end-time | 2 | 1 | DROPPED: Source data is inconsistent. The stated mistake answer is '4', and the 'why' begins '95: stops at 95 minutes', which looks like '4:95' cut at the colon. An answer of 4 doesn't match the pair's wrong statement (4:95). The pair's maths is correct (4:40 + 55 min = 4 h 95 min = 5:35), but it can't be verified against a corrupted mistake field. | none |
| 5.18-probability-fraction | 1 | 1 | Uses 3/5, red parts over not-red parts. / Divide by all 8 equal parts, not only the non-red ones: 3/8. | claude-opus-5-5 |
| 5.18-probability-fraction | 2 | 1 | Counts only one even number, giving 1/6. / Even numbers are 2, 4 and 6, so 3 of 6 outcomes: 3/6. | claude-opus-5-5 |
| 5.18-experiment | 1 | 1 | Predicts 20 heads in 20 flips, as if every flip must be heads. / A coin has 2 sides that come up equally often, so about half of 20: about 10. | claude-opus-5-5 |
| 5.18-experiment | 2 | 1 | Counts 19 or 21 flips in all by missing or repeating one. / Count each flip once to get 20; tails = 20 − 12 = 8. | claude-opus-5-5 |
| 5.18-experiment | 3 | 1 | Adds 10 + 13 = 23 to compare the prediction and the result. / Find the difference: 13 − 10 = 3 more than predicted. | claude-opus-5-5 |
| 5.2-thousandths | 1 | 1 | Reads 0.04 as 4 thousandths, ignoring the extra place. / Write 0.04 as 0.040, which is 40 thousandths. | claude-opus-5-5 |
| 5.2-thousandths | 2 | 1 | Writing 47/1,000 as 0.47, with no zero in the tenths place. / 1,000 means thousandths, so 47 ends in the thousandths place: 0.047. | claude-opus-5-5 |
| 5.2-thousandths | 3 | 1 | Writing 3 and 8 thousandths as 3.8 or 3.08, leaving out a zero. / Thousandths is the third place, so tenths and hundredths are 0: 3.008. | claude-opus-5-5 |
| 5.2-decimal-place-value | 1 | 1 | Saying the 6 in 2.468 is 6 tenths, one place too high. / The 4 is tenths; the 6 is the next place, hundredths: 0.06. | claude-opus-5-5 |
| 5.2-decimal-place-value | 2 | 1 | Writing 0.02 for the 2 in 4.207, one place too low. / The 2 is right after the point, in tenths, so write 0.2. | claude-opus-5-5 |
| 5.2-between-decimals | 1 | 1 | Answering 0.4 because nothing seems to fit between 0.4 and 0.5. / Write them as 0.40 and 0.50. Then 0.45 fits between them. | claude-opus-5-5 |
| 5.2-between-decimals | 2 | 1 | Answering 1.26 because nothing seems to fit between 1.26 and 1.27. / Write them as 1.260 and 1.270. Then 1.265 fits between. | claude-opus-5-5 |
| 5.4-fraction-to-decimal | 1 | 1 | Writing 3/4 as 0.34 by putting the 3 and 4 side by side. / Make 100 on the bottom: 3/4 = 75/100 (× 25 both), so 0.75. | claude-opus-5-5 |
| 5.4-fraction-to-decimal | 2 | 1 | Reading 3/5 as 0.35, so picking 0.55 as greater. / 3/5 = 6/10 = 0.60, which is more than 0.55, so 3/5 is greater. | claude-opus-5-5 |
| 5.4-compare-decimals | 1 | 1 | Picking 0.58 because the hundredths digit 8 beats 2. / Compare tenths first: 6 tenths is more than 5 tenths, so 0.62. | claude-opus-5-5 |
| 5.4-compare-decimals | 2 | 1 | Putting 0.5 first, thinking 0.405 is biggest because it is longest. / Use 3 places: 0.500, 0.450, 0.405. Least first: 0.405, 0.45, 0.5. | claude-opus-5-5 |
| 5.4-compare-fractions | 1 | 1 | Picking 3/8 because 8 is a bigger bottom number than 6. / 3/8 is under 1/2, but 5/6 is over 1/2 and near 1, so 5/6 is greater. | claude-opus-5-5 |
| 5.7-add-thousandths | 1 | 1 | Getting 3.773 by not carrying the 1 from 6 + 7 = 13 thousandths. / Write 3, carry 1 to hundredths: 5 + 2 + 1 = 8, so 3.783. | claude-opus-5-5 |
| 5.7-add-thousandths | 2 | 1 | DROPPED: Source is inconsistent. Lining up right edges for 3.4 + 1.275 gives 1.309 (34 under 275), not 1.615. 1.615 equals 1.275 + 0.34, a different error from the stated reason. | none |
| 5.7-subtract-thousandths | 1 | 1 | Doing 8 − 6 in the thousandths, not regrouping, to get 4.332. / Regroup: 5 hundredths drops to 4, 6 becomes 16. 16 − 8 = 8, 4 − 2 = 2: 4.328. | claude-opus-5-5 |
| 5.7-subtract-thousandths | 2 | 1 | DROPPED: Source is inconsistent. Lining up the right edges puts 5 under the thousandths digit of 2.375, so the work gives 2.370, not 3.375 or 2.375. Those answers come from other errors. | none |
| 5.19-budget | 2 | 1 | Adding the $360 expenses to the $500 income to get $860. / Money left is income minus expenses: $500 − $360 = $140. | claude-opus-5-5 |
| 5.19-budget | 3 | 1 | Subtracting 15 from 120 to get 105 instead of finding weeks. / Weeks = how many 15s fit in 120: 120 ÷ 15 = 8. | claude-opus-5-5 |
| 5.15-classify-prisms-pyramids | 1 | 1 | Calling it a prism by checking only the base, not the side faces. / Triangle faces meeting at a point make a pyramid; prism sides are rectangles. | claude-opus-5-5 |
| 5.15-classify-prisms-pyramids | 2 | 1 | Naming it a pentagonal pyramid from the base, ignoring the sides. / Two pentagon bases joined by rectangles make a prism: pentagonal prism. | claude-opus-5-5 |
| 5.15-classify-prisms-pyramids | 3 | 1 | Calling a cereal box a rectangle, which is only one flat face. / The box is a solid with 6 rectangle faces: a rectangular prism. | claude-opus-5-5 |
| 5.15-count-parts | 1 | 1 | A triangular prism has 3 faces, counting only the sides. / Count the 2 triangle ends too: 3 + 2 = 5 faces. | claude-opus-5-5 |
| 5.15-count-parts | 2 | 1 | A square pyramid has 5 edges because it has 5 faces. / Count edges: 4 around the base + 4 up to the top = 8. | claude-opus-5-5 |
| 5.15-count-parts | 3 | 1 | A triangular prism is built from 5 triangles, since its ends are triangles. / Only the 2 ends are triangles; the 3 side faces are rectangles. | claude-opus-5-5 |
| 5.15-quadrilaterals | 1 | 1 | 4 equal sides means it must be a square. / A square also needs 4 right angles. With no right angles it is a rhombus. | claude-opus-5-5 |
| 5.15-quadrilaterals | 2 | 1 | A square is not a rectangle, because a shape has just one name. / A rectangle has 4 right angles. A square has them, so it is also a rectangle. | claude-opus-5-5 |
| 5.16-translation | 1 | 1 | DROPPED: The source mistake answer is empty, so no wrong result can be checked. 'Moves only one corner' conflicts with the question, which asks about one corner's line. If that corner is the one moved, line 8 is right. Any wrong statement would need an invented result. | none |
| 5.16-translation | 2 | 1 | Flips or turns the shape instead of sliding it. / A slide keeps its direction: 3 right, 2 down takes 4 across, 6 up to 7 across, 4 up. | claude-opus-5-5 |
| 5.16-translation | 3 | 1 | Gives the slide as 1 right and 4 up, swapping the two numbers. / Across goes 1 to 5, so 4 right. Up goes 2 to 3, so 1 up. | claude-opus-5-5 |
| 5.16-reflection | 1 | 1 | DROPPED: The fix itself is right: 3 squares left of the line reflects to 3 squares right. But the wrong statement, 'Treats the flip as a slide of the corner', is too vague. Sliding one point gives no definite position, so it doesn't match any choice in the example (3 left / 6 right). It also doesn't show the actual mistake, which is sliding the whole shape across without flipping it. There isn't enough evidence to verify it. | none |
| 5.16-reflection | 2 | 1 | The image is 3 squares above the mirror line again. / The image flips to the other side at the same distance: 3 squares below. | claude-opus-5-5 |
| 6.1-place-value | 1 | 1 | The 3 in 438,000,000 is worth 3,000,000. / The 3 is in the ten millions place (4 is hundred millions), so it is 30,000,000. | claude-opus-5-5 |
| 6.1-place-value | 2 | 1 | Writes 6, 4, 3 side by side with no zeros: 643.052. / Zeros hold empty places: 6,000,000 + 40,000 + 3 + 0.052 = 6,040,003.052. | claude-opus-5-5 |
| 6.1-large-numbers | 1 | 1 | DROPPED: wrong needs commas for thousands | none |
| 6.1-large-numbers | 2 | 1 | Writes seven billion, four hundred million as 7,400,000. / 7 billion is 7,000,000,000. Add 400,000,000 to get 7,400,000,000. | claude-opus-5-5 |
| 6.1-large-numbers | 3 | 1 | DROPPED: wrong needs commas for thousands | none |
| 6.1-large-numbers | 4 | 1 | DROPPED: wrong needs commas for thousands; fix needs commas for thousands; pair exceeds 150 characters | none |
| 6.1-compare-order | 1 | 1 | DROPPED: fix needs commas for thousands | none |
| 6.1-compare-order | 2 | 1 | 0.45 < 0.405 because 0.405 has more digits. / Compare place by place: 0.450 vs 0.405, 5 hundredths beats 0, so >. | claude-opus-5-5 |
| 6.2-fact-strategies | 1 | 1 | Halves 16 to 8 but keeps the 5, so 8 × 5 = 40. / Double the 5 too: 8 × 10 = 80, the same as 16 × 5. | claude-opus-5-5 |
| 6.2-fact-strategies | 2 | 1 | Puts the parts 80 and 12 side by side as 812. / Add the parts: 80 + 12 = 92. Or double twice: 23, 46, 92. | claude-opus-5-5 |
| 6.2-fact-strategies | 3 | 1 | Finds 60 ÷ 6 = 10 but adds 24 without dividing it. / Divide both parts: 60 ÷ 6 = 10 and 24 ÷ 6 = 4, so 10 + 4 = 14. | claude-opus-5-5 |
| 6.3-order-of-operations | 1 | 1 | Does 3 × 5 first and ignores the brackets: 4 + 15 = 19. / Brackets first: 4 + 3 = 7, then 7 × 5 = 35. | claude-opus-5-5 |
| 6.3-order-of-operations | 2 | 1 | Works left to right: 6 + 4 = 10, then 10 × 3 = 30. / Multiply first: 4 × 3 = 12, then 6 + 12 = 18. | claude-opus-5-5 |
| 6.3-order-of-operations | 3 | 1 | Does 4 × 3 = 12 first, then 36 ÷ 12 = 3. / × and ÷ go left to right: 36 ÷ 4 = 9, then 9 × 3 = 27. | claude-opus-5-5 |
| 6.3-order-of-operations | 4 | 1 | Writes 9 ÷ 2 as 4 and drops the leftover half. / 9 ÷ 2 leaves 1, which is half of 2, so (7 + 2) ÷ 2 = 4.5. | claude-opus-5-5 |
| 6.3-word-expressions | 1 | 1 | Writes 3 × (6 + 2), adding the 2 extra to each of the 3 packs. / The 2 extra is added once: 3 × 6 + 2 = 18 + 2 = 20. | claude-opus-5-5 |
| 6.3-word-expressions | 2 | 1 | Writes 4 × 5 + 2, so only 1 drink is counted, not 4. / Each friend pays 5 + 2, so use brackets: 4 × (5 + 2) = $28. | claude-opus-5-5 |
| 6.3-word-expressions | 3 | 1 | Writes 4 × (9 - 6), taking the $6 off each of the 4 tickets. / The coupon is used once: 4 × 9 - 6 = 36 - 6 = $30. | claude-opus-5-5 |
| 6.4-prime-composite | 1 | 1 | Says 17 is composite, mixing up prime and composite. / Prime means only 1 and itself divide it. 17 has only 1 × 17, so it is prime. | claude-opus-5-5 |
| 6.4-prime-composite | 2 | 1 | Says 51 is prime because 2 and 5 do not go into it. / Test 3 too: 5 + 1 = 6, so 3 goes in. 51 = 3 × 17, so it is composite. | claude-opus-5-5 |
| 6.4-divisibility | 1 | 1 | Says 3,465 is not divisible by 5 because it is odd. / A number divisible by 5 ends in 0 or 5. 3,465 ends in 5, so yes. | claude-opus-5-5 |
| 6.4-divisibility | 2 | 1 | Checks only the last digit, 4, and says 2,714 is divisible by 3. / Add all the digits: 2 + 7 + 1 + 4 = 14, not a multiple of 3, so no. | claude-opus-5-5 |
| 6.4-divisibility | 3 | 1 | Says 1,326 is divisible by 4 because the last digit 6 is even. / For 4, check the last two digits: 26 ÷ 4 leaves 2, so 1,326 is not divisible. | claude-opus-5-5 |
| 6.4-factors | 1 | 1 | Lists 1, 2, 3, 4, 6, 12 and stops, missing 8 and 24. / Check every pair: 1×24, 2×12, 3×8, 4×6, so 8 and 24 count too. | claude-opus-5-5 |
| 6.4-factors | 2 | 1 | Lists 144 as a factor of 72 because 144 is a multiple of 72. / Factors divide 72 evenly and are 72 or less, like 8 and 9. 144 is a multiple. | claude-opus-5-5 |
| 6.4-factors | 3 | 1 | Stops at 6 × 10, but 6 and 10 are not prime. / Split 6 = 2 × 3 and 10 = 2 × 5 to get 2 × 2 × 3 × 5. | claude-opus-5-5 |
| 6.4-factors | 4 | 1 | Writes 2³ × 3, so the 3 is counted once, not twice. / 72 = 2×2×2×3×3. Two 3s is 3², so 72 = 2³ × 3². | claude-opus-5-5 |
| 6.4-gcf | 1 | 1 | Stops at the common factor 3 and calls it the GCF of 12 and 18. / List all common factors: 1, 2, 3, 6. The greatest is 6. | claude-opus-5-5 |
| 6.4-gcf | 2 | 1 | Gives 144, a common multiple of 36 and 48, not a factor. / GCF is the largest number that divides both: 12 goes into 36 and 48. | claude-opus-5-5 |
| 6.4-gcf | 3 | 1 | Takes only the shared 2 and 3, giving 6 and leaving out 7. / Shared primes are 2, 3 and 7, so GCF = 2 × 3 × 7 = 42. | claude-opus-5-5 |
| 6.4-lcm | 1 | 1 | Multiplying 4 × 6 to get 24 for the LCM. / List multiples: 4, 8, 12 and 6, 12. The first shared one is 12. | claude-opus-5-5 |
| 6.4-lcm | 2 | 1 | Multiplying 15 × 20 to get 300 for the LCM. / List multiples: 15, 30, 45, 60 and 20, 40, 60. First shared is 60. | claude-opus-5-5 |
| 6.4-lcm | 3 | 1 | Multiplying 24 × 36 to get 864. / Take each prime its most times: three 2s, two 3s. 2×2×2×3×3 = 72. | claude-opus-5-5 |
| 6.4-gcf-lcm-problems | 1 | 1 | Using a common multiple of 24 and 36, like 72, for the number of boxes. / Equal boxes with none left must divide 24 and 36, so use the GCF: 12. | claude-opus-5-5 |
| 6.4-gcf-lcm-problems | 2 | 1 | Dividing 180 seconds by 12 gives 15, which only counts one light's flashes. / Together means every LCM of 12 and 18, which is 36 s. 180 ÷ 36 = 5. | claude-opus-5-5 |
| 6.13-classify-angles | 1 | 1 | Calling an angle obtuse because its arms look long. / Arm length doesn't matter. An opening smaller than a square corner (90°) is acute. | claude-opus-5-5 |
| 6.13-classify-angles | 2 | 1 | Calling an angle that makes a straight line a right angle. / A right angle is a 90° square corner. A straight line is 180°: straight. | claude-opus-5-5 |
| 6.13-classify-angles | 3 | 1 | Calling 135° acute because it seems small next to 360. / Compare with 90 and 180. 135 is between them, so it is obtuse. | claude-opus-5-5 |
| 6.13-measure-angles | 1 | 1 | Saying half a right angle is 90°, the right angle itself. / A right angle is 90°, so half of it is 90 ÷ 2 = 45°. | claude-opus-5-5 |
| 6.13-measure-angles | 2 | 1 | Reading 110 from the outer scale when the arm starts on the inner 0. / Use the scale that starts at 0 on the arm: inner 70. It is under 90°, so 70°. | claude-opus-5-5 |
| 6.13-measure-angles | 3 | 1 | Finding the reflex angle outside a 60° angle by doing 180 − 60 = 120. / The 60° angle and the reflex angle together make 360°, so 360 − 60 = 300°. | claude-opus-5-5 |
| 6.13-angle-sums | 1 | 1 | Adding to 360 for angles on a straight line, giving 235. / A straight line totals 180°, so 180 − 125 = 55°. | claude-opus-5-5 |
| 6.13-angle-sums | 2 | 1 | DROPPED: Source inconsistent: the correct answer is 90 − 35 = 55. The stated wrong answer 125 does not come from using 180, because 180 − 35 = 145. 125 equals 90 + 35, so the 'why' does not match the wrong answer. | none |
| 6.13-angle-sums | 3 | 1 | Adding 50 + 60 = 110 and giving that as the third angle. / 110 is only the two known angles. Subtract from 180: 180 − 110 = 70°. | claude-opus-5-5 |
| 6.13-angle-sums | 4 | 1 | Assuming the fourth corner is 90° because it is a four-sided shape. / Corners need not be right angles. 90 + 110 + 75 = 275, and 360 − 275 = 85°. | claude-opus-5-5 |
| 6.11-complex-perimeter | 1 | 1 | Adding only two sides of the L-shape, 7 + 7 = 14. / Perimeter is the whole way around: 7+3+4+4+3+7 = 28 cm. | claude-opus-5-5 |
| 6.11-complex-perimeter | 2 | 1 | Adding only the overall sides, 10 + 8 = 18 cm. / The cut-out corner keeps the perimeter equal to the full rectangle's: 10+8+10+8 = 36 cm. | claude-opus-5-5 |
| 6.11-complex-perimeter | 3 | 1 | Counting the shared side 6 twice, getting 30. / The top 6 is joined to the triangle, so leave it out: 6+4+4+5+5 = 24. | claude-opus-5-5 |
| 6.18-theoretical | 1 | 1 | Writing 3/5 by comparing red sections with blue sections. / Chance = red out of all sections. All 8 count, so 3/8. | claude-opus-5-5 |
| 6.18-theoretical | 2 | 1 | Using 4 as the total, writing 2/4. / A die has 6 equal outcomes. Only 5 and 6 are over 4, so 2/6 = 1/3. | claude-opus-5-5 |
| 6.18-theoretical | 3 | 1 | Yellow is 3/9, because the total only adds red 5 and blue 4. / Add all three parts: 5 + 4 + 3 = 12 marbles, so yellow is 3/12 = 1/4. | claude-opus-5-5 |
| 6.18-experimental | 1 | 1 | Heads is 12/8, comparing heads with tails. / Compare heads with all 20 tosses: 12/20 = 3/5. | claude-opus-5-5 |
| 6.18-experimental | 2 | 1 | DROPPED: Total spins are 14+6+10 = 30, so the experimental chance of green is 10/30 = 1/3. The stated wrong answer, 1/3, has the same value as the key. Only its reasoning (3 sections) differs, so the final answer is not wrong here. The problem also never says there are 3 equal sections. No sound pair can be written without changing the example. | none |
| 6.18-experimental | 3 | 1 | 8 reds in 100 spins, copying the 8 from the 20 spins. / 100 is 5 times 20, so scale the reds too: 8 × 5 = 40. | claude-opus-5-5 |
| 6.18-compare | 1 | 1 | 7 heads in 10 tosses means the coin must be unfair. / Short runs vary; 7/10 is near 1/2 but not equal, and a fair coin can do that. | claude-opus-5-5 |
| 6.18-compare | 2 | 1 | The class result from 200 tosses must equal 1/2 exactly. / 104/200 = 0.52, close to 1/2 but not equal, and nearer than one pair's 14/20 = 0.7. | claude-opus-5-5 |
| 6.5-improper-to-mixed | 1 | 1 | 7/4 = 3 1/4, swapping the whole number and the remainder. / 7 ÷ 4 = 1 remainder 3: 1 whole and 3/4, so 1 3/4. | claude-opus-5-5 |
| 6.5-improper-to-mixed | 2 | 1 | 29/8 = 5 3/8, swapping the whole number and the remainder. / 29 ÷ 8 = 3 remainder 5: whole is 3, fraction is 5/8, so 3 5/8. | claude-opus-5-5 |
| 6.5-improper-to-mixed | 3 | 1 | 47/6 = 7 5/42, changing the denominator to 42. / Keep the denominator 6: 47 ÷ 6 = 7 r 5, so 7 5/6. | claude-opus-5-5 |
| 6.5-mixed-to-improper | 1 | 1 | 2 1/3 = 21/3, reading the digits side by side. / Each whole is 3 thirds: 2 × 3 = 6, plus 1 is 7, so 7/3. | claude-opus-5-5 |
| 6.5-mixed-to-improper | 2 | 1 | 5 3/8 = 8/8, adding the whole number 5 to the top 3. / Multiply the whole by the denominator: 5 × 8 = 40, plus 3 is 43, so 43/8. | claude-opus-5-5 |
| 6.5-mixed-to-improper | 3 | 1 | 4 as a fraction with denominator 3 is 4/3. / Multiply 4 by 3 for the top: 4 × 3 = 12, so 4 = 12/3. | claude-opus-5-5 |
| 6.5-compare-order | 1 | 1 | 9/8 > 1 1/4 because 9 is bigger than 1. / 9/8 = 1 1/8, and 1 1/8 is less than 1 1/4, so 9/8 < 1 1/4. | claude-opus-5-5 |
| 6.5-compare-order | 2 | 1 | 13/5 > 2 4/5 because 13 is bigger than 2. / 2 4/5 = 14/5, and 13/5 is less than 14/5, so 13/5 < 2 4/5. | claude-opus-5-5 |
| 6.5-compare-order | 3 | 1 | Leaving 7/4, 1 2/3, 11/6 in the given order after comparing only two. / Use twelfths: 21/12, 20/12, 22/12, so order is 1 2/3, 7/4, 11/6. | claude-opus-5-5 |
| 6.8-multiply-decimal | 1 | 1 | 0.6 × 4 = 0.24, multiplying digits and putting the point in front. / 6 tenths × 4 = 24 tenths, which is 2.4. | claude-opus-5-5 |
| 6.8-multiply-decimal | 2 | 1 | 0.35 × 6 = 0.210, putting the point before 210. / 35 hundredths × 6 = 210 hundredths, which is 2.10 = 2.1. | claude-opus-5-5 |
| 6.8-multiply-decimal | 3 | 1 | 0.125 × 3 = 3.75, with the point after the first digit of 375. / 125 thousandths × 3 = 375 thousandths, which is 0.375. | claude-opus-5-5 |
| 6.8-multiply-decimal | 4 | 1 | 12 × 0.25 = 48, expecting multiplying to make the number bigger. / 0.25 is less than 1, so the answer is less than 12: 12 × 0.25 = 1/4 of 12 = 3. | claude-opus-5-5 |
| 6.8-divide-decimal | 1 | 1 | 7.2 ÷ 9 = 8, ignoring the decimal point. / 7.2 is 72 tenths; 72 tenths ÷ 9 = 8 tenths = 0.8. | claude-opus-5-5 |
| 6.8-divide-decimal | 2 | 1 | DROPPED: Source inconsistent: 8.4 ÷ 4 = 2.1 (8 ÷ 4 = 2, 0.4 ÷ 4 = 0.1). Dropping a zero from the quotient cannot turn 2.1 into 0.6, and no common slip gives 0.6, so the why does not explain the wrong answer. | none |
| 6.8-divide-decimal | 3 | 1 | Stops at 1.2 with a remainder of 3 for 7.5 ÷ 6. / Regroup the 3 left tenths as 30 hundredths; 30 ÷ 6 = 5, so 1.25. | claude-opus-5-5 |
| 6.8-divide-decimal | 4 | 1 | Writes 1.2 for 4.08 ÷ 4, leaving out the zero tenths. / 4 ones ÷ 4 = 1, 0 tenths stays 0, 8 hundredths ÷ 4 = 2, so 1.02. | claude-opus-5-5 |
| 6.8-decimal-word-problems | 1 | 1 | DROPPED: Source inconsistent: 4 × $2.35 = $9.40. Misplacing the decimal point only shifts 940, giving $94.00 or $0.94, never $8.20. The stated why does not explain the wrong answer. | none |
| 6.8-decimal-word-problems | 2 | 1 | DROPPED: Source inconsistent: 2 hats cost $9.50, total $22.00, change $8.00. Using only one hat's cost gives $12.50 + $4.75 = $17.25 total or $12.75 change, not $17.75. The stated why does not explain $17.75. | none |
| 6.8-decimal-word-problems | 3 | 1 | Writes 0.09 m after getting 72 ÷ 8 = 9. / 7.2 is 72 tenths, so 72 tenths ÷ 8 = 9 tenths = 0.9 m. | claude-opus-5-5 |
| 6.8-decimal-word-problems | 4 | 1 | In 2.450 − 0.875, takes the smaller digit from the larger in each place: 2.425. / Regroup when the top digit is smaller to get 1.575 m. | claude-opus-5-5 |
| 6.10-preserve-equality | 1 | 1 | Takes 3 off the left only, so x + 3 − 3 = x is set equal to 10 and x = 10. / Take 3 off the right too: 10 − 3 = 7, so x = 7. | claude-opus-5-5 |
| 6.10-preserve-equality | 2 | 1 | Shares only the left side, 2x into x, and leaves 10 as it is, so x = 10. / Share both sides into 2: 2x ÷ 2 = x and 10 ÷ 2 = 5, so x = 5. | claude-opus-5-5 |
| 6.10-solve-one-step | 1 | 1 | Adds 18 to 45 to get x = 63 for x + 18 = 45. / Take 18 away from 45: x = 45 − 18 = 27. | claude-opus-5-5 |
| 6.10-solve-one-step | 2 | 1 | Adds 5 to 11 to get x = 16 for x + 5 = 11. / Take 5 off both sides: x = 11 − 5 = 6. | claude-opus-5-5 |
| 6.10-solve-one-step | 3 | 1 | Subtracts 3 from 12 to get x = 9 for 3x = 12. / 3x means 3 times x, so divide both sides by 3: x = 12 ÷ 3 = 4. | claude-opus-5-5 |
| 6.10-solve-one-step | 4 | 1 | Subtracts 6 from 9 to get x = 3 for x − 6 = 9. / 6 was taken away, so add 6 to both sides: x = 9 + 6 = 15. | claude-opus-5-5 |
| 6.10-combine-like-terms | 1 | 1 | Multiplies the numbers in front, 2 × 3, to get 6x. / Add them: 2x + 3x = 5x. Then 5x = 20, so x = 4. | claude-opus-5-5 |
| 6.10-combine-like-terms | 2 | 1 | Works out 9 − 4 = 5 and gives that as x. / 9x − 4x = 5x, so 5x = 35 and x = 35 ÷ 5 = 7. | claude-opus-5-5 |
| 6.10-write-equation | 1 | 1 | Writes 25 − n = 38, as if n were taken away from 25. / n is the start and 25 is taken away, so write n − 25 = 38. | claude-opus-5-5 |
| 6.10-write-equation | 2 | 1 | Writes 8 + 20 = n, adding the result 20 to the change 8. / 20 is the amount after getting 8 more, so write n + 8 = 20. | claude-opus-5-5 |
| 6.10-write-equation | 3 | 1 | Writes x + 6 = 48 for 6 boxes of x pens each. / 6 boxes of x pens is 6 times x, so write 6x = 48. | claude-opus-5-5 |
| 6.10-write-equation | 4 | 1 | Writes 4 ÷ n = 7, with the unknown as the divisor. / n is the amount being shared, so it is divided by 4: n ÷ 4 = 7. | claude-opus-5-5 |
| 6.12-triangle-area | 1 | 1 | Multiplies 4 × 6 = 24 and stops, giving 24 square units. / 4 × 6 = 24 is the whole rectangle. A triangle is half: 24 ÷ 2 = 12 square units. | claude-opus-5-5 |
| 6.12-triangle-area | 2 | 1 | Multiplying base 10 cm by height 6 cm and giving 60 cm² as the triangle's area. / A triangle is half of base × height: 60 ÷ 2 = 30 cm². | claude-opus-5-5 |
| 6.12-triangle-area | 3 | 1 | 7 × 5 = 35 m² with no halving, or rounding 17.5 up to 18 m². / Halve 35 to get 17.5 m². Keep the .5, don't round. | claude-opus-5-5 |
| 6.12-triangle-area | 4 | 1 | Base 8 cm × height 5 cm = 40 cm², stated as the area of the obtuse triangle. / The triangle is half of that: 40 ÷ 2 = 20 cm². | claude-opus-5-5 |
| 6.12-parallelogram-area | 1 | 1 | Using the slanted side 5 as the height: 6 × 5 = 30. / Height is the straight-up distance, 4, not the slant. Area = 6 × 4 = 24 square units. | claude-opus-5-5 |
| 6.12-parallelogram-area | 2 | 1 | Multiplying base 12 by the slanted side 13 to get 156 cm². / Use the height 5, not the slanted side: 12 × 5 = 60 cm². | claude-opus-5-5 |
| 6.12-parallelogram-area | 3 | 1 | Adding the base and height: 4.5 + 6 = 10.5 cm². / Area means multiplying base × height: 4.5 × 6 = 27 cm². | claude-opus-5-5 |
| 6.12-trapezoid-area | 1 | 1 | Adding the parallel sides and multiplying by height: (6 + 10) × 4 = 64, and stopping. / A trapezoid is half of that: 64 ÷ 2 = 32 square units. | claude-opus-5-5 |
| 6.12-trapezoid-area | 2 | 1 | Finding only the 6 by 4 rectangle, 24, and leaving out the triangle. / Add the triangle: ½ × 3 × 4 = 6, so 24 + 6 = 30 square units. | claude-opus-5-5 |
| 6.12-trapezoid-area | 3 | 1 | (3.5 + 6.5) × 4 = 40 m², given as the area without halving. / Halve it: 40 ÷ 2 = 20 m². | claude-opus-5-5 |
| 6.12-missing-dimension | 1 | 1 | Multiplying area 36 by base 9 to get a height of 324. / Area = base × height, so divide: 36 ÷ 9 = 4. | claude-opus-5-5 |
| 6.12-missing-dimension | 2 | 1 | Dividing 24 by base 8 to get height 3, without doubling the area. / Double first: 24 × 2 = 48, then 48 ÷ 8 = 6. | claude-opus-5-5 |
| 6.12-missing-dimension | 3 | 1 | Dividing area 30 m² by height 10 to get base 3 m, forgetting the half. / Double the area first: 30 × 2 = 60, then 60 ÷ 10 = 6 m. | claude-opus-5-5 |
| 6.15-classify-by-sides | 1 | 1 | Calling a triangle with three equal sides just isosceles. / Three equal sides is equilateral. Isosceles means two equal sides. | claude-opus-5-5 |
| 6.15-classify-by-sides | 2 | 1 | Seeing the 8 cm side differs and calling sides 5, 5, 8 scalene. / Two sides match (5 and 5), so it is isosceles. Scalene has none equal. | claude-opus-5-5 |
| 6.15-classify-by-sides | 3 | 1 | Calling a turned triangle with sides 9, 9, 9 a "diamond". / Turning doesn't change side lengths. All three are 9, so it's equilateral. | claude-opus-5-5 |
| 6.15-classify-by-angles | 1 | 1 | Calling a triangle with a square corner obtuse because its sides look long. / A square corner is exactly 90°, so it's right. Obtuse is over 90°. | claude-opus-5-5 |
| 6.15-classify-by-angles | 2 | 1 | Calling a triangle with angles 40°, 60°, 80° right. / Right needs a 90° angle. The biggest is 80°, under 90°, so it's acute. | claude-opus-5-5 |
| 6.15-classify-by-angles | 3 | 1 | Calling the triangle acute without finding the third angle. / Find it first: 180 − 35 − 55 = 90, so it is a right triangle. | claude-opus-5-5 |
| 6.16-plot-points | 1 | 1 | Writing 4 across and 7 up as (7, 4), putting up first. / Across comes first, then up: (4, 7). | claude-opus-5-5 |
| 6.16-plot-points | 2 | 1 | DROPPED: The source is inconsistent, and the wrong answer is blank. The corners (3, 5), (3, 1), (7, 1) and (7, 5) make a square with sides of 4 spaces. Counting marks gives 5 on each side, which is still a square. The slip doesn't change the shape named, so there's no distinct wrong answer to correct. | none |
| 6.16-plot-points | 3 | 1 | Writes (3, 2) by using the mark counts as the coordinates. / Each mark is worth 5, so multiply: 3 × 5 = 15 across and 2 × 5 = 10 up, giving (15, 10). | claude-opus-5-5 |
| 6.16-translate-point | 1 | 1 | Slides (2, 3) 4 right by adding 4 to the second number, giving (2, 7). / Right changes the first number: 2 + 4 = 6. The 3 stays the same, so (6, 3). | claude-opus-5-5 |
| 6.16-translate-point | 2 | 1 | DROPPED: Source is inconsistent: the stated wrong answer (7, 7) comes from 3 + 4 and 2 + 5, so the moves went onto the wrong coordinates. The 'why' says both moves were added to the first number, which would give (12, 2). The answer and the 'why' describe different moves. | none |
| 6.16-translate-point | 3 | 1 | Says 3 right and 5 up, putting the up change in the across place. / Across: 7 − 2 = 5 right. Up: 4 − 1 = 3 up. So the slide is 5 right and 3 up. | claude-opus-5-5 |
| 6.16-combine-transformations | 1 | 1 | Puts the reflected point on the mirror line at 6, giving (6, 4). / 3 is 3 left of the mirror at 6, so the image is 3 right of it: 9. Then up 2: (9, 4). | claude-opus-5-5 |
| 6.16-combine-transformations | 2 | 1 | DROPPED: Source is inconsistent: turning the wrong way (counterclockwise) sends (7, 5) to (5, 7). The slide 1 right should then give (6, 7). The stated wrong answer (5, 7) skips the slide, and the 'why' only says it turns the wrong way. | none |
| 6.6-write-ratio | 1 | 1 | Writes 3 : 5, with blue first, when red to blue was asked. / Keep the order asked: red first, then blue. 5 red and 3 blue is 5 : 3. | claude-opus-5-5 |
| 6.6-write-ratio | 2 | 1 | Writes 3 : 5, comparing green beads with the other beads only. / All beads means the whole, 8. Green to all beads is 3 : 8. | claude-opus-5-5 |
| 6.6-write-ratio | 3 | 1 | Writes 3 : 2, comparing milk with the flour only. / All together is 2 + 3 = 5 cups, so milk to all the liquid and flour is 3 : 5. | claude-opus-5-5 |
| 6.6-equivalent-ratios | 1 | 1 | DROPPED: Source is inconsistent: the wrong answer and 'why' read as 2 : 3 = 4 : 5, which adds 2 to both parts. That gives no value for the blank in 2 : 3 = 6 : __, so no standalone wrong move fits the example. | none |
| 6.6-equivalent-ratios | 2 | 1 | DROPPED: Rejected because the source data is broken. The math in the pair is right: 12 ÷ 2 = 6 and 18 ÷ 2 = 9, giving 6 : 9, which is not fully simplified. The greatest common factor of 12 and 18 is 6, and 12 ÷ 6 = 2, 18 ÷ 6 = 3, giving 2 : 3. Wrong + space + fix is about 121 characters, under the 150 limit. But the supplied mistake answer is just "6", and the 'why' field starts with "9: divides...". It looks like the ratio "6 : 9" was split at the colon. So the stated mistake answer ("6") is not a ratio and does not match the pair's wrong answer (6 : 9). Because the source is inconsistent, the pair cannot be checked against the stated mistake. | none |
| 6.6-equivalent-ratios | 3 | 1 | Adds 9 to both amounts, since 3 + 9 = 12, so 5 + 9 = 14 cups of water. / 3 becomes 12 by multiplying by 4, so multiply 5 by 4 too: 5 × 4 = 20 cups. | claude-opus-5-5 |
| 6.6-ratio-to-fraction | 1 | 1 | Writes red as 2/3, using the blue part as the whole. / The whole is both parts: 2 + 3 = 5. Red is 2 of 5 parts, so 2/5. | claude-opus-5-5 |
| 6.6-ratio-to-fraction | 3 | 1 | Writes red to not red as 3 : 8, keeping the whole as the second part. / Not red is 8 − 3 = 5 parts, so red to not red is 3 : 5. | claude-opus-5-5 |
| 6.7-percent-meaning | 1 | 1 | Moves the point to write 35 out of 100 as 3.5%. / Percent means out of 100, so 35 out of 100 is 35%. No point moves. | claude-opus-5-5 |
| 6.7-percent-meaning | 2 | 1 | Writes 50% as 0.05, putting the point one place too far left. / 50% is 50 out of 100 = 0.50, which is 0.5. Also, 0.05 is 5%. | claude-opus-5-5 |
| 6.7-percent-meaning | 3 | 1 | Writes 3/5 as 35% by putting the 3 and 5 side by side. / Make the bottom 100: 3/5 = 60/100, so 3/5 is 60%. | claude-opus-5-5 |
| 6.7-percent-of | 1 | 1 | Gives 25 as the answer to 25% of 80, the percent number itself. / 25% is 1/4, so take a quarter of 80: 80 ÷ 4 = 20. | claude-opus-5-5 |
| 6.7-percent-of | 2 | 1 | Divides 60 by 30 to get 2 for 30% of 60. / 10% of 60 is 6. 30% is 3 tens of percent, so 3 × 6 = 18. | claude-opus-5-5 |
| 6.7-percent-of | 3 | 1 | Adds 35 + 40 to get 75 for 35% of 40. / Find parts of 40: 10% is 4, so 30% is 12 and 5% is 2. Add 12 + 2 = 14. | claude-opus-5-5 |
| 6.7-percent-of | 4 | 1 | Answering 35 students because the percent is 35%. / Take 35% of 40: 10% is 4, so 30% is 12 and 5% is 2. That gives 14. | claude-opus-5-5 |
| 6.7-discount | 1 | 1 | Giving $10, the amount taken off, as the sale price. / 25% of $40 is $10 off, so subtract: $40 - $10 = $30. | claude-opus-5-5 |
| 6.7-discount | 2 | 1 | Giving $9, the amount taken off, as the sale price. / 15% of $60 is $9 off, so subtract: $60 - $9 = $51. | claude-opus-5-5 |
| 6.7-missing-whole | 1 | 1 | Finding 50% of 12 to get 6. / 12 is 50%, which is half the number, so double it: 12 × 2 = 24. | claude-opus-5-5 |
| 6.7-missing-whole | 2 | 1 | Finding 20% of 14 to get 2.8. / 14 is 20% of the number, so 10% is 7. The whole is 10 × 7 = 70. | claude-opus-5-5 |
| 6.7-missing-whole | 3 | 1 | Finding 35% of 70 to get 24.5. / 70 is 35% of the number, so 1% is 70 ÷ 35 = 2. The whole is 100 × 2 = 200. | claude-opus-5-5 |
| 6.7-missing-whole | 4 | 1 | Finding 40% of 12 to get 4.8. / 12 is 40% of the class, so 10% is 3. The whole class is 10 × 3 = 30. | claude-opus-5-5 |
| 6.19-saving-plan | 1 | 1 | DROPPED: Source is inconsistent: $120 ÷ $8 = 15 exactly, so there is no remainder to ignore. The stated wrong answer of 18 or 19 weeks can't come from leaving out a leftover, and it isn't a stopped-short answer either, because it is larger than 15. | none |
| 6.19-saving-plan | 2 | 1 | Dividing the full $200 by 12 and ignoring the $45 saved. / Subtract $45 first: $155 ÷ 12 is 12 with some left over, so 13 weeks. | claude-opus-5-5 |
| 6.19-saving-plan | 3 | 1 | Dividing $48 by the $10 income and ignoring the $4 spent. / Weekly saving is $10 - $4 = $6, so $48 ÷ $6 = 8 weeks. | claude-opus-5-5 |
| 6.19-consumer-choice | 1 | 1 | Picks the 3-pen pack because $4.50 is a lower total than $7. / Divide: $4.50 ÷ 3 = $1.50, $7 ÷ 5 = $1.40. The 5-pen pack costs less per pen. | claude-opus-5-5 |
| 6.9-evaluate-rule | 1 | 1 | Adding 1 first, then doubling: (5 + 1) × 2 = 12. / Follow the rule order: multiply first, 5 × 2 = 10, then add 1 to get 11. | claude-opus-5-5 |
| 6.9-evaluate-rule | 2 | 1 | Writes 2n with n = 7 as 27, then puts the 1 after it to get 271. / 2n means 2 × n. So 2 × 7 = 14, then add 1: 14 + 1 = 15. | claude-opus-5-5 |
| 6.9-evaluate-rule | 3 | 1 | Subtracting first: 50 - 4 = 46, then 46 × 6 = 276. / Multiply first: 4 × 6 = 24, then take it from 50: 50 - 24 = 26. | claude-opus-5-5 |
| 6.9-find-rule | 1 | 1 | Choosing 'add 3' because it works for the first row, 1 → 4. / Check every row: 2 + 3 is not 8. Each output is 4 times its input, so multiply by 4. | claude-opus-5-5 |
| 6.9-find-rule | 2 | 1 | Giving 'add 3' just because the outputs go up by 3. / Going up by 3 means multiply by 3. Then 1 × 3 = 3 needs + 2 to reach 5: n × 3 + 2. | claude-opus-5-5 |
| 6.9-find-rule | 3 | 1 | Saying 'add 3' when the outputs 19, 16, 13 are going down. / Outputs drop by 3 each step, so subtract 3n. Start at 22: 22 - 3 = 19, so 22 - 3n. | claude-opus-5-5 |
| 6.9-graph-relation | 1 | 1 | Writing (9, 4) by swapping the input and output. / The input comes first. The next input is 4 and its output is 9, so the pair is (4, 9). | claude-opus-5-5 |
| 6.9-graph-relation | 2 | 1 | Listing (2, 4) by only doubling x and leaving out the + 1. / Double x, then add 1: when x = 2, y = 2 × 2 + 1 = 5, so the pair is (2, 5). | claude-opus-5-5 |
| 6.9-graph-relation | 3 | 1 | Adding 2x to 10 to get (3, 16). / The rule takes away: y = 10 - 2 × 3 = 4, so the pair for x = 3 is (3, 4). | claude-opus-5-5 |
| 6.9-write-expression | 1 | 1 | Writes 5 more than n as 5n, multiplying instead of adding. / "More than" means add, so it is n + 5. | claude-opus-5-5 |
| 6.9-write-expression | 2 | 1 | Writes 8 more than 5 times n as 58n, joining the 5 and 8. / 5 times n is 5n, then add 8: 5n + 8. | claude-opus-5-5 |
| 6.9-write-expression | 3 | 1 | Adds $3 and $2 to get 5, then multiplies by k: 5k. / Only the $2 repeats each km: 2k. The $3 is added once: 2k + 3. | claude-opus-5-5 |
| 6.14-volume-cubes | 1 | 1 | Adds the edges 4 + 3 + 2 to get 9 cubes. / One layer is 4 × 3 = 12 cubes; 2 layers is 12 × 2 = 24 cubes. | claude-opus-5-5 |
| 6.14-volume-cubes | 2 | 1 | Counts only the front, 1 + 2 + 3 = 6 cubes. / Each column is 4 wide: 4 × (1 + 2 + 3) = 4 × 6 = 24 cubes. | claude-opus-5-5 |
| 6.14-volume-cubes | 3 | 1 | Writes the volume 30 with cm², a unit for flat area. / 5 × 2 × 3 = 30 counts cubes, so the unit is cm³: 30 cm³. | claude-opus-5-5 |
| 6.14-volume-prism | 1 | 1 | Adds the edges 6 + 4 + 3 = 13 instead of multiplying. / Multiply the three edges: 6 × 4 × 3 = 72, so 72 cm³. | claude-opus-5-5 |
| 6.14-volume-prism | 2 | 1 | Adds base area 20 and height 7 to get 27 cm³. / Multiply: 20 × 7 = 140 cm³, since the base layer repeats 7 high. | claude-opus-5-5 |
| 6.14-volume-prism | 3 | 1 | Divides 60 by 5 only, leaving out the base width 4: 12 cm. / Base area is 5 × 4 = 20, so 60 ÷ 20 = 3 cm. | claude-opus-5-5 |
| 6.14-capacity-units | 1 | 1 | Uses 1 L = 100 mL, so 2.5 L becomes 250 mL. / 1 L = 1,000 mL, so 2.5 × 1,000 = 2,500 mL. | claude-opus-5-5 |
| 6.14-capacity-units | 2 | 1 | Adds the edges 10 + 5 + 4 = 19 to get mL. / Multiply: 10 × 5 × 4 = 200 cm³, and 1 cm³ holds 1 mL, so 200 mL. | claude-opus-5-5 |
| 6.14-capacity-units | 3 | 1 | DROPPED: The source is inconsistent. 1 L = 1,000 cm³, so 2,000 cm³ = 2 L. The stated why is 'moves the point the wrong way', but the wrong answer 200 L is smaller, which is the right direction. It only shifts the point 1 place instead of 3, which is dividing by 10, not 1,000. The why does not explain 200 L, so no sound pair fits both. | none |
| 6.17-read-line-graph | 1 | 1 | Reads 7 cm, the week 2 value, when asked about week 3. / Match week 3 with its own height: 11 cm. | claude-opus-5-5 |
| 6.17-read-line-graph | 2 | 1 | Gives the week 3 height, 11 cm, not how much it grew. / Growth is a difference: 11 − 4 = 7 cm. | claude-opus-5-5 |
| 6.17-read-line-graph | 3 | 1 | Takes the 9 am reading, 6 degrees, for 10 am. / 10 am is halfway between 9 am and 11 am, so halfway between 6 and 12: 9. | claude-opus-5-5 |
| 6.17-make-line-graph | 1 | 1 | Writes day 2's point as (5, 2), putting the value first. / The day comes first, then the value: (2, 5). | claude-opus-5-5 |
| 6.17-make-line-graph | 2 | 1 | Counts each square as 1, so 12 squares only reach 12 and miss 48. / Split the top value across the squares: 48 ÷ 12 = 4, so each square counts 4. | claude-opus-5-5 |
| 7.1-fact-strategies | 1 | 1 | Stops at 46 × 10 = 460 and forgets to halve. / × 5 is half of × 10, so half of 460 is 230. | claude-opus-5-5 |
| 7.1-fact-strategies | 2 | 1 | Stops at 32 × 100 = 3,200 and never divides by 4. / 25 is a quarter of 100, so 3,200 ÷ 4 = 800. | claude-opus-5-5 |
| 7.1-fact-strategies | 3 | 1 | Doubles both 35 and 18 to get 70 × 36 = 2,520. / Double one, halve the other: 70 × 9 = 630. | claude-opus-5-5 |
| 7.1-divide-strategies | 1 | 1 | 340 ÷ 5 = 34, stopping after dividing by 10. / Dividing by 5 is dividing by 10, then doubling: 340 ÷ 10 = 34, and 34 × 2 = 68. | claude-opus-5-5 |
| 7.1-divide-strategies | 2 | 1 | 3,600 ÷ 50 = 36, dividing by 100 and not doubling. / 50 is half of 100, so double the ÷ 100 result: 3,600 ÷ 100 = 36, then 36 × 2 = 72. | claude-opus-5-5 |
| 7.1-divide-strategies | 3 | 1 | 264 ÷ 8 = 66, halving only twice. / Halving twice divides by 4. Divide by 8 with three halves: 264 → 132 → 66 → 33. | claude-opus-5-5 |
| 7.2-integer-meaning | 1 | 1 | A point 3 marks left of 0 is 3, giving only the distance. / Left of 0 means below zero, so the sign is negative. 3 marks left of 0 is -3. | claude-opus-5-5 |
| 7.2-integer-meaning | 2 | 1 | The opposite of -7 is -7, as if it were its own opposite. / An opposite is the same distance from 0 on the other side. The opposite of -7 is 7. | claude-opus-5-5 |
| 7.2-integer-meaning | 3 | 1 | Marks 5 apart, 2 marks left of 0 is -2, counting marks only. / Each mark step is worth 5, so 2 marks left is 2 × 5 = 10 left. The integer is -10. | claude-opus-5-5 |
| 7.2-compare-integers | 1 | 1 | -3 < -8, because 8 is bigger than 3. / With negatives, the one closer to 0 is greater. -3 is closer to 0 than -8, so -3 > -8. | claude-opus-5-5 |
| 7.2-compare-integers | 2 | 1 | Ordering -4, 2, -9, 0 as 0, 2, -4, -9 by ignoring the signs. / Negatives are below 0. Least to greatest: -9 is least, then -4, then 0, then 2. | claude-opus-5-5 |
| 7.2-compare-integers | 3 | 1 | -5 degrees C is colder than -12 degrees C because 5 is smaller. / Further below zero is colder. -12 is lower than -5, so -12 degrees C is colder. | claude-opus-5-5 |
| 7.2-add-integers | 1 | 1 | (-6) + (-4) = 10, dropping both negative signs. / Both numbers are negative, so jump left from -6 by 4 more. 6 + 4 = 10, so it is -10. | claude-opus-5-5 |
| 7.2-add-integers | 2 | 1 | (-3) + 5 = -8, adding 3 and 5 as if both were negative. / 5 is positive, so jump 5 right from -3. That passes 0 and lands on 2. | claude-opus-5-5 |
| 7.2-add-integers | 3 | 1 | (-27) + 18 = 9, taking the sign of the second number. / Subtract 27 - 18 = 9, then use the sign of the larger size, 27, which is negative: -9. | claude-opus-5-5 |
| 7.2-subtract-integers | 1 | 1 | 3 - 8 = 5, taking the smaller from the larger and losing the sign. / Start at 3 and move 8 left. That passes 0 and lands on -5. | claude-opus-5-5 |
| 7.2-subtract-integers | 2 | 1 | 9 - (-4) = 5, treating it like 9 - 4. / Subtracting a negative moves right, so it is the same as adding 4: 9 + 4 = 13. | claude-opus-5-5 |
| 7.2-subtract-integers | 3 | 1 | (-12) - 15 = 3, subtracting the digits 15 - 12. / Start at -12 and move 15 left, further below zero. 12 + 15 = 27, so it is -27. | claude-opus-5-5 |
| 7.2-add-subtract-several | 1 | 1 | (-4) + 9 - 3 = -16, treating + 9 as taking away 9. / Keep + 9 as adding: -4 + 9 = 5, then 5 - 3 = 2. | claude-opus-5-5 |
| 7.2-add-subtract-several | 2 | 1 | (-5) + 8 - (-3) = 0, subtracting 3 and ignoring the double negative. / Subtracting -3 means adding 3: -5 + 8 = 3, then 3 + 3 = 6. | claude-opus-5-5 |
| 7.2-add-subtract-several | 3 | 1 | (-12) - (-20) + 9 - 15 = -38, subtracting 20, not -20. / Subtracting -20 means adding 20: -12 + 20 = 8, then 8 + 9 = 17, 17 - 15 = 2. | claude-opus-5-5 |
| 7.2-multiply-integers | 1 | 1 | 4 × (-3) = 12, dropping the negative sign. / 4 × (-3) is 4 jumps of 3 left, or -3 four times. 4 × 3 = 12, so the answer is -12. | claude-opus-5-5 |
| 7.2-multiply-integers | 2 | 1 | (-4) × 6 = 24, dropping the negative sign. / A negative times a positive is negative. 4 × 6 = 24, so (-4) × 6 = -24. | claude-opus-5-5 |
| 7.2-multiply-integers | 3 | 1 | Saying (-3) × (-5) = -15 because two negatives make a negative. / Two negative factors give a positive: 3 × 5 = 15, so (-3) × (-5) = 15. | claude-opus-5-5 |
| 7.2-multiply-divide-integers | 1 | 1 | Writing (-24) ÷ 6 = 4 by dropping the negative sign. / Different signs give a negative quotient: 24 ÷ 6 = 4, so (-24) ÷ 6 = -4. | claude-opus-5-5 |
| 7.2-multiply-divide-integers | 2 | 1 | Answering 8 for (-7) × __ = 56, but (-7) × 8 = -56. / A negative times a negative is positive, so use 56 ÷ (-7) = -8. | claude-opus-5-5 |
| 7.2-integer-order-of-operations | 1 | 1 | Adding 3 + 4 first, then 7 × (-2) = -14. / Multiply first: 4 × (-2) = -8, then 3 + (-8) = -5. | claude-opus-5-5 |
| 7.2-integer-order-of-operations | 2 | 1 | Ignoring the brackets: 7 × (-4) = -28, then -3 + (-28) = -31. / Brackets first: (-3) + 7 = 4, then 4 × (-4) = -16. | claude-opus-5-5 |
| 7.2-integer-order-of-operations | 3 | 1 | Doing (-20) ÷ 2 first and ignoring the brackets (2 - 7). / Do 2 - 7 = -5 first, then (-20) ÷ (-5) = 4, and 4 + (-6) = -2. | claude-opus-5-5 |
| 7.2-integer-contexts | 1 | 1 | Working out -8 - 13 = -21 when the temperature rises 13 degrees. / A rise means add: -8 + 13 = 5, so it is 5 degrees C. | claude-opus-5-5 |
| 7.2-integer-contexts | 2 | 1 | Going deeper to -37 m when the diver swims up 12 m. / Swimming up adds 12: -25 + 12 = -13 m, closer to sea level. | claude-opus-5-5 |
| 7.2-integer-contexts | 3 | 1 | Using the fall of 3 only once: -6 - 3 = -9 degrees C. / It falls 3 each hour for 4 hours: 3 × 4 = 12, so -6 - 12 = -18 degrees C. | claude-opus-5-5 |
| 7.4-fraction-to-decimal | 1 | 1 | Working out 4 ÷ 3 = 1.33 for 3/4. / Divide the top by the bottom: 3 ÷ 4 = 0.75. | claude-opus-5-5 |
| 7.4-fraction-to-decimal | 2 | 1 | Working out 8 ÷ 3 = 2.67 for 3/8. / Divide the numerator by the denominator: 3 ÷ 8 = 0.375. | claude-opus-5-5 |
| 7.4-fraction-to-decimal | 3 | 1 | Writing 2 3/8 as 2.3 by putting the numerator after the point. / Keep the 2, then change 3/8 by 3 ÷ 8 = 0.375, giving 2.375. | claude-opus-5-5 |
| 7.4-lowest-terms | 1 | 1 | Dividing only the bottom by 3, so 6/9 becomes 6/3. / Divide top and bottom by 3: 6 ÷ 3 = 2 and 9 ÷ 3 = 3, so 2/3. | claude-opus-5-5 |
| 7.4-lowest-terms | 2 | 1 | Dividing 18/48 by 2 and stopping at 9/24, which can still be reduced. / Divide top and bottom by the greatest common factor, 6: 18/48 = 3/8. | claude-opus-5-5 |
| 7.4-lowest-terms | 3 | 1 | Dividing 28/12 by 2 once and stopping at 14/6. / 14 and 6 still share 2. The GCF of 28 and 12 is 4, so 28/12 = 7/3. | claude-opus-5-5 |
| 7.4-decimal-to-fraction | 1 | 1 | Writing 0.6 as 1/6 by putting the 6 under a 1. / 0.6 is 6 tenths, 6/10. Divide top and bottom by 2 to get 3/5. | claude-opus-5-5 |
| 7.4-decimal-to-fraction | 2 | 1 | Writing 0.45 as 45/10, using 10 for two decimal places. / Two places means hundredths: 45/100, then divide by 5 to get 9/20. | claude-opus-5-5 |
| 7.4-decimal-to-fraction | 3 | 1 | DROPPED: fix needs commas for thousands | none |
| 7.4-fraction-decimal-percent | 1 | 1 | Writing 37% as 3.7 by moving the decimal point one place. / Percent means out of 100, so move two places: 37% = 0.37 = 37/100. | claude-opus-5-5 |
| 7.4-fraction-decimal-percent | 2 | 1 | Writing 0.375 as 3.75% by moving the decimal point one place. / Move the point two places: 0.375 × 100 = 37.5%. | claude-opus-5-5 |
| 7.4-terminating-repeating | 1 | 1 | Says 1/4 repeats, as if every fraction gives a repeating decimal. / Divide: 1 ÷ 4 = 0.25. The division stops, so the decimal ends. | claude-opus-5-5 |
| 7.4-terminating-repeating | 2 | 1 | Writes 1/3 as 0.33, cutting it off as if it ends. / 1/3 = 0.333... never stops, so write 0.3 with a line over the 3. | claude-opus-5-5 |
| 7.4-terminating-repeating | 3 | 1 | DROPPED: Source is inconsistent. The step limits denominators to 2 to 16, but the example uses 7/20, which has denominator 20. The values are right (3/8 = 0.375, 4/9 = 0.444..., 7/20 = 0.35) and 'all of them' is wrong because 4/9 repeats. But the example is outside the stated range, so I did not write a pair. | none |
| 7.4-number-line | 1 | 1 | Picks 0 for 3/8, the benchmark that is farther from it. / 3/8 = 0.375. It is 0.125 from 1/2 but 0.375 from 0, so 1/2 is closest. | claude-opus-5-5 |
| 7.4-number-line | 2 | 1 | Puts 0.35 between 0.4 and 0.5 by counting marks, not spaces. / 0.3 is 3 spaces from 0, so 0.35 is halfway through the next space: between 0.3 and 0.4. | claude-opus-5-5 |
| 7.4-number-line | 3 | 1 | Puts 5/4 between 0 and 1 because it has a 4. / 5/4 is 5 quarters. 4 quarters make 1, so 5/4 is one mark after 1. | claude-opus-5-5 |
| 7.4-compare-forms | 1 | 1 | Says 0.45 > 0.5 because 0.45 has more digits. / Write 0.5 as 0.50. 45 hundredths is less than 50 hundredths, so 0.45 < 0.5. | claude-opus-5-5 |
| 7.4-compare-forms | 2 | 1 | Puts 58% last because 58 looks bigger than 0.6 and 5/8. / Convert: 58% = 0.58, 5/8 = 0.625. Then 0.58 < 0.6 < 0.625, so 58% is least. | claude-opus-5-5 |
| 7.4-compare-forms | 3 | 1 | DROPPED: Source is inconsistent. Comparing 45 and 3 as plain numbers makes 3 smaller, which puts 3/8 before 45%. That is the correct order (3/8 = 0.375, 45% = 0.45). The stated wrong answer puts 45% first, so the stated reason does not produce the stated wrong answer. | none |
| 7.4-ratio-percent | 1 | 1 | Says 9 out of 50 is 9%, using the count as the percent. / Percent means out of 100. 9/50 = 18/100, so 9 out of 50 is 18%. | claude-opus-5-5 |
| 7.4-ratio-percent | 2 | 1 | Gives 9 out of 25 as 0.36 and stops at the decimal. / 9 ÷ 25 = 0.36. Multiply by 100 to write it as a percent: 36%. | claude-opus-5-5 |
| 7.4-ratio-percent | 3 | 1 | Finds red's percent as 3/2 = 150%, comparing red to blue only. / Whole = 3 + 2 = 5. Red is 3 out of 5 = 3/5 = 60%. | claude-opus-5-5 |
| 7.3-add-subtract-decimals | 1 | 1 | Adds 4.62 + 3.19 as 7.71, forgetting to carry from the hundredths. / 2 + 9 = 11 hundredths: write 1, carry 1 tenth. Then 6 + 1 + 1 = 8 tenths: 7.81. | claude-opus-5-5 |
| 7.3-add-subtract-decimals | 2 | 1 | Lines up 4.2 and 3.65 by the right edge, getting 4.07. / Line up the points and add a zero: 4.20 + 3.65 = 7.85. | claude-opus-5-5 |
| 7.3-add-subtract-decimals | 3 | 1 | Does 12 − 3.457 by taking the smaller digit from the larger in each column: 11.457. / Write 12.000 − 3.457 and regroup across the zeros: 8.543. | claude-opus-5-5 |
| 7.3-powers-of-ten | 1 | 1 | Does 3.47 × 100 by adding zeros to get 3.4700. / Multiplying by 100 moves the point 2 places right: 3.47 becomes 347. | claude-opus-5-5 |
| 7.3-powers-of-ten | 2 | 1 | Moves the point 1 place for 56.2 ÷ 100, getting 5.62. / Dividing by 100 moves the point 2 places left: 56.2 becomes 0.562. | claude-opus-5-5 |
| 7.3-powers-of-ten | 3 | 1 | DROPPED: Source is inconsistent. The step limits decimals to thousandths, but the example uses 0.0356, which goes to ten-thousandths. The maths is right (0.0356 × 1,000 = 35.6, and × 100 gives only 3.56). But the example is outside the stated range, so I did not write a pair. | none |
| 7.3-multiply-decimals | 1 | 1 | Gets 0.3 × 0.7 = 2.1 by ignoring the decimal places in the factors. / 3 × 7 = 21. Each factor has 1 place, so the answer has 2: 0.21. | claude-opus-5-5 |
| 7.3-multiply-decimals | 2 | 1 | Counts only 0.35's 2 places for 0.35 × 0.6, getting 2.1. / 35 × 6 = 210. Count 2 + 1 = 3 places: 0.210 = 0.21. | claude-opus-5-5 |
| 7.3-multiply-decimals | 3 | 1 | DROPPED: wrong needs commas for thousands; pair exceeds 150 characters | none |
| 7.3-divide-decimals | 1 | 1 | Changes only 0.6 to 6, then does 4.8 ÷ 6 = 0.8. / Multiply both numbers by 10: 4.8 ÷ 0.6 = 48 ÷ 6 = 8. | claude-opus-5-5 |
| 7.3-divide-decimals | 2 | 1 | Changes only 0.12 to 12, then does 3.6 ÷ 12 = 0.3. / Multiply both numbers by 100: 3.6 ÷ 0.12 = 360 ÷ 12 = 30. | claude-opus-5-5 |
| 7.3-divide-decimals | 3 | 1 | Changes only 0.4 to 4, then does 5.04 ÷ 4 = 1.26. / Multiply both numbers by 10: 5.04 ÷ 0.4 = 50.4 ÷ 4 = 12.6. | claude-opus-5-5 |
| 7.3-estimate-product | 1 | 1 | Says 0.5 × 18 is more than 18, thinking multiplying always makes a number bigger. / 0.5 × 18 is half of 18, so 9. Times less than 1 gives less. | claude-opus-5-5 |
| 7.3-estimate-product | 2 | 1 | Says 1.04 × 46 is less than 46 just because 1.04 has a decimal point. / 1.04 is more than 1, so 1.04 × 46 is more than 46 (it is 47.84). | claude-opus-5-5 |
| 7.3-estimate-product | 3 | 1 | Picks 300 for 0.48 × 61, as if 0.48 were about 5 instead of about 0.5. / 0.48 is about 0.5, and half of 61 is about 30, so 30 is sensible. | claude-opus-5-5 |
| 7.3-estimate-quotient | 1 | 1 | Says 12 ÷ 0.5 is less than 12, as if dividing always makes a number smaller. / Count halves in 12: each 1 has 2 halves, so 12 ÷ 0.5 = 24, more than 12. | claude-opus-5-5 |
| 7.3-estimate-quotient | 2 | 1 | Works out 20 ÷ 4 = 5 instead of dividing 20 by 0.25. / 0.25 is one quarter, and 20 has 4 quarters in each 1, so 20 ÷ 0.25 = 80. | claude-opus-5-5 |
| 7.3-estimate-quotient | 3 | 1 | Treats 59 ÷ 0.48 like 59 ÷ 5 and picks 12. / 0.48 is about 0.5, and 59 ÷ 0.5 = 59 × 2, about 120. | claude-opus-5-5 |
| 7.3-decimal-order-of-operations | 1 | 1 | Adds first: 2.5 + 3 = 5.5, then 5.5 × 0.4 = 2.2. / Multiply first: 3 × 0.4 = 1.2, then add: 2.5 + 1.2 = 3.7. | claude-opus-5-5 |
| 7.3-decimal-order-of-operations | 2 | 1 | Ignores the brackets and divides first: 1.2 ÷ 0.6 = 2, then 4.8 - 2 = 2.8. / Brackets first: 4.8 - 1.2 = 3.6, then 3.6 ÷ 0.6 = 6. | claude-opus-5-5 |
| 7.3-decimal-order-of-operations | 3 | 1 | Subtracts first: 12 - 0.5 = 11.5, then 11.5 × 8 ÷ 2 = 46. / Bracket is 8. Do 0.5 × 8 ÷ 2 = 2 first, then 12 - 2 = 10. | claude-opus-5-5 |
| 7.3-decimal-word-problems | 1 | 1 | Adds 2.45 + 3 + 1.30 = 6.75 instead of multiplying 2.45 by 3. / Notebooks: 3 × 2.45 = 7.35. Then add the pen: 7.35 + 1.30 = 8.65. | claude-opus-5-5 |
| 7.3-decimal-word-problems | 2 | 1 | Gives 7.35, the cost of 3 notebooks, as the change. / Change is money paid minus cost: 10 - 7.35 = 2.65. | claude-opus-5-5 |
| 7.3-decimal-word-problems | 3 | 1 | Divides the quantity by the price: 4 ÷ 5.80 = 0.69. / Price for 1 L: divide the cost by the litres, 5.80 ÷ 4 = 1.45. | claude-opus-5-5 |
| 7.9-origin-axes | 1 | 1 | Writes the up amount first: 4 across and 2 up becomes (2, 4). / Across comes first, then up: 4 across, 2 up is (4, 2). | claude-opus-5-5 |
| 7.9-origin-axes | 2 | 1 | Writes (0, 6) for a point on the x-axis, putting 6 in the y spot. / On the x-axis the point is 6 across and 0 up, so it is (6, 0). | claude-opus-5-5 |
| 7.9-quadrants | 1 | 1 | Matches signs to the wrong coordinates, so (3, -5) looks like (-, +), Quadrant II. / x = 3 is positive and y = -5 is negative. (+, -) is Quadrant IV. | claude-opus-5-5 |
| 7.9-quadrants | 2 | 1 | Calls (-4, 0) Quadrant II, ignoring that y is 0. / A zero coordinate means on an axis. y = 0 puts (-4, 0) on the x-axis. | claude-opus-5-5 |
| 7.9-quadrants | 3 | 1 | Quadrant III has x negative and y positive. / Quadrant III has x and y both negative. x negative with y positive is Quadrant II. | claude-opus-5-5 |
| 7.9-plot-integer-points | 1 | 1 | 3 left and 4 up gives (3, -4). / Left makes x negative and up makes y positive, so 3 left and 4 up is (-3, 4). | claude-opus-5-5 |
| 7.9-plot-integer-points | 2 | 1 | Gives (-2, -3), the mark counts, ignoring the scale. / Each mark is worth 5, so multiply: 2×5=10 and 3×5=15, giving (-10, -15). | claude-opus-5-5 |
| 7.9-shape-vertices | 1 | 1 | Writing the fourth corner as (-1, -2) puts y first, then x. / Write x first: x is -2 and y is -1, so the fourth corner is (-2, -1). | claude-opus-5-5 |
| 7.9-shape-vertices | 3 | 1 | The legs are 4 and 5, so the triangle's area is 4 × 5 = 20. / 4 × 5 = 20 is a rectangle's area. A triangle is half of that, so the area is 10. | claude-opus-5-5 |
| 7.7-radius-diameter | 1 | 1 | Halving the radius 7 cm gives a diameter of 3.5 cm. / Diameter is twice the radius, so 7 × 2 = 14 cm. | claude-opus-5-5 |
| 7.7-radius-diameter | 2 | 1 | Doubling the diameter 9.6 cm gives a radius of 19.2 cm. / Radius is half the diameter, so 9.6 ÷ 2 = 4.8 cm. | claude-opus-5-5 |
| 7.7-radius-diameter | 3 | 1 | A compass opening of 4 cm is the diameter, so 4 cm. / The opening is the radius, so the diameter is twice it: 2 × 4 = 8 cm. | claude-opus-5-5 |
| 7.7-circumference | 1 | 1 | With diameter 10, C = 2 × 3.14 × 10 = 62.8 cm. / With the diameter, just multiply: C = 3.14 × 10 = 31.4 cm. No extra 2. | claude-opus-5-5 |
| 7.7-circumference | 2 | 1 | Using 3.14 × 6 = 18.84 treats the radius 6 as the diameter. / Double the radius first: d = 12. Then C = 3.14 × 12 = 37.68 cm. | claude-opus-5-5 |
| 7.7-circumference | 3 | 1 | 3.14 × 4.5 = 1.413 puts the decimal point in the wrong place. / Check: 3 × 4.5 is about 13.5, so 3.14 × 4.5 = 14.13, not 1.413. | claude-opus-5-5 |
| 7.7-diameter-from-circumference | 1 | 1 | Multiplying 62.8 × 3.14 gives d = 197.192. / C = 3.14 × d, so divide to find d: 62.8 ÷ 3.14 = 20 cm. | claude-opus-5-5 |
| 7.7-diameter-from-circumference | 2 | 1 | 47.1 ÷ 3.14 = 15, so the radius is 15 cm. / 47.1 ÷ 3.14 = 15 is the diameter. Halve it for the radius: 7.5 cm. | claude-opus-5-5 |
| 7.7-diameter-from-circumference | 3 | 1 | Halving the distance around, 157 ÷ 2, gives a width of 78.5 cm. / Distance around is C. Width is d = C ÷ 3.14 = 157 ÷ 3.14 = 50 cm. | claude-opus-5-5 |
| 7.7-area | 1 | 1 | Finding 3.14 × 5 × 2 = 31.4 for the area. / Multiply by the radius again, not 2: 3.14 × 5 × 5 = 78.5 cm². | claude-opus-5-5 |
| 7.7-area | 2 | 1 | Using 12 as the radius gives 3.14 × 12 × 12 = 452.16. / Halve the diameter first: r = 6. Then 3.14 × 6 × 6 = 113.04 cm². | claude-opus-5-5 |
| 7.7-area | 3 | 1 | Finding 3.14 × 2.5 × 2 = 15.7 for the area. / Use the radius twice: 3.14 × 2.5 × 2.5 = 19.625, which rounds to 19.6 cm². | claude-opus-5-5 |
| 7.7-circle-problems | 1 | 1 | Choosing rim length to cover the top of a drum skin. / Covering the top needs the space inside, so use area, not the distance around. | claude-opus-5-5 |
| 7.7-circle-problems | 2 | 1 | 3.14 × 40 = 125.6 finds the distance around, not the area. / Area needs the radius: r = 20, so 3.14 × 20 × 20 = 1,256 cm². | claude-opus-5-5 |
| 7.7-circle-problems | 3 | 1 | 3.14 × 0.5 = 1.57 m is the distance for all 10 turns. / 1.57 m is only one turn. For 10 turns, 10 × 1.57 = 15.7 m. | claude-opus-5-5 |
| 7.11-read-circle-graph | 1 | 1 | Writes a quarter, 1/4, as 14%. / A quarter is 1 out of 4 equal parts: 1 ÷ 4 = 0.25, which is 25%. | claude-opus-5-5 |
| 7.11-read-circle-graph | 2 | 1 | Says 35 students walk because the section is 35%. / 35% means 35 out of every 100, so take 35% of 80: 0.35 × 80 = 28. | claude-opus-5-5 |
| 7.11-read-circle-graph | 3 | 1 | Says 18 students out of 120 is 18%. / Divide the count by the total: 18 ÷ 120 = 0.15, which is 15%. | claude-opus-5-5 |
| 7.11-make-circle-graph | 1 | 1 | Says 8 of 20 students is 8%. / Divide 8 by the total 20 to get 0.4, then write it as 40%. | claude-opus-5-5 |
| 7.11-make-circle-graph | 2 | 1 | Says a 25% section is 25 degrees. / The whole circle is 360 degrees, so take 25% of 360: 0.25 × 360 = 90 degrees. | claude-opus-5-5 |
| 7.11-make-circle-graph | 3 | 1 | Writes counts 12, 8, 6, 14 as 12%, 8%, 6%, 14%. / Divide each by the total 40: 12÷40 = 30%, 8÷40 = 20%, 6÷40 = 15%, 14÷40 = 35%. | claude-opus-5-5 |
| 7.12-two-events-outcomes | 1 | 1 | Counts HT and TH as one outcome, listing only 3. / Order matters: heads then tails (HT) differs from tails then heads (TH), so there are 4 outcomes. | claude-opus-5-5 |
| 7.12-two-events-outcomes | 2 | 1 | Adds 3 + 6 to get 9 outcomes. / Each of the 3 spinner results pairs with all 6 die faces, so multiply: 3 × 6 = 18. | claude-opus-5-5 |
| 7.12-experimental-two-events | 1 | 1 | Uses 1/4, the expected chance, as the experimental probability. / Use the trial results: 9 two-heads out of 40 trials is 9/40 = 0.225. | claude-opus-5-5 |
| 7.12-experimental-two-events | 2 | 1 | Says about 9 two-heads in 200 trials, copying the 40-trial count. / 200 is 5 times 40, so multiply 9 by 5 to get about 45. | claude-opus-5-5 |
| 7.12-experimental-two-events | 3 | 1 | Says 14/60 is wrong because it is not exactly 1/6. / Trial results vary. 14/60 ≈ 0.233 is a bit higher than 1/6 ≈ 0.167, but that is normal, not wrong. | claude-opus-5-5 |
| 7.6-model-equality | 1 | 1 | Takes 3 off only the 11 side to get 8, then says one bag weighs 8. / Take 3 off both sides so 2 bags = 8. Then share 8 between the 2 bags: 4 each. | claude-opus-5-5 |
| 7.6-model-equality | 2 | 1 | Says x = 12 after removing the 4 unit tiles. / 12 is the total for 3 x tiles, so split it equally: 12 ÷ 3 = 4, and x = 4. | claude-opus-5-5 |
| 7.6-model-equality | 3 | 1 | Subtracts 4 from the left side only. / Do the same to both sides: subtract 4 from each to get 3x = 12, and the sides stay equal. | claude-opus-5-5 |
| 7.6-solve-two-step | 1 | 1 | Subtracts 4 to get 12 and says x = 12. / 12 is 3x, not x. Divide by 3 as well: 12 ÷ 3 = 4, so x = 4. | claude-opus-5-5 |
| 7.6-solve-two-step | 2 | 1 | Subtracts 5 from both sides: 19 - 5 = 14, then 14 ÷ 4 = 3.5. / To undo - 5, add 5: 19 + 5 = 24. Then divide: 24 ÷ 4 = 6. | claude-opus-5-5 |
| 7.6-solve-two-step | 3 | 1 | Divides 52 by 7 first and gets 7.43. / First undo the + 3: 52 - 3 = 49. Then divide by 7: 49 ÷ 7 = 7. | claude-opus-5-5 |
| 7.6-verify | 1 | 1 | Works out 3 + 4 = 7 instead of 3 × 4 + 4. / 3x means 3 times x. Put in 4: 3 × 4 + 4 = 12 + 4 = 16, which matches, so yes. | claude-opus-5-5 |
| 7.6-verify | 3 | 1 | DROPPED: Source is inconsistent. Undoing 5x - 3 = 22 by subtracting 3 gives 5x = 19, so x = 3.8, not 4. In this example x = 4 is only the value being checked (5 × 4 - 3 = 17, not 22), so the stated why can't produce it. The correct answer is x = 5. | none |
| 7.6-division-form | 1 | 1 | Subtracts 3 to get 4 and says x = 4. / 4 is x ÷ 4, so undo the division too: multiply 4 × 4 = 16, and x = 16. | claude-opus-5-5 |
| 7.6-division-form | 2 | 1 | Subtract 2 from 6 to get x ÷ 5 = 4, so x = 20. / Undo - 2 by adding 2: x ÷ 5 = 8, then multiply by 5 to get x = 40. | claude-opus-5-5 |
| 7.6-division-form | 3 | 1 | Subtract 12 to get 8 and say x = 8. / 8 is x ÷ 8, so multiply back by 8: x = 8 × 8 = 64. | claude-opus-5-5 |
| 7.6-model-problem | 1 | 1 | 17 - 3 = 14, so k = 14. / 14 is 2k, so divide by 2 to get k = 7. | claude-opus-5-5 |
| 7.6-model-problem | 2 | 1 | Subtract 6 from 81 to get w = 75. / Subtract the start 15: 6w = 66, then divide by 6 to get w = 11. | claude-opus-5-5 |
| 7.6-model-problem | 3 | 1 | x ÷ 4 = 12, so x = 12. / 12 is x ÷ 4, so multiply by 4: x = 12 × 4 = 48. | claude-opus-5-5 |
| 7.5-evaluate-relation | 1 | 1 | DROPPED: Source is inconsistent. Putting 3 and 5 side by side gives 3n = 35, so 3n + 2 would come out as 37, not the stated wrong answer 35. The 35 only fits if the +2 is also dropped, and the 'why' doesn't say that. A pair about 3n = 35 would not match the stated wrong answer. | none |
| 7.5-evaluate-relation | 2 | 1 | Treat n = -4 as 4: 3 × 4 + 2 = 14. / Keep the sign: 3 × (-4) = -12, then -12 + 2 = -10. | claude-opus-5-5 |
| 7.5-evaluate-relation | 3 | 1 | Do 5 - 2 = 3 first, then 3 × (-3) = -9. / Multiply first: 2 × (-3) = -6, then 5 - (-6) = 11. | claude-opus-5-5 |
| 7.5-table-of-values | 1 | 1 | Add 1 each time: 2, 3, 4, 5. / The 3 in 3n means add 3 each time: 2, 5, 8, 11. | claude-opus-5-5 |
| 7.5-table-of-values | 2 | 1 | Write 3 × (-2) + 2 as 4, dropping the minus sign. / 3 × (-2) = -6, and -6 + 2 = -4. Keep the negative. | claude-opus-5-5 |
| 7.5-table-of-values | 3 | 1 | Add 2 to -7 to get -5 and stop. / Subtract 2: -7 - 2 = -9, then divide by 3 to get n = -3. | claude-opus-5-5 |
| 7.5-table-to-relation | 1 | 1 | The step is 3, so the relation is 3n. / The output at n = 0 is 2, so that is the start: 3n + 2. | claude-opus-5-5 |
| 7.5-table-to-relation | 2 | 1 | Use the first output 7 as the start: 3n + 7. / 7 is the output at n = 1: 3 × 1 + start = 7, so start = 4. Use 3n + 4. | claude-opus-5-5 |
| 7.5-relation-in-context | 1 | 1 | Write 3 + r + 2, adding r. / Each ride costs 3, so r rides cost 3 × r. Add the 2 fee: 3r + 2. | claude-opus-5-5 |
| 7.5-relation-in-context | 3 | 1 | The cost is 9 × 6 = 54 dollars. / Add the 15 joining fee too: 9 × 6 + 15 = 69 dollars. | claude-opus-5-5 |
| 7.5-plot-relation | 1 | 1 | Write the output first: (2, 0), (5, 1), (8, 2). / Write n first, then the output: (0, 2), (1, 5), (2, 8). | claude-opus-5-5 |
| 7.5-plot-relation | 2 | 1 | Write the outputs as 5, 3, 1 with no minus signs. / Keep signs: 2 × (-2) - 1 = -5, so the pair is (-2, -5). | claude-opus-5-5 |
| 7.5-graph-relation | 2 | 1 | Treat 2 × (-1) as 2, so the output is -1 and the answer is no. / 2 × (-1) = -2, and -2 - 3 = -5. That matches, so yes. | claude-opus-5-5 |
| 7.5-graph-relation | 3 | 1 | 4 × (-3) + 1 = 11, dropping the negative. / 4 × (-3) = -12, then -12 + 1 = -11. | claude-opus-5-5 |
| 7.5-relation-from-graph | 1 | 1 | The rise is 2, so the relation is 2n. / The point (0, 1) gives the start 1. Add it: 2n + 1. | claude-opus-5-5 |
| 7.5-relation-from-graph | 2 | 1 | Uses the first output 4 as the constant: 3n + 4. / Work back one step to n = 0: 4 − 3 = 1, so the relation is 3n + 1. | claude-opus-5-5 |
| 7.8-prism-volume | 1 | 1 | Adds 24 + 7 = 31 for the volume. / Volume is base area times height: 24 × 7 = 168 cm³. | claude-opus-5-5 |
| 7.8-prism-volume | 2 | 1 | Adds the edges: 2.5 + 4 + 3 = 9.5. / Multiply the edges: 2.5 × 4 = 10, then 10 × 3 = 30 cm³. | claude-opus-5-5 |
| 7.8-cylinder-volume | 1 | 1 | Adds the area and height: 50 + 8 = 58. / Multiply base area by height: 50 × 8 = 400 cm³. | claude-opus-5-5 |
| 7.8-cylinder-volume | 2 | 1 | Multiplies 3.14 × 3 × 10 = 94.2 without squaring the radius. / Base area is 3.14 × 3 × 3 = 28.26, then × 10 = 282.6 cm³. | claude-opus-5-5 |
| 7.8-cylinder-volume | 3 | 1 | Uses the diameter 10 as the radius, giving 2,198. / Halve it first: r = 5. Then 3.14 × 5 × 5 × 7 = 549.5 cm³. | claude-opus-5-5 |
| 7.8-volume-problems | 1 | 1 | Subtracts the base area: 240 − 30 = 210. / Base area is 6 × 5 = 30. Divide the volume: 240 ÷ 30 = 8 cm. | claude-opus-5-5 |
| 7.8-volume-problems | 2 | 1 | Writes 3,000 cm³ as 3 mL. / 1 cm³ = 1 mL, so it is 3,000 mL. Then 3,000 ÷ 1,000 = 3 L. | claude-opus-5-5 |
| 7.8-volume-problems | 3 | 1 | DROPPED: Volume is 3.14 × 5² × 20 = 1,570 cm³ = 1,570 mL. The wrong answer 1.57 L is the same amount in litres, so it is not a different value. The stated why (unit not changed, different number) contradicts the answer, which did change the unit. No sound pair can be written. | none |
| 7.10-transform-four-quadrants | 1 | 1 | Moves left 5 and up 4, giving (-8, 6). / Right adds to x: -3 + 5 = 2. Down subtracts from y: 2 − 4 = -2. | claude-opus-5-5 |
| 7.10-transform-four-quadrants | 2 | 1 | Changes x to -4 even though the mirror is the x-axis. / A reflection in the x-axis keeps x and flips y: (4, -3) becomes (4, 3). | claude-opus-5-5 |
| 7.10-transform-four-quadrants | 3 | 1 | Turns 90° anticlockwise, giving (-5, 2). / Clockwise 90° sends (x, y) to (y, -x), so (2, 5) goes to (5, -2). | claude-opus-5-5 |
| 7.10-combine | 1 | 1 | Only slides right 3 and stops at (4, 2). / Then slide down 5 too: 2 − 5 = -3, so it lands at (4, -3). | claude-opus-5-5 |
| 7.10-combine | 2 | 1 | Also flips y after the slide, giving (-3, -6). / Reflect in the y-axis only: (-3, 2). Then up 4 makes y = 6: (-3, 6). | claude-opus-5-5 |
| 7.10-describe | 1 | 1 | Says up 3 although y goes from 2 down to -1. / x goes 1 to 4, so right 3. y goes 2 to -1, a drop of 3, so down 3. | claude-opus-5-5 |
| 7.10-describe | 2 | 1 | Calls it a reflection in the y-axis. / x stays 3 and only y changes sign, so the mirror is the x-axis. | claude-opus-5-5 |
| 7.13-sales-tax-tip | 1 | 1 | Adds 5 to the price: 40 + 5 = 45. / Take 5% of 40: 10% is 4, so 5% is half of that, $2.00. | claude-opus-5-5 |
| 7.13-sales-tax-tip | 2 | 1 | Gives only the tax, $7.20. / 12% of 60 is 7.20. Add it to the price: 60 + 7.20 = $67.20. | claude-opus-5-5 |
| 7.13-sales-tax-tip | 3 | 1 | Adds 18 dollars to the bill: 32 + 18 = 50. / Tip is 18% of 32 = 0.18 × 32 = $5.76. Total: 32 + 5.76 = $37.76. | claude-opus-5-5 |
| 7.13-sale-price | 1 | 1 | Stops at the discount of $10.00. / 25% of 40 is 10. Subtract it from the price: 40 − 10 = $30.00. | claude-opus-5-5 |
| 7.13-sale-price | 2 | 1 | Gives $9.60, the 15% discount, as the sale price. / Take the discount off the price: $64 − $9.60 = $54.40. | claude-opus-5-5 |
| 7.13-total-cost | 1 | 1 | Stops at $60.00, the sale price, and adds no tax. / Add 5% tax on $60, which is $3.00: $60 + $3 = $63.00. | claude-opus-5-5 |
| 7.13-total-cost | 3 | 1 | Adds 12% tax to $60 and gets $67.20, skipping the 25% discount. / Take 25% off $60 first, giving $45, then add 12% tax: $50.40. | claude-opus-5-5 |
| 8.1-squares-cubes | 1 | 1 | Doubles the side: 6 × 2 = 12. / A square has 6 rows of 6, so multiply the side by itself: 6 × 6 = 36. | claude-opus-5-5 |
| 8.1-squares-cubes | 2 | 1 | Counts only one layer: 3 × 3 = 9 blocks. / A cube has 3 layers of 9, so 3 × 3 × 3 = 27 blocks. | claude-opus-5-5 |
| 8.1-squares-cubes | 3 | 1 | Works out 12² as 12 × 2 = 24. / The exponent 2 means use 12 twice as a factor: 12 × 12 = 144. | claude-opus-5-5 |
| 8.1-identify-perfect | 1 | 1 | Says 50 is a perfect square because it is next to 49. / A perfect square is a whole number times itself. 7 × 7 = 49 and 8 × 8 = 64, so 50 is not. | claude-opus-5-5 |
| 8.1-identify-perfect | 3 | 1 | Says 130 is a perfect cube because it is near 125. / It must match exactly. 5 × 5 × 5 = 125 and 6 × 6 × 6 = 216, so 130 is not a cube. | claude-opus-5-5 |
| 8.1-prime-factorization | 1 | 1 | Writes 30 as 5 × 6 and stops, though 6 is not prime. / Split 6 into 2 × 3, so every factor is prime: 2 × 3 × 5. | claude-opus-5-5 |
| 8.1-prime-factorization | 2 | 1 | Writing 72 as 2 × 3 × 3, keeping one 2 from 8 and losing the rest. / Split 72 = 8 × 9 fully: 8 = 2×2×2, 9 = 3×3, so 2³ × 3². | claude-opus-5-5 |
| 8.1-prime-factorization | 3 | 1 | Calls 91 prime because 2, 3 and 5 do not divide it. / Keep testing primes. 7 × 13 = 91, so 91 is not prime. | claude-opus-5-5 |
| 8.1-perfect-by-factors | 1 | 1 | Says 20 = 2 × 2 × 5 is a perfect square because 2 × 2 is a pair. / Every prime needs a pair. The 5 has no partner, so 20 is not a perfect square. | claude-opus-5-5 |
| 8.1-perfect-by-factors | 2 | 1 | Says 72 is a perfect cube because it has one triple of 2s. / Every prime needs a triple. There are only two 3s, so 72 is not a perfect cube. | claude-opus-5-5 |
| 8.1-perfect-by-factors | 3 | 1 | Says 400 is not a perfect square because 2⁴ has too many 2s. / An even exponent is fine: 2⁴ = (2²)² and 5² = 5², so 400 = 20 × 20. | claude-opus-5-5 |
| 8.7-parts | 1 | 1 | Calls 3 the constant in 3n + 7 because it is a number. / 3 multiplies n, so it is the coefficient. The constant is 7, which has no letter. | claude-opus-5-5 |
| 8.7-parts | 2 | 1 | DROPPED: Source inconsistent: in 6m - 4 the 6 is written directly beside m, so the stated why (sees no number beside the letter) doesn't fit, and 0 doesn't follow from this example. The correct coefficient is 6. A sound pair can't be written without changing the example. | none |
| 8.7-parts | 3 | 1 | Calls 4a and 4b like terms because both have the number 4. / Like terms need the same letter part. 4a and 4b differ, but 5x and 2x match. | claude-opus-5-5 |
| 8.7-write-expression | 1 | 1 | Writes 5n, multiplying n by 5. / 5 more are added to n pencils, so add: n + 5. | claude-opus-5-5 |
| 8.7-write-expression | 2 | 1 | Writes 3(h + 25), which multiplies the 25 by 3 too. / Only h is tripled, then 25 is added: 3h + 25. | claude-opus-5-5 |
| 8.7-write-expression | 3 | 1 | Writes 5t + 8, adding the $8 only once. / Each of the 5 pays t + 8, so multiply both: 5(t + 8) = 5t + 40. | claude-opus-5-5 |
| 8.7-evaluate | 1 | 1 | Works out 2 × (-3) as 6, so 6 - 7 = -1. / 2 × (-3) = -6, since positive times negative is negative. Then -6 - 7 = -13. | claude-opus-5-5 |
| 8.7-evaluate | 2 | 1 | Reads 0.25n and 2n as 0.25 + 8 and 2 + 8, getting 7.25. / 0.25n is 0.25 × 8 = 2 and 2n is 2 × 8 = 16. So 2 - 16 + 9 = -5. | claude-opus-5-5 |
| 8.7-combine-terms | 1 | 1 | Adds the 2 in with the x terms to get 10x. / Only the x terms combine: 5x + 3x = 8x. The 2 has no x, so it stays: 8x + 2. | claude-opus-5-5 |
| 8.7-combine-terms | 2 | 1 | Drops the minus on the x terms: 2x - 5x is written as 3x, giving 3x - 6. / 2x - 5x = -3x, since 5 is more than 2. Then -7 + 1 = -6, so -3x - 6. | claude-opus-5-5 |
| 8.7-combine-terms | 3 | 1 | Treats 3n as just 3: 8 × 4 - 3 + 6 = 35. / First 8n - 3n = 5n, so the expression is 5n + 6. Then 5 × 4 + 6 = 26. | claude-opus-5-5 |
| 8.7-substitute-formula | 1 | 1 | Adds l + w = 13 and stops. / P = 2l + 2w needs doubling: 2 × 9 + 2 × 4 = 18 + 8 = 26. | claude-opus-5-5 |
| 8.7-substitute-formula | 2 | 1 | Multiplies 10 × 7 = 70 and stops. / The formula has ÷ 2, so halve the product: 70 ÷ 2 = 35. | claude-opus-5-5 |
| 8.7-substitute-formula | 3 | 1 | Drops the negative of C and uses 10: 9 × 10 ÷ 5 + 32 = 50. / Keep C = -10: 9 × (-10) ÷ 5 = -18. Then -18 + 32 = 14. | claude-opus-5-5 |
| 8.8-one-step-integers | 1 | 1 | Adds -7 to -3 and gets x = -10. / x - 7 takes away 7, so add 7 to both sides: x = -3 + 7 = 4. | claude-opus-5-5 |
| 8.8-one-step-integers | 2 | 1 | Ignores the negative and divides 20 by 4 to get x = 5. / Divide both sides by -4: 20 ÷ (-4) = -5, since positive ÷ negative is negative. | claude-opus-5-5 |
| 8.8-model-balance | 1 | 1 | Takes 3 from the left side only, so the sides no longer match. / Take 3 from both sides: 2x = 11 - 3 = 8. Then split into 2 equal groups: x = 4. | claude-opus-5-5 |
| 8.8-model-balance | 2 | 1 | Stops at 3x = 12 and says x = 12. / 3x means 3 equal groups of x. Split 12 into 3 groups: 12 ÷ 3 = 4, so x = 4. | claude-opus-5-5 |
| 8.8-solve-two-step-integers | 1 | 1 | Gets -2x = 8, then divides to get x = 4. / Divide 8 by -2, not 2. Positive ÷ negative is negative, so x = -4. | claude-opus-5-5 |
| 8.8-solve-two-step-integers | 2 | 1 | Subtracts 5 to get x/3 = -6 and stops, saying x = -6. / x/3 = -6 means x is divided by 3. Multiply by 3: -6 × 3 = -18. | claude-opus-5-5 |
| 8.8-solve-two-step-integers | 3 | 1 | Divides 15 by 4 first, then adds 5, getting about 8.75. / Undo the -5 first: 15 + 5 = 20. Then divide by 4: x = 5. | claude-opus-5-5 |
| 8.8-verify | 1 | 1 | Works out the left side, 5, and says yes without comparing. / Compare both sides: left is 5, right is 8. They differ, so x = 3 is not a solution. | claude-opus-5-5 |
| 8.8-verify | 2 | 1 | Gets x = 5, but 2 × 5 + 6 = 16, not -4. / 2x = -10, so x = -5. Check: 2 × (-5) + 6 = -4, which matches. | claude-opus-5-5 |
| 8.8-verify | 3 | 1 | DROPPED: pair exceeds 150 characters | none |
| 8.8-word-problems | 1 | 1 | Ignores the $15 fee and divides 63 ÷ 8, about 7.9. / Take off the fee first: 63 - 15 = 48. Then 48 ÷ 8 = 6 months. | claude-opus-5-5 |
| 8.8-word-problems | 2 | 1 | Gets m = -6, a negative number of minutes. / -3m = -18. Divide -18 by -3: two negatives give a positive, so m = 6 minutes. | claude-opus-5-5 |
| 8.8-word-problems | 3 | 1 | b/5 + 3 = 14 gives b/5 = 11, so b = 11. / b/5 = 11 means b is split by 5. Multiply 11 by 5 to get b = 55. | claude-opus-5-5 |
| 8.4-rates | 1 | 1 | "5 apples for $3" is a ratio. / Apples and dollars are different units, so it is a rate. A ratio compares the same units. | claude-opus-5-5 |
| 8.4-rates | 2 | 1 | 120 km in 2 h: 2 ÷ 120 = 0.017 km/h. / Unit rate is km for 1 h, so divide km by hours: 120 ÷ 2 = 60 km/h. | claude-opus-5-5 |
| 8.4-rates | 3 | 1 | B is faster because 270 is more than 240. / Times differ, so compare per hour: A is 240 ÷ 3 = 80 km/h, B is 270 ÷ 4 = 67.5 km/h. A is faster. | claude-opus-5-5 |
| 8.4-three-term-ratio | 1 | 1 | DROPPED: pair exceeds 150 characters | none |
| 8.4-three-term-ratio | 2 | 1 | Divides 12:18:30 by 2 to get 6:9:15 and stops there. / 6, 9 and 15 still share the factor 3. Divide all three by 3 again to get 2:3:5. | claude-opus-5-5 |
| 8.4-three-term-ratio | 3 | 1 | Adds 3 to every term because 3 became 6, giving 5 L and 8 L. / Scale by multiplying. 3 to 6 is ×2, so 2×2 = 4 L and 5×2 = 10 L. | claude-opus-5-5 |
| 8.4-ratio-share | 1 | 1 | Splits $40 equally into $20 and $20. / Ratio 3:5 makes 8 parts. Each part is $40 ÷ 8 = $5, so $15 and $25. | claude-opus-5-5 |
| 8.4-ratio-share | 2 | 1 | Cuts 90 m into 30 m, 30 m and 30 m. / 3:5:10 makes 18 parts. Each part is 90 ÷ 18 = 5 m, so 15 m, 25 m and 50 m. | claude-opus-5-5 |
| 8.4-solve-proportion | 1 | 1 | Bottom goes 3 to 12 by adding 9, so 2 + 9 = 11. / 3 to 12 is times 4, so multiply the top too: 2 × 4 = 8. | claude-opus-5-5 |
| 8.4-solve-proportion | 2 | 1 | Bottom goes 5 to 40 by adding 35, so 3 + 35 = 38. / 5 to 40 is times 8, so multiply the top too: 3 × 8 = 24. | claude-opus-5-5 |
| 8.4-solve-proportion | 3 | 1 | Bottom goes 8 to 12 by adding 4, so 5 + 4 = 9. / 8 to 12 is times 1.5, so multiply the top too: 5 × 1.5 = 7.5. | claude-opus-5-5 |
| 8.4-proportion-problems | 1 | 1 | 12 to 20 muffins adds 8, so cups go 3 + 8 = 11. / Amounts scale by multiplying. 3 cups per 12 is 1 cup per 4 muffins, so 20 muffins need 5 cups. | claude-opus-5-5 |
| 8.4-proportion-problems | 2 | 1 | Divides 18 by 25 to get 0.72 m. / Real car is 25 times the model: 18 × 25 = 450 cm, which is 4.5 m. | claude-opus-5-5 |
| 8.4-proportion-problems | 3 | 1 | Finds 30% of 15 to get 4.5. / 15 is the part, not the whole. 15/x = 30/100 gives x = 15 ÷ 0.3 = 50. | claude-opus-5-5 |
| 8.11-views | 1 | 1 | Counts only the 4 squares in the top view. / Each number is a stack height. Add them: 2 + 1 + 3 + 1 = 7 cubes. | claude-opus-5-5 |
| 8.11-views | 2 | 1 | DROPPED: Inconsistent source. Looking from the front, each column's height is the front row value: 3 and 1 for the columns. Wait, correct answer given is 3 and 2, which takes the taller of each column. Reading the back row would give 1 and 2, not the stated wrong answer 1 and 3, so the stated wrong answer does not match the stated why. | none |
| 8.11-views | 3 | 1 | DROPPED: Inconsistent source. The problem gives no cube total to match. A has 7 cubes and B has 6, so 'same number of cubes' does not explain choosing B. A is correct because its front view is 3 and 2, while B's is 2 and 2. | none |
| 8.11-nets | 1 | 1 | Six squares means a square pyramid, because it has a square base. / A square pyramid has 1 square and 4 triangles. Six equal squares fold into a cube. | claude-opus-5-5 |
| 8.11-nets | 2 | 1 | DROPPED: Inconsistent source. The example net (row of 4 with one square above and one below the 2nd) does fold into a cube, so 'yes' is correct. The wrong answer describes a different net, six in a row, which does not fold, so it is not a wrong answer to this task. | none |
| 8.11-nets | 3 | 1 | A 4 by 3 by 2 box has only 3 rectangles: 4 by 3, 4 by 2 and 3 by 2. / Opposite faces match, so each size is needed twice: six rectangles in all. | claude-opus-5-5 |
| 8.2-square-root | 1 | 1 | Halve the area 49 to get a side of 24.5 cm. / Side × side = 49, so find the number that times itself makes 49: 7 × 7, so 7 cm. | claude-opus-5-5 |
| 8.2-square-root | 2 | 1 | √64 = 32, found by halving 64. / √64 asks which number times itself makes 64. 8 × 8 = 64, so √64 = 8. | claude-opus-5-5 |
| 8.2-square-root | 3 | 1 | DROPPED: Source is inconsistent: the wrong answer 16/13 keeps the top (16) and takes the root of the bottom only (√169 = 13), but the stated why says it takes the root of the top only. Root of the top only would give 4/169. | none |
| 8.2-cube-root | 1 | 1 | Divide the volume 27 by 3 to get an edge of 9 cm. / Edge × edge × edge = 27. 3 × 3 × 3 = 27, so each edge is 3 cm. | claude-opus-5-5 |
| 8.2-cube-root | 2 | 1 | ∛125 = 42, found by dividing 125 by 3 and rounding. / ∛125 is the number multiplied three times to make 125. 5 × 5 × 5 = 125, so 5. | claude-opus-5-5 |
| 8.2-cube-root | 3 | 1 | Stop at the edge and give 7 as the face area, 7 cm². / 7 cm is the edge. The face area is edge × edge = 7 × 7 = 49 cm². | claude-opus-5-5 |
| 8.2-estimate-root | 1 | 1 | √30 is between 15 and 16, found by halving 30. / Find squares around 30: 5² = 25 and 6² = 36, so √30 is between 5 and 6. | claude-opus-5-5 |
| 8.2-estimate-root | 2 | 1 | √30 is closer to 6 because 6 is the bigger number. / Halfway is 5.5 and 5.5² = 30.25 is over 30, so √30 is under 5.5: closer to 5. | claude-opus-5-5 |
| 8.2-estimate-root | 3 | 1 | √30 = 15, found by halving 30. / Square to check: 5.4² = 29.16 and 5.5² = 30.25. 30 is nearer 30.25, so 5.5. | claude-opus-5-5 |
| 8.10-model | 1 | 1 | Pick the first side listed, 3, as the hypotenuse. / The hypotenuse is the side across from the right angle, the longest side: 5. | claude-opus-5-5 |
| 8.10-model | 2 | 1 | Add the side lengths 3 + 4 = 7 for the hypotenuse square's area. / Add the areas of the leg squares: 9 + 16 = 25 is the hypotenuse square's area. | claude-opus-5-5 |
| 8.10-model | 3 | 1 | Add the squares 169 + 25 = 194 to get the other leg's square. / 169 is the hypotenuse square, the largest. Subtract: 169 − 25 = 144. | claude-opus-5-5 |
| 8.10-hypotenuse | 1 | 1 | 36 + 64 = 100, so the hypotenuse is 100. / 100 is the hypotenuse squared, so take the square root: √100 = 10. | claude-opus-5-5 |
| 8.10-hypotenuse | 2 | 1 | Add the legs 4 + 6 = 10 for the hypotenuse. / Add the squares: 16 + 36 = 52, then √52 ≈ 7.2. | claude-opus-5-5 |
| 8.10-hypotenuse | 3 | 1 | Add the legs 1.5 + 2 = 3.5 for the hypotenuse. / Square, add, then root: 2.25 + 4 = 6.25, and √6.25 = 2.5. | claude-opus-5-5 |
| 8.10-leg | 1 | 1 | Add 169 + 25 = 194 and take √194 ≈ 13.9 for the other leg. / The hypotenuse 13 is longest, so subtract: 169 − 25 = 144, √144 = 12. | claude-opus-5-5 |
| 8.10-leg | 2 | 1 | Subtract the lengths 9 − 5 = 4 for the other leg. / Subtract the squares: 81 − 25 = 56, then √56 ≈ 7.5. | claude-opus-5-5 |
| 8.10-leg | 3 | 1 | Subtracts the squares, 81 − 25 = 56, though the missing side is the hypotenuse. / Add the leg squares: 25 + 81 = 106, so √106 ≈ 10.3. | claude-opus-5-5 |
| 8.10-is-right-triangle | 1 | 1 | 6, 7, 10 is a right triangle because 6 + 7 is more than 10. / Test squares: 6² + 7² = 85, not 10² = 100, so it is not a right triangle. | claude-opus-5-5 |
| 8.10-is-right-triangle | 2 | 1 | Adds 13 + 5 = 18, compares with 12, and says it is not a right triangle. / Square the sides: 5² + 12² = 25 + 144 = 169 = 13², so it is a right triangle. | claude-opus-5-5 |
| 8.10-is-right-triangle | 3 | 1 | Says sides 1.5, 2, 2.5 are not a right triangle because decimals don't work. / Decimals work: 1.5²+2²=2.25+4=6.25=2.5², so yes, it is right-angled. | claude-opus-5-5 |
| 8.10-word-problems | 1 | 1 | Stops at 25 − 16 = 9 and says the foot is 9 m from the wall. / 9 is the distance squared, so take the square root: √9 = 3 m. | claude-opus-5-5 |
| 8.10-word-problems | 2 | 1 | Adds 2 + 5 and says the ramp is 7 m long. / Square, then add: 2² + 5² = 4 + 25 = 29. The length is √29 ≈ 5.4 m. | claude-opus-5-5 |
| 8.10-word-problems | 3 | 1 | DROPPED: The pair's numbers are right (diagonal √(60²+80²)=100 m, two sides 60+80=140 m, 140−100=40 m), and the wrong line matches the stated mistake. But the source contradicts itself: the step rule says 'Sides to 30', while the example uses 60 m and 80 m. Because of that, the example can't be confirmed to fit this step's number range, so it is rejected. | none |
| 8.5-add-subtract-fractions | 1 | 1 | 3/8 + 2/8 = 5/16, adding the denominators as well as the tops. / The parts are all eighths, so keep the 8 and add only the tops: 3 + 2 = 5, so 5/8. | claude-opus-5-5 |
| 8.5-add-subtract-fractions | 2 | 1 | 2 3/8 + 1 2/8 = 3 5/16, adding the denominators too. / Keep the 8. Add wholes 2 + 1 = 3 and tops 3 + 2 = 5, so 3 5/8. | claude-opus-5-5 |
| 8.5-add-subtract-fractions | 3 | 1 | Rounds both 7/8 and 4/9 to 1/2, so estimates the total as 1. / 7/8 is close to 1, and only 4/9 is close to 1/2. So 1 + 1/2 = 1 1/2. | claude-opus-5-5 |
| 8.5-add-subtract-unlike | 1 | 1 | 1/2 + 1/6 = 2/8, adding the tops and adding the bottoms. / Change 1/2 to 3/6 first, then add only the tops: 3/6 + 1/6 = 4/6 = 2/3. | claude-opus-5-5 |
| 8.5-add-subtract-unlike | 2 | 1 | 2/3 + 3/4 = 5/7, adding the tops and adding the bottoms. / Change both to twelfths: 8/12 + 9/12 = 17/12 = 1 5/12. | claude-opus-5-5 |
| 8.5-add-subtract-unlike | 3 | 1 | Adds 1/2 + 2/3 as 3/5, tops and bottoms, so gets 3 3/5. / Use sixths: 3/6 + 4/6 = 7/6 = 1 1/6, so 3 + 1 1/6 = 4 1/6. | claude-opus-5-5 |
| 8.5-subtract-regroup | 2 | 1 | After 4 = 3 5/5, answers 2 3/5 by keeping the 3/5 and ignoring the 5/5. / Subtract from the 5/5: 5/5 − 3/5 = 2/5. Wholes 3 − 1 = 2, so 2 2/5. | claude-opus-5-5 |
| 8.5-multiply-fractions | 1 | 1 | 3/4 × 12 = 36, multiplying 3 × 12 and forgetting the 4 on the bottom. / Divide by the 4 as well: 3 × 12 = 36, then 36 ÷ 4 = 9. | claude-opus-5-5 |
| 8.5-multiply-fractions | 2 | 1 | 2/3 × 3/4 = 5/7, adding the tops and adding the bottoms. / Multiply tops 2 × 3 = 6 and bottoms 3 × 4 = 12: 6/12 = 1/2. | claude-opus-5-5 |
| 8.5-multiply-fractions | 3 | 1 | Multiplies only 1/2 × 2/3 = 1/3 and keeps the 1, giving 1 1/3. / Change 1 1/2 to 3/2 first, then 3/2 × 2/3 = 6/6 = 1. | claude-opus-5-5 |
| 8.5-divide-fractions | 2 | 1 | Turns 3/4 ÷ 2/5 into 4/3 × 2/5 by flipping the first fraction. / Flip the second fraction: 3/4 × 5/2 = 15/8 = 1 7/8. | claude-opus-5-5 |
| 8.5-divide-fractions | 3 | 1 | Writes 2 1/2 ÷ 3/4 as 5/2 × 3/4 = 15/8, without flipping the divisor. / Flip the divisor 3/4 to 4/3: 5/2 × 4/3 = 20/6 = 3 1/3. | claude-opus-5-5 |
| 8.5-fraction-order-of-operations | 1 | 1 | Adds 1/2 + 1/3 first, then multiplies by 3/4, getting 5/8. / Multiply first: 1/3 × 3/4 = 1/4. Then add: 1/2 + 1/4 = 3/4. | claude-opus-5-5 |
| 8.5-fraction-order-of-operations | 2 | 1 | Ignores the brackets, so does 1/3 × 3/4 = 1/4 first, then 1/2 + 1/4 = 3/4. / Brackets first: 1/2 + 1/3 = 5/6. Then 5/6 × 3/4 = 5/8. | claude-opus-5-5 |
| 8.5-fraction-order-of-operations | 3 | 1 | Ignores the brackets: writes 2/3 × 4 − 2/3, multiplying 2/3 by the 4 alone. / Do the bracket first: 4 − 2/3 = 10/3. Then 2/3 × 10/3 = 20/9 = 2 2/9. | claude-opus-5-5 |
| 8.5-fraction-word-problems | 3 | 1 | Stopping at 6 1/2 − 2 3/4 = 3 3/4 m, before cutting the rest into pieces. / Then share the 3 3/4 m into 3 equal pieces: 3 3/4 ÷ 3 = 1 1/4 m. | claude-opus-5-5 |
| 8.3-convert-percents | 1 | 1 | DROPPED: Source is inconsistent. The why says the point moves one place, which gives 12.5 from 125. The wrong answer 0.125 needs a three-place move, so the stated move does not produce the stated wrong answer. | none |
| 8.3-convert-percents | 2 | 1 | Writing 0.5% as 0.5, leaving out the move of two places. / 0.5% means 0.5 ÷ 100, so move the point two places: 0.5% = 0.005. | claude-opus-5-5 |
| 8.3-convert-percents | 3 | 1 | Writing 1/2% as 0.5, which is one half, not one half of a percent. / Change 1/2 to 0.5, then divide by 100: 1/2% = 0.005. | claude-opus-5-5 |
| 8.3-percent-of-another | 1 | 1 | Working out 12 ÷ 15 = 0.8 = 80%, with the whole on top. / Divide the part by the whole: 15 ÷ 12 = 1.25 = 125%, over 100% since 15 is bigger. | claude-opus-5-5 |
| 8.3-percent-of-another | 2 | 1 | Saying 3 is 50% of 600, though 3 is tiny next to 600. / 3 ÷ 600 = 0.005, and 0.005 × 100 = 0.5%, which is less than 1%. | claude-opus-5-5 |
| 8.3-percent-over-100 | 1 | 1 | Using 150% as 0.15, so 0.15 × 40 = 6. / 150% = 150 ÷ 100 = 1.5, so 150% of 40 is 1.5 × 40 = 60. | claude-opus-5-5 |
| 8.3-percent-over-100 | 2 | 1 | Dividing 18 by 2.5 to get 7.2. / 250% of 18 means 2.5 × 18 = 45. It is more than double 18, so multiply. | claude-opus-5-5 |
| 8.3-percent-over-100 | 3 | 1 | Answering 240 cm, using the percent number as the length. / 240% = 2.4, so the new height is 2.4 × 80 = 192 cm. | claude-opus-5-5 |
| 8.3-percent-under-1 | 1 | 1 | Using 0.5% as 0.5, so 0.5 × 2,000 = 1,000. / 0.5% = 0.5 ÷ 100 = 0.005, so 0.005 × 2,000 = 10. | claude-opus-5-5 |
| 8.3-percent-under-1 | 2 | 1 | Using 0.2% as 0.2, so 0.2 × 3,000,000 = 600,000. / 0.2% = 0.2 ÷ 100 = 0.002, so 0.002 × 3,000,000 = 6,000. | claude-opus-5-5 |
| 8.3-percent-under-1 | 3 | 1 | Using 0.3 for 0.3%, so 0.3 × 8,000,000 = 2,400,000. / 0.3% = 0.3 ÷ 100 = 0.003, so 0.003 × 8,000,000 = 24,000 people. | claude-opus-5-5 |
| 8.3-decimal-percent-of | 1 | 1 | Using 3.25% as 3.25, so 3.25 × 800 = 2,600. / 3.25% = 3.25 ÷ 100 = 0.0325, so 0.0325 × 800 = 26. | claude-opus-5-5 |
| 8.3-decimal-percent-of | 2 | 1 | Giving 12.5, which is just 12 1/2 as a decimal, as the answer. / 12 1/2% = 0.125, so 12 1/2% of 64 is 0.125 × 64 = 8. | claude-opus-5-5 |
| 8.3-decimal-percent-of | 3 | 1 | Using 7.5% as 7.5, so 7.5 × $80 = $600. / 7.5% = 7.5 ÷ 100 = 0.075, so the tax is 0.075 × $80 = $6. | claude-opus-5-5 |
| 8.3-percent-change | 1 | 1 | Giving $12, the increase only, as the new price. / Add the increase to the old price: $80 + $12 = $92. | claude-opus-5-5 |
| 8.3-percent-change | 2 | 1 | DROPPED: wrong needs commas for thousands | none |
| 8.3-percent-change | 3 | 1 | Finding 125% of $40 = $50 and stopping there. / A rise of 125% is added to the old 100%: 225% of $40 = 2.25 × $40 = $90. | claude-opus-5-5 |
| 8.3-find-original | 1 | 1 | Taking 25% off $50 to get $37.50. / $50 is 125% of the old price, so divide: $50 ÷ 1.25 = $40. | claude-opus-5-5 |
| 8.3-find-original | 2 | 1 | DROPPED: Source is inconsistent. The why says it takes 22% off, which would give 44,400 − 9,768 = 34,632. The wrong answer $9,768 is 22% of $44,400, a different move. The correct answer $20,000 (44,400 ÷ 2.22) is fine. | none |
| 8.3-find-original | 3 | 1 | Adds 2.5% of 39,000 to 39,000 to get 39,975. / 39,000 is 97.5% of the old amount, so divide: 39,000 ÷ 0.975 = 40,000. | claude-opus-5-5 |
| 8.6-evaluate-relation | 1 | 1 | Works out 2 × (-4) as 8, which gives 8 - 3 = 5. / A positive times a negative is negative: 2 × (-4) = -8, then -8 - 3 = -11. | claude-opus-5-5 |
| 8.6-evaluate-relation | 2 | 1 | Uses -20 instead of +20 as the constant: -60 - 20 = -80. / The constant is +20, so add it: -5 × 12 = -60, then -60 + 20 = -40. | claude-opus-5-5 |
| 8.6-table-of-values | 1 | 1 | Treats x = -2 and x = -1 as 2 and 1, giving y = 5 and 3. / Keep the negative sign: 2 × (-2) + 1 = -3 and 2 × (-1) + 1 = -1. | claude-opus-5-5 |
| 8.6-table-of-values | 2 | 1 | Uses the x step of 10 as the y step, giving 3, 13, 23. / When x goes up 10, y goes up 2 × 10 = 20, so y is 3, 23, 43. | claude-opus-5-5 |
| 8.6-table-to-relation | 1 | 1 | Takes y rising by 4 each row as the x coefficient: y = 4x + 1. / x rises 2 while y rises 4, so y rises 4 ÷ 2 = 2 per 1 of x: y = 2x + 1. | claude-opus-5-5 |
| 8.6-table-to-relation | 2 | 1 | Writes y = 5x with no constant, though 5 × 5 = 25, not 20. / Test a row: 5 × 5 = 25 but y is 20, so subtract 5: y = 5x - 5. | claude-opus-5-5 |
| 8.6-scale-axes | 1 | 1 | Counts each gap as 1 unit instead of finding its value. / Divide the difference by the gaps: (20 - 0) ÷ 4 = 5, so each gap is 5. | claude-opus-5-5 |
| 8.6-scale-axes | 2 | 1 | Reads the 4th gap as 4, the number of gaps. / Each gap is worth 5, so 4 gaps above 0 is 4 × 5 = 20. | claude-opus-5-5 |
| 8.6-scale-axes | 3 | 1 | Uses 1 per gap, so 9 gaps only reach 9, not 90. / Choose a gap so 9 gaps cover 90: 9 × 10 = 90, so each gap is 10. | claude-opus-5-5 |
| 8.6-graph-relation | 1 | 1 | Gets (-2, 4) by dropping the negative sign from y. / 2 × (-2) = -4, so the point is (-2, -4); positive times negative is negative. | claude-opus-5-5 |
| 8.6-graph-relation | 2 | 1 | Gives y as the number of gaps (-2, 0, 2), not the real y value. / Each y gap is worth 5, so use real y: 5 × 0 - 10 = -10, giving (0, -10). | claude-opus-5-5 |
| 8.6-discrete-points | 1 | 1 | Joins the points for tickets and cost. / Tickets come in whole numbers only, no 2.5, so keep the points separate. | claude-opus-5-5 |
| 8.6-discrete-points | 2 | 1 | Keeps the points separate, using only whole-number times. / Time and water can be any amount between, like 2.5, so join the points. | claude-opus-5-5 |
| 8.6-discrete-points | 3 | 1 | Says 2.5 boxes is fine because any number can be an input. / Boxes are counted whole, so 2.5 boxes can't happen. The answer is no. | claude-opus-5-5 |
| 8.6-read-graph | 1 | 1 | Gives 3, the input, as the output. / Find the point with x = 3, which is (3, 8). The output is the second number, 8. | claude-opus-5-5 |
| 8.6-read-graph | 2 | 1 | DROPPED: The stated wrong answer 'yes' is actually correct: 2 × 5 + 1 = 11, so (5, 11) is on y = 2x + 1. Only the reasoning ('5 is in the equation') is flawed, so no wrong/fix pair can correct the answer. | none |
| 8.6-read-graph | 3 | 1 | Reads 4 gaps below 0 as -4, ignoring the gap value. / Each gap is 5, so 4 gaps below 0 is 4 × 5 = 20 below: y = -20. | claude-opus-5-5 |
| 8.6-relation-from-graph | 1 | 1 | Swaps them: uses 3 as the step and 2 as the start, y = 3x + 2. / At x = 0, y = 3, so the constant is 3. y rises 2 each time: y = 2x + 3. | claude-opus-5-5 |
| 8.6-relation-from-graph | 2 | 1 | Writes y = 3x + 10, dropping the minus sign on the step. / y goes down 3 as x goes up 1, so the coefficient is -3: y = -3x + 10. | claude-opus-5-5 |
| 8.6-relation-from-graph | 3 | 1 | I wrote y = 3x and left out the constant. / At x = 2, 3x gives 6 but y is 7, so add 1: y = 3x + 1. | claude-opus-5-5 |
| 8.6-relation-in-context | 1 | 1 | I found 4 × 6 = 24 and stopped, leaving out the $10 fee. / Add the fee too: 4 × 6 + 10 = $34. | claude-opus-5-5 |
| 8.6-relation-in-context | 2 | 1 | I wrote V = 200 + 8h, which makes the amount grow. / The tank loses 8 L each hour, so subtract: V = 200 - 8h. | claude-opus-5-5 |
| 8.6-solve-for-input | 1 | 1 | I added 8 to 15 to get x = 23. / y is x plus 8, so undo it by subtracting: 15 - 8 = 7. | claude-opus-5-5 |
| 8.6-solve-for-input | 2 | 1 | I put 20 in for x and got 3 × 20 + 2 = 62. / 20 is y, not x. Undo the add: 20 - 2 = 18, then undo the times: 18 ÷ 3 = 6. | claude-opus-5-5 |
| 8.6-solve-for-input | 3 | 1 | I divided $109 by 12 and ignored the $25 joining fee. / Take off 25 first: 109 - 25 = 84, then 84 ÷ 12 = 7 months. | claude-opus-5-5 |
| 8.9-surface-area | 1 | 1 | I added only three faces: 15 + 10 + 6 = 31. / A box has six faces in three equal pairs, so double it: 31 × 2 = 62. | claude-opus-5-5 |
| 8.9-surface-area | 2 | 1 | I counted one triangle: 6 + 30 + 40 + 50 = 126. / There are two triangle ends, each 6, so 12 + 30 + 40 + 50 = 132. | claude-opus-5-5 |
| 8.9-surface-area | 3 | 1 | I found only the sides, 20 × 10 = 200, and left out both bases. / Add the two trapezoid bases, 2 × 18 = 36: 36 + 200 = 236. | claude-opus-5-5 |
| 8.9-surface-area-cylinder | 1 | 1 | I used the diameter, 6 cm, as the side's length. / The length is the circumference: 2 × 3.14 × 3 = 18.84 cm. | claude-opus-5-5 |
| 8.9-surface-area-cylinder | 2 | 1 | DROPPED: The maths in the pair is right: the two circles are 2 × 3.14 × 3² = 56.52, the side is 2 × 3.14 × 3 × 10 = 188.4, and the total is 244.92 cm². The wrong statement (188.4, missing the two circles) matches the stated mistake, and the fix is a sound method. But the source contradicts itself. The step rules say the height is 4-8, and the example uses a height of 10 cm. Because the source is inconsistent, the pair is rejected. | none |
| 8.9-surface-area-cylinder | 3 | 1 | I used the diameter 6 as the radius. / The radius is half of 6, so r = 3. Then 56.52 + 169.56 = 226.08 cm². | claude-opus-5-5 |
| 8.9-sa-or-volume | 1 | 1 | I picked volume for painting the outside of a box. / Painting covers the outside, so use surface area. Volume is for filling. | claude-opus-5-5 |
| 8.9-sa-or-volume | 2 | 1 | I left 72,000 as litres without changing cm³ to L. / Divide by 1,000: 72,000 ÷ 1,000 = 72 L. | claude-opus-5-5 |
| 8.9-sa-or-volume | 3 | 1 | I multiplied 150 × 25 to get 3,750 cm. / Volume = base area × height, so divide: 150 ÷ 25 = 6 cm. | claude-opus-5-5 |
| 8.9-sa-or-volume | 4 | 1 | I found the volume, 10 × 5 × 2 = 100, not the tile area. / Tile covers surfaces: floor 50 + long walls 40 + short walls 20 = 110 m². | claude-opus-5-5 |
| 8.12-mean | 1 | 1 | I gave the sum, 24, as the mean. / Divide the sum by how many numbers: 24 ÷ 4 = 6. | claude-opus-5-5 |
| 8.12-mean | 3 | 1 | I gave the middle value, 8, instead of the mean. / Add all five, 42, then divide by 5: 42 ÷ 5 = 8.4. | claude-opus-5-5 |
| 8.12-missing-value-from-mean | 1 | 1 | DROPPED: The maths in the pair is right: 80 + 4 = 84 is the stated mistake (adding instead of multiplying), and total = mean × count = 80 × 4 = 320 is the correct method and answer. But the source contradicts itself. The step rules say the mean is 6-12.5, and the example uses a mean of 80. Because the source is inconsistent, the pair is rejected. | none |
| 8.12-missing-value-from-mean | 2 | 1 | I gave the mean, 80, as the missing score. / Total needed is 4 × 80 = 320. Subtract 236 to get 84. | claude-opus-5-5 |
| 8.12-missing-value-from-mean | 3 | 1 | Says a mean of 90 works, ignoring the 100 limit on scores. / The 4th score must be 125, over the top score of 100, so no. | claude-opus-5-5 |
| 8.12-median | 1 | 1 | Takes the middle of 4, 9, 1, 7, 3 as written, which gives 1. / Order first: 1, 3, 4, 7, 9. The middle value is 4. | claude-opus-5-5 |
| 8.12-median | 3 | 1 | DROPPED: fix needs commas for thousands; pair exceeds 150 characters | none |
| 8.12-range | 1 | 1 | Gives the largest value, 9, as the range of 3, 5, 9. / Range is greatest minus least: 9 - 3 = 6. | claude-opus-5-5 |
| 8.12-range | 2 | 1 | Works out 8 - 5 = 3, dropping the negative sign on -5. / Subtracting -5 adds 5: 8 - (-5) = 8 + 5 = 13. | claude-opus-5-5 |
| 8.12-mode | 1 | 1 | Picks the biggest value, 7, as the mode of 3, 5, 5, 7. / The mode is the value that appears most often. 5 appears twice. | claude-opus-5-5 |
| 8.12-mode | 2 | 1 | Reports only 2 as the mode of 1, 2, 2, 3, 3. / 2 and 3 each appear twice, the most, so both are modes. | claude-opus-5-5 |
| 8.12-outlier | 2 | 1 | Says the median changes more when 40 is removed. / Mean falls from 14.4 to 8, but median stays 8, so the mean changes more. | claude-opus-5-5 |
| 8.12-outlier | 3 | 1 | Says removing 2 changes the median more, since the middle shifts. / Median goes 13 to 13.5, mean goes 11.2 to 13.5, so the mean moves more. | claude-opus-5-5 |
| 8.12-choose-measure | 1 | 1 | Picks the mean for the most popular shoe size, as if it is always best. / Most popular means most often, so use the mode, the size that appears most. | claude-opus-5-5 |
| 8.12-choose-measure | 2 | 1 | Picks the mean as more typical because it uses all the data. / 200 pulls the mean to 76.4, above four of five values; median 47 is typical. | claude-opus-5-5 |
| 8.12-choose-measure | 3 | 1 | Says only the median works for heights from 150 to 156 cm. / No outlier, so the mean and median are close and either works. | claude-opus-5-5 |
| 8.13-sample-space | 1 | 1 | Says a spinner and a coin flip are connected, so not independent. / The spin does not change the coin's chances, so they are independent. | claude-opus-5-5 |
| 8.13-sample-space | 2 | 1 | Adds 2 + 6 = 8 outcomes for a coin and a die. / Each of 2 coin sides pairs with 6 die numbers: 2 × 6 = 12 outcomes. | claude-opus-5-5 |
| 8.13-sample-space | 3 | 1 | Adds 6 + 2 = 8 for a die and a coin. / Multiply, not add: each of 6 die faces pairs with 2 coin sides, 6 × 2 = 12. | claude-opus-5-5 |
| 8.13-theoretical-two-events | 1 | 1 | Adds 1/2 + 1/2 to get 1 for P(2 heads). / Of 4 outcomes HH, HT, TH, TT, only HH counts, so 1/4. | claude-opus-5-5 |
| 8.13-theoretical-two-events | 2 | 1 | Adds 1/6 + 1/2 to get 2/3 for P(5 and head). / 'And' means multiply: 1/6 × 1/2 = 1/12. | claude-opus-5-5 |
| 8.13-theoretical-two-events | 3 | 1 | Adds 3/6 + 1/2 to get 1 for P(prime and head). / Both must happen, so multiply: 3/6 × 1/2 = 3/12 = 1/4. | claude-opus-5-5 |
| 8.13-compare-experimental | 2 | 1 | Says the game is unfair because A and B win on different outcomes. / A wins HH, TT and B wins HT, TH: each 2 of 4 outcomes, 1/2, so fair. | claude-opus-5-5 |
| 8.13-compare-experimental | 3 | 1 | Says 31 wins instead of 25 means the game is unfair. / Chance varies; 6 more than 25 is small in 50 plays, so not necessarily unfair. | claude-opus-5-5 |
| 8.14-unit-price | 1 | 1 | Dividing the 4 L by the $12 to get $0.33. / Price per litre is price ÷ amount: $12 ÷ 4 L = $3 per litre. | claude-opus-5-5 |
| 8.14-unit-price | 2 | 1 | Picking 500 g because $3.50 is less than $4.80. / Compare the price per 100 g: $0.70 vs $0.64. The lower unit price is 750 g. | claude-opus-5-5 |
| 8.14-unit-price | 3 | 1 | Picking B because $6.75 is less than $9.60, ignoring the amounts. / Change 1.2 kg to 1,200 g, then compare per 100 g: $0.80 vs $0.90, so A. | claude-opus-5-5 |
| 8.14-multi-buy-offers | 1 | 1 | Picking 3 for $4 because $4 is the smaller total. / Compare the cost of one: $4 ÷ 3 ≈ $1.33 vs $7.50 ÷ 6 = $1.25, so 6 for $7.50. | claude-opus-5-5 |
| 8.14-multi-buy-offers | 2 | 1 | Halving the $3 price to get $1.50 each, as if the free offer means half off. / Pay for 2 only: $6 for 3 notebooks, so $6 ÷ 3 = $2 each. | claude-opus-5-5 |
| 8.14-multi-buy-offers | 3 | 1 | Choosing 12 for $3 because each banana costs less. / You only need 4, so compare what you pay for 4: $1.50 vs $3. | claude-opus-5-5 |
| 8.14-coupons | 2 | 1 | Combining 20% off and 12% tax into 8% off $50, giving $46. / Take 20% off first: $50 × 0.8 = $40. Then add tax: $40 × 1.12 = $44.80. | claude-opus-5-5 |
| 8.14-coupons | 3 | 1 | Taking 20% off $90 first, then $10 off, and skipping tax: $62. / Coupon first: $90 − $10 = $80. Then 20% off: $64. Then 12% tax: $64 × 1.12 = $71.68. | claude-opus-5-5 |
| 8.14-compare-services | 1 | 1 | Picking the $35 flat plan without working out Plan A for 100 texts. / Plan A costs $20 + 100 × $0.10 = $30, which is less than $35, so A. | claude-opus-5-5 |
| 8.14-compare-services | 2 | 1 | Getting n = 15 from 0.10n = 15 by not moving the decimal. / Dividing by 0.10 is the same as ×10: 15 ÷ 0.10 = 150, so n = 150. | claude-opus-5-5 |
| 8.14-compare-services | 3 | 1 | DROPPED: The source is incomplete and inconsistent. The mistake answer is empty, so there is nothing to check the wrong statement against. The fix's numbers are right: A = $10 + 2 × $2 = $14 at 2 GB and $10 + 12 × $2 = $34 at 12 GB, while B = $30. But the expected answer says to choose B 'if you often use 12 GB', and the maths doesn't support that. A's average monthly cost is 14 + 20p, where p is the share of 12 GB months, and that stays below $30 until p > 0.8. So A is still cheaper unless 12 GB months happen more than 80% of the time. Also, 'lowest cost in one month' gives A in a typical month, which partly matches the expected answer, so it's not clearly wrong. The fix's 'pick by how often 12 GB months happen' gives no rule for deciding, so it isn't enough on its own. There isn't enough evidence to verify this pair. | none |
| 9.2-power-parts | 1 | 1 | Calling 3 the base and 5 the exponent in 5³. / The base is the full-size number, 5. The exponent is the small raised number, 3. | claude-opus-5-5 |
| 9.2-power-parts | 2 | 1 | Writing 3⁴ as 3 × 4 or 3 + 3 + 3 + 3, using the exponent as a multiplier. / The exponent 4 says how many 3s are multiplied: 3 × 3 × 3 × 3. | claude-opus-5-5 |
| 9.2-power-parts | 3 | 1 | Writing (2n)³ as 2 × n × n × n, repeating only the n. / The bracket makes 2n the base, so the whole 2n is repeated 3 times: 2n × 2n × 2n. | claude-opus-5-5 |
| 9.2-evaluate-power | 1 | 1 | Finding 4³ as 4 × 3 = 12. / The exponent counts factors of 4: 4 × 4 × 4 = 64. | claude-opus-5-5 |
| 9.2-evaluate-power | 2 | 1 | Giving (-2)³ as 8, losing the negative sign. / (-2) × (-2) = 4, then 4 × (-2) = -8. Three negative factors give a negative. | claude-opus-5-5 |
| 9.2-evaluate-power | 3 | 1 | Finding -3² as 9 by squaring the minus sign along with the 3. / With no brackets only the 3 is squared: 3² = 9, then the minus stays: -9. | claude-opus-5-5 |
| 9.2-evaluate-power | 4 | 1 | Multiplying 1/2 by 3 to get 3/2, or only the bottom 2 by 3 to get 1/6. / (1/2)³ is 1/2 × 1/2 × 1/2 = (1×1×1)/(2×2×2) = 1/8. | claude-opus-5-5 |
| 9.2-zero-one-exponent | 1 | 1 | Thinking 7¹ equals 1. / Exponent 1 means one factor of 7, so 7¹ = 7. | claude-opus-5-5 |
| 9.2-zero-one-exponent | 2 | 1 | Saying 2⁰ is 0 because there are no 2s to multiply. / Each step down divides by 2: 8, 4, 2, then 2 ÷ 2 = 1, so 2⁰ = 1. | claude-opus-5-5 |
| 9.2-zero-one-exponent | 3 | 1 | Treating 6⁰ as 0, so 6⁰ + 6¹ becomes 0 + 6 = 6. / 6⁰ = 1, not 0. So 6⁰ + 6¹ = 1 + 6 = 7. | claude-opus-5-5 |
| 9.2-product-quotient-laws | 1 | 1 | Multiplying the exponents: 2³ × 2⁴ = 2¹². / Same base when multiplying: add the exponents. 3 + 4 = 7, so 2³ × 2⁴ = 2⁷. | claude-opus-5-5 |
| 9.2-product-quotient-laws | 2 | 1 | Multiplying the exponents: n⁵ × n³ = n¹⁵. / Same base when multiplying: add the exponents. 5 + 3 = 8, so n⁵ × n³ = n⁸. | claude-opus-5-5 |
| 9.2-product-quotient-laws | 3 | 1 | Adding the exponents when dividing: y⁷ ÷ y³ = y¹⁰. / Dividing powers of the same base: subtract the exponents. 7 − 3 = 4, so y⁴. | claude-opus-5-5 |
| 9.2-product-quotient-laws | 5 | 1 | Multiplying the bases and adding exponents: 2³ × 5⁴ = 10⁷. / The laws need the same base. 2 and 5 differ, so it can't be one power. | claude-opus-5-5 |
| 9.2-power-laws | 1 | 1 | Adding the exponents: (3²)⁴ = 3⁶. / A power of a power: multiply the exponents. 2 × 4 = 8, so (3²)⁴ = 3⁸. | claude-opus-5-5 |
| 9.2-power-laws | 2 | 1 | Adding the exponents: (n³)⁵ = n⁸. / A power of a power: multiply the exponents. 3 × 5 = 15, so (n³)⁵ = n¹⁵. | claude-opus-5-5 |
| 9.2-power-laws | 3 | 1 | Cubing only the n: (5n)³ = 5n³. / The power applies to 5 and n. 5³ = 125, so (5n)³ = 125n³. | claude-opus-5-5 |
| 9.2-power-laws | 4 | 1 | Squaring only the top: (n/4)² = n²/4. / Square the top and the bottom. 4² = 16, so (n/4)² = n²/16. | claude-opus-5-5 |
| 9.2-simplify-evaluate | 1 | 1 | Multiplying exponents: 2³ × 2⁴ = 2¹² = 4,096. / Add the exponents: 3 + 4 = 7. So 2⁷ = 128. | claude-opus-5-5 |
| 9.2-simplify-evaluate | 2 | 1 | Multiplying 5 × 2 for n⁵ × n², then subtracting 3: n⁷ = 128. / Add 5 + 2 = 7, then subtract 3 to get n⁴. At n = 2, 2⁴ = 16. | claude-opus-5-5 |
| 9.2-simplify-evaluate | 3 | 1 | Squaring only n³ in (2n³)², giving 2n⁷ = 4,374. / Square the 2 too: 2² = 4. (2n³)² × n = 4n⁷, so at n = 3 it is 8,748. | claude-opus-5-5 |
| 9.2-simplify-evaluate | 4 | 1 | Dropping the minus: (-2)³ × (-2)² = 32. / Add exponents to get (-2)⁵. An odd power of a negative is negative: -32. | claude-opus-5-5 |
| 9.1-compare-order | 1 | 1 | Thinking 3 is more than 1, so -3/4 > -1/4 (ignoring the minus). / -3/4 is further below zero than -1/4, so -3/4 < -1/4. | claude-opus-5-5 |
| 9.1-compare-order | 2 | 1 | Seeing 7 < 75 and saying -0.7 < -3/4. / -3/4 = -0.75. -0.70 is closer to zero than -0.75, so -0.7 > -3/4. | claude-opus-5-5 |
| 9.1-compare-order | 3 | 1 | Putting -0.7 before -3/4 because 0.7 looks smaller than 0.75. / -3/4 = -0.75 is further below zero than -0.7, so it comes first. | claude-opus-5-5 |
| 9.1-compare-order | 4 | 1 | Halving -1/2 to get -0.25, which is not between -1/2 and -1/3. / -1/2 = -0.5 and -1/3 ≈ -0.33. Pick -0.4, which is between them. | claude-opus-5-5 |
| 9.1-add-subtract | 1 | 1 | Adding the sizes and ignoring signs: -2.5 + 1.75 = -4.25. / Signs differ, so subtract sizes: 2.5 − 1.75 = 0.75. Keep the larger's sign: -0.75. | claude-opus-5-5 |
| 9.1-add-subtract | 2 | 1 | Adding the denominators too: -3/8 + 7/8 = 4/16. / Keep the denominator 8 and add the tops: -3 + 7 = 4. 4/8 = 1/2. | claude-opus-5-5 |
| 9.1-add-subtract | 3 | 1 | Adding tops and bottoms: -2/3 + 1/6 = -1/9. / Use sixths: -2/3 = -4/6. Then -4/6 + 1/6 = -3/6 = -1/2. | claude-opus-5-5 |
| 9.1-add-subtract | 4 | 1 | -3/4 - (-0.5) = -3/4 - 0.5 = -5/4, which ignores the negative sign on 0.5. / Subtracting -0.5 means adding 0.5: -3/4 + 1/2 = -1/4. | claude-opus-5-5 |
| 9.1-multiply-divide | 1 | 1 | (-3/4) × (2/3) = 1/2, ignoring the negative sign. / Negative × positive is negative. 6/12 simplifies to 1/2, so the answer is -1/2. | claude-opus-5-5 |
| 9.1-multiply-divide | 2 | 1 | (-0.4) × 0.3 = -1.2, counting only one decimal place. / 0.4 and 0.3 have 1 + 1 = 2 decimal places. 4 × 3 = 12 becomes 0.12, so -0.12. | claude-opus-5-5 |
| 9.1-multiply-divide | 3 | 1 | (-3/4) ÷ (1/5) = -3/20, multiplying by 1/5 without flipping it. / Flip 1/5 to 5/1, then multiply: (-3/4) × 5 = -15/4. | claude-opus-5-5 |
| 9.1-multiply-divide | 4 | 1 | (-1.2) ÷ 0.4 = -0.3, dividing 12 by 4 but putting the decimal point in the wrong place. / Multiply both by 10: -12 ÷ 4 = -3. Check: 0.4 × 3 = 1.2. | claude-opus-5-5 |
| 9.1-order-of-operations | 1 | 1 | 1/2 + 3/4 × 2/3 = 5/4 × 2/3 = 5/6, adding before multiplying. / Multiply first: 3/4 × 2/3 = 1/2. Then add: 1/2 + 1/2 = 1. | claude-opus-5-5 |
| 9.1-order-of-operations | 2 | 1 | 1 - 2 × (4/5)² = (1 - 2) × 16/25 = -16/25, subtracting first. / Square, then multiply: 2 × 16/25 = 32/25. Then subtract: 1 - 32/25 = -7/25. | claude-opus-5-5 |
| 9.1-order-of-operations | 3 | 1 | (-2)² = -4, so 0.5 + 1/4 × (-4) = -0.5. / (-2)² = (-2) × (-2) = 4. Then 0.5 + 1/4 × 4 = 0.5 + 1 = 1.5. | claude-opus-5-5 |
| 9.1-word-problems | 1 | 1 | -4.5 + 3.2 = -7.7, adding the sizes 4.5 and 3.2. / Rising moves toward zero, so find 4.5 - 3.2 = 1.3. It is still below zero: -1.3. | claude-opus-5-5 |
| 9.1-word-problems | 2 | 1 | A change of -2.5 cm each hour for 3.5 hours is -6 cm, found by adding 2.5 and 3.5. / A rate for some hours means multiply: -2.5 × 3.5 = -8.75 cm. | claude-opus-5-5 |
| 9.1-word-problems | 3 | 1 | (-3.5 - 2.5) × 4 + 6 = -18, subtracting before multiplying. / Multiply first: 2.5 × 4 = 10 drop. Then -3.5 - 10 + 6 = -7.5. | claude-opus-5-5 |
| 9.1-word-problems | 4 | 1 | 3/4 of -60 is -45, so -45 is the new depth, then -45 - 5.5 = -50.5. / 3/4 of 60 = 45 is the rise: -60 + 45 = -15. Then -15 - 5.5 = -20.5. | claude-opus-5-5 |
| 9.6-metric-conversions | 1 | 1 | 3 cm = 0.3 mm, because it divides by 10. / A mm is smaller than a cm, so multiply: 1 cm = 10 mm, and 3 × 10 = 30 mm. | claude-opus-5-5 |
| 9.6-metric-conversions | 2 | 1 | 4 km = 40 m, because it uses 10 instead of 1,000. / 1 km = 1,000 m, so 4 km = 4 × 1,000 = 4,000 m. | claude-opus-5-5 |
| 9.6-metric-conversions | 3 | 1 | 2.5 m = 25 cm, because it multiplies by 10. / 1 m = 100 cm, so 2.5 m = 2.5 × 100 = 250 cm. | claude-opus-5-5 |
| 9.6-metric-conversions | 4 | 1 | 3.6 m = 360 mm, because it only changes to cm (× 100). / 1 m = 1,000 mm, so 3.6 m = 3.6 × 1,000 = 3,600 mm. | claude-opus-5-5 |
| 9.6-scale-factor | 1 | 1 | Scale factor = 9 - 3 = 6, subtracting the lengths. / Divide new by old: 9 ÷ 3 = 3 and 6 ÷ 2 = 3. The scale factor is 3. | claude-opus-5-5 |
| 9.6-scale-factor | 2 | 1 | Giving 3 as the scale factor for 12 cm becoming 4 cm, by doing old ÷ new. / Use new ÷ old: 4 ÷ 12 = 1/3. A shorter side means a factor below 1. | claude-opus-5-5 |
| 9.6-scale-factor | 3 | 1 | 4 cm to 6 cm has scale factor 2, found by subtracting: 6 - 4. / Divide new by old: 6 ÷ 4 = 1.5. The scale factor is 1.5, not the difference. | claude-opus-5-5 |
| 9.6-scale-factor | 4 | 1 | DROPPED: The stated wrong answer "Yes" matches the correct verdict. 4 to 6 and 6 to 9 both use a factor of 1.5, so the rectangle is a scaled copy. Only the method (checking one side) is flawed, not the answer. A wrong-and-fix pair would need a different example, such as one where the sides use different factors, and I can't change the source example. | none |
| 9.6-draw-scale-diagram | 1 | 1 | Adds 2 to each coordinate, so (0, 1) becomes (2, 3). / Multiply each coordinate by 2: (2, 0) becomes (4, 0), (0, 1) becomes (0, 2). | claude-opus-5-5 |
| 9.6-draw-scale-diagram | 2 | 1 | Doubles the coordinates, so (6, 4) becomes (12, 8). / A scale factor of 1/2 halves them: (6, 4) becomes (3, 2). | claude-opus-5-5 |
| 9.6-draw-scale-diagram | 3 | 1 | Adds 3 to the first number, so (2, 1) becomes (5, 1). / Multiply both numbers by 3: (2, 1) becomes (6, 3) and (1, 3) becomes (3, 9). | claude-opus-5-5 |
| 9.6-draw-scale-diagram | 4 | 1 | Adds 1 to each side, so 4 becomes 5 and 2 becomes 3. / Multiply by 1.5: 4 × 1.5 = 6 and 2 × 1.5 = 3. | claude-opus-5-5 |
| 9.6-use-scale | 1 | 1 | Adds 4 and 5 to get 9 m. / Each 1 cm stands for 5 m, so 4 cm is 4 × 5 = 20 m. | claude-opus-5-5 |
| 9.6-use-scale | 2 | 1 | Multiplies 400 by 50 to get 20,000 cm. / Each 1 cm stands for 50 m, so divide: 400 ÷ 50 = 8 cm. | claude-opus-5-5 |
| 9.6-use-scale | 3 | 1 | Reads 6 × 200 = 1,200 as metres, but it is in cm. / Change 1,200 cm to m by dividing by 100, which gives 12 m. | claude-opus-5-5 |
| 9.6-use-scale | 4 | 1 | Gives the scale as 2 cm : 1 m, with the model and real lengths swapped. / Model 12 cm : real 24 m. Divide both by 12 to get 1 cm : 2 m. | claude-opus-5-5 |
| 9.6-similar-shapes | 1 | 1 | Says No by matching 50, 60 with 60, 70 in written order. / Third angles are 70 and 50. Both have 50, 60, 70, so they are similar. | claude-opus-5-5 |
| 9.6-similar-shapes | 2 | 1 | Says No because 3, 4, 5 and 6, 8, 10 are different lengths. / Similar sides can differ in length if the ratio matches: 6÷3 = 8÷4 = 10÷5 = 2. | claude-opus-5-5 |
| 9.6-similar-shapes | 3 | 1 | Says Yes because both rectangles have 90° angles. / Sides must match too: 4 : 6 is 2 : 3 but 6 : 8 is 3 : 4, so not similar. | claude-opus-5-5 |
| 9.6-similar-shapes | 4 | 1 | Compares 8 with 12, 6 with 15, 10 with 9 in written order. / Order the sides: 6, 8, 10 and 9, 12, 15. Each is × 3/2, so similar. | claude-opus-5-5 |
| 9.6-similar-missing-side | 1 | 1 | Adds 9 (12 − 3) to 5 to get 14. / Find the factor 12 ÷ 3 = 4, then multiply: 5 × 4 = 20 cm. | claude-opus-5-5 |
| 9.6-similar-missing-side | 2 | 1 | Adds 2 (6 − 4) to 10 to get 12. / Factor is 6 ÷ 4 = 1.5, so multiply: 10 × 1.5 = 15 cm. | claude-opus-5-5 |
| 9.6-similar-missing-side | 3 | 1 | Adds 3 to 8 because 9 is 3 more than 6. / 9/6 = 1.5, so multiply: n = 8 × 1.5 = 12. | claude-opus-5-5 |
| 9.6-similar-missing-side | 4 | 1 | Keeps the width at 4 cm and only scales the length. / Factor is 9 ÷ 6 = 1.5 for both sides, so width is 4 × 1.5 = 6 cm. | claude-opus-5-5 |
| 9.6-indirect-measurement | 1 | 1 | Multiplies 12 by 3/2, using shadow over height. / Height over shadow is 2/3, so the tree is 12 × 2/3 = 8 m. | claude-opus-5-5 |
| 9.6-indirect-measurement | 2 | 1 | Gives 400, which is in cm, but the question asks for metres. / Divide by 100: 400 cm = 4 m. | claude-opus-5-5 |
| 9.6-indirect-measurement | 3 | 1 | Copies 2.7 m, the shorter ladder's base, without scaling it. / Heights go 3.6 to 4.8, a factor 4/3, so base is 2.7 × 4/3 = 3.6 m. | claude-opus-5-5 |
| 9.3-vocabulary | 1 | 1 | Gives 4 and ignores the minus sign in front of 4n. / The term is −4n, so the coefficient of n is −4. | claude-opus-5-5 |
| 9.3-vocabulary | 2 | 1 | The degree of 4n² - n + 7 is 3 because it has 3 terms. / Degree is the highest power of n, which is 2 in 4n², not the number of terms. | claude-opus-5-5 |
| 9.3-vocabulary | 3 | 1 | 2n² - 3 is a trinomial because 2, n² and 3 are three terms. / 2n² is one term (2 and n² go together). 2n² and -3 are 2 terms, so a binomial. | claude-opus-5-5 |
| 9.3-algebra-tiles | 1 | 1 | 2 big squares, 3 rods and 4 small squares make 9n. / Each kind is its own term: 2 n², 3 n and 4 ones make 2n² + 3n + 4. | claude-opus-5-5 |
| 9.3-algebra-tiles | 2 | 1 | 2 big squares, 3 negative rods and 1 negative small square make 2n² + 3n + 1. / Negative tiles are subtracted terms: -3n and -1, so it is 2n² - 3n - 1. | claude-opus-5-5 |
| 9.3-algebra-tiles | 3 | 1 | 3 positive rods and 1 negative rod make 4n. / The negative rod cancels one positive rod: 3n - n = 2n. | claude-opus-5-5 |
| 9.3-algebra-tiles | 4 | 1 | 2n² - n + 3 uses 1 rod, so choose (a) with a positive rod. / -n means a negative rod, so choose (b): 2 big squares, 1 negative rod, 3 small squares. | claude-opus-5-5 |
| 9.3-like-terms | 1 | 1 | 5n and 8n are not like terms because the coefficients 5 and 8 differ. / Like terms need the same letter and power. Both are n terms, so they match. | claude-opus-5-5 |
| 9.3-like-terms | 2 | 1 | n and -6n are not like terms because one is negative. / Signs do not matter. Both have n to the power 1, so they are like terms. | claude-opus-5-5 |
| 9.3-like-terms | 3 | 1 | 4n is like 4n² because both have coefficient 4. / Like terms match in letter and power, not coefficient. 7n² and n² have n². | claude-opus-5-5 |
| 9.3-like-terms | 4 | 1 | 3n² + 2n - n² + 5 - 4n has 5 groups, one for each term. / Group matching terms: the n² terms, the n terms and the number 5 make 3 groups. | claude-opus-5-5 |
| 9.3-add | 1 | 1 | (3n + 2) + (4n + 5) = 14n by adding all the numbers together. / Add n terms: 3n + 4n = 7n. Add numbers: 2 + 5 = 7. The answer is 7n + 7. | claude-opus-5-5 |
| 9.3-add | 2 | 1 | n² + 2n² = 3n⁴ because the exponents 2 and 2 are added. / Adding like terms adds only the coefficients: n² + 2n² = 3n², and the power stays 2. | claude-opus-5-5 |
| 9.3-add | 3 | 1 | (n² + 5) + (3n - 2) = 4n² + 3 by combining all the terms. / n² and n are different kinds. Only 5 and -2 combine: 5 - 2 = 3, so n² + 3n + 3. | claude-opus-5-5 |
| 9.3-add | 4 | 1 | The perimeter is 6n + 8 because the constants are added as 3 + 1 + 4. / Side 2n - 1 has constant -1, so 3 - 1 + 4 = 6. The perimeter is 6n + 6. | claude-opus-5-5 |
| 9.3-subtract | 1 | 1 | (5n - 7) - (2n + 3) = 3n - 4, since only 2n is subtracted and +3 stays. / Subtract both terms: -2n and -3. So 5n - 7 - 2n - 3 = 3n - 10. | claude-opus-5-5 |
| 9.3-subtract | 2 | 1 | (4n² + 3n) - (n² + 5n) = 3n² + 8n by adding 3n and 5n. / Subtract the n terms: 3n - 5n = -2n. The answer is 3n² - 2n. | claude-opus-5-5 |
| 9.3-subtract | 3 | 1 | (5n - 3) - (2n - 6) = 3n - 9 by doing -3 - 6. / Subtracting -6 adds 6: -3 + 6 = 3. So the answer is 3n + 3. | claude-opus-5-5 |
| 9.3-subtract | 4 | 1 | Third side = (9n + 2) + (4n - 5) = 13n - 3, adding the sides. / Subtract the two sides from the perimeter: (9n + 2) - (4n - 5) = 5n + 7. | claude-opus-5-5 |
| 9.3-multiply-monomial | 1 | 1 | 3(n + 4) = 3n + 4, multiplying only n by 3. / Multiply both terms by 3: 3 × n = 3n and 3 × 4 = 12, so 3n + 12. | claude-opus-5-5 |
| 9.3-multiply-monomial | 2 | 1 | n(n + 5) = n² + 5, multiplying only the first term by n. / Multiply 5 by n too: n × n = n² and n × 5 = 5n, so n² + 5n. | claude-opus-5-5 |
| 9.3-multiply-monomial | 3 | 1 | 2n(n + 7) = 2n² + 7n, multiplying the 2 by only the first term. / Multiply 2n by both terms: 2n · n = 2n² and 2n · 7 = 14n, so 2n² + 14n. | claude-opus-5-5 |
| 9.3-multiply-monomial | 4 | 1 | -3n(2n - 5) = -6n² - 15n, keeping the minus on the 5. / -3n × -5 = +15n, since a negative times a negative is positive. So -6n² + 15n. | claude-opus-5-5 |
| 9.3-divide-monomial | 1 | 1 | (12n + 18) ÷ 6 = 2n + 18, dividing only the first term. / Divide both terms by 6: 12n ÷ 6 = 2n and 18 ÷ 6 = 3, so 2n + 3. | claude-opus-5-5 |
| 9.3-divide-monomial | 2 | 1 | (6n² + 4n) ÷ (2n) = 3n² + 2, keeping n² in the first term. / Dividing by n removes one n: 6n² ÷ 2n = 3n and 4n ÷ 2n = 2. So 3n + 2. | claude-opus-5-5 |
| 9.3-divide-monomial | 3 | 1 | (15k² - 10k) ÷ (5k) = 3k² - 2, dividing the numbers but leaving k. / Divide the k too: 15k² ÷ 5k = 3k and 10k ÷ 5k = 2. So 3k - 2. | claude-opus-5-5 |
| 9.3-divide-monomial | 4 | 1 | (-8m² + 12m) ÷ (-4m) = -2m + 3, with both signs reversed. / Same signs give +: -8m² ÷ -4m = 2m. Different signs give -: 12m ÷ -4m = -3. So 2m - 3. | claude-opus-5-5 |
| 9.7-population-sample | 1 | 1 | The population is the 30 students asked. / The population is all 400 students. The 30 students asked are the sample. | claude-opus-5-5 |
| 9.7-population-sample | 2 | 1 | 50 out of 2,000 is written as 40/1, upside down. / Put the sample on top: 50/2,000 = 1/40, a small part of the population. | claude-opus-5-5 |
| 9.7-population-sample | 3 | 1 | Test every bulb because it is more accurate. / Testing every bulb uses them all up, so test only a sample. | claude-opus-5-5 |
| 9.7-sampling-methods | 1 | 1 | Asking the 10 people sitting nearby is random. / It is convenient, since they were easy to reach. Random needs everyone to have an equal chance. | claude-opus-5-5 |
| 9.7-sampling-methods | 2 | 1 | Picking every 10th name from a list is random. / Picking by a fixed step, every 10th name, is systematic. Random picks use chance. | claude-opus-5-5 |
| 9.7-sampling-methods | 3 | 1 | Take 20 from each building, ignoring group sizes. / East has 3/4 of the 400 students, so take 30 east and 10 west (3/4 and 1/4 of 40). | claude-opus-5-5 |
| 9.7-bias | 1 | 1 | Not biased, since the soccer team's answers are honest. / It is biased: only the team is asked, so other students are left out. | claude-opus-5-5 |
| 9.7-bias | 2 | 1 | The rating question is more biased. / The first one is biased: "awful" pushes the answer. Asking for a rating uses neutral words. | claude-opus-5-5 |
| 9.7-bias | 3 | 1 | "Isn't our bus service too slow?" is a fair rewrite. / It still leads. Use neutral words: "How would you rate the speed of our bus service?" | claude-opus-5-5 |
| 9.7-misleading-stats | 1 | 1 | Not misleading, because the numbers on the axis are correct. / The axis starts at 90, so 100 looks twice as tall as 95 but is not. That is misleading. | claude-opus-5-5 |
| 9.7-misleading-stats | 2 | 1 | 4 out of 5 is 80%, so the claim is fine. / Only 5 were asked, too few to trust. Check how many were asked, not just the 80%. | claude-opus-5-5 |
| 9.7-misleading-stats | 3 | 1 | DROPPED: fix needs commas for thousands | none |
| 9.7-sample-to-population | 1 | 1 | 12 ÷ 40 = 0.3, so the answer is 3%. / 0.3 = 30/100, so move the decimal two places: 0.3 = 30%. | claude-opus-5-5 |
| 9.7-sample-to-population | 2 | 1 | 30% of 800 students is 30 students, using the percent as a count. / Find 30% of the population: 0.3 × 800 = 240 students. | claude-opus-5-5 |
| 9.7-sample-to-population | 3 | 1 | Gives 8 trees, copying the sample count as the forest's count. / 8 of 50 is 16%, and 16% of 4,000 trees is 640. | claude-opus-5-5 |
| 9.7-sample-to-population | 4 | 1 | Picks Sample A because 20% is a bigger number than 17%. / A bigger sample is more reliable, so trust B's 17 of 100 over A's 2 of 10. | claude-opus-5-5 |
| 9.8-budget | 1 | 1 | Adds the expenses to the income: 120 + 100 = 220. / Add expenses 45 + 30 + 25 = 100, then subtract from income: 120 − 100 = 20. | claude-opus-5-5 |
| 9.8-budget | 2 | 1 | Treats 35% as $35 for the rent. / 35% means 35 out of 100, so 0.35 × 2,400 = 840. | claude-opus-5-5 |
| 9.8-budget | 3 | 1 | Adds the hall to one guest's cost: 8.50 + 150. / Find 60 guests' cost first: 60 × 8.50 = 510, then add 150 to get 660. | claude-opus-5-5 |
| 9.8-budget | 4 | 1 | Says $35 left, even though expenses are more than income. / Expenses total 535, which is more than 500, so it is $35 over budget. | claude-opus-5-5 |
| 9.8-bank-record | 1 | 1 | Adds the withdrawal too: 120 + 50 + 30 = 200. / A withdrawal takes money out, so subtract it: 120 + 50 − 30 = 140. | claude-opus-5-5 |
| 9.8-bank-record | 2 | 1 | Adds the fee: 142.50 + 7.50 + 60 = 210. / A fee takes money out, so subtract it: 142.50 − 7.50 + 60 = 195. | claude-opus-5-5 |
| 9.8-bank-record | 3 | 1 | Works out 40 − 25 = 15 and drops the negative sign. / Taking 40 from 25 goes below zero, so the balance is −$15 (overdrawn). | claude-opus-5-5 |
| 9.8-simple-interest | 1 | 1 | Multiplies 500 by 4 instead of 4%, getting 2,000. / 4% means 0.04, so the interest is 500 × 0.04 = 20. | claude-opus-5-5 |
| 9.8-simple-interest | 2 | 1 | Finds interest for one year only: $24. / Multiply the yearly 24 by 4 years to get 96, then 800 + 96 = 896 total. | claude-opus-5-5 |
| 9.8-simple-interest | 3 | 1 | Uses a whole year of interest, $60, for 6 months. / 6 months is half a year, so take half of the yearly 60 to get 30. | claude-opus-5-5 |
| 9.8-simple-interest | 4 | 1 | Does 60 out of 1,000 and ignores the 2 years, getting 6%. / Divide 60 by 2 years to get 30 a year, then 30 out of 1,000 is 3%. | claude-opus-5-5 |
| 9.8-planned-purchase | 1 | 1 | DROPPED: The source is inconsistent. The correct answer is 360 ÷ 45 = 8 weeks. The wrong answer 405 equals 360 + 45, so it comes from adding. The stated why says it multiplies, but 360 × 45 = 16,200, not 405. The why doesn't match the wrong answer, so I can't write a sound pair without changing the source. | none |
| 9.8-planned-purchase | 2 | 1 | Adds 4 dollars for 4%, giving 504. / 4% of 500 is 0.04 × 500 = 20, so the total is 500 + 20 = 520. | claude-opus-5-5 |
| 9.8-planned-purchase | 3 | 1 | Gives the plan total, 80 × 12 = 960, as the extra cost. / Subtract the cash price: 960 − 900 = 60 more. | claude-opus-5-5 |
| 9.4-table-of-values | 1 | 1 | Drops the sign of x and does 3 × 4 + 2 = 14. / x is −4, so 3 × (−4) = −12, then −12 + 2 = −10. | claude-opus-5-5 |
| 9.4-table-of-values | 2 | 1 | Multiplies 4 by 2 instead of by 1/2, getting 9. / 4 × 1/2 is half of 4, which is 2, then 2 + 1 = 3. | claude-opus-5-5 |
| 9.4-table-of-values | 3 | 1 | Ignores the negative: (1/2) × 4 + 3 = 5. / Half of −4 is −2, so y = −2 + 3 = 1. | claude-opus-5-5 |
| 9.4-write-relation | 1 | 1 | Adds 5 and 2 first to write C = 7h. / Only h is multiplied: 2 per hour gives 2h, and the 5 is added once, C = 2h + 5. | claude-opus-5-5 |
| 9.4-write-relation | 2 | 1 | Wrote y = 3x, using the change of 3 but leaving out the start value. / At x = 0, y is -1, so the start is -1 and the rule is y = 3x - 1. | claude-opus-5-5 |
| 9.4-write-relation | 3 | 1 | Wrote V = 80 + 2.5t, which adds 2.5 L each minute. / The tank loses 2.5 L a minute, so subtract: V = 80 - 2.5t. | claude-opus-5-5 |
| 9.4-graph-line | 1 | 1 | Worked out x = -1 as 2 × 1 - 3 = -1, dropping the negative sign. / Use 2 × (-1) = -2, then -2 - 3 = -5, so the point is (-1, -5). | claude-opus-5-5 |
| 9.4-graph-line | 2 | 1 | Treated (1/2) × (-2) as +1, so y = 1 + 1 = 2. / Half of -2 is -1, so y = -1 + 1 = 0 and the point is (-2, 0). | claude-opus-5-5 |
| 9.4-graph-line | 3 | 1 | Said (4, 9) is not on the line because it is far from the other points. / Distance doesn't matter. The rule y = 2x + 1 gives 9 at x = 4, so it is on. | claude-opus-5-5 |
| 9.4-horizontal-vertical | 1 | 1 | Wrote x = 3, but 3 is the y value in every point. / The x values change (2, 5, -1) and y is always 3, so the line is y = 3. | claude-opus-5-5 |
| 9.4-horizontal-vertical | 2 | 1 | Said y = 5 is vertical because y means up. / y = 5 means every point has height 5, so the line stays level: horizontal. | claude-opus-5-5 |
| 9.4-horizontal-vertical | 3 | 1 | Wrote (-2, 0), putting -2 as the x coordinate. / On y = -2, y is always -2. On the y axis x = 0, so it crosses at (0, -2). | claude-opus-5-5 |
| 9.4-horizontal-vertical | 4 | 1 | Said vertical because the cost goes up. / The cost stays $3.25 for any distance, so y = 3.25 is a level, horizontal line. | claude-opus-5-5 |
| 9.4-analyze-graph | 1 | 1 | Gave 7, the y value of the second point, as the starting value. / The start is y when x = 0. The point (0, 4) shows it is 4. | claude-opus-5-5 |
| 9.4-analyze-graph | 2 | 1 | Gave 7, a y value, as the rise for each step across. / The rise is how much y changes when x goes up 1: 7 - 4 = 3. | claude-opus-5-5 |
| 9.4-analyze-graph | 3 | 1 | Said it is linear because the y values keep increasing. / Check the changes: 3, 3, 4. They are not all the same, so it is not linear. | claude-opus-5-5 |
| 9.4-analyze-graph | 4 | 1 | Said 20 is how long the candle burns. / 20 is the y value at x = 0, the starting height. -1.5 cm is the change each hour. | claude-opus-5-5 |
| 9.4-interpolate | 1 | 1 | Halved the larger y value, 18 ÷ 2 = 9. / x = 3 is halfway between 2 and 4, so y is halfway between 10 and 18: 14. | claude-opus-5-5 |
| 9.4-interpolate | 2 | 1 | Gave 11, the value halfway at x = 2, not the value at x = 3. / The rate is (17 - 5) ÷ 4 = 3 per step, so at x = 3, y = 5 + 3 × 3 = 14. | claude-opus-5-5 |
| 9.4-interpolate | 3 | 1 | Gave 52.5 L, the halfway value at 5 min. / The rate is -15 ÷ 10 = -1.5 L a minute, so at 6 min: 60 - 1.5 × 6 = 51 L. | claude-opus-5-5 |
| 9.4-extrapolate | 1 | 1 | Used 7 + 4 × 3 = 19, treating 4 as the rate and 7 as the start. / The start is 4 and the rate is 3, so y = 4 + 3 × 3 = 13. | claude-opus-5-5 |
| 9.4-extrapolate | 2 | 1 | Found 3 × 20 = 60 and left out the start value. / The rate is 3 and the start is 4, so y = 3 × 20 + 4 = 64. | claude-opus-5-5 |
| 9.5-model-pictorially | 1 | 1 | Took 3 from 5 to get 2n = 2, so n = 1. / The left has -3, so add 3 to both sides: 2n = 8, so n = 4. | claude-opus-5-5 |
| 9.5-model-pictorially | 2 | 1 | Took 1 from both sides to get 3n = n + 6, then said n = 6. / Also take 1 n from both sides: 2n = 6, so n = 3. | claude-opus-5-5 |
| 9.5-distribute | 1 | 1 | Multiplies only n: 2(n + 3) becomes 2n + 3, so 2n = 11 and n = 5.5. / Multiply both terms: 2n + 6 = 14, so 2n = 8 and n = 4. | claude-opus-5-5 |
| 9.5-distribute | 2 | 1 | Divides by 3 to get n - 4 = 5, then subtracts 4 to get n = 1. / n - 4 = 5 has a minus 4, so undo it by adding 4: n = 5 + 4 = 9. | claude-opus-5-5 |
| 9.5-distribute | 3 | 1 | Treats -8 as 8: 2x + 6 = 8 gives x = 1. / Keep the minus: 2x + 6 = -8, 2x = -14, x = -7. | claude-opus-5-5 |
| 9.5-distribute | 4 | 1 | Ignores the minus on -4: 4(n - 2) = 20 gives n = 7. / -4 × -2 = +8, so -4n + 8 = 20, -4n = 12, n = -3. | claude-opus-5-5 |
| 9.5-collect-like-terms | 1 | 1 | Writes 4n - 7 + 2n as 6n + 7, so 6n + 7 = 23 and n = 8/3. / Keep the -7: 6n - 7 = 23, add 7 to get 6n = 30, so n = 5. | claude-opus-5-5 |
| 9.5-collect-like-terms | 2 | 1 | Collects 3n - 5n as 2n, so 2n - 8 = 6 gives n = 7. / 3n - 5n = -2n, so -2n - 8 = 6, -2n = 14, n = -7. | claude-opus-5-5 |
| 9.5-collect-like-terms | 3 | 1 | Treats -2 as +2, so 7 + 2 = 9 and 2n + 9 = 15 gives n = 3. / Keep -2: 7 - 2 = 5, so 2n + 5 = 15, 2n = 10, n = 5. | claude-opus-5-5 |
| 9.5-collect-like-terms | 4 | 1 | Writes 2(n + 1) as 2n + 1, so 5n + 1 = 17 and n = 3.2. / Multiply the 1 too: 2n + 2 + 3n = 17, 5n = 15, n = 3. | claude-opus-5-5 |
| 9.5-variables-both-sides | 1 | 1 | Adds 3 to both sides of 3n + 3 = 12 and gets 3n = 15, so n = 5. / Subtract 3 from both sides: 3n = 9, so n = 3. | claude-opus-5-5 |
| 9.5-variables-both-sides | 2 | 1 | Gets 3n = -12 but then drops the minus, so n = 4. / Keep the minus: 3n = -12, divide by 3 to get n = -4. | claude-opus-5-5 |
| 9.5-variables-both-sides | 3 | 1 | DROPPED: Correct work: add 3n to both sides, 4 = 5n + 24, so 5n = -20 and n = -4. Adding 3n to one side only gives n = -10 (left) or n = -2.5 (right). Subtracting 3n gives n = 20. None gives n = 4, which is only a dropped negative sign. The stated cause does not match the wrong answer. | none |
| 9.5-variables-both-sides | 4 | 1 | Writes 2(n + 4) as 2n + 4, so 2n + 4 = 3n - 1 and n = 5. / Multiply the 4 too: 2n + 8 = 3n - 1, so 9 = n, n = 9. | claude-opus-5-5 |
| 9.5-rational-coefficients | 1 | 1 | Adds 2 to the right side: n/3 + 2 = 5 becomes n/3 = 7, so n = 21. / Subtract 2 from both sides: n/3 = 3, then multiply by 3 to get n = 9. | claude-opus-5-5 |
| 9.5-rational-coefficients | 2 | 1 | Adds 1.2 to 3.7 to get 0.5n = 4.9, so n = 9.8. / Subtract 1.2: 0.5n = 3.7 - 1.2 = 2.5, so n = 2.5 ÷ 0.5 = 5. | claude-opus-5-5 |
| 9.5-rational-coefficients | 3 | 1 | Gets n/3 = 7/6 and drops the minus, so n = 7/2. / 5/6 - 2 = -7/6, so n/3 = -7/6, and n = -7/2. | claude-opus-5-5 |
| 9.5-rational-coefficients | 4 | 1 | Subtracts 1/2 from 1/6, so 2/3 n = -1/3 and n = -1/2. / Add 1/2 to both sides: 2/3 n = 1/6 + 3/6 = 2/3, so n = 1. | claude-opus-5-5 |
| 9.5-multi-step | 1 | 1 | Writes 2(3n - 1) as 6n - 1, so 2n = 11 and n = 5.5. / Multiply the -1 by 2 too: 6n - 2 = 4n + 10, 2n = 12, n = 6. | claude-opus-5-5 |
| 9.5-multi-step | 2 | 1 | From 3n + 10 = n + 6, gets 2n = 4 and n = 2, losing the minus. / Subtract n and 10: 2n = 6 - 10 = -4, so n = -2. | claude-opus-5-5 |
| 9.5-multi-step | 3 | 1 | Multiplies only x by -2/3 and keeps -6: 1 + 2x = 3 - 2/3 x - 6, so x = -3/2. / -2/3 × 6 = -4, so 1 + 2x = -1 - 2/3 x, 8/3 x = -2, x = -3/4. | claude-opus-5-5 |
| 9.5-word-problems | 1 | 1 | Takes 34 - 10 = 24 and gives $24 as the number of visits. / 24 is the total for visits, so divide by $4 a visit: 24 ÷ 4 = 6 visits. | claude-opus-5-5 |
| 9.5-word-problems | 2 | 1 | Writes 3t + 4 = 39, counting the $4 snack once, and gets $11.67. / Each of the 3 pays $4, so 3(t + 4) = 39. Then t + 4 = 13, so t = $9. | claude-opus-5-5 |
| 9.5-word-problems | 3 | 1 | Adds $14 and $6 to get $20, ignoring the 1/3 spent on the book. / $14 + $6 = $20 is only 2/3 of the money, so 1/3 is $10 and the start is $30. | claude-opus-5-5 |
| 9.5-word-problems | 4 | 1 | Writes 8s = 56, leaving out the $200 the club started with. / The 56 is what is left, so 200 - 8s = 56. Then 8s = 144 and s = $18. | claude-opus-5-5 |

## C2-R3: F11 and F12 corrections

F11 now describes reversing tens and ones. Its source reason changed from "writes the 4 first because it is said first" to "puts the ones digit before the tens digit". Both F12 pairs require six squares in a valid arrangement. Approval was cleared before re-verification. No example, answer key or story changed.

| Case | Candidate wrong / fix | Status |
|---|---|---|
| 1.1-read-write-20#2:0 | Writes ten and four as 41, with the ones digit before the tens digit. / Ten and four is 1 ten and 4 ones. Write the ten first: 14. | Pending independent verification |
| 3.11-nets#1:0 | A straight row of 6 squares folds into a cube. / A cube net needs 6 squares arranged to fold into a cube. A straight row will not work. | Pending independent verification |
| 3.11-nets#1:1 | A 2 by 3 block of 6 squares folds into a cube. / A cube net needs 6 squares arranged to fold into a cube. A 2 by 3 block will not work. | Pending independent verification |

## C2-R3: factual-claim recheck results

| Case | Final wrong / fix | Verifier |
|---|---|---|
| 1.1-read-write-20#2:0 | Writes ten and four as 41, with the ones digit before the tens digit. / Ten and four is 1 ten and 4 ones. Write the ten first: 14. | claude-opus-5-5 |
| 3.11-nets#1:0 | A straight row of 6 squares folds into a cube. / A cube net needs 6 squares arranged to fold into a cube. A straight row will not work. | claude-opus-5-5 |
| 3.11-nets#1:1 | A 2 by 3 block of 6 squares folds into a cube. / A cube net needs 6 squares arranged to fold into a cube. A 2 by 3 block will not work. | claude-opus-5-5 |

## C2-R3: factual-claim recheck results

| Case | Final wrong / fix | Verifier |
|---|---|---|
| 1.1-subitize-to-10#2:0 | Saying 6 or 8 for a full row of 5 and 2 more by counting one too few or one too many. / Know the full row is 5, then count on 2: 6, 7. The total is 7. | claude-opus-5-5 |

## 2026-11-05: final-step bag outcomes

For `4.17-predict-outcome`, step 3, templates 1 and 3 now compare red with the combined blue and green outcomes. The old questions compared two stated counts. The new questions require the child to combine the non-red outcomes before comparing likelihood. The counts keep the step's range of 1 to 12. No fractions or replacement probabilities are added. Code computes the keys as `a > b + c`. Equal cases are excluded. Earlier teaching steps stay unchanged.

## 2026-11-05: final-step scale intervals and missing bills

For `4.16-many-to-one`, step 3, template 4 now gives three adjacent scale marks. The child must infer the interval before checking a reading several intervals above a labelled mark. This replaces the count-on wording while keeping the existing ranges and key. For `4.18-money-notation`, step 3, template 4 now asks for a missing count of $10 bills from a total with $20 bills, loonies and quarters. The old whole-dollar addition did not exercise decimal money notation. The new inverse calculation stays below $100 and uses the same denomination ranges. These changes also apply to the standards' own practice.
