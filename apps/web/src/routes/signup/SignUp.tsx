import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { looksLikeEmail } from '../../api/auth';
import { trackClient } from '../../api/events';
import { handoffOf } from '../../app/handoff';
import { AuthFoot, AuthForm, AuthFrame, Button, TextField, authStyles } from '../../components';
import { COPY } from '../../components/auth-copy';

/**
 * Create your account (PRD J1): a way in and nothing else. Every question before the account
 * exists costs sign-ups, so this asks for an email, then a password on the next screen. Google
 * and Apple (P2) join this screen above the email.
 */
export function SignUp() {
  const location = useLocation();
  const navigate = useNavigate();
  const handoff = handoffOf(location.state);
  const [email, setEmail] = useState(handoff.email ?? '');
  const [problem, setProblem] = useState(handoff.problem);

  const submit = () => {
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
