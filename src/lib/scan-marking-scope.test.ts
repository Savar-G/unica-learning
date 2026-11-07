import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// In families mode a real family is admitted only for the child of the page or the photo. A call to the access
// rule without that scope would close for every real family (or, worse, be read later as "no child needed").
// Each caller must pass the scope it serves.
const callers: [file: string, rule: "markingAccess" | "scanChecksAccess", scope: RegExp, calls: number][] = [
  ["src/app/(product)/account/(dashboard)/scan/results/[id]/page.tsx", "markingAccess", /\{ photo: id \}/, 1],
  ["src/app/(product)/account/(dashboard)/workbooks/[child]/page.tsx", "markingAccess", /\{ child: view\.child\.id \}/, 1],
  ["src/app/api/account/scans/[id]/marking/route.ts", "markingAccess", /\{ photo: id \}/, 3],
  ["src/app/api/account/scans/[id]/explanation/route.ts", "markingAccess", /\{ photo: id \}/, 1],
  ["src/lib/parent-problem-explanation-server.ts", "markingAccess", /\{ photo: ref\.photo \}/, 1],
  ["src/app/api/account/scans/history/route.ts", "markingAccess", /\{ child \}/, 1],
  ["src/app/api/account/scans/progress/route.ts", "markingAccess", /\{ child: childId \}/, 1],
  ["src/app/api/account/scans/route.ts", "markingAccess", /\{ child \}/, 1],
  ["src/app/api/account/scans/route.ts", "scanChecksAccess", /\{ child \}/, 1],
  ["src/app/api/account/scans/send/route.ts", "scanChecksAccess", /\{ child: child as string \}/, 1],
  ["src/app/api/account/scans/[id]/preview/route.ts", "scanChecksAccess", /\{ photo: id \}/, 1],
  ["src/app/api/account/scans/[id]/preview/[part]/route.ts", "scanChecksAccess", /\{ photo: id \}/, 1],
];

it.each(callers)("%s passes its scope to %s", (file, rule, scope, calls) => {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  const found = [...source.matchAll(new RegExp(`\\b${rule}\\(([^\\n]*)`, "g"))].map((m) => m[1]);
  expect(found).toHaveLength(calls);
  for (const args of found) expect(args).toMatch(new RegExp(`^[^)]*process\\.env, ${scope.source}\\)`));
});
