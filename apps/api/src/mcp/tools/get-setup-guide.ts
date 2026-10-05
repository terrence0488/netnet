import {
  UNIVERSALS,
  getSetupGuideInputSchema,
  getSetupGuideOutputSchema,
  type Countries,
  type McpGetSetupGuideInput,
  type McpGetSetupGuideOutput,
  type Pack,
} from '@netnet/contracts';
import { chainValue } from '@netnet/core';
import { COUNTRIES_KEY } from '../../content/publish';
import { AppError } from '../../lib/errors';
import type { ToolCtx } from '../context';
import type { ToolDef } from '../tool';

/**
 * `get_setup_guide`: the country's checklist and the fact questions per type, from the pack
 * chain; the profile's country by default. Needs no ledger: assembly starts before there is one.
 */
export const getSetupGuideTool: ToolDef<McpGetSetupGuideInput, McpGetSetupGuideOutput> = {
  name: 'get_setup_guide',
  title: 'Setup guide',
  description:
    'The setup checklist for a country, and the fact question per type of holding. ' +
    'Ask what it asks when assembling the picture in conversation.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getSetupGuideInputSchema,
  outputSchema: getSetupGuideOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const store = ctx.deps.content();
    const countries = (await store.getCurrent('countries', COUNTRIES_KEY)).body as Countries;
    const country = input.country ?? ctx.profile.country;
    if (country !== null && !Object.hasOwn(countries, country)) {
      throw new AppError(
        'NOT_FOUND',
        `NetNet has no setup guide for ${country} yet: call again without a country for the generic guide.`,
      );
    }
    const chain = await store.getPackChain(country);
    const generic = chain.find((p) => p.id === 'generic');
    if (!generic) throw new Error('The generic pack is not published.');
    const own = chain.find((p) => p.id !== 'generic');
    return {
      country,
      currency: country === null ? null : (countries[country]?.currency ?? null),
      checklist: checklistOf(own, generic),
      questions: questionsOf(chain),
      other_question: otherQuestionOf(chain),
    };
  },
  text: (output) =>
    `Setup guide for ${output.country ?? 'no country (generic)'}: ` +
    `${output.checklist.length} checklist items, ${output.questions.length} questions.`,
};

interface ChecklistItem {
  id: string;
  universal_type: (typeof UNIVERSALS)[number];
  type?: string;
  type_label?: string;
  name: string;
  ask: string;
  amount: string;
  answer?: string;
  only_if?: string;
  hint?: string;
}

/** The country's checklist, then generic's items it does not shadow, with type labels. */
function checklistOf(own: Pack | undefined, generic: Pack): ChecklistItem[] {
  const seen = new Set((own?.checklist ?? []).map((item) => item.id));
  const items = [...(own?.checklist ?? []), ...generic.checklist.filter((i) => !seen.has(i.id))];
  const types = [...(own?.types ?? []), ...generic.types];
  return items.map((item) => {
    const label =
      item.type === undefined ? undefined : types.find((t) => t.key === item.type)?.label;
    return {
      id: item.id,
      universal_type: item.u,
      ...(item.type === undefined ? {} : { type: item.type }),
      ...(label === undefined ? {} : { type_label: label }),
      name: item.name,
      ask: item.ask,
      amount: item.amount,
      ...(item.answer === undefined ? {} : { answer: item.answer }),
      ...(item.onlyIf === undefined ? {} : { only_if: item.onlyIf }),
      ...(item.hint === undefined ? {} : { hint: item.hint }),
    };
  });
}

interface GuideQuestion {
  universal_type: (typeof UNIVERSALS)[number];
  ask: string;
  answers: {
    id: string;
    label: string;
    access: 'accessible' | 'illiquid' | 'locked';
    reason: string;
    until?: string;
  }[];
}

/** The effective question per universal type that asks one, in universal order. */
function questionsOf(chain: readonly Pack[]): GuideQuestion[] {
  const out: GuideQuestion[] = [];
  for (const u of UNIVERSALS) {
    if (u === 'other') continue;
    const question = chainValue(chain, 'questions', u);
    if (question === undefined) continue;
    out.push({ universal_type: u, ask: question.ask, answers: answersOf(question.answers) });
  }
  return out;
}

/** The `other` question: the override for a type with a default. Generic always defines it. */
function otherQuestionOf(chain: readonly Pack[]): {
  ask: string;
  answers: GuideQuestion['answers'];
} {
  const question = chainValue(chain, 'questions', 'other');
  if (question === undefined) throw new Error('The generic pack defines no other question.');
  return { ask: question.ask, answers: answersOf(question.answers) };
}

function answersOf(
  answers: readonly {
    id: string;
    label: string;
    access: 'accessible' | 'illiquid' | 'locked';
    reason: string;
    until?: string;
  }[],
): GuideQuestion['answers'] {
  return answers.map((a) => ({
    id: a.id,
    label: a.label,
    access: a.access,
    reason: a.reason,
    ...(a.until === undefined ? {} : { until: a.until }),
  }));
}
