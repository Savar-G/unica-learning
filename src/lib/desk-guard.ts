// The desk guard on parent pages (#301, review R349-2). While the child's desk is open on a device, the proxy sends new
// requests for parent pages back to the desk (src/lib/desk.ts, deskGate). Three things never reach the proxy, and this
// guard covers them: a parent page the browser restores from its history (back button), a parent tab that was already
// open when the desk opened, and a parent action that goes straight to Supabase Auth (password change, sign-out). The
// guard asks the server (`deskOpen`, GET /api/desk/state) and sends the page to the desk; when the server cannot
// answer, it fails closed. The desk tab tells other tabs it opened (DESK_OPENED). No React or Next.js here: the
// browser parts are passed in (src/components/desk-guard.tsx).

/** The message the desk sends to the other tabs of this browser when it opens. */
export const DESK_OPENED = "desk-opened";
/** The BroadcastChannel name, and the localStorage key for browsers without BroadcastChannel. */
export const DESK_CHANNEL = "unica-desk";
/** The attribute on <html> that hides a parent page while it is checked (src/ds/styles/support.css). */
export const DESK_HIDDEN = "data-desk-hidden";
/**
 * An inline script for the parent layouts, run before the page paints: a page loaded by the back or forward button
 * (often from the browser's cache, so the proxy never saw it) starts hidden until the guard has asked the server.
 */
export const HIDE_ON_BACK = `try{if(performance.getEntriesByType("navigation")[0].type==="back_forward")document.documentElement.setAttribute("${DESK_HIDDEN}","")}catch(e){}`;

export interface DeskGuardDeps {
  /** True when the desk is open for the signed-in parent on this device; throws when the server cannot answer. */
  deskOpen: () => Promise<boolean>;
  /** Hide the page's content, so a restored or old page shows nothing while it is checked. */
  hide: () => void;
  show: () => void;
  /** Leave for the desk, replacing this history entry. */
  toDesk: () => void;
}

export function createDeskGuard(d: DeskGuardDeps) {
  const open = async () => {
    try {
      return await d.deskOpen();
    } catch {
      return true;
    }
  };
  const leave = () => {
    d.hide();
    d.toDesk();
  };
  return {
    /** The page was shown: `restored` when it came back from the browser's history (pageshow `persisted`). */
    async pageShown(restored: boolean) {
      if (!restored) return;
      d.hide();
      if (await open()) d.toDesk();
      else d.show();
    },
    /** The tab came back into view. */
    async visible() {
      if (await open()) leave();
    },
    /** A message from another tab of this browser. */
    message(data: unknown) {
      if (data === DESK_OPENED) leave();
    },
    /** Before a parent action that does not go through this site's API: false (and off to the desk) while it is open. */
    async mayAct() {
      if (!(await open())) return true;
      leave();
      return false;
    },
  };
}
