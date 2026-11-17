// Node 22.23.1 can load the report's TypeScript directly. Read a capture file or stdin.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { BASELINE_PREFIX, BASELINE_PROFILE_PREFIX, baselineReport, readBaselineTurn } from "../src/lib/maya-baseline.ts";

const [file, ...extra] = process.argv.slice(2);
if (extra.length) throw Error("Usage: node scripts/maya-baseline-report.mjs [capture.log]");
const lines = createInterface({ input: file ? createReadStream(file) : process.stdin, crlfDelay: Infinity });
const turns = [];
const profiles = [];
let lineNumber = 0;
for await (const line of lines) {
  lineNumber++;
  const turnAt = line.indexOf(BASELINE_PREFIX);
  const profileAt = line.indexOf(BASELINE_PROFILE_PREFIX);
  if (turnAt < 0 && profileAt < 0) continue;
  try {
    if (turnAt >= 0) turns.push(readBaselineTurn(JSON.parse(line.slice(turnAt + BASELINE_PREFIX.length))));
    else profiles.push(JSON.parse(line.slice(profileAt + BASELINE_PROFILE_PREFIX.length)));
  } catch (cause) {
    throw Error(`Invalid Maya baseline sample at line ${lineNumber}`, { cause });
  }
}
if (!turns.length) throw Error("No Maya baseline turns in the input");
console.log(JSON.stringify({ turnGroups: baselineReport(turns), processProfiles: profiles }, null, 2));
