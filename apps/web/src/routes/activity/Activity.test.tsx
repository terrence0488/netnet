import {
  UNIVERSALS,
  type AuditEntry,
  type Page,
  type ProfileView,
  type Snapshot,
  type VersionedPack,
} from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { ACTIVITY_KEY } from '../../api/activity';
import { snapshotKey } from '../../api/snapshot';
import { BASENAME, routes } from '../../app/routes';
import { formatDate } from '../../components/dates';
import { packDocQuery } from '../../components/packs';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

const EMPTY_PACK = {
  examples: {},
  meaning: {},
  cadenceDays: {},
  defaults: {},
  questions: {},
  checklist: [],
};

/**
 * The person's fictional chain: an imaginary country that adds the pack type `auto_loan`, then
 * generic, which labels every universal type "Label <universal>".
 */
const CHAIN: VersionedPack[] = [
  {
    ...EMPTY_PACK,
    id: 'qz',
    version: 2,
    locale: 'en-GB',
    currency: 'EUR',
    labels: {},
    types: [{ key: 'auto_loan', u: 'loan', label: 'Auto loan' }],
  },
  {
    ...EMPTY_PACK,
    id: 'generic',
    version: 1,
    locale: null,
    currency: null,
    labels: Object.fromEntries(UNIVERSALS.map((u) => [u, `Label ${u}`])),
    types: [],
  },
];

const SNAPSHOT: Snapshot = {
  dataVersion: 1,
  baseCurrency: 'SGD',
  packRef: CHAIN.map((pack) => ({ key: pack.id, version: pack.version })),
  prefs: {},
  types: [],
  tags: [],
  holdings: [],
  values: {},
};

let made = 0;

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  made += 1;
  return {
    id: `aud_test_${made}`,
    at: '2026-10-12T13:14:00.000Z',
    actor: 'user',
    clientName: null,
    connectionId: null,
    batchId: null,
    action: 'update',
    entity: 'value',
    entityId: `val_test_${made}`,
    before: { amountMinor: 5_000_000, currency: 'SGD' },
    after: { amountMinor: 6_750_000, currency: 'SGD' },
    summary: 'Updated the value for 2026-10-12',
    ...over,
  };
}

/**
 * Renders the Activity screen with the person signed in, and their snapshot, pack chain and the
 * log's pages already known.
 */
function render(pages: Page<AuditEntry>[]): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, PERSON);
  client.setQueryData(snapshotKey(null), SNAPSHOT);
  for (const pack of CHAIN) client.setQueryData(packDocQuery(pack.id, pack.version).queryKey, pack);
  client.setQueryData(ACTIVITY_KEY, {
    pages,
    pageParams: pages.map(() => undefined),
  });
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/activity'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

const TURN = [
  entry({
    id: 'aud_new',
    actor: 'agent',
    clientName: 'Claude',
    batchId: 'bat_1',
    summary: 'Recorded a value for 2026-10-12',
  }),
  entry({
    id: 'aud_old',
    actor: 'agent',
    clientName: 'Claude',
    batchId: 'bat_1',
    summary: 'Updated the value for 2026-10-11',
  }),
];

describe('the Activity screen', () => {
  it('lists newest first, grouped by agent turn, and offers nothing that changes data', () => {
    const markup = render([
      { items: [...TURN, entry({ id: 'aud_web', summary: 'Added “Cash”' })], nextCursor: null },
    ]);
    expect(markup).toContain('Activity');
    expect(markup.indexOf(`Recorded a value for ${formatDate('2026-10-12')}`)).toBeLessThan(
      markup.indexOf(`Updated the value for ${formatDate('2026-10-11')}`),
    );
    expect(markup).toContain('Claude');
    expect(markup).toContain('2 changes at once');
    expect(markup).not.toMatch(/undo/i);
  });

  it('shows old → new, who did it and when', () => {
    const markup = render([{ items: [entry({ id: 'aud_1' })], nextCursor: null }]);
    expect(markup).toContain('→');
    expect(markup).toContain('SGD');
    expect(markup).toContain('You');
    expect(markup).toMatch(/2026/);
  });

  it('reads a revocation with the disconnected agent and the time', () => {
    const markup = render([
      {
        items: [
          entry({
            id: 'aud_revoke',
            entity: 'connection',
            action: 'create',
            entityId: 'con_1',
            clientName: 'Claude',
            before: null,
            after: { clientName: 'Claude' },
            summary: 'Agent disconnected',
          }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup).toContain('Agent disconnected');
    expect(markup).toContain('Claude');
  });

  it('reads a former undo entry as the change it made, old → new', () => {
    const markup = render([
      {
        items: [
          entry({
            id: 'aud_former_undo',
            entity: 'holding',
            entityId: 'hld_1',
            before: { name: 'Everyday money' },
            after: { name: 'Spending money' },
            summary: 'Updated "Spending money"',
          }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup).toContain('Updated &quot;Spending money&quot;');
    expect(markup).toContain('“Everyday money” → “Spending money”');
    expect(markup).toContain('You');
    expect(markup).not.toMatch(/undo/i);
  });

  it('reads a default-currency change as one row, and an earlier change entry by entry', () => {
    const markup = render([
      {
        items: [
          entry({
            id: 'aud_currency',
            actor: 'system',
            entity: 'ledger',
            entityId: 'usr_1',
            before: { baseCurrency: 'SGD' },
            after: { baseCurrency: 'USD', valuesRederived: 12 },
            summary: 'Changed the default currency SGD → USD',
          }),
          // An earlier change, as it was logged then: the ledger and each value it re-derived.
          entry({
            id: 'aud_earlier',
            at: '2026-10-01T09:00:00.000Z',
            actor: 'system',
            entity: 'ledger',
            entityId: 'usr_1',
            before: { baseCurrency: 'USD' },
            after: { baseCurrency: 'SGD' },
            summary: 'Changed the default currency USD → SGD',
          }),
          entry({
            id: 'aud_earlier_value',
            at: '2026-10-01T09:00:00.000Z',
            actor: 'system',
            before: { amountMinor: 2_370_000, currency: 'SGD' },
            after: { amountMinor: 2_370_000, currency: 'SGD' },
            summary: 'Updated the value for 2026-09-30',
          }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup.match(/Changed the default currency SGD → USD/g)).toHaveLength(1);
    expect(markup).toContain('12 values recalculated');
    expect(markup).toContain('NetNet');
    expect(markup).not.toContain('changes at once');
    expect(markup).toContain('Changed the default currency USD → SGD');
    expect(markup).toContain(`Updated the value for ${formatDate('2026-09-30')}`);
    expect(markup).toMatch(/23,700\S* → \S*23,700 SGD/);
  });

  it('reads a value’s date as the screen’s other dates, never as the agent’s YYYY-MM-DD', () => {
    const markup = render([
      {
        items: [
          entry({
            id: 'aud_value',
            action: 'create',
            before: null,
            after: { amountMinor: 120_000, currency: 'SGD', date: '2026-05-20' },
            summary: 'Recorded a value for 2026-05-20',
          }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup).toContain(`Recorded a value for ${formatDate('2026-05-20')}`);
    expect(markup).not.toContain('2026-05-20');
  });

  it('names a renamed type by its label in the chain, both sides', () => {
    const side = (packTypeKey: string | null, customName: string | null) => ({
      id: 'typ_1',
      universal: 'loan',
      packTypeKey,
      customName,
      sort: 12,
      archived: false,
    });
    const markup = render([
      {
        items: [
          entry({
            id: 'aud_pack_type',
            entity: 'type',
            entityId: 'typ_1',
            before: side('auto_loan', null),
            after: side('auto_loan', 'My car'),
            summary: 'Renamed type to "My car"',
          }),
          entry({
            id: 'aud_plain_type',
            entity: 'type',
            entityId: 'typ_2',
            before: { ...side(null, null), id: 'typ_2', universal: 'listed' },
            after: { ...side(null, 'Shares'), id: 'typ_2', universal: 'listed' },
            summary: 'Renamed type to "Shares"',
          }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup).toContain('Renamed type to &quot;My car&quot;');
    expect(markup).toContain('“Auto loan” → “My car”');
    expect(markup).toContain('“Label listed” → “Shares”');
    expect(markup).not.toContain('auto_loan');
    expect(markup).not.toMatch(/“listed”/);
  });

  it('leaves a lone turn entry without a turn header', () => {
    const markup = render([
      { items: [entry({ id: 'aud_1', batchId: 'bat_1' })], nextCursor: null },
    ]);
    expect(markup).not.toContain('changes at once');
    expect(markup).toContain(`Updated the value for ${formatDate('2026-10-12')}`);
  });

  it('escapes the name the agent wrote under', () => {
    const markup = render([
      {
        items: [
          entry({ id: 'aud_1', actor: 'agent', clientName: '<img src=x>', batchId: 'bat_1' }),
          entry({ id: 'aud_2', actor: 'agent', clientName: '<img src=x>', batchId: 'bat_1' }),
        ],
        nextCursor: null,
      },
    ]);
    expect(markup).toContain('&lt;img src=x&gt;');
    expect(markup).not.toContain('<img src=x>');
  });

  it('offers older changes while the log has another page', () => {
    const markup = render([{ items: [entry({ id: 'aud_1' })], nextCursor: 'cursor_1' }]);
    expect(markup).toContain('Show older changes');
  });

  it('says when nothing has changed yet, with the way back', () => {
    const markup = render([{ items: [], nextCursor: null }]);
    expect(markup).toContain('Nothing has changed yet.');
    expect(markup).toContain('Back to Home');
  });
});
