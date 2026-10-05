import type { Pack, Universal, VersionedPack } from '@netnet/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccessBlock, ConsequenceLine } from './AccessBlock';

const CHAIN: readonly VersionedPack[] = [
  {
    id: 'generic',
    version: 1,
    locale: null,
    currency: null,
    labels: {},
    examples: {},
    meaning: {},
    cadenceDays: {},
    defaults: {
      cash: { access: 'accessible', reason: 'it’s money in the bank' },
    },
    questions: {
      property: {
        ask: 'Do you live in it?',
        answers: [
          { id: 'yes', label: 'Yes, it’s my home', access: 'locked', reason: 'it’s your home' },
          { id: 'no', label: 'No', access: 'illiquid', reason: 'you’d have to sell it first' },
        ],
      },
      other: {
        ask: 'Could you use it within a month?',
        answers: [
          { id: 'now', label: 'Yes', access: 'accessible', reason: 'you said you could' },
          { id: 'tied', label: 'No', access: 'locked', reason: 'you said it’s tied up' },
        ],
      },
    },
    types: [],
    checklist: [],
  } satisfies Pack & { version: number },
];

const noop = () => {};

function block(universal: Universal, answer: string | undefined, changing = false) {
  return renderToStaticMarkup(
    <AccessBlock
      chain={CHAIN}
      universal={universal}
      answer={answer}
      onAnswer={noop}
      changing={changing}
      onChanging={noop}
      usable={{ minor: 500_000, currency: 'SGD' }}
      onAskAgent={noop}
    />,
  );
}

describe('AccessBlock', () => {
  it('states a default with its reason and a way to change it, asking nothing', () => {
    const html = block('cash', undefined);
    expect(html).toContain('Counts toward');
    expect(html).toContain('it’s money in the bank');
    expect(html).toContain('Change');
    expect(html).not.toContain('Could you use it within a month?');
  });

  it('asks the fact question, never the category, when the type is ambiguous', () => {
    const html = block('property', undefined);
    expect(html).toContain('Do you live in it?');
    expect(html).toContain('Not sure');
    expect(html).not.toContain('accessible');
    expect(html).not.toContain('illiquid');
    expect(html).not.toContain('locked');
  });

  it('records “Not sure” as undecided without blocking, and says saving is fine', () => {
    const html = block('property', 'not_sure');
    expect(html).toContain('Counts toward your net worth.');
    expect(html).toContain('until you decide');
    expect(html).toContain('Saving is fine as it is.');
  });

  it('answers with the consequence in money, and offers the agent beside the question', () => {
    const html = block('property', 'yes');
    expect(html).toContain('it’s your home');
    expect(html).toContain('Ask your agent');
  });

  it('opens the question to change a default, with a way back to the usual', () => {
    const html = block('cash', undefined, true);
    expect(html).toContain('Could you use it within a month?');
    expect(html).toContain('Keep the usual');
  });
});

describe('ConsequenceLine', () => {
  it('leaves the amount out where it would repeat a figure on screen', () => {
    const html = renderToStaticMarkup(
      <ConsequenceLine access="accessible" reason="it’s money in the bank" usable={null} />,
    );
    expect(html).toContain('Counts toward what you could use this month');
    expect(html).not.toContain('data-figure');
  });

  it('states the amount where it moves as you type', () => {
    const html = renderToStaticMarkup(
      <ConsequenceLine
        access="accessible"
        reason="it’s money in the bank"
        usable={{ minor: 500_000, currency: 'SGD' }}
      />,
    );
    expect(html).toContain('the ');
    expect(html).toContain('data-figure');
  });
});
