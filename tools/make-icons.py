"""PWA ikonlarını üretir (icons/ klasörüne).

Kullanım:  python tools/make-icons.py     (Pillow gerekir: pip install pillow)

Tasarım: koyu zemin üzerinde amber akort göstergesi yayı, ortada yeşil "akortta"
bölgesi ve hafif sağa yatık ibre — uygulamanın ana göstergesinin sade hali.
"""
import math
import os
from PIL import Image, ImageDraw

BG = (20, 22, 28)          # --bg
ACCENT = (240, 168, 60)    # --accent
OK = (52, 196, 124)        # --ok
NEEDLE = (244, 242, 238)
SS = 4                     # süper örnekleme

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def draw_icon(size, maskable):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=BG)
        scale = 0.78          # içerik maskelenebilir güvenli bölgede kalsın
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
        scale = 1.0

    def p(v):  # 0..1 koordinatı merkez etrafında ölçekle
        return (0.5 + (v - 0.5) * scale) * S

    cx, cy = p(0.5), p(0.62)
    r = 0.33 * scale * S
    w = int(0.065 * scale * S)
    box = [cx - r, cy - r, cx + r, cy + r]
    # PIL açıları: 0 = sağ, saat yönünde. Üst yay 200°..340°.
    d.arc(box, 200, 340, fill=ACCENT, width=w)
    d.arc(box, 262, 278, fill=OK, width=w)
    # yay uçlarını yuvarla
    for ang in (200, 340):
        a = math.radians(ang)
        ex, ey = cx + (r - w / 2) * math.cos(a), cy + (r - w / 2) * math.sin(a)
        d.ellipse([ex - w / 2, ey - w / 2, ex + w / 2, ey + w / 2], fill=ACCENT)
    # ibre
    a = math.radians(282)
    L = r * 0.92
    nx, ny = cx + L * math.cos(a), cy + L * math.sin(a)
    nw = int(0.04 * scale * S)
    d.line([cx, cy, nx, ny], fill=NEEDLE, width=nw)
    d.ellipse([nx - nw / 2, ny - nw / 2, nx + nw / 2, ny + nw / 2], fill=NEEDLE)
    pr = 0.06 * scale * S
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=ACCENT)
    img = img.resize((size, size), Image.LANCZOS)
    if maskable or size <= 180:
        # maskable ve apple-touch-icon şeffaflık istemez
        flat = Image.new('RGB', (size, size), BG)
        flat.paste(img, mask=img.split()[3])
        return flat
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-512.png', 512, True),
        ('apple-touch-icon.png', 180, True),
        ('favicon-32.png', 32, False),
    ]
    for name, size, mask in jobs:
        draw_icon(size, mask).save(os.path.join(OUT, name), optimize=True)
        print('yazıldı:', name)


if __name__ == '__main__':
    main()
