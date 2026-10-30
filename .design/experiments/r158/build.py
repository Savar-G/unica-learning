# Builds the three r158 direction mockups (rough, desktop 1200 px design width).
# Run: python3 -I build.py   (writes a-month.html, b-stage.html, c-chapters.html next to this file, with relative asset paths)
# Render copy: R158_ASSETS=/tmp/r158/ R158_OUT=/tmp/r158 python3 build.py   (absolute paths, for the inline preview)
import os

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.environ.get("R158_ASSETS", "assets/")
OUT = os.environ.get("R158_OUT", HERE)

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Caveat:wght@500;700&display=swap');
.mock{width:1200px;background:#fff;color:#0c0c0e;font-family:Geist,system-ui,sans-serif;border-radius:16px;overflow:hidden;margin:0 auto}
@media (max-width:1100px){.mock{zoom:.6}}
.mock *{box-sizing:border-box}
.mock img{display:block}
.nav{display:flex;align-items:center;justify-content:space-between;padding:22px 48px;border-bottom:1px solid #ececef;font-size:15px}
.wm{font-weight:600;font-size:20px;letter-spacing:-.02em}.wm i{display:inline-block;width:7px;height:7px;background:#ff6a3d;margin-left:2px}
.nav .links{display:flex;gap:28px;color:#44444c}.nav .links b{color:#0c0c0e;font-weight:500}
.btn{display:inline-block;background:#0c0c0e;color:#fff;border-radius:6px;padding:13px 20px;font-size:15px;font-weight:500}
.btn.g{background:#fff;color:#0c0c0e;border:1px solid #d4d4d8}
.btn.s{padding:9px 14px;font-size:13px}
.k{font-family:'Geist Mono',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#44444c;display:inline-flex;align-items:center;gap:8px}
.k:before{content:'';width:7px;height:7px;background:#ff6a3d}
h1{font-weight:300;font-size:60px;line-height:1.04;letter-spacing:-.035em;margin:16px 0 18px}
h2{font-weight:300;font-size:40px;line-height:1.08;letter-spacing:-.03em;margin:12px 0 14px}
h3{font-weight:500;font-size:18px;margin:0 0 6px;letter-spacing:-.01em}
p{font-size:17px;line-height:1.5;color:#44444c;margin:0 0 14px}
.lead{font-size:20px}
.tag{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;border:1px solid #e4e4e7;border-radius:999px;padding:5px 10px;color:#44444c;display:inline-block}
.time{font-family:'Geist Mono',monospace;font-size:13px;background:#f4f4f5;border-radius:999px;padding:7px 12px;display:inline-flex;gap:8px;align-items:center}
.time:before{content:'';width:8px;height:8px;border-radius:50%;background:#ff6a3d}
.lnk{font-size:15px;font-weight:500;border-bottom:1.5px solid #0c0c0e;padding-bottom:1px}
.note{position:absolute;z-index:5;background:#fff8c5;border:1px dashed #c9a400;color:#5c4a00;font-family:'Geist Mono',monospace;font-size:11px;line-height:1.35;letter-spacing:.02em;padding:7px 9px;border-radius:4px;max-width:250px}
.note.st{position:static;display:inline-block;margin-top:8px}
.phone{width:200px;border-radius:30px;border:7px solid #111;overflow:hidden;background:#fff;box-shadow:0 20px 40px rgba(0,0,0,.18)}
.phone img{width:100%}
.lap{border-radius:12px;border:8px solid #1b1b1f;border-bottom-width:14px;overflow:hidden;background:#fff;box-shadow:0 24px 48px rgba(0,0,0,.18)}
.lap img{width:100%}
.page{background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.18),0 0 0 1px #e4e4e7;border-radius:3px;overflow:hidden}
.page img{width:100%}
.pen{font-family:Caveat,cursive;color:#ff6a3d;font-size:26px;line-height:1}
.field{background:radial-gradient(120% 90% at 10% 0%,#ffe08a 0%,transparent 55%),radial-gradient(90% 90% at 100% 100%,#a9c6ff 0%,transparent 60%),radial-gradient(80% 80% at 90% 10%,#ffc2a8 0%,transparent 55%),#fff4dc}
.field.sky{background:radial-gradient(110% 90% at 0% 0%,#cfe0ff 0%,transparent 60%),radial-gradient(90% 90% at 100% 100%,#bdf0d8 0%,transparent 60%),#eef4ff}
.field.mint{background:radial-gradient(110% 90% at 100% 0%,#c8f2df 0%,transparent 60%),radial-gradient(90% 90% at 0% 100%,#fff0b8 0%,transparent 60%),#effaf4}
.field.peach{background:radial-gradient(110% 90% at 0% 100%,#ffd2bf 0%,transparent 60%),radial-gradient(90% 90% at 100% 0%,#ffe9a6 0%,transparent 60%),#fff3ec}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:13px;border:1px solid #e4e4e7;border-radius:999px;padding:7px 12px;color:#44444c;background:#fff}
.chip.on{background:#0c0c0e;color:#fff;border-color:#0c0c0e}
.card{background:#f4f4f5;border-radius:12px;padding:22px}
.closing{padding:72px 48px;text-align:center}
.cards6{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin:34px 0 30px;text-align:left}
.cards6 .im{height:150px;border-radius:12px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;margin-bottom:12px}
.cards6 h3{font-size:16px}.cards6 p{font-size:13px;margin:0}
.glance{padding:56px 48px;border-top:1px solid #ececef}
.gt{display:grid;grid-template-columns:150px repeat(5,1fr);border-top:1px solid #e4e4e7;margin-top:22px;font-size:14px}
.gt div{padding:12px 10px;border-bottom:1px solid #e4e4e7;color:#44444c}
.gt .h{font-family:'Geist Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a93}
.gt .r{color:#0c0c0e;font-weight:500}
.tail{display:grid;grid-template-columns:1.1fr 1fr;gap:28px;padding:0 48px 56px}
.faq div{border-bottom:1px solid #e4e4e7;padding:14px 0;font-size:16px;display:flex;justify-content:space-between}
.faq div:after{content:'+';color:#8a8a93}
.label{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93}
"""

NAV = """<div class="nav"><span class="wm">Unica<i></i></span><span class="links"><span>How it works</span><b>What's included</b><span>Pricing</span><span>FAQ</span></span><span class="btn s">Free assessment</span></div>"""

def img(name, cls="", style=""):
    return f'<img src="{A}{name}" class="{cls}" style="{style}" alt="">'

GLANCE = """<section class="glance"><span class="k">Your month at a glance</span><h2 style="font-size:34px">Who does what, and where.</h2>
<div class="gt">
<div class="h"></div><div class="h">Workbook</div><div class="h">AI Teaching Assistant</div><div class="h">Unica app</div><div class="h">Dashboard</div><div class="h">Next workbook</div>
<div class="r">Child</div><div>15-30 min, 5 days a week, on paper</div><div>When stuck, a few minutes</div><div>-</div><div>-</div><div>-</div>
<div class="r">Parent</div><div>Hands over the book</div><div>Gets a note after each session</div><div>Scans the pages, about a minute</div><div>Looks any time</div><div>Can pause or skip</div>
<div class="r">Unica</div><div>Makes and mails it</div><div>Maya explains and draws</div><div>Marks every page</div><div>Updates after every scan</div><div>Builds it from the scans</div>
<div class="r">Where</div><div>Paper</div><div>Laptop or tablet, or the app</div><div>Phone</div><div>Website or app</div><div>Your door</div>
</div></section>"""

def closing(title="From a free assessment to the next workbook."):
    items = [
        ("Free assessment", "A short test online. A report shows the level and the gaps.", "report-level.png", "field"),
        ("Workbook", "Made from the report. Mailed home, two a month.", "wb-leah-cover.png", "field peach"),
        ("AI Teaching Assistant", "Maya works through a stuck question on a shared whiteboard.", "ta-call-laptop.png", "field sky"),
        ("Unica app", "Scan the pages. They come back marked, with the steps.", "app-marked.png", "field mint"),
        ("Parent dashboard", "Level, skills, past work and sessions with Maya.", "dash-top.png", "field peach"),
        ("Next workbook", "Built on everything before it. Arrives before this one ends.", "app-next.png", "field"),
    ]
    cards = ""
    for t, d, im, f in items:
        if im.startswith("app"):
            inner = f'<div class="phone" style="width:96px;border-width:4px;border-radius:16px;margin-bottom:-60px">{img(im)}</div>'
        elif im.startswith("wb"):
            inner = f'<div class="page" style="width:92px;margin-bottom:-40px">{img(im)}</div>'
        elif im.startswith("ta") or im.startswith("dash"):
            inner = f'<div class="lap" style="width:150px;border-width:4px;border-bottom-width:6px;margin-bottom:-30px">{img(im)}</div>'
        else:
            inner = img(im, style="width:100%;height:100%;object-fit:cover")
        cards += f'<div><div class="im {f}">{inner}</div><h3>{t}</h3><p>{d}</p></div>'
    return f"""<section class="closing"><span class="k">All of it, together</span><h2 style="font-size:46px;max-width:760px;margin:12px auto">{title}</h2>
<div class="cards6">{cards}</div><span class="btn">Take free assessment</span> &nbsp; <span class="btn g">See a sample report</span>
<div class="note st" style="display:block;max-width:none;margin:22px auto 0;width:max-content">Closing recap in the Superpower layout: one card per product, in story order</div></section>"""

TAIL = """<section class="tail"><div class="card"><span class="k">Pricing</span><h2 style="font-size:32px">All of this: CAD 79.99 a month.</h2><p>First month free. Delivery included. Cancel anytime.</p><span class="btn">Take free assessment</span></div>
<div class="faq"><span class="label">Questions</span><div>Which devices do we need?</div><div>Is Maya always right?</div><div>How much screen time is it?</div><div>Do I need to know the math?</div><div>What if we miss a day?</div></div></section>"""

def page(title, body):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body><div class="mock">{NAV}{body}</div></body></html>"""

INTRO_COPY = """<span class="k">What's included</span><h1>Everything your child gets, in the order it happens.</h1>
<p class="lead">Follow Leah through her first month of Unica: from the free assessment to the workbook made from her own work.</p>"""

# ---------------------------------------------------------------- A: a month with Leah (Oura)
def a_month():
    def mo(side, time, title, text, tag, photo, overlay, note, extra=""):
        media = f"""<div style="position:relative;height:430px;border-radius:0 18px 18px 0;overflow:hidden;{'border-radius:18px 0 0 18px' if side=='R' else ''}">{img(photo, style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover')}{overlay}<div class="note" style="top:16px;{'right' if side=='L' else 'left'}:16px">{note}</div></div>"""
        txt = f"""<div style="padding:0 64px;align-self:center"><span class="time">{time}</span><h2>{title}</h2><p>{text}</p>{extra}<span class="tag">{tag}</span></div>"""
        cols = "1.15fr 1fr" if side == "L" else "1fr 1.15fr"
        inner = media + txt if side == "L" else txt + media
        pad = "padding:28px 0 28px 0;" + ("padding-right:0;" if side == "L" else "")
        return f'<article style="display:grid;grid-template-columns:{cols};{pad}{"margin-right:48px" if side=="L" else "margin-left:48px"}">{inner}</article>'

    ov_report = f'<div style="position:absolute;left:28px;bottom:28px;width:330px;border-radius:12px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.25)">{img("report-level.png", style="width:100%")}</div>'
    ov_book = f'<div style="position:absolute;right:40px;bottom:-60px;width:250px;transform:rotate(-4deg)"><div class="page">{img("wb-leah-cover.png")}</div></div>'
    ov_ta = f'<div style="position:absolute;left:30px;right:30px;bottom:26px"><div class="lap">{img("ta-call-laptop.png")}</div></div>'
    ov_scan = f'<div style="position:absolute;right:40px;bottom:-120px"><div class="phone">{img("app-marked.png")}</div></div>'
    ov_dash = f'<div style="position:absolute;left:30px;bottom:-160px;width:470px"><div class="lap">{img("dash-top.png")}</div></div>'
    ov_next = f'<div style="position:absolute;right:40px;bottom:-140px"><div class="phone">{img("app-next.png")}</div></div>'

    body = f"""<section style="padding:80px 48px 40px;text-align:center"><div style="max-width:820px;margin:0 auto">{INTRO_COPY}<span class="btn">Take free assessment</span> &nbsp; <span class="btn g">See a sample report</span></div>
<div class="chips" style="justify-content:center;margin-top:36px"><span class="chip on">Sep 22 · Assessment</span><span class="chip">Sep 29 · Workbook</span><span class="chip">Oct 30 · Maya</span><span class="chip">Oct 30 · App</span><span class="chip">Nov 1 · Dashboard</span><span class="chip">Nov 6 · Next workbook</span></div>
<div class="note st">Chapter map = dates in Leah's month. It stays at the top while you scroll</div></section>
<div style="border-left:2px dashed #ffb59c;margin-left:24px">
{mo("L","Sep 22 · 4:00 PM","It starts with a free assessment.","Leah takes a short math test on a laptop. Her report shows her level and the gaps to work on. You choose a plan after you read it.","Child · laptop or tablet","ph-loop-assess-1.jpg",ov_report,"Real photo with the real report card on it (Oura style)",'<p><span class="lnk">See Leah\'s sample report →</span></p>')}
{mo("R","Sep 29 · In the mail","A workbook made for Leah arrives.","Made from her report and mailed home. Each one has a 10-day plan, warm-ups, new ideas, practice, word problems and a challenge.","Child · 15-30 min a day","ph-loop-deliver-7-crop.jpg",ov_book,"Click the book: it opens and flips. Level switch: Leah U10 / Mateo U19",'<div class="chips" style="margin-bottom:16px"><span class="chip on">Leah · Level U10</span><span class="chip">Mateo · Level U19</span></div>')}
<section style="padding:70px 48px;text-align:center"><span class="time">Oct 30 · 4:12 PM</span><h2 style="font-size:46px;margin-top:18px">Day 4, page 2. Question 11: <span style="background:#ffe08a;padding:0 8px">300 − 128</span>. Leah is stuck.</h2></section>
{mo("L","Oct 30 · 4:14 PM","Stuck? Work it out with Maya.","Maya, the AI Teaching Assistant, opens Leah's question on a whiteboard they both see. Maya explains each step out loud and draws it. Leah answers, asks why, or picks up the pen.","Child · a few minutes","ph-loop-practice-3.jpg",ov_ta,"Press play: the session replays with captions")}
{mo("R","Oct 30 · 7:30 PM","Scan the pages. We mark them.","Open the Unica app and scan today's pages. They come back marked like a teacher's pen, with the steps for anything Leah got wrong.","Parent · about a minute","ph-loop-scan-4.jpg",ov_scan,"The phone plays the flow: Today, Scan, Marked page, See the steps")}
{mo("L","Nov 1 · Any time","See how Leah is doing.","Her level by topic, what she has mastered, where she still needs work, every marked page and every session with Maya. The same account in the app and on the website.","Parent · any time","ph-hero-home-1.jpg",ov_dash,"Click the tabs: Overview, Skill map, Progress, Work history")}
{mo("R","Nov 6 · Ships","The next workbook is made from all of it.","More borrowing across zero. New: multiplying by 10. Less carrying, now mastered. It arrives before this one runs out.","Unica · every two weeks","ph-loop-repeat-1.jpg",ov_next,"A loop arrow back to the workbook chapter")}
</div>
{GLANCE}{closing()}{TAIL}"""
    return page("A · A month with Leah", body)

# ---------------------------------------------------------------- B: one stage (Eight Sleep + Apple)
def b_stage():
    steps = ["Free assessment", "The workbook", "Stuck? Maya", "Scan and mark", "See progress", "Next workbook"]
    def steplist(active):
        out = ""
        for i, s in enumerate(steps):
            on = i == active
            out += f'<div style="font-size:{30 if on else 22}px;font-weight:300;letter-spacing:-.02em;color:{"#0c0c0e" if on else "#c4c4cc"};margin:6px 0">{s}</div>'
        return out
    def stage(active, visual, copy, bg, tag):
        return f"""<div style="display:grid;grid-template-columns:330px 1fr;gap:0;border:1px solid #ececef;border-radius:16px;overflow:hidden;height:440px">
<div style="padding:30px 28px;display:flex;flex-direction:column;justify-content:space-between"><div><span class="label">Step {active+1} of 6</span><div style="margin-top:10px">{steplist(active)}</div></div><div><p style="font-size:15px;margin-bottom:10px">{copy}</p><span class="tag">{tag}</span></div></div>
<div class="{bg}" style="position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">{visual}</div></div>"""

    v1 = f'<div style="width:560px;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.18)">{img("report-level.png", style="width:100%")}</div>'
    v2 = f'<div style="display:flex;gap:16px;align-items:flex-end"><div class="page" style="width:230px;transform:rotate(-3deg)">{img("wb-leah-cover.png")}</div><div class="page" style="width:230px;transform:rotate(2deg)">{img("wb-leah-d1p2.png")}</div></div><div class="note" style="left:16px;top:16px">Flip the pages here. Level switch below the book</div>'
    v3 = f'<div class="lap" style="width:640px">{img("ta-call-laptop.png")}</div><div class="note" style="left:16px;top:16px">The same stage turns into a laptop. Play the session</div>'
    v4 = f'<div style="display:flex;gap:18px;margin-top:150px"><div class="phone" style="width:170px">{img("app-scan.png")}</div><div class="phone" style="width:170px">{img("app-marked.png")}</div><div class="phone" style="width:170px">{img("app-steps.png")}</div></div><div class="note" style="left:16px;top:16px">Now a phone. Screens advance as you scroll</div>'
    v5 = f'<div class="lap" style="width:600px;margin-top:150px">{img("dash-top.png")}</div><div class="note" style="left:16px;top:16px">Back to a laptop. Tabs are clickable</div>'
    v6 = f'<div style="display:flex;gap:20px;align-items:center;margin-top:60px"><div class="phone" style="width:170px">{img("app-next.png")}</div><div class="page" style="width:210px;transform:rotate(3deg)">{img("wb-mateo-cover.png")}</div></div>'

    frames = [
        stage(0, v1, "Leah takes a short test on a laptop. The report shows her level and gaps.", "field", "Child · laptop or tablet"),
        stage(1, v2, "A workbook made from her report arrives. 15-30 minutes a day.", "field peach", "Child · on paper"),
        stage(2, v3, "Stuck on 300 − 128? Maya explains and draws each step on a shared whiteboard.", "field sky", "Child · a few minutes"),
        stage(3, v4, "Scan the pages in the Unica app. They come back marked, with the steps.", "field mint", "Parent · about a minute"),
        stage(4, v5, "The dashboard updates after every scan. Same account in the app and on the website.", "field peach", "Parent · any time"),
        stage(5, v6, "The next workbook is built from all of it, and the loop starts again.", "field", "Unica · every two weeks"),
    ]
    grid = "".join(f'<div style="zoom:.5">{f}</div>' for f in frames)
    body = f"""<section style="padding:80px 48px 30px;display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:end"><div>{INTRO_COPY}<span class="btn">Take free assessment</span> &nbsp; <span class="btn g">See a sample report</span></div>
<div class="card"><span class="label">How this page works</span><p style="font-size:15px;margin-top:8px">One stage stays in place while you scroll. The steps on the left change, and the object on the right changes with them: report, workbook, laptop, phone, laptop, workbook.</p></div></section>
<section style="padding:20px 48px 10px">{stage(2, v3, "Stuck on 300 − 128? Maya explains and draws each step on a shared whiteboard. Leah answers, asks why, or picks up the pen.", "field sky", "Child · a few minutes")}
<div class="note st">Full size: the stage at step 3. Eight Sleep's "Learns · Adjusts · Gets smarter" pattern, with Apple's fixed product view</div></section>
<section style="padding:30px 48px 40px"><span class="label">The same stage at each scroll position</span><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:14px">{grid}</div>
<div class="note st">On phones the stage becomes six stacked cards with a small step bar at the top</div></section>
{GLANCE}{closing()}{TAIL}"""
    return page("B · One stage", body)

# ---------------------------------------------------------------- C: chapters to explore (reMarkable + Linear/Attio)
def c_chapters():
    def tabs(items, on=0):
        return '<div class="chips" style="justify-content:center;margin-top:22px">' + "".join(f'<span class="chip{" on" if i==on else ""}">{t}</span>' for i, t in enumerate(items)) + "</div>"
    def chapter(n, k, title, text, field, visual, tablist, tag, dark=False, h=520):
        col = "#fff" if dark else "#0c0c0e"
        sub = "#c9c9d1" if dark else "#44444c"
        bg = "background:#18181b;" if dark else ""
        return f"""<section style="padding:70px 48px;{bg}color:{col}"><div style="display:grid;grid-template-columns:1fr 1.1fr;gap:40px;align-items:end;margin-bottom:30px">
<div><span class="k" style="color:{sub}">{n} · {k}</span><h2 style="font-size:46px;color:{col}">{title}</h2></div><div><p style="color:{sub}">{text}</p><span class="tag" style="color:{sub};border-color:{'#3f3f46' if dark else '#e4e4e7'}">{tag}</span></div></div>
<div class="{field}" style="position:relative;height:{h}px;border-radius:20px;display:flex;align-items:center;justify-content:center;overflow:hidden">{visual}</div>{tablist}</section>"""

    v_wb = f"""<div style="display:flex;gap:4px;transform:translateY(40px)"><div class="page" style="width:300px">{img("wb-leah-cover.png")}</div><div class="page" style="width:300px">{img("wb-leah-d1p2.png")}</div></div>
<div class="pen" style="position:absolute;left:150px;top:90px;transform:rotate(-6deg)">made for Leah,<br>from her report ↘</div>
<div class="pen" style="position:absolute;right:120px;top:120px;transform:rotate(5deg)">↙ a new idea,<br>shown step by step</div>
<div class="note" style="left:16px;bottom:16px">Open book: click a corner to flip. The tabs jump to a part</div>
<div style="position:absolute;right:20px;bottom:20px" class="chips"><span class="chip on">Leah · Level U10</span><span class="chip">Mateo · Level U19</span></div>"""
    v_ta = f"""<div class="lap" style="width:820px;transform:translateY(30px)">{img("ta-call-laptop.png")}</div>
<div class="pen" style="position:absolute;left:40px;top:70px;color:#ffc93c">Maya draws<br>each step →</div>
<div class="note" style="right:16px;top:16px">Press play: the session replays with captions</div>"""
    v_app = f"""<div style="display:flex;gap:22px;transform:translateY(70px)"><div class="phone" style="width:190px">{img("app-today.png")}</div><div class="phone" style="width:190px">{img("app-scan.png")}</div><div class="phone" style="width:190px;transform:translateY(-30px)">{img("app-marked.png")}</div><div class="phone" style="width:190px">{img("app-steps.png")}</div></div>
<div class="pen" style="position:absolute;left:640px;top:24px">marked like a teacher's pen ↓</div>
<div class="note" style="left:16px;top:16px">The phones play in order. The tabs pick a screen</div>"""
    v_dash = f"""<div class="lap" style="width:760px;transform:translateY(120px)">{img("dash-top.png")}</div><div class="note" style="left:16px;top:16px">A live dashboard: the tabs below are its real tabs. "Sample data" label</div>"""
    v_as = f"""<div style="width:620px;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,.18)">{img("report-level.png", style="width:100%")}</div>"""

    body = f"""<section style="padding:80px 48px 40px;text-align:center"><div style="max-width:820px;margin:0 auto">{INTRO_COPY}<span class="btn">Take free assessment</span></div></section>
<div style="display:flex;justify-content:center;padding:0 0 10px"><div style="display:flex;gap:4px;background:#f4f4f5;border-radius:999px;padding:5px"><span class="chip on" style="border:0">Assessment</span><span class="chip" style="border:0;background:none">Workbook</span><span class="chip" style="border:0;background:none">AI Teaching Assistant</span><span class="chip" style="border:0;background:none">Unica app</span><span class="chip" style="border:0;background:none">Dashboard</span><span class="chip" style="border:0;background:none">Next workbook</span></div></div>
<div style="text-align:center"><div class="note st">Pill menu stays at the top (reMarkable). Each chapter has its own link for outreach</div></div>
{chapter("01","Assessment","It starts with a free assessment.","Leah takes a short math test on a laptop. Her report shows her level and gaps. You choose a plan after you read it.","field",v_as,'<div style="text-align:center;margin-top:20px"><span class="lnk">See Leah\'s sample report →</span></div>',"Child · laptop or tablet",h=340)}
{chapter("02","Workbook","A workbook made for Leah arrives.","Made from her report and mailed home. A 10-day plan, warm-ups, new ideas, practice, word problems and a challenge.","field peach",v_wb,tabs(["Cover","10-day plan","New idea","Practice","Word problems","Challenge"],2),"Child · 15-30 min a day")}
{chapter("03","AI Teaching Assistant","Stuck? Work it out with Maya.","Maya opens Leah's question on a whiteboard they both see, explains each step out loud and draws it. Leah answers, asks why, or picks up the pen.","field sky",v_ta,tabs(["Leah's desk","On the whiteboard","After the session"],1),"Child · a few minutes",dark=True)}
{chapter("04","Unica app","Scan the pages. We mark them.","Scan today's pages with the Unica app. They come back marked, with the steps for anything Leah got wrong.","field mint",v_app,tabs(["Today","Scan","Marked page","See the steps"],2),"Parent · about a minute")}
{chapter("05","Dashboard","See how Leah is doing.","Level by topic, skills, every marked page and every session with Maya. The same account in the app and on the website.","field peach",v_dash,tabs(["Overview","Skill map","Progress","What we've learned","Work history","Sessions with Maya","Next workbook","Account"],0),"Parent · any time",h=440)}
{GLANCE}{closing("And then the next workbook, built on everything before it.")}{TAIL}"""
    return page("C · Chapters to explore", body)

for name, fn in (("a-month.html", a_month), ("b-stage.html", b_stage), ("c-chapters.html", c_chapters)):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(fn())
    print("wrote", name)
