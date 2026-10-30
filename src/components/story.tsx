// /our-story: the "why we built this" letter. The founder story, names and "students"
// appear only on this page, never on the home page. Uses the site nav and footer.
import { BRAND } from "@/lib/site";
import { BeliefList, Eyebrow, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, PromiseCards, START_LABEL } from "@/components/sections";
import { Rise } from "./drawn";
import "./story.css";

// Home-page section links, made absolute so they work from this page.
const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Curriculum", href: "/curriculum" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

export function Story() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src="story-nav">Free assessment</StartLink>} />
      <div className="frame">
        <main id="main" className="story">
          <Rise className="story-head">
            <Eyebrow>Our story</Eyebrow>
            <h1>Why we built {BRAND}</h1>
          </Rise>

          <Rise className="story-letter" d={0.06}>
            <p>
              {BRAND} is made in Vancouver by two students who grew up on workbooks. We both did workbook programs for years, and we&apos;ve tutored other kids.
              Learning centres worked, but they were expensive and one-size-fits-all. Tutoring was personal, but it cost $50-$100 an hour.
              We built the middle: personal, on paper, and affordable.
            </p>
          </Rise>

          <section className="story-part" aria-labelledby="believeT">
            <Rise as="h2" id="believeT">What we believe</Rise>
            <Rise d={0.06}>
              <BeliefList
                items={[
                  { text: "Every child learns differently. Learning should adapt.", color: "sun" },
                  { text: "No child should fall behind because the class moved on.", color: "sky" },
                  { text: "Personal, on paper, and affordable.", color: "tang" },
                ]}
              />
            </Rise>
          </section>

          <section className="story-part" aria-labelledby="storyPromiseT">
            <Rise as="h2" id="storyPromiseT">Our promise</Rise>
            <PromiseCards />
          </section>

          <Rise className="story-end">
            <p className="story-sign">Savar and Cedric</p>
            <div>
              <StartLink src="story">{START_LABEL} <span className="arr">→</span></StartLink>
              <StartNote />
            </div>
          </Rise>
        </main>
        <Footer />
      </div>
      <Motion />
    </div>
  );
}
