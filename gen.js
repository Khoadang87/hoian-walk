// ?gen=1 experiment (one test stop, t=300): when you stop near it, the frozen frame crossfades (0.5 s) into an AI-generated
// 360 clip: 4 perspective views of the stopped frame animated with image-to-video (Grok Imagine), reprojected onto the sphere
// with feathered seams; sky/nadir stay the real frame. 2 chained generations (~20 s), then it holds the last frame (no loop).
// iOS: one detached, muted, inline <video>, primed on the first tap; one H.264 file.
export async function initGen(THREE, o) {
  const { scene, sphere, geo, isStanding, pos, snapTo, ver = '' } = o; const V = ver ? '?v=' + ver : '';
  const dbg = { errs: [], mode: '-' }; const err = e => { dbg.errs.push(String(e).slice(0, 80)); if (dbg.errs.length > 4) dbg.errs.shift(); };
  const idx = await fetch('assets/gen/index.json' + V, { cache: 'no-cache' }).then(r => r.json());
  const v = document.createElement('video'); Object.assign(v, { muted: true, defaultMuted: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto', loop: false });
  for (const a of ['playsinline', 'webkit-playsinline', 'muted']) v.setAttribute(a, '');
  v.addEventListener('error', () => err('video ' + (v.error && v.error.code)));
  let primed = false; const prime = () => { if (primed) return; primed = true; v.src = idx.stops[0].src + V; v.load(); const p = v.play(); p && p.then(() => { if (phase !== 'stop') v.pause(); }).catch(e => err('prime ' + e.name)); };
  // not primed on the first tap any more: that started a 2nd big decoder on iOS while you walk
  const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.rotation.copy(sphere.rotation); mesh.renderOrder = 1; mesh.visible = false; scene.add(mesh);
  let fin = 0.5, phase = 'walk', standT = 0, op = 0, cur = null, busy = false;
  const ready = t => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('gen timeout rs' + v.readyState)), 8000); const go = () => { const done = () => { clearTimeout(to); res(); }; if (v.currentTime < 0.05 && v.readyState >= 2) done(); else { v.addEventListener('seeked', done, { once: true }); v.currentTime = t; } }; if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go, { once: true }); });
  async function start() {
    busy = true; const s = pos(); const st = idx.stops.find(x => Math.abs(x.t - s) <= idx.radius);
    if (!st) { dbg.mode = 'no gen stop here (only t=' + idx.stops.map(x => x.t).join(',') + ')'; phase = 'none'; busy = false; return; }
    try {
      v.src = st.src + V; v.load();
      await ready(0); if (!isStanding()) { busy = false; phase = 'walk'; return; }
      fin = Math.abs(st.t - s) <= 0.3 ? 0.5 : 0.9; if (fin === 0.5) await snapTo(st.t); if (!isStanding()) { busy = false; phase = 'walk'; return; } // a stop a little off the clip's frame: no snap (no jump), just a slower crossfade
      cur = st; await v.play().catch(e => err('play ' + e.name)); phase = 'stop'; dbg.mode = 'gen ' + st.t;
    } catch (e) { err(e.message || e); phase = 'none'; }
    busy = false;
  }
  const dEl = new URLSearchParams(location.search).get('debug') === '1' ? Object.assign(document.createElement('pre'), { id: 'gendbg' }) : null;
  if (dEl) { dEl.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99;margin:0;padding:6px 8px;background:rgba(0,0,0,.65);color:#9f9;font:11px/1.35 monospace;pointer-events:none;white-space:pre'; document.body.appendChild(dEl); }
  let dT = 0;
  return {
    update(dt) {
      const st = isStanding(); standT = st ? standT + dt : 0;
      if (phase === 'walk' && st && standT > 0.3 && !busy) { phase = 'loading'; start(); }
      if (!st && phase !== 'walk') { phase = 'leaving'; }
      const goal = phase === 'stop' && st && v.currentTime > 0 ? 1 : 0; op += Math.sign(goal - op) * Math.min(Math.abs(goal - op), dt / (goal ? fin : 0.3)); // in 0.5 s, out 0.3 s the moment you move // 0.5 s crossfade in, 0.25 s out
      if (phase === 'leaving' && op <= 0) { v.pause(); v.removeAttribute('src'); v.load(); phase = 'walk'; cur = null; } // free the decoder at once: the walk needs it (iOS has few)
      mat.opacity = op; mesh.visible = op > 0;
      if (dEl && (dT += dt) > 0.25) { dT = 0; const w = window.HoianWalk?.state?.() || {}; dEl.textContent = `base ${w.base} swap ${w.swapping} rate ${(w.rate || 0).toFixed(2)} joy ${(w.joy || 0).toFixed(2)}\ngen ${ver} ${phase} ${st ? 'STOPPED' : 'walking'} pos ${pos().toFixed(2)} op ${op.toFixed(2)}\nmode ${dbg.mode}\nvideo rs${v.readyState} ${v.paused ? 'P' : '>'} ${v.currentTime.toFixed(2)}/${(v.duration || 0).toFixed(1)}${v.ended ? ' ended(hold last frame)' : ''}\n${dbg.errs.join('\n')}`; }
    },
    state: () => ({ phase, op, t: v.currentTime, mode: dbg.mode, paused: v.paused, ended: v.ended }),
  };
}
