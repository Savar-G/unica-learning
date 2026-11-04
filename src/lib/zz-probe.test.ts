import { it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook, type GenerateDeps, type GenerateInput } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { keySolver } from "./workbook-solve-check";
import { writeFileSync } from "node:fs";
const c = curriculumFor("bc")!;
it("probe", async () => {
  const result = planWorkbook(samplePlanInput(c, sampleChild(c, process.env.LV ?? "U4")!, "first"));
  if (!result.ok) throw new Error(result.reason);
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null, curriculum: c, plan: result.plan, book: {child:"Noah"}, itemPolicy:"approved-v1" };
  let tokens = 0;
  const deps: GenerateDeps = { ai: fakeAiClient({answer:fakeWorkbookItems}), solver:keySolver(), fit:{ fits:async()=>({ok:true}) }, qrToken:()=>`token-${String(++tokens).padStart(12,"0")}`, store:{save:async d=>({status:"saved",draftId:d.id}),draft:async()=>null} };
  const r = await generateWorkbook(input, deps);
  writeFileSync("/tmp/wbprobe/draft.json", JSON.stringify(r.status === "stored" ? r.draft : r));
}, 900000);
