import { describe, expect, it } from "vitest";
import { allowedValues, enumCheck } from "@/lib/database-checks";

const check = (table: string, name: string, definition: string) => ({ table, name, definition });

describe("enumCheck", () => {
  it("reads a one-of-these-values check as Postgres prints it", () => {
    expect(enumCheck("CHECK ((status = ANY (ARRAY['claimed'::text, 'sent'::text, 'failed'::text])))")).toEqual({ column: "status", values: ["claimed", "sent", "failed"] });
    expect(enumCheck("CHECK ((made_by = 'maya-demo-child'::text))")).toEqual({ column: "made_by", values: ["maya-demo-child"] });
    expect(enumCheck("CHECK ((note = ANY (ARRAY['it''s'::text])))")).toEqual({ column: "note", values: ["it's"] });
  });

  it("is null for every other kind of check", () => {
    expect(enumCheck("CHECK (((attempts >= 0) AND (attempts <= 10)))")).toBeNull();
    expect(enumCheck("CHECK (((kind = ANY (ARRAY['continue'::text, 'come_back'::text])) = (assessment_id IS NOT NULL)))")).toBeNull();
    expect(enumCheck("CHECK (((observation ->> 'state'::text) = ANY (ARRAY['pending'::text])))")).toBeNull();
    expect(enumCheck("CHECK ((jsonb_typeof(versions) = 'object'::text))")).toBeNull();
  });
});

describe("allowedValues", () => {
  const checks = [
    check("runs", "runs_status_check", "CHECK ((status = ANY (ARRAY['queued'::text, 'done'::text])))"),
    check("runs", "runs_check", "CHECK (((status = 'done'::text) = (finished_at IS NOT NULL)))"),
    check("other", "other_status_check", "CHECK ((status = ANY (ARRAY['x'::text])))"),
  ];

  it("gives the column's values, sorted, from its own table only", () => {
    expect(allowedValues("runs", "status", checks)).toEqual(["done", "queued"]);
    expect(allowedValues("other", "status", checks)).toEqual(["x"]);
  });

  it("is null for a column with no such check", () => {
    expect(allowedValues("runs", "step", checks)).toBeNull();
    expect(allowedValues("missing", "status", checks)).toBeNull();
  });

  it("refuses two checks on one column that disagree", () => {
    const two = [...checks, check("runs", "runs_status_check1", "CHECK ((status = ANY (ARRAY['queued'::text])))")];
    expect(() => allowedValues("runs", "status", two)).toThrow("runs.status has checks that disagree");
  });

  it("reads the generated snapshot of the live schema", () => {
    expect(allowedValues("email_log", "status")).toEqual(["claimed", "failed", "sent"]);
  });
});
