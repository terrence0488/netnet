# Project State

## Current
Stage: Planning (Stage 4)
Phase: n/a
Status: not-started
Next action: `continue` in a **new session** → `stage: plan`. Inputs: `docs/01-prd.md` (acceptance
criteria), `docs/03-architecture.md`, `CONVENTIONS.md`. Include a **Founder setup checklist** (see
handoff) with each item placed before the task that needs it.
**Branch:** work on a new branch from `main`.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Docs condensed to current decisions only (no amendment history); `decisions.md` is now a register
of decisions in force. **Founder setup, for the plan to schedule:** start now: Apple Developer
Program, buy the domain. Before the P1 spike: Vercel (Hobby, GitHub-linked), Neon (`netnet-prod` +
`netnet-preview`, aws-ap-southeast-1), Claude and ChatGPT plans that allow custom connectors, and
the cloud environment's network access to Vercel and Neon. During P1: Resend (domain DNS), Google
OAuth client, Sentry, a backup key pair (public half to GitHub). Secrets go straight into
Vercel/GitHub settings, never into chat.
