# /// script
# requires-python = ">=3.12"
# dependencies = ["matplotlib>=3.9,<4"]
# ///
"""Rebuild the shareable chart with: uv run scripts/plot-fee-data.py."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator

root = Path(__file__).resolve().parent.parent
data = json.loads((root / "src/content/data/bc-centre-fees-2026-11-01.json").read_text())
rows = [row for row in data["centres"] if row["market"] == "BC"]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12, "svg.fonttype": "none", "svg.hashsalt": "unica-fee-data"})
fig, ax = plt.subplots(figsize=(12, 9), dpi=160)
fig.subplots_adjust(left=0.39, right=0.93, top=0.82, bottom=0.25)
for index, row in enumerate(rows):
    low, high = row["tuitionLow"], row["tuitionHigh"]
    ax.plot([low, high], [index, index], color="#263f55", linewidth=7, solid_capstyle="round")
    ax.scatter([low, high], [index, index], color="#263f55", s=40, zorder=3)
    label = f"{low}" if low == high else f"{low}-{high}"
    ax.text(high + 4, index, label, va="center", fontsize=11)
ax.set_yticks(range(len(rows)), [row["centre"] for row in rows])
ax.invert_yaxis()
ax.set_xlim(150, 285)
ax.xaxis.set_major_locator(MultipleLocator(25))
ax.set_xlabel("Listed dollars per subject per month", labelpad=12)
ax.grid(axis="x", color="#dddddd", linewidth=0.7)
ax.set_axisbelow(True)
ax.tick_params(axis="y", length=0, pad=12)
for spine in ax.spines.values():
    spine.set_visible(False)
fig.text(0.055, 0.94, "Listed Kumon tuition at 13 BC centres", fontsize=23, weight="bold")
fig.text(0.055, 0.885, "Checked November 1, 2026. A line shows a listed range; a dot shows one listed price.", fontsize=12)
fig.text(0.055, 0.11, "Convenience sample, not all BC centres. Enrolment and materials fees are extra.\nCanada Virtual is outside BC and is excluded. A listed range is not a quote for your child.", fontsize=11, linespacing=1.6)
fig.text(0.055, 0.045, "Unica Learning | Official centre-page sources and data: unicalearning.com/resources/kumon-cost-bc#data-method", fontsize=9)
out = root / "public/resources/data/bc-centre-fees-2026-11-01"
fig.savefig(out.with_suffix(".png"), facecolor="white", metadata={"Software": "Unica Learning / Matplotlib"})
fig.savefig(out.with_suffix(".svg"), facecolor="white", metadata={"Date": None, "Creator": "Unica Learning"})
print(f"Wrote PNG and SVG from {len(rows)} BC source rows.")
