import type { HoldingAccess, Universal, VersionedPack } from '@netnet/contracts';
import { accessRule, resolveAccess } from '@netnet/core';
import { useId } from 'react';
import { Choice } from './Choice';
import { fieldStyles } from './Field';
import { Figure } from './Figure';
import styles from './AccessBlock.module.css';

export interface UsablePreview {
  readonly minor: number;
  readonly currency: string;
}

/**
 * The consequence, never the label (PRD J2, design-system §6): what the accessibility means in
 * money, with the pack's reason in one line. The amount appears only where it moves as you type
 * (the Add form); elsewhere it would repeat the Position ledger.
 */
export function ConsequenceLine({
  access,
  reason,
  usable,
}: {
  readonly access: HoldingAccess;
  readonly reason: string | null;
  readonly usable: UsablePreview | null;
}) {
  const tail = reason ? ` — ${reason}.` : '.';
  const amount =
    usable === null ? (
      'what'
    ) : (
      <>
        the <Figure size="inline" minor={usable.minor} currency={usable.currency} />
      </>
    );
  if (access === 'accessible') {
    return (
      <>
        <b>Counts toward {amount} you could use this month</b>
        {tail}
      </>
    );
  }
  if (access === 'illiquid' || access === 'locked') {
    return (
      <>
        <b>Counts toward your net worth, not {amount} you could use this month</b>
        {tail}
      </>
    );
  }
  return (
    <>
      <b>Counts toward your net worth.</b> Not toward {amount} you could use this month until you
      decide.
    </>
  );
}

export interface AccessBlockProps {
  readonly chain: readonly VersionedPack[];
  readonly universal: Universal;
  /** The chosen answer id, `not_sure`, or undefined for the type's default. */
  readonly answer: string | undefined;
  readonly onAnswer: (answer: string | undefined) => void;
  /** Whether the default's question is open for changing. */
  readonly changing: boolean;
  readonly onChanging: (changing: boolean) => void;
  /** "Could use" once saved, or null to leave the amount out of the consequence. */
  readonly usable: UsablePreview | null;
  readonly onAskAgent: () => void;
}

/**
 * Accessibility by a fact, a default or "Not sure" (PRD J2): a type with a default states it with
 * its reason and a Change link; a genuinely ambiguous type asks its fact question, never the
 * category. Saving is never blocked: no answer, or "Not sure", is undecided. Shared by the Add
 * form and the holding page's access sheet.
 */
export function AccessBlock({
  chain,
  universal,
  answer,
  onAnswer,
  changing,
  onChanging,
  usable,
  onAskAgent,
}: AccessBlockProps) {
  const questionId = useId();
  const rule = accessRule(chain, universal);
  const showQuestion = changing || (answer === undefined && rule.default === null);
  const decided = answer !== undefined || rule.default !== null;
  const outcome = decided ? resolveAccess(chain, universal, answer) : null;

  return (
    <div className={styles.block}>
      {showQuestion ? (
        <>
          <p id={questionId} className={fieldStyles.label}>
            {rule.question.ask}
          </p>
          <Choice
            labelledBy={questionId}
            stacked={rule.question.answers.length > 2}
            options={[
              ...rule.question.answers.map((a) => ({ value: a.id, label: a.label })),
              { value: 'not_sure', label: 'Not sure' },
            ]}
            value={answer ?? null}
            onChange={(value) => onAnswer(value)}
          />
          {changing && rule.default ? (
            <button
              type="button"
              className={styles.inlineLink}
              onClick={() => {
                onAnswer(undefined);
                onChanging(false);
              }}
            >
              Keep the usual
            </button>
          ) : null}
        </>
      ) : null}
      {outcome ? (
        <p className={styles.conseq}>
          <ConsequenceLine
            access={outcome.access}
            reason={'reason' in outcome ? outcome.reason : null}
            usable={usable}
          />{' '}
          {!showQuestion ? (
            <button type="button" className={styles.inlineLink} onClick={() => onChanging(true)}>
              Change
            </button>
          ) : null}
        </p>
      ) : null}
      {outcome?.access === 'undecided' && answer !== undefined ? (
        <p className={styles.hint}>
          Saving is fine as it is. Your agent can help you decide later.
        </p>
      ) : null}
      <div>
        <button type="button" className={styles.askLink} onClick={onAskAgent}>
          Ask your agent
        </button>
      </div>
    </div>
  );
}
