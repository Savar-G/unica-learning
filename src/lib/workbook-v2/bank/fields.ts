// Reads the fields of a bank file one by one. Each problem names its place in plain words, and reading goes on after
// one, so that the author sees all of them. A field that this version does not know is a problem too: a misspelled
// field would change nothing, and a note about a source must not travel with the content.
import { isPrintable } from "../contract";
import { isRecord } from "../shapes/shape";

export type Fields = Record<string, unknown>;

export const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);

export class FieldReader {
  readonly problems: string[] = [];

  problem(place: string, text: string): void {
    this.problems.push(`${place}: ${text}.`);
  }

  /** The value as an object with no field outside the lists, or null. A field of `optional` may be left out. */
  object(place: string, value: unknown, names: readonly string[], optional: readonly string[] = []): Fields | null {
    if (!isRecord(value)) {
      this.problem(place, "this must be an object");
      return null;
    }
    for (const name of Object.keys(value)) if (!names.includes(name) && !optional.includes(name)) this.problem(place, `unknown field "${name}"`);
    const missing = names.filter((name) => !Object.prototype.hasOwnProperty.call(value, name));
    for (const name of missing) this.problem(place, `${name} is missing`);
    return missing.length > 0 ? null : value;
  }

  id(place: string, fields: Fields): string | null {
    if (isId(fields.id)) return fields.id;
    this.problem(place, "id must use only small letters, digits and dashes");
    return null;
  }

  /** One line of printed text. */
  text(place: string, fields: Fields, name: string, maxCharacters: number): string | null {
    const value = fields[name];
    if (typeof value !== "string" || value === "" || value !== value.trim()) this.problem(place, `${name} must be text with no space at its ends`);
    else if (!isPrintable(value)) this.problem(place, `${name} has a character that the fonts cannot print`);
    else if (value.length > maxCharacters) this.problem(place, `${name} has ${value.length} characters and the limit is ${maxCharacters}`);
    else return value;
    return null;
  }

  count(place: string, fields: Fields, name: string): number | null {
    const value = fields[name];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
    this.problem(place, `${name} must be a whole number, 1 or more`);
    return null;
  }

  list(place: string, fields: Fields, name: string): unknown[] {
    const value = fields[name];
    if (!Array.isArray(value)) this.problem(place, `${name} must be a list`);
    else if (value.length === 0) this.problem(place, `${name} must have at least 1 entry`);
    else return value;
    return [];
  }

  /** A problem for each value that comes back after its first use. */
  unique(what: string, values: readonly (string | number | null)[], place = ""): void {
    const seen = new Set<string | number>();
    const told = new Set<string | number>();
    for (const value of values) {
      if (value === null) continue;
      if (seen.has(value) && !told.has(value)) {
        const name = typeof value === "number" ? value : `"${value}"`;
        this.problems.push(place ? `${place}: the ${what} ${name} is used more than once.` : `The ${what} ${name} is used more than once.`);
        told.add(value);
      }
      seen.add(value);
    }
  }
}
