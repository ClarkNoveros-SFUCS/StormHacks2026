'use strict';
/* App shell (design-system.md §7–8): landing, Modules, Module page, New Game dialog with the Mode picker,
   and the Game page frame. The shell uses the house theme; a Game's Mode supplies its stats, Run and Reveal. */

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
const modeOf = (g = currentGame) => Modes[g.mode];
const fileName = id => FILES.find(f => f.id === id).name.replace(/\.\w+$/, '');

/* ---------- Module page ---------- */
function fileRow(f, i) {
  const used = f.games.length;
  const del = used
    ? `<span class="tip" data-tip="Used by ${escapeHtml(f.games.join(', '))}. Delete those Games first."><button class="px del" disabled aria-label="Delete">✕</button></span>`
    : `<button class="px del" aria-label="Delete">✕</button>`;
  const meta = f.status === 'failed'
    ? `<span class="micro" style="color:var(--danger)">${escapeHtml(f.error)} Delete it and upload again.</span>`
    : `<span class="micro">${f.pages} p</span><span class="micro">${used ? `Used by ${used} game${used > 1 ? 's' : ''}` : 'Not used yet'}</span>`;
  return `<div class="frow" data-file="${f.id}" style="animation-delay:${i * .05}s"><span style="color:var(--muted)">${icon('doc')}</span>
    <span class="fname">${escapeHtml(f.name)}</span>${del}<span class="fmeta">${UI.pill(f.status)}${meta}</span></div>`;
}
function gameCard(g, i) {
  const m = modeOf(g);
  return `<div class="gcard" data-files="${g.files.join(' ')}" style="animation-delay:${i * .08 + .1}s">
    <div class="top"><span class="gname">${escapeHtml(g.name)}</span>${UI.modeBadge(m)}${UI.pill(g.status)}</div>
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
  $('#modeGrid').innerHTML = Object.values(Modes).map(m => `<button class="px mode-tile ${pickedMode === m.id ? 'on' : ''}" data-mode="${m.id}" style="--mc:${m.accent}" aria-pressed="${pickedMode === m.id}">
      <span class="mt-name">${m.icon(3)} ${m.name}</span><span class="mt-line">${escapeHtml(m.tagline)}</span></button>`).join('')
    + `<div class="mode-tile locked" aria-disabled="true"><span style="color:var(--muted)">${icon('lock', 3)}</span><span class="micro">More modes soon</span></div>`;
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

/* ---------- Game page frame (the Mode fills the stats and the Play wording) ---------- */
function renderGame() {
  const g = currentGame, m = modeOf(g);
  $('#gameTitle').textContent = g.name;
  $('#gameMeta').innerHTML = UI.modeBadge(m) + g.files.map(id => `<span class="chip">${icon('doc')} ${escapeHtml(fileName(id))}</span>`).join('');
  $('#gameStats').innerHTML = m.gameStats(g);
  $('#recentLabel').textContent = `Recent ${m.copy.runNoun}s`;
  $('#recent').innerHTML = [['Oct 2 · 19:40', g.best], ['Oct 2 · 11:05', Math.round(g.best * .9)], ['Oct 1 · 22:17', Math.round(g.best * .75)]]
    .map(([d, s], i) => `<div class="runrow"><span>${d}</span><span class="${i ? '' : 'glow-reward'}">${m.formatScore(s)}</span><a data-go="reveal">REVEAL →</a></div>`).join('');
  $('#playBtn').textContent = m.copy.play;
}
$('#playBtn').onclick = () => { Sound.unlock(); go('run'); };

/* ---------- Screens: shell screens use the house theme; Game/Run/Reveal use the Game's Mode ---------- */
defineScreen('landing', { camera: 'surface', theme: 'house' });
defineScreen('modules', { camera: 'surface', theme: 'house' });
defineScreen('module', { camera: 'surface', theme: 'house', enter: renderModule });
defineScreen('game', { camera: () => modeOf().cameras.game, theme: () => modeOf().theme, enter: renderGame });
defineScreen('run', { camera: () => modeOf().cameras.run, theme: () => modeOf().theme, enter: o => modeOf().run.enter($('#runRoot'), o), leave: () => modeOf().run.leave() });
defineScreen('reveal', { camera: () => modeOf().cameras.reveal, theme: () => modeOf().theme, enter: o => modeOf().reveal.enter($('#revealRoot'), o) });

/* ---------- Boot ---------- */
function renderMute() { $('#muteBtn').innerHTML = icon(Sound.muted ? 'muted' : 'sound'); $('#muteBtn').setAttribute('aria-pressed', Sound.muted); }
$('#muteBtn').onclick = () => { Sound.muted = !Sound.muted; store.set('sfx-muted', Sound.muted ? '1' : '0'); Sound.unlock(); renderMute(); };
$('#menuBtn').innerHTML = icon('menu', 3);
$('#menuBtn').onclick = () => $('#menu').classList.add('open');
[['mi1', 'grid'], ['mi2', 'down'], ['mi3', 'log'], ['mi4', 'q']].forEach(([id, n]) => $('#' + id).innerHTML = icon(n, 4));
$('#emptyFish').innerHTML = px(ANGLER.map, ANGLER.pal, 3);
$('#dropIcon').innerHTML = `<span style="color:var(--signal)">${icon('down', 4)}</span>`;
renderMute();
startLoop();
addEventListener('hashchange', () => go(location.hash.slice(1) || 'landing'));
go(location.hash.slice(1) || 'landing');
