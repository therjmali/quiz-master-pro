#!/usr/bin/env python3
"""Regenerates every app icon from one parametric design (no font or external asset needed).

    pip install pillow && python3 scripts/generate-icons.py

Outputs
  public/icons/*              PWA icons (any + maskable), Apple touch icon, favicon
  android-res/mipmap-*/       Android legacy, round and adaptive-foreground launcher icons
  android-res/values/         adaptive-icon background colour
Replace the artwork by editing draw_glyph() or by dropping your own PNGs over the generated files.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parent.parent
SS = 4  # supersampling factor for crisp anti-aliased edges

BG_TOP, BG_BOTTOM = (22, 22, 36), (7, 7, 13)
AMBER_TOP, AMBER_BOTTOM = (255, 196, 66), (226, 140, 10)
WHITE = (255, 255, 255)


def vgrad(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return img


def glyph_mask(n, diameter):
    """Mask of a 'Q' ring with tail. `diameter` is the ring's diameter as a fraction of the canvas."""
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    c = n / 2
    r = diameter * n / 2
    stroke = r * 0.30
    d.ellipse([c - r, c - r, c + r, c + r], fill=255)
    d.ellipse([c - r + stroke, c - r + stroke, c + r - stroke, c + r - stroke], fill=0)
    # tail pointing down-right
    a = math.radians(45)
    x0, y0 = c + math.cos(a) * r * 0.55, c + math.sin(a) * r * 0.55
    x1, y1 = c + math.cos(a) * r * 1.22, c + math.sin(a) * r * 1.22
    w = stroke * 0.95
    d.line([x0, y0, x1, y1], fill=255, width=round(w))
    for (x, y) in ((x0, y0), (x1, y1)):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    return m


def check_mask(n, diameter):
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    c = n / 2
    r = diameter * n / 2
    w = round(r * 0.20)
    pts = [(c - r * 0.34, c + r * 0.02), (c - r * 0.08, c + r * 0.30), (c + r * 0.38, c - r * 0.26)]
    d.line(pts, fill=255, width=w, joint="curve")
    for (x, y) in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    return m


def compose(px, mode):
    """mode: tile | maskable | foreground | round"""
    n = px * SS
    diameter = {"tile": 0.52, "maskable": 0.44, "foreground": 0.40, "round": 0.50}[mode]
    if mode == "foreground":
        base = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    else:
        base = vgrad((n, n), BG_TOP, BG_BOTTOM).convert("RGBA")

    amber = vgrad((n, n), AMBER_TOP, AMBER_BOTTOM).convert("RGBA")
    base.paste(amber, (0, 0), glyph_mask(n, diameter))
    white = Image.new("RGBA", (n, n), WHITE + (255,))
    base.paste(white, (0, 0), check_mask(n, diameter))

    if mode == "tile":
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=round(n * 0.22), fill=255)
        out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
        base = out
    elif mode == "round":
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, n - 1, n - 1], fill=255)
        out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
        out.paste(base, (0, 0), mask)
        base = out
    return base.resize((px, px), Image.LANCZOS)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT))


def main():
    pub = ROOT / "public" / "icons"
    save(compose(192, "tile"), pub / "icon-192.png")
    save(compose(512, "tile"), pub / "icon-512.png")
    save(compose(512, "maskable"), pub / "icon-maskable-512.png")
    save(compose(180, "maskable"), pub / "apple-touch-icon.png")
    save(compose(32, "tile"), pub / "favicon-32.png")

    # Android: legacy launcher icons (48dp) and adaptive foreground (108dp) per density
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, scale in densities.items():
        d = ROOT / "android-res" / f"mipmap-{name}"
        save(compose(round(48 * scale), "tile"), d / "ic_launcher.png")
        save(compose(round(48 * scale), "round"), d / "ic_launcher_round.png")
        save(compose(round(108 * scale), "foreground"), d / "ic_launcher_foreground.png")

    values = ROOT / "android-res" / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#10101C</color>\n</resources>\n'
    )
    print("wrote android-res/values/ic_launcher_background.xml")


if __name__ == "__main__":
    main()
