# Stage 2: per candidate track, crop each frame at full 4K, segment with YOLO11s-seg, keep masks overlapping the target,
# normalize to a fixed sprite height anchored bottom-centre, write an RGBA WebP atlas + metadata.
import cv2, json, numpy as np, collections, os
from ultralytics import YOLO
m = YOLO('yolo11s-seg.pt'); V = '/workspace/pages-hoian/assets/hoian_live/walk_4k.mp4'
import sys
C = json.load(open(sys.argv[1])); C += [c for c in json.load(open('cand.json')) if c['t'] in (6,)] if 'cand2' in sys.argv[1] else []; T = collections.defaultdict(dict)
RAW = json.load(open('tracks.json')); byf = collections.defaultdict(list)
for f, t, c, s, *b in RAW: T[t][f] = b; byf[f].append((c, b))
cls_of = {}
for f, t, c, s, *b in RAW: cls_of[t] = c
for f, t, c, s, *b in RAW:  # vehicles: grow the box to include the rider(s)
    if c in (1, 3):
        for pc, pb in byf[f]:
            if pc == 0 and pb[0] < b[2] and pb[2] > b[0] and pb[1] < b[1] + 0.4 * (b[3] - b[1]) and pb[3] > b[1]:
                b = [min(b[0], pb[0]), min(b[1], pb[1]), max(b[2], pb[2]), max(b[3], pb[3])]
        T[t][f] = b
OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True); STEP, MAXF, H = 2, 100, 224
cap = cv2.VideoCapture(V); frames = {}
need = set()
sel = []
for c in C:
    fs = sorted(T[c['t']]); fs = [f for f in range(fs[0], fs[-1] + 1)]
    if len(fs) > MAXF:  # window with the biggest boxes
        hs = [(T[c['t']].get(f, [0, 0, 0, 0])[3] - T[c['t']].get(f, [0, 0, 0, 0])[1]) for f in fs]
        k = max(range(len(fs) - MAXF), key=lambda i: sum(hs[i:i + MAXF])); fs = fs[k:k + MAXF]
    fs = fs[::STEP]; sel.append((c, fs)); need |= set(fs)
i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    if i in need: frames[i] = cv2.imencode('.jpg', f[480:1640], [cv2.IMWRITE_JPEG_QUALITY, 95])[1]  # band only, compressed
    i += 1
meta = []
for c, fs in sel:
    tr = T[c['t']]; known = sorted(tr)
    B = np.array([tr[min(known, key=lambda k: abs(k - f))] for f in fs], float)
    B = cv2.blur(B, (1, 5), borderType=cv2.BORDER_REPLICATE) if len(B) >= 5 else B  # smooth boxes over time
    sprites = []; aspect = []
    for f, b in zip(fs, B):
        w, h = b[2] - b[0], b[3] - b[1]; px, py = w * 0.35 + 10, h * 0.2 + 10
        X0, Y0, X1, Y1 = int(max(0, b[0] - px)), int(max(0, b[1] - py)), int(min(3840, b[2] + px)), int(min(1920, b[3] + py * 0.5))
        crop = cv2.imdecode(frames[f], 1)[max(0,Y0-480):Y1-480, X0:X1]; Y0 = max(Y0, 480)
        r = m(crop, imgsz=416, classes=[0, 1, 3], conf=0.25, retina_masks=True, verbose=False)[0]
        M = np.zeros(crop.shape[:2], np.float32); tb = np.array([b[0] - X0, b[1] - Y0, b[2] - X0, b[3] - Y0])
        if r.masks is not None:
            for mk, bb in zip(r.masks.data.cpu().numpy(), r.boxes.xyxy.cpu().numpy()):
                ix = max(0, min(bb[2], tb[2]) - max(bb[0], tb[0])) * max(0, min(bb[3], tb[3]) - max(bb[1], tb[1]))
                if ix / ((bb[2] - bb[0]) * (bb[3] - bb[1]) + 1e-6) > 0.6: M = np.maximum(M, cv2.resize(mk, (crop.shape[1], crop.shape[0])))
        M = cv2.GaussianBlur((M > 0.5).astype(np.float32), (3, 3), 0)
        ys, xs = np.nonzero(M > 0.5)
        if len(ys) < 50: sprites.append(None); continue
        s = H * 0.92 / h; cxp = (tb[0] + tb[2]) / 2; foot = ys.max()
        sprites.append((crop, M, s, cxp, foot)); aspect.append(w / h)
    ar = [(x[1] > 0.5).sum() / (x[2] ** -2) if x else 0 for x in sprites]; runs = []; st = 0
    for k in range(1, len(ar) + 1):
        if k == len(ar) or not ar[k] or not ar[k - 1] or abs(ar[k] / ar[k - 1] - 1) > 0.3: runs.append((st, k)); st = k
    a0, a1 = max(runs, key=lambda r: r[1] - r[0]); sprites = sprites[a0:a1]; fs = fs[a0:a1]
    good = [x for x in sprites if x is not None]
    if len(good) < len(sprites) * 0.85 or len(good) < 20: print('skip', c['t'], len(good), len(sprites)); continue
    W = int(min(3.2, max(0.5, np.percentile(aspect, 90)) * 1.25) * H * 0.92) // 4 * 4 + 8
    tiles = []
    last = good[0]
    for x in sprites:
        x = x or last; last = x; crop, M, s, cxp, foot = x
        A = np.dstack([crop, (M * 255).astype(np.uint8)]); A = cv2.resize(A, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        t = np.zeros((H, W, 4), np.uint8); ox, oy = int(W / 2 - cxp * s), int(H - 4 - foot * s)
        sx0, sy0 = max(0, -ox), max(0, -oy); dx0, dy0 = max(0, ox), max(0, oy)
        hh, ww = min(A.shape[0] - sy0, H - dy0), min(A.shape[1] - sx0, W - dx0)
        if hh > 0 and ww > 0: t[dy0:dy0 + hh, dx0:dx0 + ww] = A[sy0:sy0 + hh, sx0:sx0 + ww]
        tiles.append(t)
    n = len(tiles); cols = max(1, min(n, 4096 // W, 10)); rows = -(-n // cols)
    atlas = np.zeros((rows * H, cols * W, 4), np.uint8)
    for k, t in enumerate(tiles): atlas[(k // cols) * H:(k // cols + 1) * H, (k % cols) * W:(k % cols + 1) * W] = t
    rgb = atlas[..., :3].copy(); a = atlas[..., 3]
    name = f"s{c['t']:04d}"; cv2.imwrite(OUT + name + '.webp', cv2.cvtColor(atlas, cv2.COLOR_BGRA2RGBA)[..., [2, 1, 0, 3]], [cv2.IMWRITE_WEBP_QUALITY, 82])
    kind = 'walk' if c['cls'] == 0 else ('bike' if c['cls'] == 1 else 'scooter')
    meta.append(dict(file=name + '.webp', kind=kind, n=n, cols=cols, rows=rows, w=W, h=H, fps=25 / STEP, aspect=round(W / H, 3), hr=float(c['hr']), dx=c['dx'], srcFrames=[fs[0], fs[-1]]))
    print(name, kind, n, W, os.path.getsize(OUT + name + '.webp') // 1024, 'KB', flush=True)
json.dump(meta, open(OUT + 'sprites.json', 'w'), indent=1); print('done', len(meta))
