// The Maya notice store (src/lib/maya-notice.ts, #529) in memory, for tests. It keeps the database's rule: the first row
// at a family and version stays. `fail` makes every call throw, as a lost database does.
import type { NoticeAcceptance, NoticeStore } from "@/lib/maya-notice";

export function memoryNoticeStore(clock: () => number = Date.now): NoticeStore & { rows(): NoticeAcceptance[]; fail(on: boolean): void } {
  const rows: NoticeAcceptance[] = [];
  let failing = false;
  const check = () => { if (failing) throw new Error("notice store failed"); };
  return {
    async read(parentId, version) {
      check();
      const row = rows.find((r) => r.parentId === parentId && r.version === version);
      return row ? { ...row } : null;
    },
    async save({ parentId, version, acceptedBy }) {
      check();
      if (rows.some((r) => r.parentId === parentId && r.version === version)) return;
      rows.push({ parentId, version, acceptedBy, acceptedAt: new Date(clock()).toISOString() });
    },
    rows: () => rows.map((r) => ({ ...r })),
    fail: (on) => { failing = on; },
  };
}
