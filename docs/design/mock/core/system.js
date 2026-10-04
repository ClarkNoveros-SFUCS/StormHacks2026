'use strict';
/* Design-system core (docs/design/design-system.md): helpers, sprites, sound events, physics,
   the stage, the theme and Mode registries, the router, and the round/results building blocks.
   Nothing in this file knows about a specific Mode. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const restart = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

/* ============ Pixel sprites: string maps rendered as crisp SVG rects ============ */
function px(map, pal, s = 3) {
  const h = map.length, w = Math.max(...map.map(r => r.length));
  let r = '';
  map.forEach((row, y) => [...row].forEach((c, x) => { if (pal[c]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[c]}"/>`; }));
  return `<svg class="pxi" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
const INK = { X: 'currentColor', H: '#e8f1ff', E: '#050a14' };
const ICONS = {
  doc: ['XXXX..', 'X..XX.', 'X...XX', 'X.XX.X', 'X....X', 'X.XX.X', 'XXXXXX'],
  menu: ['XXXXXXX', '.......', 'XXXXXXX', '.......', 'XXXXXXX'],
  sound: ['...X.....', '..XX..X..', 'XXXX...X.', 'XXXX.X.X.', 'XXXX...X.', '..XX..X..', '...X.....'],
  muted: ['...X.....', '..XX.....', 'XXXX.X.X.', 'XXXX..X..', 'XXXX.X.X.', '..XX.....', '...X.....'],
  grid: ['XX.XX', 'XX.XX', '.....', 'XX.XX', 'XX.XX'],
  down: ['..X..', '..X..', '..X..', 'X.X.X', '.XXX.', '..X..'],
  log: ['XXXXX', 'X...X', 'XXXXX', 'X...X', 'XXXXX'],
  q: ['.XXX.', 'X...X', '...X.', '..X..', '.....', '..X..'],
  lock: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'XX.XX', 'XXXXX'],
};
const icon = (name, s = 2) => px(ICONS[name], INK, s);

/* ============ Registries: themes and Game Modes plug in here ============ */
const Themes = {};   // id -> { scene, mascot: { map, pal, scale }, sounds: { event: fn }, particle: color }
const Modes = {};    // id -> { id, name, tagline, icon, accent, theme, copy, cameras, gameStats, run, reveal, ... }
function registerTheme(id, def) { Themes[id] = def; }
function registerMode(def) { Modes[def.id] = def; }

/* ============ Sound (§5.3): Modes fire events, the active theme's voice plays them ============ */
const Sound = {
  ac: null,
  muted: store.get('sfx-muted') === '1',
  unlock() { if (!this.ac) try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} },
  tone(f, dur, type = 'square', vol = .05, slide = 0, delay = 0) {
    const ac = this.ac; if (!ac || this.muted) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  },
  play(event, arg) {
    if (!this.ac || this.muted) return;
    const voice = (Themes[Stage.theme] || {}).sounds || {};
    (voice[event] || DEFAULT_VOICE[event] || (() => {}))(arg);
  },
};
const DEFAULT_VOICE = {
  correct(band = 1) { const f = [0, 523, 659, 784, 988][band] || 523; Sound.tone(f, .1); Sound.tone(f * 1.5, .16, 'square', .05, 0, .08); },
  wrong() { Sound.tone(150, .2, 'square', .06, .55); },
  ping() { Sound.tone(1320, .07, 'sine', .05); },
  timeout() { Sound.tone(440, .55, 'sawtooth', .04, .35); },
  tick() { Sound.tone(240, .025, 'square', .018); },
  hover() { Sound.tone(1400, .035, 'sine', .015); },
  click() { Sound.tone(520, .06, 'square', .035, 1.5); },
  pop() { Sound.tone(300, .08, 'sine', .06, 3); },
  sink() { Sound.tone(300, .9, 'sine', .04, .3); Sound.tone(180, .9, 'triangle', .02, .5, .05); },
  reward() { [523, 659, 784, 1047].forEach((f, i) => Sound.tone(f, .18, 'triangle', .05, 0, i * .07)); },
  levelup() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => Sound.tone(f, .16, 'square', .035, 0, i * .08)); },
};
let lastHover = 0;
addEventListener('pointerdown', () => Sound.unlock(), { once: true });
addEventListener('keydown', () => Sound.unlock(), { once: true });
document.addEventListener('pointerover', e => {                    // soft UI blips on the site
  if (document.body.dataset.world !== 'site' || !e.target.closest('button, a, .hov')) return;
  const now = performance.now(); if (now - lastHover < 70) return; lastHover = now; Sound.play('hover');
});
document.addEventListener('click', e => {
  if (e.target.closest('button, a') && document.body.dataset.world === 'site') Sound.play('click');
  if (e.target.closest('[data-mute]')) { Sound.muted = !Sound.muted; store.set('sfx-muted', Sound.muted ? '1' : '0'); Sound.unlock(); renderMute(); }
  if (e.target.closest('[data-menu]')) $('#menu').classList.add('open');
});
function renderMute() { $$('[data-mute]').forEach(b => { b.innerHTML = icon(Sound.muted ? 'muted' : 'sound', 2); b.setAttribute('aria-pressed', Sound.muted); b.setAttribute('aria-label', Sound.muted ? 'Unmute sound' : 'Mute sound'); }); }

/* ============ Physics (§5.2) ============ */
function spring({ from, to, stiffness = 170, damping = 18, onUpdate, onRest }) {
  if (reduced) { onUpdate(to); onRest && onRest(); return () => {}; }
  let x = from, v = 0, last = performance.now(), raf;
  const step = now => {
    const dt = Math.min(.032, (now - last) / 1000); last = now;
    v += (-stiffness * (x - to) - damping * v) * dt; x += v * dt;
    onUpdate(x);
    if (Math.abs(v) < .02 && Math.abs(x - to) < .02) { onUpdate(to); onRest && onRest(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
const Particles = {
  list: [],
  emit(x, y, n, color) {
    if (reduced) return;
    const c = color || (Themes[Stage.theme] || {}).particle || 'rgba(200,235,255,.8)';
    for (let i = 0; i < n; i++) this.list.push({ x: x + (Math.random() - .5) * 20, y, vx: (Math.random() - .5) * 24, vy: -(30 + Math.random() * 30),
      life: 1.2 + Math.random() * .8, age: 0, s: 2 + Math.floor(Math.random() * 3), c, ph: Math.random() * 6 });
  },
  step(ctx, dt) {
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.age += dt;
      if (b.age > b.life) { this.list.splice(i, 1); continue; }
      b.vy -= 20 * dt;                               // buoyancy
      b.vx *= 1 - .9 * dt; b.vy *= 1 - .27 * dt;     // drag
      b.x += b.vx * dt + Math.sin(b.age * 6 + b.ph) * .35;
      b.y += b.vy * dt;
      ctx.globalAlpha = 1 - b.age / b.life;
      ctx.strokeStyle = b.c; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(b.x) + .5, Math.round(b.y) + .5, b.s * 2, b.s * 2);
    }
    ctx.globalAlpha = 1;
  },
};

/* ============ Stage (§3): one persistent backdrop; themes supply the scene ============ */
const Stage = {
  theme: null, camera: 'surface', progress: 0,
  set(theme, camera) {
    if (theme !== this.theme) {
      this.theme = theme; this.renderMascot();
      const t = Themes[theme] || {};
      t.scene && t.scene.resize && t.scene.resize();           // scenes share the #scene canvas
      document.body.dataset.world = t.world || 'mode';         // 'site' (the house) or 'mode' (a Mode's screens)
    }
    this.camera = camera;
    document.body.dataset.theme = theme;
    document.body.dataset.camera = camera;
    const sc = (Themes[theme] || {}).scene;
    sc && sc.setCamera && sc.setCamera(camera);
  },
  setProgress(v) { this.progress = v; const sc = (Themes[this.theme] || {}).scene; sc && sc.setProgress && sc.setProgress(v); },
  renderMascot() { const m = (Themes[this.theme] || {}).mascot; $('#mascot').innerHTML = m ? px(m.map, m.pal, m.scale || 4) : ''; },
  react(kind) { restart($('#mascot'), kind); setTimeout(() => $('#mascot').classList.remove(kind), 1300); },
  edge(on) { $('#edge').classList.toggle('on', !!on); },
  flash() { restart($('#flash'), 'go'); },
  zap() { restart($('#crt'), 'zap'); },
};

/* ============ Router: shell screens and Mode screens ============ */
const Router = { current: null, screens: {} };
function defineScreen(name, def) { Router.screens[name] = def; }   // def: { camera, theme, enter(opts), leave() }; camera/theme may be functions
function go(name, opts = {}) {
  const s = Router.screens[name]; if (!s) return;
  const prev = Router.screens[Router.current];
  if (prev && prev.leave && Router.current !== name) prev.leave();
  Router.current = name;
  $$('.screen').forEach(el => el.classList.toggle('active', el.id === 's-' + name));
  const val = v => typeof v === 'function' ? v() : v;
  Stage.set(val(s.theme), val(s.camera));
  document.body.dataset.screen = name;
  $$('.mocknav button').forEach(b => b.classList.toggle('cur', b.dataset.go === name));
  $$('.snav a').forEach(b => b.classList.toggle('cur', b.dataset.go === name));
  $$('.modal').forEach(m => m.classList.remove('open'));
  if (document.body.dataset.world === 'mode') Stage.zap();
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  scrollTo(0, 0);
  s.enter && s.enter(opts);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]'); if (t) { e.preventDefault(); Sound.unlock(); go(t.dataset.go); }
  if (e.target.closest('[data-close]')) e.target.closest('.modal').classList.remove('open');
  if (e.target.classList.contains('modal')) e.target.classList.remove('open');
});
addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal').forEach(m => m.classList.remove('open')); });

/* ============ Shared component builders (§6) ============ */
const UI = {
  meter(on, total = 10, fresh = 0) {
    return `<div class="meter">${Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''} ${i >= on - fresh && i < on ? 'new' : ''}" style="animation-delay:${(i - on + fresh) * .12 + .6}s"></i>`).join('')}</div>`;
  },
  pill(s) { return `<span class="pill ${s}">${{ uploading: 'UPLOADING', parsing: 'PARSING…', ready: 'READY', failed: 'FAILED', generating: 'GENERATING…' }[s]}</span>`; },
  modeBadge(mode) { return `<span class="mode-badge" style="--mc:${mode.accent}">${mode.icon(2)} ${mode.name.toUpperCase()}</span>`; },
  evidence(doc, page, quote) { return `<div class="ev read">${icon('doc')} ${escapeHtml(doc)} · p.${page} — “${escapeHtml(quote)}”</div>`; },
};

/* Round building blocks (§6.12–19). A Mode renders these into its Run screen. */
const Round = {
  /* Krillion layout: three HUD plates centred at the top, menu/mute tiles under them at the sides,
     the card just under the waterline, a free play area, and the bottom dock (sonar timer, input + fuse, button). */
  layout(left, right) {
    return `<div class="run">
      <div class="hud">
        <div class="plate l"><span class="plabel">${left}</span><span class="hud-num glow-signal" id="hudL">0</span></div>
        <div class="hud-mid"><div class="dots" id="dots"></div><div class="plabel" id="pos"></div></div>
        <div class="plate r"><span class="plabel">${right}</span><span class="hud-num glow-accent" id="hudR">0</span></div>
      </div>
      <button class="px tile-sm run-tile run-menu" data-menu aria-label="Menu">${icon('menu', 3)}</button>
      <button class="px tile-sm run-tile run-mute" data-mute aria-label="Mute sound"></button>
      <div class="under-water"></div>
      <div class="cardwrap" id="cardwrap"></div>
      <div class="playarea" id="playarea"></div>
      <div class="catch" id="catch" aria-live="polite"></div>
      <div class="dock" id="dock">
        <div class="timer"><div class="scope" id="scope"><div class="core"><div class="sweep"></div></div><span class="digits glow-signal" id="digits">25</span></div></div>
        <div id="inputArea"></div>
        <div class="actions" id="actions"></div>
      </div>
    </div>`;
  },
  dots(n) { $('#dots').innerHTML = '<i></i>'.repeat(n); },
  dot(i, state) { const d = $$('#dots i')[i]; if (!d) return; d.classList.remove('cur', 'done', 'miss'); d.classList.add(state); },
  position(i, n, noun) { $$('#dots i').forEach((d, k) => { if (k === i) d.classList.add('cur'); }); $('#pos').textContent = `${noun} ${i + 1} OF ${n}`; },
  card({ label, badge = '', text, kindLine }) {
    $('#cardwrap').innerHTML = `<div class="card" id="card"><div class="rnd"><span>${label}</span><span id="cardBadge">${badge}</span></div>
      <div class="prompt">${escapeHtml(text)}</div><div class="kind">${kindLine}</div><div id="hintSlot"></div></div>`;
  },
  /* fade the card and the play area out (a Mode's catch/celebration screen takes over) */
  clearStage() { const c = $('#card'); c && c.classList.add('gone'); const p = $('#playarea'); p && p.classList.add('fade'); },
  stamp(text) { const c = $('#card'); if (!c) return; c.insertAdjacentHTML('beforeend', `<div class="stamp">${text}</div>`); restart(c, 'shake'); },
  leaveCard() { const c = $('#card'); c && c.classList.add('gone'); },
  timer(rem, total) {
    const sec = Math.ceil(rem / 1000), hot = rem <= 5000;
    $('#digits').textContent = sec;
    $('#scope').style.setProperty('--p', rem / total);
    const fz = $('#fuse'); if (fz) fz.style.width = (rem / total * 100) + '%';
    $('#dock').classList.toggle('hot', hot && rem > 0);
    Stage.edge(hot && rem > 0);
    return { sec, hot };
  },
  cool() { $('#dock') && $('#dock').classList.remove('hot'); Stage.edge(false); },
  penalty(seconds, total) {
    const t = $('.timer'); t.insertAdjacentHTML('beforeend', `<span class="minus">−${seconds}s</span>`); setTimeout(() => t.querySelector('.minus')?.remove(), 900);
    const fz = $('.fuse'), fill = $('#fuse'); if (!fz || !fill) return;
    const w = seconds * 1000 / total * fz.clientWidth, left = Math.max(0, fill.clientWidth - w);
    fz.insertAdjacentHTML('beforeend', `<b style="left:${left}px;width:${w}px"></b>`); setTimeout(() => fz.querySelector('b')?.remove(), 700);
  },
  correction(html) { const c = $('#correction'); if (c) c.innerHTML = html; },
  count(el, from, to, fmt, opts = {}) {
    return spring({ from, to, stiffness: opts.stiffness || 90, damping: opts.damping || 16, onUpdate: v => { el.textContent = fmt(v); restart(el, 'crank'); } });
  },
  slam(el, text) { el.textContent = text; restart(el, 'slam'); },
  resultChip(container, { label, color, top }) {
    const chip = document.createElement('div');
    chip.className = 'rchip' + (top ? ' top' : '');
    chip.style.setProperty('--cc', color);
    chip.textContent = label;
    container.appendChild(chip);
    return chip;
  },
};

/* Results building blocks (§6.20–24) */
const Results = {
  header({ kicker, score, secondaryId, banner }) {
    return `<div class="micro">${kicker}</div>
      <div class="rv-head"><span class="rv-score" id="rvScore">0</span><span class="glow-signal" style="font-size:22px" id="${secondaryId}"></span></div>${banner || ''}`;
  },
  banner(text) { return `<div class="pb-banner">★ ${text}</div>`; },
  section(label, small, body, delay) { return `<div class="sect" style="animation-delay:${delay}s"><div class="label">${label}${small ? ` <small>${small}</small>` : ''}</div>${body}</div>`; },
  /* series: per-round points; colors: per-round band colour; ghosts/best: per-round points; toY: points -> axis value; unitLabel(v) */
  chart({ series, colors, ghosts, best, toAxis, tick, tickLabel, legend }) {
    const w = 640, h = 250, padL = 52, padR = 16, padT = 14, padB = 26, n = series.length;
    const cum = arr => arr.reduce((a, p) => (a.push(a[a.length - 1] + p), a), [0]);
    const mine = cum(series), gh = ghosts.map(cum), pb = cum(best);
    const max = Math.max(...mine, ...gh.flat(), ...pb, 30) * 1.12;
    const x = i => padL + i * (w - padL - padR) / n, y = p => padT + p / max * (h - padT - padB);
    const line = c => c.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    let g = '';
    for (let v = 0; v <= toAxis(max); v += tick) { const p = v / toAxis(1); g += `<line x1="${padL}" x2="${w - padR}" y1="${y(p)}" y2="${y(p)}" style="stroke:var(--muted)" stroke-opacity=".14" stroke-dasharray="3 5"/><text x="${padL - 8}" y="${y(p) + 4}" style="fill:var(--muted)" font-size="13" text-anchor="end">${tickLabel(v)}</text>`; }
    for (let i = 1; i <= n; i++) g += `<text x="${x(i)}" y="${h - 6}" style="fill:var(--muted)" font-size="13" text-anchor="middle">${i}</text>`;
    let steps = '';
    series.forEach((_, i) => {
      const c = colors[i];
      steps += `<line x1="${x(i)}" y1="${y(mine[i])}" x2="${x(i + 1)}" y2="${y(mine[i])}" style="stroke:var(--signal)" stroke-width="2" opacity=".55"/>`;
      steps += `<line x1="${x(i + 1)}" y1="${y(mine[i])}" x2="${x(i + 1)}" y2="${y(mine[i + 1])}" stroke-width="4" style="stroke:${c};transform-origin:${x(i + 1)}px ${y(mine[i])}px;transform-box:view-box;animation:dropline-grow .5s var(--ease-out) ${.4 + i * .12}s backwards"/>`;
      steps += `<rect x="${x(i + 1) - 4}" y="${y(mine[i + 1]) - 4}" width="8" height="8" style="fill:${c};filter:drop-shadow(0 0 4px ${c});animation:rise-in .4s var(--ease-snap) ${.5 + i * .12}s backwards"/>`;
    });
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" font-family="VT323, monospace" role="img" aria-label="Score after each round compared with your personal best and recent runs">
      ${g}${gh.map(c => `<polyline points="${line(c)}" fill="none" style="stroke:var(--muted)" stroke-opacity=".45" stroke-width="1.5"/>`).join('')}
      <polyline points="${line(pb)}" fill="none" style="stroke:var(--reward)" stroke-width="2" stroke-dasharray="6 5" opacity=".9"/>${steps}</svg>
      <div class="legend micro"><span style="color:var(--signal)"><i></i>${legend[0]}</span><span style="color:var(--reward)"><i style="border-top-style:dashed"></i>${legend[1]}</span><span style="color:var(--muted)"><i></i>${legend[2]}</span></div></div>`;
  },
  /* Distribution of scores (Krillion's bell curve): samples -> smoothed curve, YOU marker, optional PB marker.
     Module Games compare with your own past Runs; public Games (Daily, Courses) with today's players. */
  distribution({ samples, you, best, max = 700, caption }) {
    const w = 560, h = 150, padL = 4, padR = 4, padT = 10, padB = 24, bw = max / 14;
    const xs = Array.from({ length: 71 }, (_, i) => i * max / 70);
    const dens = xs.map(x => samples.reduce((a, s) => a + Math.exp(-((x - s) ** 2) / (2 * bw * bw)), 0));
    const top = Math.max(...dens) || 1;
    const X = v => padL + v / max * (w - padL - padR), Y = d => padT + (1 - d / top) * (h - padT - padB);
    const line = xs.map((x, i) => `${X(x).toFixed(1)},${Y(dens[i]).toFixed(1)}`).join(' ');
    const at = v => { const i = Math.min(70, Math.round(v / max * 70)); return Y(dens[i]); };
    let axis = ''; for (let v = 0; v <= max; v += 100) axis += `<text x="${X(v)}" y="${h - 6}" font-size="13" text-anchor="middle" style="fill:var(--muted)">${v}</text><line x1="${X(v)}" x2="${X(v)}" y1="${h - padB}" y2="${h - padB + 4}" style="stroke:var(--muted)" stroke-opacity=".5"/>`;
    const pct = Math.round(samples.filter(s => s < you).length / samples.length * 100);
    return `<div class="dist"><svg viewBox="0 0 ${w} ${h}" font-family="VT323, monospace" role="img" aria-label="${caption(pct)}">
      <polygon points="${X(0)},${h - padB} ${line} ${X(max)},${h - padB}" style="fill:var(--signal)" fill-opacity=".09"/>
      <polyline points="${line}" fill="none" style="stroke:var(--signal)" stroke-width="2" class="dist-line"/>
      <line x1="${padL}" x2="${w - padR}" y1="${h - padB}" y2="${h - padB}" style="stroke:var(--muted)" stroke-opacity=".4"/>${axis}
      ${best != null ? `<line x1="${X(best)}" x2="${X(best)}" y1="${padT}" y2="${h - padB}" style="stroke:var(--reward)" stroke-dasharray="4 4" opacity=".8"/><text x="${X(best) + 4}" y="${padT + 10}" font-size="13" style="fill:var(--reward)">PB</text>` : ''}
      <line x1="${X(you)}" x2="${X(you)}" y1="${at(you)}" y2="${h - padB}" style="stroke:var(--accent)" stroke-width="2"/>
      <rect x="${X(you) - 4}" y="${at(you) - 4}" width="8" height="8" style="fill:var(--accent);filter:drop-shadow(0 0 5px var(--accent))"/>
      <text x="${X(you)}" y="${h - 6}" font-size="14" text-anchor="middle" style="fill:var(--accent);stroke:var(--bg);paint-order:stroke" stroke-width="6">YOU</text>
      </svg><div class="dist-cap glow-signal">${caption(pct)}</div></div>`;
  },
  bandTable(rows, activeIndex) {
    return `<div class="bandtable">${rows.map((b, i) => `<div class="${i === activeIndex ? 'on' : ''}" style="--tc:${b.color}"><span>${b.icon}</span><span class="r">${b.range}</span><span>${b.text}</span></div>`).join('')}</div>`;
  },
  /* rows: [{ q, icon, answer, tags, points, color }]; onExpand(row index) -> html */
  list(rows, onExpand) {
    const el = document.createElement('div');
    el.innerHTML = rows.map((r, i) => `<button class="rrow" data-i="${i}" aria-expanded="false">
      <span class="q">${escapeHtml(r.q)}</span><span class="num">${i + 1}</span><span class="ic">${r.icon}</span>
      <span class="ans ${r.answer ? '' : 'none'}">${r.answer ? escapeHtml(r.answer) : '— no catch'} ${r.tags || ''}</span>
      <span class="p" style="color:${r.color}">${r.points}</span></button>`).join('');
    const toggle = btn => {
      const open = btn.nextElementSibling && btn.nextElementSibling.classList.contains('expand');
      $$('.expand', el).forEach(e => e.remove()); $$('.rrow', el).forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (open) return;
      btn.setAttribute('aria-expanded', 'true');
      btn.insertAdjacentHTML('afterend', `<div class="expand">${onExpand(+btn.dataset.i)}</div>`);
      Results.wireFilters(btn.nextElementSibling);
    };
    $$('.rrow', el).forEach(b => b.onclick = () => toggle(b));
    setTimeout(() => { const first = $('.rrow', el); first && toggle(first); });
    return el;
  },
  /* Band filter chips + search inside an expanded row: rows carry data-b (band key) and data-n (normalized name) */
  wireFilters(ex) {
    const apply = () => {
      const f = ex.querySelector('.chip.band.on')?.dataset.f || 'all', q = norm(ex.querySelector('.search')?.value || '');
      $$('.arow', ex).forEach(rw => rw.style.display = (f === 'all' || rw.dataset.b === f) && (!q || rw.dataset.n.includes(q)) ? '' : 'none');
    };
    $$('.chip.band', ex).forEach(c => c.onclick = () => { $$('.chip.band', ex).forEach(x => x.classList.remove('on')); c.classList.add('on'); apply(); });
    const s = ex.querySelector('.search'); if (s) s.oninput = apply;
  },
};

/* ============ Frame loop ============ */
const Ticks = new Set();      // per-frame callbacks (a Mode's round clock registers here)
function startLoop() {
  const fore = $('#fore'), fctx = fore.getContext('2d');
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    fore.width = innerWidth * dpr; fore.height = innerHeight * dpr;
    const sc = (Themes[Stage.theme] || {}).scene; sc && sc.resize && sc.resize();   // scenes share #scene: size it for the active one
  };
  resize(); addEventListener('resize', resize);
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const sc = (Themes[Stage.theme] || {}).scene; sc && sc.paint(now);
    Particles.step(fctx, dt);
    Ticks.forEach(fn => fn(now));
    if (!reduced && Math.random() < dt / 4) { const m = $('#mascot').getBoundingClientRect(); if (m.width && m.top < innerHeight) Particles.emit(m.left + 6, m.top + 30, 1); }
    requestAnimationFrame(loop);
  })(last);
}
