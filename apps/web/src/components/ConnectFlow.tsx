import {
  OTHER_GUIDE,
  agentClientSchema,
  type AgentClient,
  type AgentGuide,
  type Attempt,
  type AttemptInput,
} from '@netnet/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { meQuery, useMe, useUpdateMe } from '../api/account';
import { trackClient } from '../api/events';
import { Waiting } from '../app/guards';
import {
  CONNECTIONS_KEY,
  attemptQuery,
  useAgentGuides,
  useStartAttempt,
} from '../routes/agent/queries';
import { failureSentence } from './auth-copy';
import {
  AuthFrame,
  Button,
  ErrorState,
  FormProblem,
  ResendLink,
  authStyles,
  buttonClass,
} from './index';
import { AgentLogo, contentImageUrl, type ConnectEntry } from './ConnectButton';
import { cx } from './cx';
import styles from './ConnectFlow.module.css';

/**
 * The one connect flow for every entry (PRD J5): choose the agent, verify the email first when it
 * is unverified, follow the steps for this platform, and watch NetNet move on by itself once the
 * agent is approved. Entries are `agent` (the tab), `home` (the empty Home) and `onboarding` (the
 * start screen, whose route ends on Home); `holding` joins with its own task. Back returns step
 * by step to where it began.
 */

/** The flow's `entry` query, as the API takes it; anything else is the Agent tab's. */
export function parseEntry(value: string | null): ConnectEntry {
  if (value === 'home' || value === 'onboarding') return value;
  return 'agent';
}

/** Where the flow began: where Back finally returns (Done goes onward, not back). */
export function entryPath(entry: ConnectEntry): string {
  if (entry === 'home') return '/';
  if (entry === 'onboarding') return '/onboarding/start';
  return '/agent';
}

/** This platform, as the prototype detects it: a coarse pointer on a narrow screen is a phone. */
export function detectPlatform(): 'phone' | 'computer' {
  try {
    if (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900) return 'phone';
  } catch {
    // No window (the server), or no matchMedia: the computer steps.
  }
  return 'computer';
}

/** The connector URL the person pastes: the app's own origin plus `/mcp` (architecture §7.1). */
export function connectorUrl(origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/mcp`;
}

/** Copies text, falling back to the selection where the clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An old browser, or no permission: try the selection instead.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** A guide id the API accepts as the attempt's client, or null when it accepts none. */
export function parseGuideClient(id: string): AgentClient | null {
  const parsed = agentClientSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

/** Step text with its `**bold**` runs (the guides' one markup, as the prototype renders it). */
export function stepText(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
  );
}

/**
 * The step the connector address box follows: the one that names the connector address, or -1,
 * and then the box follows the steps.
 */
export function findAddressStep(steps: readonly { text: string }[]): number {
  return steps.findIndex((step) => step.text.toLowerCase().includes('connector address'));
}

/** Why an attempt failed, in plain language with a next step; never a raw error (PRD J5). */
export function failureCopy(cause: Attempt['cause']): { title: string; detail: string } {
  switch (cause) {
    case 'cancelled':
      return {
        title: 'The connection was cancelled.',
        detail: 'You pressed Cancel on the approval page. Try again whenever you’re ready.',
      };
    case 'invalid_request':
      return {
        title: 'Your agent’s request wasn’t accepted.',
        detail:
          'NetNet couldn’t verify it. Check the connector’s settings in your agent, then try again.',
      };
    case 'token_rejected':
      return {
        title: 'Your agent couldn’t finish signing in.',
        detail:
          'Its code wasn’t accepted. Start the connection again from your agent, then try again here.',
      };
    case 'timed_out':
      return {
        title: 'This step took too long.',
        detail: 'Nothing was connected. Each step stays open for 15 minutes — try again.',
      };
    case undefined:
      return {
        title: 'The connection failed.',
        detail: 'Nothing was connected. Try again.',
      };
  }
}

function flowTitle(guide: AgentGuide): string {
  return guide.id === OTHER_GUIDE ? 'Connect your agent' : `Connect ${guide.name}`;
}

function ChooseAgent({ entry, guides }: { entry: ConnectEntry; guides: readonly AgentGuide[] }) {
  const offered = guides.filter((guide) => parseGuideClient(guide.id) !== null);
  return (
    <AuthFrame
      title="Which AI agent do you use?"
      titleId="choose-agent"
      back={{ to: entryPath(entry) }}
    >
      {offered.length === 0 ? (
        <p className={authStyles.body}>No agents are available right now. Try again later.</p>
      ) : (
        <div role="group" aria-labelledby="choose-agent" className={styles.choose}>
          {offered.map((guide) => (
            <Link
              key={guide.id}
              to={`/agent/connect/${guide.id}?entry=${entry}`}
              className={styles.row}
            >
              <AgentLogo guide={guide} />
              <span className={styles.rowName}>{guide.name}</span>
              <span aria-hidden="true" className={styles.chev}>
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </AuthFrame>
  );
}

/** Unverified → verify first, with resend, and the flow carries on by itself once verified (J5). */
function VerifyGate({ entry, email }: { entry: ConnectEntry; email: string }) {
  useQuery({ ...meQuery, refetchInterval: 2000 });
  return (
    <AuthFrame title="Verify your email first" back={{ to: `/agent/connect?entry=${entry}` }}>
      <p className={authStyles.body}>
        We sent a link to {email}. Open it on any device, and this page moves on by itself.
      </p>
      <p className={authStyles.body}>
        <ResendLink email={email} />
      </p>
    </AuthFrame>
  );
}

/** One step's screenshot in its frame, or a neutral placeholder, never a broken image (F11). */
function Shot({ image }: { image: string | undefined }) {
  const [missing, setMissing] = useState(false);
  const show = image !== undefined && !missing;
  return (
    <figure className={cx(styles.shot, !show && styles.missing)}>
      {show ? (
        <img src={contentImageUrl(image)} alt="" loading="lazy" onError={() => setMissing(true)} />
      ) : (
        <figcaption>Screenshot coming soon</figcaption>
      )}
    </figure>
  );
}

/** The connector address in its dashed mono box, with Copy (design-system §6, Prompt card). */
function ConnectorAddress() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await copyText(connectorUrl()))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={styles.urlbox}>
      <span className={styles.url}>{connectorUrl()}</span>
      <Button variant="quiet" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function Steps({
  entry,
  guide,
  client,
}: {
  entry: ConnectEntry;
  guide: AgentGuide;
  client: AgentClient;
}) {
  const generic = guide.id === OTHER_GUIDE;
  const [platform, setPlatform] = useState<'phone' | 'computer'>(detectPlatform);
  const shown = generic ? 'any' : platform;
  const steps = guide.platforms[shown]?.steps ?? [];
  const addressAt = findAddressStep(steps);
  const back = { to: `/agent/connect?entry=${entry}` };

  // The attempt, started once (and once more per Retry): the screen polls it below.
  const start = useStartAttempt();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const input = useRef<AttemptInput | null>(null);
  if (input.current === null) {
    input.current = { client, entry, platform: generic ? 'any' : platform };
  }
  const started = useRef(false);
  useEffect(() => {
    const body = input.current;
    if (started.current || body === null) return;
    started.current = true;
    start.mutate(body, {
      onSuccess: (attempt) => {
        setAttemptId(attempt.id);
        void trackClient('agent_connection_started', { client, entry });
      },
    });
  }, [round, start, client, entry]);
  const retry = () => {
    setAttemptId(null);
    start.reset();
    started.current = false;
    setRound((now) => now + 1);
  };

  const attempt = useQuery({
    ...attemptQuery(attemptId ?? 'pending'),
    enabled: attemptId !== null,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === undefined || state === 'started' ? 2000 : false;
    },
  });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (attempt.data !== undefined && attempt.data.state !== 'started') {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    }
  }, [attempt.data, queryClient]);

  const state = attemptId === null ? null : (attempt.data?.state ?? null);
  const failed = state === 'failed' ? failureCopy(attempt.data?.cause) : null;

  return (
    <AuthFrame title={flowTitle(guide)} back={back}>
      {generic ? (
        <p className={authStyles.body}>
          Any agent that can add a remote MCP server with sign-in (OAuth) can connect to NetNet.
        </p>
      ) : (
        <div role="group" aria-label="Setup steps for" className={styles.platform}>
          {(['phone', 'computer'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={platform === choice}
              onClick={() => setPlatform(choice)}
              className={cx(styles.platformButton, platform === choice && styles.platformOn)}
            >
              {choice === 'phone' ? 'On a phone' : 'On a computer'}
            </button>
          ))}
        </div>
      )}
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={index} className={styles.step}>
            <p className={styles.stepText}>{stepText(step.text)}</p>
            {index === addressAt ? <ConnectorAddress /> : null}
            {generic ? null : <Shot image={step.image} />}
          </li>
        ))}
      </ol>
      {addressAt === -1 ? <ConnectorAddress /> : null}
      <div className={styles.status}>
        {start.isError && attemptId === null ? (
          <ErrorState
            title="The connection couldn’t start."
            detail="Nothing was started. Try again."
            onRetry={retry}
          />
        ) : attemptId === null ? (
          <Waiting />
        ) : attempt.isError ? (
          <ErrorState error={attempt.error} onRetry={() => void attempt.refetch()} />
        ) : failed ? (
          <ErrorState title={failed.title} detail={failed.detail} onRetry={retry} />
        ) : state === 'approved' || state === 'live' ? (
          <section aria-label="Connected" className={styles.done}>
            <h2 className={styles.doneTitle}>
              {generic ? 'Your agent is connected.' : `${guide.name} is connected.`}
            </h2>
            {entry === 'onboarding' ? (
              <OnboardingDone />
            ) : (
              <>
                <p className={styles.doneBody}>
                  {entry === 'home'
                    ? 'It can see your NetNet now. Head back to add what you have, or ask it to.'
                    : 'It can see your NetNet now. You can revoke it here any time.'}
                </p>
                <Link to={entryPath(entry)} className={buttonClass('primary')}>
                  {entry === 'home' ? 'Back to Home' : 'Back to the Agent tab'}
                </Link>
              </>
            )}
          </section>
        ) : (
          <p role="status" className={styles.waiting}>
            Waiting for {generic ? 'your agent' : guide.name}. This page moves on by itself once you
            press Allow.
          </p>
        )}
      </div>
    </AuthFrame>
  );
}

/**
 * The onboarding route's end: once connected, onboarding is done and Home — blank — is next,
 * with no waiting state. The button marks it done before going, so the guards let Home open.
 */
function OnboardingDone() {
  const navigate = useNavigate();
  const { mutate, isPending } = useUpdateMe();
  const [problem, setProblem] = useState<string>();
  const goHome = () => {
    if (isPending) return;
    setProblem(undefined);
    mutate(
      { onboardingState: 'done' },
      {
        onSuccess: () => void navigate('/', { replace: true }),
        onError: (error) => setProblem(failureSentence(error)),
      },
    );
  };
  return (
    <>
      <p className={styles.doneBody}>It can see your NetNet now.</p>
      {problem ? <FormProblem>{problem}</FormProblem> : null}
      <Button onClick={goHome} aria-disabled={isPending ? true : undefined}>
        Continue to Home
      </Button>
    </>
  );
}

function GuideSteps({
  entry,
  guide,
  client,
}: {
  entry: ConnectEntry;
  guide: AgentGuide;
  client: AgentClient;
}) {
  const me = useMe();
  const back = { to: `/agent/connect?entry=${entry}` };
  if (me.data === undefined) {
    if (me.isError) {
      return (
        <AuthFrame title={flowTitle(guide)} back={back}>
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        </AuthFrame>
      );
    }
    return (
      <AuthFrame title={flowTitle(guide)} back={back}>
        <Waiting />
      </AuthFrame>
    );
  }
  // The guard holds signed-out visitors at log-in; this is unreachable, typed honestly.
  if (me.data === null) return <Navigate to="/login" replace />;
  if (!me.data.emailVerified) return <VerifyGate entry={entry} email={me.data.email} />;
  return <Steps entry={entry} guide={guide} client={client} />;
}

export function ConnectFlow({ entry, client }: { entry: ConnectEntry; client: string | null }) {
  const guides = useAgentGuides();
  const home = { to: entryPath(entry) };
  if (guides.isPending) {
    return (
      <AuthFrame title="Connect your agent" back={home}>
        <Waiting />
      </AuthFrame>
    );
  }
  if (guides.isError) {
    return (
      <AuthFrame title="Connect your agent" back={home}>
        <ErrorState error={guides.error} onRetry={() => void guides.refetch()} />
      </AuthFrame>
    );
  }
  const guide = client === null ? undefined : guides.data.find((offered) => offered.id === client);
  const parsed = guide === undefined ? null : parseGuideClient(guide.id);
  // An agent that is not offered, even by its address: the list instead (PRD J5).
  if (guide === undefined || parsed === null) {
    return <ChooseAgent entry={entry} guides={guides.data} />;
  }
  return <GuideSteps entry={entry} guide={guide} client={parsed} />;
}
