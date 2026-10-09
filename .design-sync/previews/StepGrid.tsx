import { StepGrid, StepCard, Mailer, PhoneScan, WorkbookPage, photos } from "unica-learning-landing-page";

export const SixSteps = () => (
  <StepGrid>
    <StepCard number="01" title="Assess." visual={<img src={photos.loopAssess1} alt="Child takes the assessment" />}>Your child completes a short adaptive online assessment.</StepCard>
    <StepCard number="02" title="Deliver." visual={<Mailer />}>We mail a workbook made for what your child needs next.</StepCard>
    <StepCard number="03" title="Practice." visual={<img src={photos.loopPractice6} alt="A girl works through an arithmetic page" />}>15-20 minutes a day, on paper.</StepCard>
    <StepCard number="04" title="Scan." visual={<PhoneScan />}>You photograph the finished pages with your phone.</StepCard>
    <StepCard number="05" title="Adapt." visual={<WorkbookPage />} visualTone="paper">We check every answer and update the learning profile.</StepCard>
    <StepCard number="06" title="Repeat." visual={<WorkbookPage variant="next-book" />} visualTone="paper">The next book is built from what they mastered or missed.</StepCard>
  </StepGrid>
);
