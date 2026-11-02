// Independent saved-output audit. Do not import Maya's counter, speech matching or number spelling here.
// Count numeric groups directly so a defect in production normalisation cannot hide an overlong gate turn.
function integerCount(digits: string): number {
  if (digits.length > 12) return digits.length;
  const groups = digits.replace(/^0+(?=\d)/, "").match(/\d{1,3}(?=(?:\d{3})*$)/g) ?? [];
  if (Number(digits) === 0) return 1;
  return groups.reduce((count, group, i) => {
    const n = Number(group);
    if (!n) return count;
    const rest = n % 100;
    const hundreds = n >= 100 ? 2 : 0;
    const small = rest === 0 ? 0 : rest < 20 || rest % 10 === 0 ? 1 : 2;
    return count + hundreds + small + (i < groups.length - 1 ? 1 : 0);
  }, 0);
}

/** Count every spoken word, including conjunctions, expanded contractions, signs and mixed-number "and". */
export function gateWordCount(text: string): number {
  const expanded = text.normalize("NFC").toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/(?<![a-z])(?:mm|cm|dm|km|m)²/g, "square unit")
    .replace(/(?<![\d./])(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d/])/g, "$1 and $2/$3")
    .replace(/(?<=[\p{L}\p{M}])-(?=[\p{L}\p{M}])/gu, " ");
  // Isolate ASCII numbers before scanning Unicode words, including numbers beside a unit or name.
  const separated = expanded.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+/g, " $& ");
  const tokens = separated.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:'[\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*|[+×*÷=−–%/-]/gu) ?? [];
  return tokens.reduce((count, token) => {
    if (/^[\d.]/.test(token)) {
      const [whole, decimals] = token.replace(/,/g, "").split(".");
      return count + integerCount(whole || "0") + (decimals === undefined ? 0 : 1 + decimals.length);
    }
    if (token === "/") return count; // "3/8" says "three eighths"; both numeric parts have been counted.
    if (token === "÷") return count + 2;
    if (/^(?:let's|can't|cannot|won't)$|n't$|'(?:re|m|ll|ve|d)$|^(?:it|that|what|here|there|he|she|who|where)'s$/.test(token)) return count + 2;
    return count + 1;
  }, 0);
}
