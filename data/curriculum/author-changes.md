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
