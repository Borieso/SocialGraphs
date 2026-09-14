/* Week 2 explorables — shared state, the k(t) explorer, the kernel window.
 *
 * Everything on this page runs off one payload built by
 * week2/go_nuts/build_site_214.py, and off one shared year: scrub the player
 * and the other two widgets move with it, so "where am I in the replay" is
 * always the same question with the same answer.
 *
 * Vanilla JS on <canvas>, no libraries. View source, nothing is hidden.
 */

const W2 = {
  data: null,
  frame: 0,
  _subs: [],
  _ready: [],

  onReady(fn) { this._ready.push(fn); },
  onFrame(fn) { this._subs.push(fn); },

  setFrame(i, silent) {
    const max = this.data.years.length - 1;
    this.frame = Math.max(0, Math.min(max, i));
    if (!silent) this._subs.forEach(fn => fn(this.frame));
  },

  get year() { return this.data.years[this.frame]; },
};

/* ---------- canvas helpers ------------------------------------------------ */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Size a canvas to its CSS box at device resolution and hand back the context. */
function ctx2d(cv, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || cv.parentNode.clientWidth;
  const h = height || cv.height;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function axes(g, w, h, pad) {
  g.strokeStyle = cssVar('--grid-line');
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pad.l, pad.t);
  g.lineTo(pad.l, h - pad.b);
  g.lineTo(w - pad.r, h - pad.b);
  g.stroke();
  g.fillStyle = cssVar('--muted');
  g.font = '10px ui-sans-serif, system-ui, sans-serif';
}

/** Weighted least squares on the logs — the same fit build_site_214.py does.
 *
 * numpy's polyfit(..., w=sqrt(n)) minimises sum n*residual^2, so the weight
 * here is n itself, not sqrt(n). Getting that wrong shifts alpha by ~0.08 and
 * the widget stops agreeing with the prose. */
function powerFit(ks, pis, ns, kmin) {
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let i = 0; i < ks.length; i++) {
    if (ks[i] < kmin) continue;
    const wgt = ns[i], x = Math.log(ks[i]), y = Math.log(pis[i]);
    sw += wgt; sx += wgt * x; sy += wgt * y;
    sxx += wgt * x * x; sxy += wgt * x * y; n++;
  }
  if (n < 2) return null;
  const denom = sw * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const a = (sw * sxy - sx * sy) / denom;
  return { alpha: a, intercept: (sy - a * sx) / sw, bins: n };
}

const tip = document.getElementById('tip');
function showTip(ev, html) {
  tip.innerHTML = html;
  tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 270) + 'px';
  tip.style.top = (ev.clientY + 14) + 'px';
  tip.style.opacity = 1;
}
function hideTip() { tip.style.opacity = 0; }

/* ========================================================================== *
 * Widget 2 — k(t): how fast does a character's in-degree grow?
 * ========================================================================== */

const KT = {
  cohorts: { 'arrival 1–50': true, 'arrival 51–150': true, 'arrival 151–303': true },
  individual: false,
  hover: -1,
};

const COHORT_COLOR = {
  'arrival 1–50': '--real',
  'arrival 51–150': '--ba',
  'arrival 151–303': '--random',
};

/** Mean in-degree against age, using only frames up to the current year. */
function cohortCurve(idxs, upto) {
  const D = W2.data, years = D.years;
  const sum = new Map(), cnt = new Map();
  for (const i of idxs) {
    const born = D.nodes[i].b, ser = D.series[i];
    for (let f = 0; f <= upto; f++) {
      const age = years[f] - born, k = ser[f];
      if (age < 1 || k < 0) continue;
      sum.set(age, (sum.get(age) || 0) + k);
      cnt.set(age, (cnt.get(age) || 0) + 1);
    }
  }
  // Past a certain age only the oldest articles in the cohort still contribute,
  // and since those are the big ones the mean swings upward for reasons that
  // have nothing to do with growth. Stop the curve where a quarter of the
  // cohort is no longer represented.
  const floor = Math.max(5, idxs.length * 0.25);
  return [...sum.keys()].sort((a, b) => a - b)
    .filter(a => cnt.get(a) >= floor)
    .map(a => [a, sum.get(a) / cnt.get(a)]);
}

function trajectory(i, upto) {
  const D = W2.data, out = [];
  for (let f = 0; f <= upto; f++) {
    const age = D.years[f] - D.nodes[i].b, k = D.series[i][f];
    if (age >= 1 && k > 0) out.push([age, k]);
  }
  return out;
}

function drawKt() {
  const cv = document.getElementById('kt-canvas');
  const { g, w, h } = ctx2d(cv, 320);
  const pad = { l: 44, r: 14, t: 12, b: 34 };
  // The y-axis starts at 0.5, not 1: the youngest cohort's mean sits below one
  // link for its first few years, and clipping that off would hide the finding.
  const maxAge = 25, maxK = 120, minK = 0.5;
  const X = a => pad.l + (Math.log10(a) / Math.log10(maxAge)) * (w - pad.l - pad.r);
  const Y = k => pad.t + (1 - Math.log10(k / minK) / Math.log10(maxK / minK))
    * (h - pad.t - pad.b);

  axes(g, w, h, pad);
  [1, 2, 5, 10, 20].forEach(v => g.fillText(String(v), X(v) - 3, h - pad.b + 13));
  [1, 10, 100].forEach(v => g.fillText(String(v), 8, Y(v) + 3));
  g.fillText('years since the article appeared', w / 2 - 70, h - 4);
  g.save();
  g.translate(12, h / 2 + 34); g.rotate(-Math.PI / 2);
  g.fillText('in-degree', 0, 0);
  g.restore();

  const upto = W2.frame;

  // BA's prediction, as a reference slope rather than a fitted line.
  g.strokeStyle = cssVar('--ink');
  g.globalAlpha = 0.55; g.setLineDash([4, 4]); g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(X(1), Y(1.6)); g.lineTo(X(maxAge), Y(1.6 * Math.sqrt(maxAge)));
  g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = cssVar('--ink');
  g.fillText('slope 0.5 — what BA predicts', X(4.6), Y(4.9));

  if (KT.individual) {
    g.lineWidth = 1;
    for (let i = 0; i < W2.data.nodes.length; i++) {
      const n = W2.data.nodes[i];
      if (n.beta === null) continue;
      const lab = n.r <= 50 ? 'arrival 1–50'
        : n.r <= 150 ? 'arrival 51–150' : 'arrival 151–303';
      if (!KT.cohorts[lab]) continue;
      const pts = trajectory(i, upto);
      if (pts.length < 2) continue;
      g.strokeStyle = cssVar(COHORT_COLOR[lab]);
      g.globalAlpha = KT.hover === i ? 1 : 0.16;
      g.lineWidth = KT.hover === i ? 2.4 : 1;
      g.beginPath();
      pts.forEach((p, j) => j ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  for (const [lab, on] of Object.entries(KT.cohorts)) {
    if (!on) continue;
    const pts = cohortCurve(W2.data.cohorts[lab], upto);
    if (pts.length < 2) continue;
    g.strokeStyle = cssVar(COHORT_COLOR[lab]);
    g.lineWidth = 2.4;
    g.beginPath();
    pts.forEach((p, j) => j ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.stroke();
    const last = pts[pts.length - 1];
    g.beginPath(); g.arc(X(last[0]), Y(last[1]), 3.4, 0, 6.284);
    g.fillStyle = cssVar(COHORT_COLOR[lab]); g.fill();
  }

  cv._geom = { X, Y, upto };
  document.getElementById('kt-year').textContent = W2.year;

  // beta per cohort, pooled over every (age, degree) point up to this frame --
  // the same estimator the write-up quotes, so at 2026 these read 0.57 / 0.33
  // / 0.06.
  const out = [];
  for (const [lab, on] of Object.entries(KT.cohorts)) {
    if (!on) continue;
    const ages = [], degs = [];
    for (const i of W2.data.cohorts[lab]) {
      for (const [a, k] of trajectory(i, upto)) { ages.push(a); degs.push(k); }
    }
    if (ages.length < 20) { out.push(`${lab}: β not yet fittable`); continue; }
    const f = powerFit(ages, degs, ages.map(() => 1), 0);
    out.push(`${lab}: β = ${f ? f.alpha.toFixed(2) : '—'}`);
  }
  document.getElementById('kt-slopes').textContent = out.join('   ·   ');
}

function initKt() {
  const box = document.getElementById('kt-toggles');
  Object.keys(KT.cohorts).forEach(lab => {
    const id = 'kt-' + lab.replace(/\W+/g, '');
    box.insertAdjacentHTML('beforeend',
      `<label><input type="checkbox" id="${id}" checked>
        <i style="display:inline-block;width:9px;height:9px;border-radius:50%;
           background:var(${COHORT_COLOR[lab]})"></i> ${lab}</label>`);
    document.getElementById(id).onchange = e => {
      KT.cohorts[lab] = e.target.checked; drawKt();
    };
  });
  document.getElementById('kt-individual').onchange = e => {
    KT.individual = e.target.checked; drawKt();
  };

  const cv = document.getElementById('kt-canvas');
  cv.addEventListener('mousemove', ev => {
    if (!KT.individual || !cv._geom) return;
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const { X, Y, upto } = cv._geom;
    let best = -1, bd = 10 * 10;
    for (let i = 0; i < W2.data.nodes.length; i++) {
      const n = W2.data.nodes[i];
      if (n.beta === null) continue;
      for (const [a, k] of trajectory(i, upto)) {
        const dx = X(a) - mx, dy = Y(k) - my, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best !== KT.hover) { KT.hover = best; drawKt(); }
    if (best < 0) { hideTip(); return; }
    const n = W2.data.nodes[best];
    showTip(ev, `<b>${n.name}</b>article created ${n.b - 1} · arrival rank ${n.r}<br>
      fitted β = ${n.beta.toFixed(2)} · in-degree today ${n.k}`);
  });
  cv.addEventListener('mouseleave', () => {
    hideTip(); if (KT.hover !== -1) { KT.hover = -1; drawKt(); }
  });

  W2.onFrame(drawKt);
  drawKt();
}

/* ========================================================================== *
 * Widget 3 — the attachment kernel over a movable window of years
 * ========================================================================== */

const KERN = { from: 2003, to: 2026, kmin: 5, follow: false };

/** Sum the per-year hit/availability bins over a window, then bin-filter. */
function kernelWindow(from, to) {
  const D = W2.data;
  const hits = new Map(), avail = new Map();
  for (let y = from; y <= to; y++) {
    const rows = D.kernelYears[String(y)];
    if (!rows) continue;
    for (const [k, h, a] of rows) {
      hits.set(k, (hits.get(k) || 0) + h);
      avail.set(k, (avail.get(k) || 0) + a);
    }
  }
  const ks = [], pis = [], ns = [];
  for (const k of [...avail.keys()].sort((a, b) => a - b)) {
    // Same cut as the notebook: a bin needs 50 chances before its rate means
    // anything, and at least one link actually landed there.
    if (avail.get(k) >= 50 && (hits.get(k) || 0) > 0) {
      ks.push(k); pis.push(hits.get(k) / avail.get(k)); ns.push(hits.get(k));
    }
  }
  return { ks, pis, ns, links: ns.reduce((a, b) => a + b, 0) };
}

function drawKernel() {
  const cv = document.getElementById('kern-canvas');
  const { g, w, h } = ctx2d(cv, 320);
  const pad = { l: 52, r: 14, t: 12, b: 34 };
  const X = k => pad.l + (Math.log10(k) / Math.log10(140)) * (w - pad.l - pad.r);
  const Y = p => pad.t + (1 - (Math.log10(p) + 3.2) / 2.4) * (h - pad.t - pad.b);

  axes(g, w, h, pad);
  [1, 10, 100].forEach(v => g.fillText(String(v), X(v) - 3, h - pad.b + 13));
  [['0.1', 0.1], ['0.01', 0.01], ['0.001', 0.001]].forEach(([s, v]) =>
    g.fillText(s, 22, Y(v) + 3));
  g.fillText('in-degree the year before', w / 2 - 55, h - 4);
  g.save();
  g.translate(11, h / 2 + 62); g.rotate(-Math.PI / 2);
  g.fillText('chance of the next link', 0, 0);
  g.restore();

  const { ks, pis, ns, links } = kernelWindow(KERN.from, KERN.to);

  // The full-record kernel stays behind as a ghost, so moving the window shows
  // a departure from something rather than an unanchored cloud of dots.
  const all = kernelWindow(2003, 2026);
  g.fillStyle = cssVar('--muted'); g.globalAlpha = 0.22;
  all.ks.forEach((k, i) => {
    g.beginPath(); g.arc(X(k), Y(all.pis[i]), 2.2, 0, 6.284); g.fill();
  });
  g.globalAlpha = 1;

  g.fillStyle = cssVar('--real');
  ks.forEach((k, i) => {
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(X(k), Y(pis[i]), 1.6 + Math.sqrt(ns[i]) * 0.9, 0, 6.284);
    g.fill();
  });
  g.globalAlpha = 1;

  const fit = powerFit(ks, pis, ns, KERN.kmin);
  if (fit) {
    g.strokeStyle = cssVar('--ba'); g.lineWidth = 2;
    g.beginPath();
    for (let k = KERN.kmin; k <= 140; k *= 1.08) {
      const y = Y(Math.exp(fit.intercept) * Math.pow(k, fit.alpha));
      k === KERN.kmin ? g.moveTo(X(k), y) : g.lineTo(X(k), y);
    }
    g.stroke();
  }

  // Linear attachment — α = 1, the textbook BA rule — for comparison.
  if (fit) {
    g.strokeStyle = cssVar('--ink'); g.globalAlpha = 0.4;
    g.setLineDash([4, 4]); g.lineWidth = 1.2;
    const anchor = Math.exp(fit.intercept) * Math.pow(10, fit.alpha) / 10;
    g.beginPath();
    for (let k = KERN.kmin; k <= 140; k *= 1.08) {
      const y = Y(anchor * k);
      k === KERN.kmin ? g.moveTo(X(k), y) : g.lineTo(X(k), y);
    }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  }

  document.getElementById('kern-alpha').textContent = fit ? fit.alpha.toFixed(2) : '—';
  document.getElementById('kern-window').textContent = `${KERN.from}–${KERN.to}`;
  document.getElementById('kern-links').textContent = links.toLocaleString('en-US');
  document.getElementById('kern-verdict').textContent = !fit ? ''
    : fit.alpha > 0.92 ? 'near-linear: hubs take their full share'
    : fit.alpha > 0.75 ? 'sublinear: hubs win, but less than BA assumes'
    : 'clearly sublinear: links are spreading out';
}

function initKernel() {
  const from = document.getElementById('kern-from');
  const to = document.getElementById('kern-to');
  const sync = () => {
    KERN.from = Math.min(+from.value, +to.value);
    KERN.to = Math.max(+from.value, +to.value);
    drawKernel();
  };
  from.oninput = to.oninput = () => {
    document.getElementById('kern-follow').checked = false;
    KERN.follow = false;
    sync();
  };
  document.getElementById('kern-kmin').onchange = e => {
    KERN.kmin = +e.target.value; drawKernel();
  };
  document.getElementById('kern-follow').onchange = e => {
    KERN.follow = e.target.checked;
    if (KERN.follow) followFrame();
  };
  document.querySelectorAll('[data-era]').forEach(b => {
    b.onclick = () => {
      const [a, z] = b.dataset.era.split('-');
      from.value = a; to.value = z;
      document.getElementById('kern-follow').checked = false;
      KERN.follow = false;
      sync();
    };
  });

  function followFrame() {
    if (!KERN.follow) return;
    const y = Math.max(2003, W2.year);
    from.value = 2003; to.value = y;
    KERN.from = 2003; KERN.to = y;
    drawKernel();
  }
  W2.onFrame(followFrame);
  drawKernel();
}

/* ========================================================================== *
 * Boot
 * ========================================================================== */

fetch('assets/data/week2_payload.json')
  .then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then(data => {
    W2.data = data;
    W2.frame = data.years.length - 1;     // open on the finished network
    document.querySelectorAll('.loading').forEach(el => el.remove());
    document.querySelectorAll('[data-needs-js]').forEach(el => {
      el.hidden = false;
    });
    W2._ready.forEach(fn => fn());
    initKt();
    initKernel();
    window.addEventListener('resize', () => {
      drawKt(); drawKernel(); W2._subs.forEach(fn => fn(W2.frame));
    });
  })
  .catch(err => {
    document.querySelectorAll('.loading').forEach(el => {
      el.textContent =
        'The interactive figures need the page to be served over http — ' +
        'open it through the site rather than from a file:// path. ' +
        'The figures below tell the same story.';
    });
    console.error('week2 payload failed to load:', err);
  });
