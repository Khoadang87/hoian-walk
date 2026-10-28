import json, collections, numpy as np
R = json.load(open('tracks.json')); T = collections.defaultdict(list); byf = collections.defaultdict(list)
for f, t, c, s, *b in R: T[t].append((f, c, b)); byf[f].append((t, c, b))
done = {m['file'][1:5] for m in json.load(open('out/sprites.json'))}; C = []
for t, L in T.items():
    if len(L) < 22 or f"{t:04d}" in done: continue
    a = np.array([l[2] for l in L], float); h = a[:, 3] - a[:, 1]; cx = (a[:, 0] + a[:, 2]) / 2
    cls = collections.Counter(l[1] for l in L).most_common(1)[0][0]
    if np.median(h) < 85 or cx.min() < 250 or cx.max() > 3590: continue
    if cls in (1, 3):  # needs a rider: a person box overlapping the vehicle's upper half in >60% of frames
        rid = sum(any(c == 0 and b[0] < v[2] and b[2] > v[0] and b[1] < v[1] + 0.4 * (v[3] - v[1]) and b[3] > v[1] for _, c, b in byf[f]) for f, _, v in L)
        if rid < 0.6 * len(L): continue
    C.append(dict(t=t, n=len(L), f0=L[0][0], f1=L[-1][0], cls=cls, h=int(np.median(h)), hr=round(float(h[-5:].mean() / h[:5].mean()), 2), cx=int(cx.mean()), dx=int(cx[-1] - cx[0])))
print(len(C), collections.Counter(c['cls'] for c in C)); json.dump(C, open('cand2.json', 'w'))
