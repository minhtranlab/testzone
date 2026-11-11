"""Put a design mock and a live screenshot side by side (same width), with a label on top. #35 evidence.
usage: python3 side_by_side.py mock.png live.png out.png "label left" "label right" [width]"""
import sys
from PIL import Image, ImageDraw, ImageFont
a, b, out, la, lb = sys.argv[1:6]
w = int(sys.argv[6]) if len(sys.argv) > 6 else 1280
def load(p):
    im = Image.open(p).convert('RGB'); return im.resize((w, round(im.height * w / im.width)))
A, B = load(a), load(b)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', max(16, w // 50))
except Exception: f = None
pad, top = 24, max(48, w // 22)
H = max(A.height, B.height) + top
im = Image.new('RGB', (w * 2 + pad * 3, H + pad), 'white'); d = ImageDraw.Draw(im)
for i, (x, l) in enumerate([(A, la), (B, lb)]):
    ox = pad + i * (w + pad); d.text((ox, pad // 2), l, fill='#191c26', font=f)
    im.paste(x, (ox, top)); d.rectangle([ox - 1, top - 1, ox + w, top + x.height], outline='#c7c7c7')
im.save(out); print(out, im.size)
