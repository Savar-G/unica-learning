import { PlanGrid, PlanCard } from "unica-learning-landing-page";

export const TwoPlans = () => (
  <PlanGrid>
    <PlanCard name="One subject" note="Math or reading" price={49} ctaLabel="Choose one subject"
      features={["Placement assessment", "Personalized workbooks, mailed home", "Your next book arrives before the current one runs out", "Progress reports, updated continuously", "Delivery included. Cancel anytime"]} />
    <PlanCard featured name="Math + Reading" note="Both subjects, one plan" price={89} ctaLabel="Choose math + reading"
      features={["Everything in One Subject", "A math book and a reading book every cycle", "One progress report for both", "Delivery included. Cancel anytime"]} />
  </PlanGrid>
);
