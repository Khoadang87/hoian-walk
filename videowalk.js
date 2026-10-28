// LIVE street: the real 360° video is the texture (people, scooters and lanterns keep moving). The user's position
// along the street drives the video timeline: walking forward plays/scrubs forward, walking back scrubs back, and
// standing still plays a short loop around the current spot, cross-faded between two <video> elements so it never
// freezes or pops. Each frame is projected on the v3 "street box" proxy from the point where it was filmed.
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
function gridGeo(w, h) {
  const g = new THREE.BufferGeometry(), uv = new Float32Array((w + 1) * (h + 1) * 2); let k = 0;
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) { uv[k++] = i / w; uv[k++] = j / h; }
  const idx = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = j * (w + 1) + i, b = a + 1, c = a + w + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((w + 1) * (h + 1) * 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); return g;
}
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;

export class VideoWalk {
  // opts.mode: 'walk' (timeline follows position) or 'loop' (fixed seamless loop, e.g. the stationary corner clip)
  constructor({ src, manifest, mode = 'walk', loop = [1, 29], fade = 0.5, idleHalf = 0.7 }) {
    Object.assign(this, { src, man: manifest, mode, loopWin: loop, fadeLen: fade, idleHalf });
    this.nodes = manifest?.nodes || [{ t: 0, z: 0, L: 60, R: 60, h: 60 }];
    this.vids = [this.mkVideo(), this.mkVideo()]; this.a = 0; // index of the "primary" video
    this.layers = this.vids.map((v) => this.mkLayer(v));
    this.fadeT = 0; this.fading = false; this.idleWin = null; this.lastZ = null; this.lastSeek = 0;
    this.comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: COMP_V, fragmentShader: COMP_F, uniforms: { A: { value: null }, B: { value: null }, t: { value: 0 } }, depthTest: false, depthWrite: false }));
    this.compScene = new THREE.Scene(); this.compScene.add(this.comp); this.compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  mkVideo() { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.loop = false; return v; }
  mkLayer(v) {
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const g = this.geo || (this.geo = gridGeo(128, 64)); // uv: u=0..1 lon, v=0 top; vertex shader builds positions from uv
    const mat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, side: THREE.DoubleSide, uniforms: { col: { value: tex }, box: { value: new THREE.Vector3(2, 9, 9) }, yo: { value: 0 } } });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa6bd); scene.add(mesh);
    return { tex, mat, mesh, scene };
  }
  // ---- timeline <-> street position ----
  zOfT(t) { const n = this.nodes; if (t <= n[0].t) return n[0].z; for (let i = 1; i < n.length; i++) if (t <= n[i].t) return lerp(n[i - 1].z, n[i].z, (t - n[i - 1].t) / (n[i].t - n[i - 1].t)); return n[n.length - 1].z; }
  tOfZ(z) { const n = this.nodes; if (z <= n[0].z) return n[0].t; for (let i = 1; i < n.length; i++) if (z <= n[i].z) return lerp(n[i - 1].t, n[i].t, (z - n[i - 1].z) / Math.max(1e-6, n[i].z - n[i - 1].z)); return n[n.length - 1].t; }
  nodeAtT(t) { let i = 0; while (i < this.nodes.length - 1 && t > (this.nodes[i].t + this.nodes[i + 1].t) / 2) i++; return i; }
  yawAt(t) { const y = this.man?.yawOff; if (!y) return 0; const f = clamp(t / this.man.yawStep, 0, y.length - 1), i = Math.floor(f); return lerp(y[i], y[Math.min(i + 1, y.length - 1)], f - i); }
  // ---- loading: buffer before start, with progress + clear errors ----
  async load(onProgress) {
    let head; try { head = await fetch(this.src, { method: 'HEAD' }); } catch (e) { throw new Error(`Could not reach the street video (${e.message}). Check your connection and reload.`); }
    if (!head.ok) throw new Error(`The street video failed to load: HTTP ${head.status} (${this.src.split('/').pop()}). Please reload in a moment.`);
    const mb = (+head.headers.get('content-length') || 0) / 1048576;
    const v = this.vids[0];
    await new Promise((res, rej) => {
      const fail = () => rej(new Error(`The street video could not be played on this browser (media error ${v.error?.code || '?'}). Try another browser or reload.`));
      v.addEventListener('error', fail, { once: true }); this.vids[1].addEventListener('error', fail, { once: true });
      const tick = () => { const d = v.duration || 0; const b = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; const need = Math.min(d || 6, 6);
        onProgress?.(d ? Math.min(1, b / need) : 0, mb); if (d && (b >= need || v.readyState >= 4)) { clearInterval(iv); res(); } };
      const iv = setInterval(tick, 200); v.addEventListener('progress', tick); v.addEventListener('canplaythrough', tick);
      for (const x of this.vids) { x.src = this.src; x.load(); }
    });
    this.duration = v.duration; v.currentTime = this.mode === 'loop' ? this.loopWin[0] : 0.05;
    return this.start();
  }
  // muted inline autoplay is allowed on iOS/Android; if a browser still blocks it, main.js shows a tap-to-start overlay
  async start() { try { await this.vids[this.a].play(); this.blocked = false; } catch (e) { this.blocked = true; } return !this.blocked; }
  seek(v, t) { if (Math.abs(v.currentTime - t) > 0.02) { v.currentTime = t; this.lastSeek = performance.now(); } }
  // Called every frame with the user's street position z.
  update(z, dt) {
    const A = this.vids[this.a], B = this.vids[1 - this.a]; const maxT = (this.duration || 60) - 0.15;
    const vz = this.lastZ === null ? 0 : (z - this.lastZ) / Math.max(dt, 1e-3); this.lastZ = z;
    let win;
    if (this.mode === 'loop') win = this.loopWin;
    else {
      const T = clamp(this.tOfZ(z), 0, maxT), diff = T - A.currentTime;
      if (Math.abs(vz) > 0.05) { // walking: the timeline follows the user's position
        this.idleWin = null; this.endFade(); if (this.blocked) return this.nodeAtT(A.currentTime);
        if (vz > 0 && diff > -0.3 && diff < 2.5) { A.playbackRate = clamp(1 + 1.2 * diff, 0.25, 3); if (A.paused) A.play().catch(() => {}); }
        else { if (!A.paused) A.pause(); if (Math.abs(diff) > 0.12 && !A.seeking && performance.now() - this.lastSeek > 90) this.seek(A, T); }
        return this.nodeAtT(A.currentTime);
      }
      if (!this.idleWin || Math.abs(this.idleWin.c - T) > 1) this.idleWin = { c: T }; // stopped: loop ±idleHalf around this spot
      const c = this.idleWin.c; win = [clamp(c - this.idleHalf, 0, maxT - 2 * this.idleHalf), 0]; win[1] = win[0] + 2 * this.idleHalf;
      if (A.playbackRate !== 1) A.playbackRate = 1;
      if (!this.fading && (A.currentTime < win[0] - 0.3 || A.currentTime > win[1] + 0.3)) this.seek(A, win[0]);
    }
    if (this.blocked) return this.nodeAtT(A.currentTime);
    if (A.paused && !this.fading) A.play().catch(() => {});
    // seamless loop: shortly before the window end, start the other video at the window start and cross-fade
    if (!this.fading) {
      if (B.paused && Math.abs(B.currentTime - win[0]) > 0.05 && !B.seeking) this.seek(B, win[0]);
      if (A.currentTime >= win[1] - this.fadeLen && !B.seeking) { this.fading = true; this.fadeT = 0; B.playbackRate = 1; B.play().catch(() => {}); }
    } else {
      this.fadeT = Math.min(1, this.fadeT + dt / this.fadeLen);
      if (this.fadeT >= 1) { A.pause(); this.a = 1 - this.a; this.fading = false; this.fadeT = 0; }
    }
    return this.nodeAtT(this.vids[this.a].currentTime);
  }
  endFade() { if (this.fading) { this.vids[1 - this.a].pause(); this.fading = false; this.fadeT = 0; } }
  place(L, v) { // put the projection where this frame was filmed, with that frame's street-alignment yaw and box
    const t = v.currentTime, n = this.nodes[this.nodeAtT(t)];
    L.mesh.position.set(0, 0, this.mode === 'loop' ? 0 : this.zOfT(t)); L.mat.uniforms.yo.value = this.yawAt(t) % 1;
    L.mat.uniforms.box.value.set(n.h, n.L, n.R);
  }
  get currentTime() { return this.vids[this.a].currentTime; }
  render(renderer, camera) {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rtA || this.rtA.width !== sz.x || this.rtA.height !== sz.y) { this.rtA?.dispose(); this.rtB?.dispose(); const o = { depthBuffer: true, colorSpace: THREE.SRGBColorSpace };
      this.rtA = new THREE.WebGLRenderTarget(sz.x, sz.y, o); this.rtB = new THREE.WebGLRenderTarget(sz.x, sz.y, o); }
    const LA = this.layers[this.a], LB = this.layers[1 - this.a]; this.place(LA, this.vids[this.a]);
    renderer.setRenderTarget(this.rtA); renderer.render(LA.scene, camera);
    const t = this.fading ? THREE.MathUtils.smoothstep(this.fadeT, 0, 1) : 0;
    if (t > 0) { this.place(LB, this.vids[1 - this.a]); renderer.setRenderTarget(this.rtB); renderer.render(LB.scene, camera); }
    renderer.setRenderTarget(null); const u = this.comp.material.uniforms; u.A.value = this.rtA.texture; u.B.value = (t > 0 ? this.rtB : this.rtA).texture; u.t.value = t;
    renderer.render(this.compScene, this.compCam);
  }
}
