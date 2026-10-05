import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  json,
  ledgerApp,
  onboarded,
  typeIdOf,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * The analytics events REST writes fire (architecture §5.1, §7.7): `holding_created {source: web,
 * via}`, `value_recorded {source: web}` and `value_corrected`, written after the response with the
 * person's segment. Nothing else fires, a refused write fires nothing, and no event carries an
 * amount (CONVENTIONS §6).
 */
let db: TestDatabase;
let target: LedgerApp;
let p: Person;
let cashType: string;

/** Every amount this suite sends, in major and minor units: none may reach an event. */
const AMOUNTS = ['4321.09', '432109', '5678.12', '567812', '6789.5', '678950', '9876', '987600'];

interface StoredEvent {
  name: string;
  user_id: string | null;
  segment: string;
  props: Record<string, unknown>;
  app_version: string;
}

/**
 * The events written, by name. One write's events are inserted at once on separate connections, so
 * their row order is not theirs: they share one `at`, and nothing reads them in order.
 */
async function events(): Promise<StoredEvent[]> {
  const { rows } = await db.owner.query<StoredEvent>(
    'select name, user_id, segment, props, app_version from analytics.event order by id',
  );
  return rows.sort((x, y) => x.name.localeCompare(y.name));
}

/** The events the request handed to `waitUntil`, once written. */
async function firedBy(request: () => Promise<Response>, status = 200): Promise<StoredEvent[]> {
  await target.settle();
  await db.owner.query('truncate analytics.event');
  const res = await request();
  expect(res.status, await res.clone().text()).toBe(status);
  await target.settle();
  return events();
}

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  p = await onboarded(target);
  await json(await p.patch('/api/me', { segment: 'accumulating' }));
  cashType = await typeIdOf(p, 'cash');
}, 60_000);

beforeEach(async () => {
  await target.settle();
});

afterAll(async () => {
  target?.restore();
  await db?.close();
});

const ctx = () => ({ user_id: p.userId, segment: 'accumulating', app_version: 'test123' });

describe('events from REST writes', () => {
  it('holding_created {source: web, via} and value_recorded for its opening value', async () => {
    const fired = await firedBy(() =>
      p.post('/api/holdings', {
        name: 'Emergency fund',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        opening: { amount: '4321.09', date: '2026-07-01' },
        via: 'guided',
      }),
    );
    expect(fired).toStrictEqual([
      { name: 'holding_created', props: { source: 'web', via: 'guided' }, ...ctx() },
      { name: 'value_recorded', props: { source: 'web' }, ...ctx() },
    ]);
    const formed = await firedBy(() =>
      p.post('/api/holdings', {
        name: 'Second pot',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        via: 'form',
      }),
    );
    expect(formed).toStrictEqual([
      { name: 'holding_created', props: { source: 'web', via: 'form' }, ...ctx() },
    ]);
  });

  it('value_recorded for a new value, value_corrected for a replacement or a correction', async () => {
    const holding = await json<WriteBody<{ id: string }>>(
      await p.post('/api/holdings', {
        name: 'Spending money',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        via: 'form',
      }),
    );
    const path = `/api/holdings/${holding.result.id}/values`;
    expect(
      await firedBy(() => p.post(path, { amount: '5678.12', date: '2026-07-15' })),
    ).toStrictEqual([{ name: 'value_recorded', props: { source: 'web' }, ...ctx() }]);
    expect(
      await firedBy(() => p.post(path, { amount: '6789.5', date: '2026-07-15' })),
    ).toStrictEqual([
      {
        name: 'value_corrected',
        props: { original_source: 'web', age_at_correction: 0 },
        ...ctx(),
      },
    ]);
    const { rows } = await db.owner.query<{ id: string }>(
      'select id from ledger.value where holding_id = $1',
      [holding.result.id],
    );
    const valueId = rows[0]?.id ?? '';
    expect(
      await firedBy(() => p.patch(`/api/values/${valueId}`, { amount: '9876' })),
    ).toStrictEqual([
      {
        name: 'value_corrected',
        props: { original_source: 'web', age_at_correction: 0 },
        ...ctx(),
      },
    ]);
  });

  it('hands the events to waitUntil: they are written after the response', async () => {
    await target.settle();
    const res = await p.post('/api/holdings', {
      name: 'Later pot',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      via: 'form',
    });
    expect(res.status).toBe(200);
    expect(target.waits.pending).toBeGreaterThan(0);
    await target.settle();
  });

  it('fires nothing for taxonomy, prefs and deletes, or for a refused write', async () => {
    const tag = await json<WriteBody<{ id: string }>>(await p.post('/api/tags', { name: 'Quiet' }));
    const holding = await json<WriteBody<{ id: string }>>(
      await p.post('/api/holdings', {
        name: 'Quiet pot',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        via: 'form',
      }),
    );
    const quiet: [() => Promise<Response>, number][] = [
      [() => p.post('/api/types', { name: 'Quiet type', universal: 'other' }), 200],
      [() => p.patch(`/api/tags/${tag.result.id}`, { name: 'Quieter' }), 200],
      [() => p.patch('/api/prefs', { sort: 'name' }), 200],
      [() => p.patch(`/api/holdings/${holding.result.id}`, { name: 'Renamed pot' }), 200],
      [() => p.post(`/api/holdings/${holding.result.id}/values`, { amount: '1.001' }), 400],
      [
        () =>
          p.post('/api/holdings', {
            name: 'Renamed pot',
            kind: 'asset',
            typeId: cashType,
            currency: 'EUR',
            via: 'form',
          }),
        409,
      ],
      [() => p.delete(`/api/holdings/${holding.result.id}`), 200],
      [() => p.delete(`/api/tags/${tag.result.id}`), 200],
    ];
    for (const [request, status] of quiet) {
      expect(await firedBy(request, status)).toStrictEqual([]);
    }
  });
});

describe('privacy', () => {
  it('no event carries an amount', async () => {
    // Replay every amount-bearing write, keeping the events this time.
    await target.settle();
    await db.owner.query('truncate analytics.event');
    const holding = await json<WriteBody<{ id: string }>>(
      await p.post('/api/holdings', {
        name: 'Privacy pot',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        opening: { amount: '4321.09', date: '2026-06-01' },
        via: 'guided',
      }),
    );
    const path = `/api/holdings/${holding.result.id}/values`;
    const value = await json<WriteBody<{ id: string }>>(
      await p.post(path, { amount: '5678.12', date: '2026-07-01' }),
    );
    await json(await p.post(path, { amount: '6789.5', date: '2026-07-01' }));
    await json(await p.patch(`/api/values/${value.result.id}`, { amount: '9876' }));
    await target.settle();

    const fired = await events();
    expect(fired.map((e) => e.name)).toStrictEqual([
      'holding_created',
      'value_corrected',
      'value_corrected',
      'value_recorded',
      'value_recorded',
    ]);
    for (const event of fired) {
      const text = JSON.stringify(event);
      for (const amount of AMOUNTS) expect(text, event.name).not.toContain(amount);
      for (const [key, prop] of Object.entries(event.props)) {
        expect(key).not.toMatch(/amount|minor|value|balance|total|name/);
        if (typeof prop === 'number') expect(key).toBe('age_at_correction');
      }
    }
  });
});
