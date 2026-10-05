import { useState } from 'react';
import { useMe } from '../../api/account';
import { signOut } from '../../api/auth';
import { BASENAME } from '../../app/basename';
import { Card, FormProblem, ResendLink } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Account.module.css';

/**
 * Account, as far as P1 goes: who is signed in, the unverified line with Resend, and Log out
 * (the prototype's Account tab; P3's settings join it).
 */
export function Account() {
  const me = useMe().data;
  const [problem, setProblem] = useState<string>();
  const [leaving, setLeaving] = useState(false);

  const logOut = async () => {
    if (leaving) return;
    setLeaving(true);
    setProblem(undefined);
    try {
      await signOut();
      // A fresh page, so nothing of the account stays in memory: no cached figure, no profile.
      window.location.replace(`${BASENAME}/login`);
    } catch (error) {
      setProblem(failureSentence(error));
      setLeaving(false);
    }
  };

  if (!me) return null;
  return (
    <>
      <header className={styles.top}>
        <h1>Account</h1>
      </header>
      <div className={styles.stack}>
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
    </>
  );
}
