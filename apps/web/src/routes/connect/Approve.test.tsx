import type { ApprovalRequest, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { BASENAME, routes } from '../../app/routes';
import { consentAbilities, ledgerScopes } from './Approve';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

const QUERY = 'client_id=x&scope=a&sig=y';

const APPROVAL: ApprovalRequest = {
  clientName: 'Fictional agent',
  registration: 'dcr',
  nameVerified: false,
  client: 'other',
  host: 'agent.example',
  scopes: ['ledger.read', 'ledger.write', 'offline_access'],
};

/** Renders the approval page with the person and the approval already known. */
function render(approval: ApprovalRequest | undefined, me: ProfileView | null = PERSON): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, me);
  if (approval !== undefined) client.setQueryData(['agent', 'approval', QUERY], approval);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: [`/app/connect/approve?${QUERY}`],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('ledgerScopes', () => {
  it('shows only the ledger scopes', () => {
    expect(ledgerScopes(['ledger.read', 'ledger.write', 'openid', 'offline_access'])).toStrictEqual(
      ['ledger.read', 'ledger.write'],
    );
    expect(ledgerScopes([])).toStrictEqual([]);
  });
});

describe('consentAbilities', () => {
  it('joins the abilities as a person would say them, read first', () => {
    expect(consentAbilities(['ledger.write', 'ledger.read'])).toBe(
      'see your holdings and their history, and add or update them.',
    );
    expect(consentAbilities(['ledger.read'])).toBe('see your holdings and their history.');
    expect(consentAbilities(['ledger.write'])).toBe('add or update them.');
    expect(consentAbilities([])).toBe('connect to NetNet.');
  });
});

describe('the approval page', () => {
  it('names who is asking, with the host, the DCR caveat, and what each ledger scope allows', () => {
    const markup = render(APPROVAL);
    expect(markup).toContain('Fictional agent wants to connect to your NetNet');
    expect(markup).toContain('Requests come from agent.example');
    expect(markup).toContain('Signed in as avery@example.com');
    expect(markup).toContain('NetNet can’t verify this name');
    expect(markup).toContain(
      'It will be able to see your holdings and their history, and add or update them.',
    );
    expect(markup).not.toContain('offline_access');
    expect(markup).toContain('>Allow<');
    expect(markup).toContain('>Cancel<');
  });

  it('shows a CIMD document’s host and marks its self-chosen name unverified (M-2)', () => {
    const markup = render({
      ...APPROVAL,
      clientName: 'Claude',
      registration: 'cimd',
      nameVerified: false,
      client: 'other',
      host: 'attacker.example',
    });
    const titleEnd = markup.indexOf('</h1>');
    const host = markup.indexOf('Requests come from attacker.example');
    expect(titleEnd).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(titleEnd);
    expect(host).toBeLessThan(markup.indexOf('Signed in as avery@example.com'));
    expect(markup).toContain('NetNet can’t verify this name');
  });

  it('shows no caveat for a real Claude client, whose host the claude guide names', () => {
    const markup = render({
      ...APPROVAL,
      clientName: 'Claude',
      registration: 'cimd',
      nameVerified: true,
      client: 'claude',
      host: 'claude.ai',
    });
    expect(markup).toContain('Requests come from claude.ai');
    expect(markup).not.toContain('can’t verify this name');
  });

  it('escapes the name the agent registered with', () => {
    const markup = render({ ...APPROVAL, clientName: '<b>evil</b>' });
    expect(markup).toContain('&lt;b&gt;evil&lt;/b&gt;');
  });

  it('escapes the host, and leaves the line out when there is none', () => {
    expect(render({ ...APPROVAL, host: '<b>evil</b>' })).toContain(
      'Requests come from &lt;b&gt;evil&lt;/b&gt;',
    );
    expect(render({ ...APPROVAL, host: null })).not.toContain('Requests come from');
  });

  it('asks an unverified email to verify first, with resend', () => {
    const markup = render(undefined, { ...PERSON, emailVerified: false });
    expect(markup).toContain('Verify your email first');
    expect(markup).toContain('Resend the link');
  });
});
