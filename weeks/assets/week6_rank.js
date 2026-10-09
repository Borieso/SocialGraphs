/* Week 6 figure: one week's top 15 words under the course TF-IDF next to
 * Jurafsky & Martin's. Bars are green for df = 1 words, orange for words
 * other weeks share. Hovering (or focusing) a word lights it up in both
 * lists and shows its numbers. Reads the ranked lists that
 * build_week6_payload.py puts in week6_payload.json.
 * Vanilla JS, no modules; self-contained so it doesn't depend on the game. */

(() => {
  const R = { data: null, week: 6 };

  const els = {
    widget: document.getElementById('r-widget'),
    weeks: document.getElementById('r-weeks'),
    loading: document.getElementById('r-loading'),
    panels: document.getElementById('r-panels'),
    tip: document.getElementById('r-tip'),
  };

  const FORMULAS = {
    course: (c, len, df, N) => c / len * Math.log(N / df),
    jm: (c, len, df, N) => (1 + Math.log10(c)) * Math.log10(N / df),
  };
  const LABEL = { course: 'Course', jm: 'The book' };

  const fmtInt = n => n.toLocaleString('en-US');
  const fmtVal = x => (x === 0 ? '0' : x.toPrecision(3));
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const weekData = () => R.data.weeks.find(w => w.week === R.week);
  const score = (f, w, word) => FORMULAS[f](word.c, w.length, word.df, R.data.N);

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  function render() {
    const w = weekData();
    for (const panel of els.panels.querySelectorAll('.rank-panel')) {
      const f = panel.dataset.f;
      const { words, tied } = w.ranked[f];
      const max = score(f, w, words[0]);
      const nUnique = words.filter(x => x.df === 1).length;

      panel.querySelector('.rank-sum').innerHTML =
        `<b>${nUnique} of ${words.length}</b> only in week ${w.week}`;

      panel.querySelector('.rank-list').innerHTML = words.map((x, i) => {
        const s = score(f, w, x);
        return `<li class="${x.df === 1 ? 'u' : 's'}" data-t="${esc(x.t)}" tabindex="0">
          <span class="n">${i + 1}</span>
          <span class="w">${esc(x.t)}</span>
          <span class="track"><span class="bar" style="width:${(s / max * 100).toFixed(1)}%"></span></span>
          <span class="v">${fmtVal(s)}</span>
        </li>`;
      }).join('');

      const last = words[words.length - 1];
      panel.querySelector('.rank-tied').textContent = tied
        ? `+ ${tied} more word${tied === 1 ? '' : 's'} tied with “${last.t}” at ${fmtVal(score(f, w, last))}`
        : '';
    }

    for (const b of els.weeks.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.week) === R.week));
    }
  }

  /* ------------------------------------------------------------------ *
   * Linked highlight + tooltip
   * ------------------------------------------------------------------ */

  /** Where a word sits in one formula's list (1-based), or 0 if not shown. */
  const rankIn = (w, f, t) => w.ranked[f].words.findIndex(x => x.t === t) + 1;

  function tipHtml(t) {
    const w = weekData();
    const word = w.ranked.course.words.find(x => x.t === t) || w.ranked.jm.words.find(x => x.t === t);
    const rows = ['course', 'jm'].map(f => {
      const r = rankIn(w, f, t);
      return `<div class="tip-row"><span>${LABEL[f]}</span>
        <span>${fmtVal(score(f, w, word))} · ${r ? `#${r}` : 'not in top 15'}</span></div>`;
    }).join('');
    const where = word.df === 1
      ? `only week ${w.week}`
      : `${word.df} of ${R.data.N} weeks`;
    return `<b>${esc(t)}</b>
      <div class="tip-row"><span>Count in week ${w.week}</span><span>${fmtInt(word.c)}</span></div>
      <div class="tip-row"><span>Used in</span><span>${where}</span></div>
      ${rows}`;
  }

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

  function highlight(li, x, y) {
    if (!li) return clear();
    const t = li.dataset.t;
    els.panels.classList.add('has-hl');
    for (const row of els.panels.querySelectorAll('li')) {
      row.classList.toggle('hl', row.dataset.t === t);
    }
    els.tip.innerHTML = tipHtml(t);
    els.tip.style.opacity = '1';
    if (x === undefined) {
      const r = li.getBoundingClientRect();
      x = r.right - 40;
      y = r.bottom - 6;
    }
    placeTip(x, y);
  }

  function clear() {
    els.panels.classList.remove('has-hl');
    for (const row of els.panels.querySelectorAll('li.hl')) row.classList.remove('hl');
    els.tip.style.opacity = '0';
  }

  els.panels.addEventListener('pointermove', e => {
    highlight(e.target.closest('.rank-list li'), e.clientX, e.clientY);
  });
  els.panels.addEventListener('pointerleave', clear);
  els.panels.addEventListener('focusin', e => highlight(e.target.closest('.rank-list li')));
  els.panels.addEventListener('focusout', clear);
  window.addEventListener('scroll', clear, { passive: true });

  els.weeks.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !R.data) return;
    R.week = Number(b.dataset.week);
    clear();
    render();
  });

  /* ------------------------------------------------------------------ *
   * The tie table under the figure: Course or J&M, one tbody each
   * ------------------------------------------------------------------ */

  const tieTable = document.getElementById('t-table');
  tieTable.querySelector('.mode').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of tieTable.querySelectorAll('.mode button')) {
      x.setAttribute('aria-pressed', String(x === b));
    }
    for (const body of tieTable.querySelectorAll('tbody')) {
      body.hidden = body.dataset.f !== b.dataset.f;
    }
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
      R.data = data;
      els.loading.remove();
      els.panels.hidden = false;
      render();
    })
    .catch(err => {
      els.loading.textContent =
        'This figure needs to load over http. Please open it through the site, ' +
        'not as a file on your computer.';
      console.error('week6 ranked lists failed to load:', err);
    });
})();
