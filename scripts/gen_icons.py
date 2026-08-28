"""Regenerate app icons (no dependencies — stdlib zlib only).

Draws a rounded-square badge with a barbell glyph, supersampled 4x.
Outputs: assets/icons/{apple-touch-icon,icon-192,icon-512,icon-32}.png

    python scripts/gen_icons.py
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")

BG = (16, 20, 33)         # opaque background (apple-touch-icon must be opaque)
BADGE_TOP = (99, 102, 241)
BADGE_BOTTOM = (56, 189, 248)
FG = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_rounded_rect(px, py, x0, y0, x1, y1, r):
    if not (x0 <= px <= x1 and y0 <= py <= y1):
        return False
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        near_x = px < x0 + r if cx == x0 + r else px > x1 - r
        near_y = py < y0 + r if cy == y0 + r else py > y1 - r
        if near_x and near_y:
            return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return True


def in_barbell(px, py, S):
    import math
    cx, cy = S / 2, S / 2
    ang = math.radians(-25)
    dx, dy = px - cx, py - cy
    rx = dx * math.cos(ang) - dy * math.sin(ang)
    ry = dx * math.sin(ang) + dy * math.cos(ang)
    if abs(ry) <= S * 0.055 and abs(rx) <= S * 0.30:
        return True
    if abs(ry) <= S * 0.17 and S * 0.24 <= abs(rx) <= S * 0.33:
        return True
    if abs(ry) <= S * 0.26 and S * 0.33 <= abs(rx) <= S * 0.42:
        return True
    if abs(ry) <= S * 0.09 and S * 0.42 <= abs(rx) <= S * 0.47:
        return True
    return False


def render(size, ss=4, opaque=False):
    S = size * ss
    pad, r = S * 0.06, S * 0.22
    px_rows = []
    for y in range(S):
        row = []
        for x in range(S):
            fx, fy = x + 0.5, y + 0.5
            col, a = (BG, 255) if opaque else ((0, 0, 0), 0)
            if in_rounded_rect(fx, fy, pad, pad, S - pad, S - pad, r):
                col = lerp(BADGE_TOP, BADGE_BOTTOM, max(0.0, min(1.0, (fy - pad) / (S - 2 * pad))))
                a = 255
            if in_barbell(fx, fy, S):
                col, a = FG, 255
            row.append((col[0], col[1], col[2], a))
        px_rows.append(row)

    raw = bytearray()
    for oy in range(size):
        raw.append(0)
        for ox in range(size):
            rr = gg = bb = aa = 0
            for sy in range(ss):
                for sx in range(ss):
                    p = px_rows[oy * ss + sy][ox * ss + sx]
                    rr += p[0]; gg += p[1]; bb += p[2]; aa += p[3]
            n = ss * ss
            raw += bytes((rr // n, gg // n, bb // n, aa // n))
    return bytes(raw)


def write_png(path, raw, size):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    os.makedirs(OUT, exist_ok=True)
    for size, name, opaque in [
        (180, "apple-touch-icon.png", True),
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (32, "icon-32.png", False),
    ]:
        write_png(os.path.join(OUT, name), render(size, opaque=opaque), size)
        print("wrote", name)


if __name__ == "__main__":
    main()
