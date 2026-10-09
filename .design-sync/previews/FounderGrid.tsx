import { FounderGrid, FounderCard } from "unica-learning-landing-page";

export const TwoFounders = () => (
  <div style={{ maxWidth: 560 }}>
    <FounderGrid>
      <FounderCard name="Savar Gupta" initial="S" />
      <FounderCard name="Cedric Tanafranca" initial="C" field="cool" />
    </FounderGrid>
  </div>
);
