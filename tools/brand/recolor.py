"""Shift green hues to ETQAN blue, leave other hues untouched. usage: recolor.py in out"""
import sys
from PIL import Image
LO, HI, FADE = 55, 135, 12          # PIL hue units (0-255); green ≈ 85
TARGET = 151                         # ≈ 213°, ETQAN blue
CENTER = 100
def weight(h):
    if h < LO - FADE or h > HI + FADE: return 0
    if h < LO: return (h - (LO - FADE)) / FADE
    if h > HI: return ((HI + FADE) - h) / FADE
    return 1
def shift(h):
    w = weight(h)
    return int(round(h + w * (TARGET - CENTER))) % 256
def recolor(im):
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    hsv = im.convert('RGB').convert('HSV')
    h, s, v = hsv.split()
    m = h.point(lambda x: int(255 * weight(x)))
    h2 = h.point(shift)
    s2 = s.point(lambda x: int(x * .92))
    s = Image.composite(s2, s, m)
    out = Image.merge('HSV', (h2, s, v)).convert('RGB')
    if alpha: out.putalpha(alpha)
    return out
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src); im.load()
    out = recolor(im)
    if dst.endswith('.webp'): out.save(dst, 'WEBP', quality=88, method=6)
    else: out.save(dst)
