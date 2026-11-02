import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("R421W-3: the exported database schema excludes unmerged workbook and minute types", () => {
  const file = resolve("src/lib/database.types.ts");
  const program = ts.createProgram([file], { noLib: true, noResolve: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file)!;
  const declaration = source.statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Database")!;
  const database = checker.getTypeAtLocation(declaration);
  const member = (type: ts.Type, key: string) => checker.getTypeOfSymbolAtLocation(type.getProperty(key)!, declaration);
  const schema = member(database, "public");
  // Live type generation can include another branch's already-applied migration. Require its SQL here too.
  const sql = [readFileSync("supabase/schema.sql", "utf8"), ...readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).map((n) => readFileSync(resolve("supabase/migrations", n), "utf8"))].join("\n");
  const tables = member(schema, "Tables").getProperties().map((p) => p.name);
  expect(tables.includes("maya_minute_grants")).toBe(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.maya_minute_grants\b/i.test(sql));
  const functions = member(schema, "Functions").getProperties().map((p) => p.name);
  for (const name of ["approve_workbook_draft", "mark_workbook", "_maya_minutes_used", "grant_maya_minutes", "maya_minutes_used"]) {
    const declared = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\b`, "i").test(sql);
    expect(functions.includes(name), name).toBe(declared);
  }
  const parentColumns = member(member(member(schema, "Tables"), "parents"), "Row").getProperties().map((p) => p.name);
  expect(parentColumns.includes("time_zone")).toBe(/add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?time_zone\b/i.test(sql));
});
