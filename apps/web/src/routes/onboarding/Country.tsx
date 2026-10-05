import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { geoQuery, useUpdateMe } from '../../api/account';
import { isApiError } from '../../api/client';
import { countriesQuery } from '../../api/content';
import { Waiting } from '../../app/guards';
import {
  AuthForm,
  AuthFrame,
  Button,
  Choice,
  FormProblem,
  Hint,
  Picker,
  ResendLink,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { useOnboarding } from './context';
import { countryOptions, localeCountry, readerLanguages } from './countries';
import { nextState, pathOf, stepLabel } from './steps';
import styles from './Onboarding.module.css';

/** The "Somewhere else" answer beside the suggested country. */
const ELSEWHERE = '*';

const CHOOSE = 'Choose where you live to carry on.';

/**
 * "Where do you live?" (PRD §2.3 rule 2, J2): the country our server's lookup suggests, confirmed
 * with one tap, or any country from the alphabetical list. Its currency is what totals default
 * to. Never applied silently: nothing is saved until Continue.
 */
export function Country() {
  const { me, draft, updateDraft } = useOnboarding();
  const navigate = useNavigate();
  const update = useUpdateMe();
  const questionId = useId();
  const [problem, setProblem] = useState<string>();
  const countries = useQuery(countriesQuery);
  const geo = useQuery(geoQuery);
  const languages = useMemo(() => readerLanguages(), []);
  const options = useMemo(
    () => (countries.data ? countryOptions(countries.data, languages) : []),
    [countries.data, languages],
  );

  if (countries.data === undefined || geo.isPending) {
    if (countries.isError) {
      return (
        <AuthFrame title="Where do you live?">
          <FormProblem>{failureSentence(countries.error)}</FormProblem>
          <Button variant="outlined" onClick={() => void countries.refetch()}>
            Try again
          </Button>
        </AuthFrame>
      );
    }
    return (
      <AuthFrame title="Where do you live?">
        <Waiting />
      </AuthFrame>
    );
  }

  const known = countries.data;
  const lookedUp = geo.data?.country ?? null;
  const suggested =
    lookedUp && Object.hasOwn(known, lookedUp) ? lookedUp : localeCountry(languages, known);
  const saved = me.country;
  const chosen = draft.country !== undefined ? draft.country : (saved ?? suggested);
  const elsewhere = draft.elsewhere ?? (saved !== null && saved !== suggested);
  const picking = elsewhere || suggested === null;
  const nameOf = (code: string) => options.find((option) => option.code === code)?.name ?? code;
  const currency = chosen ? known[chosen]?.currency : undefined;

  const submit = () => {
    if (!chosen || !Object.hasOwn(known, chosen)) {
      setProblem(CHOOSE);
      return;
    }
    setProblem(undefined);
    const next = pathOf(nextState('country'));
    const change = {
      ...(chosen !== saved ? { country: chosen } : {}),
      ...(me.onboardingState === 'country' ? { onboardingState: nextState('country') } : {}),
    };
    if (Object.keys(change).length === 0) {
      void navigate(next);
      return;
    }
    update.mutate(change, {
      onSuccess: () => void navigate(next),
      onError: (error) =>
        setProblem(
          isApiError(error, 'VALIDATION_FAILED')
            ? 'Choose a country from the list.'
            : failureSentence(error),
        ),
    });
  };

  return (
    <AuthFrame
      title="Where do you live?"
      titleId={questionId}
      step={stepLabel('country')}
      notice={
        me.emailVerified ? undefined : (
          <p>
            We’ve sent a link to <b className={styles.email}>{me.email}</b> to verify your email.
            Carry on in the meantime. <ResendLink email={me.email} />
          </p>
        )
      }
    >
      <AuthForm onSubmit={submit} labelledBy={questionId}>
        {suggested ? (
          <Choice
            labelledBy={questionId}
            options={[
              { value: suggested, label: nameOf(suggested) },
              { value: ELSEWHERE, label: 'Somewhere else' },
            ]}
            value={elsewhere ? ELSEWHERE : chosen === suggested ? suggested : null}
            onChange={(value) => {
              setProblem(undefined);
              updateDraft(
                value === ELSEWHERE
                  ? { country: null, elsewhere: true }
                  : { country: value, elsewhere: false },
              );
            }}
          />
        ) : null}
        {picking ? (
          <Picker
            label="Country"
            value={chosen && chosen !== suggested ? chosen : ''}
            onChange={(value) => {
              setProblem(undefined);
              updateDraft({ country: value || null, elsewhere: true });
            }}
            options={[
              { value: '', label: 'Choose…' },
              ...options
                .filter((option) => option.code !== suggested)
                .map((option) => ({ value: option.code, label: option.name })),
            ]}
          />
        ) : null}
        <Hint>For local names and suggestions. You can still track anything.</Hint>
        {currency ? (
          <p className={styles.currency}>
            Totals in <b>{currency}</b>
          </p>
        ) : null}
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={update.isPending ? true : undefined}>
          Continue
        </Button>
      </AuthForm>
    </AuthFrame>
  );
}
