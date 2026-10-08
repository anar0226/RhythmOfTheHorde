"""Build each song's note chart from the song itself and write them all to charts.js.
Needs librosa (pip install librosa).

A chart is one 8-character string per bar of eighths. It is a series of raids: each horseman
charges in to strike on a strong drum hit (*) and throws on the song's other strong hits as he
closes, spears (a) while still far out and shields (s) once near. Keep RAID and SHIELD in step with
the rider speed and flight times in game.js.

A song with a steady tempo is placed on a fixed grid (bpm, downbeat). A song played with a drifting
tempo gets a beat map instead: tracked beats, snapped to the drum attacks and smoothed, which is
written to charts.js too so the game follows the band's tempo.
"""
import json
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAID = 2.2  # seconds before his strike that a horseman can throw from
SHIELD = 1.3  # closer than this to his strike, he throws shields instead of spears
# loudness tiers: up to what bar loudness, how many seconds between charges, how many throws per rider.
# Loudness is the bar's RMS, tuned on Wolf Totem; a louder mix gives "loud": its own loud level (90th percentile bar)
# against Wolf Totem's (0.258), and the tiers are scaled by that ratio.
TIERS = [(0.08, 5.58, 0), (0.13, 4.18, 1), (0.2, 2.79, 1), (np.inf, 2.09, 2)]
VOLLEY = 0.15  # a volley needs the bar after it at least this loud

SONGS = {
    "WOLF_TOTEM": dict(file="The Hu- Wolf Totem.mp3", bpm=86, downbeat=0.125 + 3 * 60 / 86, bars=(3, 90)),
    # mixed louder than Wolf Totem, so its tiers are scaled to its own loud level
    "KHAR_KHULZ": dict(file="Uuhai - Khar Khulz.mp3", bpm=125, bars=(4, 119), loud=True),
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


def chart(a, beat_at, bars, loud=False):
    def peak(e, t, w=0.03):
        i, j = np.searchsorted(a["times"], [t - w, t + w])
        return e[i:j].max()

    def level(t0, t1):
        i, j = np.searchsorted(a["times"], [t0, t1])
        return a["rms"][i:j].mean()

    first, last = bars
    slots = np.array([beat_at(bar * 4 + k / 2) for bar in range(first, last + 1) for k in range(8)])
    lo, md, hi = (np.array([peak(a[e], t) for t in slots]) for e in ("low", "mid", "high"))
    hit = hi + md + 0.6 * lo
    bar_level = np.array([level(beat_at(bar * 4), beat_at(bar * 4 + 4)) for bar in range(first, last + 1)])
    scale = np.percentile(bar_level, 90) / 0.258 if loud else 1
    tier = [next(t for t in TIERS if lv < t[0] * scale) for lv in np.repeat(bar_level, 8)]
    on_beat = np.arange(len(slots)) % 2 == 0
    # volleys of eighths (the cue to squat and slow time) on the drum fill before the band gets louder
    volleys = {i for i in range(len(bar_level) - 1) if bar_level[i + 1] > 1.25 * bar_level[i] and bar_level[i + 1] >= VOLLEY * scale}

    n, row, strike, last_charge, k = len(slots), ["."] * len(slots), on_beat & (hit > 1.2), None, 0
    while k < n:
        if k // 8 in volleys and k % 8 == 0 and k + 8 < n:
            # one rider looses a volley through the whole bar and charges on the next downbeat
            row[k:k + 8] = ["a"] * 8
            row[k + 8], last_charge, k = "*", k + 8, k + 9
            continue
        gap = tier[k][1]
        if (last_charge is None or slots[k] - slots[last_charge] >= gap - 1e-6) and strike[k]:
            # take the strongest drum hit on a beat within the next bar as this rider's charge
            best = max((j for j in range(k, min(n, k + 8)) if strike[j]), key=lambda j: lo[j] + 0.5 * hit[j])
            # his throws come after the previous rider's charge
            lead = [j for j in range(max(0, best - 16, -1 if last_charge is None else last_charge + 1), best - 1)
                    if slots[best] - slots[j] <= RAID and row[j] == "." and hit[j] > 0.9]
            row[best], last_charge = "*", best
            for j in sorted(lead, key=lambda j: -hit[j]):
                taken = [i for i in lead if row[i] != "."]
                if len(taken) < tier[best][2] and all(abs(i - j) >= 2 for i in taken) and row[j - 1] == "." and row[j + 1] == ".":
                    row[j] = "s" if slots[best] - slots[j] < SHIELD else "a"
            k = best + 1
            continue
        k += 1
    return ["".join(row[i:i + 8]) for i in range(0, n, 8)]


out = ["// Generated by tools/chart.py from each song's own hits; edit by hand or re-run it.",
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
    rows = chart(a, beat_at, song["bars"], song.get("loud", False))
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
