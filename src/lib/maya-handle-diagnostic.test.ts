import { describe, expect, it } from "vitest";
import { createHandleDiagnosticIds } from "@/lib/maya-handle-diagnostic";

describe("handle diagnostic ids", () => {
  it("keeps one id per object, even a frozen one, and does not change it", () => {
    const get = createHandleDiagnosticIds("call-1");
    const h = Object.freeze({ kind: "speculative", micros: 5 });
    expect(get(h)).toBe(get(h));
    expect(Object.keys(h)).toEqual(["kind", "micros"]);
  });
  it("gives distinct ids to identical-field handles and to separate scopes", () => {
    const a = createHandleDiagnosticIds("call-1");
    const b = createHandleDiagnosticIds("call-2");
    const x = { kind: "speculative", micros: 5 };
    const y = { kind: "speculative", micros: 5 };
    expect(a(x)).not.toBe(a(y));
    expect(a(x)).not.toBe(b(x));
  });
});
