// ?crowd=1 experiment: AI-generated (made-up) people composited into the frozen 360 frame while you stand still.
// Each clip is an H.264 mp4 with colour in the top half and its alpha matte in the bottom half (works on iOS Safari, unlike VP9 alpha).
const CLIPS = [ // h = real-world height in metres of the clip's bounding box; kind: sit/stand stay put, walk crosses the street
  { src: 'p1.mp4', w: 370, h2: 552, m: 1.28, kind: 'sit' },  // vendor eating noodles on a stool
  { src: 'p2.mp4', w: 328, h2: 536, m: 1.74, kind: 'stand' }, // two friends chatting, iced coffee
  { src: 'p3.mp4', w: 304, h2: 516, m: 1.70, kind: 'walk', dir: -1 }, // older man walking (faces left)
  { src: 'p4.mp4', w: 448, h2: 606, m: 1.80, kind: 'walk', dir: 1 },  // tourist couple (faces right)
  { src: 'p5.mp4', w: 412, h2: 544, m: 1.68, kind: 'walk', dir: -1 }, // young woman in ao dai (faces left)
  { src: 'p6.mp4', w: 338, h2: 572, m: 1.30, kind: 'sit' },  // man with tea and phone on a stool
];
const FLOOR = -1.6, rnd = (a, b) => a + Math.random() * (b - a);
export function initCrowd(THREE, scene, camera, isStanding) {
  const base = 'assets/crowd/';
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const fs = `uniform sampler2D map; uniform float op; uniform float flip; uniform vec3 tint; varying vec2 vUv;
    void main(){ vec2 u = vec2(flip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y); vec3 c = texture2D(map, vec2(u.x, 0.5 + u.y * 0.5)).rgb; float a = texture2D(map, vec2(u.x, u.y * 0.5)).r;
      a = smoothstep(0.08, 0.92, a); c = c / max(a, 0.04); // un-premultiply
      float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 0.88) * tint; c = (c - 0.5) * 0.9 + 0.5 - 0.02; // match the hazy, slightly flat street footage
      gl_FragColor = vec4(clamp(c,0.0,1.0), a * op); }`;
  const people = []; let standT = 0, used = new Set(), recent = [], lastStand = false, spawnAt = 0;
  function spawn() {
    const free = CLIPS.map((c, i) => i).filter(i => !used.has(i) && !recent.includes(i)); if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)], C = CLIPS[i]; used.add(i); recent.push(i); if (recent.length > 3) recent.shift(); // don't bring the same person straight back
    const v = document.createElement('video'); v.src = base + C.src; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'; document.body.appendChild(v);
    v.playbackRate = rnd(0.9, 1.05);
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const h = C.m, w = h * C.w / C.h2; const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    const flip = Math.random() < 0.5;
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, op: { value: 0 }, flip: { value: flip ? 1 : 0 }, tint: { value: new THREE.Vector3(1.0, 0.97, 0.93) } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 10;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, Math.max(0.5, w * 0.45)), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 9;
    // placement in camera-forward street coordinates (yaw 0 looks down -Z); keep clear of the centre line so they don't stand on top of the real people right ahead
    const side = Math.random() < 0.5 ? -1 : 1; let x, z, vx = 0;
    if (C.kind === 'walk') { z = -rnd(8, 13); const d = (C.dir || 1) * (flip ? -1 : 1); vx = d * rnd(0.95, 1.15); x = -d * 3.2; }
    else { x = side * rnd(2.3, 3.0); z = -rnd(3.5, 9); }
    if (Math.random() < 0.25) z = -z; // sometimes behind you
    mesh.position.set(x, FLOOR, z); sh.position.set(x, FLOOR + 0.01, z);
    scene.add(sh); scene.add(mesh);
    const p = { v, tex, mesh, sh, mat, vx, i, op: 0, dying: false }; people.push(p);
    v.play().catch(() => {}); v.addEventListener('ended', () => { p.dying = true; });
  }
  function kill(p) { p.v.pause(); p.v.remove(); p.tex.dispose(); p.mesh.geometry.dispose(); p.mat.dispose(); p.sh.geometry.dispose(); p.sh.material.dispose(); p.mesh.parent?.remove(p.mesh); p.sh.parent?.remove(p.sh); used.delete(p.i); }
  const api = {
    update(dt) {
      const st = isStanding(); const now = performance.now() / 1000;
      if (st) standT += dt; else standT = 0;
      if (st && !lastStand) spawnAt = now + 1.0; // appear ~1 s after you stop
      lastStand = st;
      if (st && standT > 1 && now >= spawnAt && people.filter(p => !p.dying).length < 3) { spawn(); spawnAt = now + rnd(1.5, 4); }
      for (const p of [...people]) {
        const fadeOut = p.dying || !st;
        p.op += (fadeOut ? -dt / (st ? 0.8 : 0.35) : dt / 1.0); p.op = Math.min(1, p.op);
        if (p.op <= 0 && fadeOut) { kill(p); people.splice(people.indexOf(p), 1); continue; }
        if (!st && !p.v.paused) p.v.pause();
        if (p.vx && !p.v.paused) { p.mesh.position.x += p.vx * dt * p.v.playbackRate; p.sh.position.x = p.mesh.position.x; }
        p.mat.uniforms.op.value = Math.max(0, p.op); p.sh.material.opacity = 0.6 * Math.max(0, p.op);
        const c = camera.position; p.mesh.rotation.y = Math.atan2(c.x - p.mesh.position.x, c.z - p.mesh.position.z); // billboard about the vertical axis
      }
    },
    count: () => people.length,
  };
  return api;
}
