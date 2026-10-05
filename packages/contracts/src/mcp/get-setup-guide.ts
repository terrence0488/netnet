import { z } from 'zod';
import { countryCodeSchema, universalSchema } from '../content';

/** `get_setup_guide`: the country's checklist and the fact questions per type. */
export const getSetupGuideInputSchema = z.strictObject({
  /** An ISO 3166-1 alpha-2 code in capitals; the profile's country when left out. */
  country: countryCodeSchema.optional(),
});
export type McpGetSetupGuideInput = z.infer<typeof getSetupGuideInputSchema>;

const guideAnswerSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  access: z.enum(['accessible', 'illiquid', 'locked']),
  reason: z.string(),
  until: z.string().optional(),
});

export const getSetupGuideOutputSchema = z.strictObject({
  /** The country asked for, or the profile's; null when no country is known. */
  country: z.string().nullable(),
  /** The country's currency, or null when no country is known. */
  currency: z.string().nullable(),
  /** What to ask about, in the order to ask it: the country's checklist, then generic's. */
  checklist: z.array(
    z.strictObject({
      id: z.string(),
      universal_type: universalSchema,
      /** The pack type it belongs to, when it names one. */
      type: z.string().optional(),
      /** That type's label, when it names one. */
      type_label: z.string().optional(),
      name: z.string(),
      ask: z.string(),
      amount: z.string(),
      answer: z.string().optional(),
      only_if: z.string().optional(),
      hint: z.string().optional(),
    }),
  ),
  /** The fact question for each universal type that asks one, in universal order. */
  questions: z.array(
    z.strictObject({
      universal_type: universalSchema,
      ask: z.string(),
      answers: z.array(guideAnswerSchema),
    }),
  ),
  /** The `other` question: the override for a type with a default, and `"not_sure"` undecided. */
  other_question: z.strictObject({ ask: z.string(), answers: z.array(guideAnswerSchema) }),
});
export type McpGetSetupGuideOutput = z.infer<typeof getSetupGuideOutputSchema>;
