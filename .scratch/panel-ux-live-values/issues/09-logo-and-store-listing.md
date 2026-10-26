# Logo and Chrome Web Store listing assets

Status: ready-for-human

## What
- Generate the logo with an image tool from the prompt below, at 1024×1024 on a transparent background. Don't use or imitate the Angular shield.
  > A minimal, flat vector app icon for a developer tool called "Angular API Inspector". The mark is a bold magnifying glass whose lens contains a small three-node tree diagram (one parent node connected to two child nodes), with a thin signal line running from one child node out through the handle, suggesting network requests flowing from a component. Colour is a smooth gradient from deep crimson (#C3002F) to magenta (#B52E9C), on a transparent background. Geometric, rounded stroke ends, no text, no letters, no shield shapes. It must stay legible at 16×16 pixels, with thick strokes and strong silhouette. Centered on a square canvas with even padding. Style similar to modern Chrome DevTools and VS Code extension icons.
- Export `icon-16/32/48/128.png`. The 128 icon has ~96×96 of artwork with 16 px transparent padding. Put them in `extension/static/icons/`.
- Listing images: 1–5 screenshots at 1280×800, a 440×280 small promo tile (required), and a 1400×560 marquee (optional).
- Listing text and forms: full description, single-purpose statement, a justification for each permission (`scripting`, `storage`, localhost hosts, optional `http(s)://*/*`), the data-usage disclosure, and a privacy policy URL (all data stays local). Category Developer Tools, plus a support contact.

## Acceptance
- The PNGs are committed under `extension/static/icons/`, which unblocks 10.

## Comments

2026-10-26: Logo supplied at public/logo.png (cleaned of stray specks). Generated extension/static/icons/icon-16/32/48/128.png (128 has 96px art + 16px padding) and store/: logo-1024.png, store-icon-128.png, promo-small-440x280.png, promo-marquee-1400x560.png. Still for a human: 1–5 screenshots at 1280×800, listing text, permission justifications, data-usage form, privacy policy URL.
