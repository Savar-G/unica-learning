# Round r162: the r161 page with two reworked steps, each with options for Savar and the team.
# - "Scan the pages" (S-A, S-B, S-C): the open workbook (Day 1, pages 1 and 2, with Leah's pencil answers), not one sheet.
#     S-A: overhead photo (AI base, mirrored) with our spread and our app composited in.
#     S-B: built flat lay, no photo: the spread on a table colour, our phone floating over page 1.
#     S-C: the S-A photo, cropped close on the phone, so the app screen is large enough to read.
# - "Parent dashboard" (D-A, D-B): the same account on the web and in the phone app (Figma 99:53 and the app
#     screens 95:55, 98:90, 98:187, 95:308). One row of chips moves both screens; the web menu also moves the phone.
#     D-A: web first, the phone beside it. D-B: phone first, the web behind it.
# Run: python3 -I build.py   -> page.html and still-*.html (relative paths)
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = os.environ.get("R162_ASSETS", "assets/")
os.environ.setdefault("R161_ASSETS", "../r161/assets/")
OUT = os.environ.get("R162_OUT", HERE)
_spec = importlib.util.spec_from_file_location("r161", os.path.join(HERE, "..", "r161", "build.py"))
q = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(q)
p, r = q.p, q.r
A = r.A
STATUS, ICON_X, ICON_FLASH, ICON_BACK = q.STATUS, q.ICON_X, q.ICON_FLASH, q.ICON_BACK


# ---------- the open workbook: Day 1 pages 1 and 2, with Leah's pencil ----------
def hw(s, x, y, txt, size, rot=0, cls="hw"):
    return f'<i class="{cls}" style="left:{x*s:.1f}px;top:{y*s:.1f}px;font-size:{size*s:.1f}px;transform:rotate({rot}deg)">{txt}</i>'


def page1(w, cls=""):
    s = w / 541
    extra = hw(s, 96, 30, "Leah", 25, -2, "hw2") + hw(s, 438, 32, "Oct 27", 20, -1, "hw2")
    return p.mpage(w, False, cls=cls)[:-6] + extra + "</div>"


def page2(w, cls=""):
    s = w / 541
    extra = (hw(s, 96, 30, "Leah", 25, -2, "hw2") + hw(s, 438, 32, "Oct 27", 20, -1, "hw2")
             + hw(s, 278, 414, "3", 26, -3, "hw2") + hw(s, 333, 414, "16", 26, 2, "hw2")
             + hw(s, 64, 462, "He forgot the 10 ones from the trade.", 22, -1, "hw2"))
    return (f'<div class="mp p2 {cls}" style="width:{w}px"><img src="{A}wb/leah-04-d1p2.jpg" '
            f'alt="Leah\'s Day 1 page 2 with her answers">{extra}</div>')


# ---------- the app screens (camera, marking, marked), 282 x 564 ----------
def screens(state=None):
    on = lambda name: " on" if (state == name or (state is None and name == "cam")) else ""
    cam = f"""<div class="sc c3{on('cam')}">{STATUS}<div class="bar2">{ICON_X}<span>Day 1 &middot; page 1 of 8</span>{ICON_FLASH}</div>
<div class="vf" style="background-image:url('{OWN}wood.jpg')"><div class="pg">{page1(206)}</div><i class="br a"></i><i class="br b"></i><i class="br c"></i><i class="br d"></i></div>
<div class="pill"><span class="p1">Hold still. Almost straight&hellip;</span><span class="p2">Got it</span></div>
<div class="bot"><div class="thumbs"><i></i><i></i><i></i><i></i></div><div class="shut"><i></i></div><span class="up">Upload</span></div><div class="flash"></div></div>"""
    mkg = f"""<div class="sc m2{on('mkg')}">{STATUS}<div class="bar2" style="justify-content:center"><span>Day 1 &middot; page 1</span></div>
<div class="pgw">{p.mpage(214, False)}</div><div class="scan"></div><div class="pill">Marking page 1&hellip;</div></div>"""
    res = f"""<div class="sc r2{on('res')}">{STATUS}<div class="bar2">{ICON_BACK}<span>Day 1 &middot; page 1</span><span class="nx">Next</span></div>
<div class="kk">MARKED</div><div class="big">28 of 30<small>right</small></div><div class="line">Two slips, both the same: she took the smaller digit from the bigger one.</div>
<div class="panel">{p.mpage(150, True)}</div>
<div class="nt"><h4><i>19</i>20 &minus; 8 &middot; Leah wrote 18</h4><p>She took 0 from 8 instead of trading a ten. The right answer is 12.</p><div class="bt"><span>See the steps</span><span class="d">Ask Maya</span></div></div>
<div class="tabs"><span>Today</span><b><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></b><span>Progress</span><span>Stuck?</span></div></div>"""
    loop = "" if state else " data-loop"
    return f'<div class="ui ui3 ui4"{loop}>{cam}{mkg}{res}</div>'


# ---------- S-A and S-C: overhead photo with the spread and the app composited in ----------
# Corners (TL, TR, BL, BR) on the mirrored 1280 x 960 photo, measured on a 10 px grid.
OV_L = "186,146,629,143,180,744,629,750"
OV_R = "631,143,1068,150,630,750,1069,745"
OV_S = "303,375,479,375,303,726,477,728"


def overhead(width, state=None, crop=(0, 0, 1280, 960), cls=""):
    x0, y0, cw, ch = crop
    k = width / cw
    return f"""<div class="scn ov {cls}" style="width:{width}px;height:{round(ch*k)}px"><div class="ov-in" style="transform:scale({k:.5f}) translate({-x0}px,{-y0}px)">
<img class="ov-bg" src="{OWN}base-overhead-m.jpg" alt="A parent holds a phone over an open Unica workbook to scan the page">
<div class="ov-paper" style="-webkit-mask-image:url('{OWN}mask-paper.png');mask-image:url('{OWN}mask-paper.png')">
<div class="warp" data-q="{OV_L}" data-w="541" data-h="700">{page1(541, "flat")}</div>
<div class="warp" data-q="{OV_R}" data-w="541" data-h="700">{page2(541, "flat")}</div></div>
<div class="ov-screen"><div class="warp" data-q="{OV_S}" data-w="282" data-h="564">{screens(state)}</div></div>
<div class="ov-glare"><div class="warp" data-q="{OV_S}" data-w="282" data-h="564"><i></i></div></div></div></div>"""


# ---------- S-B: built flat lay, no photo ----------
def flatlay(state=None):
    pw = 380
    return f"""<div class="fl"><div class="fl-book"><div class="fl-pg l">{page1(pw, "flat")}</div><div class="fl-pg r">{page2(pw, "flat")}</div><i class="fl-sp"></i></div>
<div class="fl-phone"><div class="fl-scr">{screens(state)}</div><i class="fl-notch"></i></div></div>"""


# ---------- D-A and D-B: the dashboard on the web and in the app ----------
NAV = q.NAV
TARGET = q.TARGET
CHIPS = [("Progress", "app-progress.png", 0), ("This week", "app-week.png", 4),
         ("Sessions with Maya", "app-callnotes.png", 5), ("Next workbook", "app-next.png", 6)]


def web(width, height):
    s = width / 1440
    hot = "".join(f'<button style="left:{20*s:.1f}px;top:{(169+42*k)*s:.1f}px;width:{207*s:.1f}px;height:{38*s:.1f}px" data-k="{k}" data-y="{TARGET[k]*s:.0f}" aria-label="{n}"></button>' for k, n in enumerate(NAV))
    return f"""<div class="dsh browser" style="width:{width}px"><div class="bar"><i></i><i></i><i></i><span>app.unicalearning.com/account</span></div>
<div class="dsh-body" style="height:{height}px"><div class="dsh-main" style="left:{248*s:.0f}px"><img src="{q.OWN}dash-main.jpg" alt="Parent dashboard on the web (sample data)" style="width:{1192*s:.0f}px"></div>
<div class="dsh-side" style="width:{248*s:.0f}px"><img src="{q.OWN}dash-side.png" alt="" style="width:{248*s:.0f}px"><i class="dsh-hi" style="left:{20*s:.1f}px;top:{169*s:.1f}px;width:{207*s:.1f}px;height:{38*s:.1f}px"></i>{hot}</div></div></div>"""


def phone(width, sel=0):
    imgs = "".join(f'<img class="{"on" if i == sel else ""}" src="{OWN}{f}" alt="{n} in the Unica app (sample data)">' for i, (n, f, _) in enumerate(CHIPS))
    return f'<div class="dv-ph" style="width:{width}px">{imgs}</div>'


def chips(sel=0):
    return '<div class="dv-chips">' + "".join(f'<button class="{"on" if i == sel else ""}">{n}</button>' for i, (n, _, _) in enumerate(CHIPS)) + "</div>"


def dash_a(sel=0):
    return f"""<div class="dv dvA">{chips(sel)}<div class="dv-stage">{web(860, 560)}{phone(272, sel)}</div>
<div class="dv-cap"><span><b>On the web</b> &middot; the full dashboard</span><span><b>In the app</b> &middot; the same account</span></div></div>"""


def dash_b(sel=0):
    return f"""<div class="dv dvB">{chips(sel)}<div class="dv-stage">{phone(330, sel)}{web(780, 520)}</div>
<div class="dv-cap"><span><b>In the app</b> &middot; check in anywhere</span><span><b>On the web</b> &middot; more room for the detail</span></div></div>"""


# ---------- sections ----------
def optbar(group, items):
    return (f'<div class="optbar" data-for="{group}">' + "".join(
        f'<button class="{"on" if i == 0 else ""}" data-v="{v}">{label}</button>' for i, (v, label) in enumerate(items)) + "</div>")


def scan_section():
    bar = optbar("scan2", [("a", "S-A &middot; Overhead photo"), ("b", "S-B &middot; Built, no photo"), ("c", "S-C &middot; Close on the phone")])
    a = f'<div class="opt on" data-g="scan2" data-v="a"><div class="full-in">{r.st("app")}{overhead(1104, crop=(60, 60, 1160, 830))}</div></div>'
    b = f'<div class="opt" data-g="scan2" data-v="b"><div class="full-in">{r.st("app")}{flatlay()}</div></div>'
    c = f'<div class="opt" data-g="scan2" data-v="c"><div class="row-in">{r.st("app")}{overhead(600, crop=(150, 250, 480, 600), cls="close")}</div></div>'
    return f'<section class="full scan2">{bar}{a}{b}{c}</section>'


def dash_section():
    k, h, pp, _ = r.S["db"]
    bar = optbar("dash2", [("a", "D-A &middot; Web first, phone beside"), ("b", "D-B &middot; Phone first, web behind")])
    st = f'<div class="st"><span class="k">{k}</span><h2>{h}</h2><p class="lead">{pp}</p></div>'
    return f"""<section class="full center dash2">{bar}{st}<div class="opt on" data-g="dash2" data-v="a">{dash_a()}</div>
<div class="opt" data-g="dash2" data-v="b">{dash_b()}</div><p class="dsh-cap" style="text-align:center">Pick a part, or click the menu on the web &middot; Sample data</p></section>"""


CSS = q.CSS + """
.mp .hw2{position:absolute;font-family:Caveat,'Bradley Hand',cursive;font-weight:500;font-style:normal;color:#3a3b44;line-height:1;white-space:nowrap}
.mp.p2>img{width:100%;display:block}
.B .full .optbar,.B .full.center .optbar{display:flex;width:max-content;margin:0 auto 26px}
.scan2 .full-in>.st{max-width:640px;margin-bottom:34px}
.scan2 .row-in{display:grid;grid-template-columns:1fr 600px;gap:64px;align-items:center}

/* the app screens at 282 x 564 */
.ui4{height:564px}
.ui4 .c3 .vf{height:356px}.ui4 .c3 .pill{top:448px}.ui4 .c3 .bot{bottom:16px}
.ui4 .c3 .vf{background-size:auto 356px;background-position:center}
.ui4 .r2 .panel{height:168px}.ui4 .r2 .nt{top:356px}.ui4 .r2 .tabs{height:52px}
.ui4 .m2 .pill{top:392px}

/* S-A and S-C: overhead photo */
.ov{position:relative;overflow:hidden;border-radius:22px;box-shadow:0 40px 80px -40px rgba(60,40,10,.45)}
.ov-in{position:absolute;left:0;top:0;width:1280px;height:960px;transform-origin:0 0}
.ov-bg{position:absolute;inset:0;width:1280px;height:960px;max-width:none}
.ov-paper,.ov-screen,.ov-glare{position:absolute;inset:0}
.ov-paper{mix-blend-mode:multiply;-webkit-mask-size:1280px 960px;mask-size:1280px 960px;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.ov-paper .warp{filter:blur(.35px) contrast(.94);opacity:.94}
.ov .mp,.ov .mp.flat{box-shadow:none;background:transparent}
.ov-screen .ui4{border-radius:15px}
.ov-glare{mix-blend-mode:screen;pointer-events:none}
.ov-glare i{position:absolute;inset:0;border-radius:15px;background:linear-gradient(125deg,rgba(255,255,255,0) 35%,rgba(255,255,255,.12) 48%,rgba(255,255,255,0) 62%)}
.ov.close{border-radius:22px}

/* S-B: built flat lay */
.fl{position:relative;height:660px;border-radius:24px;overflow:hidden;background:radial-gradient(80% 90% at 70% 20%,#f4eee4,#e6dccb 60%,#dacdb7)}
.fl-book{position:absolute;left:338px;top:76px;display:flex;transform:rotate(-4deg);filter:drop-shadow(0 30px 30px rgba(70,50,20,.28)) drop-shadow(0 2px 3px rgba(70,50,20,.25))}
.fl-pg{position:relative;background:#fff}.fl-pg .mp{box-shadow:none}
.fl-pg.l{border-radius:3px 0 0 3px}.fl-pg.r{border-radius:0 3px 3px 0}
.fl-pg.r:after{content:'';position:absolute;right:-5px;top:3px;bottom:3px;width:5px;background:repeating-linear-gradient(90deg,#f1f0ec 0 1px,#dad8d2 1px 2px);border-radius:0 3px 3px 0}
.fl-sp{position:absolute;left:50%;top:0;bottom:0;width:90px;margin-left:-45px;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(40,30,10,.07) 38%,rgba(40,30,10,.2) 49.4%,rgba(255,255,255,.4) 50%,rgba(40,30,10,.12) 51%,rgba(40,30,10,.05) 62%,rgba(0,0,0,0))}
.fl-pencil{position:absolute;left:250px;top:300px;width:12px;height:300px;transform:rotate(14deg);border-radius:2px;background:linear-gradient(90deg,#e8b007,#f7c51c 45%,#d9a003);box-shadow:8px 14px 14px rgba(70,50,20,.22)}
.fl-pencil:before{content:'';position:absolute;left:0;top:-30px;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:30px solid #e8c9a0}
.fl-pencil:after{content:'';position:absolute;left:0;bottom:-26px;width:12px;height:26px;background:linear-gradient(#b8b8bd 0 8px,#f19aa0 8px);border-radius:0 0 3px 3px}
.fl-phone{position:absolute;left:150px;top:40px;width:302px;height:584px;border-radius:46px;background:#141416;padding:10px;transform:rotate(7deg);
  box-shadow:inset 0 0 0 2px #2c2c30,40px 60px 50px -10px rgba(70,50,20,.32),10px 16px 18px rgba(70,50,20,.25)}
.fl-scr{position:relative;width:282px;height:564px;border-radius:37px;overflow:hidden}
.fl-scr .ui4{position:absolute;left:0;top:0}
.fl-notch{position:absolute;left:50%;top:18px;width:86px;height:24px;margin-left:-43px;border-radius:14px;background:#000}

/* D-A and D-B */
.dv-chips{display:flex;gap:6px;justify-content:center;margin:0 auto 26px;padding:5px;background:#f1f1f3;border-radius:999px;width:max-content}
.dv-chips button{border:0;background:transparent;font:500 14px Geist,sans-serif;padding:9px 16px;border-radius:999px;cursor:pointer;color:#55555e}
.dv-chips button.on{background:#fff;color:#0c0c0e;box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04)}
.dv-stage{position:relative;margin:0 auto}
.dv-ph{position:relative;aspect-ratio:413/872;filter:drop-shadow(0 40px 40px rgba(20,30,60,.28)) drop-shadow(0 4px 8px rgba(20,30,60,.18))}
.dv-ph img{position:absolute;inset:0;width:100%;opacity:0;transition:opacity .35s}.dv-ph img.on{opacity:1}
.dvA .dv-stage{width:1104px;height:640px}.dvA .dsh{position:absolute;left:0;top:30px}.dvA .dv-ph{position:absolute;right:20px;top:36px}
.dvB .dv-stage{width:1104px;height:720px}.dvB .dsh{position:absolute;right:0;top:70px;filter:saturate(.9)}.dvB .dv-ph{position:absolute;left:150px;top:0;z-index:2}
.dv-cap{display:flex;justify-content:space-between;max-width:1104px;margin:18px auto 0;font-size:14px;color:#55555e}.dv-cap b{color:#0c0c0e;font-weight:500}
"""

JS_EXTRA = q.JS_EXTRA + r"""
// D-A and D-B: the chips move the phone and the web together; the web menu also moves the phone.
document.querySelectorAll('.dv').forEach(v=>{const chips=[...v.querySelectorAll('.dv-chips button')],shots=[...v.querySelectorAll('.dv-ph img')],bs=[...v.querySelectorAll('.dsh-side button')];
  const NAVK=[0,4,5,6],BACK={0:0,2:0,4:1,5:2,6:3};
  const set=k=>{chips.forEach((c,i)=>c.classList.toggle('on',i===k));shots.forEach((s,i)=>s.classList.toggle('on',i===k))};
  chips.forEach((c,i)=>c.addEventListener('click',()=>bs[NAVK[i]].click()));
  bs.forEach((b,k)=>b.addEventListener('click',()=>{if(k in BACK)set(BACK[k])}))});
"""


def doc(body, title="r162 - What's included", extra_css=""):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{CSS}{extra_css}</style></head>
<body>{body}{r.preload()}<script>{p.JS}{JS_EXTRA}</script></body></html>"""


def page_html():
    body = f"""<section class="row">{r.st("as")}{r.assess()}</section>{q.band()}{r.maya()}{scan_section()}{dash_section()}{q.sources()}"""
    return doc(f'<div class="scroll"><div class="mock B">{r.NAV}{r.HERO}{body}{q.closing()}</div></div>')


def still(inner, w=1104):
    css = "body{margin:0;background:#fff}.mock{width:%dpx!important;padding:0!important;overflow:visible}" % w
    return doc(f'<div class="mock B">{inner}</div>', extra_css=css)


STILLS = {
    "s-a-cam": lambda: overhead(1104, "cam", crop=(60, 60, 1160, 830)),
    "s-a-res": lambda: overhead(1104, "res", crop=(60, 60, 1160, 830)),
    "s-b-cam": lambda: flatlay("cam"),
    "s-b-res": lambda: flatlay("res"),
    "s-c-cam": lambda: overhead(600, "cam", crop=(150, 250, 480, 600), cls="close"),
    "s-c-res": lambda: overhead(600, "res", crop=(150, 250, 480, 600), cls="close"),
    "d-a-0": lambda: dash_a(0), "d-a-2": lambda: dash_a(2),
    "d-b-0": lambda: dash_b(0), "d-b-1": lambda: dash_b(1),
}

if __name__ == "__main__":
    with open(os.path.join(OUT, "page.html"), "w") as f:
        f.write(page_html())
    for name, fn in STILLS.items():
        with open(os.path.join(OUT, f"still-{name}.html"), "w") as f:
            f.write(still(fn()))
    print("wrote", OUT)
