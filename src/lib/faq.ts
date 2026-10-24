// FAQ copy, shared by the FAQ section (sections.tsx), the FAQPage structured data and /llms.txt.
import { BRAND, PLANS } from "@/lib/site";

export const FAQ = [
  ["How is the work checked?", "You take a photo of the finished pages with your phone. We mark the work, show you what your child got right and where the gaps are, and give the solutions so they can understand any mistakes."],
  ["What if my child copies answers or uses AI?", `Each new workbook is built from your child's own work, so copied answers only mean they miss practice they need. Answers and solutions appear only once the pages are marked. Steps are written on paper, so we see how they got there, not just the answer. The ${BRAND.split(" ")[0]} companion explains step by step and asks your child to try the next step. Practice is screen-free: keeping phones, tablets and calculators away during practice time makes AI shortcuts hard.`],
  ["What if it is not right for my child?", "Try the first month free. If it is not right for your child, cancel before day 30 and you pay nothing."],
  ["How is this different from a learning centre?", `Learning centres usually follow a set program, where each child moves along the same path at their own pace, and cost about $200 per subject a month. ${BRAND} starts at your child's level, builds every book from how they did, and costs less: CAD ${PLANS.one.price} a month for math.`],
  ["Already have a tutor?", `${BRAND} covers practice between sessions. The report shows exactly where your child's gaps are, so a tutor can start on them right away.`],
  ["What if my child is struggling a lot?", "The next book focuses on the gap with extra practice, and you'll see exactly where they're stuck so you can help right away."],
  ["Is there any screen time?", "Daily workbook practice is on paper. The free math assessment is online, on a laptop or tablet. The app is for you: scan a page when they're stuck or to check answers, then help them yourself."],
  ["Why do you mail the books instead of sending a PDF?", "So you have nothing to print or keep track of. No printer, no ink, no loose pages: each book arrives at your door ready to start, and the next one comes before it runs out. Delivery is included. Your time goes to your child: sit with them, help when they're stuck, and watch their progress."],
  ["Who is it for?", "Children in grades 1 to 7 (ages 6 to 12). For now, the books are for math. Reading is planned for later."],
  ["How does the free assessment work?", "Your child takes the free math assessment online, on a laptop or tablet, alone and in one sitting. The questions adapt to how your child does. The report shows their math level and gaps. We email it to you, and it stays in your account. You choose a plan after the report."],
  ["What do the books cover?", "Numbers, math facts, fractions and decimals, measurement and word problems. The free math assessment shows where your child starts, which can be behind, at or ahead of their grade."],
  ["Does it follow our school curriculum?", "Yes. Books follow the BC curriculum today, and Alberta, Saskatchewan, Manitoba and Ontario are next. Every family in Canada can take the free math assessment. If books for your curriculum are not ready, you can join the workbook waitlist after the report, and we email you when they are. Within the curriculum, each book follows your child's level, not just their grade."],
  ["Can we take a break?", "Yes. Pause for a week, a month or longer. Contact us to arrange a pause. The next book starts where your child left off."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["What happens to my child's work?", "We use it to plan your child's next book and show their progress. We do not sell it, and you can ask us to delete it at any time."],
  ["Why do you ask for my card?", "You do not need a card for the assessment. After the report, BC families can choose a plan and add a card. The card lets your first workbook ship as soon as it is ready. Your first month is free, starting when the first workbook ships. On day 30 we charge the monthly price, then every month until you cancel. We email you before the first charge. Cancel before day 30 and you pay nothing. Families on the waitlist do not add a card."],
  ["Can we cancel?", "Yes, anytime. Contact us to cancel. If you cancel within your free first month, you pay nothing."],
  ["Where do you deliver?", "We deliver across Canada. Delivery is included in every plan."],
].map(([question, answer]) => ({ question, answer }));
