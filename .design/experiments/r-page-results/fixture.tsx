"use client";

import { useEffect, useState } from "react";
import { ScanPageResults } from "@/components/scan-page-results";
import type { ScanResultsPageData } from "@/lib/scan-page-results";

export function ResultsFixture({ image, scenario }: { image: string; scenario: string }) {
  const [armed, setArmed] = useState(false);
  const [requests, setRequests] = useState(0);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (!String(input).startsWith("/api/account/scans/")) return original(input, init);
      if (String(input) !== "/api/account/scans/synthetic-results/explanation") throw new Error("Synthetic QA refuses every other scan request");
      setRequests(count => count + 1);
      if (scenario === "busy" || scenario === "retry" || scenario === "cap") return Response.json({ status: scenario });
      if (scenario === "closed") return Response.json({ status: "plan_closed" }, { status: 403 });
      return Response.json({ status: "ready", correctAnswer: "9", context: "synthetic-only", explanation: {
        steps: ["Start with 17.", "Take away 7 to get to 10.", "Take away 1 more. There are 9 left."],
        say: "Let’s take away 8 in two parts: 7 first, then 1 more. What is left?",
      } });
    };
    setArmed(true);
    return () => { window.fetch = original; };
  }, [scenario]);
  const data: ScanResultsPageData = {
    child: "Leah", day: "Day 9", page: 67, photo: scenario === "missing-photo" ? null : { src: image, width: 1000, height: 1414, aligned: scenario !== "missing-contract" },
    budgetHeld: false, unfinished: false,
    questions: Array.from({ length: 17 }, (_, index) => {
      const number = index + 1, review = number === 7 || number === 14, team = scenario === "team" && number === 14;
      const column = index < 9 ? 0 : 1, row = index < 9 ? index : index - 9;
      return {
        itemId: `synthetic-${number}`, number, version: 1, kind: team ? "team" : review ? "review" : "right",
        evidencePhoto: "synthetic-results", readAnswer: team ? null : review ? "8" : "9",
        questionText: review && !team && scenario !== "team" ? "17 − 8" : null, correctAnswer: review && !team && scenario !== "team" ? "9" : null,
        explainable: review && !team && scenario !== "no-explanation" && scenario !== "team",
        regions: scenario === "missing-contract" ? [] : [{ x: .315 + column * .47, y: (260 + row * 120) / 1414, width: .1, height: 60 / 1414 }],
        questionBox: scenario === "missing-contract" ? null : { x: .065 + column * .47, y: (228 + row * 120) / 1414, width: .4, height: 90 / 1414 },
      };
    }),
  };
  return <><output data-qa-requests={requests} hidden>{requests}</output>{armed && <ScanPageResults data={data} photo="synthetic-results" />}</>;
}
