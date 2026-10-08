import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { isSocialProvider, looksLikeEmail, PROVIDER_NAMES } from '../../api/auth';
import { trackClient } from '../../api/events';
import { handoffOf } from '../../app/handoff';
import {
  AuthFoot,
  AuthForm,
  AuthFrame,
  Button,
  FormProblem,
  ProviderButtons,
  TextField,
  authStyles,
} from '../../components';
import { COPY, providerUnfinished } from '../../components/auth-copy';

/**
 * Create your account (PRD J1): a way in and nothing else. Every question before the account
 * exists costs sign-ups, so this asks for a provider, or an email and then a password on the
 * next screen.
 */
export function SignUp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const handoff = handoffOf(location.state);
  const [email, setEmail] = useState(handoff.email ?? '');
  const [problem, setProblem] = useState(handoff.problem);
  // A provider round trip that came back with `?error=`: cancelled, refused or failed midway.
  const [failed, setFailed] = useState<string | undefined>(() => {
    if (params.get('error') === null) return undefined;
    const provider = params.get('provider');
    return providerUnfinished(isSocialProvider(provider) ? PROVIDER_NAMES[provider] : undefined);
  });

  const submit = () => {
    setFailed(undefined);
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setProblem(COPY.emailMissing);
      return;
    }
    // Before the account exists, so the funnel counts every start (PRD §3.5).
    void trackClient('signup_started', { method: 'email' });
    void navigate(`/signup/password${location.search}`, { state: { email: address } });
  };

  return (
    <AuthFrame title="Create your account">
      <ProviderButtons
        mode="signup"
        screen="/signup"
        search={location.search}
        onProblem={setFailed}
      />
      <AuthForm onSubmit={submit}>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          value={email}
          error={problem}
          onChange={(event) => {
            setEmail(event.target.value);
            setProblem(undefined);
          }}
        />
        {failed ? <FormProblem>{failed}</FormProblem> : null}
        <Button type="submit" block>
          Continue with email
        </Button>
      </AuthForm>
      <AuthFoot>
        <p>
          Already have an account?{' '}
          <Link to={`/login${location.search}`} className={authStyles.link}>
            Log in
          </Link>
        </p>
      </AuthFoot>
    </AuthFrame>
  );
}
