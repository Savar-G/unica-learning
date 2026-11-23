const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "\u2070": "^0",
  "\u00B9": "^1",
  "\u00B2": "^2",
  "\u00B3": "^3",
  "\u2074": "^4",
  "\u2075": "^5",
  "\u2076": "^6",
  "\u2077": "^7",
  "\u2078": "^8",
  "\u2079": "^9",
};

export function normalizeProseText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?:;,]+$/g, "")
    .trim();
}

export function normalizeNotationText(text: string): string {
  let out = text;

  // Turn \frac{A}{B} into ((A)/(B)) from innermost out, always keeping parentheses.
  let prev = "";
  while (prev !== out) {
    prev = out;
    out = out.replace(
      /\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      (_match, num: string, den: string) => `((${num})/(${den}))`,
    );
  }

  // Map the fixed list of equivalent signs and remove whitespace except one space between
  // two characters that are both letters or digits (so "2 1/2" stays distinct from "21/2").
  out = out
    .replace(/\\times(?![A-Za-z])|\\cdot(?![A-Za-z])|[\u00D7\u00B7\u2217]/g, "*")
    .replace(/\\div(?![A-Za-z])|[\u00F7\u2044\u2215]/g, "/")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/g, (ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .replace(/(?<=[\p{L}\p{N}])\s+(?=[\p{L}\p{N}])/gu, " ")
    .replace(/(?<![\p{L}\p{N}])\s+|\s+(?![\p{L}\p{N}])/gu, "");

  return out;
}
