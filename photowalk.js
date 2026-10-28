// Photo street walk: each viewpoint is a full-resolution 360° PHOTO draped over a depth-displaced sphere mesh
// (no point sprites). Triangles across depth jumps are cut, and the hole shows a background layer whose
// foreground was removed and the colour inpainted (OpenCV Telea). The two nodes either side of the camera are
// rendered separately and cross-faded continuously by distance (no midpoint swap). Manual input only.
import * as THREE from 'three';

const VERT = `precision highp float; uniform sampler2D dep; uniform vec2 step; uniform vec2 lg; uniform float bgLayer; uniform float eps;
varying vec2 vUv; varying float vEdge;
float dlog(vec2 uv){ vec4 t = textureLod(dep, vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0)), 0.0);
  float n = bgLayer > 0.5 ? t.b : (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0; return mix(lg.x, lg.y, n); }
void main(){ vUv = uv; float L = dlog(uv);
  float e = max(max(abs(L - dlog(uv + vec2(step.x, 0.0))), abs(L - dlog(uv - vec2(step.x, 0.0)))),
                max(abs(L - dlog(uv + vec2(0.0, step.y))), abs(L - dlog(uv - vec2(0.0, step.y)))));
  vEdge = e; float lon = (uv.x - 0.5) * 6.2831853; float lat = (0.5 - uv.y) * 3.1415926;
  vec3 dir = vec3(sin(lon) * cos(lat), -sin(lat), cos(lon) * cos(lat));
  float d = exp(L) * (bgLayer > 0.5 ? 1.03 : 1.0) + eps;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(dir * d, 1.0); }`;
const FRAG = `precision highp float; uniform sampler2D col; uniform float cut; varying vec2 vUv; varying float vEdge;
void main(){ if (vEdge > cut) discard; gl_FragColor = texture2D(col, vUv); }`;
// v3 "street box" proxy: the real photo is projected onto a smooth ground plane + two facade planes + far sphere.
// No per-pixel depth, so nothing tears or smears; parallax is subtle and the photo looks as captured near each node.
const PVERT = `precision highp float; uniform vec3 box; varying vec2 vUv;
void main(){ vUv = uv; float lon = (uv.x - 0.5) * 6.2831853; float lat = (0.5 - uv.y) * 3.1415926;
  vec3 d = vec3(sin(lon) * cos(lat), -sin(lat), cos(lon) * cos(lat)); float t = 60.0;
  if (d.y > 0.001) t = min(t, box.x / d.y);                         // ground (-Y up, so +y is down)
  float tw = d.x > 0.001 ? box.z / d.x : (d.x < -0.001 ? box.y / -d.x : 1e9);
  if (tw < t && d.y * tw > -9.0) t = tw;                               // facades up to ~9 m above the eye
  gl_Position = projectionMatrix * modelViewMatrix * vec4(d * t, 1.0); }`;
const PFRAG = `precision highp float; uniform sampler2D col; varying vec2 vUv; void main(){ gl_FragColor = texture2D(col, vUv); }`;
const COMP_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMP_F = `uniform sampler2D A; uniform sampler2D B; uniform float t; varying vec2 vUv;
void main(){ gl_FragColor = mix(texture2D(A, vUv), texture2D(B, vUv), t);
  #include <colorspace_fragment>
}`;

function sphereGeo(w, h) {
  const g = new THREE.BufferGeometry(); const uv = new Float32Array((w + 1) * (h + 1) * 2); const pos = new Float32Array((w + 1) * (h + 1) * 3);
  let k = 0; for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) { uv[k++] = i / w; uv[k++] = j / h; }
  const idx = new Uint32Array(w * h * 6); k = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = j * (w + 1) + i, b = a + 1, c = a + w + 1, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); return g;
}

export class PhotoWalk {
  constructor({ base, manifest, isMobile, onProgress, onError }) {
    Object.assign(this, { base, manifest, onProgress, onError });
    this.nodes = manifest.nodes; this.lg = new THREE.Vector2(...(manifest.depthLog || [0, 1]));
    this.cache = new Map(); this.pending = new Map(); this.maxCache = isMobile ? 6 : 12; this.shown = []; this.lastGood = null;
    const [w, h] = isMobile ? [256, 128] : [512, 256];
    this.texTag = new URLSearchParams(location.search).get('tex') || (isMobile ? '2k' : '4k'); // per-device texture size
    this.blendWin = manifest.proxy ? 0.3 : 0.5; // proxy mode: show the nearest photo as-is, blend only in the middle 40%
    this.geo = sphereGeo(w, h); this.step = new THREE.Vector2(1 / w, 1 / h);
    this.rtA = null; this.rtB = null; this.t = 0;
    this.comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: COMP_V, fragmentShader: COMP_F, uniforms: { A: { value: null }, B: { value: null }, t: { value: 0 } }, depthTest: false, depthWrite: false }));
    this.compScene = new THREE.Scene(); this.compScene.add(this.comp); this.compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  async fetchBitmap(url, i, report, acc) {
    let res, err;
    for (let attempt = 0; attempt < 4; attempt++) { // retry transient CDN errors (e.g. 503 right after a deploy)
      if (attempt) await new Promise(r => setTimeout(r, 800 * 2 ** attempt));
      try { res = await fetch(url); if (res.ok) { err = null; break; } err = new Error(`Street view ${i} failed: HTTP ${res.status} (${url}).`); }
      catch (e) { err = new Error(`Network/CORS error loading street view ${i}: ${url}\n(${e.message})`); } }
    if (err) throw err;
    const total = +res.headers.get('content-length') || 0; acc.total += total; const rd = res.body.getReader(); const parts = [];
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); acc.got += value.length; if (report) this.onProgress?.(acc.got, acc.total, i); }
    return createImageBitmap(new Blob(parts), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }
  async fetchNode(i, report) {
    if (this.cache.has(i)) { const v = this.cache.get(i); this.cache.delete(i); this.cache.set(i, v); return v; }
    if (this.pending.has(i)) return this.pending.get(i);
    const p = (async () => {
      const n = this.nodes[i], f = this.base + 'n' + String(n.id).padStart(3, '0'), acc = { got: 0, total: 0 };
      if (n.L !== undefined) { // v3 proxy mode
        const bm = await this.fetchBitmap(f + '_' + this.texTag + '.jpg', i, report, acc);
        const t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
        const mat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, side: THREE.DoubleSide, uniforms: { col: { value: t }, box: { value: new THREE.Vector3(n.h, n.L, n.R) } } });
        const mesh = new THREE.Mesh(this.geo, mat); mesh.frustumCulled = false; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa6bd);
        mesh.position.set(n.x, 0, n.z); scene.add(mesh); const node = { scene, textures: [t], materials: [mat] };
        this.cache.set(i, node); this.pending.delete(i); this.evict(); return node;
      }
      const [c, bgc, d] = await Promise.all([this.fetchBitmap(f + '.jpg', i, report, acc), this.fetchBitmap(f + '_bg.jpg', i, report, acc), this.fetchBitmap(f + '_d.png', i, report, acc)]);
      const tex = (bm, srgb, nearest) => { const t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping;
        t.generateMipmaps = !nearest; t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter; t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; return t; };
      const dt = tex(d, false, true), ct = tex(c, true, false), bt = tex(bgc, true, false);
      const mk = (colTex, bgLayer, cut) => { const m = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
        uniforms: { dep: { value: dt }, col: { value: colTex }, step: { value: this.step }, lg: { value: this.lg }, bgLayer: { value: bgLayer }, cut: { value: cut }, eps: { value: 0 } } })); m.frustumCulled = false; return m; };
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa6bd); const grp = new THREE.Group(); grp.position.set(n.x, 0, n.z);
      grp.add(mk(bt, 1, 1e9), mk(ct, 0, 0.09)); scene.add(grp);
      const node = { scene, textures: [dt, ct, bt], materials: grp.children.map(m => m.material) };
      this.cache.set(i, node); this.pending.delete(i); this.evict(); return node;
    })();
    this.pending.set(i, p); p.catch((e) => { this.pending.delete(i); this.onError?.(e); }); return p;
  }
  evict() {
    for (const [k, v] of [...this.cache]) { if (this.cache.size <= this.maxCache) break; if (this.shown.includes(k)) continue;
      this.cache.delete(k); v.textures.forEach(t => t.dispose()); v.materials.forEach(m => m.dispose()); }
  }
  nearest(z) { let i = 0; while (i < this.nodes.length - 1 && z > (this.nodes[i].z + this.nodes[i + 1].z) / 2) i++; return i; }
  // per frame: bracket the camera between nodes a and a+1; t = linear distance weight (continuous, no swap point)
  update(z) {
    const N = this.nodes.length; let a = 0; while (a < N - 2 && z > this.nodes[a + 1].z) a++;
    const b = Math.min(a + 1, N - 1); const span = this.nodes[b].z - this.nodes[a].z;
    let t = span > 0 ? THREE.MathUtils.clamp((z - this.nodes[a].z) / span, 0, 1) : 0;
    if (this.blendWin < 0.5) t = THREE.MathUtils.smoothstep(t, this.blendWin, 1 - this.blendWin);
    for (const k of [a, b, a + 2, a - 1, a + 3]) if (k >= 0 && k < N) this.fetchNode(k, false).catch(() => {});
    let A = this.cache.get(a), B = this.cache.get(b);
    if (!A && B) { A = B; t = 0; } else if (A && !B) t = 0;
    if (!A) { this.loadingNeeded = true; A = this.lastGood?.A; B = this.lastGood?.B; t = this.lastGood?.t ?? 0; } // keep showing the previous view until ready
    else { this.loadingNeeded = !this.cache.has(a) || !this.cache.has(b); this.lastGood = { A, B: B || A, t }; }
    this.cur = { A, B: B || A, t }; this.shown = [a, b, a + 1]; this.evict();
    return t < 0.5 ? a : b;
  }
  render(renderer, camera) {
    const c = this.cur; if (!c?.A) { renderer.render(new THREE.Scene(), camera); return; }
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rtA || this.rtA.width !== sz.x || this.rtA.height !== sz.y) {
      this.rtA?.dispose(); this.rtB?.dispose(); const o = { depthBuffer: true, colorSpace: THREE.SRGBColorSpace };
      this.rtA = new THREE.WebGLRenderTarget(sz.x, sz.y, o); this.rtB = new THREE.WebGLRenderTarget(sz.x, sz.y, o);
    }
    renderer.setRenderTarget(this.rtA); renderer.render(c.A.scene, camera);
    if (c.t > 0.001 && c.B !== c.A) { renderer.setRenderTarget(this.rtB); renderer.render(c.B.scene, camera); }
    renderer.setRenderTarget(null); const u = this.comp.material.uniforms; u.A.value = this.rtA.texture; u.B.value = (c.t > 0.001 && c.B !== c.A ? this.rtB : this.rtA).texture; u.t.value = c.t;
    renderer.render(this.compScene, this.compCam);
  }
}
