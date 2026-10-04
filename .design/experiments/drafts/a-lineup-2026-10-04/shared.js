(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var track = window.track = function (event, props) { console.log('[track]', event, props || {}); };
  track('page_view', { variant: document.title });

  /* ---------- in-view reveals ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.rise, [data-io], .draw, .report, .mark').forEach(function (el) { io.observe(el); });
  var hero = document.querySelector('.hero');
  requestAnimationFrame(function () { hero && hero.classList.add('is-in'); });

  /* ---------- swapping word chip ---------- */
  document.querySelectorAll('.swap').forEach(function (sw) {
    var items = sw.children, i = 0, visible = false;
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(sw);
    if (reduce) return;
    setInterval(function () {
      if (!visible || document.hidden) return;
      items[i].classList.remove('on'); i = (i + 1) % items.length; items[i].classList.add('on');
    }, 2200);
  });

  /* ---------- pencil thread through every section ---------- */
  var main = document.getElementById('main');
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path'), tip = document.createElementNS(NS, 'circle');
  svg.setAttribute('class', 'thread'); svg.setAttribute('aria-hidden', 'true');
  tip.setAttribute('class', 'tip'); tip.setAttribute('r', '3.2');
  svg.appendChild(path); svg.appendChild(tip); main.prepend(svg);
  var len = 0, knots = [];
  function buildThread() {
    var mr = main.getBoundingClientRect();
    svg.setAttribute('width', mr.width); svg.setAttribute('height', main.scrollHeight);
    svg.style.height = main.scrollHeight + 'px';
    knots = Array.prototype.slice.call(main.querySelectorAll('[data-thread]'));
    var pts = knots.map(function (k) { var r = k.getBoundingClientRect(); return [r.left + r.width / 2 - mr.left, r.top + r.height / 2 - mr.top]; });
    if (!pts.length) return;
    var x0 = pts[0][0], d = 'M' + pts[0][0] + ' ' + pts[0][1];
    var prev = pts[0];
    pts.slice(1).forEach(function (p, i) {
      var dy = p[1] - prev[1], amp = Math.min(34, Math.max(6, x0 - 4)) * (i % 2 ? -1 : 1);
      d += ' C' + (prev[0] + amp) + ' ' + (prev[1] + dy * .38) + ' ' + (p[0] - amp) + ' ' + (p[1] - dy * .42) + ' ' + p[0] + ' ' + p[1];
      prev = p;
    });
    path.setAttribute('d', d);
    len = path.getTotalLength();
    path.style.strokeDasharray = len; onScroll();
  }
  function onScroll() {
    if (!len) return;
    var mr = main.getBoundingClientRect();
    var p = reduce ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.62 - mr.top) / main.scrollHeight));
    var drawn = len * p;
    path.style.strokeDashoffset = len - drawn;
    var pt = path.getPointAtLength(drawn); tip.setAttribute('cx', pt.x); tip.setAttribute('cy', pt.y);
    knots.forEach(function (k) {
      var r = k.getBoundingClientRect();
      k.style.background = (r.top - mr.top) <= pt.y + 2 ? 'var(--graphite)' : '#fff';
    });
  }
  /* ---------- drift parallax ---------- */
  var drifts = Array.prototype.slice.call(document.querySelectorAll('.drift, .fl[data-speed]'));
  function drift() {
    var vh = innerHeight;
    drifts.forEach(function (el) {
      var r = el.getBoundingClientRect(), s = parseFloat(el.dataset.speed || 0);
      var y = reduce ? 0 : Math.max(-70, Math.min(70, (r.top + r.height / 2 - vh / 2) * s));
      var rot = getComputedStyle(el).getPropertyValue('--r') || '0deg';
      el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0) rotate(' + rot.trim() + ')';
    });
  }
  var ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { onScroll(); drift(); ticking = false; });
  }, { passive: true });
  addEventListener('resize', function () { buildThread(); drift(); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { buildThread(); drift(); });
  addEventListener('load', function () { buildThread(); drift(); });

  /* ---------- reserve flow ---------- */
  var dlg = document.getElementById('rsv');
  var steps = Array.prototype.slice.call(dlg.querySelectorAll('[data-step]'));
  var dots = dlg.querySelectorAll('.dots i');
  var data = {};
  function show(id) {
    steps.forEach(function (s) { s.hidden = s.dataset.step !== String(id); });
    var n = { 1: 1, 2: 2, 3: 3 }[id] || 3;
    dots.forEach(function (d, i) { d.classList.toggle('on', i < n); });
    var first = dlg.querySelector('[data-step="' + id + '"] input, [data-step="' + id + '"] button');
    first && first.focus();
  }
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      var plan = b.dataset.plan;
      if (plan) dlg.querySelector('input[name=plan][value=' + plan + ']').checked = true;
      syncPlan(); show(1); dlg.showModal();
      track('cta_click', { src: b.dataset.src, plan: plan || null }); track('form_start');
    });
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { show(Number(b.closest('form').dataset.step) - 1); });
  });
  dlg.querySelector('[data-retry]').addEventListener('click', function () { show(3); });
  function syncPlan() {
    var both = dlg.querySelector('input[name=plan]:checked').value === 'both';
    document.getElementById('subj').style.display = both ? 'none' : '';
  }
  dlg.querySelectorAll('input[name=plan]').forEach(function (r) { r.addEventListener('change', syncPlan); });

  function check(input, ok) { input.closest('.fld').classList.toggle('bad', !ok); return ok; }
  var forms = dlg.querySelectorAll('form');
  forms[0].addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(forms[0]);
    data.plan = f.get('plan'); data.subject = data.plan === 'both' ? 'Math + Reading' : f.get('subject'); data.grade = f.get('grade');
    track('plan_selected', { plan: data.plan, subject: data.subject, grade: data.grade }); show(2);
  });
  forms[1].addEventListener('submit', function (e) {
    e.preventDefault();
    var n = forms[1].name, em = forms[1].email, pc = forms[1].postal;
    var ok = [check(n, n.value.trim().length > 1), check(em, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value)),
      check(pc, /^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i.test(pc.value.trim()))].every(Boolean);
    if (!ok) { var bad = forms[1].querySelector('.bad input'); bad && bad.focus(); return; }
    data.name = n.value.trim().split(' ')[0]; data.email = em.value.trim(); data.postal = pc.value.trim().toUpperCase();
    if (!/^V[3-7]/.test(data.postal)) {
      document.getElementById('waitTxt').textContent = "We don't deliver to " + data.postal + " yet. We'll email " + data.email + ' as soon as we do.';
      track('outside_area', { postal: data.postal.slice(0, 3) }); show('wait'); return;
    }
    var price = data.plan === 'both' ? 'CAD 89 / month' : 'CAD 49 / month';
    document.getElementById('sum').innerHTML = '<div><span>Plan</span><b>' + data.subject + '</b></div><div><span>Grade</span><b>' + data.grade +
      '</b></div><div><span>Ship to</span><b>' + data.postal + '</b></div><div><span>Price</span><b>' + price + '</b></div>';
    track('details_done'); show(3);
  });
  forms[2].addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('pay'), label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    setTimeout(function () {
      btn.disabled = false; btn.innerHTML = label;
      if (/declined/.test(location.search)) { track('checkout_declined'); show('bad'); return; }
      document.getElementById('okTxt').textContent = 'Thanks, ' + data.name + '. We\'ll email ' + data.email +
        " a link to your child's placement assessment. Your first workbook ships after it, and you're charged only then.";
      track('reserve_success', { plan: data.plan, grade: data.grade }); show('ok');
    }, 1100);
  });
})();
