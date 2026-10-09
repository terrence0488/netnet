import type { CreateHolding, Pack, Snapshot, Universal, UserType } from '@netnet/contracts';
import { fromMinor } from '@netnet/core';
import { sideOf } from '../add/Add';

/**
 * The basics (PRD J1): the pack's checklist walked one question per screen, each answer saved at
 * once as a guided holding. This is the flow's pure core: which questions show and in what order,
 * what each answer saves, and what flipping an answer removes. The screens (Basics.tsx) render it.
 */

/** One question of the checklist: "do you have this?" (`ask`), then "roughly how much?" (`amount`). */
export type ChecklistItem = Pack['checklist'][number];

/** What the person said to one item: yes saves a holding at once; no saves nothing. */
export interface BasicsAnswer {
  readonly decision: 'yes' | 'no';
  /** The holding the yes saved; absent until the save answers. */
  readonly holdingId?: string;
  /** The amount the yes saved, as the decimal string the API takes. */
  readonly amount?: string;
}

/** The person's answers so far, by checklist id. A skipped question simply has none. */
export type BasicsAnswers = Readonly<Record<string, BasicsAnswer>>;

/** The country's checklist: the first pack in the chain that asks anything, else nothing. */
export function checklistOf(chain: readonly Pack[]): readonly ChecklistItem[] {
  return chain.find((pack) => pack.checklist.length > 0)?.checklist ?? [];
}

/** Whether everything `item` depends on was answered yes (`onlyIf` names earlier items). */
export function isVisible(
  checklist: readonly ChecklistItem[],
  answers: BasicsAnswers,
  id: string,
): boolean {
  const byId = new Map(checklist.map((item) => [item.id, item]));
  const seen = new Set([id]);
  let next = byId.get(id)?.onlyIf;
  while (next !== undefined) {
    if (seen.has(next)) return false;
    seen.add(next);
    if (answers[next]?.decision !== 'yes') return false;
    next = byId.get(next)?.onlyIf;
  }
  return byId.has(id);
}

/** The questions asked with these answers: each item whose `onlyIf` holds, in pack order. */
export function visibleItems(
  checklist: readonly ChecklistItem[],
  answers: BasicsAnswers,
): ChecklistItem[] {
  return checklist.filter((item) => isVisible(checklist, answers, item.id));
}

/**
 * Whether the item is settled: a no, or a yes whose holding is saved. A yes still waiting for
 * its amount is asked again, so Back can always return to it.
 */
export function isAnswered(answers: BasicsAnswers, id: string): boolean {
  const answer = answers[id];
  return (
    answer?.decision === 'no' || (answer?.decision === 'yes' && answer.holdingId !== undefined)
  );
}

/** The first question still open, or undefined when the basics are done. */
export function firstUnanswered(
  checklist: readonly ChecklistItem[],
  answers: BasicsAnswers,
): ChecklistItem | undefined {
  return visibleItems(checklist, answers).find((item) => !isAnswered(answers, item.id));
}

/** The next open question after `id`, for moving on; undefined finishes the basics. */
export function nextUnanswered(
  checklist: readonly ChecklistItem[],
  answers: BasicsAnswers,
  id: string,
): ChecklistItem | undefined {
  const visible = visibleItems(checklist, answers);
  const at = visible.findIndex((item) => item.id === id);
  return visible.slice(at + 1).find((item) => !isAnswered(answers, item.id));
}

/**
 * The question's number, "n of total": a follow-up shares its anchor's number, so the count
 * never jumps as questions appear.
 */
export function positionOf(
  checklist: readonly ChecklistItem[],
  id: string,
): { n: number; total: number } {
  const base = checklist.filter((item) => item.onlyIf === undefined);
  const byId = new Map(checklist.map((item) => [item.id, item]));
  let anchor = byId.get(id);
  while (anchor?.onlyIf !== undefined) anchor = byId.get(anchor.onlyIf);
  return { n: anchor === undefined ? 0 : base.indexOf(anchor) + 1, total: base.length };
}

/** The question before `id`, answered or not, for Back; undefined returns to the start screen. */
export function previousItem(
  checklist: readonly ChecklistItem[],
  answers: BasicsAnswers,
  id: string,
): ChecklistItem | undefined {
  const visible = visibleItems(checklist, answers);
  const at = visible.findIndex((item) => item.id === id);
  return at > 0 ? visible[at - 1] : undefined;
}

/**
 * Everything asked only because of `id`: its follow-ups, transitively, in pack order. One pass
 * suffices because `onlyIf` names an earlier item. Flipping `id` to no removes their holdings too.
 */
export function followupsOf(checklist: readonly ChecklistItem[], id: string): ChecklistItem[] {
  const caused = new Set([id]);
  const found: ChecklistItem[] = [];
  for (const item of checklist) {
    if (item.onlyIf !== undefined && caused.has(item.onlyIf)) {
      caused.add(item.id);
      found.push(item);
    }
  }
  return found;
}

/** Without these items' answers: what a flip to no leaves behind. */
export function omitAnswers(answers: BasicsAnswers, ids: readonly string[]): BasicsAnswers {
  const kept: Record<string, BasicsAnswer> = {};
  for (const [id, answer] of Object.entries(answers)) {
    if (!ids.includes(id)) kept[id] = answer;
  }
  return kept;
}

/** A saved answer picked back up: the holding's latest value as the decimal string to show. */
function latestAmount(snapshot: Snapshot, holdingId: string): string | undefined {
  const tuples = snapshot.values[holdingId];
  const latest = tuples?.[tuples.length - 1];
  return latest ? fromMinor(latest[1], latest[2]) : undefined;
}

/**
 * Where a returning person continues: every checklist item already saved as a holding counts as
 * answered yes. Holdings and items meet by name and kind — during onboarding only the basics save
 * holdings, so a match is one of its answers.
 */
export function seedAnswers(
  checklist: readonly ChecklistItem[],
  snapshot: Snapshot,
): BasicsAnswers {
  const answers: Record<string, BasicsAnswer> = {};
  for (const item of checklist) {
    const holding = snapshot.holdings.find(
      (h) => !h.archived && h.name === item.name && h.kind === sideOf(item.u),
    );
    if (holding) {
      const amount = latestAmount(snapshot, holding.id);
      answers[item.id] =
        amount === undefined
          ? { decision: 'yes', holdingId: holding.id }
          : { decision: 'yes', holdingId: holding.id, amount };
    }
  }
  return answers;
}

/** The person's type for the item: the pack type it names (such as `car_loan`), else its universal. */
function typeRef(
  types: readonly UserType[],
  item: ChecklistItem,
): { typeId: string } | { universal: Universal } {
  const named =
    item.type === undefined ? undefined : types.find((t) => t.packTypeKey === item.type);
  if (named) return { typeId: named.id };
  return { universal: item.u };
}

/** What a yes saves: the item as a holding with its opening value, `via: 'guided'`. */
export function holdingInput(
  item: ChecklistItem,
  opts: { types: readonly UserType[]; currency: string; amount: string; date: string },
): CreateHolding {
  const kind = sideOf(item.u);
  return {
    name: item.name,
    kind,
    ...typeRef(opts.types, item),
    currency: opts.currency,
    ...(kind === 'asset' && item.answer !== undefined ? { access: item.answer } : {}),
    opening: { amount: opts.amount, date: opts.date },
    via: 'guided',
  };
}
