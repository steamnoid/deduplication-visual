#!/usr/bin/env python3
"""Kontaktówka slajdów decku (zrzuty .shots/*.png).

Użycie:  python3 tools/decksheet.py 0 12 [out.png] [cols]
"""
import sys, os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, '.shots')

start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
count = int(sys.argv[2]) if len(sys.argv) > 2 else 12
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, '.shots', '_sheet.png')
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 2

files = sorted(f for f in os.listdir(SHOTS) if f.endswith('.png') and not f.startswith('_'))[start:start + count]
tw = 640
ims = []
for f in files:
    im = Image.open(os.path.join(SHOTS, f)).convert('RGB')
    th = int(tw * im.height / im.width)
    ims.append((f, im.resize((tw, th), Image.LANCZOS)))
th = ims[0][1].height
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rows * (th + 20) + 6), (14, 16, 22))
d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(ims):
    x = 6 + (i % cols) * (tw + 6)
    y = 6 + (i // cols) * (th + 20)
    sheet.paste(im, (x, y))
    d.text((x + 4, y + th + 4), f.replace('.png', ''), fill=(150, 160, 185))
sheet.save(out)
print(out, sheet.size, len(ims))
