# Hội An walk: web prototype

**Live:** https://khoadang87.github.io/hoian-walk/

## Current default: one continuous 10-minute walk (`walk.js`)
A real 360° walking video, played as you walk. You start on Trần Phú street in Hội An old town and walk up to 10 minutes through the crowd into an assembly hall (likely the Fujian/Phúc Kiến hall at 46 Trần Phú). There are no arrows, no scene switches and no cuts. Source and licences are in CREDITS.md.

**Controls**
- **Phone:** push the stick up to walk; push it further for a jog. Pull it down to turn around. Push it sideways to sway left or right (up to 0.6 m). Drag or turn the phone to look around.
- **Desktop:** W or ↑ walks, Shift jogs, S or ↓ turns around, A/D sway, drag looks around.
- **Buttons:** ↺ Turn around, Walk ▶ (hold), Face ahead, More ▸ (quality and the older scenes).

**How it behaves**
- **Walking:** the 4K footage (3840×1920 H.264, 30 s chunks) plays at your pace, from about 0.4× to jog speed. Chunk handovers are pre-buffered, and a watchdog restarts a stalled video.
- **Standing still:** the footage keeps drifting forward at **0.4×** (change it with `?idle=`). The world never freezes or loops; people move at about 0.4× speed. This is a deliberate compromise. Real-speed people would need the camera to move at walking speed, and slower settings such as 0.15× look like a slow-motion crowd.
- **Turning around:** the camera turns smoothly and then shows a reversed copy of the footage (2048×1024), so the street you walked comes towards you. People in that copy move backwards, which is the main visible limit. The turn stops 25–55° off dead-behind, depending on screen width, and tilts slightly up, so the person carrying the camera stays mostly off-screen. You can still drag the view to see him. When you stand still facing back, the normal forward footage plays.
- **Ends of the route:** inside the hall (or at the start of the street) the Turn around button pulses and a message tells you to turn around.
- **Parallax:** swaying sideways moves the camera over a simple ground-plane proxy (the lower half of the sphere flattened onto a floor 1.6 m below). This is approximate, not real depth.
- **Sound:** the real street sound from the same video, kept within a few seconds of where you are. When it drifts too far, it fades out briefly and resyncs. It fades in on the first tap, and pauses when the tab is hidden.

**URL options:** `?t=<seconds>` start position, `?idle=<rate>`, `?ry=<rad>` sphere yaw, `?scene=spots` (older 360° spot tour), `?scene=game` (older 3D game street).

**Run locally:** `python3 -m http.server 8090`, then open http://localhost:8090/.

---
*Everything below is the history of earlier prototypes, kept for reference.*

## History: first prototype (splats)

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

### Update (27 Oct, evening): photo-mesh street walk (now the default; the old point version is at `?render=points`)
- Each viewpoint is now the **full-resolution 360° photo** (1920×960 JPEG) wrapped onto a sphere that is pushed out by a depth map (16-bit log depth, 512×256 PNG). The GPU does the displacement. Phones use a 256×128 mesh, desktop uses 512×256. There are no point sprites any more.
- **Edges:** triangles that cross a large depth jump are cut. Behind them sits a **background layer**: the depth is widened so foreground objects are pushed back, and the photo is **inpainted with OpenCV Telea** where the foreground was. Gaps therefore show filled imagery instead of black. This is classical inpainting, not generative AI. A local LaMa model was not used; see the limits below.
- **Density:** 82 viewpoints at about 0.96 m spacing (median), up from 29 at 2.4 m. Every frame was processed, then frames less than 0.55 m from the previous one were dropped, because in those spots the walker paused and only the people moved.
- **Blending:** the two viewpoints either side of you are rendered separately and blended continuously by distance. The blend is linear, there is no midpoint swap, and heading and position stay matched. The app loads the next 3 viewpoints ahead and 1 behind, and keeps 6 in memory on phones and 12 on desktop. If a viewpoint isn't ready yet, the last complete view stays on screen.
- **Limits:**
  - The view stretches and smears when you are far from a viewpoint or off-centre sideways.
  - People who are close by, and moving people (they are captured at different moments), show ghosting during blends.
  - The depth is AI-estimated from single images. The camera stick is visible at the bottom.
  - The path is still assumed straight, and the walking speed is still assumed.

### Update v3 (27 Oct, 7 PM): real 4K photos, no warping (default). Older versions: `?render=mesh` (depth mesh), `?render=points`
- **Source:** the same YouTube video, now taken from its **2160p (3840×2160) equirectangular stream** instead of 1080p. Frames are resampled to 4096×2048. Desktop loads the 4096 JPEGs (about 570 KB each) and phones load 2048 versions (about 270 KB). Force one with `?tex=2k` or `?tex=4k`.
- **No more warping:** the per-pixel AI depth mesh, which caused the tearing, smearing, and grey filled-in blobs, has been replaced by a smooth **"street box"** shape. The photo is projected onto a ground plane 2 m below the camera, onto two building-front planes (left and right distances fitted from the AI depth and smoothed over 11 views; median 11.2 m left, 8.8 m right), and onto a distant sphere. Near a viewpoint you see the photo almost exactly as it was taken. Depth shifts only subtly as you move.
- **Less ghosting:** the nearest photo is shown on its own for 60% of the gap between two viewpoints. The two photos blend only in the middle 40%, with a smooth curve.
- **Camera stick:** the uploader had already covered it with a clean patch of road in the source video, so nothing needed removing.
- Every pixel shown is a real video frame. **No AI-generated imagery is used.** Inpainting is no longer needed because the smooth shape leaves no holes.
