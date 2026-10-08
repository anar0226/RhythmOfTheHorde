"""Build the note chart from the song itself: one 8-character string per bar of eighths,
written into logic.js between the CHART markers. Needs librosa (pip install librosa).

The chart is a series of raids. Each horseman charges in to strike on a strong drum hit (*) and
throws on the song's other strong hits as he closes: spears (a) while still far out, shields (s)
once near. Keep RAID and SHIELD in step with the rider speed and flight times in game.js."""
import re
from pathlib import Path

import librosa
import numpy as np
import scipy.signal as ss

ROOT = Path(__file__).resolve().parent.parent
BPM, FIRST_BAR, LAST_BAR = 86, 3, 90
BEAT = 60 / BPM
DOWNBEAT = 0.125 + 3 * BEAT  # measured: the song's attacks land here, keep in step with logic.js
SLOT = BEAT / 2
RAID = 2.2  # seconds before his strike that a horseman can throw from
SHIELD = 1.3  # closer than this to his strike, he throws shields instead of spears

y, sr = librosa.load(ROOT / "assets/audio/The Hu- Wolf Totem.mp3", sr=22050)
hop = 64
S = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=1024)
times = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]


def flux(lo, hi):
    band = np.log1p(10 * S[(freqs >= lo) & (freqs < hi)])
    d = np.concatenate([[0], np.maximum(0, np.diff(band, axis=1)).sum(0)])
    return d / np.percentile(d, 95)


low, mid, high = flux(30, 200), flux(200, 2000), flux(2000, 11000)


def peak(e, t, w=0.03):
    i, j = np.searchsorted(times, [t - w, t + w])
    return e[i:j].max()


def level(t0):
    i, j = np.searchsorted(times, [t0, t0 + 4 * BEAT])
    return rms[i:j].mean()


bars = range(FIRST_BAR, LAST_BAR + 1)
times_ = np.array([DOWNBEAT + bar * 4 * BEAT + k * SLOT for bar in bars for k in range(8)])
lo, md, hi = (np.array([peak(e, t) for t in times_]) for e in (low, mid, high))
hit = hi + md + 0.6 * lo
levels = np.repeat([level(DOWNBEAT + bar * 4 * BEAT) for bar in bars], 8)
on_beat = np.arange(len(times_)) % 2 == 0
n = len(times_)

# how far apart the charges come: a rider every 2 bars when it's quiet, every 3 beats at full force
gap = np.select([levels < 0.08, levels < 0.13, levels < 0.2], [16, 12, 8], 6)
# how many throws a rider makes on his way in
throws = np.select([levels < 0.08, levels < 0.13, levels < 0.2], [0, 1, 1], 2)

# volleys of eighths (the cue to squat and slow time) on the drum fill before the band gets louder
bar_level = levels[::8]
volleys = {i for i in range(len(bars) - 1) if bar_level[i + 1] > 1.25 * bar_level[i] and bar_level[i + 1] >= 0.15}

row = ["."] * n
strike = on_beat & (hit > 1.2)
last = -99
k = 0
while k < n:
    bar = k // 8
    if bar in volleys and k % 8 == 0 and k + 8 < n:
        # one rider looses a volley through the whole bar and charges on the next downbeat
        for j in range(k, k + 8):
            row[j] = "a"
        row[k + 8], last, k = "*", k + 8, k + 9
        continue
    if k - last >= gap[k] and strike[k]:
        # take the strongest drum hit on a beat within the next bar as this rider's charge
        window = [j for j in range(k, min(n, k + 8)) if strike[j]]
        best = max(window, key=lambda j: lo[j] + 0.5 * hit[j])
        row[best], last = "*", best
        lead = [j for j in range(max(0, best - int(RAID / SLOT)), best - 1) if row[j] == "." and hit[j] > 0.9]
        for j in sorted(lead, key=lambda j: -hit[j]):
            taken = [i for i in lead if row[i] != "."]
            if len(taken) < throws[best] and all(abs(i - j) >= 2 for i in taken) and row[j - 1] == "." and row[j + 1] == ".":
                row[j] = "s" if (best - j) * SLOT < SHIELD else "a"
        k = best + 1
        continue
    k += 1

chart = ["".join(row[i:i + 8]) for i in range(0, n, 8)]

src = (ROOT / "logic.js").read_text()
body = "\n".join(f"  {', '.join(repr(r) for r in chart[i:i + 4])}," for i in range(0, len(chart), 4))
src = re.sub(r"(// CHART:start.*?\n).*?(  // CHART:end)", lambda m: m.group(1) + body + "\n" + m.group(2), src, flags=re.S)
(ROOT / "logic.js").write_text(src)
print(f"{sum(c != '.' for row in chart for c in row)} notes over {len(chart)} bars")
