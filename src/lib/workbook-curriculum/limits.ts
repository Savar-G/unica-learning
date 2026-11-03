/** Shared admission limits. Check these before retaining syntax trees or compiling a template. */
export const INPUT_LIMITS = Object.freeze({ expressionCharacters: 500, expressionTokens: 256, expressionDepth: 32, derivedEntries: 30, slotEntries: 16, templateBytes: 4096, identifierCharacters: 64, stringLength: 1024, collectionLength: 256, integerBits: 256 });
export class ExpressionError extends Error {
  constructor(message: string) { super(message); this.name = "ExpressionError"; }
}
export function limitError(message: string): never { throw new ExpressionError(message); }
export function assertExpressionInput(source: string): void {
  if (typeof source !== "string" || source.length > INPUT_LIMITS.expressionCharacters) limitError("Expression exceeds the character limit");
}
function entriesWithin(value: unknown, maximum: number, label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) limitError(`Invalid ${label}`);
  let count = 0;
  for (const key in value) if (Object.hasOwn(value, key)) {
    if (++count > maximum) limitError(`${label} exceeds the entry limit`);
    if (key.length > INPUT_LIMITS.identifierCharacters || ["__proto__", "prototype", "constructor"].includes(key)) limitError(`${label} has an invalid key`);
  }
}
/** The walk stops at the first cap. Never stringify a complete unchecked template. */
export function assertTemplateInput(input: unknown): void {
  entriesWithin(input, 7, "Template");
  const t = input as Record<string, unknown>;
  if (typeof t.text !== "string" || typeof t.answer !== "string" || !["bare", "missing", "true-false", "choose", "story", "explain", "compare", "picture"].includes(String(t.format)) || !["easy", "medium", "hard"].includes(String(t.difficulty))) limitError("Invalid template fields");
  if (t.derived != null) entriesWithin(t.derived, INPUT_LIMITS.derivedEntries, "Template derived");
  entriesWithin(t.slots, INPUT_LIMITS.slotEntries, "Template slots");
  assertExpressionInput(t.answer as string);
  if (t.check !== undefined) assertExpressionInput(t.check as string);
  if (t.derived) for (const source of Object.values(t.derived)) assertExpressionInput(source as string);
  let bytes = 0;
  const add = (n: number) => { bytes += n; if (bytes > INPUT_LIMITS.templateBytes) limitError("Template exceeds the total byte limit"); };
  const encoder = new TextEncoder();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6) limitError("Template exceeds the input nesting limit");
    if (typeof value === "string") {
      if (value.length > INPUT_LIMITS.stringLength) limitError("Template string exceeds the length limit");
      add(encoder.encode(JSON.stringify(value)).length);
    } else if (typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || value === null) add(String(value).length);
    else if (Array.isArray(value)) {
      if (value.length > INPUT_LIMITS.collectionLength) limitError("Template collection exceeds the length limit");
      add(2 + Math.max(0, value.length - 1));
      for (const item of value) walk(item, depth + 1);
    } else if (value && typeof value === "object") {
      add(2); let count = 0;
      for (const key in value) if (Object.hasOwn(value, key)) {
        if ((value as Record<string, unknown>)[key] === undefined) continue;
        if (++count > INPUT_LIMITS.derivedEntries) limitError("Template object exceeds the entry limit");
        if (key.length > INPUT_LIMITS.identifierCharacters || ["__proto__", "prototype", "constructor"].includes(key)) limitError("Template has an invalid key");
        add(count > 1 ? 2 : 1); walk(key, depth + 1); walk((value as Record<string, unknown>)[key], depth + 1);
      }
    } else limitError("Invalid template value");
  };
  walk(input, 0);
}
/** The fill API also checks context inputs, including callers that did not use the JSON loader. */
export function assertContextInput(input: unknown): void {
  entriesWithin(input, 11, "Contexts");
  const c = input as Record<string, unknown>;
  const string = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= INPUT_LIMITS.stringLength;
  if (!Array.isArray(c.people) || !c.people.length || c.people.length > INPUT_LIMITS.collectionLength) limitError("Invalid context people");
  for (const person of c.people) {
    entriesWithin(person, 4, "Context person");
    if (!["name", "they", "them", "their"].every(k => string((person as Record<string, unknown>)[k]))) limitError("Invalid context person fields");
  }
  for (const key of ["things", "animals", "foods", "places", "containers", "units_length", "units_mass", "units_capacity"]) {
    const list = c[key];
    if (!Array.isArray(list) || !list.length || list.length > INPUT_LIMITS.collectionLength || !list.every(string)) limitError(`Invalid context ${key}`);
  }
  entriesWithin(c.money, 3, "Context money");
  const money = c.money as Record<string, unknown>;
  if (!string(money.currency)) limitError("Invalid context currency");
  for (const key of ["coins", "bills"]) {
    const list = money[key];
    if (!Array.isArray(list) || !list.length || list.length > INPUT_LIMITS.collectionLength || !list.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 2 ** INPUT_LIMITS.integerBits)) limitError(`Invalid context ${key}`);
  }
}
