// /our-story: the "why we built this" letter. The founder story, names and "students"
// appear only on this page, never on the home page. Uses the site nav and footer.
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/site";
import { BeliefList, Eyebrow, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, PromiseCards, START_LABEL } from "@/components/sections";
import { Rise } from "./drawn";
import founders from "@/assets/img/founders.jpg";
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
              We&apos;re two students in Vancouver who tutored kids in math, and we grew up doing learning programs for years, so we&apos;ve seen both sides.
              Learning centres worked, but they were expensive and gave every child the same pages. Tutoring was personal, but at $50–$100 an hour,
              most families could only afford an hour a week. So the families who could pay the most got the most personal help, and everyone else got the standard path.
            </p>
          </Rise>

          <section className="story-part" aria-labelledby="whoT">
            <Rise as="h2" id="whoT">Who we are</Rise>
            <Rise d={0.06}>
              <figure className="story-photo">
                <Image src={founders} alt="Savar and Cedric, the co-founders of Unica Learning" sizes="(min-width: 760px) 712px, 100vw" quality={90} placeholder="blur" priority />
                <figcaption>Savar and Cedric, co-founders</figcaption>
              </figure>
            </Rise>
            <Rise className="story-letter" d={0.08}>
              <p>
                We&apos;re Savar and Cedric. We&apos;ve been best friends since Grade 4 and grew up together, doing the same homework, the same learning programs,
                and later tutoring kids of our own. We both studied at Simon Fraser University: Savar in mechatronics and business, and Cedric in business.
              </p>
              <p>
                We&apos;ve always built things for our community. Before {BRAND}, we started <a href="https://unifysocial.ca" target="_blank" rel="noopener noreferrer">Unify Social</a>, a free platform that helps newcomers settle into life in Canada.
                We worked with libraries and non-profits to host workshops, built an app with settlement checklists and short lessons, and hosted education-focused
                events across the Simon Fraser University community.
              </p>
            </Rise>
          </section>

          <section className="story-part" aria-labelledby="builtT">
            <Rise as="h2" id="builtT">What we built</Rise>
            <Rise className="story-letter" d={0.06}>
              <p>{BRAND} is the middle ground: personal like a tutor, structured like a learning centre, and affordable.</p>
              <p>
                A free 20-minute test shows where your child is and what they&apos;re missing. Then we mail workbooks built around it: 15 to 30 minutes of practice a day,
                on paper, following the BC curriculum. Each new workbook adjusts to how the last one went, and when they&apos;re stuck, Maya, our AI Teaching Assistant, helps with hints.
              </p>
              <p><Link className="story-more" href="/#how">See how it works <span className="arr">→</span></Link></p>
            </Rise>
          </section>

          <section className="story-part" aria-labelledby="believeT">
            <Rise as="h2" id="believeT">What we believe</Rise>
            <Rise d={0.06}>
              <BeliefList
                items={[
                  { text: "Every child learns differently. Learning should adapt to them, not the other way around.", color: "sun" },
                  { text: "Personal learning shouldn't be only for families who can pay the most.", color: "sky" },
                  { text: "More pencil and paper, less screen time.", color: "tang" },
                ]}
              />
            </Rise>
          </section>

          <section className="story-part" aria-labelledby="storyPromiseT">
            <Rise as="h2" id="storyPromiseT">Our promise</Rise>
            <PromiseCards />
          </section>

          <section className="story-part" aria-labelledby="talkT">
            <Rise as="h2" id="talkT">Talk to us</Rise>
            <Rise className="story-letter" d={0.06}>
              <p>Questions about your child or the program? Email us at <a href="mailto:contact@unicalearning.com">contact@unicalearning.com</a>.</p>
            </Rise>
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
