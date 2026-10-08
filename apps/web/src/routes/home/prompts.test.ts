import { describe, expect, it } from 'vitest';
import { prefillHref, staleUpdatePrompt, START_PROMPT } from './prompts';

describe('START_PROMPT', () => {
  it('carries no financial data', () => {
    expect(START_PROMPT).not.toMatch(/\d/);
    expect(START_PROMPT).not.toContain('$');
  });
});

describe('staleUpdatePrompt', () => {
  it('names the one stale holding', () => {
    expect(staleUpdatePrompt(['Riverside flat'])).toBe(
      'My “Riverside flat” in NetNet needs a fresh value. Help me update it — round numbers are fine.',
    );
  });

  it('names what is stale, never an amount', () => {
    const prompt = staleUpdatePrompt(['Riverside flat', 'Brokerage account', 'Spare account']);
    expect(prompt).toBe(
      'In NetNet, these need fresh values: “Riverside flat”, “Brokerage account” and “Spare account”. Help me update them — round numbers are fine.',
    );
    expect(prompt).not.toContain('$');
  });

  it('names the first five, then "and others"', () => {
    const prompt = staleUpdatePrompt(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(prompt).toContain('“A”, “B”, “C”, “D”, “E” and others');
    expect(prompt).not.toContain('“F”');
  });

  it('says something without names when there are none', () => {
    expect(staleUpdatePrompt([])).toContain('out of date');
  });
});

describe('prefillHref', () => {
  it('puts the URL-encoded prompt where {prompt} goes', () => {
    expect(prefillHref('https://claude.ai/new?q={prompt}', 'a & b')).toBe(
      'https://claude.ai/new?q=a%20%26%20b',
    );
  });
});
