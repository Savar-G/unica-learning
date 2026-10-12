// /rewards: the rewards program as a letter to parents (D-078, variant D of round r10 on branch site/rewards-prototype).
// Linked from the "Daily practice, rewarded" card on the home page and the footer. Uses the site nav and footer.
import { BRAND } from "@/lib/site";
import { EARN, POINTS_PER_MONTH, PRIZES, REWARDS_FAQ, points } from "@/lib/rewards";
import { Eyebrow, Faq, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink } from "@/components/start-link";
import { Footer, START_LABEL } from "@/components/sections";
import { Rise } from "./drawn";
import "./rewards.css";

// Home-page section links, made absolute so they work from this page.
const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "What's included", href: "/#inc" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

export function Rewards() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src="rewards-nav">Free assessment</StartLink>} />
      <div className="frame">
        <main id="main" className="rewards">
          <Rise className="rewards-head">
            <Eyebrow>Rewards for kids</Eyebrow>
            <h1>Why we reward finished work</h1>
          </Rise>

          <Rise className="rewards-letter" d={0.06}>
            <p>Fifteen minutes on paper is easy for an adult to plan and hard for a seven-year-old to want. So we give your child something to work toward.</p>
            <p>
              Every page they finish earns points. The points are for the work, not for the score: a hard page that took three tries earns the same as an easy one.
              Your child saves the points, picks a prize, and you decide if it is a yes.
            </p>
          </Rise>

          <section className="rewards-part" aria-labelledby="earnT">
            <Rise as="h2" id="earnT">What earns points</Rise>
            <table className="rewards-table">
              <tbody>
                {EARN.map((e) => (
                  <tr key={e.title}>
                    <th scope="row">{e.title}</th>
                    <td>{e.text}</td>
                    <td className="n">+{e.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rewards-note">That is about {points(POINTS_PER_MONTH)} points a month at 5 days a week.</p>
          </section>

          <section className="rewards-part" aria-labelledby="chargeT">
            <Rise as="h2" id="chargeT">You stay in charge</Rise>
            <p>
              Nothing is ordered without you. When your child picks a prize in the app, you get a request on your phone.
              Say yes and we send it: small prizes ride in the next workbook box, tickets and gift cards come by email. Say not yet, and the points wait.
            </p>
          </section>

          <section className="rewards-part" aria-labelledby="prizesT">
            <Rise as="h2" id="prizesT">What they can choose</Rise>
            <ul className="rewards-list">
              {PRIZES.map((p) => (
                <li key={p.name}><span>{p.name}</span><b>{points(p.points)} points</b></li>
              ))}
            </ul>
          </section>

          <section className="rewards-part" aria-labelledby="rewardsFaqT">
            <Rise as="h2" id="rewardsFaqT">Questions</Rise>
            <Faq items={REWARDS_FAQ} />
          </section>

          <Rise className="rewards-end">
            <StartLink src="rewards">{START_LABEL} <span className="arr">→</span></StartLink>
          </Rise>
        </main>
        <Footer />
      </div>
      <Motion />
    </div>
  );
}
