import type { ProfileView } from '@netnet/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ME_KEY, useMe, useUpdateMe } from '../../api/account';
import { countriesQuery } from '../../api/content';
import { Waiting } from '../../app/guards';
import { Card, ErrorState, FormProblem, Picker } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { countryOptions, readerLanguages } from '../onboarding/countries';
import { currencyOptions } from './currencies';
import styles from './General.module.css';

/**
 * General (Account → General, the prototype's `#/sub/general`): where the person lives and the
 * currency everything is totalled in. Both apply as chosen — the country adds the new pack's
 * types, the currency re-derives the history — and the snapshot is refetched after either, so
 * Home never shows the old currency or labels.
 */
export function General() {
  const me = useMe().data;
  const countries = useQuery(countriesQuery);
  if (!me || countries.isPending) return <Waiting />;
  if (countries.isError || countries.data === undefined) {
    return <ErrorState error={countries.error} onRetry={() => void countries.refetch()} />;
  }
  return <GeneralLoaded me={me} codes={countries.data} />;
}

function GeneralLoaded({
  me,
  codes,
}: {
  me: ProfileView;
  codes: Parameters<typeof countryOptions>[0];
}) {
  const client = useQueryClient();
  const update = useUpdateMe();
  const [problem, setProblem] = useState<string>();
  const languages = useMemo(() => readerLanguages(), []);
  const countries = useMemo(() => countryOptions(codes, languages), [codes, languages]);
  const currencies = useMemo(() => currencyOptions(codes), [codes]);
  // The selects answer at once and follow the server: a save that lands moves them to what
  // it holds (already what was picked), and a failed save falls back to it in `onError`.
  const [country, setCountry] = useState(me.country ?? '');
  const [prevCountry, setPrevCountry] = useState(me.country);
  if (me.country !== prevCountry) {
    setPrevCountry(me.country);
    setCountry(me.country ?? '');
  }
  const [currency, setCurrency] = useState(me.baseCurrency ?? '');
  const [prevCurrency, setPrevCurrency] = useState(me.baseCurrency);
  if (me.baseCurrency !== prevCurrency) {
    setPrevCurrency(me.baseCurrency);
    setCurrency(me.baseCurrency ?? '');
  }

  const saved = (profile: ProfileView) => {
    client.setQueryData(ME_KEY, profile);
    void client.invalidateQueries({ queryKey: ['snapshot'] });
  };

  const pickCountry = (value: string) => {
    if (update.isPending || value === me.country) return;
    if (value === '') {
      setCountry(me.country ?? '');
      return;
    }
    setProblem(undefined);
    setCountry(value);
    update.mutate(
      { country: value },
      {
        onSuccess: saved,
        onError: (error) => {
          setCountry(me.country ?? '');
          setProblem(failureSentence(error));
        },
      },
    );
  };

  const pickCurrency = (value: string) => {
    if (update.isPending || value === me.baseCurrency || value === '') return;
    setProblem(undefined);
    setCurrency(value);
    update.mutate(
      { baseCurrency: value },
      {
        onSuccess: saved,
        onError: (error) => {
          setCurrency(me.baseCurrency ?? '');
          setProblem(failureSentence(error));
        },
      },
    );
  };

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/account" className={styles.iconButton} aria-label="Back to Account">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>General</h1>
        <span className={styles.spacer} />
      </div>

      <div className={styles.body}>
        <Card>
          <div className={styles.fields}>
            <Picker
              label="Where you live"
              hint="Sets local names and suggestions. You can still track anything."
              value={country}
              onChange={pickCountry}
              aria-disabled={update.isPending || undefined}
              options={
                me.country === null
                  ? [
                      { value: '', label: 'Choose…' },
                      ...countries.map(({ code, name }) => ({ value: code, label: name })),
                    ]
                  : countries.map(({ code, name }) => ({ value: code, label: name }))
              }
            />
            {me.baseCurrency === null ? null : (
              <Picker
                label="Default currency"
                hint="Everything is totalled in this currency."
                value={currency}
                onChange={pickCurrency}
                aria-disabled={update.isPending || undefined}
                options={currencies.map((code) => ({ value: code, label: code }))}
              />
            )}
          </div>
        </Card>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </>
  );
}
