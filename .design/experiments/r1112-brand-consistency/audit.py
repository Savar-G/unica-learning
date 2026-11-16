"""Regenerate pinned source evidence without running the app or reading customer data."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
BASE = "4426ab082b3366679070166bcf50fc631c2efb92"
OUT = Path(__file__).resolve().parent


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


paths = git("ls-tree", "-r", "--name-only", BASE).splitlines()
components = [
    "parent-shell", "parent-option-a", "parent-overview", "parent-progress",
    "parent-progress-panels", "parent-dashboard-home", "parent-workbooks", "workbook-days",
    "parent-workbook-answers", "scan-tab", "scan-pages", "scan-history", "scan-preview",
    "scan-marking-results", "scan-problem-explanation", "scan-page-results", "parent-maya-notes",
    "parent-account-settings", "account-billing-section", "account-child-details", "support-page",
]
selected = [p for p in paths if p.startswith("src/components/") and Path(p).stem in components]
selected += [p for p in paths if p.startswith("src/app/(product)/account/(dashboard)/") and p.endswith("page.tsx")]
selected += ["AGENTS.md", "CLAUDE.md", "DESIGN.md", ".design/decisions.md", "docs/agents/delegate-brief.md",
             "src/ds/basics.tsx", "src/ds/index.ts", "src/ds/fonts/fonts.css", "src/ds/styles/warm.css",
             "src/ds/styles/support.css", "src/lib/parent-shell.ts"]
pattern = re.compile(r"font(?:-family|-weight|-size)?\s*:|--mono:|<h[123]|focus|border-radius|Previous|Next question|Undo|role=|state ===|status ===")
files = []
for path in sorted(set(selected)):
    source = git("show", f"{BASE}:{path}")
    files.append({"path": path, "sha256": hashlib.sha256(source.encode()).hexdigest(),
                  "matches": [{"line": i, "text": line.strip()} for i, line in enumerate(source.splitlines(), 1) if pattern.search(line)]})
(OUT / "source-evidence.json").write_text(json.dumps({"base": BASE, "kind": "static source evidence; no rendered or computed-style claims", "files": files}, indent=2) + "\n")
print(f"Recorded {len(files)} pinned source files")
