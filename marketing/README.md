# Marketing assets

Store screenshots and a 30-second trailer (Remotion), built from real captures of the panel running against the demo app.

```bash
npm run build && npm run build:demo
npm run demo                      # leave running on :4321
node marketing/capture.mjs        # raw panel screenshots -> marketing/raw/
node marketing/render.mjs         # framed store screenshots -> marketing/out/screenshots/
```

The trailer is a Remotion project in `video/`. Copy fresh captures into `video/public/`, then:

```bash
cd marketing/video
npm install
npx remotion studio src/index.tsx   # preview and scrub
npx remotion render src/index.tsx Trailer out/ngtrace-trailer.mp4 --codec=h264 --crf=16 --x264-preset=slow --pixel-format=yuv420p --image-format=png
```

### Store screenshots and promo (sticker style)

The five Chrome Web Store screenshots and the ~35 s promo share one set of scenes in `video/src/shots.tsx` (cut-outs of the captures, marker callouts, hand-drawn arrows); `video/src/Promo.tsx` adds the intro, hook, timeline, montage and outro. Copy fresh captures with `cp raw/*.png video/public/raw/`, then from `marketing/video`:

```bash
for i in 1 2 3 4 5; do npx remotion still src/index.tsx Shot$i out/shots/0$i.png --frame=-1; done
node scripts/sounds.mjs   # synthesizes the sound design into public/sfx (once)
npx remotion render src/index.tsx Promo out/ngtrace-promo.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=192k
npx remotion render src/index.tsx Promo out/ngtrace-promo-540p.mp4 --scale=0.5 --codec=h264 --crf=20 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=128k
```

Sound is UI sounds only, with no background bed (card slide, bubble pop, soft marker scribble, tick, transition whoosh, a closing ding), all synthesized by `scripts/sounds.mjs`: no music, no samples to license. Cards, callouts, arrows and circles play their own sound when they appear (`Sfx` in `kit.tsx`), so moving a delay keeps them in sync.

Crop rects are in the capture's 1440×810 CSS px, stage positions in the 1280×800 stage; each shot's last frame is its still.

### Trailer (zoom style)

Scene copy, order and zoom regions are in `video/src/scenes.ts` (rects in the capture's 1440×810 CSS px); timing and layout in `video/src/Trailer.tsx`.

`capture.mjs [scene...]` takes optional scene names. Screenshot copy lives in `showcase.html` (`SCENES`); open it in a browser with `?scene=contract` to preview one.

| Output | Use |
| --- | --- |
| `out/screenshots/NN-scene.png` | 1280×800, the Chrome Web Store screenshot size |
| `out/screenshots/NN-scene@2x.png` | 2560×1600 for the README, site, social posts |
| `video/out/ngtrace-trailer.mp4` | 30 s, 1920×1080, H.264, 18 MB |
| `video/out/ngtrace-trailer-720p.mp4` | 30 s, 1280×720, 3 MB, fits GitHub's 10 MB upload limit |
| `video/out/shots/0N.png` | 1280×800 sticker-style store screenshots |
| `video/out/ngtrace-promo.mp4` | 35 s, 1920×1080, H.264 + AAC, 10 MB |
| `video/out/ngtrace-promo-540p.mp4` | 35 s, 960×540, 3.7 MB |
| `out/social-preview.png` | 1280×640 GitHub social preview, from `social-preview.html` (`node marketing/social.mjs`) |
