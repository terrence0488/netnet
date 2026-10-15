import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../api/account';
import { signOut } from '../../api/auth';
import { countriesQuery } from '../../api/content';
import { revokePushOnSignOut } from '../../api/push';
import { BASENAME } from '../../app/basename';
import { Card, FormProblem, ResendLink, useAgentConnections } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { countryOptions, readerLanguages } from '../onboarding/countries';
import styles from './Account.module.css';

/**
 * Account: who is signed in, the unverified line with Resend, the way into General and types and
 * tags, the connected agents, and Log out (the prototype's Account tab).
 */
export function Account() {
  const me = useMe().data;
  const connections = useAgentConnections();
  const countries = useQuery(countriesQuery);
  const [problem, setProblem] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const languages = useMemo(() => readerLanguages(), []);
  const country = me?.country;
  const baseCurrency = me?.baseCurrency;
  const generalMeta = useMemo(() => {
    const name =
      country && countries.data
        ? countryOptions(countries.data, languages).find((option) => option.code === country)?.name
        : undefined;
    return [name, baseCurrency].filter(Boolean).join(' · ');
  }, [countries.data, languages, country, baseCurrency]);

  const logOut = async () => {
    if (leaving) return;
    setLeaving(true);
    setProblem(undefined);
    try {
      // Best-effort: leaving turns this device's push off, but signing out matters more.
      await revokePushOnSignOut().catch(() => undefined);
      await signOut();
      // A fresh page, so nothing of the account stays in memory: no cached figure, no profile.
      window.location.replace(`${BASENAME}/login`);
    } catch (error) {
      setProblem(failureSentence(error));
      setLeaving(false);
    }
  };

  if (!me) return null;
  const clients = connections.data?.map((connection) => connection.clientName).join(', ');
  return (
    <>
      <header className={styles.top}>
        <h1>Account</h1>
      </header>
      <div className={styles.grid}>
        <div className={styles.col}>
          <Card flush>
            <div className={styles.row}>
              <span className={styles.email}>{me.email}</span>
              {me.emailVerified ? null : (
                <span className={styles.meta}>
                  Not verified yet. <ResendLink email={me.email} />
                </span>
              )}
            </div>
          </Card>
          <section aria-labelledby="settings">
            <h2 id="settings" className={styles.sectionTitle}>
              Settings
            </h2>
            <Card flush>
              <Link to="/account/general" className={styles.actionLink}>
                <span className={styles.grow}>
                  <span className={styles.name}>General</span>
                  {generalMeta === '' ? null : <span className={styles.meta}>{generalMeta}</span>}
                </span>
                <span aria-hidden="true" className={styles.chev}>
                  ›
                </span>
              </Link>
              <Link to="/account/taxonomy" className={styles.actionLink}>
                <span className={styles.grow}>Types and tags</span>
                <span aria-hidden="true" className={styles.chev}>
                  ›
                </span>
              </Link>
            </Card>
          </section>
        </div>
        <div className={styles.col}>
          {connections.isError && connections.data === undefined ? null : (
            <section aria-labelledby="your-agent">
              <h2 id="your-agent" className={styles.sectionTitle}>
                Your agent
              </h2>
              <Card flush>
                <Link to="/agent" className={styles.actionLink}>
                  <span className={styles.grow}>
                    <span className={styles.name}>Connected clients</span>
                    <span className={styles.meta}>
                      {clients === undefined ? '…' : clients === '' ? 'none yet' : clients}
                    </span>
                  </span>
                  <span aria-hidden="true" className={styles.chev}>
                    ›
                  </span>
                </Link>
              </Card>
            </section>
          )}
          <p className={styles.note}>NetNet never sells your data or sees your documents.</p>
          <Card flush>
            <button
              type="button"
              className={styles.action}
              aria-disabled={leaving ? true : undefined}
              onClick={() => void logOut()}
            >
              Log out
            </button>
          </Card>
          {problem ? <FormProblem>{problem}</FormProblem> : null}
        </div>
      </div>
    </>
  );
}
