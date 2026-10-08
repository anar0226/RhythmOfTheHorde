"""Line the enemy attack frames up with the enemy's riding frame and pack them into one sheet.

Reads assets/Enemy Horseman/Enemy_Attack_Frame_1..5.png (sword at side, raised, overhead, the
slash, the follow-through), scales them to the riding frame's horse, aligns each horse onto it and
writes Enemy_Attack_Sheet.png. Every cell is the riding frame's canvas plus MARGIN on each side and
TOP above, so game.js can crop cells the same way it crops the riding frames. Needs numpy and Pillow.
"""
from pathlib import Path

import numpy as np
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "assets" / "Enemy Horseman"
MARGIN, TOP = 220, 40


def load(name):
    return Image.open(DIR / name).convert("RGBA")


def horse(img, below=0.45):
    """Opaque pixels below the rider's waist: the horse, without flag, raised sword or sword trails."""
    a = np.asarray(img).astype(np.float32) / 255
    m = (a[..., 3] > 0.8) & ((a[..., :3].std(-1) > 0.02) | (a[..., :3].mean(-1) < 0.5))
    ys = np.nonzero(m)[0]
    m[: int(ys.min() + (ys.max() - ys.min()) * below)] = False
    return m.astype(np.float32)


def shift(ref, img, size=1024):
    c = np.fft.ifft2(np.fft.fft2(ref, (size, size)) * np.conj(np.fft.fft2(img, (size, size)))).real
    dy, dx = np.unravel_index(np.argmax(c), c.shape)
    return (dx - size if dx > size // 2 else dx), (dy - size if dy > size // 2 else dy), c.max() / np.sqrt(ref.sum() * img.sum())


ride = load("Enemy_horseman_Frame_1.png")
ref = horse(ride)
frames = [load(f"Enemy_Attack_Frame_{k}.png") for k in range(1, 6)]


def scaled(img, s):
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


# one scale for all five: the one that best fits the clean frames (sword at side, raised, overhead)
scale = max(np.arange(0.9, 1.5, 0.01), key=lambda s: sum(shift(ref, horse(scaled(f, s)))[2] for f in frames[:3]))
ground = np.nonzero(ref.any(1))[0].max()
cw, ch = ride.width + 2 * MARGIN + 6, ride.height + TOP
sheet = Image.new("RGBA", (cw * len(frames), ch))
for k, f in enumerate(frames):
    f = scaled(f, scale)
    dx, dy, fit = shift(ref, horse(f))
    if fit < 0.75:  # sword trails across the horse: keep the fitted x but stand it on the same ground
        dy = ground - np.nonzero(horse(f).any(1))[0].max()
    sheet.alpha_composite(f, (k * cw + MARGIN + dx, TOP + dy))
    print(f"Attack_{k + 1}: scale {scale:.2f}, shift ({dx:+d}, {dy:+d}), fit {fit:.2f}")
sheet.save(DIR / "Enemy_Attack_Sheet.png", optimize=True)
print(f"wrote Enemy_Attack_Sheet.png ({sheet.width}x{sheet.height}, cells {cw}x{ch})")
