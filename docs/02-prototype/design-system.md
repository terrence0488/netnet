# NetNet Design System — v1

Status: **awaiting Founder review** (chosen 2026-09-23, direction V2 "Two Inks"; four components
added 2026-09-24 for the amended J1/J2 — §6)
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
| **Position ledger** | Figure rows as a ledger: bucket in `body`, what is in it in `meta` beneath, amount in Fraunces; a `rule-strong` hairline above the subtotal, whose name is a `label`. How the first picture is set (PRD J1). |
| **Choice row** | Answers to a fact question. Short answers: ruled buttons in `label` caps; the chosen one takes a `brand` rule, not a fill. Sentence answers: a stacked list of rows, the chosen one marked by a 3px `brand` bar. Never pills. |
| **Consequence line** | `body-sm` in `ink-2`; the consequence in `ink` 600, the amount in Fraunces, the pack's reason after an em dash, then a `label`-scale **Change** link. States money, never a category (PRD J2). |
| **Amount entry** | The one place a number is *typed* at display size: Fraunces 600 · 30px on a single hairline that turns `brand` on focus, currency symbol in `ink-3`. Money is typeset the same way whether it is shown or entered. |

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

### 6.1 Hit targets — binding

**What a control looks like is a design choice. What you can tap is a contract.** This system draws
controls as 9.5px tracked labels and hairline chips, which is right for the look and wrong for a
thumb. So visual size and tap size are specified separately, and only the second is a rule.

| Token | Value | Applies |
|---|---|---|
| `--hit` | **44px** | Default — touch is the reference case (J4: mobile is primary, not a fallback) |
| `--hit` | **32px** | Only under `(hover:hover) and (pointer:fine)` — a mouse, positively detected |

1. **Every control's tap area is at least `--hit` in both dimensions**, however small it draws. A
   17px icon sits in a 44px box; a "Show $" label is 44px tall.
2. **Default large, relax only on evidence.** An unknown device gets 44px. The relaxed 32px never goes
   below WCAG 2.5.8's 24px floor.
3. **Adjacent targets may touch; they may not overlap.** A bigger target that steals its
   neighbour's taps is a regression, not a fix.
4. **Grow the row, not the sentence.** A link in a row (section header, sheet header) makes the row
   `--hit` tall. A link *inside a sentence* keeps the line height and lets its target overflow the
   line box instead, so the prose does not break apart.
5. **Indicators follow the text, not the box.** Selected states under range bars, chips and
   "Change comparison" are text underlines, so a 44px box does not push the underline 14px away
   from the word it marks.
6. **A pager says what it is paging.** Bare ‹ › arrows are unreadable on a phone. The pager is
   ‹ *period* ›, and an arrow with nowhere to go is disabled rather than leading to an empty chart.

7. **No double-tap zoom; pinch-zoom always.** `touch-action: manipulation` on every element — every
   element, because a scroll container (a sheet, the stat row) resets it for its contents. Pinch-zoom
   is never blocked: `user-scalable=no` fails WCAG 1.4.4 for low-vision users, and iOS ignores it.
8. **Form fields are never smaller than 16px**, or iOS zooms into them on focus.
9. **An unavailable control is still solid.** Mark it `aria-disabled="true"` and dim it; never use
   the `disabled` attribute or `pointer-events: none`. Both make the control dead space to iOS, so
   a double-tap on a greyed ‹ › falls through and zooms the page, which rule 7 exists to prevent.
   Screen readers still announce it as unavailable, and the click handler ignores it.

**Verified, not eyeballed.** Every tappable element on every screen and sheet is measured at phone
width with touch emulated (target 44) and at desktop width with a mouse (target 32). Targets that
overlap are reported too. This rule shipped missing: the first audit, prompted by the Founder
tapping a 6×22px chart arrow on a real phone, found **426 undersized targets across 65 component
patterns**. After the fix there are none at either size, and no overlaps.

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
- **Hiding a grid item changes where everything else lands.** A `display:none` sidebar leaves the
  grid, and the content column auto-places into the sidebar's 232px track. Routes without chrome
  (landing, sign-up) switch the shell to a single column rather than just hiding the sidebar.
  Shipped once; the Founder found the landing page poured into a 232px column on desktop.
- **The agent margin gutter is reserved at every breakpoint.** It is 24px of the left margin, and
  rows offset their mark into it. Nothing else may occupy it.
- **No horizontal scrolling at phone width**, ever (PRD J4, J11).
- **Only navigation moves the page.** Going to another screen starts at the top. An action that
  updates the screen you are on (a chart pager, a range, a view switch, undo, expanding a row)
  leaves the reader exactly where they were. A reader halfway down Insights who pages a chart
  must still be looking at that chart. Shipped once; the Founder found every chart arrow
  jumping to the top of the page.

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
