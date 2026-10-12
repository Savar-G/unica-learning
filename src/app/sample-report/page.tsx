// A public sample of the parent's report (round r18): the real ReportCard, read-only, for an invented Grade 3 child.
// Every number is computed by the real session and report model (src/lib/sample-children.ts).
// Build stage (after D-096): add it to sitemap.ts and /llms.txt.
import { ReportCard } from "@/components/report";
import { StartLink } from "@/components/start-link";
import { START_LABEL } from "@/components/sections";
import { SupportPage } from "@/components/support-page";
import { pageMetadata } from "@/lib/metadata";
import { SAMPLE_CHILDREN, sampleReportView } from "@/lib/sample-children";
import "@/ds/styles/personalization.css";

export const metadata = pageMetadata({
  path: "/sample-report",
  title: "Sample math report",
  description: "See the report from the free online math assessment, for a sample Grade 3 child.",
});

export default function SampleReportPage() {
  const view = sampleReportView();
  const name = SAMPLE_CHILDREN.a.name;
  return (
    <SupportPage label="" title="" wide>
      <aside className="sample-note" aria-label="About this sample">
        <div>
          <p className="eyebrow">Sample report</p>
          <p>
            {name} is a sample child in Grade 3. This is the report a parent gets after the free online math assessment.
            Your report uses your own child&apos;s answers.
          </p>
        </div>
        <StartLink src="sample-report">{START_LABEL} <span className="arr" aria-hidden="true">→</span></StartLink>
      </aside>
      <ReportCard view={view} readOnly />
    </SupportPage>
  );
}
