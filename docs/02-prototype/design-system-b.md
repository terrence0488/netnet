# NetNet Design System — variant B "Poster"

Status: **exploration, for the Founder's A / B / C choice** (built 2026-09-25)
Owner: Product designer · Stage 2 · branch `claude/design-b-retro`

> B is a **look**, not a product. It runs the same `app.js`, `data.js` and `packs.js` as design A
> and passes the same 22 test suites. Only `styles.css` and the fonts differ. This file lists what B
> replaces in `design-system.md`. **Everything not named here is A's rule and still binds**:
> the content rules (§2.1), the chart rules (§5), hit targets (§6.1), layout (§7), and the
> platform boundary.

Reference: the Founder's brief, "a bold colourful retro/vintage style", with a subscription-app
mockup set (cream stock, black outlines, hard shadows, tomato orange, a wide chunky display face).

---

## 1. The idea (replaces A §1)

**A poster printed on cream stock: black outlines, hard offset shadows, one tomato ink.**

Where A is a typeset ledger with no containers, B is made of **objects**. Every section is a card
with a 2px outline and a 4px offset shadow, as if cut out and pinned to a board. The loudness comes
from shape and weight, not from many colours: the page is still cream, ink and one tomato.

What that changes, concretely:

1. **Cards, not rules.** A's "a rule, not a box" (§2 principle 2) is inverted. Sections are cards;
   rows inside a card are separated by soft rules.
2. **The hero is a tomato card** with two sparkles in its corner. Its change figure sits on a
   cream sticker so gain and loss keep their contrast on the orange.
3. **A ticker band** runs under the Home top bar (`✦ NETNET ✦ NET WORTH …`). It is decoration
   only: hidden from screen readers, carries no figure, so §2.1 "one figure, one place" holds.
4. **Controls look pressable.** Outlined buttons with a hard shadow that collapses when pressed;
   chosen segments and answers fill tomato; the chosen range is an ink pill.

Principles kept from A: the figure is the hero; never encode by hue alone; provenance is quiet;
one primary action per screen (§2.1 rule 10).

## 3. Typography (replaces A §3)

| Face | Role |
|---|---|
| **Unbounded** 600–800 | Wide, chunky display face. Money (hero, rows, ledger, readouts), screen titles, section heads, the wordmark. |
| **Space Grotesk** 400–700 | Everything else: names, labels, percentages, dates, UI. Slightly quirky, true tabular figures. |

The dividing line moves: A kept the display serif for money only; B also sets **headings** in the
display face, because the reference is a poster and its sub-heads are its loudest type. Percentages
stay in the text face. Both faces carry `tnum`; money is always tabular.

| Token | Setting |
|---|---|
| `display` | Unbounded 700 · `clamp(28px, 8.6vw, 46px)` · −0.045em (wide face, so smaller than A's 50px) |
| `figure` | Unbounded 600 · 15px · −0.03em — row and ledger amounts |
| `heading` | Unbounded 700 · 13.5px section heads, 18px screen titles, 23px sign-up titles |
| `body` | Space Grotesk 500–600 · 15px — row names are 600 |
| `label` | Space Grotesk 700 · 10.5px · 0.12em · uppercase — section labels, field labels |
| `meta` | Space Grotesk 400 · 12px · `ink-3` |

A's phone scale holds unchanged: every size × 1.15 on a phone, nothing under 11px.
A's "0.2em tracking is load-bearing" does not apply: B's labels are heavier and need less air.

## 4. Colour (replaces A §4.1–4.2; §4.3–4.4 still bind)

Light (cream) is B's reference theme; dark (espresso) follows the OS. Contrast measured against the
card surface, where most text sits.

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#F2EADB` | `#1B1712` | The board |
| `card` | `#FFFAF1` | `#2A231B` | Every card, sheet, field |
| `ink` | `#1A1714` | `#F5EDDF` | Text, amounts |
| `ink-2` | `#4A433A` | `#D2C5AF` | Secondary text (8.2:1 light) |
| `ink-3` | `#6B6255` | `#A7987F` | Meta, labels (5.8 / 5.5) |
| `edge` | `#1A1714` | `#E8DCC6` | Card and control outlines |
| `drop` | `#1A1714` | `#000` | The hard offset shadow |
| **`brand`** | `#F0643A` | `#FF7438` | Tomato — hero card, primary button, active tab, trend line |
| `brand-text` | `#B23C0C` | `#FF8F5E` | Tomato as text (5.7 / 6.9) |
| `brand-on` | `#1A1714` | `#1A1714` | Ink on tomato (5.6 / 6.6) — black on orange, as in the reference |
| **`agent`** | `#2F5BD6` | `#7C98FF` | Royal blue — the agent's bar inside a card's left edge |
| `gain` | `#22703F` | `#6FCF8E` | (5.8 / 8.1) |
| `loss` | `#B4232F` | `#FF6B81` | (6.3 / 5.7) — crimson/rose, kept clear of the tomato |
| `attention` | `#8A5A00` | `#F2B640` | Stale; notes sit on `warn-bg` `#FBE6B5` / `#3A2E14` |
| `sun` | `#F4B63F` | `#F2B640` | Mustard, **decoration only**: step numbers, the prompt card's tab, "Need more data" sticker |

**The one relaxation of A §4.3:** `sun` is a decorative colour. It never carries data, never touches
a chart, and never sits next to gain or loss. Everything else in §4.3–4.4 holds: gain and loss only
mean direction, brand and agent never enter a categorical chart.

**The risk to watch:** tomato brand and red loss are neighbours. They are separated by hue (orange vs
crimson), by role (brand is never a figure's colour) and by sign (loss always carries `−`).

## 5. Charts (A §5 holds)

Same validated categorical palette, same rules. Only the look changes: 3px trend line, dotted
gridlines, a solid ink zero line, legend swatches outlined, allocation bars as 12px outlined pills,
and the line-chart readout on a small ink tag instead of A's paper halo.

## 6. Components (appearance only; behaviour is A's §6)

| Component | B |
|---|---|
| **Card** | `card` fill, 2px `edge`, 14px radius, 4px/4px hard shadow in `drop`. Rows inside are padded 16px and split by 1.5px `rule`. |
| **Hero figure** | Tomato card; label, figure and baseline control in `brand-on`; change figure on a cream pill. On a holding page the name and consequence line sit on it too. |
| **Ticker** | 34px tomato band, outlined, under the Home top bar. Full-bleed on a phone, a rounded strip on a computer. Pure CSS, `aria`-hidden. |
| **Margin mark** | 4px `agent` bar on the inside left edge of the card, at 75%. |
| **Icon button** | Outlined disc with a 2px shadow (the reference's menu and settings buttons). |
| **Button** | Tomato, outlined, 10px radius, 3px hard shadow that collapses on press. Secondary: `card` fill. Ghost: underlined text. |
| **Segmented control** | Outlined tray; the chosen segment fills tomato. |
| **Range bar / filter chips** | The chosen range is an ink pill; filter chips are outlined pills that fill tomato (or `loss` for Don't Show). The pill is drawn inside the 44px target. |
| **Choice row** | Outlined buttons with shadows; chosen fills tomato. Never a bare rule. |
| **Fields** | Boxed: 2px outline, `card` fill; focus adds a tomato hard shadow. Amount entry is boxed too, in Unbounded. |
| **Tab bar** | `card` fill, 2px top outline, cells split by rules; the active tab gets a 4px tomato bar on top. Sidebar: the active item is a tomato pill. |
| **Sheet** | `card`, outlined, 22px top corners; a centred card with a 6px shadow on a computer. |
| **Prompt card** | A card with a mustard tab on its top edge. |
| **Chart placeholder** | The same frosted sample; "Need more data" is a mustard sticker. |
| **Floating Update** | A tomato pill, outlined, 4px shadow; lines up with the amounts inside the cards. |
| **Wordmark** | Unbounded 800 with a four-point tomato sparkle for the dot. |

## Files

- `styles.css` — B's stylesheet (replaces A's on this branch)
- `fonts/unbounded.woff2`, `fonts/space-grotesk.woff2` — SIL OFL 1.1 (see `fonts/NOTICE.md`)
