import { describe, expect, it } from 'vitest';
import { reminderAgentName } from './reminders';

describe('reminderAgentName()', () => {
  it('names the guide for a named agent, and nothing when no guide is published', () => {
    expect(reminderAgentName('claude', 'anything it registered', 'Claude')).toBe('Claude');
    expect(reminderAgentName('chatgpt', 'anything it registered', 'ChatGPT')).toBe('ChatGPT');
    expect(reminderAgentName('claude', 'Claude', undefined)).toBeUndefined();
  });

  it('names another agent only when its registered name is short and plain', () => {
    expect(reminderAgentName('other', 'My agent 2.0', undefined)).toBe('My agent 2.0');
    expect(reminderAgentName('other', 'a'.repeat(24), undefined)).toBe('a'.repeat(24));
    for (const unshowable of [
      '',
      'a'.repeat(25),
      'Codex; rm -rf ~',
      'Agent\nTwo',
      'Code\u202ex',
      '<b>bold</b>',
      'Café',
    ]) {
      expect(reminderAgentName('other', unshowable, undefined)).toBeUndefined();
    }
  });
});
