import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const e=[]; p.on('pageerror',x=>e.push(x.message)); p.on('console',m=>m.type()==='error'&&e.push(m.text()));
await p.goto(process.argv[2]+'?test=1&scene=corner'); await p.waitForFunction(()=>window.__state.loaded,null,{timeout:120000});
await p.waitForTimeout(8000); const n=await p.evaluate(()=>[window.__traffic.agents.length,window.__traffic.spawned]);
await p.screenshot({path:'screenshots/traffic/corner.png'}); console.log(JSON.stringify({n,e})); await b.close();
