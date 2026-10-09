/* Week 6 figure: where each week's text lands when LDA is asked for 6, 7 or
 * 8 topics. Rows are the six weeks, columns the topics, and a row sums to
 * 100% because a document is a mixture over all topics, never a member of
 * one. Reads topics_payload.json from build_topics_payload.py.
 *
 * Columns are ordered by each topic's `top_week`, NOT by its `id`. Topic ids
 * are LDA's own component ordering and mean nothing across K: topic 2 at
 * K = 6 is unrelated to topic 2 at K = 8. Keying layout or colour on `id`
 * would scramble the grid every time the reader switches K.
 *
 * Vanilla JS, no modules; self-contained so it doesn't depend on the game. */

(() => {
  const T = { data: null, k: 6 };

  const els = {
    mode: document.getElementById('k-mode'),
    hint: document.getElementById('k-hint'),
    loading: document.getElementById('k-loading'),
    wrap: document.getElementById('k-wrap'),
    matrix: document.getElementById('k-matrix'),
    list: document.getElementById('k-list'),
  };

  // Same ramp as the similarity matrix, so the two figures read alike.
  const RAMP = ['#d2a47e', '#bb8257', '#a2663b', '#834d26', '#5f3416'];
  const INK = '#211c17';
  const TERMS_SHOWN = 6;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pct = v => `${Math.round(v * 100)}%`;

  const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

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

  function textOn(rgb) {
    const L = luminance(rgb);
    return 1.05 / (L + 0.05) > (L + 0.05) / (luminance(hexToRgb(INK)) + 0.05)
      ? '#fff' : INK;
  }

  const run = () => T.data.runs[String(T.k)];
  const weeks = () => T.data.corpus.weeks;

  /** Topic indices ordered by the week they sit in, strongest first inside a
   * week. This is what makes the columns comparable across K. */
  function columnOrder(r) {
    const home = t => weeks().indexOf(t.top_week);
    return r.topics
      .map((t, i) => i)
      .sort((a, b) => home(r.topics[a]) - home(r.topics[b])
        || r.topics[b].concentration - r.topics[a].concentration);
  }

  const shortWeek = w => w.replace('week', 'W');

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */

  function render() {
    const r = run();
    const order = columnOrder(r);
    const ws = weeks();

    const head = `<thead><tr><th class="corner" scope="col">Week</th>${
      order.map(i => {
        const t = r.topics[i];
        return `<th scope="col" title="${esc(t.terms.slice(0, TERMS_SHOWN)
          .map(x => x.word).join(' '))}">${shortWeek(t.top_week)}</th>`;
      }).join('')}</tr></thead>`;

    const body = ws.map((week, row) => {
      const mass = r.week_topic_mass[row];
      const dominant = r.week_dominant[row];
      return `<tr>
        <th scope="row"><span class="wk">Week ${row + 1}</span></th>
        ${order.map(i => {
          const v = mass[i];
          const rgb = rampColor(v);
          const strong = i === dominant;
          return `<td class="${strong ? 'dominant' : ''}"
            style="background:rgb(${rgb.join(',')});color:${textOn(rgb)}"
            title="${esc(week)} - ${pct(v)} on the ${esc(r.topics[i].top_week)} topic"
            >${v < 0.005 ? '' : pct(v)}</td>`;
        }).join('')}
      </tr>`;
    }).join('');

    els.matrix.innerHTML = head + `<tbody>${body}</tbody>`;

    els.list.innerHTML = order.map(i => {
      const t = r.topics[i];
      const terms = t.terms.slice(0, TERMS_SHOWN).map(x => esc(x.word)).join(' ');
      return `<li>
        <span class="topic-home">${shortWeek(t.top_week)}</span>
        <span class="topic-terms">${terms}</span>
        <span class="topic-conc">${pct(t.concentration)} of it in ${esc(t.top_week)}</span>
      </li>`;
    }).join('');

    const fused = r.merged.length
      ? r.merged.map(g => g.map(w => `week ${w.slice(4)}`).join(' and ')).join('; ')
      : null;
    els.hint.innerHTML = fused
      ? `<b>${r.distinct_weeks} of 6</b> weeks get their own topic &mdash; ` +
        `${fused} share one, so ${r.k} topics cover 6 weeks. ` +
        `A bold cell is the week's largest topic.`
      : `All <b>6</b> weeks get their own topic. ` +
        `A bold cell is the week's largest topic.`;
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  els.mode.addEventListener('click', e => {
    const btn = e.target.closest('button[data-k]');
    if (!btn) return;
    T.k = Number(btn.dataset.k);
    for (const b of els.mode.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === btn));
    }
    render();
  });

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  fetch('assets/data/topics_payload.json')
    .then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(data => {
      T.data = data;
      els.loading.remove();
      els.wrap.hidden = false;
      render();
    })
    .catch(err => {
      els.loading.textContent =
        'This figure needs to load over http. Please open it through the site, ' +
        'not as a file on your computer.';
      console.error('week6 topics failed to load:', err);
    });
})();
