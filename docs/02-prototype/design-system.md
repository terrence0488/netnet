# NetNet Design System — v2 "Poster"

Status: **chosen by the Founder, 2026-09-26** (variant B "Poster", over A "Two Inks" and C "Calm");
approved with the prototype, 2026-09-26
Owner: Product designer · Stage 2

> This is the design system, not a style guide written after the fact. It is the thing the
> prototype is built from, and the thing Stage 4 plans component work against.

**History.** v1 was "Two Inks" (a typeset ledger in two fluorescent inks, no cards). Three looks were
then built over the same product: A "Two Inks", B "Poster", C "Calm". The Founder chose B. A and C
are kept, unmerged, on their own branches (`claude/zealous-dijkstra-3yebuo`,
`claude/design-c-soft`); their design docs live there. Everything below that is not about the look
(content rules §2.1, chart rules §5, hit targets §6.1, layout §7) was written for v1 and carried
over unchanged.

---

## 1. The idea

**A poster printed on cream stock: black outlines, hard offset shadows, one tomato ink.**

NetNet is made of **objects**. Every section is a card with a 2px outline and a 4px offset shadow,
as if cut out and pinned to a board. The loudness comes from shape and weight, not from many
colours: the page is cream, ink and one tomato, with a royal blue that only ever says "your agent
wrote this".

What that means, concretely:

1. **Cards, not rules.** Sections are cards; rows inside a card are separated by soft rules.
2. **The hero is a tomato card** with two sparkles in its corner. Its change figure sits on a
   cream sticker so gain and loss keep their contrast on the orange.
3. **Controls look pressable.** Outlined buttons with a hard shadow that collapses when pressed;
   chosen segments and answers fill tomato; the chosen range is an ink pill.

Reference: the Founder's brief, "a bold colourful retro/vintage style", with a subscription-app
mockup set (cream stock, black outlines, hard shadows, tomato orange, a wide chunky display face).

### What this replaces
The Founder's original mockups are a **functional** brief — information architecture, flows,
controls — and are not the visual target. Everything in §3–§8 supersedes them on appearance.

---

## 2. Design principles

1. **The figure is the hero.** Amounts get the display face, the most space, and the tightest
   tracking. Everything else recedes.
2. **A card, not a line.** Each section is one outlined card. Inside it, rows are split by soft
   rules, never by more cards. A card inside a card is how the poster turns into clutter.
3. **Colour carries meaning, with one exception.** Six chromatic roles exist (§4.3). Mustard is
   the one decorative colour, and it never touches data.
4. **Provenance is quiet, and always there.** A mark says an agent wrote a number; opening the
   number says which agent and when. The agent's name is never louder than the figure.
5. **Never encode by hue alone.** Gain and loss always carry a sign as well as a colour.
6. **Density is a feature, repetition is not.** This audience keeps spreadsheets, so do not pad the
   page to feel friendly. But dense means every figure earns its place, not that every figure is
   shown twice (§2.1).

### 2.1 Content — binding

**One figure, one place.** Added after the Founder found the screens cluttered: an opened value
repeated the amount, the change and the percentage from the row above it, added an exchange rate
nobody asked for, and named the agent twice. The cause was a system gap. The system specified how
things look but never what may appear, so every screen showed everything it had.

1. **A figure appears once per screen.** A detail never restates its header, and a summary never
   restates a row beside it.
2. **One change figure per row.** The money (`+$59K`) by default, or the percentage when the list is
   sorted by percentage. Only hero figures and period rows carry both. No change figure at all when
   nothing changed. `0.00% ↑ $0` is noise.
3. **Cents only when there are cents** (`$797,992`, `$28,100.53`). Totals never show cents.
4. **Metadata is sentence case in `meta`.** Uppercase tracked `label` is for section labels and
   controls only. A list whose every second line is shouting reads as complicated.
5. **A label earns its place only when the value cannot speak for itself.** "Added 3 days ago by
   Claude" rather than "Entered: 21 Sep 2026, 9:14 am · Claude (agent)".
6. **Relative time answers "how recent?", absolute time answers "exactly when?"** An opened value
   and a connection say "3 days ago". The audit log gives the timestamp.
7. **A note must be actionable or a promise the user would otherwise doubt.** Filtered, stale,
   hidden-from-Insights and "reminders never contain amounts" pass the test. Explanations of how a
   screen works do not; they belong in these docs.
8. **Stored is not the same as shown.** The exchange rate and its date are kept on every entry,
   exported, and readable by the agent (PRD J2), but not displayed.
9. **Prototype scaffolding lives in the PROTO sheet**, never on a product screen. One exception: an
   event that happens outside NetNet at a known point in a flow (opening the verification email,
   the agent opening NetNet's approval page) is stood in for by a dashed control labelled
   "Prototype:" at exactly that point, styled like the PROTO button so it never reads as product.
10. **One primary action per screen.** A screen offers one thing to do next, as its only filled
    button. An alternative is a quiet link, or, when it is a genuine second route (the agent, on
    the intro screen and the empty Home), a subtitled block below a rule with an **outlined**
    button. Never a second filled button. The Founder found the agent too hidden as a link on the
    intro screen. It is the route v1 is betting on, so it gets a real button, one step down in
    weight. The Founder found the old empty Home offering
    four starts at once (the basics, the agent twice, a grid of starting tiles). A new user who
    cannot tell where to begin does not begin. The empty Home is now what §6 always said an empty
    state is: a sentence and one action.

---

## 3. Typography

| Face | Role |
|---|---|
| **Unbounded** 600–800 | Wide, chunky display face. Money (hero, rows, ledger, readouts), screen titles, section heads, the wordmark. |
| **Space Grotesk** 400–700 | Everything else: names, labels, percentages, dates, UI. Slightly quirky, true tabular figures. |

**The dividing line:** the display face for *money and headings*; the text face for everything
else, including percentages. A percentage is a measurement, not a sum. Both faces carry `tnum`, and
all figures set `font-variant-numeric: tabular-nums` so columns align and digits do not shift.

### Scale

| Token | Setting | Used for |
|---|---|---|
| `display` | Unbounded 700 · `clamp(28px, 8.6vw, 46px)` · −0.045em | Net worth, period totals (wide face, so it sizes smaller than a narrow one would) |
| `figure` | Unbounded 600 · 15px · −0.03em | Row and ledger amounts |
| `heading` | Unbounded 700 · 13.5px section heads, 13px card titles, 18px screen titles, 23px sign-up titles | Headings |
| `body` | Space Grotesk 500–600 · 15px | Holding names (600), prose |
| `body-sm` | Space Grotesk 400 · 13.5px | Secondary prose |
| `label` | Space Grotesk 700 · 10.5px · 0.12em · uppercase | Section labels, field labels — never metadata (§2.1) |
| `meta` | Space Grotesk 400 · 12px · sentence case · `ink-3` | Row metadata, dates, counts, axis ticks |
| `pct` | Space Grotesk 700 · 11.5px · tabular | Change figures under row amounts |

**On a phone, every size above is 15% larger, and nothing is smaller than 11px** (Founder,
2026-09-25: the small text was a strain to read). The sizes in the table are the computer's.
The phone scale is one multiplier (`--fs`) and one floor (`--fs-min`), so the hierarchy is kept
exactly. Display figures already size to the viewport and are not scaled. Where larger text crowds
a row on the narrowest phones, spacing gives way first. Production should also follow the reader's
own text-size setting (Dynamic Type, Android font scale) on top of this; Unbounded is wide, so the
largest accessibility sizes need a rule for money that no longer fits (Stage 3).

---

## 4. Colour

Every value below is measured, not chosen by eye. Contrast figures are WCAG ratios against that
theme's ground.

Light (cream) is the reference theme; dark (espresso) follows the OS. Contrast is measured against
the card surface, where most text sits.

| Token | Light | Dark | Role |
|---|---|---|---|
| `paper` | `#F2EADB` | `#1B1712` | The board |
| `card` | `#FFFAF1` | `#2A231B` | Every card, sheet, field |
| `ink` | `#1A1714` | `#F5EDDF` | Text, amounts |
| `ink-2` | `#4A433A` | `#D2C5AF` | Secondary text (8.2:1 light) |
| `ink-3` | `#6B6255` | `#A7987F` | Meta, labels (5.8 / 5.5) |
| `rule` | `#E3D7C1` | `#3E3529` | Rules inside cards (decorative, exempt) |
| `edge` | `#1A1714` | `#E8DCC6` | Card and control outlines |
| `drop` | `#1A1714` | `#000` | The hard offset shadow |
| **`brand`** | `#F0643A` | `#FF7438` | Tomato — NetNet's ink |
| `brand-text` | `#B23C0C` | `#FF8F5E` | Tomato as text (5.7 / 6.9) |
| `brand-on` | `#1A1714` | `#1A1714` | Ink on tomato (5.6 / 6.6) — black on orange, as in the reference |
| **`agent`** | `#2F5BD6` | `#7C98FF` | Royal blue — the agent's ink |
| `agent-text` | `#2447B0` | `#9DB2FF` | Blue as text (7.8 / 7.6) |
| `gain` | `#22703F` | `#6FCF8E` | Positive change (5.8 / 8.1) |
| `loss` | `#B4232F` | `#FF6B81` | Negative change (6.3 / 5.7) — crimson/rose, kept clear of the tomato |
| `attention` | `#8A5A00` | `#F2B640` | Stale, warnings; notes sit on `warn-bg` `#FBE6B5` / `#3A2E14` |
| `sun` | `#F4B63F` | `#F2B640` | Mustard, **decoration only** (§4.3) |

**The risk to watch:** tomato brand and red loss are neighbours. They are separated by hue (orange vs
crimson), by role (brand is never a figure's colour) and by sign (loss always carries `−`).

### 4.3 The six chromatic roles

Colour appears for exactly six reasons, plus one decorative colour. Anything else is `ink`,
`ink-2`, `ink-3`, `rule` or `edge`.

| Role | Token | Appears as |
|---|---|---|
| NetNet's own mark | `brand` | Hero card, wordmark sparkle, trend line and wash, active tab, primary button, chosen segment |
| The agent wrote this | `agent` | The bar on a row's inner edge, at 75% — never text (§2.1) |
| Value went up | `gain` | Change figures, positive bars — always with `+` |
| Value went down | `loss` | Change figures, negative bars — always with `−` |
| Needs attention | `attention` | Stale labels, reminder notices |
| Category identity | chart palette (§5) | Charts only, never UI |
| *Decoration* | `sun` | Step numbers, the prompt card's tab, the "Need more data" sticker. Never data, never beside gain or loss, never in a chart |

### 4.4 Rules that hold the system together

1. **Gain and loss are never the loudest thing.** They are dark greens and crimsons on cream, so
   the tomato hero stays the one loud surface.
2. **Brand and agent never appear inside a categorical chart**, and chart hues never appear as UI
   chrome. Two colour systems, zero overlap in usage.
3. **Green and red are reserved for direction.** They are never a brand colour and never a category.
4. **The hard shadow is for cards and controls you can press.** Text, icons and chart marks never
   get one; that is where the poster turns into a toy.

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
- **Growth bars carry their values, so they carry no axis.** Each bar is labelled with its change;
  a y-axis would say the same thing again. The scale covers only the side the bars use, so an
  all-positive run gets the full height. The pager above the chart names the window, so the bars'
  own labels are just "May" or "Q3".
- **Too little data is a placeholder, never a gap.** A chart that cannot be drawn yet keeps its
  place, so the screen does not change shape when the data arrives and the person sees what is
  coming. It shows a fixed sample of its own shape in neutral ink under frosted glass, labelled
  "Need more data" (see **Chart placeholder**, §6). The sample never wears `brand`, gain/loss or a
  categorical hue and carries no numbers or dates, so it cannot be read as a result even where the
  blur is not supported. Controls that act on data (range bar, pager, legend) are not shown on it.
- **Every line chart can be read point by point.** A dashed crosshair snaps to the nearest date; a
  dot marks each series there; the readout gives the date in `meta` and each value in the display face,
  **value first**, keyed by a short stroke of its series colour, largest first. It sits at the top
  of the plot beside the crosshair, flipping sides past the middle so it never covers the dot, on
  a paper halo rather than a box. Mouse: hover. Touch: tap a point, or press and hold, then drag,
  to scrub; a plain swipe still scrolls. Keyboard: focus, then ← → (Home, End, Esc). Screen
  readers hear each reading. The readout adds precision; every figure it shows is also on the
  page (the hero, the history, the period list), so it never gates a value.
- **The look.** A 3px trend line over a tomato wash, dotted gridlines, a solid ink zero line,
  outlined legend swatches, and allocation bars as 12px outlined pills.
- **The trend line is `brand`**, not gain/loss. It is NetNet's mark, and the change figure beside it
  carries the semantics. A trend line that turned red on a bad quarter would put two conflicting
  signals in one glance.

---

## 6. Components

Built by us, because they carry the brand:

| Component | Notes |
|---|---|
| **Card** | `card` fill, 2px `edge`, 14px radius, 4px/4px hard shadow in `drop`. The primary structural device. Rows inside are padded 16px and split by 1.5px `rule`. |
| **Section** | A heading in the display face above a card. |
| **Figure row** | Name + metadata left; amount (`figure`) over **one** change figure right-aligned (§2.1). |
| **Margin mark** | 4px `agent` bar on the card's inside left edge, at 75%. The provenance device, quiet on purpose; the client is named only when the value is opened. |
| **Opened value** | Only what the row does not already say: the original-currency amount if it differs, then a `meta` footer, "Added 3 days ago by Claude", with Edit and Delete. |
| **Hero figure** | A tomato card with two sparkles in its corner: `label`, `display` amount and change line in `brand-on`; the change figure on a cream pill so gain and loss keep their contrast. On a holding page the name and consequence line sit on it too. |
| **Trend** | 3px `brand` stroke, wash beneath at 22% light / 26% dark. No gridlines by default. |
| **Inline chip** | Text at `label` scale, coloured; "stale" is an outlined sticker on `warn-bg`. |
| **Segmented control** | An outlined tray with a 3px shadow; the chosen segment fills tomato. |
| **Button** | Tomato, 2px outline, 10px radius, 3px hard shadow that collapses when pressed. Secondary: `card` fill. Ghost: underlined text. |
| **Empty state** | Typographic. A sentence and one action, never an illustration. A chart with too little data is not an empty state: see **Chart placeholder**. |
| **Chart placeholder** | The chart's own shape (trend line with a fading wash, growth bars, stacked bars, or three lines), fixed, drawn in `ink-2` dark / `ink-3` light, under a full-bleed frosted layer: `card` at 55% with a 4px backdrop blur (88% solid where blur is unsupported; the sample is dropped in forced-colours mode). On the glass: "Need more data" on a mustard sticker; beneath it, where the screen has no other place to say it, one `body-sm` line in `ink-2` saying what makes the chart appear ("Update a holding next month, or add an earlier value, to see your trend."). Where several charts share a reason (Insights), the reason is said once, in the summary line, and each chart carries only the label. When data exists but the chosen range holds too little, the label is "Pick a longer range" and the range bar stays; when filters leave nothing, "Nothing to show". The sample is hidden from screen readers; the words are read. |
| **Position ledger** | Figure rows as a ledger: bucket in `body`, what is in it in `meta` beneath (holding names; types for locked), amount in the display face; a dashed 2px rule above what you owe. No subtotal. How the first picture is set (PRD J1). |
| **Choice row** | Answers to a fact question: outlined buttons with shadows; the chosen one fills tomato. Sentence answers stack. |
| **Consequence line** | `body-sm` in `ink-2`; the consequence in `ink` 600, the pack's reason after an em dash, then a `label`-scale **Change** link. States money, never a category (PRD J2). The amount ("the $X you could use") appears only where it moves as you type — the Add form. Elsewhere it would repeat the Position ledger. |
| **Change line** | Under a hero figure: signed money · percentage, then "vs *baseline* ▾", which is itself the control that changes the baseline. |
| **Alternative route** | Below a 2px rule: a `body` 600 subtitle ("Let your AI agent do this"), one `meta` line naming the agents, then an outlined button whose icon is the **agent roll**. How a genuine second way to start is offered without competing with the primary (§2.1 rule 10). |
| **Agent roll** | The 18px icon slot on "Connect to agent": the generic agent icon, then each supported agent's logo in turn, two seconds each, counted from when the button appears. Each logo rises in and out (550ms, ease-out), drawn as a silhouette in the button's ink so any official file fits both themes. Still under reduced motion; hidden from screen readers. Missing logo files show the agent's initial in a circle (`agents/README.md`). |
| **Agent logo** | The same silhouette at 18px beside an agent's name in lists ("Which AI agent do you use?", the Agent tab). ChatGPT's, Claude's and Grok's marks come from LobeHub's open-source AI icon set (`agents/README.md`); "Other agent" uses NetNet's own agent icon. |
| **Setup step** | A numbered step (the number on a mustard disc), the client's own words in `ink` 600, then its screenshot in an outlined frame, at most 420px tall. A missing screenshot is a dashed placeholder naming the file to add (`connect/README.md`). |
| **Floating action** | The holding page's **Update**: a tomato pill with a plus, outlined, 52px tall, with a 4px hard shadow, floating bottom-right in line with the amounts inside the cards, 16px above the tab bar (24px from the bottom on a computer). At the very bottom of the page it sinks behind the tab bar (off the bottom on a computer), so it never sits on the last value, and it resurfaces as soon as the page scrolls back up. It comes back when it takes keyboard focus. Under reduced motion it goes and comes without sliding. A page too short to scroll keeps it up and leaves room under its last row. The only floating control in the system, on the one page whose list grows without limit (Founder, 2026-09-25). |
| **Prompt card** | A message to send the agent (the starting prompt on the blank Home, "Ask your agent", Muse's first setup step): a card with a mustard tab on its top edge, `body` 15px in `ink`. **Copy** sits inside it, bottom right, unless the screen's primary action is already Copy. An address (the MCP URL) is a setting, not a message, and sits in a dashed mono box. |
| **Amount entry** | The one place a number is *typed* at display size: Unbounded 600 · 24px in a boxed field that takes a tomato shadow on focus, currency symbol in `ink-3`. |
| **Icon button** | An outlined disc with a 2px shadow (the reference's menu and settings buttons). |
| **Fields** | Boxed: 2px outline, `card` fill; focus adds a tomato hard shadow. |
| **Range bar / filter chips** | The chosen range is an ink pill; filter chips are outlined pills that fill tomato (or `loss` for Don't Show). The pill is drawn inside the 44px target. |
| **Home carousel** | Trend and allocation cards (§7), swiped sideways on a phone; the scroller keeps room for the hard shadows. Dots are outlined circles; the current one is a tomato pill. |
| **Tab bar** | `card` fill, 2px top outline, cells split by rules; the active tab gets a 4px tomato bar on top. Sidebar: the active item is a tomato pill. |
| **Sheet** | `card`, outlined, 22px top corners; a centred card with a 6px shadow on a computer. |
| **Wordmark** | Unbounded 800 with a four-point tomato sparkle for the dot. |

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
controls as small labels and slim pills, which is right for the look and wrong for a
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
5. **Indicators follow the text, not the box.** Selected states under range bars and chips, and the
   baseline in a change line, are text underlines, so a 44px box does not push the underline 14px
   away from the word it marks.
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
  (sign-up, log-in, onboarding) switch the shell to a single column rather than just hiding the sidebar.
  Shipped once; the Founder found the landing page poured into a 232px column on desktop.
- **Home's trend and allocation share one place, under the total** (Founder, 2026-09-26). On a
  phone they are a carousel: one card each, full width, swiped sideways with snap, two dots
  beneath. The line chart's own reading (press and hold, then drag) is unchanged, so a plain
  swipe moves the carousel. The slide a reader is on survives a re-render (Show $, a range, a
  filter, coming back from a holding). On a computer the two sit side by side on the grid's 7/5
  columns, with no dots, above holdings and position. With one type there is no allocation, and
  the trend stands alone.
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
- **Fonts** (Unbounded, Space Grotesk) are committed under `fonts/` (SIL OFL, redistribution
  permitted). Stage 3 decides how they are served, including `expo-font` on native, where each
  weight should ship as its own static file (variable fonts are unreliable on Android).
- **Verify, do not eyeball.** Any change to a chart colour re-runs the palette validator; any change
  to a text token re-runs the contrast check. Both are cheap and both have already caught real
  failures in this system's own development.

## 9. Open questions

1. **A wordmark still needs drawing.** The sparkle stands in for now.
2. **Native build (Stage 3).** The look carries to iOS and Android without web-only tricks. Three
   things need a rule there: platform sheets and switches take the palette but not the full outline
   treatment; Unbounded at the largest accessibility text sizes; frosted placeholders on Android
   below 12 fall back to the solid veil.
3. **Dark mode on real phones.** The cream outline on espresso is measured, but not yet checked on
   a device.
