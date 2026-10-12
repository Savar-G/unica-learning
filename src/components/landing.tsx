import { CardReturn } from "@/components/card-return";
import { Motion } from "@/components/motion";
import { Parent } from "@/components/parent";
import { StartLink } from "@/components/start-link";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, OurPromise, Pricing, START_LABEL, ThreadEnd, Why } from "@/components/sections";
import type { ReactNode } from "react";
import type { Look } from "@/lib/look";

/** `afterHow` holds a prototype section after How it works (round r18); the home page passes nothing. */
export function Landing({ look = "primer", afterHow }: { look?: Look; afterHow?: ReactNode }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <How />
          {afterHow}
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
