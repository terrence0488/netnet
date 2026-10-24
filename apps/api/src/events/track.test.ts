import { SEGMENTS as CONTRACT_SEGMENTS, type EventProps, type Segment } from '@netnet/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRow, EventStore } from '../db/analytics';
import { SEGMENTS as PROFILE_SEGMENTS } from '../db/schema';
import { appVersion } from './app-version';
import { createTrack, type Track } from './track';

const NOW = new Date(Date.UTC(2026, 7, 1, 10));
const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const NEW_USER = 'usr_01K1G4KX00CCCCCCCCCCCCCCCC';

let rows: EventRow[];
/** Which insert wrote each row: the account's, or the plain one. */
let via: ('account' | 'plain')[];
let lookups: string[];
let failWrites: boolean;
let logged: string[];
let track: Track;

function fakeStore(segments: Record<string, Segment>): EventStore {
  return {
    segmentOf: (userId) => {
      lookups.push(userId);
      return Promise.resolve(segments[userId] ?? 'unknown');
    },
    insert: (row) => write(row, 'plain'),
    insertForAccount: (row) => write(row, 'account'),
  };
}

function write(row: EventRow, by: 'account' | 'plain'): Promise<void> {
  if (failWrites) return Promise.reject(new Error('connection terminated'));
  rows.push(row);
  via.push(by);
  return Promise.resolve();
}

beforeEach(() => {
  rows = [];
  via = [];
  lookups = [];
  failWrites = false;
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  track = createTrack(() => ({ store: fakeStore({ [USER]: 'accumulating' }), clock: () => NOW }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const ctx = { appVersion: 'abc1234' };

describe('track()', () => {
  it('writes the event with the user, their segment from the profile, the version and the time', async () => {
    await track('value_recorded', { source: 'web' }, { ...ctx, userId: USER });
    expect(rows).toStrictEqual([
      {
        name: 'value_recorded',
        at: NOW,
        userId: USER,
        segment: 'accumulating',
        props: { source: 'web' },
        appVersion: 'abc1234',
      },
    ]);
    expect(lookups).toStrictEqual([USER]);
  });

  it('uses the segment the caller already has, without a lookup', async () => {
    await track(
      'insights_viewed',
      { view: 'yearly' },
      { ...ctx, userId: USER, segment: 'established' },
    );
    expect(rows[0]?.segment).toBe('established');
    expect(lookups).toStrictEqual([]);
  });

  it('carries unknown before onboarding, and without a user', async () => {
    await track('session_started', {}, { ...ctx, userId: NEW_USER });
    await track('signup_started', { method: 'email' }, ctx);
    expect(rows.map((r) => [r.userId, r.segment])).toStrictEqual([
      [NEW_USER, 'unknown'],
      [null, 'unknown'],
    ]);
  });

  it('writes a verified user’s event only while their account exists, any other as it is', async () => {
    await track('session_started', {}, { ...ctx, userId: USER });
    await track('signup_started', { method: 'email' }, ctx);
    // The id a deletion re-keyed to is no account's: its event goes in as it is.
    await track('account_deleted', {}, { ...ctx, rekeyedUserId: NEW_USER, segment: 'established' });
    await track('account_deleted', {}, { ...ctx, rekeyedUserId: NEW_USER });
    expect(via).toStrictEqual(['account', 'plain', 'plain', 'plain']);
    expect(rows.map((r) => [r.userId, r.segment])).toStrictEqual([
      [USER, 'accumulating'],
      [null, 'unknown'],
      [NEW_USER, 'established'],
      [NEW_USER, 'unknown'],
    ]);
    // No profile is looked up for the re-keyed id: there is none.
    expect(lookups).toStrictEqual([USER]);
  });

  it('takes the time of the call, not of the write', async () => {
    let now = NOW;
    const later = createTrack(() => ({ store: fakeStore({}), clock: () => now }));
    const pending = later('account_deleted', {}, { ...ctx, userId: USER });
    now = new Date(NOW.getTime() + 5_000);
    await pending;
    expect(rows[0]?.at).toStrictEqual(NOW);
  });

  describe('outside production', () => {
    it('throws at the call on an unknown name, and writes nothing', () => {
      expect(() =>
        track('balance_viewed' as 'session_started', {}, { ...ctx, userId: USER }),
      ).toThrow(/unknown event name/);
      expect(rows).toStrictEqual([]);
    });

    it('rejects extra props, naming the prop and never its value', () => {
      const props = { source: 'web', amount: 1200 } as EventProps<'value_recorded'>;
      expect(() => track('value_recorded', props, { ...ctx, userId: USER })).toThrow(
        'track(): value_recorded props rejected: (props): unrecognized_keys',
      );
      expect(rows).toStrictEqual([]);
    });

    it('rejects a value outside its enum or its bounds, and a missing prop', () => {
      const bad: [string, object][] = [
        ['signup_started', { method: 'Savings at Example Bank' }],
        ['value_corrected', { original_source: 'agent', age_at_correction: 2.5 }],
        ['value_corrected', { original_source: 'agent', age_at_correction: -1 }],
        ['insights_viewed', {}],
        ['holding_created', { source: 'agent', via: 'form' }],
      ];
      for (const [name, props] of bad) {
        expect(() => track(name as 'insights_viewed', props as never, ctx)).toThrow(
          /props rejected/,
        );
      }
      expect(rows).toStrictEqual([]);
    });

    it('rejects a malformed context: a user id that is not one, an unknown segment, free text as the version', () => {
      expect(() => track('session_started', {}, { ...ctx, userId: 'someone@example.com' })).toThrow(
        /userId/,
      );
      expect(() =>
        track('session_started', {}, { ...ctx, userId: USER, segment: 'rich' as Segment }),
      ).toThrow(/segment/);
      expect(() => track('session_started', {}, { appVersion: 'build of My Savings' })).toThrow(
        /appVersion/,
      );
      expect(() => track('account_deleted', {}, { ...ctx, rekeyedUserId: 'nobody' })).toThrow(
        /rekeyedUserId/,
      );
      expect(() =>
        track('account_deleted', {}, { ...ctx, userId: USER, rekeyedUserId: NEW_USER }),
      ).toThrow(/cannot both be set/);
      expect(rows).toStrictEqual([]);
    });
  });

  describe('in production', () => {
    beforeEach(() => vi.stubEnv('VERCEL_ENV', 'production'));

    it('logs and drops an invalid event, without its props', async () => {
      const props = { source: 'web', amount: 1200 } as EventProps<'value_recorded'>;
      await expect(track('value_recorded', props, { ...ctx, userId: USER })).resolves.toBe(
        undefined,
      );
      expect(rows).toStrictEqual([]);
      expect(logged.map((line) => JSON.parse(line) as unknown)).toStrictEqual([
        { event: 'event_rejected', userId: USER, errorCode: 'VALIDATION_FAILED' },
      ]);
      expect(logged.join('\n')).not.toContain('1200');
    });

    it('drops an unknown name the same way', async () => {
      await track('net_worth_shared' as 'session_started', {}, ctx);
      expect(rows).toStrictEqual([]);
      expect(logged.join('\n')).not.toContain('net_worth_shared');
    });
  });

  it('never rejects when the write fails: it logs, and what the person was doing goes on', async () => {
    failWrites = true;
    await expect(track('session_started', {}, { ...ctx, userId: USER })).resolves.toBe(undefined);
    expect(logged.map((line) => JSON.parse(line) as unknown)).toStrictEqual([
      { event: 'event_write_failed', userId: USER, errorCode: 'INTERNAL' },
    ]);
  });

  it('never rejects when there is no database to write to', async () => {
    const unconnected = createTrack(() => {
      throw new Error('DATABASE_URL is not set');
    });
    await expect(unconnected('session_started', {}, ctx)).resolves.toBe(undefined);
    expect(logged).toHaveLength(1);
  });
});

describe('segments', () => {
  it('are the same in the contract and in core.profile', () => {
    expect([...CONTRACT_SEGMENTS]).toStrictEqual([...PROFILE_SEGMENTS]);
  });
});

describe('appVersion()', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is the deployed commit, shortened, or dev', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '0123456789abcdef0123456789abcdef01234567');
    expect(appVersion()).toBe('0123456');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    expect(appVersion()).toBe('dev');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'not a sha');
    expect(appVersion()).toBe('dev');
  });
});
