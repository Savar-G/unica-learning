/**
 * Thousands groups (scan edge sweep, 2026-11-14): "2,520", "2 520" and "12,345,678" are one whole number. The first group
 * has 1 to 3 digits with no leading zero, every later group exactly 3, and one kind of separator (one comma or one
 * space) throughout. A decimal point never mixes with groups, so "1,5", "1,234.5", "12 13", "1,23" and "12 or 13" stay
 * unread and go to our team.
 */
const GROUPED = /^([+-]?)([1-9]\d{0,2})((?:,\d{3})+|(?: \d{3})+)$/;

/** Never let floating-point rounding turn a different written number into the key. The caller keeps the raw text. */
export function exactNumber(text: string, wholeOnly: boolean): number | null {
  const grouped = text.match(GROUPED);
  if (grouped && wholeOnly && grouped[1]) return null;
  if (grouped) text = `${grouped[1]}${grouped[2]}${grouped[3].replace(/[, ]/g, "")}`;
  if (!(wholeOnly ? /^\d+$/ : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/).test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
  const normalize = (raw: string) => {
    const [integer, fraction = ""] = raw.replace(/^[+-]/, "").split(".");
    const digits = `${(integer || "0").replace(/^0+(?=\d)/, "")}${fraction.replace(/0+$/, "") ? `.${fraction.replace(/0+$/, "")}` : ""}`;
    return `${raw.startsWith("-") && digits !== "0" ? "-" : ""}${digits}`;
  };
  return normalize(text) === normalize(String(value)) ? value : null;
}
