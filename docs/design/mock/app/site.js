'use strict';
/* Site components (design-system.md §6; components/ui/ in the app): the mascot, pixel avatars, pixel icons,
   the profile card, the activity heatmap, Mode tiles with mini-scenes, the XP bar, odometer numbers,
   the streak flame, tilt cards, confetti and the flip clock. Plain functions that return HTML or wire an element. */

const Site = (() => {
  /* ---------- pixel icons (10×10) ---------- */
  const IC = {
    star: { map: ['....Y.....', '....Y.....', '...YYY....', 'YYYYWYYYY.', '.YYYWYYY..', '..YYYYY...', '..YYOYY...', '.YYO.OYY..', '.YO...OY..', '..........'], pal: { Y: '#ffd84d', O: '#c99a1e', W: '#fff6c2' } },
    rank: { map: ['..NNNNNN..', '.NBBBBBBN.', 'NBNNWNNNBN', 'NBNWWWNNBN', 'NBNNWNNNBN', '.NBNNNNBN.', '..NBNNBN..', '...NBBN...', '....NN....', '..........'], pal: { N: '#e09a5b', B: '#9a5a2a', W: '#ffe2c2' } },
    gem: { map: ['..........', '..CCCCCC..', '.CWCCBCCB.', 'CCCBBBBBBD', '.CBBBBBDD.', '..CBBBDD..', '...CBDD...', '....BD....', '..........', '..........'], pal: { C: '#7fd0ff', B: '#3b7cf0', D: '#2346b0', W: '#ffffff' } },
    flame: { map: ['...O......', '...OO.....', '..OOO.O...', '..OOOOO...', '.OOYOOO...', '.OOYYOOO..', 'OOYYWYOO..', 'OOYWWYOO..', '.OYYYYO...', '..OOOO....'], pal: { O: '#ff7a2b', Y: '#ffd84d', W: '#fff6c2' } },
    lock: { map: ['...SSSS...', '..S....S..', '..S....S..', '.ssssssss.', '.sSSSSSSs.', '.sSSkkSSs.', '.sSSkkSSs.', '.sSSSSSSs.', '.ssssssss.', '..........'], pal: { s: '#d6deef', S: '#8d98b5', k: '#0b0e1d' } },
    book: { map: ['..........', '.VVVV.VVVV', '.VWWV.VWWV', '.VWWV.VWWV', '.VWWV.VWWV', '.VWWV.VWWV', '.VVVVVVVVV', '..........', '..........', '..........'], pal: { V: '#9d7bff', W: '#eef2ff' } },
    trophy: { map: ['YYYYYYYYY.', 'YWYYYYYOY.', 'YYYYYYYOY.', '.YYYYYOY..', '..YYYYO...', '...YYO....', '....Y.....', '...YYY....', '..OOOOO...', '..........'], pal: { Y: '#ffd84d', O: '#c99a1e', W: '#fff6c2' } },
  };
  const ico = (name, s = 2) => px(IC[name].map, IC[name].pal, s);

  /* ---------- pixel avatars (16×16); the app ships ~16 of these ---------- */
  const AV = {
    axolotl: { bg: '#3a1d3f', map: ['................', '..G..........G..', '.GG.GPPPPPPG.GG.', '..GGPPPPPPPPGG..', '.GGPPPPPPPPPPGG.', '...PPEPPPPEPP...', '...PPEPPPPEPP...', '...PPPPPPPPPP...',
      '...PPPPMMPPPP...', '....PPPPPPPP....', '.....LLLLLL.....', '....LLLLLLLL....', '...PPLLLLLLPP...', '...PP.LLLL.PP...', '......P..P......', '................'], pal: { P: '#ff9ec4', G: '#ff5d8f', E: '#1a0f22', M: '#c2507a', L: '#ffd0e2' } },
    astronaut: { bg: '#14284a', map: ['................', '.....WWWWWW.....', '....WWWWWWWW....', '...WWBBBBBBWW...', '...WBBCBBBBBW...', '...WBCBBBBBBW...', '...WBBBBBBBBW...', '...WWBBBBBBWW...',
      '....WWWWWWWW....', '...WWWWRRWWWW...', '..WWWWWRRWWWWW..', '..WW.WWWWWW.WW..', '..SS.WWWWWW.SS..', '.....WW..WW.....', '.....SS..SS.....', '................'], pal: { W: '#eef2ff', B: '#20335e', C: '#7fd0ff', R: '#ff5d8f', S: '#8d98b5' } },
    frog: { bg: '#163a2c', map: ['................', '...WWW....WWW...', '..WKKWG..GWKKW..', '..WKKWGGGGWKKW..', '...WWGGGGGGWW...', '..GGGGGGGGGGGG..', '.GGGGGGGGGGGGGG.', '.GGRRRRRRRRRRGG.',
      '.GGGRRRRRRRRGGG.', '..GGGGGGGGGGGG..', '..GGLLLLLLLLGG..', '.GGGLLLLLLLLGGG.', '.GG.GGLLLLGG.GG.', 'GGG..GG..GG..GGG', '................', '................'], pal: { W: '#eef2ff', K: '#0b0e1d', G: '#3ddc97', R: '#1f8a5c', L: '#bdf5d9' } },
  };
  const avatar = (id, s = 4) => `<span class="av" style="--avbg:${AV[id].bg}">${px(AV[id].map, AV[id].pal, s)}</span>`;

  /* ---------- the mascot: blinks, eyes follow the cursor, speech bubble, reactions, naps when idle ---------- */
  function mascotSvg(s) {
    const map = ANGLER.map.map((r, y) => y === 7 ? r.replace('HE', 'PP') : r);
    return px(map, ANGLER.pal, s).replace('</svg>', '<g class="m-eye"><rect x="2.9" y="5.9" width="2.2" height="2.2" fill="#e8f1ff"/><rect class="m-pupil" x="3" y="6" width="1.02" height="1.02" fill="#050a14"/><rect class="m-lid" x="2.9" y="5.9" width="2.2" height="2.2" fill="#6b5bd6"/></g></svg>');
  }
  const LINES = ['Hey! That tickles.', 'Rarer answers sink deeper.', 'Glub. Got any notes for me?', 'Did you know my lantern is a fin?', '2-day streak. Keep it glowing!'];
  function mascot(host, { scale = 6, say } = {}) {
    host.classList.add('mascot-site');
    host.innerHTML = `<div class="m-bubble" role="status"></div><button class="m-body" aria-label="Anglerfish mascot (click me)">${mascotSvg(scale)}</button><span class="m-z" aria-hidden="true">z<b>z</b></span>`;
    const body = $('.m-body', host), pupil = $('.m-pupil', host), bubble = $('.m-bubble', host);
    let last = performance.now(), bubbleT = 0;
    const api = {
      say(text, ms = 3500) { bubble.textContent = text; host.classList.add('talking'); clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(() => host.classList.remove('talking'), ms); },
      react(kind = 'happy') { restart(body, kind); const r = body.getBoundingClientRect(); Particles.emit(r.left + r.width * .7, r.top + 10, 8, 'rgba(255,209,102,.9)'); Sound.play('pop'); },
    };
    addEventListener('pointermove', e => {
      last = performance.now(); host.classList.remove('sleep');
      const r = body.getBoundingClientRect(), ex = r.left + r.width * .25, ey = r.top + r.height * .5;
      pupil.setAttribute('x', e.clientX > ex + 30 ? 4 : 3); pupil.setAttribute('y', e.clientY > ey + 20 ? 7 : 6);
    });
    (function blink() { if (!host.isConnected) return; host.classList.add('blink'); setTimeout(() => host.classList.remove('blink'), 140); setTimeout(blink, 2500 + Math.random() * 3500); })();
    (function idle() { if (!host.isConnected) return; if (performance.now() - last > 20000) host.classList.add('sleep'); setTimeout(idle, 2000); })();
    body.onclick = () => { host.classList.remove('sleep'); api.react('happy'); api.say(LINES[Math.floor(Math.random() * LINES.length)]); };
    if (say) setTimeout(() => api.say(say, 6000), 600);
    return api;
  }

  /* ---------- odometer numbers ---------- */
  function odometer(el, value) {
    const s = Number(value).toLocaleString('en-US');
    el.innerHTML = [...s].map(ch => /\d/.test(ch) ? `<span class="odo"><span class="odo-col" data-n="${ch}">${'0123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>` : `<span>${ch}</span>`).join('');
    el.setAttribute('aria-label', s);
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.odo-col', el).forEach((c, i) => { c.style.transitionDelay = i * 80 + 'ms'; c.style.transform = `translateY(${-c.dataset.n * 1.15}em)`; })));
  }

  /* ---------- profile card (Codedex-style; the app's <ProfileCard>) ---------- */
  function profileCard(p) {
    return `<div class="pcard">
      <div class="pc-top">
        <div class="pc-av">${avatar(p.avatar, 4)}<a class="pc-edit" href="#home" onclick="return false">Edit</a></div>
        <div class="pc-id"><div class="pc-name">${escapeHtml(p.name)}</div><div class="pc-level">Level ${p.level}</div></div>
      </div>
      <div class="pc-stats">
        <div class="pc-stat">${ico('star', 3)}<div><b data-odo="${p.xp}">${p.xp}</b><span>Total XP</span></div></div>
        <div class="pc-stat">${ico('rank', 3)}<div><b>${p.rank}</b><span>Rank</span></div></div>
        <div class="pc-stat">${ico('gem', 3)}<div><b data-odo="${p.badges}">${p.badges}</b><span>Badges</span></div></div>
        <div class="pc-stat"><span class="flame">${ico('flame', 3)}</span><div><b data-odo="${p.streak}">${p.streak}</b><span>Day streak</span></div></div>
      </div>
      <button class="sbtn sbtn-frame" type="button">View profile</button>
    </div>`;
  }

  /* ---------- activity heatmap (52 weeks × 7 days, 5 levels) ---------- */
  function heatmap(el) {
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - (51 * 7 + today.getDay()));
    let cells = '', months = '', lastM = -1, active = 0;
    for (let w = 0; w < 52; w++) {
      const d0 = new Date(start); d0.setDate(d0.getDate() + w * 7);
      if (d0.getMonth() !== lastM) { lastM = d0.getMonth(); months += `<span style="grid-column:${w + 1}">${d0.toLocaleString('en', { month: 'short' })}</span>`; }
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(day.getDate() + w * 7 + d);
        if (day > today) { cells += '<i class="fut"></i>'; continue; }
        const ago = (today - day) / 864e5, warm = w > 30 ? .55 : .25;
        let lv = r() < warm ? 1 + Math.floor(r() * r() * 4) : 0;
        if (ago < 2) lv = Math.max(lv, ago < 1 ? 3 : 2); else if (ago < 3) lv = 0;
        if (lv) active++;
        const dives = lv ? lv * 2 - 1 + Math.floor(r() * 2) : 0;
        cells += `<i class="l${lv}" style="--w:${w};--d:${d}" data-tip="${dives ? `${dives} dive${dives > 1 ? 's' : ''} · ${dives * 35} XP` : 'No dives'} · ${day.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}"></i>`;
      }
    }
    el.innerHTML = `<div class="hm-scroll"><div class="hm"><div class="hm-months">${months}</div><div class="hm-days"><span>Mon</span><span>Wed</span><span>Fri</span></div><div class="hm-grid">${cells}</div></div></div>
      <div class="hm-foot"><span>${active} active days in the last year</span><span class="hm-legend">Less <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</span></div><div class="hm-tip" hidden></div>`;
    const tip = $('.hm-tip', el);
    el.addEventListener('pointerover', e => {
      const c = e.target.closest('.hm-grid i[data-tip]'); if (!c) { tip.hidden = true; return; }
      const r0 = el.getBoundingClientRect(), rc = c.getBoundingClientRect();
      tip.textContent = c.dataset.tip; tip.hidden = false;
      tip.style.left = Math.min(r0.width - 10, Math.max(10, rc.left - r0.left + rc.width / 2)) + 'px'; tip.style.top = (rc.top - r0.top - 8) + 'px';
    });
    el.addEventListener('pointerleave', () => tip.hidden = true);
  }

  /* ---------- Mode tiles: a looping mini-scene that plays on hover ---------- */
  const MODES = [
    { id: 'dive', name: 'Dive', line: 'Rarer answers sink deeper.', rules: '7 prompts · 25 s · type anything', c: '#4de3ff' },
    { id: 'apogee', name: 'Apogee', line: 'Rarer answers fly higher.', rules: '7 prompts · score in km', c: '#ff7a3d' },
    { id: 'leap', name: 'Leap', line: 'Answer right, jump higher.', rules: '10 questions · 3 hearts', c: '#3ddc97' },
    { id: 'pairs', name: 'Pairs', line: 'Match terms against the clock.', rules: '2 boards · 6 pairs', c: '#ff9f43' },
    { id: 'blitz', name: 'Blitz', line: '60 seconds of true or false.', rules: 'combos after 5 in a row', c: '#ff3df0' },
    { id: 'arena', name: 'Arena', line: 'Aim for the right answer.', rules: 'coming soon', c: '#9aa6c8', locked: true },
  ];
  const DRAW = {
    dive(c, t) {
      const g = c.createLinearGradient(0, 0, 0, 72); g.addColorStop(0, '#2e5b87'); g.addColorStop(1, '#091425'); c.fillStyle = g; c.fillRect(0, 0, 120, 72);
      c.fillStyle = '#bfe9f7'; for (let x = 0; x < 120; x++) c.fillRect(x, 8 + Math.round(Math.sin(x * .2 + t * .004)), 1, 1);
      c.fillStyle = 'rgba(154,166,200,.35)'; [26, 42, 58].forEach(y => { for (let x = 4; x < 116; x += 6) c.fillRect(x, y, 3, 1); });
      const p = (t / 1800) % 1, y = 12 + 46 * (1 - Math.pow(1 - Math.min(1, p * 1.4), 3)) + Math.sin(p * 30) * (1 - p) * 2;
      c.fillStyle = '#4de3ff'; c.fillRect(46, y, 28, 7); c.fillStyle = '#091425'; c.fillRect(48, y + 2, 24, 3);
      c.fillStyle = 'rgba(200,235,255,.7)'; for (let i = 0; i < 5; i++) c.fillRect((i * 23 + t * .01) % 120, 70 - ((t * .03 + i * 17) % 60), 2, 2);
    },
    apogee(c, t) {
      c.fillStyle = '#04050d'; c.fillRect(0, 0, 120, 72);
      c.fillStyle = '#ffffff'; for (let i = 0; i < 26; i++) c.fillRect((i * 37) % 120, ((i * 23) + t * .05 * (1 + i % 3)) % 72, 1, 1 + (i % 3 === 0));
      const sh = Math.sin(t * .05) > 0 ? 1 : 0, y = 26 + Math.sin(t * .002) * 3;
      c.fillStyle = '#eef2ff'; c.fillRect(56 + sh, y, 8, 18); c.fillRect(58 + sh, y - 5, 4, 5);
      c.fillStyle = '#ff7a3d'; c.fillRect(53 + sh, y + 12, 3, 6); c.fillRect(64 + sh, y + 12, 3, 6); c.fillRect(59 + sh, y - 6, 2, 2);
      c.fillStyle = '#8fd3ff'; c.fillRect(59 + sh, y + 4, 2, 2);
      c.fillStyle = Math.sin(t * .03) > 0 ? '#ffd84d' : '#ff7a3d'; c.fillRect(58 + sh, y + 18, 4, 4 + (t / 80 % 4)); c.fillStyle = '#ff5c5c'; c.fillRect(59 + sh, y + 22, 2, 3);
    },
    leap(c, t) {
      const g = c.createLinearGradient(0, 0, 0, 72); g.addColorStop(0, '#1d3a74'); g.addColorStop(1, '#3f6eab'); c.fillStyle = g; c.fillRect(0, 0, 120, 72);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect((t * .01) % 140 - 20, 12, 18, 3); c.fillRect((t * .006 + 60) % 140 - 20, 28, 12, 2);
      const p = (t / 900) % 1, step = Math.floor(t / 900);
      [0, 1, 2].forEach(i => { const x = 14 + i * 36, y = 60 - i * 14 + p * 14; c.fillStyle = '#3ddc97'; c.fillRect(x, y, 22, 4); c.fillStyle = '#1f8a5c'; c.fillRect(x, y + 4, 22, 2); });
      const hx = 22 + p * 36, hy = 52 - Math.sin(p * Math.PI) * 22 - p * 14 + p * 14;
      c.fillStyle = '#ffd84d'; c.fillRect(hx, hy, 7, 7); c.fillStyle = '#0b0e1d'; c.fillRect(hx + 4, hy + 2, 1, 1);
      if (step % 4 === 3) { c.fillStyle = '#ff5d8f'; c.fillRect(100, 10, 2, 6); c.fillRect(100, 18, 2, 2); }
    },
    pairs(c, t) {
      c.fillStyle = '#261638'; c.fillRect(0, 0, 120, 72);
      const k = Math.floor(t / 700) % 3;
      for (let i = 0; i < 3; i++) {
        const on = i === k;
        c.fillStyle = on ? '#ff9f43' : '#3a2350'; c.fillRect(14, 10 + i * 20, 34, 14);
        c.fillStyle = on ? '#9d7bff' : '#3a2350'; c.fillRect(72, 10 + ((i + 1) % 3) * 20, 34, 14);
        c.fillStyle = '#eef2ff'; c.fillRect(18, 15 + i * 20, 16, 2); c.fillRect(76, 15 + ((i + 1) % 3) * 20, 22, 2);
      }
      const p = (t % 700) / 700; c.fillStyle = '#ffd84d';
      for (let s = 0; s < p * 24; s++) c.fillRect(48 + s, 17 + k * 20 + (((k + 1) % 3) - k) * 20 * (s / 24), 1, 1);
    },
    blitz(c, t) {
      c.fillStyle = '#0b0418'; c.fillRect(0, 0, 120, 72);
      const beat = (t % 500) / 500, pulse = 1 - beat;
      c.fillStyle = `rgba(255,61,240,${.15 + pulse * .25})`; for (let x = 0; x < 120; x += 10) c.fillRect(x, 0, 1, 72); for (let y = 0; y < 72; y += 10) c.fillRect(0, y, 120, 1);
      const tf = Math.floor(t / 500) % 2;
      c.fillStyle = tf ? '#3dfcff' : '#ff3df0';
      if (tf) { c.fillRect(48, 20, 24, 5); c.fillRect(57, 20, 6, 30); } else { c.fillRect(50, 20, 6, 30); c.fillRect(50, 20, 22, 5); c.fillRect(50, 33, 16, 5); }
      c.fillStyle = '#f6ff3d'; c.fillRect(10, 62, Math.round(100 * ((t / 4000) % 1)), 3);
    },
    arena(c, t) {
      c.fillStyle = '#141a33'; c.fillRect(0, 0, 120, 72);
      c.fillStyle = '#2a3358'; [[20, 20], [80, 14], [30, 46], [86, 44]].forEach(([x, y], i) => c.fillRect(x + Math.sin(t * .002 + i) * 3, y, 14, 10));
      c.fillStyle = '#9aa6c8'; c.fillRect(59, 28, 2, 16); c.fillRect(52, 35, 16, 2);
    },
  };
  function modeTiles(host, { compact = false } = {}) {
    host.innerHTML = MODES.map((m, i) => `<button class="mcard tilt ${m.locked ? 'locked' : ''}" style="--mc:${m.c};--i:${i}" data-mtile="${m.id}" ${m.locked ? 'aria-disabled="true"' : ''}>
      <canvas width="120" height="72" aria-hidden="true"></canvas>
      <span class="mc-name">${m.locked ? ico('lock', 2) : ''}${m.name}</span><span class="mc-line">${m.line}</span>${compact ? '' : `<span class="mc-rules">${m.rules}</span>`}<span class="glare"></span></button>`).join('');
    const tiles = $$('.mcard', host).map(el => ({ el, c: $('canvas', el).getContext('2d'), id: el.dataset.mtile, on: false }));
    tiles.forEach(tl => {
      DRAW[tl.id](tl.c, 600);
      const on = v => () => { tl.on = v; if (v) Sound.play('hover'); };
      tl.el.addEventListener('pointerenter', on(true)); tl.el.addEventListener('pointerleave', on(false));
      tl.el.addEventListener('focus', on(true)); tl.el.addEventListener('blur', on(false));
    });
    (function loop(t) { if (!host.isConnected) return; tiles.forEach(tl => { if (tl.on && !reduced) DRAW[tl.id](tl.c, t); }); requestAnimationFrame(loop); })(0);
    tilt(host);
  }

  /* ---------- tilt cards: lean toward the cursor with a glare sweep ---------- */
  function tilt(root) {
    if (reduced) return;
    $$('.tilt', root).forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(700px) rotateX(${(.5 - y) * 10}deg) rotateY(${(x - .5) * 12}deg) translateY(-4px)`;
        el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- XP bar with shine and sparks ---------- */
  function xpBar(el, { from, to, level, cur, next }) {
    el.innerHTML = `<div class="xp-row"><span>Level ${level}</span><span><b data-odo="${cur}">${cur}</b> / ${next} XP</span></div><div class="xpbar"><i></i></div>`;
    const fill = $('i', el);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = to + '%'; }));
    fill.style.width = from + '%';
    if (!reduced) setInterval(() => { if (!el.isConnected || document.body.dataset.screen !== 'home') return; const r = fill.getBoundingClientRect(); if (r.width) Particles.emit(r.right - 2, r.top + 4, 1, 'rgba(255,216,77,.9)'); }, 450);
  }

  /* ---------- confetti / pixel burst (own canvas, gravity) ---------- */
  let fx = null;
  function confetti(x = innerWidth / 2, y = innerHeight / 3, n = 90) {
    if (reduced) return;
    if (!fx) {
      const cv = document.createElement('canvas'); cv.className = 'fx'; document.body.appendChild(cv);
      fx = { cv, c: cv.getContext('2d'), ps: [], run: false };
    }
    const cols = ['#ffd84d', '#ff5d8f', '#4de3ff', '#9d7bff', '#3ddc97', '#ffffff'];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 380; fx.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 260, c: cols[i % cols.length], s: 3 + Math.random() * 5, l: 1.4 + Math.random(), r: Math.random() * 6 }); }
    if (fx.run) return;
    fx.run = true; fx.cv.width = innerWidth; fx.cv.height = innerHeight;
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(.04, (now - last) / 1000); last = now;
      const { c, ps } = fx; c.clearRect(0, 0, fx.cv.width, fx.cv.height);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.l -= dt; if (p.l <= 0) { ps.splice(i, 1); continue; }
        p.vy += 900 * dt; p.vx *= Math.pow(.4, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 8;
        c.globalAlpha = Math.min(1, p.l * 2); c.fillStyle = p.c; const w = Math.max(1, Math.round(p.s * Math.abs(Math.cos(p.r))));
        c.fillRect(Math.round(p.x - w / 2), Math.round(p.y), w, Math.round(p.s));
      }
      c.globalAlpha = 1;
      if (ps.length) requestAnimationFrame(loop); else fx.run = false;
    })(last);
  }

  /* ---------- flip clock (countdown to the next Daily at local midnight) ---------- */
  function flipClock(el) {
    const tick = () => {
      if (!el.isConnected) return;
      const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
      const s = Math.floor((mid - now) / 1000), str = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
      if (!el.children.length) el.innerHTML = [...str].map(ch => ch === ':' ? '<b>:</b>' : '<span class="flip"></span>').join('');
      let k = 0;
      [...str].forEach(ch => { if (ch === ':') return; const f = el.querySelectorAll('.flip')[k++]; if (f.textContent !== ch) { f.textContent = ch; restart(f, 'go'); } });
      setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  }

  return { ico, avatar, mascot, odometer, profileCard, heatmap, modeTiles, tilt, xpBar, confetti, flipClock, MODES };
})();
