import { Motion } from "@/components/motion";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, Pricing, What, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <What />
          <How />
          <Why />
          <Included />
          <Feel />
          <Pricing />
          <Faq />
          <Closing />
        </main>
        <Footer />
      </div>
      <Reserve />
      <Motion />
    </div>
  );
}
