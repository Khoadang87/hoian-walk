# Walk a real captured place: web prototype

A self-contained web viewer (three.js + @mkkellogg/gaussian-splats-3d, both vendored, no build step) with two scenes:

| `?scene=` | What it is | Real 3D? |
|---|---|---|
| `truck` (default) | **Tanks and Temples "Truck"**: a real outdoor lot, reconstructed from many photos into a 3D Gaussian splat (pruned for phones) | Yes, multi-view reconstruction. **Not Hội An.** |
| `hoian` | **Hội An Tran Phu St. corner, 360°**, PRIVATE TEST: one 360° YouTube frame + AI depth on 24 tiles → surround point cloud. Look all the way around and walk about ±1 m | **Approximation**: real parallax, but holes and streaks appear as you move off the capture point. Copyrighted source, do not redistribute. |
| `hoian1` | Hội An corner, one ordinary (non-360) YouTube frame + AI depth | Approximation, forward-facing only. Copyrighted, private. |

See CREDITS.md for licences and how each location was verified.

## Run
```bash
cd hoian-walk
npx serve -l 8090 .        # or: python3 -m http.server 8090
# open http://localhost:8090/               (Truck)
#      http://localhost:8090/?scene=hoian   (Hội An test)
```
Any static file server works. No COOP/COEP headers are needed (SharedArrayBuffer is off). To test on a phone, serve on your LAN (`npx serve -l 8090 .`, then open `http://<pc-ip>:8090` on the phone on the same Wi-Fi).

If `assets/*.splat` are missing (for example the Hội An file was left out of a shared copy):
- Truck: `./scripts/fetch-asset.sh` (downloads the 420 MB source from Hugging Face, no login, and prunes it; needs python3 + numpy)
- Hội An: `./scripts/build-hoian.sh` (yt-dlp + ffmpeg + torch/transformers, CPU is fine, about 1 minute)

## Controls
- **Phone:** left joystick moves (up = forward, sideways = strafe). Drag anywhere else to look. **Reset** button.
- **Desktop:** W/S or ↑/↓ move, A/D strafe, **←/→ or Q/E turn a full 360°**, mouse drag looks (unlimited yaw), R or **Reset** resets.
- **Phone turning:** drag anywhere to look all the way around, or hold **⟲ Turn / Turn ⟳**.
- Buttons: *Lighter/Sharper scene* (Truck: 350k vs 873k splats), *Hội An test / Truck scene* switcher.
- Look drag is "grab the scene" style (drag left to turn right), like Street View.
- Boundaries: the camera is clamped to a box on the ground plane at fixed eye height (Truck about 18×18 units around the truck; Hội An about 3 m × 5 m, because the single-view data falls apart beyond that).

## URL options
`?scene=truck|hoian`, `?q=mobile|desktop` (asset size), `?src=<url>` (load another .splat; the remote host must send CORS headers), `?test=1` (preserveDrawingBuffer, used by the tests).

## Mobile optimisation
- Pruned splats (350k on mobile vs 1.69M in the source), spherical harmonics dropped, compact 32-byte `.splat` records (11 MB mobile, 28 MB desktop; the Hội An scene is 7 MB)
- devicePixelRatio capped (1.25 on phones, 1.75 on desktop), half-precision covariances, no antialiasing
- Byte-level download progress (MB and %), and clear messages for: no WebGL2, network/CORS failure, HTTP errors, parse/out-of-memory failure, and WebGL context loss (usually out of GPU memory on phones)

## Files
`index.html`, `main.js`, `style.css`, `vendor/` (three.js r186 + gaussian-splats-3d 0.4.7), `assets/`, `scripts/` (asset build, `test.mjs` headless test), `screenshots/`, `demo/`, `TESTING.md`, `CREDITS.md`.

Run the tests: `npm i && npx playwright install chromium && node scripts/test.mjs hoian && node scripts/test.mjs truck` (needs the server on :8090).

## About the zip
`/workspace/hoian-walk.zip` **leaves out `assets/hoian_*`** (copyrighted YouTube-derived data). Rebuild them with `scripts/build-hoian.sh`. Note that the zip's `screenshots/` and `demo/` still show frames of the copyrighted Hội An footage, so keep the zip private. The truck `.splat` files are included (see the licence caveat in CREDITS.md).

## Scene: Hội An street walk (default, `?scene=walk`). You control every step.
- **What:** a 67.4 m stretch of the Thu Bồn riverside street in Hội An Old Town (probably the Bạch Đằng St. market area; I identified it by eye and did **not** check it on a map). It has **29 viewpoints**, about 2.4 m apart. Each viewpoint is a 360° frame from a walking video, turned into a ~113k-point depth cloud with Depth Anything V2 Metric-Outdoor (24 tiles per frame).
- **Controls:** W/S or ↑/↓ or the joystick to walk forward and back. A/D to step sideways (limited to ±1.5 m). Drag, ←/→, Q/E, or the turn buttons to look around a full 360°. R or ↺ takes you back to the start of the street. The bar at the top shows how far along the street you are and which viewpoint you're on.
- **How it works:** the app shows the nearest viewpoint and blends into the next one around the halfway point. The direction you're facing carries over between viewpoints. While you walk, it loads the viewpoints just behind and ahead of you, and keeps 4 of them in memory on phones (8 on desktop). If a viewpoint is slow to load you'll see "loading…", and if one fails you'll see an error message.
- **Limits:**
  - The street is treated as a straight line.
  - The distance between viewpoints assumes a 1.2 m/s walking pace, so all lengths are estimates.
  - People and the guide are frozen in place, and the same person can appear in more than one viewpoint.
  - Each viewpoint comes from one camera position, so areas hidden from that camera are empty and depth has seams. The image stretches if you move away from a viewpoint.
  - Rebuild with `scripts/build-hoian-walk.sh`. The video assets are not in the zip.
