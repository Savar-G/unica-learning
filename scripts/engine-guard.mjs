/**
 * Keeps the workbook engine (src/lib/workbook-v2, docs/workbook-v2-engine.md) pure and apart from the app. Run by
 * repo-guard.mjs; its tests are in repo-guard.test.mjs.
 *
 *   engine-imports:      the engine imports only its own modules and the packages listed here. The pure part never
 *                        imports render/, the one place that may read files and start Typst. No code imports tests.
 *   engine-purity:       no clock, random source, network, timer, setting or locale in the engine. render/ may use
 *                        files and programs, through its imports, and nothing else of these.
 *   engine-level-branch: no decision on a level or grade. A difference between levels is data.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";

const ENGINE = "src/lib/workbook-v2";

const PURE_PACKAGES = ["node:crypto", "qrcode"];
const RENDER_PACKAGES = ["node:child_process", "node:crypto", "node:fs", "node:fs/promises", "node:os", "node:path", "node:util"];
const TEST_PACKAGES = /^(vitest|fast-check|jsqr|sharp|node:.+)$/;
/** node:crypto also makes random values, so only its hash may be used. */
const CRYPTO_NAMES = ["createHash"];

const RENDER_BANNED = new Set([
  "Date", "Intl", "performance", "process", "crypto", "globalThis", "global", "window", "self",
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "eval", "Function",
  "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toLocaleUpperCase", "toLocaleLowerCase", "localeCompare",
]);
const PURE_BANNED = new Set([...RENDER_BANNED, "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "__dirname", "__filename"]);

const LEVEL_NAME = /level|grade/i;
const LEVEL_ID = /^(level-\w+|calc[ -]?\d|u\d+)$/i;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
]);
const LOOKUPS = new Set(["get", "has", "includes", "indexOf", "test", "exec"]);
const TEXT_QUESTIONS = new Set(["startsWith", "endsWith", "includes", "indexOf", "match", "search"]);

function engineFiles(rootDir, dir = ENGINE, out = []) {
  if (!existsSync(join(rootDir, dir))) return out;
  for (const entry of readdirSync(join(rootDir, dir), { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) engineFiles(rootDir, path, out);
    else if (/\.([cm]?[jt]sx?|typ)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Tests and their helpers may read files and settings; they still may not use the app. */
function zoneOf(file) {
  if (/\.test\.[cm]?tsx?$/.test(file) || file.startsWith(`${ENGINE}/testing/`)) return "test";
  return file.startsWith(`${ENGINE}/render/`) ? "render" : "pure";
}

function importAllowed(file, zone, target) {
  if (!target.startsWith(".")) {
    if (zone === "test") return TEST_PACKAGES.test(target) || RENDER_PACKAGES.includes(target) || target === "qrcode";
    return (zone === "render" ? RENDER_PACKAGES : PURE_PACKAGES).includes(target);
  }
  const path = posix.normalize(posix.join(posix.dirname(file), target));
  if (!path.startsWith(`${ENGINE}/`)) return false;
  if (zone === "test") return true;
  if (path.startsWith(`${ENGINE}/testing/`) || /\.test(\.[cm]?tsx?)?$/.test(path)) return false;
  return zone === "render" || !path.startsWith(`${ENGINE}/render/`);
}

/** The import targets of a file: a text, or null when the target is not a plain text. */
function importsOf(source) {
  const found = [];
  const add = (node, names = null) => found.push({ target: node && ts.isStringLiteralLike(node) ? node.text : null, names });
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      const named = bindings && ts.isNamedImports(bindings) && !node.importClause.name ? bindings.elements.map((e) => (e.propertyName ?? e.name).text) : null;
      add(node.moduleSpecifier, named);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node)) add(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null);
    else if (ts.isImportEqualsDeclaration(node)) add(null);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** A name that declares a field or is a plain key says nothing about a global of that name. */
function isFieldName(node) {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodSignature(parent) || ts.isMethodDeclaration(parent)) return parent.name === node;
  return ts.isBindingElement(parent) && parent.propertyName === node;
}

function impureName(source, banned) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isIdentifier(node) && !isFieldName(node)) {
      const member = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      if (banned.has(node.text) && (!member || /locale/i.test(node.text))) found = node.text;
      if (node.text === "Math" && !member && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name.text !== "random")) found = "Math.random";
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function mentionsLevel(node) {
  if (ts.isIdentifier(node) && LEVEL_NAME.test(node.text)) return true;
  return ts.forEachChild(node, (child) => mentionsLevel(child) || undefined) ?? false;
}

const isConstant = (node) => ts.isLiteralExpression(node) || (ts.isIdentifier(node) && CONSTANT_NAME.test(node.text)) || ts.isRegularExpressionLiteral(node);
const isLevelId = (node) => ts.isStringLiteralLike(node) && LEVEL_ID.test(node.text);

function levelBranch(source) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) {
      const { left, right } = node;
      if ((isConstant(left) && mentionsLevel(right)) || (isConstant(right) && mentionsLevel(left)) || isLevelId(left) || isLevelId(right)) found = node;
    } else if (ts.isSwitchStatement(node) && mentionsLevel(node.expression)) found = node.expression;
    else if (ts.isElementAccessExpression(node) && mentionsLevel(node.argumentExpression)) found = node;
    else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (LOOKUPS.has(name.text) && node.arguments.some(mentionsLevel)) found = node;
      else if (TEXT_QUESTIONS.has(name.text) && mentionsLevel(expression) && node.arguments.some(isConstant)) found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found && found.getText(source).slice(0, 80);
}

function checkTypst(file, text) {
  const code = text.replace(/\/\/.*$/gm, "");
  if (!LEVEL_NAME.test(code)) return [];
  return [{ rule: "engine-level-branch", file, message: `${file} names a level or grade. A drawing file draws the page model and decides nothing.` }];
}

function checkCode(file, text) {
  const zone = zoneOf(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations = [];
  const bad = importsOf(source).find(({ target, names }) => target === null || !importAllowed(file, zone, target)
    || (zone !== "test" && target === "node:crypto" && (names === null || names.some((n) => !CRYPTO_NAMES.includes(n)))));
  if (bad) violations.push({ rule: "engine-imports", file, message: `${file} imports ${bad.target === null ? "a module whose name is not plain text" : `"${bad.target}"`}. The workbook engine uses only its own modules and the packages in scripts/engine-guard.mjs; its pure part does not use render/ or tests.` });
  if (zone === "test") return violations;
  const impure = impureName(source, zone === "render" ? RENDER_BANNED : PURE_BANNED);
  if (impure && !bad) violations.push({ rule: "engine-purity", file, message: `${file} uses ${impure}. A book is a pure function of its input: no clock, random source, network, setting or locale in the workbook engine.` });
  const branch = levelBranch(source);
  if (branch) violations.push({ rule: "engine-level-branch", file, message: `${file} decides on a level or grade: ${branch}. Put the difference in the snapshot.` });
  return violations;
}

export function checkEngine(rootDir) {
  return engineFiles(rootDir).sort().flatMap((file) => {
    const text = readFileSync(join(rootDir, file), "utf8");
    return file.endsWith(".typ") ? checkTypst(file, text) : checkCode(file, text);
  });
}
