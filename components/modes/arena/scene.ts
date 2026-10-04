// The Arena world in three.js: a stylised low-poly training arena (dark navy panels, neon trims in
// the site palette, a pixel floor grid, hex pillars, drifting dust), a floating holo-board with the
// question, and 4 glowing answer targets that orbit at different depths. First-person: a blaster
// on the camera, pointer-lock mouselook + WASD, or click/tap-to-aim when the mouse isn't locked.
// Plain TypeScript, no React: ArenaStage loads it with a dynamic import and drives it with the
// public methods below. The scene owns visuals and aim only; the server decides right and wrong.
// Spec: docs/design/modes/arena.md § The room.
import * as THREE from "three";

export type TargetId = "A" | "B" | "C" | "D";
export type ArenaShot = { optionId: TargetId | null };
export type ArenaFonts = { display: string; body: string; hud: string };

export type ArenaSceneOptions = {
  reduced: boolean;
  fonts: ArenaFonts;
  /** "play": a Run (input, targets). "showcase": the Reveal backdrop (no input, slow pan). */
  mode: "play" | "showcase";
  onShot?: (shot: ArenaShot) => void;
  onLockChange?: (locked: boolean) => void;
};

export type BoardMessage = { kicker: string; title: string; body?: string; tone?: "neutral" | "good" | "bad" | "gold" };

const COLORS: Record<TargetId, number> = { A: 0x4de3ff, B: 0x9d7bff, C: 0xffd84d, D: 0xff5d8f };
const HEX: Record<TargetId, string> = { A: "#4de3ff", B: "#9d7bff", C: "#ffd84d", D: "#ff5d8f" };
const EYE = 1.7;
const ROOM = { x: 15, zBack: -18, zFront: 13, h: 10 };
const WALK = { x: 11, zMin: 1, zMax: 10.5 };
const SPAWN = new THREE.Vector3(0, EYE, 8);
const PANEL_W = 2.6;
const PANEL_H = 1.3;
const FIRE_MS = 170;

// Target slots (x, y, z) at varied depths; landscape and portrait layouts. Rotated per question.
const SLOTS_WIDE: [number, number, number][] = [
  [-4.6, 2.9, -2.5],
  [-1.6, 1.6, -6],
  [1.7, 3.5, -5],
  [4.7, 2.0, -1.5],
];
const SLOTS_TALL: [number, number, number][] = [
  [-1.35, 3.9, -3],
  [1.45, 3.0, -5.5],
  [-1.4, 1.75, -4.5],
  [1.35, 0.9, -1.5],
];

type Target = {
  id: TargetId;
  group: THREE.Group;
  face: THREE.Mesh;
  frame: THREE.Mesh;
  glow: THREE.Sprite;
  tex: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  text: string;
  slot: number;
  phase: number;
  speed: number;
  state: "spawning" | "live" | "pending" | "gone";
  t: number; //       time in its current state
  flash: number; //   hit flash 0..1
};

type Shard = { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number };
type Ring = { m: THREE.Mesh; life: number; max: number; grow: number };
type Tracer = { m: THREE.Mesh; life: number };

const MAX_PARTICLES = 700;

export class ArenaScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  private canvas: HTMLCanvasElement;
  private opts: ArenaSceneOptions;
  private raf = 0;
  private paused = false;
  private disposed = false;
  private last = 0;
  private t = 0;
  private cleanups: (() => void)[] = [];
  private viewW = 1;
  private viewH = 1;
  private tall = false;

  // player
  private pos = SPAWN.clone();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.12;
  private keys = new Set<string>();
  private lockedNow = false;
  private aim: "lock" | "pointer" = "pointer";
  private inputOn = false;
  private lastShot = 0;
  private shake = 0;
  private recoil = 0;
  private drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; at: number } | null = null;
  private pan = 0; //   showcase drift

  // world
  private gun = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private flash!: THREE.Sprite;
  private flashLight = new THREE.PointLight(0xff4d6d, 0, 6, 2);
  private board = new THREE.Group();
  private boardCanvas = document.createElement("canvas");
  private boardTex: THREE.CanvasTexture;
  private boardMsg: BoardMessage = { kicker: "TRAINING ARENA", title: "Stand by" };
  private boardQuestion: { position: number; total: number; text: string } | null = null;
  private boardFrame!: THREE.Mesh;
  private targets: Target[] = [];
  private targetMeshes: THREE.Object3D[] = [];
  private roomMeshes: THREE.Object3D[] = [];
  private dust!: THREE.Points;
  private trims: { m: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private white = new THREE.Color(0xffffff);
  private raycaster = new THREE.Raycaster();
  private glowTex: THREE.CanvasTexture;

  // effects
  private particles!: THREE.Points;
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private pVel = new Float32Array(MAX_PARTICLES * 3);
  private pBase = new Float32Array(MAX_PARTICLES * 3);
  private pLife = new Float32Array(MAX_PARTICLES);
  private pMax = new Float32Array(MAX_PARTICLES);
  private pGrav = new Float32Array(MAX_PARTICLES);
  private pNext = 0;
  private shards: Shard[] = [];
  private shardGeo = new THREE.BoxGeometry(0.22, 0.16, 0.05);
  private shardMats = new Map<number, THREE.MeshBasicMaterial>();
  private rings: Ring[] = [];
  private tracers: Tracer[] = [];
  private tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true);
  private boomLight = new THREE.PointLight(0x3ddc97, 0, 14, 2);
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, opts: ArenaSceneOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x070914);
    this.scene.fog = new THREE.Fog(0x070914, 18, 44);
    this.glowTex = glowTexture();
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = 4;

    this.buildRoom();
    this.buildBoard();
    this.buildGun();
    this.buildParticles();
    this.scene.add(this.camera);
    this.scene.add(this.boomLight);
    if (opts.mode === "play") this.bindInput();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanups.push(() => ro.disconnect());
    this.resize();
    this.paintBoard();
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (this.disposed) return;
        this.paintBoard();
        for (const tg of this.targets) paintTarget(tg, this.opts.fonts);
      });
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ===================================================================================
  // Public API

  get locked() {
    return this.lockedNow;
  }

  /** Lock the mouse (call from a user gesture). Falls back to click-to-aim when refused. */
  requestLock() {
    if (this.opts.mode !== "play") return;
    this.aim = "lock";
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") p.catch(() => this.lockFailed());
    } catch {
      this.lockFailed();
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Click/tap-to-aim: shots go where you click, the mouse stays free. */
  usePointerAim() {
    this.aim = "pointer";
    this.exitLock();
  }

  /** Whether shooting and moving are allowed (false under overlays). */
  setInput(on: boolean) {
    this.inputOn = on;
    if (!on) this.keys.clear();
  }

  setBoard(msg: BoardMessage) {
    this.boardQuestion = null;
    this.boardMsg = msg;
    this.paintBoard();
  }

  /** A new question: the board shows it and the 4 targets warp in (shattered ones stay gone). */
  showQuestion(q: { position: number; total: number; text: string; options: { id: TargetId; text: string }[]; shattered: TargetId[] }) {
    this.clearTargets(true);
    this.boardQuestion = { position: q.position, total: q.total, text: q.text };
    this.paintBoard();
    const rot = (q.position * 3) % 4;
    q.options.forEach((o, i) => {
      if (q.shattered.includes(o.id)) return;
      this.addTarget(o.id, o.text, (i + rot) % 4, i);
    });
  }

  /** Fire at a target by id (keys 1–4): the blaster swings to it. */
  shootAt(id: TargetId) {
    if (!this.inputOn) return;
    const tg = this.targets.find((t) => t.id === id && t.state === "live");
    if (!tg) return;
    tg.face.getWorldPosition(this.tmp);
    this.fireAtPoint(this.tmp, tg);
  }

  /** The server hasn't answered yet: let the target take shots again (e.g. after an error). */
  release(id: TargetId) {
    const tg = this.targets.find((t) => t.id === id);
    if (tg && tg.state === "pending") tg.state = "live";
  }

  /** A wrong hit: the target shatters into shards. */
  shatter(id: TargetId) {
    const tg = this.targets.find((t) => t.id === id);
    if (!tg || tg.state === "gone") return;
    tg.face.getWorldPosition(this.tmp);
    const at = this.tmp.clone();
    this.removeTarget(tg);
    const color = COLORS[id];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat(i % 3 === 0 ? 0xff5c5c : color));
      m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * PANEL_W * 0.8, (Math.random() - 0.5) * PANEL_H * 0.8, 0));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(m);
      this.shards.push({
        m,
        v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.2) * 5),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: 1.4 + Math.random() * 0.6,
      });
    }
    this.burst(at, 40, [0xff5c5c, color, 0xffffff], 5, 0.7, 6);
    this.addRing(at, 0xff5c5c, 0.5, 2.4);
    if (!this.opts.reduced) this.shake = Math.max(this.shake, 0.35);
  }

  /** The right hit: a big explosion. Returns where it happened on screen (CSS px) for the score pop. */
  explode(id: TargetId): { x: number; y: number } | null {
    const tg = this.targets.find((t) => t.id === id);
    if (!tg) return null;
    tg.face.getWorldPosition(this.tmp);
    const at = this.tmp.clone();
    const screen = this.toScreen(at);
    this.removeTarget(tg);
    this.burst(at, 160, [0x3ddc97, 0xffd84d, 0xffffff, COLORS[id]], 9, 1.2, 3);
    this.burst(at, 40, [0xffffff, 0xffd84d], 3, 0.5, 0);
    this.addRing(at, 0x3ddc97, 0.9, 5);
    this.addRing(at, 0xffd84d, 0.6, 3.2);
    this.boomLight.position.copy(at);
    this.boomLight.color.set(0x7dffc4);
    this.boomLight.intensity = 30;
    if (!this.opts.reduced) this.shake = Math.max(this.shake, 0.6);
    // the other targets power down
    for (const o of this.targets) if (o.state !== "gone") o.state = "pending";
    this.later(() => this.clearTargets(false), 450);
    return screen;
  }

  /** Time ran out: the targets flicker and sink away. */
  timeUp() {
    for (const tg of this.targets) {
      if (tg.state === "gone") continue;
      tg.face.getWorldPosition(this.tmp);
      this.burst(this.tmp.clone(), 14, [0x6b7699, 0x9aa6c8], 1.5, 0.8, -1);
      tg.state = "pending";
    }
    this.later(() => this.clearTargets(false), 500);
  }

  /** Screen position (CSS px) of a target, or null. */
  screenOf(id: TargetId) {
    const tg = this.targets.find((t) => t.id === id && t.state !== "gone");
    if (!tg) return null;
    tg.face.getWorldPosition(this.tmp);
    return this.toScreen(this.tmp);
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
    this.exitLock();
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
    this.shardGeo.dispose();
    this.tracerGeo.dispose();
    this.shardMats.forEach((m) => m.dispose());
    for (const tg of this.targets) tg.tex.dispose();
    textures.add(this.glowTex).add(this.boardTex);
    textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ===================================================================================
  // Building

  private buildRoom() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8fa4ff, 0x0a0d1c, 1.1));
    s.add(new THREE.AmbientLight(0x404a80, 0.6));
    const key = new THREE.DirectionalLight(0xbfd0ff, 0.8);
    key.position.set(4, 12, 6);
    s.add(key);
    for (const [x, z, c] of [[-10, -12, 0x4de3ff], [10, -12, 0xff5d8f], [0, 8, 0x9d7bff]] as const) {
      const l = new THREE.PointLight(c, 22, 22, 2);
      l.position.set(x, 6, z);
      s.add(l);
    }

    // floor: dark pixel tiles with a cyan grid
    const floorTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = "#0d1126";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#111733";
      g.fillRect(4, 4, 56, 56);
      g.fillRect(68, 68, 56, 56);
      g.fillStyle = "#1e2a55";
      g.fillRect(0, 0, 128, 2);
      g.fillRect(0, 0, 2, 128);
      g.fillStyle = "#2b6f8f";
      g.fillRect(0, 0, 4, 4);
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(15, 16);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.zFront - ROOM.zBack), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = (ROOM.zFront + ROOM.zBack) / 2;
    s.add(floor);
    this.roomMeshes.push(floor);

    // walls: panelled, with seams
    const wallTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = "#121731";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#171d3d";
      g.fillRect(6, 6, 116, 54);
      g.fillRect(6, 68, 54, 54);
      g.fillRect(68, 68, 54, 54);
      g.fillStyle = "#0b0f22";
      g.fillRect(0, 62, 128, 4);
      g.fillRect(62, 66, 4, 62);
      g.fillStyle = "#2a3358";
      g.fillRect(10, 10, 6, 2);
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    const wallMat = (rx: number) => {
      const t = wallTex.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ROOM.h / 3);
      return new THREE.MeshLambertMaterial({ map: t });
    };
    const depth = ROOM.zFront - ROOM.zBack;
    const midZ = (ROOM.zFront + ROOM.zBack) / 2;
    const walls: [THREE.Vector3, number, number][] = [
      [new THREE.Vector3(0, ROOM.h / 2, ROOM.zBack), 0, ROOM.x * 2],
      [new THREE.Vector3(0, ROOM.h / 2, ROOM.zFront), Math.PI, ROOM.x * 2],
      [new THREE.Vector3(-ROOM.x, ROOM.h / 2, midZ), Math.PI / 2, depth],
      [new THREE.Vector3(ROOM.x, ROOM.h / 2, midZ), -Math.PI / 2, depth],
    ];
    for (const [p, ry, w] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat(w / 3));
      m.position.copy(p);
      m.rotation.y = ry;
      s.add(m);
      this.roomMeshes.push(m);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, depth), new THREE.MeshLambertMaterial({ color: 0x080a18 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM.h, midZ);
    s.add(ceil);

    // neon trims: floor-level and head-height strips on every wall, light panels in the ceiling
    const trim = (color: number) => {
      const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      this.trims.push({ m, base: new THREE.Color(color) });
      return m;
    };
    const cyan = trim(0x4de3ff);
    const pink = trim(0xff5d8f);
    const gold = trim(0xffd84d);
    const violet = trim(0x9d7bff);
    const strip = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      s.add(m);
    };
    for (const y of [0.25, 6.4]) {
      strip(ROOM.x * 2, 0.08, y < 1 ? pink : cyan, 0, y, ROOM.zBack + 0.02, 0);
      strip(ROOM.x * 2, 0.08, gold, 0, y, ROOM.zFront - 0.02, Math.PI);
      strip(depth, 0.08, y < 1 ? cyan : violet, -ROOM.x + 0.02, y, midZ, Math.PI / 2);
      strip(depth, 0.08, y < 1 ? cyan : violet, ROOM.x - 0.02, y, midZ, -Math.PI / 2);
    }
    // vertical trims on the back wall, framing the board
    for (const x of [-8, -6.6, 6.6, 8]) strip(0.08, 7, x < 0 ? cyan : pink, x, 3.6, ROOM.zBack + 0.03, 0);
    // chevrons on the side walls
    for (let z = ROOM.zBack + 4; z < ROOM.zFront - 2; z += 5) {
      strip(1.4, 0.12, violet, -ROOM.x + 0.03, 3.2, z, Math.PI / 2);
      strip(1.4, 0.12, violet, ROOM.x - 0.03, 3.2, z, -Math.PI / 2);
    }
    const lightPanel = new THREE.MeshBasicMaterial({ color: 0xcfd8ff, toneMapped: false });
    for (let z = ROOM.zBack + 4; z < ROOM.zFront; z += 6) {
      for (const x of [-6, 0, 6]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), lightPanel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, ROOM.h - 0.02, z);
        s.add(p);
      }
    }

    // hex pillars with neon rings, low-poly crates, a spawn pad
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x1b2242, flatShading: true });
    for (const [x, z, c] of [[-11, -10, cyan], [11, -10, pink], [-12, 4, gold], [12, 4, violet]] as const) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, ROOM.h, 6), pillarMat);
      p.position.set(x, ROOM.h / 2, z);
      s.add(p);
      this.roomMeshes.push(p);
      for (const y of [1.2, 5.2]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 6, 1, true), c);
        r.position.set(x, y, z);
        s.add(r);
      }
    }
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x232c55, flatShading: true });
    const crateEdge = new THREE.LineBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.55 });
    for (const [x, z, sz, ry] of [[-9, -4, 1.4, 0.3], [-8.2, -2.6, 0.9, -0.2], [9.2, -6, 1.6, 0.5], [8.6, 6.5, 1.1, 0.1], [-9.5, 8, 1.2, -0.4]] as const) {
      const geo = new THREE.BoxGeometry(sz, sz, sz);
      const c = new THREE.Mesh(geo, crateMat);
      c.position.set(x, sz / 2, z);
      c.rotation.y = ry;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), crateEdge);
      c.add(e);
      s.add(c);
      this.roomMeshes.push(c);
    }
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 6), new THREE.MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(SPAWN.x, 0.02, SPAWN.z);
    s.add(pad);
    // a target lane under the targets
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(13, 7), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.06 }));
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0.015, -4);
    s.add(lane);
    const laneEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(13, 7)),
      new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.5 }),
    );
    laneEdge.rotation.x = -Math.PI / 2;
    laneEdge.position.set(0, 0.02, -4);
    s.add(laneEdge);

    // dust motes
    const n = 220;
    const dp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      dp[i * 3] = (Math.random() - 0.5) * ROOM.x * 2;
      dp[i * 3 + 1] = Math.random() * ROOM.h;
      dp[i * 3 + 2] = ROOM.zBack + Math.random() * (ROOM.zFront - ROOM.zBack);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x8fb8ff, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
    s.add(this.dust);
  }

  private buildBoard() {
    this.boardCanvas.width = 1280;
    this.boardCanvas.height = 480;
    const w = 9.6;
    const h = 3.6;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.boardTex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.boardFrame = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.3, h + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.boardFrame.position.z = -0.02;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x4de3ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(w * 1.5, h * 2, 1);
    glow.position.z = -0.1;
    // projector beam from the floor
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 1.6, 4.4, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = -3.6;
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0x1b2242, flatShading: true }));
    emitter.position.y = -5.85;
    this.board.add(glow, this.boardFrame, face, beam, emitter);
    this.board.position.set(0, 6.0, -11);
    this.scene.add(this.board);
  }

  private buildGun() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b2242, flatShading: true });
    const mid = new THREE.MeshLambertMaterial({ color: 0x3b4675, flatShading: true });
    const neon = new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x4de3ff, toneMapped: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.42), dark);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.3), mid);
    top.position.set(0, 0.08, -0.02);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.3, 6), mid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.33);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.018, 0.3), neon);
    stripe.position.set(0, -0.02, -0.02);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), cyan);
    tip.position.set(0, 0.01, -0.48);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.09), dark);
    grip.position.set(0, -0.13, 0.1);
    grip.rotation.x = 0.25;
    this.muzzle.position.set(0, 0.01, -0.52);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff7a8f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.set(0.35, 0.35, 1);
    this.flash.position.copy(this.muzzle.position);
    this.flashLight.position.copy(this.muzzle.position);
    this.gun.add(body, top, barrel, stripe, tip, grip, this.muzzle, this.flash, this.flashLight);
    this.camera.add(this.gun);
  }

  private buildParticles() {
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: this.glowTex }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  // ===================================================================================
  // Targets

  private addTarget(id: TargetId, text: string, slot: number, order: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 320;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const group = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_W + 0.14, PANEL_H + 0.14, 0.08),
      new THREE.MeshBasicMaterial({ color: COLORS[id], toneMapped: false }),
    );
    frame.position.z = -0.06;
    const back = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W * 0.5, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0x1b2242, flatShading: true }));
    back.position.set(0, -PANEL_H / 2 - 0.12, -0.1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: COLORS[id], transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(PANEL_W * 2, PANEL_H * 2.6, 1);
    glow.position.z = -0.2;
    group.add(glow, frame, face, back);
    face.userData.target = id;
    frame.userData.target = id;
    group.scale.setScalar(0.001);
    const tg: Target = {
      id, group, face, frame, glow, tex, canvas, text, slot,
      phase: order * 1.7 + Math.random() * 0.6,
      speed: 0.42 + ((slot * 37) % 10) / 40,
      state: "spawning", t: -order * 0.08, flash: 0,
    };
    paintTarget(tg, this.opts.fonts);
    this.placeTarget(tg, 0);
    this.scene.add(group);
    this.targets.push(tg);
    this.targetMeshes.push(face, frame);
  }

  private removeTarget(tg: Target) {
    tg.state = "gone";
    this.scene.remove(tg.group);
    this.targetMeshes = this.targetMeshes.filter((m) => m !== tg.face && m !== tg.frame);
    tg.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    tg.tex.dispose();
    this.targets = this.targets.filter((t) => t !== tg);
  }

  private clearTargets(now: boolean) {
    for (const tg of [...this.targets]) {
      if (!now) {
        tg.face.getWorldPosition(this.tmp);
        this.burst(this.tmp.clone(), 8, [COLORS[tg.id]], 1.2, 0.5, 0);
      }
      this.removeTarget(tg);
    }
  }

  private placeTarget(tg: Target, t: number) {
    const slots = this.tall ? SLOTS_TALL : SLOTS_WIDE;
    const [bx, by, bz] = slots[tg.slot];
    const sp = tg.speed * (this.opts.reduced ? 0.35 : 1);
    const a = t * sp + tg.phase;
    const ax = this.tall ? 0.35 : 0.9;
    tg.group.position.set(bx + Math.sin(a) * ax, by + Math.sin(a * 1.7 + 1) * 0.35, bz + Math.cos(a) * 0.9);
    tg.group.lookAt(this.pos.x, Math.max(EYE, tg.group.position.y - 0.4), this.pos.z);
  }

  // ===================================================================================
  // Shooting

  private fire(ndcX: number, ndcY: number) {
    const now = performance.now();
    if (now - this.lastShot < FIRE_MS) return;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects([...this.targetMeshes, ...this.roomMeshes, this.board], true);
    const hit = hits[0];
    const id = hit?.object.userData.target as TargetId | undefined;
    const tg = id ? this.targets.find((t) => t.id === id) : undefined;
    const point = hit ? hit.point.clone() : this.raycaster.ray.at(40, new THREE.Vector3());
    this.fireAtPoint(point, tg && (tg.state === "live" || tg.state === "spawning") ? tg : undefined, hits.length > 0);
  }

  private fireAtPoint(point: THREE.Vector3, tg: Target | undefined, solid = true) {
    const now = performance.now();
    if (now - this.lastShot < FIRE_MS) return;
    this.lastShot = now;
    this.recoil = 1;
    (this.flash.material as THREE.SpriteMaterial).opacity = 1;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flashLight.intensity = 6;
    this.camera.updateMatrixWorld();
    this.muzzle.getWorldPosition(this.tmp2);
    this.addTracer(this.tmp2.clone(), point);
    if (solid) this.burst(point, tg ? 18 : 8, tg ? [0xffffff, COLORS[tg.id]] : [0xff4d6d, 0xffd84d], 2.4, 0.35, 4);
    if (tg) {
      tg.state = "pending";
      tg.flash = 1;
      this.opts.onShot?.({ optionId: tg.id });
    } else {
      this.opts.onShot?.({ optionId: null });
    }
  }

  private addTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(
      this.tracerGeo,
      new THREE.MeshBasicMaterial({ color: 0xff6b84, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    m.scale.set(1.6, len, 1.6);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tmp.copy(to).sub(from).normalize());
    this.scene.add(m);
    this.tracers.push({ m, life: 0.14 });
  }

  private burst(at: THREE.Vector3, count: number, colors: number[], speed: number, life: number, gravity: number) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % MAX_PARTICLES;
      const dir = this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const v = speed * (0.35 + Math.random() * 0.65);
      this.pPos.set([at.x, at.y, at.z], i * 3);
      this.pVel.set([dir.x * v, dir.y * v, dir.z * v], i * 3);
      c.set(colors[k % colors.length]);
      this.pBase.set([c.r, c.g, c.b], i * 3);
      this.pCol.set([c.r, c.g, c.b], i * 3);
      this.pLife[i] = this.pMax[i] = life * (0.6 + Math.random() * 0.6);
      this.pGrav[i] = gravity;
    }
  }

  private addRing(at: THREE.Vector3, color: number, life: number, grow: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    m.position.copy(at);
    m.lookAt(this.camera.getWorldPosition(this.tmp2));
    this.scene.add(m);
    this.rings.push({ m, life, max: life, grow });
  }

  private shardMat(color: number) {
    let m = this.shardMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false });
      this.shardMats.set(color, m);
    }
    return m;
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => !this.disposed && fn(), ms);
    this.cleanups.push(() => clearTimeout(id));
  }

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.viewW, y: ((1 - v.y) / 2) * this.viewH };
  }

  // ===================================================================================
  // Input

  private bindInput() {
    const c = this.canvas;
    const sens = 0.0022;
    const onLock = () => {
      this.lockedNow = document.pointerLockElement === c;
      if (!this.lockedNow) this.keys.clear();
      this.opts.onLockChange?.(this.lockedNow);
    };
    const onMove = (e: MouseEvent) => {
      if (!this.lockedNow || !this.inputOn) return;
      this.yaw -= e.movementX * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -1.2, 1.2);
    };
    const ndc = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const;
    };
    const onDown = (e: PointerEvent) => {
      if (!this.inputOn) return;
      if (this.lockedNow) {
        if (e.button === 0) this.fire(0, 0);
        return;
      }
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        const [x, y] = ndc(e);
        this.fire(x, y);
        return;
      }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, at: performance.now() };
    };
    const onPMove = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 10) d.moved = true;
      if (d.moved) {
        this.yaw += (e.clientX - d.x) * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - d.y) * 0.004, -0.9, 0.9);
      }
      d.x = e.clientX;
      d.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (!d.moved && this.inputOn) {
        const [x, y] = ndc(e);
        this.fire(x, y);
      }
    };
    const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft"]);
    const onKey = (e: KeyboardEvent) => {
      if (!MOVE_KEYS.has(e.code)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.type === "keydown") {
        if (!this.inputOn) return;
        if (e.code.startsWith("Arrow") && !this.lockedNow) return; // arrows scroll/focus when the mouse is free
        this.keys.add(e.code);
        if (this.lockedNow) e.preventDefault();
      } else this.keys.delete(e.code);
    };
    const onBlur = () => this.keys.clear();
    document.addEventListener("pointerlockchange", onLock);
    document.addEventListener("pointerlockerror", this.lockFailed);
    document.addEventListener("mousemove", onMove);
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onPMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    this.cleanups.push(() => {
      document.removeEventListener("pointerlockchange", onLock);
      document.removeEventListener("pointerlockerror", this.lockFailed);
      document.removeEventListener("mousemove", onMove);
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onPMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    });
  }

  private lockFailed = () => {
    this.aim = "pointer";
    this.lockedNow = false;
    this.opts.onLockChange?.(false);
  };

  private resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const wasTall = this.tall;
    this.tall = w / h < 0.9;
    this.camera.fov = this.tall ? 78 : 68;
    this.camera.updateProjectionMatrix();
    this.gun.position.set(this.tall ? 0.16 : 0.3, this.tall ? -0.3 : -0.26, -0.45);
    // keep the board inside the view on a phone
    const s = this.tall ? 0.62 : 1;
    this.board.scale.setScalar(s);
    this.board.position.y = this.tall ? 6.4 : 6.0;
    if (wasTall !== this.tall) for (const tg of this.targets) this.placeTarget(tg, this.t);
  }

  // ===================================================================================
  // Board

  private paintBoard() {
    const g = this.boardCanvas.getContext("2d");
    if (!g) return;
    const W = this.boardCanvas.width;
    const H = this.boardCanvas.height;
    const f = this.opts.fonts;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(8, 14, 38, 0.82)";
    roundRect(g, 8, 8, W - 16, H - 16, 26);
    g.fill();
    // scanlines
    g.fillStyle = "rgba(77, 227, 255, 0.04)";
    for (let y = 12; y < H - 12; y += 6) g.fillRect(12, y, W - 24, 2);
    g.strokeStyle = "rgba(77, 227, 255, 0.85)";
    g.lineWidth = 4;
    roundRect(g, 8, 8, W - 16, H - 16, 26);
    g.stroke();
    // corner brackets
    g.strokeStyle = "#ff4d6d";
    g.lineWidth = 8;
    for (const [x, y, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]]) {
      g.beginPath();
      g.moveTo(x, y + dy * 46);
      g.lineTo(x, y);
      g.lineTo(x + dx * 46, y);
      g.stroke();
    }
    g.textBaseline = "alphabetic";
    if (this.boardQuestion) {
      const q = this.boardQuestion;
      g.fillStyle = "#4de3ff";
      g.font = `400 40px ${f.hud}`;
      g.textAlign = "left";
      g.fillText(`QUESTION ${q.position} / ${q.total}`, 64, 80);
      g.textAlign = "right";
      g.fillStyle = "#ff4d6d";
      g.fillText("SHOOT THE RIGHT TARGET", W - 64, 80);
      const { size, lines } = fitText(g, q.text, `700 {s}px ${f.body}`, W - 128, 4, 62, 30);
      g.textAlign = "center";
      g.fillStyle = "#f3f6ff";
      g.font = `700 ${size}px ${f.body}`;
      const lh = size * 1.18;
      const top = 120 + (H - 150 - lines.length * lh) / 2 + size * 0.85;
      lines.forEach((l, i) => g.fillText(l, W / 2, top + i * lh));
    } else {
      const m = this.boardMsg;
      const tone = m.tone === "good" ? "#3ddc97" : m.tone === "bad" ? "#ff5c5c" : m.tone === "gold" ? "#ffd84d" : "#f3f6ff";
      g.textAlign = "center";
      g.fillStyle = "#4de3ff";
      g.font = `400 42px ${f.hud}`;
      g.fillText(m.kicker.toUpperCase(), W / 2, 92);
      const t = fitText(g, m.title, `700 {s}px ${f.display}`, W - 140, 1, 110, 48);
      g.fillStyle = tone;
      g.font = `700 ${t.size}px ${f.display}`;
      g.fillText(t.lines[0] ?? "", W / 2, m.body ? 220 : 270);
      if (m.body) {
        const b = fitText(g, m.body, `600 {s}px ${f.body}`, W - 160, 3, 40, 24);
        g.fillStyle = "#b9c4e6";
        g.font = `600 ${b.size}px ${f.body}`;
        b.lines.forEach((l, i) => g.fillText(l, W / 2, 300 + i * b.size * 1.25));
      }
    }
    this.boardTex.needsUpdate = true;
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

    // movement (WASD / arrows), relative to where you look
    if (this.opts.mode === "play" && this.keys.size) {
      const f = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
      const r = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
      const speed = this.keys.has("ShiftLeft") ? 7.5 : 5;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      this.vel.x += ((-sin * f + cos * r) * speed - this.vel.x) * Math.min(1, dt * 12);
      this.vel.z += ((-cos * f - sin * r) * speed - this.vel.z) * Math.min(1, dt * 12);
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x + this.vel.x * dt, -WALK.x, WALK.x);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z + this.vel.z * dt, WALK.zMin, WALK.zMax);
    const walking = this.vel.lengthSq() > 0.5;
    const bob = walking && !reduced ? Math.sin(t * 11) * 0.035 : 0;

    // camera
    let yaw = this.yaw;
    let pitch = this.pitch;
    if (this.opts.mode === "showcase") {
      this.pan += dt * (reduced ? 0.03 : 0.08);
      yaw = Math.sin(this.pan) * 0.32;
      pitch = 0.14 + Math.sin(this.pan * 0.7) * 0.04;
    }
    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;
    if (this.shake > 0) {
      const k = this.shake * this.shake * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.rotation.z = (Math.random() - 0.5) * k * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }

    // gun sway, recoil, muzzle flash
    this.gun.visible = this.opts.mode === "play";
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const sway = reduced ? 0 : Math.sin(t * 1.6) * 0.006;
    this.gun.rotation.set(this.recoil * 0.22 + sway, 0, 0);
    this.gun.position.z = -0.45 + this.recoil * 0.07;
    const fm = this.flash.material as THREE.SpriteMaterial;
    fm.opacity = Math.max(0, fm.opacity - dt * 16);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 70);
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 60);

    // board hover + flicker
    this.board.position.y += (((this.tall ? 6.4 : 6.0) + (reduced ? 0 : Math.sin(t * 0.9) * 0.08)) - this.board.position.y) * Math.min(1, dt * 4);
    (this.boardFrame.material as THREE.MeshBasicMaterial).opacity = 0.1 + (reduced ? 0 : Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 3.1)) * 0.08);

    // neon trims pulse
    const pulse = reduced ? 1 : 0.85 + Math.sin(t * 2) * 0.15;
    for (const tr of this.trims) tr.m.color.copy(tr.base).multiplyScalar(pulse);

    // targets: spawn, drift, face you, hit flash
    for (const tg of this.targets) {
      tg.t += dt;
      if (tg.state === "spawning") {
        const k = Math.min(1, Math.max(0, tg.t / 0.45));
        tg.group.scale.setScalar(Math.max(0.001, easeOutBack(k)));
        if (k >= 1) tg.state = "live";
      }
      this.placeTarget(tg, t);
      tg.flash = Math.max(0, tg.flash - dt * 4);
      const gm = tg.glow.material as THREE.SpriteMaterial;
      gm.opacity = 0.35 + tg.flash * 0.6 + (reduced ? 0 : Math.sin(t * 3 + tg.phase) * 0.08);
      if (tg.state === "pending") (tg.frame.material as THREE.MeshBasicMaterial).color.setHex(COLORS[tg.id]).lerp(this.white, tg.flash);
    }

    // dust drifts
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const arr = dp.array as Float32Array;
    const rise = reduced ? 0.03 : 0.12;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * rise;
      if (arr[i] > ROOM.h) arr[i] = 0;
    }
    dp.needsUpdate = true;

    // particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const j = i * 3;
      if (this.pLife[i] <= 0) {
        this.pPos[j + 1] = -999;
        continue;
      }
      this.pVel[j + 1] -= this.pGrav[i] * dt;
      this.pVel[j] *= 1 - dt * 1.5;
      this.pVel[j + 2] *= 1 - dt * 1.5;
      this.pPos[j] += this.pVel[j] * dt;
      this.pPos[j + 1] += this.pVel[j + 1] * dt;
      this.pPos[j + 2] += this.pVel[j + 2] * dt;
      const k = this.pLife[i] / this.pMax[i];
      this.pCol[j] = this.pBase[j] * k;
      this.pCol[j + 1] = this.pBase[j + 1] * k;
      this.pCol[j + 2] = this.pBase[j + 2] * k;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    // shards, rings, tracers
    for (const s of this.shards) {
      s.life -= dt;
      s.v.y -= 12 * dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.m.position.y < 0.05) {
        s.m.position.y = 0.05;
        s.v.y *= -0.3;
        s.v.x *= 0.6;
        s.v.z *= 0.6;
      }
      s.m.rotation.x += s.spin.x * dt;
      s.m.rotation.y += s.spin.y * dt;
      s.m.scale.setScalar(Math.max(0.01, Math.min(1, s.life * 1.5)));
      if (s.life <= 0) this.scene.remove(s.m);
    }
    this.shards = this.shards.filter((s) => s.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(1 + k * r.grow * 2);
      (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (r.life <= 0) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        (r.m.material as THREE.Material).dispose();
      }
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const tr of this.tracers) {
      tr.life -= dt;
      (tr.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.life / 0.14);
      if (tr.life <= 0) {
        this.scene.remove(tr.m);
        (tr.m.material as THREE.Material).dispose();
      }
    }
    this.tracers = this.tracers.filter((tr) => tr.life > 0);

    this.renderer.render(this.scene, this.camera);
  }
}

// =====================================================================================
// Helpers

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintTarget(tg: Target, fonts: ArenaFonts) {
  const g = tg.canvas.getContext("2d");
  if (!g) return;
  const W = tg.canvas.width;
  const H = tg.canvas.height;
  const color = HEX[tg.id];
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#0b1030";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 3);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  // letter badge
  g.fillStyle = color;
  g.fillRect(24, 24, 84, 84);
  g.fillStyle = "#0b1030";
  g.font = `700 64px ${fonts.display}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(tg.id, 66, 70);
  // the option text
  const { size, lines } = fitText(g, tg.text, `700 {s}px ${fonts.body}`, W - 72, 3, 64, 26);
  g.fillStyle = "#ffffff";
  g.font = `700 ${size}px ${fonts.body}`;
  const lh = size * 1.15;
  const top = 128 + (H - 150 - lines.length * lh) / 2 + lh / 2;
  lines.forEach((l, i) => g.fillText(l, W / 2, top + i * lh));
  tg.tex.needsUpdate = true;
}

/** The biggest font size (from `max` down to `min`) whose wrap fits in `maxLines`. `font` has a {s} placeholder. */
function fitText(g: CanvasRenderingContext2D, text: string, font: string, maxW: number, maxLines: number, max: number, min: number) {
  let size = max;
  let lines: string[] = [];
  for (; size >= min; size -= 2) {
    g.font = font.replace("{s}", String(size));
    lines = wrap(g, text, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  size = min;
  g.font = font.replace("{s}", String(size));
  lines = wrap(g, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return { size, lines };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function easeOutBack(k: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}
