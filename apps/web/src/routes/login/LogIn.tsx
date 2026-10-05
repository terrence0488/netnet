import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { refreshMe } from '../../api/account';
import { isAuthError, looksLikeEmail, signIn } from '../../api/auth';
import { handoffOf } from '../../app/handoff';
import {
  AuthFoot,
  AuthForm,
  AuthFrame,
  Button,
  FormProblem,
  PasswordField,
  TextField,
  authStyles,
} from '../../components';
import { COPY, failureSentence } from '../../components/auth-copy';

const NOTICES = {
  existing: 'You already have an account. Log in instead.',
  reset: 'Your password is changed. Log in with the new one.',
} as const;

/**
 * Log in. A returning person resumes onboarding if they had not finished it, and otherwise goes
 * straight to Home, or back to the screen that sent them here (PRD J1): the signed-out guard does
 * that once the profile is fetched.
 */
export function LogIn() {
  const location = useLocation();
  const client = useQueryClient();
  const handoff = handoffOf(location.state);
  const [email, setEmail] = useState(handoff.email ?? '');
  const [password, setPassword] = useState('');
  const [emailProblem, setEmailProblem] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const address = email.trim();
    setProblem(undefined);
    if (!looksLikeEmail(address)) {
      setEmailProblem(COPY.emailMissing);
      return;
    }
    if (password === '') {
      setProblem('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(address, password);
      await refreshMe(client);
    } catch (error) {
      setProblem(
        isAuthError(error, 'WRONG_PASSWORD')
          ? 'That email and password don’t match. Try again, or reset your password.'
          : failureSentence(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Log in" sub={handoff.notice ? NOTICES[handoff.notice] : undefined}>
      <AuthForm onSubmit={() => void submit()}>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          value={email}
          error={emailProblem}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailProblem(undefined);
          }}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={busy ? true : undefined}>
          Log in
        </Button>
      </AuthForm>
      <AuthFoot>
        <Link
          to={`/forgot${location.search}`}
          state={{ email: email.trim() }}
          className={authStyles.link}
        >
          Forgot password?
        </Link>
        <p>
          New to NetNet?{' '}
          <Link to={`/signup${location.search}`} className={authStyles.link}>
            Create an account
          </Link>
        </p>
      </AuthFoot>
    </AuthFrame>
  );
}
