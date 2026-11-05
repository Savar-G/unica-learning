import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// One lock order for a chat (#639): parent, child, call, as a family's deletion takes them. The two-session probe against
// the live database is in the PR; this keeps the newest definition of each function in that order.
const DIR = join(process.cwd(), "supabase/migrations");
const newest = (name: string) => {
  const open = new RegExp(`create (or replace )?function public\\.${name}\\(`);
  const file = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort().filter((f) => open.test(readFileSync(join(DIR, f), "utf8"))).at(-1)!;
  const text = readFileSync(join(DIR, file), "utf8");
  const start = text.search(open);
  return text.slice(start, text.indexOf("$$", text.indexOf("$$", start) + 2));
};
const place = (body: string, lock: RegExp) => {
  const at = body.search(lock);
  expect(at, String(lock)).toBeGreaterThanOrEqual(0);
  return at;
};
const PARENT = /from public\.parents[^;]*for share/;
const CHILD = /from public\.children[^;]*for (key share|update)/;
const CALL = /from public\.maya_calls[^;]*for update/;

describe("the lock order of a chat", () => {
  for (const name of ["append_maya_call_ink", "claim_maya_chat_message", "recover_maya_chat_message"]) {
    it(`${name} locks the parent, then the child, then the call`, () => {
      const body = newest(name);
      const [p, c, k] = [place(body, PARENT), place(body, CHILD), place(body, CALL)];
      expect(p).toBeLessThan(c);
      expect(c).toBeLessThan(k);
    });
  }

  it("append_maya_call_ink turns an old whole-board copy into the log before it takes new events", () => {
    const body = newest("append_maya_call_ink");
    const old = body.indexOf("child_ink->'events'");
    expect(old).toBeGreaterThan(body.search(CALL));
    expect(old).toBeLessThan(body.indexOf("p_events) with ordinality"));
  });
});
