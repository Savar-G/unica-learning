import Link from "next/link";
import { ProgressPanels } from "@/components/parent-progress-panels";
import { SupportPage } from "@/components/support-page";
import type { ProgressView } from "@/lib/parent-view";
import "./parent-option-a.css";
import "./parent-progress.css";

// The Progress tab (#561, #1004, Option A v9): the child's skills, week by week. With no marked page yet it says so, and
// shows no chart and no zeros.

export function ParentProgress({ child, progress }: ProgressView) {
  const name = child.firstName;
  return (
    <SupportPage label="Progress" title={`${name}'s progress`} wide>
      <div className="pa-wrap"><div className="pa pp">
        {progress ? <ProgressPanels name={name} progress={progress} /> : (
          <div className="pa-card pp-empty">
            <b>Progress starts after the first marked pages</b>
            <p>When {name} finishes Day 1, scan the pages. Once they&apos;re marked, this tab shows the skills {name} masters, week by week.</p>
            {child.tabs.includes("scan_pages") && <Link className="pa-scanbtn" href="/account/scan">Go to Scan</Link>}
          </div>
        )}
      </div></div>
    </SupportPage>
  );
}
