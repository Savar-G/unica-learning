import { CardReturn } from "@/components/card-return";
import { Motion } from "@/components/motion";
import { Parent } from "@/components/parent";
import { StartLink } from "@/components/start-link";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, OurPromise, Pricing, START_LABEL, ThreadEnd, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <How />
          {/* PR 2 inserts the new Personalization section here, right after How (D-095, D-096). */}
          <Why />
          <Included />
          <Feel />
          <OurPromise />
          <Pricing />
          <Parent />
          <Faq />
          <ThreadEnd />
        </main>
        <Footer>
          <Closing />
        </Footer>
      </div>
      <aside className="mobile-assessment" aria-label="Free assessment">
        <StartLink src="mobile-sticky">{START_LABEL} <span className="arr" aria-hidden="true">→</span></StartLink>
      </aside>
      <CardReturn />
      <Motion />
    </div>
  );
}
