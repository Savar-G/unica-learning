// FAQ copy, shared by the FAQ section (sections.tsx), the FAQPage structured data and /llms.txt.
import { BRAND, PLANS } from "@/lib/site";

export const FAQ = [
  ["How is the work checked?", "You take a photo of the finished pages with your phone. We mark the work, show you what your child got right and where the gaps are, and give the solutions so they can understand any mistakes."],
  ["What if it is not right for my child?", "Every plan has a 30-day money-back guarantee. If it is not working for your child within 30 days of your first payment, we refund your payment in full."],
  ["How is this different from a learning centre?", `Learning centres usually follow a set program, often the same for every child, and cost about $200 or more per subject a month. ${BRAND} starts at your child's level, builds every book from how they did, and costs less: from CAD ${PLANS.one.price} a month.`],
  ["What if my child is struggling a lot?", "The next book focuses on the gap with extra practice, and you'll see exactly where they're stuck so you can help right away."],
  ["Is there any screen time?", "Your child works on paper. The app is for you: scan a page when they're stuck or to check answers, then help them yourself."],
  ["Why do you mail the books instead of sending a PDF?", "So you have nothing to print or keep track of. No printer, no ink, no loose pages: each book arrives at your door ready to start, and the next one comes before it runs out. Delivery is included. Your time goes to your child: sit with them, help when they're stuck, and watch their progress."],
  ["Who is it for?", "Children in grades 1 to 7 (ages 6 to 12), in math, reading or both."],
  ["How does the free assessment work?", "We send a short placement assessment on paper, matched to your child's age. Your child does it at home, and you send us a photo of the finished pages. It is free, and we use it to make your child's first book."],
  ["What do the books cover?", "Math: numbers, math facts, fractions and decimals, measurement and word problems. Reading: phonics, reading aloud, vocabulary, understanding what they read, and writing. The free assessment decides where your child starts, which can be behind, at or ahead of their grade."],
  ["Does it follow our school curriculum?", "Yes. Books follow the BC curriculum today, and Alberta, Saskatchewan, Manitoba and Ontario are next. Pick your curriculum when you sign up: if its books are not ready, you join the waitlist and we email you when they are. Within the curriculum, each book follows your child's level, not just their grade."],
  ["Can we take a break?", "Yes. Pause for a week, a month or longer. Contact us to arrange a pause. The next book starts where your child left off."],
  ["What if we miss a few days?", "The next book picks up where your child is. Nothing is lost."],
  ["What if we forget to send photos?", "We send a reminder. Until new pages arrive, the next book reviews what your child last worked on."],
  ["What happens to my child's work?", "We use it to plan your child's next book and show their progress. We do not sell it, and you can ask us to delete it at any time."],
  ["Why do you ask for my card?", "So your first workbook can ship as soon as it is ready. We charge nothing when you sign up. When your first workbook ships, we charge your first month, then every month until you cancel. Cancel before it ships and you pay nothing. Families on the waitlist do not add a card."],
  ["Can we cancel?", "Yes, anytime. Contact us to cancel. If you cancel before your first workbook ships, you pay nothing."],
  ["Where do you deliver?", "We deliver across Canada. Delivery is included in every plan."],
].map(([question, answer]) => ({ question, answer }));
