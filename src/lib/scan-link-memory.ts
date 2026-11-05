import { SCAN_LINK_WINDOW_MS, SCAN_LINKS_PER_HOUR, type ScanLinkStore } from "@/lib/scan-link";

// The in-memory scan link store, for tests. It keeps the guards of the Supabase store: the child must be the parent's,
// and the hourly count and the new row happen in one step, as the database function does under its lock.

const tick = () => new Promise((r) => setTimeout(r, 0));

export interface MemoryScanLinkRow {
  id: string;
  parent: string;
  child: string;
  at: number;
  status: "claimed" | "sent" | "failed";
  emailId: string | null;
  error: string | null;
}

interface Family {
  parent: string;
  parentName: string;
  email: string;
  children: { id: string; firstName: string }[];
}

export function memoryScanLinkStore({ now = Date.now }: { now?: () => number } = {}) {
  const families: Family[] = [];
  const rows: MemoryScanLinkRow[] = [];
  const row = (id: string) => rows.find((r) => r.id === id);
  const store: ScanLinkStore = {
    async recipient(parent, child) {
      await tick();
      const family = families.find((f) => f.parent === parent);
      const kid = family?.children.find((c) => c.id === child);
      return family && kid ? { parentName: family.parentName, email: family.email, childName: kid.firstName } : null;
    },
    async claim(parent, child) {
      await tick();
      if (!families.find((f) => f.parent === parent)?.children.some((c) => c.id === child)) return null;
      const since = now() - SCAN_LINK_WINDOW_MS;
      if (rows.filter((r) => r.parent === parent && r.at > since).length >= SCAN_LINKS_PER_HOUR) return null;
      const id = `link-${rows.length + 1}`;
      rows.push({ id, parent, child, at: now(), status: "claimed", emailId: null, error: null });
      return id;
    },
    async sent(id, emailId) {
      await tick();
      Object.assign(row(id) ?? {}, { status: "sent", emailId, error: null });
    },
    async refused(id, error) {
      await tick();
      Object.assign(row(id) ?? {}, { status: "failed", error });
    },
    async unknown(id, error) {
      await tick();
      Object.assign(row(id) ?? {}, { error });
    },
  };
  return { store, rows, addFamily: (f: Family) => void families.push(f) };
}
