# Writes the Slack layout's window background: a PNG whose colour depends on the distance from the
# top-left corner, from the "system navigation" colour there to the "selected item" colour at the
# right and bottom edges (they blend in between). Standard library only.
#   python3 -I gradient.py OUT.png "#9C0000" "#070C52"
import sys, zlib, struct, math, random

out, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 800, 500
rgb = lambda h: [int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
ca, cb = rgb(a), rgb(b)
random.seed(7)
rows = []
for y in range(H):
    v = y / (H - 1)
    row = bytearray([0])
    for x in range(W):
        k = min(1.0, math.hypot(x / (W - 1), v))
        for i in range(3):
            row.append(max(0, min(255, int(ca[i] + (cb[i] - ca[i]) * k + random.random()))))  # light dither
    rows.append(bytes(row))
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
with open(out, "wb") as f:
    f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))
