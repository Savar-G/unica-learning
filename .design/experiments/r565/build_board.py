#!/usr/bin/env python3
"""Builds index.html, the round's board, from manifest.json. Run: python3 -I build_board.py"""
import html, json
from pathlib import Path
HERE = Path(__file__).parent
m = json.loads((HERE / "manifest.json").read_text())
e = html.escape
LABEL = {"look":"Point at a page","far":"Move back","dark":"Too dark","two":"Two pages","steady":"Hold still","got":"Got it","same":"Same page","late":"Late refusal","wrong":"Wrong page","marked":"Already marked","limit":"Limit","retake":"Fix mode","blocked":"No camera","start":"Start","notice":"First-time notice","stack":"Stack, mixed","clean":"Stack, all ready","one-check":"One page: checking","one":"One page: ready","one-marking":"One page: marking","one-marked":"One page: marked","r-blur":"Refused: blurry","r-cut":"Refused: cut off","r-dark":"Refused: dark","r-two":"Refused: two sheets","r-wrong":"Refused: wrong page","d-stack":"Already in stack","d-marked":"Already marked","page-ok":"Open a page","sending":"Sending","marking":"Marking","paused":"Marking paused","ready":"Marks ready","check":"Please check 1","check2":"Please check 2","ready-choice":"Maya or results","results":"Results","maya":"Open the desk","page":"Marked page","change":"Change a mark","gone":"Photo gone","changed":"Mark changed","native":"Phone's camera","target":"Camera for one page"}
def figs(shots):
    return "".join(f'<figure><a href="{e(s["file"])}"><img loading="lazy" src="{e(s["file"])}" alt="{e(s["shows"])}"></a><figcaption><b>{e(LABEL.get(s["state"], s["state"]))}{" (whole page)" if s["whole_page"] else ""}</b> {e(s["shows"])}</figcaption></figure>' for s in shots)
def pick(opt=None, vp=None, states=None):
    out = [s for s in m["shots"] if (opt is None or s["option"] == opt) and (vp is None or s["viewport"] == vp) and (states is None or s["state"] in states)]
    if states: out.sort(key=lambda s: (states.index(s["state"]), s["whole_page"]))
    return out
def links(o, states):
    return "".join(f'<a href="{o["artifact"]}#{st}" data-t="f-{o["id"]}">{e(LABEL.get(st, st))}</a>' for st in states)
LABEL.update({"add":"Add pages","manual":"Auto off","chosen":"Chosen photos","r-none":"Not a page","start-here":"Camera"})
FLOW = {"A":["start","look","steady","got","late","stack","retake","clean","one","loop"],"B":["start","native","stack","r-blur","one"],"C":["start","target","stack","r-blur","one"]}
LABEL["loop"] = "Play the loop"
def option(o):
    tag = '<span class="rec">Recommended</span>' if o.get("recommended") else ""
    facts = "".join(f"<div><dt>{k}</dt><dd>{e(o[v])}</dd></div>" for k, v in (("Bet","bet"),("Benefit","benefit"),("Cost","cost"),("Failure risk","risk"),("Taps for 20 pages","taps_for_20_pages")))
    first = "loop" if o["id"] == "A" else "stack"
    return f'''<article class="opt" id="opt-{o["id"]}"><div class="live"><div class="phone"><iframe name="f-{o["id"]}" title="Option {o["id"]}, live" src="{o["artifact"]}#{first}" loading="lazy"></iframe></div><p class="st">{links(o, FLOW[o["id"]])}</p></div>
    <div class="txt"><p class="k">Option {o["id"]}</p><h3>{e(o["name"])} {tag}</h3><dl>{facts}</dl></div></article>'''
CAMERA = ["look","far","dark","two","steady","got","same","late","wrong","marked","limit","retake","blocked"]
REFUSE = ["r-blur","r-cut","r-dark","r-two","r-wrong","d-stack","d-marked","page-ok"]
AFTER = ["sending","marking","paused","ready","check","check2","ready-choice","results","maya","page","change","gone","changed"]
ONE = ["one-check","one","one-marking","one-marked"]
sections = [
 ("cam","Camera guidance and live messages (option A, phone)", pick("A","phone",["start","notice"]+CAMERA)),
 ("stack","The stack and its refusals (phone)", pick("A","phone",["stack","clean"]+REFUSE)),
 ("one","Flow B: one page (phone)", pick("A","phone",ONE)),
 ("after","Send, marks ready and changing a mark (phone; the same in every option)", pick("A","phone",AFTER)),
 ("b","Option B screens (phone)", pick("B","phone")),
 ("c","Option C screens (phone)", pick("C","phone")),
]
wide = [("tablet","Tablet, 768 px", pick(None,"tablet")),("desktop","Desktop, 1440 px", pick(None,"desktop"))]
sec = "".join(f'<section id="{i}"><h2>{e(t)}</h2><div class="grid">{figs(sh)}</div></section>' for i,t,sh in sections)
sec += "".join(f'<section id="{i}"><h2>{e(t)}</h2><div class="grid w">{figs(sh)}</div></section>' for i,t,sh in wide)
rows = "".join(f"<tr><td><b>{e(o['id'])}</b> {e(o['name'])}</td><td>{e(o['taps_for_20_pages'])}</td><td>{'During the photo' if o['id'] != 'B' else 'After the photo'}</td><td>{'Live camera, untested on a real phone' if o['id'] != 'B' else 'Works today'}</td></tr>" for o in m["options"])
qs = "".join(f"<li><b>{e(q['q'])}</b> {e(q['answer'])}</li>" for q in m["open_decisions_for_savar"])
picked_links = "".join(f'<a href="picked.html#{st}">{e(LABEL.get(st, st))}</a>' for st in ["start","add","look","manual","stack","chosen","one","marking","page","change"])
bn = "".join(f"<li>{e(x)}</li>" for x in m["build_notes"])
fs = "".join(f"<li>{e(x)}</li>" for x in m["findings_from_the_round"])
nt = "".join(f"<li>{e(x)}</li>" for x in m["not_tested"])
page = f'''<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scan pages flows</title>
<link rel="stylesheet" href="proto.css"><style>
body{{background:#fff}} .wrap{{max-width:1240px;margin:0 auto;padding:40px 24px 80px;display:grid;gap:40px}} .wrap h1{{font-size:clamp(32px,4vw,48px);font-weight:300;letter-spacing:-.035em;line-height:1.08}} .wrap h2{{font-size:24px;font-weight:300;letter-spacing:-.02em;margin-bottom:16px}}
.pick{{padding:20px;background:var(--accent-soft);border-radius:14px;display:grid;gap:8px}} .pick b{{font-weight:600}} table{{border-collapse:collapse;width:100%;font-size:15px}} th,td{{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line-soft);vertical-align:top}} th{{font:400 12.5px/1.2 var(--mono);color:var(--ink-2)}}
.opts{{display:grid;gap:28px}} .opt{{display:grid;grid-template-columns:330px minmax(0,1fr);gap:28px;align-items:start;padding-bottom:28px;border-bottom:1px solid var(--line)}} .phone{{width:330px;height:714px;border:8px solid #111;border-radius:30px;overflow:hidden;background:#fff}} .phone iframe{{width:390px;height:844px;border:0;transform:scale(.805);transform-origin:0 0;display:block}}
.st{{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}} .st a{{font-size:13px;padding:6px 10px;border:1px solid var(--line);border-radius:14px;text-decoration:none}} .k{{font:400 12.5px/1.2 var(--mono);color:var(--ink-2)}} .opt h3{{font-size:26px;font-weight:300;letter-spacing:-.02em;margin:4px 0 14px}} .rec{{font:500 13px/1 var(--sans);letter-spacing:0;padding:4px 10px;background:var(--leaf-soft);color:var(--leaf-ink);border-radius:12px;vertical-align:middle}}
dl{{margin:0;display:grid;gap:12px}} dt{{font-weight:500;font-size:14px}} dd{{margin:0;color:var(--ink-2);font-size:15.5px}} ul.l{{margin:0;padding-left:18px;display:grid;gap:8px}} ul.l b{{font-weight:600;display:block}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:20px 16px}} .grid.w{{grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}} figure{{margin:0;display:grid;gap:6px;align-content:start}} figure img{{display:block;width:100%;border:1px solid var(--line);border-radius:8px}} figcaption{{font-size:13px;line-height:1.35;color:var(--ink-2)}} figcaption b{{display:block;font-weight:500;color:var(--ink)}}
@media(max-width:760px){{.opt{{grid-template-columns:minmax(0,1fr)}}}} @media(max-width:370px){{.phone{{width:100%}}}} .tbl{{overflow-x:auto}}
</style></head><body><div class="wrap">
<header style="display:grid;gap:12px"><span class="eyebrow">Round r565 · Sample data · Not built</span><h1>Scan pages: batch and one page</h1><p class="lede">{e(m["decision"])}</p></header>
<section class="pick"><b>Picked by Savar, {e(m["picked"]["date"])} ({e(m["picked"]["decisions"])})</b><p>{e(m["picked"]["start_screen"])}. {e(m["picked"]["stack"])}.</p><p><b>Build order:</b> {e(m["picked"]["build_order"])}.</p><p class="st">{picked_links}</p></section>
<section id="picked"><h2>The picked flow, phone</h2><div class="grid">{figs(pick("picked","phone"))}</div></section>
<section><h2>The picked flow, tablet and desktop</h2><div class="grid w">{figs(pick("picked","tablet")+pick("picked","desktop"))}</div></section>
<section><h2>The recommendation Savar answered</h2><p>{e(m["recommendation"])}</p></section>
<section><h2>The three bets</h2><div class="tbl"><table><tr><th>Option</th><th>Taps for 20 pages</th><th>Guidance arrives</th><th>Camera</th></tr>{rows}</table></div><p class="small" style="margin-top:8px">{e(m["taps_note"])}</p></section>
<section><h2>Try each one</h2><div class="opts">{"".join(option(o) for o in m["options"])}</div><p class="small">In the mock, screens after Send always show the 12-page sample, whatever count the button said.</p></section>
<section><h2>What the round found</h2><ul class="l">{fs}</ul></section>
<section><h2>Savar's answers</h2><ul class="l">{qs}</ul></section>
<section><h2>Notes for the build</h2><ul class="l">{bn}</ul></section>
<section><h2>Not tested</h2><ul class="l">{nt}</ul></section>
{sec}
</div></body></html>'''
(HERE / "index.html").write_text(page)
print("wrote index.html", len(page))
