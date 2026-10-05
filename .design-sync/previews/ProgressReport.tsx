import { ProgressReport } from "ai-workbooks-landing-page";

export const Fractions = () => <div style={{ width: 330 }}><ProgressReport /></div>;
export const Reading = () => (
  <div style={{ width: 330 }}>
    <ProgressReport child="Arjun" grade={3} skill="Finding the main idea" score={5} total={6} recurring="Picked a detail, not the idea" next="Main idea, longer texts" updated="Updated 2 hours ago" />
  </div>
);
