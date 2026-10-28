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
