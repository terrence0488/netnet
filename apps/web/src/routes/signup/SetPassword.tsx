import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { refreshMe } from '../../api/account';
import { isAuthError, signUp } from '../../api/auth';
import { handoffOf } from '../../app/handoff';
import { AuthForm, AuthFrame, Button, FormProblem, PasswordField } from '../../components';
import { COPY, failureSentence, passwordProblem } from '../../components/auth-copy';

/**
 * Set a password, then the account exists and the person is signed in at once; the verification
 * email goes out and nothing waits for it (PRD J1). Onboarding follows: once the profile is
 * fetched, the signed-out guard sends the person on.
 */
export function SetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { email } = handoffOf(location.state);
  const [password, setPassword] = useState('');
  const [fieldProblem, setFieldProblem] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The account may exist while the profile failed to load: then only the profile is asked again.
  const created = useRef(false);

  if (!email) return <Navigate to={`/signup${location.search}`} replace />;

  const submit = async () => {
    if (busy) return;
    const tooWeak = created.current ? undefined : passwordProblem(password);
    setFieldProblem(tooWeak);
    setProblem(undefined);
    if (tooWeak) return;
    setBusy(true);
    try {
      if (!created.current) {
        await signUp(email, password);
        created.current = true;
      }
      await refreshMe(client);
    } catch (error) {
      if (isAuthError(error, 'EXISTING_EMAIL')) {
        void navigate(`/login${location.search}`, { state: { email, notice: 'existing' } });
      } else if (isAuthError(error, 'INVALID_EMAIL')) {
        void navigate(`/signup${location.search}`, {
          state: { email, problem: COPY.emailMissing },
        });
      } else if (
        isAuthError(error, 'PASSWORD_TOO_SHORT') ||
        isAuthError(error, 'PASSWORD_TOO_LONG')
      ) {
        setFieldProblem(failureSentence(error));
      } else {
        setProblem(failureSentence(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Set a password"
      sub={`For ${email}`}
      back={{ to: `/signup${location.search}`, state: { email } }}
    >
      <AuthForm onSubmit={() => void submit()}>
        {/* For password managers, which save a password with the address it belongs to. */}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          value={password}
          hint={COPY.passwordHint}
          error={fieldProblem}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldProblem(undefined);
          }}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={busy ? true : undefined}>
          Create account
        </Button>
      </AuthForm>
    </AuthFrame>
  );
}
