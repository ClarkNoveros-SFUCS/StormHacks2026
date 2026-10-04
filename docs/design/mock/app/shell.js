'use strict';
/* Site shell (design-system.md §8; ui-map.md): landing, home dashboard, Modules, Module page, New Game dialog with the
   Mode picker, and the Game page frame. These screens use the 'site' theme (themes/sky.js); a Game's Mode supplies
   its stats block, Run and Reveal. */

const FILES = [
  { id: 'f1', name: 'Week 8 slides.pdf', pages: 38, status: 'ready', games: ['Graphs Midterm'] },
  { id: 'f2', name: 'Week 9 slides.pptx', pages: 44, status: 'ready', games: ['Graphs Midterm', 'Week 9 Drill'] },
  { id: 'f3', name: 'Tutorial 5 notes.docx', pages: 6, status: 'ready', games: [] },
  { id: 'f4', name: 'Scanned handout.pdf', pages: 0, status: 'failed', games: [], error: 'No text could be read: is it a scan?' },
];
const GAMES = [
  { id: 'g1', name: 'Graphs Midterm', mode: 'dive', status: 'ready', files: ['f1', 'f2'], best: 120, mastery: 3 },
  { id: 'g2', name: 'Week 9 Drill', mode: 'dive', status: 'ready', files: ['f2'], best: 45, mastery: 6 },
];
let currentGame = GAMES[0];
const modeOf = (g = currentGame) => Modes[g.mode] || Modes.dive;     // the mock only has Dive's screens
const fileName = id => FILES.find(f => f.id === id).name.replace(/\.\w+$/, '');

/* ---------- Landing ---------- */
let landed = false;
function renderLanding() {
  if (landed) return; landed = true;
  Site.mascot($('#heroMascot'), { scale: 9, say: 'Psst. Hover the Mode tiles.' });
  Site.modeTiles($('#landModes'));
}

/* ---------- Home dashboard ---------- */
let homed = false;
function renderHome() {
  if (homed) return; homed = true;
  const m = Site.mascot($('#homeMascot'), { scale: 5, say: '2-day streak! One dive keeps it alive.' });
  $('#profileCard').innerHTML = Site.profileCard({ name: 'Anton', level: 4, avatar: 'axolotl', xp: 630, rank: 'Shrimp', badges: 7, streak: 2 });
  $$('#profileCard [data-odo]').forEach(b => Site.odometer(b, b.dataset.odo));
  Site.xpBar($('#xpBar'), { from: 0, to: 30, level: 4, cur: 630, next: 1000 });
  $$('#xpBar [data-odo]').forEach(b => Site.odometer(b, b.dataset.odo));
  Site.heatmap($('#heatmap'));
  Site.flipClock($('#flip'));
  $('#contList').innerHTML = [
    ['book', 'Python Basics', 'Topic 3 of 6 · Operators', 50, '#9d7bff'],
    ['trophy', 'Week 9 Drill', 'Dive · best −450 m', 60, '#4de3ff'],
  ].map(([ic, t, s, p, c]) => `<div class="cont-row hov" data-go="game">${Site.ico(ic, 3)}<div><b>${t}</b><span>${s}</span><div class="pbar thin" style="--c:${c}"><i style="--to:${p}%"></i></div></div></div>`).join('');
  $('#badges').innerHTML = [['star', 'First Dive', 1], ['flame', '7-day streak', 0], ['gem', 'Trench Diver', 1], ['trophy', 'Daily Top 10', 0], ['book', 'Topic 1', 1], ['rank', 'Shrimp', 1]]
    .map(([ic, n, on]) => `<button class="badge-tile ${on ? '' : 'off'}" title="${n}${on ? '' : ' (locked)'}">${Site.ico(ic, 3)}<span>${n}</span></button>`).join('');
  Site.tilt($('#s-home'));
  bannerArt();
  $('#levelUpBtn').onclick = () => {
    const lu = $('#levelup'); restart(lu, 'on'); setTimeout(() => lu.classList.remove('on'), 2600);
    Site.confetti(innerWidth / 2, innerHeight * .35, 140); Sound.play('levelup'); m.react('happy'); m.say('LEVEL 5! You’re a Reef Fish now.');
  };
}
/* the "Jump back in" banner: a tiny live pixel ocean */
function bannerArt() {
  const c = $('#bannerArt').getContext('2d');
  (function loop(t) {
    if (!c.canvas.isConnected) return;
    const g = c.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#2e5b87'); g.addColorStop(1, '#060c19'); c.fillStyle = g; c.fillRect(0, 0, 160, 90);
    c.fillStyle = '#a9cbe2'; c.fillRect(0, 0, 160, 18);
    c.fillStyle = '#bfe9f7'; for (let x = 0; x < 160; x++) c.fillRect(x, 18 + Math.round(Math.sin(x * .15 + t * .003)), 1, 1);
    c.fillStyle = '#0e1a2b'; c.fillRect(24, 12, 26, 5); c.fillRect(32, 8, 8, 4); c.fillRect(37, 2, 1, 6); c.fillStyle = '#ff5d8f'; c.fillRect(38, 2, 4, 3);
    c.fillStyle = 'rgba(4,10,20,.5)'; for (let i = 0; i < 6; i++) { const x = (i * 31 + t * .02 * (i % 2 ? 1 : -1)) % 180 - 10; c.fillRect((x + 180) % 180 - 10, 34 + i * 8, 5, 2); }
    c.fillStyle = 'rgba(255,209,102,.9)'; c.fillRect(120, 68 + Math.round(Math.sin(t * .003) * 2), 1, 1);
    c.fillStyle = 'rgba(255,209,102,.2)'; c.fillRect(118, 66 + Math.round(Math.sin(t * .003) * 2), 5, 5);
    if (!reduced) requestAnimationFrame(loop);
  })(0);
}

/* ---------- Module page ---------- */
function fileRow(f, i) {
  const used = f.games.length;
  const del = used
    ? `<span class="tip" data-tip="Used by ${escapeHtml(f.games.join(', '))}. Delete those Games first."><button class="px del" disabled aria-label="Delete">✕</button></span>`
    : `<button class="px del" aria-label="Delete">✕</button>`;
  const meta = f.status === 'failed'
    ? `<span class="micro" style="color:var(--danger)">${escapeHtml(f.error)} Delete it and upload again.</span>`
    : `<span class="micro">${f.pages} p</span><span class="micro">${used ? `Used by ${used} game${used > 1 ? 's' : ''}` : 'Not used yet'}</span><button class="viewfile" title="Parsed text of your file">View</button>`;
  return `<div class="frow" data-file="${f.id}" style="animation-delay:${i * .05}s"><span style="color:var(--muted)">${icon('doc')}</span>
    <span class="fname">${escapeHtml(f.name)}</span>${del}<span class="fmeta">${UI.pill(f.status)}${meta}</span></div>`;
}
function gameCard(g, i) {
  const m = modeOf(g), mt = Site.MODES.find(x => x.id === g.mode) || Site.MODES[0];
  return `<div class="gcard" data-files="${g.files.join(' ')}" style="animation-delay:${i * .08 + .1}s">
    <div class="top"><span class="gname">${escapeHtml(g.name)}</span><span class="mode-badge" style="--mc:${mt.c}">${mt.name.toUpperCase()}</span>${UI.pill(g.status)}</div>
    <div class="chips">${g.files.map(id => `<span class="chip" data-file="${id}">${icon('doc')} ${escapeHtml(fileName(id))}</span>`).join('')}</div>
    <div class="bottom">${g.status === 'ready'
      ? `<span class="micro">Best <span class="glow-reward">${m.formatScore(g.best)}</span></span><span class="micro" style="display:flex;gap:8px;align-items:center">Mastery ${UI.meter(g.mastery)}</span><button class="px px-primary btn" data-play="${g.id}">PLAY ▼</button>`
      : '<span class="micro">Writing prompts from your files…</span>'}</div></div>`;
}
function renderModule() {
  $('#files').innerHTML = FILES.map(fileRow).join('');
  $('#fileCount').textContent = FILES.length;
  $('#gameCount').textContent = GAMES.length;
  $('#games').innerHTML = GAMES.map(gameCard).join('');
}
document.addEventListener('click', e => {
  const p = e.target.closest('[data-play]');
  if (p) { currentGame = GAMES.find(g => g.id === p.dataset.play); Sound.unlock(); go('game'); }
});
document.addEventListener('mouseover', e => {                    // hover linking: file chip ↔ file row ↔ Game card
  const chip = e.target.closest('.chip[data-file]'), row = e.target.closest('.frow');
  $$('.frow.lit, .gcard.lit, .chip.lit').forEach(x => x.classList.remove('lit'));
  if (chip) { $$(`.frow[data-file="${chip.dataset.file}"]`).forEach(r => r.classList.add('lit')); chip.classList.add('lit'); }
  if (row) {
    $$('.gcard').forEach(g => { if (g.dataset.files.split(' ').includes(row.dataset.file)) g.classList.add('lit'); });
    $$(`.chip[data-file="${row.dataset.file}"]`).forEach(c => c.classList.add('lit'));
  }
});
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#fileInput').onchange = e => addFiles(e.target.files);
function addFiles(list) {
  [...list].forEach(file => {
    const f = { id: 'f' + (FILES.length + 1), name: file.name, pages: 12, status: 'uploading', games: [] };
    FILES.unshift(f); renderModule();
    setTimeout(() => { f.status = 'parsing'; renderModule(); }, 900);
    setTimeout(() => { f.status = 'ready'; renderModule(); }, 1800);
  });
}

/* ---------- New Game dialog: Mode picker first ---------- */
let pickedMode = 'dive';
function renderNewGame() {
  $('#modeGrid').innerHTML = Site.MODES.map(m => m.locked
    ? `<div class="mode-tile locked" aria-disabled="true"><span style="color:var(--muted)">${icon('lock', 3)}</span><span class="micro">${m.name} · soon</span></div>`
    : `<button class="px mode-tile ${pickedMode === m.id ? 'on' : ''}" data-mode="${m.id}" style="--mc:${m.c}" aria-pressed="${pickedMode === m.id}">
      <span class="mt-name">${m.name}</span><span class="mt-line">${escapeHtml(m.line)}</span><span class="mt-line" style="opacity:.7">${m.rules}</span></button>`).join('');
  $$('#modeGrid [data-mode]').forEach(b => b.onclick = () => { pickedMode = b.dataset.mode; renderNewGame(); });
  $('#ngFiles').innerHTML = FILES.filter(f => f.status === 'ready').map((f, i) =>
    `<label class="check"><input type="checkbox" value="${f.id}" ${i < 2 ? 'checked' : ''}> ${escapeHtml(f.name)}</label>`).join('');
}
$('#newGameBtn').onclick = () => { renderNewGame(); $('#newGame').classList.add('open'); };
$('#ngCreate').onclick = () => {
  const files = $$('#ngFiles input:checked').map(i => i.value);
  if (!files.length) return;
  const g = { id: 'g' + (GAMES.length + 1), name: $('#ngTitle').value || 'Untitled', mode: pickedMode, status: 'generating', files, best: 0, mastery: 0 };
  GAMES.unshift(g); $('#newGame').classList.remove('open'); renderModule();
  setTimeout(() => { g.status = 'ready'; renderModule(); }, 3000);
};
$('#newModuleBtn').onclick = () => go('module');

/* ---------- Game page frame (the Mode fills the stats block and the Play wording) ---------- */
function renderGame() {
  const g = currentGame, m = modeOf(g), mt = Site.MODES.find(x => x.id === g.mode) || Site.MODES[0];
  $('#gameTitle').textContent = g.name;
  $('#gameMeta').innerHTML = `<span class="mode-badge" style="--mc:${mt.c}">${mt.name.toUpperCase()}</span>` + g.files.map(id => `<span class="chip">${icon('doc')} ${escapeHtml(fileName(id))}</span>`).join('');
  $('#gameStats').innerHTML = m.gameStats(g);
  $('#recentLabel').textContent = `Recent ${m.copy.runNoun}s`;
  $('#recent').innerHTML = [['Oct 2 · 19:40', g.best], ['Oct 2 · 11:05', Math.round(g.best * .9)], ['Oct 1 · 22:17', Math.round(g.best * .75)]]
    .map(([d, s], i) => `<div class="runrow"><span>${d}</span><span class="${i ? '' : 'glow-reward'}">${m.formatScore(s)}</span><a data-go="reveal">REVEAL →</a></div>`).join('');
  $('#playBtn').textContent = m.copy.play;
}
$('#playBtn').onclick = () => { Sound.unlock(); go('run'); };

/* ---------- Screens: site screens use the 'site' theme; Run/Reveal use the Game's Mode ---------- */
defineScreen('landing', { camera: 'landing', theme: 'site', enter: renderLanding });
defineScreen('home', { camera: 'calm', theme: 'site', enter: renderHome });
defineScreen('modules', { camera: 'calm', theme: 'site' });
defineScreen('module', { camera: 'calm', theme: 'site', enter: renderModule });
defineScreen('game', { camera: 'calm', theme: 'site', enter: renderGame });
defineScreen('run', { camera: () => modeOf().cameras.run, theme: () => modeOf().theme, enter: o => modeOf().run.enter($('#runRoot'), o), leave: () => modeOf().run.leave() });
defineScreen('reveal', { camera: () => modeOf().cameras.reveal, theme: () => modeOf().theme, enter: o => modeOf().reveal.enter($('#revealRoot'), o), leave: () => modeOf().reveal.leave && modeOf().reveal.leave() });

/* ---------- Boot ---------- */
$('#navFlame').innerHTML = Site.ico('flame', 2);
$('#navAv').innerHTML = Site.avatar('axolotl', 2);
$$('.burger').forEach(b => b.innerHTML = icon('menu', 3));
[['mi1', 'grid'], ['mi2', 'down'], ['mi3', 'log'], ['mi4', 'q']].forEach(([id, n]) => $('#' + id).innerHTML = icon(n, 4));
$('#emptyFish').innerHTML = px(ANGLER.map, ANGLER.pal, 3);
$('#dropIcon').innerHTML = `<span style="color:var(--signal)">${icon('down', 4)}</span>`;
const TODS = ['auto', 'day', 'dusk', 'night'];
$('#todBtn').onclick = () => { const i = (TODS.indexOf($('#todBtn').dataset.v || 'auto') + 1) % 4; $('#todBtn').dataset.v = TODS[i]; $('#todBtn').textContent = 'Sky: ' + TODS[i]; SkyScene.setTod(TODS[i]); };
renderMute();
startLoop();
addEventListener('hashchange', () => go(location.hash.slice(1) || 'landing'));
go(location.hash.slice(1) || 'landing');
