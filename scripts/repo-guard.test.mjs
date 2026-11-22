import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildRatchetedBaseline, checkRepo, pageFileToRoute, scanRepo } from "./repo-guard.mjs";

function makeTempRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "repo-guard-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const CLEAN_FILES = {
  "AGENTS.md": "# Guide\nShort guide.\n",
  "docs/feature-map.md": "| Feature | Route |\n|---|---|\n| Home | `/` |\n| Account | `/account` |\n",
  "src/app/(site)/page.tsx": "export default function Home() { return <main>Unica Learning</main>; }\n",
  "src/app/(product)/account/(dashboard)/page.tsx": "export default function Account() { return <main>Parent home</main>; }\n",
  "src/lib/math.ts": "export const add = (a: number, b: number) => a + b;\n",
};

test("pageFileToRoute strips route groups and /page.tsx cleanly", () => {
  assert.equal(pageFileToRoute("src/app/(site)/page.tsx"), "/");
  assert.equal(pageFileToRoute("src/app/(site)/blog/[slug]/page.tsx"), "/blog/[slug]");
  assert.equal(pageFileToRoute("src/app/(product)/account/(dashboard)/page.tsx"), "/account");
  assert.equal(pageFileToRoute("src/app/(product)/account/(dashboard)/workbooks/[child]/book/[workbook]/page.tsx"), "/account/workbooks/[child]/book/[workbook]");
});

test("checkRepo passes on a clean repo with matching feature map", () => {
  const root = makeTempRepo(CLEAN_FILES);
  try {
    const baseline = buildRatchetedBaseline(scanRepo(root), null);
    const res = checkRepo(root, baseline);
    assert.equal(res.ok, true, JSON.stringify(res.violations));
    assert.equal(res.violations.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checkRepo catches every injected guardrail violation with actionable messages", () => {
  const root = makeTempRepo({
    ...CLEAN_FILES,
    "AGENTS.md": "line\n".repeat(160),
    "src/lib/huge.ts": "export const x = 1;\n".repeat(605),
    "src/lib/escape.ts": "export const q = (db: any) => db.from('x').select('*').returns<string[]>();\n",
    "src/lib/override.ts": "export const r = (db: any) => db.from('x').select('*').overrideTypes<Array<{ id: string }>>();\n",
    "src/components/bad-copy.tsx": "export const C = () => <div>Welcome to Pagewise</div>;\n",
    "src/components/effectful.tsx": "import { useEffect } from 'react';\nexport function E() { useEffect(() => {}, []); return null; }\n",
    "src/lib/suppressed.ts": "// eslint-disable-next-line no-unused-vars\nexport const v = 1;\n",
    "src/lib/suppressed.test.ts": "// oxlint-disable-next-line no-unused-vars\nexport const t = 1;\n",
    "src/lib/feature-999.test.ts": "export {};\n",
    "src/lib/math-fix.test.ts": "export {};\n",
    "src/lib/math-fixes.test.ts": "export {};\n",
    "src/app/(site)/unmapped/page.tsx": "export default function U() { return null; }\n",
  });
  try {
    const emptyBaseline = { maxLines: {}, useEffectCounts: {}, suppressionCounts: {}, sprawlTests: [] };
    const res = checkRepo(root, emptyBaseline);
    assert.equal(res.ok, false);
    const rules = new Set(res.violations.map((v) => v.rule));
    assert.deepEqual(
      [...rules].sort(),
      [
        "agents-md-budget",
        "banned-db-escapes",
        "feature-map-coverage",
        "max-lines",
        "no-new-suppressions",
        "no-new-use-effect",
        "no-pagewise-brand",
        "no-test-sprawl",
      ],
    );
    const dbFiles = res.violations.filter((v) => v.rule === "banned-db-escapes").map((v) => v.file).sort();
    assert.deepEqual(dbFiles, ["src/lib/escape.ts", "src/lib/override.ts"]);
    const supFiles = res.violations.filter((v) => v.rule === "no-new-suppressions").map((v) => v.file).sort();
    assert.deepEqual(supFiles, ["src/lib/suppressed.test.ts", "src/lib/suppressed.ts"]);
    const sprawlFiles = res.violations.filter((v) => v.rule === "no-test-sprawl").map((v) => v.file).sort();
    assert.deepEqual(sprawlFiles, ["src/lib/feature-999.test.ts", "src/lib/math-fix.test.ts", "src/lib/math-fixes.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ratchet freezes legacy files and only lowers ceilings, never raises them", () => {
  const root = makeTempRepo({
    ...CLEAN_FILES,
    "src/components/legacy.tsx": "import { useEffect } from 'react';\nexport function L() { useEffect(() => {}, []); useEffect(() => {}, []); return null; }\n",
  });
  try {
    const initial = buildRatchetedBaseline(scanRepo(root), null);
    assert.equal(initial.useEffectCounts["src/components/legacy.tsx"], 2);
    assert.equal(checkRepo(root, initial).ok, true);

    // Growing legacy file past baseline fails.
    writeFileSync(
      join(root, "src/components/legacy.tsx"),
      "import { useEffect } from 'react';\nexport function L() { useEffect(() => {}, []); useEffect(() => {}, []); useEffect(() => {}, []); return null; }\n",
    );
    assert.equal(checkRepo(root, initial).ok, false);

    // Shrinking legacy file passes and reports a tightenable ceiling; ratcheting lowers it to 1.
    writeFileSync(
      join(root, "src/components/legacy.tsx"),
      "import { useEffect } from 'react';\nexport function L() { useEffect(() => {}, []); return null; }\n",
    );
    const shrunk = checkRepo(root, initial);
    assert.equal(shrunk.ok, true);
    assert.equal(shrunk.tightenable.length, 1);

    const next = buildRatchetedBaseline(shrunk.scan, initial);
    assert.equal(next.useEffectCounts["src/components/legacy.tsx"], 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores useEffect mentions inside comments and ignores generated DB files", () => {
  const root = makeTempRepo({
    ...CLEAN_FILES,
    "src/components/clean.tsx": "// Avoid useEffect() here; derive state directly.\nexport const Clean = () => null;\n",
    "src/lib/database.types.ts": "export type Big = string;\n".repeat(700),
  });
  try {
    const emptyBaseline = { maxLines: {}, useEffectCounts: {}, suppressionCounts: {}, sprawlTests: [] };
    const res = checkRepo(root, emptyBaseline);
    assert.equal(res.ok, true, JSON.stringify(res.violations));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preserves string and regex literals when stripping comments", () => {
  const root = makeTempRepo({
    ...CLEAN_FILES,
    "src/components/upload.tsx": [
      "import { useEffect } from 'react';",
      'const mime = "image/*";',
      "export function Upload() { useEffect(() => {}, []); return <input accept={mime} />; }",
      "/* Upload UI */",
    ].join("\n"),
    "src/components/regex-comment.tsx": [
      'export const quote = /"/;',
      "// useEffect(() => {}, []);",
    ].join("\n"),
    "src/lib/mime-escape.ts": [
      'const mime = "image/*";',
      "export const bad = (db: any) => db.from('x').select('*').overrideTypes<string[]>();",
      "/* done */",
    ].join("\n"),
  });
  try {
    const emptyBaseline = { maxLines: {}, useEffectCounts: {}, suppressionCounts: {}, sprawlTests: [] };
    const res = checkRepo(root, emptyBaseline);
    assert.equal(res.ok, false);
    assert.deepEqual(
      res.violations.map((v) => `${v.rule}:${v.file}`).sort(),
      ["banned-db-escapes:src/lib/mime-escape.ts", "no-new-use-effect:src/components/upload.tsx"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
