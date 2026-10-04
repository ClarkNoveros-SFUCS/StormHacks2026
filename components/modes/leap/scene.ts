// The Leap world in three.js: a voxel hopper on floating sky islands that climb upward, with
// parallax cloud layers, a sky that warms to dusk and then stars as you near the summit, and a
// flag on the top island. Plain TypeScript, no React: LeapStage loads it with a dynamic import
// and drives it with the methods below. Platform 0 is the start; platform k is where question k
// lands you; the last one is the summit. Spec: docs/design/modes/leap.md § The world.
import * as THREE from "three";

export type LeapFrame = { hopperX: number; hopperY: number };

export type LeapSceneOptions = {
  reduced: boolean;
  /** Questions in the Run (platforms 1..count; the last is the summit). */
  count: number;
  /** Hopper colours (body, belly, accent). */
  colors?: { body: string; belly: string; accent: string };
  onFrame?: (f: LeapFrame) => void;
};

const STEP_Y = 2.5;
const GRAVITY = -26;

type Chunk = { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number };
type Puff = { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number };
type Anim =
  | { kind: "idle" }
  | { kind: "jump"; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; done?: () => void }
  | { kind: "miss"; from: THREE.Vector3; toward: THREE.Vector3; t: number; dur: number; fatal: boolean; crumbled: boolean; target: number; done?: () => void }
  | { kind: "fall"; v: THREE.Vector3; t: number }
  | { kind: "cheer"; t: number };

/** Where platform k floats. Zig-zags up so each jump is a real leap sideways and up. */
export function platformPosition(k: number, count: number): { x: number; y: number; z: number } {
  if (k <= 0) return { x: 0, y: 0, z: 0 };
  const side = k % 2 === 1 ? -1 : 1;
  const spread = 1.8 + ((k * 7) % 3) * 0.35;
  const summit = k >= count;
  return { x: summit ? 0 : side * spread, y: k * STEP_Y + (summit ? 0.6 : 0), z: summit ? -0.6 : -((k * 3) % 4) * 0.35 };
}

export class LeapScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  private canvas: HTMLCanvasElement;
  private opts: LeapSceneOptions;
  private raf = 0;
  private paused = false;
  private disposed = false;
  private last = 0;
  private t = 0;
  private cleanups: (() => void)[] = [];
  private viewW = 1;
  private viewH = 1;

  private skyU = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uSun: { value: new THREE.Color() } };
  private sky!: THREE.Mesh;
  private stars!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private fog = new THREE.Fog(0xbfe3ff, 18, 90);
  private clouds: { s: THREE.Sprite; speed: number; baseX: number; span: number }[] = [];
  private islands: THREE.Group[] = [];
  private islandPhase: number[] = [];
  private nextRing!: THREE.Mesh;
  private flag = new THREE.Group();
  private cloth!: THREE.Mesh;
  private flagRaise = 0;
  private hopper = new THREE.Group();
  private body = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private shadow!: THREE.Mesh;
  private anim: Anim = { kind: "idle" };
  private standOn = 0;
  private target: number | null = null;
  private focus = 0.35;
  private hop = new THREE.Vector3();
  private squash = { y: 1, vy: 0 };
  private wobble = { a: 0, v: 0 };
  private facing = 0;
  private chunks: Chunk[] = [];
  private puffs: Puff[] = [];
  private chunkGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  private puffGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  private puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  private camY = 1.5;
  private camYv = 0;
  private camX = 0;
  private mouse = { x: 0, y: 0 };
  private crumbled = new Set<number>();
  private tmp = new THREE.Vector3();
  private blinkAt = 2;

  private mats = {
    grass: new THREE.MeshLambertMaterial({ color: 0x5bd16f, flatShading: true }),
    grassDark: new THREE.MeshLambertMaterial({ color: 0x3fae5a, flatShading: true }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x8a5a3b, flatShading: true }),
    stone: new THREE.MeshLambertMaterial({ color: 0x6b6f86, flatShading: true }),
    stoneDark: new THREE.MeshLambertMaterial({ color: 0x4d5068, flatShading: true }),
    vine: new THREE.MeshLambertMaterial({ color: 0x2f9a4c }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x7a4a2a }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x2fbf6a, flatShading: true }),
    flowerA: new THREE.MeshLambertMaterial({ color: 0xff5d8f }),
    flowerB: new THREE.MeshLambertMaterial({ color: 0xffd84d }),
    snow: new THREE.MeshLambertMaterial({ color: 0xf2f6ff, flatShading: true }),
  };

  constructor(canvas: HTMLCanvasElement, opts: LeapSceneOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = this.fog;

    this.buildSky();
    this.buildClouds();
    this.buildIslands();
    this.buildFlag();
    this.buildHopper();
    this.bindInput();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanups.push(() => ro.disconnect());
    this.resize();
    this.place(0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ===================================================================================
  // Public API

  /** Stand on platform k now (start, or a reload); `crumbled` platforms are already gone. */
  place(k: number, crumbled: number[] = []) {
    for (const c of crumbled) this.removeIsland(c);
    this.standOn = k;
    const p = this.islandTop(k);
    this.hop.copy(p);
    this.hopper.position.copy(p);
    this.anim = { kind: "idle" };
    this.camY = p.y + 1.6;
    this.camX = p.x * 0.35;
  }

  /** A correct answer: squash, leap in an arc to platform k, land in a dust puff. */
  jumpTo(k: number, done?: () => void) {
    const from = this.hopper.position.clone();
    const to = this.islandTop(k);
    this.standOn = k;
    this.anim = { kind: "jump", from, to, t: 0, dur: this.opts.reduced ? 0.5 : 0.8, done };
  }

  /** A miss: platform `target` crumbles. Not fatal: a short hop and a wobble back. Fatal: the hopper falls. */
  miss(target: number, fatal: boolean, done?: () => void) {
    const from = this.hopper.position.clone();
    const toward = this.islandTop(target);
    this.anim = { kind: "miss", from, toward, t: 0, dur: fatal ? 0.55 : 0.7, fatal, crumbled: false, target, done };
  }

  /** The Run is cleared: raise the flag and celebrate. */
  summit() {
    this.flagRaise = Math.max(this.flagRaise, 0.0001);
    this.anim = { kind: "cheer", t: 0 };
    const top = this.islandTop(this.opts.count);
    for (let i = 0; i < 40; i++) this.puff(top.clone().add(new THREE.Vector3(0, 2.2, 0)), [0xffd84d, 0xff5d8f, 0x4de3ff, 0x3ddc97][i % 4], 6);
  }

  /** Mark the platform the current question lands on (null hides the marker). */
  setTarget(k: number | null) {
    this.target = k;
  }

  setReduced(reduced: boolean) {
    this.opts.reduced = reduced;
  }

  setPaused(paused: boolean) {
    if (paused === this.paused || this.disposed) return;
    this.paused = paused;
    if (paused) cancelAnimationFrame(this.raf);
    else {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  /** Advance one frame by hand (dev tools drive a background tab with it). */
  step(ms = 16) {
    if (!this.disposed) this.tick(this.last + ms);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((c) => c());
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) textures.add(v);
        mat.dispose();
      }
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.chunkGeo.dispose();
    this.puffGeo.dispose();
    this.puffMat.dispose();
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ===================================================================================
  // Building

  private buildSky() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uSun; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 c = mix(uBottom, uTop, smoothstep(0.35, 0.85, h));
            float s = max(dot(vDir, normalize(vec3(0.6, 0.35, -0.7))), 0.0);
            c += uSun * (pow(s, 400.0) * 1.2 + pow(s, 12.0) * 0.25);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const N = 500;
    const pos = new Float32Array(N * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.1;
      v.normalize().multiplyScalar(180);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x5a6b8a, 1.6);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.position.set(6, 10, 8);
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  private cloudTexture(): THREE.CanvasTexture {
    // A chunky pixel cloud: overlapping blobs drawn on a small canvas, scaled up with nearest filtering.
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 32;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#ffffff";
      const blobs = [
        [18, 20, 10],
        [30, 14, 12],
        [44, 19, 10],
        [26, 22, 9],
        [38, 23, 8],
        [12, 24, 6],
        [52, 24, 6],
      ];
      for (const [x, y, r] of blobs) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "rgba(170,200,235,0.55)";
      g.fillRect(6, 26, 52, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildClouds() {
    const tex = this.cloudTexture();
    const top = this.opts.count * STEP_Y + 12;
    // three parallax layers: near (in front, faint), mid, far
    const layers = [
      { z: 4, n: 7, scale: 4, opacity: 0.35, speed: 0.6, spread: 14 },
      { z: -14, n: 16, scale: 8, opacity: 0.9, speed: 0.35, spread: 34 },
      { z: -40, n: 18, scale: 16, opacity: 0.75, speed: 0.15, spread: 80 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: L.opacity, depthWrite: false, fog: L.z < -20 });
        const s = new THREE.Sprite(mat);
        const sc = L.scale * (0.7 + Math.random() * 0.6);
        s.scale.set(sc, sc / 2, 1);
        const baseX = (Math.random() - 0.5) * L.spread * 2;
        s.position.set(baseX, -4 + Math.random() * (top + 8), L.z + (Math.random() - 0.5) * 4);
        this.scene.add(s);
        this.clouds.push({ s, speed: L.speed * (0.6 + Math.random() * 0.8), baseX, span: L.spread });
      }
    }
    // far floating islands as silhouettes for depth
    const farTop = new THREE.MeshLambertMaterial({ color: 0x6fbf8a });
    const far = new THREE.MeshLambertMaterial({ color: 0x7e8fb8 });
    for (let i = 0; i < 9; i++) {
      const gr = new THREE.Group();
      const top2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 4), farTop);
      gr.add(top2);
      let sx = 4.4;
      for (let j = 0; j < 3; j++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, 1, sx * 0.8), far);
        slab.position.y = -0.9 - j;
        gr.add(slab);
        sx *= 0.6;
      }
      gr.position.set((i % 2 ? -1 : 1) * (18 + Math.random() * 20), i * (top / 8) - 2, -55 - Math.random() * 20);
      gr.scale.setScalar(0.8 + Math.random() * 0.8);
      this.scene.add(gr);
    }
  }

  private makeIsland(k: number): THREE.Group {
    const g = new THREE.Group();
    const summit = k >= this.opts.count;
    const w = summit ? 3.6 : 2.4;
    const d = summit ? 3.0 : 2.0;
    const grass = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), summit ? this.mats.snow : this.mats.grass);
    grass.position.y = -0.16;
    g.add(grass);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), summit ? this.mats.stone : this.mats.grassDark);
    lip.position.y = -0.36;
    g.add(lip);
    const dirt = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.55, d - 0.2), this.mats.dirt);
    dirt.position.y = -0.68;
    g.add(dirt);
    // the hanging rock: stacked, shrinking voxel slabs
    let y = -0.95;
    let sx = w - 0.6;
    let sz = d - 0.5;
    for (let i = 0; i < 3; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.45, sz), i % 2 ? this.mats.stoneDark : this.mats.stone);
      slab.position.set((Math.sin(k * 3 + i) * 0.15), y - 0.22, Math.cos(k + i) * 0.1);
      g.add(slab);
      y -= 0.45;
      sx *= 0.62;
      sz *= 0.62;
    }
    // vines
    for (let i = 0; i < 3; i++) {
      const len = 0.4 + ((k + i * 5) % 4) * 0.25;
      const vine = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.07), this.mats.vine);
      vine.position.set(-w / 2 + 0.3 + i * (w / 3), -0.4 - len / 2, d / 2 - 0.05);
      g.add(vine);
    }
    if (!summit) {
      // a little life on top: flowers, and a voxel tree on every third island
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), i % 2 ? this.mats.flowerA : this.mats.flowerB);
        f.position.set(((k * 13 + i * 7) % 10) / 10 * (w - 0.6) - (w - 0.6) / 2, 0.06, ((k * 5 + i * 3) % 10) / 10 * (d - 0.6) - (d - 0.6) / 2);
        if (Math.abs(f.position.x) < 0.5 && Math.abs(f.position.z) < 0.5) f.position.x += 0.7;
        g.add(f);
      }
      if (k % 3 === 2) {
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), this.mats.trunk);
        trunk.position.set(w / 2 - 0.35, 0.3, -d / 2 + 0.35);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), this.mats.leaf);
        crown.position.set(w / 2 - 0.35, 0.78, -d / 2 + 0.35);
        g.add(trunk, crown);
      }
    }
    const p = platformPosition(k, this.opts.count);
    g.position.set(p.x, p.y, p.z);
    return g;
  }

  private buildIslands() {
    for (let k = 0; k <= this.opts.count; k++) {
      const g = this.makeIsland(k);
      this.scene.add(g);
      this.islands.push(g);
      this.islandPhase.push(k * 1.7);
    }
    this.nextRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.92, 4, 1),
      new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.nextRing.rotation.x = -Math.PI / 2;
    this.nextRing.rotation.z = Math.PI / 4;
    this.scene.add(this.nextRing);
  }

  private buildFlag() {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), new THREE.MeshLambertMaterial({ color: 0xe8e8f0 }));
    pole.position.y = 1.2;
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshLambertMaterial({ color: 0xffd84d }));
    knob.position.y = 2.45;
    const geo = new THREE.PlaneGeometry(1.1, 0.7, 10, 4);
    this.cloth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3ddc97, side: THREE.DoubleSide }));
    this.cloth.position.set(0.59, 0.6, 0);
    this.flag.add(pole, knob, this.cloth);
    const top = platformPosition(this.opts.count, this.opts.count);
    this.flag.position.set(top.x + 0.9, top.y, top.z - 0.6);
    this.scene.add(this.flag);
  }

  private buildHopper() {
    const c = this.opts.colors ?? { body: "#ffd84d", belly: "#fff3c4", accent: "#ff9f43" };
    const lam = (col: string | number) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
    const bodyMat = lam(c.body);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.72, 0.7), bodyMat);
    torso.position.y = 0.46;
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.06), lam(c.belly));
    belly.position.set(0, 0.36, 0.36);
    const white = lam(0xffffff);
    const black = lam(0x15182a);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.05), white);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.03), black);
      pupil.position.set(0.02 * sx, -0.02, 0.03);
      eye.add(ball, pupil);
      eye.position.set(0.17 * sx, 0.62, 0.36);
      this.body.add(eye);
      this.eyes.push(eye as unknown as THREE.Mesh);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), lam(0xff7aa8));
      cheek.position.set(0.3 * sx, 0.46, 0.36);
      this.body.add(cheek);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.14), lam(c.accent));
      ear.position.set(0.26 * sx, 0.92, 0);
      ear.rotation.z = -0.25 * sx;
      this.body.add(ear);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), lam(c.accent));
      foot.position.set(0.22 * sx, 0.06, 0.06);
      this.body.add(foot);
    }
    this.body.add(torso, belly);
    this.hopper.add(this.body);
    this.scene.add(this.hopper);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x1a2a20, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
  }

  private bindInput() {
    const move = (e: PointerEvent) => {
      this.mouse.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      this.mouse.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    this.cleanups.push(() => window.removeEventListener("pointermove", move));
  }

  private resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.frame();
  }

  /**
   * Where on screen the hopper should sit, as a fraction of the height from the top (the UI
   * passes the middle of the space between its HUD and the question card).
   */
  setFocus(fraction: number) {
    const f = Math.min(0.75, Math.max(0.12, fraction));
    if (Math.abs(f - this.focus) < 0.005) return;
    this.focus = f;
    this.frame();
  }

  /** Render the window of a taller frustum whose centre (the hopper) lands at `focus`. */
  private frame() {
    const w = this.viewW;
    const h = this.viewH;
    const f = this.focus;
    const tall = f <= 0.5 ? 2 * (1 - f) : 2 * f;
    const fullH = h * tall;
    const offsetY = f <= 0.5 ? (tall / 2 - f) * h : 0;
    const windowFov = w / h < 0.8 ? 50 : 42;
    this.camera.aspect = w / fullH;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(windowFov / 2)) * tall));
    this.camera.setViewOffset(w, fullH, 0, offsetY, w, h);
    this.camera.updateProjectionMatrix();
  }

  // ===================================================================================
  // Helpers

  private islandTop(k: number): THREE.Vector3 {
    const p = platformPosition(k, this.opts.count);
    return new THREE.Vector3(p.x, p.y, p.z + 0.1);
  }

  private bob(k: number): number {
    return this.opts.reduced ? 0 : Math.sin(this.t * 1.1 + this.islandPhase[k]) * 0.08;
  }

  private removeIsland(k: number) {
    const g = this.islands[k];
    if (!g || this.crumbled.has(k)) return;
    this.crumbled.add(k);
    g.visible = false;
  }

  private crumble(k: number) {
    const g = this.islands[k];
    if (!g || this.crumbled.has(k)) return;
    this.removeIsland(k);
    const p = g.position;
    const mats = [this.mats.grass, this.mats.dirt, this.mats.stone, this.mats.grassDark, this.mats.stoneDark];
    const n = this.opts.reduced ? 10 : 28;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chunkGeo, mats[i % mats.length]);
      m.position.set(p.x + (Math.random() - 0.5) * 2.2, p.y - Math.random() * 1.4, p.z + (Math.random() - 0.5) * 1.8);
      m.scale.setScalar(0.6 + Math.random() * 0.9);
      this.scene.add(m);
      this.chunks.push({
        m,
        v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 2),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 2.4,
      });
    }
  }

  private puff(at: THREE.Vector3, color = 0xffffff, speed = 2.2) {
    const mat = color === 0xffffff ? this.puffMat : new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(this.puffGeo, mat);
    m.position.copy(at);
    this.scene.add(m);
    const a = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a) * speed * (0.5 + Math.random()), Math.random() * speed * 0.6, Math.sin(a) * speed * 0.6);
    this.puffs.push({ m, v, life: 0.7 + Math.random() * 0.4, max: 1.1 });
  }

  private dust(at: THREE.Vector3) {
    if (this.opts.reduced) return;
    for (let i = 0; i < 12; i++) this.puff(at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.08, (Math.random() - 0.5) * 0.4)));
  }

  // ===================================================================================
  // Frame loop

  private loop = (now: number) => {
    if (this.disposed || this.paused) return;
    this.raf = requestAnimationFrame(this.loop);
    this.tick(now);
  };

  private tick(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;
    const t = this.t;
    const reduced = this.opts.reduced;
    const count = this.opts.count;

    // islands bob
    for (let k = 0; k < this.islands.length; k++) {
      const p = platformPosition(k, count);
      this.islands[k].position.y = p.y + this.bob(k);
    }

    // the hopper
    const a = this.anim;
    const base = this.islandTop(this.standOn);
    base.y += this.bob(this.standOn);
    let squashTarget = 1 + (reduced ? 0 : Math.sin(t * 3) * 0.03);
    if (a.kind === "idle") {
      this.hopper.position.copy(base);
    } else if (a.kind === "jump") {
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      const pre = 0.18;
      const land = 0.86;
      a.to.y = this.islandTop(this.standOn).y + this.bob(this.standOn);
      if (k < pre) {
        this.hopper.position.copy(a.from);
        squashTarget = 0.62;
      } else if (k < land) {
        const s = (k - pre) / (land - pre);
        const h = Math.max(0.8, a.to.y - a.from.y) + 1.4;
        this.hopper.position.lerpVectors(a.from, a.to, s);
        this.hopper.position.y = a.from.y + (a.to.y - a.from.y) * s + h * 4 * s * (1 - s) * 0.6;
        squashTarget = s < 0.5 ? 1.3 : 1.05;
        this.facing = Math.atan2(a.to.x - a.from.x, 2.5);
      } else {
        this.hopper.position.copy(a.to);
        if (!("landed" in a)) {
          (a as { landed?: boolean }).landed = true;
          this.squash.y = 0.6;
          this.squash.vy = 0;
          this.dust(a.to);
        }
        squashTarget = 1;
      }
      if (k >= 1) {
        const done = a.done;
        this.anim = { kind: "idle" };
        this.facing = 0;
        done?.();
      }
    } else if (a.kind === "miss") {
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      if (!a.crumbled && k > 0.25) {
        a.crumbled = true;
        this.crumble(a.target);
      }
      if (a.fatal) {
        // leap toward the target… and there's nothing there
        const s = k;
        this.hopper.position.lerpVectors(a.from, a.toward, s * 0.7);
        this.hopper.position.y = a.from.y + 1.6 * 4 * s * (1 - s) * 0.5;
        squashTarget = 1.2;
        if (k >= 1) {
          this.anim = { kind: "fall", v: new THREE.Vector3((a.toward.x - a.from.x) * 0.4, 0, 0), t: 0 };
          a.done?.();
        }
      } else {
        // a short hop out, then back, with a wobble
        const s = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5;
        this.hopper.position.lerpVectors(base, a.toward, s * 0.25);
        this.hopper.position.y = base.y + Math.sin(Math.min(1, k) * Math.PI) * 0.8;
        squashTarget = 1.15;
        if (k >= 1) {
          this.hopper.position.copy(base);
          this.wobble.v = reduced ? 0 : 9;
          this.squash.y = 0.75;
          this.anim = { kind: "idle" };
          a.done?.();
        }
      }
    } else if (a.kind === "fall") {
      a.t += dt;
      a.v.y += GRAVITY * dt;
      this.hopper.position.addScaledVector(a.v, dt);
      this.body.rotation.z += dt * 5;
      this.body.rotation.x += dt * 3;
    } else if (a.kind === "cheer") {
      a.t += dt;
      this.hopper.position.copy(base);
      const hopT = (a.t * 2.2) % 1;
      if (!reduced && a.t < 2.8) this.hopper.position.y += Math.sin(hopT * Math.PI) * 0.6;
    }

    // squash & stretch spring (volume-preserving)
    this.squash.vy += ((squashTarget - this.squash.y) * 220 - this.squash.vy * 14) * dt;
    this.squash.y += this.squash.vy * dt;
    const sy = reduced ? 1 : this.squash.y;
    const sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    this.body.scale.set(sxz, sy, sxz);
    // wobble
    this.wobble.v += (-this.wobble.a * 120 - this.wobble.v * 6) * dt;
    this.wobble.a += this.wobble.v * dt;
    if (this.anim.kind !== "fall") {
      this.body.rotation.z = this.wobble.a * 0.25;
      this.body.rotation.y += (this.facing - this.body.rotation.y) * (1 - Math.exp(-dt * 10));
    }
    // blink
    if (t > this.blinkAt) {
      const b = t - this.blinkAt;
      const sc = b < 0.12 ? 0.1 : 1;
      for (const e of this.eyes) e.scale.y = sc;
      if (b > 0.12) this.blinkAt = t + 2 + Math.random() * 3;
    }

    // shadow on the platform under the hopper
    this.shadow.visible = this.anim.kind !== "fall";
    this.shadow.position.set(this.hopper.position.x, base.y + 0.01, this.hopper.position.z);
    const air = Math.max(0, this.hopper.position.y - base.y);
    this.shadow.scale.setScalar(Math.max(0.3, 1 - air * 0.3));

    // the next-platform marker
    const target = this.target;
    const showRing = target !== null && target <= count && !this.crumbled.has(target) && this.anim.kind === "idle";
    this.nextRing.visible = showRing;
    if (showRing) {
      const p = this.islandTop(target);
      this.nextRing.position.set(p.x, p.y + this.bob(target) + 0.03, p.z);
      const pulse = reduced ? 1 : 1 + Math.sin(t * 4) * 0.08;
      this.nextRing.scale.setScalar(pulse);
    }

    // crumbling chunks and dust
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.v.y += GRAVITY * 0.6 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      c.life -= dt;
      if (c.life < 0.6) c.m.scale.multiplyScalar(1 - dt * 3);
      if (c.life <= 0) {
        this.scene.remove(c.m);
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 2.5);
      const k = Math.max(0, p.life / p.max);
      p.m.scale.setScalar(0.4 + (1 - k) * 1.2);
      (p.m.material as THREE.MeshLambertMaterial).opacity = k;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        if (p.m.material !== this.puffMat) (p.m.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    // flag: raise and wave
    if (this.flagRaise > 0 && this.flagRaise < 1) this.flagRaise = Math.min(1, this.flagRaise + dt * 0.8);
    const raise = this.flagRaise > 0 ? this.flagRaise : 0.15;
    this.cloth.position.y = 0.4 + raise * 1.6;
    const cp = (this.cloth.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
    if (!reduced) {
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i) + 0.55;
        cp.setZ(i, Math.sin(x * 5 - t * 6) * 0.08 * x);
      }
      cp.needsUpdate = true;
    }

    // clouds drift (parallax comes from the camera rising past layers at different depths)
    for (const c of this.clouds) {
      if (!reduced) c.s.position.x += c.speed * dt;
      if (c.s.position.x > c.baseX + c.span) c.s.position.x -= c.span * 2;
    }

    // sky: morning blue → golden → dusk → night with stars near the summit
    const prog = Math.min(1, Math.max(0, this.camY / (count * STEP_Y + 2)));
    const stops = [
      { top: new THREE.Color(0x4aa8ff), bottom: new THREE.Color(0xcdeeff) },
      { top: new THREE.Color(0x5a8cff), bottom: new THREE.Color(0xffe0b0) },
      { top: new THREE.Color(0x3b3f9e), bottom: new THREE.Color(0xff9e7a) },
      { top: new THREE.Color(0x0e1440), bottom: new THREE.Color(0x6a4fa0) },
    ];
    const f = prog * (stops.length - 1);
    const i0 = Math.min(stops.length - 2, Math.floor(f));
    const u = f - i0;
    this.skyU.uTop.value.copy(stops[i0].top).lerp(stops[i0 + 1].top, u);
    this.skyU.uBottom.value.copy(stops[i0].bottom).lerp(stops[i0 + 1].bottom, u);
    this.skyU.uSun.value.setRGB(1, 0.9 - prog * 0.3, 0.7 - prog * 0.4);
    this.fog.color.copy(this.skyU.uBottom.value);
    this.starMat.opacity = THREE.MathUtils.smoothstep(prog, 0.6, 0.95);
    this.hemi.intensity = 1.6 - prog * 0.5;

    // camera follows the hopper up (sprung), with a little cursor parallax
    const wantY = (this.anim.kind === "fall" ? Math.max(this.hopper.position.y, base.y - 4) : base.y) + 1.6;
    if (reduced) this.camY += (wantY - this.camY) * (1 - Math.exp(-dt * 8));
    else {
      this.camYv += ((wantY - this.camY) * 18 - this.camYv * 8) * dt;
      this.camY += this.camYv * dt;
    }
    this.camX += (this.hopper.position.x * 0.35 - this.camX) * (1 - Math.exp(-dt * 3));
    const narrow = this.viewW / this.viewH < 0.8;
    const dist = narrow ? 15 : 12.5;
    const mx = reduced ? 0 : this.mouse.x * 0.8;
    const my = reduced ? 0 : this.mouse.y * 0.4;
    this.camera.position.set(this.camX + mx, this.camY + 1.4 - my, dist);
    // Look at the hopper; the view offset (resize) puts it in the upper part of the screen.
    this.camera.lookAt(this.camX * 0.8, this.camY - 1.1, 0);
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);

    if (this.opts.onFrame) {
      const sp = this.tmp.copy(this.hopper.position).add(new THREE.Vector3(0, 1.3, 0)).project(this.camera);
      this.opts.onFrame({ hopperX: ((sp.x + 1) / 2) * this.viewW, hopperY: ((1 - sp.y) / 2) * this.viewH });
    }
    this.renderer.render(this.scene, this.camera);
  }
}
