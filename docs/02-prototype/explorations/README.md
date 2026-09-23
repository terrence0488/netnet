# Design exploration — the record

Open any of these in a browser. They are throwaway: they exist so the rejected work stays visible
and the chosen direction can be judged against what it beat.

| File | What it was | Outcome |
|---|---|---|
| `palettes.html` | Four palettes (aqua, electric blue, gold, violet) on a card-based "confident modern fintech" screen | **Rejected by the Founder** — "the typical design a fresh grad would come up with". Correctly so: it was a component kit recoloured four times, not four designs. |
| `directions.html` | Three brand-led directions — Statement, Horizon, Margin — differing in structure and typography, not hue | Statement's language and Horizon's colour both chosen; Margin's provenance idea survived into the final system as the agent's ink. |
| `synth.html` | Statement × Horizon: one ink, two inks, two inks on a hot ground | **V2 (two inks) chosen 2026-09-23.** |

## What the failure taught

The first round failed because it started from a palette. A palette is not a brand, and swapping
hues on a gradient-hero-plus-donut screen produces four versions of the same generic dashboard.
The second round started from an idea about what NetNet *is*, and the layout and type fell out of
that — which is the order the work should have been done in from the start.

Two other things were got wrong and fixed in the open, both worth remembering:

- **A "muted" categorical palette was hand-picked and failed the validator hard** — muting killed
  the chroma and the colour-blind separation. The documented, validated palette was restored. Do
  not eyeball chart colour.
- **Two brand colours failed text contrast** when used as small labels, which is what produced the
  `brand` / `brand-text` split now in the system. The rule that came out of it: *the fluorescent is
  a mark, not a typeface colour.*

Regenerate the screenshots with Playwright against these files; the PNGs are deliberately not
committed.
