/* Week 6 figure: cosine similarity between the six weeks' TF-IDF vectors,
 * under the course formula or J&M's (the toggle). Both formulas share one
 * colour scale, so switching shows how much the weeks move apart.
 * Reads the "cosine" matrices that build_week6_payload.py puts in
 * week6_payload.json. Vanilla JS, no modules; self-contained like
 * week6_rank.js, whose tooltip element (#r-tip) it borrows. */

(() => {
  const S = { data: null, f: 'course' };

  const els = {
    mode: document.getElementById('s-mode'),
    loading: document.getElementById('s-loading'),
    wrap: document.getElementById('s-wrap'),
    matrix: document.getElementById('s-matrix'),
    ticks: document.getElementById('s-ticks'),
    tip: document.getElementById('r-tip'),
  };

  const LABEL = { course: 'Course', jm: 'J&M' };

  // One hue, light to dark. Validated as an ordinal ramp on the card
  // surface (#f8f2e5): monotone lightness, visible steps, light end 2:1.
  const RAMP = ['#d2a47e', '#bb8257', '#a2663b', '#834d26', '#5f3416'];
  const INK = '#211c17';

  /* ------------------------------------------------------------------ *
   * Colour
   * ------------------------------------------------------------------ */

  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  /** t in [0, 1] -> a colour on RAMP, linear between neighbouring stops. */
  function rampColor(t) {
    const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
    const i = Math.min(Math.floor(x), RAMP.length - 2);
    const a = hexToRgb(RAMP[i]);
    const b = hexToRgb(RAMP[i + 1]);
    return a.map((v, k) => Math.round(v + (b[k] - v) * (x - i)));
  }

  function luminance([r, g, b]) {
    const lin = c => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  /** White or ink, whichever reads better on that fill. */
  function textOn(rgb) {
    const L = luminance(rgb);
    const onWhite = 1.05 / (L + 0.05);
    const onInk = (L + 0.05) / (luminance(hexToRgb(INK)) + 0.05);
    return onWhite > onInk ? '#fff' : INK;
  }

  /** Top of the shared scale: the largest off-diagonal value under either
   * formula, rounded up to the next 0.05. */
  function scaleMax() {
    let max = 0;
    for (const m of Object.values(S.data.cosine)) {
      m.forEach((row, i) => row.forEach((v, j) => { if (i !== j) max = Math.max(max, v); }));
    }
    return Math.ceil(max * 20) / 20;
  }

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  function render() {
    const m = S.data.cosine[S.f];
    const weeks = S.data.weeks;
    const max = S.max;

    const head = `<thead><tr><th class="corner" scope="col">Week</th>${
      weeks.map(w => `<th scope="col">${w.week}</th>`).join('')}</tr></thead>`;

    const body = weeks.map((w, i) => `<tr>
      <th scope="row"><span class="wk">Week ${w.week}</span><span class="ttl">${w.title}</span></th>
      ${m[i].map((v, j) => {
        if (i === j) return '<td class="diag" data-i="' + i + '" data-j="' + j + '">1</td>';
        const rgb = rampColor(v / max);
        return `<td data-i="${i}" data-j="${j}" style="background:rgb(${rgb.join(',')});color:${textOn(rgb)}">${v.toFixed(2)}</td>`;
      }).join('')}
    </tr>`).join('');

    els.matrix.innerHTML = head + `<tbody>${body}</tbody>`;

    for (const b of els.mode.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.f === S.f));
    }
  }

  function renderScale() {
    const max = S.max;
    els.wrap.querySelector('.sim-ramp').style.background =
      `linear-gradient(to right, ${RAMP.join(', ')})`;
    const ticks = [];
    for (let v = 0; v <= max + 1e-9; v += 0.1) ticks.push(v);
    if (max - ticks[ticks.length - 1] > 0.06) ticks.push(max);   // else it crowds the last tick
    els.ticks.innerHTML = ticks.map(v =>
      `<span style="left:${(v / max * 100).toFixed(2)}%">${v.toFixed(2)}</span>`).join('');
  }

  /* ------------------------------------------------------------------ *
   * Tooltip
   * ------------------------------------------------------------------ */

  function placeTip(x, y) {
    const tip = els.tip;
    const pad = 14;
    const { width, height } = tip.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + width > window.innerWidth - 8) left = x - width - pad;
    if (top + height > window.innerHeight - 8) top = y - height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function clear() {
    for (const el of els.matrix.querySelectorAll('.hl')) el.classList.remove('hl');
    els.tip.style.opacity = '0';
  }

  function hover(td, x, y) {
    clear();
    if (!td || td.classList.contains('diag')) return;
    const i = Number(td.dataset.i);
    const j = Number(td.dataset.j);
    const [a, b] = [S.data.weeks[i], S.data.weeks[j]];

    td.classList.add('hl');
    els.matrix.querySelectorAll('tbody tr')[i].querySelector('th').classList.add('hl');
    els.matrix.querySelectorAll('thead th')[j + 1].classList.add('hl');

    const rows = ['course', 'jm'].map(f =>
      `<div class="tip-row"><span>${LABEL[f]}</span><span>${S.data.cosine[f][i][j].toFixed(3)}</span></div>`).join('');
    els.tip.innerHTML = `<b>Week ${a.week} and week ${b.week}</b>
      <div class="tip-note" style="margin:0 0 0.3rem">${a.title} · ${b.title}</div>${rows}`;
    els.tip.style.opacity = '1';
    placeTip(x, y);
  }

  els.matrix.addEventListener('pointermove', e => hover(e.target.closest('td'), e.clientX, e.clientY));
  els.matrix.addEventListener('pointerleave', clear);
  window.addEventListener('scroll', clear, { passive: true });

  els.mode.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !S.data || b.dataset.f === S.f) return;
    S.f = b.dataset.f;
    clear();
    render();
  });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  fetch('assets/data/week6_payload.json')
    .then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(data => {
      S.data = data;
      S.max = scaleMax();
      els.loading.remove();
      els.wrap.hidden = false;
      renderScale();
      render();
    })
    .catch(err => {
      els.loading.textContent =
        'This figure needs to load over http. Please open it through the site, ' +
        'not as a file on your computer.';
      console.error('week6 similarity matrix failed to load:', err);
    });
})();
