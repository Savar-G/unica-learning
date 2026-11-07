/** Never let floating-point rounding turn a different written number into the key. */
export function exactNumber(text: string, wholeOnly: boolean): number | null {
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
