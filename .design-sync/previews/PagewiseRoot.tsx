import { PagewiseRoot, SectionHeader, Button } from "ai-workbooks-landing-page";

export const ThemedPage = () => (
  <PagewiseRoot style={{ padding: 32 }}>
    <SectionHeader eyebrow="How it works" title="Six steps. One loop." lead="Everything inside the root picks up the warm look: Geist type, mono labels and the grain tokens." />
    <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
      <Button>Get started</Button>
      <Button variant="ghost">See how it works</Button>
    </div>
  </PagewiseRoot>
);
