// The one "Show test families" switch of the admin (D-313). Pure: the server helper (admin-test-families-server.ts)
// reads the cookie and the test family ids; the sidebar's switch writes the cookie. "Test" means a family marked as a
// test or an admin's own family (testAccountIds in admin-store.ts).
//
// Off (the default): test families are left out of every list and every number. On: they show in lists with a dashed
// "test" tag, and they still stay out of every number. Detail pages never filter: an admin who opens a test family's
// page directly sees it.

/** The cookie the sidebar switch sets. Only admin pages read it. */
export const ADMIN_TESTS_COOKIE = "unica_admin_tests";
/** The line at the top of a list page while the switch is on. */
export const TESTS_SHOWING_NOTE = "Test families are showing. They are tagged test and are left out of every number.";

type Query = Record<string, string | string[] | undefined>;

/**
 * Whether test families show: the switch's cookie is "1", or the address carries ?tests=1 (the links on a family's
 * page, which open a test family in the dashboard, and older bookmarks).
 */
export function testsShown(cookie: string | null | undefined, query?: Query): boolean {
  return cookie === "1" || query?.tests === "1";
}

/** The cookie text the switch writes: a year when on, removed when off. Path /admin, so no other page gets it. */
export function testsCookie(on: boolean, secure: boolean): string {
  return `${ADMIN_TESTS_COOKIE}=${on ? "1" : ""}; Path=/admin; SameSite=Lax; Max-Age=${on ? 31_536_000 : 0}${secure ? "; Secure" : ""}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TestFamilies {
  /** The switch is on: test families show (tagged), still out of every number. */
  show: boolean;
  /** Whether a parent id is a test or team family. */
  isTest: (parentId: string | null | undefined) => boolean;
  /** Whether a row of this parent belongs in a list: always for a real family, for a test family only when shown. */
  keep: (parentId: string | null | undefined) => boolean;
  /**
   * The parent ids a database list leaves out: every test family when the switch is off, none when on. Only well formed
   * ids, so the list can go into a filter as it is.
   */
  hidden: string[];
  /** Every test and team family id (well formed), shown or not. */
  ids: string[];
}

export function testFamilies(ids: Iterable<string>, show: boolean): TestFamilies {
  const set = new Set([...ids].filter((id) => UUID.test(id)));
  const isTest = (id: string | null | undefined) => !!id && set.has(id);
  const all = [...set].sort();
  return { show, isTest, keep: (id) => show || !isTest(id), hidden: show ? [] : all, ids: all };
}

/** The rows of a list that belong to it, by each row's parent id. */
export function keepRows<T>(rows: readonly T[], view: TestFamilies, parentOf: (row: T) => string | null | undefined): T[] {
  return rows.filter((r) => view.keep(parentOf(r)));
}

/** A not-in list for a PostgREST filter: `.not("parent_id", "in", notIn(ids))`. Null when nothing is left out. */
export function notIn(ids: readonly string[]): string | null {
  const ok = ids.filter((id) => UUID.test(id));
  return ok.length ? `(${ok.join(",")})` : null;
}
