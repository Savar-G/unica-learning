// Compare public schema members with current main after regeneration. Formatting is not schema drift.
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const prior = execFileSync("git", ["show", "origin/main:src/lib/database.types.ts"], { encoding: "utf8" });
const current = readFileSync("src/lib/database.types.ts", "utf8");
function members(text) {
  const source = ts.createSourceFile("types.ts", text, ts.ScriptTarget.Latest, true);
  const database = source.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === "Database").type;
  const publicType = database.members.find(m => m.name.getText(source) === "public").type;
  const result = new Map();
  for (const group of publicType.members) {
    for (const member of group.type.members ?? []) result.set(`${group.name.getText(source)}.${member.name.getText(source)}`, member.getText(source).replace(/\s/g, ""));
  }
  return result;
}
const before = members(prior), after = members(current);
const changed = [...before].filter(([key, value]) => after.get(key) !== value).map(([key]) => key);
const additions = [...after.keys()].filter(key => !before.has(key));
const expected = ["Tables.workbook_comments", "Tables.workbook_edits", "Tables.workbook_edit_calls", ...["checkpoint_workbook_edit", "claim_workbook_edit", "complete_workbook_edit_call", "finish_workbook_edit", "frame_workbook_edit", "queue_workbook_edit", "release_workbook_edit", "reserve_workbook_edit_call", "save_workbook_comment", "send_workbook_comments"].map(name => `Functions.${name}`)];
if (changed.length || JSON.stringify(additions.sort()) !== JSON.stringify(expected.sort())) throw new Error(JSON.stringify({ changed, additions }));
console.log(`PASS: ${additions.length} workbook-edit additions, zero changed or removed main members`);
