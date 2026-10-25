# ops/m12 — the M12 harness

The benchmark behind **M12** and assumption **A13** (PRD §2.4, §3.4): with identical data, does a
weak model answer better connected to NetNet than handed the same data as a spreadsheet? It asks a
fixed question set in both arms, scores the answers blind, and reports whether NetNet wins at
least 80% of pairs and never scores worse on fabrication.

It is a tool the Founder runs, never part of the product (**N2**): the Anthropic SDK is a
dependency of this package alone, and a lint rule refuses it in `apps/*` and `packages/*`. Nothing
here is imported by the app, and the app never imports this.

## Running it

```sh
pnpm m12 --approve-spend <usd> [--model <id>] [--runs <n>] [--seed <n>] [--dry-run]
```

- `DATABASE_URL` — a local Postgres superuser. The harness creates a scratch database, bootstraps
  its roles, migrates it, publishes `content/` into it, and drops it afterwards. The app it starts
  connects as `netnet_app`, never the owner.
- `ANTHROPIC_API_KEY` — needed for a paid run only. `--dry-run` uses a deterministic fake model and
  a fake judge: no key, no network to the API, no spend.
- `--approve-spend` — the most the run may spend, in USD. It is the approval **and** the cap: the
  harness counts a dry pass's tokens, prices them from `src/config.ts`, prints the estimate, refuses
  to send anything when the approval is below it, and stops as soon as what it has spent passes it.
- `--model` — `claude-haiku-5-5` (default) or `claude-haiku-4-5`, both at effort `low`.
- `--runs` — 1 to 3 (three is expected well under US$10).
- `--seed` — fixes the blind order and the blind sheet; it is recorded in the report.

The built app must exist (`pnpm --filter @netnet/api build`), because the NetNet arm serves it the
way `e2e/server.ts` does. On a real run, check the model ids and the rates in `src/config.ts`
against the Models API first.

## What a run does

1. **Checks the question set against `core`.** Every committed answer in
   `content/demo/m12-questions.json` must equal what `core` computes from
   `content/demo/household.json`; a stale pin stops the run before it costs anything.
2. **Builds the NetNet arm.** Scratch Postgres, published content, the built app on a free port, an
   account, `demo:load`'s household, then a real MCP client: discovery, DCR, PKCE, the approval
   API with the account's session, the code exchange. Tools are listed and proxied client-side —
   every `tool_use` runs through the MCP client and the result's text goes back to the model. Its
   own loop, at most ten rounds, so every call and latency is logged.
3. **Builds the spreadsheet arm.** The same household as one CSV: a row per holding (name, kind,
   currency), a column per month-end, blank where nothing was recorded, and the rates the household
   used in their own block. No accessibility, reasons, totals, staleness or conversions.
4. **Asks both arms the same question**, with the same system prompt (today's date, the household's
   end date, the base currency) and no other help.
5. **Judges blind.** The answers are shown as A and B in a seeded order; the judge is never told
   which arm is which, or that NetNet exists, and gets the question, the ground truth and a rubric.
   Numeric correctness is checked against `core`'s ground truth; qualification and fabrication are
   the judge's. A pair goes to the higher total; a tie is no win.
6. **Writes** `ops/m12/runs/<date>-<seed>/`: `transcripts.jsonl` (every turn and tool call),
   `scores.json` (with the unblinding), `blind-sheet.md` (ten seeded pairs for the Founder, no arm
   labels) and `report.md`. All but `report.md` are gitignored.

## The committed question set

`content/demo/m12-questions.json`, versioned, validated by `pnpm content:check` against the schema
in `packages/contracts`. Each question names a metric `core` computes, the committed answer, the
tolerance a figure is answered within, and the qualifications a good answer makes. The metrics are
anchored to the household's end date, so a run months later scores the same figures; staleness is
asked of a named holding rather than counted, because a count moves with the date of the run.

A change after a run is a new version; every report names it. Nothing is tuned toward a result.

## F22

The paid run is blocked on **F22** (the Anthropic API key and the Founder's approval of each run's
spend). Until it lands, `--dry-run` is the only execution path, and the model ids and per-token
rates have not been checked against the Models API. The workflow (`.github/workflows/m12.yml`) is
ready for the key as a repository secret.
