// Each BC unit's short title (D-201): moved out of workbook-titles.ts so the report (which browser code imports) can
// name a topic in plain words without the skill titles. Pure data.
/** Each BC unit's short title: what its skills practise, in at most 4 words (a test checks every unit has one). */
export const UNIT_TITLES: Readonly<Record<string, string>> = {
  // Kindergarten (U1 to U3).
  K1: "Counting to 10", K2: "Ways to make 5", K3: "Number parts to 10", K4: "Repeating patterns", K5: "Adding and taking away",
  K6: "Equal or not", K7: "Comparing sizes", K8: "Shapes and objects", K9: "Picture graphs", K10: "Never, sometimes, always",
  K11: "Coins and shopping",
  // Grade 1 (U4 to U6).
  "1.1": "Numbers to 20", "1.2": "Ways to make 10", "1.3": "Adding and subtracting", "1.4": "Repeating patterns",
  "1.5": "Changing amounts", "1.6": "Equal or not", "1.7": "Measuring things", "1.8": "Shapes and objects",
  "1.9": "Graphs", "1.10": "Never, sometimes, always", "1.11": "Coins",
  // Grade 2 (U7 to U9).
  "2.1": "Numbers to 100", "2.2": "Benchmarks to 100", "2.3": "Facts to 20", "2.4": "Adding and subtracting",
  "2.5": "Patterns", "2.6": "Changing amounts", "2.7": "Equal or not", "2.8": "Measuring length",
  "2.9": "Shapes and objects", "2.10": "Picture graphs", "2.11": "More or less likely", "2.12": "Coins and saving",
  // Grade 3 (U10 to U12).
  "3.1": "Numbers to 1000", "3.2": "Fractions", "3.3": "Adding and subtracting", "3.4": "Facts to 20",
  "3.5": "Multiplying and dividing", "3.6": "Growing patterns", "3.7": "Pattern rules", "3.8": "Missing numbers",
  "3.9": "Measuring", "3.10": "Time", "3.11": "3D objects", "3.12": "Graphs and tables", "3.13": "More or less likely",
  "3.14": "Money to 100 dollars",
  // Grade 4 (U13 to U15).
  "4.1": "Numbers to 10 000", "4.2": "Decimals", "4.3": "Comparing fractions", "4.4": "Adding and subtracting",
  "4.5": "Multiplying and dividing", "4.6": "Adding decimals", "4.7": "Facts to 20", "4.8": "Times tables",
  "4.9": "Pattern tables", "4.10": "Number relationships", "4.11": "Solving equations", "4.12": "Telling time",
  "4.13": "Polygons", "4.14": "Perimeter", "4.15": "Symmetry", "4.16": "Bar graphs", "4.17": "Probability",
  "4.18": "Making change",
  // Grade 5 (U16 to U18).
  "5.1": "Numbers to a million", "5.2": "Decimals", "5.3": "Equivalent fractions", "5.4": "Benchmarks",
  "5.5": "Adding and subtracting", "5.6": "Multiplying and dividing", "5.7": "Adding decimals", "5.8": "Facts to 20",
  "5.9": "Times tables", "5.10": "Pattern rules", "5.11": "Solving equations", "5.12": "Area",
  "5.13": "Area and perimeter", "5.14": "Time", "5.15": "Prisms and pyramids", "5.16": "Transformations",
  "5.17": "Double bar graphs", "5.18": "Probability", "5.19": "Money and plans",
  // Grade 6 (U19 to U21).
  "6.1": "Small and large numbers", "6.2": "Times tables", "6.3": "Order of operations", "6.4": "Factors and multiples",
  "6.5": "Mixed numbers", "6.6": "Ratios", "6.7": "Percents", "6.8": "Decimals",
  "6.9": "Patterns and graphs", "6.10": "Solving equations", "6.11": "Perimeter", "6.12": "Area of shapes",
  "6.13": "Angles", "6.14": "Volume and capacity", "6.15": "Triangles", "6.16": "Transformations",
  "6.17": "Line graphs", "6.18": "Probability", "6.19": "Budgets",
  // Grade 7 (U22 to U24).
  "7.1": "Times tables", "7.2": "Integers", "7.3": "Decimals", "7.4": "Fractions and percents",
  "7.5": "Linear relations", "7.6": "Two-step equations", "7.7": "Circles", "7.8": "Volume",
  "7.9": "Coordinates", "7.10": "Transformations", "7.11": "Circle graphs", "7.12": "Probability",
  "7.13": "Percents and money",
  // Grade 8 (U25 to U27).
  "8.1": "Squares and cubes", "8.2": "Square roots", "8.3": "Percents", "8.4": "Rates and ratios",
  "8.5": "Fractions", "8.6": "Linear relations", "8.7": "Expressions", "8.8": "Two-step equations",
  "8.9": "Surface area and volume", "8.10": "Pythagorean theorem", "8.11": "Nets and views",
  "8.12": "Mean, median, mode", "8.13": "Probability", "8.14": "Best buys",
  // Grade 9 (U28 to U30).
  "9.1": "Rational numbers", "9.2": "Exponents", "9.3": "Polynomials", "9.4": "Linear relations",
  "9.5": "Solving equations", "9.6": "Scale and proportion", "9.7": "Statistics", "9.8": "Budgets",
};
