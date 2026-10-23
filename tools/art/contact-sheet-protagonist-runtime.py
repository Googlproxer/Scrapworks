"""Assemble the Blender-rendered runtime contact sheet (requires Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/characters/3d/protagonist-runtime-v2'
shots = json.loads((OUT / 'previews/index.json').read_text(encoding='utf-8'))
sheet = Image.new('RGB', (1440, 102 + ((len(shots) + 3) // 4) * 518), '#17202b')
draw = ImageDraw.Draw(sheet)
try:
    title = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 30)
    label = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 20)
except OSError:
    title = label = ImageFont.load_default()
draw.text((24, 14), 'SCRAPWORKS / protagonist runtime v2', font=title, fill='#f2f4f7')
draw.text((24, 56), 'Actual GLB reimport: idle views, walk, run, left/right turn footwork. Original appearance preserved.', font=label, fill='#b5c4d5')
for i, shot in enumerate(shots):
    x, y = (i % 4) * 360, 102 + (i // 4) * 518
    with Image.open(OUT / 'previews' / shot['file']) as frame:
        sheet.paste(frame.convert('RGB'), (x, y))
    text = f"{shot['clip']} / frame {shot['frame']} / view {shot['camera_degrees']} deg"
    draw.text((x + 12, y + 486), text, font=label, fill='#f2f4f7')
sheet.save(OUT / 'animation-contact-sheet.png')
print(OUT / 'animation-contact-sheet.png')
