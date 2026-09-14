/* Week 2, widget 1 — watch the graph grow, three times over.
 *
 * Nothing is ever removed from this dataset, so a replay is just nodes and
 * links arriving in order.
 *
 * The two right-hand panels run the SAME arrival schedule and the SAME number
 * of new links per year as Wikipedia. Only the choice of target differs. If
 * early arrival is what makes a hub, the left panel should not look like the
 * middle one.
 */

(function () {
  const ENGINES = [
    { key: 'real', name: 'Wikipedia', css: '--real' },
    { key: 'random', name: 'Random attachment', css: '--random' },
    { key: 'ba', name: 'Preferential attachment', css: '--ba' },
  ];

  let N = 0, YEARS = [], EV = [], D = null;
  let seed = 1, logs = {}, tauSeries = {}, timer = null;
  let LAYOUT = 'spiral';
  const hover = { key: null, node: -1 };

  /* deterministic PRNG, so "re-roll" is reproducible and Reset is not a lie */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- engines ---------------------------------------------------- */
  function buildEngine(kind, s) {
    if (kind === 'real') return EV;
    const rnd = mulberry32(s);
    const out = [], present = [], kin = new Int32Array(N), outSet = new Map();
    for (const [k, a, b, y] of EV) {
      if (k === 0) { present.push(a); out.push([0, a, -1, y]); continue; }
      let taken = outSet.get(a);
      if (!taken) { taken = new Set(); outSet.set(a, taken); }
      let tgt = -1;
      if (kind === 'random') {
        for (let tries = 0; tries < 40; tries++) {
          const c = present[(rnd() * present.length) | 0];
          if (c !== a && !taken.has(c)) { tgt = c; break; }
        }
      } else {                                   // Pi(k) ~ k + 1
        let tot = 0;
        for (const c of present) if (c !== a && !taken.has(c)) tot += kin[c] + 1;
        if (tot > 0) {
          let r = rnd() * tot;
          for (const c of present) {
            if (c === a || taken.has(c)) continue;
            r -= kin[c] + 1;
            if (r <= 0) { tgt = c; break; }
          }
        }
      }
      if (tgt < 0) continue;
      taken.add(tgt); kin[tgt]++; out.push([1, a, tgt, y]);
    }
    return out;
  }

  /* ---------- replay a log up to a frame ---------------------------------- */
  function stateAt(ev, year) {
    const kin = new Int32Array(N), present = new Uint8Array(N);
    const edges = [], eset = new Set();
    let bornThisYear = 0;
    for (const [k, a, b, y] of ev) {
      if (y > year) break;
      if (k === 0) { present[a] = 1; continue; }
      const key = a * N + b;
      if (eset.has(key)) continue;
      eset.add(key); kin[b]++;
      if (y === year) bornThisYear++;
    }
    for (const key of eset) edges.push([(key / N) | 0, key % N]);
    return { kin, present, edges, bornThisYear };
  }

  /* Kendall's tau-b between arrival rank and in-degree.
   *
   * Tau-b, not "drop the tied pairs": most of the cast has a degree of 0 or 1,
   * so tied pairs are the majority early on and discarding them inflates the
   * result by more than 0.01 -- enough for the player to disagree with the
   * figures further down the page. Arrival ranks are unique, so only degree
   * contributes ties. n = 303, so the plain O(n^2) pair loop is fine. */
  function tauArrivalDegree(st) {
    const idx = [];
    for (let i = 0; i < N; i++) if (st.present[i]) idx.push(i);
    let con = 0, dis = 0, tiedK = 0;
    for (let i = 0; i < idx.length; i++) {
      for (let j = i + 1; j < idx.length; j++) {
        const a = idx[i], b = idx[j];
        const dk = st.kin[a] - st.kin[b];
        if (dk === 0) { tiedK++; continue; }
        const dr = D.nodes[a].r - D.nodes[b].r;
        (dr * dk > 0) ? con++ : dis++;
      }
    }
    const n0 = idx.length * (idx.length - 1) / 2;
    const denom = Math.sqrt(n0 * (n0 - tiedK));
    return denom ? (con - dis) / denom : 0;
  }

  /* ---------- drawing ----------------------------------------------------- */
  function cssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  }

  function cohortColor(node) {
    const b = node.b;
    if (b <= 2004) return '#7a3f1f';
    if (b <= 2008) return '#a8703f';
    if (b <= 2015) return '#c9a77f';
    return '#ddd0b8';
  }

  const px = n => LAYOUT === 'spiral' ? n.x : n.fx;
  const py = n => LAYOUT === 'spiral' ? n.y : n.fy;

  function draw(engine, st) {
    const cv = document.getElementById('cv-' + engine.key);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = 360;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pad = 16, X = x => pad + x * (w - 2 * pad), Y = y => pad + (1 - y) * (h - 2 * pad);

    // By 2026 there are 1,762 links over 303 nodes. Drawn at any real weight
    // that is a solid disc, so links go in very faint -- they are texture here,
    // and the thing to actually read is where the big circles sit.
    g.strokeStyle = 'rgba(82, 75, 65, 0.13)';
    g.lineWidth = 0.4;
    g.beginPath();
    for (const [a, b] of st.edges) {
      const na = D.nodes[a], nb = D.nodes[b];
      g.moveTo(X(px(na)), Y(py(na))); g.lineTo(X(px(nb)), Y(py(nb)));
    }
    g.stroke();

    const col = cssVar(engine.css);
    const surface = '#fbf7ee';
    // Smallest first, so hubs land on top instead of being buried, and every
    // circle gets a background-coloured rim so overlapping ones stay countable.
    const order = [];
    for (let i = 0; i < N; i++) if (st.present[i]) order.push(i);
    order.sort((a, b) => st.kin[a] - st.kin[b]);
    for (const i of order) {
      const n = D.nodes[i], k = st.kin[i];
      const r = k > 0 ? 1.6 + 1.75 * Math.sqrt(k) : 1.5;
      g.beginPath(); g.arc(X(px(n)), Y(py(n)), r, 0, 6.284);
      g.fillStyle = k > 0 ? col : cohortColor(n);
      g.globalAlpha = k > 0 ? 0.88 : 0.35;
      g.fill();
      if (k >= 4) {
        g.globalAlpha = 1; g.lineWidth = 1; g.strokeStyle = surface; g.stroke();
      }
      if (hover.node === i) {
        g.globalAlpha = 1; g.lineWidth = 2;
        g.strokeStyle = cssVar('--ink'); g.stroke();
      }
    }
    g.globalAlpha = 1;
    cv._st = st; cv._geom = { X, Y };
  }

  const fmt = n => n.toLocaleString('en-US');

  function render() {
    const year = YEARS[W2.frame];
    document.getElementById('p-year').textContent = year;
    document.getElementById('p-scrub').value = W2.frame;
    const states = {};
    for (const e of ENGINES) {
      const st = stateAt(logs[e.key], year);
      states[e.key] = st;
      draw(e, st);
      let n = 0, mx = 0;
      for (let i = 0; i < N; i++) {
        if (!st.present[i]) continue;
        n++;
        if (st.kin[i] > mx) mx = st.kin[i];
      }
      document.getElementById('stat-' + e.key).textContent =
        `${fmt(n)} characters · ${fmt(st.edges.length)} links`;
      document.getElementById('foot-' + e.key).textContent =
        `busiest page: ${mx} links in · +${st.bornThisYear} this year`;
      const t = tauArrivalDegree(st);
      document.getElementById('tau-' + e.key).textContent =
        `C = ${((1 - t) / 2).toFixed(3)}`;
    }
    const rn = D.nodes.filter(n => n.b <= year).length;
    document.getElementById('p-ranknote').textContent = `arrival rank 1–${rn} present`;
    board(states.real);
    dist(states);
    tauChart();
  }

  /* ---------- leaderboard ------------------------------------------------- */
  let prevRanks = {};
  function board(st) {
    const rows = [];
    for (let i = 0; i < N; i++) if (st.present[i]) rows.push([i, st.kin[i]]);
    rows.sort((a, b) => b[1] - a[1] || D.nodes[a[0]].r - D.nodes[b[0]].r);
    const cur = {};
    rows.forEach((r, i) => cur[r[0]] = i + 1);
    const tb = document.getElementById('p-board');
    tb.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const n = D.nodes[r[0]];
      const was = prevRanks[r[0]], mv = was ? was - (i + 1) : 0;
      const arrow = !was ? '<span style="color:var(--muted)">new</span>'
        : mv > 0 ? `<span class="up">▲${mv}</span>`
        : mv < 0 ? `<span class="down">▼${-mv}</span>`
        : '<span style="color:var(--muted)">–</span>';
      tb.insertAdjacentHTML('beforeend',
        `<tr><td>${i + 1}</td>
          <td class="nm"><span class="dot" style="background:${cohortColor(n)}"></span>${n.name}</td>
          <td>${r[1]}</td><td>${n.b - 1}</td><td>${arrow}</td></tr>`);
    });
    prevRanks = cur;
  }

  /* ---------- degree distribution, as a CCDF ------------------------------ *
   * P(K >= k), not a binned histogram of P(k). With 303 nodes a histogram of
   * the raw degrees is mostly a hump at k = 1-3 and then single-node noise out
   * in the tail, which is an artefact of the binning rather than a property of
   * the network. The CCDF uses every node at every k, needs no bins, and a
   * heavy tail reads as a straight falling line.
   * ----------------------------------------------------------------------- */
  function dist(states) {
    const cv = document.getElementById('p-dist');
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 265;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const L = 40, R = 12, T = 12, B = 30, KMAX = 150, PMIN = 0.002;
    const lx = k => L + (Math.log10(k) / Math.log10(KMAX)) * (w - L - R);
    const ly = p => T + (1 - Math.log10(p / PMIN) / Math.log10(1 / PMIN)) * (h - T - B);

    g.strokeStyle = cssVar('--grid-line'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
    g.fillStyle = cssVar('--muted'); g.font = '10px ui-sans-serif, system-ui';
    [1, 10, 100].forEach(v => g.fillText(String(v), lx(v) - 3, h - B + 13));
    [['100%', 1], ['10%', 0.1], ['1%', 0.01]].forEach(([s, v]) =>
      g.fillText(s, 6, ly(v) + 3));
    g.fillText('links pointing in (k)', w / 2 - 44, h - 4);

    for (const e of ENGINES) {
      const st = states[e.key];
      const degs = [];
      for (let i = 0; i < N; i++) if (st.present[i]) degs.push(st.kin[i]);
      if (!degs.length) continue;
      const tot = degs.length, cnt = new Map();
      for (const d of degs) cnt.set(d, (cnt.get(d) || 0) + 1);
      const maxK = Math.max(...degs);
      let tail = 0;
      const pts = [];
      for (let k = maxK; k >= 1; k--) {
        tail += cnt.get(k) || 0;
        if (tail > 0) pts.push([k, tail / tot]);
      }
      pts.reverse();
      const vis = pts.filter(p => p[1] >= PMIN && p[0] <= KMAX);
      if (vis.length < 2) continue;
      g.strokeStyle = cssVar(e.css); g.lineWidth = 2;
      g.beginPath();
      vis.forEach((p, i) => i ? g.lineTo(lx(p[0]), ly(p[1])) : g.moveTo(lx(p[0]), ly(p[1])));
      g.stroke();
    }
  }

  /* ---------- C over time ------------------------------------------------- */
  function tauChart() {
    const cv = document.getElementById('p-tauc');
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 265;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const L = 40, R = 12, T = 12, B = 30, lo = 0.44, hi = 0.82;
    const X = i => L + (i / (YEARS.length - 1)) * (w - L - R);
    const Y = v => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);

    // The arrival shuffle is a permutation, not a growth process, so it has no
    // frames -- it belongs here as the band a result has to clear, not a line
    // that grows. Anything inside it is indistinguishable from no age effect.
    const sh = D.nulls.shuffle;
    g.fillStyle = cssVar('--muted'); g.globalAlpha = 0.18;
    g.fillRect(L, Y(sh.hi), w - L - R, Y(sh.lo) - Y(sh.hi));
    g.globalAlpha = 1;

    g.strokeStyle = cssVar('--grid-line'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
    g.fillStyle = cssVar('--muted'); g.font = '10px ui-sans-serif, system-ui';
    [0.5, 0.6, 0.7, 0.8].forEach(v => g.fillText(v.toFixed(1), 8, Y(v) + 3));
    g.fillText(String(YEARS[0]), L - 8, h - B + 13);
    g.fillText(String(YEARS[YEARS.length - 1]), w - R - 26, h - B + 13);
    g.fillText('arrival shuffle', L + 6, Y(0.5) - 5);

    for (const e of ENGINES) {
      const ser = tauSeries[e.key];
      if (!ser) continue;
      g.strokeStyle = cssVar(e.css); g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= W2.frame; i++) {
        const x = X(i), y = Y(ser[i]);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 0.2; g.beginPath();
      for (let i = W2.frame; i < YEARS.length; i++) {
        const x = X(i), y = Y(ser[i]);
        i === W2.frame ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke(); g.globalAlpha = 1;
      g.fillStyle = cssVar(e.css);
      g.beginPath(); g.arc(X(W2.frame), Y(ser[W2.frame]), 3.6, 0, 6.284); g.fill();
    }
  }

  /* ---------- hover ------------------------------------------------------- */
  function wireHover(e) {
    const cv = document.getElementById('cv-' + e.key);
    cv.addEventListener('mousemove', ev => {
      const rect = cv.getBoundingClientRect(), st = cv._st, geom = cv._geom;
      if (!st) return;
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best = -1, bd = 13 * 13;
      for (let i = 0; i < N; i++) {
        if (!st.present[i]) continue;
        const n = D.nodes[i];
        const dx = geom.X(px(n)) - mx, dy = geom.Y(py(n)) - my, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      hover.node = best; hover.key = e.key;
      if (best < 0) { hideTip(); draw(e, st); return; }
      const n = D.nodes[best];
      const rows = [];
      for (let i = 0; i < N; i++) if (st.present[i]) rows.push([i, st.kin[i]]);
      rows.sort((a, b) => b[1] - a[1]);
      const rank = rows.findIndex(r => r[0] === best) + 1;
      showTip(ev, `<b>${n.name}</b>article created ${n.b - 1} · arrival rank ${n.r}<br>
        ${st.kin[best]} links in — rank ${rank} of ${rows.length} in this panel`);
      draw(e, st);
    });
    cv.addEventListener('mouseleave', () => {
      hideTip(); hover.node = -1; render();
    });
  }

  /* ---------- transport --------------------------------------------------- */
  function rebuild() {
    logs.real = EV;
    logs.random = buildEngine('random', seed);
    logs.ba = buildEngine('ba', seed);
    // Once per build rather than per frame: 25 frames x 3 engines x 45k pairs
    // is fine once and wasteful sixty times during playback.
    tauSeries = {};
    for (const e of ENGINES) {
      tauSeries[e.key] = YEARS.map(y => (1 - tauArrivalDegree(stateAt(logs[e.key], y))) / 2);
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    document.getElementById('p-play').textContent = 'Play';
  }

  function play() {
    if (timer) { stop(); return; }
    if (W2.frame >= YEARS.length - 1) W2.setFrame(0);
    document.getElementById('p-play').textContent = 'Pause';
    const ms = +document.getElementById('p-speed').value;
    timer = setInterval(() => {
      if (W2.frame >= YEARS.length - 1) { stop(); return; }
      W2.setFrame(W2.frame + 1);
    }, ms);
  }

  W2.onReady(function () {
    D = W2.data;
    N = D.nodes.length; YEARS = D.years; EV = D.events;

    const panels = document.getElementById('p-panels');
    ENGINES.forEach(e => {
      panels.insertAdjacentHTML('beforeend',
        `<div class="panel">
          <div class="panel-head">
            <span class="panel-name" style="color:var(${e.css})">${e.name}</span>
            <span class="panel-stat" id="stat-${e.key}"></span>
          </div>
          <canvas id="cv-${e.key}"></canvas>
          <div class="panel-foot"><span id="foot-${e.key}"></span>
            <span id="tau-${e.key}"></span></div>
        </div>`);
    });
    ENGINES.forEach(wireHover);

    const scrub = document.getElementById('p-scrub');
    scrub.max = YEARS.length - 1;
    scrub.value = W2.frame;

    document.getElementById('p-play').onclick = play;
    document.getElementById('p-step').onclick = () => {
      stop(); W2.setFrame(W2.frame + 1);
    };
    document.getElementById('p-reset').onclick = () => {
      stop(); prevRanks = {}; W2.setFrame(0);
    };
    scrub.oninput = ev => { stop(); prevRanks = {}; W2.setFrame(+ev.target.value); };
    document.getElementById('p-speed').onchange = () => { if (timer) { stop(); play(); } };
    document.getElementById('p-layout').onchange = ev => {
      LAYOUT = ev.target.value;
      document.getElementById('p-layhint').textContent = LAYOUT === 'spiral'
        ? 'Oldest article at the centre, newest at the rim — so hubs drifting inward means early arrival won.'
        : 'Positions are solved on the real graph, so the real panel will look tidier for reasons that have nothing to do with attachment. Compare the numbers, not the shapes.';
      render();
    };
    document.getElementById('p-reroll').onclick = () => {
      seed = (Math.random() * 1e9) | 0; rebuild(); render();
    };

    // #f=12 opens the page at a given frame, for linking to a moment.
    const m = /[#&]f=(\d+)/.exec(location.hash);
    if (m) W2.frame = Math.min(YEARS.length - 1, Math.max(0, +m[1]));

    rebuild();
    W2.onFrame(render);
    render();
  });
})();
