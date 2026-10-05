// Single source for brand and offer facts. The brand name is a placeholder (DESIGN.md D1).
export const BRAND = "Pagewise";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 49, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 89, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  eyebrow: "The future of learning is on paper.",
  sub: "Math and reading workbooks made for your child, mailed home, and adapted after every book.",
};

// Forward sortation areas that start with these characters are treated as Metro Vancouver.
export const DELIVERY_FSA = /^V[3-7]/;

export const SOURCES = [
  "Delgado, P., Vargas, C., Ackerman, R., & Salmerón, L. (2018). Don't throw away your printed books: A meta-analysis on the effects of reading media on reading comprehension. Educational Research Review, 25, 23-38.",
  "Malpique, A., Valcan, D., Pino-Pasternak, D., Ledger, S., & Merga, M. (2023). Effect sizes of writing modality on K-6 students' writing and reading performance: A meta-analysis. The Australian Educational Researcher, 51, 2001-2030.",
  "Van der Meer, A. L. H., & van der Weel, F. R. (2024). Handwriting but not typewriting leads to widespread brain connectivity. Frontiers in Psychology, 14, 1219945.",
];
