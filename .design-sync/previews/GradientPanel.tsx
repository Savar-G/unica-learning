import { GradientPanel, BeliefList, Button } from "ai-workbooks-landing-page";

export const ClosingCallToAction = () => (
  <GradientPanel>
    <BeliefList
      items={[
        { text: "Learning belongs on paper, not on another screen.", color: "sun" },
        { text: "We believe paper and pencil build stronger learning.", color: "sky" },
        { text: "Every child is different, so every workbook is too.", color: "tang" },
      ]}
    />
    <h2>This is what learning should be like.</h2>
    <div className="ctas">
      <Button>Get started</Button>
      <Button variant="ghost" href="#price" arrow={false}>See pricing</Button>
    </div>
  </GradientPanel>
);
