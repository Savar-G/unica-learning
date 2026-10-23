// "Help when they're stuck" (Oct 23, 2026): a short silent demo of personalized guidance on the shared board, from the
// tutor mockup (Mockups/AI tutor web app - human tutor.html, Call + board). The feature is in development, so the
// section says so; no "AI tutor" wording (meeting, Oct 22). The video loops muted and starts when it scrolls into view.
import { Section, SectionHeader } from "@/ds";
import { DemoVideo } from "./demo-video";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/guidance.css";

const POINTS: [string, string][] = [
  ["On the exact question", "It knows the workbook page and the question your child is on."],
  ["Hints, not answers", "It talks the step through and draws it on a shared board, then gives your child the pencil."],
  ["You hear about it", "After each session, you get a short note on what they worked on."],
];

const LABEL = "Demo: a tutor and a child work through 27 + 39 on a shared board. The tutor shows carrying the 1, and the child writes the tens answer, 66.";

export function Guidance() {
  return (
    <Section id="guidance" aria-labelledby="guidanceT" className="gd">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Help when they're stuck" title="Stuck on a question? Work it out together." titleId="guidanceT" />
      </Rise>
      <div className="gd-grid">
        <Rise className="gd-text">
          <p className="gd-lead">When your child gets stuck, they can ask for help on that question. Personalized guidance walks through it with them, one step at a time.</p>
          <ul className="gd-points">
            {POINTS.map(([title, text]) => (
              <li key={title}><b>{title}</b><span>{text}</span></li>
            ))}
          </ul>
          <p className="gd-note">A preview. Personalized guidance is in development.</p>
        </Rise>
        <Rise className="gd-media">
          {/* The whole screen on wide screens; on phones, the board alone, so the writing stays readable. */}
          <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
          <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
        </Rise>
      </div>
    </Section>
  );
}
