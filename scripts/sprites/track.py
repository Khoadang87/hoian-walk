# Stage 1: track people/bikes/scooters in the 360 walk video (horizon band) with YOLO11n + ByteTrack.
import cv2, json, sys
from ultralytics import YOLO
m = YOLO('yolo11n.pt'); V = '/workspace/pages-hoian/assets/hoian_live/walk_4k.mp4'; Y0, Y1 = 560, 1560
cap = cv2.VideoCapture(V); out = []; i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    r = m.track(f[Y0:Y1], imgsz=1280, classes=[0, 1, 3], persist=True, conf=0.3, verbose=False, tracker='bytetrack.yaml')[0]
    if r.boxes.id is not None:
        for b, c, t, s in zip(r.boxes.xyxy.tolist(), r.boxes.cls.tolist(), r.boxes.id.tolist(), r.boxes.conf.tolist()):
            out.append([i, int(t), int(c), round(s, 2), *[round(v) for v in (b[0], b[1] + Y0, b[2], b[3] + Y0)]])
    i += 1
    if i % 100 == 0: print(i, len(out), flush=True)
json.dump(out, open('tracks.json', 'w')); print('done', i)
