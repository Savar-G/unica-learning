// The Maya demo (D-220) with "What Maya does" beside it (D-342, variant M of the throwaway branch
// site/maya-side-prototype): three points, each with a small copy of the 3x3 logo that fills in as you read down,
// from one colour to the whole logo. Wide screens play the whole desk, phones play the board alone.
import { DemoVideo } from "./demo-video";

const LABEL = "Demo: Maya, the Unica AI Teaching Assistant, works through 27 + 39 with a child on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

// Savar restored the existing home-page demo.
export const SHOW_VOICE_DEMO = true;

// The logo's colours by tile: yellow top left, blue top right, orange centre, green bottom left, warm grey bottom right.
const LOGO: Record<number, string> = { 0: "#FFD23F", 2: "#3366F0", 4: "#FF6430", 6: "#16A06A", 8: "#B8B3AA" };

const POINTS = [
  { title: "Already has the question", text: "Your child picks it from their page, and Maya sees exactly what they see.", tiles: [0] },
  { title: "Hints first, so they do the thinking", text: "Maya asks small questions and draws on a shared board, one step at a time.", tiles: [0, 2, 4] },
  { title: "Sends them back to the page", text: "The fix happens in the workbook, in pencil.", tiles: [0, 2, 4, 6, 8] },
];

function Grid({ tiles }: { tiles: number[] }) {
  return (
    <span className="gd-grid" aria-hidden="true">
      {Array.from({ length: 9 }, (_, k) => <i key={k} style={tiles.includes(k) ? { background: LOGO[k] } : undefined} />)}
    </span>
  );
}

export function GuidanceDemo() {
  if (!SHOW_VOICE_DEMO) return null;
  return (
    <div className="gd-body">
      <div className="gd-media">
        <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
        <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
      </div>
      <div className="gd-points">
        <h3 className="gd-kick">What Maya does</h3>
        <ul>
          {POINTS.map((p) => (
            <li key={p.title}>
              <Grid tiles={p.tiles} />
              <div><p className="gd-pt">{p.title}</p><p className="gd-pd">{p.text}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
