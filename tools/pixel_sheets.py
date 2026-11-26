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
# then 17-18 hurt (frames 1, 3 flushed red) and 19 fallen (the enemy's dead horse)
for folder, name, out in [("PA Mongol Horseman Extra", "Mongol Horseman Extra", "Rider_PA_Sheet.png"),
                          ("PA Chingis Khaan", "Chingis Khaan", "Khan_PA_Sheet.png")]:
    hero = frames(folder, name, 16)
    sheet([(f, True) for f in hero] + [(hurt(hero[0]), True), (hurt(hero[2]), True), (enemy_b[11], False)], out)
# 0-3 ride, 4-6 raise the sword, 7-8 slash and follow through, 9-10 hit, 11 falls, 12 lies dead
sheet([(f, True) for f in [enemy_a[4], enemy_a[5], enemy_b[4], enemy_b[5], enemy_b[1], enemy_b[2], enemy_b[3],
                           enemy_b[6], enemy_b[7], enemy_b[8], enemy_b[9]]]
      + [(enemy_b[10], False), (enemy_b[11], False)], "Enemy_PA_Sheet.png")


# Blade fixes, made on the packed sheets. Boxes are (x0, y0, x1, y1) inside a cell.
def steel(a, outline=1):
    """The sword blade: pale, blue-leaning pixels, with an outline this many pixels wide around them."""
    m = (a[..., :3].min(-1) > 110) & (a[..., 2].astype(int) >= a[..., 0].astype(int) + 5) & (a[..., 3] > 200)
    for _ in range(outline):
        grown = m.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            grown |= np.roll(m, (dy, dx), (0, 1))
        m = grown
    return m & (a[..., 3] > 0)


def bob(a, cw, src, dst, head):
    """How far the rider sits from cell src to cell dst: the shift that best lines up their heads."""
    x0, y0, x1, y1 = head
    ref = a[y0:y1, src * cw + x0:src * cw + x1].astype(int)
    return min(((dx, dy) for dx in range(-8, 9) for dy in range(-8, 9)),
               key=lambda d: np.abs(a[y0 + d[1]:y1 + d[1], dst * cw + x0 + d[0]:dst * cw + x1 + d[0]].astype(int) - ref).sum())


def blade(a, cw, src, dst, box, head):
    """Copies the blade in box from cell src onto cell dst, moved with the rider."""
    dx, dy = bob(a, cw, src, dst, head)
    x0, y0, x1, y1 = box
    part = a[y0:y1, src * cw + x0:src * cw + x1]
    m = steel(part)
    a[y0 + dy:y1 + dy, dst * cw + x0 + dx:dst * cw + x1 + dx][m] = part[m]


def erase(a, cw, cell, box, fill):
    """Removes the blade in box from cell, showing cell fill's pixels there instead (where fill has no blade)."""
    x0, y0, x1, y1 = box
    here, under = a[y0:y1, cell * cw + x0:cell * cw + x1], a[y0:y1, fill * cw + x0:fill * cw + x1].copy()
    m = steel(here, 3)  # wide enough to take the old blade's dark edge too
    under[steel(under)] = 0
    here[m] = under[m]


def clear(a, cw, cell, box):
    """Empties box in cell except for its blade: for open sky where stray outline pixels are left."""
    x0, y0, x1, y1 = box
    here = a[y0:y1, cell * cw + x0:cell * cw + x1]
    here[~steel(here)] = 0


def largest(m):
    """Only the biggest connected patch of m: the blade, without stray pale pixels nearby."""
    seen, best = np.zeros_like(m), []
    for y, x in zip(*np.nonzero(m)):
        if seen[y, x]:
            continue
        seen[y, x], todo, patch = True, [(y, x)], []
        while todo:
            cy, cx = todo.pop()
            patch.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    todo.append((ny, nx))
        best = max(best, patch, key=len)
    out = np.zeros_like(m)
    out[tuple(np.array(best).T)] = True
    return out


def hilt(a, key):
    """Where the blade meets the hand: the end of the blade that key picks out (smallest key wins)."""
    ys, xs = np.nonzero(steel(a, 0))
    i = np.argmin(key(xs, ys))
    return xs[i], ys[i]


def sway(a, cw, src, box, key, plan, head, grip=None, sky=None):
    """Gives each cell in plan the blade from cell src, tilted up by its angle (degrees) about the hand.
    plan: (cell, angle). A cell with a blade of its own has it erased (showing cell src's pixels there)
    and its hand is found at the end of that blade that grip picks out; a cell without one has its
    hand where src's is, moved by how far the rider bobs. sky: a box of open air to wipe of old-blade bits."""
    x0, y0, x1, y1 = box
    region = lambda k: a[y0:y1, k * cw + x0:k * cw + x1]
    part = region(src).copy()
    m, (sx, sy) = largest(steel(part)), hilt(part, key)
    sword = Image.fromarray(np.where(m[..., None], part, 0).astype(np.uint8))
    hands = {}
    for k, _ in plan:  # find every hand before anything is erased
        if steel(region(k), 0).any():
            hands[k] = hilt(region(k), grip or key)
            erase(a, cw, k, box, src)
            if sky:
                sx0, sy0, sx1, sy1 = sky
                a[sy0:sy1, k * cw + sx0:k * cw + sx1] = 0
        else:
            dx, dy = bob(a, cw, src, k, head)
            hands[k] = sx + dx, sy + dy
    for k, angle in plan:
        r = np.array(sword.rotate(angle, resample=Image.NEAREST, center=(int(sx), int(sy))))
        hx, hy = hands[k]
        ys, xs = np.nonzero(r[..., 3])
        a[y0 + ys + hy - sy, k * cw + x0 + xs + hx - sx] = r[ys, xs]


def patch(name, cw, fix):
    a = np.array(Image.open(DIR / name))
    fix(a, cw)
    Image.fromarray(a).save(DIR / name, optimize=True)


# The gallop sword sways a little, like the Khan's: a blade tilted up a few degrees a frame about the hand.
# The enemy's frames 2 and 4 have no sword of their own; they get frames 1 and 3's, tilted.
patch("Enemy_PA_Sheet.png", 386, lambda a, cw: (sway(a, cw, 0, (140, 150, 280, 228), lambda x, y: x + y, [(1, 4)], (200, 95, 250, 135)),
                                                sway(a, cw, 2, (140, 150, 280, 228), lambda x, y: x + y, [(3, 4)], (200, 95, 250, 135))))
# The rider gallops on frames 1-3 with frame 1's low blade; frames 2 and 3 held theirs up and out, so those
# are erased, and the hand is at the blade's lower-left end.
patch("Rider_PA_Sheet.png", 370, lambda a, cw: sway(a, cw, 0, (140, 110, 310, 222), lambda x, y: x + y, [(1, 8), (2, 16)],
                                                    (195, 85, 250, 135), grip=lambda x, y: x - y, sky=(245, 100, 320, 148)))
