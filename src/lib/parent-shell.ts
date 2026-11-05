import type { ChildTab } from "@/lib/child-stage";
import type { ChildView } from "@/lib/parent-view";

// The dashboard shell's rules (spec #544, #551). Pure, and shared by the server and the browser: which child shows, which
// tabs link where, and the phone navigation. No database, cookie store or clock here.

/** The last child viewed: only an id, read by the server, which checks it against the family's own children. */
export const LAST_CHILD_COOKIE = "unica_last_child";

export function lastChildCookie(childId: string, secure: boolean): string {
  return `${LAST_CHILD_COOKIE}=${encodeURIComponent(childId)}; Path=/account; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const ACCOUNT_PATH = "/account/settings";

const homePath = (childId: string) => `/account?child=${encodeURIComponent(childId)}`;

/** The child's Workbooks tab (#558). */
export const workbooksPath = (childId: string) => `/account/workbooks/${encodeURIComponent(childId)}`;

const LABELS: Record<ChildTab, string> = {
  overview: "Overview",
  progress: "Progress",
  workbooks: "Workbooks",
  scan_pages: "Scan pages",
  maya: "Maya",
  assessment: "Assessment",
  account: "Account",
};

type ShellChild = Pick<ChildView, "id" | "tabs" | "reportIds" | "opensOn">;

/**
 * Where each tab goes today. Null means the tab has no page yet, so it does not appear: Progress (#561) fills this in.
 * Assessment (#552) opens the newest report, or the child's home, which holds the test button: also while a new test is
 * open, because the child's page is then that test.
 */
const TAB_PAGE: Record<ChildTab, (child: ShellChild) => string | null> = {
  overview: (c) => homePath(c.id),
  progress: () => null,
  workbooks: (c) => workbooksPath(c.id),
  scan_pages: () => "/account/scan",
  maya: (c) => `/account/notes/${c.id}`,
  assessment: (c) => (c.reportIds[0] && c.opensOn !== "continue_or_wait" ? `/account/report/${c.reportIds[0]}` : homePath(c.id)),
  account: () => ACCOUNT_PATH,
};

export interface TabLink {
  tab: ChildTab;
  label: string;
  href: string;
}

/** The child's tabs that have a page, in the stage's order. A family with no children has only Account. */
export function tabLinks(child: ShellChild | null): TabLink[] {
  const shown: ShellChild = child ?? { id: "", tabs: ["account"], reportIds: [], opensOn: "start_test" };
  return shown.tabs.flatMap((tab) => {
    const href = TAB_PAGE[tab](shown);
    return href ? [{ tab, label: LABELS[tab], href }] : [];
  });
}

/** The child named by the address, if this page belongs to one child. */
export function addressChild(pathname: string, queryChild: string | null, children: readonly Pick<ChildView, "id" | "reportIds">[]): string | null {
  if (pathname === "/account") return queryChild;
  const [, , section, id] = pathname.split("/");
  if (section === "notes" || section === "learning" || section === "workbooks") return id ?? null;
  if (section === "report") return children.find((c) => c.reportIds.includes(id))?.id ?? null;
  return null;
}

/** The address's child, else the last child viewed, else the oldest. An id that is not this family's counts as none. */
export function pickChild<T extends { id: string }>(children: readonly T[], fromAddress: string | null, remembered: string | null): T | null {
  const find = (id: string | null) => children.find((c) => c.id === id);
  return find(fromAddress) ?? find(remembered) ?? children[0] ?? null;
}

/** The tab a page belongs to; null when that tab is not shown. */
export function activeTab(pathname: string, links: readonly TabLink[]): ChildTab | null {
  const has = (tab: ChildTab) => links.some((l) => l.tab === tab);
  const section = pathname.split("/")[2];
  const home = has("overview") ? "overview" : "assessment";
  const tab: ChildTab | null = !section || section === "learning" ? home
    : section === "report" ? "assessment"
    : section === "notes" ? "maya"
    : section === "workbooks" ? "workbooks"
    : section === "scan" ? "scan_pages"
    : section === "settings" || section === "plan" || section === "pin" || section === "password" ? "account"
    : null;
  return tab && has(tab) ? tab : null;
}

export type PhoneNav = { kind: "top"; links: TabLink[] } | { kind: "bar"; bar: TabLink[]; more: TabLink[] };

// The phone layout: set 2, option A of round r544 (a bar with More opening a sheet). Savar has not chosen yet: another
// option changes this function and the two phone parts of src/components/parent-shell.tsx, nothing else.
const BAR_TABS: readonly ChildTab[] = ["overview", "progress", "scan_pages", "workbooks"];

export function phoneNav(links: readonly TabLink[]): PhoneNav {
  if (links.every((l) => l.tab === "assessment" || l.tab === "account")) return { kind: "top", links: [...links] };
  if (links.length <= 5) return { kind: "bar", bar: [...links], more: [] };
  return {
    kind: "bar",
    bar: BAR_TABS.flatMap((tab) => links.filter((l) => l.tab === tab)),
    more: links.filter((l) => !BAR_TABS.includes(l.tab)),
  };
}
