// "Live presence" Street-View-style scene: real, long, stationary 360° shots of Hội An played at native fps.
// No composited figures. Moving between spots = ground arrows / forward-back, with a Street-View-like zoom-blur crossfade.
import * as THREE from 'three';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const BASE = 'assets/presence/';
const showError = (m) => { $('loader').hidden = true; const e = $('error'); e.hidden = false; e.textContent = m; console.error('[viewer-error]', m); window.__viewerError = m; };
window.__state = { loaded: false };

const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); $('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(isMobile ? 80 : 75, innerWidth / innerHeight, 0.1, 100);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// two spheres: current spot and the one fading in (crossfade + zoom-blur during transitions)
const sphGeo = new THREE.SphereGeometry(50, 96, 48); sphGeo.scale(-1, 1, 1);
const mkMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.FrontSide,
  uniforms: { map: { value: null }, opacity: { value: 1 }, blur: { value: 0 }, dir: { value: new THREE.Vector3(0, 0, -1) } },
  vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D map; uniform float opacity, blur; uniform vec3 dir; varying vec2 vUv; varying vec3 vP;
    void main(){ vec3 c = vec3(0.0); if (blur < 0.001) c = texture2D(map, vUv).rgb; else {
      vec2 f = vec2(0.5 + atan(dir.x, -dir.z) / 6.2831853 * -1.0, 0.5 + asin(clamp(dir.y,-1.0,1.0)) / 3.14159265); // focus point in uv
      vec2 d = vUv - f; d.x = d.x - floor(d.x + 0.5);
      for (int i = 0; i < 12; i++) { float k = 1.0 - blur * float(i) / 12.0 * 0.35; vec2 u = f + d * k; u.x = fract(u.x); c += texture2D(map, u).rgb; } c /= 12.0; }
      gl_FragColor = vec4(c, opacity);
      #include <colorspace_fragment>
    }` });
const sA = new THREE.Mesh(sphGeo, mkMat()), sB = new THREE.Mesh(sphGeo, mkMat()); sA.renderOrder = 0; sB.renderOrder = 1; sB.visible = false; scene.add(sA, sB);

// ground arrows (Street-View style)
const arrowGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0.55); s.lineTo(0.45, 0); s.lineTo(0.2, 0); s.lineTo(0.2, -0.45); s.lineTo(-0.2, -0.45); s.lineTo(-0.2, 0); s.lineTo(-0.45, 0); s.closePath(); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })();
const arrows = new THREE.Group(); scene.add(arrows);
function makeArrow(yaw, to, label) { const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
  const g = new THREE.Group(); g.add(m); m.position.set(0, -1.55, -3.4); m.rotation.y = 0; g.rotation.y = yaw; g.userData = { to, label }; m.userData.to = to; m.renderOrder = 5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false })); ring.position.copy(m.position); ring.renderOrder = 4; g.add(ring);
  arrows.add(g); return g; }

// view state
const view = { yaw: 0, pitch: 0, fov: camera.fov, gyro: null }; let spots = [], cur = -1, busy = false, quality = 'hi', started = false;
function setDir() { camera.quaternion.setFromEuler(new THREE.Euler(view.pitch, view.yaw, 0, 'YXZ')); if (view.gyro) camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.gyroYaw0)).multiply(view.gyro); }

// video elements: one per sphere; loop with a crossfade from a frozen frame (the shots are 1.2–2.5 min; no short loop)
function mkVideo() { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.muted = true; return v; }
const vids = [mkVideo(), mkVideo()]; let front = 0;
const tex = vids.map(v => { const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; });
const freezeCanvas = document.createElement('canvas'), freezeTex = new THREE.CanvasTexture(freezeCanvas); freezeTex.colorSpace = THREE.SRGBColorSpace;
let loopFade = 0, stalls = [];
function srcFor(s) { return BASE + s.files[quality]; }
function loadInto(i, s) { return new Promise((res, rej) => { const v = vids[i]; let done = false; const ok = () => { if (!done) { done = true; res(); } };
  v.onerror = () => rej(new Error('video failed: ' + srcFor(s))); v.src = srcFor(s); v.currentTime = 0; v.addEventListener('loadeddata', ok, { once: true }); v.load(); setTimeout(ok, 20000); }); }
function poster(s) { return new Promise(r => new THREE.TextureLoader().load(BASE + s.poster, t => { t.colorSpace = THREE.SRGBColorSpace; r(t); }, undefined, () => r(null))); }

async function go(idx, viaYaw) {
  if (busy || idx === cur || idx < 0 || idx >= spots.length) return; busy = true; const s = spots[idx], first = cur < 0;
  $('slabel').textContent = `${idx + 1}/${spots.length} · ${s.name}`; $('nodestatus').textContent = 'loading…';
  const back = 1 - front, pt = await poster(s); sB.material.uniforms.map.value = pt || tex[back]; sB.material.uniforms.opacity.value = 0; sB.visible = true; sB.rotation.y = s.yaw0;
  const pLoad = loadInto(back, s).catch(e => { showError('Could not load this spot\'s 360° video (' + e.message + '). Check the connection and reload.'); });
  // Street-View-like move: zoom + radial blur on the old view, crossfade to the new spot
  const t0 = performance.now(), D = first ? 400 : 750, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  sA.material.uniforms.dir.value.copy(dir).applyAxisAngle(new THREE.Vector3(0, 1, 0), -sA.rotation.y); sB.material.uniforms.dir.value.copy(sA.material.uniforms.dir.value);
  await new Promise(r => { const step = () => { const k = Math.min(1, (performance.now() - t0) / D), e = k * k * (3 - 2 * k);
    sA.material.uniforms.blur.value = first ? 0 : e; camera.fov = view.fov - (first ? 0 : 22 * Math.sin(e * Math.PI)); camera.updateProjectionMatrix();
    sB.material.uniforms.opacity.value = e; sB.material.uniforms.blur.value = first ? 0 : (1 - e) * 0.8; if (k < 1) requestAnimationFrame(step); else r(); }; step(); });
  // swap
  sA.material.uniforms.map.value = sB.material.uniforms.map.value; sA.rotation.y = sB.rotation.y; sA.material.uniforms.blur.value = 0; sB.visible = false;
  vids[front].pause(); vids[front].removeAttribute('src'); vids[front].load(); front = back; cur = idx;
  await pLoad; const v = vids[front]; v.muted = !started; if (started) await v.play().catch(() => {}); if (v.readyState >= 2) sA.material.uniforms.map.value = tex[front];
  v.onplaying = () => { sA.material.uniforms.map.value = tex[front]; $('nodestatus').textContent = ''; }; v.onwaiting = () => { $('nodestatus').textContent = 'buffering…'; stalls.push(performance.now()); };
  arrows.clear(); for (const l of s.links) { const a = makeArrow(l.yaw, l.to); } busy = false; window.__state.spot = idx;
  history.replaceState(null, '', '?' + new URLSearchParams({ ...Object.fromEntries(params), spot: s.id }).toString());
}
function nearestLink(fwd) { const s = spots[cur]; if (!s) return; let best = null, bd = 9; for (const l of s.links) { let d = Math.abs(Math.atan2(Math.sin(l.yaw - (view.yaw + (fwd ? 0 : Math.PI))), Math.cos(l.yaw - (view.yaw + (fwd ? 0 : Math.PI))))); if (d < bd) { bd = d; best = l; } } if (best && bd < 1.4) go(best.to); else if (best && fwd === null) go(best.to); }

// loop handling: shot length is multi-minute; at the end freeze the last frame and dissolve into the restart (not under ~70 s, never a short loop)
function loopCheck() { const v = vids[front]; if (!v.duration || busy) return; if (v.currentTime > v.duration - 0.6 && loopFade === 0) {
  freezeCanvas.width = Math.min(2048, v.videoWidth); freezeCanvas.height = freezeCanvas.width / 2; freezeCanvas.getContext('2d').drawImage(v, 0, 0, freezeCanvas.width, freezeCanvas.height); freezeTex.needsUpdate = true;
  sB.material.uniforms.map.value = freezeTex; sB.rotation.y = sA.rotation.y; sB.material.uniforms.opacity.value = 1; sB.material.uniforms.blur.value = 0; sB.visible = true; v.currentTime = 0.05; v.play().catch(() => {}); loopFade = performance.now(); window.__state.loops = (window.__state.loops || 0) + 1; }
  if (loopFade) { const k = (performance.now() - loopFade) / 1500; sB.material.uniforms.opacity.value = 1 - Math.min(1, k); if (k >= 1) { loopFade = 0; sB.visible = false; } } }

// input: drag look, wheel/pinch zoom, WASD/arrows, joystick, gyro, tap arrows
let drag = null; const cv = renderer.domElement; const ray = new THREE.Raycaster();
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; const k = camera.fov / innerHeight * Math.PI / 180; view.yaw += (e.clientX - drag.x) * k; view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - drag.y) * k, -1.0, 1.3); drag.x = e.clientX; drag.y = e.clientY; });
cv.addEventListener('pointerup', e => { if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) { // tap: arrow hit?
    ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera); const h = ray.intersectObjects(arrows.children, true)[0]; if (h) { let o = h.object; while (o && o.userData.to === undefined) o = o.parent; if (o) go(o.userData.to); } }
  drag = null; });
cv.addEventListener('wheel', e => { view.fov = THREE.MathUtils.clamp(view.fov + e.deltaY * 0.03, 35, 95); camera.fov = view.fov; camera.updateProjectionMatrix(); }, { passive: true });
const keys = {}; addEventListener('keydown', e => { keys[e.code] = true; if (['KeyW', 'ArrowUp'].includes(e.code)) nearestLink(true); if (['KeyS', 'ArrowDown'].includes(e.code)) nearestLink(false); }); addEventListener('keyup', e => keys[e.code] = false);
const joyEl = $('joy'), knob = $('knob'); let joy = { x: 0, y: 0, id: null, fired: false };
joyEl.addEventListener('pointerdown', e => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId !== joy.id) return; const r = joyEl.getBoundingClientRect(); let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; const m = Math.min(1, Math.hypot(dx, dy) / 50) / (Math.hypot(dx, dy) || 1); joy.x = dx * m; joy.y = dy * m; knob.style.transform = `translate(${joy.x * 35}px,${joy.y * 35}px)`;
  if (!joy.fired && Math.abs(joy.y) > 0.7) { joy.fired = true; nearestLink(joy.y < 0); } });
const joyEnd = e => { if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: null, fired: false }; knob.style.transform = ''; } }; joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
function enableGyro() { const on = () => addEventListener('deviceorientation', ev => { if (ev.alpha == null) return; const z = THREE.MathUtils.degToRad(ev.alpha), x = THREE.MathUtils.degToRad(ev.beta), y = THREE.MathUtils.degToRad(ev.gamma), o = THREE.MathUtils.degToRad(screen.orientation?.angle || window.orientation || 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, z, -y, 'YXZ')).multiply(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -o));
    if (!view.gyro) { view.gyroYaw0 = view.yaw - new THREE.Euler().setFromQuaternion(q, 'YXZ').y; view.yaw = 0; view.pitch = 0; } view.gyro = q; });
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(p => p === 'granted' && on()).catch(() => {}); else on(); }

// boot
(async () => {
  try {
    $('badge').innerHTML = '<b>Hội An, real 360° footage.</b> Real tripod shots (1.8–2.5 min each) played in real time with their own sound; nothing added. Drag to look around · arrows on the ground or ↑/↓ to move between spots. <a href="CREDITS.md" target="_blank">Credits</a>';
    $('streetbar').hidden = false; $('turnL').textContent = '◀ Back'; $('turnR').textContent = 'Forward ▶'; $('turnL').onclick = () => nearestLink(false); $('turnR').onclick = () => nearestLink(true);
    $('reset').onclick = () => { view.yaw = 0; view.pitch = 0; view.fov = camera.fov = isMobile ? 80 : 75; camera.updateProjectionMatrix(); };
    $('quality').textContent = 'Quality: auto'; $('quality').onclick = () => { quality = quality === 'hi' ? 'lo' : 'hi'; $('quality').textContent = 'Quality: ' + (quality === 'hi' ? 'HD' : 'SD'); const s = cur; cur = -1; go(s); };
    $('scene').textContent = '3D game street ▸'; $('scene').onclick = () => { location.search = '?scene=game'; }; $('scene').title = 'Other scenes: ?scene=game, ?scene=live';
    $('hint').textContent = isMobile ? 'Drag or turn your phone to look · joystick up/down or the ground arrows to move' : 'Drag to look · scroll to zoom · W/↑ forward, S/↓ back, or click the ground arrows';
    $('loadmsg').textContent = 'Loading spots…'; const r = await fetch(BASE + 'spots.json'); if (!r.ok) throw new Error('spots.json ' + r.status); const j = await r.json(); spots = j.spots;
    quality = params.get('q') || (isMobile || (navigator.connection && navigator.connection.downlink < 3) ? 'lo' : 'hi');
    const start = Math.max(0, spots.findIndex(s => s.id === params.get('spot'))); $('fill').style.width = '40%';
    await go(start); $('fill').style.width = '100%'; $('loader').hidden = true; window.__state.loaded = true;
    const tap = $('tapstart'); tap.textContent = '▶ Tap to be there (with sound)'; tap.hidden = false;
    tap.onclick = async () => { tap.hidden = true; started = true; const v = vids[front]; v.muted = false; await v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); if (isMobile) enableGyro(); };
    if (params.get('autoplay')) tap.onclick();
  } catch (e) { showError('The 360° street could not start: ' + e.message + '\nReload, or try the 3D street: ?scene=game'); return; }
  renderer.setAnimationLoop(() => { setDir(); loopCheck(); arrows.rotation.y = 0;
    for (const a of arrows.children) { const d = Math.atan2(Math.sin(a.rotation.y - view.yaw), Math.cos(a.rotation.y - view.yaw)); a.children.forEach(m => m.material.opacity = (m.geometry === arrowGeo ? 0.9 : 0.35) * (Math.abs(d) < 1.2 ? 1 : 0.55)); }
    const now = performance.now(); stalls = stalls.filter(t => now - t < 15000); if (stalls.length >= 3 && quality === 'hi' && !busy) { stalls = []; quality = 'lo'; $('quality').textContent = 'Quality: SD (auto)'; const v = vids[front], t = v.currentTime; const s = cur; cur = -1; go(s).then(() => { vids[front].currentTime = t; }); }
    renderer.render(scene, camera); });
})();
window.__test = { seek: t => { vids[front].currentTime = t; }, setYaw: y => view.yaw = y, go: i => go(i), state: () => ({ spot: cur, t: vids[front].currentTime, dur: vids[front].duration, paused: vids[front].paused, q: quality, w: vids[front].videoWidth, loops: window.__state.loops || 0 }) };
