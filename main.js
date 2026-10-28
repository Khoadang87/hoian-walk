import * as THREE from 'three';
import * as GS from '@mkkellogg/gaussian-splats-3d';
import { StreetWalk } from './walk.js';
import { PhotoWalk } from './photowalk.js';
import { VideoWalk } from './videowalk.js';

// ---------- config ----------
const isMobile = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const params = new URLSearchParams(location.search);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const SCENES = {
  live: { label: 'Hội An LIVE street walk', manifest: 'assets/hoian_live/live.json', renderer: 'video', fov: 75,
    bounds: { minX: -1.5, maxX: 1.5, minZ: 0, maxZ: 1 }, eyeY: 0, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, speed: 1.6,
    badge: '<b>Hội An Old Town riverside street: LIVE 360° video you walk yourself (test).</b> Walk forward/back to move through the real video; stop and the street keeps moving. From a 360° YouTube walk, © video owner, published with the owner\'s approval.' },
  corner: { label: 'Hội An LIVE corner', manifest: 'assets/hoian_live/live.json', renderer: 'video', loop: true, fov: 75,
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, eyeY: 0, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, speed: 0,
    badge: '<b>Hội An, Tran Phu St. corner: LIVE 360° (test).</b> Stand on the corner and look around while the street goes by (seamless loop of a tripod 360° video; in-between frames interpolated from a 6 fps source). © video owner.' },
  walk: { label: 'Hội An street walk (private test)', manifest: 'assets/hoian_walk3/nodes.json', renderer: 'walk', fov: 75,
    // corridor: z = metres along the street (set from the manifest), x = ±1.5 m sideways. Eye at the 360° camera height.
    bounds: { minX: -1.5, maxX: 1.5, minZ: 0, maxZ: 1 }, eyeY: 0, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, speed: 1.6,
    badge: '<b>Hội An Old Town riverside street (Bach Dang St. area): walk it yourself (test).</b> Approximation built from a 360° YouTube walk + AI depth: not a true scan. © video owner; published with the owner\'s approval, still copyrighted.' },
  truck: { label: 'Truck (Tanks and Temples), real multi-view splat', assets: { mobile: 'assets/truck_mobile.splat', desktop: 'assets/truck_desktop.splat' },
    // COLMAP frame, -Y up. Box fitted to the captured lot around the truck.
    bounds: { minX: -9, maxX: 9, minZ: -9, maxZ: 9 }, eyeY: -0.2, start: { x: 0, z: 7.5, yaw: Math.PI, pitch: 0.05 }, speed: 2.5,
    badge: 'Real capture: <b>“Truck” scene, Tanks and Temples</b> (multi-view photos → 3D Gaussian splat). Not Hội An.' },
  hoian: { label: 'Hội An 360° corner (private test)', assets: { mobile: 'assets/hoian_pano360.splat', desktop: 'assets/hoian_pano360.splat' },
    // ONE 360° YouTube frame (Tran Phu St.) + AI depth per tile -> surround point cloud. 0.25 unit = 1 m approx.
    bounds: { minX: -0.3, maxX: 0.3, minZ: -0.3, maxZ: 0.3 }, eyeY: 0, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, speed: 0.3, renderer: 'points', fov: 75,
    badge: '<b>Hội An Old Town, Tran Phu St. corner: 360° PRIVATE TEST.</b> APPROXIMATION from 1 YouTube 360° frame + AI depth, not a true scan. Look all around, walk about ±1 m. © video owner, not for redistribution.' },
  hoian1: { label: 'Hội An corner (private test, depth approximation)', assets: { mobile: 'assets/hoian_corner_depth.splat', desktop: 'assets/hoian_corner_depth.splat' },
    // Built from ONE YouTube frame + monocular depth. Camera of that frame = origin, looking +Z, -Y up (metres, approx).
    // Small box: beyond it the single-view holes become obvious.
    bounds: { minX: -0.4, maxX: 0.4, minZ: -0.25, maxZ: 1.0 }, eyeY: 0, start: { x: 0, z: 0, yaw: 0, pitch: 0 }, speed: 0.4, renderer: 'points', fov: 50, // data stored at 1/4 scale: 0.25 unit = 1 m (approx)
    badge: '<b>Hội An Old Town street corner, PRIVATE TEST.</b> APPROXIMATION from 1 YouTube frame + AI depth, not a true 3D scan. © video owner, not for redistribution.' },
};
let sceneKey = SCENES[params.get('scene')] ? params.get('scene') : 'live';
if (sceneKey === 'truck' && isIOS) sceneKey = 'live'; // the splat viewer hits a WASM shared-memory error on iOS: hidden there
const NEXT = isIOS ? { live: 'corner', corner: 'walk', walk: 'live', hoian: 'hoian1', hoian1: 'live' } : { live: 'corner', corner: 'walk', walk: 'truck', truck: 'live', hoian: 'hoian1', hoian1: 'truck' };
const SC = SCENES[sceneKey];
let quality = params.get('q') || (isMobile ? 'mobile' : 'desktop');
const ASSET_URL = SC.assets ? (params.get('src') || SC.assets[quality] || SC.assets.mobile) : null;
const UP = new THREE.Vector3(0, -1, 0);
const BOUNDS = SC.bounds, EYE_Y = SC.eyeY, START = SC.start, SPEED = SC.speed;
const $ = (id) => document.getElementById(id);
const showError = (msg) => { $('loader').hidden = true; const e = $('error'); e.hidden = false; e.textContent = msg; console.error('[viewer-error]', msg); window.__viewerError = msg; };
window.__state = { loaded: false };

// ---------- WebGL2 check ----------
const testCanvas = document.createElement('canvas');
if (!testCanvas.getContext('webgl2')) {
  showError('This device/browser does not support WebGL2, which is required to render Gaussian splats.\nTry an up-to-date Chrome, Safari (iOS 15+) or Firefox, or enable hardware acceleration.');
  throw new Error('no webgl2');
}

// ---------- renderer / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: params.has('test'), powerPreference: 'high-performance' });
const dprCap = isMobile ? 1.25 : 1.75;
renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
renderer.setSize(innerWidth, innerHeight);
$('app').appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('The GPU context was lost (often out of GPU memory on phones). Reload, or open with ?q=mobile for the lighter scene.'); });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(SC.fov || 70, innerWidth / innerHeight, 0.05, 500);
camera.up.copy(UP);
const pos = new THREE.Vector3();
let yaw, pitch;
function reset() { pos.set(START.x, EYE_Y, START.z); yaw = START.yaw; pitch = START.pitch; }
reset();
$('reset').onclick = reset;
$('quality').textContent = quality === 'desktop' ? 'Lighter scene' : 'Sharper scene';
document.getElementById('badge').innerHTML = SC.badge + ' <a href="CREDITS.md" target="_blank">Credits</a>';
if (SC.renderer === 'walk' || SC.renderer === 'video') document.getElementById('badge').appendChild(document.getElementById('streetbar'));
$('scene').textContent = 'Scene: ' + { live: 'Hội An LIVE walk', corner: 'Hội An LIVE corner', walk: 'Hội An photo walk', hoian: 'Hội An 360° corner', hoian1: 'Hội An photo', truck: 'Truck' }[NEXT[sceneKey]];
$('scene').onclick = () => { params.set('scene', NEXT[sceneKey]); location.search = params.toString(); };
if (SC.renderer === 'walk' || SC.renderer === 'video') $('quality').hidden = true;
$('quality').onclick = () => { params.set('q', quality === 'desktop' ? 'mobile' : 'desktop'); location.search = params.toString(); };

function applyCamera() {
  // yaw about the up axis, pitch about local right. With -Y up, build the forward vector explicitly.
  const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(pos);
  camera.lookAt(pos.clone().add(fwd));
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'KeyR') reset(); });
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let turnHeld = 0;
for (const [id, v] of [['turnL', -1], ['turnR', 1]]) {
  const b = $(id); b.addEventListener('pointerdown', (e) => { turnHeld = v; b.setPointerCapture(e.pointerId); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { if (turnHeld === v) turnHeld = 0; });
}
const joy = { x: 0, y: 0, id: null };
const joyEl = $('joy'), knob = $('knob');
function joyMove(e) { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy), max = r.width / 2; if (m > max) { dx *= max / m; dy *= max / m; } joy.x = dx / max; joy.y = dy / max; knob.style.transform = `translate(${dx}px,${dy}px)`; }
joyEl.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.stopPropagation(); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
let look = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { look = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!look || e.pointerId !== look.id) return; const k = 0.005; yaw -= (e.clientX - look.x) * k; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - look.y) * k, -1.2, 1.2); look.x = e.clientX; look.y = e.clientY; });
const lookEnd = (e) => { if (look && e.pointerId === look.id) look = null; };
cv.addEventListener('pointerup', lookEnd); cv.addEventListener('pointercancel', lookEnd);
window.__test = { setJoy: (x, y) => { joy.x = x; joy.y = y; }, pose: () => ({ node: window.__state.node, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) }), setYaw: (y) => { yaw = y; }, setPos: (x, z) => { pos.x = x; pos.z = z; }, capture: () => renderer.domElement.toDataURL('image/png') };

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- loading with byte progress + clear errors ----------
async function fetchWithProgress(url) {
  let res;
  try { res = await fetch(url); }
  catch (e) { throw new Error(`Network/CORS error fetching the scene:\n${url}\n\nThe server may be offline, or a remote host is not sending Access-Control-Allow-Origin. Serve the files from this folder (see README) or use a CORS-enabled URL.\n(${e.message})`); }
  if (!res.ok) throw new Error(`Scene download failed: HTTP ${res.status} ${res.statusText}\n${url}\nPlease reload in a moment.`);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    chunks.push(value); got += value.length;
    const mb = (got / 1048576).toFixed(1), tmb = total ? (total / 1048576).toFixed(1) : '?';
    const pct = total ? Math.round(100 * got / total) : 0;
    $('fill').style.width = (total ? pct : 50) + '%';
    $('loadmsg').textContent = `Downloading scene… ${total ? pct + '%' : ''}`;
    $('loaddetail').textContent = `${mb} MB / ${tmb} MB  (${quality} quality)`;
  }
  return new Blob(chunks);
}

const splats = SC.renderer !== undefined ? null : new GS.DropInViewer({ sharedMemoryForWorkers: false, gpuAcceleratedSort: false, integerBasedSort: false, halfPrecisionCovariancesOnGPU: true, sphericalHarmonicsDegree: 0, splatRenderMode: GS.SplatRenderMode.ThreeD });
if (splats) scene.add(splats);

// Point renderer for the depth-approximation scene (reads the same 32-byte .splat records).
// The splat library culled the far half of this single-view cloud in testing, so we draw it as sized points.
function buildPoints(buf) {
  const n = buf.byteLength / 32, f = new Float32Array(buf), u = new Uint8Array(buf);
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3), S = new Float32Array(n);
  for (let i = 0; i < n; i++) { P.set(f.subarray(i * 8, i * 8 + 3), i * 3); S[i] = f[i * 8 + 3]; for (let k = 0; k < 3; k++) C[i * 3 + k] = u[i * 32 + 24 + k] / 255; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('size', new THREE.BufferAttribute(S, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { focal: { value: 1 } }, vertexShader: `attribute float size; varying vec3 vC; uniform float focal;
    void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(2.6 * size * focal / -mv.z, 1.0, 64.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(vC,1.0); }`, vertexColors: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  pts.onBeforeRender = (r, sc, cam) => { m.uniforms.focal.value = (r.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); };
  return pts;
}

let walk = null;
async function loadWalk() {
  const WalkClass = params.get('render') === 'points' ? StreetWalk : PhotoWalk; // ?render=points = previous point-cloud version
  if (WalkClass === StreetWalk) SC.manifest = 'assets/hoian_walk/nodes.json';
  if (params.get('render') === 'mesh') SC.manifest = 'assets/hoian_walk2/nodes.json'; // previous depth-mesh version
  let man; try { const r = await fetch(SC.manifest); if (!r.ok) throw new Error('HTTP ' + r.status); man = await r.json(); }
  catch (e) { throw new Error(`Could not load the street manifest ${SC.manifest} (${e.message}).\nCheck your connection and reload.`); }
  BOUNDS.maxZ = man.nodes[man.nodes.length - 1].z;
  walk = new WalkClass({ base: SC.manifest.replace(/[^/]*$/, ''), manifest: man, scene, isMobile,
    onProgress: (got, total, i) => { const pct = total ? Math.round(100 * got / total) : 0; $('fill').style.width = pct + '%'; $('loadmsg').textContent = `Loading street view ${i + 1}/${man.nodes.length}… ${pct}%`; $('loaddetail').textContent = `${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB · ${man.nodes.length} views along ${man.length.toFixed(0)} m`; },
    onError: (e) => { if (!window.__state.loaded) return; $('nodestatus').textContent = '⚠ ' + e.message.split('\n')[0]; } });
  await walk.fetchNode(0, true); await walk.fetchNode(1, true);
  $('streetbar').hidden = false; window.__walk = walk; window.__walkLen = man.length;
}

let vw = null;
async function loadVideo() {
  let man; try { const r = await fetch(SC.manifest); if (!r.ok) throw new Error('HTTP ' + r.status); man = await r.json(); }
  catch (e) { throw new Error(`Could not load the street manifest ${SC.manifest} (${e.message}).\nCheck your connection and reload.`); }
  const base = SC.manifest.replace(/[^/]*$/, ''), tag = params.get('tex') || (isMobile ? '2k' : '4k');
  const src = base + (SC.loop ? man.corner.video : man.video[tag] || man.video['2k']);
  if (!SC.loop) BOUNDS.maxZ = man.nodes[man.nodes.length - 1].z;
  vw = new VideoWalk(SC.loop ? { src, manifest: null, mode: 'loop', loop: [0.5, 29], fade: 1.0 } : { src, manifest: man });
  $('loadmsg').textContent = 'Buffering street video…';
  const ok = await vw.load((f, mb) => { $('fill').style.width = Math.round(100 * f) + '%'; $('loadmsg').textContent = `Buffering street video… ${Math.round(100 * f)}%`; $('loaddetail').textContent = `${mb.toFixed(0)} MB video (${tag}${SC.loop ? '' : ', streams while you walk'}) · ${SC.loop ? '360° corner' : man.length.toFixed(0) + ' m street'}`; });
  if (!SC.loop) $('streetbar').hidden = false;
  window.__video = vw; window.__walkLen = man.length;
  if (!ok) { const t = $('tapstart'); t.hidden = false; t.onclick = async () => { if (await vw.start()) t.hidden = true; }; }
}

(async () => {
  try {
    if (SC.renderer === 'video') { await loadVideo(); $('loader').hidden = true; window.__state.loaded = true; return; }
    if (SC.renderer === 'walk') { await loadWalk(); $('loader').hidden = true; window.__state.loaded = true; return; }
    const blob = await fetchWithProgress(ASSET_URL);
    $('loadmsg').textContent = 'Processing splats…'; $('fill').style.width = '100%';
    const url = URL.createObjectURL(blob);
    try {
      if (SC.renderer === 'points') { scene.add(buildPoints(await blob.arrayBuffer())); } else
      await splats.addSplatScene(url, { format: GS.SceneFormat.Splat, showLoadingUI: false, progressiveLoad: false, splatAlphaRemovalThreshold: 8 });
    } catch (e) {
      const oom = /memory|allocation|RangeError/i.test(String(e) + (e && e.name));
      throw new Error(oom ? `Ran out of memory while preparing ${(blob.size / 1048576).toFixed(0)} MB of splats. Try ?q=mobile (lighter scene) or close other tabs.\n(${e})` : `Could not parse the scene file: ${e}`);
    }
    $('loader').hidden = true; window.__state.loaded = true;
  } catch (e) { showError(e.message || String(e)); }
})();

// ---------- loop ----------
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.25); last = now;
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('KeyA')) s -= 1;
  f -= joy.y; s += joy.x;
  // full 360° turning: Q/E, ←/→, or hold the on-screen Turn buttons (yaw + = turn right)
  const turn = (keys.has('KeyE') || keys.has('ArrowRight') || turnHeld === 1 ? 1 : 0) - (keys.has('KeyQ') || keys.has('ArrowLeft') || turnHeld === -1 ? 1 : 0);
  yaw = (yaw + turn * 1.6 * dt + Math.PI * 2) % (Math.PI * 2);
  // ground-plane movement (forward ignores pitch). screen-right = (cos yaw, 0, -sin yaw) (verified with a test grid)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  pos.x += (fx * f + rx * s) * SPEED * dt;
  pos.z += (fz * f + rz * s) * SPEED * dt;
  pos.x = THREE.MathUtils.clamp(pos.x, BOUNDS.minX, BOUNDS.maxX);
  pos.z = THREE.MathUtils.clamp(pos.z, BOUNDS.minZ, BOUNDS.maxZ);
  pos.y = EYE_Y;
  if (vw) {
    const ni = vw.update(pos.z, dt); window.__state.node = ni;
    if (!SC.loop) { $('sfill').style.width = (100 * pos.z / BOUNDS.maxZ).toFixed(1) + '%'; $('slabel').textContent = `${pos.z.toFixed(1)} m / ${BOUNDS.maxZ.toFixed(0)} m · video ${vw.currentTime.toFixed(1)} s`; }
  }
  if (walk) {
    const ni = walk.update(pos.z);
    $('sfill').style.width = (100 * pos.z / BOUNDS.maxZ).toFixed(1) + '%';
    $('slabel').textContent = `${pos.z.toFixed(1)} m / ${BOUNDS.maxZ.toFixed(0)} m · view ${ni + 1}/${walk.nodes.length}` + (walk.loadingNeeded ? ' · loading…' : '');
    window.__state.node = ni; if (!walk.loadingNeeded && $('nodestatus').textContent) $('nodestatus').textContent = '';
  }
  applyCamera();
  if (vw && window.__state.loaded) vw.render(renderer, camera); else if (walk?.render) walk.render(renderer, camera); else renderer.render(scene, camera);
});
