import { Compare } from "@/components/compare";
import { Motion } from "@/components/motion";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, OurPromise, Pricing, What, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <What />
          <How />
          <Why />
          <Included />
          <Feel />
          <OurPromise />
          <Compare />
          <Pricing />
          <Faq />
          <Closing />
        </main>
        <Footer />
      </div>
      <aside className="mobile-assessment" aria-label="Free assessment">
        <button className="btn" type="button" data-open data-src="mobile-sticky">Take free assessment <span className="arr" aria-hidden="true">→</span></button>
      </aside>
      <Reserve />
      <Motion />
    </div>
  );
}
