"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SaveTimeZone } from "@/components/account";
import { gradeLabel } from "@/lib/assessment/grades";
import type { ChildTab } from "@/lib/child-stage";
import type { ChildView } from "@/lib/parent-view";
import { activeTab, addressChild, lastChildCookie, phoneNav, pickChild, tabLinks, type TabLink } from "@/lib/parent-shell";
import { BRAND } from "@/lib/site";
import "./parent-shell.css";

// The dashboard's frame (#551, spec #544, the mock's sidebar): the child block, Open the desk and the tabs. On a phone
// the sidebar's parts move: the child block to the top of the page, the tabs to a bottom bar (phoneNav in
// src/lib/parent-shell.ts). The layout renders it once per page load; the address picks the child when it names one, and
// otherwise the child stays the one in view.

const ICONS: Record<ChildTab | "more", ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  progress: <><path d="M3.5 19.5h17" /><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5" /><path d="M15 7.5h4v4" /></>,
  scan_pages: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  workbooks: <><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z" /><path d="M12 6v13" /></>,
  maya: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z" />,
  assessment: <><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5V3.5h6v1" /><path d="M8.5 12.5l2.2 2.2 4.8-4.8" /></>,
  account: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>,
  more: <><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></>,
};

const Icon = ({ name }: { name: ChildTab | "more" }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{ICONS[name]}</svg>
);

/** The server reads this on the next load, and checks it against the family's own children. */
function rememberChild(childId: string) {
  document.cookie = lastChildCookie(childId, window.location.protocol === "https:");
}

const Wordmark = () => <Link className="logo" href="/" aria-label={`${BRAND} home`}>{BRAND}<b /></Link>;

interface ShellProps {
  kids: ChildView[];
  remembered: string | null;
  pinSet: boolean | null;
  timeZoneSaved: boolean;
  children: ReactNode;
}

export function ParentShell({ kids, remembered, pinSet, timeZoneSaved, children }: ShellProps) {
  const pathname = usePathname();
  const queryChild = useSearchParams().get("child");
  // The layout stays mounted across pages, so `remembered` is only the value at page load: the child in view is state.
  const [selected, setSelected] = useState(remembered);
  const child = pickChild(kids, addressChild(pathname, queryChild, kids), selected);
  if (child && child.id !== selected) setSelected(child.id);
  const links = tabLinks(child);
  const current = activeTab(pathname, links);
  const nav = phoneNav(links);
  const childId = child?.id;

  useEffect(() => {
    if (childId) rememberChild(childId);
  }, [childId]);

  const block = child && <ChildBlock child={child} kids={kids} pinSet={pinSet} />;
  return (
    <div className={`look-root pd-shell${nav.kind === "bar" ? " pd-has-bar" : ""}`} data-look="warm">
      {!timeZoneSaved && <SaveTimeZone />}
      <aside className="pd-side">
        <Wordmark />
        {block}
        <nav className="pd-nav" aria-label="Your account">
          <TabList links={links} current={current} />
        </nav>
      </aside>
      <header className="pd-top">
        <Wordmark />
        {nav.kind === "top" && (
          <nav className="pd-top-links" aria-label="Your account">
            {nav.links.map((l) => <Link key={l.tab} href={l.href} aria-current={l.tab === current ? "page" : undefined}>{l.label}</Link>)}
          </nav>
        )}
      </header>
      <div className="pd-main">
        <div className="pd-main-kid">{block}</div>
        {children}
      </div>
      {nav.kind === "bar" && <BottomBar bar={nav.bar} more={nav.more} current={current} />}
    </div>
  );
}

/** The child's name and school grade, the switcher when there are two or more children, and the desk from the first shipped workbook. */
function ChildBlock({ child, kids, pinSet }: { child: ChildView; kids: ChildView[]; pinSet: boolean | null }) {
  const name = (
    <>
      <span className="pd-kid-av" aria-hidden="true">{child.firstName.slice(0, 1).toUpperCase()}</span>
      <span className="pd-kid-t">
        <b>{child.firstName}</b>
        <span>{gradeLabel(child.schoolGrade)}{child.currentWorkbook ? ` · Workbook ${child.currentWorkbook.number}` : ""}</span>
      </span>
    </>
  );
  return (
    <div className="pd-child">
      {kids.length > 1 ? (
        // A new key closes the list when the child changes.
        <details key={child.id} className="pd-switch">
          <summary className="pd-kid" aria-label={`${child.firstName}. Change child`}>
            {name}
            <svg className="pd-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
          </summary>
          <ul className="pd-switch-list">
            {kids.map((k) => (
              <li key={k.id}><Link href={`/account?child=${encodeURIComponent(k.id)}`} aria-current={k.id === child.id ? "true" : undefined}>{k.firstName}<span>{gradeLabel(k.schoolGrade)}</span></Link></li>
            ))}
          </ul>
        </details>
      ) : (
        <div className="pd-kid">{name}</div>
      )}
      {child.currentWorkbook && (pinSet === false
        ? <Link className="btn ghost pd-desk" href="/account/pin?desk=1">Set your PIN</Link>
        : (
          <form method="post" action="/api/desk/open">
            <input type="hidden" name="child" value={child.id} />
            <button type="submit" className="btn pd-desk">Open the desk <span aria-hidden="true">→</span></button>
          </form>
        ))}
    </div>
  );
}

function TabList({ links, current }: { links: TabLink[]; current: ChildTab | null }) {
  return links.map((l) => <Link key={l.tab} href={l.href} aria-current={l.tab === current ? "page" : undefined}><Icon name={l.tab} /><span>{l.label}</span></Link>);
}

/** The phone's bottom bar. More opens a sheet with the other tabs. */
function BottomBar({ bar, more, current }: { bar: TabLink[]; more: TabLink[]; current: ChildTab | null }) {
  const [open, setOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const [shownOn, setShownOn] = useState(pathname);
  // A new page closes the sheet.
  if (pathname !== shownOn) {
    setShownOn(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const button = moreButton.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); button?.focus(); };
  }, [open]);
  const moreCurrent = more.some((l) => l.tab === current);
  return (
    <>
      <nav className="pd-bar" aria-label="Your account">
        <TabList links={bar} current={current} />
        {more.length > 0 && (
          <button ref={moreButton} type="button" className={moreCurrent ? "is-current" : undefined} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
            <Icon name="more" /><span>More</span>
          </button>
        )}
      </nav>
      {open && (
        <>
          <div className="pd-scrim" onClick={() => setOpen(false)} />
          <div className="pd-sheet" role="dialog" aria-label="More">
            <ul>
              {more.map((l, i) => (
                <li key={l.tab}><Link ref={i === 0 ? firstLink : undefined} href={l.href} aria-current={l.tab === current ? "page" : undefined} onClick={() => setOpen(false)}><Icon name={l.tab} /><span>{l.label}</span></Link></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
