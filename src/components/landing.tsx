import { Compare } from "@/components/compare";
import { Motion } from "@/components/motion";
import { ParentPrototype } from "@/components/parent-prototype";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, OurPromise, Pricing, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root landing-with-mobile-cta" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <ParentPrototype how={<How />} howParent={<How parent />} />
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
