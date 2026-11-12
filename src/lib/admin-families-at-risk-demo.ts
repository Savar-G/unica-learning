import type { RiskRow } from "@/lib/admin-families-at-risk";

// Made-up families for ?demo=1 in local development, so the page can be seen with every kind of row (D-099: no sign-in,
// no family data). Times are counted back from `now`.
export function demoRiskRows(now: Date): RiskRow[] {
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const ahead = (d: number) => ago(-d);
  const base = { endingFree: false, nextChargeAt: ahead(18), endsAt: null, planSince: ago(30), lastSignInAt: ago(1), heldBook: null, testFamily: false } as const;
  return [
    { ...base, parentId: "d1", parentName: "Priya Nair", childId: "d1c", childName: "Aarav", planKind: "free_month", lastActivityAt: ago(2), lastActivityKind: "scan" },
    { ...base, parentId: "d2", parentName: "Chen Family", childId: "d2c", childName: "Mei", planKind: "paying", nextChargeAt: ahead(9), lastActivityAt: ago(16), lastActivityKind: "maya", lastSignInAt: ago(15) },
    { ...base, parentId: "d3", parentName: "Jordan Smith", childId: "d3c", childName: "Eli", planKind: "free_month", lastActivityAt: null, lastActivityKind: null, planSince: ago(11), heldBook: 1, lastSignInAt: ago(10) },
    { ...base, parentId: "d4", parentName: "Amina Yusuf", childId: "d4c", childName: "Zara", planKind: "payment_failed", nextChargeAt: null, lastActivityAt: ago(3), lastActivityKind: "marks" },
    { ...base, parentId: "d5", parentName: "Luc Tremblay", childId: "d5c", childName: "Noé", planKind: "ending", endingFree: true, endsAt: ahead(6), lastActivityAt: ago(4), lastActivityKind: "scan" },
    { ...base, parentId: "d6", parentName: "Sara Kim", childId: "d6c", childName: "Joon", planKind: "paying", nextChargeAt: ahead(20), lastActivityAt: ago(8), lastActivityKind: "scan" },
    { ...base, parentId: "d7", parentName: "Omar Haddad", childId: "d7c", childName: "Lina", planKind: "free_month", planSince: ago(1), lastActivityAt: null, lastActivityKind: null },
  ];
}
