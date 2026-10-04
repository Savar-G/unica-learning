import { Motion } from "@/components/motion";
import { Reserve } from "@/components/reserve";
import { Closing, Faq, Feel, Footer, Hero, How, Included, Nav, Pricing, Team, What, Why } from "@/components/sections";

export default function Home() {
  return (
    <>
      <Nav />
      <div className="frame">
        <main id="main">
          <Hero />
          <What />
          <How />
          <Why />
          <Included />
          <Feel />
          <Team />
          <Pricing />
          <Faq />
          <Closing />
        </main>
        <Footer />
      </div>
      <Reserve />
      <Motion />
    </>
  );
}
