# Glasses on the hero

The hero photo, cut-out and dive video originally had no glasses. These scripts transplant the real
frames from a reference photo of Islam wearing them (`tools/brand/glasses/reference.jpeg`).
The scripts expect the original no-glasses assets in `_archive/hero-before-glasses/` (not committed — keep them locally if you need to re-run).

```bash
REF=tools/brand/glasses/reference.jpeg
# stills (landmarks are in 2048×1374 plate space, see the top of glasses.py)
python3 tools/brand/glasses/glasses.py "$REF" _archive/hero-before-glasses/plate.webp public/images/hero/plate.webp
python3 tools/brand/glasses/glasses.py "$REF" _archive/hero-before-glasses/cut.webp   public/images/hero/cut.webp
# video: track eyes with Vision, build one overlay per frame, composite (macOS)
swift tools/brand/glasses/track.swift _archive/hero-before-glasses/hero-dive.mp4 > /tmp/track.txt
mkdir -p /tmp/ov && python3 tools/brand/glasses/overlays.py tools/brand/glasses/glasses.py /tmp/track.txt "$REF" /tmp/ov
swift tools/brand/glasses/composite-video.swift _archive/hero-before-glasses/hero-dive.mp4 /tmp/ov public/media/hero-dive.mp4
```
