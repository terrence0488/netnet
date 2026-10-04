import { describe, expect, it } from 'vitest';
import { privacyProblems } from './privacy';

const email = (text: string) => ({ subject: 'NetNet', html: `<p>${text}</p>`, text, headers: {} });

describe('privacyProblems()', () => {
  it.each([
    'You have $1,234 to spend.',
    'Your total is S$ 52,000.',
    'Up RM500 this month.',
    'It is worth 1.2m now.',
    '1 234,50 € in cash.',
    '2,000 USD moved.',
    'EUR 15 left.',
    'About 300 dollars.',
    'Net worth: ₹ 9,00,000',
  ])('finds a figure with a currency: %s', (text) => {
    expect(privacyProblems(email(text), [])).not.toEqual([]);
  });

  it.each([
    'Your net worth is due for an update.',
    'The link lasts a day.',
    'Sign in within 30 days.',
    'We send this at most 3 times.',
    'Usually 08:00 to 21:00.',
    'Ask about all 3 of them, or the top 10.',
  ])('passes plain words and figures that are not money: %s', (text) => {
    expect(privacyProblems(email(text), [])).toEqual([]);
  });

  it('ignores tokens in links and figures in styles, but not words a reader sees', () => {
    const rendered = {
      subject: 'Verify',
      html: '<a style="padding:12px 20px" href="https://x.example/?t=USD5abc">Open</a>',
      text: 'Open: https://x.example/?t=EUR10',
      headers: { 'X-Ref': 'id' },
    };
    expect(privacyProblems(rendered, [])).toEqual([]);
    expect(privacyProblems({ ...rendered, html: '<p>USD 5</p>' }, [])).toEqual([
      'html: a figure with a currency, "USD 5"',
    ]);
  });

  it('finds the person’s own words anywhere, in any case', () => {
    expect(
      privacyProblems(
        { subject: 'Your Everyday Account', html: '', text: '', headers: { To: 'a@example.com' } },
        ['everyday account', 'A@example.com', ''],
      ),
    ).toEqual(['subject: contains "everyday account"', 'headers: contains "A@example.com"']);
  });
});
