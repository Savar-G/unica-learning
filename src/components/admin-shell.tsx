"use client";
// The admin frame's sidebar and page column (D-313, D-315): the brand, "Find a family or child", the folders, the
// "Show test families" switch and the signed-in email. Closed, the sidebar is an icon rail; on a phone it is a drawer
// behind the menu button. Which folders are shut and whether the sidebar is closed are this viewer's conveniences, kept
// in localStorage when it works: the server renders every folder open and the sidebar open, and the page works without
// them. The switch writes a cookie that the server reads (admin-test-families.ts), then asks for the page again.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ADMIN_NAV, ADMIN_NAV_ITEMS, adminFolderOf, adminSectionForPath, isFolder, type AdminBadges, type AdminNavItem, type AdminNavKey } from "@/lib/admin-nav";
import { testsCookie } from "@/lib/admin-test-families";

// The icons of the picked prototype (.design/experiments/r-admin-nav/shared.js), 24 x 24, drawn with the stroke.
const ICON: Record<AdminNavKey | "chev" | "side" | "menu" | "search", string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  health: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  families: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.9-.4 5.5 1.8 5.5 4.8"/>',
  tests: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  feedback: '<path d="M4 5h16v11H9l-5 4z"/>',
  production: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/><path d="M8 13h8M8 17h5"/>',
  delivery: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  marking: '<path d="M4 12l5 5L20 6"/>',
  calls: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  flyers: '<path d="M4 4h16v16H4z"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8z"/>',
  emails: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  templates: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  skillmap: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7.5 7.5l3.5 8.5M16.5 7.5 13 16M8 6h8"/>',
  reviews: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  ai: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  preview: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  budget: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
};
const Icon = ({ name, className }: { name: keyof typeof ICON; className?: string }) =>
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} dangerouslySetInnerHTML={{ __html: ICON[name] }} />;

// Per-viewer conveniences. A private window, blocked storage or a thumbnail capture can throw: then the defaults hold.
const STORE = "adm-nav:";
function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(STORE + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(STORE + key, JSON.stringify(value));
  } catch {
    // storage is off: the choice lasts until the page reloads
  }
}

const PHONE = "(max-width: 859.98px)";

function Badge({ badges, item }: { badges: Promise<AdminBadges>; item: AdminNavKey }) {
  const b = use(badges)[item];
  if (!b) return null;
  return <>
    <span className={`adm-badge${b.hot ? " is-hot" : ""}`} aria-hidden="true">{b.text}</span>
    <span className="adm-sr">, {b.label}</span>
    {b.hot && <span className="adm-dot" aria-hidden="true" />}
  </>;
}

function NavLink({ item, current, badges }: { item: AdminNavItem; current: AdminNavKey | null; badges: Promise<AdminBadges> }) {
  // No prefetch: every admin link is a full page with database reads, loaded again after each refresh (2026-11-06).
  return (
    <Link className="adm-nav-item" href={item.href} prefetch={false} title={item.label} aria-current={item.key === current ? "page" : undefined}>
      <Icon name={item.key} />
      <span className="adm-label">{item.label}</span>
      <Suspense fallback={null}><Badge badges={badges} item={item.key} /></Suspense>
    </Link>
  );
}

function TestsSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [pending, start] = useTransition();
  // A refresh from elsewhere (another tab changed the cookie) brings the server's value.
  const [seen, setSeen] = useState(on);
  if (seen !== on) {
    setSeen(on);
    setChecked(on);
  }
  return (
    <label className="adm-switch" title="Show test families">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          setChecked(next);
          document.cookie = testsCookie(next, location.protocol === "https:");
          // Only the cookie decides now. An old ?tests=1 in the address is dropped, so the address never looks like it
          // says otherwise; a replace renders the page again, as a refresh does.
          const url = new URL(location.href);
          if (url.searchParams.has("tests")) {
            url.searchParams.delete("tests");
            start(() => router.replace(`${url.pathname}${url.search}${url.hash}`));
          } else start(() => router.refresh());
        }}
      />
      <span className="adm-label">Show test families</span>
    </label>
  );
}

export function AdminShell({ email, showTests, badges, pending, children }: {
  email: string; showTests: boolean; badges: Promise<AdminBadges>; pending: ReactNode; children?: ReactNode;
}) {
  const pathname = usePathname();
  const current = adminSectionForPath(pathname);
  const currentFolder = current ? adminFolderOf(current) : null;
  const [min, setMin] = useState(false);
  const [shut, setShut] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const side = useRef<HTMLElement>(null);

  // Read the viewer's choices after the first render, so the server's render (all open) and the first client render match.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the stored choices exist only in the browser */
    setMin(readStore<unknown>("min", false) === true);
    const stored = readStore<unknown>("shut", []);
    setShut(Array.isArray(stored) ? stored.filter((x): x is string => typeof x === "string") : []);
    /* eslint-enable react-hooks/set-state-in-effect */
    const query = window.matchMedia(PHONE);
    const change = () => setPhone(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  // A new page closes the drawer.
  const [at, setAt] = useState(pathname);
  if (at !== pathname) {
    setAt(pathname);
    setOpen(false);
  }

  // The drawer closes on Escape and on a press outside it, and gives the focus back to the menu button.
  useEffect(() => {
    if (!open) return;
    side.current?.querySelector<HTMLElement>("a, button, input")?.focus();
    const close = () => {
      setOpen(false);
      menuButton.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: PointerEvent) => { if (!side.current?.contains(e.target as Node) && !menuButton.current?.contains(e.target as Node)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const toggleMin = () => {
    setMin((m) => {
      writeStore("min", !m);
      return !m;
    });
  };
  const toggleFolder = (folder: string) => {
    setShut((s) => {
      const next = s.includes(folder) ? s.filter((f) => f !== folder) : [...s, folder];
      writeStore("shut", next);
      return next;
    });
  };
  // The rail is for wide screens; on a phone the drawer always shows the labels.
  const rail = min && !phone;
  const currentLabel = ADMIN_NAV_ITEMS.find((i) => i.key === current)?.label ?? "Admin";

  return (
    <div className={`adm-shell${rail ? " is-min" : ""}${open ? " is-open" : ""}`}>
      <aside className="adm-side" id="adm-side" ref={side} aria-label="Admin menu" inert={phone && !open}>
        <div className="adm-side-top">
          <Link className="adm-brand" href="/admin" prefetch={false}><b aria-hidden="true" /><span>Unica Learning</span><small>Admin</small></Link>
          <button type="button" className="adm-collapse" onClick={toggleMin} aria-expanded={!rail} aria-controls="adm-side"
            aria-label={rail ? "Open the sidebar" : "Close the sidebar"} title={rail ? "Open the sidebar" : "Close the sidebar"}>
            <Icon name="side" />
          </button>
        </div>
        <form className="adm-find" role="search" action="/admin/parents" method="get">
          <Icon name="search" />
          <input type="search" name="q" placeholder="Find a family or child" aria-label="Find a family or child" autoComplete="off" />
        </form>
        <nav className="adm-nav" aria-label="Admin">
          {ADMIN_NAV.map((e) => {
            if (!isFolder(e)) return <NavLink key={e.key} item={e} current={current} badges={badges} />;
            // The folder of the page shown stays open.
            const isOpen = !shut.includes(e.folder) || e.folder === currentFolder;
            const id = `adm-folder-${e.folder.toLowerCase().replace(/\W+/g, "-")}`;
            return (
              <div key={e.folder} className={`adm-folder${isOpen ? "" : " is-shut"}`}>
                <button type="button" className="adm-folder-head" aria-expanded={isOpen} aria-controls={id} onClick={() => toggleFolder(e.folder)}>
                  <span className="adm-label">{e.folder}</span><Icon name="chev" className="adm-chev" />
                </button>
                <div className="adm-folder-items" id={id}>
                  {e.items.map((item) => <NavLink key={item.key} item={item} current={current} badges={badges} />)}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="adm-side-foot">
          <TestsSwitch on={showTests} />
          <div className="adm-who" title={email}>{email}</div>
        </div>
      </aside>
      <div className="adm-page">
        <div className="adm-topbar">
          <button type="button" ref={menuButton} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="adm-side" aria-label={open ? "Close the menu" : "Open the menu"}>
            <Icon name="menu" />
          </button>
          <b>{currentLabel}</b>
        </div>
        {pending}
        {children}
      </div>
    </div>
  );
}

/** The mono line above a page's title: the folder the page belongs to (Admin on Home). */
export function AdminEyebrow() {
  const current = adminSectionForPath(usePathname());
  const folder = current ? adminFolderOf(current) : null;
  return <p className="eyebrow adm-eyebrow">{folder ?? "Admin"}</p>;
}
