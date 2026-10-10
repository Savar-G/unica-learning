import { pageMetadata } from "@/lib/metadata";
import { BRAND } from "@/lib/site";
import { Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { Reserve } from "@/components/reserve";
import { Footer } from "@/components/sections";
import { RewardsPrototype } from "@/components/rewards-prototype";

// PROTOTYPE (branch site/rewards-prototype): not indexed and not in sitemap.ts until a variant is chosen.
export const metadata = pageMetadata({
  path: "/rewards",
  title: "Rewards",
  description: "Your child earns points for every finished page and trades them for prizes you approve.",
  index: false,
});

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "What's included", href: "/#inc" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

export default function Rewards() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<button className="btn sm" data-open data-src="rewards-nav">Free assessment</button>} />
      <div className="frame">
        <main id="main" className="rw">
          <RewardsPrototype />
        </main>
        <Footer />
      </div>
      <Reserve />
      <Motion />
    </div>
  );
}
