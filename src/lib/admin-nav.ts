// The admin sidebar (D-313, D-315): its folders and items, and which item each admin address highlights. Pure and
// free of imports, so the sidebar's client component and the tests share it. Every admin URL stays as it was; only the
// labels and the grouping changed (emails and the analytics filter link to the old addresses).

export type AdminNavKey =
  | "home" | "families" | "tests" | "feedback" | "production" | "delivery" | "marking" | "calls"
  | "flyers" | "emails" | "templates" | "skillmap" | "reviews" | "preview" | "export";

export interface AdminNavItem {
  key: AdminNavKey;
  label: string;
  href: string;
}

export interface AdminNavFolder {
  folder: string;
  items: AdminNavItem[];
}

export type AdminNavEntry = AdminNavItem | AdminNavFolder;

/** A count beside an item, only when something waits. `label` is read aloud; `hot`: it needs the team (orange). */
export interface AdminBadge { text: string; label: string; hot: boolean }
export type AdminBadges = Partial<Record<AdminNavKey, AdminBadge>>;

export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { key: "home", label: "Home", href: "/admin" },
  { folder: "Families", items: [
    { key: "families", label: "Families", href: "/admin/parents" },
    { key: "tests", label: "Tests", href: "/admin/tests" },
    { key: "feedback", label: "Feedback", href: "/admin/feedback" },
  ] },
  { folder: "Workbooks", items: [
    { key: "production", label: "Production", href: "/admin/workbooks" },
    { key: "delivery", label: "Plans and delivery", href: "/admin/next-steps" },
    { key: "marking", label: "Marking", href: "/admin/scans" },
  ] },
  { folder: "Maya", items: [
    { key: "calls", label: "Calls", href: "/admin/maya" },
  ] },
  { folder: "Marketing", items: [
    { key: "flyers", label: "Flyers", href: "/admin/flyers" },
    { key: "emails", label: "Emails", href: "/admin/emails" },
  ] },
  { folder: "Quality", items: [
    { key: "templates", label: "Templates", href: "/admin/templates" },
    { key: "skillmap", label: "Skill map", href: "/admin/skill-map" },
    { key: "reviews", label: "AI reviews", href: "/admin/reviews" },
  ] },
  { folder: "Team tools", items: [
    { key: "preview", label: "Parent app preview", href: "/admin/dashboard" },
    { key: "export", label: "Export", href: "/admin/export" },
  ] },
];

export const isFolder = (e: AdminNavEntry): e is AdminNavFolder => "folder" in e;

/** Every item, in sidebar order. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = ADMIN_NAV.flatMap((e) => (isFolder(e) ? e.items : [e]));

/**
 * The first path segment after /admin, and the item it belongs to. Pages that left the sidebar keep their address and
 * highlight the item they now live under: Activity under Home, Children and the chat list under Families, one test, its
 * report and profile under Tests, scan pages under Marking.
 */
const SEGMENT: Record<string, AdminNavKey> = {
  activity: "home",
  parents: "families",
  children: "families",
  "maya-chat": "families",
  tests: "tests",
  assessments: "tests",
  reports: "tests",
  feedback: "feedback",
  workbooks: "production",
  "next-steps": "delivery",
  scans: "marking",
  maya: "calls",
  flyers: "flyers",
  emails: "emails",
  templates: "templates",
  "skill-map": "skillmap",
  reviews: "reviews",
  dashboard: "preview",
  "parent-dashboard": "preview",
  export: "export",
};

/** The sidebar item an admin address highlights, or null for an address outside the admin or one no item owns. */
export function adminSectionForPath(pathname: string | null | undefined): AdminNavKey | null {
  if (!pathname) return null;
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (parts[0] !== "admin") return null;
  if (parts.length === 1) return "home";
  return Object.hasOwn(SEGMENT, parts[1]) ? SEGMENT[parts[1]] : null;
}

/** The folder that holds an item, or null for Home. */
export function adminFolderOf(key: AdminNavKey): string | null {
  for (const e of ADMIN_NAV) if (isFolder(e) && e.items.some((i) => i.key === key)) return e.folder;
  return null;
}
