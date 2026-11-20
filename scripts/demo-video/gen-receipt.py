#!/usr/bin/env python3
"""Generate the enrolment-receipt proof photo used in the demo video (AI evidence scene)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 860, 1080
img = Image.new("RGB", (W, H), "#F7F2E9")
d = ImageDraw.Draw(img)

def font(sz, bold=False):
    p = "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else "")
    return ImageFont.truetype(p, sz)

f_title = font(34, True); f_sub = font(20)
f_label = font(19); f_val = font(22, True)
f_amt = font(40, True); f_small = font(16)
f_stamp = font(26, True)

# header band
d.rectangle([0, 0, W, 150], fill="#0B6E4F")
d.text((48, 34), "ÉCOLE MAME DIARRA MBAYE", font=f_title, fill="#FAF6EF")
d.text((48, 92), "Médina, Dakar — Sénégal · Tel +221 33 821 45 67", font=f_sub, fill="#CFE8DD")

d.text((48, 190), "REÇU DE SCOLARITÉ — TRIMESTRE 2", font=font(26, True), fill="#173B2D")
d.line([48, 236, W - 48, 236], fill="#0B6E4F", width=3)

rows = [
    ("Élève", "Mariama Diop"),
    ("Classe", "CM2"),
    ("Année scolaire", "2026 – 2027"),
    ("Établissement", "École Mame Diarra Mbaye"),
    ("Mode de paiement", "Lightning (sats)"),
]
y = 280
for label, val in rows:
    d.text((48, y), label, font=f_label, fill="#5A6B60")
    d.text((330, y - 3), val, font=f_val, fill="#1A2B22")
    d.line([48, y + 34, W - 48, y + 34], fill="#D8CFBC", width=1)
    y += 62

d.text((48, y + 18), "MONTANT PAYÉ", font=f_label, fill="#5A6B60")
d.text((48, y + 46), "45 000 FCFA", font=f_amt, fill="#0B6E4F")
d.text((48, y + 102), "≈ 52 941 sats · frais Lightning inclus", font=f_sub, fill="#5A6B60")

# signature + date
d.text((520, y + 60), "Fait à Dakar, le 18/11/2026", font=f_small, fill="#5A6B60")
d.line([520, y + 130, W - 60, y + 130], fill="#1A2B22", width=2)
d.text((520, y + 140), "Signature & cachet de l'école", font=f_small, fill="#5A6B60")

# stamp
cx, cy, r = 660, 890, 95
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="#E86A33", width=5)
d.ellipse([cx - r + 14, cy - r + 14, cx + r - 14, cy + r - 14], outline="#E86A33", width=2)
d.text((cx - 62, cy - 34), "PAYÉ", font=f_stamp, fill="#E86A33")
d.text((cx - 48, cy + 6), "CM2 · T2", font=font(20, True), fill="#E86A33")
d.text((cx - 55, cy + 34), "2026/27", font=font(16), fill="#E86A33")

d.text((48, H - 60), "Document scanne pour verification — Jàngal", font=f_small, fill="#9AA08F")

out = "/home/z/my-project/scripts/video/proof-receipt.png"
img.save(out, "PNG")
print("saved", out)
