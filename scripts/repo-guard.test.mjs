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

const ENGINE = "src/lib/workbook-v2";
const ENGINE_CLEAN = {
  ...CLEAN_FILES,
  [`${ENGINE}/contract.ts`]: "export interface Rect { x: number }\nexport const EDGE = 36;\n",
  [`${ENGINE}/hash.ts`]: "import { createHash } from 'node:crypto';\nexport const h = (t: string) => createHash('sha256').update(t).digest('hex');\n",
  [`${ENGINE}/checks/image.ts`]: "import { inflateSync } from 'node:zlib';\nimport jsQR from 'jsqr';\nexport const i = (b: Uint8Array) => [inflateSync(b), jsQR];\nexport const k = { constructor: 1, ['a-key']: 2 }['a-key'];\n",
  [`${ENGINE}/layout/pages.ts`]: "import QRCode from 'qrcode';\nimport { EDGE, type Rect } from '../contract';\nimport raw from '../fixtures/a.json';\nexport const p = (r: Rect, level: { name: string } | null) => (level === null ? raw : [QRCode, r.x + EDGE, Math.max(1, 2), `Level ${level.name}`, { date: 1, errorCorrectionLevel: 'M' }]);\n",
  [`${ENGINE}/renderer.ts`]: "export interface Renderer { render(): Promise<void> }\n",
  [`${ENGINE}/render/typst.ts`]: "import { execFile } from 'node:child_process';\nimport { readFile } from 'node:fs/promises';\nimport type { Renderer } from '../renderer';\nexport const r: Renderer = { render: async () => { execFile('typst'); await readFile('a'); } };\n",
  [`${ENGINE}/render/page.typ`]: "// Draws a level page.\n#let model = json(\"pages.json\")\n",
  [`${ENGINE}/testing/sample.ts`]: "import { existsSync } from 'node:fs';\nexport const ci = existsSync('a') && process.env.CI;\n",
  [`${ENGINE}/layout/pages.test.ts`]: "import { expect, it } from 'vitest';\nimport fc from 'fast-check';\nimport { p } from './pages';\nimport { ci } from '../testing/sample';\nit('x', () => expect([p, fc, ci, new Date()]).toBeTruthy());\n",
};

function engineViolations(files) {
  const root = makeTempRepo({ ...ENGINE_CLEAN, ...files });
  try {
    return checkRepo(root, { maxLines: {}, useEffectCounts: {}, suppressionCounts: {}, sprawlTests: [] }).violations.map(({ rule, file }) => `${rule} ${file}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the workbook engine may use its own modules and its allowed packages", () => {
  assert.deepEqual(engineViolations({}), []);
});

test("the workbook engine imports nothing from the app", () => {
  const layout = `${ENGINE}/layout/bad.ts`;
  const imports = [
    [layout, "import { a } from '@/lib/math';"],
    [layout, "import type { A } from '@/lib/math';"],
    [layout, "import { add } from '../../math';"],
    [layout, "export { add } from '../../math';"],
    [layout, "export * from '../../../app/page';"],
    [layout, "import { cookies } from 'next/headers';"],
    [layout, "import next from 'next';"],
    [layout, "import React from 'react';"],
    [layout, "import { createClient } from '@supabase/supabase-js';"],
    [layout, "import 'server-only';"],
    [layout, "import sharp from 'sharp';"],
    [layout, "const m = await import('@/lib/math');"],
    [layout, "const m = await import(name);"],
    [layout, "const m = require('../../math');"],
    [layout, "let a: import('@/lib/math').A;"],
    [layout, "import { ci } from '../testing/sample';"],
    [layout, "import { it } from './pages.test';"],
    [layout, "import { r } from '../render/typst';"],
    [layout, "import type { R } from '../render/typst';"],
    [layout, "import { readFile } from 'node:fs/promises';"],
    [layout, "import fs from 'fs';"],
    [layout, "import { execFile } from 'node:child_process';"],
    [layout, "import { randomUUID } from 'node:crypto';"],
    [layout, "import crypto from 'node:crypto';"],
    [layout, "import * as crypto from 'node:crypto';"],
    [layout, "import { deflateSync } from 'node:zlib';"],
    [layout, "import { inflateSync, createGunzip } from 'node:zlib';"],
    [layout, "import zlib from 'node:zlib';"],
    [layout, "import * as zlib from 'node:zlib';"],
    [layout, "export { randomUUID } from 'node:crypto';"],
    [layout, "export * from 'node:zlib';"],
    [layout, "const { randomUUID } = await import('node:crypto');"],
    [`${ENGINE}/render/bad.ts`, "import { a } from '@/lib/math';"],
    [`${ENGINE}/render/bad.ts`, "import https from 'node:https';"],
    [`${ENGINE}/render/bad.ts`, "import { randomUUID } from 'node:crypto';"],
    [`${ENGINE}/layout/bad.test.ts`, "import { a } from '@/lib/math';"],
    [`${ENGINE}/layout/bad.test.ts`, "import { add } from '../../math';"],
    [`${ENGINE}/testing/bad.ts`, "import { createClient } from '@supabase/supabase-js';"],
  ];
  for (const [file, line] of imports) assert.deepEqual(engineViolations({ [file]: `${line}\nexport {};\n` }), [`engine-imports ${file}`], line);
});

test("the pure part of the workbook engine has no clock, random source, network, files or settings", () => {
  const layout = `${ENGINE}/layout/bad.ts`;
  const render = `${ENGINE}/render/bad.ts`;
  const lines = [
    [layout, "export const a = new Date();"],
    [layout, "export const a = Date.now();"],
    [layout, "export const a = Math.random();"],
    [layout, "export const a = Math['random']();"],
    [layout, "export const { random } = Math;"],
    [layout, "export const a = crypto.randomUUID();"],
    [layout, "export const a = fetch('https://example.com');"],
    [layout, "export const a = globalThis.fetch;"],
    [layout, "export const a = performance.now();"],
    [layout, "export const a = process.env.X;"],
    [layout, "export const a = (n: number) => n.toLocaleString();"],
    [layout, "export const a = (s: string[]) => s.sort((x, y) => x.localeCompare(y));"],
    [layout, "export const a = new Intl.NumberFormat();"],
    [layout, "export const a = setTimeout(() => {}, 1);"],
    [layout, "export const a = eval('1');"],
    [layout, "export const a = 'a'['toLocaleUpperCase']();"],
    [layout, "export const a = 'a'[`toLocaleUpperCase`]();"],
    [layout, "export const a = 'a'?.['localeCompare']('b');"],
    [layout, "export const a = (n: number) => n['toLocaleString']();"],
    [layout, "const name = 'toLocaleString';\nexport const a = (n: number) => n[name]();"],
    [layout, "export const { toLocaleUpperCase } = 'a';"],
    [layout, "export const { toLocaleUpperCase: up } = 'a';"],
    [layout, "export const { 'toLocaleUpperCase': up } = 'a';"],
    [layout, "export const a = Reflect.get('a', 'localeCompare');"],
    [layout, "export const a = 'a'.constructor.constructor('return 1')();"],
    [layout, "export const a = (() => {})['constructor']('return 1')();"],
    [layout, "const m = Math;\nexport const a = m.random();"],
    [layout, "export const a = Math?.['random']();"],
    [render, "export const a = 'a'['toLocaleUpperCase']();"],
    [render, "export const a = new Date();"],
    [render, "export const a = Math.random();"],
    [render, "export const a = fetch('https://example.com');"],
    [render, "export const a = process.env.X;"],
  ];
  for (const [file, line] of lines) assert.deepEqual(engineViolations({ [file]: `${line}\n` }), [`engine-purity ${file}`], line);
});

test("the workbook engine has no level branch", () => {
  const file = `${ENGINE}/layout/bad.ts`;
  const lines = [
    "export const a = (level: string) => level === '3';",
    "export const a = (s: { level: { name: string } }) => s.level.name !== `3`;",
    "export const a = (level: { number: number }) => (level.number >= 7 ? 48 : 56);",
    "export const a = (level: { name: string }) => Number(level.name) < 7;",
    "const LAST = '6';\nexport const a = (levelName: string) => levelName === LAST;",
    "export const a = (grade: number) => grade > 3;",
    "export const a = (level: string) => { switch (level) { case '3': return 1; default: return 2; } };",
    "const HEIGHT: Record<string, number> = { 3: 56 };\nexport const a = (levelName: string) => HEIGHT[levelName];",
    "export const a = (m: Map<string, number>, level: { id: string }) => m.get(level.id);",
    "export const a = (level: { name: string }) => ['3', '4'].includes(level.name);",
    "export const a = (level: { name: string }) => level.name.startsWith('Calc');",
    "export const a = (level: { name: string }) => /^[3-6]$/.test(level.name);",
    "export const a = (id: string) => id === 'level-3';",
    "export function a(level: { name: string }) { const name = level.name; return name === '3' ? 'first' : 'second'; }",
    "export const a = (level: { name: string }) => { const name = level.name; const label = name; return label === '3'; };",
    "export const a = (level: { name: string }) => { const { name } = level; return name === '3'; };",
    "export const a = (level: { name: string }) => { const { name: label } = level; return label === '3'; };",
    "export const a = ({ level: { name } }: { level: { name: string } }) => name === '3';",
    "export const a = ({ level: n }: { level: string }) => n === '3';",
    "export const a = (levels: string[]) => { const [first] = levels; return first === '3'; };",
    "export const a = (level: { name: string }) => { const n = Number(level.name); return n < 7; };",
    "export const a = (level: { name: string }) => { const n = level.name.trim(); return n === '3'; };",
    "export const a = (level: { name: string }) => { const n = (level.name as string)!; return n === '3'; };",
    "export const a = (level: { name: string }) => { const n = +level.name; return n < 7; };",
    "export const a = (level: { name: string }) => { const n = `${level.name}`; return n === '3'; };",
    "export const a = (level: { name: string }) => { const n = level?.name ?? ''; return n === '3'; };",
    "export const a = (level: { name: string }) => { let n; n = level.name; return n === '3'; };",
    "export const a = (level: { name: string }) => { const n = level.name; switch (n) { case '3': return 1; default: return 2; } };",
    "export const a = (level: { name: string }) => { const n = level['name']; return n.startsWith('Calc'); };",
    "const HEIGHT: Record<string, number> = { 3: 56 };\nexport const a = (level: { name: string }) => { const n = level.name; return HEIGHT[n]; };",
  ];
  for (const line of lines) assert.deepEqual(engineViolations({ [file]: `${line}\n` }), [`engine-level-branch ${file}`], line);
  const fine = [
    "export const a = (level: { name: string } | null) => { const name = level?.name; return name === undefined ? null : name; };",
    "export const a = (level: { name: string }) => { const name = level.name; return `Level ${name}`; };",
    "export const a = (level: { name: string }, s: string) => { const f = () => { const name = level.name; return name; }; const name = s; return name === '3' ? f() : ''; };",
    "export const b = (level: { rows: string[] }) => { const count = make(level); return count === 3; };\nconst make = (x: { rows: string[] }) => x.rows.length;",
  ];
  for (const line of fine) assert.deepEqual(engineViolations({ [file]: `${line}\n` }), [], line);
  assert.deepEqual(engineViolations({ [`${ENGINE}/render/bad.typ`]: "#if sheet.level == 3 { }\n" }), [`engine-level-branch ${ENGINE}/render/bad.typ`]);
});

test("app code names no file of the workbook engine that is not code", () => {
  const app = "src/lib/uses-engine.ts";
  for (const line of [
    'import page from "@/lib/workbook-v2/render/page.typ?raw";',
    'import data from "./workbook-v2/fixtures/book.json";',
    'const font = readFileSync("src/lib/workbook-v2/render/fonts/Geist-Regular.ttf");',
    "const font = `${root}/src/lib/workbook-v2/render/fonts/OFL.txt`;",
    'import { a } from "@/lib/workbook-v2/hash"; const b = "@/lib/workbook-v2/fixtures/book.test.json";',
  ]) assert.deepEqual(engineViolations({ [app]: `${line}\n` }), [`engine-asset-use ${app}`], line);
  for (const line of [
    'import type { PageModel } from "@/lib/workbook-v2/contract";',
    'import { sha256 } from "./workbook-v2/hash.ts";',
    'import { sha256 } from "./workbook-v2/hash.js";',
    'import { book } from "@/lib/workbook-v2/build/build-book.generated.ts";',
    'import { book } from "@/lib/workbook-v2/build/build-book";',
    'import data from "./workbook-v2-tools/book.json";',
    "// docs/workbook-v2-engine.md",
  ]) assert.deepEqual(engineViolations({ [app]: `${line}\n` }), [], line);
});
