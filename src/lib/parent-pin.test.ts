import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { PIN_POLICY, parentPins, type PinStore } from "@/lib/parent-pin";
import { memoryPinStore } from "@/lib/parent-pin-memory";

vi.mock("server-only", () => ({}));
const { pinStore } = await import("@/lib/parent-pin-store");
const { checkParentPin, resetForgottenPin, savePin } = await import("@/lib/parent-pin-server");

// The parent PIN module (#300, spec #295), through its interface: set, change, check, the attempt limit. The desk (P4)
// calls `check` to leave desk mode. Tests use a clock they move, and run against both stores: the in-memory one, and the
// Supabase one over a fake PostgREST whose database is the in-memory store (the database function claim_pin_attempt
// keeps the memory store's rules; its SQL was run on Postgres, see the PR).
const PARENT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const MINUTE = 60_000;

/** The Supabase adapter over a fake PostgREST: each request goes to the in-memory store, as the database function would. */
function fakeSupabase(database: ReturnType<typeof memoryPinStore>): PinStore {
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, "") ?? "";
    if (url.pathname === "/rest/v1/rpc/claim_pin_attempt") {
      const claim = await database.claim(body.p_parent, Date.parse(body.p_now), { maxAttempts: body.p_max, lockMs: body.p_lock_seconds * 1000 });
      const at = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
      const row = claim.kind === "none" ? { out_status: "none" }
        : claim.kind === "locked" ? { out_status: "locked", out_locked_until: at(claim.until) }
        : { out_status: "open", out_hash: claim.hash, out_attempts_left: claim.attemptsLeft, out_locked_until: at(claim.lockedUntil) };
      return Response.json([row]);
    }
    if (url.pathname !== "/rest/v1/parent_pins") throw new Error(`unexpected request ${url.pathname}`);
    if (init?.method === "GET") return Response.json((await database.has(eq("parent_id"))) ? { parent_id: eq("parent_id") } : null);
    if (init?.method === "POST" && url.searchParams.get("on_conflict") === "parent_id") {
      await database.reset(body.parent_id, body.pin_hash);
      return new Response(null, { status: 201 });
    }
    if (init?.method === "POST") {
      expect(url.searchParams.get("on_conflict")).toBeNull();
      if (await database.create(body.parent_id, body.pin_hash)) return new Response(null, { status: 201 });
      return Response.json({ code: "23505", message: "duplicate key value violates unique constraint" }, { status: 409 });
    }
    if (init?.method === "PATCH" && body.pin_hash) {
      const replaced = await database.replace(eq("parent_id"), eq("pin_hash"), body.pin_hash);
      return Response.json(replaced ? [{ parent_id: eq("parent_id") }] : []);
    }
    if (init?.method === "PATCH") {
      await database.clear(eq("parent_id"), eq("pin_hash"));
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${init?.method} ${url.search}`);
  } } });
  return pinStore(db);
}

const stores = [
  ["in-memory", (database: ReturnType<typeof memoryPinStore>) => database],
  ["Supabase", fakeSupabase],
] as const;

function setupWith(open: (database: ReturnType<typeof memoryPinStore>) => PinStore = (d) => d) {
  let clock = Date.UTC(2026, 9, 29, 12, 0, 0);
  const store = memoryPinStore();
  const pins = parentPins(open(store), { now: () => clock });
  return { store, pins, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

describe.each(stores)("the PIN module over the %s store", (_, open) => {
  const setup = (): ReturnType<typeof setupWith> => setupWith(open);

  describe("requests at the same time", () => {
    it("stores one of two first PINs set together; the other must give the stored PIN", async () => {
      const { pins } = setup();
      const results = await Promise.all([pins.set(PARENT, "1111"), pins.set(PARENT, "2222")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "current_required" }]);
      const kept = results[0].ok ? "1111" : "2222";
      expect(await pins.check(PARENT, kept)).toEqual({ ok: true });
    });

    it("lets only one of two changes made with the same current PIN replace it", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      const results = await Promise.all([pins.set(PARENT, "1111", "4821"), pins.set(PARENT, "2222", "4821")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "current_required" }]);
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "wrong" });
    });

    it("never replaces a PIN set at the same moment by a request without the current PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      const results = await Promise.all([pins.set(PARENT, "1111", "4821"), pins.set(PARENT, "9999")]);
      expect(results[1]).toEqual({ ok: false, error: "current_required" });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "9999")).toMatchObject({ ok: false, error: "wrong" });
    });
  });

  describe("a stale request never clears a newer PIN's lock", () => {
    /** A store whose next call to `method` waits until `release()`; `reached` resolves when that call starts. */
    function gate(inner: PinStore, method: "replace" | "clear") {
      let release!: () => void;
      let reached!: () => void;
      const opened = new Promise<void>((r) => { release = r; });
      const started = new Promise<void>((r) => { reached = r; });
      let armed = true;
      const store: PinStore = { ...inner, [method]: async (...args: unknown[]) => {
        if (armed) { armed = false; reached(); await opened; }
        return (inner[method] as (...a: unknown[]) => Promise<unknown>)(...args);
      } } as PinStore;
      return { store, started, release };
    }

    async function lockNewPin(pins: ReturnType<typeof parentPins>) {
      expect(await pins.set(PARENT, "1111", "4821")).toEqual({ ok: true });
      for (let i = 0; i < PIN_POLICY.maxAttempts; i += 1) await pins.check(PARENT, "0000");
      expect(await pins.check(PARENT, "1111")).toMatchObject({ ok: false, error: "locked" });
    }

    it("keeps the lock when a change made with the old PIN arrives late", async () => {
      const clock = Date.UTC(2026, 9, 29, 12, 0, 0);
      const database = memoryPinStore();
      const direct = parentPins(open(database), { now: () => clock });
      await direct.set(PARENT, "4821");
      const g = gate(open(database), "replace");
      const late = parentPins(g.store, { now: () => clock });
      const stale = late.set(PARENT, "2222", "4821");
      await g.started;
      await lockNewPin(direct);
      g.release();
      expect(await stale).toEqual({ ok: false, error: "current_required" });
      expect(await direct.check(PARENT, "1111")).toMatchObject({ ok: false, error: "locked" });
    });

    it("keeps the lock when a check with the old PIN arrives late", async () => {
      const clock = Date.UTC(2026, 9, 29, 12, 0, 0);
      const database = memoryPinStore();
      const direct = parentPins(open(database), { now: () => clock });
      await direct.set(PARENT, "4821");
      const g = gate(open(database), "clear");
      const late = parentPins(g.store, { now: () => clock });
      const stale = late.check(PARENT, "4821");
      await g.started;
      await lockNewPin(direct);
      g.release();
      expect(await stale).toEqual({ ok: true });
      expect(await direct.check(PARENT, "1111")).toMatchObject({ ok: false, error: "locked" });
    });
  });

  describe("setting a PIN", () => {
    it("has no PIN until the parent sets one, and then accepts it", async () => {
      const { pins } = setup();
      expect(await pins.isSet(PARENT)).toBe(false);
      expect(await pins.set(PARENT, "4821")).toEqual({ ok: true });
      expect(await pins.isSet(PARENT)).toBe(true);
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });

    it("refuses a wrong PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.check(PARENT, "1234")).toMatchObject({ ok: false, error: "wrong" });
    });

    it("refuses a PIN that is not exactly 4 digits, and stores nothing", async () => {
      const { pins } = setup();
      for (const bad of ["", "123", "12345", "12a4", "١٢٣٤", " 123", "12.4"]) {
        expect(await pins.set(PARENT, bad), JSON.stringify(bad)).toEqual({ ok: false, error: "invalid" });
      }
      expect(await pins.isSet(PARENT)).toBe(false);
    });

    it("says a PIN that is not set is not set, and does not accept any PIN", async () => {
      const { pins } = setup();
      expect(await pins.check(PARENT, "0000")).toEqual({ ok: false, error: "not_set" });
    });

    it("keeps each parent's PIN apart", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      await pins.set(OTHER, "9090");
      expect(await pins.check(PARENT, "9090")).toMatchObject({ ok: false, error: "wrong" });
      expect(await pins.check(OTHER, "9090")).toEqual({ ok: true });
    });
  });

  describe("what is stored", () => {
    it("is a salted hash: not the PIN, and different for two parents with the same PIN", async () => {
      const { pins, store } = setup();
      await pins.set(PARENT, "4821");
      await pins.set(OTHER, "4821");
      const [a, b] = store.rows().map((r) => r.hash);
      expect(a).not.toContain("4821");
      expect(b).not.toContain("4821");
      expect(a).not.toBe(b);
      expect(JSON.stringify(store.rows())).not.toContain("4821");
    });

    it("gives a new salt each time the same parent sets the same PIN", async () => {
      const { pins, store } = setup();
      await pins.set(PARENT, "4821");
      const first = store.rows()[0].hash;
      await pins.set(PARENT, "4821", "4821");
      expect(store.rows()[0].hash).not.toBe(first);
    });
  });

  describe("changing a PIN", () => {
    it("needs the current PIN when one is set", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.set(PARENT, "1111")).toEqual({ ok: false, error: "current_required" });
      expect(await pins.set(PARENT, "1111", "0000")).toMatchObject({ ok: false, error: "wrong" });
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });

    it("replaces the PIN when the current one is right: the new one works and the old one does not", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.set(PARENT, "1111", "4821")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "wrong" });
    });

    it("refuses a malformed new PIN and keeps the old one", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.set(PARENT, "12", "4821")).toEqual({ ok: false, error: "invalid" });
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });
  });

  describe("the attempt limit", () => {
    const WRONG = "0000";

    it("counts down the attempts left on each wrong PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      const lefts = [];
      for (let i = 0; i < PIN_POLICY.maxAttempts - 1; i++) {
        const r = await pins.check(PARENT, WRONG);
        expect(r).toMatchObject({ ok: false, error: "wrong" });
        if (!r.ok && r.error === "wrong") lefts.push(r.attemptsLeft);
      }
      expect(lefts).toEqual([4, 3, 2, 1]);
    });

    it("refuses for a period after the last wrong attempt, even for the right PIN", async () => {
      const { pins, advance, now } = setup();
      await pins.set(PARENT, "4821");
      const start = now();
      for (let i = 0; i < PIN_POLICY.maxAttempts - 1; i++) await pins.check(PARENT, WRONG);
      expect(await pins.check(PARENT, WRONG)).toEqual({ ok: false, error: "locked", retryAt: start + PIN_POLICY.lockMs });
      advance(PIN_POLICY.lockMs - MINUTE);
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "locked" });
      advance(MINUTE);
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });

    it("does not let a wrong PIN extend the lock", async () => {
      const { pins, advance, now } = setup();
      await pins.set(PARENT, "4821");
      const start = now();
      for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await pins.check(PARENT, WRONG);
      advance(5 * MINUTE);
      expect(await pins.check(PARENT, WRONG)).toEqual({ ok: false, error: "locked", retryAt: start + PIN_POLICY.lockMs });
    });

    it("gives a fresh set of attempts after the lock ends", async () => {
      const { pins, advance } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await pins.check(PARENT, WRONG);
      advance(PIN_POLICY.lockMs);
      expect(await pins.check(PARENT, WRONG)).toMatchObject({ ok: false, error: "wrong", attemptsLeft: PIN_POLICY.maxAttempts - 1 });
    });

    it("resets the count after the right PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < PIN_POLICY.maxAttempts - 1; i++) await pins.check(PARENT, WRONG);
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
      expect(await pins.check(PARENT, WRONG)).toMatchObject({ ok: false, error: "wrong", attemptsLeft: PIN_POLICY.maxAttempts - 1 });
    });

    it("limits each parent apart", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      await pins.set(OTHER, "9090");
      for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await pins.check(PARENT, WRONG);
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "locked" });
      expect(await pins.check(OTHER, "9090")).toEqual({ ok: true });
    });

    it("allows only the attempts in the limit when guesses arrive at the same time", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      // 40 guesses together, with the right PIN last: only the first few are checked.
      const guesses = Array.from({ length: 40 }, (_, i) => (i === 39 ? "4821" : String(1000 + i)));
      const results = await Promise.all(guesses.map((g) => pins.check(PARENT, g)));
      const checked = results.filter((r) => r.ok || r.error === "wrong");
      expect(checked.length).toBeLessThanOrEqual(PIN_POLICY.maxAttempts);
      expect(results.at(-1)).toMatchObject({ ok: false, error: "locked" });
    });

    it("applies the limit to the current PIN when changing a PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await pins.set(PARENT, "1111", WRONG);
      expect(await pins.set(PARENT, "1111", "4821")).toMatchObject({ ok: false, error: "locked" });
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "locked" });
    });

    it("clears the lock when the parent sets a new PIN after a right current PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < PIN_POLICY.maxAttempts - 1; i++) await pins.check(PARENT, WRONG);
      expect(await pins.set(PARENT, "1111", "4821")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
    });

    it("does not count a malformed PIN as an attempt", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < 10; i++) expect(await pins.check(PARENT, "12")).toEqual({ ok: false, error: "invalid" });
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });
  });

  // Forgot PIN (#301): the caller has proved the parent's password; reset needs no current PIN.
  describe("resetting a forgotten PIN", () => {
    it("replaces the PIN without the current one: the new one works and the old one does not", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.reset(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "wrong" });
    });

    it("ends a lock", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await pins.check(PARENT, "0000");
      expect(await pins.check(PARENT, "4821")).toMatchObject({ ok: false, error: "locked" });
      expect(await pins.reset(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
    });

    it("sets a first PIN when none is set", async () => {
      const { pins } = setup();
      expect(await pins.reset(PARENT, "1111")).toEqual({ ok: true });
      expect(await pins.check(PARENT, "1111")).toEqual({ ok: true });
    });

    it("refuses a malformed PIN and keeps the old one", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      expect(await pins.reset(PARENT, "12a4")).toEqual({ ok: false, error: "invalid" });
      expect(await pins.check(PARENT, "4821")).toEqual({ ok: true });
    });

    it("changes only that parent's PIN", async () => {
      const { pins } = setup();
      await pins.set(PARENT, "4821");
      await pins.set(OTHER, "4821");
      await pins.reset(PARENT, "1111");
      expect(await pins.check(OTHER, "4821")).toEqual({ ok: true });
    });
  });
});

describe("the server functions", () => {
  const withPins = () => parentPins(memoryPinStore());

  it("checkParentPin: the desk's exit check accepts the right PIN and refuses a wrong one", async () => {
    const pins = withPins();
    await savePin(PARENT, { pin: "4821" }, pins);
    expect(await checkParentPin(PARENT, "4821", pins)).toEqual({ ok: true });
    expect(await checkParentPin(PARENT, "0000", pins)).toMatchObject({ ok: false, error: "wrong", attemptsLeft: PIN_POLICY.maxAttempts - 1 });
  });

  it("checkParentPin: stays closed when the store is not there or fails", async () => {
    expect(await checkParentPin(PARENT, "4821", null)).toEqual({ ok: false, error: "unavailable" });
    const broken = parentPins({ ...memoryPinStore(), claim: async () => { throw new Error("database down"); } });
    expect(await checkParentPin(PARENT, "4821", broken)).toEqual({ ok: false, error: "unavailable" });
  });

  it("savePin: sets a first PIN, then needs the current one, with a status for each answer", async () => {
    const pins = withPins();
    expect(await savePin(PARENT, { pin: "4821" }, pins)).toEqual({ status: 200, result: { ok: true } });
    expect(await savePin(PARENT, { pin: "1111" }, pins)).toEqual({ status: 400, result: { ok: false, error: "current_required" } });
    expect(await savePin(PARENT, { pin: "1111", current: "0000" }, pins)).toMatchObject({ status: 403, result: { ok: false, error: "wrong" } });
    expect(await savePin(PARENT, { pin: "1111", current: "4821" }, pins)).toEqual({ status: 200, result: { ok: true } });
    expect(await checkParentPin(PARENT, "1111", pins)).toEqual({ ok: true });
  });

  it("resetForgottenPin: sets a new PIN only after the account password is right, and ends a lock", async () => {
    const pins = withPins();
    await savePin(PARENT, { pin: "4821" }, pins);
    for (let i = 0; i < PIN_POLICY.maxAttempts; i++) await checkParentPin(PARENT, "0000", pins);
    const tried: string[] = [];
    const password = (answer: "ok" | "wrong" | "unavailable") => async (p: string) => { tried.push(p); return answer; };
    expect(await resetForgottenPin(PARENT, { password: "guess", pin: "1111" }, password("wrong"), pins)).toEqual({ status: 403, result: { ok: false, error: "wrong_password" } });
    expect(await resetForgottenPin(PARENT, { password: "right", pin: "1111" }, password("unavailable"), pins)).toEqual({ status: 503, result: { ok: false, error: "unavailable" } });
    expect(await checkParentPin(PARENT, "1111", pins)).toMatchObject({ ok: false, error: "locked" });
    expect(await resetForgottenPin(PARENT, { password: "right", pin: "1111" }, password("ok"), pins)).toEqual({ status: 200, result: { ok: true } });
    expect(await checkParentPin(PARENT, "1111", pins)).toEqual({ ok: true });
    expect(tried).toEqual(["guess", "right", "right"]);
  });

  it("resetForgottenPin: checks the new PIN before the password, and refuses a malformed body", async () => {
    const pins = withPins();
    let asked = 0;
    const password = async () => { asked += 1; return "ok" as const; };
    expect(await resetForgottenPin(PARENT, { password: "right", pin: "12" }, password, pins)).toEqual({ status: 400, result: { ok: false, error: "invalid" } });
    for (const body of [null, {}, { password: "right" }, { password: "", pin: "1111" }, { password: 1, pin: "1111" }]) {
      expect((await resetForgottenPin(PARENT, body, password, pins)).status, JSON.stringify(body)).toBe(400);
    }
    expect(asked).toBe(0);
    expect(await resetForgottenPin(PARENT, { password: "right", pin: "1111" }, password, null)).toMatchObject({ status: 503 });
  });

  it("savePin: answers 429 once the attempts are used, and 400 for a malformed body", async () => {
    const pins = withPins();
    await savePin(PARENT, { pin: "4821" }, pins);
    let last;
    for (let i = 0; i < PIN_POLICY.maxAttempts; i++) last = await savePin(PARENT, { pin: "1111", current: "0000" }, pins);
    expect(last).toMatchObject({ status: 429, result: { ok: false, error: "locked" } });
    for (const body of [null, {}, { pin: 4821 }, { pin: "4821", current: 1 }, "4821"]) {
      expect((await savePin(OTHER, body, pins)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await savePin(OTHER, { pin: "4821" }, null)).toMatchObject({ status: 503 });
  });
});
