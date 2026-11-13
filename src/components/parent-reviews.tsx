// Parent reviews (D-338): a slow strip of short quotes between the statement and How it works.
// Exact words from parents who saw Unica and agreed to be quoted; "…" marks a cut, [brackets] mark the one
// substitution (a competitor's name, D-074); nothing else is reworded.
// Role labels only, no names, ratings, counts or photos. No review markup (D-319).
import "@/components/parent-reviews.css";

export const PARENT_REVIEWS: readonly { quote: string; who: string }[] = [
  { quote: "I like the idea of actual workbooks. They already spend enough time on screens. And having them delivered, plus not having to check every answer myself, is a big plus.", who: "Mom of three" },
  { quote: "The program is great, it's an alternative for tutoring programs [like other learning programs] and gives the student and parents more flexibility.", who: "Parent of a 9-year-old" },
  { quote: "I used to get them work books every summer, wished I had personalized ones. I'm really impressed!", who: "Mom of teens" },
  { quote: "This is a great tool for kids who are quick learners, as well as those who need a little more time to understand and master concepts, all while allowing parents to monitor their progress.", who: "Parent of a 12-year-old" },
  { quote: "This is extremely unique and appealing.", who: "Parent of an 8-year-old" },
  { quote: "I think the concept is interesting, especially the combination of personalized learning and less screen time.", who: "Aunt of a 7-year-old" },
  { quote: "Each child is unique with different areas where they require assistance.", who: "Parent" },
  { quote: "Same age doesn't always mean same level.", who: "Mom of three" },
];

// The logo's four colours, in turn, for each card's bar and mark.
const TONES = ["sun", "sky", "tang", "leaf"] as const;

function Cards({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="prv-set" aria-hidden={hidden || undefined}>
      {PARENT_REVIEWS.map(({ quote, who }, i) => (
        <li key={i} className={`prv-card prv-${TONES[i % TONES.length]}`}>
          <blockquote>“{quote}”</blockquote>
          <p className="prv-who">
            <span className="prv-mark" aria-hidden="true">
              {Array.from({ length: 9 }, (_, k) => (
                <i key={k} />
              ))}
            </span>
            {who}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ParentReviews() {
  return (
    <section className="prv" aria-labelledby="prvT">
      <p className="eyebrow prv-label" id="prvT">
        Parent reviews
      </p>
      <div className="prv-rail">
        <div className="prv-track">
          <Cards />
          <Cards hidden />
        </div>
      </div>
      <p className="prv-note">Shared with permission, names left out.</p>
    </section>
  );
}
