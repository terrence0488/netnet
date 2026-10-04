import { describe, expect, it } from 'vitest';
import { cleanAgentName, EMAIL_NAME_LENGTH, SHOWN_NAME_LENGTH } from './agent-name';

describe('cleanAgentName()', () => {
  it('keeps a plain name as it is', () => {
    expect(cleanAgentName('Claude', EMAIL_NAME_LENGTH)).toBe('Claude');
  });

  it('puts a name on one line, without control or bidi characters', () => {
    expect(cleanAgentName(' Fictional\n\tagent‮\u0007 ', SHOWN_NAME_LENGTH)).toBe(
      'Fictional agent',
    );
    expect(cleanAgentName('a b c​d', SHOWN_NAME_LENGTH)).toBe('a b c d');
  });

  it('cuts a long name to the limit, ellipsis included, counting characters not code units', () => {
    const cut = cleanAgentName('😀'.repeat(50), EMAIL_NAME_LENGTH);
    expect(Array.from(cut)).toHaveLength(EMAIL_NAME_LENGTH);
    expect(cut.endsWith('…')).toBe(true);
    expect(cleanAgentName('x'.repeat(40), EMAIL_NAME_LENGTH)).toBe('x'.repeat(40));
  });

  it('is empty when no name was given', () => {
    expect(cleanAgentName(null, SHOWN_NAME_LENGTH)).toBe('');
    expect(cleanAgentName(' \n ', SHOWN_NAME_LENGTH)).toBe('');
  });
});
