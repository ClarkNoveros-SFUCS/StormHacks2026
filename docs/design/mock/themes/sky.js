'use strict';
/* The site's living backdrop (design-system.md "SkyBackdrop"): a pixel sky with twinkling stars, a moon or low sun,
   drifting clouds, the odd flock of birds, and cursor parallax. Tinted by local time of day (night / dusk / day;
   override with ?tod=day|dusk|night). On the landing ('landing' camera) the sky becomes ocean as you scroll:
   the waterline rises from the bottom of the hero and the page continues under the sea (fish, rays, bubbles).
   Other site pages use the 'calm' camera: the same sky, dimmed so cards read. */

const SkyScene = (() => {
  const PXS = 3, canvas = $('#scene'), ctx = canvas.getContext('2d');
  let SW = 0, SH = 0;
  const S = { camera: 'calm', mx: .5, my: .5, sx: .5, sy: .5 };
  const q = new URLSearchParams(location.search).get('tod');
  const todNow = () => { const h = new Date().getHours(); return h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night'; };
  let tod = q || todNow();
  const PAL = {
    night: { top: '#060915', mid: '#0c1230', low: '#1a2252', star: 1, cloud: ['#1d2550', '#151b3d'], orb: '#e8ecff' },
    dusk: { top: '#0f0b26', mid: '#2b1d4a', low: '#7a3d5c', star: .55, cloud: ['#4b2d5c', '#3a2350'], orb: '#ffb36b' },
    day: { top: '#0d1d45', mid: '#1c3a75', low: '#3f6eab', star: .2, cloud: ['#5f86c0', '#4a6fa8'], orb: '#ffe9a8' },
  };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, f) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stars = Array.from({ length: 170 }, () => ({ x: rnd(), y: rnd() * .85, s: rnd() < .12 ? 2 : 1, ph: rnd() * 6, z: .3 + rnd() * .7 }));
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: rnd(), y: .08 + rnd() * .5, w: 18 + Math.floor(rnd() * 40), v: .004 + rnd() * .01, z: i < 5 ? .4 : 1 }));
  const fishes = Array.from({ length: 16 }, () => ({ x: rnd(), d: .05 + rnd() * .9, v: (.01 + rnd() * .02) * (rnd() < .5 ? -1 : 1), s: rnd() < .3 ? 2 : 1 }));
  let birds = null;

  addEventListener('pointermove', e => { S.mx = e.clientX / innerWidth; S.my = e.clientY / innerHeight; });
  function cloud(x, y, w, c) {
    ctx.fillStyle = c[0];
    ctx.fillRect(x, y + 3, w, 3); ctx.fillRect(x + 3, y + 1, w - 8, 2); ctx.fillRect(x + 6, y, Math.round(w * .4), 1);
    ctx.fillStyle = c[1]; ctx.fillRect(x + 2, y + 6, w - 4, 1);
  }
  return {
    world: 'site',
    resize() { SW = Math.ceil(innerWidth / PXS); SH = Math.ceil(innerHeight / PXS); canvas.width = SW; canvas.height = SH; },
    setCamera(c) { S.camera = c; },
    setProgress() {},
    setTod(v) { tod = v === 'auto' ? todNow() : v; },
    get tod() { return tod; },
    paint(t) {
      const P = PAL[tod];
      if (!reduced) { S.sx += (S.mx - S.sx) * .05; S.sy += (S.my - S.sy) * .05; }
      const px0 = (S.sx - .5), py0 = (S.sy - .5);
      const landing = S.camera === 'landing';
      const wl = landing ? Math.round((innerHeight * .96 - scrollY * .85) / PXS) : SH + 10;   // waterline row (landing only)
      const skyH = Math.min(SH, Math.max(0, wl));
      /* sky gradient */
      for (let y = 0; y < skyH; y++) { const f = y / SH; ctx.fillStyle = f < .55 ? mix(P.top, P.mid, f / .55) : mix(P.mid, P.low, (f - .55) / .45); ctx.fillRect(0, y, SW, 1); }
      /* stars, with parallax and twinkle */
      stars.forEach(s => {
        const x = Math.round(s.x * SW - px0 * 10 * s.z), y = Math.round(s.y * SH - py0 * 6 * s.z);
        if (y >= skyH) return;
        const a = P.star * (.35 + .65 * Math.abs(Math.sin(t * .001 * s.z + s.ph)));
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, s.s, s.s);
      });
      /* moon / low sun */
      const ox = Math.round(SW * .8 - px0 * 6), oy = Math.round(SH * (tod === 'night' ? .16 : .3) - py0 * 4);
      if (oy < skyH) {
        const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, 36); g.addColorStop(0, P.orb + '66'); g.addColorStop(1, P.orb + '00');
        ctx.fillStyle = g; ctx.fillRect(ox - 40, oy - 40, 80, 80);
        const disc = (cx, cy, r) => { for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); ctx.fillRect(cx - w, cy + dy, 2 * w, 1); } };
        ctx.fillStyle = P.orb; disc(ox, oy, 7);
        if (tod === 'night') { ctx.fillStyle = mix(P.top, P.mid, Math.min(1, oy / SH / .55)); disc(ox + 4, oy - 2, 6); }   // a pixel crescent
      }
      /* clouds: far layer slow, near layer faster, both with cursor parallax */
      clouds.forEach(c => {
        const x = Math.round((((c.x + t / 1000 * c.v * c.z) % 1.3) + 1.3) % 1.3 * SW - SW * .15 - px0 * 22 * c.z), y = Math.round(c.y * SH - py0 * 10 * c.z);
        if (y < skyH - 6) cloud(x, y, c.w, c.z < 1 ? [P.cloud[1], P.cloud[1]] : P.cloud);
      });
      /* a flock of birds now and then */
      if (!birds && Math.random() < .002) birds = { x: -10, y: SH * (.15 + Math.random() * .3), v: 18 + Math.random() * 10, t0: t };
      if (birds) {
        birds.x += birds.v / 60;
        ctx.fillStyle = tod === 'day' ? '#0a1430' : '#05070f';
        for (let i = 0; i < 5; i++) {
          const bx = Math.round(birds.x - i * 6), by = Math.round(birds.y + (i % 2) * 3 + i), up = Math.sin(t * .015 + i) > 0;
          if (by < skyH) { ctx.fillRect(bx - 2, by + (up ? -1 : 0), 2, 1); ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx + 1, by + (up ? -1 : 0), 2, 1); }
        }
        if (birds.x > SW + 40) birds = null;
      }
      /* the sea (landing): waterline, depth gradient, rays, fish */
      if (wl < SH) {
        const top = Math.max(0, wl);
        for (let y = top; y < SH; y++) { const d = (y - wl) / (SH * 1.6); ctx.fillStyle = mix('#1d4f80', '#060c1c', Math.min(1, d)); ctx.fillRect(0, y, SW, 1); }
        for (let x = 0; x < SW; x++) {
          const y = wl + Math.round(Math.sin(x * .09 + t * .0016) * 1.1 + Math.sin(x * .023 - t * .0009) * .9);
          ctx.fillStyle = '#9fd8ef'; ctx.fillRect(x, y, 1, 1);
        }
        ctx.fillStyle = 'rgba(170,225,255,.05)';
        for (let i = 0; i < 5; i++) { const x0 = SW * (.1 + i * .2) + Math.sin(t * .0003 + i) * 6; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0 + 8, top); ctx.lineTo(x0 + 34, SH); ctx.lineTo(x0 + 14, SH); ctx.fill(); }
        fishes.forEach(f => {
          const y = Math.round(wl + 8 + f.d * SH * 1.2); if (y < top || y > SH) return;
          const x = Math.round((((f.x + t / 1000 * f.v) % 1.2) + 1.2) % 1.2 * SW - SW * .1), s = f.s;
          ctx.fillStyle = 'rgba(3,8,18,.45)'; ctx.fillRect(x, y, 4 * s, 2 * s); ctx.fillRect(x + (f.v > 0 ? -s : 4 * s), y - Math.ceil(s / 2), s, 3 * s - 1);
        });
        if (!reduced && Math.random() < .08) Particles.emit(Math.random() * innerWidth, innerHeight + 4, 1, 'rgba(180,230,255,.6)');
      }
      /* calm pages: dim the sky so cards read */
      if (!landing) { ctx.fillStyle = 'rgba(10,13,28,.45)'; ctx.fillRect(0, 0, SW, SH); }
    },
  };
})();

registerTheme('site', { scene: SkyScene, mascot: null, world: 'site', particle: 'rgba(180,230,255,.6)', sounds: {} });
