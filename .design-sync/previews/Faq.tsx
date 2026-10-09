import { Faq } from "unica-learning-landing-page";

const items = [
  { question: "Is there any screen time?", answer: "Your child works on paper. The only screen is your phone camera, for the few seconds it takes to snap the finished pages." },
  { question: "What if we miss a few days?", answer: "The next book picks up where your child is. Nothing is lost." },
  { question: "Can we cancel?", answer: "Yes, anytime. You are charged only when a workbook ships." },
];
export const Closed = () => <Faq items={items} />;
export const FirstOpen = () => <Faq items={items} defaultOpen={0} />;
