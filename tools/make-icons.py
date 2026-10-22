"""Generate the app icons (a bell seen face-on: red dome, black ring, paper clapper).

Run from the repo root:  python3 tools/make-icons.py   (needs Pillow)
"""
from PIL import Image, ImageDraw

BLACK = (11, 11, 12)
RED = (212, 32, 44)
PAPER = (243, 238, 228)
SS = 4  # supersample for smooth edges


def icon(size, pad):
    """pad = fraction of the canvas kept clear around the bell (maskable needs ~0.2)."""
    s = size * SS
    img = Image.new('RGB', (s, s), BLACK)
    d = ImageDraw.Draw(img)
    c = s / 2
    r = s * (0.5 - pad)

    def circle(radius, fill):
        d.ellipse([c - radius, c - radius, c + radius, c + radius], fill=fill)

    circle(r, RED)
    circle(r * 0.74, BLACK)
    circle(r * 0.62, RED)
    circle(r * 0.2, PAPER)
    return img.resize((size, size), Image.LANCZOS)


icon(192, 0.06).save('icons/icon-192.png')
icon(512, 0.06).save('icons/icon-512.png')
icon(512, 0.2).save('icons/icon-maskable-512.png')
icon(180, 0.1).save('icons/apple-touch-icon.png')
print('icons written')
