// Same content in every option. Source: .design/research/math-reading-offer.md
window.BANDS = [
  { id: "6-7", age: "Ages 6-7", grade: "Grades 1-2",
    math: ["Numbers to 100, and what each digit means", "Adding and subtracting to 20, from memory", "Adding and subtracting to 100", "Skip-counting by 2s, 5s and 10s", "Coins, shapes and patterns", "Short word problems"],
    reading: ["Letter sounds, and blending them into words", "Phonics patterns, step by step", "Sight words", "Reading short books aloud, smoothly", "Retelling a story in order", "Writing simple sentences"] },
  { id: "8-9", age: "Ages 8-9", grade: "Grades 3-4",
    math: ["Numbers to 10,000", "Times tables and division facts", "What fractions are, and how to compare them", "Decimals to hundredths", "Telling time, money and perimeter", "Two-step word problems"],
    reading: ["Longer words: prefixes, suffixes and word families", "Reading aloud with expression", "New vocabulary", "Main idea and key details", "Characters, setting and plot", "Writing a paragraph"] },
  { id: "10-12", age: "Ages 10-12", grade: "Grades 5-7",
    math: ["Multiplying big numbers and long division", "Equivalent fractions and mixed numbers", "Fractions, decimals and percents, and how they connect", "Order of operations, ratios and negative numbers", "Area, volume and angles", "Budgets, sales tax and discounts"],
    reading: ["Word roots and harder vocabulary", "Reading between the lines", "Summarizing and finding the theme", "Point of view, and reading nonfiction", "Grammar: tenses, agreement, run-ons", "Writing reports and arguments"] },
];
window.HEAD = `<div class="eyebrow">What's in the books</div><h2>What your child will work on.</h2>
<p class="lead">The skills your child learns at school, from first sounds to fractions. Each book picks the ones your child is ready for next.</p>`;
window.PROV = `<div class="prov"><span class="lbl">Matched to your province's curriculum</span>
<span class="chips">${["BC","AB","SK","MB","ON"].map(p=>`<span class="chip">${p}</span>`).join("")}</span>
<a href="#">See a sample page →</a></div>`;
