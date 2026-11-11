// A public sample of the parent's report (D-096): the real ReportCard, read-only, for an invented Grade 3 child
// working at a Grade 2 level. Its next step is a "Take free assessment" button.
// Every number is computed by the real session and report model (src/lib/sample-children.ts).
import { ReportCard } from "@/components/report";
import { StartLink, StartNote } from "@/components/start-link";
import { START_LABEL } from "@/components/sections";
import { SupportPage } from "@/components/support-page";
import { pageMetadata } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import { pageJsonLd } from "@/lib/structured-data";
import { SAMPLE_CHILDREN } from "@/lib/sample-children";
import { sampleReportWithBook } from "@/lib/sample-book-one";
import "@/ds/styles/personalization.css";

const PAGE = {
  path: "/sample-report",
  title: "Sample math report",
  description: "See the report from the free online math assessment, for a sample Grade 3 child.",
};
export const metadata = pageMetadata(PAGE);

export default function SampleReportPage() {
  const view = sampleReportWithBook();
  const name = SAMPLE_CHILDREN.a.name;
  return (
    <SupportPage label="" title="" wide>
      <JsonLd data={pageJsonLd(PAGE)} />
      <aside className="sample-note" aria-label="About this sample">
        <div>
          <p className="eyebrow">Sample report</p>
          <p>
            {name} is a sample child in Grade 3. This is the report a parent gets after the free online math assessment.
            Your report uses your own child&apos;s answers.
          </p>
        </div>
        <div>
          <StartLink src="sample-report">{START_LABEL} <span className="arr" aria-hidden="true">→</span></StartLink>
          <StartNote />
        </div>
      </aside>
      <ReportCard
        view={view}
        readOnly
        nextSlot={<div><StartLink src="sample-report-end">{START_LABEL} <span className="arr" aria-hidden="true">→</span></StartLink><StartNote /></div>}
      />
    </SupportPage>
  );
}
