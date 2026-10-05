import { describe, expect, it } from 'vitest';
import {
  agentConnectionSchema,
  approvalDecisionSchema,
  approvalResultSchema,
  approvalSchema,
  attemptInputSchema,
  attemptSchema,
  MAX_APPROVAL_QUERY_LENGTH,
} from './agent';

describe('attemptInputSchema', () => {
  it('accepts a guide, an entry and a platform', () => {
    expect(
      attemptInputSchema.parse({ client: 'claude', entry: 'onboarding', platform: 'phone' }),
    ).toStrictEqual({ client: 'claude', entry: 'onboarding', platform: 'phone' });
    expect(
      attemptInputSchema.safeParse({ client: 'other', entry: 'agent', platform: 'any' }).success,
    ).toBe(true);
  });

  it.each([
    [{ client: 'grok', entry: 'home', platform: 'phone' }],
    [{ client: 'claude', entry: 'settings', platform: 'phone' }],
    [{ client: 'claude', entry: 'home', platform: 'tablet' }],
    [{ client: 'claude', entry: 'home' }],
    [{ client: 'claude', entry: 'home', platform: 'phone', userId: 'usr_x' }],
    ['claude'],
  ])('refuses %j', (input) => {
    expect(attemptInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('attemptSchema', () => {
  it('has failedStep and cause only when there are some', () => {
    expect(attemptSchema.safeParse({ id: 'att_1', state: 'started' }).success).toBe(true);
    expect(
      attemptSchema.safeParse({
        id: 'att_1',
        state: 'failed',
        failedStep: 'first_call',
        cause: 'timed_out',
      }).success,
    ).toBe(true);
    expect(attemptSchema.safeParse({ id: 'att_1', state: 'waiting' }).success).toBe(false);
    expect(
      attemptSchema.safeParse({ id: 'att_1', state: 'failed', failedStep: 'token' }).success,
    ).toBe(false);
    expect(
      attemptSchema.safeParse({ id: 'att_1', state: 'failed', cause: 'unknown' }).success,
    ).toBe(false);
  });
});

describe('agentConnectionSchema', () => {
  const connection = {
    id: 'con_1',
    clientName: 'Claude',
    client: 'claude',
    registration: 'cimd',
    nameVerified: true,
    createdAt: '2026-08-01T10:00:00.000Z',
    lastUsedAt: null,
  };

  it('accepts a connection as the Agent tab lists it', () => {
    expect(agentConnectionSchema.parse(connection)).toStrictEqual(connection);
  });

  it.each([
    [{ ...connection, client: 'Claude' }],
    [{ ...connection, registration: 'manual' }],
    [{ ...connection, createdAt: 'yesterday' }],
    [{ ...connection, revokedAt: null }],
  ])('refuses %j', (input) => {
    expect(agentConnectionSchema.safeParse(input).success).toBe(false);
  });
});

describe('the approval', () => {
  it('reads who is asking', () => {
    const view = {
      clientName: 'Fictional agent',
      registration: 'dcr',
      nameVerified: false,
      client: 'other',
      host: 'agent.example',
      scopes: ['ledger.read'],
    };
    expect(approvalSchema.parse(view)).toStrictEqual(view);
    expect(approvalSchema.safeParse({ ...view, client: 'fictional' }).success).toBe(false);
  });

  it('takes Allow or Cancel with the page’s query, and answers with a URL', () => {
    expect(approvalDecisionSchema.parse({ accept: true, query: 'sig=x' })).toStrictEqual({
      accept: true,
      query: 'sig=x',
    });
    for (const input of [
      { accept: 'yes', query: 'sig=x' },
      { accept: true, query: '' },
      { accept: true, query: 'x'.repeat(MAX_APPROVAL_QUERY_LENGTH + 1) },
      { accept: true },
      { accept: false, query: 'sig=x', connectionId: 'con_1' },
    ]) {
      expect(approvalDecisionSchema.safeParse(input).success).toBe(false);
    }
    expect(approvalResultSchema.safeParse({ url: 'https://claude.ai/cb?code=x' }).success).toBe(
      true,
    );
    expect(approvalResultSchema.safeParse({}).success).toBe(false);
  });
});
