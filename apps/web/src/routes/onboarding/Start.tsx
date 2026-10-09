import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUpdateMe } from '../../api/account';
import { AlternativeRoute, AuthFrame, Button, FormProblem } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Onboarding.module.css';
import { useOnboarding } from './context';
import { nextState, pathOf, previousStep } from './steps';

/**
 * "Let's start…" (PRD J1): the second route choice. Start walks the basics one question per
 * screen; the agent block below the rule opens the same connect flow every other entry uses. Back
 * returns to the segment; the agent is not offered again inside the basics.
 */
export function Start() {
  const { me } = useOnboarding();
  const navigate = useNavigate();
  const update = useUpdateMe();
  const [problem, setProblem] = useState<string>();
  const back = previousStep('start');

  const begin = () => {
    if (update.isPending) return;
    setProblem(undefined);
    const after = nextState('start');
    const next = pathOf(after);
    if (me.onboardingState !== 'start') {
      void navigate(next);
      return;
    }
    update.mutate(
      { onboardingState: after },
      {
        onSuccess: () => void navigate(next),
        onError: (error) => setProblem(failureSentence(error)),
      },
    );
  };

  return (
    <AuthFrame
      title="Let’s start by getting to know a little about your finances."
      sub="A few quick questions. Round numbers are fine, and you can change anything later."
      back={back ? { to: pathOf(back.state) } : undefined}
    >
      <div className={styles.stack}>
        <Button block onClick={begin} aria-disabled={update.isPending ? true : undefined}>
          Start
        </Button>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <AlternativeRoute entry="onboarding" />
      </div>
    </AuthFrame>
  );
}
