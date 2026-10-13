import { SupportPage } from "@/components/support-page";

export default function Loading() {
  return (
    <SupportPage label="Free math assessment" title="Opening your assessment.">
      <p className="lead" role="status">Please wait while we load the next step.</p>
    </SupportPage>
  );
}
