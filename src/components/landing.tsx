import { Motion } from "@/components/motion";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, Pricing, Team, What, Why } from "@/components/sections";
import type { Look } from "@/lib/look";

export function Landing({ look = "primer" }: { look?: Look }) {
  return (
    <div className="look-root" data-look={look}>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <What look={look} />
          <How look={look} />
          <Why look={look} />
          <Included look={look} />
          <Feel look={look} />
          <Team look={look} />
          <Pricing look={look} />
          <Faq look={look} />
          <Closing look={look} />
        </main>
        <Footer />
      </div>
      <Reserve />
      <Motion />
    </div>
  );
}
