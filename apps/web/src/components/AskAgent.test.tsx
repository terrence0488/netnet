import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { newHoldingPrompt, PromptCard, savedHoldingPrompt } from './AskAgent';

describe('the ask-your-agent prompts', () => {
  it('names the holding so the agent can find it, with no financial data', () => {
    const text = savedHoldingPrompt('Everyday savings');
    expect(text).toContain('“Everyday savings”');
    expect(text).not.toMatch(/[\d$€£¥]/);
  });

  it('asks about what is being added, named when it has a name', () => {
    expect(newHoldingPrompt('Flat')).toContain('“Flat”');
    expect(newHoldingPrompt(null)).toContain('a holding');
    expect(newHoldingPrompt('')).toContain('a holding');
  });
});

describe('PromptCard', () => {
  it('is the message with Copy inside it', () => {
    const html = renderToStaticMarkup(<PromptCard text="Help me." />);
    expect(html).toContain('Help me.');
    expect(html).toContain('Copy');
  });
});

describe('PromptCard without its own Copy', () => {
  it('is the message alone, for a screen whose primary action is Copy', () => {
    const html = renderToStaticMarkup(<PromptCard text="Help me." copyInside={false} />);
    expect(html).toContain('Help me.');
    expect(html).not.toContain('Copy');
  });
});
