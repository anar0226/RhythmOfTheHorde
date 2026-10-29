"""Pack the pixel-art horsemen into the sheets game.js crops.

Reads assets/pixel/Rider/Mongol Horseman 1..8.png and assets/pixel/Enemy/Enemy Horseman 1..8.png,
aligns every frame's horse onto frame 1's horse and writes Rider_Sheet.png and Enemy_Sheet.png.
Each cell has the reference horse's bottom-centre at the cell's bottom-centre, so game.js anchors
cells by their bottom-centre. Frames that are not a standing horse are stood on the same spot by
their own bottom-centre. Prints the cell size game.js needs. Needs numpy and Pillow.
"""
from pathlib import Path

import numpy as np
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "assets" / "pixel"


def load(path):
    return Image.open(DIR / path).convert("RGBA")


def horse(img, below=0.45):
    """Opaque pixels below the rider's waist: the horse, without flag, raised sword or sword trails."""
    a = np.asarray(img)[..., 3] > 200
    ys = np.nonzero(a)[0]
    a[: int(ys.min() + (ys.max() - ys.min()) * below)] = False
    return a.astype(np.float32)


def shift(ref, img, size=1024):
    c = np.fft.ifft2(np.fft.fft2(ref, (size, size)) * np.conj(np.fft.fft2(img, (size, size)))).real
    dy, dx = np.unravel_index(np.argmax(c), c.shape)
    return (dx - size if dx > size // 2 else dx), (dy - size if dy > size // 2 else dy), c.max() / np.sqrt(ref.sum() * img.sum())


def foot(m):
    ys, xs = np.nonzero(m)
    return (xs.min() + xs.max()) // 2, ys.max()


def hurt(img):
    """A frame flushed red, for the rider taking a hit."""
    a = np.asarray(img).astype(np.float32)
    a[..., :3] = a[..., :3] * 0.55 + np.array([230, 40, 30]) * 0.45
    return Image.fromarray(a.astype(np.uint8))


def sheet(frames, name):
    """frames: (image, align) pairs; the first is the reference."""
    ref = horse(frames[0][0])
    rx, ry = foot(ref)
    spots = []
    for img, align in frames:
        dx, dy, fit = shift(ref, horse(img)) if align else (0, 0, 0)
        if not align:  # not a standing horse: stand its bottom-centre on the reference's
            fx, fy = foot(np.asarray(img)[..., 3] > 40)
            dx, dy = rx - fx, ry - fy
        elif fit < 0.75:  # sword trail across the horse: keep the fitted x but stand it on the same ground
            dy = ry - foot(horse(img))[1]
        spots.append((dx, dy))
    # cell: wide enough for every frame either side of the anchor, bottom at the anchor
    half = max(max(rx - dx, dx + img.width - rx) for (img, _), (dx, _dy) in zip(frames, spots))
    top = max(ry - dy for dy in (s[1] for s in spots))
    cw, ch = 2 * half, top + 1
    out = Image.new("RGBA", (cw * len(frames), ch))
    for k, ((img, _), (dx, dy)) in enumerate(zip(frames, spots)):
        out.alpha_composite(img, (k * cw + half - rx + dx, top - ry + dy))
    out.save(DIR / name, optimize=True)
    print(f"wrote {name}: {len(frames)} cells of {cw}x{ch}")


rider = [load(f"Rider/Mongol Horseman {k}.png") for k in range(1, 9)]
enemy = [load(f"Enemy/Enemy Horseman {k}.png") for k in range(1, 9)]
# the fallen horse is drawn larger than the riding frames; 0.7 matches the flag and rider by eye
enemy[7] = enemy[7].resize((round(enemy[7].width * 0.7), round(enemy[7].height * 0.7)), Image.NEAREST)
# gallop (1, 8), slash (5, 6), hurt (1, 8 flushed red), fallen (the fallen horse)
sheet([(rider[0], True), (rider[7], True), (rider[4], True), (rider[5], True),
       (hurt(rider[0]), True), (hurt(rider[7]), True), (enemy[7], False)], "Rider_Sheet.png")
# frames 1-6 ride and attack, 7 stumbles, 8 lies dead
sheet([(f, k < 6) for k, f in enumerate(enemy)], "Enemy_Sheet.png")
