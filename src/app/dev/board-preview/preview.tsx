"use client";

import { useState } from "react";
import type { PublicQuestion } from "@/lib/assessment";
import { Question, useBoardHidden } from "@/components/test";
import { TestProgress } from "@/components/test-progress";
import "@/components/test-base.css";

const QUESTIONS: PublicQuestion[] = [
  { id: "preview-quick", level: 3, strand: "N", format: "number", whiteboard: false, readAloud: "", showWork: false, prompt: "What is 7 × 8?" },
  {
    id: "preview-work", level: 5, strand: "N", format: "number", whiteboard: true, readAloud: "", showWork: true,
    prompt: "A teacher has 100 square tiles. She makes a rectangle with 10 equal rows. How many tiles are in each row?",
  },
  { id: "preview-quick-2", level: 3, strand: "N", format: "number", whiteboard: false, readAloud: "", showWork: false, prompt: "What is 9 × 6?" },
];

/** The real question desk, with a stand-in for saving: Next just moves to the other sample question. */
export function BoardPreview() {
  const [n, setN] = useState(0);
  const [boardHidden, setBoardHidden] = useBoardHidden();
  const question = QUESTIONS[n];
  return (
    <div className="look-root test-root" data-look="warm">
      <header className="test-top">
        <span className="logo">Unica Learning<b /></span>
        <TestProgress answered={n} total={QUESTIONS.length} breakAfter={2} at="question" current={n} />
      </header>
      <main id="main" className="test-main">
        <Question
          key={question.id} testId="" typing question={question} initial="" revisit={false} canBack={n > 0}
          marked={false} onMark={() => {}} main="Next" takeYourTime={false} failure={null}
          onShown={() => {}} boardHidden={boardHidden} onBoardHidden={setBoardHidden}
          onLeave={async () => {
            setN((n + 1) % QUESTIONS.length);
            return "saved";
          }}
        />
      </main>
    </div>
  );
}
