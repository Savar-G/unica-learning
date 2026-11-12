// What a child can do at each grade, in plain words, in four areas that line up from grade to grade, so today and the
// goal compare row by row ("adds 1-digit numbers" beside "adds 3-digit numbers"). Written from the BC curriculum's
// content for each grade and the unit titles (workbook-unit-titles). null: the area starts in a later grade.
// The build keeps this table in code (one line per grade and area) and a test checks it against the curriculum units.
window.AREAS = [
  { key: "num", name: "Numbers" },
  { key: "add", name: "Adding and subtracting" },
  { key: "mul", name: "Multiplying and dividing" },
  { key: "part", name: "Fractions and decimals" },
];
window.SKILLS = {
  0: { num: "Counts to 10", add: "Adds and takes away to 10, with objects", mul: null, part: null },
  1: { num: "Numbers to 20", add: "Adds and subtracts 1-digit numbers", mul: null, part: null },
  2: { num: "Numbers to 100", add: "Adds and subtracts 2-digit numbers", mul: null, part: null },
  3: { num: "Numbers to 1,000", add: "Adds and subtracts 3-digit numbers", mul: "Multiplies and divides up to 5 × 5", part: "Simple fractions, like ¼ of a group" },
  4: { num: "Numbers to 10,000", add: "Adds and subtracts 4-digit numbers", mul: "Times tables up to 10 × 10", part: "Decimals to hundredths, like $2.75" },
  5: { num: "Numbers to 1,000,000", add: "Adds and subtracts decimals", mul: "Multiplies and divides 3-digit numbers", part: "Equivalent fractions, like ⅔ = 4⁄6" },
  6: { num: "Factors and multiples", add: "Mixed operations in order, like 3 + 4 × 2", mul: "Multiplies and divides decimals", part: "Mixed numbers, ratios and percents" },
  7: { num: "Negative numbers", add: "Adds and subtracts negative numbers", mul: "Multiplies and divides negative numbers", part: "Fractions, decimals and percents together" },
  8: { num: "Squares and square roots", add: "Adds and subtracts fractions", mul: "Multiplies and divides fractions", part: "Percents and proportions" },
  9: { num: "Exponents", add: "Adds and subtracts polynomials", mul: "Multiplies polynomials", part: "Rational numbers" },
};
// Rows for today and the goal: every area the goal grade has. Today's cell is null when the area starts later.
window.skillRows = (from, to) => AREAS.filter((a) => SKILLS[to][a.key]).map((a) => ({ area: a.name, today: SKILLS[from][a.key], goal: SKILLS[to][a.key] }));
