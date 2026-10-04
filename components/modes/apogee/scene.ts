// The Apogee world in three.js: a port of inspo/krillion-space-variant/apogee.html's scene
// (sky dome, stars, Earth with clouds and atmosphere, the pad, the rocket with its flame and
// particles, the Kármán line, ISS, geostationary ring, Moon, Webb at L2, Mars, the asteroid belt,
// Jupiter, meteors, speed streaks, labels) driven by the Run instead of a local mock.
//
// Plain TypeScript, no React: ApogeeStage loads this module with a dynamic import (so three.js
// stays out of the first bundle and never runs on the server) and drives it through the
// methods below. Altitude is in points (= km, 1 km per point); world y = HOVER + points × UNIT.
// Spec: docs/design/modes/apogee.md § The world.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { LANDMARKS, landmarkAt, MAX_POINTS } from "./altitude";

export type ApogeeFrame = {
  /** The rocket's live altitude in points (animates between scores). */
  points: number;
  /** Where the score pop should sit (CSS px, over the rocket's nose). */
  popX: number;
  popY: number;
};

export type ApogeeSceneOptions = {
  reduced: boolean;
  /** Font families for the 3D labels and the hull lettering (next/font's style.fontFamily). */
  fonts: { display: string; data: string };
  onFrame?: (f: ApogeeFrame) => void;
  /** The rocket passed a landmark (index into LANDMARKS) on the way up. */
  onLandmark?: (index: number) => void;
};

const UNIT = 2; //       world units per point
const HOVER = 10; //     hover height above the pad once lifted
const EARTH_R = 600;
const ptsToY = (p: number) => HOVER + p * UNIT;
const SUN_DIR = new THREE.Vector3(0.55, 0.42, 0.42).normalize();
const LM = (name: string) => LANDMARKS.find((l) => l.name === name)!.pts;

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s; }
`;
const PLANET_VERT = /* glsl */ `
varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
void main(){ vObjN = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;

type Particles = {
  n: number;
  pts: THREE.Points;
  u: { uScale: { value: number }; uTint: { value: THREE.Color } };
  pos: Float32Array;
  life: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  maxLife: Float32Array;
  age: Float32Array;
  grow: Float32Array;
  head: number;
};

type Label = { sprite: THREE.Sprite; draw: () => void; y: number };

export class ApogeeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 9000);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private canvas: HTMLCanvasElement;
  private opts: ApogeeSceneOptions;
  private raf = 0;
  private paused = false;
  private last = 0;
  private t = 0;
  private disposed = false;
  private cleanups: (() => void)[] = [];

  private skyU = { uAtmo: { value: 1 }, uSunDir: { value: SUN_DIR }, uTime: { value: 0 } };
  private starU = { uOpacity: { value: 0 }, uTime: { value: 0 }, uPR: { value: 1 } };
  private earthU = { uSunDir: { value: SUN_DIR }, uAtmo: { value: 1 }, uHaze: { value: new THREE.Color(0.42, 0.58, 0.82) } };
  private cloudU = { uSunDir: { value: SUN_DIR }, uTime: { value: 0 }, uAtmo: { value: 1 } };
  private atmoU = { uCenter: { value: new THREE.Vector3(0, -EARTH_R, 0) }, uR: { value: EARTH_R }, uRs: { value: EARTH_R * 1.07 }, uSunDir: { value: SUN_DIR }, uSpace: { value: 0 } };
  private karmanU = { uOp: { value: 0 } };
  private flameU = { uTime: { value: 0 }, uThrust: { value: 0 } };
  private jupiterU = { uSunDir: { value: SUN_DIR }, uTime: { value: 0 } };

  private sky!: THREE.Mesh;
  private stars!: THREE.Points;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private pad = new THREE.Group();
  private beacon!: THREE.Mesh;
  private rocket = new THREE.Group();
  private rocketBody = new THREE.Group();
  private decalCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private decalTex: THREE.CanvasTexture | null = null;
  private flameCore!: THREE.Mesh;
  private engineLight!: THREE.PointLight;
  private fire!: Particles;
  private smoke!: Particles;
  private sparks!: Particles;
  private streakGeo = new THREE.BufferGeometry();
  private streakPos = new Float32Array(220 * 6);
  private streakSeed = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, r: 6 + Math.random() * 40, y: Math.random() * 120 - 60 }));
  private streakMat = new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  private labels: Label[] = [];
  private puffs = new THREE.Group();
  private iss = new THREE.Group();
  private geoRing = new THREE.Group();
  private moon!: THREE.Mesh;
  private jwst = new THREE.Group();
  private mars!: THREE.Mesh;
  private jupiter!: THREE.Mesh;
  private rocks!: THREE.InstancedMesh;
  private rockData: { a: number; r: number; y: number; s: number; rot: THREE.Euler; spin: number; orbit: number }[] = [];
  private meteors: { line: THREE.Line; life: number; p: THREE.Vector3; v: THREE.Vector3 }[] = [];
  private meteorTimer = 0;
  private trajMat = new THREE.LineDashedMaterial({ color: 0xff6a2b, dashSize: 2, gapSize: 2.5, transparent: true, opacity: 0 });
  private traj: THREE.Line | null = null;
  private rings: { m: THREE.Mesh; t: number; s: number }[] = [];

  private flight = { y: 0.55, vel: 0, vy: 0, targetY: 0.55, thrust: 0, thrustTarget: 0, lifted: false, mode: "pad" as "pad" | "countdown" | "flight" | "coast", boost: 0, sputter: 0 };
  private rig = { az: 0.9, userAz: 0, userEl: 0, zoom: 1, targetY: 2.5, shake: 0, scrubY: null as number | null, reveal: false, wide: true };
  private lastLandmark = 0;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private rockM = new THREE.Matrix4();
  private rockQ = new THREE.Quaternion();
  private rockS = new THREE.Vector3();
  private rockP = new THREE.Vector3();
  private viewW = 1;
  private viewH = 1;

  constructor(canvas: HTMLCanvasElement, opts: ApogeeSceneOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.starU.uPR.value = this.renderer.getPixelRatio();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildSky();
    this.buildEarth();
    this.buildPad();
    this.buildRocket();
    this.fire = this.makeParticles(
      1400,
      `varying float vAge;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d);
        vec3 c = mix(vec3(1.0, 0.9, 0.7) * 1.6, vec3(1.0, 0.42, 0.08) * 1.1, smoothstep(0.0, 0.25, vAge));
        c = mix(c, vec3(0.55, 0.06, 0.02), smoothstep(0.3, 0.8, vAge));
        gl_FragColor = vec4(c * a * 0.55 * (1.0 - smoothstep(0.5, 1.0, vAge)), 1.0); }`,
      THREE.AdditiveBlending,
    );
    this.smoke = this.makeParticles(
      700,
      `varying float vAge; uniform vec3 uTint;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(uTint * (0.75 - 0.25 * vAge), a * 0.2 * (1.0 - vAge) * smoothstep(0.0, 0.08, vAge)); }`,
      THREE.NormalBlending,
    );
    this.sparks = this.makeParticles(
      500,
      `varying float vAge; uniform vec3 uTint;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uTint * 2.5 * a * (1.0 - vAge), 1.0); }`,
      THREE.AdditiveBlending,
    );
    this.buildStreaks();
    this.buildLandmarks();
    this.bindInput();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas);
    this.cleanups.push(() => ro.disconnect());
    this.resize();

    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (this.disposed) return;
        this.paintDecal();
        this.labels.forEach((l) => l.draw());
      });
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ===================================================================================
  // Public API

  /** Put the rocket at an altitude without flying there (first load, a reload mid-Run). */
  place(points: number, lifted: boolean) {
    const f = this.flight;
    f.lifted = lifted;
    f.y = f.targetY = lifted ? ptsToY(points) : 0.55;
    f.vel = 0;
    f.mode = lifted ? "flight" : "pad";
    this.rig.targetY = f.y + 2.5;
    this.lastLandmark = lifted ? landmarkAt(points) : 0;
  }

  /** 3 · 2 · 1: the engines spool up on the pad. */
  countdown() {
    if (this.flight.mode === "pad") this.flight.mode = "countdown";
  }

  /** LIFTOFF: leave the pad and hover at the current target. */
  liftoff(points = 0) {
    const f = this.flight;
    f.mode = "flight";
    f.lifted = true;
    f.boost = 2.2;
    f.targetY = Math.max(f.targetY, ptsToY(points));
    this.rig.shake = Math.max(this.rig.shake, 0.6);
  }

  /** A correct answer: engine burn (shockwave + sparks in the Tier colour) and climb to `points`. */
  burn(points: number, strength: number, colorHex: string) {
    const f = this.flight;
    if (!f.lifted) this.liftoff(0);
    this.shockwave(colorHex, strength);
    this.rig.shake = Math.max(this.rig.shake, 0.25 + strength * 0.35);
    f.boost = 1.6 + strength;
    f.targetY = ptsToY(points);
  }

  /** A wrong guess: a sputter and a jolt. */
  misfire() {
    this.rig.shake = Math.max(this.rig.shake, 0.35);
    this.flight.sputter = 0.5;
  }

  /** Time ran out: the engines cough and idle. */
  stall() {
    this.flight.sputter = 1.2;
  }

  /** The Run is over: throttle down and drift. */
  coast() {
    if (this.flight.lifted) this.flight.mode = "coast";
  }

  /** Mission Report: pull the camera back, draw the dashed trajectory, centre on the apogee. */
  setReveal(on: boolean, points: number) {
    this.rig.reveal = on;
    if (on) {
      this.coast();
      this.drawTrajectory(ptsToY(points) + 2);
      this.rig.scrubY = ptsToY(points);
    } else {
      this.rig.scrubY = null;
    }
  }

  /** Fly the camera to an altitude (the ruler scrub on the Reveal); null follows the rocket. */
  scrubTo(points: number | null) {
    this.rig.scrubY = points === null ? null : ptsToY(Math.min(MAX_POINTS, Math.max(0, points)));
  }

  setReduced(reduced: boolean) {
    this.opts.reduced = reduced;
  }

  /** Stop rendering (tab hidden, scrolled away). */
  setPaused(paused: boolean) {
    if (paused === this.paused || this.disposed) return;
    this.paused = paused;
    if (paused) cancelAnimationFrame(this.raf);
    else {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
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
    textures.forEach((t) => t.dispose());
    this.composer.dispose();
    this.bloom.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ===================================================================================
  // Building the world

  private buildSky() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader:
          NOISE +
          /* glsl */ `
          uniform float uAtmo; uniform vec3 uSunDir; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir); float h = d.y;
            vec3 zenith = vec3(0.04, 0.16, 0.55), horizon = vec3(0.42, 0.62, 0.88);
            vec3 day = mix(horizon, zenith, smoothstep(-0.02, 0.55, h));
            day = mix(day, vec3(0.36, 0.48, 0.66), smoothstep(0.0, -0.25, h));
            vec3 n = normalize(vec3(0.3, 0.55, 0.78));
            float band = exp(-pow(dot(d, n) * 3.2, 2.0));
            float neb = fbm(d * 3.5);
            vec3 space = vec3(0.003, 0.004, 0.012);
            space += band * (0.02 + 0.09 * neb * neb) * vec3(0.55, 0.52, 0.8);
            space += pow(fbm(d * 2.2 + 7.0), 4.0) * vec3(0.16, 0.04, 0.22) * 0.5;
            space += pow(fbm(d * 1.7 + 19.0), 5.0) * vec3(0.02, 0.12, 0.2) * 0.7;
            vec3 col = mix(space, day, uAtmo);
            float tw = clamp(uAtmo * (1.0 - uAtmo) * 4.0, 0.0, 1.0);
            col += tw * vec3(0.95, 0.42, 0.18) * exp(-abs(h + 0.02) * 10.0) * 0.45;
            float s = max(dot(d, uSunDir), 0.0);
            col += vec3(1.0, 0.92, 0.8) * (pow(s, 900.0) * 8.0 + pow(s, 60.0) * (0.25 + 0.35 * uAtmo) + pow(s, 6.0) * 0.08 * uAtmo);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const N = 6000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const ph = new Float32Array(N);
    const tints = [
      [1, 1, 1],
      [0.75, 0.85, 1],
      [1, 0.88, 0.72],
      [0.9, 0.92, 1],
    ];
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.randomDirection().multiplyScalar(3500);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = Math.pow(Math.random(), 6) * 4 + 0.8;
      const t = tints[(Math.random() * tints.length) | 0];
      const b = 0.5 + Math.random() * 0.8;
      col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
      ph[i] = Math.random() * 6.28;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    this.stars = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.starU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aPhase; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vTw;
          void main(){ vC = aColor; vTw = 0.75 + 0.25 * sin(uTime * 2.0 + aPhase * 7.0); gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uOpacity; varying vec3 vC; varying float vTw;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(min(vC * vTw, vec3(0.72)) * a * uOpacity, 1.0); }`,
      }),
    );
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);

    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x2a3346, 0.7);
    this.ambient = new THREE.AmbientLight(0x6070a0, 0.25);
    this.scene.add(this.hemi, this.ambient);
  }

  private buildEarth() {
    const center = new THREE.Vector3(0, -EARTH_R, 0);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R, 160, 120),
      new THREE.ShaderMaterial({
        uniforms: this.earthU,
        vertexShader: PLANET_VERT,
        fragmentShader:
          NOISE +
          /* glsl */ `
          uniform vec3 uSunDir; uniform float uAtmo; uniform vec3 uHaze;
          varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
          void main(){
            vec3 p = vObjN;
            float n = fbm(p * 2.4) + 0.22 * (fbm(p * 9.0) - 0.5) + 0.25 * smoothstep(0.975, 1.0, p.y);
            float land = smoothstep(0.50, 0.515, n);
            float coast = smoothstep(0.42, 0.50, n) * (1.0 - land);
            vec3 ocean = mix(vec3(0.003, 0.018, 0.07), vec3(0.01, 0.09, 0.17), coast);
            float dry = fbm(p * 4.0 + 5.0);
            vec3 landC = mix(vec3(0.045, 0.12, 0.03), vec3(0.30, 0.22, 0.11), smoothstep(0.45, 0.66, dry));
            landC *= 0.7 + 0.6 * fbm(p * 70.0);
            float ice = smoothstep(0.84, 0.9, abs(p.z + 0.12 * (fbm(p * 6.0) - 0.5)));
            vec3 col = mix(mix(ocean, landC, land), vec3(0.78, 0.83, 0.9), ice);
            float pad = 1.0 - smoothstep(0.99996, 0.99999, p.y);
            col = mix(col, vec3(0.22, 0.22, 0.2), 1.0 - pad);
            vec3 N = normalize(vN), L = normalize(uSunDir), V = normalize(cameraPosition - vWorldPos);
            float dif = max(dot(N, L), 0.0);
            float spec = pow(max(dot(reflect(-L, N), V), 0.0), 70.0) * (1.0 - land) * (1.0 - ice) * 0.7;
            vec3 lit = col * (dif * 1.7 + 0.015) + spec * vec3(1.0, 0.88, 0.7);
            float night = 1.0 - smoothstep(-0.08, 0.12, dot(N, L));
            float city = smoothstep(0.80, 0.97, noise(p * 140.0)) * land * (1.0 - ice) * smoothstep(0.42, 0.6, fbm(p * 11.0));
            lit += night * city * vec3(1.0, 0.62, 0.28) * 2.2;
            float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            lit += rim * vec3(0.22, 0.48, 1.0) * (0.08 + dif) * 0.9 * (1.0 - uAtmo);
            float dist = length(cameraPosition - vWorldPos);
            lit = mix(lit, uHaze, uAtmo * (1.0 - exp(-dist * 0.006)));
            gl_FragColor = vec4(lit, 1.0);
          }`,
      }),
    );
    earth.position.copy(center);
    this.scene.add(earth);

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R + 16, 128, 96),
      new THREE.ShaderMaterial({
        uniforms: this.cloudU,
        vertexShader: PLANET_VERT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fragmentShader:
          NOISE +
          /* glsl */ `
          uniform vec3 uSunDir; uniform float uTime; uniform float uAtmo;
          varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
          void main(){
            vec3 p = vObjN;
            float c = fbm(p * 5.0 + vec3(uTime * 0.004, 0.0, uTime * 0.002)) + 0.25 * (fbm(p * 22.0) - 0.5);
            float a = smoothstep(0.52, 0.7, c);
            a *= 1.0 - 0.75 * smoothstep(0.9985, 0.99995, p.y);
            float dif = max(dot(normalize(vN), normalize(uSunDir)), 0.0);
            vec3 col = vec3(1.0) * (dif * 1.4 + 0.03);
            float dist = length(cameraPosition - vWorldPos);
            a *= mix(0.9, 0.55, uAtmo) * smoothstep(2.0, 30.0, dist);
            gl_FragColor = vec4(col, a);
          }`,
      }),
    );
    clouds.position.copy(center);
    this.scene.add(clouds);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.07, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.atmoU,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vWorldPos; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCenter; uniform float uR; uniform float uRs; uniform vec3 uSunDir; uniform float uSpace; varying vec3 vWorldPos;
          void main(){
            vec3 ro = cameraPosition, rd = normalize(vWorldPos - ro);
            vec3 oc = uCenter - ro; float tca = max(dot(oc, rd), 0.0);
            vec3 cp = ro + rd * tca; float d = length(cp - uCenter);
            float x = clamp((d - uR) / (uRs - uR), 0.0, 1.0);
            float g = pow(1.0 - x, 3.5);
            float lit = 0.15 + 0.85 * smoothstep(-0.3, 0.6, dot(normalize(cp - uCenter), uSunDir));
            gl_FragColor = vec4(vec3(0.28, 0.55, 1.0) * g * lit * 1.4 * uSpace, 1.0);
          }`,
      }),
    );
    atmo.position.copy(center);
    this.scene.add(atmo);

    const karman = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R + ptsToY(LM("Kármán line")), 256, 128),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.karmanU,
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform float uOp; varying vec3 vN; varying vec3 vW;
          void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))); gl_FragColor = vec4(vec3(1.0, 0.45, 0.2) * pow(r, 10.0) * 0.5 * uOp, 1.0); }`,
      }),
    );
    karman.position.copy(center);
    this.scene.add(karman);
  }

  private buildPad() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb84a22, roughness: 0.6, metalness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 40), concrete);
    base.position.y = -0.55;
    this.pad.add(base);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.8 }));
    deck.position.y = 0.25;
    this.pad.add(deck);
    const tower = new THREE.Group();
    const H = 12;
    const legGeo = new THREE.BoxGeometry(0.16, H, 0.16);
    for (const [x, z] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [-0.6, 0.6],
      [0.6, 0.6],
    ]) {
      const leg = new THREE.Mesh(legGeo, steel);
      leg.position.set(x, H / 2, z);
      tower.add(leg);
    }
    const braceGeo = new THREE.BoxGeometry(1.7, 0.08, 0.08);
    for (let y = 0.8; y < H; y += 1.2) {
      for (const r of [0, Math.PI / 2]) {
        const brace = new THREE.Mesh(braceGeo, steel);
        brace.position.set(0, y, 0);
        brace.rotation.y = r;
        brace.rotation.z = 0.6;
        tower.add(brace);
      }
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.4), steel);
    arm.position.set(-1.6, 8.5, 0);
    tower.add(arm);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    this.beacon.position.set(0, H + 0.2, 0);
    tower.add(this.beacon);
    tower.position.set(-2.65, 0, -2.1);
    tower.rotation.y = 2.47;
    this.pad.add(tower);
    this.scene.add(this.pad);
  }

  private buildRocket() {
    const body = this.rocketBody;
    const hull = new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: 0.35, metalness: 0.15 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.45, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.35, metalness: 0.85 });
    const bodyPts = [
      [0.62, 0.35],
      [0.8, 0.6],
      [0.84, 1.4],
      [0.84, 3.3],
      [0.78, 3.7],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    body.add(new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 48), hull));
    const nosePts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      nosePts.push(new THREE.Vector2(0.78 * Math.cos((t * Math.PI) / 2) ** 0.9, 3.7 + t * 1.85));
    }
    body.add(new THREE.Mesh(new THREE.LatheGeometry(nosePts, 48), orange));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.845, 0.845, 0.22, 48, 1, true), orange);
    band.position.y = 1.15;
    body.add(band);
    const band2 = new THREE.Mesh(band.geometry, orange);
    band2.position.y = 3.15;
    band2.scale.set(1, 0.5, 1);
    body.add(band2);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), dark);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = 0.35;
    body.add(bottom);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 0.55, 32, 1, true), dark);
    nozzle.position.y = 0.1;
    body.add(nozzle);
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.85, -0.55);
    fin.lineTo(0.85, -0.05);
    fin.lineTo(0, 1.5);
    fin.lineTo(0, 0);
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(finGeo, orange);
      const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
      f.position.set(Math.cos(a) * 0.76, 0.55, Math.sin(a) * 0.76);
      f.rotation.y = -a;
      body.add(f);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 12, 32), dark);
    ring.position.set(0, 2.45, 0.86);
    body.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshStandardMaterial({ color: 0x0c2433, emissive: 0x2fb7ff, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.5 }));
    glass.position.set(0, 2.45, 0.85);
    body.add(glass);
    if (this.decalCanvas) {
      this.decalCanvas.width = 128;
      this.decalCanvas.height = 256;
      this.decalTex = new THREE.CanvasTexture(this.decalCanvas);
      this.decalTex.colorSpace = THREE.SRGBColorSpace;
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.84), new THREE.MeshStandardMaterial({ map: this.decalTex, transparent: true, roughness: 0.5 }));
      decal.position.set(-0.85, 1.9, 0);
      decal.rotation.y = -Math.PI / 2;
      body.add(decal);
      this.paintDecal();
    }
    this.rocket.add(body);
    this.rocket.position.set(0, 0.55, 0);
    this.scene.add(this.rocket);

    this.flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 3.2, 24, 8, true),
      new THREE.ShaderMaterial({
        uniforms: this.flameU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; p.xz *= 1.0 + 0.08 * sin(uTime * 40.0 + p.y * 6.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uThrust; uniform float uTime;
          void main(){ float t = 1.0 - vUv.y; float flick = 0.85 + 0.15 * sin(uTime * 55.0 + t * 20.0);
            vec3 c = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.55), smoothstep(0.2, 1.0, t)) * 3.0;
            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = smoothstep(0.0, 0.6, t) * flick * uThrust * (0.5 + 0.5 * edge);
            gl_FragColor = vec4(c * a, 1.0); }`,
      }),
    );
    this.flameCore.rotation.x = Math.PI;
    this.flameCore.position.y = -1.45;
    this.rocket.add(this.flameCore);
    this.engineLight = new THREE.PointLight(0xff7a30, 0, 40, 1.6);
    this.engineLight.position.y = -1.2;
    this.rocket.add(this.engineLight);
  }

  private paintDecal() {
    const c = this.decalCanvas;
    const g = c?.getContext("2d");
    if (!c || !g || !this.decalTex) return;
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.translate(64, 128);
    g.rotate(-Math.PI / 2);
    g.font = `900 92px ${this.opts.fonts.display}, Impact, sans-serif`;
    g.fillStyle = "#1b1d26";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("APOGEE", 0, 4);
    g.restore();
    this.decalTex.needsUpdate = true;
  }

  private makeParticles(n: number, frag: string, blending: THREE.Blending): Particles {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const life = new Float32Array(n).fill(1);
    const size = new Float32Array(n);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const u = { uScale: { value: 500 }, uTint: { value: new THREE.Color(1, 1, 1) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vAge;
        void main(){ vAge = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aLife >= 1.0 ? 0.0 : aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: frag,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { n, pts, u, pos, life, size, vel: new Float32Array(n * 3), maxLife: new Float32Array(n).fill(1), age: new Float32Array(n), grow: new Float32Array(n), head: 0 };
  }

  private emit(sys: Particles, p: THREE.Vector3, vx: number, vy: number, vz: number, life: number, size: number, grow = 0) {
    const i = sys.head;
    sys.head = (sys.head + 1) % sys.n;
    sys.pos[i * 3] = p.x;
    sys.pos[i * 3 + 1] = p.y;
    sys.pos[i * 3 + 2] = p.z;
    sys.vel[i * 3] = vx;
    sys.vel[i * 3 + 1] = vy;
    sys.vel[i * 3 + 2] = vz;
    sys.age[i] = 0;
    sys.maxLife[i] = life;
    sys.size[i] = size;
    sys.grow[i] = grow;
    sys.life[i] = 0;
  }

  private stepParticles(sys: Particles, dt: number, drag: number) {
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < sys.n; i++) {
      if (sys.life[i] >= 1) continue;
      sys.age[i] += dt;
      const l = sys.age[i] / sys.maxLife[i];
      if (l >= 1) {
        sys.life[i] = 1;
        continue;
      }
      sys.life[i] = l;
      sys.vel[i * 3] *= k;
      sys.vel[i * 3 + 1] *= k;
      sys.vel[i * 3 + 2] *= k;
      sys.pos[i * 3] += sys.vel[i * 3] * dt;
      sys.pos[i * 3 + 1] += sys.vel[i * 3 + 1] * dt;
      sys.pos[i * 3 + 2] += sys.vel[i * 3 + 2] * dt;
      sys.size[i] += sys.grow[i] * dt;
    }
    const g = sys.pts.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }

  private buildStreaks() {
    this.streakGeo.setAttribute("position", new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage));
    const streaks = new THREE.LineSegments(this.streakGeo, this.streakMat);
    streaks.frustumCulled = false;
    this.scene.add(streaks);
  }

  private makeLabel(title: string, sub: string, pos: THREE.Vector3, color = "#ece6d8") {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.2, 0.05, 1);
    s.center.set(0, 0.5);
    s.position.copy(pos);
    s.renderOrder = 5;
    this.scene.add(s);
    const draw = () => {
      const g = c.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = color;
      g.fillRect(0, 70, 34, 3);
      g.font = `800 64px ${this.opts.fonts.display}, Impact, sans-serif`;
      g.textBaseline = "alphabetic";
      g.fillText(title.toUpperCase(), 46, 86);
      g.font = `500 26px ${this.opts.fonts.data}, monospace`;
      g.fillStyle = "rgba(236,230,216,0.72)";
      g.fillText(sub, 48, 128);
      tex.needsUpdate = true;
    };
    draw();
    this.labels.push({ sprite: s, draw, y: pos.y });
  }

  private buildLandmarks() {
    const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, ...extra });

    // low clouds around the climb
    const pc = document.createElement("canvas");
    pc.width = pc.height = 128;
    const pg = pc.getContext("2d");
    if (pg) {
      const grd = pg.createRadialGradient(64, 64, 4, 64, 64, 64);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.5, "rgba(255,255,255,0.45)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      pg.fillStyle = grd;
      pg.fillRect(0, 0, 128, 128);
    }
    const puffTex = new THREE.CanvasTexture(pc);
    puffTex.colorSpace = THREE.SRGBColorSpace;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 90;
      const y = 22 + Math.random() * 50;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      for (let j = 0; j < 7; j++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.55, color: 0xffffff }));
        const sc = 9 + Math.random() * 14;
        s.scale.set(sc, sc * 0.62, 1);
        s.position.set(cx + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 22);
        this.puffs.add(s);
      }
    }
    this.scene.add(this.puffs);

    // ISS
    {
      const panel = std(0x1b2a6b, { emissive: 0x0a1440, roughness: 0.3, metalness: 0.7 });
      const white = std(0xd9d9d4, { roughness: 0.6 });
      const gold = std(0xc89b3c, { metalness: 0.9, roughness: 0.3 });
      this.iss.add(new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 0.35), white));
      const pGeo = new THREE.BoxGeometry(1.5, 0.04, 4.2);
      for (const x of [-7, -5, 5, 7])
        for (const z of [-1, 1]) {
          const p = new THREE.Mesh(pGeo, panel);
          p.position.set(x, 0, z * 2.4);
          this.iss.add(p);
        }
      const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 6, 16), white);
      mod.rotation.x = Math.PI / 2;
      this.iss.add(mod);
      const mod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 16), gold);
      mod2.rotation.z = Math.PI / 2;
      mod2.position.set(0, 0, 2.2);
      this.iss.add(mod2);
      const rGeo = new THREE.BoxGeometry(0.1, 2.4, 1.2);
      for (const z of [-2, 2]) {
        const r = new THREE.Mesh(rGeo, white);
        r.position.set(0, 0.9, z);
        this.iss.add(r);
      }
      this.iss.scale.setScalar(1.3);
      this.scene.add(this.iss);
      this.makeLabel("ISS", "408 km · low Earth orbit", new THREE.Vector3(14, ptsToY(LM("ISS")) + 4, 0));
    }

    // geostationary ring + satellites
    {
      const geoY = ptsToY(LM("Geostationary"));
      const geoR = EARTH_R + geoY;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 360; i++) {
        const a = (i / 360) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * geoR, Math.cos(a) * geoR, 0));
      }
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x4fd6e8, dashSize: 6, gapSize: 8, transparent: true, opacity: 0.5 }));
      line.computeLineDistances();
      this.geoRing.add(line);
      const bodyM = std(0xd8c58d, { metalness: 0.9, roughness: 0.3 });
      const panM = std(0x1d2b70, { emissive: 0x0a1440 });
      const dishM = std(0xeeeeee, { side: THREE.DoubleSide });
      const boxG = new THREE.BoxGeometry(1.2, 1.2, 1.6);
      const panG = new THREE.BoxGeometry(4, 0.05, 1.2);
      const dishG = new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, 1.0);
      for (const ang of [-0.11, -0.05, 0.035, 0.09]) {
        const sat = new THREE.Group();
        sat.add(new THREE.Mesh(boxG, bodyM));
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(panG, panM);
          p.position.x = s * 2.7;
          sat.add(p);
        }
        const dish = new THREE.Mesh(dishG, dishM);
        dish.position.z = 1.1;
        dish.rotation.x = Math.PI / 2;
        sat.add(dish);
        sat.position.set(Math.sin(ang) * geoR, Math.cos(ang) * geoR, 0);
        sat.rotation.z = -ang;
        sat.scale.setScalar(1.3);
        this.geoRing.add(sat);
      }
      this.geoRing.position.set(0, -EARTH_R, 0);
      this.geoRing.rotation.y = 0.5;
      this.scene.add(this.geoRing);
      this.makeLabel("Geostationary", "35,786 km · not to scale", new THREE.Vector3(16, geoY + 6, -8), "#9feaf4");
    }

    // Moon
    {
      const moonY = ptsToY(LM("The Moon"));
      this.moon = new THREE.Mesh(
        new THREE.SphereGeometry(46, 96, 64),
        new THREE.ShaderMaterial({
          uniforms: { uSunDir: { value: SUN_DIR } },
          vertexShader: PLANET_VERT,
          fragmentShader:
            NOISE +
            `uniform vec3 uSunDir; varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
            void main(){ vec3 p = vObjN; float base = 0.42 + 0.28 * fbm(p * 3.0);
              float mare = smoothstep(0.5, 0.58, fbm(p * 1.6 + 3.0)); base = mix(base, base * 0.5, mare);
              float cr = smoothstep(0.72, 0.78, noise(p * 26.0)) - smoothstep(0.78, 0.86, noise(p * 26.0)) * 0.6;
              base += cr * 0.12 + 0.1 * (fbm(p * 40.0) - 0.5);
              float dif = max(dot(normalize(vN), uSunDir), 0.0);
              gl_FragColor = vec4(vec3(base) * vec3(1.0, 0.98, 0.95) * (dif * 1.15 + 0.01), 1.0); }`,
        }),
      );
      this.moon.position.set(-150, moonY + 20, -150);
      this.scene.add(this.moon);
      this.makeLabel("The Moon", "384,400 km", new THREE.Vector3(-100, moonY + 70, -150));
    }

    // Webb at L2
    {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.18, emissive: 0x4a2a00, emissiveIntensity: 0.6 });
      const hex = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 6);
      hex.rotateX(Math.PI / 2);
      hex.rotateZ(Math.PI / 6);
      const w = Math.sqrt(3) * 0.5 + 0.06;
      const axial = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
      ];
      const cells: number[][] = [...axial];
      for (let i = 0; i < 6; i++) {
        const [q1, r1] = axial[i];
        const [q2, r2] = axial[(i + 1) % 6];
        cells.push([q1 * 2, r1 * 2], [q1 + q2, r1 + r2]);
      }
      for (const [q, r] of cells) {
        const m = new THREE.Mesh(hex, gold);
        m.position.set(w * (q + r / 2), w * ((r * Math.sqrt(3)) / 2), 0);
        this.jwst.add(m);
      }
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0xd9b7d9, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide, emissive: 0x2a1030, emissiveIntensity: 0.4 });
      const sh = new THREE.Shape();
      sh.moveTo(-6, 0);
      sh.lineTo(-2.5, 2.4);
      sh.lineTo(2.5, 2.4);
      sh.lineTo(6, 0);
      sh.lineTo(2.5, -2.4);
      sh.lineTo(-2.5, -2.4);
      sh.lineTo(-6, 0);
      const shG = new THREE.ShapeGeometry(sh);
      for (let i = 0; i < 5; i++) {
        const layer = new THREE.Mesh(shG, shieldMat);
        layer.rotation.x = -Math.PI / 2;
        layer.position.set(0, -2.3 - i * 0.22, 0.8);
        layer.scale.setScalar(1 - i * 0.03);
        this.jwst.add(layer);
      }
      const sec = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), gold);
      sec.position.z = 2.4;
      this.jwst.add(sec);
      this.jwst.scale.setScalar(3.2);
      const l2Y = ptsToY(LM("Sun–Earth L2"));
      this.jwst.position.set(40, l2Y + 8, -30);
      this.scene.add(this.jwst);
      this.makeLabel("Webb · L2", "1.5 million km", new THREE.Vector3(62, l2Y + 26, -30), "#ffd98a");
    }

    // Mars
    {
      const marsY = ptsToY(LM("Mars"));
      this.mars = new THREE.Mesh(
        new THREE.SphereGeometry(62, 96, 64),
        new THREE.ShaderMaterial({
          uniforms: { uSunDir: { value: SUN_DIR } },
          vertexShader: PLANET_VERT,
          fragmentShader:
            NOISE +
            `uniform vec3 uSunDir; varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
            void main(){ vec3 p = vObjN; float n = fbm(p * 3.0);
              vec3 c = mix(vec3(0.32, 0.08, 0.02), vec3(0.62, 0.26, 0.09), smoothstep(0.3, 0.7, n));
              c = mix(c, vec3(0.16, 0.05, 0.02), smoothstep(0.55, 0.62, fbm(p * 1.8 + 4.0)) * 0.7);
              c *= 0.8 + 0.4 * fbm(p * 30.0);
              c = mix(c, vec3(0.9, 0.88, 0.86), smoothstep(0.88, 0.93, abs(p.y)));
              vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vWorldPos); float dif = max(dot(N, uSunDir), 0.0);
              vec3 col = c * (dif * 1.8 + 0.01) + pow(1.0 - max(dot(N, V), 0.0), 4.0) * vec3(1.0, 0.45, 0.25) * dif * 0.6;
              gl_FragColor = vec4(col, 1.0); }`,
        }),
      );
      this.mars.position.set(210, marsY + 30, -230);
      this.scene.add(this.mars);
      this.makeLabel("Mars", "54.6 million km", new THREE.Vector3(250, marsY + 105, -230), "#ff9a6a");
    }

    // asteroid belt between Mars and Jupiter
    {
      const N = 520;
      const rockGeo = new THREE.IcosahedronGeometry(1, 1);
      const p = rockGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).multiplyScalar(0.75 + Math.random() * 0.5);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      rockGeo.computeVertexNormals();
      this.rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x7d7166, roughness: 0.95, flatShading: true }), N);
      const y0 = ptsToY(LM("Mars") + 15);
      const y1 = ptsToY(LM("Jupiter") - 25);
      for (let i = 0; i < N; i++) {
        this.rockData.push({
          a: Math.random() * Math.PI * 2,
          r: 14 + Math.pow(Math.random(), 0.7) * 260,
          y: y0 + Math.random() * (y1 - y0),
          s: 0.4 + Math.pow(Math.random(), 3) * 5,
          rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
          spin: (Math.random() - 0.5) * 0.6,
          orbit: 0.01 + Math.random() * 0.02,
        });
      }
      this.scene.add(this.rocks);
      this.makeLabel("Asteroid belt", "between Mars and Jupiter", new THREE.Vector3(18, (y0 + y1) / 2, 0), "#c8bfb4");
    }

    // Jupiter
    {
      const jupY = ptsToY(LM("Jupiter"));
      this.jupiter = new THREE.Mesh(
        new THREE.SphereGeometry(170, 128, 96),
        new THREE.ShaderMaterial({
          uniforms: this.jupiterU,
          vertexShader: PLANET_VERT,
          fragmentShader:
            NOISE +
            `uniform vec3 uSunDir; uniform float uTime; varying vec3 vObjN; varying vec3 vN; varying vec3 vWorldPos;
            void main(){ vec3 p = vObjN; float lat = p.y;
              float turb = fbm(vec3(p.x * 3.0 + uTime * 0.01, p.y * 14.0, p.z * 3.0));
              float b = sin(lat * 22.0 + turb * 3.2);
              vec3 cream = vec3(0.82, 0.70, 0.52), brown = vec3(0.45, 0.25, 0.12), white = vec3(0.92, 0.88, 0.80);
              vec3 c = mix(brown, cream, smoothstep(-0.6, 0.6, b));
              c = mix(c, white, smoothstep(0.75, 0.95, sin(lat * 9.0 + turb * 2.0)) * 0.6);
              float lon = atan(p.z, p.x);
              vec2 q = vec2((lon - 0.9) * 1.0, (lat + 0.32) * 2.6);
              float spot = 1.0 - smoothstep(0.09, 0.15, length(q));
              c = mix(c, vec3(0.62, 0.18, 0.08), spot);
              vec3 N = normalize(vN); float dif = max(dot(N, uSunDir), 0.0);
              gl_FragColor = vec4(c * (dif * 1.6 + 0.01), 1.0); }`,
        }),
      );
      this.jupiter.position.set(-360, jupY + 90, -520);
      this.jupiter.rotation.z = 0.05;
      this.scene.add(this.jupiter);
      this.makeLabel("Jupiter", "588 million km", new THREE.Vector3(-260, jupY + 270, -520), "#f0c98a");
    }

    // atmosphere layers along the climb
    this.makeLabel("Tropopause", "12 km · weather ends", new THREE.Vector3(-16, ptsToY(LM("Tropopause")), 4), "#cfe3ff");
    this.makeLabel("Stratopause", "50 km · top of the ozone", new THREE.Vector3(14, ptsToY(LM("Stratopause")), -4), "#cfe3ff");
    this.makeLabel("Mesopause", "85 km · meteors burn up", new THREE.Vector3(-16, ptsToY(LM("Mesopause")), 4), "#ffd0b0");
    this.makeLabel("Kármán line", "100 km · space begins", new THREE.Vector3(14, ptsToY(LM("Kármán line")), 0), "#ff9a6a");
    this.makeLabel("Low orbit", "160 km · the lowest orbit that holds", new THREE.Vector3(-16, ptsToY(LM("Low orbit")), 4), "#9feaf4");

    // meteors in the mesosphere
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0.85, 0.6, 0, 0, 0]), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, opacity: 0, depthWrite: false }));
      l.frustumCulled = false;
      this.scene.add(l);
      this.meteors.push({ line: l, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3() });
    }
  }

  private drawTrajectory(topY: number) {
    if (this.traj) {
      this.scene.remove(this.traj);
      this.traj.geometry.dispose();
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const y = 0.5 + ((topY - 0.5) * i) / 200;
      pts.push(new THREE.Vector3(Math.sin(y * 0.03) * 0.6, y, 0));
    }
    this.traj = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.trajMat);
    this.traj.computeLineDistances();
    this.scene.add(this.traj);
  }

  private shockwave(colorHex: string, strength: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 64),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(this.rocket.position).add(this.tmpV.set(0, 0.8, 0));
    this.scene.add(m);
    this.rings.push({ m, t: 0, s: strength });
    this.sparks.u.uTint.value.set(colorHex);
    const n = Math.round(60 * strength);
    const origin = this.rocket.position.clone().add(new THREE.Vector3(0, 2.5, 0));
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(10 + Math.random() * 25 * strength);
      this.emit(this.sparks, origin, v.x, v.y, v.z, 0.6 + Math.random() * 0.8, 0.5 + Math.random() * 0.6);
    }
  }

  private bindInput() {
    const c = this.canvas;
    const rig = this.rig;
    let dragging: { x: number; y: number; id: number } | null = null;
    let pinch0: { d: number; z: number } | null = null;
    const down = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY, id: e.pointerId };
      c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging || dragging.id !== e.pointerId) return;
      rig.userAz -= (e.clientX - dragging.x) * 0.006;
      rig.userEl = THREE.MathUtils.clamp(rig.userEl + (e.clientY - dragging.y) * 0.005, -0.9, 1.1);
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    };
    const up = () => (dragging = null);
    const dbl = () => {
      rig.userAz = 0;
      rig.userEl = 0;
      rig.zoom = 1;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      rig.zoom = THREE.MathUtils.clamp(rig.zoom * Math.exp(e.deltaY * 0.001), 0.45, 6);
    };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const tstart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch0 = { d: dist(e.touches), z: rig.zoom };
    };
    const tmove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch0) rig.zoom = THREE.MathUtils.clamp((pinch0.z * pinch0.d) / dist(e.touches), 0.45, 6);
    };
    const tend = () => (pinch0 = null);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("dblclick", dbl);
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("touchstart", tstart, { passive: true });
    c.addEventListener("touchmove", tmove, { passive: true });
    c.addEventListener("touchend", tend);
    this.cleanups.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("dblclick", dbl);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("touchstart", tstart);
      c.removeEventListener("touchmove", tmove);
      c.removeEventListener("touchend", tend);
    });
  }

  private resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w;
    this.viewH = h;
    this.rig.wide = w > 760;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    for (const s of [this.fire, this.smoke, this.sparks]) s.u.uScale.value = scale;
  }

  // ===================================================================================
  // The frame loop

  private frame = (now: number) => {
    if (this.disposed || this.paused) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;
    const t = this.t;
    const reduced = this.opts.reduced;
    const f = this.flight;
    const rig = this.rig;

    // rocket physics: a critically-damped chase of the target altitude
    const prevY = f.y;
    if (f.lifted) {
      if (reduced) f.y += (f.targetY - f.y) * (1 - Math.exp(-dt * 5));
      else {
        const want = THREE.MathUtils.clamp((f.targetY - f.y) * 2.4, -320, 320);
        f.vel += (want - f.vel) * (1 - Math.exp(-dt * 4));
        f.y += f.vel * dt;
      }
    }
    f.vy = (f.y - prevY) / Math.max(dt, 1e-4);
    f.boost = Math.max(0, f.boost - dt);
    f.sputter = Math.max(0, f.sputter - dt);
    const climbing = Math.min(1, Math.abs(f.vy) / 40);
    if (f.mode === "flight") f.thrustTarget = 0.42 + Math.min(1, f.boost * 0.6) * 0.9 + climbing * 0.5;
    else if (f.mode === "countdown") f.thrustTarget = 0.35;
    else if (f.mode === "coast") f.thrustTarget = 0.22;
    else f.thrustTarget = 0;
    let thr = f.thrustTarget;
    if (f.sputter > 0) thr *= 0.35 + 0.65 * (Math.sin(t * 60) > 0 ? 1 : 0.2);
    f.thrust += (thr - f.thrust) * (1 - Math.exp(-dt * 8));
    const wob = f.lifted && !reduced ? 1 : 0;
    this.rocket.position.set(Math.sin(t * 0.7) * 0.35 * wob, f.y + Math.sin(t * 1.3) * 0.25 * wob, Math.cos(t * 0.5) * 0.25 * wob);
    this.rocket.rotation.z = Math.sin(t * 0.7) * 0.04 * wob - (reduced ? 0 : rig.shake * 0.05 * Math.sin(t * 50));
    this.rocket.rotation.x = Math.cos(t * 0.5) * 0.03 * wob;
    this.rocketBody.rotation.y += dt * 0.15 * wob;
    if (f.mode === "countdown" && !reduced) this.rocket.position.x += (Math.random() - 0.5) * 0.04;
    this.rocket.updateMatrixWorld();

    this.flameU.uTime.value = t;
    this.flameU.uThrust.value = f.thrust;
    this.flameCore.scale.set(1, 0.4 + f.thrust * 1.2, 1);
    this.flameCore.position.y = -0.17 - 1.6 * (0.4 + f.thrust * 1.2);
    this.engineLight.intensity = f.thrust * 60;

    // exhaust
    const nozzle = this.tmpV.set(0, 0, 0).applyMatrix4(this.rocket.matrixWorld);
    nozzle.y -= 0.2;
    const nFire = Math.floor(f.thrust * 380 * dt + Math.random());
    const sp = 0.35 + f.thrust;
    for (let i = 0; i < nFire; i++) {
      this.emit(
        this.fire,
        nozzle,
        (Math.random() - 0.5) * 2.2 * sp,
        -(14 + Math.random() * 12) * (0.5 + f.thrust) + f.vy * 0.9,
        (Math.random() - 0.5) * 2.2 * sp,
        0.35 + Math.random() * 0.35,
        0.35 + Math.random() * 0.45 * (0.5 + f.thrust),
      );
    }
    if (f.y < 260 && f.thrust > 0.05) {
      const nearPad = f.y < 14 ? 2 : 0.6;
      const nSmoke = Math.floor(f.thrust * 70 * nearPad * dt + Math.random());
      const sOrigin = this.tmpV2.copy(nozzle);
      sOrigin.y -= 1.2;
      for (let i = 0; i < nSmoke; i++) {
        let vx = (Math.random() - 0.5) * 4;
        let vy = -(4 + Math.random() * 6);
        let vz = (Math.random() - 0.5) * 4;
        if (f.y < 4) {
          vy = Math.random() * 1.2;
          vx *= 4;
          vz *= 4;
        }
        this.emit(this.smoke, sOrigin, vx, vy, vz, 2.5 + Math.random() * 2.5, 1.2 + Math.random() * 1.2, 1.3);
      }
    }
    this.stepParticles(this.fire, dt, 1.2);
    this.stepParticles(this.smoke, dt, 0.8);
    this.stepParticles(this.sparks, dt, 2.0);

    // shockwaves
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / 1.1;
      const s = 1 + k * 18 * r.s;
      r.m.scale.set(s, s, s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      r.m.position.y = this.rocket.position.y + 0.8;
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        (r.m.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }

    // camera rig
    const followY = rig.scrubY ?? f.y + 2.5;
    if (rig.scrubY != null || reduced) rig.targetY += (followY - rig.targetY) * (1 - Math.exp(-dt * (reduced ? 6 : 2.2)));
    else rig.targetY += (followY - THREE.MathUtils.clamp(f.vel * 0.01, -3, 3) - rig.targetY) * (1 - Math.exp(-dt * 20));
    const space = THREE.MathUtils.smoothstep(rig.targetY, 50, 230);
    rig.az += dt * (rig.reveal ? 0.05 : 0.035) * (reduced ? 0 : 1);
    const baseEl = THREE.MathUtils.lerp(f.mode === "pad" ? 0.06 : -0.12, 0.42, space);
    const baseR = (f.mode === "pad" || f.mode === "countdown" ? 21 : 15 + space * 8) * (rig.reveal ? 2.8 : 1);
    const el = THREE.MathUtils.clamp(baseEl + rig.userEl, -1.2, 1.35);
    const az = rig.az + rig.userAz;
    const R = baseR * rig.zoom * (rig.wide ? 1 : 1.35);
    rig.shake = Math.max(0, rig.shake - dt * 1.2);
    const sh = reduced ? 0 : rig.shake * rig.shake;
    const tx = this.rocket.position.x;
    const tz = this.rocket.position.z;
    const ty = rig.targetY;
    const cam = this.camera;
    cam.position.set(tx + Math.cos(el) * Math.sin(az) * R + (Math.random() - 0.5) * sh, ty + Math.sin(el) * R + (Math.random() - 0.5) * sh, tz + Math.cos(el) * Math.cos(az) * R);
    const center = this.atmoU.uCenter.value;
    const camAlt = cam.position.distanceTo(center) - EARTH_R;
    if (camAlt < 1.2) cam.position.add(this.tmpV2.copy(cam.position).sub(center).normalize().multiplyScalar(1.2 - camAlt));
    const onPad = f.mode === "pad" || f.mode === "countdown";
    // Look a little below the rocket so it rides above the console (and above the phone sheet on the Reveal).
    const lift = onPad ? 1 : rig.reveal ? (rig.wide ? 0 : -R * 0.32) : -R * (rig.wide ? 0.1 : 0.2);
    cam.lookAt(tx, ty + lift, tz);
    const fo = !rig.wide ? 0 : rig.reveal ? 8 : 0;
    if (Math.abs(cam.filmOffset - fo) > 0.01) {
      cam.filmOffset += (fo - cam.filmOffset) * (1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
    }

    // environment by altitude
    const camY = cam.position.y;
    const atmoCam = 1 - THREE.MathUtils.smoothstep(camY, 50, 230);
    this.skyU.uAtmo.value = atmoCam;
    this.skyU.uTime.value = t;
    this.earthU.uAtmo.value = atmoCam;
    this.cloudU.uAtmo.value = atmoCam;
    this.cloudU.uTime.value = t;
    this.atmoU.uSpace.value = 1 - atmoCam;
    this.starU.uOpacity.value = THREE.MathUtils.smoothstep(1 - atmoCam, 0.35, 0.95);
    this.starU.uTime.value = t;
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.hemi.intensity = 0.15 + 0.65 * atmoCam;
    this.ambient.intensity = 0.12 + 0.15 * atmoCam;
    this.smoke.u.uTint.value.setRGB(0.9, 0.9, 0.92).multiplyScalar(0.4 + 0.6 * atmoCam);
    this.bloom.strength = 0.65 + 0.35 * (1 - atmoCam);
    this.karmanU.uOp.value = 0.55 + 0.45 * (1 - atmoCam);
    if (camY < 160) for (const s of this.puffs.children as THREE.Sprite[]) s.material.opacity = 0.6 * THREE.MathUtils.smoothstep(cam.position.distanceTo(s.position), 4, 18);
    this.puffs.visible = camY < 160;
    this.beacon.visible = Math.sin(t * 4) > 0;

    const ia = t * 0.06;
    this.iss.position.set(Math.cos(ia) * 34, ptsToY(LM("ISS")) + Math.sin(ia * 2) * 2, Math.sin(ia) * 34);
    this.iss.rotation.y = -ia + Math.PI / 2;
    this.jwst.rotation.y = Math.sin(t * 0.1) * 0.3 + 0.6;
    this.moon.rotation.y = t * 0.01;
    this.mars.rotation.y = t * 0.02;
    this.jupiter.rotation.y = t * 0.015;
    this.jupiterU.uTime.value = t;
    this.geoRing.rotation.z = t * 0.002;

    // asteroids, only near the belt
    const beltY = ptsToY((LM("Mars") + LM("Jupiter")) / 2);
    if (Math.abs(camY - beltY) < 600) {
      for (let i = 0; i < this.rockData.length; i++) {
        const d = this.rockData[i];
        const a = d.a + t * d.orbit;
        this.rockP.set(Math.cos(a) * d.r, d.y, Math.sin(a) * d.r);
        d.rot.x += d.spin * dt;
        d.rot.y += d.spin * dt * 0.7;
        this.rockQ.setFromEuler(d.rot);
        this.rockS.setScalar(d.s);
        this.rockM.compose(this.rockP, this.rockQ, this.rockS);
        this.rocks.setMatrixAt(i, this.rockM);
      }
      this.rocks.instanceMatrix.needsUpdate = true;
      this.rocks.visible = true;
    } else this.rocks.visible = false;

    // meteors near the mesosphere
    this.meteorTimer -= dt;
    const inMeso = camY > ptsToY(45) && camY < ptsToY(120);
    if (!reduced && this.meteorTimer <= 0 && (inMeso || Math.random() < 0.002)) {
      this.meteorTimer = inMeso ? 0.25 + Math.random() * 0.5 : 2;
      const m = this.meteors.find((x) => x.life >= 1);
      if (m) {
        const a = Math.random() * Math.PI * 2;
        m.p.set(Math.cos(a) * (40 + Math.random() * 60), camY + 20 + Math.random() * 40, Math.sin(a) * (40 + Math.random() * 60));
        m.v.set(-Math.cos(a) * 30 + (Math.random() - 0.5) * 40, -60 - Math.random() * 40, -Math.sin(a) * 30 + (Math.random() - 0.5) * 40);
        m.life = 0;
      }
    }
    for (const m of this.meteors) {
      const mat = m.line.material as THREE.LineBasicMaterial;
      if (m.life >= 1) {
        mat.opacity = 0;
        continue;
      }
      m.life += dt / 0.7;
      m.p.addScaledVector(m.v, dt);
      const pa = m.line.geometry.attributes.position as THREE.BufferAttribute;
      pa.setXYZ(0, m.p.x, m.p.y, m.p.z);
      pa.setXYZ(1, m.p.x - m.v.x * 0.12, m.p.y - m.v.y * 0.12, m.p.z - m.v.z * 0.12);
      pa.needsUpdate = true;
      mat.opacity = Math.sin(Math.min(1, m.life) * Math.PI) * 1.5;
    }

    // speed streaks
    const speed = Math.abs(f.vy);
    this.streakMat.opacity = reduced ? 0 : THREE.MathUtils.clamp((speed - 30) / 200, 0, 0.42) * (rig.scrubY != null ? 0 : 1);
    if (this.streakMat.opacity > 0) {
      const len = Math.min(30, speed * 0.06);
      for (let i = 0; i < this.streakSeed.length; i++) {
        const s = this.streakSeed[i];
        s.y -= speed * dt * 0.9;
        if (s.y < -60) {
          s.y += 120;
          s.a = Math.random() * Math.PI * 2;
          s.r = 6 + Math.random() * 40;
        }
        const x = cam.position.x + Math.cos(s.a) * s.r;
        const z = cam.position.z + Math.sin(s.a) * s.r;
        const y = rig.targetY + s.y;
        this.streakPos.set([x, y, z, x, y + len, z], i * 6);
      }
      this.streakGeo.attributes.position.needsUpdate = true;
    }

    this.trajMat.opacity += ((rig.reveal ? 0.85 : 0) - this.trajMat.opacity) * (1 - Math.exp(-dt * 2));

    for (const L of this.labels) {
      const dy = Math.abs(L.y - rig.targetY);
      const big = L.y > ptsToY(300) ? 260 : 90;
      L.sprite.material.opacity = 1 - THREE.MathUtils.smoothstep(dy, big * 0.5, big);
    }

    // HUD feed
    const live = f.lifted ? Math.max(0, (f.y - HOVER) / UNIT) : 0;
    const li = landmarkAt(live + 0.5);
    if (f.lifted && li > this.lastLandmark) {
      this.lastLandmark = li;
      this.opts.onLandmark?.(li);
    }
    if (this.opts.onFrame) {
      const sp = this.tmpV.copy(this.rocket.position).add(this.tmpV2.set(0, 6.5, 0)).project(cam);
      this.opts.onFrame({ points: live, popX: ((sp.x + 1) / 2) * this.viewW, popY: ((1 - sp.y) / 2) * this.viewH });
    }

    this.composer.render(dt);
  };
}
