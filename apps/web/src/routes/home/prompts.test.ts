import { describe, expect, it } from 'vitest';
import { prefillHref, REFRESH_PROMPT, START_PROMPT } from './prompts';

describe('START_PROMPT', () => {
  it('carries no financial data', () => {
    expect(START_PROMPT).not.toMatch(/\d/);
    expect(START_PROMPT).not.toContain('$');
  });
});

describe('REFRESH_PROMPT', () => {
  it('carries no data: the agent finds what is stale itself', () => {
    expect(REFRESH_PROMPT).toContain('out of date');
    expect(REFRESH_PROMPT).not.toMatch(/\d/);
    expect(REFRESH_PROMPT).not.toContain('$');
    expect(REFRESH_PROMPT).not.toContain('“');
  });
});

describe('prefillHref', () => {
  it('puts the URL-encoded prompt where {prompt} goes', () => {
    expect(prefillHref('https://claude.ai/new?q={prompt}', 'a & b')).toBe(
      'https://claude.ai/new?q=a%20%26%20b',
    );
  });
});
