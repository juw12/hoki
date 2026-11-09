# Hoki design system

Hoki is a quiet little shrine for a waving lucky cat. It borrows its visual language from
[Jeda](https://github.com/juw12/jeda) (warm paper, white cards, serif display type, one gold accent,
flat layered SVG scenes) and from Sansa, the Korean web temple (calm scenery first, sparse rounded UI).

## References
- Jeda: cream `#f6f2eb` page, white 20 px cards, soft brown-tinted shadows, Iowan/Palatino serif, gold accent,
  sky-gradient scenes with swaying lanterns. Taken: palette, card, type, scene technique.
- Sansa: the scenery is the hero and the UI stays small and rounded. Taken: one action, quiet controls.
- Japanese/Chinese moon gates (round garden doorways). Taken: the signature circle that frames the cat.

## Palette (light)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f6f2eb` | page |
| `--surface` | `#ffffff` | cards, toast, sound button |
| `--line` | `#e6dfd3` | borders, dividers |
| `--text` | `#26221d` | body text (15:1 on bg) |
| `--muted` | `#6b6157` | secondary text (5.5:1 on bg) |
| `--gold` | `#d9a441` | fills only (bar, coins, caps) |
| `--gold-ink` | `#8a6418` | gold text on light surfaces (5:1) |
| `--red` | `#b7443a` | lantern, counter pill, milestone character |

Dark mode follows the system: `#14110f` page, `#1d1a17` cards, `#efe9e0` text, `#e8be6a` gold text.
The moon-gate sky follows the local time: dawn, day, dusk, night (stars appear at night).

## Type
- Display: `"Iowan Old Style", "Palatino Linotype", Palatino, "Noto Serif", "Noto Serif SC", serif`
  (wordmark, today's count, hint, floaters, toast character).
- Body: the system UI stack (`system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`). Never Inter alone.

## Shape, space, motion
- Radius: 20 px cards, 14 px panels, 999 px pills, round icon button.
- Spacing: 8 / 14 / 20 px steps.
- Shadow: `0 1px 2px rgba(60,45,25,.05), 0 10px 30px rgba(60,45,25,.08)`.
- Motion is slow and eased: lanterns sway over 5-6 s, the paw beckons front-to-back (forearm leans in, hand folds toward you; not a sideways swing, not frames),
  floaters rise and fade. Everything respects `prefers-reduced-motion`.
- Tap targets are at least 44 px.

## The cat (`js/cat3d.js`, 3D)
A soft-glazed kawaii maneki-neko built from primitives in three.js, seen straight on so Hoki looks right at
you. Cream glaze `#fffaf2`-ish with a light clearcoat and a warm sheen, calico patches `#e9a65f` / `#6a574b`
painted into the vertex colours, a big head, big low-set glossy eyes (dark `#2a1a14` with a brown lower iris and
two white catch-lights), whisker pads, a small pink nose, omega mouth, whiskers, rosy blush, red collar, gold bell
and koban (福). No cushion: the cat sits on the floor with a soft contact shadow. Warm key light from the upper
left, cool fill, rim light; neutral tone mapping so the palette stays true. The beckon is front-to-back only:
wrist and shoulder rotate about X (toward the viewer), never sideways.

Alive, not a statue: the head and eyes follow the pointer (an idle glance around when nobody is there), it blinks
every few seconds, a tap gives a hop, happy `^ ^` eyes and an ear flick, stroking the head pets it (it leans in,
ears relax, eyes close happily) and the tail sways, faster when happy. Reduced motion turns all of this off. The
widgets use pre-rendered frames of this same model.

## The fallback cat (`assets/cat.svg`)
Flat shapes with a soft brown outline (`#7a5f4c`, 2.4 px), cream fur `#fffaf2` with `#f1e4d1` shading,
calico patches `#e9a65f` / `#6a574b`, closed smiling eyes, blush, red collar, gold bell and koban, red
cushion with gold tassels. No gradients, clip paths or transforms inside the file, so the Windows widget can
draw it with plain WPF shapes.

## Voice
Plain and warm. Short lines ("Tap Hoki for a little luck"). Lucky-number milestones in Chinese with a short
English gloss. No hype words.

## Banned defaults
Pixel art or pixel fonts, scanlines and dithering, purple/indigo gradients, glassmorphism, glow blobs as
decoration, emoji as icons, identical icon cards, gradient text, "Get started" buttons, stock 3D blobs (the 3D cat is a
crafted figure with its own palette and lighting, not a generic render).
