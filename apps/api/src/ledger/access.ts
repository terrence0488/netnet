import { NOT_SURE, type AccessBasis, type Holding, type Universal } from '@netnet/contracts';
import { accessRule, resolveAccess } from '@netnet/core';
import type { FieldErrors } from './input';
import type { Scope } from './scope';

/**
 * Accessibility applied to a holding (architecture §6.7, PRD J2): `core.resolveAccess` over the
 * user's pack chain decides the outcome, reason, until and basis, and all four are written onto
 * the holding with the pack's version. Later pack versions never move them.
 */
export type AccessFields = Pick<Holding, 'access' | 'accessReason' | 'accessUntil' | 'accessBasis'>;

/** A liability's: none. */
export const NO_ACCESS: AccessFields = {
  access: null,
  accessReason: null,
  accessUntil: null,
  accessBasis: null,
};

/**
 * The outcome for an asset of `universal` with `answer`: an id answering the type's question (or
 * the `other` question, to override a default), `"not_sure"`, or nothing for the default. An
 * answer that does not fit is added to `errors` at `path`, naming the answers that do.
 */
export async function applyAccess(
  s: Scope,
  universal: Universal,
  answer: string | undefined,
  path: string,
  errors: FieldErrors,
): Promise<AccessFields | undefined> {
  const chain = await s.chain();
  if (answer !== undefined && answer !== NOT_SURE) {
    const { question } = accessRule(chain, universal);
    if (!question.answers.some((a) => a.id === answer)) {
      const ids = [...question.answers.map((a) => a.id), NOT_SURE].map((id) => `"${id}"`);
      errors.add(
        'VALIDATION_FAILED',
        path,
        `"${answer.slice(0, 40)}" does not answer "${question.ask}" Use one of ${ids.join(', ')}.`,
      );
      return undefined;
    }
  }
  const outcome = resolveAccess(chain, universal, answer);
  return {
    access: outcome.access,
    accessReason: 'reason' in outcome ? outcome.reason : null,
    accessUntil: 'until' in outcome ? (outcome.until ?? null) : null,
    accessBasis: outcome.basis,
  };
}

/**
 * An asset's accessibility after it moves from a type of `from` to one of `to`. The same universal
 * type keeps what was applied. Otherwise it is resolved again for the new type, carrying the
 * answer over only when it answered the same question (the `other` question, or "Not sure").
 */
export async function accessAfterTypeChange(
  s: Scope,
  current: Holding,
  from: Universal,
  to: Universal,
  errors: FieldErrors,
): Promise<AccessFields | undefined> {
  if (current.kind === 'liability') return NO_ACCESS;
  const kept: AccessFields = {
    access: current.access,
    accessReason: current.accessReason,
    accessUntil: current.accessUntil,
    accessBasis: current.accessBasis,
  };
  if (from === to) return kept;
  const basis: AccessBasis | null = current.accessBasis;
  const { questionKey, question } = accessRule(await s.chain(), to);
  const answer = basis?.answer ?? undefined;
  const carried =
    answer !== undefined &&
    basis?.question === questionKey &&
    (answer === NOT_SURE || question.answers.some((a) => a.id === answer))
      ? answer
      : undefined;
  return applyAccess(s, to, carried, 'typeId', errors);
}
