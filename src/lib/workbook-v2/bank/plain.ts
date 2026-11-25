// A copy of data as JSON holds it. The build reads only the copy and the hash is made from it, so nothing that the hash
// does not cover (an inherited value, a hidden or computed field) can decide a book.

const MAX_DEPTH = 32;

export type Plain = { ok: true; value: unknown } | { ok: false; problems: string[] };

class Copier {
  readonly problems: string[] = [];

  private stop(place: string, text: string): undefined {
    this.problems.push(`${place}: ${text}.`);
    return undefined;
  }

  copy(value: unknown, place: string, inside: readonly object[]): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    // JSON has one zero.
    if (typeof value === "number" && Number.isFinite(value)) return value === 0 ? 0 : value;
    if (typeof value !== "object") return this.stop(place, "this must be a plain value");
    if (inside.includes(value)) return this.stop(place, "this holds itself");
    if (inside.length >= MAX_DEPTH) return this.stop(place, "this is nested too deep");
    return Array.isArray(value) ? this.list(value, place, [...inside, value]) : this.object(value, place, [...inside, value]);
  }

  private list(list: readonly unknown[], place: string, inside: readonly object[]): unknown {
    const { length } = list;
    const keys = Reflect.ownKeys(list);
    const plain = Object.getPrototypeOf(list) === Array.prototype && keys.length === length + 1 && keys.slice(0, length).every((key, i) => key === String(i));
    if (!plain) return this.stop(place, "this must be a plain list");
    return Array.from({ length }, (_, i) => this.field(list, String(i), `${place}[${i}]`, inside));
  }

  private object(object: object, place: string, inside: readonly object[]): unknown {
    const prototype: unknown = Object.getPrototypeOf(object);
    const keys = Reflect.ownKeys(object).filter((key) => typeof key === "string");
    if ((prototype !== Object.prototype && prototype !== null) || keys.length !== Reflect.ownKeys(object).length) return this.stop(place, "this must be a plain object");
    return Object.fromEntries(keys.map((key) => [key, this.field(object, key, `${place}${inside.length > 1 ? "." : ", "}${key}`, inside)]));
  }

  private field(holder: object, key: string, place: string, inside: readonly object[]): unknown {
    const field = Object.getOwnPropertyDescriptor(holder, key);
    if (!field?.enumerable) return this.stop(place, "this must be a plain value");
    // A computed field has no value of its own, and no value is not plain.
    return this.copy(field.value, place, inside);
  }
}

/** The copy, or every place that holds something that JSON cannot. */
export function plainCopy(what: string, value: unknown): Plain {
  const copier = new Copier();
  const copy = copier.copy(value, what, []);
  return copier.problems.length > 0 ? { ok: false, problems: copier.problems } : { ok: true, value: copy };
}
