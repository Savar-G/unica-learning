import { describe, expect, it } from "vitest";
import { DESK_ACCESS_STATES, DESK_GATE, DESK_HOME, deskAccess, deskArea, deskGate, lockCookie, readLock, type DeskGate } from "@/lib/desk";

// The desk on this device as one machine (docs/state-machines.md, item 4): the states of `deskAccess`, the areas of the
// site, and `DESK_GATE`, the table the proxy and every route read. The table must give, for every request, the answer the
// gate gave before it became a table.

const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER_PARENT = "44444444-4444-4444-8444-444444444444";
const CHILD = "22222222-2222-4222-8222-222222222222";

/** The gate as it was written before the table (src/lib/desk.ts at 293aefd2), kept here only to compare with. */
function gateBefore(pathname: string, cookie: string | undefined, sessionParent: string | null, sessionKnown = true): DeskGate {
  const lock = readLock(cookie);
  if (!lock) return "pass";
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (!sessionKnown) {
    if (under("/sign-in") || under("/start")) return "pass";
  } else if (!sessionParent || lock.parentId !== sessionParent) {
    return "pass";
  }
  if (under(DESK_HOME) || under("/api/desk") || under("/auth")) return "pass";
  if (under("/api")) return "refuse";
  return "to-desk";
}

const PATHS = [
  "/", "/tutor", "/tutor/p/abc", "/tutors", "/api/desk", "/api/desk/leave", "/api/desk/forgot-pin", "/api/desk/state", "/api/desks",
  "/auth", "/auth/callback", "/authx", "/sign-in", "/sign-in/reset", "/sign-inx", "/start", "/start/x", "/starting",
  "/api", "/api/account/pin", "/api/account/maya-notice", "/api/admin/cards/1/start", "/apix",
  "/account", "/account/pin", "/account/maya-notice", "/account/scan/abc", "/admin", "/admin/maya",
];
const COOKIES = [undefined, "", "not a lock", lockCookie(PARENT, CHILD), lockCookie(OTHER_PARENT, CHILD), `${PARENT}.${CHILD}.more`];
const SESSIONS: [string | null, boolean][] = [[PARENT, true], [OTHER_PARENT, true], [null, true], ["", true], [PARENT, false], [null, false]];

describe("desk access", () => {
  it("gives every request the same answer as the gate before the table", () => {
    let compared = 0;
    for (const path of PATHS) for (const cookie of COOKIES) for (const [parent, known] of SESSIONS) {
      expect(deskGate(path, cookie, parent, known), `${path} ${cookie} ${parent} ${known}`).toBe(gateBefore(path, cookie, parent, known));
      compared++;
    }
    expect(compared).toBe(PATHS.length * COOKIES.length * SESSIONS.length);
  });

  it("reaches every state, and only the signed-in parent's own cookie is open", () => {
    const lock = lockCookie(PARENT, CHILD);
    expect(deskAccess(undefined, PARENT)).toEqual({ state: "closed" });
    expect(deskAccess("not a lock", PARENT)).toEqual({ state: "closed" });
    expect(deskAccess(undefined, null, false)).toEqual({ state: "closed" });
    expect(deskAccess(lock, PARENT)).toEqual({ state: "open", lock: { parentId: PARENT, childId: CHILD } });
    expect(deskAccess(lock, OTHER_PARENT)).toEqual({ state: "latent", lock: { parentId: PARENT, childId: CHILD } });
    expect(deskAccess(lock, null)).toEqual({ state: "latent", lock: { parentId: PARENT, childId: CHILD } });
    expect(deskAccess(lock, PARENT, false)).toEqual({ state: "session_unknown", lock: { parentId: PARENT, childId: CHILD } });
    const reached = new Set(COOKIES.flatMap((cookie) => SESSIONS.map(([parent, known]) => deskAccess(cookie, parent, known).state)));
    expect([...reached].sort()).toEqual([...DESK_ACCESS_STATES].sort());
  });

  it("puts each path in one area", () => {
    expect(PATHS.map((path) => [path, deskArea(path)])).toEqual([
      ["/", "page"], ["/tutor", "desk"], ["/tutor/p/abc", "desk"], ["/tutors", "page"], ["/api/desk", "desk"], ["/api/desk/leave", "desk"],
      ["/api/desk/forgot-pin", "desk"], ["/api/desk/state", "desk"], ["/api/desks", "api"], ["/auth", "desk"], ["/auth/callback", "desk"],
      ["/authx", "page"], ["/sign-in", "sign_in"], ["/sign-in/reset", "sign_in"], ["/sign-inx", "page"], ["/start", "sign_in"],
      ["/start/x", "sign_in"], ["/starting", "page"], ["/api", "api"], ["/api/account/pin", "api"], ["/api/account/maya-notice", "api"],
      ["/api/admin/cards/1/start", "api"], ["/apix", "page"], ["/account", "page"], ["/account/pin", "page"],
      ["/account/maya-notice", "page"], ["/account/scan/abc", "page"], ["/admin", "page"], ["/admin/maya", "page"],
    ]);
  });

  it("holds the account only while the desk is open or the session cannot be read, and never holds the desk itself", () => {
    for (const state of DESK_ACCESS_STATES) {
      const row = DESK_GATE[state];
      expect(row.desk, state).toBe("pass");
      const holds = state === "open" || state === "session_unknown";
      expect(row.api, state).toBe(holds ? "refuse" : "pass");
      expect(row.page, state).toBe(holds ? "to-desk" : "pass");
    }
    expect(DESK_GATE.open.sign_in).toBe("to-desk");
    expect(DESK_GATE.session_unknown.sign_in).toBe("pass");
  });
});
