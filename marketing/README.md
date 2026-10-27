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

Scene copy, order and zoom regions are in `video/src/scenes.ts` (rects in the capture's 1440×810 CSS px); timing and layout in `video/src/Trailer.tsx`.

`capture.mjs [scene...]` takes optional scene names. Screenshot copy lives in `showcase.html` (`SCENES`); open it in a browser with `?scene=contract` to preview one.

| Output | Use |
| --- | --- |
| `out/screenshots/NN-scene.png` | 1280×800, the Chrome Web Store screenshot size |
| `out/screenshots/NN-scene@2x.png` | 2560×1600 for the README, site, social posts |
| `video/out/ngtrace-trailer.mp4` | 30 s, 1920×1080, H.264, 18 MB |
| `video/out/ngtrace-trailer-720p.mp4` | 30 s, 1280×720, 3 MB, fits GitHub's 10 MB upload limit |
| `out/social-preview.png` | 1280×640 GitHub social preview, from `social-preview.html` (`node marketing/social.mjs`) |
