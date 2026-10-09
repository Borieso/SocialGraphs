/* Week 6: the TF-IDF balance game.
 * A word only one week uses (df = 1) against a word several weeks share.
 * Pick how often the shared word must appear in that week to tie, under
 * the course's TF-IDF and, optionally, the book's (Jurafsky & Martin) too.
 * Four options per formula, one of them right.
 * Vanilla JS, no modules. Mirrors week3.js's boot/fetch idiom. */

const W6 = {
  data: null,      // payload from build_week6_payload.py
  rounds: [],      // this game's rounds, built up front by buildRounds()
  i: 0,            // index of the current round
  score: 0,
  locked: false,   // true once the current guesses are locked in
  jm: false,       // true when J&M is played next to the course formula
  ui: {},          // per formula key: that formula's choice buttons
};

// Four options per formula. Distractors are multiples of the right answer
// rather than fixed numbers, so they stay plausible whether the tie is 8 or
// 10^18. How many of them land BELOW the answer is drawn per round: with a
// fixed set of ratios the answer would always be, say, the second smallest,
// and sorting the options by size would give it away every time.
const RATIOS_BELOW = [1 / 2, 1 / 3, 1 / 7];
const RATIOS_ABOVE = [2, 3, 7];

const els = {};
function grab() {
  ['g-widget', 'g-loading', 'g-app', 'g-week', 'g-len', 'g-round', 'g-score',
   'a-word', 'a-dots', 'a-calc', 'b-word', 'b-dots', 'b-calc',
   'g-question', 'g-guesses', 'g-result', 'g-lock', 'g-next', 'g-filter',
   'g-showidf', 'g-restart', 'f-course', 'f-both',
   'g-help', 'helpOverlay', 'helpClose',
   's-tokens', 's-vocab', 's-every'].forEach(id => {
    els[id] = document.getElementById(id);
  });
}

/* ========================================================================== *
 * Formatting
 * ========================================================================== */

const fmtInt = n => n.toLocaleString('en-US');
const fmt3 = x => x.toFixed(3);

/** TF-IDF values: three significant digits, always plain decimals so bars
 * stay comparable at a glance. */
const fmtVal = x => (x === 0 ? '0' : x.toPrecision(3));

const superscript = s => String(s).replace(/[-\d]/g, d => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(d)]);

/** Counts: plain up to a million, then a × 10ⁿ (J&M ties reach 10²⁴). */
function fmtCount(c) {
  if (c < 1e6) return fmtInt(Math.round(c));
  const exp = Math.floor(Math.log10(c));
  const mant = c / Math.pow(10, exp);
  return `${mant.toFixed(1)} × 10${superscript(exp)}`;
}

/** An exact (non-whole) tie: one decimal while that still means something. */
const fmtTie = x => (x < 1000 ? x.toFixed(1) : fmtCount(x));

/* ========================================================================== *
 * The two formulas
 *   course: tf = count/|d|,          idf = ln(N/df)
 *   J&M:    tf = 1 + log10(count),   idf = log10(N/df)   (ch. 11)
 * Both ties are solved for the shared word's count; |d| cancels in the
 * course version and never appears in J&M's.
 * ========================================================================== */

const F = {
  course: {
    key: 'course',
    label: 'Course',
    tf: (c, len) => c / len,
    idf: df => Math.log(W6.data.N / df),
    tfText: (c, len) => `${fmtCount(c)} / ${fmtInt(len)}`,
    idfText: df => `ln(6/${df})`,
    tie: r => r.a.c * F.course.idf(1) / F.course.idf(r.df),
  },
  jm: {
    key: 'jm',
    label: 'The book',
    tf: c => (c > 0 ? 1 + Math.log10(c) : 0),
    idf: df => Math.log10(W6.data.N / df),
    tfText: c => `1 + log₁₀ ${fmtCount(c)}`,
    idfText: df => `log₁₀(6/${df})`,
    tie: r => Math.pow(10, F.jm.tf(r.a.c) * F.jm.idf(1) / F.jm.idf(r.df) - 1),
  },
};

const active = () => (W6.jm ? [F.course, F.jm] : [F.course]);
const tfidf = (f, c, len, df) => f.tf(c, len) * f.idf(df);

/** How far a count is from the tie, measured on what the formula sees: the
 * ratio of the tf it gives to the tf needed. For the course formula that is
 * just the count ratio; for J&M it is the ratio of 1 + log10(count). */
const tfError = (f, c, exact, len) => Math.abs(Math.log(f.tf(c, len) / f.tf(exact, len)));

/** The whole number closest to the tie, on that same scale. */
function bestWhole(f, exact, len) {
  const lo = Math.max(1, Math.floor(exact));
  return tfError(f, lo, exact, len) <= tfError(f, lo + 1, exact, len) ? lo : lo + 1;
}

/* -------------------------------------------------------------------------- *
 * The four options
 * -------------------------------------------------------------------------- */

const hashSeed = str => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Small deterministic PRNG, so a reload does not reshuffle the options. */
function rng(seed) {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** The right answer plus three plausible wrong counts, in a stable order. */
function choicesFor(f, r, roundIndex) {
  const right = bestWhole(f, f.tie(r), r.week.length);
  const rand = rng(hashSeed(`${roundIndex}:${f.key}:${r.b.t}`));

  // 0..3 distractors below the answer, so its rank by size varies too.
  let below = Math.floor(rand() * 4);
  // A tie of 1 or 2 has no room underneath; everything would collapse to 1.
  while (below > 0 && Math.round(right * RATIOS_BELOW[below - 1]) < 1) below--;

  const ratios = [
    ...RATIOS_BELOW.slice(0, below),
    ...RATIOS_ABOVE.slice(0, 3 - below),
  ];

  const opts = [right];
  for (const ratio of ratios) {
    let v = Math.max(1, Math.round(right * ratio));
    // Small ties round into each other; step away from the answer, never
    // across it, so a distractor can't become the right number.
    while (opts.includes(v)) v += ratio < 1 ? -1 : 1;
    if (v < 1) v = Math.max(...opts) + 1;
    opts.push(v);
  }

  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { right, opts };
}

/** 100 for the nearest whole number (or a hair off a 10²⁰ tie); otherwise
 * decays with the tf error, so 2x too much and 2x too little cost the same. */
function points(f, r) {
  const len = r.week.length;
  const exact = f.tie(r);
  const g = r.guess[f.key];
  const err = tfError(f, g, exact, len);
  if (g === bestWhole(f, exact, len) || err < 0.002) return 100;
  return Math.min(95, Math.round(100 * Math.exp(-2 * err)));
}

/* ========================================================================== *
 * Rounds
 * ========================================================================== */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** The df level closest to the wanted one that this week has words for. */
function nearestLevel(week, want) {
  const levels = Object.keys(week.shared).map(Number).filter(lv => week.shared[lv].length);
  return levels.sort((x, y) => Math.abs(x - want) - Math.abs(y - want) || Math.random() - 0.5)[0];
}

/** Eight rounds: each df level 2..5 twice, in random order (a week without
 * that level gets its nearest one), spread over the selected weeks, never
 * the same word pair twice. */
function buildRounds() {
  const filter = els['g-filter'].value;
  const pool = W6.data.weeks.filter(w => filter === 'all' || String(w.week) === filter);
  const levels = shuffle([2, 3, 4, 5, 2, 3, 4, 5]);
  let weekOrder = [];
  const rounds = [];
  const seen = new Set();

  for (const want of levels) {
    if (!weekOrder.length) weekOrder = shuffle(pool.slice());
    const week = weekOrder.pop();
    const df = nearestLevel(week, want);
    let a, b, key, tries = 0;
    do {
      a = pick(week.unique);
      b = pick(week.shared[df]);
      key = `${week.week}|${a.t}|${b.t}`;
    } while (seen.has(key) && ++tries < 20);
    seen.add(key);
    rounds.push({ week, a, b, df, guess: {}, pts: {} });
  }
  return rounds;
}

/* ========================================================================== *
 * Guess input. Four buttons per formula; one of them is the tie.
 * ========================================================================== */

function buildGuessRows() {
  W6.ui = {};
  const r = W6.rounds[W6.i];

  els['g-guesses'].innerHTML = active().map(f => {
    const { opts } = choicesFor(f, r, W6.i);
    return `
      <div class="guess-row choices" data-f="${f.key}">
        ${W6.jm ? `<span class="guess-label">${f.label}</span>` : ''}
        <div class="choice-set" role="group" aria-label="${f.label}: pick the count">
          ${opts.map(c => `
            <button type="button" class="choice" data-count="${c}" aria-pressed="false">
              ${fmtCount(c)} <span>times</span>
            </button>`).join('')}
        </div>
      </div>`;
  }).join('');

  for (const row of els['g-guesses'].querySelectorAll('.guess-row')) {
    const f = F[row.dataset.f];
    const ui = { row, buttons: [...row.querySelectorAll('.choice')] };
    W6.ui[f.key] = ui;
    ui.buttons.forEach(btn => btn.addEventListener(
      'click', () => pickGuess(f, Number(btn.dataset.count))));
  }
}

/** Records one pick and marks it as the pressed option. */
function pickGuess(f, count) {
  if (W6.locked) return;
  const ui = W6.ui[f.key];
  W6.rounds[W6.i].guess[f.key] = count;
  ui.buttons.forEach(b => b.setAttribute(
    'aria-pressed', String(Number(b.dataset.count) === count)));
  ui.row.classList.remove('invalid');
  renderShared();
}

/* ========================================================================== *
 * Cards
 * ========================================================================== */

function dots(container, inWeeks, here) {
  const n = W6.data.N;
  let html = '';
  for (let w = 1; w <= n; w++) {
    const cls = w === here ? 'dot on here' : inWeeks.includes(w) ? 'dot on' : 'dot';
    html += `<span class="${cls}" title="Week ${w}${inWeeks.includes(w) ? ' uses it' : ''}">${w}</span>`;
  }
  html += `<span class="note">df = <b>${inWeeks.length}</b> of ${n}</span>`;
  container.innerHTML = html;
}

/** rows: [label, one cell per formula (array) or one shared cell, row class]. */
function calcTable(rows) {
  const fs = active();
  const head = W6.jm
    ? `<thead><tr><th></th>${fs.map(f => `<th>${f.label}</th>`).join('')}</tr></thead>` : '';
  const body = rows.map(([label, cells, cls]) => {
    const tds = Array.isArray(cells)
      ? cells.map(c => `<td>${c}</td>`).join('')
      : `<td colspan="${fs.length}">${cells}</td>`;
    return `<tr class="${cls || ''}"><th>${label}</th>${tds}</tr>`;
  }).join('');
  return head + `<tbody>${body}</tbody>`;
}

function renderUnique() {
  const r = W6.rounds[W6.i];
  const len = r.week.length;
  const fs = active();
  els['a-calc'].innerHTML = calcTable([
    ['count', String(r.a.c)],
    ['tf', fs.map(f => `${f.tfText(r.a.c, len)} = ${fmtVal(f.tf(r.a.c, len))}`)],
    ['idf', fs.map(f => `${f.idfText(1)} = ${fmt3(f.idf(1))}`)],
    ['tf-idf', fs.map(f => fmtVal(tfidf(f, r.a.c, len, 1))), 'big'],
  ]);
}

/** The shared card follows the boxes: count and tf update as you type, the
 * idf and the resulting tf-idf stay hidden until the guess is locked in. */
function renderShared() {
  const r = W6.rounds[W6.i];
  const len = r.week.length;
  const fs = active();
  const g = f => r.guess[f.key];
  const showIdf = W6.locked || els['g-showidf'].checked;
  els['b-calc'].innerHTML = calcTable([
    ['count', fs.map(f => `<span class="unknown">${g(f) === undefined ? '' : fmtCount(g(f))}?</span>`)],
    ['tf', fs.map(f => (g(f) === undefined ? '?' : f.tfText(g(f), len)))],
    ['idf', fs.map(f => `${f.idfText(r.df)} = ${showIdf ? fmt3(f.idf(r.df)) : '<span class="unknown">?</span>'}`)],
    ['tf-idf', fs.map(f => (W6.locked
      ? `${fmtVal(tfidf(f, r.guess[f.key], len, r.df))} <span class="muted">at ${fmtCount(r.guess[f.key])}</span>`
      : `${fmtVal(tfidf(f, r.a.c, len, 1))} <span class="muted">target</span>`)), 'big'],
  ]);
}

function renderRound() {
  const r = W6.rounds[W6.i];

  els['g-week'].textContent = `Week ${r.week.week}, ${r.week.title}`;
  els['g-len'].textContent = fmtInt(r.week.length);
  els['g-round'].textContent = `${W6.i + 1} / ${W6.rounds.length}`;
  els['g-score'].textContent = W6.score;

  els['a-word'].textContent = r.a.t;
  dots(els['a-dots'], [r.week.week], r.week.week);
  els['b-word'].textContent = r.b.t;
  dots(els['b-dots'], r.b.in, r.week.week);

  els['g-question'].innerHTML =
    `How many times must <em>${r.b.t}</em> appear in week ${r.week.week} ` +
    `to score the same as <em class="u">${r.a.t}</em>?`;

  renderUnique();
  buildGuessRows();                        // the options differ every round
  setLocked(false);
  renderShared();
  els['g-result'].hidden = true;
  els['g-result'].innerHTML = '';
}

function setLocked(locked) {
  W6.locked = locked;
  for (const ui of Object.values(W6.ui)) {
    ui.buttons.forEach(btn => { btn.disabled = locked; });
  }
  els['g-lock'].hidden = locked;
  els['g-next'].hidden = !locked;
  els['g-next'].textContent = W6.i === W6.rounds.length - 1 ? 'See results' : 'Next round';
}

/* ========================================================================== *
 * Reveal
 * ========================================================================== */

function verdict(guess, exact, pts) {
  if (pts === 100) return 'Spot on.';
  const dir = guess < exact ? 'too few' : 'too many';
  if (pts >= 70) return `Close, a little ${dir}.`;
  if (pts >= 35) return `Right ballpark, but ${dir}.`;
  return `Way ${dir}.`;
}

/** [label, value] for the third stat: "Off by exact", "Too few ×2.6". */
function offBy(f, r) {
  const len = r.week.length;
  const exact = f.tie(r);
  const g = r.guess[f.key];
  if (g === bestWhole(f, exact, len)) return ['Off by', 'exact'];
  const ratio = g > exact ? g / exact : exact / g;
  const x = ratio < 10 ? ratio.toFixed(1) : fmtCount(ratio);
  return [g > exact ? 'Too many' : 'Too few', `&times;${x}`];
}

/** The working as aligned steps. Both formulas start from the same idf
 * ratio (the log base cancels), so the two cards split only after it. */
function steps(f, r) {
  const c = r.a.c;
  const ratio = f.idf(1) / f.idf(r.df);
  const R = ratio.toFixed(2);
  const rows = [['idf ratio',
    `${f.idfText(1)} &divide; ${f.idfText(r.df)} = ${fmt3(f.idf(1))} &divide; ${fmt3(f.idf(r.df))} = ${R}`]];
  if (f === F.course) {
    const len = r.week.length;
    const need = f.tf(c, len) * ratio;
    rows.push(['tf', `(${c} / ${fmtInt(len)}) &times; ${R} = ${fmtVal(f.tf(c, len))} &times; ${R} = ${fmtVal(need)}`]);
    rows.push(['count', `${fmtVal(need)} &times; ${fmtInt(len)} = <b>${fmtTie(f.tie(r))}</b>`]);
  } else {
    const need = f.tf(c) * ratio;
    rows.push(['tf', `(1 + log₁₀ ${c}) &times; ${R} = ${fmt3(f.tf(c))} &times; ${R} = ${fmt3(need)}`]);
    rows.push(['count', `10<sup>${fmt3(need)} &minus; 1</sup> = 10<sup>${(need - 1).toFixed(2)}</sup> = <b>${fmtTie(f.tie(r))}</b>`]);
  }
  return rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** Why the tie lands where it does, one line per formula. */
function lesson(f, r) {
  const R = (f.idf(1) / f.idf(r.df)).toFixed(1);
  if (f === F.course) return `tf is linear in the count, so the count simply grows ${R}&times;.`;
  return `tf is 1 + log₁₀ count, so the ${R}&times; lands on the log: every +1 in tf costs another &times;10 in count.`;
}

function resultBlock(f, r) {
  const len = r.week.length;
  const exact = f.tie(r);
  const g = r.guess[f.key];
  const target = tfidf(f, r.a.c, len, 1);
  const atGuess = tfidf(f, g, len, r.df);
  const real = tfidf(f, r.b.c, len, r.df);

  const max = Math.max(target, atGuess, real) * 1.3;    // headroom for the value label
  const pct = v => (v / max * 100).toFixed(2);
  const bar = (cls, val, label) => `
    <div class="lbl">${label}</div>
    <div class="track">
      <div class="fill ${cls}" style="width:${pct(val)}%"></div>
      <span class="num" style="left:${pct(val)}%">${fmtVal(val)}</span>
      <span class="target" style="left:${pct(target)}%"></span>
    </div>`;

  return `
    <div class="result-card">
      <div class="result-head">
        <span class="result-label">${f.label}</span>
        <span class="result-pts ${r.pts[f.key] >= 70 ? 'good' : r.pts[f.key] >= 35 ? 'mid' : 'bad'}">+${r.pts[f.key]}</span>
      </div>
      <p class="verdict">${verdict(g, exact, r.pts[f.key])}</p>
      <div class="result-stats">
        <div><span>Needed</span><b>${fmtTie(exact)}</b></div>
        <div><span>You</span><b>${fmtCount(g)}</b></div>
        <div><span>${offBy(f, r)[0]}</span><b>${offBy(f, r)[1]}</b></div>
      </div>
      <dl class="steps">${steps(f, r)}</dl>
      <div class="bars">
        ${bar('bar-a', target, `<b>${r.a.t}</b> &times;${r.a.c}`)}
        ${bar('bar-guess', atGuess, `your guess &times;${fmtCount(g)}`)}
        ${bar('bar-real', real, `real &times;${r.b.c}`)}
      </div>
      <p class="takeaway">${lesson(f, r)}</p>
    </div>`;
}

/** One line under the cards: the shared word's real count and who wins. */
function realLine(r) {
  const len = r.week.length;
  const verb = f => (tfidf(f, r.b.c, len, r.df) > tfidf(f, r.a.c, len, 1) ? 'beats' : 'loses to');
  const fs = active();
  const vs = `<em class="u">${r.a.t}</em>`;
  const outcome = fs.length === 1 ? `<b>${verb(fs[0])}</b> ${vs}`
    : verb(fs[0]) === verb(fs[1]) ? `<b>${verb(fs[0])}</b> ${vs} under both formulas`
    : fs.map(f => `<b>${verb(f)}</b> ${vs} under ${f.label}`).join(' but ');
  return `In week ${r.week.week}, <em>${r.b.t}</em> really appears <b>${r.b.c}</b> times, so it ${outcome}.`;
}

function lockIn() {
  if (W6.locked) return;
  const r = W6.rounds[W6.i];
  const missing = active().filter(f => r.guess[f.key] === undefined);
  if (missing.length) {
    missing.forEach(f => W6.ui[f.key].row.classList.add('invalid'));
    W6.ui[missing[0].key].buttons[0].focus({ preventScroll: true });
    return;
  }
  for (const f of active()) {
    r.pts[f.key] = points(f, r);
    W6.score += r.pts[f.key];
  }
  setLocked(true);
  for (const f of active()) {
    const { right } = choicesFor(f, r, W6.i);
    for (const b of W6.ui[f.key].buttons) {
      const c = Number(b.dataset.count);
      if (c === right) b.classList.add('right');
      else if (c === r.guess[f.key]) b.classList.add('wrong');
    }
  }
  renderShared();
  els['g-score'].textContent = W6.score;

  els['g-result'].innerHTML = `
    <div class="result-grid">${active().map(f => resultBlock(f, r)).join('')}</div>
    <p class="real-line">${realLine(r)}</p>`;
  els['g-result'].hidden = false;
  els['g-next'].focus();
}

function next() {
  if (W6.i < W6.rounds.length - 1) {
    W6.i++;
    renderRound();
  } else {
    showSummary();
  }
}

/* ========================================================================== *
 * Summary
 * ========================================================================== */

/** The df level a formula's guesses missed most, on average, and which way. */
function biggestMiss(f) {
  const byDf = {};
  for (const r of W6.rounds) {
    const len = r.week.length;
    const signed = Math.log(f.tf(r.guess[f.key], len) / f.tf(f.tie(r), len));
    (byDf[r.df] = byDf[r.df] || []).push(signed);
  }
  const [df, err] = Object.entries(byDf)
    .map(([lv, errs]) => [Number(lv), errs.reduce((s, e) => s + e, 0) / errs.length])
    .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
  const who = W6.jm ? `<b>${f.label}</b>: ` : '';
  if (Math.abs(err) < 0.15) return `${who}no pattern in your misses, you have the feel for it.`;
  return `${who}your biggest miss was on words in ${df} of 6 weeks, where you guessed
    ${err < 0 ? 'too few' : 'too many'} on average.`;
}

function showSummary() {
  const fs = active();
  const best = W6.rounds.length * 100 * fs.length;
  const head = fs.map(f =>
    `<th class="n">${W6.jm ? f.label + ' ' : ''}you</th><th class="n">tie</th><th class="n">pts</th>`).join('');
  const rows = W6.rounds.map(r => `<tr>
      <td>${r.week.week}</td>
      <td>${r.a.t} (${r.a.c})</td>
      <td>${r.b.t}</td>
      <td class="n">${r.df}</td>
      ${fs.map(f => `<td class="n">${fmtCount(r.guess[f.key])}</td>
        <td class="n">${fmtTie(f.tie(r))}</td>
        <td class="n">${r.pts[f.key]}</td>`).join('')}
    </tr>`).join('');

  els['g-result'].innerHTML = `
    <div class="summary">
      <p class="verdict">${W6.score} of ${fmtInt(best)} points</p>
      ${fs.map(f => `<p>${biggestMiss(f)}</p>`).join('')}
      <div class="table-wrap"><table>
        <thead><tr><th>Week</th><th>Only here</th><th>Shared</th><th class="n">df</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  els['g-next'].hidden = true;
}

function newGame() {
  els['g-widget'].classList.toggle('with-jm', W6.jm);
  els['f-course'].setAttribute('aria-pressed', String(!W6.jm));
  els['f-both'].setAttribute('aria-pressed', String(W6.jm));
  W6.rounds = buildRounds();
  W6.i = 0;
  W6.score = 0;
  renderRound();
}

/* ========================================================================== *
 * Boot
 * ========================================================================== */

grab();

els['g-lock'].addEventListener('click', lockIn);
els['g-next'].addEventListener('click', next);
els['g-restart'].addEventListener('click', newGame);
els['g-filter'].addEventListener('change', newGame);
els['g-showidf'].addEventListener('change', renderShared);
els['f-course'].addEventListener('click', () => { if (W6.jm) { W6.jm = false; newGame(); } });
els['f-both'].addEventListener('click', () => { if (!W6.jm) { W6.jm = true; newGame(); } });

/** Wires an open button, a close button, and backdrop-click/Escape to close. */
function wireModal(openBtn, overlay, closeBtn) {
  const open = () => overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

wireModal(els['g-help'], els['helpOverlay'], els['helpClose']);

// Enter locks in, then moves on
window.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !W6.data || !els['helpOverlay'].classList.contains('hidden')) return;
  // A picked option keeps focus, so Enter must still work there; the game's
  // own buttons already act on Enter by themselves.
  if (e.target.tagName === 'SELECT') return;
  if (e.target.tagName === 'BUTTON' && !e.target.classList.contains('choice')) return;
  if (!W6.locked) lockIn();
  else if (!els['g-next'].hidden) next();
});

fetch('assets/data/week6_payload.json')
  .then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then(data => {
    W6.data = data;
    els['s-tokens'].textContent = fmtInt(data.tokens);
    els['s-vocab'].textContent = fmtInt(data.vocab);
    els['s-every'].textContent = fmtInt(data.everywhere);
    els['g-loading'].remove();
    els['g-app'].hidden = false;
    newGame();
  })
  .catch(err => {
    els['g-loading'].textContent =
      'This game needs to load over http. Please open it through the site, ' +
      'not as a file on your computer.';
    console.error('week6 payload failed to load:', err);
  });
