import json, collections, numpy as np
T = collections.defaultdict(list)
for f, t, c, s, x0, y0, x1, y1 in json.load(open('tracks.json')): T[t].append((f, c, s, x0, y0, x1, y1))
C = []
for t, L in T.items():
    if len(L) < 30: continue
    a = np.array([l[3:] for l in L], float); h = a[:, 3] - a[:, 1]; cx = (a[:, 0] + a[:, 2]) / 2
    cls = collections.Counter(l[1] for l in L).most_common(1)[0][0]
    if np.median(h) < 110 or cx.min() < 250 or cx.max() > 3590: continue
    C.append(dict(t=t, n=len(L), f0=L[0][0], f1=L[-1][0], cls=cls, h=int(np.median(h)), hr=round(h[-5:].mean() / h[:5].mean(), 2), cx=int(cx.mean()), dx=int(cx[-1] - cx[0])))
C.sort(key=lambda c: -c['h'] * min(c['n'], 75)); json.dump(C, open('cand.json', 'w'))
for c in C[:40]: print(c)
print(len(C))
