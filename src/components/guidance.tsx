// "Help when they're stuck" (Oct 23, 2026): a short silent demo of personalized guidance on the shared board, from the
// tutor mockup (Mockups/AI tutor web app - human tutor.html, Call + board; the companion writes every step). Wide screens
// show the whole screen with the call's transcript; phones show the board alone, so the writing stays readable. It is a voice call that explains, not a
// chat, and the child does not take over the board yet; no "AI tutor" wording (meeting, Oct 22). The video loops
// muted and starts when it scrolls into view, so the copy says the captions show what is said.
import { Section, SectionHeader } from "@/ds";
import { DemoVideo } from "./demo-video";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/guidance.css";

const POINTS: [string, string][] = [
  ["A real conversation", "Your child talks, listens and asks questions. The words show beside the board."],
  ["See each step", "Every step is drawn on the board as it is explained."],
  ["On their exact question", "It knows the workbook page and question your child is on."],
];

const LABEL = "Demo of a voice call: the Unica companion explains 27 + 39 out loud and draws it on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

export function Guidance() {
  return (
    <Section id="guidance" aria-labelledby="guidanceT" className="gd">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Help when they're stuck" title="Stuck on a question? Talk it through." titleId="guidanceT" />
      </Rise>
      <Rise>
        <p className="gd-lead">Your child starts a voice call about the question. The Unica companion walks them through it step by step, out loud and on a shared board.</p>
      </Rise>
      <Rise className="gd-media">
        <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
        <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
        <p className="gd-cap">Shown without sound. The captions show what is said on the call.</p>
      </Rise>
      <Rise>
        <ul className="gd-points">
          {POINTS.map(([title, text]) => (
            <li key={title}><b>{title}</b><span>{text}</span></li>
          ))}
        </ul>
      </Rise>
    </Section>
  );
}
