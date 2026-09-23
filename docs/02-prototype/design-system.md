# NetNet Design System — v1

Status: **awaiting Founder review** (chosen 2026-09-23, direction V2 "Two Inks")
Owner: Product designer · Stage 2

> This is the design system, not a style guide written after the fact. It is the thing the
> prototype is built from, and the thing Stage 4 plans component work against.

---

## 1. The idea

**A ledger, typeset and printed in two inks. One ink is you. The other is your agent.**

NetNet is not a dashboard. It is a statement of where someone stands, and its authority has to
come from the same place a good financial document's does: typography, alignment, restraint, and
figures you can trust at a glance.

Two consequences run through everything below:

1. **Structure is typographic, not container-based.** No cards. Sections are separated by hairline
   rules and space. Nothing floats. This is what makes it look considered rather than assembled.
2. **Colour is scarce and loud.** The page is near-monochrome so that the two fluorescent inks mean
   something when they appear. Restraint in *how much*, boldness in *how loud*.

The second ink is the part no competitor can copy without also building an agent layer, so it is
treated as a first-class property of the system rather than a badge.

### What this replaces
The Founder's mockups are a **functional** brief — information architecture, flows, controls. They
are an iOS app's visual language and are not the visual target. Everything in §3–§8 supersedes them
on appearance. Where a mockup shows a card, this system shows a ruled section.

---

## 2. Design principles

1. **The figure is the hero.** Amounts get the display face, the most space, and the tightest
   tracking. Everything else recedes.
2. **A rule, not a box.** When something needs separating, use a hairline. Reach for a container
   only when content genuinely overlays other content (sheets, menus).
3. **Colour carries meaning or it does not appear.** Six chromatic roles exist (§4.3). Decoration is
   not one of them.
4. **Provenance is visible.** The user must always be able to see who wrote a number without asking.
5. **Never encode by hue alone.** Gain and loss carry a sign and a direction as well as a colour.
6. **Density is a feature.** This audience keeps spreadsheets. Do not pad the page to feel friendly.

---

## 3. Typography

| Face | Role | Why |
|---|---|---|
| **Fraunces** 600 | Monetary amounts only — hero, row amounts, section totals | High-contrast display serif. No consumer finance app sets money in a serif, and it is the single strongest signal that this is a document rather than a dashboard. |
| **Inter** 400/500/600 | Everything else — names, labels, percentages, dates, counts, UI | Neutral workhorse with true tabular figures. Identical rendering on web and React Native. |

**The dividing line:** Fraunces for *amounts of money*. Inter for *everything else, including
percentages*. A percentage is a measurement, not a sum — keeping it in Inter stops the serif from
becoming decoration.

### Scale

| Token | Face / size / tracking | Used for |
|---|---|---|
| `display` | Fraunces 600 · 50px · −0.038em · 1.0 | Net worth, period totals |
| `figure-lg` | Fraunces 600 · 18px · −0.015em | Row amounts |
| `figure-sm` | Fraunces 600 · 15px · −0.01em | Inline amounts in dense rows |
| `body` | Inter 400 · 15px · −0.012em · 1.45 | Holding names, prose |
| `body-sm` | Inter 400 · 13.5px | Summary rows, secondary prose |
| `label` | Inter 600 · 9.5px · **0.2em** · uppercase | Section labels, metadata lines |
| `meta` | Inter 400 · 11px | Dates, counts, axis ticks |
| `pct` | Inter 500 · 11px · tabular | Change percentages |

All figures set `font-variant-numeric: tabular-nums` so columns align and digits do not shift as
values update.

**The 0.2em label tracking is load-bearing.** It is what makes a small uppercase label read as
typesetting rather than as a cramped UI string, and it is the most copied-wrong detail in the
system. Do not reduce it.

---

## 4. Colour

Every value below is measured, not chosen by eye. Contrast figures are WCAG ratios against that
theme's ground.

### 4.1 Dark (reference theme)

| Token | Hex | Contrast | Role |
|---|---|---|---|
| `paper` | `#101013` | — | The ground |
| `paper-2` | `#16161A` | — | Raised surfaces only: sheets, menus |
| `ink` | `#F4F2EE` | 16.99 | Primary text and amounts |
| `ink-2` | `#A29D95` | 7.05 | Secondary text |
| `ink-3` | `#7D786F` | 4.33 | Labels, axis ticks, metadata |
| `rule` | `#2A2A2E` | 1.33 | Hairlines (decorative, exempt) |
| **`brand`** | `#FF2E88` | 5.43 | Fluorescent magenta — NetNet's ink |
| **`agent`** | `#25D8E8` | 10.91 | Cyan — the agent's ink |
| `gain` | `#6FBF95` | 8.65 | Positive change |
| `loss` | `#E0796A` | 6.43 | Negative change |
| `attention` | `#D9A441` | 8.45 | Stale, warnings |

### 4.2 Light

| Token | Hex | Contrast | Role |
|---|---|---|---|
| `paper` | `#F7F4ED` | — | Warm paper stock |
| `paper-2` | `#EFEBE1` | — | Raised surfaces only |
| `ink` | `#16130E` | 16.86 | Primary text and amounts |
| `ink-2` | `#56503F` | 7.31 | Secondary text |
| `ink-3` | `#7A7364` | 4.28 | Labels, axis ticks, metadata |
| `rule` | `#DFD8C8` | 1.29 | Hairlines (decorative, exempt) |
| **`brand`** | `#E4006B` | 4.24 | Magenta — **marks only** |
| **`brand-text`** | `#C2005C` | 5.54 | Magenta as small text |
| **`agent`** | `#00808F` | 4.26 | Cyan — **marks only** |
| **`agent-text`** | `#046370` | 6.32 | Cyan as small text |
| `gain` | `#2F6B4F` | 5.73 | Positive change |
| `loss` | `#A33A2E` | 5.97 | Negative change |
| `attention` | `#7A5600` | 6.05 | Stale, warnings |

**Why light mode splits the inks into two tokens.** At full fluorescence on paper both inks land
near 4.2:1 — fine for a rule, a dot or a 2px trend line, below the 4.5:1 a small bold label needs.
So light mode carries a darker sibling for text. The underlying rule is worth stating plainly:

> **The fluorescent is a mark, not a typeface colour.** When it must be text, it darkens.

Dark mode needs no split; both inks clear 4.5:1 there.

### 4.3 The six chromatic roles

Colour appears for exactly six reasons. Anything else is `ink`, `ink-2`, `ink-3` or `rule`.

| Role | Token | Appears as |
|---|---|---|
| NetNet's own mark | `brand` | Wordmark dot, trend line and wash, active tab, focus ring, primary button |
| The agent wrote this | `agent` | Margin rule on the row, dot in the metadata line, audit-log entries |
| Value went up | `gain` | Change figures, positive bars — always with `+` and `↑` |
| Value went down | `loss` | Change figures, negative bars — always with `−` and `↓` |
| Needs attention | `attention` | Stale labels, reminder notices |
| Category identity | chart palette (§5) | Charts only, never UI |

### 4.4 Rules that hold the system together

1. **Gain and loss are never fluorescent.** Four loud colours on one page means none of them reads.
2. **The two inks never appear inside a categorical chart**, and chart hues never appear as UI
   chrome. Two colour systems, zero overlap in usage.
3. **Green and red are reserved for direction.** They are never a brand colour and never a category.
4. **`paper-2` is for overlays only.** Using it to make a card is how this system degrades back into
   the dashboard it is trying not to be.

---

## 5. Charts

The categorical palette is the **validated default** from the visualization method, in its
documented order, verified against NetNet's own two grounds:

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

Both modes pass every hard gate on NetNet's surfaces (lightness band, chroma floor, colour-blind
separation, normal-vision floor).

**A reordering was tried and rejected.** Pushing aqua and magenta late — so the leading slots would
not echo the brand inks — dropped the worst adjacent colour-blind pair to ΔE 1.6 in dark mode, a
hard fail. The documented order stands, and the brand-collision worry is handled by rule §4.4.2
instead: the inks and the chart hues never appear in the same role, so they are never compared.

**Binding constraints**

- **Light mode requires relief.** Four slots sit below 3:1 on paper. Every categorical chart must
  ship visible direct labels or a table view. The allocation list does this already (name +
  percentage beside every swatch); no chart may drop it.
- **Fixed order, never cycled.** A ninth category folds into "Other" — it never gets a generated hue.
- **Colour follows the entity, not its rank.** Filtering must not repaint the survivors.
- **One axis.** Never two y-scales.
- **The trend line is `brand`**, not gain/loss. It is NetNet's mark, and the change figure beside it
  carries the semantics. A trend line that turned red on a bad quarter would put two conflicting
  signals in one glance.

---

## 6. Components

Built by us, because they carry the brand:

| Component | Notes |
|---|---|
| **Rule** | 1px `rule`. The primary structural device. |
| **Section** | `label` + content, separated by rules. No background, no border, no radius. |
| **Figure row** | Name + metadata left; amount (`figure-lg`) over change (`pct`) right-aligned. |
| **Margin mark** | 3px `agent` bar in the gutter, full row height. The provenance device. |
| **Hero figure** | `display` amount, `label` above, change line below. |
| **Trend** | 2px `brand` stroke, wash beneath at 22% dark / 14% light. No gridlines by default. |
| **Inline chip** | Text-only, `label` scale, coloured. **No pill background** — a pill is a container. |
| **Segmented control** | Ours: it carries brand and appears on data screens. |
| **Button** | Ours. `brand` fill, paper-coloured text; secondary is ruled, not filled. |
| **Empty state** | Typographic. A sentence and one action, never an illustration. |

Deferred to the platform, per the Founder's "brand chrome, native controls" decision:

| Deferred | Why |
|---|---|
| Sheet / modal presentation | Gesture physics and safe areas are platform work, badly reimplemented |
| Date and currency pickers | Users know their own; ours would be worse |
| Keyboard, incl. numeric | Never reimplement |
| Scroll physics, pull-to-refresh, nav gestures | Wrong on a phone the moment you touch them |
| Switches, alerts, context menus, share sheet, text selection | Platform idiom beats consistency here |

**The boundary, stated once:** we own everything that displays data, and the colour and type of
everything. The platform owns everything that *takes input by gesture*. When a component is
ambiguous, ask which side of that line it falls on rather than deciding case by case.

---

## 7. Layout

- **Mobile-first.** Single column, 24px side margin, bottom tab bar. The reference case.
- **Desktop (≥900px).** Sidebar nav plus a content column that widens to two columns for the
  summary and holdings. The page does not become a card grid — the ruled-section structure holds;
  there is simply more room between rules.
- **Wide (≥1500px).** The measure grows to 1340px, then 1440px past 1800px, and is **centred** in
  the space beside the sidebar. A ledger is read in a column, so the measure stays capped rather
  than stretching to fill a 2560px display — but it is centred, never left-aligned against a void.
- **The content column's width never depends on what is on screen.** Switching a tab or a view must
  not resize the page. Centre it with an explicit `width` plus `justify-self`, never with `margin:0
  auto` — auto margins on a grid item cancel `stretch`, so the item falls back to fitting its
  content and the container silently starts tracking whatever is inside it. This shipped once and
  was caught by the Founder switching between the Insights views.
- **The agent margin gutter is reserved at every breakpoint.** It is 24px of the left margin, and
  rows offset their mark into it. Nothing else may occupy it.
- **No horizontal scrolling at phone width**, ever (PRD J4, J11).

---

## 8. Implementation

- **Tokens are the contract.** CSS custom properties on web; the same names feed NativeWind on
  React Native so a component reads `bg-paper text-ink` on both.
- **Both themes are authored, not derived.** Dark is not an inverted light. Every token is declared
  twice and measured against its own ground.
- **Fonts** are committed under `fonts/` (SIL OFL, redistribution permitted). Stage 3 decides how
  they are served, including `expo-font` on native.
- **Verify, do not eyeball.** Any change to a chart colour re-runs the palette validator; any change
  to a text token re-runs the contrast check. Both are cheap and both have already caught real
  failures in this system's own development.

## 9. Open questions for the Founder

1. **Fraunces for row amounts, or hero only?** Currently every monetary amount is serif. Hero-only
   would be more restrained and slightly faster to render.
2. **Does the light theme's warm paper survive contact with a landing page?** Warm stock is lovely
   in-app; marketing pages often want pure white.
3. **A wordmark still needs drawing.** The dot is a placeholder, not a logo.
