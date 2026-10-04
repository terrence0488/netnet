import type { RenderedEmail } from '../channel';
import type { Message, MessageKind, MessageOf } from '../message';
import { resetPassword, verifyEmail } from './account';
import type { RenderContext } from './render-context';

export type { RenderContext } from './render-context';

type EmailTemplate<K extends MessageKind> = (
  msg: MessageOf<K>,
  ctx: RenderContext,
) => RenderedEmail;

/** Every kind's email template. A kind without one does not compile. */
const EMAIL_TEMPLATES: { [K in MessageKind]: EmailTemplate<K> } = {
  'account.verify_email': verifyEmail,
  'account.reset_password': resetPassword,
};

/** Renders `msg` as an email: `{subject, html, text, headers}` (architecture §7.10). */
export function renderEmail(msg: Message, ctx: RenderContext): RenderedEmail {
  // The map pairs each kind with its own template, which TypeScript cannot follow through a union.
  const template = EMAIL_TEMPLATES[msg.kind] as (m: Message, c: RenderContext) => RenderedEmail;
  return template(msg, ctx);
}
