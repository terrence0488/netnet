import { ERASED_WITHIN_DAYS } from '@netnet/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { deleteAccount } from '../../api/account';
import { signOut } from '../../api/auth';
import { isApiError } from '../../api/client';
import { revokePushOnSignOut } from '../../api/push';
import { BASENAME } from '../../app/basename';
import { Button, Card, FormProblem, buttonClass } from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './DeleteAccount.module.css';

/**
 * Delete account (Account → Delete account, the prototype's `#/sub/delete`): what erasure means,
 * stated before anything can be confirmed, then the deletion itself. A stale sign-in sends the
 * person to sign in again first; afterwards nothing of the account stays, on the server or in the
 * page, and the person lands on sign-up.
 */
export function DeleteAccount() {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [reauth, setReauth] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setProblem(undefined);
    setReauth(false);
    try {
      await deleteAccount();
      // Best-effort: this device stops listening too, but leaving matters more.
      await revokePushOnSignOut().catch(() => undefined);
      client.clear();
      // A fresh page, so nothing of the account stays in memory: no cached figure, no profile.
      window.location.replace(`${BASENAME}/signup`);
    } catch (error) {
      if (isApiError(error, 'REAUTH_REQUIRED')) {
        setReauth(true);
        setProblem(
          'For safety, sign in again first — then come back here to finish deleting your account.',
        );
      } else {
        setProblem(failureSentence(error));
      }
      setConfirming(false);
      setDeleting(false);
    }
  };

  // A stale sign-in cannot reach the login screen while signed in, so signing in again starts by
  // signing out — then the person signs in fresh and comes back here.
  const logInAgain = async () => {
    if (leaving) return;
    setLeaving(true);
    setProblem(undefined);
    try {
      await revokePushOnSignOut().catch(() => undefined);
      await signOut();
      client.clear();
      window.location.replace(`${BASENAME}/login`);
    } catch (error) {
      setProblem(failureSentence(error));
      setLeaving(false);
    }
  };

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/account" className={styles.iconButton} aria-label="Back to Account">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>Delete account</h1>
        <span className={styles.spacer} />
      </div>

      <div className={styles.body}>
        <Card>
          <div className={styles.copy}>
            <h2 className={styles.dangerTitle}>This erases everything</h2>
            <p className={styles.text}>
              Your holdings, value history, types, tags, audit log and agent connections are deleted
              within <strong>{ERASED_WITHIN_DAYS} days</strong>, and immediately stop being readable
              by any connected agent.
            </p>
            <p className={styles.text}>
              Export first if you want a copy — we will not keep one for you.
            </p>
            {confirming ? (
              <div className={styles.confirm}>
                <p className={styles.confirmText}>Delete your account and everything in it?</p>
                <div className={styles.actions}>
                  <Button aria-disabled={deleting || undefined} onClick={() => void remove()}>
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirming(false)}>
                    Keep my account
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <Link to="/account/export" className={buttonClass('outlined')}>
                  Export first
                </Link>
                <Button variant="quiet" onClick={() => setConfirming(true)}>
                  Delete my account
                </Button>
              </div>
            )}
          </div>
        </Card>
        {problem ? (
          <FormProblem>
            {problem}{' '}
            {reauth ? (
              <button
                type="button"
                className={styles.reauthLink}
                aria-disabled={leaving || undefined}
                onClick={() => void logInAgain()}
              >
                Log in again
              </button>
            ) : null}
          </FormProblem>
        ) : null}
      </div>
    </>
  );
}
