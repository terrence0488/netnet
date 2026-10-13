import type { RenderedEmail, RenderedPush } from '../channel';
import type { MessageOf } from '../message';
import { renderLayout } from './layout';
import type { RenderContext } from './render-context';

/**
 * The comeback reminder (PRD J12, architecture §7.10): the wording is the PRD's, verbatim. The
 * push carries the title "NetNet" with the line and, when an agent is connected, "Just ask
 * {agent}."; the email uses the line as its subject, with one **Open NetNet** button to
 * `/app/?r=‹token›`, the footer and a one-click unsubscribe. `agentName` arrives vetted by the run
 * (the guide's name, or a short plain registered name); the line is left out when it is absent.
 * Never an amount, a total, or a holding, type or tag name (N9).
 */

/** The PRD's line, word for word. */
export const COMEBACK_LINE = 'Your net worth is due for an update.';

/** Where **Open NetNet** and a push tap go: Home, carrying the reminder's token. */
export const REMINDER_OPEN_PATH = '/app/';

/** The page the footer's unsubscribe link opens: it posts the token once it loads. */
export const UNSUBSCRIBE_PAGE = '/app/reminders/unsubscribe';

function askLine(agentName: string | undefined): string {
  return agentName === undefined ? '' : ` Just ask ${agentName}.`;
}

function tokenOf(ctx: RenderContext): string {
  if (ctx.token === undefined || ctx.token === '') {
    throw new Error('reminder.comeback needs its signed token.');
  }
  return ctx.token;
}

/** The push notification: title "NetNet", the line, and where a tap goes. */
export function comebackPush(
  msg: MessageOf<'reminder.comeback'>,
  ctx: RenderContext,
): RenderedPush {
  return {
    title: 'NetNet',
    body: `${COMEBACK_LINE}${askLine(msg.agentName)}`,
    url: `${ctx.origin}${REMINDER_OPEN_PATH}?r=${encodeURIComponent(tokenOf(ctx))}`,
  };
}

/** The email: the line as its subject, one button, the footer and a one-click unsubscribe. */
export function comebackEmail(
  msg: MessageOf<'reminder.comeback'>,
  ctx: RenderContext,
): RenderedEmail {
  const token = encodeURIComponent(tokenOf(ctx));
  const unsubscribeUrl = `${ctx.origin}/api/reminders/unsubscribe?token=${token}`;
  return {
    subject: COMEBACK_LINE,
    ...renderLayout({
      line: COMEBACK_LINE,
      ...(msg.agentName === undefined ? {} : { detail: `Just ask ${msg.agentName}.` }),
      button: {
        label: 'Open NetNet',
        url: `${ctx.origin}${REMINDER_OPEN_PATH}?r=${token}`,
      },
      footer: 'You’re getting this because you haven’t checked NetNet in a while.',
      footerLink: {
        lead: 'To stop these emails,',
        label: 'unsubscribe',
        url: `${ctx.origin}${UNSUBSCRIBE_PAGE}?token=${token}`,
      },
    }),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
