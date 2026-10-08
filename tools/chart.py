"""Build each song's note chart from the song itself and write them all to charts.js.
Needs librosa (pip install librosa).

A chart is one 8-character string per bar of eighths. It is a series of raids: each horseman
charges in to strike (*) on a downbeat and throws on the beats before it, spears (a) while still far
out and shields (s) once near. Every hit is on a beat, in a steady pattern that changes only from one
4-bar phrase to the next, so the player can ride the pulse; the song's loudness picks the pattern.
Keep SHIELD in step with the rider speed and flight times in game.js.

A song with a steady tempo is placed on a fixed grid (bpm, downbeat). A song played with a drifting
tempo gets a beat map instead: tracked beats, snapped to the drum attacks and smoothed, which is
written to charts.js too so the game follows the band's tempo.
"""
import json
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SHIELD = 1.3  # closer than this to his strike, he throws shields instead of spears
PHRASE = 4  # bars
# loudness tiers: up to what share of the song's phrases (quietest first), and the four bars a phrase
# rides through (* a charge, x a throw at the next bar's charge), ending in a fill into the next phrase.
TIERS = [
    (0.15, ["*.......", "........", "*.......", "........"]),
    (0.4, ["*.......", "*.......", "*.......", "*...x..."]),
    (0.7, ["*...x...", "*...x...", "*...x...", "*.x.x..."]),
    (1, ["*.x.x...", "*.x.x...", "*.x.x...", "*.x.x.x."]),
]

SONGS = {
    "WOLF_TOTEM": dict(file="The Hu- Wolf Totem.mp3", bpm=86, downbeat=0.125 + 3 * 60 / 86, bars=(3, 90)),
    "KHAR_KHULZ": dict(file="Uuhai - Khar Khulz.mp3", bpm=125, bars=(4, 119)),
}


def analyse(file):
    y, sr = librosa.load(ROOT / "assets/audio" / file, sr=22050)
    hop = 64
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=1024)

    def flux(lo, hi):
        band = np.log1p(10 * S[(freqs >= lo) & (freqs < hi)])
        d = np.concatenate([[0], np.maximum(0, np.diff(band, axis=1)).sum(0)])
        return d / np.percentile(d, 95)

    return dict(y=y, sr=sr, times=librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop),
                rms=librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0],
                low=flux(30, 200), mid=flux(200, 2000), high=flux(2000, 11000))


def beat_map(a, bpm):
    """Tracked beats, each snapped to the strongest attack within 40 ms, then smoothed by a weighted
    straight-line fit over the 8 beats either side, so it follows the drift but not every flam."""
    env = librosa.onset.onset_strength(y=a["y"], sr=a["sr"], hop_length=128)
    _, beats = librosa.beat.beat_track(onset_envelope=env, sr=a["sr"], hop_length=128, units="time", start_bpm=bpm, tightness=800)
    hit = a["low"] + a["mid"] + a["high"]
    snapped = []
    for t in beats:
        i, j = np.searchsorted(a["times"], [t - 0.04, t + 0.04])
        k = i + np.argmax(hit[i:j])
        snapped.append((a["times"][k], hit[k]))
    snapped = np.array(snapped)
    out = []
    for k in range(len(beats)):
        lo, hi = max(0, k - 8), min(len(beats), k + 9)
        idx, w = np.arange(lo, hi), np.sqrt(snapped[lo:hi, 1])
        slope, at = np.linalg.lstsq(np.vstack([idx, np.ones_like(idx)]).T * w[:, None], snapped[lo:hi, 0] * w, rcond=None)[0]
        out.append(slope * k + at + 0.005)  # attacks peak ~5 ms before they are heard as the beat
    return np.array(out)


def chart(a, beat_at, bars):
    def peak(e, t, w=0.03):
        i, j = np.searchsorted(a["times"], [t - w, t + w])
        return e[i:j].max()

    def level(t0, t1):
        i, j = np.searchsorted(a["times"], [t0, t1])
        return a["rms"][i:j].mean()

    first, last = bars
    n = last - first + 1
    down = [beat_at((first + i) * 4) for i in range(n)]
    bar_level = np.array([level(beat_at((first + i) * 4), beat_at((first + i) * 4 + 4)) for i in range(n)])
    hit = np.array([peak(a["high"], t) + peak(a["mid"], t) + 0.6 * peak(a["low"], t) for t in down])

    # phrases lined up so the song's jumps in loudness fall on their first bars
    jumps = [i + 1 for i in range(n - 1) if bar_level[i + 1] > 1.25 * bar_level[i]]
    phase = max(range(PHRASE), key=lambda p: sum((j - p) % PHRASE == 0 for j in jumps))
    phrases = {}
    for i in range(n):
        phrases.setdefault((i - phase) // PHRASE, []).append(i)
    loudness = {p: bar_level[bars].mean() for p, bars in phrases.items()}
    rank = {p: np.mean([lv < loudness[p] for lv in loudness.values()]) for p in phrases}
    tier = {p: next(k for k, (share, _) in enumerate(TIERS) if rank[p] < share) for p in phrases}

    rows = []
    for i in range(n):
        k = tier[(i - phase) // PHRASE]
        row = list(TIERS[k][1][(i - phase) % PHRASE])
        if k == 0 and hit[i] < 1.2:
            row[0] = "."  # a quiet bar only gets a rider on a real drum hit
        rows.append(row)
    # a volley of spears (the cue to squat and slow time) on the drum fill before a louder phrase,
    # its rider charging on the phrase's first downbeat
    for p, bars in phrases.items():
        if p + 1 in phrases and loudness[p + 1] > 1.15 * loudness[p] and tier[p + 1] >= 2:
            rows[bars[-1]] = list("aaaaaaaa")
            rows[phrases[p + 1][0]][0] = "*"
    # throws are at the next bar's charge, so none where no charge follows
    for i, row in enumerate(rows):
        for j, c in enumerate(row):
            if c == "x":
                charge = i + 1 < n and rows[i + 1][0] == "*"
                row[j] = "." if not charge else "s" if down[i + 1] - beat_at((first + i) * 4 + j / 2) < SHIELD else "a"
    return ["".join(r) for r in rows]


out = ["// Generated by tools/chart.py from each song's beat and loudness; edit by hand or re-run it.",
       "// A chart is one string per bar of eighths, from bar firstBar on: a spear, s shield, * rider charging in."]
for name, song in SONGS.items():
    a = analyse(song["file"])
    entry = dict(firstBar=song["bars"][0])
    if "downbeat" in song:
        entry.update(bpm=song["bpm"], downbeat=round(song["downbeat"], 4))
        beat_at = lambda b, s=song: s["downbeat"] + b * 60 / s["bpm"]
    else:
        beats = beat_map(a, song["bpm"])
        entry.update(bpm=song["bpm"], beats=[round(float(t), 3) for t in beats])
        beat_at = lambda b, bs=beats: float(np.interp(b, np.arange(len(bs)), bs))
    rows = chart(a, beat_at, song["bars"])
    notes = sum(c != "." for r in rows for c in r)
    print(f"{name}: {notes} notes over {len(rows)} bars")
    body = json.dumps({k: v for k, v in entry.items() if k != "beats"})[:-1]
    out.append(f"export const {name} = {body},")
    if "beats" in entry:
        out.append(f"  beats: {json.dumps(entry['beats'])},")
    out.append("  chart: [")
    out += [f"    {', '.join(repr(r) for r in rows[i:i + 4])}," for i in range(0, len(rows), 4)]
    out.append("  ],\n};")
(ROOT / "charts.js").write_text("\n".join(out) + "\n")
