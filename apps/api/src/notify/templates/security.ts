import { cleanAgentName, EMAIL_NAME_LENGTH } from '../../auth/agent-name';
import type { RenderedEmail } from '../channel';
import type { MessageOf } from '../message';
import { renderLayout } from './layout';
import type { RenderContext } from './render-context';

/**
 * The security email (PRD J5, architecture §7.10): which agent was connected and when, what it may
 * do, and "Not you? Revoke it" to the Agent tab. Sent on every Allow, by email only; it cannot be
 * turned off. The agent's name is the one it registered with, which is untrusted: cleaned and cut
 * to 40 characters here, escaped by the layout, and for a name NetNet cannot verify (every DCR
 * client and every CIMD document at a host no named guide matches), followed by the caveat the
 * approval page shows. The CIMD document's host is named when the connection has one.
 */

/** Where "Revoke it" goes: the web app's Agent tab. */
export const AGENT_TAB = '/app/agent';

/** What follows a name NetNet cannot verify, as on the approval page. */
export const UNVERIFIED_NAME = '(the name it gave; NetNet can’t verify it)';

const FALLBACK = 'An agent';

/** "5 Aug 2026" and "5:32 am" for `instant` in `timeZone`, or in UTC if the zone is unknown. */
export function dayAndTime(instant: string, timeZone: string): { day: string; time: string } {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) throw new Error('connectedAt is not an instant.');
  const format = (zone: string) => {
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(at);
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(at)
      .replace(/\s/g, ' ')
      .replace(/ ([AP])M$/, (_match, half: string) => ` ${half.toLowerCase()}m`);
    return { day: day.replace(/\s/g, ' '), time };
  };
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

export function agentConnected(
  msg: MessageOf<'security.agent_connected'>,
  { origin }: RenderContext,
): RenderedEmail {
  const name = cleanAgentName(msg.agentName, EMAIL_NAME_LENGTH);
  const named = name === '' ? FALLBACK : name;
  const inSentence = name === '' ? FALLBACK.toLowerCase() : name;
  const line = `${named}${msg.nameVerified ? '' : ` ${UNVERIFIED_NAME}`} was connected to your NetNet`;
  const fromHost = msg.host === undefined ? '' : `; requests come from ${msg.host}`;
  const { day, time } = dayAndTime(msg.connectedAt, msg.timeZone);
  return {
    subject: line,
    ...renderLayout({
      line,
      detail:
        `On ${day} at ${time}, you allowed ${inSentence} to see your holdings and their history, ` +
        `and to add or update them${fromHost}.`,
      button: { lead: 'Not you?', label: 'Revoke it', url: `${origin}${AGENT_TAB}` },
      footer: 'We send this every time an agent is connected. It can’t be turned off.',
    }),
    headers: {},
  };
}
