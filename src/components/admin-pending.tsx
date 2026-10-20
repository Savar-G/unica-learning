"use client";
// A thin bar under the admin bar while the next admin page loads. Admin pages render on the server for each click and
// show nothing new until the answer arrives, so without it a click looks ignored. It listens for clicks on links inside
// the admin area and stops when the address changes; a link that cannot change the address (a new tab, a download, a
// route handler, the page itself) never starts it, and it gives up after 15 s.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const GIVE_UP_MS = 15_000;

function startsNavigation(e: MouseEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.target || a.hasAttribute("download")) return false;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin || to.pathname.startsWith("/api/")) return false;
  return to.pathname !== location.pathname || to.search !== location.search;
}

export function AdminPending() {
  const here = `${usePathname()}?${useSearchParams()}`;
  // the address a click left from: the bar shows until the address is a different one
  const [from, setFrom] = useState<string | null>(null);
  // a new address forgets the click, so going Back to the page it left from does not show the bar again
  const [seen, setSeen] = useState(here);
  if (seen !== here) {
    setSeen(here);
    setFrom(null);
  }
  const pending = from === here;

  useEffect(() => {
    // capture: Link cancels the browser's own navigation before a listener on the document would see the click
    const onClick = (e: MouseEvent) => {
      if (startsNavigation(e)) setFrom(here);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [here]);

  useEffect(() => {
    if (!pending) return;
    const stop = setTimeout(() => setFrom(null), GIVE_UP_MS);
    return () => clearTimeout(stop);
  }, [pending]);

  return <span className={`adm-pending${pending ? " is-on" : ""}`} role="progressbar" aria-label="Loading the page" aria-hidden={!pending} />;
}
