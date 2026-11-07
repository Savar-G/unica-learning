import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import evidence from "../../data/scan-marking-endpoint-evidence-20261106.json";
import { COMPARISON_MODELS, COMPARISON_SETTINGS, assertSelectedComparisonResults, hashValue, preflightEndpoint, selectComparisonModels, type ComparisonModel, type ComparisonResult, type EndpointSnapshot } from "./scan-marking-comparison";
import { refreshEvidence } from "../../scripts/scan-marking-comparison-cli";
const qwen = "qwen/qwen3.8-flash";
const twelve = COMPARISON_MODELS.filter(m => m.model !== qwen).map(m => m.model);
const snapshot = (m: ComparisonModel) => evidence.snapshots[m.model as keyof typeof evidence.snapshots] as EndpointSnapshot;
const result = (model: string): ComparisonResult => ({ model, photo: "synthetic-first", status: "failed", failure: "fixture", attempts: [], observations: [], schemaValid: false, requestHash: "", photoHash: "", evidenceHash: "" });

describe("immutable pinned pair selection", () => {
  it("keeps the thirteen-pair default and exact pinned objects", () => {
    expect(selectComparisonModels(null)).toBe(COMPARISON_MODELS);
    const selected = selectComparisonModels([...twelve].reverse());
    expect(selected.map(m => m.model)).toEqual(twelve);
    expect(selected).toHaveLength(12);
    for (const m of selected) expect(m).toBe(COMPARISON_MODELS.find(original => original.model === m.model));
    expect(selectComparisonModels([qwen])).toEqual([COMPARISON_MODELS.find(m => m.model === qwen)]);
  });
  it.each([[], [""], [qwen,qwen], ["unknown/model"], [qwen,"new-host"], [" "+qwen]].map(ids => ({ ids })))("rejects invalid selection $ids", ({ ids }) => {
    expect(() => selectComparisonModels(ids)).toThrow("invalid-comparison-model-selection");
  });
  it("binds each pair set to a distinct plan while preserving schema, photos and pins", () => {
    const plan = (ids: readonly string[] | null) => ({ manifestHash: "fixed-photos", models: selectComparisonModels(ids), settings: COMPARISON_SETTINGS, maxAttempts: 1, approved: [] });
    const all = plan(null), other = plan(twelve), alone = plan([qwen]);
    expect(new Set([hashValue(all),hashValue(other),hashValue(alone)]).size).toBe(3);
    expect(other.settings).toBe(all.settings); expect(alone.manifestHash).toBe(all.manifestHash);
    expect(hashValue(plan([...twelve].reverse()))).toBe(hashValue(other));
    expect(() => assertSelectedComparisonResults([result(qwen)],twelve)).toThrow("result-outside-comparison-selection");
    expect(() => assertSelectedComparisonResults(twelve.map(result),[qwen])).toThrow("result-outside-comparison-selection");
    expect(() => assertSelectedComparisonResults(twelve.map(result),twelve)).not.toThrow();
    expect(() => assertSelectedComparisonResults([result(qwen)],[qwen])).not.toThrow();
  });
  it.each([twelve,[qwen]].map(ids => ({ ids })))("fetches only selected pinned endpoint evidence", async ({ ids }) => {
    const folder = await mkdtemp(join(tmpdir(),"marking-selection-")); const calls: string[] = [];
    try {
      const approved = selectComparisonModels(ids).map(m => ({model:m.model,status:"ready" as const,evidence:preflightEndpoint(m,snapshot(m),evidence.zdr),maximumMicros:1}));
      const states = await refreshEvidence(folder,approved,async input => {
        const url=String(input);calls.push(url);
        if(url.endsWith("/models")) return Response.json({data:COMPARISON_MODELS.map(m=>({id:m.model,architecture:{input_modalities:["image"]}}))});
        if(url.endsWith("/endpoints/zdr")) return Response.json(evidence.zdr);
        const m=COMPARISON_MODELS.find(m=>url.endsWith(m.model+"/endpoints"));
        if(!m || !ids.includes(m.model)) throw Error("Unselected endpoint fetched");
        return Response.json(snapshot(m));
      },ids);
      expect(calls).toHaveLength(ids.length+2);
      expect(states.map(s=>s.model)).toEqual(selectComparisonModels(ids).map(m=>m.model));
      expect(states.every(s=>s.status==="ready")).toBe(true);
    } finally {await rm(folder,{recursive:true,force:true});}
  });
  it("rejects an invalid pair before any endpoint or catalog fetch", async () => {
    let calls=0;
    await expect(refreshEvidence("unused",[],async()=>{calls++;throw Error("network");},["unknown/model"])).rejects.toThrow("invalid-comparison-model-selection");
    expect(calls).toBe(0);
  });
});
