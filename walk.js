// Continuous controller-driven walk through real 360° walking footage of Hội An.
// Video time = position along the route. Forward = forward copy at a variable rate; backward = a pre-reversed copy.
// Standing still keeps the world alive by creeping forward at a very slow rate (never a short loop). Look is free 360°.
import * as THREE from 'three';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const BASE = 'assets/walk/';
const showError = (m) => { $('loader').hidden = true; const e = $('error'); e.hidden = false; e.textContent = m; console.error('[viewer-error]', m); window.__viewerError = m; };
window.__state = { loaded: false };
const IDLE = 0.15, WALK = 1.0, JOG = 1.8;

const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); $('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const geo = new THREE.SphereGeometry(50, 128, 64); geo.scale(-1, 1, 1);
// ground-plane proxy: the lower hemisphere is pushed onto a floor 1.6 m below the camera, so sideways sway gives real-looking parallax near your feet
{ const P = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).normalize(); const r = v.y < -0.032 ? Math.min(50, 1.6 / -v.y) : 50; P.setXYZ(i, v.x * r, v.y * r, v.z * r); } P.needsUpdate = true; }
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }); const sphere = new THREE.Mesh(geo, mat); scene.add(sphere);
function mkVideo() { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.defaultMuted = true; v.preload = 'auto'; v.loop = false;
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v); return v; }
const audio = document.createElement('audio'); audio.loop = true; audio.preload = 'auto'; document.body.appendChild(audio);
const mkTex = v => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
let D = 0, rate = IDLE, target = IDLE, swapping = false, soundOn = false, frames = 0, lastAdv = performance.now(), quality = '4k', chunkSwaps = 0;
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
      if (this.loaded[1 - this.k] !== this.ci + 1) this.load(1 - this.k, this.ci + 1); if (n.readyState >= 2) { n.currentTime = 0; n.playbackRate = Math.max(0.0625, r); n.play().catch(() => {}); if (n.readyState >= 2) { mat.map = this.tex[1 - this.k]; mat.needsUpdate = true; } v.pause(); this.k = 1 - this.k; this.ci++; chunkSwaps++; setTimeout(() => this.load(1 - this.k, this.ci + 1), 300); } } }
  atEnd() { return this.ci === this.urls.length - 1 && this.el.duration && this.el.currentTime >= this.el.duration - 0.15; }
  pauseAll() { this.els.forEach(v => v.pause()); }
}
let fwdT, revT, active;
const pos = () => active === fwdT ? fwdT.tpos : D - revT.tpos; // seconds along the route
function setSpin(on) { $('spin').hidden = !on; }
async function playSafe(v) { try { await v.play(); return true; } catch (e) { return false; } }
async function switchTo(tr) { if (swapping || tr === active) return; swapping = true; const p = pos();
  await tr.seek(tr === fwdT ? p : D - p); tr.el.playbackRate = Math.max(0.0625, Math.abs(rate)); await playSafe(tr.el); if (tr.el.readyState >= 2) { mat.map = tr.tex[tr.k]; mat.needsUpdate = true; }
  active.pauseAll(); active = tr; swapping = false; }

// input
const view = { yaw: 0, pitch: 0, sy: 0, sp: 0, gyro: null, gyroYaw0: 0, lat: 0, latT: 0 };
let drag = null; const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const k = camera.fov / innerHeight * Math.PI / 180; view.yaw += (e.clientX - drag.x) * k; view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * k, -0.9, 1.3); drag.x = e.clientX; drag.y = e.clientY; });
cv.addEventListener('pointerup', () => drag = null);
const keys = {}; addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);
const joyEl = $('joy'), knob = $('knob'); let joy = { x: 0, y: 0, id: null };
joyEl.addEventListener('pointerdown', e => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId !== joy.id) return; const r = joyEl.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, L = Math.hypot(dx, dy) || 1, m = Math.min(1, L / 50) / L; joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * 35}px,${joy.y * 35}px)`; });
const joyEnd = e => { if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: null }; knob.style.transform = ''; } }; joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
function enableGyro() { const on = () => addEventListener('deviceorientation', ev => { if (ev.alpha == null) return; const d = THREE.MathUtils.degToRad, o = d(screen.orientation?.angle || window.orientation || 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(ev.beta), d(ev.alpha), -d(ev.gamma), 'YXZ')).multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o));
    if (!view.gyro) { view.gyroYaw0 = view.yaw - new THREE.Euler().setFromQuaternion(q, 'YXZ').y; view.yaw = 0; view.pitch = 0; view.gyro = q; } else view.gyro.slerp(q, 0.35); });
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(p => p === 'granted' && on()).catch(() => {}); else on(); }
// buttons: hold to walk forward/back (no scene switching)
function hold(btn, val) { const set = v => e => { e.preventDefault(); e.stopPropagation(); btnTarget = v; }; btn.addEventListener('pointerdown', set(val)); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, set(null)); }
let btnTarget = null;

(async () => {
  try {
    const r = await fetch(BASE + 'walk.json'); if (!r.ok) throw new Error('walk.json ' + r.status); const j = await r.json(); D = j.duration;
    const probe = document.createElement('video'), ua = navigator.userAgent, isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium|Android|FxiOS/.test(ua);
    const hevcOK = isSafari && probe.canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"') !== '';
    const c = navigator.connection || {}, weak = c.saveData || (c.downlink && c.downlink < 2.5) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    quality = params.get('q') || (weak ? '2k5' : '4k'); const F = j.tracks[quality] || j.tracks['4k'];
    const urls = (t) => Array.from({ length: t.n }, (_, i) => BASE + t.pattern.replace('%02d', String(i).padStart(2, '0')));
    fwdT = new Track(urls(F), j.chunk, D); revT = new Track(urls(j.tracks.rev), j.chunk, D); active = fwdT;
    $('badge').innerHTML = `<b>Hội An</b> · real 360° street walk · <a href="CREDITS.md" target="_blank">Credits</a>`; setTimeout(() => $('badge').classList.add('fade'), 100);
    $('streetbar').hidden = false; $('slabel').textContent = j.name;
    $('turnL').textContent = '◀ Back'; $('turnR').textContent = 'Walk ▶'; hold($('turnL'), -WALK); hold($('turnR'), WALK);
    $('reset').textContent = 'Face ahead'; $('reset').onclick = () => { view.yaw = 0; view.pitch = 0; };
    if (!j.tracks['2k5']) $('quality').hidden = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.pause(); active?.el.pause(); } else { if (soundOn) { audio.volume = 0; audio.play().catch(() => {}); const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 1500); audio.volume = 0.85 * k; if (k < 1) requestAnimationFrame(f); }; f(); } if (active && !active.atEnd()) playSafe(active.el); } });
    $('quality').textContent = quality === '2k5' ? '2.5K' : '4K'; $('quality').onclick = () => { params.set('q', quality === '2k5' ? ('4k') : '2k5'); params.set('t', pos().toFixed(1)); location.search = params.toString(); };
    $('scene').textContent = 'More ▸'; $('scene').onclick = () => { location.search = '?scene=spots'; }; $('scene').title = '?scene=spots (6 tripod spots), ?scene=game, ?scene=live';
    $('hint').textContent = isMobile ? 'Joystick: walk forward/back · drag or turn phone: look around' : 'W/S or ↑/↓: walk · Shift: jog · drag: look around'; $('hint').classList.add('fade');
    new THREE.TextureLoader().load(BASE + j.poster, t => { t.colorSpace = THREE.SRGBColorSpace; if (!frames) { mat.map = t; mat.needsUpdate = true; } });
    audio.src = BASE + j.audio;
    const prog = setInterval(() => { try { const v = fwdT.el, b = v.buffered.length ? v.buffered.end(0) - v.currentTime : 0; $('fill').style.width = Math.min(100, 15 + b / 2 * 85) + '%'; } catch (e) {} }, 200);
    $('loadmsg').textContent = 'Loading the street in ' + (quality === '2k5' ? '2.5K' : '4K') + '…';
    await fwdT.seek(+(params.get('t') || j.start || 0)); fwdT.el.playbackRate = IDLE;
    if (fwdT.el.error) throw new Error('video failed to load (' + (fwdT.el.error.code) + ')');
    clearInterval(prog); $('loader').hidden = true; window.__state.loaded = true; setSpin(true);
    if (!(await playSafe(fwdT.el))) showTap();
    let gyroOn = false;
    const onGesture = () => { $('tapstart').hidden = true; if (active.el.paused && !active.atEnd()) playSafe(active.el);
      if (!soundOn) { soundOn = true; audio.volume = 0; audio.play().then(() => { const t0 = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - t0) / 2500); audio.volume = 0.85 * k; if (k < 1) requestAnimationFrame(f); }; f(); }).catch(() => { soundOn = false; }); }
      if (!gyroOn && isMobile) { gyroOn = true; enableGyro(); } revT.seek(D - pos()).catch(() => {}); };
    $('tapstart').onclick = onGesture; for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, () => { if (!soundOn || (active.el.paused && !active.atEnd())) onGesture(); }, true);
    if (!isMobile) setTimeout(() => revT.seek(D - pos()).catch(() => {}), 3000);
  } catch (e) { showError('The walk could not start: ' + e.message + '\nPlease reload. (Older version: ?scene=spots)'); return; }
  let last = performance.now();
  renderer.setAnimationLoop(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    let t = btnTarget; const kf = keys.KeyW || keys.ArrowUp, kb = keys.KeyS || keys.ArrowDown, jog = keys.ShiftLeft || keys.ShiftRight;
    if (t == null) { if (kf) t = jog ? JOG : WALK; else if (kb) t = -(jog ? JOG : WALK); else if (Math.abs(joy.y) > 0.15) { const m = (Math.abs(joy.y) - 0.15) / 0.85; t = -Math.sign(joy.y) * (m < 0.85 ? IDLE + (WALK - IDLE) * m / 0.85 : JOG); } else t = IDLE; }
    target = t; rate += (target - rate) * Math.min(1, dt * 2.5);
    view.latT = (keys.KeyA ? -1 : keys.KeyD ? 1 : 0) + (Math.abs(joy.x) > 0.3 ? joy.x : 0); view.lat += (view.latT * 0.6 - view.lat) * Math.min(1, dt * 3);
    if (window.__state.loaded && !swapping) {
      const idle = Math.abs(target) < 0.5;
      // direction: walking back uses the reversed track; idle keeps the current track (and ping-pongs at the ends)
      let want = rate < -0.05 ? revT : rate > 0.3 ? fwdT : active; if (idle && active.atEnd()) want = active === fwdT ? revT : fwdT;
      if (want !== active && !(want === revT && pos() <= 0.2) && !(want === fwdT && pos() >= D - 0.2)) switchTo(want);
      else { const v = active.el, pr = Math.max(0.0625, Math.min(3, Math.abs(rate))); if (Math.abs(v.playbackRate - pr) > 0.02) v.playbackRate = pr; active.tick(pr);
        if (active.atEnd()) { $('nodestatus').textContent = active === fwdT ? 'End of the street — walk back' : 'Start of the street'; } else if ($('nodestatus').textContent.startsWith('End') || $('nodestatus').textContent.startsWith('Start')) $('nodestatus').textContent = ''; }
    }
    view.sy += (view.yaw - view.sy) * 0.18; view.sp += (view.pitch - view.sp) * 0.18; camera.quaternion.setFromEuler(new THREE.Euler(view.sp, view.sy, 0, 'YXZ'));
    if (view.gyro) camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.gyroYaw0)).multiply(view.gyro);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize(); camera.position.copy(right.multiplyScalar(view.lat));
    const adv = now - lastAdv < 1500; $('live').textContent = adv ? (Math.abs(rate) > 0.5 ? (rate > 0 ? '● walking' : '● walking back') : '● LIVE') + (soundOn ? '' : ' · tap for sound') : '○ loading';
    $('live').className = adv ? 'on' : ''; if (D) $('sfill').style.width = (pos() / D * 100) + '%';
    renderer.render(scene, camera); });
  setInterval(() => { if (!window.__state.loaded || swapping) return; const v = active.el; if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 2500 && !active.nudged) { active.nudged = true; v.currentTime = v.currentTime + 0.02; playSafe(v); lastAdv = performance.now(); return; } if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 6000) { active.nudged = false; setSpin(true); $('nodestatus').textContent = 'Reconnecting…'; const p = pos(); active.loaded = [-1, -1]; active.seek(active === fwdT ? p : D - p).then(() => playSafe(active.el)); lastAdv = performance.now(); }
    else if (v.paused && !active.atEnd() && $('tapstart').hidden && !soundOn) showTap(); }, 1000);
})();
function showTap() { const t = $('tapstart'); t.textContent = '▶ Tap to start'; t.hidden = false; }
window.__test = { setYaw: y => view.yaw = y, key: (c, d) => keys[c] = d, els: () => [fwdT, revT].flatMap(t => t.els.map((v, j) => ({ t: t === fwdT ? "f" : "r", j, act: j === t.k, src: v.src.split("/").pop(), p: v.paused, rs: v.readyState, ct: +v.currentTime.toFixed(2), pr: v.playbackRate, buf: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(1) : 0 }))), state: () => ({ pos: pos(), D, rate, target, dir: active === fwdT ? 'fwd' : 'rev', chunk: active?.ci, frames, chunkSwaps, paused: active?.el.paused, w: active?.el.videoWidth, q: quality, swapping, err: window.__viewerError || null }) };
