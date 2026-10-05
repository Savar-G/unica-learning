import { StepGrid, StepCard, Mailer, WorkbookPage, Photo, photos } from "ai-workbooks-landing-page";

export const WithPhoto = () => (
  <StepGrid>
    <StepCard number="01" title="Assess." visual={<img src={photos.loopAssess1} alt="A parent sits beside her daughter as she takes the assessment" />}>
      Your child completes an adaptive online assessment that identifies their level, strengths, gaps and misconceptions.
    </StepCard>
  </StepGrid>
);
export const WithMailer = () => (
  <StepGrid>
    <StepCard number="02" title="Deliver." visual={<Mailer />}>
      We create and mail a physical workbook personalized to what your child needs to work on.
    </StepCard>
  </StepGrid>
);
export const WithWorkbookPage = () => (
  <StepGrid>
    <StepCard number="05" title="Adapt." visual={<WorkbookPage />} visualTone="paper">
      Our system checks your child's answers and updates their learning profile.
    </StepCard>
  </StepGrid>
);
