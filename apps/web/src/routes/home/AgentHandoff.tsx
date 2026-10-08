import type { AgentConnection, AgentGuide } from '@netnet/contracts';
import { Button, PromptCard, Spinner, useAgentConnections, useCopy } from '../../components';
import { buttonClass } from '../../components/Button';
import { guideFor, useAgentGuides } from '../agent/queries';
import { prefillHref } from './prompts';
import styles from './AgentHandoff.module.css';

/**
 * What Home hands the next step to (PRD J5): the person's first connected agent, with its guide.
 * The guide's `prefillUrl` decides prefill-vs-Copy per client (§7.8): where the client supports
 * it, the prompt opens in the agent; where not, it is copied. Without a guide (or when guides
 * fail to load), Copy is the safe fallback.
 */

export type HandoffAgent =
  | { readonly status: 'pending' }
  | { readonly status: 'none' }
  | {
      readonly status: 'ready';
      readonly connection: AgentConnection;
      readonly guide: AgentGuide | null;
    };

export function useAgentHandoff(): HandoffAgent {
  const connections = useAgentConnections();
  const guides = useAgentGuides();
  if (connections.isPending || guides.isPending) return { status: 'pending' };
  const [first] = connections.data ?? [];
  if (connections.isError || !first) return { status: 'none' };
  return {
    status: 'ready',
    connection: first,
    guide: guides.data ? guideFor(guides.data, first.client) : null,
  };
}

/**
 * A prompt to take to the connected agent: prefill where the client supports it, Copy where not
 * — never both. The screen's alternative (add it yourself, connect) sits with the caller.
 */
export function HandoffPrompt({
  prompt,
  guide,
}: {
  readonly prompt: string;
  readonly guide: AgentGuide | null;
}) {
  const { copied, failed, copy } = useCopy();
  const prefill = guide?.prefillUrl ? prefillHref(guide.prefillUrl, prompt) : null;
  return (
    <div className={styles.handoff}>
      <PromptCard text={prompt} copyInside={prefill === null} />
      {prefill !== null && guide !== null ? (
        <a
          className={buttonClass('primary', true)}
          href={prefill}
          target="_blank"
          rel="noreferrer"
          data-testid="handoff-prefill"
        >
          Open in {guide.name}
        </a>
      ) : (
        <Button block onClick={() => copy(prompt)} data-testid="handoff-copy">
          {copied ? 'Copied' : 'Copy the prompt'}
        </Button>
      )}
      {failed ? (
        <p role="status" className={styles.failed}>
          Copying didn’t work. Select the text to copy it.
        </p>
      ) : null}
    </div>
  );
}

/** The handoff still loading its agent: a centred spinner in the handoff's place. */
export function HandoffWaiting() {
  return (
    <div className={styles.center}>
      <Spinner />
    </div>
  );
}
