import { BeliefList, GradientPanel } from "ai-workbooks-landing-page";

export const ClosingBeliefs = () => (
  <GradientPanel>
    <BeliefList
      items={[
        { text: "Learning belongs on paper, not on another screen.", color: "sun" },
        { text: "We believe paper and pencil build stronger learning.", color: "sky" },
        { text: "Every child is different, so every workbook is too.", color: "tang" },
      ]}
    />
  </GradientPanel>
);
