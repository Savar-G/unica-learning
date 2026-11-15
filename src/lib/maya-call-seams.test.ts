import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { callSeams } from "@/lib/maya-call-seams";

// D-345: the MAYA_TUTOR_FAMILIES switch. Only the exact value "on" lets the tutor core teach family calls.

vi.mock("server-only", () => ({}));

const db = {} as SupabaseClient<Database>;

describe("callSeams: MAYA_TUTOR_FAMILIES", () => {
  it("is on only for the exact value on", () => {
    expect(callSeams(db, { env: { MAYA_TUTOR_FAMILIES: "on" } }).tutorFamilies).toBe(true);
  });

  it.each([undefined, "", "off", "ON", " on", "on ", "true", "1", "yes"])("is off for %j", (value) => {
    expect(callSeams(db, { env: value === undefined ? {} : { MAYA_TUTOR_FAMILIES: value } }).tutorFamilies).toBe(false);
  });
});
