import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { testAccountIds, type AdminSession } from "@/lib/admin-store";
import { ADMIN_TESTS_COOKIE, testFamilies, testsShown, type TestFamilies } from "@/lib/admin-test-families";

// The server side of the "Show test families" switch (D-313): the switch's cookie, and the test family ids with the
// admin's own session.

/** Whether the admin turned the switch on. Only the cookie decides, so the frame and the page always agree. */
export async function showTestFamilies(): Promise<boolean> {
  return testsShown((await cookies()).get(ADMIN_TESTS_COOKIE)?.value);
}

/** One read of the test family ids per request: the frame's badges and the page share it. */
export const testIdsFor = cache((a: AdminSession) => testAccountIds(a));

/** The switch and the test family ids, for a list page. */
export async function loadTestFamilies(a: AdminSession): Promise<TestFamilies> {
  const [show, ids] = await Promise.all([showTestFamilies(), testIdsFor(a)]);
  return testFamilies(ids, show);
}

/** The children of these families, for lists that know a child and not its family (the scanned pages). */
export async function childrenOf(a: AdminSession, parentIds: readonly string[]): Promise<Set<string>> {
  if (!parentIds.length) return new Set();
  const { data, error } = await a.db.rpc("admin_children").select("id").in("parent_id", [...parentIds]);
  if (error) throw new Error(`[admin] test family children: ${error.message}`);
  return new Set((data ?? []).map((c) => c.id));
}
