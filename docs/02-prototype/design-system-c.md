# NetNet Design System — variant C "Calm"

Status: **exploration, for the Founder's A / B / C choice** (built 2026-09-25)
Owner: Product designer · Stage 2 · branch `claude/design-c-soft`

> C is a **look**, not a product. It runs the same `app.js`, `data.js` and `packs.js` as design A
> and passes the same 22 test suites. Only `styles.css` and the font differ. This file lists what C
> replaces in `design-system.md`. **Everything not named here is A's rule and still binds**:
> the content rules (§2.1), the chart rules (§5), hit targets (§6.1), layout (§7), and the
> platform boundary.

Reference: the Founder's brief, "a clean, soft, and spacious design", with a finance-app mockup
(pale ground, white floating cards, an indigo balance card, a coral glow under the chart, a dark
rounded tooltip, light-weight large figures).

---

## 1. The idea (replaces A §1)

**White cards floating on a pale ground, with room to breathe. One indigo for NetNet, a coral glow
for what is selected.**

A is a dense document; C is a calm app. Its authority comes from air and softness: large radii,
shadows instead of lines, light-weight big figures, and very little that competes with them.

1. **Cards, not rules, and no outlines.** Sections are white cards (24px radius) lifted by a soft
   two-layer shadow. Rows inside are split by hairlines inset from the card's edges.
2. **The hero is an indigo card** with a faint ring in its corner (the reference's dial, as
   decoration). The figure is set *light* (300), the reverse of A's heavy serif.
3. **Colour is gentle.** Indigo marks NetNet (hero, primary button, active tab, trend line). Coral
   appears as a glow under the trend and as the chosen range. Everything else is ink on white.
4. **Space is spent generously.** 32px between sections, 20px card padding, 15px row padding.
   Density is lower than A: one more scroll on Home, in exchange for calm.

Principles kept from A: the figure is the hero; never encode by hue alone; provenance is quiet;
one primary action per screen (§2.1 rule 10).

## 3. Typography (replaces A §3)

| Face | Role |
|---|---|
| **Plus Jakarta Sans** 300–800 | Everything. Geometric, soft, true tabular figures. |

One family, weight does the work: money is 300 at display size and 600 in rows; names 600;
labels 500. No uppercase tracked labels anywhere: sentence case throughout, which is softer and
reads faster (A §2.1 rule 4 already wanted sentence-case metadata; C extends it to labels).

| Token | Setting |
|---|---|
| `display` | 300 · `clamp(34px, 10.5vw, 52px)` · −0.04em — net worth, period totals |
| `figure` | 600 · 15.5px · −0.02em — row and ledger amounts |
| `title` | 600 · 22px screen titles, 28px sign-up titles, 17px section heads |
| `body` | 400–600 · 15px |
| `label` | 500 · 12.5px · sentence case · `ink-3` |
| `meta` | 400 · 12.5px · `ink-3` |

A's phone scale holds unchanged: every size × 1.15 on a phone, nothing under 11px. Body text gets
`word-spacing: .06em`, since the face sets its spaces tight.

## 4. Colour (replaces A §4.1–4.2; §4.3–4.4 still bind)

Light is C's reference theme; dark (deep navy) follows the OS.

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#F5F5FA` | `#0E0F1C` | The ground |
| `card` | `#FFFFFF` | `#181A2C` | Cards, sheets |
| `tint` | `#F0F0F7` | `#22253A` | Fields, segmented tray, notes, chips |
| `ink` | `#1C1B2E` | `#F2F3FA` | Text, amounts |
| `ink-2` | `#55566E` | `#B6B8CF` | Secondary (6.6:1) |
| `ink-3` | `#65677F` | `#8E91AB` | Meta, labels (4.9 on `tint`, 5.6 dark) |
| **`brand`** | `#4B44D8` | `#5B54E8` | Indigo — hero card, primary button, trend line, active tab |
| `brand-text` | `#433CC9` | `#A09BFF` | Indigo as text (7.7 / 7.1) |
| `brand-tint` | `#ECEBFF` | `#272650` | Secondary button, active tab and nav pill |
| **`coral`** | `#FF8A65` | `#FF9B7A` | The trend's glow; chosen range (`coral-tint` + `coral-text` `#B8431F`, 4.6) |
| **`agent`** | `#14A3B8` | `#3CC7DA` | Teal — the agent's short pill inside a card's left edge |
| `gain` | `#167A4E` | `#5FD39A` | (5.4 / 9.2) |
| `loss` | `#C93A3A` | `#FF7B7B` | (5.1 / 6.8) |
| `attention` | `#9A6200` | `#F2B84B` | Stale, on `warn-bg` `#FFF4E0` / `#2E2614` |
| `hero-gain` / `hero-loss` | `#B8F7DA` / `#FFD6CC` | same | Direction on the indigo card (5.6 / 5.1) |

**The one addition to A §4.3:** coral is a selection and emphasis colour, never data. It never
marks a gain (the reference paints profit coral; C does not, because §4.4 rule 3 reserves green and
red for direction). Gain and loss on the indigo hero use pale mint and pale rose, still with signs.

## 5. Charts (A §5 holds)

Same validated categorical palette, same rules. The look: 2.5px trend line in indigo over a **coral**
wash (C's one departure: the wash is not the line's own colour), solid hairline gridlines, legend
swatches as dots, allocation bars as 8px rounded pills, and the readout on a dark rounded tooltip,
as in the reference.

## 6. Components (appearance only; behaviour is A's §6)

| Component | C |
|---|---|
| **Card** | White, 24px radius, no border, shadow `0 1px 2px / 0 8px 28px` at 4–6%. Rows padded 20px, hairlines inset 20px. |
| **Hero figure** | Indigo gradient card, 28px radius, tinted shadow; figure 300 white; the baseline control is a translucent pill. |
| **Margin mark** | A 3px × 22px teal pill, 8px inside the card's left edge. |
| **Icon button** | White circle with a soft shadow. |
| **Button** | Indigo, 16px radius, soft indigo shadow. Secondary: `brand-tint` with indigo text. |
| **Segmented control** | iOS-like: a `tint` pill tray; the chosen segment is a white pill with a shadow. |
| **Range bar** | Plain labels; the chosen one sits on a coral-tint rounded pill. Evenly spread on a phone. |
| **Filter chips** | `tint` pills; chosen fills indigo (or `loss` for Don't Show). Drawn inside the 44px target. |
| **Choice row** | `tint` pills; chosen fills indigo. Stacked answers are white cards; chosen is indigo-tint with an indigo ring. |
| **Fields** | Filled `tint`, 12px radius, no border; focus turns white with an indigo ring. Amount entry: 30px weight 300. |
| **Tab bar** | Frosted white, a hairline and a faint shadow above; the active icon sits on an indigo-tint pill. Sidebar: the active item is an indigo-tint pill. |
| **Sheet** | White, 28px top corners, large soft shadow; the scrim blurs the page slightly. |
| **Notes** | Tinted rounded boxes, no borders (`tint`, `warn-bg`, `agent-tint`). |
| **Prompt card** | The most lifted card on the page (large shadow, hairline edge). |
| **Chart placeholder** | The same frosted sample; "Need more data" on a white pill. |
| **Floating Update** | Indigo pill, tinted shadow; lines up with the amounts inside the cards. |
| **Wordmark** | Plus Jakarta Sans 800 with an indigo-to-coral orb for the dot. |

## Files

- `styles.css` — C's stylesheet (replaces A's on this branch)
- `fonts/plus-jakarta-sans.woff2` — SIL OFL 1.1 (see `fonts/NOTICE.md`)
