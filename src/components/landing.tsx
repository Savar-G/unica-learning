import { CardReturn } from "@/components/card-return";
import { Guidance } from "@/components/guidance";
import { Motion } from "@/components/motion";
import { Parent } from "@/components/parent";
import { Personalization } from "@/components/personalization";
import { StartLink, StartNote } from "@/components/start-link";
import { How } from "@/components/how-it-works";
import { Closing, Compare, Faq, Feel, Footer, Hero, Nav, OurPromise, Pricing, START_LABEL, Statement, ThreadEnd } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <Statement />
          <How />
          <Personalization />
          <Guidance />
          <Feel />
          <OurPromise />
          <Pricing />
          <Compare />
          <Parent />
          <Faq />
          <ThreadEnd />
        </main>
        <Footer>
          <Closing />
        </Footer>
      </div>
      <aside className="mobile-assessment" aria-label="Free assessment">
        <StartNote />
        <StartLink src="mobile-sticky">{START_LABEL} <span className="arr" aria-hidden="true">→</span></StartLink>
      </aside>
      <CardReturn />
      <Motion />
    </div>
  );
}
