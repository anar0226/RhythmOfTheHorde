import struct
import zlib
from pathlib import Path

import numpy as np

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "Character"
W, H, AX, AY = 600, 480, 290, 440


def read_png(path):
    data = path.read_bytes()
    pos, idat = 8, b""
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert depth == 8 and ctype == 6, f"{path.name}: expected 8-bit RGBA"
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    raw = np.frombuffer(zlib.decompress(idat), np.uint8).reshape(h, 1 + w * 4)
    out, prev = np.zeros((h, w * 4), np.int32), np.zeros(w * 4, np.int32)
    for y in range(h):
        f, row = raw[y, 0], raw[y, 1:].astype(np.int32)
        if f == 0:
            cur = row
        elif f == 1:
            cur = row.reshape(w, 4).cumsum(0).reshape(-1) % 256
        elif f == 2:
            cur = (row + prev) % 256
        else:
            r, p, c = row.tolist(), prev.tolist(), [0] * len(row)
            for x in range(len(r)):
                a, b, d = (c[x - 4] if x >= 4 else 0), p[x], (p[x - 4] if x >= 4 else 0)
                if f == 3:
                    pred = (a + b) // 2
                else:
                    pa, pb, pc = abs(b - d), abs(a - d), abs(a + b - 2 * d)
                    pred = a if pa <= pb and pa <= pc else b if pb <= pc else d
                c[x] = (r[x] + pred) & 255
            cur = np.array(c, np.int32)
        out[y], prev = cur, cur
    return out.reshape(h, w, 4).astype(np.float32) / 255


def write_png(path, rgba):
    img = (np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8)
    h, w = img.shape[:2]
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))
    chunk = lambda kind, body: struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def silhouette(img):
    return (img[:, :, 3] > 0.16).astype(np.float32)


def bottom_centre(img):
    ys, xs = np.nonzero(silhouette(img))
    return (xs.min() + xs.max()) / 2, ys.max()


def align(ref, img):
    size, best = 1024, (-1.0, 1.0, 0, 0)
    fa = np.fft.fft2(silhouette(ref), (size, size))
    m = silhouette(img)
    for s in np.arange(0.90, 1.101, 0.01):
        h, w = m.shape
        scaled = m[np.minimum((np.arange(round(h * s)) / s).astype(int), h - 1)][:, np.minimum((np.arange(round(w * s)) / s).astype(int), w - 1)]
        corr = np.fft.ifft2(fa * np.conj(np.fft.fft2(scaled, (size, size)))).real
        dy, dx = np.unravel_index(np.argmax(corr), corr.shape)
        score = corr.max() / np.sqrt(silhouette(ref).sum() * scaled.sum())
        if score > best[0]:
            best = (score, s, dx - size if dx > size // 2 else dx, dy - size if dy > size // 2 else dy)
    return best[1:]


def place(img, anchor, scale):
    pre = img.copy()
    pre[:, :, :3] *= pre[:, :, 3:]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sx, sy = (xx - AX) / scale + anchor[0], (yy - AY) / scale + anchor[1]
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
    h, w = img.shape[:2]

    def tap(x, y):
        inside = ((x >= 0) & (x < w) & (y >= 0) & (y < h))[..., None]
        return pre[np.clip(y, 0, h - 1), np.clip(x, 0, w - 1)] * inside

    return tap(x0, y0) * (1 - fx) * (1 - fy) + tap(x0 + 1, y0) * fx * (1 - fy) + tap(x0, y0 + 1) * (1 - fx) * fy + tap(x0 + 1, y0 + 1) * fx * fy


frames = {n: read_png(ASSETS / f"{n}.png") for n in
          ["Galloping_1", "Galloping_2", "Galloping_3", "Galloping_4", "Damaged_1", "Damaged_2", "Damaged_3"]}
ref = frames["Galloping_1"]
ref_anchor = bottom_centre(ref)
cells = {}
for name in ["Galloping_1", "Galloping_2", "Galloping_3", "Galloping_4", "Damaged_1", "Damaged_2"]:
    s, dx, dy = align(ref, frames[name]) if name != "Galloping_1" else (1.0, 0, 0)
    cells[name] = place(frames[name], ((ref_anchor[0] - dx) / s, (ref_anchor[1] - dy) / s), s)
    print(f"{name}: scale {s:.2f}, shift ({dx:+d}, {dy:+d})")
cells["Damaged_3"] = place(frames["Damaged_3"], bottom_centre(frames["Damaged_3"]), 0.75)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
feather = 14
rider = (np.clip((AY - 175 - yy) / feather + 0.5, 0, 1) * np.clip((xx - (AX - 38)) / feather + 0.5, 0, 1))[..., None]
steady = lambda name: cells["Galloping_1"] * rider + cells[name] * (1 - rider)

order = [steady("Galloping_1"), steady("Galloping_3"), steady("Galloping_4"), steady("Galloping_2"),
         cells["Galloping_4"], cells["Galloping_3"], cells["Damaged_1"], cells["Damaged_2"], cells["Damaged_3"]]
sheet = np.concatenate(order, axis=1)
alpha = sheet[..., 3:]
sheet[..., :3] = np.where(alpha > 0, sheet[..., :3] / np.maximum(alpha, 1e-6), 0)
write_png(ASSETS / "Rider_Sheet.png", sheet)
print(f"wrote {ASSETS / 'Rider_Sheet.png'} ({sheet.shape[1]}x{sheet.shape[0]}, {len(order)} cells)")
