# Asset credits

## Scene: "Truck" (Tanks and Temples), 3D Gaussian splat

| | |
|---|---|
| What it is | A real outdoor scene, a parked old blue truck on a paved lot with trees and buildings, captured from real photos and reconstructed as a 3D Gaussian splat |
| File used | `FO_dataset/truck/point_cloud/iteration_7000/point_cloud.ply` (1,692,538 splats, 420 MB) |
| Hosted at | https://huggingface.co/datasets/Voxel51/gaussian_splatting (public, direct download, no login) |
| Splat author | Paula Ramos / Voxel51 (dataset card), trained with the official 3DGS code (graphdeco-inria/gaussian-splatting) |
| Splat dataset license | **Apache-2.0**, as declared in the Hugging Face dataset card metadata |
| Underlying photos | "Truck" scene of the **Tanks and Temples** benchmark: Knapitsch, Park, Zhou, Koltun, *Tanks and Temples: Benchmarking Large-Scale Scene Reconstruction*, ACM TOG 2017 (Intel Labs), https://www.tanksandtemples.org/ . Tanks and Temples data is released under **CC BY 4.0** (see the site's license page, **not re-checked line by line for this prototype**). |
| Modifications | Pruned to 350k / 873k splats by opacity × size, spherical harmonics dropped (base colour only), converted to the 32-byte `.splat` format (`scripts/ply_to_splat.py`) |

### Licence caveat (please read)
The chain is Tanks and Temples photos (CC BY 4.0) → splat training with INRIA's 3DGS code → Voxel51 dataset (labelled Apache-2.0). INRIA's 3DGS *software* license is non-commercial. Whether that reaches trained outputs is debated, and the Voxel51 label is Voxel51's own claim. This is fine for a **personal, non-commercial prototype with attribution**. **Before any commercial or public launch, get a legal check or swap in a capture you own.** For the same reason, the zip ships the pruned `.splat` derivatives *and* `scripts/fetch-asset.sh` so they can be rebuilt from source.

### Location verification: honest status
- **Not Hội An, and not Vietnam.** I found no publicly downloadable, openly licensed 3D capture of Hội An (searched Hugging Face, the web and the Wikimedia Commons Hội An categories, which only have flat photos). Sketchfab and Polycam may have Hội An scans, but downloading them needs an account or token, which this task said not to create.
- **What is verified:** the splat file is the Tanks and Temples "Truck" scene. The folder name matches, and the bundled reference photo (`assets/reference_000001.jpg`, from the same HF folder) matches the rendered scene: the same blue truck with a wooden cargo bed, trees and buildings. The scene is a real outdoor photographic capture, not an invented one.
- **What is NOT verified:** the exact street address or city. The Tanks and Temples paper and site do not publish GPS or a place name for "Truck", and the splat has no geo metadata. I am not claiming a specific city.

## Code
- three.js (MIT), https://threejs.org, vendored in `vendor/three*.js`
- @mkkellogg/gaussian-splats-3d v0.4.7 (MIT), vendored in `vendor/gaussian-splats-3d.module.js`

---

## Scene 2 (`?scene=hoian`, default Hội An): 360° Tran Phu Street corner. PRIVATE TEST ONLY, COPYRIGHTED THIRD-PARTY MATERIAL

| | |
|---|---|
| Source | YouTube 360° video **"Hoi An in 360°: Tran Phu Street"**, https://www.youtube.com/watch?v=BjyIbuEsrAQ by channel **Vietnam Tourism Board**, uploaded 2020-11-04 (60 s, equirectangular 1920×1080) |
| Portion used | One equirectangular frame at **00:30**. The camera is static in this video (a tripod at a corner), so combining 2 or 3 frames from along a walk was not possible with this clip. |
| License | Standard YouTube license, © the uploader. **Private technical test only, do not redistribute or publish `assets/hoian_pano360*`.** |
| Location verification | The video title names Tran Phu Street, Hội An, and the frame shows Old Town yellow shophouses, lanterns, bougainvillea and a narrow street. **Exact intersection not map-verified.** |
| Method | The panorama is resampled into 24 perspective tiles (8 yaws × pitch 0°/±60°, 100° FOV). Depth Anything V2 Metric-Outdoor-Small runs on each tile, each equirect pixel takes depth from the tile whose axis is nearest, and sky (blue and above the horizon) is set to 80 m. The result is about 518k points around the viewer, rendered as sized points. (`scripts/hoian_pano360_depth.py`) |
| What works | **Full 360° yaw** and up/down look, plus real parallax when walking about ±1 m |
| Limits | Single viewpoint, so walking reveals holes and streaks behind poles, people and building edges. AI depth differs slightly between tiles (visible seams), sky is a flat far shell, moving people are frozen, and the ground directly below the tripod is smeared. **Not a true 3D scan.** |

## Scene 3 (`?scene=hoian1`): Hội An Old Town street corner, single frame. PRIVATE TEST ONLY, COPYRIGHTED THIRD-PARTY MATERIAL

| | |
|---|---|
| Source | YouTube video "Hoi An Ancient Town - UNESCO World Heritage - Local Life - Vietnam 🇻🇳 - Walking Tour [4K]", channel **Vicarious Walker** (watermark "Youtube @VicariousWalker"), https://www.youtube.com/watch?v=unJVI6z_hqo |
| Portion used | One 1280×720 frame at **05:20** (from a 60 s section 05:00 to 06:00 fetched with yt-dlp) |
| License | **Standard YouTube license, © the channel owner. Not openly licensed.** Used only for a private technical test at the user's explicit request. **Do not redistribute, publish, or commit `assets/hoian_corner_*` or `hoian-src/` anywhere public.** |
| Location verification | The title says Hoi An Ancient Town, and the frame shows typical Old Town yellow two-storey shophouses with blue shutters and red lanterns, plus Vietnamese road signs. The **exact intersection is NOT verified** (I did not match it to a map, and there is no GPS). |
| Method | Depth Anything V2 Metric-Outdoor-Small (Apache-2.0 model, https://huggingface.co/depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf) estimates depth from the single frame. Each pixel is back-projected (assumed 80° horizontal FOV) into a 3D point cloud of about 229k points, rendered as sized points. |
| Honesty label | **This is an approximation, not a 3D scan.** Walking gives real perspective change (parallax) within a ~3 m × 5 m box, but surfaces hidden in the frame are holes, people and vehicles are frozen, and depth is AI-estimated. |

## Hội An street walk (assets/hoian_walk/, assets/hoian_walk2/): COPYRIGHTED, PUBLISHED WITH THE OWNER'S APPROVAL
Frames from the YouTube video "360VR HoiAn,Vietnam-Ancient town", https://www.youtube.com/watch?v=C26CAyJkt4g (the section from 2:00, first 58 s). I couldn't get the channel name because YouTube blocked yt-dlp's metadata request. © the video owner. This was a private test at first. On 27 Oct 2026, Khoa (the project owner) approved publishing it on GitHub Pages, but the footage is still copyrighted YouTube material: it is not licensed by us and must not be reused. If the rights holder objects, take it down. Background fill uses OpenCV Telea inpainting (classical, not generative AI), and depth comes from Depth Anything V2 (Apache-2.0), run locally on CPU.

### v3 photo walk (assets/hoian_walk3/)
These are real frames from the same YouTube video's 2160p stream (© the video owner), published with the owner's approval. **No AI-generated pixels.** The AI depth model (Depth Anything V2, run locally) is used only to estimate the street width and camera height for the smooth proxy shape. The live site still serves the older depth-mesh assets (hoian_walk2, with OpenCV-inpainted backgrounds; classic inpainting, not generative AI) and the point-cloud assets (hoian_walk) for comparison.

---

## Default scene (`?scene=live`): LIVE 360° street walk, real video

| | |
|---|---|
| Source | Same 360° walking video as the photo walk: https://www.youtube.com/watch?v=C26CAyJkt4g (2:00–2:58.5), © the uploader. Published with the project owner's approval; still copyrighted. |
| What is real | **Every pixel of the moving scene is the real video**: the people, scooters, bicycles and lanterns are filmed footage (re-encoded to H.264 2048×1024 `walk_2k.mp4` for phones and 3840×1920 `walk_4k.mp4` for desktop, keyframe every 8 frames, no audio). |
| What is computed | The video timeline follows **your** position along the street (forward plays, back scrubs back). When you stop, a ±0.7 s window around your spot loops with a 0.5 s cross-fade between two video players, so motion continues without a jump. Each frame is projected onto the v3 street-box proxy (ground plus two facades, fitted from AI depth) from the point where it was filmed, with per-frame yaw alignment from `align.json`. |
| Generated / composited | **No generated pixels and no composited sprites.** While idle, the scene shows a loop of real footage (people may visibly repeat every ~1.4 s). The cut-out scooter or people sprites idea was **not implemented**. |
| Audio | **None.** The downloaded source streams had no audio track, and re-downloading was blocked by YouTube's bot check, so there is no ambient sound. |

## Scene `?scene=corner`: LIVE Tran Phu St. corner

| | |
|---|---|
| Source | https://www.youtube.com/watch?v=BjyIbuEsrAQ (Vietnam Tourism Board), 00:10–00:41, © the uploader |
| Real vs generated | The only local copy is a **6 fps** 1080p stream, so the in-between frames up to 24 fps are **generated by motion interpolation** (ffmpeg `minterpolate`, free and local). Fast scooters can show warping or ghosting in those frames. The loop point is hidden by a 1 s cross-fade between two players. |
