# Round r160: direction B from r159 (rows, dark workbook band), with the workbook open on load and new visuals for the
# two weakest steps: "Scan the pages" (options S-A, S-B, S-C) and "The next workbook" (options N-A, N-B, N-C).
# Run: python3 -I build.py       -> b2.html (full page) and parts.html (the changed sections only), relative paths
# Render copy: R160_ASSETS=<abs r160/assets/> R159_ASSETS=<abs r159/assets/> R160_OUT=/tmp/r160 python3 -I build.py
# Reuses the r159 parts (header, assessment, Maya, dashboard, closing, reader markup) from ../r159/build.py.
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = os.environ.get("R160_ASSETS", "assets/")
os.environ.setdefault("R159_ASSETS", "../r159/assets/")
OUT = os.environ.get("R160_OUT", HERE)
_spec = importlib.util.spec_from_file_location("r159", os.path.join(HERE, "..", "r159", "build.py"))
r = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r)
A = r.A

# ---------- Leah's Day 1 warm-up page, with her answers and the app's marks ----------
# Box centres, answers and marks live in PAGE_JS (Figma 228:1248, 541 x 700 page image).
def mpage(w, with_marks=True, cls="", style="", only_marks=False):
    m = "only" if only_marks else ("1" if with_marks else "0")
    img = "" if only_marks else f'<img src="{A}wb/leah-03-d1p1.jpg" alt="Leah\'s Day 1 warm-up page with her answers">'
    return f'<div class="mp {cls}" data-w="{w}" data-m="{m}" style="width:{w}px;{style}">{img}</div>'


# ---------- next workbook cover, in the Figma cover's style ----------
def next_cover(zoom=1.0, cls=""):
    return f"""<div class="cv {cls}" style="zoom:{zoom}"><div class="cv-top"><span class="cv-wm">Unica Learning<i></i></span><span class="cv-n">Workbook 04</span></div>
{r.MARK.replace('class="mk"', 'class="mk cv-mk"')}<div class="cv-for">Made for Leah &middot; Level U10 &middot; Adding and subtracting to 1000</div>
<div class="cv-t">Borrowing across<br><mark>zero</mark></div>
<div class="cv-box"><b>Made from Leah's Workbook 03</b><ul><li>More practice: borrowing across a zero</li><li>Less practice: carrying, now strong</li><li>A step ahead: 3-digit word problems</li></ul></div></div>"""


CSS = r.CSS + """
/* option switch: a mockup control, not part of the page */
.optbar{display:inline-flex;gap:3px;padding:4px;border:1px dashed #c9a400;background:#fffbe6;border-radius:999px;margin:0 0 22px}
.optbar button{border:0;background:transparent;font:500 12px 'Geist Mono',monospace;letter-spacing:.03em;padding:6px 11px;border-radius:999px;cursor:pointer;color:#5c4a00}
.optbar button.on{background:#5c4a00;color:#fffbe6}
.opt{display:none}.opt.on{display:block}
.B .row.opts{align-items:start}

/* workbook band: open on load */
.B .shelfband.paper{background:radial-gradient(90% 70% at 50% 18%,#fbf8f2,#efe8dc 70%,#e6ddcd);color:#0c0c0e}
.B .shelfband.paper .k{color:#44444c}.B .shelfband.paper p{color:#44444c}.shelfband.paper .rd-cap{color:#8a8a93}
.shelfband .lvl{background:rgba(255,255,255,.12);color:#e9e4da}.shelfband.paper .lvl{background:rgba(0,0,0,.06);color:#44444c}
.shelfband .bandt{position:absolute;right:24px;top:20px}
.noanim .lf,.noanim .lf *,.noanim .rd-body{animation:none!important;transition:none!important}

/* marked page */
.mp{position:relative;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 50px -24px rgba(20,30,60,.45)}
.mp>img{width:100%;display:block}
.mp .hw{position:absolute;display:flex;align-items:center;justify-content:center;font-family:Caveat,'Bradley Hand',cursive;font-weight:500;color:#30313a;line-height:1}
.mp .ml{position:absolute;inset:0;pointer-events:none}
.mp .tk{position:absolute;font-family:Caveat,'Bradley Hand',cursive;font-weight:700;font-style:normal;color:#e0412b;line-height:1;white-space:nowrap}
.mp .tk small{margin-left:2px;font-weight:700}
.mp .ring{position:absolute;border:2px solid #e0412b;border-radius:50%;transform:rotate(-4deg)}
.mp .score{position:absolute;font-family:Caveat,'Bradley Hand',cursive;font-weight:700;font-style:normal;color:#e0412b;border:solid #e0412b;border-radius:50%;line-height:1.1;transform:rotate(-6deg)}

/* S-A: before and after */
.ba{position:relative;width:500px;margin:0 auto;user-select:none;-webkit-user-select:none;touch-action:none;cursor:ew-resize;--x:46%}
.ba .over{position:absolute;inset:0;clip-path:inset(0 0 0 var(--x))}
.ba .over .ml{position:absolute;inset:0}
.ba .handle{position:absolute;top:-12px;bottom:-12px;left:var(--x);width:2px;margin-left:-1px;background:#0c0c0e;z-index:4}
.ba .handle i{position:absolute;top:50%;left:50%;width:42px;height:42px;margin:-21px 0 0 -21px;border-radius:50%;background:#0c0c0e;color:#fff;display:grid;place-items:center;font:500 15px Geist,sans-serif;font-style:normal;box-shadow:0 6px 16px rgba(0,0,0,.25)}
.ba.hint .over{transition:clip-path 1.5s cubic-bezier(.3,.7,.2,1)}.ba.hint .handle{transition:left 1.5s cubic-bezier(.3,.7,.2,1)}
.ba .lab{position:absolute;top:-38px;font:500 10.5px 'Geist Mono',monospace;text-transform:uppercase;letter-spacing:.06em;color:#8a8a93}
.ba .lab.l{left:0}.ba .lab.r{right:0;color:#e0412b}
.appnote{position:absolute;width:290px;background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 50px -20px rgba(20,30,60,.5);text-align:left}
.appnote .k2{font:500 10px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93}
.appnote b{display:block;font-weight:300;font-size:30px;letter-spacing:-.02em;margin:4px 0 6px}.appnote b small{font-size:14px;color:#55555e;margin-left:4px}
.appnote p{font-size:13.5px;margin:0 0 8px}.appnote span{font-size:13.5px;font-weight:500;border-bottom:1.5px solid #0c0c0e}

/* S-B: photo with the app on the phone */
.scene{position:relative;width:470px;margin:0 auto;border-radius:20px;overflow:hidden;box-shadow:0 40px 80px -36px rgba(20,30,60,.5)}
.scene>img.ph0{width:100%;display:block}
.scene .scr2{position:absolute;left:30.91%;top:19.14%;width:44%;height:65.52%;border-radius:11%/5.3%;overflow:hidden;background:#0e0e10}
.scene .ui{position:absolute;left:0;top:0;width:282px;height:590px;transform-origin:0 0;transform:scale(.7333);font-family:Geist,sans-serif}
.ui .sc{position:absolute;inset:0;opacity:0;transition:opacity .45s}.ui .sc.on{opacity:1}
.ui .bar1{position:absolute;left:22px;right:20px;top:14px;display:flex;justify-content:space-between;font:600 14px Geist,sans-serif}
.ui .bar2{position:absolute;left:16px;right:16px;top:44px;display:flex;justify-content:space-between;align-items:center;font:500 13px Geist,sans-serif}
.c2{background:#0e0e10;color:#fff}
.c2 .vf{position:absolute;left:10px;right:10px;top:76px;height:384px;border-radius:14px;overflow:hidden;background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 3px,rgba(0,0,0,.05) 3px 6px),linear-gradient(170deg,#d8c7a4,#c3ad84 60%,#a8916a)}
.c2 .pg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) perspective(600px) rotateX(16deg) rotate(-5deg) scale(.96);transition:transform 1.1s cubic-bezier(.3,.7,.2,1) .2s}
.c2.on .pg{transform:translate(-50%,-50%) perspective(600px) rotateX(5deg) rotate(-1.5deg) scale(1)}
.c2 .pg .mp{box-shadow:0 18px 22px -10px rgba(60,40,10,.5)}
.c2 .br{position:absolute;width:24px;height:24px;border:3px solid #ff6a3d;transition:all 1s cubic-bezier(.3,.7,.2,1) .8s}
.c2 .br.a{left:10px;top:10px;border-right:0;border-bottom:0}.c2 .br.b{right:10px;top:10px;border-left:0;border-bottom:0}
.c2 .br.c{left:10px;bottom:10px;border-right:0;border-top:0}.c2 .br.d{right:10px;bottom:10px;border-left:0;border-top:0}
.c2.on .br.a{left:34px;top:30px}.c2.on .br.b{right:34px;top:30px}.c2.on .br.c{left:34px;bottom:30px}.c2.on .br.d{right:34px;bottom:30px}
.c2 .pill{position:absolute;left:50%;top:474px;transform:translateX(-50%);background:#fff;color:#0c0c0e;border-radius:999px;padding:8px 14px;font:500 12.5px Geist,sans-serif;white-space:nowrap}
.c2 .pill .p2{position:absolute;left:0;right:0;text-align:center;opacity:0;color:#1f9d55}
.c2 .pill span{transition:opacity .3s}.c2.on .pill .p1{opacity:0;transition-delay:2s}.c2.on .pill .p2{opacity:1;transition-delay:2s}
.c2 .bot{position:absolute;left:16px;right:16px;bottom:22px;display:flex;align-items:center;justify-content:space-between}
.c2 .thumbs{display:flex;gap:5px}.c2 .thumbs i{width:20px;height:26px;border-radius:3px;background:#3a3a3f}.c2 .thumbs i:first-child{background:#fff}
.c2 .shut{width:58px;height:58px;border-radius:50%;border:4px solid #fff;display:grid;place-items:center}.c2 .shut i{width:44px;height:44px;border-radius:50%;background:#fff}
.c2.on .shut i{animation:press .3s 2.9s}
.c2 .up{font:500 13px Geist,sans-serif}
.c2 .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}.c2.on .flash{animation:flash .6s 3s}
.m2{background:#f6f6f7;color:#0c0c0e}
.m2 .pgw{position:absolute;left:34px;top:84px}
.m2 .scan{position:absolute;left:28px;right:28px;height:3px;background:#ff6a3d;box-shadow:0 0 18px 6px rgba(255,106,61,.35);top:84px;opacity:0}
.m2.on .scan{animation:sweep2 1.8s .15s ease-in-out both}
@keyframes sweep2{0%{top:84px;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:357px;opacity:0}}
.m2 .pill{position:absolute;left:50%;top:400px;transform:translateX(-50%);background:#0c0c0e;color:#fff;border-radius:999px;padding:9px 16px;font:500 13px Geist,sans-serif;white-space:nowrap}
.r2{background:#f6f6f7;color:#0c0c0e}
.r2 .bar2 .nx{color:#ff6a3d}
.r2 .kk{position:absolute;left:18px;top:80px;font:500 10px 'Geist Mono',monospace;letter-spacing:.08em}
.r2 .big{position:absolute;left:18px;top:94px;font-weight:300;font-size:34px;letter-spacing:-.02em}.r2 .big small{font-size:14px;margin-left:4px}
.r2 .line{position:absolute;left:18px;right:18px;top:140px;font-size:12.5px;line-height:1.4;color:#33343c}
.r2 .panel{position:absolute;left:14px;right:14px;top:180px;height:198px;border-radius:14px;background:#ebebee;display:flex;justify-content:center;padding-top:10px;overflow:hidden}
.r2 .nt{position:absolute;left:14px;right:14px;top:388px;background:#fff;border-radius:14px;padding:12px;box-shadow:0 0 0 1px #e4e4e7}
.r2 .nt h4{margin:0 0 4px;font-size:13px;font-weight:500}.r2 .nt h4 i{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#fde3dc;color:#e0412b;font:600 10px Geist,sans-serif;margin-right:6px;font-style:normal}
.r2 .nt p{font-size:11.5px;line-height:1.4;margin:0 0 10px;color:#44444c}
.r2 .nt .bt{display:flex;gap:6px}.r2 .nt .bt span{flex:1;text-align:center;border-radius:9px;padding:8px 0;font-size:12px;font-weight:500;border:1px solid #d4d4d8}.r2 .nt .bt span.d{background:#0c0c0e;color:#fff;border-color:#0c0c0e}
.r2 .tabs{position:absolute;left:0;right:0;bottom:0;height:52px;background:#fff;border-top:1px solid #e4e4e7;display:flex;justify-content:space-around;align-items:center;font-size:10px;color:#8a8a93}
.r2 .tabs b{width:34px;height:34px;border-radius:50%;background:#ff6a3d;display:block}

/* S-C: marked page with the steps */
.withsteps{position:relative;width:600px;margin:0 auto;height:640px}
.withsteps .mp{position:absolute;left:0;top:0}
.stepcard{position:absolute;right:0;top:300px;width:300px;background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 30px 60px -24px rgba(20,30,60,.5);text-align:left}
.stepcard .k2{font:500 10px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93}
.stepcard h4{margin:6px 0 4px;font-size:16px;font-weight:500}.stepcard .w{color:#e0412b;font-size:13.5px;margin:0 0 10px}
.stepcard .bd{background:#fbfaf7;border:1px solid #ece8df;border-radius:10px;padding:10px 14px 8px;font-family:Caveat,'Bradley Hand',cursive;font-size:30px;line-height:1;color:#30313a;display:flex;gap:16px;align-items:flex-end;justify-content:center}
.stepcard .sum{display:grid;grid-template-columns:22px 26px 26px;justify-items:center;align-items:end;row-gap:2px}.stepcard .sum sup{font-size:17px;color:#e0412b;line-height:1}.stepcard .sum s{text-decoration-color:#e0412b;text-decoration-thickness:2px}
.stepcard .sum .ln{display:block;width:100%;border-top:2px solid #30313a;height:0}.stepcard .sum em{font-style:normal;color:#1f9d55}.stepcard .sum b{font-weight:400}
.stepcard ol{margin:12px 0 0;padding-left:18px;font-size:13.5px;line-height:1.45;color:#33343c}
.stepcard ol li{margin-bottom:3px}
.c-link{position:absolute;border-top:2px dashed #e0412b;transform-origin:0 0}

/* N-A: text only */
.chg{list-style:none;margin:0;padding:0}
.chg li{display:grid;grid-template-columns:150px 1fr;gap:24px;padding:24px 0;border-top:1px solid #e4e4e7;align-items:baseline}
.chg li:last-child{border-bottom:1px solid #e4e4e7}
.chg span{font:500 11px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93}
.chg b{font-weight:300;font-size:30px;line-height:1.2;letter-spacing:-.02em}
.chg-foot{margin-top:18px;font-size:15px;color:#55555e}

/* next workbook cover (Figma cover style) */
.cv{width:300px;height:388px;background:#fff;padding:22px 24px;position:relative;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 30px 60px -24px rgba(20,30,60,.5);text-align:left;color:#0c0c0e}
.cv-top{display:flex;justify-content:space-between;align-items:center}
.cv-wm{font-weight:600;font-size:12px}.cv-wm i{display:inline-block;width:3px;height:3px;background:#ff6a3d;margin-left:1px}
.cv-n{font:500 7.5px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#55555e}
.cv-mk{width:40px;height:40px;margin:34px 0 18px}
.cv-for{font-size:9px;color:#44444c;margin-bottom:8px}
.cv-t{font-weight:300;font-size:30px;line-height:1.08;letter-spacing:-.02em}.cv-t mark{background:#ffd84d;padding:0 4px}
.cv-box{margin-top:16px;border:1px solid #f0c3b2;background:#fdf1ec;border-radius:4px;padding:9px 10px}
.cv-box b{font:500 6.5px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase}
.cv-box ul{margin:6px 0 0;padding-left:12px;font-size:8.5px;line-height:1.5;color:#33343c}
.cv-box li::marker{color:#ff6a3d}

/* N-B: this workbook, then the next one */
.covers{position:relative;height:520px;display:flex;align-items:center;justify-content:center;gap:40px;background:#f4f2ee;border-radius:24px}
.covers .now{width:200px;transform:rotate(-5deg);opacity:.92;box-shadow:0 20px 40px -20px rgba(20,30,60,.45)}
.covers .arrow{font-size:28px;color:#8a8a93}
.covers .cv{transform:rotate(2.5deg)}
.covers .tag{position:absolute;bottom:22px;font:500 10.5px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93}

/* N-C: built from */
.built{position:relative;height:540px;background:#f4f2ee;border-radius:24px;overflow:hidden}
.built .src{position:absolute;left:34px;width:220px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 16px 32px -18px rgba(20,30,60,.45)}
.built .src .im{height:72px;overflow:hidden;position:relative}
.built .src .im img{width:100%;position:absolute;left:0}
.built .src .t{padding:9px 12px;font-size:12.5px;line-height:1.35}.built .src .t b{display:block;font:500 9.5px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#8a8a93;margin-bottom:2px}
.built svg{position:absolute;inset:0}
.built .cv{position:absolute;right:46px;top:76px}
"""

JS = r"""
// Leah's Day 1 warm-up: her answers in pencil, and the app's marks in red.
const COLS=[153,316,480],ROWS=[182,229,275,321,368,414,461,507,553,599];
const ANS=[[13,16,12,15,13,12,18,14,13,11],[8,9,5,13,6,8,9,7,18,9],[13,9,14,8,19,9,14,7,14,6]];
const WRONG={'1-3':7,'1-8':12};
document.querySelectorAll('.mp[data-w]').forEach(el=>{const w=+el.dataset.w,s=w/541,m=el.dataset.m;let h='';const px=v=>(v*s).toFixed(1)+'px';
  if(m!=='only')for(let c=0;c<3;c++)for(let k=0;k<10;k++){const n=c*10+k,dx=((n*37)%7-3)*1.2,rot=((n*53)%5-2)*.8;
    h+=`<i class="hw" style="left:${px(COLS[c]-19+dx)};top:${px(ROWS[k]-15)};width:${px(38)};height:${px(30)};font-size:${px(25)};transform:rotate(${rot}deg)">${ANS[c][k]}</i>`}
  if(m!=='0'){h+='<div class="ml">';for(let c=0;c<3;c++)for(let k=0;k<10;k++){const x=COLS[c],y=ROWS[k],r=WRONG[c+'-'+k];
      h+=r?`<i class="ring" style="left:${px(x-30)};top:${px(y-21)};width:${px(60)};height:${px(42)}"></i><i class="tk" style="left:${px(x+21)};top:${px(y-16)};font-size:${px(26)}">&#10007;<small style="font-size:${px(17)}">${r}</small></i>`
        :`<i class="tk" style="left:${px(x+21)};top:${px(y-15)};font-size:${px(24)}">&#10003;</i>`}
    h+=`<i class="score" style="left:${px(420)};top:${px(70)};font-size:${px(34)};padding:${px(2)} ${px(12)};border-width:${px(2.4)}">28/30</i></div>`}
  el.insertAdjacentHTML('beforeend',h)});
const SRC={};document.querySelectorAll('img[data-k]').forEach(i=>SRC[i.dataset.k]=i.src);
const META={leah:{name:'Leah',level:'Level U10',title:'Carrying and borrowing'},mateo:{name:'Mateo',level:'Level U19',title:'Factors and multiples'}};
const SPREADS=['Cover','Plan · Day 1, page 1','Day 1, pages 2 and 3','Day 1, pages 4 and 5','Day 1, pages 6 and 7','Day 1, page 8'];
const W=440;
class Reader{
  constructor(el,poses){this.el=el;this.body=el.querySelector('.rd-body');this.poses=poses;this.cap=el.querySelector('.rd-cap');
    this.pv=el.querySelector('.rd-nav.p');this.nx=el.querySelector('.rd-nav.n');
    this.nx.onclick=e=>{e.stopPropagation();this.next()};this.pv.onclick=e=>{e.stopPropagation();this.prev()};
    this.body.addEventListener('click',e=>{const b=this.body.getBoundingClientRect();(e.clientX>b.left+b.width/2)?this.next():this.prev()});
    this.load(el.dataset.book);}
  load(key){this.key=key;const m=META[key];this.body.querySelectorAll('.lf').forEach(x=>x.remove());
    const p=[...Array(10).keys()].map(i=>SRC[key+'-'+i]);this.leaves=[];
    for(let i=0;i<5;i++){const fr=p[2*i],bk=p[2*i+1];const lf=document.createElement('div');lf.className='lf'+(i===0?' cover':'');lf.style.setProperty('--z',(-i)+'px');
      lf.innerHTML=`<div class="hf in"><div class="fc fr" style="background-image:url('${fr}');background-position:0 0"></div><div class="fc bk" style="background-image:url('${bk}');background-position:-${W/2}px 0"></div><div class="hf out"><div class="fc fr" style="background-image:url('${fr}');background-position:-${W/2}px 0"></div><div class="fc bk" style="background-image:url('${bk}');background-position:0 0"></div></div></div>`;
      lf.addEventListener('animationend',e=>{if(e.target===lf&&e.animationName==='lfturn')lf.classList.remove('fwd','bwd')});
      this.body.appendChild(lf);this.leaves.push(lf)}
    this.body.querySelector('.rd-sp b').textContent=`${m.name.toUpperCase()} · ${m.level.toUpperCase()} · ${m.title.toUpperCase()}`;
    this.body.querySelector('.rd-end').textContent=`${m.name}'s workbook goes on: Days 2 to 10.`;
    // Open on load: the cover is already turned, the plan and Day 1 page 1 show.
    this.el.classList.add('noanim');this.leaves[0].classList.add('flipped');this.f=1;this.el.classList.add('is-open');this.body.style.transform=this.poses.open;
    void this.el.offsetWidth;this.el.classList.remove('noanim');this.label()}
  label(){const m=META[this.key];this.cap.textContent=`${m.name} · ${m.level} · ${SPREADS[this.f]}`;this.nx.disabled=this.f>=5;this.pv.disabled=this.f<=1}
  turn(i,dir){const lf=this.leaves[i];if(lf.classList.contains('fwd')||lf.classList.contains('bwd'))return false;
    lf.classList.toggle('flipped',dir>0);lf.classList.add(dir>0?'fwd':'bwd');return true}
  next(){if(this.f>=5)return;if(this.turn(this.f,1)){this.f++;this.label()}}
  prev(){if(this.f<=1)return;if(this.turn(this.f-1,-1)){this.f--;this.label()}}
}
document.querySelectorAll('.rd.open').forEach(el=>{const R=new Reader(el,{open:'translateX(0px) scale(1)'});
  const band=el.closest('section');band.querySelectorAll('.lvl button').forEach(b=>b.onclick=()=>{band.querySelectorAll('.lvl button').forEach(x=>x.classList.toggle('on',x===b));
    R.body.classList.add('hid');setTimeout(()=>{R.load(b.dataset.book);R.body.classList.remove('hid')},450)});
  band.querySelectorAll('.bandt button').forEach(b=>b.onclick=()=>{band.querySelectorAll('.bandt button').forEach(x=>x.classList.toggle('on',x===b));band.classList.toggle('paper',b.dataset.v==='paper');band.classList.toggle('dark',b.dataset.v!=='paper')})});
// Option switches (mockup only).
document.querySelectorAll('.optbar[data-for]').forEach(bar=>bar.querySelectorAll('button').forEach(b=>b.onclick=()=>{bar.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll(`.opt[data-g="${bar.dataset.for}"]`).forEach(o=>o.classList.toggle('on',o.dataset.v===b.dataset.v));
  if(bar.dataset.for==='scan'&&b.dataset.v==='a')hint()}));
// S-A: drag the line to compare.
const ba=document.querySelector('.ba');
function hint(){if(!ba)return;ba.style.setProperty('--x','100%');void ba.offsetWidth;ba.classList.add('hint');setTimeout(()=>ba.style.setProperty('--x','46%'),60);setTimeout(()=>ba.classList.remove('hint'),1700)}
if(ba){let drag=false;const set=e=>{const b=ba.getBoundingClientRect();const x=Math.max(0,Math.min(1,(e.clientX-b.left)/b.width));ba.style.setProperty('--x',(x*100).toFixed(1)+'%')};
  ba.addEventListener('pointerdown',e=>{drag=true;ba.setPointerCapture(e.pointerId);set(e)});ba.addEventListener('pointermove',e=>{if(drag)set(e)});ba.addEventListener('pointerup',()=>drag=false);setTimeout(hint,700)}
// S-B: the phone screen in the photo plays camera, marking, marked.
document.querySelectorAll('.scene .ui').forEach(ui=>{const sc=[...ui.querySelectorAll('.sc')],D=[3500,2100,4600];let i=0;
  const show=n=>{i=n;sc.forEach((s,k)=>{s.classList.remove('on');void s.offsetWidth;if(k===n)s.classList.add('on')});setTimeout(()=>show((i+1)%sc.length),D[n])};show(0)});
"""


def band():
    lvl = '<div class="lvl" style="margin-top:6px"><button class="on" data-book="leah">Leah &middot; Level U10</button><button data-book="mateo">Mateo &middot; Level U19</button></div>'
    bandt = '<div class="optbar bandt"><button class="on" data-v="dark">Band: dark</button><button data-v="paper">Band: paper</button></div>'
    k, h, p, _ = r.S["wb"]
    return f"""<section class="shelfband dark">{bandt}<span class="k">{k}</span><h2>{h}</h2><p class="lead">{p}</p>
<div style="position:relative;margin-top:10px">{r.reader("rdW", "leah", 680, "open")}</div>{lvl}</section>"""


def scan_options():
    k, h, p, _ = r.S["app"]
    bar = '<div class="optbar" data-for="scan"><button class="on" data-v="a">S-A &middot; Before and after</button><button data-v="b">S-B &middot; Photo</button><button data-v="c">S-C &middot; With the steps</button></div>'
    s_a = f"""<div class="opt on" data-g="scan" data-v="a"><div class="ba" style="margin-top:44px"><span class="lab l">Leah's page &middot; drag the line</span><span class="lab r">Marked in the Unica app</span>{mpage(500, False)}
{mpage(500, cls="over", style="background:transparent;box-shadow:none;position:absolute", only_marks=True)}<div class="handle"><i>&#8596;</i></div></div>
<div style="position:relative;height:0"><div class="appnote" style="left:-56px;top:-96px"><span class="k2">Unica app &middot; Day 1, page 1</span><b>28 of 30<small>right</small></b><p>Questions 14 and 19 are the same slip: Leah took the small number from the big one instead of trading a ten.</p><span>See the steps &rarr;</span></div></div><div style="height:90px"></div></div>"""
    cam = f"""<div class="sc c2"><div class="bar1"><span>9:41</span><span>&#9679;&#9679;&#9679;</span></div><div class="bar2"><span>&#10005;</span><span>Day 1 &middot; page 1 of 8</span><span>&#9889;</span></div>
<div class="vf"><div class="pg">{mpage(196, False)}</div><i class="br a"></i><i class="br b"></i><i class="br c"></i><i class="br d"></i></div>
<div class="pill"><span class="p1">Hold still. Almost straight&hellip;</span><span class="p2">Got it</span></div>
<div class="bot"><div class="thumbs"><i></i><i></i><i></i><i></i></div><div class="shut"><i></i></div><span class="up">Upload</span></div><div class="flash"></div></div>"""
    mkg = f"""<div class="sc m2"><div class="bar1"><span>9:41</span><span>&#9679;&#9679;&#9679;</span></div><div class="bar2" style="justify-content:center"><span>Day 1 &middot; page 1</span></div>
<div class="pgw">{mpage(214, False)}</div><div class="scan"></div><div class="pill">Marking page 1&hellip;</div></div>"""
    res = f"""<div class="sc r2"><div class="bar1"><span>9:41</span><span>&#9679;&#9679;&#9679;</span></div><div class="bar2"><span>&lsaquo;</span><span>Day 1 &middot; page 1</span><span class="nx">Next</span></div>
<div class="kk">MARKED</div><div class="big">28 of 30<small>right</small></div><div class="line">Two slips, both the same: taking the small number from the big one.</div>
<div class="panel">{mpage(146, True)}</div>
<div class="nt"><h4><i>14</i>16 &minus; 9 &middot; Leah wrote 13</h4><p>She took 6 from 9 instead of trading a ten. The right answer is 7.</p><div class="bt"><span>See the steps</span><span class="d">Ask Maya</span></div></div></div>"""
    s_b = f"""<div class="opt" data-g="scan" data-v="b"><div class="scene"><img class="ph0" src="{OWN}scan-photo.jpg" alt="A parent scans Leah's workbook page with the Unica app">
<div class="scr2"><div class="ui">{cam}{mkg}{res}</div></div></div></div>"""
    s_c = f"""<div class="opt" data-g="scan" data-v="c"><div class="withsteps">{mpage(420, True)}
<div class="stepcard"><span class="k2">Unica app &middot; the steps</span><h4>Question 19 &middot; 20 &minus; 8</h4><p class="w">Leah wrote 18.</p>
<div class="bd"><div class="sum"><i></i><sup>1</sup><sup>10</sup><i></i><s>2</s><s>0</s><b>&minus;</b><i></i><span>8</span><i class="ln"></i><i class="ln"></i><i class="ln"></i><i></i><em>1</em><em>2</em></div></div>
<ol><li>There are 0 ones. You cannot take 8 from 0.</li><li>Trade 1 ten for 10 ones: now 1 ten and 10 ones.</li><li>10 &minus; 8 = 2 ones. 1 ten and 2 ones is 12.</li></ol></div></div></div>"""
    return f"""<section class="row opts">{r.st("app")}<div>{bar}{s_a}{s_b}{s_c}</div></section>"""


def next_options():
    k, h, p, _ = r.S["nx"]
    bar = '<div class="optbar" data-for="next"><button class="on" data-v="a">N-A &middot; Text only</button><button data-v="b">N-B &middot; This book, then the next</button><button data-v="c">N-C &middot; Built from</button></div>'
    lines = [("More practice", "Borrowing across a zero, like 20 &minus; 8 and 300 &minus; 128."),
             ("Less practice", "Carrying. Leah has it now."),
             ("A step ahead", "Subtracting 3-digit numbers in word problems.")]
    n_a = '<div class="opt on" data-g="next" data-v="a"><ul class="chg">' + "".join(f"<li><span>{a}</span><b>{b}</b></li>" for a, b in lines) + \
        '</ul><p class="chg-foot">It arrives before this workbook runs out. Pause or skip one in the app.</p></div>'
    n_b = f"""<div class="opt" data-g="next" data-v="b"><div class="covers"><img class="now" src="{A}wb/leah-01-cover.jpg" alt="Leah's workbook now"><span class="arrow">&rarr;</span>{next_cover(1.0)}
<span class="tag" style="left:110px">This workbook</span><span class="tag" style="right:150px">Next workbook</span></div></div>"""
    srcs = [("From her scans", "28 of 30 right. Two slips with the same cause.", f'<div style="position:absolute;left:0;top:-82px;width:220px">{mpage(220, True)}</div>', 40),
            ("From her session with Maya", "A stuck question, worked through on the whiteboard.", f'<img src="{A}maya-poster.jpg" style="top:-34px;width:180%;left:-62%">', 200),
            ("From the assessment", "Working level and the skills to work on.", f'<img src="{A}report-level.png" style="top:-6px">', 360)]
    cards = "".join(f'<div class="src" style="top:{t}px"><div class="im">{im}</div><div class="t"><b>{a}</b>{b}</div></div>' for a, b, im, t in srcs)
    svg = '<svg viewBox="0 0 632 540" preserveAspectRatio="none"><g fill="none" stroke="#c9c3b8" stroke-width="2" stroke-dasharray="5 6">' + \
        "".join(f'<path d="M254 {y} C 300 {y}, 300 270, 330 270"/>' for y in (108, 268, 428)) + "</g></svg>"
    n_c = f"""<div class="opt" data-g="next" data-v="c"><div class="built">{svg}{cards}{next_cover(0.95)}</div></div>"""
    return f"""<section class="row opts">{r.st("nx")}<div>{bar}{n_a}{n_b}{n_c}</div></section>"""


def page_b2():
    body = f"""<section class="row">{r.st("as")}{r.assess()}</section>{band()}{r.maya()}{scan_options()}
<section class="row rev">{r.st("db")}{r.dash()}</section>{next_options()}"""
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>r160 - B with new scan and next workbook</title><style>{CSS}</style></head>
<body><div class="scroll"><div class="mock B">{r.NAV}{r.HERO}{body}{r.closing()}</div></div>{r.preload()}<script>{JS}</script></body></html>"""


def prune(css, html):
    import re
    used = set(re.findall(r'class="([^"]+)"', html))
    used = {c for group in used for c in group.split()} | set("hw ml tk ring score lf hf in out fc fr bk cover flipped fwd bwd is-open hid noanim on paper dark".split())
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        sel = css[i:j].strip()
        depth, k = 1, j + 1
        while depth and k < n:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        block = css[i:k].strip()
        if sel.startswith("@"):
            out.append(block)
        else:
            parts = [p for p in sel.split(",")]
            keep = [p for p in parts if all(c in used for c in re.findall(r"\.([A-Za-z][\w-]*)", p))]
            if keep:
                out.append(",".join(keep) + css[j:k])
        i = k
    return "\n".join(out)


def parts():
    body = f"""{band()}{scan_options()}{next_options()}"""
    css = CSS.replace("@media (max-width:1100px){.board .scroll{height:1940px}.scroll{height:1990px;overflow-y:auto;overflow-x:hidden;border-radius:14px}.mock{zoom:.6}}", "@media (max-width:1100px){.mock{zoom:.6}}")
    css = prune(css, body + "<div class=\"mock B parts\">")
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>r160 parts</title><style>{css}body.parts{{margin:0}}.parts .B .shelfband{{margin-top:0}}.parts .mock{{border-radius:14px;padding-bottom:60px}}</style></head>
<body class="parts"><div class="mock B">{body}</div>{r.preload()}<script>{JS}</script></body></html>"""


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("b2.html", page_b2), ("parts.html", parts)):
        with open(os.path.join(OUT, name), "w") as f:
            f.write(fn())
    print("wrote", OUT)
