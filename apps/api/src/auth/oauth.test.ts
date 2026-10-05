import { describe, expect, it } from 'vitest';
import { agentScope } from './oauth';

describe('agentScope', () => {
  it.each([
    // No scope named: what the metadata advertises.
    [null, 'ledger.read ledger.write offline_access'],
    ['ledger.read', 'ledger.read'],
    // OpenAI's Codex: the identity scopes go, the agent scopes come with the person's Allow.
    ['openid profile email offline_access', 'ledger.read ledger.write openid offline_access'],
    ['ledger.read ledger.write openid profile email', 'ledger.read ledger.write openid'],
    ['email email profile', 'ledger.read ledger.write'],
    // A scope NetNet does not know is passed on, for the library to refuse.
    ['ledger.read everything', 'ledger.read everything'],
  ])('%s → %s', (requested, granted) => {
    expect(agentScope(requested)).toBe(granted);
  });
});
