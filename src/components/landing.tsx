import { Motion } from "@/components/motion";
import { Parent } from "@/components/parent";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, OurPromise, Pricing, ThreadEnd, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <How />
          <Parent />
          <Why />
          <Included />
          <Feel />
          <OurPromise />
          <Pricing />
          <Faq />
          <ThreadEnd />
        </main>
        <Footer>
          <Closing />
        </Footer>
      </div>
      <aside className="mobile-assessment" aria-label="Free assessment">
        <button className="btn" type="button" data-open data-src="mobile-sticky">Take free assessment <span className="arr" aria-hidden="true">→</span></button>
      </aside>
      <Reserve />
      <Motion />
    </div>
  );
}
