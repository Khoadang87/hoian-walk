# Pack the hand-picked, trimmed real cut-out clips into RGBA WebP atlases + sprites.json for the web app.
import cv2, json, numpy as np, os
O = '/workspace/pages-hoian/assets/hoian_live/sprites/'; os.makedirs(O, exist_ok=True)
M = {m['file'][1:5]: (d, m) for d in ('out', 'out2') for m in json.load(open(d + '/sprites.json'))}
PICK = [  # id, src dir, first, last(excl), kind, facing
 ('0337', 'out', 0, 50, 'walk', 'back'), ('0046', 'out', 4, 50, 'walk', 'back'), ('0084', 'out', 0, 34, 'walk', 'back'),
 ('0331', 'out', 0, 34, 'walk', 'front'), ('0414', 'out', 0, 43, 'walk', 'back'), ('0215', 'out', 0, 46, 'walk', 'front'),
 ('0222', 'out', 0, 42, 'walk', 'front'), ('0428', 'out2', 0, 23, 'walkbike', 'left'), ('0420', 'out', 0, 34, 'bike', 'front'),
 ('0763', 'out', 0, 30, 'bike', 'front'), ('0006', 'out2', 8, 32, 'scooter', 'left')]
meta = []
for k, d, a, b, kind, facing in PICK:
    dd, m = M[k]; assert dd == d, (k, dd)
    A = cv2.imread(f"{d}/{m['file']}", cv2.IMREAD_UNCHANGED); W, H = m['w'], m['h']
    tiles = [A[(i // m['cols']) * H:(i // m['cols'] + 1) * H, (i % m['cols']) * W:(i % m['cols'] + 1) * W] for i in range(a, min(b, m['n']))]
    tiles = [cv2.resize(t, (W * 3 // 4 // 4 * 4, H * 3 // 4), interpolation=cv2.INTER_AREA) for t in tiles] if kind == 'scooter' and W > 300 else tiles
    w, h = tiles[0].shape[1], tiles[0].shape[0]; n = len(tiles); cols = max(1, min(n, 2048 // w)); rows = -(-n // cols)
    at = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, t in enumerate(tiles): at[(i // cols) * h:(i // cols + 1) * h, (i % cols) * w:(i % cols + 1) * w] = t
    at[at[..., 3] < 8] = 0
    f = f"p{k}.webp"; cv2.imwrite(O + f, at, [cv2.IMWRITE_WEBP_QUALITY, 80])
    meta.append(dict(file=f, kind=kind, facing=facing, n=n, cols=cols, rows=rows, w=w, h=h, fps=m['fps'], srcFrames=m['srcFrames'], kb=os.path.getsize(O + f) // 1024))
json.dump(dict(source='https://www.youtube.com/watch?v=' + 'see CREDITS', note='Real people cut out of the 360 walk footage (YOLO11s-seg masks)', clips=meta), open(O + 'sprites.json', 'w'), indent=1)
for x in meta: print(x['file'], x['kind'], x['n'], x['w'], x['h'], x['kb'])
print(sum(x['kb'] for x in meta), 'KB')
