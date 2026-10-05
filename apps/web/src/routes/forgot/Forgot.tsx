import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { looksLikeEmail, requestPasswordReset } from '../../api/auth';
import { handoffOf } from '../../app/handoff';
import {
  AuthFoot,
  AuthForm,
  AuthFrame,
  Button,
  FormProblem,
  TextField,
  authStyles,
} from '../../components';
import { COPY, failureSentence } from '../../components/auth-copy';

/**
 * Forgot password: a link by email to choose a new one. What follows never says whether the
 * address has an account (architecture §8): the server answers the same either way, and so does
 * this screen.
 */
export function Forgot() {
  const location = useLocation();
  const handoff = handoffOf(location.state);
  const [email, setEmail] = useState(handoff.email ?? '');
  const [emailProblem, setEmailProblem] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const login = { to: `/login${location.search}`, state: { email: email.trim() } };

  const submit = async () => {
    if (busy) return;
    const address = email.trim();
    setProblem(undefined);
    if (!looksLikeEmail(address)) {
      setEmailProblem(COPY.emailMissing);
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
    } catch (error) {
      setProblem(failureSentence(error));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthFrame title="Check your email" back={login}>
        <p className={authStyles.body} role="status">
          If there’s an account for <b className={authStyles.strong}>{sentTo}</b>, a link to choose
          a new password is on its way. It works once, for an hour.
        </p>
        <AuthFoot>
          <Link to={login.to} state={login.state} className={authStyles.link}>
            Back to log in
          </Link>
        </AuthFoot>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Reset your password"
      sub="We’ll email you a link to choose a new one."
      back={login}
    >
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
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={busy ? true : undefined}>
          Send the link
        </Button>
      </AuthForm>
    </AuthFrame>
  );
}
