#!/usr/bin/env python3
"""Builds index.html, the round's board, from manifest.json: both sets, each option live (desktop and phone frames),
its bet, benefit, cost and risk, the state links, the screenshots and the recommendation. Run: python3 -I build_board.py"""
import html
import json
from pathlib import Path

HERE = Path(__file__).parent
m = json.loads((HERE / "manifest.json").read_text())
e = html.escape

STATE_LABEL = {
    "no_test": "No test", "test_running": "Test open", "test_waiting": "Report being made",
    "report_ready_bc": "Report, BC", "report_ready_waitlist": "Report, outside BC",
    "overview": "All seven tabs", "more": "More open", "today": "Today's tabs",
}


def option(s, o):
    first = s["states"][0] if s["id"] == "phone" else "report_ready_bc"
    rec = '<span class="rec">Recommended</span>' if o["id"] == s["recommended"] else ""
    states = "".join(
        f'<a href="{e(o["artifact"])}#{st}" data-frame="{e(s["id"])}-{e(o["id"])}" data-hash="{st}">{e(STATE_LABEL[st])}</a>'
        for st in s["states"]
    )
    shots = "".join(f'<a href="{e(f)}">{e(f)}</a>' for f in o["screens"])
    facts = "".join(
        f"<div><dt>{k}</dt><dd>{e(o[key])}</dd></div>"
        for k, key in (("Bet", "bet"), ("Benefit", "benefit"), ("Cost", "cost"), ("Failure risk", "risk"))
    )
    return f"""<article class="opt{' is-rec' if rec else ''}" id="{e(s['id'])}-{e(o['id'])}">
  <header><p class="id">Option {e(o['id'])}</p><h3>{e(o['name'])}</h3>{rec}</header>
  <div class="frames">
    <div class="fr desk"><iframe title="Option {e(o['id'])}, desktop" src="{e(o['artifact'])}#{first}" name="{e(s['id'])}-{e(o['id'])}-d" loading="lazy"></iframe></div>
    <div class="fr phone"><iframe title="Option {e(o['id'])}, phone" src="{e(o['artifact'])}#{first}" name="{e(s['id'])}-{e(o['id'])}-p" loading="lazy"></iframe></div>
  </div>
  <p class="states">Show: {states} <a class="open" href="{e(o['artifact'])}#{first}" target="_blank">Open full size</a></p>
  <dl>{facts}</dl>
  <details><summary>Screenshots ({len(o['screens'])})</summary><p class="shots">{shots}</p></details>
</article>"""


sets = []
for s in m["sets"]:
    title = "Set 1: pre-trial views" if s["id"] == "pre" else "Set 2: phone layout of the shell"
    sets.append(f"""<section class="set" id="set-{e(s['id'])}">
  <p class="eyebrow">{e(title)}</p>
  <h2>{e(s['decision'])}</h2>
  <p class="meta"><b>Varies:</b> {e(s['primary_axis'])}. <b>Decides it:</b> {e(s['evidence'])}.</p>
  <p class="meta">{e(s['state_note'])}</p>
  <div class="opts">{''.join(option(s, o) for o in s['options'])}</div>
  <aside class="recbox"><p class="eyebrow">Recommendation</p><p>{e(s['recommendation'])}</p></aside>
</section>""")

inv = "".join(f"<li>{e(i)}</li>" for i in m["invariants"])
openq = "".join(f"<li>{e(i)}</li>" for i in m["open_questions"])

page = f"""<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard variants r544</title>
<style>
@font-face{{font-family:Geist;font-weight:100 900;src:url("fonts/geist-latin.woff2") format("woff2")}}
@font-face{{font-family:"Geist Mono";font-weight:100 900;src:url("fonts/geist-mono-latin.woff2") format("woff2")}}
:root{{--ink:#0c0c0e;--ink-2:#44444c;--line:#e4e4e7;--soft:#faf9f7;--card:#f5f4f2;--accent:#ff6a3d;--accent-soft:#fff1ea;--sun:#fff3c4;
  --sans:Geist,Arial,sans-serif;--mono:"Geist Mono",ui-monospace,monospace}}
*{{box-sizing:border-box}}
body{{margin:0;background:#fff;color:var(--ink);font:400 15px/1.5 var(--sans);-webkit-font-smoothing:antialiased}}
a{{color:inherit}}
.top{{padding:32px 32px 8px;max-width:1720px;margin:0 auto}}
.eyebrow{{display:inline-flex;align-items:center;gap:9px;margin:0;font:400 12.5px/1.2 var(--mono);letter-spacing:.02em}}
.eyebrow::before{{content:"";width:9px;height:9px;background:var(--accent)}}
h1{{margin:10px 0 8px;font-weight:300;font-size:40px;letter-spacing:-.035em;line-height:1.08}}
h2{{margin:10px 0 10px;font-weight:300;font-size:28px;letter-spacing:-.03em;line-height:1.15;max-width:60ch}}
h3{{margin:2px 0 0;font-weight:500;font-size:18px;letter-spacing:-.015em}}
.lead{{max-width:90ch;color:var(--ink-2);margin:0 0 12px}}
.meta{{max-width:110ch;color:var(--ink-2);margin:0 0 8px}}
nav.jump{{display:flex;flex-wrap:wrap;gap:8px 18px;margin:12px 0}}
details.ctx{{max-width:110ch;margin:8px 0 0}} details.ctx li{{margin:4px 0;color:var(--ink-2)}}
.set{{max-width:1720px;margin:0 auto;padding:36px 32px;border-top:1px solid var(--line)}}
.opts{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:20px}}
.opt{{border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:12px;align-content:start;background:#fff}}
.opt.is-rec{{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}}
.opt header{{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}}
.opt header h3{{flex-basis:100%}}
.id{{margin:0;font:400 12px/1.2 var(--mono);color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em}}
.rec{{font:500 11.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.04em;background:var(--accent-soft);color:#b43d12;padding:5px 8px;border-radius:6px}}
.frames{{display:flex;gap:10px;align-items:flex-start}}
.fr{{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#fff;flex:none}}
.fr iframe{{position:absolute;top:0;left:0;border:0;transform-origin:0 0}}
.fr.desk{{width:calc(1440px * var(--ds));height:calc(900px * var(--ds))}}
.fr.desk iframe{{width:1440px;height:900px;transform:scale(var(--ds))}}
.fr.phone{{width:calc(390px * var(--ps));height:calc(844px * var(--ps))}}
.fr.phone iframe{{width:390px;height:844px;transform:scale(var(--ps))}}
.opts{{--ds:.23;--ps:.385}}
.states{{margin:0;display:flex;flex-wrap:wrap;gap:6px 12px;font-size:13.5px;color:var(--ink-2)}}
.states a{{cursor:pointer}} .states a.on{{color:var(--ink);font-weight:500;text-decoration-color:var(--accent);text-decoration-thickness:2px}}
.states .open{{margin-left:auto}}
dl{{margin:0;display:grid;gap:8px}} dt{{font:400 12px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}} dd{{margin:2px 0 0}}
.shots{{display:grid;gap:2px;font:400 12.5px/1.5 var(--mono);margin:6px 0 0}}
.recbox{{margin-top:20px;padding:18px 20px;border-radius:12px;background:var(--card);max-width:110ch}} .recbox p{{margin:6px 0 0}}
@media (max-width:1500px){{.opts{{--ds:.18;--ps:.31}}}}
@media (max-width:1180px){{.opts{{grid-template-columns:1fr;--ds:.42;--ps:.6}}}}
@media (max-width:640px){{.top,.set{{padding-left:16px;padding-right:16px}}.frames{{flex-direction:column}}.opts{{--ds:.22;--ps:.62}}h1{{font-size:32px}}}}
</style>
</head>
<body>
<header class="top">
  <p class="eyebrow">Design round r544 · #566 · spec #544</p>
  <h1>Parent dashboard: pre-trial views and phone layout</h1>
  <p class="lead">The desktop shell of the mock is decided. Two things vary here, one axis per set: where the next step sits on the pre-trial pages, and how the seven tabs fit on a phone. Each frame is the live page; use the links under it to switch the state. Numbers on these pages are sample data (Leah is the sample child of the sample report).</p>
  <nav class="jump"><a href="#set-pre">Set 1: pre-trial views</a><a href="#set-phone">Set 2: phone layout</a><a href="manifest.json">manifest.json</a></nav>
  <details class="ctx"><summary>What stays the same in every option</summary><ul>{inv}</ul></details>
  <details class="ctx"><summary>Open questions</summary><ul>{openq}</ul></details>
</header>
{''.join(sets)}
<script>
// The state links switch both frames of an option in place.
document.querySelectorAll('.states a[data-frame]').forEach(function (a) {{
  a.addEventListener('click', function (ev) {{
    ev.preventDefault();
    var id = a.dataset.frame, src = a.getAttribute('href');
    ['d', 'p'].forEach(function (k) {{ var f = document.querySelector('iframe[name="' + id + '-' + k + '"]'); if (f) f.src = src; }});
    a.parentNode.querySelectorAll('a').forEach(function (x) {{ x.classList.toggle('on', x === a); }});
  }});
}});
</script>
</body>
</html>
"""
(HERE / "index.html").write_text(page)
print("wrote index.html", len(page))
