/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { Button } from './Button';
import { Choice } from './Choice';
import { ErrorState, errorCopy } from './ErrorState';
import { Figure } from './Figure';
import { MoneyField } from './MoneyField';
import { PasswordField } from './PasswordField';
import { Sheet } from './Sheet';

const html = renderToStaticMarkup;

describe('Button', () => {
  it('is a plain button by default, never a submit by accident', () => {
    expect(html(<Button>Save</Button>)).toMatch(/^<button type="button"/);
  });

  it('marks an unavailable button aria-disabled and keeps it solid', () => {
    const markup = html(<Button aria-disabled>Save</Button>);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});

describe('Choice', () => {
  it('is a group of toggles named by its question, the chosen one pressed', () => {
    const markup = html(
      <Choice
        labelledBy="q"
        options={[
          { value: 'SG', label: 'Singapore' },
          { value: '*', label: 'Somewhere else' },
        ]}
        value="SG"
        onChange={() => undefined}
      />,
    );
    expect(markup).toMatch(/^<div role="group" aria-labelledby="q"/);
    expect(markup).toMatch(/<button type="button"[^>]*aria-pressed="true"[^>]*>Singapore</);
    expect(markup).toMatch(/<button type="button"[^>]*aria-pressed="false"[^>]*>Somewhere else</);
  });
});

describe('PasswordField', () => {
  it('hides the password, with Show beside it named for what it shows', () => {
    const markup = html(
      <PasswordField label="Password" autoComplete="new-password" value="" onChange={() => {}} />,
    );
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="new-password"');
    expect(markup).toMatch(/>Show<span class="visually-hidden"> password<\/span><\/button>/);
  });
});

describe('Figure', () => {
  it('shows money once, marked for the one-figure-one-place check', () => {
    const markup = html(<Figure minor={2_810_053} currency="SGD" locale="en-SG" />);
    expect(markup).toContain('data-figure=""');
    expect(markup).toContain('$28,100.53');
  });

  it('gives a change figure its sign as well as its colour, and none when nothing changed', () => {
    expect(html(<Figure size="change" minor={5_900_000} currency="SGD" locale="en-SG" />)).toMatch(
      /class="[^"]*gain[^"]*">\+\$59,000</,
    );
    expect(html(<Figure size="change" minor={-120_000} currency="SGD" locale="en-SG" />)).toMatch(
      /class="[^"]*loss[^"]*">−\$1,200</,
    );
    expect(html(<Figure size="change" minor={0} currency="SGD" locale="en-SG" />)).toBe('');
  });

  it('never shows cents on a total', () => {
    expect(
      html(<Figure size="display" minor={79_799_253} currency="SGD" locale="en-SG" total />),
    ).toContain('$797,993<');
  });
});

describe('MoneyField', () => {
  const field = (value: string, currency = 'SGD') =>
    html(
      <MoneyField
        label="Amount"
        currency={currency}
        locale="en-SG"
        value={value}
        onChange={() => undefined}
      />,
    );

  it('says what to change when the amount has more decimals than the currency', () => {
    const markup = field('1250.5', 'JPY');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('Use a whole number: JPY has no smaller unit.');
  });

  it('is quiet while the amount reads, and asks for the decimal keypad', () => {
    const markup = field('1,250.50');
    expect(markup).not.toContain('aria-invalid');
    expect(markup).toContain('inputMode="decimal"');
  });
});

describe('ErrorState', () => {
  it('speaks in plain words with a next step, never the code or the server’s message', () => {
    const error = new ApiError({ code: 'NETWORK', status: 0, message: 'GET /me failed.' });
    const markup = html(<ErrorState error={error} onRetry={() => undefined} />);
    expect(markup).toContain('NetNet can’t be reached.');
    expect(markup).toContain('Try again');
    expect(markup).not.toContain('NETWORK');
    expect(markup).not.toContain('GET /me');
  });

  it('offers Try again only where trying again can work', () => {
    expect(errorCopy(new ApiError({ code: 'NOT_FOUND', status: 404, message: 'x' })).retry).toBe(
      false,
    );
    expect(errorCopy(new Error('render bug')).retry).toBe(true);
  });
});

describe('Sheet', () => {
  it('is a dialog named by its title, with an unavailable action kept solid', () => {
    const markup = html(
      <Sheet
        open={false}
        onClose={() => undefined}
        title="Add a value"
        action={{ label: 'Save', onAction: () => undefined, unavailable: true }}
      >
        <p>Body</p>
      </Sheet>,
    );
    expect(markup).toMatch(/^<dialog[^>]*aria-labelledby="([^"]+)"/);
    expect(markup).toContain('>Add a value</h2>');
    expect(markup).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Save<\/button>/);
  });

  it('leaves its title programmatically focusable, for the initial focus on open', () => {
    const markup = html(
      <Sheet open={false} onClose={() => undefined} title="Filter Home">
        <p>Body</p>
      </Sheet>,
    );
    expect(markup).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Filter Home<\/h2>/);
  });
});

describe('the web app’s markup (design-system §6.1 rule 9)', () => {
  it('never uses the disabled attribute, which makes a control dead space on iOS', () => {
    const src = resolve(import.meta.dirname, '..');
    const offenders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .filter((file) => /<[^>]*\sdisabled(\s|=|\/?>)/.test(readFileSync(join(src, file), 'utf8')));
    expect(offenders).toStrictEqual([]);
  });
});
