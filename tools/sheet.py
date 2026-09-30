#!/usr/bin/env python3
"""Kontaktówka: składa postery w jeden plik do szybkiego przeglądu.

Użycie:  python3 tools/sheet.py [max_scenes] [out.png]
"""
import sys, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTERS = os.path.join(ROOT, 'posters')

names = sys.argv[1:]
out = os.path.join(ROOT, 'posters', '_sheet.png')
if names and names[0].endswith('.png'):
    out = names[0]
    names = names[1:]

limit = int(names[0]) if names else 12
files = sorted(f for f in os.listdir(POSTERS) if f.endswith('.png') and not f.startswith('_'))
if limit:
    files = files[:limit]

cols = 2
tw, th = 620, 349
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8), (18, 20, 28))
for i, f in enumerate(files):
    im = Image.open(os.path.join(POSTERS, f)).convert('RGB').resize((tw, th), Image.LANCZOS)
    x = 8 + (i % cols) * (tw + 8)
    y = 8 + (i // cols) * (th + 8)
    sheet.paste(im, (x, y))
sheet.save(out)
print(out, sheet.size, len(files), 'scen:', ', '.join(files))
