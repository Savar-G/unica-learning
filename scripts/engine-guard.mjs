/**
 * Keeps the workbook engine (src/lib/workbook-v2, docs/workbook-v2-engine.md) pure and apart from the app. Run by
 * repo-guard.mjs; its tests are in repo-guard.test.mjs.
 *
 *   engine-imports:      the engine imports only its own modules and the packages listed here. The pure part never
 *                        imports render/, the one place that may read files and start Typst. No code imports tests.
 *   engine-purity:       no clock, random source, network, timer, setting or locale in the engine. render/ may use
 *                        files and programs, through its imports, and nothing else of these.
 *   engine-level-branch: no decision on a level or grade. A difference between levels is data.
 *   engine-asset-use:    app code under src/ names no file of the engine that is not code (a drawing, a font, a fixture).
 *                        The type check finds a removed module and Vitest finds the tests of a changed one, but neither
 *                        sees these files, so CI would run no app test for them. A file with no extension is not seen.
 *
 * It reads the text of one file at a time and knows no types. It does not see: a name put together at run time
 * ("toLocale" + "String"), a value that passes through a parameter, a field, a list or a function of the engine before
 * it is compared, or a table that one value from the snapshot selects without the word level or grade. It sees an alias
 * of a level only in the function that makes it. A review looks for these.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";

const ENGINE = "src/lib/workbook-v2";

// jsqr and inflateSync are pure: checks/ reads a finished page image back with them, from bytes to pixels to text.
const PURE_PACKAGES = ["jsqr", "node:crypto", "node:zlib", "qrcode"];
const RENDER_PACKAGES = ["node:child_process", "node:crypto", "node:fs", "node:fs/promises", "node:os", "node:path", "node:util"];
const TEST_PACKAGES = /^(vitest|fast-check|jsqr|sharp|node:.+)$/;
/** The only names that code of the engine may take from a module that also does other things, such as random values. */
const ONLY_NAMES = { "node:crypto": ["createHash"], "node:zlib": ["inflateSync"] };

const RENDER_BANNED = new Set([
  "Date", "Intl", "performance", "process", "crypto", "globalThis", "global", "window", "self",
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "eval", "Function",
  "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toLocaleUpperCase", "toLocaleLowerCase", "localeCompare",
]);
/** Methods that any value has, so their names are banned in every place and as text. `constructor` can make code. */
const METHODS_BANNED = new Set([...[...RENDER_BANNED].filter((name) => /locale/i.test(name)), "constructor"]);
const PURE_BANNED = new Set([...RENDER_BANNED, "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "__dirname", "__filename"]);

const LEVEL_NAME = /level|grade/i;
const LEVEL_ID = /^(level-\w+|calc[ -]?\d|u\d+)$/i;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
]);
/** Operators that give one of their values, and not an answer about it. */
const JOINS = new Set([ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.PlusToken]);
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

/** A text that is a plain key of an object, such as `{ "constructor": 1 }`. */
const isKey = (node) => ts.isPropertyAssignment(node.parent) && node.parent.name === node;

function impureName(source, banned) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isStringLiteralLike(node) && METHODS_BANNED.has(node.text) && !isKey(node)) found = node.text;
    if (ts.isIdentifier(node) && METHODS_BANNED.has(node.text) && (!isFieldName(node) || ts.isBindingElement(node.parent))) found = node.text;
    if (ts.isIdentifier(node) && !isFieldName(node)) {
      const member = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      if (banned.has(node.text) && !member) found = node.text;
      if (node.text === "Math" && !member && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name.text !== "random")) found = "Math.random";
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const isMemberName = (node) => (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || isFieldName(node);

/** Whether a value is a level, a part of one, or a plain change of form of one. */
function isLevelValue(node, isAlias) {
  const also = (child) => isLevelValue(child, isAlias);
  if (ts.isIdentifier(node)) return LEVEL_NAME.test(node.text) || isAlias(node);
  if (ts.isPropertyAccessExpression(node)) return LEVEL_NAME.test(node.name.text) || also(node.expression);
  if (ts.isElementAccessExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return also(node.expression);
  if (ts.isPrefixUnaryExpression(node)) return also(node.operand);
  if (ts.isBinaryExpression(node)) return JOINS.has(node.operatorToken.kind) && (also(node.left) || also(node.right));
  if (ts.isTemplateExpression(node)) return node.templateSpans.some((span) => also(span.expression));
  if (!ts.isCallExpression(node)) return false;
  return ts.isPropertyAccessExpression(node.expression) ? also(node.expression.expression) : ["Number", "String"].includes(node.expression.getText()) && node.arguments.some(also);
}

/** The names that hold a level under another name, each with the function (or the file) that declares it. */
function levelAliases(source) {
  const aliases = [];
  const isAlias = (node) => !isMemberName(node) && aliases.some(({ name, home }) => name === node.text && home.pos <= node.pos && node.end <= home.end);
  const homeOf = (node) => ts.findAncestor(node, (n) => ts.isFunctionLike(n) || ts.isSourceFile(n));
  const add = (nameNode, home) => {
    if (!LEVEL_NAME.test(nameNode.text) && !isAlias(nameNode)) aliases.push({ name: nameNode.text, home });
  };
  /** Whether a part of a pattern such as `{ level: { name } }` comes from a level. */
  const fromLevel = (element) => {
    if (element.propertyName && ts.isIdentifier(element.propertyName) && LEVEL_NAME.test(element.propertyName.text)) return true;
    const owner = element.parent.parent;
    if (ts.isBindingElement(owner)) return fromLevel(owner);
    return ts.isVariableDeclaration(owner) && owner.initializer !== undefined && isLevelValue(owner.initializer, isAlias);
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isLevelValue(node.initializer, isAlias)) add(node.name, homeOf(node));
    else if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && fromLevel(node)) add(node.name, homeOf(node));
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && isLevelValue(node.right, isAlias)) add(node.left, homeOf(node));
    ts.forEachChild(node, visit);
  };
  for (let before = -1; before !== aliases.length;) {
    before = aliases.length;
    visit(source);
  }
  return isAlias;
}

function mentionsLevelOr(node, isAlias) {
  if (ts.isIdentifier(node) && (LEVEL_NAME.test(node.text) || isAlias(node))) return true;
  return ts.forEachChild(node, (child) => mentionsLevelOr(child, isAlias) || undefined) ?? false;
}

const isConstant = (node) => ts.isLiteralExpression(node) || (ts.isIdentifier(node) && CONSTANT_NAME.test(node.text)) || ts.isRegularExpressionLiteral(node);
const isLevelId = (node) => ts.isStringLiteralLike(node) && LEVEL_ID.test(node.text);

function levelBranch(source) {
  const isAlias = levelAliases(source);
  const mentionsLevel = (node) => mentionsLevelOr(node, isAlias);
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
    || (zone !== "test" && Object.hasOwn(ONLY_NAMES, target) && (names === null || names.some((n) => !ONLY_NAMES[target].includes(n)))));
  if (bad) violations.push({ rule: "engine-imports", file, message: `${file} imports ${bad.target === null ? "a module whose name is not plain text" : `"${bad.target}"`}. The workbook engine uses only its own modules and the packages in scripts/engine-guard.mjs; its pure part does not use render/ or tests.` });
  if (zone === "test") return violations;
  const impure = impureName(source, zone === "render" ? RENDER_BANNED : PURE_BANNED);
  if (impure && !bad) violations.push({ rule: "engine-purity", file, message: `${file} uses ${impure}. A book is a pure function of its input: no clock, random source, network, setting or locale in the workbook engine.` });
  const branch = levelBranch(source);
  if (branch) violations.push({ rule: "engine-level-branch", file, message: `${file} decides on a level or grade: ${branch}. Put the difference in the snapshot.` });
  return violations;
}

const ENGINE_PATH = /\bworkbook-v2\/[^"'`\s)?#]+/g;
/** A path whose last extension is not one of code. A path with no extension is taken for a module. */
const isAsset = (path) => /\.\w+$/.test(path) && !/\.[cm]?[jt]sx?$/.test(path);

function appFiles(rootDir, dir = "src", out = []) {
  if (!existsSync(join(rootDir, dir))) return out;
  for (const entry of readdirSync(join(rootDir, dir), { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== ENGINE) appFiles(rootDir, path, out);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function checkAssetUse(file, text) {
  const asset = text.match(ENGINE_PATH)?.find(isAsset);
  return asset ? [{ rule: "engine-asset-use", file, message: `${file} names "${asset}". App code uses the modules of the workbook engine and not its other files: CI cannot find the app tests of those.` }] : [];
}

export function checkEngine(rootDir) {
  const read = (file) => readFileSync(join(rootDir, file), "utf8");
  return [
    ...engineFiles(rootDir).sort().flatMap((file) => (file.endsWith(".typ") ? checkTypst(file, read(file)) : checkCode(file, read(file)))),
    ...appFiles(rootDir).sort().flatMap((file) => checkAssetUse(file, read(file))),
  ];
}
