import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ME_KEY, refreshMe } from '../../api/account';
import { isAuthError, resetPassword } from '../../api/auth';
import {
  AuthForm,
  AuthFrame,
  Button,
  FormProblem,
  PasswordField,
  authStyles,
  buttonClass,
} from '../../components';
import { COPY, failureSentence, passwordProblem } from '../../components/auth-copy';

/**
 * Where the reset email's link lands (`?token=…`, or `?error=…` when the link has expired or was
 * used). A new password ends every session, so the person logs in again with it.
 */
export function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const token = params.get('error') ? null : params.get('token');
  const [password, setPassword] = useState('');
  const [fieldProblem, setFieldProblem] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!token);

  if (expired || !token) {
    return (
      <AuthFrame title="This link doesn’t work any more">
        <p className={authStyles.body}>Reset links work once, for an hour. Ask for a new one.</p>
        <div className={authStyles.actions}>
          <Link to="/forgot" className={buttonClass('primary', true)}>
            Ask for a new link
          </Link>
        </div>
      </AuthFrame>
    );
  }

  const submit = async () => {
    if (busy) return;
    const tooWeak = passwordProblem(password);
    setFieldProblem(tooWeak);
    setProblem(undefined);
    if (tooWeak) return;
    setBusy(true);
    try {
      await resetPassword(token, password);
      // Every session of the account has ended, perhaps this browser's: nothing cached may linger,
      // and who is signed in here is asked again.
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
      await refreshMe(client).catch(() => client.setQueryData(ME_KEY, null));
      void navigate('/login', { replace: true, state: { notice: 'reset' } });
    } catch (error) {
      if (isAuthError(error, 'INVALID_TOKEN')) setExpired(true);
      else if (
        isAuthError(error, 'PASSWORD_TOO_SHORT') ||
        isAuthError(error, 'PASSWORD_TOO_LONG')
      ) {
        setFieldProblem(failureSentence(error));
      } else setProblem(failureSentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Choose a new password">
      <AuthForm onSubmit={() => void submit()}>
        <PasswordField
          label="New password"
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
          Save the new password
        </Button>
      </AuthForm>
    </AuthFrame>
  );
}
