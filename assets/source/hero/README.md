# Hero source assets (archival — not served)

Original, full-quality source files for the home-page hero. Nothing in this folder is
deployed; the runtime files live in `apps/web/public/` and are derived from these.
Keep them: they are the only originals (the repo's `_archive/` mentioned in
`apps/web/README.original.md` was never committed).

| File | What it is | Used at runtime? |
|---|---|---|
| `Confident Professional with Retro Phone and Laptop.png` | Original portrait, white background, 1532×1027. Source of the hero photo (`public/images/hero/plate.webp`, navy background + desk) and the cut-out (`cut.webp`) | No (derived files are) |
| `hiro_video.mp4` | **Approved** hero → laptop dive clip: navy background, desk, 1280×720, 24 fps, 5.2 s, H.264 ~1.6 Mb/s + AAC audio. Same shot and geometry as the hero plates (measured: scale 1.60, centred 16:9 band) | Yes, re-encoded as `public/media/hero-dive.mp4` |
| `dive-clip-drafts/hero_v1–4.mp4` | Earlier drafts of the dive: **white background, no desk**, different laptop motion per take; 1280×720, 24 fps, 5.0 s. They do **not** match the approved design | No |

## How `public/media/hero-dive.mp4` is made

The hero box (`.trans` in `apps/web/src/styles/home.css`) has the photos' 2048×1374
proportions and masks 78.05 frame units at the top and bottom, so only the centred
16:9 band is ever visible. The clip is padded to that proportion (the padding is
always masked) and the audio dropped (the video always plays muted):

```bash
ffmpeg -i assets/source/hero/hiro_video.mp4 -an \
  -vf "pad=1280:858:0:69:color=black,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 18 -r 24 -g 48 -movflags +faststart \
  apps/web/public/media/hero-dive.mp4
```

Result: 1280×858, 24 fps, ~1.06 MB, SSIM 0.996 against the source band.
The previous clip (from the target repo) was 880×590 at 12 fps.
