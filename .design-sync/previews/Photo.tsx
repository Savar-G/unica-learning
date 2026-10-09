import { Photo, photos } from "unica-learning-landing-page";

export const Landscape = () => (
  <div style={{ width: 360 }}><Photo src={photos.heroHome1} alt="A boy writes in his workbook at a desk at home" /></div>
);
export const Square = () => (
  <div style={{ width: 220 }}><Photo src={photos.emotion9} alt="A girl reads in an armchair" ratio="1/1" /></div>
);
