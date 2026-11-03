// Child-facing cover copy. Curriculum labels remain unchanged in the map.
const TITLES: Readonly<Record<number, string>> = {
  1: "Counting to 10",
  2: "Making 5 and comparing",
  3: "Adding and taking away",
  4: "Counting and adding to 20",
  5: "Adding and subtracting to 20",
  6: "Measuring and sorting shapes",
  7: "Counting and comparing to 100",
  8: "Finding missing numbers",
  9: "Adding and subtracting to 100",
  10: "Adding and subtracting to 1000",
  11: "Multiplying and sharing",
  12: "Using fractions and measuring",
  13: "Using numbers to 10 000",
  14: "Multiplying and dividing",
  15: "Adding and taking away decimals",
  16: "Using numbers to 1 000 000",
  17: "Multiplying and using fractions",
  18: "Using decimals and measuring",
  19: "Working with larger numbers",
  20: "Using fractions and decimals",
  21: "Using ratios and percents",
  22: "Calculating with integers",
  23: "Using decimals and circles",
  24: "Solving two-step equations",
  25: "Using squares and equations",
  26: "Finding roots and using fractions",
  27: "Graphing and measuring solids",
  28: "Using exponents and scale",
  29: "Calculating with polynomials",
  30: "Solving and graphing equations",
};

export function workbookCoverTitle(level: number): string {
  const title = TITLES[level];
  if (!Number.isInteger(level) || !title) throw new Error("The cover needs a checked learning title.");
  return title;
}
