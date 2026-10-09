import { Hero, Button, photos } from "unica-learning-landing-page";

export const LandingHero = () => (
  <Hero
    imageSrc={photos.heroHome1}
    imageAlt="A boy writes in his workbook at a desk at home"
    actions={
      <>
        <Button>Get started</Button>
        <Button variant="ghost" href="#how" arrow={false}>See how it works</Button>
      </>
    }
  />
);
