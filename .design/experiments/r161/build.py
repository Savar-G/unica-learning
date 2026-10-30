# Round r161: the r160 B page with Savar's picks (paper workbook band) and three reworked steps:
# - "Scan the pages": a photo (AI generated base, blank page and blank screen) with Leah's real workbook page and the
#   Unica app screen warped onto them; the screen plays camera, marking, marked.
# - "Parent dashboard": the Figma dashboard (99:53), clickable: the menu scrolls the dashboard to each part.
# - "The next workbook": N-C reworked: three sources, what each showed, and what each changes in Workbook 04.
# Run: python3 -I build.py   -> page.html (relative paths)
# Render copy: R161_ASSETS=<abs>/ R160_ASSETS=<abs>/ R159_ASSETS=<abs>/ R161_OUT=/tmp/r161 python3 -I build.py
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = os.environ.get("R161_ASSETS", "assets/")
os.environ.setdefault("R159_ASSETS", "../r159/assets/")
os.environ.setdefault("R160_ASSETS", "../r160/assets/")
OUT = os.environ.get("R161_OUT", HERE)
_spec = importlib.util.spec_from_file_location("r160", os.path.join(HERE, "..", "r160", "build.py"))
p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(p)
r = p.r
A = r.A

# ---------- scan scene ----------
# Corner points on the 1024 x 1280 base photo (TL, TR, BL, BR), measured on a grid.
PAPER_Q = "322,177,678,257,128,630,536,739"
PAPER_CLIP = "322px 177px,678px 257px,604px 510px,566px 508px,548px 690px,528px 700px,512px 708px,504px 730px,128px 630px"
SCREEN_Q = "575,518,765,527,540,911,738,928"
SCREEN_CLIP = "577px 516px,767px 525px,740px 931px,537px 913px"

ICON_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'
ICON_FLASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>'
ICON_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>'
STATUS = ('<div class="bar1"><span>9:41</span><span class="si"><svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/>'
          '<rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg>'
          '<svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="15" height="7" rx="1.5"/><rect x="21.5" y="3.5" width="1.5" height="4" rx=".7" opacity=".5"/></svg></span></div>')


def scene(width=520, state=None, cls="", crop=(0, 0, 1024, 1280)):
    """state=None plays the loop; 'cam' or 'res' freezes one screen (for still images). crop = x, y, w, h on the photo."""
    x0, y0, cw, ch = crop
    k = width / cw
    on = lambda name: " on" if (state == name or (state is None and name == "cam")) else ""
    cam = f"""<div class="sc c3{on('cam')}">{STATUS}<div class="bar2">{ICON_X}<span>Day 1 &middot; page 1 of 8</span>{ICON_FLASH}</div>
<div class="vf" style="background-image:url('{OWN}base-scan-1.jpg')"><div class="pg">{p.mpage(206, False)}</div><i class="br a"></i><i class="br b"></i><i class="br c"></i><i class="br d"></i></div>
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
    return f"""<div class="scn {cls}" style="width:{width}px;height:{round(ch*k)}px"><div class="scn-in" style="transform:scale({k:.5f}) translate({-x0}px,{-y0}px)">
<img class="scn-bg" src="{OWN}base-scan-1.jpg" alt="A parent holds a phone over a printed workbook page on a kitchen table">
<div class="scn-paper" style="clip-path:polygon({PAPER_CLIP})"><div class="warp" data-q="{PAPER_Q}" data-w="541" data-h="700">{p.mpage(541, False, cls="flat")}</div></div>
<div class="scn-screen" style="clip-path:polygon({SCREEN_CLIP})"><div class="warp" data-q="{SCREEN_Q}" data-w="282" data-h="610"><div class="ui ui3"{loop}>{cam}{mkg}{res}</div></div></div>
<div class="scn-glare" style="clip-path:polygon({SCREEN_CLIP})"></div></div></div>"""


# ---------- clickable dashboard ----------
S_DASH = 1104 / 1440
NAV = ["Overview", "Skill map", "Progress over time", "What we've learned", "Work history", "Companion calls", "Next workbook", "Account"]
TARGET = [0, 1327, 949, 1910, 2496, 1910, 2496, 2928]


def dashboard():
    s = S_DASH
    hot = "".join(f'<button style="left:{20*s:.1f}px;top:{(169+42*k)*s:.1f}px;width:{207*s:.1f}px;height:{38*s:.1f}px" data-y="{TARGET[k]*s:.0f}" aria-label="{n}"></button>' for k, n in enumerate(NAV))
    return f"""<div class="dsh browser"><div class="bar"><i></i><i></i><i></i><span>app.unicalearning.com/account</span></div>
<div class="dsh-body"><div class="dsh-main"><img src="{OWN}dash-main.jpg" alt="Parent dashboard (sample data)" style="width:{1192*s:.0f}px"></div>
<div class="dsh-side" style="width:{248*s:.0f}px"><img src="{OWN}dash-side.png" alt="" style="width:{248*s:.0f}px"><i class="dsh-hi" style="left:{20*s:.1f}px;top:{169*s:.1f}px;width:{207*s:.1f}px;height:{38*s:.1f}px"></i>{hot}</div></div></div>"""


# ---------- the next workbook, built from three sources ----------
def sources():
    cards = [
        ("1", "From her marked pages", "Every page she scans in the Unica app",
         f'<div class="th-page">{p.mpage(260, True)}</div>',
         "When she borrows, she takes the smaller digit from the bigger one, like 5 &minus; 0 instead of 0 &minus; 5. Carrying: all right.",
         '<b class="t more">More</b> borrowing across zero <b class="t less">Less</b> carrying'),
        ("2", "From her sessions with Maya", "The AI Teaching Assistant",
         f'<img class="th-maya" src="{OWN}ta-call-laptop.png" alt="">',
         "Most of her questions to Maya were about borrowing. On 300 &minus; 128 she needed Maya's steps, then finished on her own.",
         '<b class="t more">More</b> borrowing across zero'),
        ("3", "From her first assessment", "And the monthly re-check",
         f'<img class="th-rep" src="{A}report-level.png" alt="">',
         "Her working level, and the skills still to come at that level.",
         '<b class="t new">New</b> multiplying by 10 <b class="t rev">Review</b> unit fractions'),
    ]
    cs = "".join(f"""<div class="srcc"><div class="th">{im}</div><div class="tx"><div class="hd"><i>{n}</i><div><b>{t}</b><span>{sub}</span></div></div>
<p><em>What it showed:</em> {showed}</p><p class="to"><em>In Workbook 04:</em> {to}</p></div></div>""" for n, t, sub, im, showed, to in cards)
    cover = f"""<div class="cv cv2"><div class="cv-top"><span class="cv-wm">Unica Learning<i></i></span><span class="cv-n">Workbook 04</span></div>
{r.MARK.replace('class="mk"', 'class="mk cv-mk"')}<div class="cv-for">Made for Leah &middot; Level U10 &middot; Adding and subtracting to 1000</div>
<div class="cv-t">Borrowing across<br><mark>zero</mark></div>
<div class="cv-box"><b>Made from Leah's Workbook 03</b><ul class="cvl">
<li><b class="t more">More</b>Borrowing across zero<i>1</i><i>2</i></li><li><b class="t new">New</b>Multiplying by 10<i>3</i></li>
<li><b class="t less">Less</b>Carrying, now strong<i>1</i></li><li><b class="t rev">Review</b>Unit fractions<i>3</i></li></ul></div></div>"""
    svg = ('<svg class="wires" viewBox="0 0 1104 600" preserveAspectRatio="none"><g fill="none" stroke="#cfc8bb" stroke-width="2" stroke-dasharray="5 6">'
           + "".join(f'<path d="M640 {y} C 700 {y}, 690 300, 744 300"/>' for y in (95, 300, 505)) + "</g></svg>")
    return f"""<section class="full nx2">{r.st("nx")}<div class="nx2-grid">{svg}<div class="srcs">{cs}</div><div class="cvw">{cover}
<p class="cvn">It arrives before this workbook runs out. Pause or skip one in the app.</p></div></div></section>"""


def band():
    k, h, pp, _ = r.S["wb"]
    lvl = '<div class="lvl" style="margin-top:6px"><button class="on" data-book="leah">Leah &middot; Level U10</button><button data-book="mateo">Mateo &middot; Level U19</button></div>'
    return f"""<section class="shelfband paper"><span class="k">{k}</span><h2>{h}</h2><p class="lead">{pp}</p>
<div style="position:relative;margin-top:10px">{r.reader("rdW", "leah", 680, "open")}</div>{lvl}</section>"""


def closing():
    cards = [
        ("t1", f'<div class="mini-br"><div class="bar"></div><img src="{A}test-question-crop.jpg" alt=""></div>', "Free assessment", "A short test online. A report shows the level and what to work on."),
        ("t2", f'<div class="mini-bk"><img src="{A}wb/leah-01-cover.jpg" alt=""><i class="s"></i></div>', "Workbook", "Made from the report. Mailed home, two a month."),
        ("t3", f'<div class="mini-br" style="width:300px;left:-60px"><div class="bar"></div><img src="{OWN}ta-call-laptop.png" alt=""></div>', "AI Teaching Assistant", "Maya works through a stuck question on a shared whiteboard."),
        ("t4", f'<img class="mini-ph2" src="{OWN}scene-res.jpg" alt="">', "Unica app", "Scan the pages. They come back marked, with the steps."),
        ("t5", f'<div class="mini-br" style="width:300px;left:16px"><div class="bar"></div><img src="{A}dash.jpg" alt=""></div>', "Parent dashboard", "Level, skills, past work and sessions with Maya."),
        ("t6", '<div class="mini-cv">' + p.next_cover(0.42) + "</div>", "Next workbook", "Built on everything before it. Arrives before this one ends."),
    ]
    cs = "".join(f'<div><div class="im {c}">{im}</div><h3>{h}</h3><p>{pp}</p></div>' for c, im, h, pp in cards)
    return f"""<section class="closing"><span class="k">All of it, together</span><h2>From a free assessment to the next workbook.</h2>
<div class="cards6">{cs}</div><span class="btn">Take free assessment</span></section>"""


CSS = p.CSS + """
.B .full{padding:130px 48px 0}.B .full>.st{max-width:640px;margin-bottom:40px}
.B .full.center>.st{margin:0 auto 40px;text-align:center}.B .full.center>.st .lead{margin:0 auto}
.B .shelfband.paper{background:radial-gradient(90% 70% at 50% 18%,#fbf8f2,#efe8dc 70%,#e6ddcd);color:#0c0c0e}

/* scan scene: photo with the real page and the app warped on */
.scn{position:relative;overflow:hidden;border-radius:22px;margin:0 auto;box-shadow:0 40px 80px -36px rgba(20,30,60,.5)}
.scn-in{position:absolute;left:0;top:0;width:1024px;height:1280px;transform-origin:0 0}
.scn-bg{position:absolute;inset:0;width:1024px;height:1280px}
.scn-paper,.scn-screen,.scn-glare{position:absolute;inset:0;mix-blend-mode:multiply}
.scn-paper{filter:blur(.55px) contrast(.92);opacity:.93}
.scn-glare{mix-blend-mode:screen;background:linear-gradient(118deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.10) 46%,rgba(255,255,255,0) 60%)}
.warp{position:absolute;left:0;top:0;transform-origin:0 0}
.scn .mp,.scn .mp.flat{box-shadow:none}
.ui3{position:absolute;left:0;top:0;width:282px;height:610px;font-family:Geist,sans-serif;overflow:hidden}
.ui3 .sc{position:absolute;inset:0;opacity:0;transition:opacity .45s}.ui3 .sc.on{opacity:1}
.ui3 .bar1{position:absolute;left:24px;right:20px;top:13px;display:flex;justify-content:space-between;align-items:center;font:600 13px Geist,sans-serif}
.ui3 .bar1 .si{display:flex;gap:5px;align-items:center}.ui3 .bar1 svg{fill:currentColor}
.ui3 .bar2{position:absolute;left:16px;right:16px;top:46px;display:flex;justify-content:space-between;align-items:center;font:500 13px Geist,sans-serif}
.c3{background:#0e0e10;color:#fff}
.c3 .vf{position:absolute;left:10px;right:10px;top:80px;height:400px;border-radius:16px;overflow:hidden;background-size:1024px 1280px;background-position:-150px -690px}
.c3 .vf:after{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(0,0,0,0),rgba(0,0,0,.25))}
.c3 .pg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-7deg) scale(.95);transition:transform 1.1s cubic-bezier(.3,.7,.2,1) .2s;z-index:1}
.c3.on .pg{transform:translate(-50%,-50%) rotate(-2deg) scale(1)}
.c3 .pg .mp{box-shadow:0 14px 20px -8px rgba(60,35,10,.55),0 0 0 .5px rgba(0,0,0,.08)}
.c3 .br{position:absolute;width:24px;height:24px;border:3px solid #ff6a3d;transition:all 1s cubic-bezier(.3,.7,.2,1) .8s;z-index:2}
.c3 .br.a{left:10px;top:10px;border-right:0;border-bottom:0;border-radius:6px 0 0 0}.c3 .br.b{right:10px;top:10px;border-left:0;border-bottom:0;border-radius:0 6px 0 0}
.c3 .br.c{left:10px;bottom:10px;border-right:0;border-top:0;border-radius:0 0 0 6px}.c3 .br.d{right:10px;bottom:10px;border-left:0;border-top:0;border-radius:0 0 6px 0}
.c3.on .br.a{left:30px;top:50px}.c3.on .br.b{right:30px;top:50px}.c3.on .br.c{left:30px;bottom:50px}.c3.on .br.d{right:30px;bottom:50px}
.c3 .pill{position:absolute;left:50%;top:496px;transform:translateX(-50%);background:#fff;color:#0c0c0e;border-radius:999px;padding:8px 14px;font:500 12.5px Geist,sans-serif;white-space:nowrap}
.c3 .pill .p2{position:absolute;left:0;right:0;text-align:center;opacity:0;color:#1f9d55}
.c3 .pill span{transition:opacity .3s}.c3.on .pill .p1{opacity:0;transition-delay:2s}.c3.on .pill .p2{opacity:1;transition-delay:2s}
.c3 .bot{position:absolute;left:18px;right:18px;bottom:24px;display:flex;align-items:center;justify-content:space-between}
.c3 .thumbs{display:flex;gap:5px}.c3 .thumbs i{width:20px;height:26px;border-radius:3px;background:#3a3a3f}.c3 .thumbs i:first-child{background:#fff}
.c3 .shut{width:58px;height:58px;border-radius:50%;border:4px solid #fff;display:grid;place-items:center}.c3 .shut i{width:44px;height:44px;border-radius:50%;background:#fff}
.c3.on .shut i{animation:press .3s 2.9s}
.c3 .up{font:500 13px Geist,sans-serif}
.c3 .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}.c3.on .flash{animation:flash .6s 3s}
.ui3 .m2 .pgw{left:34px;top:90px}
.ui3 .r2 .panel{height:206px}.ui3 .r2 .nt{top:396px}
.ui3 .r2 .tabs{position:absolute;left:0;right:0;bottom:0;height:56px;background:#fff;border-top:1px solid #e4e4e7;display:flex;justify-content:space-around;align-items:center;font-size:10px;color:#8a8a93}
.ui3 .r2 .tabs b{width:38px;height:38px;border-radius:50%;background:#ff6a3d;display:grid;place-items:center}

/* clickable dashboard */
.dsh{position:relative}
.dsh-body{position:relative;height:640px;background:#f8f8f9}
.dsh-main{position:absolute;top:0;bottom:0;right:0;left:190px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scroll-behavior:smooth}
.dsh-main img{display:block;max-width:none}
.dsh-side{position:absolute;left:0;top:0;bottom:0;background:#fff;border-right:1px solid #ececef;overflow:hidden}
.dsh-side img{display:block}
.dsh-side button{position:absolute;border:0;background:transparent;cursor:pointer;border-radius:8px}
.dsh-side button:hover{background:rgba(0,0,0,.035)}
.dsh-hi{position:absolute;background:#fff1ea;mix-blend-mode:multiply;border-radius:8px;transition:top .25s cubic-bezier(.3,.7,.2,1);pointer-events:none}
.dsh-cap{margin-top:12px;font:500 12px 'Geist Mono',monospace;letter-spacing:.04em;color:#8a8a93}

/* next workbook: built from */
.nx2-grid{position:relative;display:grid;grid-template-columns:600px 1fr;gap:0;align-items:center;min-height:600px;background:#f4f2ee;border-radius:24px;padding:24px}
.wires{position:absolute;inset:0;width:100%;height:100%}
.srcs{display:grid;gap:14px;position:relative;z-index:1}
.srcc{display:grid;grid-template-columns:170px 1fr;gap:16px;background:#fff;border-radius:16px;padding:14px;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 16px 32px -20px rgba(20,30,60,.4)}
.srcc .th{height:150px;border-radius:10px;overflow:hidden;position:relative;background:#f4f4f5}
.srcc .th-page{position:absolute;left:-118px;top:-106px}
.srcc .th-page .mp{box-shadow:none}
.srcc .th-maya{position:absolute;width:520px;max-width:none;left:-170px;top:-58px}
.srcc .th-rep{position:absolute;width:430px;max-width:none;left:-20px;top:-74px}
.srcc .hd{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
.srcc .hd i{flex:none;width:24px;height:24px;border-radius:50%;background:#0c0c0e;color:#fff;display:grid;place-items:center;font:500 12px 'Geist Mono',monospace;font-style:normal}
.srcc .hd b{display:block;font-size:16px;font-weight:500}.srcc .hd span{font-size:12.5px;color:#8a8a93}
.srcc p{font-size:13.5px;line-height:1.45;margin:0 0 6px;color:#33343c}.srcc p em{font-style:normal;color:#8a8a93}
.srcc p.to{margin:0}
.t{display:inline-block;font:500 10px 'Geist Mono',monospace;letter-spacing:.04em;padding:2px 6px;border-radius:4px;margin:0 3px 0 6px}
.t.more{background:#fde3dc;color:#c2410c}.t.less{background:#dcf2e4;color:#15803d}.t.new{background:#e3e9fd;color:#2f4fd1}.t.rev{background:#fdf1c8;color:#8a6a00}
.cvw{position:relative;z-index:1;display:grid;justify-items:center;gap:14px}
.cv2{zoom:1.12}
.cvl{list-style:none;padding:0!important}.cvl li{display:flex;align-items:center;gap:4px;margin:3px 0}.cvl .t{margin:0 4px 0 0;font-size:6.5px;padding:1px 4px}
.cvl li i{font:500 6.5px 'Geist Mono',monospace;font-style:normal;width:11px;height:11px;border-radius:50%;background:#0c0c0e;color:#fff;display:inline-grid;place-items:center;margin-left:2px}
.cvl li i:first-of-type{margin-left:auto}
.cvn{font-size:14px;color:#55555e;margin:0;max-width:340px;text-align:center}

/* closing cards: new pictures */
.mini-ph2{position:absolute;left:50%;top:0;width:150px;margin-left:-75px;border-radius:0}
.t4 .mini-ph2{top:-10px}
.mini-cv{position:absolute;left:50%;top:22px;transform:translateX(-50%) rotate(3deg)}
"""

JS_EXTRA = r"""
// Warp an element onto four corner points (TL, TR, BL, BR) with a CSS matrix3d.
function adj(m){return[m[4]*m[8]-m[5]*m[7],m[2]*m[7]-m[1]*m[8],m[1]*m[5]-m[2]*m[4],m[5]*m[6]-m[3]*m[8],m[0]*m[8]-m[2]*m[6],m[2]*m[3]-m[0]*m[5],m[3]*m[7]-m[4]*m[6],m[1]*m[6]-m[0]*m[7],m[0]*m[4]-m[1]*m[3]]}
function mm(a,b){const c=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[3*i+k]*b[3*k+j];c[3*i+j]=s}return c}
function mv(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]}
function basis(x1,y1,x2,y2,x3,y3,x4,y4){const m=[x1,x2,x3,y1,y2,y3,1,1,1];const v=mv(adj(m),[x4,y4,1]);return mm(m,[v[0],0,0,0,v[1],0,0,0,v[2]])}
document.querySelectorAll('.warp').forEach(el=>{const q=el.dataset.q.split(',').map(Number),w=+el.dataset.w,h=+el.dataset.h;
  el.style.width=w+'px';el.style.height=h+'px';
  const s=basis(0,0,w,0,0,h,w,h),d=basis(...q);let t=mm(d,adj(s));for(let i=0;i<9;i++)t[i]/=t[8];
  el.style.transform='matrix3d('+[t[0],t[3],0,t[6],t[1],t[4],0,t[7],0,0,1,0,t[2],t[5],0,t[8]].join(',')+')'});
// The phone in the photo plays camera, marking, marked.
document.querySelectorAll('.ui3[data-loop]').forEach(ui=>{const sc=[...ui.querySelectorAll('.sc')],D=[3600,2100,5200];let i=0;
  const show=n=>{i=n;sc.forEach((s,k)=>{s.classList.remove('on');void s.offsetWidth;if(k===n)s.classList.add('on')});setTimeout(()=>show((i+1)%sc.length),D[n])};show(0)});
// Dashboard: the menu scrolls the dashboard; scrolling moves the highlight.
document.querySelectorAll('.dsh').forEach(d=>{const main=d.querySelector('.dsh-main'),hi=d.querySelector('.dsh-hi'),bs=[...d.querySelectorAll('.dsh-side button')];
  const mark=b=>{hi.style.top=b.style.top};let lock=0;
  bs.forEach(b=>b.onclick=()=>{mark(b);lock=Date.now()+1200;main.scrollTo({top:+b.dataset.y,behavior:'smooth'})});
  const order=[0,2,1,3,4,7];main.addEventListener('scroll',()=>{if(Date.now()<lock)return;let best=bs[0];for(const k of order){if(main.scrollTop+40>=+bs[k].dataset.y)best=bs[k]}
    if(main.scrollTop+main.clientHeight>=main.scrollHeight-2)best=bs[4];mark(best)})});
"""


def page_html(static_scene=None):
    k, h, pp, _ = r.S["db"]
    dash_sec = f"""<section class="full center"><div class="st"><span class="k">{k}</span><h2>{h}</h2><p class="lead">{pp}</p></div>{dashboard()}
<p class="dsh-cap" style="text-align:center">Click the menu to move through the dashboard &middot; Sample data</p></section>"""
    scan = f"""<section class="row">{r.st("app")}{scene(620, static_scene, crop=(110, 120, 820, 880))}</section>"""
    body = f"""<section class="row">{r.st("as")}{r.assess()}</section>{band()}{r.maya()}{scan}{dash_sec}{sources()}"""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>r161 - What's included</title><style>{CSS}</style></head>
<body><div class="scroll"><div class="mock B">{r.NAV}{r.HERO}{body}{closing()}</div></div>{r.preload()}<script>{p.JS}{JS_EXTRA}</script></body></html>"""


def still(state):
    """One frozen scene state, for the closing card and for Figma."""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}body{{margin:0;background:#fff}}.scn{{border-radius:0;box-shadow:none}}</style></head>
<body><div class="mock B" style="width:1024px;padding:0;overflow:visible">{scene(1024, state)}</div>{r.preload()}<script>{p.JS}{JS_EXTRA}</script></body></html>"""


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "page.html"), "w") as f:
        f.write(page_html())
    for st in ("cam", "res"):
        with open(os.path.join(OUT, f"still-{st}.html"), "w") as f:
            f.write(still(st))
    print("wrote", OUT)
