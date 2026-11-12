import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import ts from "typescript";

it("keeps miss counting behind committed-value checks and refuses answer release", () => {
  const text = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
  const source = ts.createSourceFile("session.ts", text, ts.ScriptTarget.Latest, true);
  const bodies = new Map<string, string>();
  const writes: string[] = [];
  function visit(node: ts.Node, owner = "") {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      owner = node.name.text;
      bodies.set(owner, node.body.getText(source));
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(node.operatorToken.kind)) {
      const target = node.left.getText(source);
      if (["s.finalMisses", "ladder.failures", "failed"].includes(target)) writes.push(`${owner}:${target}:${node.right.getText(source)}`);
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  }
  visit(source);
  expect(writes.filter((x) => !x.startsWith("propose:"))).toEqual([]);
  expect(writes).toContain("propose:s.finalMisses:misses");
  expect(writes).toContain("propose:ladder.failures:1");
  for (const name of ["propose", "finalMisses", "teachingActs", "stuckWayOut", "heardAnswers"]) expect(bodies.get(name), name).toContain("committedValue(");
  expect(bodies.get("teachingActs")).toContain("misses >= 2");
  expect(bodies.get("propose")).toContain("finalMisses(s, checked)");
  expect(bodies.get("fallbacks")).toContain("finalMisses(s, checked)");
  expect(bodies.get("finalMisses")).toContain('c.answer.verdict === "wrong" && committedValue(s, c.answer)');
  expect(bodies.get("propose")).toContain('a.verdict === "wrong" && committedValue(s, a)');
  expect(bodies.get("propose")).toContain('p.act === "give_answer"');
  expect(bodies.get("propose")).toContain('"The answer is not offered."');
  expect(bodies.get("teachingActs")).toContain('a.verdict === "wrong" && committedValue(s, a)');
  expect(bodies.get("stuckWayOut")).toContain('a.verdict !== "wrong" || committedValue(s, a)');
});
