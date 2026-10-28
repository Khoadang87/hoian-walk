// LIVE street. Walking: the real 360° video plays in sync with your position (forward plays, back scrubs back).
// Standing still: the view settles (1 s cross-fade) onto a CLEAN PLATE of that spot (the sharp street frame with people
// removed), and the ambient traffic system (traffic.js) keeps spawning independent real people/scooters/bikes cut out
// of the footage. Nothing of the whole frame ever loops. Each layer is projected on the v3 "street box" proxy.
import * as THREE from 'three';

const PVERT = `precision highp float; uniform vec3 box; varying vec2 vUv;
void main(){ vUv = uv; float lon = (uv.x - 0.5) * 6.2831853; float lat = (0.5 - uv.y) * 3.1415926;
  vec3 d = vec3(sin(lon) * cos(lat), -sin(lat), cos(lon) * cos(lat)); float t = 60.0;
  if (d.y > 0.001) t = min(t, box.x / d.y);
  float tw = d.x > 0.001 ? box.z / d.x : (d.x < -0.001 ? box.y / -d.x : 1e9);
  if (tw < t && d.y * tw > -9.0) t = tw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(d * t, 1.0); }`;
const PFRAG = `precision highp float; uniform sampler2D col; uniform float yo; varying vec2 vUv;
void main(){ gl_FragColor = texture2D(col, vec2(fract(vUv.x + yo), vUv.y)); }`;
const COMP_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMP_F = `uniform sampler2D A; uniform sampler2D B; uniform float t; varying vec2 vUv;
void main(){ gl_FragColor = mix(texture2D(A, vUv), texture2D(B, vUv), t);
  #include <colorspace_fragment>
}`;
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
function gridGeo(w, h) {
  const g = new THREE.BufferGeometry(), uv = new Float32Array((w + 1) * (h + 1) * 2); let k = 0;
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) { uv[k++] = i / w; uv[k++] = j / h; }
  const idx = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = j * (w + 1) + i, b = a + 1, c = a + w + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((w + 1) * (h + 1) * 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); return g;
}

export class VideoWalk {
  // mode 'walk': video + clean plates; mode 'plate': a single clean plate only (stationary corner)
  constructor({ src, manifest, base, mode = 'walk', plate }) {
    Object.assign(this, { src, man: manifest, base, mode, plateSrc: plate });
    this.nodes = manifest?.nodes?.length ? manifest.nodes : [{ id: 0, t: 0, z: 0, L: 40, R: 40, h: 2 }];
    this.geo = gridGeo(128, 64); this.idleT = mode === 'plate' ? 1 : 0; this.still = 0; this.lastZ = null; this.lastSeek = 0;
    this.plates = new Map(); this.plateNode = -1;
    this.comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: COMP_V, fragmentShader: COMP_F, uniforms: { A: { value: null }, B: { value: null }, t: { value: 0 } }, depthTest: false, depthWrite: false }));
    this.compScene = new THREE.Scene(); this.compScene.add(this.comp); this.compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    if (mode === 'walk') { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.defaultMuted = true; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; this.video = v;
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      this.vLayer = this.mkLayer(tex); }
    this.pLayer = this.mkLayer(null);
  }
  mkLayer(tex) {
    const mat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, side: THREE.DoubleSide, uniforms: { col: { value: tex }, box: { value: new THREE.Vector3(2, 9, 9) }, yo: { value: 0 } } });
    const mesh = new THREE.Mesh(this.geo, mat); mesh.frustumCulled = false; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa6bd); scene.add(mesh); return { mat, mesh, scene };
  }
  zOfT(t) { const n = this.nodes; if (t <= n[0].t) return n[0].z; for (let i = 1; i < n.length; i++) if (t <= n[i].t) return lerp(n[i - 1].z, n[i].z, (t - n[i - 1].t) / (n[i].t - n[i - 1].t)); return n[n.length - 1].z; }
  tOfZ(z) { const n = this.nodes; if (z <= n[0].z) return n[0].t; for (let i = 1; i < n.length; i++) if (z <= n[i].z) return lerp(n[i - 1].t, n[i].t, (z - n[i - 1].z) / Math.max(1e-6, n[i].z - n[i - 1].z)); return n[n.length - 1].t; }
  nodeAtT(t) { let i = 0; while (i < this.nodes.length - 1 && t > (this.nodes[i].t + this.nodes[i + 1].t) / 2) i++; return i; }
  nodeAtZ(z) { let i = 0; while (i < this.nodes.length - 1 && z > (this.nodes[i].z + this.nodes[i + 1].z) / 2) i++; return i; }
  yawAt(t) { const y = this.man?.yawOff; if (!y) return 0; const f = clamp(t / this.man.yawStep, 0, y.length - 1), i = Math.floor(f); return lerp(y[i], y[Math.min(i + 1, y.length - 1)], f - i); }
  boxAt(i) { const n = this.nodes[i]; return [n.h, n.L, n.R]; }
  plateUrl(i) { return this.plateSrc || `${this.base}clean/c${String(this.nodes[i].id).padStart(3, '0')}.jpg`; }
  loadPlate(i) {
    if (this.plates.has(i)) return this.plates.get(i);
    const p = (async () => { const url = this.plateUrl(i); let r; for (let k = 0; k < 4; k++) { try { r = await fetch(url); if (r.ok) break; } catch (e) {} await new Promise(s => setTimeout(s, 600 * 2 ** k)); }
      if (!r?.ok) throw new Error(`Street background ${i} failed to load (HTTP ${r?.status ?? 'network'}).`);
      const bm = await createImageBitmap(await r.blob(), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const t = new THREE.Texture(bm); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8; t.needsUpdate = true; p.tex = t; return t; })();
    this.plates.set(i, p); p.catch(() => this.plates.delete(i));
    if (this.plates.size > 8) for (const [k, v] of this.plates) { if (this.plates.size <= 8) break; if (Math.abs(k - i) > 3) { v.tex?.dispose(); this.plates.delete(k); } }
    return p;
  }
  async load(onProgress) {
    if (this.mode === 'plate') { onProgress?.(0.3, 0); await this.loadPlate(0); onProgress?.(1, 0); this.setPlate(0); return true; }
    let head; try { head = await fetch(this.src, { method: 'HEAD' }); } catch (e) { throw new Error(`Could not reach the street video (${e.message}). Check your connection and reload.`); }
    if (!head.ok) throw new Error(`The street video failed to load: HTTP ${head.status} (${this.src.split('/').pop()}). Please reload in a moment.`);
    const mb = (+head.headers.get('content-length') || 0) / 1048576, v = this.video;
    await Promise.all([this.loadPlate(0).then(() => this.setPlate(0)), new Promise((res, rej) => {
      v.addEventListener('error', () => rej(new Error(`The street video could not be played on this browser (media error ${v.error?.code || '?'}). Try another browser or reload.`)), { once: true });
      const tick = () => { const d = v.duration || 0; const b = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; const need = Math.min(d || 6, 6);
        onProgress?.(d ? Math.min(1, b / need) : 0, mb); if (d && (b >= need || v.readyState >= 4)) { clearInterval(iv); res(); } };
      const iv = setInterval(tick, 200); v.addEventListener('progress', tick); v.addEventListener('canplaythrough', tick); v.src = this.src; v.load(); })]);
    this.duration = v.duration; v.currentTime = 0.05; this.idleT = 1; // start standing still on the clean plate
    return this.start();
  }
  // muted inline playback: allowed on iOS/Android without a tap; main.js shows tap-to-start if a browser still refuses
  async start() { if (!this.video) return true; try { await this.video.play(); this.video.pause(); this.blocked = false; } catch (e) { this.blocked = e?.name === 'NotAllowedError'; console.warn('[video] play()', e?.name); } return !this.blocked; }
  setPlate(i) { const p = this.plates.get(i); if (!p?.tex) return false; this.plateNode = i; const m = this.pLayer.mat.uniforms; m.col.value = p.tex; m.box.value.set(...this.boxAt(i)); this.pLayer.mesh.position.set(0, 0, this.nodes[i].z); return true; }
  get moving() { return this.idleT < 0.999; }
  get currentTime() { return this.video ? this.video.currentTime : 0; }
  update(z, dt) {
    if (this.mode === 'plate') return 0;
    const v = this.video, maxT = (this.duration || 60) - 0.15;
    const vz = this.lastZ === null ? 0 : (z - this.lastZ) / Math.max(dt, 1e-3); this.lastZ = z;
    const ni = this.nodeAtZ(z); for (const k of [ni, ni + 1, ni - 1]) if (k >= 0 && k < this.nodes.length) this.loadPlate(k).catch(() => {});
    const T = clamp(this.tOfZ(z), 0, maxT), diff = T - v.currentTime;
    if (Math.abs(vz) > 0.05) { // walking: real video in sync with your position
      this.still = 0; if (this.idleT > 0.98 && Math.abs(diff) > 0.15 && !v.seeking) this.seek(v, T); // resume from the right spot
      this.idleT = Math.max(0, this.idleT - dt / 0.6);
      if (this.blocked) return ni;
      const i = this.nodeAtT(v.currentTime), n0 = this.nodes[Math.max(0, i - 1)], n1 = this.nodes[Math.min(this.nodes.length - 1, i + 1)];
      const vcap = Math.max(0.3, (n1.z - n0.z) / Math.max(0.1, n1.t - n0.t));
      if (vz > 0 && diff > -0.4 && diff < 3) { const want = clamp(vz / vcap + 0.5 * diff, 0.3, 2.5); v.playbackRate += (want - v.playbackRate) * Math.min(1, dt * 4); if (v.paused) v.play().catch(() => {}); }
      else { if (!v.paused) v.pause(); if (Math.abs(diff) > 0.12 && !v.seeking && performance.now() - this.lastSeek > 90) this.seek(v, T); }
    } else { // standing: settle on the clean plate of this spot (no looping footage); traffic.js keeps the street alive
      this.still += dt; if (this.still > 0.25) this.idleT = Math.min(1, this.idleT + dt / 1.0);
      if (this.idleT >= 1 && !v.paused) v.pause();
    }
    if (this.plateNode !== ni && (this.idleT < 0.02 || this.plateNode < 0)) this.setPlate(ni); // swap plates only while invisible
    return ni;
  }
  seek(v, t) { if (Math.abs(v.currentTime - t) > 0.02) { v.currentTime = t; this.lastSeek = performance.now(); } }
  render(renderer, camera) {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rtA || this.rtA.width !== sz.x || this.rtA.height !== sz.y) { this.rtA?.dispose(); this.rtB?.dispose(); const o = { depthBuffer: true, colorSpace: THREE.SRGBColorSpace };
      this.rtA = new THREE.WebGLRenderTarget(sz.x, sz.y, o); this.rtB = new THREE.WebGLRenderTarget(sz.x, sz.y, o); }
    const t = this.mode === 'plate' ? 1 : THREE.MathUtils.smoothstep(this.idleT, 0, 1), u = this.comp.material.uniforms;
    if (t < 1 && this.vLayer) { const ct = this.video.currentTime, n = this.nodes[this.nodeAtT(ct)];
      this.vLayer.mesh.position.set(0, 0, this.zOfT(ct)); this.vLayer.mat.uniforms.yo.value = this.yawAt(ct) % 1; this.vLayer.mat.uniforms.box.value.set(n.h, n.L, n.R);
      renderer.setRenderTarget(this.rtA); renderer.render(this.vLayer.scene, camera); }
    if (t > 0) { renderer.setRenderTarget(this.rtB); renderer.render(this.pLayer.scene, camera); }
    renderer.setRenderTarget(null); u.A.value = (t < 1 ? this.rtA : this.rtB).texture; u.B.value = (t > 0 ? this.rtB : this.rtA).texture; u.t.value = t;
    renderer.render(this.compScene, this.compCam);
  }
}
