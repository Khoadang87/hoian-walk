// Street-walk scene: a chain of 360° depth "nodes" along a street. The user moves freely (manual input only);
// the nearest node's point cloud is shown, dissolving into the next one around the midpoint between nodes.
import * as THREE from 'three';

const VERT = `attribute vec3 color; varying vec3 vC; uniform float focal; uniform float ptScale;
void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
  float dist = length(position);               // distance from the node's capture point
  gl_PointSize = clamp(ptScale * dist * focal / max(-mv.z, 0.05), 1.0, 48.0); }`;
// Stochastic (dithered) cross-fade: node A keeps fragments with hash < keep, node B those >= keep.
const FRAG = `varying vec3 vC; uniform float keepLo; uniform float keepHi;
float h(vec2 p){ return fract(sin(dot(floor(p), vec2(12.9898,78.233))) * 43758.5453); }
void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; float r = h(gl_FragCoord.xy);
  if (r < keepLo || r >= keepHi) discard; gl_FragColor = vec4(vC,1.0); }`;

export class StreetWalk {
  constructor({ base, manifest, scene, isMobile, onProgress, onError }) {
    Object.assign(this, { base, manifest, scene, onProgress, onError });
    this.nodes = manifest.nodes; this.cache = new Map(); this.pending = new Map();
    this.maxCache = isMobile ? 4 : 8;
    this.angStep = 2 * Math.PI / 512; // matches the 512-wide equirect sampling used to build the nodes
    this.shown = [];
  }
  nearest(z) { let i = 0; while (i < this.nodes.length - 1 && z > (this.nodes[i].z + this.nodes[i + 1].z) / 2) i++; return i; }
  async fetchNode(i, reportProgress) {
    if (this.cache.has(i)) { const v = this.cache.get(i); this.cache.delete(i); this.cache.set(i, v); return v; } // LRU touch
    if (this.pending.has(i)) return this.pending.get(i);
    const p = (async () => {
      const n = this.nodes[i]; const url = this.base + n.file; let res;
      try { res = await fetch(url); } catch (e) { throw new Error(`Network/CORS error loading street node ${i}: ${url}\n(${e.message})`); }
      if (!res.ok) throw new Error(`Street node ${i} failed: HTTP ${res.status} (${url}). Run scripts/build-hoian-walk.sh to rebuild the private Hội An assets.`);
      const total = +res.headers.get('content-length') || n.bytes || 0; const rd = res.body.getReader(); const parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (reportProgress) this.onProgress?.(got, total, i); }
      const buf = await new Blob(parts).arrayBuffer(); const N = buf.byteLength / 9;
      const q = new Int16Array(buf, 0, N * 3), c = new Uint8Array(buf, N * 6, N * 3);
      const pos = new Float32Array(N * 3); for (let k = 0; k < N * 3; k++) pos[k] = q[k] / 100;
      const col = new Float32Array(N * 3); for (let k = 0; k < N * 3; k++) col[k] = c[k] / 255;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { focal: { value: 1 }, ptScale: { value: this.angStep * 2.2 }, keepLo: { value: 0 }, keepHi: { value: 1 } } });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.position.set(n.x, 0, n.z); pts.visible = false;
      pts.onBeforeRender = (r, s, cam) => { m.uniforms.focal.value = (r.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); };
      this.scene.add(pts); this.cache.set(i, pts); this.pending.delete(i); this.evict(); return pts;
    })();
    this.pending.set(i, p); p.catch((e) => { this.pending.delete(i); this.onError?.(e); }); return p;
  }
  evict() {
    while (this.cache.size > this.maxCache) {
      const [k, pts] = this.cache.entries().next().value; if (this.shown.includes(k)) { this.cache.delete(k); this.cache.set(k, pts); if ([...this.cache.keys()].every((x) => this.shown.includes(x))) break; continue; }
      this.cache.delete(k); this.scene.remove(pts); pts.geometry.dispose(); pts.material.dispose();
    }
  }
  // Called every frame with the camera's along-street position z.
  update(z) {
    const N = this.nodes.length; const i = this.nearest(z);
    // blend window: within ±25% of the gap around the midpoint between node a and a+1
    let a = i, t = 0; const nz = this.nodes;
    const j = z >= nz[i].z ? i + 1 : i - 1;
    if (j >= 0 && j < N) { const lo = Math.min(i, j), hi = Math.max(i, j), mid = (nz[lo].z + nz[hi].z) / 2, half = 0.25 * (nz[hi].z - nz[lo].z);
      const u = THREE.MathUtils.clamp((z - (mid - half)) / (2 * half), 0, 1); a = lo; t = u; }
    const b = Math.min(a + 1, N - 1);
    for (const k of [a, b, a - 1, a + 2]) if (k >= 0 && k < N) this.fetchNode(k, false).catch(() => {}); // prefetch neighbours
    const A = this.cache.get(a), B = this.cache.get(b);
    for (const [k, p] of this.cache) p.visible = false;
    this.shown = [a, b];
    // If the target node is not loaded yet, keep showing whichever neighbour is ready.
    if (A && B && a !== b) { A.visible = t < 1; B.visible = t > 0; A.material.uniforms.keepLo.value = t; A.material.uniforms.keepHi.value = 1; B.material.uniforms.keepLo.value = 0; B.material.uniforms.keepHi.value = t; }
    else { const P = (t < 0.5 ? A || B : B || A); if (P) { P.visible = true; P.material.uniforms.keepLo.value = 0; P.material.uniforms.keepHi.value = 1; } }
    this.current = t < 0.5 ? a : b; this.loadingNeeded = !(t < 0.5 ? A : B);
    return this.current;
  }
}
