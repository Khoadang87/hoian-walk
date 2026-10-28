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
/* the camera carrier occupies ~±18° around dead-behind, below the horizon: stop the turn far enough off-axis that he is outside the screen half-width */
const TURN_OFF = () => Math.min(0.95, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) + 0.42);
const IDLE = +(params.get('idle') || 0.4), WALK = 1.0, JOG = 1.8;

const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); $('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const geo = new THREE.SphereGeometry(50, 128, 64); geo.scale(-1, 1, 1);
// ground-plane proxy: the lower hemisphere is pushed onto a floor 1.6 m below the camera, so sideways sway gives real-looking parallax near your feet
{ const P = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).normalize(); const r = v.y < -0.032 ? Math.min(50, 1.6 / -v.y) : 50; P.setXYZ(i, v.x * r, v.y * r, v.z * r); } P.needsUpdate = true; }
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }); const sphere = new THREE.Mesh(geo, mat); sphere.rotation.y = +(params.get("ry") ?? -Math.PI / 2); scene.add(sphere);
function mkVideo() { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.defaultMuted = true; v.preload = 'auto'; v.loop = false;
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v); return v; }
const audio = document.createElement('audio'); audio.loop = true; audio.preload = 'auto'; document.body.appendChild(audio);
/* Ambience = the real street sound of the same source (15:00 onward; the route starts at 15:45). One gain controller does all fades; WebAudio gain is used where available because iOS ignores audio.volume. */
const AVOL = 0.85, AOFF = 45; const aud = { g: 0, goal: 0, res: false, node: null };
const aWant = () => Math.min(Math.max(0, AOFF + pos()), 639);
function aInit() { if (aud.node) return; try { const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); const src = ctx.createMediaElementSource(audio); aud.node = ctx.createGain(); aud.node.gain.value = 0; src.connect(aud.node).connect(ctx.destination); aud.ctx = ctx; ctx.resume?.(); } catch (e) { aud.node = null; } }
function aTick(dt) { if (!soundOn || audio.paused) return; const drift = audio.currentTime - aWant(); if (!aud.res && Math.abs(drift) > (Math.abs(rate) > 0.6 ? 6 : 30)) { aud.res = true; aud.goal = 0; } if (aud.res && aud.g < 0.02) { audio.currentTime = aWant(); aud.res = false; aud.goal = AVOL; } aud.g += (aud.goal - aud.g) * Math.min(1, dt * (aud.goal < aud.g ? 4 : 1.6)); if (aud.node) { aud.node.gain.value = aud.g; if (aud.ctx.state === 'suspended') aud.ctx.resume(); } else audio.volume = Math.min(1, aud.g); }
const mkTex = v => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
let LO = 0, D = 0, rate = IDLE, target = IDLE, swapping = false, soundOn = false, frames = 0, lastAdv = performance.now(), quality = '4k', chunkSwaps = 0;
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
async function playSafe(v) { try { return await Promise.race([v.play().then(() => true), new Promise(r => setTimeout(() => r(!v.paused), 1500))]); } catch (e) { return false; } }
async function switchTo(tr) { if (swapping || tr === active) return; swapping = true; const p = pos();
  await tr.seek(tr === fwdT ? p : D - p); tr.el.playbackRate = Math.max(0.0625, Math.abs(rate)); await playSafe(tr.el); if (tr.el.readyState >= 2) { mat.map = tr.tex[tr.k]; mat.needsUpdate = true; }
  active.pauseAll(); active = tr; swapping = false; }

// input
const view = { face: 1, turn: 0, yaw: 0, pitch: 0, sy: 0, sp: 0, gyro: null, gyroYaw0: 0, lat: 0, latT: 0 };
let drag = null; const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const k = camera.fov / innerHeight * Math.PI / 180; view.yaw += (e.clientX - drag.x) * k; view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * k, -0.9, 1.3); drag.x = e.clientX; drag.y = e.clientY; });
cv.addEventListener('pointerup', () => drag = null);
const keys = {}; addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);
const joyEl = $('joy'), knob = $('knob'); let joy = { x: 0, y: 0, id: null };
joyEl.addEventListener('pointerdown', e => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); knob.style.transition = 'none'; e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId !== joy.id) return; const r = joyEl.getBoundingClientRect(); const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, L = Math.hypot(dx, dy) || 1, m = Math.min(1, L / 50) / L; joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * 35}px,${joy.y * 35}px)`; });
const joyEnd = e => { if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: null }; knob.style.transition = ''; knob.style.transform = ''; } }; joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
function enableGyro() { const on = () => addEventListener('deviceorientation', ev => { if (ev.alpha == null) return; const d = THREE.MathUtils.degToRad, o = d(screen.orientation?.angle || window.orientation || 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(ev.beta), d(ev.alpha), -d(ev.gamma), 'YXZ')).multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o));
    if (!view.gyro) { view.gyroYaw0 = view.yaw - new THREE.Euler().setFromQuaternion(q, 'YXZ').y; view.yaw = 0; view.pitch = 0; view.gyro = q; } else view.gyro.slerp(q, 0.35); });
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(p => p === 'granted' && on()).catch(() => {}); else on(); }
// buttons: hold to walk forward/back (no scene switching)
function hold(btn, val) { const set = v => e => { e.preventDefault(); e.stopPropagation(); btnTarget = v; }; btn.addEventListener('pointerdown', set(val)); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, set(null)); }
let btnTarget = null;
// turning around: you always walk the way you face. Facing back = the reversed footage, seen from behind the camera, so the street flows toward you naturally.
let lastTurn = 0; function turnAround() { const n = performance.now(); if (n - lastTurn < 900) return; lastTurn = n; try { navigator.vibrate?.(12); } catch (e) {} view.face = -view.face; $('hint').hidden = true; }
addEventListener('keydown', e => { if ((e.code === 'KeyS' || e.code === 'ArrowDown') && !e.repeat) turnAround(); });

(async () => {
  try {
    const r = await fetch(BASE + 'walk.json'); if (!r.ok) throw new Error('walk.json ' + r.status); const j = await r.json(); LO = params.has('full') ? 0 : (j.lo || 0) /* the source has an editorial fade at 277-280 s: the default route starts after it so the walk has no cut */; D = j.duration;
    const probe = document.createElement('video'), ua = navigator.userAgent, isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium|Android|FxiOS/.test(ua);
    const hevcOK = isSafari && probe.canPlayType('video/mp4; codecs="hvc1.1.6.L153.B0"') !== '';
    const c = navigator.connection || {}, weak = c.saveData || (c.downlink && c.downlink < 2.5) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
    quality = params.get('q') || (weak ? '2k5' : '4k'); if (!j.tracks[quality]) quality = '4k'; const F = j.tracks[quality];
    const urls = (t) => Array.from({ length: t.n }, (_, i) => BASE + t.pattern.replace('%02d', String(i).padStart(2, '0')));
    fwdT = new Track(urls(F), j.chunk, D); revT = new Track(urls(j.tracks.rev), j.chunk, D); active = fwdT;
    $('badge').innerHTML = `<b>Hội An</b> · real 360° street walk · <a href="CREDITS.md" target="_blank">Credits</a>`; setTimeout(() => $('badge').classList.add('fade'), 100);
    $('streetbar').hidden = false; $('slabel').textContent = j.name;
    $('turnR').textContent = 'Walk ▶'; $('turnL').textContent = '↺ Turn around'; $('turnL').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); turnAround(); }); hold($('turnR'), 'walk');
    $('reset').textContent = 'Face ahead'; $('reset').onclick = () => { view.yaw = 0; view.pitch = 0; };
    if (!j.tracks['2k5']) $('quality').hidden = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.pause(); active?.el.pause(); } else { if (soundOn) { aud.g = 0; aud.goal = AVOL; audio.currentTime = aWant(); audio.play().catch(() => {}); } if (active && !active.atEnd()) playSafe(active.el); } });
    $('quality').textContent = quality === '2k5' ? '2.5K' : '4K'; $('quality').onclick = () => { params.set('q', quality === '2k5' ? ('4k') : '2k5'); params.set('t', pos().toFixed(1)); location.search = params.toString(); };
    $('scene').textContent = 'More ▸'; $('scene').onclick = () => { location.search = '?scene=spots'; }; $('scene').title = '?scene=spots (6 tripod spots), ?scene=game, ?scene=live';
    $('hint').textContent = isMobile ? 'Push the stick up to walk · pull down to turn around · drag or turn your phone to look' : 'W / ↑: walk · S / ↓: turn around · Shift: jog · drag: look around';
    new THREE.TextureLoader().load(BASE + j.poster, t => { t.colorSpace = THREE.SRGBColorSpace; if (!frames) { mat.map = t; mat.needsUpdate = true; if (!window.__state.loaded) renderer.setAnimationLoop(() => renderer.render(scene, camera)); } });
    audio.src = BASE + j.audio;
    const prog = setInterval(() => { try { const v = fwdT.el, b = v.buffered.length ? v.buffered.end(0) - v.currentTime : 0; $('fill').style.width = Math.min(100, 15 + b / 2 * 85) + '%'; } catch (e) {} }, 200);
    $('loadmsg').textContent = 'Loading the street in ' + (quality === '2k5' ? '2.5K' : '4K') + '…';
    await fwdT.seek(Math.max(LO, +(params.get('t') || 0))); fwdT.el.playbackRate = IDLE;
    if (fwdT.el.error) throw new Error('video failed to load (' + (fwdT.el.error.code) + ')');
    clearInterval(prog); $('loader').hidden = true; document.body.classList.remove('loading'); $('hint').classList.add('fade'); window.__state.loaded = true; setSpin(true);
    if (!(await playSafe(fwdT.el))) showTap();
    let gyroOn = false;
    const onGesture = () => { $('tapstart').hidden = true; if (active.el.paused && !active.atEnd()) playSafe(active.el);
      if (!soundOn) { soundOn = true; aInit(); aud.g = 0; aud.goal = AVOL; audio.currentTime = aWant(); audio.play().catch(() => { soundOn = false; }); }
      if (!gyroOn && isMobile) { gyroOn = true; enableGyro(); } revT.seek(D - pos()).catch(() => {}); };
    $('tapstart').onclick = onGesture; for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, () => { if (!soundOn || (active.el.paused && !active.atEnd())) onGesture(); }, true);
    if (!isMobile) setTimeout(() => revT.seek(D - pos()).catch(() => {}), 3000);
  } catch (e) { showError('The walk could not start: ' + e.message + '\nPlease reload. (Older version: ?scene=spots)'); return; }
  let last = performance.now();
  renderer.setAnimationLoop(() => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; aTick(dt);
    let t = btnTarget === 'walk' ? WALK : null; const kf = keys.KeyW || keys.ArrowUp, jog = keys.ShiftLeft || keys.ShiftRight;
    if (joy.y > 0.75 && !view.joyTurned) { view.joyTurned = true; turnAround(); } else if (joy.y < 0.4) view.joyTurned = false;
    if (t == null) { if (kf) t = jog ? JOG : WALK; else if (joy.y < -0.15) { const m = (-joy.y - 0.15) / 0.85; t = m < 0.88 ? IDLE + (WALK - IDLE) * Math.pow(m / 0.88, 1.4) /* gentle start, full walk well before the rim */ : JOG; } }
    t = t == null ? IDLE : t * view.face; if (Math.abs(t) <= IDLE + 1e-6) t = IDLE; // standing: natural-looking forward footage at a slow drift
    target = t; rate += (target - rate) * Math.min(1, dt * 2.5);
    view.latT = (keys.KeyA ? -1 : keys.KeyD ? 1 : 0) + (Math.abs(joy.x) > 0.3 ? joy.x : 0); view.lat += (view.latT * 0.6 - view.lat) * Math.min(1, dt * 3);
    if (window.__state.loaded && !swapping) {
      const idle = Math.abs(target) < 0.5;
      // direction: walking back uses the reversed track; idle keeps the current track (and ping-pongs at the ends)
      let want = rate < -0.05 ? revT : rate > 0.3 ? fwdT : active; if (idle) want = (pos() >= D - 0.5) ? active : fwdT;
      if (want !== active && !(want === revT && pos() <= LO + 0.2) && !(want === fwdT && pos() >= D - 0.2)) switchTo(want);
      else if (active === revT && pos() <= LO + 0.1) { if (!active.el.paused) active.el.pause(); $('nodestatus').textContent = 'Start of the street · tap ↺ Turn around'; $('turnL').classList.add('pulse'); }
      else { const v = active.el, pr = Math.max(0.0625, Math.min(3, Math.abs(Math.abs(rate - target) < 0.1 ? target : rate))); if (Math.abs(v.playbackRate - pr) > 0.1 || (pr === Math.abs(target) && v.playbackRate !== pr)) v.playbackRate = pr; /* few rate changes: each one can cost a pipeline flush on some engines */ active.tick(pr);
        { const ae = pos() >= D - 0.5, as = pos() <= LO + 0.5, st = $('nodestatus'); if ((ae && view.face > 0) || (as && view.face < 0)) { st.textContent = (ae ? 'Inside the hall — end of the walk' : 'Start of the street') + ' · tap ↺ Turn around'; $('turnL').classList.add('pulse'); } else { $('turnL').classList.remove('pulse'); if (ae || as) st.textContent = 'Turned around · push up / W to walk'; else if (/Turn(ed)? around/.test(st.textContent)) st.textContent = ''; } } }
    }
    view.sy += (view.yaw - view.sy) * 0.18; view.sp += (view.pitch - view.sp) * 0.18; { const tt = view.face > 0 ? 0 : Math.PI - TURN_OFF(); view.turn += (tt - view.turn) * Math.min(1, dt * 2.2); } camera.quaternion.setFromEuler(new THREE.Euler(view.sp + 0.15 * view.turn / Math.PI /* facing back: lift gaze a little so the camera carrier sits below frame */, view.sy + view.turn, 0, 'YXZ'));
    if (view.gyro) camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.gyroYaw0)).multiply(view.gyro);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize(); camera.position.copy(right.multiplyScalar(view.lat));
    const edge = pos() >= D - 0.5 || pos() <= LO + 0.5, adv = now - lastAdv < 1500 || edge; $('live').textContent = adv ? (Math.abs(rate) > 0.5 && !edge ? (rate > 0 ? '● walking' : '● walking · turned around') : '● LIVE') + (soundOn ? '' : ' · tap for sound') : '○ loading';
    $('live').className = adv ? 'on' : ''; if (D) $('sfill').style.width = Math.max(0, (pos() - LO) / (D - LO) * 100) + '%';
    renderer.render(scene, camera); });
  setInterval(() => { if (!window.__state.loaded || swapping) return; const v = active.el; if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 2500 && !active.nudged) { active.nudged = true; v.currentTime = v.currentTime + 0.02; playSafe(v); lastAdv = performance.now(); return; } if (!v.paused && !active.atEnd() && performance.now() - lastAdv > 6000) { active.nudged = false; setSpin(true); $('nodestatus').textContent = 'Reconnecting…'; const p = pos(); active.loaded = [-1, -1]; active.seek(active === fwdT ? p : D - p).then(() => playSafe(active.el)); lastAdv = performance.now(); }
    else if (v.paused && !active.atEnd() && $('tapstart').hidden && !soundOn) showTap(); }, 1000);
})();
function showTap() { const t = $('tapstart'); t.textContent = '▶ Tap to start'; t.hidden = false; }
window.__test = { aud: () => ({ t: +audio.currentTime.toFixed(1), want: +aWant().toFixed(1), g: +aud.g.toFixed(2), paused: audio.paused, webaudio: !!aud.node, ctx: aud.ctx?.state }), turn: () => turnAround(), view: () => ({ face: view.face, turn: +view.turn.toFixed(2) }), setYaw: y => view.yaw = y, key: (c, d) => keys[c] = d, els: () => [fwdT, revT].flatMap(t => t.els.map((v, j) => ({ t: t === fwdT ? "f" : "r", j, act: j === t.k, src: v.src.split("/").pop(), p: v.paused, rs: v.readyState, ct: +v.currentTime.toFixed(2), pr: v.playbackRate, buf: v.buffered.length ? +v.buffered.end(v.buffered.length - 1).toFixed(1) : 0 }))), state: () => ({ pos: pos(), D, rate, target, dir: active === fwdT ? 'fwd' : 'rev', chunk: active?.ci, frames, chunkSwaps, paused: active?.el.paused, w: active?.el.videoWidth, q: quality, swapping, err: window.__viewerError || null }) };
