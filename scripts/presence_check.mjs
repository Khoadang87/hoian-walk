// node scripts/presence_check.mjs <desktop|iphone|pixel> <baseURL> [outDir] [standSeconds]
import { chromium, devices } from 'playwright';
import fs from 'fs';
const [dev = 'desktop', base = 'http://localhost:8811/', out = 'demo', standS = '60'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const ctxOpt = dev === 'iphone' ? devices['iPhone 13'] : dev === 'pixel' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 720 } };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(ctxOpt); const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
let bytes = 0; page.on('response', async r => { const l = +(r.headers()['content-length'] || 0); bytes += l; });
const t0 = Date.now(); await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__state?.loaded || window.__viewerError, null, { timeout: 120000 });
const loadS = (Date.now() - t0) / 1000; const verr = await page.evaluate(() => window.__viewerError || null);
await page.click('#tapstart').catch(() => {}); const n = await page.evaluate(() => fetch('assets/presence/spots.json').then(r => r.json()).then(j => j.spots.length));
const spots = [];
for (let i = 0; i < n; i++) {
  if (i > 0) { const before = await page.evaluate(() => window.__test.state().spot); await page.evaluate(() => window.__test.setYaw(0)); await page.keyboard.press('KeyW'); await page.waitForFunction(b => window.__test.state().spot !== b, before, { timeout: 30000 }).catch(() => {}); }
  const samples = []; const steps = Math.max(2, Math.round(+standS / 10));
  for (let k = 0; k < steps; k++) { await page.waitForTimeout(+standS * 1000 / steps); samples.push(await page.evaluate(() => window.__test.state())); }
  await page.screenshot({ path: `${out}/presence_${dev}_spot${i + 1}.png` });
  const s0 = samples[0], s1 = samples[samples.length - 1];
  spots.push({ spot: s1.spot, dur: s1.dur, q: s1.q, w: s1.w, tStart: s0.t, tEnd: s1.t, advanced: +(s1.t - s0.t).toFixed(1), loops: s1.loops, paused: s1.paused });
}
await page.keyboard.press('KeyS'); await page.waitForTimeout(3000); const back = await page.evaluate(() => window.__test.state().spot);
const res = { dev, loadS, viewerError: verr, spots, backWentTo: back, approxBytes: bytes, errors: errs };
fs.writeFileSync(`${out}/presence_${dev}.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); await browser.close();
