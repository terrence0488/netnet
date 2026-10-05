import type { Segment as SegmentValue } from '@netnet/contracts';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useUpdateMe } from '../../api/account';
import { AuthForm, AuthFrame, Button, Choice, FormProblem, Hint } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { useOnboarding } from './context';
import { nextState, pathOf, previousStep, stepLabel } from './steps';

type Chosen = Exclude<SegmentValue, 'unknown'>;

/** The one skippable question whose answer every later event carries (PRD §3.5). */
const SEGMENTS: readonly { value: Chosen; label: string }[] = [
  { value: 'starting_out', label: 'Just starting out' },
  { value: 'accumulating', label: 'Building up — saving toward something big' },
  { value: 'established', label: 'Established — a lot to keep track of' },
];

/**
 * "Which is closest to you?" (PRD J1): optional, so Skip moves on with the segment left unknown.
 * Choosing an answer again unchooses it. The answer is saved with the step, once.
 */
export function Segment() {
  const { me, draft, updateDraft } = useOnboarding();
  const navigate = useNavigate();
  const update = useUpdateMe();
  const questionId = useId();
  const [problem, setProblem] = useState<string>();
  const chosen: Chosen | null =
    draft.segment !== undefined ? draft.segment : me.segment === 'unknown' ? null : me.segment;
  const back = previousStep('segment');

  const submit = () => {
    setProblem(undefined);
    const after = nextState('segment');
    const change = {
      ...(chosen && me.segment === 'unknown' ? { segment: chosen } : {}),
      onboardingState: after,
    };
    update.mutate(change, {
      onSuccess: () => void navigate(pathOf(after), { replace: after === 'done' }),
      onError: (error) => setProblem(failureSentence(error)),
    });
  };

  return (
    <AuthFrame
      title="Which is closest to you?"
      titleId={questionId}
      step={stepLabel('segment')}
      back={back ? { to: pathOf(back.state) } : undefined}
    >
      <AuthForm onSubmit={submit} labelledBy={questionId}>
        <Choice
          stacked
          labelledBy={questionId}
          options={SEGMENTS}
          value={chosen}
          onChange={(value) => updateDraft({ segment: value === chosen ? null : value })}
        />
        <Hint>Optional. It changes nothing you see.</Hint>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={update.isPending ? true : undefined}>
          {chosen ? 'Continue' : 'Skip'}
        </Button>
      </AuthForm>
    </AuthFrame>
  );
}
