// "Help when they're stuck" (Oct 23, 2026): a short silent demo of personalized guidance on the shared board, from the
// tutor mockup (Mockups/AI tutor web app - human tutor.html, Call + board; the tutor writes every step). Wide screens
// show the whole screen with the call's transcript; phones show the board alone, so the writing stays readable. It is a voice call that explains, not a
// chat, and the child does not take over the board yet; no "AI tutor" wording (meeting, Oct 22). The video loops
// muted and starts when it scrolls into view, so the copy says the captions show what is said.
import { Section, SectionHeader } from "@/ds";
import { DemoVideo } from "./demo-video";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/guidance.css";

const POINTS: [string, string][] = [
  ["Talked through out loud", "It is a voice call: your child talks and listens. What is said shows beside the board, so they can read it back."],
  ["Explained step by step", "Their tutor explains the idea behind the question out loud and draws each step on a shared board."],
  ["On the exact question", "It knows the workbook page and the question your child is on."],
  ["You hear about it", "After each call, you get a short note on what they worked on."],
];

const LABEL = "Demo of a voice call: a tutor explains 27 + 39 out loud and draws it on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

export function Guidance() {
  return (
    <Section id="guidance" aria-labelledby="guidanceT" className="gd">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Help when they're stuck" title="Stuck on a question? Hear it explained." titleId="guidanceT" />
      </Rise>
      <div className="gd-grid">
        <Rise className="gd-text">
          <p className="gd-lead">When your child gets stuck, they can start a voice call about that question. Their tutor explains it out loud, one step at a time, and draws it on a board as they talk.</p>
          <ul className="gd-points">
            {POINTS.map(([title, text]) => (
              <li key={title}><b>{title}</b><span>{text}</span></li>
            ))}
          </ul>
        </Rise>
        <Rise className="gd-media">
          <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
          <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
          <p className="gd-cap">Shown without sound. The captions show what is said on the call.</p>
        </Rise>
      </div>
    </Section>
  );
}
