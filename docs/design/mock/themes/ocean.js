'use strict';
/* Dive's depth world (docs/design/modes/dive.md §2 "Scene"): a tall ocean where depth is a real camera position.
   World units are metres. 0 m is the waterline; the world goes down to the trench floor at 7,400 m.
   Zones (real oceanography, which fits our 0–7,000 m score range): sunlit 0–200, twilight 200–1,000,
   midnight 1,000–4,000, abyss 4,000–6,000, trench 6,000+. Colour, light rays, marine snow and creatures change with depth.

   Scene interface (core/system.js): { resize(), paint(t), setCamera(name), setProgress(metres) }, plus:
     jumpTo(camTop)   put the camera somewhere without animating
     setTarget(camTop), setFollow(fn | null)   drive the camera directly (the Reveal ties it to page scroll)
     yOf(metres)      screen y (CSS px) of a depth, for DOM overlays (ruler, YOU marker, boat)
     ppm()            CSS px per metre; camFor(metres) the camera that keeps that depth at 40% of the screen
   Cameras: 'surface' (waterline at 25%, daylight), 'descent' (the Run: follows your depth), 'deep' (the Reveal: dusk sky). */

const OceanScene = (() => {
  const PXS = 4, VIEW_M = 520;                       // 4 CSS px per scene pixel; ~520 m visible top to bottom
  const canvas = $('#scene'), ctx = canvas.getContext('2d');
  let SW = 0, SH = 0;
  const ppm = () => innerHeight / VIEW_M;
  const SURFACE = -.25 * VIEW_M;                      // camera top (m) with the waterline at 25% of the screen
  const camFor = m => Math.max(SURFACE, m - .4 * VIEW_M);
  const S = { camera: 'surface', cam: SURFACE, v: 0, target: SURFACE, follow: null, dusk: false, last: 0 };

  /* ---- colour ---- */
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lerp3 = (A, B, f) => A.map((v, i) => Math.round(v + (B[i] - v) * f));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const WATER = [[0, '#2e5b87'], [120, '#26507a'], [300, '#1b3c60'], [600, '#132c49'], [1000, '#0c1a2f'], [2000, '#091425'],
    [4000, '#060c19'], [6000, '#04070f'], [7600, '#020308']].map(([d, c]) => [d, hex(c)]);
  const waterAt = d => {
    if (d <= 0) return WATER[0][1];
    for (let i = 1; i < WATER.length; i++) if (d <= WATER[i][0]) { const [d0, c0] = WATER[i - 1], [d1, c1] = WATER[i]; return lerp3(c0, c1, (d - d0) / (d1 - d0)); }
    return WATER[WATER.length - 1][1];
  };
  const SKY = { day: [hex('#a9cbe2'), hex('#eaf4f8')], dusk: [hex('#1c2340'), hex('#7a5a6e')] };

  /* ---- world contents (seeded, so the ocean is the same every dive) ---- */
  let seed = 7;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const dir = () => rnd() < .5 ? -1 : 1;
  const C = [];
  for (let i = 0; i < 12; i++) C.push({ k: 'school', d: 25 + rnd() * 620, x: rnd(), v: (.008 + rnd() * .014) * dir(), n: 4 + Math.floor(rnd() * 6), ph: rnd() * 6 });
  for (let i = 0; i < 12; i++) C.push({ k: 'fish', d: 150 + rnd() * 1500, x: rnd(), v: (.004 + rnd() * .01) * dir(), s: rnd() < .3 ? 2 : 1 });
  for (let i = 0; i < 16; i++) C.push({ k: 'jelly', d: 280 + rnd() * 2300, x: rnd(), v: (rnd() - .5) * .004, ph: rnd() * 6, s: rnd() < .35 ? 2 : 1 });
  for (let i = 0; i < 16; i++) C.push({ k: 'angler', d: 1000 + rnd() * 5000, x: rnd(), v: (.002 + rnd() * .004) * dir(), ph: rnd() * 6 });
  for (let i = 0; i < 90; i++) C.push({ k: 'spark', d: 2200 + rnd() * 5200, x: rnd(), v: 0, ph: rnd() * 6, c: rnd() < .5 ? '77,227,255' : '157,123,255' });
  C.push({ k: 'whale', d: 430, x: .08, v: .0025 });
  C.push({ k: 'squid', d: 2700, x: .8, v: -.0018, ph: 0 });
  C.push({ k: 'squid', d: 5300, x: .18, v: .0014, ph: 2 });
  const snow = Array.from({ length: 120 }, () => ({ x: rnd(), y: rnd(), v: 2 + rnd() * 5, s: rnd() < .15 ? 2 : 1 }));
  const clouds = [{ x: 10, y: 12, w: 46, s: .0012 }, { x: 140, y: 30, w: 30, s: .0018 }, { x: 240, y: 6, w: 58, s: .0009 }, { x: 330, y: 38, w: 24, s: .0022 }];

  /* ---- the boat (DOM sprite that rides the waterline) ---- */
  const boatMap = [
    '..........PPPPM...........', '...........PPPM...........', '..............M...........', '..............M...........',
    '...........DDDDDDD........', '...........DWDDWDD........', 'DDDDDDDDDDDDDDDDDDDDDDDDD.', '.DDDDDDDDDDDDDDDDDDDDDDDD.',
    '..DDDDDDDDDDDDDDDDDDDDDD..', '...DDDDDDDDDDDDDDDDDDDD...',
  ];
  const boat = $('#boat');
  boat.innerHTML = px(boatMap, { D: '#0e1a2b', M: '#0e1a2b', P: '#ff5d8f', W: '#7fb3d5' }, 5);

  const wrapX = (x, v, t) => ((((x + t / 1000 * v) % 1.2) + 1.2) % 1.2 - .1) * SW;
  function cloud(x, y, w, dusk) {
    ctx.fillStyle = dusk ? '#4a4a6a' : '#ffffff';
    ctx.fillRect(x, y + 4, w, 4); ctx.fillRect(x + 3, y + 2, w - 9, 2); ctx.fillRect(x + 7, y, Math.round(w * .4), 2);
    ctx.fillStyle = dusk ? '#3a3a58' : '#d6eaf6'; ctx.fillRect(x + 2, y + 8, w - 4, 1);
  }

  function paint(t) {
    const dt = Math.min(.05, (t - (S.last || t)) / 1000); S.last = t;
    if (S.follow) S.target = S.follow();
    if (reduced) { S.cam = S.target; S.v = 0; }
    else { const a = -26 * (S.cam - S.target) - 9.4 * S.v; S.v += a * dt; S.cam += S.v * dt; }   // camera spring (m, m/s)
    const P = ppm() / PXS;                                   // scene px per metre
    const depthAtRow = y => S.cam + y / P;
    const wl = Math.round(-S.cam * P);                       // waterline row
    const dusk = S.dusk;

    /* sky */
    if (wl > 0) {
      const [top, low] = dusk ? SKY.dusk : SKY.day;
      for (let y = 0; y < Math.min(wl, SH); y++) { const f = Math.max(0, 1 - (wl - y) / (SH * .6)); ctx.fillStyle = rgb(lerp3(top, low, f)); ctx.fillRect(0, y, SW, 1); }
      if (!dusk) {
        const sun = ctx.createRadialGradient(SW * .82, wl - SH * .55, 2, SW * .82, wl - SH * .55, SH * .45);
        sun.addColorStop(0, 'rgba(255,240,190,.75)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = sun; ctx.fillRect(0, 0, SW, wl);
      } else {
        const glow = ctx.createLinearGradient(0, wl - 30, 0, wl);
        glow.addColorStop(0, 'rgba(255,140,120,0)'); glow.addColorStop(1, 'rgba(255,150,120,.22)');
        ctx.fillStyle = glow; ctx.fillRect(0, wl - 30, SW, 30);
      }
      clouds.forEach(c => cloud(Math.round(((c.x + t * c.s) % (SW + 90)) - 70), Math.round(wl - SH * .55 + c.y), c.w, dusk));
    }
    /* water, row by row by depth */
    const sy = Math.max(0, wl);
    const DUSK_SEA = [8, 14, 28];
    for (let y = sy; y < SH; y++) { const c = waterAt(depthAtRow(y)); ctx.fillStyle = rgb(dusk ? lerp3(c, DUSK_SEA, .4) : c); ctx.fillRect(0, y, SW, 1); }
    /* waterline waves */
    if (wl > -4 && wl < SH + 4) {
      const skyLow = dusk ? '#7a5a6e' : '#eaf4f8', foam = dusk ? '#9a8aa8' : '#bfe9f7', top = rgb(waterAt(1));
      for (let x = 0; x < SW; x++) {
        const y = wl + Math.round(Math.sin(x * .09 + t * .0016) * 1.1 + Math.sin(x * .023 - t * .0009) * .9);
        if (y > wl) { ctx.fillStyle = skyLow; ctx.fillRect(x, wl, 1, y - wl); } else if (y < wl) { ctx.fillStyle = top; ctx.fillRect(x, y, 1, wl - y); }
        ctx.fillStyle = foam; ctx.fillRect(x, y, 1, 1);
      }
    }
    /* light rays: strong at the surface, gone by ~300 m */
    const rayA = .07 * Math.max(0, 1 - Math.max(0, S.cam) / 300) * (dusk ? .4 : 1);
    if (rayA > .002) {
      ctx.fillStyle = `rgba(190,235,255,${rayA})`;
      const len = 300 * P;
      for (let i = 0; i < 5; i++) {
        const x0 = SW * (.08 + i * .21) + Math.sin(t * .0003 + i) * 8;
        ctx.beginPath(); ctx.moveTo(x0, sy); ctx.lineTo(x0 + 9, sy); ctx.lineTo(x0 + 40, wl + len); ctx.lineTo(x0 + 18, wl + len); ctx.fill();
      }
    }
    /* creatures, in world space */
    const vis = d => { const y = (d - S.cam) * P; return y > -60 && y < SH + 60 ? y : null; };
    C.forEach(c => {
      const y0 = vis(c.d); if (y0 === null || c.d <= 0) return;
      const x = wrapX(c.x, c.v, t), y = Math.round(y0), dd = c.v >= 0 ? 1 : -1;
      if (c.k === 'school') {
        const a = .55 * Math.max(.15, 1 - c.d / 900);
        for (let j = 0; j < c.n; j++) {
          const fx = Math.round(x + (j % 3) * 6 * -dd + Math.sin(t * .002 + j) * 1.5), fy = y + Math.floor(j / 3) * 3 + Math.round(Math.sin(t * .0015 + j * 2 + c.ph));
          ctx.fillStyle = `rgba(4,10,20,${a})`; ctx.fillRect(fx, fy, 3, 2); ctx.fillRect(fx + (dd > 0 ? -1 : 3), fy + (j % 2 ? 0 : 1), 1, 1);
        }
      } else if (c.k === 'fish') {
        const s = c.s, a = .45 * Math.max(.2, 1 - c.d / 1800);
        ctx.fillStyle = `rgba(3,8,16,${a})`; ctx.fillRect(Math.round(x), y, 4 * s, 2 * s); ctx.fillRect(Math.round(x) + (dd > 0 ? -s : 4 * s), y - Math.ceil(s / 2), s, 3 * s - 1);
      } else if (c.k === 'jelly') {
        const s = c.s, by = y + Math.round(Math.sin(t * .0012 + c.ph) * 3), bx = Math.round(x), pulse = .5 + .5 * Math.sin(t * .003 + c.ph);
        ctx.fillStyle = `rgba(157,123,255,${.03 + .04 * pulse})`; ctx.fillRect(bx - s, by - s, 7 * s, 5 * s);
        ctx.fillStyle = 'rgba(200,175,255,.6)'; ctx.fillRect(bx + s, by, 3 * s, s); ctx.fillRect(bx, by + s, 5 * s, s);
        ctx.fillStyle = 'rgba(157,123,255,.55)'; ctx.fillRect(bx, by + 2 * s, 5 * s, s);
        ctx.fillStyle = 'rgba(157,123,255,.35)';
        for (let k = 0; k < 3; k++) for (let j = 0; j < 3 + 2 * s + (k % 2) * 2; j++) ctx.fillRect(bx + k * 2 * s + Math.round(Math.sin(t * .004 + j * .6 + k + c.ph)), by + 3 * s + j, 1, 1);
      } else if (c.k === 'angler') {
        const bx = Math.round(x), pulse = .55 + .45 * Math.sin(t * .004 + c.ph);
        ctx.fillStyle = 'rgba(12,18,32,.9)'; ctx.fillRect(bx, y, 5, 3); ctx.fillRect(bx + (dd > 0 ? -1 : 5), y, 1, 2);
        const lx = bx + (dd > 0 ? 6 : -2), ly = y - 2;
        ctx.fillStyle = `rgba(255,209,102,${.18 * pulse})`; ctx.fillRect(lx - 2, ly - 2, 5, 5);
        ctx.fillStyle = `rgba(255,209,102,${.4 + .6 * pulse})`; ctx.fillRect(lx, ly, 1, 1);
      } else if (c.k === 'spark') {
        const a = Math.max(0, Math.sin(t * .002 + c.ph)) * .8; if (a < .05) return;
        ctx.fillStyle = `rgba(${c.c},${a})`; ctx.fillRect(Math.round(c.x * SW), y, 1, 1);
      } else if (c.k === 'whale') {
        const bx = Math.round(x);
        ctx.fillStyle = 'rgba(6,16,30,.5)';
        ctx.fillRect(bx, y, 30, 6); ctx.fillRect(bx + 4, y - 2, 20, 2); ctx.fillRect(bx + 2, y + 6, 22, 2); ctx.fillRect(bx - 6, y - 2, 6, 3); ctx.fillRect(bx - 8, y - 4, 3, 3); ctx.fillRect(bx - 8, y + 1, 3, 3);
      } else if (c.k === 'squid') {
        const bx = Math.round(x), wob = t * .0012 + c.ph;
        ctx.fillStyle = 'rgba(40,52,84,.55)';
        ctx.fillRect(bx, y, 7, 16); ctx.fillRect(bx + 1, y - 3, 5, 3); ctx.fillRect(bx + 2, y - 5, 3, 2);
        ctx.fillStyle = 'rgba(255,92,92,.5)'; ctx.fillRect(bx + 2, y + 12, 1, 1); ctx.fillRect(bx + 4, y + 12, 1, 1);
        ctx.fillStyle = 'rgba(40,52,84,.45)';
        for (let k = 0; k < 7; k++) for (let j = 0; j < 18 + (k % 3) * 4; j++) ctx.fillRect(bx + k + Math.round(Math.sin(wob + j * .25 + k) * (j / 8)), y + 16 + j, 1, 1);
      }
    });
    /* marine snow: parallax 0.85 with the camera, so a descent streams it upward */
    const tile = SH * 1.4, snowA = Math.min(.5, Math.max(0, (S.cam + 200) / 900));
    if (snowA > .02) {
      snow.forEach(p => {
        const y = ((p.y * tile - S.cam * P * .85 + t / 1000 * p.v) % tile + tile) % tile - SH * .2;
        if (y < sy) return;
        ctx.fillStyle = `rgba(200,220,255,${snowA * (p.s > 1 ? .8 : .55)})`;
        ctx.fillRect(Math.round(p.x * SW + Math.sin(t * .0005 + p.y * 9) * 2), Math.round(y), p.s, p.s);
      });
    }
    /* trench walls and floor */
    if (S.cam + SH / P > 5800) {
      for (let y = sy; y < SH; y++) {
        const d = depthAtRow(y); if (d < 5800) continue;
        const k = Math.min(1, (d - 5800) / 1500), n = Math.sin(d * .05) * 3 + Math.sin(d * .013) * 5;
        ctx.fillStyle = '#010206';
        ctx.fillRect(0, y, Math.max(0, Math.round(SW * .16 * k + n)), 1);
        ctx.fillRect(SW - Math.max(0, Math.round(SW * .14 * k - n)), y, SW, 1);
        if (d > 7400 + Math.sin(y * .3) * 6) { ctx.fillStyle = '#030509'; ctx.fillRect(0, y, SW, 1); }
      }
    }
    /* the boat rides the waterline; off screen once you've gone under */
    const wlPx = -S.cam * ppm();
    boat.style.transform = `translateY(${wlPx - 46}px)`;
    boat.style.visibility = wlPx < -80 ? 'hidden' : 'visible';
    /* bubbles stream up while the camera is moving down */
    if (S.camera === 'descent' && S.v > 25 && Math.random() < Math.min(.9, S.v / 200)) Particles.emit(Math.random() * innerWidth, innerHeight * (.4 + Math.random() * .6), 1);
  }

  return {
    ppm, camFor, SURFACE,
    get cam() { return S.cam; }, get moving() { return Math.abs(S.v) > 4; },
    yOf: m => (m - S.cam) * ppm(),
    resize() { SW = Math.ceil(innerWidth / PXS); SH = Math.ceil(innerHeight / PXS); canvas.width = SW; canvas.height = SH; },
    setCamera(c) {
      S.camera = c; S.dusk = c === 'deep';
      if (c === 'surface') { S.follow = null; S.target = SURFACE; }
    },
    setProgress(m) { S.target = camFor(m); },
    setTarget(cam) { S.target = cam; },
    setFollow(fn) { S.follow = fn; },
    jumpTo(cam) { S.cam = S.target = cam; S.v = 0; },
    paint,
  };
})();

const ANGLER = {
  map: ['..........GG....', '.........GYYG...', '..........GG....', '.........S......', '........S.......', '....PPPPP.......', '..PPPPPPPPP....T',
        '.PPHEPPPPPPP..TT', 'PPPPPPPPPPPPPTTT', 'WDWDWPPPPPPPPPTT', 'DDDDDDPPPPPPP..T', 'WDWDWPPPPPPP....', '.PPPPPPPPPP.....', '...PPPPPP.......'],
  pal: { P: '#6b5bd6', T: '#4a3fa0', S: '#4a3fa0', H: '#e8f1ff', E: '#050a14', W: '#e8f1ff', D: '#2a0f22', G: '#c29a2e', Y: '#ffd166' },
  scale: 4,
};
