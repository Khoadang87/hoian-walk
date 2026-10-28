// Standing-still check (32 s): background must be a static clean plate (video paused, no frame loop), while procedural
// passers-by keep spawning/leaving with randomized attributes. Then a forward-walk sync check. Emulated devices only.
import { chromium, devices } from 'playwright'; import fs from 'fs';
const [dev = 'desktop', base = 'http://localhost:8811/', secs = '32'] = process.argv.slice(2); const dir = `screenshots/traffic/${dev}/`; fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const prof = dev === 'desktop' ? { viewport: { width: 1280, height: 720 } } : { ...devices[dev === 'pixel' ? 'Pixel 7' : 'iPhone 13'] };
const ctx = await b.newContext({ ...prof, recordVideo: { dir: `${dir}rec/`, size: dev === 'desktop' ? { width: 1280, height: 720 } : prof.viewport } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(base + '?test=1'); await p.waitForFunction(() => window.__traffic?.clips?.some(c => c.tex), null, { timeout: 180000 }).catch(() => {}); await p.waitForFunction(() => window.__state.loaded, null, { timeout: 180000 });
const st = () => p.evaluate(() => { const v = window.__video, T = window.__traffic; T.__n ??= 0;
  for (const a of T.agents) if (a.__id == null) a.__id = T.__n++;
  return { t: +v.currentTime.toFixed(3), idleT: +v.idleT.toFixed(2), z: window.__test.pose().z, n: T.agents.length, spawned: T.spawned,
    agents: T.agents.map(a => ({ id: a.__id, kind: a.kind, dir: a.dir, speed: +a.base.toFixed(2), x: +a.x.toFixed(2), s: +a.s.toFixed(3), clip: a.clip?.file, mirror: a.mesh?.material.uniforms.mirror.value, z: +a.z.toFixed(1) })) }; });
const log = []; const t0 = Date.now(); let k = 0;
while (Date.now() - t0 < +secs * 1000) { log.push({ ms: Date.now() - t0, ...(await st()) }); if (k % 4 === 0) await p.screenshot({ path: `${dir}idle_${String(k).padStart(3, '0')}.png` }); k++; await p.waitForTimeout(400); }
const seen = new Map(); for (const l of log) for (const a of l.agents) if (!seen.has(a.id)) seen.set(a.id, a);
const A = [...seen.values()], sig = A.map(a => `${a.kind}|${a.dir}|${a.speed}|${a.x}|${a.s}`);
const ts = log.map(l => l.t), firstIds = new Set(log[0].agents.map(a => a.id)), lastIds = new Set(log.at(-1).agents.map(a => a.id));
const R = { dev, emulated: true, standingSec: +(log.at(-1).ms / 1000).toFixed(1), samples: log.length,
  videoTimeRange: [Math.min(...ts), Math.max(...ts)], videoStatic: Math.max(...ts) - Math.min(...ts) < 0.01, plateShown: log.every(l => l.idleT >= 0.99),
  agentsOnScreenRange: [Math.min(...log.map(l => l.n)), Math.max(...log.map(l => l.n))], spawnedDuring: log.at(-1).spawned - log[0].spawned,
  left: [...firstIds].filter(i => !lastIds.has(i)).length, distinctAgentsSeen: A.length, duplicateSignatures: sig.length - new Set(sig).size,
  kinds: A.reduce((m, a) => (m[a.kind] = (m[a.kind] || 0) + 1, m), {}), dirs: A.reduce((m, a) => (m[a.dir] = (m[a.dir] || 0) + 1, m), {}),
  speedRange: [Math.min(...A.map(a => a.speed)), Math.max(...A.map(a => a.speed))] };
R.sameClipTwiceOnScreen = log.filter(l => new Set(l.agents.map(a => a.clip)).size < l.agents.length).length;
R.clipsUsed = [...new Set(A.map(a => a.clip))].length;
R.standPass = R.sameClipTwiceOnScreen === 0 && R.videoStatic && R.plateShown && R.spawnedDuring >= 3 && R.left >= 1 && R.duplicateSignatures === 0;
const f0 = await st(); if (dev === 'desktop') { await p.keyboard.down('KeyW'); await p.waitForTimeout(6000); await p.keyboard.up('KeyW'); } else { await p.evaluate(() => window.__test.setJoy(0, -1)); await p.waitForTimeout(6000); await p.evaluate(() => window.__test.setJoy(0, 0)); }
const f1 = await st(); const T = await p.evaluate(() => window.__video.tOfZ(window.__test.pose().z));
R.forward = { z: [f0.z, f1.z], t: [f0.t, f1.t], targetT: +T.toFixed(2), lagSec: +(T - f1.t).toFixed(2), pass: f1.z > f0.z + 1 && Math.abs(T - f1.t) < 1.5 };
await p.screenshot({ path: `${dir}forward.png` }); await p.evaluate(() => window.__test.setYaw(1.5)); await p.waitForTimeout(500); await p.screenshot({ path: `${dir}look.png` });
R.errors = errs; fs.writeFileSync(`${dir}result.json`, JSON.stringify({ ...R, log }, null, 1)); console.log(JSON.stringify(R));
const vid = p.video(); await ctx.close(); fs.copyFileSync(await vid.path(), `demo/traffic_${dev}.webm`); await b.close();
