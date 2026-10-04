import { border, color, font, radius, type } from '@netnet/tokens';

/**
 * NetNet's email (design-system "Email"): a card with the edge outline, the wordmark, one line in
 * the display face, at most one short line beneath, at most one button, then a footer above a rule
 * saying why it was sent. The subject repeats the line. Inline styles from the tokens, because
 * mail clients drop style sheets; the light theme, because most ignore dark-mode CSS.
 */
export interface EmailParts {
  /** The one line, which is also the subject. */
  line: string;
  /** At most one sentence beneath it. */
  detail?: string;
  /** The button, and a few words that may lead into it ("Not you?"). */
  button: { label: string; url: string; lead?: string };
  /** Why this was sent. */
  footer: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML, attributes included. Every value put in an email goes through it. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const ink = color.light;
const stack = (name: keyof typeof font) =>
  font[name].map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ');

function style(rules: Record<string, string | number>): string {
  return Object.entries(rules)
    .map(([key, value]) => `${key}:${typeof value === 'number' ? `${value}px` : value}`)
    .join(';');
}

export function renderLayout(parts: EmailParts): { html: string; text: string } {
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${e(parts.line)}</title>
</head>
<body style="${style({ margin: 0, padding: '24px 12px', background: ink.paper })}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${style({
    'max-width': 480,
    background: ink.card,
    border: `${border.edge}px solid ${ink.edge}`,
    'border-radius': radius.card,
  })}"><tr><td style="${style({ padding: '24px 22px', 'font-family': stack('text'), color: ink.ink })}">
<p style="${style({
    margin: 0,
    'font-family': stack('display'),
    'font-weight': type.wordmark.weight,
    'font-size': type['heading-screen'].size,
    color: ink.ink,
  })}">NetNet</p>
<h1 style="${style({
    margin: '18px 0 0',
    'font-family': stack('display'),
    'font-weight': type['heading-screen'].weight,
    'font-size': type['heading-screen'].size,
    'line-height': '1.25',
    color: ink.ink,
  })}">${e(parts.line)}</h1>
${
  parts.detail === undefined
    ? ''
    : `<p style="${style({
        margin: '8px 0 0',
        'font-size': type['body-sm'].size,
        'line-height': '1.5',
        color: ink['ink-2'],
      })}">${e(parts.detail)}</p>\n`
}<p style="${style({ margin: '22px 0 0' })}">${
    parts.button.lead === undefined ? '' : `${e(parts.button.lead)} `
  }<a href="${e(parts.button.url)}" style="${style({
    display: 'inline-block',
    background: ink.brand,
    color: ink['brand-on'],
    'font-weight': type.button.weight,
    'font-size': type.button.size,
    'text-decoration': 'none',
    padding: '12px 20px',
    border: `${border.edge}px solid ${ink.edge}`,
    'border-radius': radius.control,
  })}">${e(parts.button.label)}</a></p>
<p style="${style({
    margin: '24px 0 0',
    'padding-top': 12,
    'border-top': `${border.rule}px solid ${ink.rule}`,
    'font-size': type.meta.size,
    'line-height': '1.5',
    color: ink['ink-3'],
  })}">${e(parts.footer)}</p>
</td></tr></table>
</td></tr></table>
</body>
</html>
`;
  const text = [
    parts.line,
    ...(parts.detail === undefined ? [] : [parts.detail]),
    `${parts.button.lead === undefined ? '' : `${parts.button.lead} `}${parts.button.label}: ${parts.button.url}`,
    parts.footer,
  ].join('\n\n');
  return { html, text: `${text}\n` };
}
