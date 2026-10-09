/* Week 6 figure: the ten most frequent words in one week.
 *
 * Two modes. "Every word" counts everything, which puts almost the same
 * eight words on top of all six weeks and motivates TF-IDF further down.
 * "Without filler words" drops the stop list first, which separates the
 * weeks immediately but only because we supplied the list: those words are
 * about half the corpus, and deciding them in advance is the thing TF-IDF
 * avoids having to do.
 *
 * Reads the `raw` block that build_week6_payload.py puts in
 * week6_payload.json.
 * Vanilla JS, no modules; self-contained so it doesn't depend on the game. */

(() => {
  // mode 'all'    -> the ten most frequent words, nothing removed
  // mode 'nostop' -> the same after dropping the stop list the topic model
  //                  uses, which is about half of every week's tokens
  const FIELD = { all: 'top', nostop: 'top_nostop' };

  const R = { data: null, week: 1, mode: 'all', always: { all: null, nostop: null } };

  const els = {
    mode: document.getElementById('w-mode'),
    weeks: document.getElementById('w-weeks'),
    loading: document.getElementById('w-loading'),
    panel: document.getElementById('w-panel'),
    bars: document.getElementById('w-bars'),
    note: document.getElementById('w-note'),
    table: document.getElementById('w-table'),
    every: document.getElementById('s-every-2'),
  };

  const fmtInt = n => n.toLocaleString('en-US');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const rawOf = w => R.data.raw.find(r => r.week === w);
  const titleOf = w => R.data.weeks.find(x => x.week === w).title;

  /** Words that make the top ten of every single week, for one mode. */
  function sharedByAll(raw, field) {
    const sets = raw.map(r => new Set(r[field].map(x => x.t)));
    return new Set([...sets[0]].filter(t => sets.every(s => s.has(t))));
  }

  const field = () => FIELD[R.mode];
  const always = () => R.always[R.mode];

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  function render() {
    const r = rawOf(R.week);
    const words = r[field()];
    const max = words[0].c;

    els.bars.innerHTML = words.map((word, i) => {
      const everywhere = always().has(word.t);
      return `
        <li class="raw-bar ${everywhere ? 'everyweek' : 'someweeks'}">
          <span class="raw-rank">${i + 1}</span>
          <span class="raw-word">${esc(word.t)}</span>
          <span class="raw-track">
            <span class="raw-fill" style="width:${(word.c / max * 100).toFixed(1)}%"></span>
          </span>
          <span class="raw-count">${fmtInt(word.c)}</span>
        </li>`;
    }).join('');

    const len = R.data.weeks.find(x => x.week === r.week).length;
    const shared = words.filter(w => always().has(w.t));
    const head = `Week ${r.week} has <b>${fmtInt(r.types)}</b> different words in ` +
      `<b>${fmtInt(len)}</b> tokens. `;

    els.note.innerHTML = head + (R.mode === 'nostop'
      ? `Filler words are <b>${Math.round(r.stop_tokens / len * 100)}%</b> of ` +
        `this week, and dropping them leaves ` +
        (shared.length
          ? `${shared.length} of these ten still shared with every other week.`
          : `<b>none</b> of these ten shared with every other week.`)
      : (shared.length
          ? `<b>${shared.length}</b> of these ten are in all six weeks' top ten.`
          : `None of these ten is in every week's top ten.`));
  }

  function renderTable() {
    els.table.innerHTML = R.data.raw.map(r => `
      <tr>
        <td class="t">${r.week}</td>
        <td>${esc(titleOf(r.week))}</td>
        <td>${fmtInt(R.data.weeks.find(x => x.week === r.week).length)}</td>
        <td>${fmtInt(r.types)}</td>
      </tr>`).join('');
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  els.mode.addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    R.mode = btn.dataset.mode;
    for (const b of els.mode.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
    render();
  });

  els.weeks.addEventListener('click', e => {
    const btn = e.target.closest('button[data-week]');
    if (!btn) return;
    R.week = Number(btn.dataset.week);
    for (const b of els.weeks.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
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
      R.data = data;
      R.always.all = sharedByAll(data.raw, 'top');
      R.always.nostop = sharedByAll(data.raw, 'top_nostop');
      if (els.every) els.every.textContent = fmtInt(data.everywhere);
      els.loading.remove();
      els.panel.hidden = false;
      renderTable();
      render();
    })
    .catch(err => {
      els.loading.textContent =
        'This figure needs to load over http. Please open it through the site, ' +
        'not as a file on your computer.';
      console.error('week6 raw counts failed to load:', err);
    });
})();
