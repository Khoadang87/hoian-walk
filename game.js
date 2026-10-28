// Hội An riverside street as a real-time 3D game world (three.js). Procedural shophouses / river / props (all built in
// code, no downloads) + CC0 Quaternius Universal Animation Library mannequins (rigged, animated) recoloured per NPC.
// 3D game street at ?scene=game (default is now presence.js; live-video walk at ?scene=live).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/addons/libs/meshopt_decoder.module.js';
import { clone as skClone } from './vendor/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from './vendor/addons/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // deterministic world layout
const R = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const RS = (a, b) => a + rnd() * (b - a), pickS = (a) => a[Math.floor(rnd() * a.length)];
const clamp = THREE.MathUtils.clamp;
const showError = (msg) => { $('loader').hidden = true; const e = $('error'); e.hidden = false; e.textContent = msg; console.error('[viewer-error]', msg); window.__viewerError = msg; };
window.__state = { loaded: false };

// ---------- layout (metres, Y up, street runs along Z) ----------
const FACADE_X = 8, SIDE_X = 5.5, ROAD_L = -3.5, PROM_X = -10, ZMIN = -110, ZMAX = 110;
const BOUND = { minX: -9.6, maxX: 7.7, minZ: -100, maxZ: 100 };
const CFG = isMobile ? { walkers: 14, standers: 5, vehicles: 5, shadow: 1024, dpr: Math.min(devicePixelRatio, 1.5) } : { walkers: 24, standers: 8, vehicles: 8, shadow: 2048, dpr: Math.min(devicePixelRatio, 2) };

// ---------- renderer / scene ----------
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' }); }
catch (e) { showError('This device/browser could not start WebGL, which the 3D street needs.\nTry an up-to-date Chrome or Safari, or open the live-video street: ?scene=live'); throw e; }
renderer.setPixelRatio(CFG.dpr); renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; $('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// sky dome
const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.55)), 1.0); }' }));
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(CFG.shadow, CFG.shadow);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2;
scene.add(sun, sun.target); scene.fog = new THREE.FogExp2(0xffffff, 0.012);

// ---------- canvas textures (generated, nothing downloaded) ----------
function canvasTex(w, h, draw, rep = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
const noise = (g, w, h, n, a, base) => { for (let i = 0; i < n; i++) { const v = Math.floor(base + (rnd() - 0.5) * a); g.fillStyle = `rgba(${v},${v},${v},${rnd() * 0.5})`; const s = rnd() * 6 + 1; g.fillRect(rnd() * w, rnd() * h, s, s); } };
const TEX = {
  wall: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h); noise(g, w, h, 2500, 60, 225);
    for (let i = 0; i < 14; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 2, rnd() * w, rnd() * h, 40 + rnd() * 60); gr.addColorStop(0, 'rgba(120,110,90,0.22)'); gr.addColorStop(1, 'rgba(120,110,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    const gd = g.createLinearGradient(0, h * 0.75, 0, h); gd.addColorStop(0, 'rgba(70,60,40,0)'); gd.addColorStop(1, 'rgba(70,60,40,0.35)'); g.fillStyle = gd; g.fillRect(0, 0, w, h); }),
  roof: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#a4553a'; g.fillRect(0, 0, w, h); const rows = 16, cols = 12;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = c * w / cols + (r % 2) * w / cols / 2, y = r * h / rows; const v = 140 + rnd() * 50;
      g.fillStyle = `rgb(${v + 20},${v * 0.48},${v * 0.32})`; g.beginPath(); g.ellipse(x, y + h / rows * 0.6, w / cols * 0.48, h / rows * 0.62, 0, 0, Math.PI); g.fill();
      if (rnd() < 0.12) { g.fillStyle = 'rgba(60,70,40,0.35)'; g.fillRect(x - 6, y, 12, 8); } }
    g.strokeStyle = 'rgba(40,20,10,0.35)'; for (let r = 0; r < rows; r++) { g.beginPath(); g.moveTo(0, r * h / rows); g.lineTo(w, r * h / rows); g.stroke(); } }),
  wood: canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.1})`; g.fillRect(x, 0, 2, h); }
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 3); } noise(g, w, h, 600, 40, 200); }),
  asphalt: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#77736d'; g.fillRect(0, 0, w, h); noise(g, w, h, 6000, 70, 115); }),
  tiles: canvasTex(256, 256, (g, w, h) => { const n = 8; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 170 + rnd() * 30; g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`; g.fillRect(i * w / n, j * h / n, w / n, h / n); }
    g.strokeStyle = 'rgba(60,55,50,0.6)'; g.lineWidth = 2; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w / n, 0); g.lineTo(i * w / n, h); g.moveTo(0, i * h / n); g.lineTo(w, i * h / n); g.stroke(); } noise(g, w, h, 1500, 50, 150); }),
  bricks: canvasTex(256, 256, (g, w, h) => { const rows = 16, cols = 8; for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) { const v = 150 + rnd() * 40;
      g.fillStyle = rnd() < 0.5 ? `rgb(${v},${v * 0.62},${v * 0.5})` : `rgb(${v * 0.9},${v * 0.86},${v * 0.8})`; g.fillRect(c * w / cols + (r % 2) * w / cols / 2 + 1, r * h / rows + 1, w / cols - 2, h / rows - 2); } noise(g, w, h, 1500, 50, 140); }),
  water: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#56786a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '230,240,230' : '30,50,45'},${0.08 + rnd() * 0.15})`; g.lineWidth = 1 + rnd() * 2; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16 + rnd() * 20, y); g.stroke(); } }),
  glow: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.3, 'rgba(255,170,90,0.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, false),
  blob: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, false),
};
const SIGNS = ['Phở Bò', 'Cà Phê', 'Bánh Mì', 'Lụa · Silk', 'Đèn Lồng', 'Cao Lầu', 'Tailor', 'Gallery', 'Mì Quảng', 'Trà Sữa', 'Souvenir', 'Hội An', 'Cơm Gà', 'Lanterns', 'Bánh Xèo', 'Nhà Cổ'];
const SIGN_COLS = 4, SIGN_ROWS = 4;
TEX.signs = canvasTex(1024, 512, (g, w, h) => { const cw = w / SIGN_COLS, ch = h / SIGN_ROWS; const bgs = ['#7a1d12', '#1c3f5f', '#2c4a2a', '#e8d7a8', '#4a2a14', '#f2f2ea'];
  SIGNS.forEach((s, i) => { const x = (i % SIGN_COLS) * cw, y = Math.floor(i / SIGN_COLS) * ch, bg = bgs[i % bgs.length]; g.fillStyle = bg; g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    g.strokeStyle = '#d9b44a'; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16); g.fillStyle = ['#e8d7a8', '#f2f2ea'].includes(bg) ? '#5a1a10' : '#f4d27a';
    g.font = `bold ${Math.floor(ch * 0.42)}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x + cw / 2, y + ch / 2 + 2, cw - 24); }); }, false);
for (const [k, s] of [['wall', 0.33], ['roof', 0.5], ['wood', 1], ['asphalt', 0.25], ['tiles', 0.3], ['bricks', 0.35], ['water', 0.08]]) TEX[k].userData.s = s;

// ---------- static geometry batching (merged per material, vertex-coloured) ----------
const BATCH = {}; const add = (key, geo, color) => { const g = geo.index ? geo.toNonIndexed() : geo; const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); (BATCH[key] ||= []).push(g); return g; };
const worldUV = (g, s) => { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
  if (nx > 0.5) uv.setXY(i, p.getZ(i) * s, p.getY(i) * s); else if (ny > 0.7) uv.setXY(i, p.getX(i) * s, p.getZ(i) * s); else uv.setXY(i, p.getX(i) * s, p.getY(i) * s); } return g; };
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
function box(key, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S1); g.applyMatrix4(M4);
  const tex = TEX[key]; add(key, tex?.userData.s ? worldUV(g.toNonIndexed(), tex.userData.s) : g, color); }
const colliders = { circles: [], boxes: [] };
const lanternPts = [], lanternCols = [];
const LCOL = [0xd8261f, 0xf2a31b, 0xe5541b, 0xc21b4a, 0x8e2fa8, 0xf4d03f, 0x2e8bc0, 0x1fa36b];
const doors = [];
function lantern(x, y, z, c) { lanternPts.push(new THREE.Vector3(x, y, z)); lanternCols.push(new THREE.Color(c ?? pickS(LCOL))); }

function shophouse(z0, z1) {
  const w = z1 - z0, zc = (z0 + z1) / 2, old = rnd() < 0.25, H1 = old ? RS(3.6, 4.0) : RS(3.3, 3.7), H2 = old ? 0 : RS(2.8, 3.2), H = H1 + H2, D = 10;
  const wall = rnd() < 0.86 ? pickS([0xf0bf45, 0xe9b23a, 0xf3c95c, 0xe2a83c, 0xf5d070, 0xeab64c]) : pickS([0xe9e4d6, 0xa9c4c9, 0xd9c3a0]);
  const woodC = pickS([0x6b4426, 0x5a3820, 0x7b5230, 0x2f6f73, 0x3b6b4a, 0x6b4426]), x = FACADE_X;
  box('wall', D, H, w - 0.02, x + D / 2, H / 2, zc, wall);
  box('wall', 0.36, H1, 0.36, x - 0.1, H1 / 2, z0 + 0.2, wall); box('wall', 0.36, H1, 0.36, x - 0.1, H1 / 2, z1 - 0.2, wall); // pillars
  box('dark', 0.05, H1 - 0.6, w - 0.8, x - 0.02, (H1 - 0.6) / 2, zc, 0x2a2018); // open shopfront
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) box('wood', 0.06, H1 - 0.7, 0.45, x - 0.08 - k * 0.04, (H1 - 0.7) / 2, zc + s * (w / 2 - 0.65 - k * 0.45), woodC, 0, s * k * 0.5, 0); // folded shutters
  box('wood', 0.12, 0.25, w - 0.5, x - 0.06, H1 - 0.5, zc, woodC); // lintel
  doors.push({ z: zc, w: w - 1.2 });
  if (rnd() < 0.8) { const i = Math.floor(rnd() * SIGNS.length), sw = Math.min(w - 1, RS(1.8, 2.6)), g = new THREE.PlaneGeometry(sw, sw / 2.2);
    const u0 = (i % SIGN_COLS) / SIGN_COLS, v0 = 1 - (Math.floor(i / SIGN_COLS) + 1) / SIGN_ROWS, uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / SIGN_COLS, v0 + uv.getY(k) / SIGN_ROWS);
    g.rotateY(-Math.PI / 2); g.translate(x - 0.14, H1 - 0.12 + (old ? 0 : 0.12), zc); add('signs', g, 0xffffff); }
  if (!old && rnd() < 0.65) { const ang = 0.38; box('roof', 1.5, 0.08, w + 0.1, x - 0.65, H1 + 0.15, zc, 0xffffff, 0, 0, ang); box('wood', 0.08, 0.08, w, x - 1.35, H1 - 0.15, zc, woodC); }
  if (!old) {
    const balcony = rnd() < 0.45;
    if (balcony) { box('wall', 1.1, 0.14, w - 0.1, x - 0.55, H1 + 0.05, zc, wall); const n = Math.max(3, Math.floor(w / 0.35));
      for (let k = 0; k <= n; k++) box('wood', 0.05, 0.9, 0.05, x - 1.05, H1 + 0.55, z0 + 0.1 + k * (w - 0.2) / n, woodC); box('wood', 0.08, 0.06, w - 0.1, x - 1.05, H1 + 1.0, zc, woodC);
      for (let k = 0; k < Math.floor(w / 1.2); k++) lantern(x - 1.1, H1 + 1.55 + RS(-0.1, 0.1), z0 + 0.6 + k * 1.2); }
    const nw = Math.max(2, Math.round(w / 2.2)); for (let k = 0; k < nw; k++) { const zz = z0 + (k + 0.5) * w / nw;
      box('dark', 0.04, 1.6, 0.95, x - 0.01, H1 + 1.35, zz, 0x1d1712); box('wood', 0.06, 1.6, 0.42, x - 0.05, H1 + 1.35, zz - 0.5, woodC, 0, 0.6, 0); box('wood', 0.06, 1.6, 0.42, x - 0.05, H1 + 1.35, zz + 0.5, woodC, 0, -0.6, 0); }
    box('wood', 0.25, 0.18, w, x - 0.12, H1 + 0.02, zc, woodC); }
  if (rnd() < 0.7) for (let k = 0; k < Math.floor(w / 1.6); k++) lantern(x - 1.2, H1 - 0.55 + RS(-0.08, 0.08), z0 + 0.8 + k * 1.6);
  const slope = old ? 0.5 : 0.42, run = 5.5, rl = run / Math.cos(slope); // pitched tiled roof, ridge parallel to the street
  box('roof', rl + 0.8, 0.14, w + 0.3, x + run / 2 - 0.35, H + Math.tan(slope) * run / 2 - 0.05, zc, 0xffffff, 0, 0, slope);
  box('roof', rl, 0.14, w + 0.3, x + run * 1.5, H + Math.tan(slope) * run / 2 - 0.05, zc, 0xdddddd, 0, 0, -slope);
  box('wall', 0.3, 0.3, w + 0.3, x + run, H + Math.tan(slope) * run, zc, 0x9a8f80);
  colliders.boxes.push({ x0: x - 0.3, x1: x + D, z0, z1 });
}
function buildWorld() {
  seed = 4242;
  for (let z = ZMIN; z < ZMAX;) { const w = RS(4, 7.2); shophouse(z, z + w); z += w + (rnd() < 0.08 ? 1.4 : 0); }
  const plane = (key, x0, x1, z0, z1, y, color) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); add(key, worldUV(g, TEX[key].userData.s), color); };
  plane('asphalt', ROAD_L, SIDE_X, ZMIN - 20, ZMAX + 20, 0, 0xffffff); plane('tiles', SIDE_X, FACADE_X + 0.5, ZMIN - 20, ZMAX + 20, 0.1, 0xffffff);
  plane('bricks', PROM_X, ROAD_L, ZMIN - 20, ZMAX + 20, 0.1, 0xffffff);
  box('wall', 0.25, 0.14, ZMAX - ZMIN + 40, SIDE_X, 0.05, 0, 0xb9b2a5); box('wall', 0.25, 0.14, ZMAX - ZMIN + 40, ROAD_L, 0.05, 0, 0xb9b2a5);
  for (let z = ZMIN; z < ZMAX; z += 6) box('paint', 0.12, 0.01, 3, 1.0, 0.012, z, 0xf2efe6);
  box('wall', 0.6, 1.5, ZMAX - ZMIN + 40, PROM_X - 0.3, -0.65, 0, 0x8d877c); box('wall', 0.7, 0.12, ZMAX - ZMIN + 40, PROM_X - 0.2, 0.12, 0, 0xc9c1b2);
  for (let z = ZMIN; z < ZMAX; z += 2.4) box('wall', 0.12, 0.6, 0.12, PROM_X + 0.2, 0.4, z, 0x3c4a3a); box('wall', 0.08, 0.06, ZMAX - ZMIN + 40, PROM_X + 0.2, 0.7, 0, 0x3c4a3a); // railing
  // promenade: shade trees, palms, lamp posts, vendors with umbrellas and goods
  const trunks = [], canopies = [], palms = [], leaves = [];
  for (let z = ZMIN + 4; z < ZMAX; z += RS(8, 12)) { const x = RS(-7.6, -6.2), h = RS(2.6, 3.6); trunks.push([x, z, h, RS(0.16, 0.24)]); colliders.circles.push({ x, z, r: 0.45 });
    for (let k = 0; k < 5; k++) canopies.push([x + RS(-1.6, 1.6), h + RS(0.6, 2.2), z + RS(-1.6, 1.6), RS(1.3, 2.2), RS(0, 1)]); }
  for (let z = ZMIN + 9; z < ZMAX; z += RS(12, 18)) { const x = RS(-9.4, -8.9), h = RS(6, 9), lean = RS(-0.08, 0.08); palms.push([x, z, h, lean]); colliders.circles.push({ x, z, r: 0.35 });
    for (let k = 0; k < 8; k++) leaves.push([x + Math.sin(lean) * h, h, z, k / 8 * Math.PI * 2 + RS(-0.2, 0.2), RS(0.35, 0.7)]); }
  for (let z = ZMIN + 2; z < ZMAX; z += 15) { box('metal', 0.1, 3.6, 0.1, -4.1, 1.8, z, 0x24302a); lantern(-4.1, 3.7, z, 0xf4d03f); colliders.circles.push({ x: -4.1, z, r: 0.2 }); }
  for (let z = ZMIN + 6; z < ZMAX; z += RS(10, 22)) { // vendor spot
    const x = RS(-8.4, -5.0); const uc = pickS([0xd8261f, 0x2e8bc0, 0xf2a31b, 0x3b8a4a, 0xe8e2d0]);
    const cone = new THREE.ConeGeometry(1.25, 0.5, 10, 1, true); cone.translate(x, 2.25, z); add('plastic', cone, uc); box('metal', 0.05, 2.1, 0.05, x, 1.05, z, 0xdddddd);
    box('plastic', 1.6, 0.04, 1.1, x, 0.13, z + 0.9, pickS([0x2f6db5, 0xd94a3a, 0x3a8a5a])); vendorSpots.push({ x: x + 0.1, z: z - 0.25, gx: x, gz: z + 0.9 });
    box('wood', 0.4, 0.38, 0.4, x + 0.1, 0.29, z - 0.3, 0x6b4a2a); colliders.circles.push({ x, z: z + 0.3, r: 1.0 }); }
  for (let z = ZMIN + 4; z < ZMAX; z += 12) { // lantern strings across the street
    const n = 11; for (let k = 0; k < n; k++) { const t = k / (n - 1), x = FACADE_X - 1.3 + (-4.1 - FACADE_X + 1.3) * t; lantern(x, 5.4 - Math.sin(t * Math.PI) * 0.7, z + RS(-0.1, 0.1)); } }
  // instanced vegetation
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 1 });
  const tI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 7).translate(0, 0.5, 0), barkMat, trunks.length);
  trunks.forEach(([x, z, h, r], i) => { tI.setMatrixAt(i, M4.compose(V.set(x, 0, z), Q.identity(), new THREE.Vector3(r, h + 1, r))); });
  const cI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, canopies.length);
  canopies.forEach(([x, y, z, s, c], i) => { cI.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(c, c * 2, 0)), new THREE.Vector3(s, s * 0.75, s))); cI.setColorAt(i, new THREE.Color().setHSL(0.24 + c * 0.08, 0.45, 0.22 + c * 0.1)); });
  const pI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.2, 1, 6).translate(0, 0.5, 0), barkMat, palms.length);
  palms.forEach(([x, z, h, l], i) => pI.setMatrixAt(i, M4.compose(V.set(x, 0, z), Q.setFromEuler(E.set(0, 0, l)), new THREE.Vector3(1, h, 1))));
  const leafG = new THREE.BoxGeometry(0.42, 0.03, 2.6).translate(0, 0, 1.3); const lI = new THREE.InstancedMesh(leafG, leafMat, leaves.length);
  leaves.forEach(([x, y, z, a, d], i) => { lI.setMatrixAt(i, M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(d, a, 0, 'YXZ')), S1)); lI.setColorAt(i, new THREE.Color().setHSL(0.27, 0.5, 0.25 + rnd() * 0.08)); });
  for (const m of [tI, cI, pI, lI]) { m.castShadow = true; m.receiveShadow = m !== lI; scene.add(m); }
  // river, boats, far bank
  const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 400).rotateX(-Math.PI / 2).translate(PROM_X - 130, -0.75, 0), new THREE.MeshStandardMaterial({ map: TEX.water, roughness: 0.25, metalness: 0.15 }));
  TEX.water.repeat.set(20, 30); scene.add(water); WORLD.water = water;
  for (let i = 0; i < 12; i++) { const b = boat(); b.position.set(RS(-14, -17) - (i % 3) * 3.2, -0.75, ZMIN + 10 + i * 17 + RS(-3, 3)); b.rotation.y = RS(-0.1, 0.1); scene.add(b); WORLD.boats.push(b); }
  box('farbank', 30, 3, 420, -150, 0.5, 0, 0x5e6b4a);
  for (let z = -200; z < 200; z += RS(5, 12)) box('farbank', RS(4, 9), RS(3, 8), RS(4, 10), RS(-140, -136), 2, z, pickS([0xd8c79a, 0xc9b27a, 0xe3d6b4, 0x9aa38a]));
  for (const [k, list] of Object.entries(BATCH)) { const tex = TEX[k]; const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex || null, roughness: k === 'metal' ? 0.5 : k === 'plastic' ? 0.6 : 0.9, side: k === 'plastic' || k === 'signs' ? THREE.DoubleSide : THREE.FrontSide });
    if (k === 'signs') { mat.emissiveMap = tex; mat.emissive = new THREE.Color(0x777777); }
    if (k === 'dark') { mat.emissive = new THREE.Color(0xffa040); mat.emissiveIntensity = 0; WORLD.interior = mat; }
    const mesh = new THREE.Mesh(mergeGeometries(list), mat); mesh.castShadow = !['asphalt', 'tiles', 'bricks', 'paint', 'farbank', 'signs'].includes(k); mesh.receiveShadow = true; scene.add(mesh); }
  const lg = new THREE.SphereGeometry(0.2, 7, 5).scale(1, 1.25, 1); const lmat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lI2 = new THREE.InstancedMesh(lg, lmat, lanternPts.length); lanternPts.forEach((p, i) => { lI2.setMatrixAt(i, M4.compose(p, Q.identity(), S1)); lI2.setColorAt(i, lanternCols[i]); }); scene.add(lI2); WORLD.lanternMat = lmat;
  const gp = new THREE.BufferGeometry().setFromPoints(lanternPts); const gm = new THREE.PointsMaterial({ map: TEX.glow, size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  scene.add(new THREE.Points(gp, gm)); WORLD.glow = gm;
}
const WORLD = { boats: [] }, vendorSpots = [];
function boat() { const s = new THREE.Shape(); const L = RS(8, 11), W = RS(2.0, 2.6); s.moveTo(-W / 2, -L / 2); s.lineTo(W / 2, -L / 2); s.lineTo(W / 2, L * 0.25); s.quadraticCurveTo(W / 2, L / 2, 0, L / 2 + 0.6); s.quadraticCurveTo(-W / 2, L / 2, -W / 2, L * 0.25); s.closePath();
  const hullC = pickS([0x2f5fa8, 0x2f8a6a, 0xb8322a, 0x3a6fb8, 0x1f7a7a]), parts = [];
  const hull = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: false }); hull.rotateX(Math.PI / 2); hull.translate(0, 0.9, 0); parts.push(add('_', hull, hullC));
  const stripe = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false }); stripe.rotateX(Math.PI / 2); stripe.scale(1.02, 1, 1.01); stripe.translate(0, 1.05, 0); parts.push(add('_', stripe, 0xf0ead8));
  const cab = new THREE.BoxGeometry(W * 0.8, 1.4, L * 0.45); cab.translate(0, 1.6, -L * 0.1); parts.push(add('_', cab, pickS([0xe9dcc0, 0xf2e3a8, 0xd9e6e0])));
  const roof = new THREE.BoxGeometry(W * 0.95, 0.12, L * 0.55); roof.translate(0, 2.35, -L * 0.1); parts.push(add('_', roof, hullC));
  delete BATCH['_']; const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })); m.castShadow = true;
  const grp = new THREE.Group(); grp.add(m); grp.userData.ph = rnd() * 6; return grp; }

// ---------- lighting presets ----------
let dusk = params.get('dusk') === '1';
function setLighting() {
  const L = dusk ? { top: 0x34477a, hor: 0xf2a070, fog: 0x9a8088, dens: 0.012, sun: 0xffb07a, si: 1.1, hs: 0x8090c0, hg: 0x5a4030, hi: 1.0, exp: 1.15, lan: 1, glow: 0.9, int: 0.9 }
    : { top: 0x5f9ad2, hor: 0xf3dcb8, fog: 0xe6d6bc, dens: 0.0105, sun: 0xffe2b5, si: 2.4, hs: 0xcfe0f2, hg: 0x8a7356, hi: 1.05, exp: 1.0, lan: 0.82, glow: 0, int: 0 };
  skyU.top.value.setHex(L.top); skyU.hor.value.setHex(L.hor); scene.fog.color.setHex(L.fog); scene.fog.density = L.dens; sun.color.setHex(L.sun); sun.intensity = L.si;
  hemi.color.setHex(L.hs); hemi.groundColor.setHex(L.hg); hemi.intensity = L.hi; renderer.toneMappingExposure = L.exp;
  if (WORLD.lanternMat) { WORLD.lanternMat.color.setScalar(L.lan); WORLD.glow.opacity = L.glow; WORLD.interior.emissiveIntensity = L.int; }
  WORLD.sunDir = dusk ? new THREE.Vector3(-40, 14, 30) : new THREE.Vector3(-30, 45, 22);
}

// ---------- characters ----------
const CH = { m: null, f: null, clips: {} };
const npcMatBase = new THREE.MeshStandardMaterial({ roughness: 0.75 });
function npcMaterial(look) { const m = npcMatBase.clone(); const u = { uSkin: { value: new THREE.Color(look.skin) }, uShirt: { value: new THREE.Color(look.shirt) }, uPants: { value: new THREE.Color(look.pants) },
    uShoe: { value: new THREE.Color(look.shoe) }, uSleeve: { value: look.sleeve }, uShort: { value: look.short }, uDress: { value: look.dress } };
  m.userData.u = u; m.customProgramCacheKey = () => 'npc';
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec3 bindPos; varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = bindPos;');
    sh.fragmentShader = 'varying vec3 vBind; uniform vec3 uSkin, uShirt, uPants, uShoe; uniform float uSleeve, uShort, uDress;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
      `float ax = abs(vBind.x), y = vBind.y; vec3 c = uShirt;
       if (y > 1.53) c = uSkin; else if (y < 0.085) c = uShoe;
       else if (y < 0.97 && ax < 0.32) c = (y < uShort) ? uSkin : (uDress > 0.5 && y > 0.45 ? uShirt : uPants);
       else if (ax > uSleeve) c = uSkin;
       vec4 diffuseColor = vec4(c, opacity);`); };
  return m; }
const SKIN = [0xf0cfb2, 0xe2b48f, 0xd29f78, 0xbf8a62, 0xa8744f, 0xe8c0a0];
const SHIRT = [0xf4f4f0, 0xd23b2f, 0x2f5fa8, 0xf2c94c, 0x3b8a5a, 0x1f1f24, 0xe58ab0, 0x7fb3d5, 0xa0522d, 0x8e44ad, 0xffffff, 0x59636e, 0xf08a4b, 0x9acd8a];
const PANTS = [0x22252c, 0x2f4a78, 0x3a3a3a, 0xc9b99a, 0x5a4636, 0x1a1a1a, 0x6b7a8f, 0xe9e4d6];
function randomLook(fem) { return { skin: pick(SKIN), shirt: pick(SHIRT), pants: pick(PANTS), shoe: pick([0x1a1a1a, 0x5a3a2a, 0xf0f0f0, 0x8a6a4a, 0xb03030]), sleeve: Math.random() < 0.6 ? R(0.4, 0.5) : R(0.62, 0.7),
  short: Math.random() < (fem ? 0.15 : 0.22) ? R(0.45, 0.6) : -1, dress: fem && Math.random() < 0.25 ? 1 : 0 }; }
const ACC = { nonla: new THREE.ConeGeometry(0.27, 0.19, 18, 1, true), helmet: new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairM: new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  bun: new THREE.SphereGeometry(0.06, 8, 6), cap: new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brim: new THREE.BoxGeometry(0.16, 0.015, 0.12) };
const accMat = (c, ds) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: ds ? THREE.DoubleSide : THREE.FrontSide });
const HAT_MAT = accMat(0xe2d3a2, true), HAIR = [0x141210, 0x1e1712, 0x2a1d14].map(c => accMat(c));
function makeChar(fem) {
  const src = fem ? CH.f : CH.m, root = skClone(src.scene); root.traverse(o => { if (o.isSkinnedMesh) o.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.5); }); const look = randomLook(fem), mat = npcMaterial(look); let mesh = null;
  root.traverse(o => { if (o.isSkinnedMesh) { o.material = mat; o.castShadow = true; mesh = o; } });
  root.updateMatrixWorld(true); const head = root.getObjectByName('Head');
  const acc = new THREE.Group(); head.add(acc); // keep accessories upright in the bind pose
  const hw = new THREE.Quaternion(); head.getWorldQuaternion(hw); acc.quaternion.copy(hw.invert()); acc.position.copy(head.worldToLocal(new THREE.Vector3(0, fem ? 1.69 : 1.7, 0.0)));
  const mixer = new THREE.AnimationMixer(root); const act = {}; for (const [k, c] of Object.entries(CH.clips)) act[k] = mixer.clipAction(c);
  const ch = { root, mesh, mat, mixer, act, acc, fem, look, cur: null, lodAcc: 0 }; dress(ch, 'walk'); return ch;
}
function dress(ch, role) { ch.acc.clear(); const fem = ch.fem, top = 0.11;
  const look = randomLook(fem); const u = ch.mat.userData.u; u.uSkin.value.setHex(look.skin); u.uShirt.value.setHex(look.shirt); u.uPants.value.setHex(look.pants); u.uShoe.value.setHex(look.shoe); u.uSleeve.value = look.sleeve; u.uShort.value = look.short; u.uDress.value = look.dress;
  const hair = new THREE.Mesh(ACC.hairM, pick(HAIR)); hair.position.set(0, 0.0, -0.01); hair.scale.set(1, 1.05, 1.08); ch.acc.add(hair);
  if (fem && Math.random() < 0.6) { const b = new THREE.Mesh(ACC.bun, hair.material); b.position.set(0, 0.03, -0.12); ch.acc.add(b); }
  const r = Math.random();
  if (role === 'rider' && r < 0.85) { const h = new THREE.Mesh(ACC.helmet, accMat(pick([0xf4f4f4, 0x111111, 0xd22d2d, 0x2b62c4, 0xf0c419, 0xe87ab0]))); h.position.y = 0.0; h.scale.set(1, 1.05, 1.12); ch.acc.add(h); }
  else if (r < (fem ? 0.38 : 0.2)) { const h = new THREE.Mesh(ACC.nonla, HAT_MAT); h.position.y = top + 0.04; h.castShadow = true; ch.acc.add(h); }
  else if (r < 0.32) { const c = accMat(pick(SHIRT)); const h = new THREE.Mesh(ACC.cap, c); h.position.y = 0.01; ch.acc.add(h); const b = new THREE.Mesh(ACC.brim, c); b.position.set(0, 0.02, 0.13); ch.acc.add(b); }
  const s = fem ? R(0.85, 0.92) : R(0.88, 0.97); ch.root.scale.setScalar(s); ch.scale = s; }
function play(ch, name, fade = 0.3, phase = true) { if (ch.cur === name) return; const a = ch.act[name]; a.reset(); a.enabled = true; a.setEffectiveWeight(1); if (phase) a.time = Math.random() * a.getClip().duration;
  a.timeScale = 1; if (ch.cur) a.crossFadeFrom(ch.act[ch.cur], fade, false); a.play(); ch.cur = name; }
let natWalk = 1.25; // natural ground speed of Walk_Loop for the 1.83 m mannequin (measured from the foot bone at load)
function measureWalk() { const c = makeChar(false); c.root.scale.setScalar(1); play(c, 'walk', 0, false); const foot = c.root.getObjectByName('foot_l'), dur = CH.clips.walk.duration, zs = [], ys = [];
  for (let i = 0; i <= 40; i++) { c.mixer.setTime(i / 40 * dur); c.root.updateMatrixWorld(true); const p = foot.getWorldPosition(new THREE.Vector3()); zs.push(p.z); ys.push(p.y); }
  const minY = Math.min(...ys); let d = 0, n = 0; for (let i = 1; i < zs.length; i++) if (ys[i] < minY + 0.04 && ys[i - 1] < minY + 0.04) { d += Math.abs(zs[i] - zs[i - 1]); n++; }
  if (n > 2) natWalk = clamp(d / (n / 40 * dur), 0.8, 2.0); }

// ---------- vehicles (built here: simple Vietnamese-style scooter & bicycle) ----------
const VEHC = [0xb5161b, 0xf1f1f1, 0x151515, 0x2756a8, 0x9aa1a8, 0x6d1a1a, 0x1f6b5a, 0xe2c044, 0xd8d0c0];
const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), chromeMat = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, roughness: 0.3, metalness: 0.8 }), seatMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
const vehMats = new Map(); const vm = (c) => { if (!vehMats.has(c)) vehMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1 })); return vehMats.get(c); };
const VG = { wheelS: new THREE.CylinderGeometry(0.26, 0.26, 0.11, 16).rotateZ(Math.PI / 2), wheelB: new THREE.TorusGeometry(0.33, 0.025, 6, 20).rotateY(Math.PI / 2), hub: new THREE.CylinderGeometry(0.12, 0.12, 0.13, 10).rotateZ(Math.PI / 2),
  body: new THREE.BoxGeometry(0.36, 0.36, 0.8), floor: new THREE.BoxGeometry(0.32, 0.07, 0.52), shield: new THREE.BoxGeometry(0.38, 0.62, 0.12), seat: new THREE.BoxGeometry(0.3, 0.1, 0.66), bar: new THREE.BoxGeometry(0.62, 0.04, 0.04),
  col: new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), light: new THREE.SphereGeometry(0.06, 8, 6), tube: new THREE.CylinderGeometry(0.02, 0.02, 1, 6), basket: new THREE.BoxGeometry(0.32, 0.22, 0.28) };
const mk = (g, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; return o; };
function scooter() { const g = new THREE.Group(), c = vm(pick(VEHC)), wheels = [];
  for (const z of [-0.6, 0.62]) { const w = mk(VG.wheelS, tireMat, 0, 0.26, z); w.add(mk(VG.hub, chromeMat, 0, 0, 0)); g.add(w); wheels.push(w); }
  g.add(mk(VG.body, c, 0, 0.52, -0.32), mk(VG.floor, c, 0, 0.32, 0.15), mk(VG.shield, c, 0, 0.62, 0.46, -0.25), mk(VG.seat, seatMat, 0, 0.75, -0.3), mk(VG.col, chromeMat, 0, 0.82, 0.55, -0.3), mk(VG.bar, c, 0, 1.03, 0.6), mk(VG.light, new THREE.MeshBasicMaterial({ color: 0xfff4cc }), 0, 0.95, 0.68));
  return { g, wheels, wr: 0.26, seatY: 0.8, seatZ: -0.22, len: 1.9 }; }
function bicycle() { const g = new THREE.Group(), c = vm(pick(VEHC)), wheels = [];
  for (const z of [-0.52, 0.52]) { const w = mk(VG.wheelB, tireMat, 0, 0.34, z); g.add(w); wheels.push(w); }
  const tube = (x0, y0, z0, x1, y1, z1) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), m = mk(VG.tube, c, 0, 0, 0); m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.y = a.distanceTo(b); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); g.add(m); };
  tube(0, 0.34, -0.52, 0, 0.75, -0.15); tube(0, 0.75, -0.15, 0, 0.36, 0.05); tube(0, 0.36, 0.05, 0, 0.34, -0.52); tube(0, 0.75, -0.15, 0, 0.8, 0.42); tube(0, 0.36, 0.05, 0, 0.8, 0.42); tube(0, 0.34, 0.52, 0, 0.95, 0.42);
  g.add(mk(VG.bar, chromeMat, 0, 0.98, 0.42), mk(VG.seat, seatMat, 0, 0.84, -0.2)); g.children.at(-1).scale.set(0.6, 0.8, 0.4); if (Math.random() < 0.5) g.add(mk(VG.basket, vm(0x8a6a3a), 0, 0.85, 0.6));
  return { g, wheels, wr: 0.34, seatY: 0.9, seatZ: -0.2, len: 1.7 }; }

// ---------- NPC system ----------
const npcs = [], vehicles = [], pool = { m: [], f: [] }; let spawnedTotal = 0;
const player = { x: -1.0, z: 0, yaw: 0, pitch: 0, third: false, speed: 0 };
function getChar(fem) { const p = pool[fem ? 'f' : 'm']; const c = p.pop() || makeChar(fem); scene.add(c.root); return c; }
function freeChar(c) { scene.remove(c.root); c.root.parent?.remove(c.root); c.cur = null; c.mixer.stopAllAction(); pool[c.fem ? 'f' : 'm'].push(c); }
const LANES = [[SIDE_X + 0.5, FACADE_X - 0.5], [PROM_X + 0.7, ROAD_L - 0.5]];
function spawnWalker(initial) {
  const fem = Math.random() < 0.5, ch = getChar(fem); dress(ch, 'walk'); const lane = Math.random() < 0.55 ? 0 : 1, [x0, x1] = LANES[lane], dir = Math.random() < 0.5 ? 1 : -1;
  const n = { type: 'walker', ch, lane, laneX: R(x0 + 0.2, x1 - 0.2), dir, base: R(0.95, 1.45), speed: 0, x: 0, z: 0, vx: 0, vz: 0, state: 'walk', door: null };
  const fromDoor = !initial && lane === 0 && Math.random() < 0.45;
  if (fromDoor) { const d = doors.filter(d => Math.abs(d.z - player.z) > 8 && Math.abs(d.z - player.z) < 45); if (!d.length) { freeChar(ch); return; } const dd = pick(d); n.x = FACADE_X + 0.4; n.z = dd.z + R(-dd.w / 3, dd.w / 3); n.state = 'exit'; }
  else { n.x = n.laneX; n.z = initial ? player.z + R(-55, 55) : player.z + (Math.random() < 0.5 ? 1 : -1) * R(48, 62); if (!initial) n.dir = Math.sign(player.z - n.z) * (Math.random() < 0.7 ? 1 : -1) || 1; }
  if (lane === 0 && Math.random() < 0.3) n.door = pick(doors.filter(d => (d.z - n.z) * n.dir > 5) || [null]);
  n.z = clamp(n.z, ZMIN + 3, ZMAX - 3); play(ch, Math.random() < 0.7 ? 'walk' : 'walk2'); ch.act.idle.play(); ch.act.idle.setEffectiveWeight(0); n.walkName = ch.cur;
  npcs.push(n); spawnedTotal++; }
function spawnStander(initial) {
  const fem = Math.random() < 0.55, ch = getChar(fem); dress(ch, 'walk'); let n;
  const vs = vendorSpots.filter(v => Math.abs(v.z - player.z) < 60 && Math.abs(v.z - player.z) > (initial ? 0 : 35) && !npcs.some(o => o.spot === v));
  if (Math.random() < 0.45 && vs.length) { const v = pick(vs); n = { type: 'stand', ch, x: v.x, z: v.z, heading: Math.atan2(v.gx - v.x, v.gz - v.z), spot: v, anim: 'sit', y: 0.42 }; }
  else { const d = doors.filter(d => Math.abs(d.z - player.z) < 60 && Math.abs(d.z - player.z) > (initial ? 0 : 30)); if (!d.length) { freeChar(ch); return; } const dd = pick(d);
    n = { type: 'stand', ch, x: FACADE_X - R(0.5, 1.2), z: dd.z + R(-dd.w / 3, dd.w / 3), heading: Math.PI / 2 + R(-0.6, 0.6), anim: pick(['talk', 'pick', 'idle', 'talk']), y: 0 }; }
  n.leaveAt = R(15, 70); n.age = 0; play(ch, n.anim); npcs.push(n); spawnedTotal++; }
function spawnVehicle(initial) {
  const bike = Math.random() < 0.25, v = bike ? bicycle() : scooter(), dir = Math.random() < 0.5 ? 1 : -1; // drive on the right: +Z traffic at x<1 when facing +Z
  const riders = []; const nR = bike ? 1 : Math.random() < 0.3 ? 2 : 1;
  for (let i = 0; i < nR; i++) { const ch = getChar(Math.random() < 0.45); dress(ch, bike && Math.random() < 0.6 ? 'walk' : 'rider'); play(ch, 'drive'); ch.root.position.set(0, 0, 0); v.g.add(ch.root); riders.push(ch);
    ch.mixer.update(0); ch.root.updateMatrixWorld(true); const pel = ch.root.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()); ch.root.position.set(0, v.seatY + 0.06 - pel.y, v.seatZ - i * 0.42 - (pel.z - 0)); }
  const laneX = (dir > 0 ? -1 : 1) * R(1.1, 2.3); const z = initial ? player.z + R(-60, 60) : player.z - dir * R(55, 75) * (Math.random() < 0.7 ? 1 : -1);
  const n = { type: 'veh', v, riders, dir, laneX, x: laneX, z: clamp(z, ZMIN, ZMAX), base: bike ? R(2.5, 4.2) : R(4.5, 8), speed: 0, bike };
  n.speed = n.base; v.g.rotation.y = dir > 0 ? 0 : Math.PI; scene.add(v.g); vehicles.push(n); spawnedTotal++; }
function despawn(n) { if (n.type === 'veh') { for (const c of n.riders) { n.v.g.remove(c.root); freeChar(c); } scene.remove(n.v.g); vehicles.splice(vehicles.indexOf(n), 1); } else { freeChar(n.ch); npcs.splice(npcs.indexOf(n), 1); } }
let spawnT = 0, vehT = 0;
function updateNPCs(dt, frame) {
  const walkers = npcs.filter(n => n.type === 'walker').length, standers = npcs.length - walkers;
  if ((spawnT -= dt) < 0 && walkers < CFG.walkers) { spawnWalker(false); spawnT = R(0.3, 1.6); }
  if (standers < CFG.standers && Math.random() < dt * 0.4) spawnStander(false);
  if ((vehT -= dt) < 0 && vehicles.length < CFG.vehicles) { spawnVehicle(false); vehT = R(0.8, 4); }
  const px = player.x, pz = player.z;
  for (const n of [...npcs]) {
    const ch = n.ch, dz0 = Math.abs(n.z - pz);
    if (n.type === 'stand') { n.age += dt; ch.root.position.set(n.x, n.y, n.z); ch.root.rotation.y = n.heading;
      if (n.age > n.leaveAt && !n.spot) { n.type = 'walker'; n.lane = 0; n.laneX = R(LANES[0][0] + 0.2, LANES[0][1] - 0.2); n.dir = Math.random() < 0.5 ? 1 : -1; n.base = R(0.95, 1.4); n.speed = 0; n.vx = n.vz = 0; n.state = 'walk';
        const w = Math.random() < 0.7 ? 'walk' : 'walk2'; play(ch, w, 0.5); ch.act.idle.play(); ch.act.idle.setEffectiveWeight(0); n.walkName = w; }
      else if (dz0 > 75) { despawn(n); continue; } }
    else {
      let tx = n.laneX - n.x, tz = n.dir * n.base; let want = n.base;
      if (n.state === 'exit') { tx = -1.2; tz = n.dir * 0.4; if (n.x < FACADE_X - 0.6) n.state = 'walk'; }
      if (n.state === 'enter') { tx = 1.0; tz = (n.door.z - n.z) * 0.8; if (n.x > FACADE_X + 0.5) { despawn(n); continue; } }
      else if (n.door && Math.abs(n.z - n.door.z) < 0.6) n.state = 'enter';
      const dxp = n.x - px, dzp = n.z - pz, dp = Math.hypot(dxp, dzp); // avoid the player
      if (dp < 2.2) { const ahead = (pz - n.z) * n.dir; tx += dxp / dp * (2.2 - dp) * 2.2; if (ahead > 0 && ahead < 1.6 && Math.abs(dxp) < 0.7) want *= 0.25; }
      for (const o of npcs) { if (o === n) continue; const ox = n.x - o.x, oz = n.z - o.z, d = ox * ox + oz * oz; if (d < 1.0 && d > 1e-4) { const k = (1 - Math.sqrt(d)) * 1.5; tx += ox * k * 2; tz += oz * k; if ((o.z - n.z) * n.dir > 0 && Math.abs(ox) < 0.5) want *= 0.6; } }
      n.speed += (want - n.speed) * Math.min(1, dt * 2); const sp = Math.hypot(tx, tz) || 1, vmag = n.state === 'walk' ? n.speed : 0.9;
      n.vx += ((tx / sp) * vmag * (n.state === 'walk' ? Math.min(1, Math.abs(tx) / 1.5 + Math.abs(tz) / sp) : 1) - n.vx) * Math.min(1, dt * 3); n.vz += (tz / sp * vmag - n.vz) * Math.min(1, dt * 3);
      n.x += n.vx * dt; n.z += n.vz * dt; if (n.state === 'walk') n.x = clamp(n.x, LANES[n.lane][0], LANES[n.lane][1]);
      for (const c of colliders.circles) { const ox = n.x - c.x, oz = n.z - c.z, d = Math.hypot(ox, oz); if (d < c.r + 0.25 && d > 1e-3) { n.x = c.x + ox / d * (c.r + 0.25); n.z = c.z + oz / d * (c.r + 0.25); } }
      const v = Math.hypot(n.vx, n.vz); if (v > 0.05) { const h = Math.atan2(n.vx, n.vz); let dh = h - ch.root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); ch.root.rotation.y += dh * Math.min(1, dt * 6); }
      ch.root.position.set(n.x, 0, n.z); const wk = ch.act[n.walkName], w = clamp(v / 0.4, 0, 1); wk.setEffectiveWeight(w); ch.act.idle.setEffectiveWeight(1 - w); wk.timeScale = Math.max(0.3, v / (natWalk * ch.scale));
      if (dz0 > 72 || n.z < ZMIN + 1 || n.z > ZMAX - 1) { despawn(n); continue; } }
    lod(ch, dt, Math.hypot(n.x - px, n.z - pz), frame);
  }
  for (const n of [...vehicles]) {
    let want = n.base; const ahead = (pz - n.z) * n.dir, lat = Math.abs(px - n.x);
    if (ahead > 0 && ahead < 14 && lat < 1.4) want = Math.min(want, Math.max(0, (ahead - 3) * 0.8));
    for (const o of vehicles) { if (o === n || o.dir !== n.dir) continue; const g = (o.z - n.z) * n.dir; if (g > 0 && g < 7 && Math.abs(o.x - n.x) < 1.0) want = Math.min(want, o.speed * (g < 3.5 ? 0.6 : 1)); }
    let tx = n.laneX; if (ahead > 0 && ahead < 16 && lat < 1.8) tx = n.laneX + Math.sign(n.x - px || 1) * 1.4; tx = clamp(tx, ROAD_L + 0.6, SIDE_X - 0.6);
    n.speed += (want - n.speed) * Math.min(1, dt * (want < n.speed ? 3 : 1)); const vx = (tx - n.x) * 0.9; n.x += vx * dt; n.z += n.dir * n.speed * dt;
    n.v.g.position.set(n.x, 0, n.z); n.v.g.rotation.y = (n.dir > 0 ? 0 : Math.PI) + vx * 0.08 * n.dir; n.v.g.rotation.z = -vx * 0.05 * n.dir;
    for (const w of n.v.wheels) w.rotation.x += n.speed * dt / n.v.wr;
    const d = Math.hypot(n.x - px, n.z - pz); for (const c of n.riders) lod(c, dt, d, frame);
    if (((n.z - pz) * n.dir > 80) || Math.abs(n.z - pz) > 90 || n.z < ZMIN - 5 || n.z > ZMAX + 5) despawn(n);
  }
}
function lod(ch, dt, d, frame) { ch.lodAcc += dt; const every = d < 18 ? 1 : d < 35 ? 2 : 4; ch.root.visible = d < 85; if (frame % every === 0 && ch.root.visible) { ch.mixer.update(ch.lodAcc); ch.lodAcc = 0; } ch.mesh.castShadow = d < (CFG.charShadow ?? (isMobile ? 12 : 18)); }

// ---------- player / input ----------
const keys = {}; addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyV') toggleThird(); }); addEventListener('keyup', e => keys[e.code] = false);
const joy = { x: 0, y: 0 }; const joyEl = $('joy'), knob = $('knob'); let joyId = null, lookId = null, lx = 0, ly = 0;
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); }); const endJoy = e => { if (e.pointerId === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) { const r = joyEl.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), m = Math.min(1, Math.hypot(dx, dy) / 50) / (Math.hypot(dx, dy) || 1);
  joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * 35}px,${joy.y * 35}px)`; }
const cv = renderer.domElement; cv.addEventListener('pointerdown', e => { if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); } });
cv.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; const k = isMobile ? 0.006 : 0.004; player.yaw -= (e.clientX - lx) * k; player.pitch = clamp(player.pitch - (e.clientY - ly) * k, -1.2, 1.2); lx = e.clientX; ly = e.clientY; });
const endLook = e => { if (e.pointerId === lookId) lookId = null; }; cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
let playerChar = null; function toggleThird() { player.third = !player.third; $('quality').textContent = player.third ? '1st person' : '3rd person'; if (playerChar) playerChar.root.visible = player.third; }
function resetPlayer() { Object.assign(player, { x: -1.0, z: 0, yaw: 0, pitch: 0 }); }
function updatePlayer(dt) {
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y, s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
  player.yaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.8; const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
  const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > 0.95, sp = (run ? 3.6 : 1.7) * Math.min(1, m);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw), vx = (f * sy - s * cy) * (run ? 3.6 : 1.7), vz = (f * cy + s * sy) * (run ? 3.6 : 1.7);
  let nx = player.x + vx * dt, nz = player.z + vz * dt; nx = clamp(nx, BOUND.minX, BOUND.maxX); nz = clamp(nz, BOUND.minZ, BOUND.maxZ);
  for (const c of colliders.circles) { const ox = nx - c.x, oz = nz - c.z, d = Math.hypot(ox, oz); if (d < c.r + 0.3 && d > 1e-4) { nx = c.x + ox / d * (c.r + 0.3); nz = c.z + oz / d * (c.r + 0.3); } }
  for (const b of colliders.boxes) if (nx > b.x0 - 0.3 && nz > b.z0 && nz < b.z1) nx = b.x0 - 0.3;
  for (const n of npcs) { const ox = nx - n.x, oz = nz - n.z, d = Math.hypot(ox, oz); if (d < 0.55 && d > 1e-4) { nx = n.x + ox / d * 0.55; nz = n.z + oz / d * 0.55; } }
  player.speed = Math.hypot(nx - player.x, nz - player.z) / Math.max(dt, 1e-4); player.x = nx; player.z = nz;
  const eye = 1.62; if (!player.third) { camera.position.set(player.x, eye, player.z); }
  else { const d = 3.2; let cx = player.x - sy * d * Math.cos(player.pitch * 0.5), cz = player.z - cy * d; cx = clamp(cx, BOUND.minX - 0.3, FACADE_X - 0.4); camera.position.set(cx, 2.1 + Math.sin(-player.pitch) * 1.5, cz); }
  camera.rotation.set(player.pitch, player.yaw + Math.PI, 0, 'YXZ'); camera.rotation.x = -player.pitch * -1;
  camera.quaternion.setFromEuler(E.set(player.pitch, player.yaw + Math.PI, 0, 'YXZ')); // three cameras look down -Z
  if (playerChar) { playerChar.root.position.set(player.x, 0, player.z); playerChar.root.rotation.y = player.yaw; const want = player.speed > 2.5 ? 'jog' : player.speed > 0.2 ? 'walk' : 'idle'; play(playerChar, want, 0.25, false);
    playerChar.act[want].timeScale = want === 'walk' ? Math.max(0.5, player.speed / (natWalk * playerChar.scale)) : 1; if (player.third) playerChar.mixer.update(dt); }
}

// ---------- boot ----------
const fpsBuf = []; let frame = 0, last = performance.now(), qLevel = 0, nextQ = params.get('q') === 'fixed' ? 0 : performance.now() + 5000;
window.__test = { setJoy: (x, y) => { joy.x = x; joy.y = y; }, pose: () => ({ x: +player.x.toFixed(2), z: +player.z.toFixed(2), yaw: +player.yaw.toFixed(3), pitch: +player.pitch.toFixed(3) }), setYaw: (y) => { player.yaw = y; }, setPos: (x, z) => { player.x = x; player.z = z; }, capture: () => renderer.domElement.toDataURL('image/png') };
window.__game = { CH, stats: () => ({ fps: fpsBuf.length ? +(fpsBuf.length / ((fpsBuf.at(-1) - fpsBuf[0]) / 1000 || 1)).toFixed(1) : 0, walkers: npcs.filter(n => n.type === 'walker').length, standers: npcs.filter(n => n.type === 'stand').length, vehicles: vehicles.length, spawned: spawnedTotal,
  calls: renderer.info.render.calls, q: qLevel, dpr: renderer.getPixelRatio(), tris: renderer.info.render.triangles, dusk }), npcs: () => npcs.map(n => ({ type: n.type, x: +n.x.toFixed(2), z: +n.z.toFixed(2), anim: n.ch.cur, look: n.ch.mat.userData.u.uShirt.value.getHexString() })).concat(vehicles.map(v => ({ type: v.bike ? 'bike' : 'scooter', x: +v.x.toFixed(2), z: +v.z.toFixed(2), speed: +v.speed.toFixed(2) }))) };
(async () => {
  try {
    $('badge').innerHTML = '<b>Hội An riverside street: 3D game world (prototype).</b> Walk freely; everything is real-time 3D, modelled after Bạch Đằng St. by the Thu Bồn river. Characters: CC0 Quaternius mannequins. <a href="CREDITS.md" target="_blank">Credits</a>';
    $('hint').textContent = isMobile ? 'Joystick to walk (push fully to jog) · drag to look' : 'WASD / arrows to walk · Shift to jog · drag to look · V = 3rd person';
    $('turnL').hidden = $('turnR').hidden = true; $('quality').textContent = '3rd person'; $('quality').onclick = toggleThird; $('reset').onclick = resetPlayer;
    $('scene').textContent = '360° real spots ▸'; $('scene').onclick = () => { location.search = ''; };
    const db = document.createElement('button'); db.id = 'dusk'; db.textContent = dusk ? 'Day' : 'Dusk'; db.onclick = () => { dusk = !dusk; db.textContent = dusk ? 'Day' : 'Dusk'; setLighting(); }; $('buttons').insertBefore(db, $('scene'));
    $('loadmsg').textContent = 'Building the street…'; await new Promise(r => setTimeout(r, 30));
    buildWorld(); setLighting(); $('fill').style.width = '25%';
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); let got = {}; const prog = () => { const t = (got.m || 0) + (got.f || 0); $('fill').style.width = (25 + 70 * Math.min(1, t / 450e3)) + '%'; $('loaddetail').textContent = `characters ${(t / 1e6).toFixed(2)} MB`; };
    $('loadmsg').textContent = 'Loading characters…';
    const ld = (url, k) => new Promise((res, rej) => loader.load(url, res, e => { got[k] = e.loaded; prog(); }, () => rej(new Error('Could not download ' + url))));
    const [gm, gf] = await Promise.all([ld('assets/game/char_m.glb', 'm'), ld('assets/game/char_f.glb', 'f')]); CH.m = gm; CH.f = gf;
    for (const [g, H] of [[gm, 1.829], [gf, 1.808]]) { const ms = []; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isSkinnedMesh) ms.push(o); });
      const bb = new THREE.Box3(), v = new THREE.Vector3(), raw = ms.map(o => { const p = o.geometry.attributes.position, a = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.bindMatrix); bb.expandByPoint(v); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; } return a; });
      const ext = bb.getSize(new THREE.Vector3()).toArray(), mn = bb.min.toArray(), mid = bb.getCenter(new THREE.Vector3()).toArray();
      const hd = g.scene.getObjectByName('Head').getWorldPosition(new THREE.Vector3()).toArray().map((v, i) => v - mid[i]); // head bone tells which axis is up
      const up = [0, 1, 2].sort((p, q) => Math.abs(hd[q]) - Math.abs(hd[p]))[0], flip = hd[up] < 0, [ax, az] = [0, 1, 2].filter(i => i !== up).sort((p, q) => ext[q] - ext[p]), k = H / ext[up];
      ms.forEach((o, j) => { const a = raw[j], b = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { b[i] = (a[i + ax] - mid[ax]) * k; b[i + 1] = flip ? (bb.max.getComponent(up) - a[i + up]) * k : (a[i + up] - mn[up]) * k; b[i + 2] = (a[i + az] - mid[az]) * k; }
        o.geometry.setAttribute('bindPos', new THREE.BufferAttribute(b, 3)); }); }
    const C = (n) => { const c = gm.animations.find(a => a.name === n); if (!c) throw new Error('missing animation ' + n); return c; };
    CH.clips = { walk: C('Walk_Loop'), walk2: C('Walk_Formal_Loop'), idle: C('Idle_Loop'), talk: C('Idle_Talking_Loop'), pick: C('PickUp_Table'), sit: C('Sitting_Idle_Loop'), drive: C('Driving_Loop'), jog: C('Jog_Fwd_Loop') };
    measureWalk(); $('loadmsg').textContent = 'Populating the street…';
    playerChar = makeChar(false); dress(playerChar, 'walk'); scene.add(playerChar.root); playerChar.root.visible = false;
    for (let i = 0; i < CFG.walkers; i++) spawnWalker(true); for (let i = 0; i < CFG.standers; i++) spawnStander(true); for (let i = 0; i < CFG.vehicles; i++) spawnVehicle(true);
    if (params.get('lineup')) { npcs.splice(0).forEach(n => freeChar(n.ch)); for (let i = 0; i < 6; i++) { const c = getChar(i % 2 === 1); dress(c, i === 4 ? 'rider' : 'walk'); play(c, 'idle'); c.root.position.set(-2.5 + i, 0, 3.2); c.root.rotation.y = Math.PI; npcs.push({ type: 'stand', ch: c, x: -2.5 + i, z: 3.2, heading: Math.PI, y: 0, age: 0, leaveAt: 1e9, spot: 1 }); } CFG.walkers = CFG.standers = 0; }
    $('fill').style.width = '100%'; $('loader').hidden = true; window.__state.loaded = true;
  } catch (e) { showError('The 3D street could not load: ' + e.message + '\nCheck your connection and reload, or try the live-video street: ?scene=live'); return; }
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; frame++; fpsBuf.push(now); while (fpsBuf.length > 2 && now - fpsBuf[0] > 2000) fpsBuf.shift();
    updatePlayer(dt); updateNPCs(dt, frame);
    if (now > nextQ && nextQ) { const f = window.__game.stats().fps; nextQ = now + 4000; // adaptive quality: step down until ~28 fps
      if (f < 26 && qLevel < 2) { qLevel++; if (qLevel === 1) renderer.setPixelRatio(Math.min(CFG.dpr, 1)); if (qLevel === 2) { sun.shadow.mapSize.set(512, 512); sun.shadow.map?.dispose(); sun.shadow.map = null; CFG.charShadow = 0; } console.log('[quality] step', qLevel, 'fps', f); } }
    const t = now / 1000; for (const b of WORLD.boats) { b.position.y = -0.75 + Math.sin(t * 0.8 + b.userData.ph) * 0.05; b.rotation.z = Math.sin(t * 0.6 + b.userData.ph) * 0.02; } TEX.water.offset.set(t * 0.004, t * 0.006);
    sun.position.set(player.x, 0, player.z).add(WORLD.sunDir); sun.target.position.set(player.x - 4, 0, player.z); sky.position.set(player.x, 0, player.z);
    renderer.render(scene, camera);
  });
})();
