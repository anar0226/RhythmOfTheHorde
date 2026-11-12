"""Pack the pixel-art horsemen into the sheets game.js crops.

Reads the PA Mongol Horseman Extra, PA Chingis Khaan and PA Enemy Horseman Extra frames, aligns every
frame's horse onto the first frame's horse and writes Rider_PA_Sheet.png, Khan_PA_Sheet.png and Enemy_PA_Sheet.png.
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


def scaled(img, k):
    return img.resize((round(img.width * k), round(img.height * k)), Image.NEAREST)


def frames(folder, name, n):
    return [load(f"{folder}/{name} {k}.png") for k in range(1, n + 1)]


enemy_a = frames("PA Enemy Horseman Extra", "Enemy Horseman Extra", 12)
# set 2 is drawn about 9% larger than set 1; shrink it to match
enemy_b = [scaled(f, 317 / 345) for f in frames("PA Enemy Horseman Extra", "Enemy Horseman Extra 2", 12)]
# 16 cells per skin: frames 1-16 (1-5 gallop, 6-10 wind up, 11-15 slash, 16 recover),
# then 17-18 hurt (frames 1, 2 flushed red) and 19 fallen (the enemy's dead horse)
for folder, name, out in [("PA Mongol Horseman Extra", "Mongol Horseman Extra", "Rider_PA_Sheet.png"),
                          ("PA Chingis Khaan", "Chingis Khaan", "Khan_PA_Sheet.png")]:
    hero = frames(folder, name, 16)
    sheet([(f, True) for f in hero] + [(hurt(hero[0]), True), (hurt(hero[1]), True), (enemy_b[11], False)], out)
# 0-3 ride, 4-6 raise the sword, 7-8 slash and follow through, 9-10 hit, 11 falls, 12 lies dead
sheet([(f, True) for f in [enemy_a[4], enemy_a[5], enemy_b[4], enemy_b[5], enemy_b[1], enemy_b[2], enemy_b[3],
                           enemy_b[6], enemy_b[7], enemy_b[8], enemy_b[9]]]
      + [(enemy_b[10], False), (enemy_b[11], False)], "Enemy_PA_Sheet.png")
