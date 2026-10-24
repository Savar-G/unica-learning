"use client";

// The /compare at-a-glance table (D-114). Four columns on wide screens; under 900px it shows one option beside ours,
// picked with the switch. Without JavaScript the phone table shows the private tutor.
import { useState } from "react";
import { OPTIONS, type OptionId } from "@/lib/compare";
import { BRAND } from "@/lib/site";
import { CompareGrid } from "./compare";

type Pick = Exclude<OptionId, "us">;

export function CompareSwitch({ labelledBy }: { labelledBy: string }) {
  const [pick, setPick] = useState<Pick>("tutor");
  return (
    <div className="cmp-pick" data-pick={pick}>
      <div className="cmp-switch" role="group" aria-label={`Compare ${BRAND} with`}>
        <p>Compare with</p>
        {OPTIONS.filter((o): o is { id: Pick; name: string; short: string } => o.id !== "us").map((o) => (
          <button type="button" key={o.id} aria-pressed={pick === o.id} onClick={() => setPick(o.id)}>{o.short}</button>
        ))}
      </div>
      <CompareGrid className="cmp-all" columns={OPTIONS.map((o) => o.id)} rows={["personal", "plan", "help", "person", "gaps", "paper", "home"]} labelledBy={labelledBy} />
    </div>
  );
}
