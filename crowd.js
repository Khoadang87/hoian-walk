// ?crowd=1 experiment. When you stop:
//  1. the frozen frame is snapped (<=0.6 s) to the nearest precomputed stop point (two per 2 s of route);
//  2. the real people in it are covered by a clean patch (filled from neighbouring frames, LaMa for leftovers);
//  3. over the patch, those same real people keep moving: cut-outs of them from the next ~4 s of footage, anchored to the
//     floor with the camera's own motion removed, all packed in ONE colour-over-alpha H.264 atlas video (one decoder);
//  4. as their footage runs out they fade, and AI-generated people take over (no loops of the real ones).
// iOS: all videos are detached, muted, inline, from a pool of 4 primed on the first tap.
const FLOOR = -1.6, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
export async function initCrowd(THREE, o) {
  const { scene, camera, sphere, geo, isStanding, pos, snapTo, renderer, ver = '' } = o; const V = ver ? '?v=' + ver : '';
  const dbg = { errs: [], gap: null, mode: '-', tex: '', fi: '-' }; const err = e => { dbg.errs.push(String(e).slice(0, 80)); if (dbg.errs.length > 4) dbg.errs.shift(); };
  const POOL = 4, pool = []; let primed = false;
  for (let i = 0; i < POOL; i++) { const v = document.createElement('video'); v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.addEventListener('error', () => err('video ' + (v.error && v.error.code) + ' ' + (v.src || '').split('/').pop().split('?')[0])); pool.push({ v, busy: false }); }
  const prime = () => { if (primed) return; primed = true; for (const s of pool) { s.v.src = 'assets/crowd/L1.mp4' + V; const pr = s.v.play(); pr && pr.then(() => { if (!s.busy) s.v.pause(); }).catch(e => err('prime ' + e.name)); } };
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, prime, { capture: true, passive: true });
  const takeSlot = () => { const s = pool.find(s => !s.busy); if (s) { s.busy = true; s.v.onended = null; } return s; };
  const freeSlot = s => { if (!s) return; s.v.pause(); s.v.onended = null; s.busy = false; };
  const maxTex = renderer ? renderer.capabilities.maxTextureSize : 4096; dbg.tex = 'maxTex ' + maxTex;
  const J = u => fetch(u + V, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  const [clips, idx] = await Promise.all([J('assets/crowd/clips.json'), J('assets/real/index.json')]);
  const free = idx.free || {}, freeP = Object.keys(free).map(Number), stops = idx.stops, FPS = idx.fps, S1 = idx.s1;
  const still = clips.filter(c => c.kind !== 'walk'), walkers = clips.filter(c => c.kind === 'walk'); const recent = [];
  const rot = sphere.rotation; const toWorld = (x, z) => new THREE.Vector3(x, FLOOR, z).applyEuler(rot).setY(FLOOR); // floor coords of the equirect -> world
  // patch sphere (same geometry as the video sphere), alpha from a soft mask
  const pmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const pmesh = new THREE.Mesh(geo, pmat); pmesh.rotation.copy(rot); pmesh.renderOrder = 1; pmesh.visible = false; scene.add(pmesh);
  const loader = new THREE.TextureLoader();
  const loadTex = (u, color = true) => new Promise(res => loader.load(u + V, t => {
    const im = t.image; if (im && Math.max(im.width, im.height) > maxTex) { const c = document.createElement('canvas'), k = maxTex / Math.max(im.width, im.height); c.width = im.width * k | 0; c.height = im.height * k | 0; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); t.image = c; }
    if (color) t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; res(t); }, undefined, () => { err('tex ' + u.split('/').pop()); res(null); }));
  const floorPoint = (u, v) => { const ph = u * 2 * Math.PI, th = v * Math.PI; const d = new THREE.Vector3(Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)).applyEuler(rot); if (d.y > -0.03) return null; return d.multiplyScalar(-1.6 / d.y).setY(FLOOR); };
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  // generated people: colour (premultiplied) over alpha, tinted to the scene
  const fsGen = `uniform sampler2D map; uniform float op; uniform float flip; uniform vec3 tint; varying vec2 vUv;
    void main(){ vec2 u = vec2(flip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y); vec3 c = texture2D(map, vec2(u.x, 0.5 + u.y * 0.5)).rgb; float a = texture2D(map, vec2(u.x, u.y * 0.5)).r;
      a = smoothstep(0.1, 0.9, a); c = c / max(a, 0.04); float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 0.9) * tint; c = (c - 0.5) * 0.92 + 0.5;
      gl_FragColor = vec4(clamp(c,0.0,1.0), a * op); }`;
  // real people: one cell (rect) of the atlas; colour in the top half, matte in the bottom half
  const fsReal = `uniform sampler2D map; uniform float op; uniform vec4 rect; uniform vec2 asz; varying vec2 vUv;
    void main(){ float x = (rect.x + vUv.x * rect.z) / asz.x; float y = rect.y + (1.0 - vUv.y) * rect.w;
      vec3 c = texture2D(map, vec2(x, 1.0 - y / (2.0 * asz.y))).rgb; float a = texture2D(map, vec2(x, 1.0 - (y + asz.y) / (2.0 * asz.y))).r;
      a = smoothstep(0.15, 0.85, a); gl_FragColor = vec4(c / max(a, 1.0), a * op); }`;
  const people = [], reals = []; let cur = null, plateOp = 0, phase = 'walk', standT = 0, nextWalker = 0, busy = false, fadeIn = 0.3, patchOn = false, realSlot = null, realDone = false;
  const hfov = () => 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
  const inView = p => { const d = p.clone().sub(camera.position).normalize(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); return Math.acos(Math.max(-1, Math.min(1, d.x * f.x + d.z * f.z) / Math.hypot(f.x, f.z) / Math.hypot(d.x, d.z))) < hfov() / 2 + 0.15; };
  function make(C, at, tint) {
    const slot = takeSlot(); if (!slot) return null; const v = slot.v; v.loop = C.kind !== 'walk'; v.src = 'assets/crowd/' + C.src + V; v.load();
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const h = C.m, w = h * C.w / C.h2, g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, op: { value: 0 }, flip: { value: 0 }, tint: { value: new THREE.Vector3(...tint) } }, vertexShader: vs, fragmentShader: fsGen, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 10; mesh.position.copy(at);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.15, Math.max(0.45, w * 0.5)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 9; sh.position.copy(at).setY(FLOOR + 0.01); scene.add(sh); scene.add(mesh);
    const p = { slot, C, v, tex, mesh, sh, mat, op: 0, start: at.clone(), dir: null, done: false }; if (!v.loop) v.onended = () => { p.done = true; };
    if (v.loop) v.addEventListener('loadedmetadata', () => { try { v.currentTime = rnd(0, C.dur - 0.5); } catch (e) {} }, { once: true });
    people.push(p); v.play().catch(e => err('play ' + e.name)); return p;
  }
  function kill(p) { freeSlot(p.slot); p.tex.dispose(); p.mesh.geometry.dispose(); p.mat.dispose(); p.sh.geometry.dispose(); p.sh.material.dispose(); scene.remove(p.mesh); scene.remove(p.sh); }
  const spotsOf = sp => sp.map(([u, v]) => floorPoint(u, v)).filter(q => q && Math.hypot(q.x - camera.position.x, q.z - camera.position.z) > 2.6 && Math.hypot(q.x, q.z) < 16);
  const order = arr => arr.slice().sort((a, b) => (recent.includes(a.src) - recent.includes(b.src)) || Math.random() - 0.5);
  const freeAt = t => { const ks = freeP.filter(k => free[k].length >= 2); const k = ks.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a, ks[0]); return free[k] || []; };
  function populate(c) {
    const sp = spotsOf(c.spots).sort(() => Math.random() - 0.5); const taken = [];
    for (const C of order(still)) { if (taken.length >= Math.min(2, sp.length)) break; const at = sp.find(q => taken.every(t => t.distanceTo(q) > 1.4)); if (!at) break; if (!make(C, at, c.tint)) break; taken.push(at); recent.push(C.src); }
    while (recent.length > 8) recent.shift(); nextWalker = performance.now() / 1000 + rnd(0.5, 2.5);
  }
  function spawnWalker(c) {
    const sp = spotsOf(c.spots); if (!sp.length) return; const C = order(walkers).find(x => !people.some(p => p.C === x)); if (!C) return;
    const at = pick(sp); const ray = at.clone().sub(camera.position).setY(0).normalize(); let dir = new THREE.Vector3(-ray.z, 0, ray.x);
    const len = C.speed * C.dur; let s0 = at.clone().addScaledVector(dir, -len / 2);
    if (inView(s0)) { dir.negate(); s0 = at.clone().addScaledVector(dir, -len / 2); } if (inView(s0)) return;
    const p = make(C, s0, c.tint); if (!p) return; p.dir = dir; p.op = 1; recent.push(C.src);
  }
  // ---- real people ----
  const planeG = new THREE.PlaneGeometry(1, 1); planeG.translate(0, 0.5, 0);
  function clearReals() { for (const r of reals) { scene.remove(r.mesh); r.mat.dispose(); } reals.length = 0; if (cur?.vtex) cur.vtex.dispose(); freeSlot(realSlot); realSlot = null; }
  const seekReady = (v, t) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('atlas timeout rs' + v.readyState)), 6000); const go = () => { v.removeEventListener('loadeddata', go); const done = () => { clearTimeout(to); res(); }; if (Math.abs(v.currentTime - t) < 0.02 && v.readyState >= 2) done(); else { v.addEventListener('seeked', done, { once: true }); v.currentTime = t; } }; if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go); });
  async function showStop() {
    busy = true; prime(); const s = pos();
    let best = null; for (const g of stops) for (const k of [0, S1]) { const q = g + k / FPS; if (!best || Math.abs(q - s) < Math.abs(best.q - s)) best = { g, k, q }; }
    dbg.gap = best ? Math.abs(best.q - s) : null; const tint = idx.tint?.[best?.g] || [1, 0.97, 0.93];
    if (best && dbg.gap <= 0.6) {
      try {
        const name = best.q.toFixed(2); const slot = takeSlot(); if (!slot) throw new Error('no video slot');
        realSlot = slot; const v = slot.v; v.loop = false; v.src = `assets/real/r${best.g}.mp4` + V; v.load();
        const [meta, ptex, atex] = await Promise.all([J(`assets/real/r${best.g}.json`), loadTex(`assets/real/p${name}.jpg`), loadTex(`assets/real/p${name}_a.jpg`, false), seekReady(v, best.k / FPS + 0.001)]);
        if (!ptex || !atex) throw new Error('patch missing');
        if (!isStanding()) { freeSlot(slot); realSlot = null; busy = false; return; }
        await snapTo(best.q); // <= 0.6 s: the frozen frame becomes exactly the stop point's frame
        if (!isStanding()) { freeSlot(slot); realSlot = null; busy = false; return; }
        const vtex = new THREE.VideoTexture(v); vtex.colorSpace = THREE.SRGBColorSpace; vtex.minFilter = THREE.LinearFilter; vtex.generateMipmaps = false;
        const R = meta.cam[best.k], cs = R[0], sn = R[1]; // stop-point frame k -> atlas frame-0 coords; invert for positions
        for (const tr of meta.tracks) {
          const last = tr.s + tr.f.length - 1; if (tr.s > best.k || last < best.k + 3) continue; // only people who are in the frozen frame
          const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: vtex }, op: { value: 1 }, rect: { value: new THREE.Vector4() }, asz: { value: new THREE.Vector2(meta.aw, meta.ah) } }, vertexShader: vs, fragmentShader: fsReal, transparent: true, depthTest: false, depthWrite: false });
          const mesh = new THREE.Mesh(planeG, mat); scene.add(mesh); reals.push({ tr, mat, mesh, last, op: 1 });
        }
        const loc = (x, z) => { const dx = x - R[2], dz = z - R[3]; return [cs * dx + sn * dz, -sn * dx + cs * dz]; };
        cur = { ...best, meta, loc, vtex, spots: freeAt(best.q), tint, real: true };
        pmat.map = ptex; pmat.alphaMap = atex; pmat.needsUpdate = true; patchOn = true; fadeIn = 0.3; realDone = false;
        cur.playT = performance.now() / 1000; cur.lastCT = -1; cur.retried = false; placeReals(); v.play().catch(e => err('atlas play ' + e.name)); dbg.mode = 'real'; phase = 'stop'; busy = false; return;
      } catch (e) { err(e.message || e); clearReals(); }
    }
    // no stop point here (or it failed): generated people on spots clear of real people in the frozen frame
    cur = { q: s, spots: freeAt(s), tint, real: false }; dbg.mode = 'frozen+people'; patchOn = false; realDone = true; populate(cur); phase = 'stop'; busy = false;
  }
  function placeReals() {
    if (!cur?.real) return; const v = realSlot?.v; const fi = Math.max(cur.k, Math.floor((v ? v.currentTime : 0) * FPS + 0.01)); dbg.fi = fi;
    const c = camera.position; let alive = 0;
    for (const r of reals) {
      const i = Math.min(fi, r.last) - r.tr.s, f = r.tr.f[Math.max(0, i)]; if (!f) continue;
      const [x, z] = cur.loc(f[0], f[1]); const w = toWorld(x, z); r.mesh.position.copy(w); r.mesh.scale.set(f[3], f[2], 1);
      r.mesh.rotation.y = Math.atan2(c.x - w.x, c.z - w.z); r.mesh.renderOrder = 20 - Math.min(19, Math.hypot(x, z) / 2); // nearer on top
      r.mat.uniforms.rect.value.set(f[4], f[5], f[6], f[7]);
      const left = (r.last - fi) / FPS; r.op = Math.max(0, Math.min(1, left / 0.45)); // fade over the last ~0.45 s of their footage
      r.mat.uniforms.op.value = r.op * (phase === 'leaving' ? plateOp : 1); if (r.op > 0) alive++;
    }
    if (!realDone && v) { // watchdog: if the atlas never advances (decoder refused / stalled), retry once, then hand over to generated people
      const now = performance.now() / 1000; if (v.currentTime > cur.lastCT + 0.01) { cur.lastCT = v.currentTime; cur.playT = now; }
      else if (now - cur.playT > 2 && !cur.retried) { cur.retried = true; err('atlas stalled, retry'); v.play().catch(e => err('atlas replay ' + e.name)); }
      else if (now - cur.playT > 4) { err('atlas stalled, handing over'); dbg.mode = 'real-stalled'; for (const r of reals) r.op = 0; alive = 0; }
    }
    if (!realDone && (alive === 0 || (v && v.ended))) { realDone = true; clearReals(); populate(cur); } // generated people take over, no loop of the real ones
  }
  const dEl = new URLSearchParams(location.search).get('debug') === '1' ? Object.assign(document.createElement('pre'), { id: 'crowddbg' }) : null;
  if (dEl) { dEl.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;margin:0;padding:6px 8px;background:rgba(0,0,0,.65);color:#9f9;font:11px/1.35 monospace;pointer-events:none;white-space:pre;max-width:94vw;overflow:hidden;border-radius:6px'; document.body.appendChild(dEl); addEventListener('error', e => err(e.message)); addEventListener('unhandledrejection', e => err(e.reason)); }
  let dT = 0;
  return {
    update(dt) {
      const st = isStanding(), now = performance.now() / 1000; standT = st ? standT + dt : 0;
      if (dEl && (dT += dt) > 0.25) { dT = 0; dEl.textContent = `crowd ${ver} ${phase} ${st ? 'STOPPED' : 'walking'} pos ${pos().toFixed(2)}\nmode ${dbg.mode} stop ${cur ? (cur.g ?? '-') + '+' + (cur.k ?? '-') : '-'} gap ${dbg.gap == null ? '-' : dbg.gap.toFixed(2)} op ${plateOp.toFixed(2)}\nreal ${reals.length} fi ${dbg.fi} atlas ${realSlot ? realSlot.v.readyState + (realSlot.v.paused ? 'P' : '>') + realSlot.v.currentTime.toFixed(2) : '-'}\nprimed ${primed} gen ${people.length}: ${people.map(p => p.C.src.replace('.mp4', '') + ':' + p.v.readyState + (p.v.paused ? 'P' : '>')).join(' ')}\n${dbg.tex} stops ${stops.length}\n${dbg.errs.join('\n')}`; }
      if (phase === 'walk' && st && standT > 0.3 && !busy) { phase = 'loading'; showStop().then(() => { if (phase === 'loading') phase = 'walk'; }); }
      if (!st && phase !== 'walk') phase = 'leaving';
      const goal = phase === 'stop' ? 1 : 0; plateOp += Math.sign(goal - plateOp) * Math.min(Math.abs(goal - plateOp), dt / (goal ? fadeIn : 0.25));
      pmat.opacity = patchOn ? (phase === 'stop' ? 1 : plateOp) : 0; pmesh.visible = patchOn && pmat.opacity > 0; // the patch matches the frozen frame exactly, so no slow fade needed
      if (phase === 'leaving' && plateOp <= 0) { pmesh.visible = false; patchOn = false; clearReals(); for (const p of people) kill(p); people.length = 0; phase = 'walk'; cur = null; }
      if (phase === 'stop' || phase === 'leaving') placeReals();
      if (!st && realSlot && !realSlot.v.paused) realSlot.v.pause();
      if (phase === 'stop' && realDone && cur && now > nextWalker && people.filter(p => p.dir).length < 1) { spawnWalker(cur); nextWalker = now + rnd(3, 7); }
      for (const p of [...people]) {
        if (p.dir) {
          const t = p.v.currentTime || 0, f = Math.min(p.C.off.length - 1, Math.round(t * 24));
          const right = new THREE.Vector3(Math.cos(p.mesh.rotation.y), 0, -Math.sin(p.mesh.rotation.y)); const s = Math.sign(p.dir.dot(right)) || 1;
          p.mat.uniforms.flip.value = s === p.C.face ? 0 : 1; const drift = p.C.off[f] * (s === p.C.face ? 1 : -1);
          p.mesh.position.copy(p.start).addScaledVector(p.dir, p.C.speed * t).addScaledVector(right, -drift); p.sh.position.copy(p.mesh.position).setY(FLOOR + 0.01);
          if (p.done) { p.op -= dt / 0.3; if (p.op <= 0) { kill(p); people.splice(people.indexOf(p), 1); continue; } }
        } else p.op = Math.min(1, p.op + dt / 0.6); // generated people fade in gently after the real ones fade out
        const op = Math.min(p.op, plateOp); p.mat.uniforms.op.value = op; p.sh.material.opacity = 0.55 * op;
        const c = camera.position; p.mesh.rotation.y = Math.atan2(c.x - p.mesh.position.x, c.z - p.mesh.position.z);
        if (!st && !p.v.paused) p.v.pause();
      }
    },
    count: () => people.length + reals.length, reals: () => reals.length, phase: () => phase, plate: () => cur?.q, mode: () => dbg.mode,
  };
}
