// ?crowd=1 experiment. When you stop: the frozen video frame is swapped for a precomputed "clean plate" (same spot, real people
// removed by segmentation + inpainting), then made-up AI-generated people are placed where real people stood in that plate.
// Clips are H.264 with colour in the top half and the alpha matte in the bottom half (works on iOS Safari).
const FLOOR = -1.6, rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
export async function initCrowd(THREE, o) {
  const { scene, camera, sphere, geo, isStanding, pos, snapTo } = o;
  const [clips, pj] = await Promise.all([fetch('assets/crowd/clips.json').then(r => r.json()), fetch('assets/plates/plates.json').then(r => r.json())]); const plates = pj.plates || pj;
  const still = clips.filter(c => c.kind !== 'walk'), walkers = clips.filter(c => c.kind === 'walk');
  const recent = []; // clips seen at the last stops, avoided so the same person does not come straight back
  // plate sphere: same geometry (incl. the floor proxy), drawn over the video
  const pmat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const pmesh = new THREE.Mesh(geo, pmat); pmesh.rotation.copy(sphere.rotation); pmesh.renderOrder = 1; pmesh.visible = false; scene.add(pmesh);
  const loader = new THREE.TextureLoader(); const texCache = new Map();
  const loadPlate = pl => { if (!texCache.has(pl.img)) texCache.set(pl.img, new Promise(res => loader.load('assets/plates/' + pl.img, t => { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; res(t); }, undefined, () => res(null)))); return texCache.get(pl.img); };
  const nearest = p => plates.reduce((a, b) => Math.abs(b.p - p) < Math.abs(a.p - p) ? b : a);
  // equirect (u,v) of a plate pixel -> point on the floor in world space (same maths as three's SphereGeometry + scale(-1,1,1) + sphere rotation)
  const floorPoint = (u, v) => { const ph = u * 2 * Math.PI, th = v * Math.PI; const d = new THREE.Vector3(Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)).applyEuler(sphere.rotation); if (d.y > -0.03) return null; return d.multiplyScalar(-1.6 / d.y).setY(FLOOR); };
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const fs = `uniform sampler2D map; uniform float op; uniform float flip; uniform vec3 tint; varying vec2 vUv;
    void main(){ vec2 u = vec2(flip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y); vec3 c = texture2D(map, vec2(u.x, 0.5 + u.y * 0.5)).rgb; float a = texture2D(map, vec2(u.x, u.y * 0.5)).r;
      a = smoothstep(0.1, 0.9, a); c = c / max(a, 0.04); float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 0.9) * tint; c = (c - 0.5) * 0.92 + 0.5;
      gl_FragColor = vec4(clamp(c,0.0,1.0), a * op); }`;
  const people = []; let plate = null, plateOp = 0, phase = 'walk', standT = 0, nextWalker = 0, busy = false;
  const hfov = () => 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
  const inView = p => { const d = p.clone().sub(camera.position).normalize(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); return Math.acos(Math.max(-1, Math.min(1, d.x * f.x + d.z * f.z) / Math.hypot(f.x, f.z) / Math.hypot(d.x, d.z))) < hfov() / 2 + 0.15; };
  function make(C, at, tint) {
    const v = document.createElement('video'); v.src = 'assets/crowd/' + C.src; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.loop = C.kind !== 'walk';
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v);
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const h = C.m, w = h * C.w / C.h2, g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, op: { value: 0 }, flip: { value: 0 }, tint: { value: new THREE.Vector3(...tint) } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 10; mesh.position.copy(at);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.15, Math.max(0.45, w * 0.5)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 9; sh.position.copy(at).setY(FLOOR + 0.01);
    scene.add(sh); scene.add(mesh); if (!v.loop) v.addEventListener('ended', () => { p.done = true; });
    if (v.loop) v.currentTime = rnd(0, C.dur - 0.5); // different moment of the loop for each person
    const p = { C, v, tex, mesh, sh, mat, op: 0, start: at.clone(), dir: null, done: false }; people.push(p); v.play().catch(() => {}); return p;
  }
  function kill(p) { p.v.pause(); p.v.removeAttribute('src'); p.v.load(); p.v.remove(); p.tex.dispose(); p.mesh.geometry.dispose(); p.mat.dispose(); p.sh.geometry.dispose(); p.sh.material.dispose(); scene.remove(p.mesh); scene.remove(p.sh); }
  const spotsOf = pl => pl.spots.map(([u, v]) => floorPoint(u, v)).filter(q => q && Math.hypot(q.x - camera.position.x, q.z - camera.position.z) > 2.6 && Math.hypot(q.x, q.z) < 16);
  const order = arr => arr.slice().sort((a, b) => (recent.includes(a.src) - recent.includes(b.src)) || Math.random() - 0.5);
  function populate(pl) {
    const sp = spotsOf(pl).sort(() => Math.random() - 0.5); const tint = pl.tint || [1, 0.97, 0.93]; const taken = [];
    for (const C of order(still)) { if (taken.length >= Math.min(5, sp.length)) break; const at = sp.find(q => taken.every(t => t.distanceTo(q) > 1.4)); if (!at) break; taken.push(at); make(C, at, tint); recent.push(C.src); }
    while (recent.length > 8) recent.shift(); nextWalker = performance.now() / 1000 + rnd(0.5, 2.5);
  }
  function spawnWalker(pl) {
    const sp = spotsOf(pl); if (!sp.length) return; const C = order(walkers).find(c => !people.some(p => p.C === c)); if (!C) return;
    const at = pick(sp); const ray = at.clone().sub(camera.position).setY(0).normalize(); let dir = new THREE.Vector3(-ray.z, 0, ray.x); // side-on to you
    const len = C.speed * C.dur; let s0 = at.clone().addScaledVector(dir, -len / 2);
    if (inView(s0)) { dir.negate(); s0 = at.clone().addScaledVector(dir, -len / 2); } if (inView(s0)) return; // only walk in from outside your view
    const p = make(C, s0, pl.tint || [1, 0.97, 0.93]); p.dir = dir; p.op = 1; recent.push(C.src);
  }
  async function showPlate() {
    busy = true; const pl = nearest(pos()); const t = Math.abs(pl.p - pos()) < 1.6 ? await loadPlate(pl) : null;
    if (!t || !isStanding()) { busy = false; return; }
    await snapTo(pl.p); // nudge the (hidden) video to the plate's exact spot, so walking on continues from there
    if (!isStanding()) { busy = false; return; }
    pmat.map = t; pmat.needsUpdate = true; pmesh.visible = true; plate = pl; populate(pl); phase = 'plate'; busy = false;
  }
  return {
    update(dt) {
      const st = isStanding(), now = performance.now() / 1000; standT = st ? standT + dt : 0;
      if (phase === 'walk' && st && standT > 0.35 && !busy) { phase = 'loading'; showPlate().then(() => { if (phase === 'loading') phase = 'walk'; }); }
      if (!st && phase !== 'walk') phase = 'leaving';
      const goal = phase === 'plate' ? 1 : 0; plateOp += Math.sign(goal - plateOp) * Math.min(Math.abs(goal - plateOp), dt / (goal ? 0.45 : 0.25)); pmat.opacity = plateOp;
      if (phase === 'leaving' && plateOp <= 0) { pmesh.visible = false; for (const p of people) kill(p); people.length = 0; phase = 'walk'; plate = null; }
      if (phase === 'plate' && now > nextWalker && people.filter(p => p.dir).length < 2) { spawnWalker(plate); nextWalker = now + rnd(3, 7); }
      for (const p of [...people]) {
        if (p.dir) { // walkers: body follows the gait speed measured from the clip, minus the clip's own in-frame drift (no foot sliding)
          const t = p.v.currentTime || 0, f = Math.min(p.C.off.length - 1, Math.round(t * 24));
          const right = new THREE.Vector3(Math.cos(p.mesh.rotation.y), 0, -Math.sin(p.mesh.rotation.y)); const s = Math.sign(p.dir.dot(right)) || 1;
          p.mat.uniforms.flip.value = s === p.C.face ? 0 : 1; const drift = p.C.off[f] * (s === p.C.face ? 1 : -1);
          p.mesh.position.copy(p.start).addScaledVector(p.dir, p.C.speed * t).addScaledVector(right, -drift); p.sh.position.copy(p.mesh.position).setY(FLOOR + 0.01);
          if (p.done) { p.op -= dt / 0.3; if (p.op <= 0) { kill(p); people.splice(people.indexOf(p), 1); continue; } }
        }
        const op = p.dir ? Math.min(p.op, plateOp) : plateOp; p.mat.uniforms.op.value = op; p.sh.material.opacity = 0.55 * op;
        const c = camera.position; p.mesh.rotation.y = Math.atan2(c.x - p.mesh.position.x, c.z - p.mesh.position.z);
        if (!st && !p.v.paused) p.v.pause();
      }
    },
    count: () => people.length, phase: () => phase, plate: () => plate?.p,
  };
}
