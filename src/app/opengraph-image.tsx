import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND } from "@/lib/site";

export const alt = `${BRAND}: Personalized. Delivered. Mastered.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const serif = await readFile(join(process.cwd(), "src/og/Zodiak-Regular.ttf"));
const sans = await readFile(join(process.cwd(), "src/og/Switzer-Medium.ttf"));

const TILES = ["#FFD23F", "#fff", "#3366F0", "#fff", "#FF6430", "#fff", "#16A06A", "#fff", "#fff"];

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fff", color: "#111", fontFamily: "Switzer", padding: 64, border: "2px solid #111" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Zodiak", fontSize: 40 }}>
            {BRAND}
            <div style={{ width: 13, height: 13, background: "#FF6430", marginLeft: 3 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", marginBottom: 22 }}>The future of learning is on paper.</div>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Zodiak", fontSize: 96, lineHeight: 1, letterSpacing: -2 }}>
              <span>Personalized.</span>
              <span>Delivered.</span>
              <span style={{ background: "#FFD23F", padding: "0 8px", marginLeft: -8, alignSelf: "flex-start" }}>Mastered.</span>
            </div>
          </div>
          <div style={{ fontSize: 24, color: "#4b4b4b" }}>Math and reading workbooks for ages 6-12 · Across Canada</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 248, height: 248, alignSelf: "center", borderTop: "2px solid #111", borderLeft: "2px solid #111" }}>
          {TILES.map((c, i) => (
            <div key={i} style={{ width: 80, height: 80, background: c, borderRight: "2px solid #111", borderBottom: "2px solid #111" }} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Zodiak", data: serif, weight: 400 }, { name: "Switzer", data: sans, weight: 500 }] },
  );
}
