import { SupportPage } from "@/components/support-page";

export default function Loading() {
  return <SupportPage label="Your next step" title="Checking your request.">
    <p className="lead" role="status">Please wait while we check the result.</p>
  </SupportPage>;
}
