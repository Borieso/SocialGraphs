/* Week 3: the Marvel speedrun game.
 * Get from one character to another. Three link choices per hop, and you
 * do not know which one is right.
 * Vanilla JS, no modules. Mirrors week2.js's boot/fetch idiom. */

const W3 = {
  data: null,      // {nodes, adj, stats}
  revAdj: null,    // built once at boot: revAdj[v] = [u, ...] where adj[u] includes v
  d: null,         // Int16Array, distance from every node to the current target
  start: -1,
  target: -1,
  route: [],       // node indices, route[0] === start
  par: 0,
  cardIdxs: [],    // the up-to-3 candidate indices currently on screen
  thumbCache: new Map(),
  round: 0,        // rounds played this session; picks from starterPairs first
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const els = {};
function grab() {
  ['g-loading', 'g-app', 'g-start', 'g-target', 'g-start-blurb', 'g-target-blurb',
   'g-start-art', 'g-target-art', 'g-par', 'g-hops', 'g-route', 'g-cards',
   'g-result', 'g-new', 'g-retry', 'g-help', 'helpOverlay', 'helpClose',
   'g-caveats', 'caveatsOverlay', 'caveatsClose'].forEach(id => {
    els[id] = document.getElementById(id);
  });
}

/* ========================================================================== *
 * Graph helpers
 * ========================================================================== */

function buildReverseAdjacency(adj) {
  const rev = adj.map(() => []);
  for (let u = 0; u < adj.length; u++) {
    for (const v of adj[u]) rev[v].push(u);
  }
  return rev;
}

/** BFS over the reversed graph from targetIdx: d[v] = distance v -> targetIdx. */
function bfsFrom(targetIdx) {
  const n = W3.data.nodes.length;
  const d = new Int16Array(n).fill(-1);
  d[targetIdx] = 0;
  const queue = [targetIdx];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of W3.revAdj[u]) {
      if (d[v] === -1) { d[v] = d[u] + 1; queue.push(v); }
    }
  }
  return d;
}

function randInt(n) { return Math.floor(Math.random() * n); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Every optimal neighbor that fits (up to 3), then decoys fill any slots
 * left over (sidesteps preferred over detours). A node can have more than
 * one out-link that shortens the distance to the target; showing only one
 * of them at random used to hide genuinely correct moves (a real character
 * you might expect to see, like Black Cat from Spider-Man, could silently
 * lose out to another equally-optimal neighbor). Now every optimal move
 * that fits on the board is shown, so a card is never wrong just because
 * it looks like it should work. */
function candidates(u) {
  const d = W3.d;
  const out = W3.data.adj[u];
  const optimal = out.filter(v => d[v] === d[u] - 1);
  const sidesteps = out.filter(v => d[v] === d[u]);
  const detours = out.filter(v => d[v] > d[u]);

  const picked = shuffle(optimal.slice()).slice(0, 3);

  const decoyPool = shuffle(sidesteps.slice()).concat(shuffle(detours.slice()));
  for (const v of decoyPool) {
    if (picked.length >= 3) break;
    if (!picked.includes(v)) picked.push(v);
  }
  return shuffle(picked);
}

/* ========================================================================== *
 * Game state
 * ========================================================================== */

/** The first few rounds use a fixed, curated pair of well-known characters
 * (built into the payload from link count, since nothing else in the data
 * says how famous a character is) so a new player is not immediately lost
 * on two characters they have never heard of. After those, every round is
 * a random pair, same as before. */
function nextPair() {
  const starters = W3.data.starterPairs || [];
  if (W3.round < starters.length) {
    const [start, target] = starters[W3.round];
    return { start, target };
  }
  const n = W3.data.nodes.length;
  let start, target, d;
  do {
    start = randInt(n);
    target = randInt(n);
    if (start === target) continue;
    d = bfsFrom(target);
  } while (start === target || d[start] < 2);
  return { start, target };
}

function newGame() {
  const { start, target } = nextPair();
  const d = bfsFrom(target);
  W3.round += 1;

  W3.start = start;
  W3.target = target;
  W3.d = d;
  W3.par = d[start];
  W3.route = [start];
  els['g-result'].hidden = true;
  render();
}

function currentNode() { return W3.route[W3.route.length - 1]; }

/** Same start, target, and par. Hop count goes back to zero.
 * Use this when a run is stuck or went off track. */
function retry() {
  W3.route = [W3.start];
  els['g-result'].hidden = true;
  render();
}

function pickCard(v) {
  W3.route.push(v);
  if (v === W3.target) {
    finish();
  } else {
    render();
  }
}

/** Recover one true shortest path by walking downhill from start. */
function optimalPath() {
  const d = W3.d;
  const path = [W3.start];
  let u = W3.start;
  while (u !== W3.target) {
    const next = W3.data.adj[u].find(v => d[v] === d[u] - 1);
    path.push(next);
    u = next;
  }
  return path;
}

/* ========================================================================== *
 * Rendering
 * ========================================================================== */

function nodeName(i) { return W3.data.nodes[i].name; }
function blurbFor(i) { return W3.data.nodes[i].blurb || ''; }

function monogramColor(nodeId) {
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) h = (h * 31 + nodeId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 45%, 42%)`;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function renderRoute() {
  const html = W3.route.map((idx, i) => {
    const cls = i === 0 ? 'stop' : 'stop';
    const sep = i > 0 ? '<span class="arrow">&rarr;</span>' : '';
    return `${sep}<span class="${cls}">${nodeName(idx)}</span>`;
  }).join('');
  els['g-route'].innerHTML = html;
}

function renderCards() {
  const u = currentNode();
  W3.cardIdxs = candidates(u);
  els['g-cards'].innerHTML = W3.cardIdxs.map((idx, i) => {
    const node = W3.data.nodes[idx];
    return `
      <button class="card" data-idx="${idx}" aria-label="Go to ${node.name}">
        <div class="card-art" id="g-art-${i}"></div>
        <div class="card-body">
          <p class="card-name">${node.name}</p>
          <p class="card-blurb">${blurbFor(idx)}</p>
        </div>
      </button>`;
  }).join('');

  els['g-cards'].querySelectorAll('.card').forEach(btn => {
    btn.addEventListener('click', () => pickCard(+btn.dataset.idx));
  });

  W3.cardIdxs.forEach((idx, i) => fillArt(idx, document.getElementById(`g-art-${i}`)));
}

/** Paints artEl with idx's portrait (thumbnail, or a monogram fallback).
 * Used for both candidate cards and the start/target header portraits;
 * artEl.dataset.idx tags which node the element currently represents so a
 * fetch that resolves after the element has moved on (re-rendered cards,
 * or a new game) is detected and dropped instead of painting stale art. */
function fillArt(idx, artEl) {
  if (!artEl) return;
  const node = W3.data.nodes[idx];
  artEl.dataset.idx = idx;
  artEl.style.background = monogramColor(node.id);
  artEl.innerHTML = `<div class="monogram">${initials(node.name)}</div>`;

  const apply = url => {
    if (!url || !artEl.isConnected || artEl.dataset.idx !== String(idx)) return;
    artEl.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
  };

  if (W3.thumbCache.has(node.id)) {
    apply(W3.thumbCache.get(node.id));
    return;
  }

  fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(node.id)}`)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(summary => {
      const url = summary.thumbnail && summary.thumbnail.source;
      W3.thumbCache.set(node.id, url || null);
      apply(url);
    })
    .catch(() => { W3.thumbCache.set(node.id, null); }); // stays a monogram
}

function render() {
  els['g-start'].textContent = nodeName(W3.start);
  els['g-target'].textContent = nodeName(W3.target);
  els['g-start-blurb'].textContent = blurbFor(W3.start);
  els['g-target-blurb'].textContent = blurbFor(W3.target);
  els['g-par'].textContent = W3.par;
  els['g-hops'].textContent = W3.route.length - 1;
  fillArt(W3.start, els['g-start-art']);
  fillArt(W3.target, els['g-target-art']);
  renderRoute();
  renderCards();
}

function pathRow(label, cls, path) {
  const stops = path.map((idx, i) => {
    const off = cls === 'mine' && i > 0 && W3.d[idx] >= W3.d[path[i - 1]] ? ' off-path' : '';
    return `${i > 0 ? '<span class="arrow">&rarr;</span>' : ''}<span class="stop${off}">${nodeName(idx)}</span>`;
  }).join('');
  return `<div class="path-row ${cls}"><span class="label">${label}</span>${stops}</div>`;
}

function finish() {
  const hops = W3.route.length - 1;
  const diff = hops - W3.par;
  const verdict = diff === 0 ? `You solved it in ${hops} hops. That is exactly par.`
    : `You solved it in ${hops} hops. Par was ${W3.par}, so that is ${diff} more than par.`;

  els['g-result'].innerHTML = `
    <h4>Run complete</h4>
    <p class="verdict">${verdict}</p>
    ${pathRow('Your route', 'mine', W3.route)}
    ${pathRow('Shortest path', 'optimal', optimalPath())}
  `;
  els['g-result'].hidden = false;
  els['g-cards'].innerHTML = '';
}

/* ========================================================================== *
 * Boot
 * ========================================================================== */

grab();
els['g-new'].addEventListener('click', newGame);
els['g-retry'].addEventListener('click', retry);

/** Wires an open button, a close button, and backdrop-click/Escape to close,
 * for one popup. Used for both the "How to play" and "Caveats" popups. */
function wireModal(openBtn, overlay, closeBtn) {
  const open = () => overlay.classList.remove('hidden');
  const close = () => overlay.classList.add('hidden');
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

wireModal(els['g-help'], els['helpOverlay'], els['helpClose']);
wireModal(els['g-caveats'], els['caveatsOverlay'], els['caveatsClose']);

fetch('assets/data/week3_payload.json')
  .then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then(data => {
    W3.data = data;
    W3.revAdj = buildReverseAdjacency(data.adj);
    els['g-loading'].remove();
    els['g-app'].hidden = false;
    newGame();
  })
  .catch(err => {
    els['g-loading'].textContent =
      'This game needs to load over http. Please open it through the site, ' +
      'not as a file on your computer.';
    console.error('week3 payload failed to load:', err);
  });
