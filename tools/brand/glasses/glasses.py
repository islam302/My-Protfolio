"""Transplant the real glasses from the reference photo onto the hero plate/cut.
usage: glasses2.py ref.jpg in.webp out.webp"""
import sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

# --- landmarks -------------------------------------------------------------
REF_EYES   = [(775, 178), (825, 190)]          # far, near eye centres in the reference
PLATE_EYES = [(1040, 248), (1110, 260)]        # same eyes on the hero plate
REF_FAR  = [(746, 163), (793, 171), (790, 200), (750, 200)]
REF_NEAR = [(803, 173), (852, 183), (849, 210), (808, 208)]
FACE_EDGE_X = 1014                              # far side of the face on the plate at eye level
T = 4.2                                         # frame band thickness in ref px

def similarity(a, b):
    (ax, ay), (bx, by) = a; (cx, cy), (dx, dy) = b
    v1 = (bx - ax, by - ay); v2 = (dx - cx, dy - cy)
    s = math.hypot(*v2) / math.hypot(*v1)
    th = math.atan2(v2[1], v2[0]) - math.atan2(v1[1], v1[0])
    c, si = s * math.cos(th), s * math.sin(th)
    def f(p):
        x, y = p[0] - ax, p[1] - ay
        return (cx + c * x - si * y, cy + si * x + c * y)
    return f, s, th

def solve(A, b):
    n = len(b); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i])); M[i], M[p] = M[p], M[i]
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [a - f * bb for a, bb in zip(M[r], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]

def persp_coeffs(dst, src):
    """PIL wants coeffs mapping OUTPUT (dst) -> INPUT (src)."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(A, b)

def inset(q, d):
    cx = sum(p[0] for p in q) / 4; cy = sum(p[1] for p in q) / 4
    return [(x + (cx - x) / math.hypot(cx - x, cy - y) * d * 1.3, y + (cy - y) / math.hypot(cx - x, cy - y) * d * 1.3) for x, y in q]

def grow(q, d): return inset(q, -d)

def ref_layer(ref):
    """RGBA of the reference with alpha = dark frame pixels inside the frame band."""
    W, H = ref.size
    band = Image.new('L', (W, H), 0); d = ImageDraw.Draw(band)
    for q in (REF_FAR, REF_NEAR):
        d.polygon(grow(q, 1.6), fill=255)
        d.polygon(inset(q, T), fill=0)
    d.polygon([(791, 168), (806, 170), (806, 181), (791, 178)], fill=255)          # bridge
    d.polygon([(850, 179), (888, 185), (888, 195), (850, 189)], fill=255)          # near temple
    d.polygon([(738, 159), (749, 160), (749, 170), (738, 169)], fill=255)          # far temple stub
    band = band.filter(ImageFilter.GaussianBlur(.6))
    lum = ref.convert('L')
    dark = lum.point(lambda v: max(0, min(255, int((150 - v) * 255 / 75))))
    alpha = ImageChops.multiply(band, dark)
    out = ref.convert('RGBA'); out.putalpha(alpha)
    return out

def main(ref_path, src, dst):
    ref = Image.open(ref_path).convert('RGB')
    layer = ref_layer(ref)
    im = Image.open(src); im.load(); mode = im.mode
    base = im.convert('RGBA')
    f, s, th = similarity(REF_EYES, PLATE_EYES)

    # near lens + bridge + temples: one similarity warp (whole layer)
    far_mask_ref = Image.new('L', ref.size, 0)
    ImageDraw.Draw(far_mask_ref).polygon(grow(REF_FAR, 2.5), fill=255)
    near_layer = layer.copy()
    na = ImageChops.subtract(near_layer.getchannel('A'), far_mask_ref); near_layer.putalpha(na)
    far_layer = layer.copy()
    fa = ImageChops.multiply(far_layer.getchannel('A'), far_mask_ref); far_layer.putalpha(fa)

    # affine output->input for the similarity
    inv_s = 1 / s; c, si = math.cos(-th) * inv_s, math.sin(-th) * inv_s
    (ax, ay), (cx, cy) = REF_EYES[0], PLATE_EYES[0]
    # x_in = ax + c*(X-cx) - si*(Y-cy) ; y_in = ay + si*(X-cx) + c*(Y-cy)
    aff = (c, -si, ax - c * cx + si * cy, si, c, ay - si * cx - c * cy)
    warped_near = near_layer.transform(base.size, Image.AFFINE, aff, resample=Image.BICUBIC)

    # far lens: similarity-mapped quad, outer side squeezed to the face edge (head is turned more)
    tq = [f(p) for p in REF_FAR]
    shift = max(0, FACE_EDGE_X - min(tq[0][0], tq[3][0]))
    tq[0] = (tq[0][0] + shift, tq[0][1]); tq[3] = (tq[3][0] + shift, tq[3][1])
    coeffs = persp_coeffs(tq, REF_FAR)
    warped_far = far_layer.transform(base.size, Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC)

    glasses = Image.alpha_composite(warped_far, warped_near)
    # far temple stub would now float in front of the face if the lens moved: drop it when squeezed
    ga = glasses.getchannel('A')
    shadow = ImageChops.offset(ga.filter(ImageFilter.GaussianBlur(2.4)), 1, 3).point(lambda v: int(v * .3))
    shade = Image.new('RGBA', base.size, (25, 15, 12, 255))
    out = Image.composite(shade, base, shadow) if 'A' not in mode else base
    if 'A' in mode:
        # keep alpha: shadow only where the cut-out already has skin
        sh = ImageChops.multiply(shadow, base.getchannel('A'))
        out = Image.composite(shade, base, sh); out.putalpha(base.getchannel('A'))
    out = Image.alpha_composite(out, glasses)
    if 'A' in mode:
        out.putalpha(ImageChops.lighter(base.getchannel('A'), ga))
    else:
        out = out.convert('RGB')
    out.save(dst, 'WEBP', quality=90, method=6)
    print('scale %.3f rot %.2fdeg far-shift %.1f' % (s, math.degrees(th), shift))

main(*sys.argv[1:4])
