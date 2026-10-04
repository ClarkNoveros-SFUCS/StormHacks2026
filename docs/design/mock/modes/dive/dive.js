'use strict';
/* Dive (docs/design/modes/dive.md): the Krillion-style Game Mode, laid out like Krillion, with real descent.
   Everything Dive-specific lives here: its theme, tiers, Run (descent + catch screen), Reveal and Game-page stats.
   It builds only from core/ (Round, Results, Kinds, UI, Stage, Sound) and the depth world (themes/ocean.js). */

/* ============ Tiers on screen (dive.md §3) ============ */
const TIER_ICONS = {
  common: ['..XXX..', '.X..HX.', 'X....HX', 'X.....X', 'X.....X', '.X...X.', '..XXX..'],
  solid: ['...XX...X', '.XXXXX.XX', 'XEXXXXXX.', '.XXXXX.XX', '...XX...X'],
  deep: ['..XXX..', '.XXXXX.', 'XXHXXXX', 'XXXXXXX', 'X.X.X.X', 'X.X.X.X', '.X...X.'],
  rare: ['...X...', '..XXX..', '.XXHXX.', 'XXHHHXX', '.XXHXX.', '..XXX..', '...X...'],
};
/* The big creatures on the catch screen (16 px, drawn in the band colour) */
const CATCH_SPRITES = {
  common: ['................', '.......XXX......', '......X...X.....', '......X.H.X.....', '.......XXX......', '..XXXX..........', '.X....X.....XX..',
    '.X.HH.X....X..X.', '.X.H..X....X.HX.', '.X....X.....XX..', '..XXXX..........', '.........XXX....', '........X..HX...', '........X...X...', '.........XXX....', '................'],
  solid: ['................', '................', '.....XXXXX......', '...XXXXXXXXX...X', '..XXXXXXXXXXX.XX', '.XXHEXXXXXXXXXX.', 'XXXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXXX',
    '.XXXXXXXXXXXX.XX', '..XXXXXXXXXX...X', '....XXXXXX......', '................', '................', '................', '................', '................'],
  deep: ['.....XXXXXX.....', '...XXXXXXXXXX...', '..XXXHHXXXXXXX..', '.XXXHXXXXXXXXXX.', '.XXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXXX', 'X.X.X.X..X.X.X.X', '.X.X.X.XX.X.X.X.',
    '.X..X..X..X..X..', '.X...X.X..X.X...', '..X..X..X.X..X..', '..X...X.X..X.X..', '...X..X..X.X..X.', '...X...X.X..X...', '....X..X..X.....', '.......X........'],
  rare: ['...X............', '....X...........', '.....XX.........', '.....XHX........', '......X.........', '......X.........', '.....XXXXXX....X', '...XXXXXXXXXX.XX',
    '..XXHEXXXXXXXXX.', '.HXHXXXXXXXXXXXX', 'HHHHHXXXXXXXXXXX', '.HXHXXXXXXXXXXX.', '..XXXXXXXXXXXX.X', '...XXXXXXXXX...X', '.....XXXXX......', '................'],
};
const TIERS = {
  common: { label: 'SHALLOWS', pts: 10, band: 1, color: 'var(--band-1)', m: 100, frac: .14, verdict: 'The one everybody knows. Still counts.' },
  solid: { label: 'REEF', pts: 25, band: 2, color: 'var(--band-2)', m: 250, frac: .38, verdict: 'Solid pull. You know this reef.' },
  deep: { label: 'ABYSS', pts: 60, band: 3, color: 'var(--band-3)', m: 600, frac: .64, verdict: 'Genuinely uncommon. Nice pull.' },
  rare: { label: 'TRENCH', pts: 100, band: 4, color: 'var(--band-4)', m: 1000, frac: .9, verdict: 'Almost nobody finds this one. Straight from the footnotes.' },
};
const TIER_ORDER = ['common', 'solid', 'deep', 'rare'];
const BELOW = { rare: 'deep', deep: 'solid', solid: 'common' };
const dropTier = t => BELOW[t] || 'common';
const singlePoints = (tier, hinted) => !hinted ? TIERS[tier].pts : tier === 'common' ? 5 : TIERS[BELOW[tier]].pts;
const tierIcon = (t, s = 2) => `<span style="color:${TIERS[t] ? TIERS[t].color : 'var(--band-miss)'}">${px(TIER_ICONS[t] || TIER_ICONS.common, INK, s)}</span>`;
const metres = points => Math.round(points * 10).toLocaleString('en-US') + 'm';                    // HUD plate: "900m"
const depth = points => points <= 0 ? '0m' : '−' + Math.round(points * 10).toLocaleString('en-US') + 'm';   // score metaphor: 10 m per point
const tierBadge = (t, from) => `<span style="color:${TIERS[t].color};display:inline-flex;gap:6px;align-items:center">${from ? `<s style="color:var(--muted)">${TIERS[from].label}</s> → ` : ''}${tierIcon(t)} ${TIERS[t].label} · ${singlePoints(from || t, !!from)}</span>`;
const ZONES = [[0, 'SUNLIT ZONE'], [200, 'TWILIGHT ZONE'], [1000, 'MIDNIGHT ZONE'], [4000, 'THE ABYSS'], [6000, 'THE TRENCH']];

/* ============ Theme (dive.md §2): the depth world and Dive's voice ============ */
registerTheme('dive', {
  scene: OceanScene, mascot: ANGLER, particle: 'rgba(200,235,255,.8)', world: 'mode',
  sounds: {
    correct(band = 1) {
      const f = [0, 523, 659, 784, 988][band];
      Sound.tone(f, .1); Sound.tone(f * 1.5, .16, 'square', .05, 0, .08);
      if (band === 4) { Sound.tone(f * 2, .3, 'triangle', .05, 0, .2); Sound.tone(f * 2.5, .4, 'triangle', .04, 0, .32); }
    },
    ping() { Sound.tone(1320, .07, 'sine', .05); Sound.tone(1980, .05, 'sine', .02, 0, .05); },   // sonar
  },
});

/* ============ Demo content (a real Run comes from /api/runs) ============ */
const SRC = 'Week 9 slides';
const A = (canonical, aliases, tier, page, quote, exact = false) => ({ canonical, aliases, tier, page, quote, exact });
const PROMPTS = [
  { kind: 'open', text: 'Name a graph algorithm', answers: [
    A('BFS', ['breadth first search', 'breadth-first search'], 'common', 14, 'Visit every neighbour at the current depth before going deeper.', true),
    A('DFS', ['depth first search', 'depth-first search'], 'common', 15, 'Go as far down one branch as possible before backtracking.', true),
    A('Dijkstra', ["dijkstra's algorithm", 'dijkstras'], 'common', 19, 'Single-source shortest paths when every weight is non-negative.'),
    A('Kruskal', ["kruskal's algorithm"], 'solid', 27, 'Add the cheapest edge that joins two different trees.'),
    A('Prim', ["prim's algorithm"], 'solid', 28, 'Grow one tree by its cheapest outgoing edge.', true),
    A('Bellman-Ford', ['bellman ford', 'bellmanford'], 'solid', 22, 'Relax every edge V−1 times; also detects negative cycles.'),
    A('Topological sort', ['topo sort', 'toposort', 'topological ordering'], 'solid', 11, 'Order a DAG so every edge points forward.'),
    A('Floyd-Warshall', ['floyd warshall', "floyd's algorithm"], 'deep', 33, 'All-pairs shortest paths by DP over intermediate vertices.'),
    A('Kosaraju', ["kosaraju's algorithm"], 'deep', 36, 'Two DFS passes find the strongly connected components.'),
    A('Tarjan', ["tarjan's algorithm", 'tarjan scc'], 'deep', 37, 'One DFS with low-link values finds SCCs.'),
    A('Hopcroft-Karp', ['hopcroft karp'], 'rare', 41, 'Maximum bipartite matching using shortest augmenting paths.'),
  ] },
  { kind: 'cloze', label: 'FILL THE BLANK', tier: 'deep', text: "Dijkstra's algorithm can fail on graphs with ______ edge weights.",
    hint: 'Think about the sign of the number.', explanation: 'Dijkstra assumes a settled vertex never finds a shorter path later; a negative edge breaks that.',
    answers: [A('negative', ['negative weight', 'negative weights', 'neg'], 'deep', 20, 'Dijkstra requires w(u,v) ≥ 0 for every edge.')] },
  { kind: 'definition', label: 'NAME THE TERM', tier: 'common', text: 'A traversal that visits every neighbour at the current depth before moving one level deeper.',
    hint: 'It uses a queue.', explanation: 'Breadth-first search explores level by level using a FIFO queue.',
    answers: [A('BFS', ['breadth first search', 'breadth-first search'], 'common', 14, 'BFS explores the graph level by level.', true)] },
  { kind: 'order', label: 'PUT IN ORDER · ONE TRY', tier: 'solid', text: "Put the steps of Dijkstra's algorithm in order",
    hint: 'Nothing can be relaxed until distances exist.', explanation: 'Initialise, pick the closest unvisited vertex, relax its edges, mark it done, repeat.',
    items: ['Set the source to 0 and every other distance to ∞', 'Pick the unvisited vertex with the smallest distance', 'Relax every edge leaving that vertex', 'Mark it visited and repeat until none are left'],
    answers: [A('Correct order', [], 'solid', 19, 'Dijkstra: initialise, extract-min, relax, repeat.')] },
  { kind: 'odd', label: 'ODD ONE OUT · ONE TRY', tier: 'solid', text: 'Which one does not belong?', options: ['Kruskal', 'Prim', 'Dijkstra', 'Borůvka'], correct: 'Dijkstra',
    hint: 'Three of them build the same kind of tree.', explanation: 'Kruskal, Prim and Borůvka build minimum spanning trees; Dijkstra finds shortest paths.',
    answers: [A('Dijkstra', [], 'solid', 27, 'MST algorithms: Kruskal, Prim, Borůvka.')] },
  { kind: 'open', text: 'Name a data structure a graph algorithm relies on', answers: [
    A('Queue', ['fifo queue'], 'common', 14, 'BFS keeps the frontier in a FIFO queue.'),
    A('Stack', ['lifo stack'], 'solid', 15, 'Iterative DFS keeps its path on a stack.'),
    A('Priority queue', ['min heap', 'heap', 'binary heap', 'pq'], 'solid', 19, 'Dijkstra extracts the closest vertex from a min-priority queue.'),
    A('Adjacency list', ['adj list'], 'solid', 6, 'Store each vertex’s neighbours in a list: O(V + E) space.'),
    A('Adjacency matrix', ['adj matrix'], 'deep', 6, 'A V×V table of edges: O(1) lookup, O(V²) space.'),
    A('Union-find', ['union find', 'disjoint set', 'disjoint set union', 'dsu'], 'deep', 27, 'Kruskal checks whether an edge joins two trees with union-find.'),
    A('Residual graph', ['residual network'], 'deep', 40, 'Augmenting paths are found in the residual graph.'),
    A('Fibonacci heap', ['fib heap'], 'rare', 21, 'With a Fibonacci heap Dijkstra runs in O(E + V log V).'),
  ] },
  { kind: 'cloze', label: 'FILL THE BLANK', tier: 'common', text: "Kruskal's algorithm considers edges in increasing order of ______.",
    hint: 'What makes one edge cheaper than another?', explanation: 'Kruskal sorts edges by weight and adds the cheapest safe one.',
    answers: [A('weight', ['weights', 'edge weight', 'cost'], 'common', 27, 'Sort E by weight, then scan.')] },
].map(prepPrompt);
const DEMO_RESULTS = (() => {
  const P = PROMPTS, f = (i, n) => P[i].answers.find(a => a.canonical === n);
  return [
    { p: P[0], answer: 'Kruskal', tier: 'solid', points: 25, found: f(0, 'Kruskal') },
    { p: P[1], answer: 'negative', tier: 'solid', points: 25, hint: true, found: P[1].answers[0] },
    { p: P[2], answer: 'BFS', tier: 'common', points: 10, found: P[2].answers[0] },
    { p: P[3], answer: 'Correct order', tier: 'solid', points: 25, found: P[3].answers[0] },
    { p: P[4], answer: null, tier: null, points: 0 },
    { p: P[5], answer: 'Union-find', tier: 'deep', points: 60, found: f(5, 'Union-find') },
    { p: P[6], answer: 'weight', tier: 'common', points: 5, rep: true, found: P[6].answers[0] },
  ];
})();
const GHOSTS = [[10, 25, 10, 0, 25, 10, 10], [25, 0, 10, 25, 25, 25, 10], [10, 60, 10, 0, 0, 25, 10]];
const PB_RUN = GHOSTS[1];
const BEARING = [
  { lo: 0, hi: 150, tier: 'common', text: 'Shallows. Plenty of ocean left below.' },
  { lo: 151, hi: 300, tier: 'solid', text: 'Reef. You know the main ideas.' },
  { lo: 301, hi: 500, tier: 'deep', text: 'Abyss. Below the slides’ surface.' },
  { lo: 501, hi: 700, tier: 'rare', text: 'Trench. You read the footnotes.' },
];

/* ============ Depth ruler + YOU marker (right edge, scrolls with the camera) ============ */
const Ruler = {
  el: null, you: 0, shown: 0, v: 0,
  mount() {
    this.unmount();
    const el = document.createElement('div');
    el.className = 'ruler'; el.setAttribute('aria-hidden', 'true');
    let h = '';
    for (let d = 0; d <= 7600; d += 25) h += `<i class="${d % 100 ? '' : 'mj'}" style="--d:${d}">${d % 100 ? '' : `<b>${d ? '-' + d.toLocaleString('en-US') : '0'}m</b>`}</i>`;
    ZONES.forEach(([d, name]) => h += `<em style="--d:${d}">${name}</em>`);
    el.innerHTML = `<div class="ruler-strip">${h}</div><div class="you"><span>YOU</span><i>◀</i></div>`;
    $('.world').appendChild(el);
    this.el = el; this.shown = this.you = 0; this.v = 0;
  },
  unmount() { this.el && this.el.remove(); this.el = null; },
  set(m) { this.you = m; },
  tick(dt) {
    if (!this.el) return;
    if (reduced) this.shown = this.you;
    else { const a = -60 * (this.shown - this.you) - 14 * this.v; this.v += a * dt; this.shown += this.v * dt; }   // YOU leads, the camera follows
    const p = OceanScene.ppm();
    this.el.style.setProperty('--ppm', p);
    this.el.firstChild.style.transform = `translateY(${-OceanScene.cam * p}px)`;
    this.el.lastChild.style.transform = `translateY(${OceanScene.yOf(this.shown)}px)`;
  },
};

/* ============ The mascot wanders on the left side of the water ============ */
const Wander = {
  t0: 0,
  tick(now) {
    const m = $('#mascot'); if (!m) return;
    const W = innerWidth, H = innerHeight, wl = OceanScene.yOf(0);
    const fx = (Math.sin(now / 7300) + Math.sin(now / 3100) * .35 + 1.35) / 2.7, fy = (Math.sin(now / 5200 + 1) + 1) / 2;
    const x = W * (.03 + fx * .17), yMin = Math.max(wl + 50, H * .3), y = yMin + fy * Math.max(0, H * .72 - yMin);
    const dx = Math.cos(now / 7300) + Math.cos(now / 3100) * .35;
    m.style.transform = `translate(${x}px, ${y}px) scaleX(${dx > 0 ? -1 : 1})`;
  },
};

/* ============ Run (dive.md §5) ============ */
const ROUND_MS = 25000, CATCH_MS = 6000;
const AUTOPLAY = /[?&]autoplay\b/.test(location.search);    // ?autoplay: the mock plays itself (demo + screenshots)
function autoAnswer(p) {
  if (!R || R.p !== p || R.locked) return;
  if (p.kind === 'odd') return pickOption(p.correct);
  if (p.kind === 'order') return lockOrder(p.items.map((_, k) => k));
  if (p.kind !== 'open') return submitGuess(p.answers[0].canonical);
  const want = ['solid', 'rare', 'deep', 'common'][R.i % 4], a = p.answers.find(x => x.tier === want) || p.answers[0];
  submitGuess(a.canonical);
}
let R = null, lastNow = 0;
function runEnter(root) {
  runLeave();
  root.innerHTML = Round.layout('Depth', 'Score');
  Round.dots(PROMPTS.length);
  $('#hudL').textContent = metres(0);
  renderMute();
  R = { i: -1, score: 0, results: [], locked: true, deadline: 0, lastSec: 99, catchTimer: 0 };
  OceanScene.jumpTo(-.62 * 520);                       // arrive from the sky, settle at the surface
  OceanScene.setProgress(0);
  Ruler.mount(); Ruler.set(0);
  Ticks.add(runTick);
  addEventListener('keydown', catchKey);
  setTimeout(() => R && showPrompt(0), reduced ? 0 : 900);
}
function runLeave() {
  if (R && R.catchTimer) clearTimeout(R.catchTimer);
  R = null; Ticks.delete(runTick); Ruler.unmount(); removeEventListener('keydown', catchKey);
  $('#mascot') && ($('#mascot').style.transform = '');
  if ($('#dock')) Round.cool();
}
function showPrompt(i) {
  const p = PROMPTS[i];
  Object.assign(R, { i, p, hint: false, locked: true, deadline: 0, lastSec: 99, catching: false });
  Round.position(i, PROMPTS.length, 'PROMPT');
  const single = p.kind !== 'open';
  Round.card({
    label: `PROMPT ${i + 1} OF ${PROMPTS.length}${single ? ' · ' + p.label : ''}`,
    badge: single ? tierBadge(p.tier) : '',
    text: p.text,
    kindLine: single
      ? (p.kind === 'order' || p.kind === 'odd' ? '▼ one try · no second chances ▼' : '▼ one answer · wrong guesses cost 3 s ▼')
      : '▼ rarer answers sink deeper ▼',
  });
  const pa = $('#playarea'); pa.classList.remove('fade');
  pa.innerHTML = TIER_ORDER.map(t => `<div class="tl" data-tier="${t}" style="top:${TIERS[t].frac * 100}%;--tc:${TIERS[t].color}">
    <span class="tag">${tierIcon(t)} ${TIERS[t].label} <span class="m">${TIERS[t].m.toLocaleString('en-US')}m</span></span></div>`).join('');
  markTarget();
  if (p.kind === 'odd') Kinds.options({ options: p.options, onPick: pickOption });
  else if (p.kind === 'order') Kinds.order({ items: p.items, lockLabel: 'LOCK IN ▼', onLock: lockOrder });
  else Kinds.typed({ placeholder: p.kind === 'open' ? 'type one answer…' : 'type the answer…', submitLabel: 'DIVE', onSubmit: submitGuess });
  if (p.hint) Kinds.hintButton({ costHtml: `${TIERS[p.tier].label} → ${p.tier === 'common' ? 'SHALLOWS ·5' : TIERS[BELOW[p.tier]].label}`, onUse: useHint });
  setTimeout(() => {                                             // the clock starts once the card has landed (start-prompt)
    if (!R || R.p !== p) return;
    R.locked = false; R.deadline = performance.now() + ROUND_MS; Kinds.focus();
    if (AUTOPLAY) setTimeout(() => autoAnswer(p), 1200);
  }, reduced ? 0 : 700);
}
function markTarget() {
  const p = R.p, target = p.kind === 'open' ? null : (R.hint ? dropTier(p.tier) : p.tier);
  $$('.tl').forEach(l => { l.classList.toggle('target', l.dataset.tier === target); l.classList.toggle('dim', !!target && l.dataset.tier !== target); });
}
const tierNow = () => R.hint ? dropTier(R.p.tier) : R.p.tier;
function useHint() {
  if (!R || R.locked) return false;
  R.hint = true;
  Kinds.showHint(R.p.hint);
  $('#cardBadge').innerHTML = tierBadge(dropTier(R.p.tier), R.p.tier);
  markTarget();
}
function submitGuess(raw) {
  if (!R || R.locked) return;
  const a = matchGuess(R.p, raw);
  if (!a) return wrongGuess(raw);
  if (R.p.kind === 'open') scoreIt(a.canonical, a.tier, TIERS[a.tier].pts, a);
  else scoreIt(a.canonical, tierNow(), singlePoints(R.p.tier, R.hint), a);
}
function wrongGuess(raw) {
  R.deadline -= 3000;
  Sound.play('wrong');
  Kinds.reject();
  Round.correction(`<b>${escapeHtml(raw)}</b> · not in your notes`);
  Round.penalty(3, ROUND_MS);
}
function pickOption(choice) {
  if (!R || R.locked) return false;
  Kinds.markOptions(choice, R.p.correct);
  if (choice === R.p.correct) scoreIt(R.p.correct, tierNow(), singlePoints(R.p.tier, R.hint), R.p.answers[0]);
  else oneTryMiss(`One try · it was <b>${escapeHtml(R.p.correct)}</b>`);
}
function lockOrder(order) {
  if (!R || R.locked) return false;
  if (order.every((k, i) => k === i)) scoreIt('Correct order', tierNow(), singlePoints(R.p.tier, R.hint), R.p.answers[0]);
  else oneTryMiss('One try · not quite the right order');
}

/* Correct: the chip sinks past the tier lines → the camera descends 10 m per point → the catch screen */
function scoreIt(label, tier, pts, found) {
  R.locked = true; Round.cool();
  const hinted = R.hint;
  R.results.push({ p: R.p, answer: label, tier, points: pts, hint: hinted, found });
  const before = R.score; R.score += pts;
  Sound.play('correct', TIERS[tier].band);
  sinkChip(label, tier, pts, () => {
    if (!R) return;
    Round.slam($('#hudR'), R.score);
    Round.dot(R.i, 'done');
    Stage.react('correct');
    setTimeout(() => {
      if (!R) return;
      Round.clearStage();
      Sound.play('sink');
      OceanScene.setProgress(R.score * 10);             // the real descent: camera + ruler + YOU marker
      Ruler.set(R.score * 10);
      Round.count($('#hudL'), before, R.score, metres, { stiffness: 26, damping: 9.4 });
      setTimeout(() => R && showCatch({ label, tier, pts, hinted }), reduced ? 0 : 650);
    }, reduced ? 0 : 380);
  });
}
function sinkChip(label, tier, pts, onLand) {
  const area = $('#playarea'), H = area.clientHeight;
  const chip = Round.resultChip(area, { label, color: TIERS[tier].color, top: tier === 'rare' });
  const ch = chip.offsetHeight, target = TIERS[tier].frac * H - ch - 8;
  const lines = $$('.tl', area).map(l => ({ el: l, y: parseFloat(l.style.top) / 100 * H }));
  const r = area.getBoundingClientRect();
  Particles.emit(r.left + r.width / 2, r.top + 10, tier === 'rare' ? 24 : 8, tier === 'rare' ? 'rgba(255,209,102,.9)' : undefined);
  spring({ from: -ch, to: target, stiffness: 120, damping: 14,
    onUpdate: v => {
      chip.style.transform = `translate(-50%, ${v}px)`;
      lines.forEach(l => { if (!l.el.classList.contains('passed') && v + ch >= l.y - 10) { l.el.classList.add('passed'); Sound.tone(300 + l.y, .05, 'triangle', .03); } });
    },
    onRest: () => {
      chip.insertAdjacentHTML('beforeend', `<span class="pts">+${pts}${R && R.hint ? '<small>HINT</small>' : ''}</span>`);
      if (tier === 'rare') Stage.flash();
      const cr = chip.getBoundingClientRect(); Particles.emit(cr.left + cr.width / 2, cr.top, 6);
      onLand();
    } });
}

/* The catch screen (Krillion image 3). The clock is paused: the next Prompt's clock only starts after DESCEND. */
function showCatch({ label, tier, pts, hinted }) {
  const T = TIERS[tier], el = $('#catch');
  R.catching = true;
  el.style.setProperty('--tc', T.color);
  el.innerHTML = `<div class="catch-body">
      <div class="c-icon">${px(CATCH_SPRITES[tier], INK, 5)}</div>
      <div class="c-tier">${T.label}</div>
      <div class="c-ans">“${escapeHtml(label)}”</div>
      <div class="c-pts"><span>+${pts} PTS</span> · sink ${(pts * 10).toLocaleString('en-US')}m</div>
      <div class="c-verdict">${hinted ? 'Hint used · dropped one tier. ' : ''}${T.verdict}</div>
    </div>
    <div class="c-go">
      <button class="px descend-btn" id="descendBtn">DESCEND <span>▼</span></button>
      <div class="c-auto" aria-hidden="true"><i id="autoBar"></i></div>
      <div class="micro">ENTER TO CONTINUE · AUTO IN 6 S</div>
    </div>`;
  el.classList.add('on');
  $('#dock').classList.add('away');
  const bar = $('#autoBar');
  requestAnimationFrame(() => { bar.style.transition = `width ${CATCH_MS}ms linear`; bar.style.width = '0%'; });
  $('#descendBtn').onclick = continueDive;
  setTimeout(() => $('#descendBtn') && $('#descendBtn').focus({ preventScroll: true }), 50);
  R.catchTimer = setTimeout(continueDive, AUTOPLAY ? 2600 : CATCH_MS);
  if (tier === 'rare' || tier === 'deep') { const r = $('.c-icon').getBoundingClientRect(); Particles.emit(r.left + r.width / 2, r.top + r.height / 2, tier === 'rare' ? 26 : 12, tier === 'rare' ? 'rgba(255,209,102,.9)' : 'rgba(157,123,255,.9)'); }
}
function catchKey(e) {
  if (!R || !R.catching || e.key !== 'Enter' || e.repeat) return;
  e.preventDefault(); continueDive();
}
function continueDive() {
  if (!R || !R.catching) return;
  R.catching = false; clearTimeout(R.catchTimer);
  const el = $('#catch'); el.classList.remove('on'); el.classList.add('off');
  setTimeout(() => { el.classList.remove('off'); el.innerHTML = ''; }, 300);
  $('#dock').classList.remove('away');
  advance(0);
}
function oneTryMiss(msg) {
  R.locked = true; Round.cool();
  R.results.push({ p: R.p, answer: null, tier: null, points: 0, hint: R.hint });
  Sound.play('wrong'); Stage.react('miss');
  Round.correction(msg);
  restart($('#card'), 'shake');
  Round.dot(R.i, 'miss');
  setTimeout(() => advance(), 1800);
}
function timeout() {
  R.locked = true; Round.cool();
  R.results.push({ p: R.p, answer: null, tier: null, points: 0, hint: R.hint });
  Sound.play('timeout'); Stage.react('miss');
  Round.stamp('TIME!');
  Round.dot(R.i, 'miss');
  Kinds.disableAll();
  setTimeout(() => advance(), 1400);
}
function advance(delay = 550) {
  if (!R) return;
  Round.leaveCard();
  setTimeout(() => {
    if (!R) return;
    if (R.i + 1 < PROMPTS.length) return showPrompt(R.i + 1);
    const results = R.results; runLeave(); go('reveal', { results });
  }, reduced ? 0 : delay);
}
function runTick(now) {
  const dt = Math.min(.05, (now - (lastNow || now)) / 1000); lastNow = now;
  Ruler.tick(dt); Wander.tick(now);
  if (!R || R.locked || !R.deadline) return;
  const rem = Math.max(0, R.deadline - now);
  const { sec, hot } = Round.timer(rem, ROUND_MS);
  if (hot && sec !== R.lastSec && sec > 0) Sound.play('ping');
  R.lastSec = sec;
  if (rem <= 0) timeout();
}

/* ============ Reveal (dive.md §6, Krillion image 4) ============ */
const PAST_SCORES = [60, 85, 90, 110, 120, 95, 140, 70, 105, 130, 80, 150, 100, 115, 75];      // your past dives on this Game
const TODAY = (() => { let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; return Array.from({ length: 400 }, () => Math.max(0, Math.min(700, 250 + (r() + r() + r() - 1.5) * 220))); })();
function revealLeave() { OceanScene.setFollow(null); Ticks.delete(revealTick); }
function revealTick(now) { Wander.tick(now); }
function revealEnter(root, opts = {}) {
  revealLeave();
  const res = opts.results || DEMO_RESULTS, fresh = !!opts.results;
  const total = res.reduce((s, r) => s + r.points, 0), pbPrev = PB_RUN.reduce((a, b) => a + b, 0);
  const band = Math.max(0, BEARING.findIndex(b => total >= b.lo && total <= b.hi));
  /* the camera starts at your final depth, then surfaces into the dusk; scrolling the column dives again a little */
  OceanScene.jumpTo(OceanScene.camFor(total * 10));
  const top = -.55 * 520;
  setTimeout(() => OceanScene.setFollow(() => top + scrollY / OceanScene.ppm() * .65), reduced ? 0 : 500);
  Ticks.add(revealTick);
  root.innerHTML = `<div class="kr-col">
    <div class="kr-top"><span class="logo tiny">SYLLABYSS</span><span class="plabel">DIVE #12 COMPLETE</span></div>
    <div class="kr-score"><span id="rvScore">0</span><span class="glow-signal" id="rvDepth">0m</span></div>
    <div class="kr-sub">GRAPHS MIDTERM${fresh ? '' : ' · DEMO RESULTS'}</div>
    ${total > pbPrev ? Results.banner('NEW PERSONAL BEST') : `<div class="plabel" style="margin-top:8px">PERSONAL BEST <span class="glow-reward">${depth(pbPrev)}</span></div>`}
    <div class="dist-tabs" role="tablist"><button class="chip band all on" data-dist="mine" role="tab">YOUR DIVES</button><button class="chip band" data-dist="daily" role="tab" style="--tc:var(--signal)">TODAY'S PLAYERS (DAILY)</button></div>
    <div id="distSlot"></div>
    ${Results.section('Dive log', 'deeper = rarer', diveLog(res), .15)}
    ${Results.section('Mastery', '', `<div class="mastery"><span class="pct">31% → <span class="glow-reward">34%</span></span>${UI.meter(4, 10, 1)}<span class="micro">+3 new answers found</span></div>`, .25)}
    ${Results.section('The bearing', '', Results.bandTable(BEARING.map(b => ({ color: TIERS[b.tier].color, icon: tierIcon(b.tier), range: `${b.lo}–${b.hi}`, text: b.text })), band), .35)}
    ${Results.section('The catch', 'tap a prompt for every answer', '<div id="catchSlot"></div>', .45)}
    <div class="endbtns"><button class="px descend-btn big" id="againBtn">▼ DIVE AGAIN ▼</button><button class="px btn" data-go="game">BACK</button></div>
  </div>
  <div class="rv-tiles"><button class="px tile-sm" data-mute aria-label="Mute sound"></button><button class="px tile-sm" data-menu aria-label="Menu">${icon('menu', 3)}</button></div>`;
  renderMute();
  const dist = which => $('#distSlot').innerHTML = which === 'daily'
    ? Results.distribution({ samples: TODAY, you: total, caption: p => `BETTER THAN ${p}% OF TODAY'S PLAYERS` })
    : Results.distribution({ samples: PAST_SCORES, you: total, best: pbPrev, caption: p => `BETTER THAN ${p}% OF YOUR DIVES ON THIS GAME` });
  dist('mine');
  $$('[data-dist]').forEach(b => b.onclick = () => { $$('[data-dist]').forEach(x => x.classList.toggle('on', x === b)); dist(b.dataset.dist); });
  $('#catchSlot').appendChild(Results.list(res.map(r => ({
    q: r.p.text, icon: tierIcon(r.tier || 'miss'), answer: r.answer, points: r.points, color: r.tier ? TIERS[r.tier].color : 'var(--band-miss)',
    tags: (r.hint ? '<span class="badge hint">HINT</span>' : '') + (r.rep ? '<span class="badge rep">REPEAT ÷2</span>' : ''),
  })), i => catchDetail(res[i])));
  $('#againBtn').onclick = () => go('run');
  spring({ from: 0, to: total, stiffness: 40, damping: 12, onUpdate: v => { $('#rvScore').textContent = Math.max(0, Math.round(v)); $('#rvDepth').textContent = depth(Math.max(0, v)); } });
}
/* DIVE LOG · deeper = rarer: one dropline per Prompt down to the depth it earned, with its creature */
function diveLog(res) {
  const w = 560, h = 230, padL = 46, padR = 14, padT = 14, padB = 26, maxM = 1000;
  const X = i => padL + (i + .5) * (w - padL - padR) / res.length, Y = m => padT + m / maxM * (h - padT - padB);
  let g = '';
  for (let m = 0; m <= maxM; m += 250) g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(m)}" y2="${Y(m)}" style="stroke:var(--muted)" stroke-opacity=".14" stroke-dasharray="3 5"/><text x="${padL - 8}" y="${Y(m) + 4}" font-size="13" text-anchor="end" style="fill:var(--muted)">${m ? '-' + m : '0m'}</text>`;
  res.forEach((r, i) => {
    g += `<text x="${X(i)}" y="${h - 6}" font-size="13" text-anchor="middle" style="fill:var(--muted)">${i + 1}</text>`;
    const m = r.points * 10, c = r.tier ? TIERS[r.tier].color : 'var(--band-miss)';
    if (m > 0) g += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(m)}" stroke-width="2" style="stroke:${c};transform-origin:${X(i)}px ${Y(0)}px;transform-box:view-box;animation:dropline-grow .6s var(--ease-out) ${.3 + i * .1}s backwards"/>`;
    const ic = px(TIER_ICONS[r.tier || 'common'], INK, 2).replace('<svg ', `<svg x="${X(i) - 8}" y="${Y(m) - 7}" style="color:${c};${r.tier ? `filter:drop-shadow(0 0 4px ${c})` : 'opacity:.5'}" `);
    g += ic;
  });
  return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" font-family="VT323, monospace" role="img" aria-label="Depth earned on each prompt">${g}</svg></div>`;
}
function catchDetail(r) {
  const p = r.p;
  if (p.kind !== 'open') {
    const a = p.answers[0];
    const shown = p.kind === 'odd' ? escapeHtml(p.correct) : p.kind === 'order' ? p.items.map((t, k) => `${k + 1}. ${escapeHtml(t)}`).join('<br>') : escapeHtml(a.canonical);
    return `<div class="single"><div class="micro">Answer</div><div style="font-size:24px;color:var(--reward)">${shown}</div>
      <div class="read" style="color:var(--text)">${escapeHtml(p.explanation)}</div>${UI.evidence(SRC, a.page, a.quote)}</div>`;
  }
  const sorted = p.answers.slice().sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier));
  return `<div class="filters"><button class="chip band all on" data-f="all">ALL ${p.answers.length}</button>${TIER_ORDER.slice().reverse().map(t =>
      `<button class="chip band" data-f="${t}" style="--tc:${TIERS[t].color}">${TIERS[t].label} ${p.answers.filter(a => a.tier === t).length}</button>`).join('')}</div>
    <input class="search" placeholder="Search all answers…" aria-label="Search answers">
    <div>${sorted.map(a => `<div class="arow ${r.found === a ? '' : 'miss'}" data-b="${a.tier}" data-n="${norm(a.canonical)}" style="--tc:${TIERS[a.tier].color}">
      ${tierIcon(a.tier)}<span class="nm">${escapeHtml(a.canonical)}${r.found === a ? '<span class="ok">✓ yours</span>' : ''}</span><span class="pt">+${TIERS[a.tier].pts}</span>${UI.evidence(SRC, a.page, a.quote)}</div>`).join('')}</div>`;
}

/* ============ Game page stats (dive.md §4): rendered inside the site's Game page, in Dive's theme ============ */
function gameStats(g) {
  const found = g.found || { common: [9, 11], solid: [6, 14], deep: [2, 9], rare: [1, 12] };
  return `<div class="panel stat"><span class="micro">Personal best</span><span class="big glow-reward">${depth(g.best)}</span><span class="micro">${g.best} pts</span></div>
    <div class="panel stat" style="animation-delay:.06s"><span class="micro">Mastery</span><span class="big">${g.mastery * 10 + 1}%</span>${UI.meter(g.mastery)}</div>
    <div class="panel stat" style="animation-delay:.12s"><span class="micro">Found</span><div style="display:grid;gap:6px">${TIER_ORDER.map(t =>
      `<div style="display:flex;gap:8px;align-items:center;color:${TIERS[t].color}">${tierIcon(t)}<span>${TIERS[t].label}</span><span style="margin-left:auto;color:var(--text)">${found[t][0]}/${found[t][1]}</span></div>`).join('')}</div></div>`;
}

/* ============ Register the Mode ============ */
const DIVE = {
  id: 'dive',
  name: 'Dive',
  tagline: 'Name it fast. Rarer answers sink deeper.',
  accent: '#4de3ff',
  icon: s => `<span style="color:#4de3ff">${px(ICONS.down, INK, s)}</span>`,
  theme: 'dive',
  cameras: { game: 'surface', run: 'descent', reveal: 'deep' },
  copy: { play: '▼ BEGIN DESCENT ▼', again: '▼ DIVE AGAIN ▼', runNoun: 'dive' },
  formatScore: depth,
  gameStats,
  run: { enter: runEnter, leave: runLeave },
  reveal: { enter: revealEnter, leave: revealLeave },
};
registerMode(DIVE);
