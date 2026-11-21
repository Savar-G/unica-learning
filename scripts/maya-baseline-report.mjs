// Node 22.23.1 can load the report's TypeScript directly. Read capture files or stdin.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  BASELINE_COST_PREFIX, BASELINE_PREFIX, BASELINE_PROFILE_PREFIX, baselineCostReport, baselineReport, complexBudget,
  readBaselineCost, readBaselineTurn,
} from "../src/lib/maya-baseline.ts";

const files = process.argv.slice(2);
const turns = [];
const profiles = [];
const costs = [];
const prefixes = [[BASELINE_PREFIX, v => turns.push(readBaselineTurn(v))], [BASELINE_PROFILE_PREFIX, v => profiles.push(v)], [BASELINE_COST_PREFIX, v => costs.push(readBaselineCost(v))]];
for (const file of files.length ? files : [null]) {
  const lines = createInterface({ input: file ? createReadStream(file) : process.stdin, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    // The longest matching prefix wins: the turn prefix is a prefix of neither of the others, but check all three.
    const found = prefixes.map(([prefix, add]) => ({ at: line.indexOf(prefix), prefix, add })).filter(p => p.at >= 0)
      .sort((a, b) => a.at - b.at || b.prefix.length - a.prefix.length)[0];
    if (!found) continue;
    try {
      found.add(JSON.parse(line.slice(found.at + found.prefix.length)));
    } catch (cause) {
      throw Error(`Invalid Maya baseline sample at ${file ?? "stdin"}:${lineNumber}`, { cause });
    }
  }
}
if (!turns.length) throw Error("No Maya baseline turns in the input");
console.log(JSON.stringify({ turnGroups: baselineReport(turns), complexBudget: complexBudget(turns), costs: baselineCostReport(costs), processProfiles: profiles }, null, 2));
