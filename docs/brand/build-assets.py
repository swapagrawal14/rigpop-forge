#!/usr/bin/env python3
"""Build the README visuals from the real example pack art.

Dev-only (needs Pillow):  python3 docs/brand/build-assets.py
Outputs (committed, so the README works with zero build step):
  docs/assets/hero.png         banner: brand + Doodle Swapnil
  docs/assets/doodle-swapnil.gif  base -> wave -> point -> thumbs -> open
  docs/assets/pose-strip.png   the four gesture poses, labelled
  docs/assets/anatomy.png      base with the real patch rects + patch insets
Source art: examples/doodle-swapnil/talk/*.png + its manifest rects.
Brand: hot pink #FF4D8D, sunny yellow #FFD23F, cream #FFF6E5, ink #1F2228.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
TALK = ROOT / "examples/doodle-swapnil/talk"
OUT = ROOT / "docs/assets"
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = json.loads((ROOT / "examples/doodle-swapnil/character.rigpop.json").read_text())

PINK, YELLOW, CREAM, INK = "#FF4D8D", "#FFD23F", "#FFF6E5", "#1F2228"
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

def load(name):
    return Image.open(TALK / name).convert("RGBA")

def on_cream(img, bg=CREAM):
    canvas = Image.new("RGBA", img.size, bg)
    canvas.alpha_composite(img)
    return canvas.convert("RGB")

# ---------- hero ----------
def hero():
    W, H = 1280, 440
    img = Image.new("RGB", (W, H), PINK)
    d = ImageDraw.Draw(img)
    d.polygon([(0, H), (W, int(H * 0.55)), (W, H)], fill=YELLOW)
    for (x, y, r, c) in [(90, 70, 16, YELLOW), (190, 44, 10, CREAM), (560, 88, 12, CREAM), (70, 300, 12, CREAM), (640, 330, 14, PINK)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    char = load("pose_wave.png")
    char.thumbnail((360, 468))
    img.paste(char, (W - 400, H - char.height - 8), char)
    d.text((64, 96), "rigpop-forge", font=font(FB, 92), fill="white")
    d.text((68, 208), "One drawing in, a character pack out —", font=font(FB, 34), fill=INK)
    d.text((68, 252), "for every Rigpop app.", font=font(FB, 34), fill=INK)
    d.rounded_rectangle([68, 316, 660, 368], radius=26, fill=INK)
    d.text((90, 328), "talk · agents · motion · wowkit", font=font(FB, 26), fill="white")
    img.save(OUT / "hero.png")

# ---------- animated gif ----------
def gif():
    frames = []
    for name in ["base.png", "pose_wave.png", "pose_point.png", "pose_thumbs.png", "pose_open.png"]:
        im = load(name)
        im.thumbnail((360, 468))
        frames.append(on_cream(im))
    frames[0].save(OUT / "doodle-swapnil.gif", save_all=True, append_images=frames[1:], duration=650, loop=0)

# ---------- pose strip ----------
def pose_strip():
    names = [("pose_wave.png", "wave · hello, namaste, bye"), ("pose_point.png", "point · idea, tip, first"),
             ("pose_open.png", "open · why, what, kyun"), ("pose_thumbs.png", "thumbs · great, badhiya, yes")]
    cell_w, cell_h, label_h = 300, 390, 44
    img = Image.new("RGB", (cell_w * 4, cell_h + label_h), CREAM)
    d = ImageDraw.Draw(img)
    for i, (name, label) in enumerate(names):
        im = load(name)
        im.thumbnail((cell_w, cell_h))
        img.paste(on_cream(im), (i * cell_w, 0))
        short = label.split(" ·")[0]
        rest = label.split("· ")[1]
        d.text((i * cell_w + 14, cell_h + 4), short, font=font(FB, 24), fill=PINK)
        d.text((i * cell_w + 14, cell_h + 30), rest, font=font(FR, 15), fill=INK)
    img.save(OUT / "pose-strip.png")

# ---------- anatomy ----------
def anatomy():
    base = load("base.png")
    scale = 560 / base.width
    small = base.resize((560, int(base.height * scale)))
    img = Image.new("RGB", (1280, 830), "white")
    d = ImageDraw.Draw(img)
    img.paste(on_cream(small), (20, 20))
    patches = MANIFEST["talk"]["patches"]
    colours = {"A": PINK, "O": "#7B61FF", "E": "#00A676", "blink": "#2483FF"}
    # letters tucked into a different corner of each (near-concentric) rect
    corner = {"A": "tl", "O": "br", "E": "bl", "blink": "tr"}
    for key, rect in patches.items():
        x, y = 20 + rect["x"] * scale, 20 + rect["y"] * scale
        w, h = rect["w"] * scale, rect["h"] * scale
        d.rectangle([x, y, x + w, y + h], outline=colours[key], width=4)
        c = corner[key]
        lx = x + 3 if c in ("tl", "bl") else x + w - (34 if key == "blink" else 16)
        ly = y + 2 if c in ("tl", "tr") else y + h - 24
        if key == "blink":
            lx, ly = x + w + 8, y - 2
        d.text((lx, ly), key, font=font(FB, 21), fill=colours[key])
    d.text((20, 772), "base drawing + the rects QA checks", font=font(FB, 22), fill=INK)
    # right panel: the actual patch images, enlarged
    y = 40
    d.text((620, y), "the patches themselves", font=font(FB, 30), fill=INK); y += 56
    for key in ["A", "O", "E", "blink"]:
        p = load(f"{key}.png")
        big = p.resize((p.width * 2, p.height * 2), Image.NEAREST)
        tile = Image.new("RGBA", big.size, CREAM)
        tile.alpha_composite(big)
        img.paste(tile.convert("RGB"), (620, y))
        r = patches[key]
        d.text((620 + big.width + 18, y + 8), f"{key}", font=font(FB, 30), fill=colours[key])
        d.text((620 + big.width + 18, y + 46), f"{r['w']}×{r['h']} px at ({r['x']}, {r['y']})", font=font(FR, 19), fill=INK)
        y += big.height + 26
    img.save(OUT / "anatomy.png")

if __name__ == "__main__":
    hero(); gif(); pose_strip(); anatomy()
    for f in sorted(OUT.iterdir()):
        print(f.name, f.stat().st_size // 1024, "KB")
