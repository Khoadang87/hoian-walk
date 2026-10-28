// Continuous controller-driven walk through real 360° walking footage of Hội An.
// Video time = position along the route. Forward = forward copy at a variable rate; backward = a pre-reversed copy.
// Standing still keeps the world alive by creeping forward at a very slow rate (never a short loop). Look is free 360°.
import * as THREE from 'three';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const BASE = 'assets/walk/';
const showError = (m) => { $('loader').hidden = true; const e = $('error'); e.hidden = false; e.textContent = m; console.error('[viewer-error]', m); window.__viewerError = m; };
window.__state = { loaded: false };
/* the camera carrier occupies ~±18° around dead-behind, below the horizon: stop the turn far enough off-axis that he is outside the screen half-width */
const TURN_OFF = () => Math.min(0.95, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) + 0.42);
const IDLE = +(params.get('idle') || 0) /* 0 = standing still pauses the footage; ?idle=0.4 restores the old forward drift */, WALK = 1.0, JOG = 1.8;

const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); $('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
const fitCam = () => { camera.aspect = innerWidth / innerHeight; const a = camera.aspect, oldv = new URLSearchParams(location.search).get('lowmask') === '0'; camera.fov = oldv ? 75 : Math.min(a < 1 ? 70 : 75, 2 * Math.atan(Math.tan(82 * Math.PI / 360) / a) * 180 / Math.PI); camera.updateProjectionMatrix(); }; fitCam();
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); fitCam(); });
const geo = new THREE.SphereGeometry(50, 128, 64); geo.scale(-1, 1, 1);
// ground-plane proxy: the lower hemisphere is pushed onto a floor 1.6 m below the camera, so sideways sway gives real-looking parallax near your feet
{ const P = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).normalize(); const r = v.y < -0.032 ? Math.min(50, 1.6 / -v.y) : 50; P.setXYZ(i, v.x * r, v.y * r, v.z * r); } P.needsUpdate = true; }
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }); const sphere = new THREE.Mesh(geo, mat); sphere.rotation.y = +(params.get("ry") ?? -Math.PI / 2); scene.add(sphere);
function mkVideo() { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.defaultMuted = true; v.preload = 'auto'; v.loop = false;
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v); return v; }
const gen = null; /* generated motion at stops removed (w6); see git history */
const crowd = null; /* ?crowd=1 test removed (assets/real, assets/crowd deleted for space) */
const audio = document.createElement('audio'); audio.loop = true; audio.preload = 'auto'; document.body.appendChild(audio);
/* Ambience = the real street sound of the same source (15:00 onward; the route starts at 15:45). One gain controller does all fades; WebAudio gain is used where available because iOS ignores audio.volume. */
const AVOL = 0.85, AOFF = 45; const aud = { g: 0, goal: 0, res: false, node: null };
const aWant = () => Math.min(Math.max(0, AOFF + pos()), 639);
function aInit() { if (aud.node) return; try { const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); const src = ctx.createMediaElementSource(audio); aud.node = ctx.createGain(); aud.node.gain.value = 0; src.connect(aud.node).connect(ctx.destination); aud.ctx = ctx; ctx.resume?.(); } catch (e) { aud.node = null; } }
function aTick(dt) { if (!soundOn) return;
  /* standing still (idle=0): fade the street sound out and pause it, so nothing loops; it resumes in sync when you walk */
  if (view.standing) { aud.goal = 0; if (aud.g < 0.02 && !audio.paused) audio.pause(); }
  else if (audio.paused) { if (document.hidden) return; audio.currentTime = aWant(); audio.play().catch(() => {}); aud.goal = AVOL; aud.res = false; }
  else { const drift = audio.currentTime - aWant(); if (!aud.res && Math.abs(drift) > (Math.abs(rate) > 0.6 ? 6 : 30)) { aud.res = true; aud.goal = 0; } if (aud.res && aud.g < 0.02) { audio.currentTime = aWant(); aud.res = false; aud.goal = AVOL; } if (!aud.res) aud.goal = AVOL; }
  aud.g += (aud.goal - aud.g) * Math.min(1, dt * (aud.goal < aud.g ? 4 : 1.6)); if (aud.node) { aud.node.gain.value = aud.g; if (aud.ctx.state === 'suspended') aud.ctx.resume(); } else audio.volume = Math.min(1, aud.g); }
const mkTex = v => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
let LO = 0, HI = 1e9, D = 0, rate = IDLE, target = IDLE, swapping = false, soundOn = false, frames = 0, lastAdv = performance.now(), quality = '4k', chunkSwaps = 0;
// A chunked track: the route split into L-second files, played back to back with the next chunk preloaded in a 2nd element.
class Track {
  constructor(urls, L, D) { this.urls = urls; this.L = L; this.D = D; this.els = [mkVideo(), mkVideo()]; this.tex = this.els.map(mkTex); this.ci = -1; this.k = 0; this.loaded = [-1, -1];
    this.els.forEach((v, j) => this.watch(v, j)); }
  get el() { return this.els[this.k]; } get nx() { return this.els[1 - this.k]; }
  get tpos() { return this.ci * this.L + (this.el.currentTime || 0); }
  load(j, i) { if (this.loaded[j] === i || i < 0 || i >= this.urls.length) return; const v = this.els[j]; this.loaded[j] = i; v.src = this.urls[i]; v.load(); }
  watch(v, j) { const f = () => { if (this === active && j === this.k) { frames++; lastAdv = performance.now(); this.nudged = false; setSpin(false); if (v.readyState >= 2 && mat.map !== this.tex[j] && !swapping) { mat.map = this.tex[j]; mat.needsUpdate = true; } } v.requestVideoFrameCallback ? v.requestVideoFrameCallback(f) : 0; };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(f); else v.addEventListener('timeupdate', f); }
  async seek(t) { t = Math.max(0, Math.min(this.D - 0.05, t)); const i = Math.min(this.urls.length - 1, Math.floor(t / this.L));
    if (this.loaded[this.k] !== i) { if (this.loaded[1 - this.k] === i) this.k = 1 - this.k; else this.load(this.k, i); }
    this.ci = i; const v = this.el; if (v.readyState < 1) await new Promise(r => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 8000); });
    v.currentTime = t - i * this.L; await new Promise(r => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 2500); }); this.load(1 - this.k, i + 1); }
  // called every frame: hand over to the preloaded next chunk right at the boundary
  tick(r) { const v = this.el; if (!v.duration) return; const n0 = this.nx;
    if (this.primed !== this.ci && this.ci + 1 < this.urls.length && this.loaded[1 - this.k] === this.ci + 1 && v.currentTime > v.duration - 2.5 * Math.max(1, r) && n0.readyState >= 1) { this.primed = this.ci; n0.play().then(() => { if (this.nx === n0) { n0.pause(); n0.currentTime = 0; } }).catch(() => {}); }
    if (this.ci + 1 < this.urls.length && v.currentTime >= v.duration - 0.06 * Math.max(1, r)) { const n = this.nx;
      if (this.loaded[1 - this.k] !== this.ci + 1) this.load(1 - this.k, this.ci + 1); if (n.readyState >= 2) { n.currentTime = 0; n.playbackRate = Math.max(isIOS ? 0.5 : 0.0625, r); n.play().catch(() => {}); if (n.readyState >= 2) { mat.map = this.tex[1 - this.k]; mat.needsUpdate = true; } v.pause(); this.k = 1 - this.k; this.ci++; chunkSwaps++; setTimeout(() => this.load(1 - this.k, this.ci + 1), 300); } } }
  atEnd() { return this.ci === this.urls.length - 1 && this.el.duration && this.el.currentTime >= this.el.duration - 0.15; }
  pauseAll() { this.els.forEach(v => v.pause()); }
}
let fwdT, revT, active;
const pos = () => active === fwdT ? fwdT.tpos : D - revT.tpos; // seconds along the route
function setSpin(on) { $('spin').hidden = !on; }
async function playSafe(v) { try { return await Promise.race([v.play().then(() => true), new Promise(r => setTimeout(() => r(!v.paused), 1500))]); } catch (e) { return false; } }
async function snapTo(p) { if (swapping || !active) return; swapping = true; try { await active.seek(active === fwdT ? p : D - p); active.el.pause(); if (active.el.readyState >= 2) { mat.map = active.tex[active.k]; mat.needsUpdate = true; } } finally { swapping = false; } }
async function switchTo(tr) { if (swapping || tr === active) return; swapping = true; const p = pos();
  await tr.seek(tr === fwdT ? p : D - p); tr.el.playbackRate = Math.max(isIOS ? 0.5 : 0.0625, Math.abs(rate)); await playSafe(tr.el); if (tr.el.readyState >= 2) { mat.map = tr.tex[tr.k]; mat.needsUpdate = true; }
  active.pauseAll(); active = tr; swapping = false; }

// input
const view = { face: 1, turn: 0, yaw: 0, pitch: 0, sy: 0, sp: 0, gyro: null, gyroYaw0: 0, lat: 0, latT: 0 };
// nadir cap (w1): the source's camera-carrier/stitch area under the lens warps and flows like water while walking; cover it with a stable, soft ground-toned disc that fades out by ~48 deg below the horizon
const OLDV = params.get('lowmask') === '0', PORT = () => innerWidth < innerHeight; // w2: portrait = narrower vertical FOV, gaze ~7 deg up and a tighter look-down limit, so the smeared near road takes only the bottom of the screen (?lowmask=0 = old framing)
const PMIN = () => OLDV ? 0.75 : PORT() ? 0.4 : 0.6, GUP = () => OLDV ? 0 : PORT() ? 0.12 : 0.07;
// w3 road: the near-field road in the source smears/flows like water (low-res stitched 360 + compression). Overlay a sharp, stable asphalt plane (texture cut from this same footage, made seamless), colour-matched live to the video's road, scrolled with walking so parallax is right; feathered into the video from ~13 deg below the horizon. ?road=0 disables.
const road = (() => { if (params.get('road') !== '1') return null; // w4: off by default (it erased nearby people's legs); ?road=1 opt-in
  const tx = new THREE.TextureLoader().load('assets/road/asphalt.jpg?v=w3'); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const m = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { map: { value: tx }, off: { value: 0 }, gain: { value: new THREE.Color(1, 1, 1) }, cam: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 wp; void main(){ vec4 w = modelMatrix * vec4(position,1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform float off; uniform vec3 gain; uniform vec3 cam; varying vec3 wp;
      void main(){ vec2 g = vec2(wp.x, wp.z + off); vec3 a = texture2D(map, g / 1.4).rgb; vec3 b = texture2D(map, mat2(0.8,-0.6,0.6,0.8) * g / 2.3 + 0.37).rgb;
        vec3 c = mix(a, b, 0.35 + 0.3 * texture2D(map, g / 9.0).g) * gain;
        float r = length(wp.xz - cam.xz); float dep = atan(1.6, r); float al = smoothstep(0.23, 0.40, dep) * (1.0 - smoothstep(2.0, 2.9, abs(wp.x)));
        gl_FragColor = vec4(c, al);
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), m); mesh.position.y = -1.6; mesh.renderOrder = 5; scene.add(mesh);
  const c = document.createElement('canvas'); c.width = c.height = 8; const cx = c.getContext('2d', { willReadFrequently: true }); const rc = new THREE.Raycaster();
  const texMean = new THREE.Color().setRGB(87 / 255, 79 / 255, 76 / 255, THREE.SRGBColorSpace), tgt = new THREE.Color(1, 1, 1);
  return { mesh, m, cx, rc, texMean, tgt, last: 0 }; })();
const ROAD_MPS = +(params.get('roadspeed') ?? 1.3); // metres of road per route-second (normal walking)
function roadUpd(now) { if (!road) return; const u = road.m.uniforms; u.cam.value.copy(camera.position); road.mesh.position.x = 0; road.mesh.position.z = camera.position.z;
  u.off.value = (-pos() * ROAD_MPS) % 1400 - road.mesh.position.z * 0; // ground slides toward you as you walk forward
  if (now - road.last > 700) { road.last = now; try { const im = mat.map && mat.map.image; const W = im && (im.videoWidth || im.width), H = im && (im.videoHeight || im.height);
    if (W) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize(); f.y = -0.42; road.rc.set(new THREE.Vector3(), f.normalize()); const hit = road.rc.intersectObject(sphere)[0];
      if (hit && hit.uv) { const sx = hit.uv.x * W, sy = (1 - hit.uv.y) * H; road.cx.drawImage(im, sx - W * 0.012, sy - H * 0.02, W * 0.024, H * 0.04, 0, 0, 8, 8); const d = road.cx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const col = new THREE.Color().setRGB(r / 16320, g / 16320, b / 16320, THREE.SRGBColorSpace); road.tgt.setRGB(col.r / road.texMean.r, col.g / road.texMean.g, col.b / road.texMean.b); } } } catch (_) {} }
  u.gain.value.lerp(road.tgt, 0.04); }
const nadir = (() => { if (params.get('nadir') === '0') return null;
  const m = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { col: { value: new THREE.Color(0.32, 0.30, 0.29) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 col; varying vec3 vp; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5); } void main(){ float r = length(vp.xz); float dep = atan(1.6, r); float a = smoothstep(0.84, 1.08, dep); float g = 0.94 + 0.06 * h(floor(vp.xz * 90.0)); gl_FragColor = vec4(col * g * (0.9 + 0.1 * smoothstep(0.0, 1.4, r)), a); \n#include <colorspace_fragment>\n}' });
  const g = new THREE.CircleGeometry(1.6, 64); g.rotateX(-Math.PI / 2); const mesh = new THREE.Mesh(g, m); mesh.position.y = -1.6; mesh.renderOrder = 10; scene.add(mesh);
  const c = document.createElement('canvas'); c.width = 16; c.height = 8; const cx = c.getContext('2d', { willReadFrequently: true }); const tgt = new THREE.Color(0.32, 0.30, 0.29);
  return { mesh, m, c, cx, tgt, last: 0 }; })();
function nadirUpd(now) { if (!nadir) return; nadir.mesh.position.x = camera.position.x; nadir.mesh.position.z = camera.position.z;
  if (now - nadir.last > 700) { nadir.last = now; const im = mat.map && mat.map.image; try { if (im && (im.videoWidth || im.width)) { nadir.cx.drawImage(im, 0, 0, 16, 8); const d = nadir.cx.getImageData(0, 6, 16, 1).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < 64; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } nadir.tgt.setRGB(r / 4080, gg / 4080, b / 4080, THREE.SRGBColorSpace); } } catch (_) {} }
  nadir.m.uniforms.col.value.lerp(nadir.tgt, 0.03); }
let drag = null; const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const k = camera.fov / innerHeight * Math.PI / 180; view.yaw += (e.clientX - drag.x) * k; view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * k, -PMIN(), 1.3); drag.x = e.clientX; drag.y = e.clientY; });
for (const n of ['pointerup', 'pointercancel']) cv.addEventListener(n, e => { if (drag && e.pointerId === drag.id) drag = null; }); // multi-touch: thumb on joystick + another finger dragging here to look
const keys = {}; addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);
const joyEl = $('joy'), knob = $('knob'); let joy = { x: 0, y: 0, id: null }; const evc = { down: 0, move: 0, up: 0, cancel: 0, ts: 0 };
for (const [k, n] of [['down', 'pointerdown'], ['move', 'pointermove'], ['up', 'pointerup'], ['cancel', 'pointercancel'], ['ts', 'touchstart']]) joyEl.addEventListener(n, () => evc[k]++, { passive: true });
joyEl.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); joyEl.addEventListener('touchmove', e => e.preventDefault(), { passive: false }); // iOS: never let the page pan/scroll steal the stick
joyEl.addEventListener('pointerdown', e => { joy.id = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (_) {} knob.style.transition = 'none'; e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId !== joy.id) return; const r = joyEl.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, L = Math.hypot(dx, dy) || 1, m = Math.min(1, L / 50) / L; joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * 35}px,${joy.y * 35}px)`; });
const joyEnd = e => { if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: null }; knob.style.transition = ''; knob.style.transform = ''; } }; joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
let gyroWant = params.get('gyro') === '1', gyroAttached = false; // tilt-to-look is opt-in (?gyro=1 or HoianWalk.setGyro(true)); default look = drag with any finger outside the joystick
function setGyro(on) { gyroWant = !!on; if (on) { if (!gyroAttached) enableGyro(); } else if (view.gyro) { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); view.gyro = null; view.yaw = view.sy = e.y - view.turn; view.pitch = view.sp = THREE.MathUtils.clamp(e.x, -PMIN(), 1.3); } }
function enableGyro() { gyroAttached = true; const on = () => addEventListener('deviceorientation', ev => { if (ev.alpha == null || !gyroWant) return; const d = THREE.MathUtils.degToRad, o = d(screen.orientation?.angle || window.orientation || 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(ev.beta), d(ev.alpha), -d(ev.gamma), 'YXZ')).multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o));
    if (!view.gyro) { view.gyroYaw0 = view.yaw - new THREE.Euler().setFromQuaternion(q, 'YXZ').y; view.yaw = 0; view.pitch = 0; view.gyro = q; } else view.gyro.slerp(q, 0.35); });
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(p => p === 'granted' ? on() : (gyroAttached = false)).catch(() => { gyroAttached = false; }); else on(); }
// buttons: hold to walk forward/back (no scene switching)
function hold(btn, val) { const set = v => e => { e.preventDefault(); e.stopPropagation(); btnTarget = v; }; btn.addEventListener('pointerdown', set(val)); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, set(null)); }
let btnTarget = null;
// turning around: you always walk the way you face. Facing back = the reversed footage, seen from behind the camera, so the street flows toward you naturally.
function edgeStatus() { const ae = pos() >= HI - 0.5, as = pos() <= LO + 0.5, st = $('nodestatus'); if ((ae && view.face > 0) || (as && view.face < 0)) { st.textContent = (ae ? 'Inside the hall — end of the walk' : 'Start of the street') + ' · tap ↺ Turn around'; $('turnL').classList.add('pulse'); } else { $('turnL').classList.remove('pulse'); if (ae || as) st.textContent = 'Turned around · push up / W to walk'; else if (/Turn(ed)? around/.test(st.textContent)) st.textContent = ''; } }
let lastTurn = 0; function turnAround() { const n = performance.now(); if (n - lastTurn < 900) return; lastTurn = n; try { navigator.vibrate?.(12); } catch (e) {} view.face = -view.face; $('hint').hidden = true; }
addEventListener('keydown', e => { if ((e.code === 'KeyS' || e.code === 'ArrowDown') && !e.repeat) turnAround(); });

(async () => {
  try {
    const r = await fetch(BASE + 'walk.json'); if (!r.ok) throw new Error('walk.json ' + r.status); const j = await r.json(); LO = params.has('full') ? 0 : (j.lo || 0) /* the source has an editorial fade at 277-280 s: the default route starts after it so the walk has no cut */; D = j.duration; HI = params.has('full') ? D : (j.hi || D) /* the source starts a fade-out in its last 0.7 s */;
    const probe = document.createElement('video'), ua = navigator.userAgent, isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium|Android|FxiOS/.test(ua);
    const hevcOK = isSafari && probe.canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"') !== '';
    const c = navigator.connection || {}, weak = c.saveData || (c.downlink && c.downlink < 2.5) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    quality = params.get('q') || (weak ? (j.tracks['2k5'] ? '2k5' : 'f2k') : '4k'); if (!j.tracks[quality]) quality = '4k'; window.__walkJ = j; const F = j.tracks[quality];
    const urls = (t) => t.files ? t.files.map(f => BASE + f) : Array.from({ length: t.n }, (_, i) => BASE + t.pattern.replace('%02d', String(i).padStart(2, '0'))); window.__urls = urls;
    fwdT = new Track(urls(F), j.chunk, D); revT = new Track(urls(j.tracks.rev), j.chunk, D); active = fwdT;
    $('badge').innerHTML = `<b>Hội An</b> · real 360° street walk · <a href="CREDITS.md" target="_blank">Credits</a>`; setTimeout(() => $('badge').classList.add('fade'), 100);
    $('streetbar').hidden = false; $('slabel').textContent = j.name;
    $('turnR').textContent = 'Walk ▶'; $('turnL').textContent = '↺ Turn around'; $('turnL').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); turnAround(); }); hold($('turnR'), 'walk');
    $('reset').textContent = 'Face ahead'; $('reset').onclick = () => { view.yaw = 0; view.pitch = 0; };
    if (!j.tracks['2k5']) $('quality').hidden = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.pause(); active?.el.pause(); } else { if (soundOn) { aud.g = 0; aud.goal = AVOL; audio.currentTime = aWant(); audio.play().catch(() => {}); } if (active && !active.atEnd() && !view.standing) playSafe(active.el); } });
    $('quality').textContent = quality === '2k5' ? '2.5K' : '4K'; $('quality').onclick = () => { params.set('q', quality === '2k5' ? ('4k') : '2k5'); params.set('t', pos().toFixed(1)); location.search = params.toString(); };
    $('scene').textContent = 'More ▸'; $('scene').onclick = () => { location.search = '?scene=spots'; }; $('scene').title = '?scene=spots (6 tripod spots), ?scene=game, ?scene=live';
    document.body.classList.add('minimal'); $('hint').textContent = isMobile ? 'Stick up: walk · stick down: turn around · drag to look' : 'W / ↑: walk · S / ↓: turn around · drag: look';
    new THREE.TextureLoader().load(BASE + j.poster, t => { t.colorSpace = THREE.SRGBColorSpace; if (!frames) { mat.map = t; mat.needsUpdate = true; if (!window.__state.loaded) renderer.setAnimationLoop(() => renderer.render(scene, camera)); } });
    audio.src = BASE + j.audio;
    const prog = setInterval(() => { try { const v = fwdT.el, b = v.buffered.length ? v.buffered.end(0) - v.currentTime : 0; $('fill').style.width = Math.min(100, 15 + b / 2 * 85) + '%'; } catch (e) {} }, 200);
    $('loadmsg').textContent = 'Loading the street in ' + (quality === '2k5' ? '2.5K' : '4K') + '…';
    await fwdT.seek(Math.max(LO, +(params.get('t') || 0))); fwdT.el.playbackRate = isIOS ? 1 : Math.max(0.0625, IDLE);
    if (fwdT.el.error) throw new Error('video failed to load (' + (fwdT.el.error.code) + ')');
    clearInterval(prog); $('loader').hidden = true; document.body.classList.remove('loading'); $('hint').classList.add('fade'); window.__state.loaded = true; setSpin(true);
    if (!(await playSafe(fwdT.el))) showTap();
    let gyroOn = false;
    const onGesture = () => { $('tapstart').hidden = true; if (active.el.paused && !active.atEnd() && !view.standing) playSafe(active.el);
      if (!soundOn) { soundOn = true; aInit(); aud.g = 0; aud.goal = AVOL; audio.currentTime = aWant(); audio.play().catch(() => { soundOn = false; }); }
      if (!gyroOn && isMobile && gyroWant && !gyroAttached) { gyroOn = true; enableGyro(); } revT.seek(D - pos()).catch(() => {}); };
    $('tapstart').onclick = onGesture; for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, () => { if (!soundOn || (active.el.paused && !active.atEnd())) onGesture(); }, true);
    if (!isMobile) setTimeout(() => revT.seek(D - pos()).catch(() => {}), 3000);
  } catch (e) { showError('The walk could not start: ' + e.message + '\nPlease reload. (Older version: ?scene=spots)'); return; }
  let last = performance.now();
  // forward-stall fallback: if you push to walk and the 4K forward footage doesn't advance within 1.5 s, reload at 2048 px
  const stall = { pushT: 0, n: 0, note: '' };
  async function degrade(why) { const j = window.__walkJ; if (quality !== '4k' || !j.tracks.f2k || swapping) return; swapping = true; const p = pos(); stall.note = 'fallback→2K (' + why + ')';
    try { const old = fwdT; fwdT = new Track(window.__urls(j.tracks.f2k), j.chunk, D); quality = 'f2k'; await fwdT.seek(p); fwdT.el.playbackRate = 1; if (active === old) { active = fwdT; await playSafe(fwdT.el); if (fwdT.el.readyState >= 2) { mat.map = fwdT.tex[fwdT.k]; mat.needsUpdate = true; } } old.pauseAll(); old.els.forEach(v => { v.removeAttribute('src'); v.load(); }); lastAdv = performance.now(); }
    catch (e) { stall.note += ' failed ' + e; } finally { swapping = false; } }
  const dbgEl = params.get('debug') === '1' ? Object.assign(document.createElement('pre'), { id: 'walkdbg' }) : null; let dbgT = 0;
  if (dbgEl) { dbgEl.style.cssText = 'position:fixed;left:6px;right:6px;top:calc(env(safe-area-inset-top,0px) + 6px);z-index:98;margin:0;padding:8px 10px;background:rgba(0,0,0,.72);color:#ff9;font:600 15px/1.4 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre-wrap;border-radius:8px'; document.body.appendChild(dbgEl); }
  renderer.setAnimationLoop(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; aTick(dt); crowd?.update(dt); gen?.update(dt);
    { const pushing = Math.abs(target) > 0.3; if (pushing && !stall.pushT) stall.pushT = now; if (!pushing) stall.pushT = 0;
      if (pushing && active === fwdT && !swapping && now - stall.pushT > 1500 && now - lastAdv > 1500) { stall.n++; degrade('no frames ' + ((now - lastAdv) / 1000).toFixed(1) + 's'); stall.pushT = now; } }
    if (dbgEl && (dbgT += dt) > 0.25) { dbgT = 0; const v = active?.el; dbgEl.textContent = `walk ${quality} ${active === fwdT ? 'FWD' : 'REV'} chunk ${active?.ci} pos ${pos().toFixed(2)} [${LO}-${HI}]\nvideo ${v ? 'rs' + v.readyState + (v.paused ? ' PAUSED' : ' playing') + ' ct ' + v.currentTime.toFixed(2) + ' pr ' + v.playbackRate.toFixed(2) + ' ' + v.videoWidth + 'px' : '-'}\nstanding ${!!view.standing} target ${target.toFixed(2)} rate ${rate.toFixed(2)} swap ${swapping}\njoy ${joy.x.toFixed(2)},${joy.y.toFixed(2)} id ${joy.id} ev ${evc.down}/${evc.move}/${evc.up}/${evc.cancel} touch ${evc.ts}\nlast frame ${((now - lastAdv) / 1000).toFixed(1)}s ago ${stall.note}`; }
    let t = btnTarget === 'walk' ? WALK : null; const kf = keys.KeyW || keys.ArrowUp, jog = keys.ShiftLeft || keys.ShiftRight;
    if (joy.y > 0.75 && !view.joyTurned) { view.joyTurned = true; turnAround(); } else if (joy.y < 0.4) view.joyTurned = false;
    if (t == null) { if (kf) t = jog ? JOG : WALK; else if (joy.y < -0.15) { const m = (-joy.y - 0.15) / 0.85; t = m < 0.88 ? IDLE + (WALK - IDLE) * Math.pow(m / 0.88, 1.4) /* gentle start, full walk well before the rim */ : JOG; } }
    t = t == null ? IDLE : t * view.face; if (Math.abs(t) <= IDLE + 1e-6) t = IDLE; view.standing = IDLE === 0 && Math.abs(t) < 0.01 && Math.abs(rate) < 0.15; // standing: natural-looking forward footage at a slow drift
    target = t; rate += (target - rate) * Math.min(1, dt * 2.5);
    view.latT = (keys.KeyA ? -1 : keys.KeyD ? 1 : 0) + (Math.abs(joy.x) > 0.55 ? (joy.x - Math.sign(joy.x) * 0.55) / 0.45 : 0); view.lat += (view.latT * 0.25 - view.lat) * Math.min(1, dt * 3);
    if (window.__state.loaded && !swapping) {
      const idle = Math.abs(target) < 0.5;
      // direction: walking back uses the reversed track; idle keeps the current track (and ping-pongs at the ends)
      let want = rate < -0.05 ? revT : rate > 0.3 ? fwdT : active; if (idle) want = IDLE > 0 ? ((pos() >= HI - 0.5) ? active : fwdT) : active;
      if (want !== active && !(want === revT && pos() <= LO + 0.2) && !(want === fwdT && pos() >= HI - 0.2)) switchTo(want);
      else if (active === fwdT && pos() >= HI - 0.05) { if (!active.el.paused) active.el.pause(); edgeStatus(); }
      else if (active === revT && pos() <= LO + 0.1) { if (!active.el.paused) active.el.pause(); edgeStatus(); }
      else if (view.standing) { if (!active.el.paused) active.el.pause(); edgeStatus(); }
      else { const v = active.el; if (v.paused && !active.atEnd() && !swapping && !v._pp) { v._pp = 1; playSafe(v).finally(() => { v._pp = 0; }); } const pr = Math.max(isIOS ? 0.5 : 0.0625, Math.min(3, Math.abs(Math.abs(rate - target) < 0.1 ? target : rate))); if (Math.abs(v.playbackRate - pr) > 0.1 || (pr === Math.abs(target) && v.playbackRate !== pr)) v.playbackRate = pr; /* few rate changes: each one can cost a pipeline flush on some engines */ active.tick(pr);
        edgeStatus(); }
    }
    view.sy += (view.yaw - view.sy) * 0.18; view.sp += (view.pitch - view.sp) * 0.18; { const tt = view.face > 0 ? 0 : Math.PI - TURN_OFF(); view.turn += (tt - view.turn) * Math.min(1, dt * 2.2); } camera.quaternion.setFromEuler(new THREE.Euler(view.sp + GUP() + 0.15 * view.turn / Math.PI /* facing back: lift gaze a little so the camera carrier sits below frame */, view.sy + view.turn, 0, 'YXZ'));
    if (view.gyro) camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.gyroYaw0)).multiply(view.gyro);
    { const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); if (eu.x < -PMIN()) { eu.x = -PMIN(); camera.quaternion.setFromEuler(eu); } } // clamp final pitch (gyro included) so the stitched nadir never fills the screen
    nadirUpd(now); roadUpd(now);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize(); camera.position.copy(right.multiplyScalar(view.lat));
    const edge = pos() >= HI - 0.5 || pos() <= LO + 0.5, adv = now - lastAdv < 1500 || edge; $('live').textContent = adv ? (Math.abs(rate) > 0.5 && !edge ? (rate > 0 ? '● walking' : '● walking · turned around') : '● LIVE') + (soundOn ? '' : ' · tap for sound') : '○ loading';
    $('live').className = adv ? 'on' : ''; if (D) $('sfill').style.width = Math.max(0, (pos() - LO) / (HI - LO) * 100) + '%';
    renderer.render(scene, camera); });
  setInterval(() => { if (!window.__state.loaded || swapping) return; const v = active.el; if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 2500 && !active.nudged) { active.nudged = true; v.currentTime = v.currentTime + 0.02; playSafe(v); lastAdv = performance.now(); return; } if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 6000) { active.nudged = false; setSpin(true); $('nodestatus').textContent = 'Reconnecting…'; const p = pos(); active.loaded = [-1, -1]; active.seek(active === fwdT ? p : D - p).then(() => playSafe(active.el)); lastAdv = performance.now(); }
    else if (v.paused && !view.standing && !active.atEnd() && $('tapstart').hidden && !soundOn) showTap(); }, 1000);
})();
function showTap() { const t = $('tapstart'); t.textContent = '🔊 Tap to start'; t.hidden = false; }
/* Public hooks for custom UI (buttons etc.). Example: HoianWalk.setWalk(true) while a button is held.
   setWalk(on|null): walk forward like the stick; turnAround(); faceAhead(); state() -> { pos, lo, hi, facing, standing, sound } */
window.HoianWalk = { setGyro: on => setGyro(on), gyro: () => gyroWant, setWalk: on => { btnTarget = on ? 'walk' : null; }, turnAround: () => turnAround(), faceAhead: () => { view.yaw = 0; view.pitch = 0; }, state: () => ({ pos: pos(), lo: LO, hi: HI, facing: view.face > 0 ? 'forward' : 'back', standing: !!view.standing, sound: soundOn, rate, joy: joy.y, swapping, base: active ? (active === fwdT ? 'fwd' : 'rev') + ' rs' + active.el.readyState + (active.el.paused ? 'P' : '>') : '-' }) };
window.__test = { road: () => road && { gain: road.m.uniforms.gain.value.toArray(), off: road.m.uniforms.off.value }, look: () => ({ yaw: view.yaw, pitch: view.pitch, gyro: !!view.gyro }), nadir: () => nadir && nadir.m.uniforms.col.value.getHexString(), aud: () => ({ t: +audio.currentTime.toFixed(1), want: +aWant().toFixed(1), g: +aud.g.toFixed(2), paused: audio.paused, webaudio: !!aud.node, ctx: aud.ctx?.state }), turn: () => turnAround(), view: () => ({ face: view.face, turn: +view.turn.toFixed(2) }), setYaw: y => view.yaw = y, setPitch: p => view.pitch = p, key: (c, d) => keys[c] = d, els: () => [fwdT, revT].flatMap(t => t.els.map((v, j) => ({ t: t === fwdT ? "f" : "r", j, act: j === t.k, src: v.src.split("/").pop(), p: v.paused, rs: v.readyState, ct: +v.currentTime.toFixed(2), pr: v.playbackRate, buf: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(1) : 0 }))), state: () => ({ pos: pos(), D, rate, target, dir: active === fwdT ? 'fwd' : 'rev', chunk: active?.ci, frames, chunkSwaps, paused: active?.el.paused, w: active?.el.videoWidth, q: quality, swapping, err: window.__viewerError || null }) };
