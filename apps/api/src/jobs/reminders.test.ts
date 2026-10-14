import { describe, expect, it } from 'vitest';
import { privacyProblems } from '../notify/privacy';
import { renderPush } from '../notify/templates';
import { reminderAgentName } from './reminders';

const ORIGIN = 'https://netnet.example';
const TOKEN = 'r1.c29tZS1wYXlsb2Fk.c29tZS1zaWduYXR1cmU';

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

  it('leaves the line out when the name reads as money, so no notify() message trips the privacy test', () => {
    for (const moneyLike of ['USD5', 'EUR 10', '10 pounds', '5 dollars']) {
      expect(reminderAgentName('other', moneyLike, undefined)).toBeUndefined();
    }
    for (const vetted of ['My agent 2.0', 'Agent 007', 'Bob']) {
      const name = reminderAgentName('other', vetted, undefined);
      expect(name).toBe(vetted);
      const push = renderPush(
        { kind: 'reminder.comeback', agentName: name },
        { origin: ORIGIN, token: TOKEN },
      );
      expect(privacyProblems({ ...push }, [])).toEqual([]);
    }
  });
});
