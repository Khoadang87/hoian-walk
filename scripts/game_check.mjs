// node scripts/game_check.mjs <desktop|iphone|pixel> <baseURL> [outDir]
import { chromium, devices } from 'playwright';
import fs from 'fs';
const [dev = 'desktop', base = 'http://localhost:8811/', out = 'demo'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const ctxOpt = dev === 'iphone' ? devices['iPhone 13'] : dev === 'pixel' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 720 } };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...ctxOpt, recordVideo: { dir: out + '/vid_' + dev, size: ctxOpt.viewport } });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const t0 = Date.now(); await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__state?.loaded || window.__viewerError, null, { timeout: 120000 });
const loadS = (Date.now() - t0) / 1000; const verr = await page.evaluate(() => window.__viewerError || null);
const samples = [];
for (let i = 0; i < 6; i++) { await page.waitForTimeout(5000); samples.push(await page.evaluate(() => window.__game.stats())); }
await page.screenshot({ path: `${out}/game_${dev}_stand.png` });
await page.evaluate(() => window.__test.setYaw(Math.PI / 2 - 0.3)); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/game_${dev}_shops.png` });
await page.evaluate(() => window.__test.setYaw(-Math.PI / 2 + 0.2)); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/game_${dev}_river.png` });
await page.evaluate(() => { window.__test.setYaw(0); window.__test.setJoy(0, -1); }); await page.waitForTimeout(4000); await page.evaluate(() => window.__test.setJoy(0, 0));
const moved = await page.evaluate(() => window.__test.pose());
await page.click('#dusk').catch(() => {}); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/game_${dev}_dusk.png` });
await page.click('#quality').catch(() => {}); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/game_${dev}_third.png` });
const npcs = await page.evaluate(() => window.__game.npcs());
const res = { dev, loadS, viewerError: verr, samples, moved, npcSample: npcs.slice(0, 6), uniqueShirts: new Set(npcs.filter(n => n.look).map(n => n.look)).size, errors: errs };
fs.writeFileSync(`${out}/game_${dev}.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1));
const v = page.video(); await ctx.close(); if (v) fs.copyFileSync(await v.path(), `${out}/game_${dev}.webm`); await browser.close();
