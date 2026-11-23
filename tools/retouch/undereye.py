#!/usr/bin/env python3
"""
Hero photo retouch (plate + cut-out): soften the dark circles under the eyes and
make the irises black (the owner's eyes are black; the generated photo had them brown).

Non-generative, local retouch: the face, its features and its skin texture are kept
exactly. For each under-eye area (hand-placed ellipses in the 2048x1374 hero
geometry) only the LOW-frequency colour/shading is pulled toward the cheek just
below it; the high-frequency detail (pores, lashes, lid lines) is left untouched.
Very dark pixels (lashes, the glasses frame) are protected by the mask.

    python tools/retouch/undereye.py <in.webp|png> <out.png> [--preview out_preview.png]

Run on the ORIGINAL hero files kept in assets/source/hero/site-originals/ so the
edit is never applied twice.
"""
import sys

import cv2
import numpy as np

# Hero geometry (2048x1374, same for plate.webp and cut.webp).
# (centre x, centre y, half width, half height, angle deg) of each dark circle, and the
# cheek patch (x0, y0, x1, y1) whose colour it should match.
AREAS = [
    {"ellipse": (1041, 266, 25, 11, 6), "cheek": (1030, 283, 1062, 294)},   # his right eye (left in the photo)
    {"ellipse": (1121, 278, 32, 11, 4), "cheek": (1102, 294, 1146, 305)},  # his left eye
]
# Irises: (centre x, centre y, radius). Pupil, catch-light and sclera are protected.
IRISES = [(1034.5, 246.5, 6.0), (1104, 258, 6.8)]
IRIS_L = 0.4        # lightness multiplier for the iris
IRIS_CHROMA = 0.25  # colour multiplier (brown -> neutral near-black)
STRENGTH_L = 0.95   # how far lightness moves toward the cheek (0..1)
STRENGTH_AB = 0.75   # how far the purple/brown tint moves toward the cheek
FEATHER = 5.0       # mask softness, px
LOWPASS = 6.0       # sigma separating colour/shading from texture, px


def retouch(bgr):
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    low = cv2.GaussianBlur(lab, (0, 0), LOWPASS)
    out = lab.copy()
    h, w = lab.shape[:2]
    for a in AREAS:
        cx, cy, rx, ry, ang = a["ellipse"]
        mask = np.zeros((h, w), np.float32)
        cv2.ellipse(mask, (cx, cy), (rx, ry), ang, 0, 360, 1.0, -1, cv2.LINE_AA)
        mask = cv2.GaussianBlur(mask, (0, 0), FEATHER)
        # Protect lashes and the glasses frame: weight falls to 0 for very dark pixels.
        L = lab[..., 0]
        protect = np.clip((L - 70.0) / 40.0, 0.0, 1.0)  # OpenCV L is 0..255
        mask *= protect
        x0, y0, x1, y1 = a["cheek"]
        target = low[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0)
        delta = target[None, None, :] - low
        delta[..., 0] = np.maximum(delta[..., 0], 0.0)  # only ever lighten
        out[..., 0] += mask * STRENGTH_L * delta[..., 0]
        out[..., 1] += mask * STRENGTH_AB * delta[..., 1]
        out[..., 2] += mask * STRENGTH_AB * delta[..., 2]
    for cx, cy, r in IRISES:
        m = np.zeros((h, w), np.float32)
        cv2.circle(m, (int(cx * 8), int(cy * 8)), int(r * 8), 1.0, -1, cv2.LINE_AA, shift=3)
        m = cv2.GaussianBlur(m, (0, 0), 0.9)
        L = lab[..., 0]
        m *= np.clip((172.0 - L) / 28.0, 0.0, 1.0)  # keep the white of the eye and the catch-light
        out[..., 0] = out[..., 0] * (1 - m) + out[..., 0] * IRIS_L * m
        out[..., 1] = 128 + (out[..., 1] - 128) * (1 - m + IRIS_CHROMA * m)
        out[..., 2] = 128 + (out[..., 2] - 128) * (1 - m + IRIS_CHROMA * m)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_LAB2BGR)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise SystemExit(f"cannot read {src}")
    alpha = img[..., 3] if img.ndim == 3 and img.shape[2] == 4 else None
    bgr = img[..., :3]
    fixed = retouch(bgr)
    result = np.dstack([fixed, alpha]) if alpha is not None else fixed
    cv2.imwrite(dst, result)
    if "--preview" in sys.argv:
        x0, y0, x1, y1 = 1000, 215, 1170, 310
        before = cv2.resize(bgr[y0:y1, x0:x1], None, fx=4, fy=4, interpolation=cv2.INTER_LANCZOS4)
        after = cv2.resize(fixed[y0:y1, x0:x1], None, fx=4, fy=4, interpolation=cv2.INTER_LANCZOS4)
        cv2.imwrite(sys.argv[sys.argv.index("--preview") + 1], np.hstack([before, np.full((before.shape[0], 12, 3), 255, np.uint8), after]))
    print(f"{src} -> {dst}")


if __name__ == "__main__":
    main()
