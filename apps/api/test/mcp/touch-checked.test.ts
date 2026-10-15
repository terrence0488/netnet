import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { touchChecked } from '../../src/db/reminders';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  mcpRequest,
  mcpTestApp,
  onboarded,
  type McpTestApp,
} from './support';

/**
 * Checking NetNet through an agent (PRD J12, architecture §7.10): any MCP `tools/call`, read or
 * write, restarts the person's clock after the response — while `tools/list` and the protocol
 * handshake never do, because clients list tools on their own. The web half is
 * test/reminders/touch.test.ts.
 */
let db: TestDatabase;
let target: McpTestApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = await mcpTestApp(db, {
    touchChecked: (userId) => touchChecked(db.appDb, userId, FIXED_NOW),
  });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function stateOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select last_checked_on::text, next_due_on::text, sent_since_check
     from core.reminder_state where user_id = $1`,
    [userId],
  );
  return rows[0];
}

describe('touchChecked over MCP', () => {
  it('restarts the clock after a tools/call, and never for tools/list', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    await db.owner.query(
      `insert into core.reminder_state (user_id, last_checked_on, next_due_on, sent_since_check)
       values ($1, '2026-06-01', '2026-07-01', 2)`,
      [userId],
    );
    const before = await stateOf(userId);

    const list = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(list.status).toBe(200);
    await target.settle();
    expect(await stateOf(userId)).toEqual(before);

    await callTool(target, agent.token, 'get_taxonomy');
    await target.settle();
    expect(await stateOf(userId)).toMatchObject({
      last_checked_on: '2026-08-01',
      next_due_on: '2026-08-31',
      sent_since_check: 0,
    });
  });
});
