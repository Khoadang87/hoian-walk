// Ambient passers-by made of REAL people: short cut-out clips (pedestrians, cyclists, a scooter rider) segmented out of
// the Hội An 360° walk footage (YOLO11-seg masks, RGBA WebP frame atlases). Each agent gets a random clip (never the same
// clip twice on screen), start frame, playback rate, mirroring, lane, scale, speed, direction and arrival time, so nothing
// replays in sync. Billboards stand on the street-box ground with a soft contact shadow and fade with distance haze.
import * as THREE from 'three';
const R = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
let shadowTex = null;
function shadowMesh(w, l) {
  if (!shadowTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.75 }));
  s.rotation.x = Math.PI / 2; s.renderOrder = -1; return s;
}
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform sampler2D map; uniform vec2 off, rep; uniform float mirror, opacity, bright, haze; uniform vec3 hazeCol; varying vec2 vUv;
void main(){ vec2 u = vec2(mirror > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y); vec4 c = texture2D(map, off + u * rep);
  if (c.a < 0.04) discard; vec3 col = mix(c.rgb * bright, hazeCol, haze); gl_FragColor = vec4(col, c.a * opacity); }`;
const SPEC = { walk: [0.9, 1.35, 1.55, 1.74], walkbike: [0.8, 1.05, 1.52, 1.66], bike: [2.2, 3.8, 1.5, 1.68], scooter: [3.0, 6.0, 1.45, 1.62] }; // speed m/s, height m

export class Traffic {
  constructor({ isMobile, base = 'assets/hoian_live/' }) {
    this.scene = new THREE.Scene(); this.max = isMobile ? 6 : 8; this.agents = []; this.t = 0; this.next = 0; this.spawned = 0; this.ground = 2;
    this.street = { L: 6, R: 4, minZ: -15, maxZ: 85 }; this.clips = []; this.inUse = new Set(); this.cam = null;
    this.ready = fetch(base + 'sprites/sprites.json').then(r => r.json()).then(j => {
      const L = new THREE.TextureLoader();
      this.clips = j.clips.map((c, i) => ({ ...c, id: i, tex: null }));
      return Promise.all(this.clips.map(c => new Promise(res => L.load(base + 'sprites/' + c.file, t => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; c.tex = t; res(); }, undefined, () => res()))));
    }).catch(e => console.warn('sprites unavailable', e));
  }
  setStreet(s) { Object.assign(this.street, s); }
  spawn(user, initial = false) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const dist = initial ? R(5, 32) : R(26, 42); let z = initial ? user.z + R(-30, 30) : user.z - dir * dist * (Math.random() < 0.65 ? -1 : 1);
    if (!initial && (z < this.street.minZ + 2 || z > this.street.maxZ - 2)) z = 2 * user.z - z;
    const toward = (user.z - z) * dir > 0, free = this.clips.filter(c => c.tex && !this.inUse.has(c.id));
    if (!free.length) return;
    const r = Math.random(), want = r < 0.55 ? ['walk', 'walkbike'] : r < 0.8 ? ['bike', 'walkbike'] : ['scooter'];
    let pool = free.filter(c => want.includes(c.kind)); if (!pool.length) pool = free;
    const pref = pool.filter(c => c.facing === 'left' || c.facing === (toward ? 'front' : 'back')); const clip = pick(pref.length ? pref : pool);
    const [s0, s1, h0, h1] = SPEC[clip.kind], speed = R(s0, s1), Hm = R(h0, h1), { L, R: Rr } = this.street; let x;
    if (clip.kind === 'walk' || clip.kind === 'walkbike') { const side = Math.random() < 0.5 ? -1 : 1, lim = side < 0 ? L : Rr; x = side * R(Math.min(2.3, lim * 0.5), Math.max(2.5, lim - 0.8)); }
    else { x = -dir * R(1.4, 3.0); if (Math.abs(x - user.x) < 1.6) x = user.x + Math.sign(x - user.x || 1) * 1.7; }
    const ph = Hm / 0.92, pw = ph * clip.w / clip.h; // the person/rider spans ~92% of the clip canvas height
    const g = new THREE.PlaneGeometry(pw, ph); g.translate(0, ph / 2 - ph * 4 / clip.h, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { map: { value: clip.tex }, off: { value: new THREE.Vector2() }, rep: { value: new THREE.Vector2(1 / clip.cols, 1 / clip.rows) }, mirror: { value: Math.random() < 0.5 ? 1 : 0 },
        opacity: { value: 0 }, bright: { value: R(0.9, 1.04) }, haze: { value: 0 }, hazeCol: { value: new THREE.Color(0xc9d3dc) } } });
    const mesh = new THREE.Mesh(g, mat); mesh.up.set(0, -1, 0); const sh = shadowMesh(clip.kind === 'walk' ? 0.75 : 0.8, clip.kind === 'walk' ? 0.6 : 1.8);
    this.scene.add(mesh, sh); this.inUse.add(clip.id);
    const a = { kind: clip.kind, clip, mesh, sh, dir, speed, base: speed, x, z, s: +(Hm / 1.62).toFixed(3), wob: R(0, 6.28), ft: R(0, clip.n), rate: R(0.9, 1.1), age: 0 };
    this.agents.push(a); this.spawned++;
  }
  update(dt, user, camera) {
    this.t += dt; if (!this.clips.some(c => c.tex)) return;
    if (this.agents.length === 0 && this.spawned === 0) for (let i = 0; i < Math.round(this.max * 0.6); i++) this.spawn(user, true);
    if (this.t > this.next && this.agents.length < this.max) { this.spawn(user); this.next = this.t + R(0.5, 3.4); } // random arrivals
    const cam = camera ? camera.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(user.x, 0, user.z), P = new THREE.Vector3(), Q = new THREE.Vector3();
    for (const a of [...this.agents]) {
      const ahead = (user.z - a.z) * a.dir, lat = Math.abs(a.x - user.x); let target = a.base;
      if (ahead > 0 && ahead < 5 && lat < 1.2) target = a.base * THREE.MathUtils.clamp((ahead - 1.5) / 4, 0, 1); // courtesy: slow for the viewer
      a.speed += (target - a.speed) * Math.min(1, dt * 2); a.z += a.dir * a.speed * dt; a.age += dt; a.wob += dt * 0.4;
      const px = a.x + Math.sin(a.wob) * (a.kind === 'scooter' ? 0.1 : 0.04);
      a.mesh.position.set(px, this.ground, a.z); a.sh.position.set(px, this.ground - 0.01, a.z);
      a.mesh.lookAt(cam.x, this.ground, cam.z); // cylindrical billboard (world up is -Y)
      const c = a.clip, gait = a.kind === 'walk' || a.kind === 'walkbike' ? a.speed / 1.15 : (a.speed > 0.3 ? 1 : 0.15);
      a.ft = (a.ft + dt * c.fps * a.rate * gait) % c.n; const f = Math.floor(a.ft), u = a.mesh.material.uniforms;
      u.off.value.set((f % c.cols) / c.cols, 1 - (Math.floor(f / c.cols) + 1) / c.rows);
      if (c.facing === 'left' && camera) { P.set(px, this.ground, a.z).project(camera); Q.set(px, this.ground, a.z + a.dir * 0.5).project(camera); if (P.z < 1 && Q.z < 1) u.mirror.value = Q.x > P.x ? 1 : 0; }
      const far = Math.hypot(a.z - user.z, px - user.x); u.opacity.value = Math.min(1, a.age / 0.6) * THREE.MathUtils.clamp((48 - far) / 8, 0, 1); u.haze.value = THREE.MathUtils.clamp((far - 12) / 70, 0, 0.35);
      a.sh.material.opacity = 0.75 * u.opacity.value; a.mesh.visible = a.sh.visible = u.opacity.value > 0.01;
      if ((far > 50 && (a.z - user.z) * a.dir > 0) || far > 60 || a.z < this.street.minZ || a.z > this.street.maxZ) {
        this.scene.remove(a.mesh, a.sh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); a.sh.geometry.dispose(); a.sh.material.dispose();
        this.inUse.delete(c.id); this.agents.splice(this.agents.indexOf(a), 1);
      }
    }
  }
  render(renderer, camera) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, camera); renderer.autoClear = ac; }
}
