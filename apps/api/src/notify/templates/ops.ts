import { border, color, font, radius, type } from '@netnet/tokens';
import type { RenderedEmail } from '../channel';
import { healthAlertLines } from '../health-alert';
import type { MessageOf } from '../message';
import { escapeHtml } from './layout';

/**
 * The Founder's health alert (architecture §7.10, §9.3, §9.4): one line per trigger, with its
 * figure and the action to take. It is not a person-facing message — no account, no name, no
 * button — so it uses a plain list rather than the one-line layout the other emails share. Every
 * value comes from a typed message, and the layout escapes each line.
 */

const ink = color.light;
const stack = (name: keyof typeof font) =>
  font[name].map((family) => (family.includes(' ') ? `'${family}'` : family)).join(', ');

function style(rules: Record<string, string | number>): string {
  return Object.entries(rules)
    .map(([key, value]) => `${key}:${typeof value === 'number' ? `${value}px` : value}`)
    .join(';');
}

export function healthAlert(msg: MessageOf<'ops.health_alert'>): RenderedEmail {
  const subject = msg.test
    ? 'NetNet health: test'
    : `NetNet health: ${msg.triggers.length} to act on`;
  const lines = healthAlertLines(msg.triggers, msg.figures);
  const items = lines.length === 0 ? ['Nothing fired.'] : lines;
  const intro = msg.test
    ? 'This is a test of the daily health check. It sends one email when a limit or a figure needs attention.'
    : 'The daily health check found these to act on.';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(subject)}</title>
</head>
<body style="${style({ margin: 0, padding: '24px 12px', background: ink.paper })}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style({
    'max-width': 560,
    background: ink.card,
    'border-radius': radius.card,
  })}"><tr><td style="${style({ padding: '24px 22px', 'font-family': stack('text'), color: ink.ink })}">
<h1 style="${style({
    margin: 0,
    'font-family': stack('display'),
    'font-weight': type['heading-screen'].weight,
    'font-size': type['heading-screen'].size,
    color: ink.ink,
  })}">${escapeHtml(subject)}</h1>
<p style="${style({
    margin: '12px 0 0',
    'font-size': type['body-sm'].size,
    'line-height': 1.5,
    color: ink['ink-2'],
  })}">${escapeHtml(intro)}</p>
<ul style="${style({
    margin: '16px 0 0',
    padding: '0 0 0 18px',
    'font-size': type['body-sm'].size,
    'line-height': 1.6,
    color: ink.ink,
  })}">
${items.map((line) => `<li style="${style({ margin: '0 0 8px' })}">${escapeHtml(line)}</li>`).join('\n')}
</ul>
<p style="${style({
    margin: '24px 0 0',
    'padding-top': 12,
    'border-top': `${border.rule}px solid ${ink.rule}`,
    'font-size': type.meta.size,
    'line-height': 1.5,
    color: ink['ink-3'],
  })}">Sent by the daily health check. Counts, sizes and percentages only; no account data.</p>
</td></tr></table>
</td></tr></table>
</body>
</html>
`;

  const text = `${[
    subject,
    '',
    intro,
    ...items.map((line) => `- ${line}`),
    '',
    'Sent by the daily health check. Counts, sizes and percentages only; no account data.',
  ].join('\n')}\n`;

  return { subject, html, text, headers: {} };
}
