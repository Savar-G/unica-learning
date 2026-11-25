import { LETTERED_CSS } from "@/lib/workbook-lettered-choices";
// The workbook templates' style sheet (see src/lib/workbook-template.ts). Split out so the template keeps to its line limit.

/** Writing lines: the first at least 36 px under its prompt, the next at least 34 px under it (DESIGN.md section 4). */
export const LINE_FIRST = 36;
export const LINE_NEXT = 34;
/** The smallest work box: the inline Mixed set box. */
export const WORK_MIN = 64;

export const CSS = `
*{box-sizing:border-box}
.pg{position:absolute;inset:0;font-family:"Unica Sans",Helvetica,Arial,sans-serif;color:#0C0C0E;font-size:var(--body);line-height:1.4}
.pg.mid{--title:30px;--body:15px;--small:13px;--fact:17px;--math:15px;--col:22px;--num:14px;--story:15px;--box:48px}
.pg.early{--title:36px;--body:20px;--small:18px;--fact:30px;--math:20px;--col:28px;--num:18px;--story:20px;--box:56px}
.pg.parent{--title:36px;--body:20px;--small:18px;--fact:32px;--math:22px;--col:30px;--num:18px;--story:20px;--box:56px}
.mono{font-family:"Unica Mono",ui-monospace,Menlo,monospace}
.scan{position:absolute;width:18px;height:18px;border:0 solid #111111}
.scan.tl{left:22px;top:22px;border-left-width:3px;border-top-width:3px}
.scan.tr{right:22px;top:22px;border-right-width:3px;border-top-width:3px}
.scan.bl{left:22px;bottom:22px;border-left-width:3px;border-bottom-width:3px}
.scan.br{right:22px;bottom:22px;border-right-width:3px;border-bottom-width:3px}
[data-spine="left"] :is(.scan.tl,.scan.bl){left:0.5in}
[data-spine="right"] :is(.scan.tr,.scan.br){right:0.5in}
.frame{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;gap:20px}
.frame>*{flex-shrink:0}
.hd{display:flex;flex-direction:column;gap:8px}
.pg.mid .hd{min-height:126px}
.nd{margin-bottom:18px;display:flex;align-items:flex-end;gap:8px;height:18px;font-size:13px;line-height:18px}
.nd .r1{display:block;width:483px;border-bottom:1px solid #0C0C0E;height:14px}
.nd .r2{display:block;flex:1;border-bottom:1px solid #0C0C0E;height:14px}
.dl{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;max-height:calc(var(--small)*2.4);overflow:hidden}
.tt{margin:2px 0 0;font-weight:300;font-size:var(--title);line-height:1.25;padding-bottom:2px;white-space:nowrap;overflow:hidden}
.st{white-space:nowrap;margin:0;font-size:var(--body);color:#44444C;max-height:calc(var(--body)*1.4);overflow:hidden}
/* The work line: its own line under the instruction, bold on the cover's yellow highlight (Savar, 2026-11-09). */
.sw{white-space:nowrap;margin:0;font-size:var(--body);line-height:1.25;color:#0C0C0E;max-height:calc(var(--body)*1.25);overflow:hidden}
.sw b{display:inline-block;max-width:100%;overflow:hidden;vertical-align:top;font-weight:600;background:#FFD23F;padding:0 6px}
/* A header with the work line keeps the page's content room: its lines sit 2 px closer, the work line 1.25 high. */
.hd:has(.sw){gap:6px}
.pg.consistent .hd:has(.sw){max-height:none}
.gu{margin:0;font-size:var(--body);color:#0C0C0E;background:#F4F4F5;border-radius:8px;padding:6px 12px;overflow:hidden}
.gu b{font-weight:500}
.ct{flex:1 1 auto;flex-shrink:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:12px}
.ct>*{flex-shrink:0}
.blk{display:flex;flex:1 0 auto;flex-direction:column;gap:8px}
.blk.grow{flex-grow:1}
.blk.optional-block{border:1px solid #5A4300;border-radius:2px;padding-left:4px}
.ft{position:absolute;left:64px;top:950px;width:688px;height:58px;display:flex;align-items:center;gap:12px}
.ft [data-measure="qr"]{width:58px;height:58px;flex:none}
.ft svg{width:58px;height:58px;display:block}
.ft .ids{display:flex;flex-direction:column;gap:3px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:11px;line-height:1.2}
.ft .pn{color:#44444C}
.wm{margin-left:auto;font-weight:500;font-size:14px;display:flex;align-items:flex-end;gap:2px}
.wm i{display:block;width:4px;height:4px;background:#FF6A3D;margin-bottom:3px}
/* families: day label, chip, panels */
.f-wu .dl{color:#064E32}.f-pr .dl{color:#0B7A4F}.f-ni .dl{color:#2453D4}.f-wp .dl{color:#C2410C}.f-rv .dl{color:#8A6500}.f-ch .dl{color:#2B2622}.f-lt .dl{color:#0C0C0E}
.chiprow{display:flex;align-items:center;gap:10px}
.chiprow .side{flex:1 1 auto;min-width:0}
.chip{flex:none;display:inline-flex;align-items:center;gap:8px;height:28px;padding:6px 10px;border-radius:999px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.pg.early .chip,.pg.parent .chip{height:34px}
.chip svg{width:16px;height:16px;flex:none}
.chip.c-wu,.chip.c-pr{background:#E3F5EC;color:#064E32}
.chip.c-ni{background:#EAF0FF;color:#1B3FA6}
.chip.c-wp{background:#FFEDE5;color:#7C2D12}
.chip.c-mx{background:#FFD23F;color:#0C0C0E}
.chip.c-rv{background:#FFF6D6;color:#5A4300}
.chip.c-ch{background:#FFF0B8;color:#0C0C0E;border:1.5px solid #2B2622;height:31px}
.chip.c-fx{background:#FDECEC;color:#B42318}
.chip.c-lt{background:#F4F4F5;color:#0C0C0E}
.pg .chip.c-extra-inline{height:auto;padding:0 8px;vertical-align:top;margin-left:10px}
.side{font-size:var(--small);color:#44444C}
.lab{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;color:#44444C}
.blue{color:#2453D4}
.n{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--num);line-height:1.2;min-width:22px;flex:none}
.qt{font-size:var(--body)}
.qm{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math);white-space:nowrap}
/* answer regions */
.ab{display:inline-block;height:var(--box);min-width:var(--box);border:1.2px solid #0C0C0E;border-radius:6px;background:#fff;flex:none;vertical-align:middle}
.rg{display:inline-flex;align-items:center;gap:8px;flex:0 1 auto;flex-wrap:wrap;max-width:100%}
.rg .rl{font-size:var(--small);color:#44444C}
.rg .rl.box{font-family:"Unica Mono",ui-monospace,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase}
.unit{font-size:var(--body)}
.strip{display:inline-flex;align-items:center;gap:28px;min-height:42px;padding:8px 14px;background:#F4F4F5;border-radius:8px;flex:0 1 auto;flex-wrap:wrap;max-width:100%}
.pg.early .strip,.pg.parent .strip{min-height:56px}
.strip .ch{display:inline-flex;align-items:center;gap:8px;font-size:16px}
.pg.early .strip .ch,.pg.parent .strip .ch{font-size:var(--body)}
.tb{display:inline-block;width:20px;height:20px;border:2px solid #0C0C0E;border-radius:3px;background:#fff}
.pg.early .tb,.pg.parent .tb{width:26px;height:26px}
.t1{display:inline-flex;align-items:center;gap:6px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;color:#44444C;flex:none}
.pg.early .t1,.pg.parent .t1{font-size:var(--small)}
.t1 i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1.5px solid #0C0C0E;border-radius:2px;font-style:normal;font-size:12px;color:#0C0C0E;line-height:1}
.circ{display:inline-flex;align-items:center;gap:36px;min-height:56px;padding:6px 18px;flex:none}
.circ .co{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--fact)}
.circ.words{flex-direction:column;align-items:flex-start;gap:4px;min-height:48px;min-width:56px;padding:2px 8px}
.circ.words.likelihood{flex-direction:row;gap:16px}
.circ.words .co{font-family:"Unica Sans",Helvetica,Arial,sans-serif;font-size:var(--body);line-height:1.3;white-space:nowrap}
.wb{display:block;border:0;border-radius:0;padding:0;background:transparent;flex:1 1 auto;min-width:120px}
.wb .lab{font-weight:400;color:#44444C}
.ln{display:block;width:100%}
.ln .lp{font-size:var(--body);height:calc(var(--body)*1.4)}
.ln i{display:block;border-bottom:1px solid #9A9AA2;height:${LINE_NEXT}px}
.ln i:first-of-type{height:${LINE_FIRST}px}
.pic{display:block;flex:none}
.seq{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px 8px}
.obx{display:inline-flex;align-items:center;flex-wrap:nowrap;gap:8px;flex:none}
.picr{display:inline-block;flex:none}
.nl{position:relative;flex:none}
.nlv{position:absolute;transform:translateX(-50%);font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:14px;line-height:1}
.draw{display:block;width:100%;height:140px;border:1px dashed #CCCCD1;border-radius:8px}
/* items */
.q{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .qb{flex:1 1 0;min-width:min-content}
.q .rgs{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .full{flex-basis:100%;display:flex;gap:12px}
/* An answer box on its own row (a long word answer) sits at the right, in line with the page's other boxes (#1212). */
.q .full>.rg{margin-left:auto}
/* A comparison: the answer box between its two numbers. */
.cmp{display:inline-flex;align-items:flex-start;gap:10px;height:1.4em;vertical-align:top;white-space:nowrap}
.pg{--cmp:var(--box)}
.pg.consistent .q .cmp .ab{height:var(--cmp);min-width:48px;width:48px}
/* The row reserves the box's height under its one line of text, so the next row starts below the box. */
.q.cmp-item{padding-bottom:calc(var(--cmp) - 1.4em + 6px)}
.work-space{width:100%;background:#fff;flex:1 0 auto}
.list{display:flex;flex:1;flex-direction:column;justify-content:space-evenly;gap:10px}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:12px;align-items:stretch;flex:1;grid-auto-rows:1fr}
.two>.q{align-content:start;align-items:start}.two>.q>.n{padding-top:12px}.two>.q>.qb{padding-top:8px}
.facts{flex:1;align-content:space-between;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:24px;row-gap:12px}
.pg.early .facts,.pg.parent .facts{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;row-gap:22px}
.facts .q{gap:10px;flex-wrap:nowrap}
.facts .gn{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--small);color:#44444C;min-width:22px;flex:none}
.facts .qm{font-size:var(--fact);flex:1 1 auto;white-space:nowrap}
.cols{flex:1;align-content:space-between;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px}
.col{display:flex;gap:10px;align-items:flex-start}
.col .sum{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--col);line-height:1.12;text-align:right;min-width:96px;display:flex;flex-direction:column;align-items:flex-end}
.col .sum .rule{width:100%;border-top:2px solid #0C0C0E;margin-top:3px;padding-top:4px;display:flex;justify-content:flex-end}
.col .sum .op{margin-right:auto;padding-right:8px}
.col .sum .row{display:flex;width:100%;justify-content:flex-end}
.card{border:1px solid #D4D4DA;border-radius:10px;padding:16px;background:#fff}
.badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#F1F1F4;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;flex:none}
.pg.early .badge,.pg.parent .badge{width:30px;height:30px;font-size:var(--small)}
.panel{border-radius:12px;padding:16px 22px}
.p-ni{background:#EAF0FF}.p-ni .lab{color:#1B3FA6}
.p-pr{background:#E3F5EC}.p-pr .lab{color:#064E32}
.p-rv{background:#FFF6D6;border-radius:16px}.p-rv .lab{color:#5A4300}
.p-fx{background:#FDECEC}.p-hd{background:#F1F1F4;border-radius:10px}
.wo{font-size:.85em;color:#5F5F6B}.note-mm{font-size:.85em;color:#5F5F6B;margin-top:4px}
.outl{border:1.5px solid #3366F0;border-radius:12px;padding:12px 20px 12px;background:#fff;display:flex;flex-direction:column;gap:8px}
.outl .lab{color:#1B3FA6}
.wk{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math);line-height:1.5}
.ways{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ways .in{background:#fff;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.intro{display:flex;flex-direction:column;gap:4px;padding:8px 12px;margin-bottom:6px}.intro .wk{font-size:calc(var(--math)*.8);line-height:1.35}.intro .ways{gap:10px}.intro .ways .in{padding:6px 10px;gap:2px}
.fig2{display:flex;gap:26px;align-items:flex-start}
.fig2 .why{flex:1 1 0;display:flex;flex-direction:column;gap:6px}
.inner{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:10px}
.inner .card{border:none;border-radius:12px;display:flex;flex-direction:column;gap:10px;padding:12px 14px}
.story{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1.5px solid #FF6A3D}
.story .sn{font-weight:300;font-size:26px;line-height:1;min-width:26px}
.story .head{display:flex;gap:12px;align-items:flex-start}
.story .qt{font-size:16px}
.pg.early .story .qt,.pg.parent .story .qt{font-size:var(--story)}
.story .act{display:flex;gap:16px;align-items:flex-end}
.story .act .wb{height:110px}
.mxs{display:flex;flex-direction:column;gap:6px}
.mx{display:flex;flex-direction:column;gap:2px;padding-top:6px;border-top:1px solid #D4D4DA}
.mx .qt{font-size:14px;line-height:1.3}
.mx .strip{height:40px;gap:20px}
.pg.early .mx .qt{font-size:var(--story)}
.mx .stp{display:flex;align-items:center;gap:12px}
.mx .sb{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#0C0C0E;color:#fff;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;flex:none}
.mx .sl{font-size:var(--body);min-width:150px}
.mx .wb{height:64px;display:flex;align-items:center}
.chs{display:flex;flex-direction:column;gap:16px;flex:1 1 auto}
.chs>*{flex:1 1 0}
.chs.side2{flex-direction:row}
.chs.side2>*{flex:1 1 0}
.chc{background:#F4F2F0;border:1.5px solid #2B2622;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.chc .top{display:flex;gap:16px;align-items:flex-start}
.chc .top .qb{flex:1 1 0}
.chc .wb{display:block;flex:1 1 auto;min-height:120px}
/* A Challenge card: its choices at the right of the question, its work space with the answer box at the bottom right (#1212). */
.chc .top .rgs{flex:none;display:flex;align-items:flex-start;gap:12px}
.chc .act{display:flex;gap:16px;align-items:flex-end;flex:1 1 auto}
.chc .act>:is(.rg,.circ,.seq,.obx){margin-left:auto}
.chc .act>.wb{margin-left:0}
.fill{flex:1 1 auto;display:grid;gap:12px 16px;grid-auto-rows:minmax(0,1fr)}
.tc{border:1px solid #D4D4DA;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-height:0}
.tc .wb{display:block;flex:1 1 auto;min-height:${WORK_MIN}px}
/* A test card with work space: the answer box at the bottom right of it, like a Challenge card (#1212). */
.tc .act{display:flex;gap:16px;align-items:flex-end;flex:1 1 auto;min-height:0}
.tc .act>:is(.wb,.work-space){width:auto;flex:1 1 auto;align-self:stretch}
.tc .act>:is(.rg,.seq,.obx){margin-left:auto}
/* In a half-width card a long word answer's box gives way (down to the minimum box size) before the work space does. */
.tc .act>.rg{min-width:0;flex:0 1 auto}
.tc .act .ab{flex:0 1 auto}
.pcards.fill{grid-template-columns:repeat(2,minmax(0,1fr))}
.pcards.fill .pcard .pb{flex:1 1 auto;align-items:center}
.tw{display:flex;flex-direction:column;gap:10px}
.tw .ways2{display:flex;gap:14px;align-items:flex-end}
.tw .ways2 .wb{height:84px}
.info{display:flex;gap:12px}
.info .ic{flex:1 1 0;background:#FFEDE5;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
.info .ic .lab{color:#7A2E0E}
.info .ic .v{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math)}
.parts{display:flex;flex-direction:column;gap:10px}
.parts .rg{width:100%;justify-content:space-between}
.pcards{flex:1;grid-auto-rows:1fr;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pcard{border:1px solid #D4D4DA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.pcard .pb{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.pcard .pb>.pic{max-width:60%;height:auto}
.pcard .draw{height:56px;width:150px}
.pcard .ln{min-width:160px}
.pcard .head{display:flex;gap:10px;align-items:flex-start}
.pcard .ico{width:28px;height:28px;flex:none}
/* cover */
.cv{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;overflow:hidden}
.cv .top{display:flex;justify-content:space-between;align-items:center}
.cv .top .wm{margin:0;font-size:22px}
.cv .top .wm i{width:6px;height:6px;margin-bottom:5px}
.cv .wn{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.04em;color:#44444C}
.mk{display:grid;grid-template-columns:repeat(3,36px);margin-top:56px}
.mk i{display:block;width:36px;height:36px;border:1.2px solid #0C0C0E;margin:0 -1.2px -1.2px 0;background:#fff}
.mk .y{background:#FFD23F}.mk .b{background:#3366F0}.mk .o{background:#FF6A3D}.mk .g{background:#16A06A}.mk .k{background:#B8B3AA}
.cv .for{margin-top:32px;font-weight:500;font-size:22px;line-height:1.4;color:#44444C;max-height:62px;overflow:hidden}
.cv h1{margin:20px 0 0;font-weight:300;font-size:66px;line-height:1.18;letter-spacing:-.03em;height:164px;overflow:hidden}
.cv h1 .hl{display:inline-block;background:#FFD23F;padding:0 10px;margin-left:-10px;line-height:1.12}
/* The two cover cards (variant D): identical white cards with a dark outline, the sentence and the plan's topics. */
.cv .card{margin-top:20px;background:#fff;border:1.5px solid #0C0C0E;border-radius:10px;padding:20px 24px;display:flex;flex-direction:column;gap:12px}
.cv .card .lab{font-size:12px;font-weight:500;letter-spacing:.04em;color:#44444C;text-transform:none}
.made{max-height:268px;overflow:hidden}
.cv .made p{margin:0;font-size:17px;line-height:1.4}
.cv .cover-plan ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.cv .cover-plan li{display:grid;grid-template-columns:5px 1fr;column-gap:12px;align-items:start;font-size:17px;line-height:1.4}
.cv .cover-plan li i{display:block;width:5px;height:5px;background:#0C0C0E;margin-top:calc(17px*1.4/2 - 2.5px)}
.cv .pl{margin:24px 0 0;font-size:15px;height:42px;overflow:hidden}
.cv .nx{margin:auto 0 0;font-size:15px;color:#44444C;height:21px;overflow:hidden;white-space:nowrap}
/* how + plan */
.hp{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;overflow:hidden}
.hp .top{display:flex;justify-content:space-between;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:12px;letter-spacing:.04em}
.hp table{margin-top:18px;width:100%;border-collapse:collapse;table-layout:fixed}
.hp th{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:11px;letter-spacing:.04em;color:#44444C;text-align:left;padding:0 0 8px;border-bottom:1px solid #0C0C0E}
.hp td{height:54px;border-bottom:1px solid #E0E0E5;padding:0;vertical-align:middle}
.hp .d{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:16px;width:96px}
.hp .tp{display:block;height:50px;overflow:hidden;padding-top:4px}
.hp .tp b{display:block;font-weight:500;font-size:18px;line-height:1.3;white-space:nowrap}
.hp .tp .t2{display:block;font-size:14px;color:#44444C;white-space:nowrap}
.hp .pp{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:16px;width:96px}
.hp .plan-time{display:block;font-size:13px;line-height:18px;color:#44444C}
.hp .dn{width:56px;text-align:right}
.hp .how{margin-top:auto;border-top:1px solid #0C0C0E;padding-top:14px;display:flex;flex-direction:column;gap:12px}
.hp .hw{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr);gap:16px}
.hp .hw p{margin:8px 0 0;font-size:14px;overflow-wrap:normal}
.hp .scan-address{display:inline-block;white-space:nowrap}
.hp .chip{font-size:13px}
/* back cover */
.bk{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;align-items:flex-start;overflow:hidden}
.bk h2{margin:32px 0 0;font-weight:300;font-size:44px;line-height:1.18}
.bk p{margin:12px 0 0;font-size:17px;color:#44444C}
.map{margin-top:36px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px 40px}
.map .lv{display:flex;flex-direction:column;align-items:center;gap:6px}
.map .lv i{display:block;width:56px;height:56px;border:1.2px solid #0C0C0E;background:#fff}
.map .lv .ll{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:14px}
.map .lv.now i{border-width:3px}
.map .lv.now .ll{font-weight:500}
.bk .key{margin-top:32px;display:flex;gap:18px;align-items:center;font-size:15px}
.bk .key i{display:inline-block;width:20px;height:20px;border:1.2px solid #0C0C0E;vertical-align:middle;margin-right:6px}

/* The measured page plan uses the adopted layout. Saved legacy pages keep their layout. */
.pg.consistent .frame{height:856px;gap:8px}
.pg.consistent .hd{max-height:150px}
.pg.consistent.mid .hd{min-height:112px}
.pg.consistent .nd{margin-bottom:10px}
.pg.consistent .ct{gap:calc(8px + var(--extra-gap,0px))}
.pg.consistent .blk{flex:0 0 auto;gap:calc(6px + var(--extra-gap,0px))}
.pg.consistent .blk.grow{flex:1 0 auto}
.pg.consistent .ft{top:939px;height:48px}
.pg.consistent [data-measure^="review-"]{margin:0}
/* (Each block and each of its grids grows by its rows, so every row of the page gets the same share: the full U4 books
   of seeds ed6ecc9f and 19bacf2a, whose Practice 2 grew 3 rows and 2 rows by the same amount.) */
.pg.consistent.stretch .ct>.blk:has(>:is(.two,.cols,.list,.facts,.pcards,.mxs)){flex:var(--rows,1) 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch .ct>.blk>:is(.two,.cols,.facts,.pcards,.mxs){flex:var(--rows,1) 0 auto;grid-auto-rows:auto;align-content:stretch}
.pg.consistent.stretch .ct>.blk>.list{flex:var(--rows,1) 0 auto}.pg.consistent.stretch .ct>.blk>.list>*{flex:1 0 auto}
.pg.consistent.stretch .ct>.blk[data-slot="now-you"]{flex:var(--rows,1) 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch [data-slot="now-you"]>.outl{flex:1 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch [data-slot="now-you"]>.outl>.two{flex:1 0 auto;align-content:stretch}
.pg.consistent .list{flex:none;justify-content:flex-start;gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .two{flex:none;grid-auto-rows:auto;row-gap:calc(12px + var(--extra-gap,0px))}
/* U4 to U9 (the large type): a tighter row gap, boxes the same size; a true or false pair one box high (Savar,
   2026-11-04: 8 practice questions on a U4 page). */
.pg.consistent.early .two,.pg.consistent.early .cols{row-gap:calc(6px + var(--extra-gap,0px))}
.pg.early .circ.words:not(.likelihood) .co{min-height:22px}
.pg.consistent .facts{flex:none;align-content:start;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent .pcards{flex:none;grid-auto-rows:auto;column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .cols{flex:none;align-content:start;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .cols .ab{height:48px}
.pg.consistent .places-item .rgs{display:grid;grid-template-columns:repeat(var(--places),minmax(0,1fr));gap:8px;flex-basis:100%;width:100%;margin-left:0;align-items:stretch}
.pg.consistent .places-item .rg{display:flex;flex-direction:column;gap:6px}
.pg.consistent .places-wide .rg{justify-content:flex-end}
.pg.consistent .places-item .rl{font-size:var(--small);white-space:normal;text-align:center}
.pg.consistent .col .sum{margin-left:auto}
.pg.consistent.mid .col .sum{font-size:20px}
.pg.consistent .q .rgs{margin-left:auto}
.pg.consistent .ab{height:64px;min-width:64px}
.pg.consistent[data-page-type="friday-5"] .ab,.pg.consistent[data-page-type="remember-these-mixed-set"] .ab{height:64px}
.pg.consistent .seq .ab{height:48px;min-width:48px;width:48px}
.pg.consistent .q.seq-item{gap:8px}
.pg.consistent .seq-item .qt{font-size:18px}
.pg.consistent .seq-below .rgs{flex-basis:100%;margin-left:0;padding-left:34px}
.pg.consistent .two>.seq-wide,.pg.consistent .cols>.seq-wide{grid-column:1/-1}
.pg.consistent .two>.places-wide,.pg.consistent .cols>.places-wide{grid-column:1/-1}
.pg.consistent .outl{padding:6px 16px;gap:6px}
.pg.consistent .error-item{display:flex;flex-direction:column;gap:6px}
.pg.consistent .error-item>.q:first-child{flex-wrap:nowrap;align-items:baseline}.pg.consistent .error-item>.q:first-child .wk{flex:1 1 0}
.pg.consistent .error-item .ans{flex-wrap:wrap;gap:12px}.pg.consistent .error-item .ans .fix{margin-left:12px}
.pg.consistent .error-item .ab{height:48px}
/* Practice 2 holds 8 practice questions and Spot the error (U4 to U9, D-226, workbook-early-levels.ts): closer rows. */
.pg.consistent[data-page-type="practice-2"] .cols,.pg.consistent[data-page-type="practice-2"] .two{row-gap:calc(4px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"] .two .ab{height:52px;min-width:56px}
.pg.consistent[data-page-type="practice-2"] .q.seq-item{gap:4px}
.pg.consistent .error-item .strip{min-height:48px}
.pg.consistent .ways2 .wb{height:var(--work-min)}
/* Keep the writing region, but place it beside a single full-width numeric review task. */
.pg.consistent .q.compact-wide{display:grid;grid-template-columns:22px minmax(100px,1fr) minmax(160px,1.3fr) auto;gap:12px;align-items:start}
.pg.consistent .q.compact-wide>.n{grid-column:1;grid-row:1}.pg.consistent .q.compact-wide>.qb{grid-column:2;grid-row:1}
.pg.consistent .q.compact-wide>.full{grid-column:3;grid-row:1;min-width:0;padding:0}.pg.consistent .q.compact-wide>.rgs{grid-column:4;grid-row:1}
.pg.consistent[data-page-type="practice-2"]:not(:has([data-slot="solve-it-two-ways"])) :is(.two,.cols){row-gap:calc(12px + var(--extra-gap,0px))}
/* The next section needs the same base gap as these rows, including when its cells stretch (#908). */
.pg.consistent[data-page-type="practice-2"]:not(:has([data-slot="solve-it-two-ways"])) .ct{gap:calc(12px + var(--extra-gap,0px))}
/* Early split practice keeps its 12px row gap inside the block. Review adds a 4px label margin;
   the 16px gap between blocks keeps Spot the error at the same distance from its preceding row. */
.pg.consistent.early[data-page-type="practice-2"]:not(:has([data-slot="solve-it-two-ways"])) [data-slot="practice-row"]{gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent.early[data-page-type="practice-2"]:not(:has([data-slot="solve-it-two-ways"])) .ct{gap:calc(16px + var(--extra-gap,0px))}
/* (Its block gap and its practice block's gap grow with the rows' gap, so a section label keeps at least a row gap above
   it when the page's gaps grow to fill it: issue #745, "SPOT THE ERROR" 6 px under rows 12 px apart.) */
.pg.consistent[data-page-type="practice-2"]:has([data-slot="solve-it-two-ways"]) .ct{gap:calc(6px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"]:has([data-slot="solve-it-two-ways"]) [data-slot="practice-row"]{gap:calc(4px + var(--extra-gap,0px))}

.pg.consistent .mxs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
/* Savar, 2026-11-04: a row's cards top-aligned, each number on its text's first line; a story's number on its text's
   baseline, with one gap under its work box; one gap before every section label. */
.pg.consistent .mxs{align-items:start}.mx>.q{align-items:baseline}.mx>.q>.n{padding-top:0}
.story .head{align-items:baseline}
/* Savar, 2026-11-04: true and false are two circle targets in the answer-box column, apart enough to circle one, top-
   aligned with the question's first line; Spot the error's number on its sentence's baseline; a test card's box in one
   place, at its top right. */
.circ.words{flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;min-height:0;min-width:var(--box);padding:0;align-self:flex-start}
.circ.words .co{display:inline-flex;align-items:center;justify-content:center;min-height:28px;min-width:var(--box);padding:0 8px;line-height:1}
.circ.words.likelihood{flex-direction:row;gap:12px;min-width:0}.circ.words.likelihood .co{min-width:0;min-height:44px;padding:0 6px}
.q .rgs:has(.circ.words){align-self:flex-start}
.tc>.q{flex-wrap:nowrap;align-items:flex-start}.tc>.q>.qb{flex:1 1 0;min-width:0}.tc>.q>.rgs{margin-left:auto;flex:none;align-self:flex-start}
.pg.consistent [data-slot="word-problems"] .story{padding-bottom:14px}
.pg.consistent .mx .stp{flex-wrap:wrap}
.pg.consistent .mx .sl{min-width:0}
.pg.consistent .chc{padding:12px;gap:8px}
.pg.consistent .chc .act{display:flex;gap:16px;align-items:flex-end;flex:1}
.pg.consistent .chs.side3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pg.consistent .chs.side3 .top{gap:8px}
.pg.consistent .chs.side3 .act{flex-direction:column;align-items:stretch;gap:8px}
.pg.consistent .chs.side3 .act .wb{width:100%;min-width:0}
.pg.consistent .chs.side3 .act .rg{align-self:flex-end}
/* The shading is the question's only: the work space under it is white paper. A layer behind the question paints it,
   from the card's edge to half the gap under the question, so no box moves: the card and its work space keep their size. */
.pg.consistent .chc.plain{background:#fff}.pg.consistent .chc.plain>.top{position:relative;z-index:0}
.pg.consistent .chc.plain>.top::before{content:"";position:absolute;z-index:-1;left:-12px;right:-12px;top:-12px;bottom:-4px;background:#F4F2F0;border-radius:10.5px 10.5px 0 0}
.pg.consistent .chc.nowork{flex:0 0 auto}.pg.consistent .chc.nowork .act{flex:0 0 auto;align-items:flex-start}
.pg.consistent [data-slot="word-problems"] .story{flex:1}
.pg.consistent [data-slot="word-problems"] .story.nowork{flex:0 0 auto}
.story.nowork .head{align-items:center}.story.nowork .qb{flex:1 1 0}
/* The layout checks (Savar's page reviews, 2026-11-04; src/lib/workbook-layout-check.ts). One gap before every section
   label, wider than the 6 px under it and no narrower than the rows' gap: 12 px (10 on Practice 2, whose rows are 4 px
   apart, D-226, and at U4 to U9). */
.pg.consistent .ct{gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:6px}
.pg.consistent[data-page-type="practice-2"] .ct{gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"] .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:4px}
/* (U4 to U9: rows 6 px apart, 10 px before a label.) */
.pg.consistent.early .ct{gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent.early .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:4px}
/* A question's number and first line share their baseline, and its answer box's top is that line's top. */
.pg.consistent :is(.two,.list)>.q{align-items:flex-start}
.pg.consistent :is(.two,.list)>.q>:is(.n,.qb){padding-top:0;align-self:baseline}
/* Circle targets on the question's first line: true or false, yes or no, letters or numbers share its baseline (on a
   test card too, its number with them). */
.pg.consistent :is(.two,.list)>.q>.rgs:has(.circ){align-self:baseline}
.pg.consistent [data-slot="try-first"] .outl>.q{align-items:flex-start}
.pg.consistent [data-slot="try-first"] .outl>.q>:is(.n,.qb,.rgs:has(.circ)){align-self:baseline}
.pg.consistent .chc .badge{font-size:var(--num);font-weight:500;line-height:1.2}
.pg.consistent .chc>.top>:is(.badge,.qb){align-self:baseline}
.pg.consistent .tc>.q>:is(.badge,.qb,.rgs:has(.circ)){align-self:baseline}
.pg.consistent .q .circ:not(.words){min-height:var(--box);padding:0 18px;align-items:baseline}
.pg.consistent :is(.two,.list,.tc)>.q>.rgs .circ:not(.words) .co{font-size:var(--body)}
.pg.consistent .circ.words .co{align-items:flex-start}
/* (The likelihood words in their own row under the question's text, from its left edge.) */
.pg.consistent :is(.two,.list)>.q>.full:has(.circ.likelihood){padding-left:34px}
/* A fact's number in the page's one number style, on the fact's baseline. */
.pg.consistent .facts .fl{display:flex;align-items:baseline;gap:10px;flex:1 1 auto;min-width:0}
.pg.consistent .facts .fl>.n{min-width:22px}
/* A stories page's numbers are all story numbers (Use 2 ways, Remember these), each on its sentence's baseline. */
.pg.consistent[data-page-type="word-problems"] [data-measure^="number-"]{font-family:"Unica Sans",Helvetica,Arial,sans-serif;font-weight:300;font-size:26px;line-height:1;min-width:26px}
.pg.consistent .tw>.q{align-items:baseline}
/* (After the stories, the same gap as between two stories: the block gap less the blocks' gap within a slot.) */
.pg.consistent .ct>[data-slot="word-problems"]+[data-slot="solve-it-two-ways"]{margin-top:-6px}
.pg.consistent.early .ct>[data-slot="word-problems"]+[data-slot="solve-it-two-ways"]{margin-top:-4px}
/* A Challenge page at its maximum: cards with nothing to work in grow too, so no room is left under the last one (the
   full U4 book's Day 10). */
.pg.consistent.stretch .chs>.chc.nowork{flex:1 0 auto}
.pg.consistent .story .act{flex:1}
.pg.consistent .story .act .wb,.pg.consistent .chc .act .wb{height:auto!important;min-height:var(--work-min);align-self:stretch}
/* Longer numeric boxes keep their minimum width. Give them another line when the prompt or work area needs the space. */
.q>.rgs:has(.long-number),:is(.seq,.obx):has(.long-number){max-width:100%;flex-wrap:wrap}
.q>.rgs:has(.long-number){justify-content:flex-end}
.q.seq-below>.rgs:has(.long-number){justify-content:flex-start}
.facts .q:has(.long-number),.tc>.q:has(.long-number),.chc>.top:has(.long-number),
.pcard .pb:has(.long-number),.act:has(.long-number),.story.nowork .head:has(.long-number),
.mx .stp:has(.long-number),.ways2:has(.long-number){flex-wrap:wrap}
.facts .fl:has(+ .rg .long-number){flex-basis:auto;min-width:min-content}
.facts .rg:has(.long-number){margin-left:auto}
/* Keep both prompts in a warm-up row on the same baseline even when one box wraps. */
.pg.consistent .facts:has(.long-number) .q{flex-wrap:wrap;align-content:start}
.pg.consistent .facts:has(.long-number) .fl{min-height:64px;flex-wrap:wrap;align-content:center}
.cols>.col-wide{grid-column:1/-1}
` + LETTERED_CSS;
