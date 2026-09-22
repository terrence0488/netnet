# WORKFLOW.md — AI-Driven Product Workflow (Solo Founder)

The Founder owns every decision. AI owns execution and documentation.
This file defines the stages, the session protocol, and the templates.

## 0. Core Principles

1. **Files are the only memory.** No session may rely on a previous conversation. Everything a later session needs must be written to `docs/`.
2. **One session = one stage (or one task).** Load only the inputs that stage lists. Do not read the whole repo.
3. **Gates are human-only.** AI never marks its own work approved. Only the Founder approves, and approval is recorded in `docs/STATE.md`.
4. **Stop at gates.** When a stage's outputs are written, present the gate summary and stop. Do not start the next stage in the same session.
5. **Keep documents short and living.** Prefer bullet points, tables, and explicit non-goals. Update documents when facts change; never let them go stale.
6. **Thin vertical slices.** Every phase delivers something a user can do end to end, deployed and testable.

## 1. Session Protocol

### On session start (always)
1. Read `docs/STATE.md`. If it does not exist, create it from the template in Section 7 and start at Stage 0.
2. Determine the stage to run:
   - If the Founder says `stage: <name>` (e.g. `stage: prd`, `stage: build P2-T3`), run that stage.
   - If the Founder says `continue`, run the stage named in `STATE.md → Next action`.
3. Check the stage's **Requires** condition. If it is not met, say what is missing and stop.
4. Read only the files listed under that stage's **Inputs**.
5. State in one line: the role you are acting as, the stage, and the files you loaded.

### On session end (always)
1. Write all stage outputs to their listed paths.
2. Update `docs/STATE.md`: current stage, status, a handoff note (≤10 lines), and next action.
3. If the stage has a gate, present the **Gate Summary** (Section 5) and stop.

### Context budget
- If the context is getting heavy mid-stage, write progress to the stage's output file, add a handoff note to `STATE.md` marked `status: in-progress`, and tell the Founder to start a new session with `continue`.
- Summarise long files instead of re-reading them; reference by path and section.

## 2. Directory Layout

```
CLAUDE.md                     # project entry point, points here
CONVENTIONS.md                # stack, code style, testing rules (created in Stage 3)
docs/
  WORKFLOW.md                 # this file
  STATE.md                    # single source of truth for progress and approvals
  decisions.md                # append-only decision log (date, decision, reason, stage)
  00-discovery.md             # problem validation
  01-prd.md                   # product requirements + acceptance criteria
  02-prototype/               # prototype files + prototype-notes.md
  03-architecture.md          # system design + interface contracts
  04-plan.md                  # phases, checkpoints, task list
  phases/
    P1/
      tasks/P1-T1.md          # self-contained task briefs
      test-report.md
      feedback.md
    P2/ ...
  09-launch.md                # release checklist and launch notes
  10-learnings.md             # user data and insights after launch
```

## 3. Stages

Each stage lists: **Role · Requires · Inputs · Outputs · Gate**.

### Stage 0 — Discovery (`stage: discovery`)
- **Role:** Product researcher.
- **Requires:** Nothing.
- **Inputs:** Founder's problem statement (from the chat), `docs/00-discovery.md` if it exists.
- **Do:** Sharpen the problem statement. Identify target user, current alternatives, and riskiest assumptions. Draft 8–12 user interview questions. If the Founder provides interview notes, synthesise them into patterns, quotes, and evidence for or against each assumption.
- **Outputs:** `docs/00-discovery.md`.
- **Gate:** Founder confirms the problem is worth solving and the target user.

### Stage 1 — Requirements (`stage: prd`)
- **Role:** Product manager.
- **Requires:** Stage 0 approved.
- **Inputs:** `docs/00-discovery.md`, Founder's high-level solution (from the chat).
- **Do:** Write a lean PRD with these sections: Problem, Target user, Goals & success metrics, Core user jobs (user stories), **Acceptance criteria** (Given/When/Then, one set per story), Non-goals, Open questions. Keep it under ~2 pages. Ask the Founder any blocking questions before finalising.
- **Outputs:** `docs/01-prd.md`.
- **Gate:** Founder approves the PRD.

### Stage 2 — Prototype (`stage: prototype`)
- **Role:** Product designer.
- **Requires:** Stage 1 approved.
- **Inputs:** `docs/01-prd.md`.
- **Do:** Build a clickable prototype covering the core user jobs (throwaway code is fine; favour speed). Write `prototype-notes.md` with the flows covered, design decisions, and a short script for testing it with 3–5 real users.
- **Outputs:** `docs/02-prototype/`.
- **Gate:** Founder approves after reviewing it and, ideally, testing with real users. Any learnings must be applied back to `01-prd.md` before approval.

### Stage 3 — Architecture (`stage: architecture`)
- **Role:** Staff software engineer.
- **Requires:** Stage 2 approved.
- **Inputs:** `docs/01-prd.md`, `docs/02-prototype/prototype-notes.md`.
- **Do:** Design only what the first phases need. Cover: Stack choice with reasons, Component diagram (Mermaid), Data model, **Interface contracts** (API endpoints, function signatures, event shapes), Auth & security approach, Deployment & environments, Observability (logging, errors, analytics), Key risks and trade-offs. Create `CONVENTIONS.md` (folder structure, naming, error handling, testing requirements, commit style).
- **Outputs:** `docs/03-architecture.md`, `CONVENTIONS.md`.
- **Gate:** Founder approves the architecture.

### Stage 4 — Planning (`stage: plan`)
- **Role:** Software engineering manager.
- **Requires:** Stage 3 approved.
- **Inputs:** `docs/01-prd.md` (acceptance criteria), `docs/03-architecture.md`, `CONVENTIONS.md`.
- **Do:**
  - Split the product into phases (P1, P2, …). Each phase is a vertical slice ending in a **deployed, testable checkpoint** mapped to specific acceptance criteria.
  - Phase 1 must include project scaffolding, CI, and deployment to a real environment.
  - Break each phase into tasks. Write each task as a **self-contained brief** in `docs/phases/Pn/tasks/Pn-Tm.md` using the template in Section 6.
  - Mark task dependencies and which tasks can run in parallel. Tightly coupled tasks run sequentially.
- **Outputs:** `docs/04-plan.md`, task briefs for **the next phase only** (later phases stay as outlines until reached).
- **Gate:** Founder approves the plan.

### Stage 5 — Build (`stage: build Pn` or `stage: build Pn-Tm`)
- **Role:** Engineering manager coordinating engineer subagents.
- **Requires:** Stage 4 approved (and, for P2+, the previous phase approved).
- **Inputs:** `docs/04-plan.md` (current phase section), `CONVENTIONS.md`, the phase's task briefs, `docs/phases/Pn/feedback.md` if it exists.
- **Do:**
  - Dispatch each task to a subagent. Give the subagent **only** the task brief path, `CONVENTIONS.md`, and the relevant section of `03-architecture.md`. Do not pass the full conversation.
  - Each subagent implements the task, writes and runs tests, and reports: files changed, tests run and results, deviations from the brief, open issues.
  - The manager checks each result against the brief's done criteria and the interface contracts, then updates the task status in the brief.
  - If a task needs a contract or architecture change, stop and raise it with the Founder rather than improvising.
  - When all phase tasks are done, confirm the build runs and is deployed to the test environment.
- **Outputs:** Code, tests, updated task briefs (status + report), `STATE.md` update.
- **Gate:** None. Next action is Stage 6.

### Stage 6 — Test (`stage: test Pn`)
- **Role:** QA engineer. Run in a **fresh session** that did not do the build.
- **Requires:** All tasks in Pn marked done.
- **Inputs:** `docs/01-prd.md` (acceptance criteria for this phase), `docs/04-plan.md` (phase checkpoint), the running application. Do not read the task reports before testing.
- **Do:** Test against the acceptance criteria, not against the implementation. Include happy paths, edge cases, error states, and basic security checks (auth, input validation, secrets not exposed). Run the automated test suite.
- **Outputs:** `docs/phases/Pn/test-report.md` with: Summary, Criteria results table (criterion · pass/fail · evidence), Issues found (severity · steps to reproduce · expected vs actual), What went well, Suggested manual checks for the Founder.
- **Gate:** Founder reviews the test report **and uses the product hands-on**.

### Stage 7 — Feedback Triage (`stage: triage Pn`)
- **Role:** Engineering manager.
- **Requires:** Founder feedback provided (in the chat or in `docs/phases/Pn/feedback.md`).
- **Inputs:** `docs/phases/Pn/test-report.md`, `docs/phases/Pn/feedback.md`.
- **Do:** Classify each feedback item and route it:

  | Type | Example | Route to |
  |---|---|---|
  | Bug | Button errors on submit | New task in Pn → Stage 5 |
  | Requirement gap | "This isn't what I meant" | Update `01-prd.md` → Founder re-approves → re-plan |
  | Design issue | Structural or scaling concern | Update `03-architecture.md` → Founder re-approves → re-plan |
  | Scope change | New feature idea | Add to a later phase in `04-plan.md` |

  Write new task briefs for items routed to Stage 5. Log significant choices in `decisions.md`.
- **Outputs:** Updated `feedback.md` (each item with type and route), new task briefs, updated upstream docs if needed.
- **Gate:** Founder confirms the triage. The loop Stage 5 → 6 → 7 repeats until the Founder records **Phase Pn: approved** in `STATE.md`. Then planning for the next phase begins (Stage 4, next phase only).

### Stage 8 — Launch (`stage: launch`)
- **Role:** Release manager.
- **Requires:** All phases required for launch are approved.
- **Inputs:** `docs/01-prd.md`, `docs/03-architecture.md`, latest test reports.
- **Do:** Produce a release checklist: production config, secrets, backups, error monitoring, analytics events for the PRD success metrics, security review, legal basics (privacy policy, terms), rollback plan.
- **Outputs:** `docs/09-launch.md`.
- **Gate:** Founder approves go-live.

### Stage 9 — Learn (`stage: learn`)
- **Role:** Product manager.
- **Requires:** Product is live.
- **Inputs:** `docs/01-prd.md`, analytics and user feedback provided by the Founder.
- **Do:** Compare results with the success metrics. Summarise insights. Propose PRD updates and next-phase candidates.
- **Outputs:** `docs/10-learnings.md`, proposed changes to `01-prd.md`.
- **Gate:** Founder approves changes. The cycle restarts at Stage 1 or Stage 4.

## 4. Rules for All Roles

- Never mark a gate approved; only the Founder does, and it is recorded in `STATE.md`.
- If an upstream document is wrong or missing something, raise it. Do not silently work around it.
- Append every significant decision to `docs/decisions.md`.
- Never commit secrets. Use environment variables.
- Prefer boring, well-known technology unless the architecture says otherwise.
- Ask the Founder when something is ambiguous and blocking; otherwise make a reasonable choice and note it.

## 5. Gate Summary Format

At every gate, present this and stop (keep it under one screen):

```
## Gate: <stage name>
**Output:** <file paths>
**What was done:** <3–5 bullets>
**Decisions needed from you:** <numbered list, max 5, each with a recommended option>
**Risks / open questions:** <bullets>
**To approve:** reply "approve <stage>" (I will record it in STATE.md)
**Next session:** start with `continue`
```

When the Founder replies `approve <stage>`, record the approval with the date in `STATE.md`, set the next action, and end the session.

## 6. Task Brief Template (`docs/phases/Pn/tasks/Pn-Tm.md`)

```
# Pn-Tm: <title>
Status: todo | in-progress | done | blocked
Depends on: <task IDs or none>
Parallel-safe: yes | no

## Goal
<one or two sentences>

## Context
<only what the engineer needs; link to architecture sections by heading>

## Interface contract
<exact signatures / endpoints / schemas this task must provide or consume>

## Files in scope
<paths the task may create or change>

## Done criteria
- [ ] <behaviour>
- [ ] Tests written and passing: <what to test>
- [ ] Follows CONVENTIONS.md

## Report (filled by engineer)
Files changed:
Tests run / results:
Deviations:
Open issues:
```

## 7. STATE.md Template

```
# Project State

## Current
Stage: <stage name>
Phase: <Pn or n/a>
Status: not-started | in-progress | awaiting-approval | approved
Next action: <exact command, e.g. `stage: test P2`>

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | | | |
| PRD | | | |
| Prototype | | | |
| Architecture | | | |
| Plan | | | |
| P1 | | | |

## Handoff note (last session)
<≤10 lines: what was done, what is unfinished, what to watch out for>
```
