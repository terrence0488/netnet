import type { ApprovalRequest } from '@netnet/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { api, isApiError } from '../../api/client';
import { meQuery } from '../../api/account';
import { Waiting } from '../../app/guards';
import {
  AuthFrame,
  Button,
  ErrorState,
  FormProblem,
  ResendLink,
  authStyles,
  errorCopy,
} from '../../components';
import styles from './Approve.module.css';

/**
 * The approval page (architecture §7.6): chrome-less, under `RequireSignedIn`. The agent's client
 * sends the browser here with NetNet's signed copy of its request; the page shows who is asking
 * and for what — the registered name, the host it came from, the caveat unless a named guide's
 * host matched, and only the ledger scopes — and Allow or Cancel sends the browser back to the
 * agent. Signed out → log in, then back. Unverified → verify first. Shown for every new
 * connection: a remembered approval is never used.
 */

/** What each ledger scope lets the agent do, in the consent's words after "will be able to". */
const LEDGER_SCOPES: Readonly<Record<string, string>> = {
  'ledger.read': 'see your holdings and their history',
  'ledger.write': 'add or update them',
};

/** The approval's scopes, ledger only: anything else the agent asked for is not shown. */
export function ledgerScopes(scopes: readonly string[]): string[] {
  return scopes.filter((scope) => scope.startsWith('ledger.'));
}

/** The consent's abilities: read first, joined as a person would say them. */
export function consentAbilities(scopes: readonly string[]): string {
  const abilities = scopes
    .filter((scope) => LEDGER_SCOPES[scope] !== undefined)
    .sort()
    .map((scope) => LEDGER_SCOPES[scope] ?? scope);
  if (abilities.length === 0) return 'connect to NetNet.';
  if (abilities.length === 1) return `${abilities[0]}.`;
  return `${abilities.slice(0, -1).join(', ')}, and ${abilities[abilities.length - 1]}.`;
}

/** Unverified → verify first, with resend, and the approval loads by itself once verified. */
function VerifyFirst({ email }: { email: string }) {
  useQuery({ ...meQuery, refetchInterval: 2000 });
  return (
    <AuthFrame title="Verify your email first">
      <p className={authStyles.body}>
        Your agent is waiting. We sent a link to {email} — open it on any device, and this page
        moves on by itself.
      </p>
      <p className={authStyles.body}>
        <ResendLink email={email} />
      </p>
    </AuthFrame>
  );
}

function Approval({
  approval,
  query,
  email,
}: {
  approval: ApprovalRequest;
  query: string;
  email: string;
}) {
  const decide = useMutation({
    mutationFn: (accept: boolean) =>
      api.post<{ url: string }>('/agent/approval', { accept, query }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
  const problem = decide.isError ? errorCopy(decide.error) : null;
  const scopes = ledgerScopes(approval.scopes);
  const deciding = decide.isPending;

  return (
    <AuthFrame
      title={`${approval.clientName} wants to connect to your NetNet`}
      sub={approval.host === null ? undefined : `Requests come from ${approval.host}`}
    >
      <p className={authStyles.body}>Signed in as {email}</p>
      {approval.nameVerified ? null : (
        <p className={styles.caveat} role="note">
          NetNet can’t verify this name — the agent chose it itself.
        </p>
      )}
      <p className={styles.consent}>
        It will be able to {consentAbilities(scopes)} Every change it makes shows in Activity.
      </p>
      {problem ? (
        <FormProblem>
          {problem.title} {problem.detail}
        </FormProblem>
      ) : null}
      <div className={authStyles.actions}>
        <Button
          variant="primary"
          block
          aria-disabled={deciding ? true : undefined}
          onClick={() => decide.mutate(true)}
        >
          {deciding ? 'Working…' : 'Allow'}
        </Button>
        <Button variant="quiet" onClick={() => decide.mutate(false)}>
          Cancel
        </Button>
      </div>
    </AuthFrame>
  );
}

export function Approve() {
  const location = useLocation();
  const query = location.search.slice(1);
  const me = useQuery(meQuery);
  const approval = useQuery({
    queryKey: ['agent', 'approval', query] as const,
    queryFn: ({ signal }) =>
      api.get<ApprovalRequest>(`/agent/approval?${query}`, signal ? { signal } : {}),
    enabled: query !== '' && me.data?.emailVerified === true,
    retry: false,
    staleTime: 0,
  });
  const retry = () => void approval.refetch();

  if (query === '') {
    return (
      <AuthFrame title="This approval has expired.">
        <p className={authStyles.body}>
          Go back to your agent and start the connection again.{' '}
          <Link to="/agent" className={authStyles.link}>
            Or open the Agent tab.
          </Link>
        </p>
      </AuthFrame>
    );
  }
  if (me.data === undefined) {
    if (me.isError) {
      return (
        <AuthFrame title="Approve the connection">
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        </AuthFrame>
      );
    }
    return (
      <AuthFrame title="Approve the connection">
        <Waiting />
      </AuthFrame>
    );
  }
  // The guard holds signed-out visitors at log-in; this is unreachable, typed honestly.
  if (me.data === null) {
    return (
      <AuthFrame title="Approve the connection">
        <p className={authStyles.body}>
          <Link to="/login" className={authStyles.link}>
            Log in
          </Link>{' '}
          to approve this connection.
        </p>
      </AuthFrame>
    );
  }
  if (!me.data.emailVerified) return <VerifyFirst email={me.data.email} />;
  if (approval.isPending) {
    return (
      <AuthFrame title="Approve the connection">
        <Waiting />
      </AuthFrame>
    );
  }
  if (approval.isError) {
    // An approval NetNet did not sign, or signed over 10 minutes ago: start again at the agent.
    if (isApiError(approval.error, 'VALIDATION_FAILED')) {
      return (
        <AuthFrame title="This approval has expired.">
          <p className={authStyles.body}>
            Go back to your agent and start the connection again.{' '}
            <Link to="/agent" className={authStyles.link}>
              Or open the Agent tab.
            </Link>
          </p>
        </AuthFrame>
      );
    }
    // The agent asked for a fresh sign-in that this session does not satisfy.
    if (isApiError(approval.error, 'REAUTH_REQUIRED')) {
      const next = encodeURIComponent(`${location.pathname}${location.search}`);
      return (
        <AuthFrame title="Sign in again to approve this.">
          <p className={authStyles.body}>
            Your agent asked for a fresh sign-in.{' '}
            <Link to={`/login?next=${next}`} className={authStyles.link}>
              Log in, and you’ll come back here.
            </Link>
          </p>
        </AuthFrame>
      );
    }
    return (
      <AuthFrame title="Approve the connection">
        <ErrorState error={approval.error} onRetry={retry} />
      </AuthFrame>
    );
  }
  return <Approval approval={approval.data} query={query} email={me.data.email} />;
}
