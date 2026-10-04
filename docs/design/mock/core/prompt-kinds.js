'use strict';
/* Shared Prompt kinds (design-system.md §6.17). Any Mode that uses a kind reuses its matching and input.
   In the app: matching is lib/matching/ (server side); the inputs are components/round/. */

/* Matching (docs/architecture/answer-matching.md): exact, then typo budget by length; two candidates = no match */
function norm(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[‘’]/g, "'").replace(/&/g, ' and ').replace(/'s\b/g, '').replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function prepPrompt(p) {
  p.keys = [];
  p.answers.forEach(a => [a.canonical, ...a.aliases].forEach(s => p.keys.push({ k: norm(s), a, exact: a.exact })));
  return p;
}
function matchGuess(p, raw) {
  const g = norm(raw);
  if (!g) return null;
  const exact = p.keys.find(k => k.k === g);
  if (exact) return exact.a;
  const budget = g.length < 5 ? 0 : g.length <= 8 ? 1 : 2;
  if (!budget) return null;
  const c = new Set(p.keys.filter(k => !k.exact && lev(k.k, g) <= budget).map(k => k.a));
  return c.size === 1 ? [...c][0] : null;
}

/* Inputs, one per kind. Each renders into the round's #inputArea / #actions / #playarea. */
const Kinds = {
  /* open, cloze, definition */
  typed({ placeholder, submitLabel, onSubmit }) {
    $('#inputArea').innerHTML = `<div class="px guess" id="guessBox"><span class="gt">&gt;</span><input id="guess" autocomplete="off" spellcheck="false" placeholder="${placeholder}" aria-label="Your answer"></div>
      <div class="fuse"><i id="fuse"></i></div><div class="correction" id="correction" aria-live="polite"></div>`;
    $('#actions').innerHTML = `<button class="px submit-btn" id="submitBtn">${submitLabel}</button>`;
    const inp = $('#guess');
    const submit = () => { const raw = inp.value.trim(); if (!raw) return; inp.value = ''; onSubmit(raw); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    inp.addEventListener('input', () => { const r = inp.getBoundingClientRect(); Particles.emit(Math.min(r.right - 10, r.left + 12 + inp.value.length * 13), r.top, 1); Sound.play('tick'); });
    $('#submitBtn').onclick = submit;
  },
  reject() { restart($('#guessBox'), 'jolt'); },
  focus() { const i = $('#guess'); i && i.focus(); },

  /* odd-one-out: one try */
  options({ options, onPick }) {
    $('#inputArea').innerHTML = `<div class="opts">${options.map(o => `<button class="px opt" data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join('')}</div>
      <div class="fuse"><i id="fuse"></i></div><div class="correction" id="correction" aria-live="polite"></div>`;
    $('#actions').innerHTML = '';
    $$('.opt').forEach(b => b.onclick = () => { if (onPick(b.dataset.opt, b) !== false) $$('.opt').forEach(o => o.disabled = true); });   // onPick returns false if not accepted yet
  },
  markOptions(picked, correct) {
    $$('.opt').forEach(o => { if (o.dataset.opt === correct) o.classList.add('right'); else if (o.dataset.opt === picked) o.classList.add('wrong'); });
  },

  /* put-in-order: drag rows (springs), one try. Returns () => current order (original indexes). */
  order({ items, lockLabel, onLock }) {
    const area = $('#playarea');
    const wrap = document.createElement('div'); wrap.className = 'order'; area.appendChild(wrap);
    const rowH = 58;
    const list = items.map((text, k) => ({ text, k }));
    do { list.sort(() => Math.random() - .5); } while (list.length > 1 && list.every((it, k) => it.k === k));
    wrap.style.height = list.length * rowH + 'px';
    list.forEach(it => {
      it.el = document.createElement('div'); it.el.className = 'px orow';
      it.el.innerHTML = `<span class="n"></span><span>${escapeHtml(it.text)}</span><span class="grip">≡</span>`;
      wrap.appendChild(it.el);
    });
    const layout = except => list.forEach((it, k) => {
      it.el.querySelector('.n').textContent = k + 1;
      if (it !== except) { it.el.style.transition = 'transform .25s var(--ease-snap)'; it.el.style.transform = `translateY(${k * rowH}px)`; }
    });
    layout();
    let drag = null, locked = false;
    list.forEach(it => {
      it.el.onpointerdown = e => { if (locked) return; it.el.setPointerCapture(e.pointerId); const y = list.indexOf(it) * rowH; drag = { it, startY: e.clientY, baseY: y, y }; it.el.style.transition = 'none'; it.el.classList.add('lift'); };
      it.el.onpointermove = e => {
        if (!drag || drag.it !== it) return;
        drag.y = Math.max(-10, Math.min((list.length - 1) * rowH + 10, drag.baseY + e.clientY - drag.startY));
        it.el.style.transform = `translateY(${drag.y}px)`;
        const ni = Math.max(0, Math.min(list.length - 1, Math.round(drag.y / rowH))), ci = list.indexOf(it);
        if (ni !== ci) { list.splice(ci, 1); list.splice(ni, 0, it); layout(it); }
      };
      it.el.onpointerup = () => {
        if (!drag || drag.it !== it) return;
        const to = list.indexOf(it) * rowH, from = drag.y; drag = null;
        it.el.classList.remove('lift');
        spring({ from, to, onUpdate: v => it.el.style.transform = `translateY(${v}px)` });
        layout(it);
      };
    });
    $('#inputArea').innerHTML = `<div class="micro" style="padding-top:10px">Drag the rows into order, then lock in.</div><div class="fuse"><i id="fuse"></i></div><div class="correction" id="correction" aria-live="polite"></div>`;
    $('#actions').innerHTML = `<button class="px px-primary submit-btn" id="lockBtn">${lockLabel}</button>`;
    $('#lockBtn').onclick = () => { if (locked || onLock(list.map(it => it.k)) === false) return; locked = true; $('#lockBtn').disabled = true; wrap.classList.add('out'); };
    return () => list.map(it => it.k);
  },

  /* Hint button (single-answer kinds that have a Hint) */
  hintButton({ costHtml, onUse }) {
    $('#actions').insertAdjacentHTML('beforeend', `<button class="px hint-btn" id="hintBtn">? HINT · <span class="cost">${costHtml}</span></button>`);
    $('#hintBtn').onclick = () => { const b = $('#hintBtn'); if (b.disabled || onUse() === false) return; b.disabled = true; b.textContent = 'HINT USED'; };
  },
  showHint(text) { $('#hintSlot').innerHTML = `<div class="hintline">HINT · ${escapeHtml(text)}</div>`; },
  disableAll() { $$('#inputArea input, #inputArea button, #actions button').forEach(x => x.disabled = true); },
};
