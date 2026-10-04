'use strict';
/* The ocean scene (design-system.md §3) and the HOUSE theme that the app shell uses.
   Dive reuses this scene with more cameras (modes/dive/dive.js). A future Mode may register its own scene.
   Scene interface: { resize(), paint(t), setCamera(name), setProgress(value) } */

const OceanScene = (() => {
  const PXS = 4, canvas = $('#scene'), ctx = canvas.getContext('2d');
  let SW = 0, SH = 0;
  const S = { camera: 'surface', wl: .55, wlT: .55, depth: 0, depthT: 0 };
  const clouds = [{ x: 10, y: 10, w: 46, s: .0012 }, { x: 140, y: 26, w: 30, s: .0018 }, { x: 240, y: 6, w: 58, s: .0009 }, { x: 330, y: 34, w: 24, s: .0022 }];
  const fishes = Array.from({ length: 10 }, () => ({ x: Math.random(), y: .2 + Math.random() * .75, v: (.000012 + Math.random() * .00003) * (Math.random() < .5 ? -1 : 1), s: 1 + Math.floor(Math.random() * 2) }));
  const snow = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: .000015 + Math.random() * .00003 }));
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, f) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };
  const boatMap = [
    '..........PPPPM...........', '...........PPPM...........', '..............M...........', '..............M...........',
    '...........DDDDDDD........', '...........DWDDWDD........', 'DDDDDDDDDDDDDDDDDDDDDDDDD.', '.DDDDDDDDDDDDDDDDDDDDDDDD.',
    '..DDDDDDDDDDDDDDDDDDDDDD..', '...DDDDDDDDDDDDDDDDDDDD...',
  ];
  const boat = $('#boat');
  boat.innerHTML = px(boatMap, { D: '#0e1a2b', M: '#0e1a2b', P: '#ff5d8f', W: '#7fb3d5' }, 5);

  function cloud(x, y, w, night) {
    ctx.fillStyle = night ? '#4a5a76' : '#ffffff';
    ctx.fillRect(x, y + 4, w, 4); ctx.fillRect(x + 3, y + 2, w - 9, 2); ctx.fillRect(x + 7, y, Math.round(w * .4), 2);
    ctx.fillStyle = night ? '#3c4b66' : '#d6eaf6';
    ctx.fillRect(x + 2, y + 8, w - 4, 1);
  }
  return {
    resize() { SW = Math.ceil(innerWidth / PXS); SH = Math.ceil(innerHeight / PXS); canvas.width = SW; canvas.height = SH; },
    setCamera(c) { S.camera = c; S.wlT = c === 'descent' ? -.25 : .55; if (c !== 'descent') S.depthT = 0; boat.style.display = ''; },
    setProgress(m) { S.depthT = m; },
    paint(t) {
      S.wl += (S.wlT - S.wl) * .05;
      S.depth += (S.depthT - S.depth) * .04;
      const wl = Math.round(S.wl * SH), night = S.camera === 'deep';
      if (wl > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, wl);
        g.addColorStop(0, night ? '#1a2640' : '#8fc9ec'); g.addColorStop(1, night ? '#3b4a66' : '#e6f4fb');
        ctx.fillStyle = g; ctx.fillRect(0, 0, SW, wl);
        if (!night) {
          const sun = ctx.createRadialGradient(SW * .82, -4, 2, SW * .82, -4, SH * .45);
          sun.addColorStop(0, 'rgba(255,240,190,.75)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
          ctx.fillStyle = sun; ctx.fillRect(0, 0, SW, wl);
        }
        const sc = wl / (SH * .55);
        clouds.forEach(c => cloud(Math.round(((c.x + t * c.s) % (SW + 90)) - 70), Math.round(c.y * sc), c.w, night));
      }
      const f = Math.min(1, S.depth / 4000);
      const top = S.camera === 'surface' ? '#2a6a99' : night ? '#14304d' : mix('#1d4a73', '#05080f', f);
      const bot = S.camera === 'surface' ? '#0b1a30' : night ? '#050a14' : mix('#0b1a30', '#010205', f);
      const sy = Math.max(0, wl);
      const g2 = ctx.createLinearGradient(0, sy, 0, SH);
      g2.addColorStop(0, top); g2.addColorStop(1, bot);
      ctx.fillStyle = g2; ctx.fillRect(0, sy, SW, SH - sy);
      if (wl > -4) {                                             // waterline
        const skyLow = night ? '#3b4a66' : '#e6f4fb', foam = night ? '#6d86a8' : '#bfe9f7';
        for (let x = 0; x < SW; x++) {
          const y = wl + Math.round(Math.sin(x * .09 + t * .0016) * 1.1 + Math.sin(x * .023 - t * .0009) * .9);
          if (y > wl) { ctx.fillStyle = skyLow; ctx.fillRect(x, wl, 1, y - wl); }
          else if (y < wl) { ctx.fillStyle = top; ctx.fillRect(x, y, 1, wl - y); }
          ctx.fillStyle = foam; ctx.fillRect(x, y, 1, 1);
        }
      }
      if (!night && f < .8) {                                    // light rays
        ctx.fillStyle = `rgba(190,235,255,${.05 * (1 - f)})`;
        for (let i = 0; i < 4; i++) {
          const x0 = (SW * (.15 + i * .24)) + Math.sin(t * .0003 + i) * 8;
          ctx.beginPath(); ctx.moveTo(x0, sy); ctx.lineTo(x0 + 10, sy); ctx.lineTo(x0 + 34, SH); ctx.lineTo(x0 + 14, SH); ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(3,8,18,.45)';                        // distant fish
      fishes.forEach(fi => {
        const x = Math.round((((fi.x + t * fi.v) % 1) + 1) % 1 * (SW + 20) - 10), y = Math.round(sy + 6 + fi.y * (SH - sy - 10)), s = fi.s, dir = fi.v > 0 ? 1 : -1;
        ctx.fillRect(x, y, 4 * s, 2 * s); ctx.fillRect(x + (dir > 0 ? -s : 4 * s), y - Math.ceil(s / 2), s, 3 * s - 1);
      });
      if (S.camera !== 'surface') {                              // marine snow
        ctx.fillStyle = 'rgba(200,220,255,.28)';
        snow.forEach(p => ctx.fillRect(Math.round(p.x * SW + Math.sin(t * .0005 + p.y * 9) * 2), Math.round(((p.y + t * p.v) % 1) * SH), 1, 1));
      }
      boat.style.transform = `translateY(${wl * PXS - 46}px)`;   // the boat rides the waterline
    },
  };
})();

const ANGLER = {
  map: ['..........GG....', '.........GYYG...', '..........GG....', '.........S......', '........S.......', '....PPPPP.......', '..PPPPPPPPP....T',
        '.PPHEPPPPPPP..TT', 'PPPPPPPPPPPPPTTT', 'WDWDWPPPPPPPPPTT', 'DDDDDDPPPPPPP..T', 'WDWDWPPPPPPP....', '.PPPPPPPPPP.....', '...PPPPPP.......'],
  pal: { P: '#6b5bd6', T: '#4a3fa0', S: '#4a3fa0', H: '#e8f1ff', E: '#050a14', W: '#e8f1ff', D: '#2a0f22', G: '#c29a2e', Y: '#ffd166' },
  scale: 4,
};

/* House theme: the shell (landing, Modules, Module page, New Game dialog). Token values = :root in system.css. */
registerTheme('house', { scene: OceanScene, mascot: ANGLER, particle: 'rgba(200,235,255,.8)', sounds: {} });
