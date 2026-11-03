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
