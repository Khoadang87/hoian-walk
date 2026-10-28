// Ambient traffic ("open-world" pedestrians, scooters, bicycles). Procedural low-poly figures with randomized
// build, skin, clothes, hats (incl. nón lá), helmets, vehicle colours, speed, lane, direction and timing: no two agents
// are alike and nothing replays on a schedule. Grounded on the street-box ground plane with soft blob shadows,
// lit to roughly match the footage (soft overcast/late-afternoon daylight) and faded into distance haze.
import * as THREE from 'three';
const R = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const SKIN = [0xc99a7a, 0xb88a6a, 0xd8ae8c, 0xa77a5a, 0xe0b898, 0x9a6c4e];
const CLOTH = [0xe9e4da, 0x2b2f38, 0x5d6f8a, 0xb23a3a, 0x3f6b4a, 0xd8c27a, 0x7a4f8a, 0xf2f2f2, 0x9fb7c9, 0x1f3a5f, 0xc96a3a, 0x6b6b6b, 0xe8a0b0, 0x3a3a3a];
const PANTS = [0x2a2d34, 0x3b4a6b, 0x5a4a3a, 0x1a1a1a, 0x8a8f99, 0xd6cdb8, 0x445a44];
const VEH = [0xb5161b, 0xf1f1f1, 0x151515, 0x2756a8, 0x9aa1a8, 0x6d1a1a, 0x1f6b5a, 0xe2c044];
const HELM = [0xf4f4f4, 0x111111, 0xd22d2d, 0x2b62c4, 0xf0c419, 0xe87ab0, 0x7a8a3a];
const mats = new Map(); const M = (c, r = 0.85) => { const k = c + '_' + r; if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 })); return mats.get(k); };
const jit = (c, a = 0.12) => { const col = new THREE.Color(c); const hsl = {}; col.getHSL(hsl); col.setHSL((hsl.h + R(-0.02, 0.02) + 1) % 1, THREE.MathUtils.clamp(hsl.s * R(0.7, 1.1), 0, 1), THREE.MathUtils.clamp(hsl.l * R(1 - a, 1 + a), 0, 1)); return col.getHex(); };
const G = { cap: (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8), sph: (r) => new THREE.SphereGeometry(r, 12, 8), box: (x, y, z) => new THREE.BoxGeometry(x, y, z), cyl: (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s), cone: (r, h) => new THREE.ConeGeometry(r, h, 16, 1, true), tor: (r, t) => new THREE.TorusGeometry(r, t, 6, 16) };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

let shadowTex = null;
function shadow(w, l) { if (!shadowTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 })); s.rotation.x = -Math.PI / 2; s.position.y = 0.01; s.renderOrder = -1; return s; }

function person(seated = false) {
  const H = R(1.52, 1.76), g = new THREE.Group(), skin = M(jit(pick(SKIN), 0.08)), top = M(jit(pick(CLOTH))), bot = M(jit(pick(PANTS)));
  const leg = H * 0.47, torso = H * 0.3, w = H * R(0.1, 0.125);
  const hip = new THREE.Group(); hip.position.y = leg; g.add(hip);
  const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * w * 0.55, 0, 0); const l = mesh(G.cap(w * 0.42, leg * 0.8), bot, 0, -leg / 2, 0); p.add(l);
    p.add(mesh(G.box(w * 0.7, w * 0.35, w * 1.4), M(pick([0x222222, 0x5a3a2a, 0xdddddd, 0x8a6a4a])), 0, -leg + w * 0.12, w * 0.3)); hip.add(p); return p; });
  const dress = Math.random() < 0.18; if (dress) hip.add(mesh(G.cyl(w * 1.0, w * 1.5, leg * 0.6), top, 0, -leg * 0.25, 0));
  const body = mesh(G.cap(w * 1.05, torso * 0.7), top, 0, torso * 0.5 + w * 0.3, 0); body.scale.z = 0.7; hip.add(body);
  const head = mesh(G.sph(H * 0.065), skin, 0, torso + H * 0.13, 0); hip.add(head);
  head.add(mesh(G.sph(H * 0.067), M(pick([0x111111, 0x1d1712, 0x2a2018, 0x3a2a1a])), 0, H * 0.012, -H * 0.012));
  const hat = Math.random(); if (hat < 0.22) { const c = mesh(G.cone(H * 0.2, H * 0.11), M(jit(0xd9c99a, 0.06), 0.95), 0, H * 0.07, 0); c.material.side = THREE.DoubleSide; head.add(c); } // nón lá
  else if (hat < 0.4) { const cp = mesh(G.sph(H * 0.072), M(jit(pick(CLOTH))), 0, H * 0.02, 0); cp.scale.set(1, 0.6, 1); head.add(cp); }
  const arms = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * w * 1.35, torso + w * 0.1, 0); p.add(mesh(G.cap(w * 0.3, torso * 0.85), top, 0, -torso * 0.48, 0));
    p.add(mesh(G.sph(w * 0.3), skin, 0, -torso * 0.98, 0)); hip.add(p); return p; });
  if (Math.random() < 0.3) arms[1].add(mesh(G.box(w * 0.5, w * 1.6, w * 1.4), M(jit(pick(CLOTH))), w * 0.5, -torso * 0.9, 0)); // bag
  if (seated) { legs.forEach((p) => { p.rotation.x = -1.35; p.children[0].rotation.x = 0; }); arms.forEach((p) => p.rotation.x = -1.0); }
  return { g, H, legs, arms, hip, leg };
}
function vehicle(kind) {
  const g = new THREE.Group(), col = M(jit(pick(VEH), 0.1), 0.45), dark = M(0x1a1a1a, 0.7), tire = M(0x111111, 0.9);
  const wheelR = kind === 'bike' ? 0.34 : 0.24, L = kind === 'bike' ? 1.05 : 1.25, wheels = [];
  for (const z of [-L / 2, L / 2]) { const wh = mesh(G.tor(wheelR, kind === 'bike' ? 0.025 : 0.06), tire, 0, wheelR, z); wh.rotation.y = Math.PI / 2; g.add(wh); wheels.push(wh); }
  if (kind === 'bike') { const f = M(jit(pick(VEH))); g.add(mesh(G.box(0.04, 0.04, L * 0.7), f, 0, wheelR + 0.25, 0)); g.add(mesh(G.box(0.04, 0.45, 0.04), f, 0, wheelR + 0.1, -0.15)); g.add(mesh(G.box(0.5, 0.03, 0.03), f, 0, wheelR + 0.5, L / 2 - 0.08)); if (Math.random() < 0.5) g.add(mesh(G.box(0.3, 0.2, 0.3), M(0x8a6a3a), 0, wheelR + 0.4, L / 2 + 0.05)); }
  else { g.add(mesh(G.box(0.34, 0.32, L * 0.62), col, 0, wheelR + 0.18, -0.08)); g.add(mesh(G.box(0.3, 0.1, 0.6), dark, 0, wheelR + 0.4, -0.12));
    g.add(mesh(G.box(0.32, 0.6, 0.18), col, 0, wheelR + 0.32, L / 2 - 0.12)); g.add(mesh(G.box(0.62, 0.04, 0.04), dark, 0, wheelR + 0.68, L / 2 - 0.12)); g.add(mesh(G.sph(0.06), M(0xfff4cc, 0.2), 0, wheelR + 0.58, L / 2 - 0.02)); }
  const riders = []; const n = kind === 'bike' ? 1 : (Math.random() < 0.3 ? 2 : 1);
  for (let i = 0; i < n; i++) { const p = person(true); p.g.position.set(0, wheelR + (kind === 'bike' ? 0.6 : 0.45) - p.leg, i ? -0.45 : -0.05); if (kind !== 'bike' || Math.random() < 0.3) { const hm = mesh(G.sph(p.H * 0.08), M(jit(pick(HELM)), 0.35), 0, p.H * 0.43 + 0.0, 0); p.hip.children.find(c => c.geometry?.type === 'SphereGeometry')?.add(hm); hm.position.set(0, p.H * 0.015, 0); }
    g.add(p.g); riders.push(p); }
  return { g, wheels, riders, wheelR, L };
}

export class Traffic {
  constructor({ isMobile }) {
    this.scene = new THREE.Scene(); this.max = isMobile ? 7 : 11; this.agents = []; this.t = 0; this.next = 0; this.spawned = 0;
    const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x8a7a66, 1.9); hemi.position.set(0, -1, 0); this.scene.add(hemi); // -Y is up in this world
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.3); sun.position.set(-4, -10, 3); this.scene.add(sun);
    this.scene.fog = new THREE.Fog(0xc9d3dc, 18, 75); this.ground = 2; this.street = { L: 6, R: 4, minZ: -15, maxZ: 85 };
  }
  setStreet(s) { Object.assign(this.street, s); }
  spawn(user, initial = false) {
    const r = Math.random(), kind = r < 0.5 ? 'walk' : r < 0.86 ? 'scooter' : 'bike', dir = Math.random() < 0.5 ? 1 : -1;
    const { L, R: Rr } = this.street; let x, speed;
    if (kind === 'walk') { const side = Math.random() < 0.5 ? -1 : 1; const lim = side < 0 ? L : Rr; x = side * R(Math.min(2.2, lim * 0.5), Math.max(2.3, lim - 0.8)); speed = R(0.85, 1.45); }
    else { x = -dir * R(0.9, 2.6); if (Math.abs(x - user.x) < 1.1) x = user.x + Math.sign(x - user.x || 1) * 1.2; speed = kind === 'bike' ? R(2.2, 4) : R(3.2, 7.5); }
    const dist = initial ? R(4, 35) : R(28, 45); let z = initial ? user.z + R(-30, 30) : user.z - dir * dist * (Math.random() < 0.65 ? -1 : 1);
    if (!initial && (z < this.street.minZ + 2 || z > this.street.maxZ - 2)) z = 2 * user.z - z; // keep spawns inside the street
    const root = new THREE.Group(); root.rotation.x = Math.PI; root.position.set(x, this.ground, z); // flip to -Y-up world
    const yawG = new THREE.Group(); yawG.rotation.y = dir > 0 ? Math.PI : 0; root.add(yawG); // local +Z forward
    let a; if (kind === 'walk') { const p = person(); yawG.add(p.g, shadow(0.7, 0.7)); a = { kind, p, phase: R(0, 6.28), stride: p.H * R(0.36, 0.44) }; }
    else { const v = vehicle(kind); yawG.add(v.g, shadow(0.75, v.L + 0.6)); a = { kind, v, phase: R(0, 6.28), lean: 0 }; }
    Object.assign(a, { root, dir, speed, base: speed, x, z, wob: R(0, 6.28), s: R(0.94, 1.06) }); root.scale.setScalar(a.s);
    this.scene.add(root); this.agents.push(a); this.spawned++;
  }
  update(dt, user) {
    this.t += dt; const want = this.max;
    if (this.agents.length === 0) for (let i = 0; i < Math.round(want * 0.6); i++) this.spawn(user, true);
    if (this.t > this.next && this.agents.length < want) { this.spawn(user); this.next = this.t + R(0.4, 3.2); } // random (Poisson-like) arrivals
    for (const a of [...this.agents]) {
      const ahead = (user.z - a.z) * a.dir, lat = Math.abs(a.x - user.x); // simple courtesy: slow down / steer for the viewer
      let target = a.base; if (ahead > 0 && ahead < 5 && lat < 1.0) target = a.base * THREE.MathUtils.clamp((ahead - 1.2) / 4, 0.0, 1);
      a.speed += (target - a.speed) * Math.min(1, dt * 2); a.z += a.dir * a.speed * dt;
      a.root.position.z = a.z; a.wob += dt * R(0.2, 0.6); a.root.position.x = a.x + Math.sin(a.wob) * (a.kind === 'walk' ? 0.05 : 0.12);
      if (a.kind === 'walk') { a.phase += dt * a.speed / a.stride * Math.PI; const s = Math.sin(a.phase) * Math.min(0.55, 0.25 + a.speed * 0.2);
        a.p.legs[0].rotation.x = s; a.p.legs[1].rotation.x = -s; a.p.arms[0].rotation.x = -s * 0.8; a.p.arms[1].rotation.x = s * 0.8; a.p.hip.position.y = a.p.leg + Math.abs(Math.cos(a.phase)) * 0.03; }
      else { for (const w of a.v.wheels) w.rotation.x -= a.speed * dt / a.v.wheelR; if (a.kind === 'bike') { a.phase += dt * a.speed * 1.4; a.v.riders[0].legs[0].rotation.x = -1.35 + Math.sin(a.phase) * 0.35; a.v.riders[0].legs[1].rotation.x = -1.35 - Math.sin(a.phase) * 0.35; } a.v.g.rotation.z = Math.sin(a.wob * 0.7) * 0.03; }
      const far = Math.abs(a.z - user.z); const op = THREE.MathUtils.clamp((50 - far) / 8, 0, 1);
      a.root.visible = op > 0.01; if ((far > 52 && (a.z - user.z) * a.dir > 0) || far > 60 || a.z < this.street.minZ || a.z > this.street.maxZ) { this.scene.remove(a.root); this.agents.splice(this.agents.indexOf(a), 1); }
    }
  }
  render(renderer, camera) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, camera); renderer.autoClear = ac; }
}
