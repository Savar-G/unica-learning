import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isPhone } from "@/lib/account-server";
import { SAMPLE_CHILDREN, sampleReportView } from "@/lib/sample-children";
import { AccountSignup } from "@/components/account";
import { ReportLevelPreview } from "@/components/report";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/start",
  title: "Start the free assessment",
  description: "Create your account and add your child to start the free math assessment.",
  index: false,
});

// The signup for the free online math assessment (D-082): no plan question. Every "Take free assessment" link on
// the public site opens it (#82). The parent proves the email with a one-time code before any account data is written.
// D-134: the three steps and a piece of the sample report come first, so the parent knows what happens before the
// form. On a phone the form is short (no postal code, no password): the test happens later on a laptop or tablet.
export default async function Start() {
  if (await parentId(await sessionClient())) redirect("/account");
  const phone = isPhone(await headers());
  const steps = [
    {
      title: "Create your account",
      text: phone ? "Here, on your phone. We email you a code to confirm your email." : "Here. We email you a code to confirm your email.",
    },
    {
      title: "Your child takes the test",
      text: phone ? "Later, on a laptop or tablet. We email you the link to open there." : "On this laptop or tablet, alone, in one sitting.",
    },
    { title: "You get the report", text: "By email, within minutes. It shows your child's math level and the gaps to work on." },
  ];
  return (
    <SupportPage label="Free math assessment" title="Start the free assessment." wide>
      <p className="lead">Families across Canada can sign up for personalized math workbooks. Start with the free assessment, then choose a plan after the report.</p>
      <ol className="start-steps" aria-label="How it works">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="start-n" aria-hidden="true">{i + 1}</span>
            <span><b>{s.title}</b> {s.text}</span>
          </li>
        ))}
      </ol>
      <div className="start-layout">
        <AccountSignup phone={phone} />
        <aside className="start-sample" aria-label="What the report looks like">
          <ReportLevelPreview view={sampleReportView()} />
          <p className="small">{SAMPLE_CHILDREN.a.name} is a sample child in Grade 3. Your report uses your own child&apos;s answers.</p>
          <p className="small"><Link href="/sample-report">See the full sample report <span aria-hidden="true">→</span></Link></p>
        </aside>
      </div>
    </SupportPage>
  );
}
