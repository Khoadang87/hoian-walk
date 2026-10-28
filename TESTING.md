# Testing

All tests ran **headless on the box**: Playwright 1.64 with Chromium headless shell and **SwiftShader (software WebGL2, no GPU)**, against `npx serve` on :8090. Script: `scripts/test.mjs <scene>`. Screenshots are canvas captures (`preserveDrawingBuffer`). Pixel diff = % of pixels differing (pixelmatch, threshold 0.1). Raw numbers are in `screenshots/results_*.json`.

**No real phone was tested.** "iPhone" rows are **Playwright iPhone 13 emulation** (390×844 @3x, touch, mobile UA) with touch input dispatched through Chrome DevTools `Input.dispatchTouchEvent`. That does not exercise Safari/WebKit, a real mobile GPU, real memory limits, or a real finger.

Steps per run: load, start shot, second start shot with no input (noise floor), hold forward (W / joystick up), hold strafe right (D / joystick right), drag to look, hold forward 12 s against the boundary, yaw set to 0/90/180/270° (yaw test), hold the on-screen **Turn ⟳** button for 1.5 s, then reset.

## Results (diff %)
| run | load | no-input noise | start→forward | forward→strafe | strafe→drag-look | yaw 0→90 / 90→180 / 180→270 / 270→0 | start vs after reset | Turn button yaw change | pose after 12 s push |
|---|---|---|---|---|---|---|---|---|---|
| Hội An 360° · desktop 1280×720 | 382 ms | 0 | 38.55 | 38.96 | 71.56 | 64.93 / 54.01 / 58.6 / 67.83 | 0 | 0.54 rad | {'x': 0.3, 'z': 0.3, 'yaw': 0.5, 'pitch': -0.1} |
| Hội An 360° · iPhone 13 **emulated** | 336 ms | 0 | 32.3 | 35.6 | 66.61 | 69.27 / 51.39 / 48.03 / 65.64 | 0 | 1.946 rad | {'x': 0.3, 'z': 0.3, 'yaw': 0.5, 'pitch': 0} |
| Hội An single frame · desktop | 257 ms | 0 | 40.6 | 38.35 | 72.45 | 74.59 / 0 / 0 / 74.59 | 0 | 2.158 rad | {'x': 0.4, 'z': 1, 'yaw': 0.5, 'pitch': -0.1} |
| Hội An single frame · iPhone **emulated** | 217 ms | 0 | 38.79 | 39 | 49.91 | 83.56 / 0 / 0 / 83.56 | 0 | 2.453 rad | {'x': 0.4, 'z': 1, 'yaw': 0.5, 'pitch': 0} |
| Truck splat · desktop 1280×720 (mobile asset) | not recorded* | 4.66 | 34.98 | 38.77 | 64.5 | 71.04 / 71.44 / 79.42 / 73.98 | 5.51 | not recorded* | see screenshot |
| Truck splat · iPhone **emulated** | see note** | | | | | | | | |

Reading the table:
- Forward and strafe each change 32 to 41% of pixels against a noise floor of 0% (point scenes) or about 5% (splat sorting jitter), so **movement visibly changes the perspective**. Reset returns to the identical frame (0%) for the point scenes.
- **Hội An 360°:** all four 90° yaw steps give 48 to 69% different, fully rendered views (see `screenshots/hoian_desktop_yaw_grid.png`), so the full turn works. The single-frame Hội An scene gives 0% at 90/180/270 because those views are empty black, which is why the 360° scene replaced it.
- Boundaries: after 12 s pushing forward and right, the pose stays clamped at the box edge (x=0.3, z=0.3 units ≈ 1.2 m for 360°; x=0.4, z=1.0 for the single frame).
- Rendering speed under SwiftShader: about 6 fps for the truck splat (350k) and 26 to 35 fps for the Hội An point clouds. This is CPU rendering and says nothing reliable about phone fps.

\* The truck run's summary JSON was lost when a later step was interrupted. The truck desktop diffs were recomputed from its saved screenshots with `scripts/diff.mjs`.
** Truck in iPhone emulation: **FAILED / not verified**. The scene did not reach "loaded" within 15 min under SwiftShader (the run timed out in `waitForFunction`). It may only be headless software-rendering slowness, but I cannot claim it works on phones.

## Error handling
- Implemented: no WebGL2 message, network/CORS failure, HTTP status error, parse/out-of-memory message, and WebGL context loss.
- **Not exercised by automated tests.** I did not simulate a CORS failure, a no-WebGL2 browser, or OOM, so those messages are code-reviewed only.

## Untested / incomplete
- Real iPhone/Android devices (Safari WebKit especially), real GPU performance, real phone memory limits
- The desktop "Sharper scene" truck asset (873k splats) was only load-tested early on. Interactive runs used the 350k asset because SwiftShader is too slow for it
- Firefox and Safari desktop
- Multi-touch (joystick and look at the same time) beyond single-touch emulation
- Hội An 360° walking quality: holes and streaks appear off-centre (expected for one viewpoint), the depth scale is AI-estimated, and tile seams are visible in places

## Street walk (`node scripts/test.mjs walk`, Playwright + SwiftShader, headless)
These are scripted key and touch inputs, not autoplay. Pixel diff = % of pixels that differ (pixelmatch, threshold 0.1).
| | Desktop (keyboard) | Emulated iPhone (joystick via CDP touch) |
|---|---|---|
| Hold W / joystick 7.5 s | z 0→9.63 m, view 1→4 | z 0→10.74 m, view 1→5 |
| Continue forward 12 s | z 24.05 m, view 11 | z 25.79 m, view 12 |
| Diff start→forward | 54.91 | 37.84 |
| Strafe right (clamped at x=1.5) diff | 30.98 | 23.09 |
| Look diff | 55.59 | 38.76 |
| Hold S at start | stays at z=0 | stays at z=0 |
| Hold W 2 m before the end | stops at z=67.35, view 29 | same |
| Yaw diffs 0/90/180/270 | 82.6/86.5/72.2/69.5 | 88.9/88.4/69.2/71.5 |
| Turn button Δyaw | 2.47 rad | 2.45 rad |
| Reset vs start diff / no-input noise | 0 / 0 | 0 / 0 |
Not tested: a real phone, real touch hardware, frame rate on a phone GPU, or memory pressure on an actual device.

## Photo-mesh street walk (27 Oct, evening). Default renderer. Old point renderer: `?render=points`
**Smoothness while walking** (`node scripts/smooth.mjs <tag>`): the camera steps 5 cm at a time from z=8 m to z=14 m (120 steps, about one frame each at walking pace). Each step is pixel-diffed against the previous one, as % of pixels changed. The script waits until the views around each position have loaded.
| | Before (points, 29 views) | After (photo mesh, 82 views) |
|---|---|---|
| Desktop 960×540: max / 95th pct / median | 4.08 / 3.92 / 2.57 | **1.48 / 0.77 / 0.33** |
| Emulated iPhone 13: max / 95th pct / median | 2.53 / 2.35 / 1.31 | **0.82 / 0.32 / 0.07** |
| Diff on steps where the shown view changes | 3.34, 3.67 (desktop) | 0.20–0.34 (desktop), 0.05–0.18 (iPhone) |
A first "after" run that used every frame (116 views) had spikes up to 13.9% where the walker had paused. Those frames are now dropped (see README).

**Controls** (`node scripts/test.mjs walk`, SwiftShader software GPU):
| | Desktop | Emulated iPhone |
|---|---|---|
| Hold W / joystick 7.5 s | 0→5.58 m, view 1→8 | 0→10.66 m, view 1→14 |
| Keep pushing forward 12 s | 12.76 m, view 16 | 25.55 m, view 32 |
| Sideways clamp | x = 1.5 | x = 1.5 |
| Hold S at the start / W at the end | z = 0 / z = 68.55 (view 81 of 82) | same |
| Reset vs start diff, no-input noise | 0 / 0 | 0 / 0 |
| Yaw diffs 0/90/180/270 | 79.5 / 82.9 / 68.5 / 64.9 | 84.3 / 83.5 / 64.5 / 64.5 |
On desktop, walking covered less distance in the same time because the software GPU runs at a low frame rate (about 18 fps when standing still at 640×360, less while two views are blending). Each frame's time step is capped at 0.25 s, so the walker moves less per second of real time. This does not reflect a real GPU.
Not tested: a real phone or a real GPU frame rate, or memory use on an actual device.

## v3 4K photo walk (27 Oct, 7 PM). Default
**Smoothness** (same 5 cm-step test from z=8 to 14 m; % of pixels changed per step):
| | v2 depth mesh | v3 4K photo |
|---|---|---|
| Desktop max / p95 / median | 1.48 / 0.77 / 0.33 | 13.93 / 12.82 / 8.74 (same view with 2K photos: 12.18 / 10.67 / 7.29) |
| iPhone max / p95 / median | 0.82 / 0.32 / 0.07 | 9.57 / 4.55 / 1.50 |
Higher numbers here do **not** mean pops:
- In v3 the scene now moves at the right scale. The ground plane is 2 m below the eye, whereas v2's depth was roughly 3–4× too far away, so its parallax was tiny. The photos are also much sharper. Both make every 5 cm step change more pixels; the desktop baseline is about 8% on every step.
- The blends between photos add a bump of roughly +3–5% on top of that baseline, spread over several steps (a max of 13.9% vs an 8–9% baseline). There is no one-frame jump.

**Controls** (test.mjs walk):
- **Distance:** desktop walked 7.58 m in 7.5 s (view 1 → 10) and 18.61 m in total. The iPhone walked 10.76 m (view 1 → 14) and 25.83 m in total.
- **Boundaries:** sideways movement stops at x=1.5, and both ends stop you (0 and 68.55 m).
- **Reset:** reset matches the start (0% diff), with 0% noise and no console errors.
- **Looking around:** yaw diffs were 61–86%.
