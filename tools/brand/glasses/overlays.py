"""Build per-frame glasses overlays (RGBA, video size) from the Vision eye track."""
import sys, re, math, importlib.util
from PIL import Image, ImageFilter, ImageChops, ImageDraw
spec = importlib.util.spec_from_file_location('g2', sys.argv[1]); g2 = importlib.util.module_from_spec(spec)
src = open(sys.argv[1]).read().replace('\nmain(*sys.argv[1:4])', '')
exec(compile(src, 'g2', 'exec'), g2.__dict__)
track, ref_path, outdir = sys.argv[2], sys.argv[3], sys.argv[4]
VW, VH, PW, PH = 880, 590, 2048, 1374
k = VW / PW
rows = {}
for line in open(track):
    m = re.match(r'(\d+) [\d.]+ viewerL ([\d.]+) ([\d.]+) viewerR ([\d.]+) ([\d.]+)', line)
    if m:
        i = int(m.group(1)); a = (float(m.group(4)), float(m.group(5))); b = (float(m.group(2)), float(m.group(3)))
        rows[i] = (a, b)   # (viewer-left eye, viewer-right eye) in video px
LAST = max(rows)            # 20
# smooth (3-tap) but keep frame 0 exact
def sm(i, e, c):
    vals = [rows[j][e][c] for j in (i - 1, i, i + 1) if j in rows]
    return sum(vals) / len(vals)
ref = Image.open(ref_path).convert('RGB'); layer = g2.ref_layer(ref)
E0 = rows[0]; d0 = math.dist(*E0); min_turn = 1.0
for i in range(0, LAST + 1):
    eyes = []
    for e in (0, 1):
        x = E0[e][0] if i == 0 else sm(i, e, 0); y = E0[e][1] if i == 0 else sm(i, e, 1)
        eyes.append((g2.PLATE_EYES[e][0] + (x - E0[e][0]) / k, g2.PLATE_EYES[e][1] + (y - E0[e][1]) / k))
    d = math.dist(*[rows[i][0], rows[i][1]]) if i else d0
    turn = max(0.0, min(1.0, (d0 * 1.08 - d) / (d0 * 0.08)))   # 1 at the hero pose, 0 once the face is frontal
    turn = min_turn = min(min_turn, turn)                        # the head only turns towards camera in this clip
    # build overlay in plate space
    f, s, th = g2.similarity(g2.REF_EYES, eyes)
    far_mask = Image.new('L', ref.size, 0); ImageDraw.Draw(far_mask).polygon(g2.grow(g2.REF_FAR, 2.5), fill=255)
    # visible temple length follows the head turn: long at the hero pose, a short stub when frontal
    cut = Image.new('L', ref.size, 0); cd = ImageDraw.Draw(cut)
    cd.rectangle((854 + 34 * turn, 0, ref.size[0], ref.size[1]), fill=255)
    if turn < .5: cd.rectangle((0, 0, 745, ref.size[1]), fill=255)
    cut = cut.filter(ImageFilter.GaussianBlur(1.5))
    near = layer.copy(); near.putalpha(ImageChops.subtract(ImageChops.subtract(near.getchannel('A'), far_mask), cut))
    far = layer.copy(); far.putalpha(ImageChops.multiply(far.getchannel('A'), far_mask))
    inv = 1 / s; c, si = math.cos(-th) * inv, math.sin(-th) * inv
    (ax, ay), (cx, cy) = g2.REF_EYES[0], eyes[0]
    aff = (c, -si, ax - c * cx + si * cy, si, c, ay - si * cx - c * cy)
    wn = near.transform((PW, PH), Image.AFFINE, aff, resample=Image.BICUBIC)
    tq = [f(p) for p in g2.REF_FAR]
    shift = 15.3 * turn * s / 1.381
    tq[0] = (tq[0][0] + shift, tq[0][1]); tq[3] = (tq[3][0] + shift, tq[3][1])
    wf = far.transform((PW, PH), Image.PERSPECTIVE, g2.persp_coeffs(tq, g2.REF_FAR), resample=Image.BICUBIC)
    gl = Image.alpha_composite(wf, wn); ga = gl.getchannel('A')
    sh = ImageChops.offset(ga.filter(ImageFilter.GaussianBlur(2.4)), 1, 3).point(lambda v: int(v * .3))
    shade = Image.new('RGBA', (PW, PH), (25, 15, 12, 0)); shade.putalpha(sh)
    ov = Image.alpha_composite(shade, gl).resize((VW, VH), Image.LANCZOS)
    ov.save(f'{outdir}/ov{i:03d}.png')
    print(i, 'eyes', [tuple(round(v, 1) for v in e) for e in eyes], 'turn %.2f' % turn)
